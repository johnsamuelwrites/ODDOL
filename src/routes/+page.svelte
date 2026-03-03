<script lang="ts">
	type Platform = 'Desktop' | 'Web' | 'Mobile';

	type Application = {
		name: string;
		platform: Platform;
		category: string;
		stack: string;
		status: 'Production' | 'Beta' | 'Planned';
	};

	const applications: Application[] = [
		{
			name: 'ODDOL Workbench',
			platform: 'Desktop',
			category: 'Data Analysis',
			stack: 'Tauri + DuckDB',
			status: 'Production'
		},
		{
			name: 'ODDOL Studio',
			platform: 'Desktop',
			category: 'Knowledge Graph Modeling',
			stack: 'Electron + Svelte',
			status: 'Beta'
		},
		{
			name: 'ODDOL Search',
			platform: 'Web',
			category: 'Federated Discovery',
			stack: 'SvelteKit + SPARQL',
			status: 'Production'
		},
		{
			name: 'ODDOL Describe',
			platform: 'Web',
			category: 'Metadata Authoring',
			stack: 'SvelteKit + Markdown',
			status: 'Production'
		},
		{
			name: 'ODDOL Analyze',
			platform: 'Web',
			category: 'In-Browser Analytics',
			stack: 'DuckDB-WASM + Plot',
			status: 'Beta'
		},
		{
			name: 'ODDOL Pocket',
			platform: 'Mobile',
			category: 'Field Data Capture',
			stack: 'Flutter + Offline Cache',
			status: 'Planned'
		},
		{
			name: 'ODDOL Link',
			platform: 'Mobile',
			category: 'Knowledge Retrieval',
			stack: 'React Native + OpenAlex',
			status: 'Beta'
		}
	];

	const platformOrder: Platform[] = ['Desktop', 'Web', 'Mobile'];

	function byPlatform(platform: Platform): Application[] {
		return applications.filter((app) => app.platform === platform);
	}
</script>

<svelte:head>
	<title>ODDOL Applications</title>
</svelte:head>

<section class="future-shell">
	<div class="future-noise"></div>

	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
		<div class="text-center max-w-3xl mx-auto mb-12">
			<p class="tracking-[0.2em] uppercase text-xs sm:text-sm text-cyan-300 mb-3">Application Matrix</p>
			<h1 class="future-title text-4xl sm:text-5xl lg:text-6xl mb-4">
				ODDOL Platform Ecosystem
			</h1>
			<p class="text-slate-300 text-base sm:text-lg">
				A unified index of desktop, web, and mobile applications powering open-data workflows.
			</p>
		</div>

		<div class="grid gap-6 md:grid-cols-3 mb-10">
			{#each platformOrder as platform}
				<div class="future-panel p-5">
					<p class="text-xs uppercase tracking-[0.15em] text-cyan-300">{platform}</p>
					<p class="text-3xl font-semibold text-white mt-2">{byPlatform(platform).length}</p>
					<p class="text-sm text-slate-400 mt-1">applications</p>
				</div>
			{/each}
		</div>

		{#each platformOrder as platform}
			<div class="mb-10">
				<h2 class="text-2xl sm:text-3xl text-white mb-4">{platform}</h2>
				<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{#each byPlatform(platform) as app}
						<article class="future-card p-5">
							<div class="flex items-start justify-between gap-3">
								<h3 class="text-lg text-white font-semibold">{app.name}</h3>
								<span class="status-pill status-{app.status.toLowerCase()}">{app.status}</span>
							</div>
							<p class="text-slate-300 mt-4 text-sm">{app.category}</p>
							<div class="mt-4 text-xs text-cyan-200 uppercase tracking-[0.12em]">{app.stack}</div>
						</article>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</section>
