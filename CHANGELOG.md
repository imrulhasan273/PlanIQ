# Changelog

All notable changes to **PlanIQ** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-23

### Added
- **SQL Server Execution Plan Engine (2016 – 2025 / Compatibility Level 170):**
  - Streaming XML tokenizer for `.sqlplan` and `.xml` ShowPlan files, including UTF-16 plans and multi-statement batches.
  - Holistic Plan Health Score (0–100, Grade A–F), 10-second bottleneck statement isolation, and PLE / buffer pool eviction risk scoring.
  - Root-cause diagnostics: Memory Grant & TempDB spills, Legacy CE (`CEVersion="70"`), `CONVERT_IMPLICIT` non-sargability, Scalar UDF (RBAR) penalties, Parallelism thread skew, Key Lookups, Row Goal misfires, and `#temp` table lifecycle matrix.
  - **SQL Server 2025 (17.x)** support: Optional Parameter Plan Optimization (OPPO / `PLAN PER VALUE` / `<OptionalParameter>` / `QueryVariantID`), CE Feedback for Expressions, DiskANN `VECTOR_SEARCH()` vs. unindexed `VECTOR_DISTANCE()` detection, `regexp_*` / `json_*` sargability alerts, `ABORT_QUERY_EXECUTION`, and SQL 2025 wait types.
- **Deadlock Graph (.xdl) Visualizer:**
  - Interactive wait-for cycle graph highlighting victim SPIDs, `inputbuf` SQL, T-SQL call stacks, lock granularity breakdown (Key, Page, Object, Exchange), chronological timeline, **SQL Server 2025 Optimized Locking** (`<tidlock>` / `<xactlock>`), and PNG/SVG export.
- **PostgreSQL `EXPLAIN (FORMAT JSON)` Engine (PostgreSQL 12 – 19):**
  - Unwraps raw JSON, pgAdmin, and DBeaver table exports into an interactive operator tree with self-time attribution and shared/local/temp buffer hit/read/spill telemetry.
  - **PostgreSQL 17 – 19** support: `EXPLAIN (SERIALIZE, MEMORY, WAL)` telemetry, PG 18 B-Tree Index Skip Scan (`Index Searches`), granular Asynchronous I/O (`Shared` / `Local` / `Temp` R/W timings), `Memoize` cache hit/eviction diagnostics, `Incremental Sort` group stats, `JSON_TABLE` / `MERGE` node mapping, `pgvector` (`HNSW` / `IVFFlat`) vs. exact vector scan detection, and **PostgreSQL 19 native `REPACK (CONCURRENTLY)`** online table/index bloat remediation.
- **Tuning Advisor & Side-by-Side Diff:**
  - 100% offline Deterministic DBA Rule Engine with SQL literal & GUID sanitization (`SanitizeSQL`), plus optional local Ollama or opt-in Gemini/OpenAI integration.
  - Locally bundled **Monaco Side-by-Side Diff Viewer** (SQL Server T-SQL & PostgreSQL dialects) for air-gapped networks with zero external CDN dependencies.
- **Exports & Live SQL Server Studio:**
  - 1-click PNG, SVG, and standalone XSS-escaped self-contained HTML diagnostic reports.
  - Optional read-only (`READ UNCOMMITTED`, `ApplicationIntent=ReadOnly`) Live Radar, DPA-style wait trends, Query Store inspector, and **AES-256-GCM** encrypted local SQLite profile store (`planiq_config.db`, `0600` inside `0700` user config directory).
  - Cross-platform distribution: Wails v2 native desktop binaries for **Windows (x64)**, **macOS (Universal Apple Silicon + Intel)**, and **Linux (x64 / WebKit2GTK 4.1)** with `SHA256SUMS.txt` manifests, plus zero-install browser/GitHub Pages web mode.
- **Open-Source Governance, Maintainability & CI/CD:**
  - Added MIT `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `.editorconfig`, GitHub Issue/PR templates, Dependabot, race-enabled Go tests & `govulncheck`, frontend parser unit tests, modular `pkg/livedb` architecture, and automated multi-OS release & Pages workflows.
