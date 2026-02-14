/**
 * DuckDB-WASM Analysis Engine
 * In-browser SQL processing for streamed data
 */

import type { QueryResult, TableSchema, ColumnStats } from '$lib/types';

// ============================================================================
// DuckDB Types (from @duckdb/duckdb-wasm)
// ============================================================================

interface DuckDBModule {
	AsyncDuckDB: new (logger: unknown, worker: Worker) => AsyncDuckDB;
	ConsoleLogger: new () => unknown;
	getJsDelivrBundles: () => DuckDBBundles;
	selectBundle: (bundles: DuckDBBundles) => Promise<DuckDBBundle>;
}

interface DuckDBBundles {
	mvp: DuckDBBundle;
	eh: DuckDBBundle;
}

interface DuckDBBundle {
	mainModule: string;
	mainWorker: string | null;
}

interface AsyncDuckDB {
	instantiate(mainModule: string): Promise<void>;
	connect(): Promise<AsyncDuckDBConnection>;
	terminate(): Promise<void>;
}

interface AsyncDuckDBConnection {
	query<T = unknown>(sql: string): Promise<DuckDBResult<T>>;
	close(): Promise<void>;
}

interface DuckDBResult<T> {
	toArray(): T[];
	numRows: number;
	numCols: number;
	schema: {
		fields: Array<{ name: string; type: string }>;
	};
}

// ============================================================================
// Analysis Engine Interface
// ============================================================================

export interface AnalysisEngine {
	initialize(): Promise<void>;
	loadData(data: Record<string, unknown>[], tableName: string): Promise<void>;
	loadFromUrl(url: string, tableName: string, options?: LoadOptions): Promise<void>;
	query(sql: string): Promise<QueryResult>;
	getSchema(tableName: string): Promise<TableSchema>;
	computeStats(tableName: string, column: string): Promise<ColumnStats>;
	listTables(): Promise<string[]>;
	dropTable(tableName: string): Promise<void>;
	clear(): Promise<void>;
	terminate(): Promise<void>;
}

export interface LoadOptions {
	format?: 'csv' | 'json' | 'parquet';
	limit?: number;
	delimiter?: string;
	header?: boolean;
}

// ============================================================================
// DuckDB Analysis Engine
// ============================================================================

export class DuckDBAnalysisEngine implements AnalysisEngine {
	private duckdb: DuckDBModule | null = null;
	private db: AsyncDuckDB | null = null;
	private conn: AsyncDuckDBConnection | null = null;
	private initialized = false;
	private initPromise: Promise<void> | null = null;

	// ============================================================================
	// Initialization
	// ============================================================================

	async initialize(): Promise<void> {
		if (this.initialized) return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = this.doInitialize();
		return this.initPromise;
	}

	private async doInitialize(): Promise<void> {
		try {
			// Dynamic import of DuckDB-WASM
			this.duckdb = await import('@duckdb/duckdb-wasm');

			// Select the best bundle for this browser
			const bundles = this.duckdb.getJsDelivrBundles();
			const bundle = await this.duckdb.selectBundle(bundles);

			// Create worker
			const workerUrl = bundle.mainWorker!;
			const worker = new Worker(workerUrl);

			// Initialize database
			const logger = new this.duckdb.ConsoleLogger();
			this.db = new this.duckdb.AsyncDuckDB(logger, worker);
			await this.db.instantiate(bundle.mainModule);

			// Create connection
			this.conn = await this.db.connect();

			this.initialized = true;
		} catch (error) {
			console.error('Failed to initialize DuckDB:', error);
			throw new DuckDBError('Failed to initialize DuckDB-WASM', error);
		}
	}

	// ============================================================================
	// Data Loading
	// ============================================================================

	async loadData(data: Record<string, unknown>[], tableName: string): Promise<void> {
		await this.initialize();

		if (data.length === 0) {
			throw new DuckDBError('Cannot load empty data array');
		}

		// Sanitize table name
		const safeName = this.sanitizeIdentifier(tableName);

		// Create table from JSON data
		const jsonStr = JSON.stringify(data);
		await this.conn!.query(`
			CREATE OR REPLACE TABLE ${safeName} AS
			SELECT * FROM read_json_auto('${this.escapeString(jsonStr)}')
		`);
	}

