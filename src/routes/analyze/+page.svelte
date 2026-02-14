<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { analysisStore, currentSchema, dataPreview, isAnalyzing, analysisError } from '$lib/stores/analysis';
	import { getVisualizationService } from '$lib/visualization';
	import type { ChartConfig, ChartType } from '$lib/types';

	let sqlQuery = '';
	let queryResult: { columns: string[]; rows: unknown[][] } | null = null;
	let chartContainer: HTMLDivElement;
	let selectedChartType: ChartType = 'bar';
	let chartXColumn = '';
	let chartYColumn = '';

	const visualizationService = getVisualizationService();

	onMount(async () => {
		await analysisStore.initialize();

		// Check if we have an entity ID from URL
		const entityId = $page.url.searchParams.get('id');
		if (entityId) {
			// Load entity data - for demo, we'll show sample data loading
			console.log('Loading entity:', entityId);
		}
	});

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

		if ($currentSchema?.columns.length) {
			chartXColumn = $currentSchema.columns[0].name;
			chartYColumn = $currentSchema.columns[1]?.name || '';
		}
	}

	async function handleExecuteQuery() {
		if (!sqlQuery.trim()) return;

		const result = await analysisStore.executeQuery(sqlQuery);
		if (result) {
			queryResult = result;
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
</script>

<svelte:head>
	<title>Analyze Data - ODDOL</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-gray-900 mb-2">Analyze Data</h1>
		<p class="text-gray-600">
			Process data in-browser with SQL using DuckDB-WASM. No data leaves your browser.
		</p>
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
						<input type="file" accept=".csv,.json" class="hidden" />
						Upload File
					</label>
					<button class="btn btn-outline text-sm">
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
						placeholder="SELECT * FROM table_name LIMIT 100"
						rows="4"
						class="w-full bg-transparent text-green-400 font-mono focus:outline-none"
					/>
				</div>
				<div class="mt-2 text-xs text-gray-500">
					Press Ctrl+Enter to run query
				</div>
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
						<label class="block text-sm font-medium text-gray-700 mb-1">Chart Type</label>
						<select bind:value={selectedChartType} class="input">
							<option value="line">Line Chart</option>
							<option value="bar">Bar Chart</option>
							<option value="scatter">Scatter Plot</option>
							<option value="histogram">Histogram</option>
							<option value="area">Area Chart</option>
						</select>
					</div>

					<!-- X Column -->
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">X Axis</label>
						<select bind:value={chartXColumn} class="input">
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
						<label class="block text-sm font-medium text-gray-700 mb-1">Y Axis</label>
						<select bind:value={chartYColumn} class="input">
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
