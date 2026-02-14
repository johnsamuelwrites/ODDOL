/**
 * Wikidata SPARQL Client
 * Real-time queries to Wikidata's SPARQL endpoint
 */

import type {
	DataSource,
	EntityType,
	SparqlResult,
	UnifiedEntity,
	QueryFilter
} from '$lib/types';
import type { SourceClient, SourceQuery, SourceResult } from './types';
import { DATA_SOURCES } from './types';

// ============================================================================
// Wikidata Client Implementation
// ============================================================================

export class WikidataClient implements SourceClient {
	readonly sourceId = 'wikidata';
	readonly config: DataSource;
	private readonly endpoint: string;
	private readonly userAgent = 'ODDOL/2.0 (https://github.com/johnsamuelwrites/ODDOL)';

	constructor() {
		this.config = DATA_SOURCES.find((s) => s.id === 'wikidata')!;
		this.endpoint = this.config.baseUrl;
	}

	async search(query: SourceQuery): Promise<SourceResult> {
		const startTime = performance.now();

		const sparql = this.buildSearchQuery(query);
		const result = await this.executeSparql(sparql);

		const items = result.results.bindings.map((binding) =>
			this.bindingToEntity(binding, query.entityTypes[0] || 'dataset')
		);

		return {
			items,
			totalCount: items.length,
			hasMore: items.length === query.pagination.limit,
			queryTime: performance.now() - startTime
		};
	}

	async getEntity(qid: string): Promise<UnifiedEntity | null> {
		const sparql = `
			SELECT ?item ?itemLabel ?itemDescription ?doi ?license ?licenseLabel ?url ?date
			WHERE {
				BIND(wd:${qid} AS ?item)
				OPTIONAL { ?item wdt:P356 ?doi . }
				OPTIONAL { ?item wdt:P275 ?license . }
				OPTIONAL { ?item wdt:P856 ?url . }
				OPTIONAL { ?item wdt:P577 ?date . }
				SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es" . }
			}
			LIMIT 1
		`;

		const result = await this.executeSparql(sparql);

		if (result.results.bindings.length === 0) {
			return null;
		}

		return this.bindingToEntity(result.results.bindings[0], 'dataset');
	}

	async isAvailable(): Promise<boolean> {
		try {
			const response = await fetch(this.endpoint, {
				method: 'HEAD',
				headers: { 'User-Agent': this.userAgent }
			});
			return response.ok;
		} catch {
			return false;
		}
	}

	// ============================================================================
	// SPARQL Execution
	// ============================================================================