	async loadFromUrl(
		url: string,
		tableName: string,
		options: LoadOptions = {}
	): Promise<void> {
		await this.initialize();

		const safeName = this.sanitizeIdentifier(tableName);
		const format = options.format || this.inferFormat(url);
		const limit = options.limit ? `LIMIT ${options.limit}` : '';

		let query: string;

		switch (format) {
			case 'csv':
				query = `
					CREATE OR REPLACE TABLE ${safeName} AS
					SELECT * FROM read_csv_auto('${this.escapeString(url)}', header=${options.header !== false})
					${limit}
				`;
				break;
			case 'parquet':
				query = `
					CREATE OR REPLACE TABLE ${safeName} AS
					SELECT * FROM read_parquet('${this.escapeString(url)}')
					${limit}
				`;
				break;
			case 'json':
			default:
				query = `
					CREATE OR REPLACE TABLE ${safeName} AS
					SELECT * FROM read_json_auto('${this.escapeString(url)}')
					${limit}
				`;
		}

		await this.conn!.query(query);
	}

	// ============================================================================
	// Query Execution
	// ============================================================================

	async query(sql: string): Promise<QueryResult> {
		await this.initialize();

		const startTime = performance.now();

		try {
			const result = await this.conn!.query(sql);
			const executionTime = performance.now() - startTime;

			return {
				columns: result.schema.fields.map((f) => f.name),
				rows: result.toArray().map((row) => Object.values(row as object)),
				rowCount: result.numRows,
				executionTime
			};
		} catch (error) {
			throw new DuckDBError(`Query execution failed: ${error}`, error);
		}
	}

	// ============================================================================
	// Schema Inspection
	// ============================================================================

	async getSchema(tableName: string): Promise<TableSchema> {
		await this.initialize();

		const safeName = this.sanitizeIdentifier(tableName);

		// Get column information
		const columnsResult = await this.conn!.query(`
			SELECT column_name, data_type, is_nullable
			FROM information_schema.columns
			WHERE table_name = '${safeName}'
		`);

		// Get row count
		const countResult = await this.conn!.query(`
			SELECT COUNT(*) as count FROM ${safeName}
		`);

		const columns = columnsResult.toArray().map((row: unknown) => {
			const r = row as { column_name: string; data_type: string; is_nullable: string };
			return {
				name: r.column_name,
				type: r.data_type,
				nullable: r.is_nullable === 'YES'
			};
		});

		const rowCount = (countResult.toArray()[0] as { count: number }).count;

		return {
			name: tableName,
			columns,
			rowCount
		};
	}

	// ============================================================================
	// Statistics
	// ============================================================================

	async computeStats(tableName: string, column: string): Promise<ColumnStats> {
		await this.initialize();

		const safeName = this.sanitizeIdentifier(tableName);
		const safeColumn = this.sanitizeIdentifier(column);

		// Determine column type
		const schema = await this.getSchema(tableName);
		const columnInfo = schema.columns.find((c) => c.name === column);
		const isNumeric = this.isNumericType(columnInfo?.type || '');

		if (isNumeric) {
			const result = await this.conn!.query(`
				SELECT
					COUNT(*) as count,
					COUNT(DISTINCT "${safeColumn}") as unique_count,
					SUM(CASE WHEN "${safeColumn}" IS NULL THEN 1 ELSE 0 END) as null_count,
					MIN("${safeColumn}") as min_val,
					MAX("${safeColumn}") as max_val,
					AVG("${safeColumn}")::DOUBLE as mean,
					STDDEV("${safeColumn}")::DOUBLE as stddev,
					MEDIAN("${safeColumn}")::DOUBLE as median
				FROM ${safeName}
			`);

			const row = result.toArray()[0] as Record<string, unknown>;

			return {
				count: Number(row.count),
				uniqueCount: Number(row.unique_count),
				nullCount: Number(row.null_count),
				min: row.min_val as number,
				max: row.max_val as number,
				mean: row.mean as number,
				stddev: row.stddev as number,
				median: row.median as number,
				type: 'numeric'
			};
		} else {
			const result = await this.conn!.query(`
				SELECT
					COUNT(*) as count,
					COUNT(DISTINCT "${safeColumn}") as unique_count,
					SUM(CASE WHEN "${safeColumn}" IS NULL THEN 1 ELSE 0 END) as null_count,
					MIN("${safeColumn}") as min_val,
					MAX("${safeColumn}") as max_val
				FROM ${safeName}
			`);

			const row = result.toArray()[0] as Record<string, unknown>;

			return {
				count: Number(row.count),
				uniqueCount: Number(row.unique_count),
				nullCount: Number(row.null_count),
				min: row.min_val as string,
				max: row.max_val as string,
				type: 'string'
			};
		}
	}

