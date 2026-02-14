/**
 * Entity Resolver
 * Resolves and deduplicates entities across multiple sources
 */

import type { EntityIdentifiers, UnifiedEntity } from '$lib/types';

// ============================================================================
// Identifier Priority
// ============================================================================

const IDENTIFIER_PRIORITY: (keyof EntityIdentifiers)[] = [
	'doi',
	'orcid',
	'ror',
	'wikidata',
	'openalex',
	'zenodo',
	'datacite'
];

// ============================================================================
// Entity Resolver
// ============================================================================

export class EntityResolver {
	/**
	 * Generate a unique key for an entity based on its identifiers
	 */
	getEntityKey(entity: UnifiedEntity): string {
		for (const key of IDENTIFIER_PRIORITY) {
			const value = entity.identifiers[key];
			if (value) {
				return `${key}:${this.normalizeIdentifier(key, value)}`;
			}
		}

		// Fallback to title-based hash
		return `title:${this.hashString(entity.title.toLowerCase())}`;
	}

	/**
	 * Merge multiple entities representing the same resource
	 */
	mergeEntities(entities: UnifiedEntity[]): UnifiedEntity {
		if (entities.length === 0) {
			throw new Error('Cannot merge empty entity array');
		}

		if (entities.length === 1) {
			return entities[0];
		}

		// Use the entity with the most identifiers as base
		const sorted = [...entities].sort(
			(a, b) => this.countIdentifiers(b) - this.countIdentifiers(a)
		);
		const base = { ...sorted[0] };

		// Merge identifiers from all entities
		base.identifiers = this.mergeIdentifiers(entities);

		// Merge sources
		base.sources = this.mergeSources(entities);

		// Use longest description
		const descriptions = entities.map((e) => e.description).filter(Boolean);
		if (descriptions.length > 0) {
			base.description = descriptions.sort((a, b) => (b?.length || 0) - (a?.length || 0))[0];
		}

		// Merge creators
		base.creators = this.mergeCreators(entities);

		// Merge metadata
		base.metadata = this.mergeMetadata(entities);

		return base;
	}

	/**
	 * Deduplicate a list of entities
	 */
	deduplicate(entities: UnifiedEntity[]): UnifiedEntity[] {
		const groups = new Map<string, UnifiedEntity[]>();

		for (const entity of entities) {
			const key = this.getEntityKey(entity);
			const existing = groups.get(key) || [];
			existing.push(entity);
			groups.set(key, existing);
		}

		return Array.from(groups.values()).map((group) => this.mergeEntities(group));
	}

	/**
	 * Find matching entities between two lists
	 */
	findMatches(
		list1: UnifiedEntity[],
		list2: UnifiedEntity[]
	): Array<{ entity1: UnifiedEntity; entity2: UnifiedEntity }> {
		const matches: Array<{ entity1: UnifiedEntity; entity2: UnifiedEntity }> = [];
		const keys2 = new Map<string, UnifiedEntity>();

		for (const entity of list2) {
			keys2.set(this.getEntityKey(entity), entity);
		}

		for (const entity1 of list1) {
			const key = this.getEntityKey(entity1);
			const entity2 = keys2.get(key);
			if (entity2) {
				matches.push({ entity1, entity2 });
			}
		}

		return matches;
	}

	// ============================================================================
	// Private Helpers
	// ============================================================================

	private normalizeIdentifier(type: keyof EntityIdentifiers, value: string): string {
		switch (type) {
			case 'doi':
				return value.toLowerCase().replace(/^https?:\/\/doi\.org\//i, '');
			case 'orcid':
				return value.replace(/^https?:\/\/orcid\.org\//i, '');
			case 'ror':
				return value.replace(/^https?:\/\/ror\.org\//i, '');
			case 'wikidata':
				return value.replace(/^https?:\/\/www\.wikidata\.org\/wiki\//i, '');
			case 'openalex':
				return value.replace(/^https?:\/\/openalex\.org\//i, '');
			default:
				return value;
		}
	}

	private countIdentifiers(entity: UnifiedEntity): number {
		return Object.values(entity.identifiers).filter(Boolean).length;
	}

	private mergeIdentifiers(entities: UnifiedEntity[]): EntityIdentifiers {
		const merged: EntityIdentifiers = {};

		for (const entity of entities) {
			for (const [key, value] of Object.entries(entity.identifiers)) {
				if (value && !merged[key as keyof EntityIdentifiers]) {
					merged[key as keyof EntityIdentifiers] = value;
				}
			}
		}

		return merged;
	}

	private mergeSources(entities: UnifiedEntity[]): UnifiedEntity['sources'] {
		const seen = new Set<string>();
		const sources: UnifiedEntity['sources'] = [];

		for (const entity of entities) {
			for (const source of entity.sources) {
				const key = source.sourceId;
				if (!seen.has(key)) {
					seen.add(key);
					sources.push(source);
				}
			}
		}

		return sources;
	}

	private mergeCreators(entities: UnifiedEntity[]): UnifiedEntity['creators'] {
		const creatorMap = new Map<string, UnifiedEntity['creators'][0]>();

		for (const entity of entities) {
			for (const creator of entity.creators || []) {
				const key = creator.orcid || creator.name.toLowerCase();
				const existing = creatorMap.get(key);

				if (!existing) {
					creatorMap.set(key, creator);
				} else {
					// Merge creator data
					creatorMap.set(key, {
						name: existing.name || creator.name,
						orcid: existing.orcid || creator.orcid,
						affiliation: existing.affiliation || creator.affiliation
					});
				}
			}
		}

		return Array.from(creatorMap.values());
	}

	private mergeMetadata(entities: UnifiedEntity[]): Record<string, unknown> {
		const merged: Record<string, unknown> = {};

		for (const entity of entities) {
			if (entity.metadata) {
				for (const [key, value] of Object.entries(entity.metadata)) {
					if (value !== undefined && value !== null && !merged[key]) {
						merged[key] = value;
					}
				}
			}
		}

		return merged;
	}

	private hashString(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash).toString(16);
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: EntityResolver | null = null;

export function getEntityResolver(): EntityResolver {
	if (!instance) {
		instance = new EntityResolver();
	}
	return instance;
}
