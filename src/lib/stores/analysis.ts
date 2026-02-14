/**
 * Analysis Store
 * Manages data analysis state and DuckDB operations
 */

import { writable, derived, type Readable } from 'svelte/store';
import type { UnifiedEntity, QueryResult, TableSchema, ColumnStats } from '$lib/types';
import { getAnalysisEngine, SQL_TEMPLATES } from '$lib/analysis';

// ============================================================================
// Types
// ============================================================================

export interface AnalysisState {
	selectedEntity: UnifiedEntity | null;
	loadedTables: string[];
	currentTable: string | null;
	schema: TableSchema | null;
	preview: QueryResult | null;
	queryResult: QueryResult | null;
	columnStats: Record<string, ColumnStats>;
	isLoading: boolean;
	error: string | null;
	sqlQuery: string;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: AnalysisState = {
	selectedEntity: null,
	loadedTables: [],
	currentTable: null,
	schema: null,
	preview: null,
	queryResult: null,
	columnStats: {},
	isLoading: false,
	error: null,
	sqlQuery: ''
};

// ============================================================================
// Store
// ============================================================================

function createAnalysisStore() {
	const { subscribe, set, update } = writable<AnalysisState>(initialState);
	const engine = getAnalysisEngine();

	return {
		subscribe,

		async initialize() {
			try {
				await engine.initialize();
			} catch (error) {
				update((state) => ({
					...state,
					error: error instanceof Error ? error.message : 'Failed to initialize analysis engine'
				}));
			}
		},

		setSelectedEntity(entity: UnifiedEntity) {
			update((state) => ({ ...state, selectedEntity: entity }));
		},

		async loadData(data: Record<string, unknown>[], tableName: string) {
			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				await engine.initialize();
				await engine.loadData(data, tableName);

				const schema = await engine.getSchema(tableName);
				const preview = await engine.query(`SELECT * FROM ${tableName} LIMIT 100`);
				const tables = await engine.listTables();

				update((state) => ({
					...state,
					loadedTables: tables,
					currentTable: tableName,
					schema,
					preview,
					isLoading: false
				}));
			} catch (error) {
				update((state) => ({
					...state,
					isLoading: false,
					error: error instanceof Error ? error.message : 'Failed to load data'
				}));
			}
		},

		async loadFromUrl(url: string, tableName: string) {
			update((state) => ({ ...state, isLoading: true, error: null }));

			try {
				await engine.initialize();
				await engine.loadFromUrl(url, tableName, { limit: 10000 });

				const schema = await engine.getSchema(tableName);
				const preview = await engine.query(`SELECT * FROM ${tableName} LIMIT 100`);
				const tables = await engine.listTables();

				update((state) => ({
					...state,
					loadedTables: tables,
					currentTable: tableName,
					schema,
					preview,
					isLoading: false
				}));
			} catch (error) {
				update((state) => ({
					...state,
					isLoading: false,
					error: error instanceof Error ? error.message : 'Failed to load data from URL'
				}));
			}
		},

		setSqlQuery(sql: string) {
			update((state) => ({ ...state, sqlQuery: sql }));
		},

		async executeQuery(sql: string) {
			update((state) => ({ ...state, isLoading: true, error: null, sqlQuery: sql }));

			try {
				const result = await engine.query(sql);

				update((state) => ({
					...state,
					queryResult: result,
					isLoading: false
				}));

				return result;
			} catch (error) {
				update((state) => ({
					...state,
					isLoading: false,
					error: error instanceof Error ? error.message : 'Query execution failed'
				}));
				return null;
			}
		},

		async computeColumnStats(column: string) {
			let currentState: AnalysisState;
			const unsubscribe = subscribe((s) => (currentState = s));
			unsubscribe();

			if (!currentState!.currentTable) return;

			try {
				const stats = await engine.computeStats(currentState!.currentTable, column);

				update((state) => ({
					...state,
					columnStats: {
						...state.columnStats,
						[column]: stats
					}
				}));
			} catch (error) {
				console.error(`Failed to compute stats for ${column}:`, error);
			}
		},

		async runDescriptiveStats(column: string) {
			let currentState: AnalysisState;
			const unsubscribe = subscribe((s) => (currentState = s));
			unsubscribe();

			if (!currentState!.currentTable) return null;

			const sql = SQL_TEMPLATES.descriptiveStats(currentState!.currentTable, column);
			return this.executeQuery(sql);
		},

		async runCorrelation(col1: string, col2: string) {
			let currentState: AnalysisState;
			const unsubscribe = subscribe((s) => (currentState = s));
			unsubscribe();

			if (!currentState!.currentTable) return null;

			const sql = SQL_TEMPLATES.correlation(currentState!.currentTable, col1, col2);
			return this.executeQuery(sql);
		},

		async runHistogram(column: string, bins: number = 20) {
			let currentState: AnalysisState;
			const unsubscribe = subscribe((s) => (currentState = s));
			unsubscribe();

			if (!currentState!.currentTable) return null;

			const sql = SQL_TEMPLATES.histogram(currentState!.currentTable, column, bins);
			return this.executeQuery(sql);
		},

		async runGroupBy(groupColumn: string, aggColumn: string, aggFunc: string = 'AVG') {
			let currentState: AnalysisState;
			const unsubscribe = subscribe((s) => (currentState = s));
			unsubscribe();

			if (!currentState!.currentTable) return null;

			const sql = SQL_TEMPLATES.groupBy(
				currentState!.currentTable,
				groupColumn,
				aggColumn,
				aggFunc
			);
			return this.executeQuery(sql);
		},

		async dropTable(tableName: string) {
			try {
				await engine.dropTable(tableName);
				const tables = await engine.listTables();

				update((state) => ({
					...state,
					loadedTables: tables,
					currentTable: tables.length > 0 ? tables[0] : null
				}));
			} catch (error) {
				update((state) => ({
					...state,
					error: error instanceof Error ? error.message : 'Failed to drop table'
				}));
			}
		},

		async clear() {
			try {
				await engine.clear();
				set(initialState);
			} catch (error) {
				console.error('Failed to clear analysis state:', error);
			}
		}
	};
}

// ============================================================================
// Exports
// ============================================================================

export const analysisStore = createAnalysisStore();

// Derived stores
export const currentSchema: Readable<TableSchema | null> = derived(
	analysisStore,
	($store) => $store.schema
);

export const dataPreview: Readable<QueryResult | null> = derived(
	analysisStore,
	($store) => $store.preview
);

export const isAnalyzing: Readable<boolean> = derived(
	analysisStore,
	($store) => $store.isLoading
);

export const analysisError: Readable<string | null> = derived(
	analysisStore,
	($store) => $store.error
);
