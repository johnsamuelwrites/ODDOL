# ODDOL 2.0

**Open Data Driven Online Learning**

ODDOL is a real-time federated platform that enables online learners to discover, analyze, and contribute open datasets. All queries are executed in real-time against multiple open data sources - no data is stored or downloaded in bulk.

## Features

### Search
- **Federated Search**: Query Wikidata, OpenAlex, Zenodo, and DataCite simultaneously
- **Real-time Results**: Direct API queries to source endpoints
- **Entity Resolution**: Automatic deduplication across sources using DOI, ORCID, and ROR
- **Visual SPARQL Builder**: Construct Wikidata queries without writing SPARQL

### Analyze
- **In-Browser SQL**: Process data with DuckDB-WASM (no server required)
- **Streaming Data**: Load data progressively, never download entire datasets
- **Statistical Templates**: Pre-built queries for common analyses
- **Interactive Visualizations**: Charts powered by Observable Plot

### Describe
- **Provenance Tracking**: Full lineage from source to results
- **Multi-format Export**: Markdown, JSON-LD, BibTeX
- **Citation Building**: Generate proper citations for datasets

### Contribute
- **Wikidata Integration**: Add datasets directly to Wikidata
- **Schema Validation**: Validate against EntitySchema:E207
- **QuickStatements Generation**: Ready-to-submit contributions

## Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | SvelteKit 2.x |
| Styling | Tailwind CSS |
| SQL Engine | DuckDB-WASM |
| Visualization | Observable Plot |
| State | Svelte stores + TanStack Query |
| Cache | IndexedDB (15-minute TTL) |

## Data Sources

| Source | Type | Coverage |
|--------|------|----------|
| **Wikidata** | SPARQL | 100M+ entities |
| **OpenAlex** | REST | 250M+ scholarly works |
| **Zenodo** | REST | 3M+ research outputs |
| **DataCite** | REST | 50M+ DOI records |

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/johnsamuelwrites/ODDOL.git
cd ODDOL

# Install dependencies
npm install

# Start development server
npm run dev
```

### Build for Production

```bash
npm run build
npm run preview
```

## Architecture

ODDOL 2.0 follows a **zero-storage, real-time query** architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    ODDOL 2.0 Client                          │
│                  (SvelteKit Static SPA)                      │
├─────────────────────────────────────────────────────────────┤
│  Query Federation Engine → Rate Limiter → Entity Resolver   │
├─────────────────────────────────────────────────────────────┤
│  DuckDB-WASM (In-Browser) │ Observable Plot │ IndexedDB    │
└─────────────────────────────────────────────────────────────┘
                              │
              Direct HTTPS API Calls (No Backend)
                              │
┌─────────────────────────────────────────────────────────────┐
│  Wikidata │ OpenAlex │ Zenodo │ DataCite │ OpenCitations   │
└─────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **No Bulk Storage**: Data flows through, never persists
2. **Real-time Queries**: Live queries to source APIs
3. **Browser Processing**: All computation in WebAssembly
4. **Cursor Pagination**: Stream data in small chunks
5. **Standards-Based**: SPARQL, DCAT, PROV-O

See [design/ODDOL-2.0-IMPLEMENTATION-PLAN.md](design/ODDOL-2.0-IMPLEMENTATION-PLAN.md) for detailed architecture documentation.

## Project Structure

```
src/
├── routes/           # SvelteKit pages
│   ├── +page.svelte         # Search
│   ├── analyze/             # Data analysis
│   ├── describe/            # Documentation
│   └── contribute/          # Wikidata contribution
├── lib/
│   ├── sources/      # Data source clients
│   │   ├── wikidata.ts
│   │   ├── openalex.ts
│   │   ├── zenodo.ts
│   │   └── datacite.ts
│   ├── federation/   # Query routing & merging
│   ├── analysis/     # DuckDB engine
│   ├── visualization/# Observable Plot
│   ├── sparql/       # SPARQL query builder
│   ├── cache/        # IndexedDB caching
│   └── stores/       # Svelte state management
```

## Privacy & Security

- **No Tracking**: No analytics, cookies, or fingerprinting
- **No Server Storage**: All data stays in your browser
- **Transparent Queries**: See exactly what APIs are called
- **Short-lived Cache**: Query results expire in 15 minutes

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

### Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run check        # Type-check the project
npm run test         # Run tests
npm run lint         # Lint code
```

## License

GPL-3.0-or-later

## Acknowledgments

- [Wikidata](https://www.wikidata.org) - Free knowledge base
- [OpenAlex](https://openalex.org) - Open scholarly metadata
- [Zenodo](https://zenodo.org) - Open research repository
- [DataCite](https://datacite.org) - DOI registration agency
- [DuckDB](https://duckdb.org) - In-process analytics database
- [Observable Plot](https://observablehq.com/plot) - Grammar of graphics
