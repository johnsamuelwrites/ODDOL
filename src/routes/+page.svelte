<script lang="ts">
	import { searchStore, searchResults, isSearching, searchError } from '$lib/stores/search';
	import type { EntityType } from '$lib/types';
	import ResultCard from '$lib/components/search/ResultCard.svelte';
	import SearchFilters from '$lib/components/search/SearchFilters.svelte';

	let searchQuery = '';

	const entityTypeOptions: { value: EntityType; label: string }[] = [
		{ value: 'dataset', label: 'Datasets' },
		{ value: 'publication', label: 'Publications' },
		{ value: 'software', label: 'Software' }
	];

	const sourceOptions = [
		{ value: 'wikidata', label: 'Wikidata' },
		{ value: 'openalex', label: 'OpenAlex' },
		{ value: 'zenodo', label: 'Zenodo' },
		{ value: 'datacite', label: 'DataCite' }
	];

	let selectedTypes: EntityType[] = ['dataset'];
	let selectedSources: string[] = ['wikidata', 'openalex', 'zenodo', 'datacite'];

	async function handleSearch() {
		if (!searchQuery.trim()) return;

		searchStore.setQuery(searchQuery);
		searchStore.setEntityTypes(selectedTypes);
		searchStore.setSources(selectedSources);
		await searchStore.search();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleSearch();
		}
	}
</script>

<svelte:head>
	<title>ODDOL - Search Open Datasets</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<!-- Hero Section -->
	<div class="text-center mb-12">
		<h1 class="text-4xl font-bold text-gray-900 mb-4">
			Open Data Driven Online Learning
		</h1>
		<p class="text-lg text-gray-600 max-w-2xl mx-auto">
			Search, analyze, describe, and contribute to open datasets from Wikidata, OpenAlex, Zenodo, and more.
			All queries are real-time - no data is stored.
		</p>
	</div>

	<!-- Search Box -->
	<div class="max-w-3xl mx-auto mb-8">
		<div class="relative">
			<input
				type="text"
				bind:value={searchQuery}
				on:keydown={handleKeydown}
				placeholder="Search datasets, publications, software..."
				class="input pl-12 pr-4 py-4 text-lg"
			/>
			<svg
				class="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
		</div>

		<!-- Quick Filters -->
		<div class="flex flex-wrap items-center justify-center gap-4 mt-4">
			<!-- Entity Types -->
			<div class="flex items-center gap-2">
				<span class="text-sm text-gray-600">Type:</span>
				{#each entityTypeOptions as option}
					<label class="inline-flex items-center">
						<input
							type="checkbox"
							bind:group={selectedTypes}
							value={option.value}
							class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
						/>
						<span class="ml-1 text-sm text-gray-700">{option.label}</span>
					</label>
				{/each}
			</div>

			<!-- Sources -->
			<div class="flex items-center gap-2">
				<span class="text-sm text-gray-600">Sources:</span>
				{#each sourceOptions as option}
					<label class="inline-flex items-center">
						<input
							type="checkbox"
							bind:group={selectedSources}
							value={option.value}
							class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
						/>
						<span class="ml-1 text-sm text-gray-700">{option.label}</span>
					</label>
				{/each}
			</div>
		</div>

		<!-- Search Button -->
		<div class="flex justify-center mt-6">
			<button
				on:click={handleSearch}
				disabled={$isSearching || !searchQuery.trim()}
				class="btn btn-primary px-8 py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{#if $isSearching}
					<svg class="animate-spin -ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
					</svg>
					Searching...
				{:else}
					Search
				{/if}
			</button>
		</div>
	</div>

	<!-- Error Message -->
	{#if $searchError}
		<div class="max-w-3xl mx-auto mb-8">
			<div class="bg-red-50 border border-red-200 rounded-lg p-4">
				<div class="flex">
					<svg class="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
					</svg>
					<p class="ml-3 text-sm text-red-700">{$searchError}</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Results -->
	{#if $searchResults.length > 0}
		<div class="mb-4 text-sm text-gray-600">
			Found {$searchResults.length} results
		</div>

		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each $searchResults as entity (entity.id)}
				<ResultCard {entity} searchQuery={searchQuery} />
			{/each}
		</div>

		<!-- Load More -->
		{#if searchStore}
			<div class="flex justify-center mt-8">
				<button
					on:click={() => searchStore.loadMore()}
					disabled={$isSearching}
					class="btn btn-outline"
				>
					Load more results
				</button>
			</div>
		{/if}
	{:else if !$isSearching && $searchStore.query.trim()}
		<div class="text-center text-gray-500 py-12">
			<svg class="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<p>No results found. Try different keywords or filters.</p>
		</div>
	{/if}

	<!-- Feature Cards (when no search) -->
	{#if !searchQuery && $searchResults.length === 0}
		<div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
			<div class="card p-6 text-center">
				<div class="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
					<svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
					</svg>
				</div>
				<h3 class="font-semibold text-gray-900 mb-2">Search</h3>
				<p class="text-sm text-gray-600">
					Find open datasets across Wikidata, OpenAlex, Zenodo, and DataCite
				</p>
			</div>

			<div class="card p-6 text-center">
				<div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
					<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
					</svg>
				</div>
				<h3 class="font-semibold text-gray-900 mb-2">Analyze</h3>
				<p class="text-sm text-gray-600">
					Process data in-browser with SQL using DuckDB-WASM
				</p>
			</div>

			<div class="card p-6 text-center">
				<div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
					<svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
				</div>
				<h3 class="font-semibold text-gray-900 mb-2">Describe</h3>
				<p class="text-sm text-gray-600">
					Document your analysis methods and data sources
				</p>
			</div>

			<div class="card p-6 text-center">
				<div class="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-4">
					<svg class="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
					</svg>
				</div>
				<h3 class="font-semibold text-gray-900 mb-2">Contribute</h3>
				<p class="text-sm text-gray-600">
					Add new datasets to Wikidata directly from the platform
				</p>
			</div>
		</div>

		<!-- Data Sources Info -->
		<div class="mt-16">
			<h2 class="text-2xl font-bold text-gray-900 text-center mb-8">
				Federated Open Data Sources
			</h2>
			<div class="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
				<a href="https://www.wikidata.org" target="_blank" rel="noopener" class="card card-hover p-4">
					<h3 class="font-semibold text-gray-900">Wikidata</h3>
					<p class="text-sm text-gray-600 mt-1">
						Free knowledge base with 100M+ items
					</p>
					<span class="badge badge-primary mt-2">SPARQL</span>
				</a>

				<a href="https://openalex.org" target="_blank" rel="noopener" class="card card-hover p-4">
					<h3 class="font-semibold text-gray-900">OpenAlex</h3>
					<p class="text-sm text-gray-600 mt-1">
						250M+ scholarly works and citations
					</p>
					<span class="badge badge-primary mt-2">REST API</span>
				</a>

				<a href="https://zenodo.org" target="_blank" rel="noopener" class="card card-hover p-4">
					<h3 class="font-semibold text-gray-900">Zenodo</h3>
					<p class="text-sm text-gray-600 mt-1">
						3M+ research outputs with DOIs
					</p>
					<span class="badge badge-primary mt-2">REST API</span>
				</a>

				<a href="https://datacite.org" target="_blank" rel="noopener" class="card card-hover p-4">
					<h3 class="font-semibold text-gray-900">DataCite</h3>
					<p class="text-sm text-gray-600 mt-1">
						50M+ DOI metadata records
					</p>
					<span class="badge badge-primary mt-2">REST API</span>
				</a>
			</div>
		</div>
	{/if}
</div>
