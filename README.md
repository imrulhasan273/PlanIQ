# PlanIQ ⚡
### Modern SQL Server & PostgreSQL Execution Plan Visualizer, Root-Cause Diagnostics & AI Advisor

[![Go Version](https://img.shields.io/badge/Go-1.26+-00ADD8?style=flat&logo=go)](https://golang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Wails](https://img.shields.io/badge/Wails-v2-DF105A?style=flat&logo=wails)](https://wails.io/)
[![SQL Server](https://img.shields.io/badge/SQL%20Server-2016%20--%202025-CC292B?style=flat&logo=microsoftsqlserver)](https://www.microsoft.com/sql-server)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-12%20--%2019%20(EXPLAIN%20JSON)-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**PlanIQ** is a high-performance execution plan visualizer, root-cause diagnostic engine, and AI-powered query tuning copilot for **Microsoft SQL Server** (`.sqlplan` / `.xml` / `.xdl`) and **PostgreSQL** (`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` `.json`).

While traditional tools like SQL Server Management Studio (SSMS) simply render raw operator trees and leave interpretation to manual effort, **PlanIQ decodes execution plans in seconds**—calculating health scores, isolating dominant bottlenecks, consolidating fragmented index hints, and generating production-ready query rewrites.

---

## ⚡ Highlights

- **🎯 10-Second Culprit Isolation:** Instantly pinpoints the dominant bottleneck statement in multi-query batches (e.g., Stmt #4 accounting for 54.2% of batch cost).
- **🏆 Plan Health Score (0–100, Grade A–F):** Holistic query grading factoring compilation overhead, memory spills, non-sargability, and CE version.
- **🔬 Deep Root-Cause Diagnostic Engine:**
  - **Memory Grant & TempDB Spills:** Flags sort/hash operations spilling to disk.
  - **Cardinality Estimator Model:** Detects legacy SQL 7.0 CE (`CEVersion="70"`) vs. modern CE regression risks.
  - **Non-Sargable Implicit Conversions:** Identifies `CONVERT_IMPLICIT` warnings on join/filter predicates preventing index seeks.
  - **Scalar UDF (RBAR) Penalty:** Highlights row-by-agonizing-row scalar functions executing in relational pipelines.
  - **Parallelism Skew:** Identifies thread workload imbalances and single-threaded MaxDOP bottlenecks.
- **🔒 Deadlock Graph Viewer (.xdl):** 100% offline interactive SQL Server deadlock visualizer (including **SQL Server 2025 Optimized Locking** `<tidlock>` / `XACT` transaction locks). Highlights directed wait-for cycles, marks killed victim SPIDs, parses full `inputbuf` queries, displays execution call stacks, and prescribes T-SQL error 1205 retry patterns.
- **🎛️ Parameter Sniffing & Runtime Variable Inspector:** Detects divergence between `<ParameterList>` Compiled (cached) and Runtime (executed) values, evaluates cardinality estimate skew, and provides 4 ready-to-copy T-SQL remedies (`OPTION (RECOMPILE)`, `OPTIMIZE FOR UNKNOWN`, value pinning, local variable masking).
- **⚡ Intelligent Query Processing (SQL 2017–2025 IQP):** Analyzes Adaptive Joins, Batch Mode on Rowstore, Memory Grant Feedback, DOP Feedback, and **SQL Server 2025 (Compat Level 170)** features—**Optional Parameter Plan Optimization (OPPO)**, **CE Feedback for Expressions**, **DiskANN Vector Search** (`VECTOR_SEARCH` vs. `VECTOR_DISTANCE`), and **RegEx / JSON Index** sargability.
- **📸 High-Res Export (PDF / PNG / SVG & Offline HTML Sharing):** Export plan trees to High-Res PNG or vector SVG with a single click, or generate a standalone, self-contained interactive HTML diagnostic report that opens in any browser on air-gapped corporate networks without dependencies.
- **⏱️ Batch Flow & TempDB Lifecycle Visualizer:** Sequential statement execution waterfall, cumulative subtree cost progression tracker, `#temp` table lifecycle matrix (Creation &rarr; Ingestion &rarr; Reads &rarr; Indexes &rarr; Drops), and TempDB worktable disk spill alerts.
- **⏳ Wait Statistics & Resource Bottlenecks Deep-Dive:** Comprehensive physical wait event analyzer (Disk I/O, Parallelism, Memory Grants, Schedulers) with category distribution bars, ranked wait events, operator correlations, and built-in 12-wait DBA reference handbook.
- **📚 SQL Server Tuning Playbook & Anti-Pattern Lab:** Interactive encyclopedia of 15+ engine anti-patterns with before-and-after T-SQL code comparisons, relational join physics deep-dive (Nested Loops vs Hash vs Merge vs Adaptive), query hints guide, and plan-aware detection.
- **🧩 Smart Missing Index Consolidator:** Deduplicates and merges overlapping equality, inequality, and include columns into clean composite covering indexes (e.g. consolidates 13 raw hints down to 5 covering indexes).
- **🤖 Deterministic DBA Engine & AI Query Rewriter:** Generates production-ready T-SQL rewrites (pre-creating `#temp` tables with clustered PKs, sargable date bounds) with an interactive **Monaco Side-by-Side Diff Viewer**.
- **⚖️ Side-by-Side Plan Comparator:** Compare baseline and optimized `.sqlplan` or PostgreSQL `.json` files with cost reduction diffs and missing index resolution metrics.
- **🐘 PostgreSQL EXPLAIN JSON Support (PostgreSQL 12 – 19):** Dedicated engine switcher dropdown with interactive tree visualization, shared/temp buffer hit/read/spill block metrics, parallel worker planned vs. launched tracking, **PG 17–19 `EXPLAIN (SERIALIZE, MEMORY, WAL)`**, **PG 18 B-Tree Index Skip Scan (`Index Searches`)**, granular Asynchronous I/O (`Shared`/`Local`/`Temp`) timings, `Memoize` cache hit/eviction analysis, `pgvector` HNSW/IVFFlat detection, Index-Only Scan heap fetch & **PostgreSQL 19 `REPACK (CONCURRENTLY)`** online bloat remediation, and A/B plan comparison.
- **📡 Live Radar & Query Store Studio (Optional SQL Server Mode):** Read-only DPA-style wait trend charts, active/blocking session trees, buffer pool & PLE monitoring, TempDB usage inspection, Query Store top-query analysis, and local SQLite connection profile storage (`planiq_config.db`).
- **🔒 Offline-First & Private by Design:** All plan/deadlock parsing, root-cause diagnostics, deterministic tuning rules, and HTML/PNG/SVG report exports run locally with zero database connection required; Live Radar and cloud LLM providers are strictly opt-in.

---

## 📊 PlanIQ vs. SSMS Execution Plan

| Feature / Capability | SSMS Execution Plan | PlanIQ |
| :--- | :---: | :---: |
| **Graphical Execution Plan** | ✅ Native GDI+ | ✅ Modern Responsive Canvas |
| **Multi-Statement Batch Navigation** | ⚠️ Long horizontal scroll | ✅ Isolated statement cards + cost % |
| **Batch Waterfall & TempDB Lifecycle** | ❌ None | ✅ Interactive Waterfall & `#temp` Matrix |
| **Wait Statistics Analysis** | ⚠️ Buried in properties XML | ✅ Categorized Bar, Table & Remediation |
| **Built-in Tuning Playbook & Code Diff** | ❌ None | ✅ 15+ Patterns with Before/After SQL |
| **Automated Culprit Identification** | ❌ Manual DBA inspection | ✅ Instant 10-second isolation |
| **Plan Health Score & Grade** | ❌ None | ✅ 0–100 Health Score (Grade A–F) |
| **Legacy CE (CE 70) Detector** | ❌ Buried in XML attributes | ✅ Dedicated diagnostic alert card |
| **Non-Sargable `CONVERT_IMPLICIT` Detector** | ❌ Hidden in operator tooltip | ✅ Visual sargability warning badge |
| **Scalar UDF (RBAR) Penalty Alert** | ❌ None | ✅ Direct UDF execution warning |
| **Missing Index Handling** | ⚠️ Isolated green text per query | ✅ Smart Consolidator & Deduplicator |
| **Automated Query Rewriting** | ❌ None | ✅ Deterministic DBA Engine + AI Diff |
| **Interactive SQL Diff View** | ❌ None | ✅ Side-by-side Monaco Diff Viewer |
| **Deadlock Graph Viewer (.xdl)** | ⚠️ Basic static boxes | ✅ Interactive Directed Cycle Graph + T-SQL Stack |
| **Parameter Sniffing Inspector** | ⚠️ Buried in XML list | ✅ Compiled vs Runtime Diff + 4 T-SQL Fixes |
| **Adaptive Joins & Batch Mode (IQP)** | ❌ Hidden in operator | ✅ Inflection Cutoff & Vectorization Analysis |
| **High-Res Export (PNG/SVG/HTML)** | ❌ Fragmented screenshots | ✅ 1-Click PNG, SVG & Offline HTML Report |
| **Cross-Platform / Zero-Install** | ❌ Windows-only (~4GB install) | ✅ Lightweight desktop app / Browser |
| **Database Connection Required** | ✅ Yes (to capture plans) | ❌ No (100% offline analysis of `.sqlplan`/`.xdl`) |

---

## 🏗️ Architecture

PlanIQ is built with a decoupled, high-performance architecture:

```
┌────────────────────────────────────────────────────────────────┐
│                        PlanIQ Frontend                         │
│        React 19 • TypeScript 5.6+ • Vite • Lucide Icons        │
│    Monaco Diff Editor • SQL Server XML & PG JSON Parsers       │
└───────────────▲────────────────────────────▲───────────────────┘
                │                            │
       (Wails IPC Bridge)             (Direct Web Mode)
                │                            │
┌───────────────▼──────────────────┐         │
│            Go Backend            │         │
│  Streaming XML Plan Parser       │         │
│  Deterministic DBA Rule Engine   │         │
│  Local SQLite Config Store       │         │
│  Optional Live SQL Server Client │         │
│  LLM Advisor (Ollama/Cloud AI)   │         │
└──────────────────────────────────┘         │
                │                            │
                ▼                            ▼
     Local .sqlplan / .xml / .json / .xdl Execution Plan File
```

- **Frontend (React 19 + TypeScript + Vite):** Renders the interactive plan canvas, charts, and Monaco side-by-side diff viewer, with client-side parsers for both SQL Server ShowPlan XML and PostgreSQL `EXPLAIN (FORMAT JSON)` plans.
- **Backend (Go + Wails):** Uses standard library streaming XML tokenizers to parse massive multi-megabyte `.sqlplan` files in milliseconds, persists settings/profiles locally in SQLite (`modernc.org/sqlite`), and supports optional read-only SQL Server connections (`go-mssqldb`).
- **Tuning Advisor:** Combines a local deterministic DBA heuristic rule engine with optional LLM support (local **Ollama** at `http://localhost:11434`, or opt-in cloud **Google Gemini** / **OpenAI**).

---

## 🚀 Getting Started

### Option 1: Run in Browser (Quickest)

1. Clone the repository:
   ```bash
   git clone https://github.com/imrulhasan273/PlanIQ.git
   cd PlanIQ/frontend
   ```

2. Install dependencies & start the dev server:
   ```bash
   npm install
   npm run dev
   ```

3. Open `http://localhost:5173/` in your browser. Drag and drop any `.sqlplan`, `.xml`, `.json`, or `.xdl` file to start analyzing.

---

### Option 2: Build & Run Native Desktop App (Wails)

#### Prerequisites
- [Go 1.26+](https://golang.org/dl/)
- [Node.js 18+](https://nodejs.org/)
- [Wails CLI v2](https://wails.io/docs/gettingstarted/installation):
  ```bash
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  ```

#### Live Development

```bash
wails dev
```

#### Build Production Binary
```bash
wails build -clean
```
The compiled binary will be placed in `build/bin/`.

---

## 🧭 Using PlanIQ

### 1. Loading an Execution Plan
- Select **SQL Server** or **PostgreSQL** via the top engine switcher dropdown (or reset back to the welcome screen anytime).
- Click **Open File** to select a SQL Server `.sqlplan`/`.xml` file, a PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` `.json` file, or a `.xdl` deadlock graph—or drag and drop directly onto the app.
- Or click **Paste XML** to paste SQL Server ShowPlan XML or PostgreSQL EXPLAIN JSON directly from your clipboard.
- Or load the bundled **SQL Server** or **PostgreSQL** sample plans from the welcome screen or engine dropdown.

### 2. Overview & Diagnostics
- Review the **Plan Health Score** and grade.
- Check the **Top Bottleneck Statement** to see which query dominates resource consumption.
- Read through **Advanced Root Causes** (spills, CE version, sargability, UDF penalties).

### 3. Missing Indexes Tab
- Review consolidated index recommendations.
- Click **Copy DDL** to copy production-ready `CREATE INDEX` scripts.

### 4. AI Advisor Tab
- Click **Run AI Advisory Analysis** to trigger the Deterministic DBA Rule Engine.
- Inspect the optimized query in the **Side-by-Side Monaco Diff Viewer** with highlighted structural improvements.

### 5. Deadlock Graph (.xdl) Visualizer
- Click **Deadlocks (.xdl)** in the top navigation bar.
- Open any `.xdl` file exported from SSMS, Extended Events, or error logs (or drag and drop into the app).
- Or click **Sample Plan** to inspect an instant interactive demonstration.
- **Interactive Dependency Graph:** Highlights the fatal circular lock cycle with red pulse glow and flags victim SPIDs rolled back by the engine.
- **Step Timeline:** Chronological step-by-step playback of lock acquisition and lock collision.
- **Side-by-Side Session Diff:** Compare statement text, isolation levels, transactions, and SPIDs.
- **Lock Granularity Matrix:** Deep breakdown of Key, Page, Object, and Exchange locks.
- **Remediation Scripts:** Production-tested T-SQL and EF Core code snippets to permanently eliminate the deadlock.
- **Export:** One-click high-resolution PNG and vector SVG exports for incident response reports.

### 6. Live Radar & Wait Trend (SolarWinds DPA Style)
- Connect safely to your live SQL Server instance with read-only intent (`READ UNCOMMITTED`, `LOCK_TIMEOUT 3000ms`).
- **Wait Trend:** Day-wise and hourly wait category history (CPU, Lock, Latch, Memory, Buffer I/O) aggregated from Query Store.
- **Advisors:** Automated detection of plan regressions, parameter sniffing, and query anomalies.
- **Live Deadlocks:** Stream deadlocks directly from the `system_health` Extended Events ring buffer and event file targets.
- **Buffer Pool Inspector:** Instant partition-level memory cache inspection without buffer latch contention.

---

## 🛡️ Security, Privacy & Offline Transparency

PlanIQ is engineered as an **offline-first** diagnostic workbench:

### Works 100% Locally / Offline
- **Plan & Deadlock Analysis:** SQL Server `.sqlplan`/`.xml` parsing, PostgreSQL EXPLAIN `.json` parsing, `.xdl` deadlock graphing, health scoring, root-cause diagnostics, missing index consolidation, A/B plan comparison, and the Tuning Playbook all execute locally in Go/TypeScript with zero database connection required.
- **Deterministic DBA Rule Engine:** Generates query tuning advice and rewrites completely offline without external API calls.
- **Local Persistence & Self-Contained Exports:** Settings, connection profiles (with **AES-256-GCM** encrypted passwords), and wait snapshots are stored locally in SQLite (`planiq_config.db`). PNG, SVG, and standalone HTML diagnostic reports work on air-gapped networks with no external scripts or CDNs.
- **Local LLM Support:** Connects to a local **Ollama** instance (`http://localhost:11434`) on your workstation or internal network.

### Current Air-Gapped Caveat (Known Limitation)
- **Monaco Diff Editor CDN:** `@monaco-editor/react` loads Monaco Editor assets from jsDelivr CDN by default unless locally bundled. In offline environments, switch to the built-in **Code View** toggle inside the **AI Advisor** tab to inspect rewritten SQL locally.

### Strictly Opt-In Network Features
- **Live Radar & Connections:** Read-only TCP connection (`READ UNCOMMITTED`, `ApplicationIntent=ReadOnly`) only initiated when you explicitly connect to a SQL Server instance.
- **Cloud AI Providers (Google Gemini / OpenAI):** Only called when you explicitly select a cloud provider and supply an API key in **AI Settings** (includes an optional **Sanitize Literals** toggle before sending SQL).

See [SECURITY.md](SECURITY.md) for credential encryption and vulnerability reporting details.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md) before opening a pull request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m "feat: add amazing feature"`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.