# PlanIQ ⚡
### Modern SQL Server Execution Plan Visualizer, Root-Cause Diagnostics & AI Advisor

[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go)](https://golang.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Wails](https://img.shields.io/badge/Wails-v2-DF105A?style=flat&logo=wails)](https://wails.io/)
[![SQL Server](https://img.shields.io/badge/SQL%20Server-2016%20--%202022-CC292B?style=flat&logo=microsoftsqlserver)](https://www.microsoft.com/sql-server)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**PlanIQ** is a high-performance execution plan visualizer, root-cause diagnostic engine, and AI-powered query tuning copilot for Microsoft SQL Server (`.sqlplan` / `.xml`). 

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
- **🔒 Deadlock Graph Viewer (.xdl):** 100% offline interactive SQL Server deadlock visualizer. Highlights directed wait-for cycles, marks killed victim SPIDs, parses full `inputbuf` queries, displays execution call stacks, and prescribes T-SQL error 1205 retry patterns.
- **🎛️ Parameter Sniffing & Runtime Variable Inspector:** Detects divergence between `<ParameterList>` Compiled (cached) and Runtime (executed) values, evaluates cardinality estimate skew, and provides 4 ready-to-copy T-SQL remedies (`OPTION (RECOMPILE)`, `OPTIMIZE FOR UNKNOWN`, value pinning, local variable masking).
- **⚡ Adaptive Joins & Batch Mode on Rowstore (SQL 2019/2022 IQP):** Analyzes dynamic join inflection thresholds, shows whether the engine chose Nested Loops or Hash Match at runtime, and tracks CPU vectorization gains on rowstore tables.
- **📸 High-Res Export (PDF / PNG / SVG & Offline HTML Sharing):** Export plan trees to High-Res PNG or vector SVG with a single click, or generate a standalone, self-contained interactive HTML diagnostic report that opens in any browser on air-gapped corporate networks without dependencies.
- **⏱️ Batch Flow & TempDB Lifecycle Visualizer:** Sequential statement execution waterfall, cumulative subtree cost progression tracker, `#temp` table lifecycle matrix (Creation &rarr; Ingestion &rarr; Reads &rarr; Indexes &rarr; Drops), and TempDB worktable disk spill alerts.
- **⏳ Wait Statistics & Resource Bottlenecks Deep-Dive:** Comprehensive physical wait event analyzer (Disk I/O, Parallelism, Memory Grants, Schedulers) with category distribution bars, ranked wait events, operator correlations, and built-in 12-wait DBA reference handbook.
- **📚 SQL Server Tuning Playbook & Anti-Pattern Lab:** Interactive encyclopedia of 15+ engine anti-patterns with before-and-after T-SQL code comparisons, relational join physics deep-dive (Nested Loops vs Hash vs Merge vs Adaptive), query hints guide, and plan-aware detection.
- **🧩 Smart Missing Index Consolidator:** Deduplicates and merges overlapping equality, inequality, and include columns into clean composite covering indexes (e.g. consolidates 13 raw hints down to 5 covering indexes).
- **🤖 Deterministic DBA Engine & AI Query Rewriter:** Generates production-ready T-SQL rewrites (pre-creating `#temp` tables with clustered PKs, sargable date bounds) with an interactive **Monaco Side-by-Side Diff Viewer**.
- **⚖️ Side-by-Side Plan Comparator:** Compare baseline and optimized `.sqlplan` files with cost reduction diffs and missing index resolution metrics.
- **🔒 100% Offline & Private:** Operates entirely locally without requiring live database credentials or transmitting sensitive data.

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
┌────────────────────────────────────────────────────────┐
│                   PlanIQ Frontend                      │
│     React 18 • TypeScript • Tailwind / CSS Modules     │
│       Monaco Diff Editor • Lucide Icons • Vite        │
└───────────────▲────────────────────────▲───────────────┘
                │                        │
       (Wails IPC Bridge)         (Direct Web Mode)
                │                        │
┌───────────────▼──────────────┐         │
│         Go Backend           │         │
│  Streaming XML Plan Parser   │         │
│  Deterministic DBA Engine    │         │
│  LLM Advisor (Ollama/OpenAI) │         │
└──────────────────────────────┘         │
                │                        │
                ▼                        ▼
        Local .sqlplan / XML Execution Plan File
```

- **Backend (Go + Wails):** Uses standard library streaming XML tokenizers to parse massive multi-megabyte plan files in milliseconds without memory bloat.
- **Client-Side Parser Fallback:** In web mode, the browser utilizes an equivalent TypeScript XML diagnostic engine to provide full offline functionality.
- **Tuning Advisor:** Combines deterministic DBA heuristic rules with an optional LLM interface (supporting OpenAI, Azure, Anthropic, or local Ollama).

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

3. Open `http://localhost:5173/` in your browser. Drag and drop any `.sqlplan` or `.xml` file to start analyzing.

---

### Option 2: Build & Run Native Desktop App (Wails)

#### Prerequisites
- [Go 1.22+](https://golang.org/dl/)
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
- Click **Open Plan File** to select any `.sqlplan` or `.xml` file exported from SSMS, Azure Data Studio, or Extended Events.
- Or click **Paste XML** to paste execution plan XML directly from clipboard.
- Or click **Load Sample Plan** to explore pre-loaded multi-statement production plans.

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

---

## 🛡️ Security & Privacy

PlanIQ was created with enterprise security requirements in mind:
- **No Database Connection Needed:** Operates solely on exported plan XML.
- **Zero Data Leakage:** Plans contain metadata and schema definitions, but no actual table data rows.
- **Offline Capable:** The Deterministic Rule Engine runs 100% on your machine without external API dependencies.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m "feat: add amazing feature"`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.