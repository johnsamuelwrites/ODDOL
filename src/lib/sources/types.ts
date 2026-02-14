/**
 * Data Source Types and Interfaces
 */

import type {
	DataSource,
	EntityType,
	PaginationConfig,
	QueryFilter,
	UnifiedEntity
} from '$lib/types';

// ============================================================================
// Source Client Interface
// ============================================================================

export interface SourceClient {
	readonly sourceId: string;
	readonly config: DataSource;

	search(query: SourceQuery): Promise<SourceResult>;
	getEntity(id: string): Promise<UnifiedEntity | null>;
	isAvailable(): Promise<boolean>;
}

export interface SourceQuery {
	text: string;
	filters: QueryFilter[];
	entityTypes: EntityType[];
	pagination: PaginationConfig;
}

export interface SourceResult {
	items: UnifiedEntity[];
	totalCount: number;
	nextCursor?: string;
	hasMore: boolean;
	queryTime: number;
}

// ============================================================================
// Source Registry
// ============================================================================

export const DATA_SOURCES: DataSource[] = [
	{
		id: 'wikidata',
		name: 'Wikidata',
		type: 'sparql',
		baseUrl: 'https://query.wikidata.org/sparql',
		rateLimit: { requests: 5, window: 1000 },
		supports: {
			pagination: 'offset',
			streaming: true,
			filters: ['type', 'property', 'value', 'language', 'topic', 'license', 'publisher'],
			sorting: true
		},
		entityTypes: ['dataset', 'publication', 'author', 'organization']
	},
	{
		id: 'openalex',
		name: 'OpenAlex',
		type: 'rest',
		baseUrl: 'https://api.openalex.org',
		rateLimit: { requests: 10, window: 1000 },
		supports: {
			pagination: 'cursor',
			streaming: true,
			filters: ['title', 'author', 'institution', 'concept', 'year', 'doi', 'type'],
			sorting: true
		},
		entityTypes: ['publication', 'author', 'organization']
	},
	{
		id: 'zenodo',
		name: 'Zenodo',
		type: 'rest',
		baseUrl: 'https://zenodo.org/api',
		rateLimit: { requests: 60, window: 60000 },
		supports: {
			pagination: 'page',
			streaming: false,
			filters: ['q', 'type', 'subtype', 'access_right', 'communities'],
			sorting: true
		},
		entityTypes: ['dataset', 'software', 'publication']
	},
	{
		id: 'datacite',
		name: 'DataCite',
		type: 'rest',
		baseUrl: 'https://api.datacite.org',
		rateLimit: { requests: 10, window: 1000 },
		supports: {
			pagination: 'cursor',
			streaming: true,
			filters: ['query', 'resourceTypeId', 'language', 'created'],
			sorting: true
		},
		entityTypes: ['dataset', 'software', 'publication']
	},
	{
		id: 'opencitations',
		name: 'OpenCitations',
		type: 'sparql',
		baseUrl: 'https://opencitations.net/sparql',
		rateLimit: { requests: 1, window: 1000 },
		supports: {
			pagination: 'offset',
			streaming: true,
			filters: ['doi', 'citing', 'cited'],
			sorting: false
		},
		entityTypes: ['publication']
	},
	{
		id: 'ror',
		name: 'ROR (Research Organization Registry)',
		type: 'rest',
		baseUrl: 'https://api.ror.org',
		rateLimit: { requests: 100, window: 60000 },
		supports: {
			pagination: 'page',
			streaming: false,
			filters: ['query', 'country', 'type'],
			sorting: false
		},
		entityTypes: ['organization']
	}
];

// ============================================================================
// CKAN Portal Registry
// ============================================================================

export interface CKANPortal {
	id: string;
	name: string;
	baseUrl: string;
	country?: string;
	topics?: string[];
}

export const CKAN_PORTALS: CKANPortal[] = [
	{ id: 'us-gov', name: 'data.gov (US)', baseUrl: 'https://catalog.data.gov/api/3', country: 'US' },
	{
		id: 'eu-data',
		name: 'EU Open Data',
		baseUrl: 'https://data.europa.eu/api/hub/search',
		country: 'EU'
	},
	{ id: 'uk-gov', name: 'data.gov.uk', baseUrl: 'https://data.gov.uk/api/3', country: 'UK' },
	{
		id: 'fr-gov',
		name: 'data.gouv.fr',
		baseUrl: 'https://www.data.gouv.fr/api/1',
		country: 'FR'
	},
	{ id: 'au-gov', name: 'data.gov.au', baseUrl: 'https://data.gov.au/api/3', country: 'AU' }
];

// ============================================================================
// Utility Functions
// ============================================================================

export function getSourceById(id: string): DataSource | undefined {
	return DATA_SOURCES.find((s) => s.id === id);
}

export function getSourcesForEntityType(type: EntityType): DataSource[] {
	return DATA_SOURCES.filter((s) => s.entityTypes.includes(type));
}
