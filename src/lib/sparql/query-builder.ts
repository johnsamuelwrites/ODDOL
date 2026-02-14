/**
 * Visual SPARQL Query Builder
 * Generates SPARQL queries from visual configuration
 */

// ============================================================================
// Types
// ============================================================================

export interface QueryNode {
	id: string;
	variable: string;
	type?: string; // Wikidata QID for instance of
	label?: string;
}

export interface QueryProperty {
	id: string;
	property: string; // Wikidata PID
	propertyLabel: string;
	value?: string; // QID, literal, or variable
	valueLabel?: string;
	valueType: 'entity' | 'literal' | 'variable';
	optional: boolean;
}

export interface QueryConfig {
	mainNode: QueryNode;
	properties: QueryProperty[];
	returnFields: string[];
	limit: number;
	offset: number;
	orderBy?: {
		variable: string;
		direction: 'ASC' | 'DESC';
	};
	language: string;
}

// ============================================================================
// Common Wikidata Properties
// ============================================================================

export const COMMON_PROPERTIES = [
	{ pid: 'P31', label: 'instance of', description: 'that class of which this subject is a particular example and member' },
	{ pid: 'P279', label: 'subclass of', description: 'all instances of these items are instances of those items' },
	{ pid: 'P921', label: 'main subject', description: 'primary topic of a work' },
	{ pid: 'P275', label: 'license', description: 'license under which this work is released' },
	{ pid: 'P123', label: 'publisher', description: 'organization or person responsible for publishing' },
	{ pid: 'P356', label: 'DOI', description: 'Digital Object Identifier' },
	{ pid: 'P577', label: 'publication date', description: 'date of first publication' },
	{ pid: 'P50', label: 'author', description: 'main creator(s) of a written work' },
	{ pid: 'P2701', label: 'file format', description: 'file format of a work' },
	{ pid: 'P856', label: 'official website', description: 'URL of the official website' },
	{ pid: 'P18', label: 'image', description: 'image of relevant illustration' },
	{ pid: 'P625', label: 'coordinate location', description: 'geocoordinates' }
];

// ============================================================================
// Common Entity Types
// ============================================================================

export const COMMON_TYPES = [
	{ qid: 'Q1172284', label: 'dataset' },
	{ qid: 'Q591041', label: 'scientific article' },
	{ qid: 'Q7397', label: 'software' },
	{ qid: 'Q5', label: 'human' },
	{ qid: 'Q43229', label: 'organization' },
	{ qid: 'Q8513', label: 'database' },
	{ qid: 'Q732577', label: 'publication' }
];

// ============================================================================
// Query Builder Class
// ============================================================================

export class SparqlQueryBuilder {
	private config: QueryConfig;

	constructor(config?: Partial<QueryConfig>) {
		this.config = {
			mainNode: { id: 'main', variable: 'item' },
			properties: [],
			returnFields: ['item', 'itemLabel'],
			limit: 50,
			offset: 0,
			language: 'en',
			...config
		};
	}

	// ============================================================================
	// Configuration Methods
	// ============================================================================

	setMainType(typeQid: string, typeLabel?: string): this {
		this.config.mainNode.type = typeQid;
		this.config.mainNode.label = typeLabel;
		return this;
	}

	addProperty(property: Omit<QueryProperty, 'id'>): this {
		const id = `prop_${this.config.properties.length}`;
		this.config.properties.push({ ...property, id });
		return this;
	}

	removeProperty(id: string): this {
		this.config.properties = this.config.properties.filter((p) => p.id !== id);
		return this;
	}

	setReturnFields(fields: string[]): this {
		this.config.returnFields = fields;
		return this;
	}

	addReturnField(field: string): this {
		if (!this.config.returnFields.includes(field)) {
			this.config.returnFields.push(field);
		}
		return this;
	}

	setLimit(limit: number): this {
		this.config.limit = Math.min(Math.max(1, limit), 1000);
		return this;
	}

	setOffset(offset: number): this {
		this.config.offset = Math.max(0, offset);
		return this;
	}

	setOrderBy(variable: string, direction: 'ASC' | 'DESC' = 'DESC'): this {
		this.config.orderBy = { variable, direction };
		return this;
	}

	setLanguage(language: string): this {
		this.config.language = language;
		return this;
	}

	// ============================================================================
	// Query Generation
	// ============================================================================

	build(): string {
		const selectClause = this.buildSelectClause();
		const whereClause = this.buildWhereClause();
		const orderClause = this.buildOrderClause();
		const limitClause = this.buildLimitClause();

		return `${selectClause}
WHERE {
${whereClause}
}
${orderClause}
${limitClause}`.trim();
	}

	private buildSelectClause(): string {
		const fields = this.config.returnFields.map((f) => `?${f}`).join(' ');
		return `SELECT DISTINCT ${fields}`;
	}

	private buildWhereClause(): string {
		const lines: string[] = [];
		const mainVar = `?${this.config.mainNode.variable}`;

		// Instance of constraint
		if (this.config.mainNode.type) {
			lines.push(`  ${mainVar} wdt:P31/wdt:P279* wd:${this.config.mainNode.type} .`);
		}

		// Property constraints
		for (const prop of this.config.properties) {
			const propLine = this.buildPropertyLine(mainVar, prop);
			if (prop.optional) {
				lines.push(`  OPTIONAL { ${propLine} }`);
			} else {
				lines.push(`  ${propLine}`);
			}
		}

		// Label service
		lines.push('');
		lines.push(`  SERVICE wikibase:label { bd:serviceParam wikibase:language "${this.config.language},en" . }`);

		return lines.join('\n');
	}

