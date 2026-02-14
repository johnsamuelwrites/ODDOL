/**
 * Zenodo REST Client
 * Real-time queries to Zenodo API for datasets and research outputs
 */

import type { DataSource, EntityType, UnifiedEntity } from '$lib/types';
import type { SourceClient, SourceQuery, SourceResult } from './types';
import { DATA_SOURCES } from './types';

// ============================================================================
// Zenodo Types
// ============================================================================

interface ZenodoRecord {
	id: number;
	conceptdoi?: string;
	doi?: string;
	doi_url?: string;
	title: string;
	description?: string;
	created: string;
	modified: string;
	metadata: {
		title: string;
		description?: string;
		creators?: Array<{
			name: string;
			orcid?: string;
			affiliation?: string;
		}>;
		keywords?: string[];
		publication_date?: string;
		resource_type?: {
			type: string;
			subtype?: string;
		};
		license?: {
			id: string;
			url?: string;
		};
		access_right?: string;
		relations?: {
			version?: Array<{
				index: number;
				is_last: boolean;
			}>;
		};
	};
	links: {
		self: string;
		html: string;
		files?: string;
	};
	files?: Array<{
		key: string;
		size: number;
		checksum: string;
		links: {
			self: string;
		};
	}>;
}

interface ZenodoSearchResponse {
	hits: {
		hits: ZenodoRecord[];
		total: number;
	};
	links?: {
		self: string;
		next?: string;
		prev?: string;
	};
}

// ============================================================================
// Zenodo Client Implementation
// ============================================================================

export class ZenodoClient implements SourceClient {
	readonly sourceId = 'zenodo';
	readonly config: DataSource;
	private readonly baseUrl: string;
	private readonly userAgent = 'ODDOL/2.0 (https://github.com/johnsamuelwrites/ODDOL)';

	constructor() {
		this.config = DATA_SOURCES.find((s) => s.id === 'zenodo')!;
		this.baseUrl = this.config.baseUrl;
	}

	async search(query: SourceQuery): Promise<SourceResult> {
		const startTime = performance.now();

		const params = this.buildSearchParams(query);
		const response = await this.fetchApi<ZenodoSearchResponse>('/records', params);

		const items = response.hits.hits.map((record) => this.recordToEntity(record));

		const page = parseInt(params.get('page') || '1');
		const size = parseInt(params.get('size') || '25');
		const hasMore = page * size < response.hits.total;

		return {
			items,
			totalCount: response.hits.total,
			hasMore,
			nextCursor: hasMore ? String(page + 1) : undefined,
			queryTime: performance.now() - startTime
		};
	}

	async getEntity(id: string): Promise<UnifiedEntity | null> {
		try {
			const record = await this.fetchApi<ZenodoRecord>(`/records/${id}`);
			return this.recordToEntity(record);
		} catch {
			return null;
		}
	}

