/**
 * OpenAlex REST Client
 * Real-time queries to OpenAlex API for scholarly metadata
 */

import type { DataSource, EntityType, UnifiedEntity } from '$lib/types';
import type { SourceClient, SourceQuery, SourceResult } from './types';
import { DATA_SOURCES } from './types';
import { browser } from '$app/environment';

// ============================================================================
// OpenAlex Types
// ============================================================================

interface OpenAlexWork {
	id: string;
	doi?: string;
	title: string;
	display_name: string;
	publication_date?: string;
	type: string;
	open_access?: {
		is_oa: boolean;
		oa_url?: string;
	};
	authorships?: Array<{
		author: {
			id: string;
			display_name: string;
			orcid?: string;
		};
		institutions?: Array<{
			id: string;
			display_name: string;
			ror?: string;
		}>;
	}>;
	primary_location?: {
		source?: {
			id: string;
			display_name: string;
		};
	};
	cited_by_count: number;
	concepts?: Array<{
		id: string;
		display_name: string;
		level: number;
		score: number;
	}>;
	abstract_inverted_index?: Record<string, number[]>;
}

interface OpenAlexResponse<T> {
	meta: {
		count: number;
		per_page: number;
		page?: number;
		next_cursor?: string;
	};
	results: T[];
}

// ============================================================================
// OpenAlex Client Implementation
// ============================================================================

export class OpenAlexClient implements SourceClient {
	readonly sourceId = 'openalex';
	readonly config: DataSource;
	private readonly baseUrl: string;
	private readonly userAgent = 'ODDOL/2.0 (mailto:contact@oddol.org)';
	private readonly mailto = 'contact@oddol.org';

	constructor() {
		this.config = DATA_SOURCES.find((s) => s.id === 'openalex')!;
		this.baseUrl = this.config.baseUrl;
	}

	async search(query: SourceQuery): Promise<SourceResult> {
		const startTime = performance.now();

		const params = this.buildSearchParams(query);
		const response = await this.fetchApi<OpenAlexResponse<OpenAlexWork>>('/works', params);

		const items = response.results.map((work) => this.workToEntity(work));

		return {
			items,
			totalCount: response.meta.count,
			nextCursor: response.meta.next_cursor,
			hasMore: !!response.meta.next_cursor,
			queryTime: performance.now() - startTime
		};
	}

	async getEntity(id: string): Promise<UnifiedEntity | null> {
		try {
			// Handle both OpenAlex IDs and DOIs
			const endpoint = id.startsWith('W') ? `/works/${id}` : `/works/doi:${id}`;
			const work = await this.fetchApi<OpenAlexWork>(endpoint);
			return this.workToEntity(work);
		} catch {
			return null;
		}
	}

