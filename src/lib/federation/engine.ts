/**
 * Query Federation Engine
 * Routes queries to appropriate sources and merges results
 */

import type {
	FederatedQuery,
	FederatedResult,
	UnifiedEntity,
	EntityType,
	SourceMetadata,
	SourceError
} from '$lib/types';
import type { SourceClient, SourceQuery, SourceResult } from '$lib/sources/types';
import { DATA_SOURCES, getSourceClient, getSourcesForEntityType } from '$lib/sources';
import { RateLimiter, getRateLimiter, withRetry } from './rate-limiter';
import { EntityResolver, getEntityResolver } from './entity-resolver';

// ============================================================================
// Federation Engine
// ============================================================================

export class QueryFederationEngine {
	private rateLimiter: RateLimiter;
	private entityResolver: EntityResolver;
	private sourceClients: Map<string, SourceClient>;

	constructor() {
		this.rateLimiter = getRateLimiter();
		this.entityResolver = getEntityResolver();
		this.sourceClients = new Map();

		// Initialize rate limiter with source configs
		for (const source of DATA_SOURCES) {
			this.rateLimiter.registerSource(source.id, source.rateLimit);
		}
	}

	// ============================================================================
	// Main Search
	// ============================================================================

	async search(query: FederatedQuery): Promise<FederatedResult> {
		const startTime = performance.now();

		// Determine which sources to query
		const sources = this.determineSources(query);

		if (sources.length === 0) {
			return this.emptyResult();
		}

		// Decompose query for each source
		const sourceQueries = sources.map((sourceId) => ({
			sourceId,
			query: this.transformForSource(query, sourceId)
		}));

		// Execute queries in parallel
		const results = await Promise.allSettled(
			sourceQueries.map(({ sourceId, query: sq }) => this.executeSourceQuery(sourceId, sq))
		);

		// Process results
		const { items, metadata, errors } = this.processResults(results, sources);

		// Deduplicate entities
		const deduplicatedItems = this.entityResolver.deduplicate(items);

		// Sort by relevance (sources with more complete data first)
		deduplicatedItems.sort((a, b) => {
			const scoreA = this.computeRelevanceScore(a, query);
			const scoreB = this.computeRelevanceScore(b, query);
			return scoreB - scoreA;
		});

		// Apply pagination
		const paginatedItems = deduplicatedItems.slice(0, query.pagination.limit);

		return {
			items: paginatedItems,
			totalCount: deduplicatedItems.length,
			sources: metadata,
			hasMore: deduplicatedItems.length > query.pagination.limit,
			nextCursor: deduplicatedItems.length > query.pagination.limit ? 'next' : undefined,
			partial: errors.length > 0,
			errors
		};
	}

	// ============================================================================
	// Source Determination
	// ============================================================================

	private determineSources(query: FederatedQuery): string[] {
		// If specific sources are requested, use those
		if (query.sources.length > 0) {
			return query.sources.filter((sourceId) => {
				if (this.getClient(sourceId) === null) return false;

				const source = DATA_SOURCES.find((s) => s.id === sourceId);
				if (!source) return false;

				// Keep only sources that support at least one selected entity type.
				return query.entityTypes.some((entityType) => source.entityTypes.includes(entityType));
			});
		}

		// Otherwise, find sources that support the requested entity types
		const sources = new Set<string>();

		for (const entityType of query.entityTypes) {
			const supportingSources = getSourcesForEntityType(entityType);
			for (const source of supportingSources) {
				sources.add(source.id);
			}
		}

		return Array.from(sources);
	}

	// ============================================================================
	// Query Transformation
	// ============================================================================

	private transformForSource(query: FederatedQuery, sourceId: string): SourceQuery {
		// Transform unified query to source-specific format
		const source = DATA_SOURCES.find((s) => s.id === sourceId);
		if (!source) {
			throw new Error(`Unknown source: ${sourceId}`);
		}

		// Filter only entity types supported by this source
		const entityTypes = query.entityTypes.filter((et) =>
			source.entityTypes.includes(et)
		);

		// Filter only filters supported by this source
		const filters = query.filters.filter((f) => source.supports.filters.includes(f.field));

		return {
			text: query.text,
			filters,
			entityTypes: entityTypes.length > 0 ? entityTypes : [source.entityTypes[0] as EntityType],
			pagination: query.pagination
		};
	}

	// ============================================================================
	// Query Execution
	// ============================================================================