	async isAvailable(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/records?size=1`, {
				headers: { Accept: 'application/json' }
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
		const url = params ? `${this.baseUrl}${endpoint}?${params}` : `${this.baseUrl}${endpoint}`;

		const response = await fetch(url, {
			headers: {
				Accept: 'application/json',
				'User-Agent': this.userAgent
			}
		});

		if (!response.ok) {
			throw new ZenodoError(`API request failed: ${response.statusText}`, response.status);
		}

		return response.json();
	}

	// ============================================================================
	// Query Building
	// ============================================================================

	private buildSearchParams(query: SourceQuery): URLSearchParams {
		const params = new URLSearchParams();

		// Build query string
		const queryParts: string[] = [];

		if (query.text) {
			queryParts.push(query.text);
		}

		// Map entity types to Zenodo resource types
		const resourceTypes = query.entityTypes
			.map((type) => this.entityTypeToResourceType(type))
			.filter(Boolean);

		if (resourceTypes.length > 0) {
			queryParts.push(`resource_type.type:(${resourceTypes.join(' OR ')})`);
		}

		// Process filters
		for (const filter of query.filters) {
			switch (filter.field) {
				case 'access':
					queryParts.push(`access_right:${filter.value}`);
					break;
				case 'community':
					queryParts.push(`communities:${filter.value}`);
					break;
				case 'keyword':
					queryParts.push(`keywords:"${filter.value}"`);
					break;
				case 'license':
					queryParts.push(`license.id:${filter.value}`);
					break;
			}
		}

		if (queryParts.length > 0) {
			params.set('q', queryParts.join(' AND '));
		}

		// Pagination (Zenodo uses page-based)
		params.set('size', String(query.pagination.limit));
		if (query.pagination.cursor) {
			params.set('page', query.pagination.cursor);
		} else {
			params.set('page', '1');
		}

		// Default sorting
		params.set('sort', 'mostrecent');

		return params;
	}

	private entityTypeToResourceType(type: EntityType): string | null {
		const typeMap: Record<EntityType, string | null> = {
			dataset: 'dataset',
			software: 'software',
			publication: 'publication',
			author: null,
			organization: null
		};
		return typeMap[type];
	}

	// ============================================================================
	// Entity Conversion
	// ============================================================================

	private recordToEntity(record: ZenodoRecord): UnifiedEntity {
		const type = this.resourceTypeToEntityType(record.metadata.resource_type?.type);
		const doi = record.doi || record.conceptdoi;

		return {
			id: `zenodo:${record.id}`,
			identifiers: {
				zenodo: String(record.id),
				doi: doi
			},
			type,
			title: record.metadata.title || record.title,
			description: this.sanitizeHtml(record.metadata.description),
			creators: record.metadata.creators?.map((c) => ({
				name: c.name,
				orcid: c.orcid,
				affiliation: c.affiliation
			})),
			license: record.metadata.license
				? {
						id: record.metadata.license.id,
						name: this.getLicenseName(record.metadata.license.id),
						url: record.metadata.license.url
					}
				: undefined,
			url: record.links.html,
			created: record.metadata.publication_date || record.created,
			modified: record.modified,
			metadata: {
				accessRight: record.metadata.access_right,
				keywords: record.metadata.keywords,
				resourceType: record.metadata.resource_type,
				files: record.files?.map((f) => ({
					name: f.key,
					size: f.size
				}))
			},
			sources: [
				{
					sourceId: 'zenodo',
					sourceUrl: record.links.html,
					retrievedAt: new Date().toISOString()
				}
			]
		};
	}

	private resourceTypeToEntityType(type?: string): EntityType {
		switch (type) {
			case 'dataset':
				return 'dataset';
			case 'software':
				return 'software';
			case 'publication':
			case 'poster':
			case 'presentation':
				return 'publication';
			default:
				return 'dataset';
		}
	}

	private sanitizeHtml(html?: string): string | undefined {
		if (!html) return undefined;
		// Simple HTML tag removal (browser-safe)
		return html.replace(/<[^>]*>/g, '').slice(0, 500);
	}

	private getLicenseName(id: string): string {
		const licenseNames: Record<string, string> = {
			'cc-by-4.0': 'Creative Commons Attribution 4.0',
			'cc-by-sa-4.0': 'Creative Commons Attribution-ShareAlike 4.0',
			'cc-by-nc-4.0': 'Creative Commons Attribution-NonCommercial 4.0',
			'cc0-1.0': 'CC0 1.0 Universal (Public Domain)',
			'mit': 'MIT License',
			'apache-2.0': 'Apache License 2.0',
			'gpl-3.0': 'GNU General Public License v3.0'
		};
		return licenseNames[id] || id;
	}

	// ============================================================================
	// Specialized Queries
	// ============================================================================

	async searchDatasets(options: {
		text?: string;
		keywords?: string[];
		accessRight?: 'open' | 'closed' | 'embargoed' | 'restricted';
		community?: string;
		limit?: number;
		page?: number;
	}): Promise<SourceResult> {
		const filters = [];

		if (options.accessRight) {
			filters.push({ field: 'access', operator: 'eq' as const, value: options.accessRight });
		}
		if (options.community) {
			filters.push({ field: 'community', operator: 'eq' as const, value: options.community });
		}
		if (options.keywords) {
			for (const keyword of options.keywords) {
				filters.push({ field: 'keyword', operator: 'eq' as const, value: keyword });
			}
		}

		return this.search({
			text: options.text || '',
			filters,
			entityTypes: ['dataset'],
			pagination: {
				limit: options.limit || 25,
				cursor: options.page ? String(options.page) : undefined
			}
		});
	}

	async getRecordVersions(conceptId: string): Promise<UnifiedEntity[]> {
		const params = new URLSearchParams({
			q: `conceptdoi:"${conceptId}"`,
			all_versions: 'true',
			sort: '-version'
		});

		const response = await this.fetchApi<ZenodoSearchResponse>('/records', params);
		return response.hits.hits.map((record) => this.recordToEntity(record));
	}

	async getCommunityRecords(communityId: string, limit: number = 25): Promise<SourceResult> {
		return this.search({
			text: '',
			filters: [{ field: 'community', operator: 'eq', value: communityId }],
			entityTypes: ['dataset', 'software', 'publication'],
			pagination: { limit }
		});
	}
}

// ============================================================================
// Error Class
// ============================================================================

export class ZenodoError extends Error {
	constructor(
		message: string,
		public readonly statusCode?: number
	) {
		super(message);
		this.name = 'ZenodoError';
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: ZenodoClient | null = null;

export function getZenodoClient(): ZenodoClient {
	if (!instance) {
		instance = new ZenodoClient();
	}
	return instance;
}
