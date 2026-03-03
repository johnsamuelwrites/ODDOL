<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { base } from '$app/paths';

	const navItems = [
		{ href: '/', label: 'Search', icon: 'search' },
		{ href: '/analyze', label: 'Analyze', icon: 'analytics' },
		{ href: '/describe', label: 'Describe', icon: 'description' },
		{ href: '/contribute', label: 'Contribute', icon: 'group' }
	];

	$: currentPath = $page.url.pathname;
	$: normalizedPath = currentPath.startsWith(base) ? currentPath.slice(base.length) || '/' : currentPath;

	function appHref(path: string): string {
		return path === '/' ? `${base}/` : `${base}${path}`;
	}
</script>

<div class="min-h-screen flex flex-col">
	<!-- Header -->
	<header class="bg-primary-600 text-white shadow-lg">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-between h-16">
				<!-- Logo -->
				<a href={appHref('/')} class="flex items-center space-x-3">
					<svg class="w-8 h-8" viewBox="0 0 32 32" fill="currentColor">
						<circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="2" />
						<circle cx="16" cy="16" r="8" fill="currentColor" opacity="0.3" />
						<circle cx="16" cy="16" r="4" fill="currentColor" />
					</svg>
					<span class="text-xl font-bold">ODDOL</span>
				</a>

				<!-- Navigation -->
				<nav class="hidden md:flex items-center space-x-1">
					{#each navItems as item}
						<a
							href={appHref(item.href)}
							class="px-4 py-2 rounded-lg text-sm font-medium transition-colors
								{normalizedPath === item.href
								? 'bg-white/20 text-white'
								: 'text-white/80 hover:text-white hover:bg-white/10'}"
						>
							{item.label}
						</a>
					{/each}
				</nav>

				<!-- Actions -->
				<div class="flex items-center space-x-2">
					<a
						href="https://github.com/johnsamuelwrites/ODDOL"
						target="_blank"
						rel="noopener noreferrer"
						class="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
						aria-label="GitHub"
					>
						<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
							<path
								d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"
							/>
						</svg>
					</a>
				</div>
			</div>
		</div>

		<!-- Mobile Navigation -->
		<nav class="md:hidden border-t border-white/20">
			<div class="flex justify-around">
				{#each navItems as item}
					<a
						href={appHref(item.href)}
						class="flex-1 py-3 text-center text-sm font-medium transition-colors
							{normalizedPath === item.href
							? 'bg-white/20 text-white'
							: 'text-white/80 hover:text-white'}"
					>
						{item.label}
					</a>
				{/each}
			</div>
		</nav>
	</header>

	<!-- Main Content -->
	<main class="flex-1">
		<slot />
	</main>

	<!-- Footer -->
	<footer class="bg-gray-800 text-gray-400 py-8">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex flex-col md:flex-row items-center justify-between">
				<div class="text-center md:text-left mb-4 md:mb-0">
					<p class="text-sm">
						ODDOL - Open Data Driven Online Learning
					</p>
					<p class="text-xs mt-1">
						Real-time federated queries to Wikidata, OpenAlex, Zenodo, and more.
					</p>
				</div>
				<div class="flex items-center space-x-6 text-sm">
					<a href="https://www.wikidata.org" target="_blank" rel="noopener" class="hover:text-white transition-colors">
						Wikidata
					</a>
					<a href="https://openalex.org" target="_blank" rel="noopener" class="hover:text-white transition-colors">
						OpenAlex
					</a>
					<a href="https://zenodo.org" target="_blank" rel="noopener" class="hover:text-white transition-colors">
						Zenodo
					</a>
					<a href="https://datacite.org" target="_blank" rel="noopener" class="hover:text-white transition-colors">
						DataCite
					</a>
				</div>
			</div>
			<div class="mt-6 pt-6 border-t border-gray-700 text-center text-xs">
				<p>Licensed under GPL-3.0 | No ODDOL server-side storage | Real-time federated queries</p>
			</div>
		</div>
	</footer>
</div>