	async isAvailable(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/works?per_page=1`, {
				headers: this.getHeaders()
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	// ============================================================================
	// API Fetching
	// ============================================================================

	private async fetchApi<T>(endpoint: string, params?: URLSearchParams): Promise<T> {
		const requestParams = params ? new URLSearchParams(params) : new URLSearchParams();
		requestParams.set('mailto', this.mailto);
		const url = `${this.baseUrl}${endpoint}?${requestParams.toString()}`;

		const response = await fetch(url, {
			headers: this.getHeaders()
		});

		if (!response.ok) {
			throw new OpenAlexError(`API request failed: ${response.statusText}`, response.status);
		}

		return response.json();
	}

	private getHeaders(): HeadersInit {
		// Browser requests cannot set User-Agent and may fail CORS preflight.
		return browser ? { Accept: 'application/json' } : { Accept: 'application/json', 'User-Agent': this.userAgent };
	}

	// ============================================================================
	// Query Building
	// ============================================================================

	private buildSearchParams(query: SourceQuery): URLSearchParams {
		const params = new URLSearchParams();

		// Search text
		if (query.text) {
			params.set('search', query.text);
		}

		// Pagination
		params.set('per_page', String(query.pagination.limit));
		if (query.pagination.cursor) {
			params.set('cursor', query.pagination.cursor);
		}

		// Build filters
		const filterParts: string[] = [];

		for (const filter of query.filters) {
			switch (filter.field) {
				case 'year':
					if (filter.operator === 'gte') {
						filterParts.push(`from_publication_date:${filter.value}-01-01`);
					} else if (filter.operator === 'lte') {
						filterParts.push(`to_publication_date:${filter.value}-12-31`);
					}
					break;
				case 'type':
					filterParts.push(`type:${filter.value}`);
					break;
				case 'openAccess':
					filterParts.push('is_oa:true');
					break;
				case 'hasDoi':
					filterParts.push('has_doi:true');
					break;
				case 'concept':
					filterParts.push(`concepts.id:${filter.value}`);
					break;
				case 'institution':
					filterParts.push(`institutions.id:${filter.value}`);
					break;
				case 'author':
					filterParts.push(`author.id:${filter.value}`);
					break;
			}
		}

		if (filterParts.length > 0) {
			params.set('filter', filterParts.join(','));
		}

		// Default sorting by relevance for searches, by date otherwise
		if (query.text) {
			params.set('sort', 'relevance_score:desc');
		} else {
			params.set('sort', 'publication_date:desc');
		}

		return params;
	}

	// ============================================================================
	// Entity Conversion
	// ============================================================================

	private workToEntity(work: OpenAlexWork): UnifiedEntity {
		const openalexId = work.id.replace('https://openalex.org/', '');
		const doi = work.doi?.replace('https://doi.org/', '');

		return {
			id: `openalex:${openalexId}`,
			identifiers: {
				openalex: openalexId,
				doi
			},
			type: 'publication',
			title: work.display_name || work.title,
			description: this.reconstructAbstract(work.abstract_inverted_index),
			creators: work.authorships?.map((a) => ({
				name: a.author.display_name,
				orcid: a.author.orcid?.replace('https://orcid.org/', ''),
				affiliation: a.institutions?.[0]?.display_name
			})),
			publisher: work.primary_location?.source
				? {
						name: work.primary_location.source.display_name
					}
				: undefined,
			url: work.open_access?.oa_url || (doi ? `https://doi.org/${doi}` : undefined),
			created: work.publication_date,
			metadata: {
				type: work.type,
				citedByCount: work.cited_by_count,
				isOpenAccess: work.open_access?.is_oa,
				concepts: work.concepts
					?.filter((c) => c.level <= 1)
					.map((c) => ({
						id: c.id,
						name: c.display_name,
						score: c.score
					}))
			},
			sources: [
				{
					sourceId: 'openalex',
					sourceUrl: work.id,
					retrievedAt: new Date().toISOString()
				}
			]
		};
	}

	private reconstructAbstract(invertedIndex?: Record<string, number[]>): string | undefined {
		if (!invertedIndex) return undefined;

		const words: [string, number][] = [];
		for (const [word, positions] of Object.entries(invertedIndex)) {
			for (const pos of positions) {
				words.push([word, pos]);
			}
		}

		words.sort((a, b) => a[1] - b[1]);
		const abstract = words.map((w) => w[0]).join(' ');

		// Limit abstract length
		return abstract.length > 500 ? abstract.slice(0, 500) + '...' : abstract;
	}

	// ============================================================================
	// Specialized Queries
	// ============================================================================

	async searchWorks(options: {
		text?: string;
		fromYear?: number;
		toYear?: number;
		type?: string;
		openAccess?: boolean;
		limit?: number;
		cursor?: string;
	}): Promise<SourceResult> {
		const filters = [];

		if (options.fromYear) {
			filters.push({ field: 'year', operator: 'gte' as const, value: options.fromYear });
		}
		if (options.toYear) {
			filters.push({ field: 'year', operator: 'lte' as const, value: options.toYear });
		}
		if (options.type) {
			filters.push({ field: 'type', operator: 'eq' as const, value: options.type });
		}
		if (options.openAccess) {
			filters.push({ field: 'openAccess', operator: 'eq' as const, value: 'true' });
		}

		return this.search({
			text: options.text || '',
			filters,
			entityTypes: ['publication'],
			pagination: {
				limit: options.limit || 25,
				cursor: options.cursor
			}
		});
	}

	async getCitations(doi: string, limit: number = 50): Promise<UnifiedEntity[]> {
		const params = new URLSearchParams({
			filter: `cites:${doi}`,
			per_page: String(limit),
			sort: 'publication_date:desc'
		});

		const response = await this.fetchApi<OpenAlexResponse<OpenAlexWork>>('/works', params);
		return response.results.map((work) => this.workToEntity(work));
	}

	async getReferences(doi: string, limit: number = 50): Promise<UnifiedEntity[]> {
		const params = new URLSearchParams({
			filter: `cited_by:${doi}`,
			per_page: String(limit),
			sort: 'publication_date:desc'
		});

		const response = await this.fetchApi<OpenAlexResponse<OpenAlexWork>>('/works', params);
		return response.results.map((work) => this.workToEntity(work));
	}

	async getAuthorWorks(authorId: string, limit: number = 50): Promise<UnifiedEntity[]> {
		const params = new URLSearchParams({
			filter: `author.id:${authorId}`,
			per_page: String(limit),
			sort: 'publication_date:desc'
		});

		const response = await this.fetchApi<OpenAlexResponse<OpenAlexWork>>('/works', params);
		return response.results.map((work) => this.workToEntity(work));
	}

	async *streamWorks(
		query: SourceQuery
	): AsyncGenerator<UnifiedEntity, void, undefined> {
		let cursor: string | undefined = '*';

		while (cursor) {
			const result = await this.search({
				...query,
				pagination: { ...query.pagination, cursor }
			});

			for (const item of result.items) {
				yield item;
			}

			cursor = result.nextCursor;
		}
	}
}

// ============================================================================
// Error Class
// ============================================================================

export class OpenAlexError extends Error {
	constructor(
		message: string,
		public readonly statusCode?: number
	) {
		super(message);
		this.name = 'OpenAlexError';
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: OpenAlexClient | null = null;

export function getOpenAlexClient(): OpenAlexClient {
	if (!instance) {
		instance = new OpenAlexClient();
	}
	return instance;
}