	async executeSparql(query: string): Promise<SparqlResult> {
		const response = await fetch(this.endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/sparql-query',
				Accept: 'application/sparql-results+json',
				'User-Agent': this.userAgent
			},
			body: query
		});

		if (!response.ok) {
			throw new WikidataError(`SPARQL query failed: ${response.statusText}`, response.status);
		}

		return response.json();
	}

	// ============================================================================
	// Query Building
	// ============================================================================

	private buildSearchQuery(query: SourceQuery): string {
		const entityType = query.entityTypes[0] || 'dataset';
		const typeQid = this.getTypeQid(entityType);
		const filters = this.buildFilters(query.filters);

		return `
			SELECT DISTINCT ?item ?itemLabel ?itemDescription ?doi ?license ?licenseLabel ?publisher ?publisherLabel ?date
			WHERE {
				?item wdt:P31/wdt:P279* wd:${typeQid} .

				${query.text ? this.buildTextSearch(query.text) : ''}
				${filters}

				OPTIONAL { ?item wdt:P356 ?doi . }
				OPTIONAL { ?item wdt:P275 ?license . }
				OPTIONAL { ?item wdt:P123 ?publisher . }
				OPTIONAL { ?item wdt:P577 ?date . }

				SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es" . }
			}
			ORDER BY DESC(?date)
			LIMIT ${query.pagination.limit}
			OFFSET ${query.pagination.offset || 0}
		`;
	}

	private buildTextSearch(text: string): string {
		const escapedText = text.replace(/"/g, '\\"');
		return `
			?item rdfs:label ?label .
			FILTER(CONTAINS(LCASE(?label), LCASE("${escapedText}")))
		`;
	}

	private buildFilters(filters: QueryFilter[]): string {
		return filters
			.map((filter) => {
				switch (filter.field) {
					case 'topic':
						return `?item wdt:P921 wd:${filter.value} .`;
					case 'license':
						return `?item wdt:P275 wd:${filter.value} .`;
					case 'publisher':
						return `?item wdt:P123 wd:${filter.value} .`;
					case 'format':
						return `?item wdt:P2701 wd:${filter.value} .`;
					default:
						return '';
				}
			})
			.filter(Boolean)
			.join('\n');
	}

	private getTypeQid(type: EntityType): string {
		const typeMap: Record<EntityType, string> = {
			dataset: 'Q1172284',
			publication: 'Q591041',
			software: 'Q7397',
			author: 'Q5',
			organization: 'Q43229'
		};
		return typeMap[type] || 'Q1172284';
	}

	// ============================================================================
	// Entity Conversion
	// ============================================================================

	private bindingToEntity(
		binding: Record<string, { value: string; type: string }>,
		type: EntityType
	): UnifiedEntity {
		const qid = this.extractQid(binding.item?.value || '');

		return {
			id: `wikidata:${qid}`,
			identifiers: {
				wikidata: qid,
				doi: binding.doi?.value
			},
			type,
			title: binding.itemLabel?.value || qid,
			description: binding.itemDescription?.value,
			license: binding.license
				? {
						id: this.extractQid(binding.license.value),
						name: binding.licenseLabel?.value || 'Unknown'
					}
				: undefined,
			publisher: binding.publisher
				? {
						name: binding.publisherLabel?.value || 'Unknown',
						wikidata: this.extractQid(binding.publisher.value)
					}
				: undefined,
			url: binding.url?.value,
			created: binding.date?.value,
			sources: [
				{
					sourceId: 'wikidata',
					sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
					retrievedAt: new Date().toISOString()
				}
			]
		};
	}

	private extractQid(uri: string): string {
		const match = uri.match(/Q\d+$/);
		return match ? match[0] : uri;
	}

	// ============================================================================
	// Dataset-Specific Queries
	// ============================================================================

	async searchDatasets(options: {
		text?: string;
		topic?: string;
		license?: string;
		publisher?: string;
		limit?: number;
		offset?: number;
	}): Promise<SourceResult> {
		const filters: QueryFilter[] = [];

		if (options.topic) {
			filters.push({ field: 'topic', operator: 'eq', value: options.topic });
		}
		if (options.license) {
			filters.push({ field: 'license', operator: 'eq', value: options.license });
		}
		if (options.publisher) {
			filters.push({ field: 'publisher', operator: 'eq', value: options.publisher });
		}

		return this.search({
			text: options.text || '',
			filters,
			entityTypes: ['dataset'],
			pagination: {
				limit: options.limit || 25,
				offset: options.offset || 0
			}
		});
	}

	async getRelatedDatasets(qid: string, limit: number = 10): Promise<UnifiedEntity[]> {
		const sparql = `
			SELECT DISTINCT ?related ?relatedLabel ?relatedDescription ?sharedTopic ?sharedTopicLabel
			WHERE {
				wd:${qid} wdt:P921 ?sharedTopic .
				?related wdt:P31/wdt:P279* wd:Q1172284 ;
				         wdt:P921 ?sharedTopic .
				FILTER(?related != wd:${qid})

				SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
			}
			LIMIT ${limit}
		`;

		const result = await this.executeSparql(sparql);

		return result.results.bindings.map((binding) => ({
			id: `wikidata:${this.extractQid(binding.related.value)}`,
			identifiers: {
				wikidata: this.extractQid(binding.related.value)
			},
			type: 'dataset' as EntityType,
			title: binding.relatedLabel?.value || 'Unknown',
			description: binding.relatedDescription?.value,
			metadata: {
				sharedTopic: binding.sharedTopicLabel?.value
			},
			sources: [
				{
					sourceId: 'wikidata',
					sourceUrl: `https://www.wikidata.org/wiki/${this.extractQid(binding.related.value)}`,
					retrievedAt: new Date().toISOString()
				}
			]
		}));
	}

	async getCitingPapers(doi: string, limit: number = 50): Promise<UnifiedEntity[]> {
		const sparql = `
			SELECT ?paper ?paperLabel ?paperDescription ?author ?authorLabel ?date
			WHERE {
				?paper wdt:P2860 ?citedWork .
				?citedWork wdt:P356 "${doi}" .

				OPTIONAL { ?paper wdt:P50 ?author . }
				OPTIONAL { ?paper wdt:P577 ?date . }

				SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
			}
			LIMIT ${limit}
		`;

		const result = await this.executeSparql(sparql);

		return result.results.bindings.map((binding) => ({
			id: `wikidata:${this.extractQid(binding.paper.value)}`,
			identifiers: {
				wikidata: this.extractQid(binding.paper.value)
			},
			type: 'publication' as EntityType,
			title: binding.paperLabel?.value || 'Unknown',
			description: binding.paperDescription?.value,
			creators: binding.author
				? [{ name: binding.authorLabel?.value || 'Unknown' }]
				: undefined,
			created: binding.date?.value,
			sources: [
				{
					sourceId: 'wikidata',
					sourceUrl: `https://www.wikidata.org/wiki/${this.extractQid(binding.paper.value)}`,
					retrievedAt: new Date().toISOString()
				}
			]
		}));
	}
}

// ============================================================================
// Error Class
// ============================================================================

export class WikidataError extends Error {
	constructor(
		message: string,
		public readonly statusCode?: number
	) {
		super(message);
		this.name = 'WikidataError';
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: WikidataClient | null = null;

export function getWikidataClient(): WikidataClient {
	if (!instance) {
		instance = new WikidataClient();
	}
	return instance;
}