	// ============================================================================
	// Table Management
	// ============================================================================

	async listTables(): Promise<string[]> {
		await this.initialize();

		const result = await this.conn!.query(`
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'main'
		`);

		return result.toArray().map((row: unknown) => (row as { table_name: string }).table_name);
	}

	async dropTable(tableName: string): Promise<void> {
		await this.initialize();

		const safeName = this.sanitizeIdentifier(tableName);
		await this.conn!.query(`DROP TABLE IF EXISTS ${safeName}`);
	}

	async clear(): Promise<void> {
		await this.initialize();

		const tables = await this.listTables();
		for (const table of tables) {
			await this.dropTable(table);
		}
	}

	// ============================================================================
	// Lifecycle
	// ============================================================================

	async terminate(): Promise<void> {
		if (this.conn) {
			await this.conn.close();
			this.conn = null;
		}
		if (this.db) {
			await this.db.terminate();
			this.db = null;
		}
		this.initialized = false;
		this.initPromise = null;
	}

	// ============================================================================
	// Helpers
	// ============================================================================

	private sanitizeIdentifier(name: string): string {
		// Remove or escape dangerous characters
		return name.replace(/[^\w]/g, '_');
	}

	private escapeString(str: string): string {
		return str.replace(/'/g, "''");
	}

	private inferFormat(url: string): 'csv' | 'json' | 'parquet' {
		const lower = url.toLowerCase();
		if (lower.endsWith('.csv')) return 'csv';
		if (lower.endsWith('.parquet')) return 'parquet';
		return 'json';
	}

	private isNumericType(type: string): boolean {
		const numericTypes = [
			'integer',
			'bigint',
			'smallint',
			'tinyint',
			'double',
			'float',
			'decimal',
			'numeric',
			'real'
		];
		return numericTypes.some((t) => type.toLowerCase().includes(t));
	}
}

// ============================================================================
// Error Class
// ============================================================================

export class DuckDBError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'DuckDBError';
	}
}

// ============================================================================
// SQL Templates
// ============================================================================

export const SQL_TEMPLATES = {
	descriptiveStats: (table: string, column: string) => `
		SELECT
			COUNT(*) as count,
			COUNT(DISTINCT "${column}") as unique_values,
			MIN("${column}") as minimum,
			MAX("${column}") as maximum,
			AVG("${column}")::DOUBLE as mean,
			STDDEV("${column}")::DOUBLE as std_deviation,
			MEDIAN("${column}")::DOUBLE as median,
			PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY "${column}") as q1,
			PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY "${column}") as q3
		FROM ${table}
	`,

	correlation: (table: string, col1: string, col2: string) => `
		SELECT
			CORR("${col1}", "${col2}")::DOUBLE as correlation
		FROM ${table}
	`,

	histogram: (table: string, column: string, bins: number = 20) => `
		WITH stats AS (
			SELECT MIN("${column}") as min_val, MAX("${column}") as max_val
			FROM ${table}
		),
		bins AS (
			SELECT
				min_val + (max_val - min_val) * i / ${bins} as bin_start,
				min_val + (max_val - min_val) * (i + 1) / ${bins} as bin_end
			FROM stats, generate_series(0, ${bins - 1}) as t(i)
		)
		SELECT
			bin_start,
			bin_end,
			COUNT(*) as count
		FROM ${table}, bins
		WHERE "${column}" >= bin_start AND "${column}" < bin_end
		GROUP BY bin_start, bin_end
		ORDER BY bin_start
	`,

	groupBy: (table: string, groupColumn: string, aggColumn: string, aggFunc: string = 'AVG') => `
		SELECT
			"${groupColumn}",
			${aggFunc}("${aggColumn}")::DOUBLE as value,
			COUNT(*) as count
		FROM ${table}
		GROUP BY "${groupColumn}"
		ORDER BY value DESC
	`,

	timeSeries: (table: string, dateColumn: string, valueColumn: string, interval: string = 'month') => `
		SELECT
			DATE_TRUNC('${interval}', "${dateColumn}") as period,
			AVG("${valueColumn}")::DOUBLE as mean,
			MIN("${valueColumn}") as min,
			MAX("${valueColumn}") as max,
			COUNT(*) as count
		FROM ${table}
		GROUP BY period
		ORDER BY period
	`
};

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: DuckDBAnalysisEngine | null = null;

export function getAnalysisEngine(): DuckDBAnalysisEngine {
	if (!instance) {
		instance = new DuckDBAnalysisEngine();
	}
	return instance;
}