	private async executeSourceQuery(sourceId: string, query: SourceQuery): Promise<SourceResult> {
		const client = this.getClient(sourceId);
		if (!client) {
			throw new Error(`No client available for source: ${sourceId}`);
		}

		return this.rateLimiter.execute(sourceId, () =>
			withRetry(() => client.search(query), {
				maxRetries: 2,
				backoffMs: 500
			})
		);
	}

	// ============================================================================
	// Result Processing
	// ============================================================================

	private processResults(
		results: PromiseSettledResult<SourceResult>[],
		sourceIds: string[]
	): {
		items: UnifiedEntity[];
		metadata: SourceMetadata[];
		errors: SourceError[];
	} {
		const items: UnifiedEntity[] = [];
		const metadata: SourceMetadata[] = [];
		const errors: SourceError[] = [];

		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			const sourceId = sourceIds[i];

			if (result.status === 'fulfilled') {
				items.push(...result.value.items);
				metadata.push({
					sourceId,
					count: result.value.items.length,
					queryTime: result.value.queryTime
				});
			} else {
				errors.push({
					source: sourceId,
					error: result.reason?.message || 'Unknown error'
				});
			}
		}

		return { items, metadata, errors };
	}

	// ============================================================================
	// Relevance Scoring
	// ============================================================================

	private computeRelevanceScore(entity: UnifiedEntity, query: FederatedQuery): number {
		let score = 0;

		// More identifiers = more reliable
		score += Object.values(entity.identifiers).filter(Boolean).length * 10;

		// Has DOI is valuable
		if (entity.identifiers.doi) score += 20;

		// Title match
		if (query.text) {
			const titleLower = entity.title.toLowerCase();
			const queryLower = query.text.toLowerCase();
			if (titleLower.includes(queryLower)) score += 30;
		}

		// Has description
		if (entity.description) score += 10;

		// Has creators
		if (entity.creators && entity.creators.length > 0) score += 5;

		// Has license
		if (entity.license) score += 5;

		// Multiple sources = more reliable
		score += entity.sources.length * 5;

		return score;
	}

	// ============================================================================
	// Client Management
	// ============================================================================

	private getClient(sourceId: string): SourceClient | null {
		if (!this.sourceClients.has(sourceId)) {
			const client = getSourceClient(sourceId);
			if (client) {
				this.sourceClients.set(sourceId, client);
			}
		}
		return this.sourceClients.get(sourceId) || null;
	}

	// ============================================================================
	// Utilities
	// ============================================================================

	private emptyResult(): FederatedResult {
		return {
			items: [],
			totalCount: 0,
			sources: [],
			hasMore: false,
			partial: false,
			errors: []
		};
	}

	// ============================================================================
	// Specialized Queries
	// ============================================================================

	async searchDatasets(options: {
		text?: string;
		topic?: string;
		license?: string;
		sources?: string[];
		limit?: number;
	}): Promise<FederatedResult> {
		const filters = [];

		if (options.topic) {
			filters.push({ field: 'topic', operator: 'eq' as const, value: options.topic });
		}
		if (options.license) {
			filters.push({ field: 'license', operator: 'eq' as const, value: options.license });
		}

		return this.search({
			text: options.text || '',
			filters,
			sources: options.sources || [],
			entityTypes: ['dataset'],
			pagination: { limit: options.limit || 25 }
		});
	}

	async searchPublications(options: {
		text?: string;
		fromYear?: number;
		toYear?: number;
		openAccess?: boolean;
		sources?: string[];
		limit?: number;
	}): Promise<FederatedResult> {
		const filters = [];

		if (options.fromYear) {
			filters.push({ field: 'year', operator: 'gte' as const, value: options.fromYear });
		}
		if (options.toYear) {
			filters.push({ field: 'year', operator: 'lte' as const, value: options.toYear });
		}
		if (options.openAccess) {
			filters.push({ field: 'openAccess', operator: 'eq' as const, value: 'true' });
		}

		return this.search({
			text: options.text || '',
			filters,
			sources: options.sources || [],
			entityTypes: ['publication'],
			pagination: { limit: options.limit || 25 }
		});
	}

	async getEntity(id: string): Promise<UnifiedEntity | null> {
		// Parse entity ID to determine source
		const [sourceId, entityId] = id.split(':');

		if (!sourceId || !entityId) {
			return null;
		}

		const client = this.getClient(sourceId);
		if (!client) {
			return null;
		}

		return client.getEntity(entityId);
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: QueryFederationEngine | null = null;

export function getFederationEngine(): QueryFederationEngine {
	if (!instance) {
		instance = new QueryFederationEngine();
	}
	return instance;
}
