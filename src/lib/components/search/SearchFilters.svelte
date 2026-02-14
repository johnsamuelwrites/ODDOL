<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { SearchFilters } from '$lib/stores/search';

	export let filters: SearchFilters = {};

	const dispatch = createEventDispatcher<{ change: SearchFilters }>();

	function handleChange() {
		dispatch('change', filters);
	}

	const licenseOptions = [
		{ value: '', label: 'Any license' },
		{ value: 'Q20007257', label: 'CC BY 4.0' },
		{ value: 'Q6905323', label: 'CC BY-SA 4.0' },
		{ value: 'Q6938433', label: 'CC0 1.0' },
		{ value: 'Q334661', label: 'MIT License' },
		{ value: 'Q7603', label: 'GNU GPL' }
	];

	const currentYear = new Date().getFullYear();
	const yearOptions = Array.from({ length: 30 }, (_, i) => currentYear - i);
</script>

<div class="card p-4">
	<h3 class="font-semibold text-gray-900 mb-4">Filters</h3>

	<div class="space-y-4">
		<!-- License -->
		<div>
			<label for="license" class="block text-sm font-medium text-gray-700 mb-1">
				License
			</label>
			<select
				id="license"
				bind:value={filters.license}
				on:change={handleChange}
				class="input"
			>
				{#each licenseOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>

		<!-- Year Range -->
		<div>
			<label class="block text-sm font-medium text-gray-700 mb-1">
				Year Range
			</label>
			<div class="flex gap-2">
				<select
					bind:value={filters.yearFrom}
					on:change={handleChange}
					class="input"
				>
					<option value="">From</option>
					{#each yearOptions as year}
						<option value={year}>{year}</option>
					{/each}
				</select>
				<select
					bind:value={filters.yearTo}
					on:change={handleChange}
					class="input"
				>
					<option value="">To</option>
					{#each yearOptions as year}
						<option value={year}>{year}</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- Open Access -->
		<div>
			<label class="flex items-center">
				<input
					type="checkbox"
					bind:checked={filters.openAccess}
					on:change={handleChange}
					class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
				/>
				<span class="ml-2 text-sm text-gray-700">Open Access only</span>
			</label>
		</div>

		<!-- Clear Filters -->
		<button
			on:click={() => {
				filters = {};
				handleChange();
			}}
			class="btn btn-outline w-full text-sm"
		>
			Clear Filters
		</button>
	</div>
</div>
