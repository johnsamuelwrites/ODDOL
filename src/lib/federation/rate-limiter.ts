/**
 * Rate Limiter for API Requests
 * Ensures compliance with source API rate limits
 */

import type { RateLimitConfig } from '$lib/types';

// ============================================================================
// Request Queue
// ============================================================================

interface QueuedRequest<T> {
	execute: () => Promise<T>;
	resolve: (value: T) => void;
	reject: (error: Error) => void;
}

class RequestQueue {
	private queue: QueuedRequest<unknown>[] = [];
	private timestamps: number[] = [];
	private processing = false;

	constructor(private config: RateLimitConfig) {}

	async add<T>(fn: () => Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			this.queue.push({
				execute: fn,
				resolve: resolve as (value: unknown) => void,
				reject
			});
			this.process();
		});
	}

	private async process(): Promise<void> {
		if (this.processing || this.queue.length === 0) {
			return;
		}

		this.processing = true;

		while (this.queue.length > 0) {
			await this.waitForSlot();

			const request = this.queue.shift();
			if (!request) break;

			try {
				const result = await request.execute();
				request.resolve(result);
			} catch (error) {
				request.reject(error instanceof Error ? error : new Error(String(error)));
			}
		}

		this.processing = false;
	}

	private async waitForSlot(): Promise<void> {
		const now = Date.now();

		// Remove timestamps outside the window
		this.timestamps = this.timestamps.filter((t) => now - t < this.config.window);

		// Wait if we've hit the rate limit
		if (this.timestamps.length >= this.config.requests) {
			const oldestTimestamp = this.timestamps[0];
			const waitTime = oldestTimestamp + this.config.window - now;

			if (waitTime > 0) {
				await new Promise((resolve) => setTimeout(resolve, waitTime));
			}
		}

		// Record this request
		this.timestamps.push(Date.now());
	}

	clear(): void {
		this.queue = [];
		this.timestamps = [];
	}
}

// ============================================================================
// Rate Limiter
// ============================================================================

export class RateLimiter {
	private queues: Map<string, RequestQueue> = new Map();
	private configs: Map<string, RateLimitConfig> = new Map();

	registerSource(sourceId: string, config: RateLimitConfig): void {
		this.configs.set(sourceId, config);
	}

	async execute<T>(sourceId: string, fn: () => Promise<T>): Promise<T> {
		const queue = this.getOrCreateQueue(sourceId);
		return queue.add(fn);
	}

	private getOrCreateQueue(sourceId: string): RequestQueue {
		if (!this.queues.has(sourceId)) {
			const config = this.configs.get(sourceId) || { requests: 10, window: 1000 };
			this.queues.set(sourceId, new RequestQueue(config));
		}
		return this.queues.get(sourceId)!;
	}

	clearQueue(sourceId: string): void {
		this.queues.get(sourceId)?.clear();
	}

	clearAllQueues(): void {
		for (const queue of this.queues.values()) {
			queue.clear();
		}
	}
}

// ============================================================================
// Retry Logic
// ============================================================================

export interface RetryConfig {
	maxRetries: number;
	backoffMs: number;
	backoffMultiplier: number;
	retryableStatuses: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
	maxRetries: 3,
	backoffMs: 1000,
	backoffMultiplier: 2,
	retryableStatuses: [429, 500, 502, 503, 504]
};

export async function withRetry<T>(
	fn: () => Promise<T>,
	config: Partial<RetryConfig> = {}
): Promise<T> {
	const opts = { ...DEFAULT_RETRY_CONFIG, ...config };
	let lastError: Error;

	for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Check if error is retryable
			const isRetryable = isRetryableError(lastError, opts.retryableStatuses);

			if (!isRetryable || attempt === opts.maxRetries) {
				throw lastError;
			}

			// Wait before retrying
			const delay = opts.backoffMs * Math.pow(opts.backoffMultiplier, attempt);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw lastError!;
}

function isRetryableError(error: Error, retryableStatuses: number[]): boolean {
	// Check for HTTP status codes in error message or properties
	const statusMatch = error.message.match(/status[:\s]*(\d{3})/i);
	if (statusMatch) {
		const status = parseInt(statusMatch[1]);
		return retryableStatuses.includes(status);
	}

	// Check for network errors
	if (
		error.name === 'TypeError' &&
		(error.message.includes('fetch') || error.message.includes('network'))
	) {
		return true;
	}

	return false;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
	if (!instance) {
		instance = new RateLimiter();
	}
	return instance;
}
