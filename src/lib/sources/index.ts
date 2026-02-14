/**
 * Data Sources Index
 * Export all source clients and utilities
 */

export * from './types';
export * from './wikidata';
export * from './openalex';
export * from './zenodo';
export * from './datacite';

import type { SourceClient } from './types';
import { getWikidataClient } from './wikidata';
import { getOpenAlexClient } from './openalex';
import { getZenodoClient } from './zenodo';
import { getDataCiteClient } from './datacite';

// ============================================================================
// Source Client Factory
// ============================================================================

const clientFactories: Record<string, () => SourceClient> = {
	wikidata: getWikidataClient,
	openalex: getOpenAlexClient,
	zenodo: getZenodoClient,
	datacite: getDataCiteClient
};

export function getSourceClient(sourceId: string): SourceClient | null {
	const factory = clientFactories[sourceId];
	return factory ? factory() : null;
}

export function getAllSourceClients(): SourceClient[] {
	return Object.values(clientFactories).map((factory) => factory());
}

export function getAvailableSourceIds(): string[] {
	return Object.keys(clientFactories);
}
