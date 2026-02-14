# ODDOL Architecture (Current Implementation)

This document describes how ODDOL works today in code.  
For product overview, see `README.md`.

## 0. Need for ODDOL (Conceptual)

ODDOL is motivated by a gap between open dataset publication and reproducible learning artifacts.

- Datasets are published openly, but analysis workflows are often under-documented.
- Published conclusions and underlying data-processing steps are difficult for learners to connect.
- Online learners need traceable links between datasets, methods, tools, and results.

For the full conceptual narrative (restored from the earlier architecture document), see:
`design/problem-overview.md`

## 1. System Overview

ODDOL is a client-only SvelteKit application. It does not include an ODDOL backend API.

- UI and logic run in the browser.
- Data is fetched directly from external providers:
  - Wikidata (SPARQL)
  - OpenAlex (REST)
  - Zenodo (REST)
  - DataCite (REST)
- Analysis runs locally with DuckDB-WASM.
- Query caching is local (memory + IndexedDB).

<img src="../images/architecture.svg" style="align:center" alt="ODDOL architecture overview" width="500"/>

## 2. Runtime Components

### 2.1 Routes

- `src/routes/+page.svelte`: federated search entry page.
- `src/routes/analyze/+page.svelte`: local SQL analysis, file/URL loading, charting.
- `src/routes/describe/+page.svelte`: analysis documentation export (Markdown, JSON-LD, BibTeX).
- `src/routes/contribute/+page.svelte`: contribution workflow (Wikidata-oriented).
- `src/routes/+layout.svelte`: shell layout, navigation, footer.

### 2.2 Core Libraries

- `src/lib/federation/engine.ts`
  - Selects compatible sources for selected entity types.
  - Executes source queries in parallel.
  - Merges and ranks results.
- `src/lib/federation/entity-resolver.ts`
  - Deduplicates entities across sources (identifier-based).
- `src/lib/federation/rate-limiter.ts`
  - Applies per-source request limits and retry behavior.
- `src/lib/sources/*.ts`
  - Source-specific clients and query translation:
    - `wikidata.ts`
    - `openalex.ts`
    - `zenodo.ts`
    - `datacite.ts`
- `src/lib/stores/search.ts`
  - Search state, filters, pagination, and cache lookup.
- `src/lib/cache/query-cache.ts`
  - Query cache with memory and IndexedDB.
  - Default TTL is 15 minutes.
- `src/lib/analysis/duckdb-engine.ts`
  - DuckDB-WASM lifecycle, data loading, SQL execution, schema/statistics.
- `src/lib/stores/analysis.ts`
  - Analysis page state and orchestration.
- `src/lib/visualization/*`
  - Chart generation from query output.

## 3. End-to-End Data Flows

## 3.1 Search Flow

1. User submits query and filters in `src/routes/+page.svelte`.
2. `searchStore.search()` builds a `FederatedQuery`.
3. Query hash is computed and cache is checked.
4. On cache miss, federation engine queries selected/compatible sources.
5. Results are merged, deduplicated, ranked, and paginated.
6. Unified entities are rendered as result cards.

### 3.2 Search to Analyze Flow

1. Clicking `Analyze` on a result card sends context in URL params (`id`, `q`, `title`, `doi`, `sources`).
2. Analyze page loads entity details via federation engine when `id` is present.
3. Entity metadata is converted to a table row and loaded into DuckDB.
4. Initial query (`SELECT * FROM entity_data`) runs automatically.

### 3.3 Analyze Flow

Input options:
- Sample data (in-app).
- Upload `.csv` or `.json` file (parsed in browser).
- Load from URL through DuckDB readers (`csv/json/parquet` inference).

Execution:
- SQL is run in DuckDB-WASM through analysis store.
- Results can be exported to CSV.
- Chart config is built from selected X/Y columns and rendered in browser.
- Query history is stored in `localStorage`.

### 3.4 Analyze to Describe Flow

1. Analyze page builds a draft payload (title, source references, SQL query, notes).
2. Draft is stored in `sessionStorage`.
3. Describe page reads and pre-fills form fields.
4. User exports documentation in:
   - Markdown
   - PROV-like JSON-LD
   - BibTeX

## 4. Data Model

ODDOL normalizes source responses into `UnifiedEntity` (`src/lib/types/index.ts`), including:

- `id` (source-qualified)
- `identifiers` (`doi`, `wikidata`, `openalex`, `zenodo`, `datacite`, etc.)
- `type` (`dataset`, `publication`, `software`, `author`, `organization`)
- `title`, `description`, `creators`, `publisher`, `license`
- `sources[]` with `sourceId`, `sourceUrl`, and retrieval timestamp

This allows source-agnostic rendering and downstream analysis.

## 5. Storage and Persistence

ODDOL currently uses browser-side storage only:

- Query cache:
  - Memory map + IndexedDB (`oddol-cache`)
  - TTL default: 15 minutes
- Preferences store in IndexedDB (no TTL semantics in implementation)
- `localStorage`:
  - SQL query history (`oddol:sql-history`)
- `sessionStorage`:
  - Analyze->Describe draft (`oddol:describe-draft`)

No ODDOL-managed server storage is implemented in this repository.

## 6. Privacy and Trust Boundaries

- No first-party analytics SDK is integrated.
- Queries are sent directly to third-party APIs; those providers may log requests.
- Google Fonts are loaded from Google CDN in `src/app.html`.
- Query transparency is partial:
  - Generated SPARQL is visible in the SPARQL builder.
  - A full REST request inspector UI is not implemented.

## 7. Error Handling and Resilience

