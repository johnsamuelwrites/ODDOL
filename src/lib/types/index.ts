/**
 * ODDOL 2.0 Core Type Definitions
 * Real-time federated open data platform
 */

// ============================================================================
// Entity Identifiers
// ============================================================================

export interface EntityIdentifiers {
	doi?: string;
	wikidata?: string;
	openalex?: string;
	zenodo?: string;
	datacite?: string;
	orcid?: string;
	ror?: string;
	isni?: string;
}

// ============================================================================
// Unified Entities
// ============================================================================

export type EntityType = 'dataset' | 'publication' | 'software' | 'author' | 'organization';

export interface UnifiedEntity {
	id: string;
	identifiers: EntityIdentifiers;
	type: EntityType;
	title: string;
	description?: string;
	creators?: Creator[];
	publisher?: Organization;
	license?: License;
	url?: string;
	created?: string;
	modified?: string;
	sources: SourceReference[];
	metadata?: Record<string, unknown>;
}

export interface Creator {
	name: string;
	orcid?: string;
	affiliation?: string;
}

export interface Organization {
	name: string;
	ror?: string;
	wikidata?: string;
}

export interface License {
	id: string;
	name: string;
	url?: string;
	spdxId?: string;
}

export interface SourceReference {
	sourceId: string;
	sourceUrl: string;
	retrievedAt: string;
}

// ============================================================================
// Data Sources
// ============================================================================

export type DataSourceType = 'sparql' | 'rest' | 'graphql' | 'ckan';
export type PaginationType = 'cursor' | 'offset' | 'page';

export interface DataSource {
	id: string;
	name: string;
	type: DataSourceType;
	baseUrl: string;
	rateLimit: RateLimitConfig;
	supports: {
		pagination: PaginationType;
		streaming: boolean;
		filters: string[];
		sorting: boolean;
	};
	entityTypes: EntityType[];
}

export interface RateLimitConfig {
	requests: number;
	window: number; // milliseconds
}

// ============================================================================
// Query Types
// ============================================================================

export interface QueryFilter {
	field: string;
	operator: 'eq' | 'ne' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'in';
	value: string | number | string[];
}

export interface PaginationConfig {
	limit: number;
	offset?: number;
	cursor?: string;
}

export interface FederatedQuery {
	text: string;
	filters: QueryFilter[];
	sources: string[];
	entityTypes: EntityType[];
	pagination: PaginationConfig;
}

export interface FederatedResult {
	items: UnifiedEntity[];
	totalCount: number;
	sources: SourceMetadata[];
	nextCursor?: string;
	hasMore: boolean;
	partial: boolean;
	errors: SourceError[];
}

export interface SourceMetadata {
	sourceId: string;
	count: number;
	queryTime: number;
}

export interface SourceError {
	source: string;
	error: string;
	code?: number;
}

// ============================================================================
// SPARQL Types
// ============================================================================

export interface SparqlBinding {
	[key: string]: {
		type: 'uri' | 'literal' | 'bnode';
		value: string;
		'xml:lang'?: string;
		datatype?: string;
	};
}

export interface SparqlResult {
	head: {
		vars: string[];
	};
	results: {
		bindings: SparqlBinding[];
	};
}

// ============================================================================
// Analysis Types
// ============================================================================

export interface ColumnStats {
	count: number;
	uniqueCount: number;
	nullCount: number;
	min?: number | string;
	max?: number | string;
	mean?: number;
	stddev?: number;
	median?: number;
	type: 'numeric' | 'string' | 'datetime' | 'boolean' | 'unknown';
}

export interface TableSchema {
	name: string;
	columns: {
		name: string;
		type: string;
		nullable: boolean;
	}[];
	rowCount: number;
}

export interface QueryResult {
	columns: string[];
	rows: unknown[][];
	rowCount: number;
	executionTime: number;
}

// ============================================================================
// Visualization Types
// ============================================================================

export type ChartType = 'line' | 'bar' | 'scatter' | 'histogram' | 'boxplot' | 'area' | 'pie';

export interface ChartConfig {
	type: ChartType;
	data: Record<string, unknown>[];
	x: string;
	y?: string;
	color?: string;
	facet?: string;
	title?: string;
	width?: number;
	height?: number;
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheEntry<T> {
	data: T;
	timestamp: number;
	ttl: number;
	queryHash: string;
}

export interface CacheConfig {
	maxEntries: number;
	defaultTTL: number;
	maxSizeMB: number;
}

// ============================================================================
// Contribution Types
// ============================================================================

export interface DatasetContribution {
	labels: Record<string, string>;
	descriptions: Record<string, string>;
	doi?: string;
	url?: string;
	license?: string; // Wikidata QID
	publisher?: string; // Wikidata QID
	topics: string[]; // Wikidata QIDs
	format?: string; // Wikidata QID
	temporalCoverage?: {
		start?: string;
		end?: string;
	};
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationWarning[];
}

export interface ValidationError {
	field: string;
	message: string;
}

export interface ValidationWarning {
	field: string;
	message: string;
}

// ============================================================================
// Provenance Types
// ============================================================================

export interface ProvenanceRecord {
	id: string;
	entityId: string;
	derivedFrom: string[];
	generatedBy: {
		type: 'query' | 'transformation' | 'analysis';
		description: string;
		timestamp: string;
	};
	sources: SourceReference[];
}
