/**
 * DataCite REST Client
 * Real-time queries to DataCite API for DOI metadata
 */

import type { DataSource, EntityType, UnifiedEntity } from '$lib/types';
import type { SourceClient, SourceQuery, SourceResult } from './types';
import { DATA_SOURCES } from './types';

// ============================================================================
// DataCite Types
// ============================================================================

interface DataCiteWork {
	id: string;
	type: string;
	attributes: {
		doi: string;
		prefix: string;
		suffix: string;
		identifiers?: Array<{
			identifier: string;
			identifierType: string;
		}>;
		creators?: Array<{
			name: string;
			nameType: string;
			givenName?: string;
			familyName?: string;
			nameIdentifiers?: Array<{
				nameIdentifier: string;
				nameIdentifierScheme: string;
			}>;
			affiliation?: Array<{
				name: string;
				affiliationIdentifier?: string;
				affiliationIdentifierScheme?: string;
			}>;
		}>;
		titles: Array<{
			title: string;
			titleType?: string;
			lang?: string;
		}>;
		publisher: string;
		publicationYear: number;
		resourceType?: {
			resourceTypeGeneral: string;
			resourceType?: string;
		};
		subjects?: Array<{
			subject: string;
			subjectScheme?: string;
		}>;
		descriptions?: Array<{
			description: string;
			descriptionType: string;
		}>;
		rightsList?: Array<{
			rights: string;
			rightsUri?: string;
			rightsIdentifier?: string;
		}>;
		dates?: Array<{
			date: string;
			dateType: string;
		}>;
		relatedIdentifiers?: Array<{
			relatedIdentifier: string;
			relatedIdentifierType: string;
			relationType: string;
		}>;
		url: string;
		created: string;
		updated: string;
	};
}

interface DataCiteResponse {
	data: DataCiteWork[];
	meta: {
		total: number;
		totalPages: number;
		page: number;
	};
	links?: {
		self: string;
		next?: string;
		prev?: string;
	};
}

// ============================================================================
// DataCite Client Implementation
// ============================================================================

export class DataCiteClient implements SourceClient {
	readonly sourceId = 'datacite';
	readonly config: DataSource;
	private readonly baseUrl: string;
	private readonly userAgent = 'ODDOL/2.0 (https://github.com/johnsamuelwrites/ODDOL)';

	constructor() {
		this.config = DATA_SOURCES.find((s) => s.id === 'datacite')!;
		this.baseUrl = this.config.baseUrl;
	}

	async search(query: SourceQuery): Promise<SourceResult> {
		const startTime = performance.now();

		const params = this.buildSearchParams(query);
		const response = await this.fetchApi<DataCiteResponse>('/dois', params);

		const items = response.data.map((work) => this.workToEntity(work));

		return {
			items,
			totalCount: response.meta.total,
			hasMore: response.meta.page < response.meta.totalPages,
			nextCursor: response.links?.next ? String(response.meta.page + 1) : undefined,
			queryTime: performance.now() - startTime
		};
	}

	async getEntity(doi: string): Promise<UnifiedEntity | null> {
		try {
			// Clean the DOI
			const cleanDoi = doi.replace('https://doi.org/', '').replace('http://doi.org/', '');
			const response = await this.fetchApi<{ data: DataCiteWork }>(`/dois/${encodeURIComponent(cleanDoi)}`);
			return this.workToEntity(response.data);
		} catch {
			return null;
		}
	}

