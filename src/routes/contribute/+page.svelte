<script lang="ts">
	import type { DatasetContribution, ValidationResult } from '$lib/types';

	let contribution: DatasetContribution = {
		labels: { en: '' },
		descriptions: { en: '' },
		topics: [],
		doi: '',
		url: '',
		license: '',
		publisher: ''
	};

	let newTopic = '';
	let validationResult: ValidationResult | null = null;
	let quickStatements = '';
	let showPreview = false;

	const licenseOptions = [
		{ qid: 'Q20007257', name: 'CC BY 4.0' },
		{ qid: 'Q6905323', name: 'CC BY-SA 4.0' },
		{ qid: 'Q6938433', name: 'CC0 1.0 Universal' },
		{ qid: 'Q334661', name: 'MIT License' },
		{ qid: 'Q10513445', name: 'Apache License 2.0' },
		{ qid: 'Q7603', name: 'GNU GPL v3' }
	];

	const commonTopics = [
		{ qid: 'Q7942', name: 'Climate change' },
		{ qid: 'Q11190', name: 'Medicine' },
		{ qid: 'Q8054', name: 'Protein' },
		{ qid: 'Q11660', name: 'Artificial intelligence' },
		{ qid: 'Q5058355', name: 'Biodiversity' },
		{ qid: 'Q3236990', name: 'Economics' }
	];

	function addTopic(qid: string) {
		if (!contribution.topics.includes(qid)) {
			contribution.topics = [...contribution.topics, qid];
		}
	}

	function removeTopic(qid: string) {
		contribution.topics = contribution.topics.filter((t) => t !== qid);
	}

	function validate(): ValidationResult {
		const errors = [];
		const warnings = [];

		if (!contribution.labels.en?.trim()) {
			errors.push({ field: 'labels.en', message: 'English title is required' });
		}
		if (!contribution.descriptions.en?.trim()) {
			errors.push({ field: 'descriptions.en', message: 'English description is required' });
		}
		if (!contribution.license) {
			errors.push({ field: 'license', message: 'License is required' });
		}
		if (contribution.topics.length === 0) {
			warnings.push({ field: 'topics', message: 'Consider adding at least one topic' });
		}
		if (!contribution.doi && !contribution.url) {
			warnings.push({ field: 'doi', message: 'DOI or URL recommended for accessibility' });
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings
		};
	}

	function generateQuickStatements(): string {
		const lines: string[] = [];

		// Create new item
		lines.push('CREATE');

		// Labels
		for (const [lang, label] of Object.entries(contribution.labels)) {
			if (label) {
				lines.push(`LAST\tL${lang}\t"${escapeQS(label)}"`);
			}
		}

		// Descriptions
		for (const [lang, desc] of Object.entries(contribution.descriptions)) {
			if (desc) {
				lines.push(`LAST\tD${lang}\t"${escapeQS(desc)}"`);
			}
		}

		// Instance of dataset
		lines.push('LAST\tP31\tQ1172284');

		// Properties
		if (contribution.doi) {
			lines.push(`LAST\tP356\t"${contribution.doi}"`);
		}
		if (contribution.url) {
			lines.push(`LAST\tP856\t"${contribution.url}"`);
		}
		if (contribution.license) {
			lines.push(`LAST\tP275\t${contribution.license}`);
		}
		if (contribution.publisher) {
			lines.push(`LAST\tP123\t${contribution.publisher}`);
		}

		// Topics
		for (const topic of contribution.topics) {
			lines.push(`LAST\tP921\t${topic}`);
		}

		return lines.join('\n');
	}

	function escapeQS(str: string): string {
		return str.replace(/"/g, '\\"').replace(/\n/g, ' ');
	}

	function handleValidate() {
		validationResult = validate();
	}

	function handlePreview() {
		handleValidate();
		if (validationResult?.valid) {
			quickStatements = generateQuickStatements();
			showPreview = true;
		}
	}

	function copyQuickStatements() {
		navigator.clipboard.writeText(quickStatements);
	}
</script>

<svelte:head>
	<title>Contribute Dataset - ODDOL</title>
</svelte:head>

<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-gray-900 mb-2">Contribute to Wikidata</h1>
		<p class="text-gray-600">
			Add a new dataset to Wikidata. Your contribution will be validated against EntitySchema:E207.
		</p>
	</div>

	{#if !showPreview}
		<div class="space-y-6">
			<!-- Basic Information -->
			<div class="card p-6">
				<h2 class="font-semibold text-gray-900 mb-4">Basic Information</h2>

				<div class="space-y-4">
					<!-- Title (English) -->
					<div>
						<label for="title-en" class="block text-sm font-medium text-gray-700 mb-1">
							Title (English) *
						</label>
						<input
							type="text"
							id="title-en"
							bind:value={contribution.labels.en}
							placeholder="e.g., Global Temperature Anomaly Dataset"
							class="input"
						/>
					</div>

					<!-- Description (English) -->
					<div>
						<label for="desc-en" class="block text-sm font-medium text-gray-700 mb-1">
							Description (English) *
						</label>
						<textarea
							id="desc-en"
							bind:value={contribution.descriptions.en}
							placeholder="Brief description of the dataset (max 250 characters)"
							rows="2"
							maxlength="250"
							class="input"
						/>
						<p class="text-xs text-gray-500 mt-1">
							{contribution.descriptions.en?.length || 0}/250 characters
						</p>
					</div>
				</div>
			</div>

			<!-- Identifiers -->
			<div class="card p-6">
				<h2 class="font-semibold text-gray-900 mb-4">Identifiers</h2>

				<div class="grid md:grid-cols-2 gap-4">
					<div>
						<label for="doi" class="block text-sm font-medium text-gray-700 mb-1">
							DOI
						</label>
						<input
							type="text"
							id="doi"
							bind:value={contribution.doi}
							placeholder="10.1234/example"
							class="input"
						/>
					</div>

					<div>
						<label for="url" class="block text-sm font-medium text-gray-700 mb-1">
							URL
						</label>
						<input
							type="url"
							id="url"
							bind:value={contribution.url}
							placeholder="https://example.org/dataset"
							class="input"
						/>
					</div>
				</div>
			</div>

			<!-- License -->
			<div class="card p-6">
				<h2 class="font-semibold text-gray-900 mb-4">License *</h2>

				<div class="grid grid-cols-2 md:grid-cols-3 gap-2">
					{#each licenseOptions as license}
						<label
							class="flex items-center p-3 border rounded-lg cursor-pointer transition-colors
								{contribution.license === license.qid
								? 'border-primary-500 bg-primary-50'
								: 'border-gray-200 hover:border-gray-300'}"
						>
							<input
								type="radio"
								bind:group={contribution.license}
								value={license.qid}
								class="sr-only"
							/>
							<span class="text-sm">{license.name}</span>
						</label>
					{/each}
				</div>
			</div>

			<!-- Topics -->
			<div class="card p-6">
				<h2 class="font-semibold text-gray-900 mb-4">Topics</h2>

				<div class="mb-4">
					<p class="text-sm text-gray-600 mb-2">Select relevant topics:</p>
					<div class="flex flex-wrap gap-2">
						{#each commonTopics as topic}
							<button
								on:click={() => addTopic(topic.qid)}
								class="badge {contribution.topics.includes(topic.qid)
									? 'badge-primary'
									: 'badge-secondary'} cursor-pointer"
							>
								{topic.name}
								{#if contribution.topics.includes(topic.qid)}
									<svg class="w-3 h-3 ml-1" fill="currentColor" viewBox="0 0 20 20">
										<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
									</svg>
								{/if}
							</button>
						{/each}
					</div>
				</div>

				{#if contribution.topics.length > 0}
					<div class="pt-4 border-t border-gray-200">
						<p class="text-sm text-gray-600 mb-2">Selected topics:</p>
						<div class="flex flex-wrap gap-2">
							{#each contribution.topics as topicQid}
								{@const topic = commonTopics.find((t) => t.qid === topicQid)}
								<span class="badge badge-primary">
									{topic?.name || topicQid}
									<button on:click={() => removeTopic(topicQid)} class="ml-1">
										<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</span>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Validation Results -->
			{#if validationResult}
				<div class="card p-6 {validationResult.valid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}">
					<h3 class="font-semibold {validationResult.valid ? 'text-green-900' : 'text-red-900'} mb-2">
						{validationResult.valid ? 'Validation Passed' : 'Validation Failed'}
					</h3>

					{#if validationResult.errors.length > 0}
						<ul class="list-disc list-inside text-sm text-red-700 mb-2">
							{#each validationResult.errors as error}
								<li>{error.message}</li>
							{/each}
						</ul>
					{/if}

					{#if validationResult.warnings.length > 0}
						<ul class="list-disc list-inside text-sm text-yellow-700">
							{#each validationResult.warnings as warning}
								<li>{warning.message}</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex gap-4">
				<button on:click={handleValidate} class="btn btn-outline">
					Validate
				</button>
				<button on:click={handlePreview} class="btn btn-primary">
					Preview QuickStatements
				</button>
			</div>
		</div>
	{:else}
		<!-- QuickStatements Preview -->
		<div class="space-y-6">
			<div class="card p-6">
				<div class="flex items-center justify-between mb-4">
					<h2 class="font-semibold text-gray-900">QuickStatements Preview</h2>
					<button on:click={copyQuickStatements} class="btn btn-outline text-sm">
						Copy to Clipboard
					</button>
				</div>

				<pre class="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm font-mono">{quickStatements}</pre>
			</div>

			<div class="card p-6 bg-blue-50 border-blue-200">
				<h3 class="font-semibold text-blue-900 mb-2">How to Submit</h3>
				<ol class="list-decimal list-inside text-sm text-blue-700 space-y-2">
					<li>Copy the QuickStatements above</li>
					<li>
						Go to <a
							href="https://quickstatements.toolforge.org/"
							target="_blank"
							rel="noopener"
							class="underline hover:text-blue-900"
						>QuickStatements</a>
					</li>
					<li>Log in with your Wikidata account</li>
					<li>Paste the statements and submit</li>
				</ol>
			</div>

			<div class="flex gap-4">
				<button on:click={() => (showPreview = false)} class="btn btn-outline">
					Back to Edit
				</button>
				<a
					href="https://quickstatements.toolforge.org/"
					target="_blank"
					rel="noopener"
					class="btn btn-primary"
				>
					Open QuickStatements
				</a>
			</div>
		</div>
	{/if}
</div>
