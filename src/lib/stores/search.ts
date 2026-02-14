/**
 * Search Store
 * Manages search state and federated query results
 */

import { writable, derived, type Readable } from 'svelte/store';
import type { FederatedQuery, FederatedResult, UnifiedEntity, EntityType } from '$lib/types';
import { getFederationEngine } from '$lib/federation';
import { getQueryCache, generateQueryHash } from '$lib/cache';

// ============================================================================
// Types
// ============================================================================

export interface SearchState {
	query: string;
	entityTypes: EntityType[];
	sources: string[];
	filters: SearchFilters;
	results: UnifiedEntity[];
	totalCount: number;
	isLoading: boolean;
	error: string | null;
	hasMore: boolean;
	currentPage: number;
}

export interface SearchFilters {
	license?: string;
	topic?: string;
	publisher?: string;
	yearFrom?: number;
	yearTo?: number;
	openAccess?: boolean;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: SearchState = {
	query: '',
	entityTypes: ['dataset'],
	sources: ['wikidata', 'openalex', 'zenodo', 'datacite'],
	filters: {},
	results: [],
	totalCount: 0,
	isLoading: false,
	error: null,
	hasMore: false,
	currentPage: 1
};

// ============================================================================
// Store
// ============================================================================

function createSearchStore() {
	const { subscribe, set, update } = writable<SearchState>(initialState);
	const engine = getFederationEngine();
	const cache = getQueryCache();

	return {
		subscribe,

		setQuery(query: string) {
			update((state) => ({ ...state, query }));
		},

		setEntityTypes(types: EntityType[]) {
			update((state) => ({ ...state, entityTypes: types }));
		},

		setSources(sources: string[]) {
			update((state) => ({ ...state, sources }));
		},

		setFilters(filters: SearchFilters) {
			update((state) => ({ ...state, filters }));
		},

		async search() {
			update((state) => ({
				...state,
				isLoading: true,
				error: null,
				currentPage: 1
			}));

			let currentState: SearchState;
			const unsubscribe = subscribe((s) => (currentState = s));
			unsubscribe();

			try {
				const federatedQuery = buildFederatedQuery(currentState!);

				// Check cache first
				const cacheKey = await generateQueryHash(federatedQuery);
				const cached = await cache.get<FederatedResult>(cacheKey);

				let result: FederatedResult;

				if (cached) {
					result = cached;
				} else {
					result = await engine.search(federatedQuery);
					// Cache for 15 minutes
					await cache.set(cacheKey, result);
				}

				update((state) => ({
					...state,
					results: result.items,
					totalCount: result.totalCount,
					hasMore: result.hasMore,
					isLoading: false,
					error: result.partial ? `Some sources failed: ${result.errors.map((e) => e.source).join(', ')}` : null
				}));
			} catch (error) {
				update((state) => ({
					...state,
					isLoading: false,
					error: error instanceof Error ? error.message : 'Search failed'
				}));
			}
		},

		async loadMore() {
			update((state) => ({
				...state,
				isLoading: true
			}));

			let currentState: SearchState;
			const unsubscribe = subscribe((s) => (currentState = s));
			unsubscribe();

			try {
				const federatedQuery = buildFederatedQuery(currentState!, currentState!.currentPage + 1);
				const result = await engine.search(federatedQuery);

				update((state) => ({
					...state,
					results: [...state.results, ...result.items],
					hasMore: result.hasMore,
					currentPage: state.currentPage + 1,
					isLoading: false
				}));
			} catch (error) {
				update((state) => ({
					...state,
					isLoading: false,
					error: error instanceof Error ? error.message : 'Failed to load more'
				}));
			}
		},

		clear() {
			set(initialState);
		}
	};
}

// ============================================================================
// Helpers
// ============================================================================

function buildFederatedQuery(state: SearchState, page: number = 1): FederatedQuery {
	const filters = [];

	if (state.filters.topic) {
		filters.push({ field: 'topic', operator: 'eq' as const, value: state.filters.topic });
	}
	if (state.filters.license) {
		filters.push({ field: 'license', operator: 'eq' as const, value: state.filters.license });
	}
	if (state.filters.publisher) {
		filters.push({ field: 'publisher', operator: 'eq' as const, value: state.filters.publisher });
	}
	if (state.filters.yearFrom) {
		filters.push({ field: 'year', operator: 'gte' as const, value: state.filters.yearFrom });
	}
	if (state.filters.yearTo) {
		filters.push({ field: 'year', operator: 'lte' as const, value: state.filters.yearTo });
	}
	if (state.filters.openAccess) {
		filters.push({ field: 'openAccess', operator: 'eq' as const, value: 'true' });
	}

	return {
		text: state.query,
		filters,
		sources: state.sources,
		entityTypes: state.entityTypes,
		pagination: {
			limit: 25,
			offset: (page - 1) * 25
		}
	};
}

// ============================================================================
// Exports
// ============================================================================

export const searchStore = createSearchStore();

// Derived stores
export const searchResults: Readable<UnifiedEntity[]> = derived(
	searchStore,
	($store) => $store.results
);

export const isSearching: Readable<boolean> = derived(
	searchStore,
	($store) => $store.isLoading
);

export const searchError: Readable<string | null> = derived(
	searchStore,
	($store) => $store.error
);
