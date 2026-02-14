<script lang="ts">
	import type { UnifiedEntity } from '$lib/types';

	export let entity: UnifiedEntity;
	export let searchQuery = '';

	function getTypeIcon(type: string): string {
		switch (type) {
			case 'dataset':
				return 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4';
			case 'publication':
				return 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253';
			case 'software':
				return 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4';
			default:
				return 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10';
		}
	}

	function getTypeColor(type: string): string {
		switch (type) {
			case 'dataset':
				return 'bg-green-100 text-green-800';
			case 'publication':
				return 'bg-blue-100 text-blue-800';
			case 'software':
				return 'bg-purple-100 text-purple-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	function getSourceBadge(sourceId: string): { color: string; label: string } {
		switch (sourceId) {
			case 'wikidata':
				return { color: 'bg-red-100 text-red-800', label: 'Wikidata' };
			case 'openalex':
				return { color: 'bg-blue-100 text-blue-800', label: 'OpenAlex' };
			case 'zenodo':
				return { color: 'bg-yellow-100 text-yellow-800', label: 'Zenodo' };
			case 'datacite':
				return { color: 'bg-indigo-100 text-indigo-800', label: 'DataCite' };
			default:
				return { color: 'bg-gray-100 text-gray-800', label: sourceId };
		}
	}

	function formatDate(dateStr?: string): string {
		if (!dateStr) return '';
		try {
			const date = new Date(dateStr);
			return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
		} catch {
			return dateStr;
		}
	}

	function getAnalyzeHref(): string {
		const params = new URLSearchParams();
		params.set('id', entity.id);

		if (searchQuery.trim()) {
			params.set('q', searchQuery.trim());
		}

		params.set('title', entity.title);
		if (entity.identifiers.doi) {
			params.set('doi', entity.identifiers.doi);
		}

		const sourceIds = entity.sources.map((s) => s.sourceId).join(',');
		if (sourceIds) {
			params.set('sources', sourceIds);
		}

		return `/analyze?${params.toString()}`;
	}
</script>

<div class="result-card animate-fade-in">
	<!-- Header -->
	<div class="flex items-start justify-between mb-2">
		<span class="badge {getTypeColor(entity.type)}">
			{entity.type}
		</span>
		<div class="flex gap-1">
			{#each entity.sources as source}
				{@const badge = getSourceBadge(source.sourceId)}
				<span class="badge {badge.color} text-xs">
					{badge.label}
				</span>
			{/each}
		</div>
	</div>

	<!-- Title -->
	<h3 class="font-semibold text-gray-900 mb-2 line-clamp-2">
		{entity.title}
	</h3>

	<!-- Description -->
	{#if entity.description}
		<p class="text-sm text-gray-600 truncate-2 mb-3">
			{entity.description}
		</p>
	{/if}

	<!-- Metadata -->
	<div class="flex flex-wrap gap-2 text-xs text-gray-500">
		{#if entity.identifiers.doi}
			<a
				href="https://doi.org/{entity.identifiers.doi}"
				target="_blank"
				rel="noopener"
				class="inline-flex items-center hover:text-primary-600"
			>
				<svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
					<path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
					<path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
				</svg>
				DOI
			</a>
		{/if}

		{#if entity.license}
			<span class="inline-flex items-center">
				<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
				</svg>
				{entity.license.name}
			</span>
		{/if}

		{#if entity.created}
			<span class="inline-flex items-center">
				<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
				</svg>
				{formatDate(entity.created)}
			</span>
		{/if}

		{#if entity.publisher}
			<span class="inline-flex items-center">
				<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
				</svg>
				{entity.publisher.name}
			</span>
		{/if}
	</div>

	<!-- Actions -->
	<div class="flex gap-2 mt-4 pt-4 border-t border-gray-100">
		<a
			href={getAnalyzeHref()}
			class="btn btn-primary text-sm py-1 px-3"
		>
			Analyze
		</a>
		{#if entity.url}
			<a
				href={entity.url}
				target="_blank"
				rel="noopener"
				class="btn btn-outline text-sm py-1 px-3"
			>
				View Source
			</a>
		{/if}
	</div>
</div>