- Source query failures are captured as partial results in federation search.
- Rate limiting and retry wrapper reduce transient API failures.
- Cache failures degrade to live querying.
- DuckDB initialization/data loading errors surface through analysis store error state.

## 8. Current Constraints and Gaps

- No authentication/authorization layer.
- No backend orchestration for cross-provider logging/auditing.
- No complete API request trace view for all source calls.
- Some type-check issues exist in unrelated modules (tracked in current branch state).

## 9. API Query Contracts (Current)

This section documents how ODDOL transforms a unified `FederatedQuery` into source-specific requests.

### 9.1 Unified Query Shape

Common query object (from `src/lib/types/index.ts`):

- `text: string`
- `filters: QueryFilter[]`
- `sources: string[]`
- `entityTypes: EntityType[]`
- `pagination: { limit, offset?, cursor? }`

### 9.2 Source Routing and Compatibility

- Routing is handled by `src/lib/federation/engine.ts`.
- If sources are explicitly selected, ODDOL keeps only sources that:
  - have an available client
  - support at least one selected entity type
- Query execution is parallelized per selected source and merged afterward.

### 9.3 Source Query Mapping

#### Wikidata (`src/lib/sources/wikidata.ts`)

- Transport: SPARQL POST to endpoint.
- Entity type mapping:
  - dataset -> `Q1172284`
  - publication -> `Q591041`
  - software -> `Q7397`
- Text search is translated to label `CONTAINS(...)`.
- Filters supported by current implementation:
  - `topic`, `license`, `publisher`, `format`
- Pagination mapping:
  - `limit` -> `LIMIT`
  - `offset` -> `OFFSET`

#### OpenAlex (`src/lib/sources/openalex.ts`)

- Transport: REST GET to `/works`.
- Query mapping:
  - `text` -> `search`
  - pagination limit -> `per_page`
  - cursor -> `cursor`
  - always includes `mailto` parameter for polite pool usage
- Filters supported:
  - year range, type, open access, DOI presence, concept, institution, author
- Sorting:
  - with text: relevance descending
  - without text: publication date descending

#### Zenodo (`src/lib/sources/zenodo.ts`)

- Transport: REST GET to `/records`.
- Query mapping:
  - text and filter parts are combined in `q`
  - entity type translated to `resource_type.type`
  - size/page pagination (`size`, `page`)
- Filters supported:
  - access, community, keyword, license
- Sorting:
  - `mostrecent`

#### DataCite (`src/lib/sources/datacite.ts`)

- Transport: REST GET to `/dois`.
- Query mapping:
  - `text` -> `query`
  - entity types -> `resource-type-id`
  - page size/number -> `page[size]`, `page[number]`
- Filters supported:
  - year, publisher, client, affiliation
- Sorting:
  - `-created`

### 9.4 Result Normalization Contract

Each source client maps raw responses into `UnifiedEntity`:

- Required practical fields for rendering:
  - `id`, `type`, `title`, `identifiers`, `sources`
- Optional enrichments:
  - `description`, `creators`, `publisher`, `license`, `created`, `metadata`

### 9.5 Partial Failure Contract

- If one or more sources fail, search returns partial results with an error list.
- UI currently surfaces source failure summary text from `searchStore`.

## 10. State Model (Current)

### 10.1 Search Store (`src/lib/stores/search.ts`)

State fields:

- `query`, `entityTypes`, `sources`, `filters`
- `results`, `totalCount`
- `isLoading`, `error`
- `hasMore`, `currentPage`

State transitions:

1. `setQuery` / `setEntityTypes` / `setSources` / `setFilters` mutate filter state.
2. `search()`:
   - sets loading true, clears error, resets page to 1
   - checks cache by query hash
   - on hit: populates results from cache
   - on miss: executes federated query and caches result
3. `loadMore()`:
   - executes next page query
   - appends results
4. `clear()` resets to initial state.

### 10.2 Analysis Store (`src/lib/stores/analysis.ts`)

State fields:

- selected entity and table context:
  - `selectedEntity`, `loadedTables`, `currentTable`, `schema`
- data/query outputs:
  - `preview`, `queryResult`, `columnStats`
- execution controls:
  - `isLoading`, `error`, `sqlQuery`

State transitions:

1. `initialize()` prepares DuckDB engine.
2. `loadData()` / `loadFromUrl()`:
   - create/replace table
   - refresh schema and preview
3. `executeQuery()`:
   - runs SQL and stores result/error
4. utility actions:
   - stats, histogram/group-by helpers, drop table, clear state.

### 10.3 Route-local State

Some UI state is intentionally kept at route level:

- Analyze route:
  - chart configuration
  - SQL validation message
  - query history (`localStorage`)
  - describe handoff draft (`sessionStorage`)
- Describe route:
  - form fields and local export payload composition

## 11. Provenance Model (Current)

### 11.1 Internal Provenance Signals

ODDOL currently captures provenance-relevant signals from:

- source metadata embedded in each `UnifiedEntity.sources[]`
- active SQL query text in Analyze
- analysis description fields in Describe

### 11.2 Describe Export Shape

Describe route exports:

- Markdown narrative report
- JSON-LD graph with PROV-style terms
- BibTeX citation stub

JSON-LD graph contains:

- analysis entity (`prov:Entity`, `schema:CreativeWork`)
- activity (`prov:Activity`, `schema:Action`)
- agent (`prov:Agent`, `schema:Person`)
- source entities (`prov:Entity`) derived from listed data sources

### 11.3 Current Limitations

- Provenance capture is semi-manual (user-entered and context-prefilled).
- No immutable run ID or signed execution trace.
- No full automatic capture of every REST request URL/parameter.

## Credits

- [Icons](https://material.io/resources/icons/?icon=bubble_chart&style=baseline)