	async isAvailable(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/dois?page[size]=1`, {
				headers: { Accept: 'application/vnd.api+json' }
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
				Accept: 'application/vnd.api+json',
				'User-Agent': this.userAgent
			}
		});

		if (!response.ok) {
			throw new DataCiteError(`API request failed: ${response.statusText}`, response.status);
		}

		return response.json();
	}

	// ============================================================================
	// Query Building
	// ============================================================================

	private buildSearchParams(query: SourceQuery): URLSearchParams {
		const params = new URLSearchParams();

		// Search query
		if (query.text) {
			params.set('query', query.text);
		}

		// Resource type filter
		const resourceTypes = query.entityTypes
			.map((type) => this.entityTypeToResourceType(type))
			.filter(Boolean);

		if (resourceTypes.length > 0) {
			params.set('resource-type-id', resourceTypes.join(','));
		}

		// Process filters
		for (const filter of query.filters) {
			switch (filter.field) {
				case 'year':
					params.set('publication-year', String(filter.value));
					break;
				case 'publisher':
					params.set('publisher', String(filter.value));
					break;
				case 'client':
					params.set('client-id', String(filter.value));
					break;
				case 'affiliation':
					params.set('affiliation', String(filter.value));
					break;
			}
		}

		// Pagination
		params.set('page[size]', String(query.pagination.limit));
		if (query.pagination.cursor) {
			params.set('page[number]', query.pagination.cursor);
		}

		// Sorting
		params.set('sort', '-created');

		return params;
	}

	private entityTypeToResourceType(type: EntityType): string | null {
		const typeMap: Record<EntityType, string | null> = {
			dataset: 'dataset',
			software: 'software',
			publication: 'text',
			author: null,
			organization: null
		};
		return typeMap[type];
	}

	// ============================================================================
	// Entity Conversion
	// ============================================================================

	private workToEntity(work: DataCiteWork): UnifiedEntity {
		const attrs = work.attributes;
		const type = this.resourceTypeToEntityType(attrs.resourceType?.resourceTypeGeneral);

		// Find primary title
		const primaryTitle = attrs.titles.find((t) => !t.titleType) || attrs.titles[0];

		// Find abstract/description
		const abstract = attrs.descriptions?.find((d) => d.descriptionType === 'Abstract');

		// Find rights/license
		const rights = attrs.rightsList?.[0];

		// Find publication date
		const pubDate = attrs.dates?.find((d) => d.dateType === 'Issued')?.date;

		return {
			id: `datacite:${attrs.doi}`,
			identifiers: {
				doi: attrs.doi,
				datacite: work.id
			},
			type,
			title: primaryTitle?.title || attrs.doi,
			description: abstract?.description?.slice(0, 500),
			creators: attrs.creators?.map((c) => {
				const orcid = c.nameIdentifiers?.find(
					(ni) => ni.nameIdentifierScheme === 'ORCID'
				)?.nameIdentifier;

				return {
					name: c.name || `${c.givenName || ''} ${c.familyName || ''}`.trim(),
					orcid: orcid?.replace('https://orcid.org/', ''),
					affiliation: c.affiliation?.[0]?.name
				};
			}),
			publisher: {
				name: attrs.publisher
			},
			license: rights
				? {
						id: rights.rightsIdentifier || 'unknown',
						name: rights.rights,
						url: rights.rightsUri
					}
				: undefined,
			url: attrs.url,
			created: pubDate || String(attrs.publicationYear),
			metadata: {
				resourceType: attrs.resourceType,
				subjects: attrs.subjects?.map((s) => s.subject),
				relatedIdentifiers: attrs.relatedIdentifiers?.map((ri) => ({
					identifier: ri.relatedIdentifier,
					type: ri.relatedIdentifierType,
					relation: ri.relationType
				}))
			},
			sources: [
				{
					sourceId: 'datacite',
					sourceUrl: `https://doi.org/${attrs.doi}`,
					retrievedAt: new Date().toISOString()
				}
			]
		};
	}

	private resourceTypeToEntityType(type?: string): EntityType {
		switch (type?.toLowerCase()) {
			case 'dataset':
				return 'dataset';
			case 'software':
				return 'software';
			case 'text':
			case 'journalarticle':
			case 'book':
			case 'bookchapter':
			case 'conferencepaper':
			case 'report':
			case 'preprint':
				return 'publication';
			default:
				return 'dataset';
		}
	}

	// ============================================================================
	// Specialized Queries
	// ============================================================================

	async searchDatasets(options: {
		text?: string;
		year?: number;
		publisher?: string;
		limit?: number;
		page?: number;
	}): Promise<SourceResult> {
		const filters = [];

		if (options.year) {
			filters.push({ field: 'year', operator: 'eq' as const, value: options.year });
		}
		if (options.publisher) {
			filters.push({ field: 'publisher', operator: 'eq' as const, value: options.publisher });
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

	async getRelatedWorks(doi: string): Promise<UnifiedEntity[]> {
		const entity = await this.getEntity(doi);
		if (!entity?.metadata?.relatedIdentifiers) {
			return [];
		}

		const relatedDois = (entity.metadata.relatedIdentifiers as Array<{ identifier: string; type: string }>)
			.filter((ri) => ri.type === 'DOI')
			.map((ri) => ri.identifier);

		const results: UnifiedEntity[] = [];

		// Fetch related works (limit to first 10)
		for (const relatedDoi of relatedDois.slice(0, 10)) {
			try {
				const related = await this.getEntity(relatedDoi);
				if (related) {
					results.push(related);
				}
			} catch {
				// Skip if not found
			}
		}

		return results;
	}

	async getPublisherDatasets(publisherId: string, limit: number = 25): Promise<SourceResult> {
		return this.search({
			text: '',
			filters: [{ field: 'client', operator: 'eq', value: publisherId }],
			entityTypes: ['dataset'],
			pagination: { limit }
		});
	}
}

// ============================================================================
// Error Class
// ============================================================================

export class DataCiteError extends Error {
	constructor(
		message: string,
		public readonly statusCode?: number
	) {
		super(message);
		this.name = 'DataCiteError';
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: DataCiteClient | null = null;

export function getDataCiteClient(): DataCiteClient {
	if (!instance) {
		instance = new DataCiteClient();
	}
	return instance;
}
