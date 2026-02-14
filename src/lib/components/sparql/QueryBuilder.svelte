<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		SparqlQueryBuilder,
		COMMON_PROPERTIES,
		COMMON_TYPES,
		validateSparqlQuery,
		type QueryProperty
	} from '$lib/sparql/query-builder';

	const dispatch = createEventDispatcher<{ query: string }>();

	let selectedType = 'Q1172284'; // Dataset by default
	let properties: QueryProperty[] = [];
	let limit = 50;
	let generatedQuery = '';

	function addProperty() {
		const id = `prop_${Date.now()}`;
		properties = [
			...properties,
			{
				id,
				property: 'P921',
				propertyLabel: 'main subject',
				valueType: 'variable',
				optional: true
			}
		];
	}

	function removeProperty(id: string) {
		properties = properties.filter((p) => p.id !== id);
	}

	function generateQuery() {
		const builder = new SparqlQueryBuilder()
			.setMainType(selectedType, getTypeLabel(selectedType))
			.setLimit(limit);

		for (const prop of properties) {
			builder.addProperty(prop);

			// Add label field for entity values
			if (prop.valueType === 'variable') {
				builder.addReturnField(prop.value || prop.property.toLowerCase());
				builder.addReturnField(`${prop.value || prop.property.toLowerCase()}Label`);
			}
		}

		generatedQuery = builder.build();
	}

	function runQuery() {
		generateQuery();
		const validation = validateSparqlQuery(generatedQuery);
		if (validation.valid) {
			dispatch('query', generatedQuery);
		}
	}

	function getTypeLabel(qid: string): string {
		return COMMON_TYPES.find((t) => t.qid === qid)?.label || qid;
	}

	function getPropertyLabel(pid: string): string {
		return COMMON_PROPERTIES.find((p) => p.pid === pid)?.label || pid;
	}

	// Generate query when config changes
	$: if (selectedType || properties.length >= 0 || limit) {
		generateQuery();
	}
</script>

<div class="space-y-6">
	<!-- Entity Type Selection -->
	<div class="card p-4">
		<h3 class="font-semibold text-gray-900 mb-3">Find</h3>
		<select bind:value={selectedType} class="input">
			{#each COMMON_TYPES as type}
				<option value={type.qid}>{type.label}</option>
			{/each}
		</select>
	</div>

	<!-- Properties -->
	<div class="card p-4">
		<div class="flex items-center justify-between mb-3">
			<h3 class="font-semibold text-gray-900">Where</h3>
			<button on:click={addProperty} class="btn btn-outline text-sm">
				+ Add Condition
			</button>
		</div>

		{#if properties.length === 0}
			<p class="text-sm text-gray-500">No conditions added. Click "Add Condition" to filter results.</p>
		{:else}
			<div class="space-y-3">
				{#each properties as prop (prop.id)}
					<div class="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
						<div class="flex-1 grid grid-cols-3 gap-2">
							<!-- Property -->
							<select
								bind:value={prop.property}
								on:change={() => (prop.propertyLabel = getPropertyLabel(prop.property))}
								class="input text-sm"
							>
								{#each COMMON_PROPERTIES as p}
									<option value={p.pid}>{p.label}</option>
								{/each}
							</select>

							<!-- Value Type -->
							<select bind:value={prop.valueType} class="input text-sm">
								<option value="variable">Any value</option>
								<option value="entity">Specific entity</option>
								<option value="literal">Text value</option>
							</select>

							<!-- Value -->
							{#if prop.valueType !== 'variable'}
								<input
									type="text"
									bind:value={prop.value}
									placeholder={prop.valueType === 'entity' ? 'Q12345' : 'value'}
									class="input text-sm"
								/>
							{:else}
								<div class="flex items-center text-sm text-gray-500">
									(returns all values)
								</div>
							{/if}
						</div>

						<!-- Optional Toggle -->
						<label class="flex items-center text-sm">
							<input
								type="checkbox"
								bind:checked={prop.optional}
								class="rounded border-gray-300 text-primary-600 mr-1"
							/>
							Optional
						</label>

						<!-- Remove -->
						<button
							on:click={() => removeProperty(prop.id)}
							class="text-gray-400 hover:text-red-500"
						>
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Options -->
	<div class="card p-4">
		<h3 class="font-semibold text-gray-900 mb-3">Options</h3>
		<div class="flex items-center gap-4">
			<label class="flex items-center">
				<span class="text-sm text-gray-700 mr-2">Limit:</span>
				<input
					type="number"
					bind:value={limit}
					min="1"
					max="1000"
					class="input w-24 text-sm"
				/>
			</label>
		</div>
	</div>

	<!-- Generated SPARQL -->
	<div class="card p-4">
		<div class="flex items-center justify-between mb-3">
			<h3 class="font-semibold text-gray-900">Generated SPARQL</h3>
			<button
				on:click={() => navigator.clipboard.writeText(generatedQuery)}
				class="btn btn-outline text-sm"
			>
				Copy
			</button>
		</div>
		<pre class="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap">{generatedQuery}</pre>
	</div>

	<!-- Run Query -->
	<div class="flex justify-end">
		<button on:click={runQuery} class="btn btn-primary">
			Run Query
		</button>
	</div>
</div>
