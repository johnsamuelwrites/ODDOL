/**
 * Query Cache with IndexedDB
 * Short-term caching for query results (15-minute TTL)
 */

import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { CacheEntry, CacheConfig } from '$lib/types';

// ============================================================================
// Database Schema
// ============================================================================

interface OddolDB extends DBSchema {
	queries: {
		key: string;
		value: CacheEntry<unknown>;
		indexes: { 'by-timestamp': number };
	};
	preferences: {
		key: string;
		value: unknown;
	};
}

// ============================================================================
// Cache Configuration
// ============================================================================

const DEFAULT_CONFIG: CacheConfig = {
	maxEntries: 100,
	defaultTTL: 15 * 60 * 1000, // 15 minutes
	maxSizeMB: 50
};

// ============================================================================
// Query Cache
// ============================================================================

export class QueryCache {
	private db: IDBPDatabase<OddolDB> | null = null;
	private memoryCache: Map<string, CacheEntry<unknown>> = new Map();
	private config: CacheConfig;
	private initPromise: Promise<void> | null = null;

	constructor(config: Partial<CacheConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	// ============================================================================
	// Initialization
	// ============================================================================

	async initialize(): Promise<void> {
		if (this.db) return;

		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = this.doInitialize();
		return this.initPromise;
	}

	private async doInitialize(): Promise<void> {
		try {
			this.db = await openDB<OddolDB>('oddol-cache', 1, {
				upgrade(db) {
					// Query results store
					if (!db.objectStoreNames.contains('queries')) {
						const queryStore = db.createObjectStore('queries', { keyPath: 'queryHash' });
						queryStore.createIndex('by-timestamp', 'timestamp');
					}

					// User preferences store
					if (!db.objectStoreNames.contains('preferences')) {
						db.createObjectStore('preferences');
					}
				}
			});

			// Clean up expired entries on startup
			await this.cleanup();
		} catch (error) {
			console.warn('IndexedDB not available, using memory cache only:', error);
			this.db = null;
		}
	}

	// ============================================================================
	// Cache Operations
	// ============================================================================

	async get<T>(queryHash: string): Promise<T | null> {
		await this.initialize();

		// Check memory cache first (fastest)
		const memEntry = this.memoryCache.get(queryHash) as CacheEntry<T> | undefined;
		if (memEntry && !this.isExpired(memEntry)) {
			return memEntry.data;
		}

		// Check IndexedDB
		if (this.db) {
			try {
				const dbEntry = await this.db.get('queries', queryHash);
				if (dbEntry && !this.isExpired(dbEntry)) {
					// Promote to memory cache
					this.setMemory(queryHash, dbEntry);
					return dbEntry.data as T;
				}
			} catch (error) {
				console.warn('Cache read error:', error);
			}
		}

		return null;
	}

	async set<T>(queryHash: string, data: T, ttl: number = this.config.defaultTTL): Promise<void> {
		await this.initialize();

		const entry: CacheEntry<T> = {
			data,
			timestamp: Date.now(),
			ttl,
			queryHash
		};

		// Always set in memory
		this.setMemory(queryHash, entry);

		// Persist to IndexedDB
		if (this.db) {
			try {
				await this.db.put('queries', entry as CacheEntry<unknown>);
			} catch (error) {
				console.warn('Cache write error:', error);
			}
		}
	}

	async has(queryHash: string): Promise<boolean> {
		const value = await this.get(queryHash);
		return value !== null;
	}

	async delete(queryHash: string): Promise<void> {
		await this.initialize();

		this.memoryCache.delete(queryHash);

		if (this.db) {
			try {
				await this.db.delete('queries', queryHash);
			} catch (error) {
				console.warn('Cache delete error:', error);
			}
		}
	}

	// ============================================================================
	// Memory Cache Management
	// ============================================================================

	private setMemory(key: string, entry: CacheEntry<unknown>): void {
		// Evict oldest entries if at capacity
		while (this.memoryCache.size >= this.config.maxEntries) {
			const oldest = this.findOldestEntry();
			if (oldest) {
				this.memoryCache.delete(oldest);
			} else {
				break;
			}
		}

		this.memoryCache.set(key, entry);
	}

	private findOldestEntry(): string | null {
		let oldest: { key: string; timestamp: number } | null = null;

		for (const [key, entry] of this.memoryCache) {
			if (!oldest || entry.timestamp < oldest.timestamp) {
				oldest = { key, timestamp: entry.timestamp };
			}
		}

		return oldest?.key || null;
	}

	// ============================================================================
	// Expiration
	// ============================================================================

	private isExpired(entry: CacheEntry<unknown>): boolean {
		return Date.now() - entry.timestamp > entry.ttl;
	}

	async cleanup(): Promise<void> {
		// Clean memory cache
		for (const [key, entry] of this.memoryCache) {
			if (this.isExpired(entry)) {
				this.memoryCache.delete(key);
			}
		}

		// Clean IndexedDB
		if (this.db) {
			try {
				const tx = this.db.transaction('queries', 'readwrite');
				const index = tx.store.index('by-timestamp');
				const now = Date.now();

				let cursor = await index.openCursor();
				while (cursor) {
					if (this.isExpired(cursor.value)) {
						await cursor.delete();
					}
					cursor = await cursor.continue();
				}

				await tx.done;
			} catch (error) {
				console.warn('Cache cleanup error:', error);
			}
		}
	}

	// ============================================================================
	// Clear
	// ============================================================================

	async clear(): Promise<void> {
		await this.initialize();

		this.memoryCache.clear();

		if (this.db) {
			try {
				await this.db.clear('queries');
			} catch (error) {
				console.warn('Cache clear error:', error);
			}
		}
	}

	// ============================================================================
	// Statistics
	// ============================================================================

	async getStats(): Promise<{
		memoryEntries: number;
		dbEntries: number;
	}> {
		await this.initialize();

		let dbEntries = 0;
		if (this.db) {
			try {
				dbEntries = await this.db.count('queries');
			} catch {
				dbEntries = 0;
			}
		}

		return {
			memoryEntries: this.memoryCache.size,
			dbEntries
		};
	}

	// ============================================================================
	// Preferences (Persistent, No TTL)
	// ============================================================================

	async getPreference<T>(key: string): Promise<T | null> {
		await this.initialize();

		if (this.db) {
			try {
				const value = await this.db.get('preferences', key);
				return value as T | null;
			} catch {
				return null;
			}
		}

		return null;
	}

	async setPreference<T>(key: string, value: T): Promise<void> {
		await this.initialize();

		if (this.db) {
			try {
				await this.db.put('preferences', value, key);
			} catch (error) {
				console.warn('Preference save error:', error);
			}
		}
	}
}

// ============================================================================
// Query Hash Generation
// ============================================================================

export async function generateQueryHash(query: unknown): Promise<string> {
	const normalized = JSON.stringify(query, Object.keys(query as object).sort());
	const encoder = new TextEncoder();
	const data = encoder.encode(normalized);

	// Use SubtleCrypto if available
	if (typeof crypto !== 'undefined' && crypto.subtle) {
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	}

	// Fallback to simple hash
	return simpleHash(normalized);
}

function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return Math.abs(hash).toString(16);
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: QueryCache | null = null;

export function getQueryCache(): QueryCache {
	if (!instance) {
		instance = new QueryCache();
	}
	return instance;
}