	private buildPropertyLine(subject: string, prop: QueryProperty): string {
		let object: string;

		switch (prop.valueType) {
			case 'entity':
				object = prop.value ? `wd:${prop.value}` : `?${prop.property.toLowerCase()}`;
				break;
			case 'literal':
				object = prop.value ? `"${this.escapeSparql(prop.value)}"` : `?${prop.property.toLowerCase()}`;
				break;
			case 'variable':
			default:
				object = `?${prop.value || prop.property.toLowerCase()}`;
		}

		return `${subject} wdt:${prop.property} ${object} .`;
	}

	private buildOrderClause(): string {
		if (!this.config.orderBy) return '';
		return `ORDER BY ${this.config.orderBy.direction}(?${this.config.orderBy.variable})`;
	}

	private buildLimitClause(): string {
		let clause = `LIMIT ${this.config.limit}`;
		if (this.config.offset > 0) {
			clause += `\nOFFSET ${this.config.offset}`;
		}
		return clause;
	}

	private escapeSparql(value: string): string {
		return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
	}

	// ============================================================================
	// Query Templates
	// ============================================================================

	static datasetSearch(topic?: string, license?: string): SparqlQueryBuilder {
		const builder = new SparqlQueryBuilder()
			.setMainType('Q1172284', 'dataset')
			.addReturnField('doi')
			.addReturnField('license')
			.addReturnField('licenseLabel')
			.addReturnField('publisher')
			.addReturnField('publisherLabel')
			.addReturnField('date');

		// Add DOI as optional
		builder.addProperty({
			property: 'P356',
			propertyLabel: 'DOI',
			valueType: 'variable',
			value: 'doi',
			optional: true
		});

		// Add license
		builder.addProperty({
			property: 'P275',
			propertyLabel: 'license',
			valueType: license ? 'entity' : 'variable',
			value: license || 'license',
			optional: !license
		});

		// Add publisher as optional
		builder.addProperty({
			property: 'P123',
			propertyLabel: 'publisher',
			valueType: 'variable',
			value: 'publisher',
			optional: true
		});

		// Add publication date as optional
		builder.addProperty({
			property: 'P577',
			propertyLabel: 'publication date',
			valueType: 'variable',
			value: 'date',
			optional: true
		});

		// Add topic filter if specified
		if (topic) {
			builder.addProperty({
				property: 'P921',
				propertyLabel: 'main subject',
				valueType: 'entity',
				value: topic,
				optional: false
			});
		}

		return builder.setOrderBy('date', 'DESC').setLimit(50);
	}

	static citingPapers(doi: string): SparqlQueryBuilder {
		return new SparqlQueryBuilder()
			.setMainType('Q591041', 'scientific article')
			.addProperty({
				property: 'P2860',
				propertyLabel: 'cites work',
				valueType: 'variable',
				value: 'citedWork',
				optional: false
			})
			.addReturnField('author')
			.addReturnField('authorLabel')
			.addReturnField('date')
			.addProperty({
				property: 'P50',
				propertyLabel: 'author',
				valueType: 'variable',
				value: 'author',
				optional: true
			})
			.addProperty({
				property: 'P577',
				propertyLabel: 'publication date',
				valueType: 'variable',
				value: 'date',
				optional: true
			})
			.setLimit(100);
	}

	static relatedDatasets(qid: string): SparqlQueryBuilder {
		const builder = new SparqlQueryBuilder();
		builder.config.mainNode = { id: 'main', variable: 'related' };

		return builder
			.setMainType('Q1172284', 'dataset')
			.addReturnField('sharedTopic')
			.addReturnField('sharedTopicLabel')
			.setLimit(20);
	}

	// ============================================================================
	// Getters
	// ============================================================================

	getConfig(): QueryConfig {
		return { ...this.config };
	}
}

// ============================================================================
// Query Validator
// ============================================================================

export function validateSparqlQuery(query: string): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	// Check for required parts
	if (!query.includes('SELECT')) {
		errors.push('Query must contain SELECT clause');
	}
	if (!query.includes('WHERE')) {
		errors.push('Query must contain WHERE clause');
	}

	// Check for injection attempts
	const dangerousPatterns = [
		/DELETE\s+/i,
		/INSERT\s+/i,
		/DROP\s+/i,
		/CLEAR\s+/i,
		/LOAD\s+/i
	];

	for (const pattern of dangerousPatterns) {
		if (pattern.test(query)) {
			errors.push('Query contains disallowed operations');
			break;
		}
	}

	// Check LIMIT
	const limitMatch = query.match(/LIMIT\s+(\d+)/i);
	if (limitMatch) {
		const limit = parseInt(limitMatch[1]);
		if (limit > 10000) {
			errors.push('LIMIT cannot exceed 10000');
		}
	}

	return {
		valid: errors.length === 0,
		errors
	};
}
