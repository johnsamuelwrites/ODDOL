<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { analysisStore, currentSchema, isAnalyzing, analysisError } from '$lib/stores/analysis';
	import { getVisualizationService } from '$lib/visualization';
	import { getFederationEngine } from '$lib/federation';
	import type { ChartConfig, ChartType, UnifiedEntity } from '$lib/types';

	type QueryResultView = { columns: string[]; rows: unknown[][] };

	interface DescribeDraft {
		title: string;
		description: string;
		methodology: string;
		dataSources: string[];
		generatedBy: string;
		usedQuery: string;
	}

	let sqlQuery = '';
	let queryResult: QueryResultView | null = null;
	let chartContainer: HTMLDivElement;
	let selectedChartType: ChartType = 'bar';
	let chartXColumn = '';
	let chartYColumn = '';
	let dataUrl = '';
	let tableNameInput = 'imported_data';
	let sqlValidationMessage: string | null = null;
	let queryHistory: string[] = [];
	let activeEntity: UnifiedEntity | null = null;
	let searchContext = '';

	const QUERY_HISTORY_KEY = 'oddol:sql-history';
	const DESCRIBE_DRAFT_KEY = 'oddol:describe-draft';

	const visualizationService = getVisualizationService();
	const federationEngine = getFederationEngine();

	onMount(async () => {
		await analysisStore.initialize();
		loadQueryHistory();

		searchContext = $page.url.searchParams.get('q') || '';
		await loadEntityFromQueryParam();
	});

	async function loadEntityFromQueryParam() {
		const entityId = $page.url.searchParams.get('id');
		if (!entityId) return;

		try {
			analysisStore.setError(null);
			const entity = await federationEngine.getEntity(entityId);

			if (!entity) {
				analysisStore.setError(`Unable to load entity "${entityId}"`);
				return;
			}

			activeEntity = entity;
			analysisStore.setSelectedEntity(entity);

			const tableName = 'entity_data';
			await analysisStore.loadData([entityToRow(entity)], tableName);
			sqlQuery = `SELECT * FROM ${tableName}`;
			const result = await analysisStore.executeQuery(sqlQuery);
			if (result) {
				queryResult = result;
				addQueryToHistory(sqlQuery);
			}

			setDefaultChartColumns();
		} catch (error) {
			analysisStore.setError(
				error instanceof Error ? error.message : 'Failed to load entity for analysis'
			);
		}
	}

	function entityToRow(entity: UnifiedEntity): Record<string, unknown> {
		return {
			id: entity.id,
			type: entity.type,
			title: entity.title,
			description: entity.description || null,
			doi: entity.identifiers.doi || null,
			wikidata: entity.identifiers.wikidata || null,
			openalex: entity.identifiers.openalex || null,
			zenodo: entity.identifiers.zenodo || null,
			datacite: entity.identifiers.datacite || null,
			created: entity.created || null,
			modified: entity.modified || null,
			url: entity.url || null,
			publisher: entity.publisher?.name || null,
			license: entity.license?.name || null,
			creators: entity.creators?.map((c) => c.name).join('; ') || null,
			source_ids: entity.sources.map((s) => s.sourceId).join(', '),
			metadata_json: entity.metadata ? JSON.stringify(entity.metadata) : null
		};
	}

	function loadQueryHistory() {
		if (!browser) return;

		try {
			const raw = localStorage.getItem(QUERY_HISTORY_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				queryHistory = parsed.filter((q): q is string => typeof q === 'string');
			}
		} catch {
			queryHistory = [];
		}
	}

	function addQueryToHistory(query: string) {
		const normalized = query.trim();
		if (!normalized || !browser) return;

		const withoutDup = queryHistory.filter((item) => item !== normalized);
		queryHistory = [normalized, ...withoutDup].slice(0, 10);
		localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(queryHistory));
	}

	function setDefaultChartColumns() {
		if ($currentSchema?.columns.length) {
			chartXColumn = $currentSchema.columns[0].name;
			chartYColumn = $currentSchema.columns[1]?.name || '';
		}
	}

	function toSafeTableName(value: string): string {
		const cleaned = value.trim().replace(/[^\w]/g, '_');
		return cleaned || 'imported_data';
	}

	function validateSql(sql: string): string | null {
		const normalized = sql.trim();
		if (!normalized) return 'SQL query is empty.';

		const firstToken = normalized.split(/\s+/)[0]?.toUpperCase();
		const allowedFirstTokens = ['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'PRAGMA'];
		if (!firstToken || !allowedFirstTokens.includes(firstToken)) {
			return `Query starts with "${firstToken || 'UNKNOWN'}". Prefer read-only statements (SELECT/WITH/SHOW).`;
		}

		return null;
	}

	function parseCsv(text: string): Record<string, unknown>[] {
		const lines = text
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		if (lines.length < 2) return [];

		const headers = parseCsvLine(lines[0]);
		return lines.slice(1).map((line) => {
			const values = parseCsvLine(line);
			const row: Record<string, unknown> = {};
			for (let i = 0; i < headers.length; i++) {
				const raw = values[i] ?? '';
				const numeric = Number(raw);
				row[headers[i]] =
					raw === '' ? null : Number.isNaN(numeric) ? raw : numeric;
			}
			return row;
		});
	}

	function parseCsvLine(line: string): string[] {
		const result: string[] = [];
		let current = '';
		let inQuotes = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			const next = line[i + 1];

			if (char === '"' && inQuotes && next === '"') {
				current += '"';
				i++;
				continue;
			}

			if (char === '"') {
				inQuotes = !inQuotes;
				continue;
			}

			if (char === ',' && !inQuotes) {
				result.push(current);
				current = '';
				continue;
			}

			current += char;
		}

		result.push(current);
		return result;
	}

	function extractTableNameFromFile(fileName: string): string {
		const base = fileName.replace(/\.[^.]+$/, '');
		return toSafeTableName(base);
	}

	async function handleFileUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			analysisStore.setError(null);
			const content = await file.text();
			const lowerName = file.name.toLowerCase();
			let rows: Record<string, unknown>[] = [];

			if (lowerName.endsWith('.json')) {
				const parsed = JSON.parse(content);
				if (Array.isArray(parsed)) {
					rows = parsed as Record<string, unknown>[];
				} else if (parsed && typeof parsed === 'object') {
					rows = [parsed as Record<string, unknown>];
				} else {
					throw new Error('JSON file must contain an object or array of objects.');
				}
			} else if (lowerName.endsWith('.csv')) {
				rows = parseCsv(content);
			} else {
				throw new Error('Only CSV and JSON files are supported.');
			}

			if (rows.length === 0) {
				throw new Error('No rows found in uploaded file.');
			}

			const tableName = extractTableNameFromFile(file.name);
			await analysisStore.loadData(rows, tableName);
			sqlQuery = `SELECT * FROM ${tableName}`;
			const result = await analysisStore.executeQuery(sqlQuery);
			if (result) {
				queryResult = result;
				addQueryToHistory(sqlQuery);
			}
			setDefaultChartColumns();
		} catch (error) {
			analysisStore.setError(
				error instanceof Error ? error.message : 'Failed to parse and load file'
			);
		} finally {
			input.value = '';
		}
	}

	async function handleLoadFromUrl() {
		const trimmedUrl = dataUrl.trim();
		if (!trimmedUrl) return;

		const tableName = toSafeTableName(tableNameInput);
		await analysisStore.loadFromUrl(trimmedUrl, tableName);
		sqlQuery = `SELECT * FROM ${tableName}`;
		const result = await analysisStore.executeQuery(sqlQuery);
		if (result) {
			queryResult = result;
			addQueryToHistory(sqlQuery);
		}
		setDefaultChartColumns();
	}

	async function handleLoadSampleData() {
		const sampleData = [
			{ year: 2020, temperature: 14.9, co2: 414, region: 'Global' },
			{ year: 2021, temperature: 14.7, co2: 416, region: 'Global' },
			{ year: 2022, temperature: 14.8, co2: 418, region: 'Global' },
			{ year: 2023, temperature: 15.1, co2: 420, region: 'Global' },
			{ year: 2024, temperature: 15.3, co2: 422, region: 'Global' },
			{ year: 2020, temperature: 13.2, co2: 412, region: 'Europe' },
			{ year: 2021, temperature: 12.9, co2: 414, region: 'Europe' },
			{ year: 2022, temperature: 13.5, co2: 416, region: 'Europe' },
			{ year: 2023, temperature: 13.8, co2: 418, region: 'Europe' },
			{ year: 2024, temperature: 14.1, co2: 420, region: 'Europe' }
		];

		await analysisStore.loadData(sampleData, 'climate_data');
		sqlQuery = 'SELECT * FROM climate_data';
		const result = await analysisStore.executeQuery(sqlQuery);
		if (result) {
			queryResult = result;
			addQueryToHistory(sqlQuery);
		}
		setDefaultChartColumns();
	}

	async function handleExecuteQuery() {
		if (!sqlQuery.trim()) return;

		sqlValidationMessage = validateSql(sqlQuery);
		const result = await analysisStore.executeQuery(sqlQuery);
		if (result) {
			queryResult = result;
			addQueryToHistory(sqlQuery);
		}
	}

	function handleSqlKeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
			event.preventDefault();
			void handleExecuteQuery();
		}
	}

	function handleCreateChart() {
		if (!queryResult || !chartXColumn) return;

		const data = queryResult.rows.map((row) => {
			const obj: Record<string, unknown> = {};
			queryResult!.columns.forEach((col, i) => {
				obj[col] = row[i];
			});
			return obj;
		});

		const config: ChartConfig = {
			type: selectedChartType,
			data,
			x: chartXColumn,
			y: chartYColumn || undefined,
			title: `${chartYColumn || 'Distribution'} by ${chartXColumn}`
		};

		const { element } = visualizationService.createChart(config);

		if (chartContainer) {
			chartContainer.innerHTML = '';
			chartContainer.appendChild(element);
		}
	}

	function handleExportCSV() {
		if (!queryResult) return;

		const headers = queryResult.columns.join(',');
		const rows = queryResult.rows.map((row) => row.map((v) => JSON.stringify(v)).join(','));
		const csv = [headers, ...rows].join('\n');

		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'oddol_export.csv';
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleGoToDescribe() {
		if (!browser) return;

		const sourceEntries = activeEntity?.sources.map((s) => `${s.sourceId}: ${s.sourceUrl}`) || [];
		const sourceParam = $page.url.searchParams.get('sources');
		if (!activeEntity && sourceParam) {
			for (const sourceId of sourceParam.split(',').map((s) => s.trim()).filter(Boolean)) {
				sourceEntries.push(sourceId);
			}
		}
		if (activeEntity?.url) {
			sourceEntries.push(activeEntity.url);
		}
		const doiParam = $page.url.searchParams.get('doi');
		if (!activeEntity && doiParam) {
			sourceEntries.push(`doi:${doiParam}`);
		}
		const titleParam = $page.url.searchParams.get('title');

		const describeDraft: DescribeDraft = {
			title: activeEntity
				? `Analysis of ${activeEntity.title}`
				: titleParam
					? `Analysis of ${titleParam}`
					: 'Untitled analysis',
			description: searchContext
				? `Started from search query: "${searchContext}".`
				: 'Analysis produced in ODDOL Analyze.',
			methodology: 'SQL analysis executed in DuckDB-WASM in browser.',
			dataSources: sourceEntries,
			generatedBy: 'ODDOL User',
			usedQuery: sqlQuery
		};

		sessionStorage.setItem(DESCRIBE_DRAFT_KEY, JSON.stringify(describeDraft));
		await goto('/describe?from=analyze');
	}
</script>

<svelte:head>
	<title>Analyze Data - ODDOL</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<div class="mb-8 flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-3xl font-bold text-gray-900 mb-2">Analyze Data</h1>
			<p class="text-gray-600">
				Process data in-browser with SQL using DuckDB-WASM. No data leaves your browser.
			</p>
		</div>
		<button on:click={handleGoToDescribe} class="btn btn-outline">
			Send to Describe
		</button>
	</div>

	<!-- Error Display -->
	{#if $analysisError}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
			<p class="text-red-700">{$analysisError}</p>
		</div>
	{/if}

	<div class="grid lg:grid-cols-3 gap-6">
		<!-- Left Panel: Data & SQL -->
		<div class="lg:col-span-2 space-y-6">
			<!-- Data Loading -->
			<div class="card p-4">
				<h2 class="font-semibold text-gray-900 mb-4">Load Data</h2>
				<div class="flex flex-wrap gap-2">
					<button on:click={handleLoadSampleData} class="btn btn-outline text-sm">
						Load Sample Data
					</button>
					<label class="btn btn-outline text-sm cursor-pointer">
						<input type="file" accept=".csv,.json" class="hidden" on:change={handleFileUpload} />
						Upload File
					</label>
				</div>
				<div class="mt-4 grid sm:grid-cols-[1fr_auto_auto] gap-2">
					<input
						type="url"
						bind:value={dataUrl}
						placeholder="https://example.org/data.csv"
						class="input"
					/>
					<input
						type="text"
						bind:value={tableNameInput}
						placeholder="table_name"
						class="input"
					/>
					<button
						on:click={handleLoadFromUrl}
						disabled={$isAnalyzing || !dataUrl.trim()}
						class="btn btn-outline text-sm"
					>
						Load from URL
					</button>
				</div>
			</div>

			<!-- Schema Display -->
			{#if $currentSchema}
				<div class="card p-4">
					<h2 class="font-semibold text-gray-900 mb-4">
						Table: {$currentSchema.name}
						<span class="text-sm font-normal text-gray-500">
							({$currentSchema.rowCount} rows)
						</span>
					</h2>
					<div class="flex flex-wrap gap-2">
						{#each $currentSchema.columns as column}
							<span class="badge badge-secondary">
								{column.name}
								<span class="text-gray-400 ml-1">({column.type})</span>
							</span>
						{/each}
					</div>
				</div>
			{/if}

			<!-- SQL Console -->
			<div class="card p-4">
				<div class="flex items-center justify-between mb-4">
					<h2 class="font-semibold text-gray-900">SQL Console</h2>
					<button
						on:click={handleExecuteQuery}
						disabled={$isAnalyzing || !sqlQuery.trim()}
						class="btn btn-primary text-sm"
					>
						{#if $isAnalyzing}
							Running...
						{:else}
							Run Query
						{/if}
					</button>
				</div>
				<div class="sql-console">
					<textarea
						bind:value={sqlQuery}
						on:keydown={handleSqlKeydown}
						placeholder="SELECT * FROM table_name LIMIT 100"
						rows="4"
						class="w-full bg-transparent text-green-400 font-mono focus:outline-none"
					></textarea>
				</div>
				<div class="mt-2 text-xs text-gray-500">
					Press Ctrl+Enter (or Cmd+Enter) to run query
				</div>
				{#if sqlValidationMessage}
					<div class="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
						{sqlValidationMessage}
					</div>
				{/if}
			</div>

			<!-- Query Results -->
			{#if queryResult}
				<div class="card p-4">
					<div class="flex items-center justify-between mb-4">
						<h2 class="font-semibold text-gray-900">
							Results
							<span class="text-sm font-normal text-gray-500">
								({queryResult.rows.length} rows)
							</span>
						</h2>
						<button on:click={handleExportCSV} class="btn btn-outline text-sm">
							Export CSV
						</button>
					</div>
					<div class="overflow-x-auto">
						<table class="data-table">
							<thead>
								<tr>
									{#each queryResult.columns as column}
										<th>{column}</th>
									{/each}
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#each queryResult.rows.slice(0, 100) as row}
									<tr>
										{#each row as cell}
											<td>{cell}</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if queryResult.rows.length > 100}
						<p class="text-sm text-gray-500 mt-2">
							Showing first 100 of {queryResult.rows.length} rows
						</p>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Right Panel: Visualization -->
		<div class="space-y-6">
			<!-- Chart Builder -->
			<div class="card p-4">
				<h2 class="font-semibold text-gray-900 mb-4">Visualization</h2>

				<div class="space-y-4">
					<!-- Chart Type -->
					<div>
						<label for="chart-type" class="block text-sm font-medium text-gray-700 mb-1">Chart Type</label>
						<select id="chart-type" bind:value={selectedChartType} class="input">
							<option value="line">Line Chart</option>
							<option value="bar">Bar Chart</option>
							<option value="scatter">Scatter Plot</option>
							<option value="histogram">Histogram</option>
							<option value="area">Area Chart</option>
						</select>
					</div>

					<!-- X Column -->
					<div>
						<label for="chart-x" class="block text-sm font-medium text-gray-700 mb-1">X Axis</label>
						<select id="chart-x" bind:value={chartXColumn} class="input">
							<option value="">Select column</option>
							{#if $currentSchema}
								{#each $currentSchema.columns as column}
									<option value={column.name}>{column.name}</option>
								{/each}
							{/if}
						</select>
					</div>

					<!-- Y Column -->
					<div>
						<label for="chart-y" class="block text-sm font-medium text-gray-700 mb-1">Y Axis</label>
						<select id="chart-y" bind:value={chartYColumn} class="input">
							<option value="">Select column</option>
							{#if $currentSchema}
								{#each $currentSchema.columns as column}
									<option value={column.name}>{column.name}</option>
								{/each}
							{/if}
						</select>
					</div>

					<button
						on:click={handleCreateChart}
						disabled={!queryResult || !chartXColumn}
						class="btn btn-primary w-full"
					>
						Create Chart
					</button>
				</div>
			</div>

			<!-- Chart Display -->
			<div class="card p-4">
				<h2 class="font-semibold text-gray-900 mb-4">Chart</h2>
				<div bind:this={chartContainer} class="min-h-[300px] flex items-center justify-center">
					{#if !queryResult}
						<p class="text-gray-400 text-sm">Run a query to visualize data</p>
					{:else}
						<p class="text-gray-400 text-sm">Configure chart options and click "Create Chart"</p>
					{/if}
				</div>
			</div>

			<!-- Query History -->
			<div class="card p-4">
				<h2 class="font-semibold text-gray-900 mb-4">Recent Queries</h2>
				{#if queryHistory.length === 0}
					<p class="text-sm text-gray-500">No query history yet.</p>
				{:else}
					<div class="space-y-2">
						{#each queryHistory as query}
							<button
								on:click={() => (sqlQuery = query)}
								class="btn btn-outline w-full text-sm text-left"
							>
								{query.length > 64 ? `${query.slice(0, 64)}...` : query}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Quick Templates -->
			<div class="card p-4">
				<h2 class="font-semibold text-gray-900 mb-4">SQL Templates</h2>
				<div class="space-y-2">
					<button
						on:click={() => (sqlQuery = 'SELECT * FROM climate_data LIMIT 100')}
						class="btn btn-outline w-full text-sm text-left"
					>
						Preview Data
					</button>
					<button
						on:click={() => (sqlQuery = 'SELECT year, AVG(temperature) as avg_temp FROM climate_data GROUP BY year')}
						class="btn btn-outline w-full text-sm text-left"
					>
						Group by Year
					</button>
					<button
						on:click={() => (sqlQuery = 'SELECT region, COUNT(*) as count FROM climate_data GROUP BY region')}
						class="btn btn-outline w-full text-sm text-left"
					>
						Count by Region
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
