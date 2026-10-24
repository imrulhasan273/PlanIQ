import React, { useState, useMemo } from 'react';
import {
  Compass,
  Cpu,
  Database,
  Layers,
  HardDrive,
  Activity,
  Zap,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  ArrowRight,
  Code2,
  Table,
  Sliders,
  Server,
  Network,
  RotateCcw,
  Sparkles,
  Info,
  Clock,
  ExternalLink,
  ChevronRight,
  Calculator,
  Search,
  Filter
} from 'lucide-react';

import {
  CorrectionsGrid,
  Level1Extras,
  Level2Extras,
  Level3Extras,
  Level4Extras,
  CostlyQueriesSection
} from './DocumentCoverage';

export const PerformanceProcessView: React.FC = () => {
  const [activeLevel, setActiveLevel] = useState<'all' | 'level1' | 'level2' | 'level3' | 'level4' | 'sqlos' | 'waits' | 'raid' | 'corrections' | 'costly'>('level1');
  const [copiedScriptId, setCopiedScriptId] = useState<string | null>(null);
  const [activeWaitType, setActiveWaitType] = useState<string>('CXPACKET');
  const [waitSearchQuery, setWaitSearchQuery] = useState<string>('');

  // Interactive RAID calculator state
  const [raidReads, setRaidReads] = useState<number>(200);
  const [raidWrites, setRaidWrites] = useState<number>(400);
  const [raidDisks, setRaidDisks] = useState<number>(4);

  // Interactive Checklist State
  const [completedChecklist, setCompletedChecklist] = useState<Record<string, boolean>>({});

  const toggleChecklistItem = (id: string) => {
    setCompletedChecklist((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyCode = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScriptId(id);
    setTimeout(() => setCopiedScriptId(null), 2000);
  };

  // RAID I/O Calculations based on the formulas in the document
  const raidCalculations = useMemo(() => {
    const r = Math.max(0, raidReads);
    const w = Math.max(0, raidWrites);
    const n = Math.max(2, raidDisks);

    return {
      raid0: ((r + w) / n).toFixed(1),
      raid1: ((r + 2 * w) / 2).toFixed(1),
      raid5: ((r + 4 * w) / n).toFixed(1),
      raid6: ((r + 6 * w) / n).toFixed(1),
      raid6Pdf: ((r + 6 * w) / Math.max(1, n - 2)).toFixed(1),
      raid10: ((r + 2 * w) / n).toFixed(1),
    };
  }, [raidReads, raidWrites, raidDisks]);

  return (
    <div className="methodology-container">
      {/* Hero Banner */}
      <div className="methodology-hero glass-panel">
        <div className="methodology-hero-badge">
          <Compass size={16} color="#38bdf8" />
          <span>Complete DBA & Engineering Methodology</span>
        </div>
        <h2 className="methodology-hero-title">
          SQL Server Performance Improvement Framework & Engineering Architecture
        </h2>
        <p className="methodology-hero-desc">
          Built from your PDF "SQL Server: Performance Improvements" (23 pages), corrected where needed. Covers <strong>Development</strong>, <strong>Procedural</strong>, <strong>Architecture/DBA</strong>, and <strong>Hardware/SQLOS</strong> optimization, updated with modern SQL Server engine internals (2016–2022+ & Azure SQL).
        </p>

        {/* 4 Levels Flow Navigation */}
        <div className="four-levels-grid">
          <button
            className={`level-card ${activeLevel === 'level1' ? 'level-active' : ''}`}
            onClick={() => setActiveLevel('level1')}
          >
            <div className="level-badge badge-blue">LEVEL 1</div>
            <div className="level-header">
              <Code2 size={20} color="#38bdf8" />
              <h3>Development Level</h3>
            </div>
            <p>SQL Queries, Sargability, Joins, Index Seeking, Data Types, and Predicates</p>
            <div className="level-footer">
              <span>Open Level 1</span>
              <ArrowRight size={14} />
            </div>
          </button>

          <button
            className={`level-card ${activeLevel === 'level2' ? 'level-active' : ''}`}
            onClick={() => setActiveLevel('level2')}
          >
            <div className="level-badge badge-purple">LEVEL 2</div>
            <div className="level-header">
              <Layers size={20} color="#c084fc" />
              <h3>Procedural Level</h3>
            </div>
            <p>Stored Procedures, Set-Based vs RBAR, #Temp vs @Table, Transactions, Plan Reuse</p>
            <div className="level-footer">
              <span>Open Level 2</span>
              <ArrowRight size={14} />
            </div>
          </button>

          <button
            className={`level-card ${activeLevel === 'level3' ? 'level-active' : ''}`}
            onClick={() => setActiveLevel('level3')}
          >
            <div className="level-badge badge-amber">LEVEL 3</div>
            <div className="level-header">
              <Database size={20} color="#fbbf24" />
              <h3>Architecture / DBA</h3>
            </div>
            <p>Statistics, TempDB, Query Store, Index Lifecycle, Partitioning, Concurrency</p>
            <div className="level-footer">
              <span>Open Level 3</span>
              <ArrowRight size={14} />
            </div>
          </button>

          <button
            className={`level-card ${activeLevel === 'level4' ? 'level-active' : ''}`}
            onClick={() => setActiveLevel('level4')}
          >
            <div className="level-badge badge-rose">LEVEL 4</div>
            <div className="level-header">
              <Server size={20} color="#f43f5e" />
              <h3>Hardware & SQLOS</h3>
            </div>
            <p>CPU Quantum, Schedulers, Memory, NVMe Storage, RAID IOPS, Latches & Waits</p>
            <div className="level-footer">
              <span>Open Level 4</span>
              <ArrowRight size={14} />
            </div>
          </button>
        </div>

        {/* Deep Dive Quick Links */}
        <div className="deep-dive-bar">
          <span className="deep-dive-label">Specialist Deep Dives:</span>
          <button
            className={`deep-dive-btn ${activeLevel === 'sqlos' ? 'active' : ''}`}
            onClick={() => setActiveLevel('sqlos')}
          >
            <Cpu size={14} />
            <span>SQLOS Scheduler & Thread Lifecycle (4ms Quantum)</span>
          </button>
          <button
            className={`deep-dive-btn ${activeLevel === 'waits' ? 'active' : ''}`}
            onClick={() => setActiveLevel('waits')}
          >
            <Activity size={14} />
            <span>Top 9 Wait Types Diagnostic Matrix</span>
          </button>
          <button
            className={`deep-dive-btn ${activeLevel === 'raid' ? 'active' : ''}`}
            onClick={() => setActiveLevel('raid')}
          >
            <HardDrive size={14} />
            <span>RAID Penalty Calculator & Storage Formulas</span>
          </button>
          <button
            className={`deep-dive-btn ${activeLevel === 'costly' ? 'active' : ''}`}
            onClick={() => setActiveLevel('costly')}
          >
            <Search size={14} />
            <span>Finding Costly Queries (XE, Query Store, DMVs)</span>
          </button>
          <button
            className={`deep-dive-btn ${activeLevel === 'corrections' ? 'active' : ''}`}
            onClick={() => setActiveLevel('corrections')}
          >
            <Sparkles size={14} color="#34d399" />
            <span>PDF Review: Corrections & Verified Points</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION: MODERN CORRECTIONS & UPGRADES CALLOUT                          */}
      {/* ========================================================================= */}
      {(activeLevel === 'corrections' || activeLevel === 'all') && (
        <div className="methodology-section glass-panel">
          <div className="section-title-row">
            <div className="section-title-group">
              <div className="section-badge-icon badge-green-glow">
                <Sparkles size={18} color="#34d399" />
              </div>
              <div>
                <h3 className="section-title">PDF Review: What Changed, What Was Wrong, What Was Right</h3>
                <p className="section-subtitle">
                  Your PDF was extracted and each claim was checked against current SQL Server behavior (2016 to 2022 and Azure SQL). Entries show the exact PDF wording and what is different today. Items that were already correct are listed at the bottom.</p>
              </div>
            </div>
          </div>

          <CorrectionsGrid />
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION: LEVEL 1 - DEVELOPMENT & QUERY OPTIMIZATION                       */}
      {/* ========================================================================= */}
      {(activeLevel === 'level1' || activeLevel === 'all') && (
        <div className="methodology-section glass-panel">
          <div className="section-title-row">
            <div className="section-title-group">
              <div className="section-badge-icon badge-blue-glow">
                <Code2 size={18} color="#38bdf8" />
              </div>
              <div>
                <h3 className="section-title">Level 1: Development Level (SQL Query Optimization)</h3>
                <p className="section-subtitle">
                  Writing sargable, set-based queries with optimal data types directly dictates whether the storage engine can perform index seeks.
                </p>
              </div>
            </div>
          </div>

          <div className="cards-two-col">
            {/* Index Utilization & Sargability */}
            <div className="methodology-card">
              <div className="card-top-head">
                <Zap size={16} color="#38bdf8" />
                <h4>1. Index Seeking & Sargability Fundamentals</h4>
              </div>
              <p className="card-desc">
                An index seek requires a search argument (<strong>SARG</strong>) of the form <code>Column &lt;operator&gt; &lt;literal/parameter&gt;</code>. Applying expressions or mismatched data types forces SQL Server to convert every row, invalidating B-Tree ordering.
              </p>

              <div className="sargable-table-wrap">
                <table className="sargable-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Syntax Pattern</th>
                      <th>Engine Consequence</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><span className="badge badge-low">SARGABLE</span></td>
                      <td><code>WHERE OrderDate &gt;= '2024-01-01'</code></td>
                      <td>Index Seek along B-Tree branch & leaf level</td>
                    </tr>
                    <tr>
                      <td><span className="badge badge-critical">NON-SARG</span></td>
                      <td><code>WHERE YEAR(OrderDate) = 2024</code></td>
                      <td>Full Index/Table Scan (Function evaluated on all rows)</td>
                    </tr>
                    <tr>
                      <td><span className="badge badge-low">SARGABLE</span></td>
                      <td><code>WHERE LastName LIKE 'Smith%'</code></td>
                      <td>Index Seek range with upper/lower bounds</td>
                    </tr>
                    <tr>
                      <td><span className="badge badge-critical">NON-SARG</span></td>
                      <td><code>WHERE LastName LIKE '%Smith'</code></td>
                      <td>Full Table Scan (Leading wildcard breaks B-Tree order)</td>
                    </tr>
                    <tr>
                      <td><span className="badge badge-critical">NON-SARG</span></td>
                      <td><code>WHERE VarcharCol = @NvarcharParam</code></td>
                      <td><code>CONVERT_IMPLICIT</code> scan on column</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Minimizing Retrieval & Data Types */}
            <div className="methodology-card">
              <div className="card-top-head">
                <Database size={16} color="#c084fc" />
                <h4>2. Data Retrieval, Compression & Data Types</h4>
              </div>
              <ul className="bullet-feature-list">
                <li>
                  <strong>Never use <code>SELECT *</code>:</strong> Forces Key Lookups or Wide Table Scans. Selecting only required columns enables <em>Covering Nonclustered Indexes</em> (index contains all queried columns).
                </li>
                <li>
                  <strong>UNION ALL over UNION:</strong> <code>UNION</code> executes an expensive Sort Distinct operator to deduplicate records. If streams are already distinct, <code>UNION ALL</code> runs as a zero-cost Concatenation.
                </li>
                <li>
                  <strong>Fixed vs Variable Data Types:</strong> Use <code>VARCHAR</code> for variable-length strings to save page space, but avoid over-sizing (e.g. <code>VARCHAR(8000)</code>) as it inflates memory grant reservations.
                </li>
                <li>
                  <strong>Row & Page Compression:</strong> Reduces physical storage footprint, increasing the density of rows per 8KB page. This reduces disk I/O at the slight cost of minor CPU decompression overhead.
                </li>
                <li>
                  <strong>Sparse Columns:</strong> Zero space allocated for NULL values. Ideal for schemas with hundreds of optional attributes (supported in SQL Server).
                </li>
              </ul>
            </div>
          </div>

          {/* Join Algorithms & Comparison */}
          <div className="methodology-card" style={{ marginTop: '16px' }}>
            <div className="card-top-head">
              <Sliders size={16} color="#fbbf24" />
              <h4>3. Analyzing Join Strategies (Nested Loops, Hash Match, Merge & Adaptive)</h4>
            </div>
            <p className="card-desc">
              SQL Server selects among 4 physical join algorithms based on cardinality estimates, sorting, and available memory:
            </p>

            <div className="join-cards-grid">
              <div className="join-type-box">
                <div className="join-type-header">
                  <span className="join-name">Nested Loops</span>
                  <span className="badge badge-info">OLTP / Small Sets</span>
                </div>
                <p>For each row in outer input, seeks inner input. Highly effective when outer set is small and inner table has a matching index.</p>
                <div className="join-specs">
                  <span><strong>Memory Grant:</strong> None (Streaming)</span>
                  <span><strong>Prerequisite:</strong> Inner index</span>
                </div>
              </div>

              <div className="join-type-box">
                <div className="join-type-header">
                  <span className="join-name">Hash Match</span>
                  <span className="badge badge-warning">Big Data / Ad-hoc</span>
                </div>
                <p>Builds an in-memory hash table on the smaller input, then probes it with the larger input. Suitable for large unsorted sets with no indexes.</p>
                <div className="join-specs">
                  <span><strong>Memory Grant:</strong> Heavy (Can spill to TempDB)</span>
                  <span><strong>Prerequisite:</strong> None</span>
                </div>
              </div>

              <div className="join-type-box">
                <div className="join-type-header">
                  <span className="join-name">Merge Join</span>
                  <span className="badge badge-low">Pre-Sorted Data</span>
                </div>
                <p>Simultaneously zips through two sorted inputs in order. Very fast and lightweight on CPU if inputs are already sorted by clustered indexes.</p>
                <div className="join-specs">
                  <span><strong>Memory Grant:</strong> Low</span>
                  <span><strong>Prerequisite:</strong> Both inputs pre-sorted</span>
                </div>
              </div>

              <div className="join-type-box">
                <div className="join-type-header">
                  <span className="join-name">Adaptive Join</span>
                  <span className="badge badge-purple">Adaptive / Batch</span>
                </div>
                <p>Calculates an adaptive row threshold. If runtime row count is below threshold, executes Nested Loops; if above, switches to Hash Join.</p>
                <div className="join-specs">
                  <span><strong>Engine:</strong> SQL 2017 (CS) & 2019+ (Rowstore)</span>
                  <span><strong>Prerequisite:</strong> Batch Mode enabled</span>
                </div>
              </div>
            </div>
          </div>

          {/* EXISTS vs COUNT(*) and Subqueries */}
          <div className="cards-two-col" style={{ marginTop: '16px' }}>
            <div className="methodology-card">
              <div className="card-top-head">
                <CheckCircle2 size={16} color="#34d399" />
                <h4>4. EXISTS vs COUNT(*) &gt; 0 for Existence Checks</h4>
              </div>
              <p className="card-desc">
                Using <code>COUNT(*)</code> forces the engine to scan the entire table/index to compute total row count. <code>EXISTS</code> utilizes <strong>Early Termination (Short-Circuiting)</strong>, stopping immediately on row #1.
              </p>

              <div className="code-comparison-box">
                <div className="code-block-col">
                  <span className="code-col-title bad-title">❌ Inefficient: Full Scan</span>
                  <pre><code>{`DECLARE @cnt INT;
SELECT @cnt = COUNT(*)
FROM Sales.SalesOrderDetail
WHERE OrderQty = 1;

IF @cnt > 0
    PRINT 'Record Exists';`}</code></pre>
                </div>
                <div className="code-block-col">
                  <span className="code-col-title good-title">✅ Optimized: Early Termination</span>
                  <pre><code>{`IF EXISTS (
    SELECT 1
    FROM Sales.SalesOrderDetail
    WHERE OrderQty = 1
)
    PRINT 'Record Exists';`}</code></pre>
                </div>
              </div>
            </div>

            <div className="methodology-card">
              <div className="card-top-head">
                <RotateCcw size={16} color="#f43f5e" />
                <h4>5. Subquery & Calculation Offloading</h4>
              </div>
              <ul className="bullet-feature-list">
                <li>
                  <strong>Subqueries vs Joins vs CTEs:</strong> Deeply nested correlated subqueries can confuse the optimizer. Rewrite into set-based joins or indexed <code>#temp</code> tables to simplify plan generation.
                </li>
                <li>
                  <strong>Offloading Complex Transformations:</strong> Move non-relational computations (e.g. heavy string parsing, complex mathematical models, machine learning inferencing) to application servers. Database engines excel at set-based data retrieval, whereas application layers scale horizontally with multicore CPUs and RAM.
                </li>
                <li>
                  <strong>Avoid ORDER BY in Subqueries:</strong> <code>ORDER BY</code> inside subqueries, views, or CTEs is useless without <code>TOP</code> or <code>OFFSET</code>, and wastes CPU cycles if an unnecessary sort occurs.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {(activeLevel === 'level1' || activeLevel === 'all') && <Level1Extras onCopy={handleCopyCode} copiedId={copiedScriptId} />}

      {/* ========================================================================= */}
      {/* SECTION: LEVEL 2 - PROCEDURAL LEVEL                                       */}
      {/* ========================================================================= */}
      {(activeLevel === 'level2' || activeLevel === 'all') && (
        <div className="methodology-section glass-panel">
          <div className="section-title-row">
            <div className="section-title-group">
              <div className="section-badge-icon badge-purple-glow">
                <Layers size={18} color="#c084fc" />
              </div>
              <div>
                <h3 className="section-title">Level 2: Procedural Level (Stored Procedures & T-SQL Logic)</h3>
                <p className="section-subtitle">
                  Procedural code manages execution flow, transactions, and state. Eliminating iterative row-by-row loops (RBAR), managing transaction scopes, and choosing the right temporary storage structures are critical.
                </p>
              </div>
            </div>
          </div>

          <div className="cards-two-col">
            {/* Temporary Tables vs Table Variables */}
            <div className="methodology-card">
              <div className="card-top-head">
                <Table size={16} color="#38bdf8" />
                <h4>1. #Temp Tables vs @Table Variables</h4>
              </div>
              <p className="card-desc">
                Both reside physically in TempDB. However, their optimizer behavior is radically different:
              </p>

              <div className="comparison-table-wrap">
                <table className="sargable-table">
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Temporary Table (#Temp)</th>
                      <th>Table Variable (@Table)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Distribution Stats</strong></td>
                      <td><span className="badge badge-low">Yes (Full Column Histograms)</span></td>
                      <td><span className="badge badge-critical">No (Always 1 row estimate*)</span></td>
                    </tr>
                    <tr>
                      <td><strong>Index Creation</strong></td>
                      <td>Clustered & Nonclustered Indexes</td>
                      <td>Only Primary Key / Unique inline</td>
                    </tr>
                    <tr>
                      <td><strong>Parallelism</strong></td>
                      <td>Can participate in Parallel plans</td>
                      <td>Historically serial execution</td>
                    </tr>
                    <tr>
                      <td><strong>Transaction Scope</strong></td>
                      <td>Rolled back if transaction aborts</td>
                      <td>Outlives rollback (preserves data)</td>
                    </tr>
                    <tr>
                      <td><strong>Best Use Case</strong></td>
                      <td>&gt; 50 rows, complex joins, filters</td>
                      <td>Strictly &lt; 50 rows (Lookup tables)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="table-caption">*SQL Server 2019 Deferred Compilation provides dynamic cardinality for @table on first execution.</p>
            </div>

            {/* Set-Based Operations over RBAR */}
            <div className="methodology-card">
              <div className="card-top-head">
                <RotateCcw size={16} color="#f43f5e" />
                <h4>2. Set-Based Operations vs Cursors / Loops (RBAR)</h4>
              </div>
              <p className="card-desc">
                Row-By-Agonizing-Row (RBAR) processing iteratively switches execution contexts, causing immense CPU overhead and <code>SOS_SCHEDULER_YIELD</code> waits.
              </p>

              <ul className="bullet-feature-list">
                <li>
                  <strong>Set-Based Batching:</strong> Replace <code>WHILE</code> loops with direct set-based <code>INSERT...SELECT</code>, <code>UPDATE...FROM</code>, or <code>DELETE...WHERE</code>.
                </li>
                <li>
                  <strong>Optimizing Necessary Cursors:</strong> If business logic strictly requires a cursor, configure it with:
                  <code>DECLARE cur CURSOR LOCAL FAST_FORWARD FOR ...</code>
                  (<code>FAST_FORWARD</code> enables a read-only, forward-only cursor with minimal locking and memory overhead).
                </li>
                <li>
                  <strong>Delta / Preserved Tables:</strong> Instead of executing a full table truncate and reload, implement incremental delta loading (Upsert / Merge / Staging) to minimize transaction log churn.
                </li>
              </ul>
            </div>
          </div>

          <div className="cards-two-col" style={{ marginTop: '16px' }}>
            {/* Transaction Management */}
            <div className="methodology-card">
              <div className="card-top-head">
                <Clock size={16} color="#fbbf24" />
                <h4>3. Transaction Management & Lock Duration</h4>
              </div>
              <ul className="bullet-feature-list">
                <li>
                  <strong>Keep Transactions Short:</strong> Lock duration equals transaction duration. Never include external network calls, file exports, or user input inside a transaction.
                </li>
                <li>
                  <strong>SET NOCOUNT ON:</strong> Suppresses the <code>(1 row affected)</code> network packets for every single statement, reducing network latency in loops and stored procedures.
                </li>
                <li>
                  <strong>Handle Errors with XACT_ABORT:</strong> Use <code>SET XACT_ABORT ON</code> and structured <code>BEGIN TRY...BEGIN CATCH</code> to ensure failed transactions roll back cleanly without leaving orphaned uncommitted locks.
                </li>
              </ul>
            </div>

            {/* Plan Caching & Stored Procedures */}
            <div className="methodology-card">
              <div className="card-top-head">
                <Sparkles size={16} color="#34d399" />
                <h4>4. Parameterization & Plan Caching</h4>
              </div>
              <ul className="bullet-feature-list">
                <li>
                  <strong>Parameterized Procedures:</strong> Allows SQL Server to compile an optimal execution plan once and store it in the plan cache for subsequent executions, eliminating CPU compilation overhead.
                </li>
                <li>
                  <strong>Avoid Ad-hoc Concatenation:</strong> Dynamic SQL like <code>EXEC('SELECT * FROM t WHERE id = ' + @id)</code> floods the plan cache with single-use plans. Always use <code>sp_executesql</code> with strongly-typed parameter definitions.
                </li>
                <li>
                  <strong>Avoid Excessive Triggers:</strong> Triggers execute synchronously inside the parent DML transaction, creating nested transaction trees that prolong lock holding times.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {(activeLevel === 'level2' || activeLevel === 'all') && <Level2Extras onCopy={handleCopyCode} copiedId={copiedScriptId} />}

      {/* ========================================================================= */}
      {/* SECTION: LEVEL 3 - ARCHITECTURE & DBA LEVEL                               */}
      {/* ========================================================================= */}
      {(activeLevel === 'level3' || activeLevel === 'all') && (
        <div className="methodology-section glass-panel">
          <div className="section-title-row">
            <div className="section-title-group">
              <div className="section-badge-icon badge-amber-glow">
                <Database size={18} color="#fbbf24" />
              </div>
              <div>
                <h3 className="section-title">Level 3: Architecture & DBA Level (Engine Configuration & Schema)</h3>
                <p className="section-subtitle">
                  Ensures optimal database layout, index lifecycle, statistics accuracy, concurrency isolation, and server-level configurations to maximize throughput across mixed workloads.
                </p>
              </div>
            </div>
          </div>

          <div className="cards-two-col">
            {/* Statistics Maintenance */}
            <div className="methodology-card">
              <div className="card-top-head">
                <Activity size={16} color="#38bdf8" />
                <h4>1. Statistics Maintenance & Ascending Key Problem</h4>
              </div>
              <p className="card-desc">
                Statistics are the foundation of the Query Optimizer. Outdated histograms lead directly to catastrophic cardinality skews:
              </p>
              <ul className="bullet-feature-list">
                <li>
                  <strong>The Ascending Key Problem:</strong> Columns like auto-incrementing identity IDs or <code>CreatedDate</code> constantly receive values beyond the highest histogram step. If statistics are not updated, the optimizer predicts <strong>1 row</strong> for new records, leading to massive under-estimation and spills!
                </li>
                <li>
                  <strong>Auto Update Statistics Asynchronously:</strong> Enable <code>AUTO_UPDATE_STATISTICS_ASYNC ON</code> so background threads refresh stale statistics without blocking the executing user query.
                </li>
                <li>
                  <strong>Maintenance Strategy:</strong> Run scheduled <code>FULLSCAN</code> on critical large tables, especially before major batch jobs.
                </li>
              </ul>

              <div className="tsql-copy-card">
                <div className="tsql-header">
                  <span>Diagnostic: Check Most Outdated Statistics</span>
                  <button
                    className="btn-copy-sm"
                    onClick={() =>
                      handleCopyCode(
                        'stats-dmv',
                        `SELECT 
    obj.name AS TableName,
    stat.name AS StatName,
    sp.last_updated AS LastUpdated,
    sp.rows AS TotalRows,
    sp.rows_sampled AS RowsSampled,
    sp.modification_counter AS RowsModifiedSinceUpdate,
    CAST(100.0 * sp.modification_counter / NULLIF(sp.rows, 0) AS DECIMAL(5,2)) AS PercentModified
FROM sys.stats stat
JOIN sys.objects obj ON stat.object_id = obj.object_id
CROSS APPLY sys.dm_db_stats_properties(stat.object_id, stat.stats_id) sp
WHERE obj.is_ms_shipped = 0 AND sp.modification_counter > 500
ORDER BY sp.modification_counter DESC;`
                      )
                    }
                  >
                    {copiedScriptId === 'stats-dmv' ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                    <span>{copiedScriptId === 'stats-dmv' ? 'Copied' : 'Copy T-SQL'}</span>
                  </button>
                </div>
                <pre><code>{`-- Identify tables with high modification counter needing UPDATE STATISTICS
SELECT obj.name, stat.name, sp.last_updated, sp.modification_counter
FROM sys.stats stat
JOIN sys.objects obj ON stat.object_id = obj.object_id
CROSS APPLY sys.dm_db_stats_properties(stat.object_id, stat.stats_id) sp
WHERE obj.is_ms_shipped = 0 AND sp.modification_counter > 500
ORDER BY sp.modification_counter DESC;`}</code></pre>
              </div>
            </div>

            {/* TempDB Architecture */}
            <div className="methodology-card">
              <div className="card-top-head">
                <Sliders size={16} color="#fbbf24" />
                <h4>2. TempDB Architecture & Contention Elimination</h4>
              </div>
              <p className="card-desc">
                TempDB is a global shared resource. Every temporary table, table variable, hash join spill, and sort operation competes for allocation pages (PFS, GAM, SGAM).
              </p>
              <ul className="bullet-feature-list">
                <li>
                  <strong>Multiple Equally-Sized Data Files:</strong> Allocate 1 data file per physical core up to 8 cores. If contention persists, add files in chunks of 4. Ensure equal initial sizing and autogrowth across all files.
                </li>
                <li>
                  <strong>Dedicated High-Speed Storage:</strong> Place TempDB data and log files on dedicated NVMe or fastest SSD arrays to prevent I/O competition with user databases.
                </li>
                <li>
                  <strong>Memory-Optimized TempDB Metadata:</strong> (SQL Server 2019+) Enable to move system table metadata for temporary tables into non-blocking in-memory structures:
                  <code>ALTER SERVER CONFIGURATION SET MEMORY_OPTIMIZED TEMPDB_METADATA = ON;</code>
                </li>
              </ul>
            </div>
          </div>

          <div className="cards-two-col" style={{ marginTop: '16px' }}>
            {/* Index Lifecycle */}
            <div className="methodology-card">
              <div className="card-top-head">
                <Table size={16} color="#c084fc" />
                <h4>3. Index Lifecycle, Fragmentation & Maintenance</h4>
              </div>
              <ul className="bullet-feature-list">
                <li>
                  <strong>Reorganize vs Rebuild Thresholds:</strong>
                  <ul>
                    <li><code>5% to 30% Fragmentation:</code> <code>ALTER INDEX ... REORGANIZE</code> (Online, lightweight defragmentation of leaf pages).</li>
                    <li><code>&gt; 30% Fragmentation:</code> <code>ALTER INDEX ... REBUILD WITH (ONLINE = ON)</code> (Full rebuild, compacts pages and updates statistics).</li>
                  </ul>
                </li>
                <li>
                  <strong>Drop Unused Indexes:</strong> Every index incurs overhead during <code>INSERT</code>, <code>UPDATE</code>, and <code>DELETE</code>. Monitor <code>sys.dm_db_index_usage_stats</code> to identify indexes with high user writes but zero user seeks/scans.
                </li>
                <li>
                  <strong>Fill Factor:</strong> Provision a <code>FILLFACTOR</code> (e.g. 80-90%) only on indexes prone to mid-page inserts to reduce expensive page splits and <code>PAGELATCH_EX</code> contention.
                </li>
              </ul>
            </div>

            {/* Concurrency & Query Store */}
            <div className="methodology-card">
              <div className="card-top-head">
                <Activity size={16} color="#34d399" />
                <h4>4. Query Store & Concurrency (RCSI)</h4>
              </div>
              <ul className="bullet-feature-list">
                <li>
                  <strong>Enable Query Store:</strong> The database "flight data recorder". Captures historical query runtimes, plan regressions, and wait statistics. Allows 1-click plan forcing if a bad plan is cached.
                </li>
                <li>
                  <strong>Read Committed Snapshot Isolation (RCSI):</strong> Enable at the database level:
                  <code>ALTER DATABASE [DB] SET READ_COMMITTED_SNAPSHOT ON;</code>
                  Eliminates shared read locks by providing readers with snapshot row versions from TempDB, resolving reader-writer blocking.
                </li>
                <li>
                  <strong>Resource Governor:</strong> Prioritize resource allocation across workload groups (e.g. prioritize OLTP transactions over heavy BI reporting queries).
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {(activeLevel === 'level3' || activeLevel === 'all') && <Level3Extras onCopy={handleCopyCode} copiedId={copiedScriptId} />}

      {/* ========================================================================= */}
      {/* SECTION: LEVEL 4 - HARDWARE & STORAGE                                     */}
      {/* ========================================================================= */}
      {(activeLevel === 'level4' || activeLevel === 'all') && (
        <div className="methodology-section glass-panel">
          <div className="section-title-row">
            <div className="section-title-group">
              <div className="section-badge-icon badge-rose-glow">
                <Server size={18} color="#f43f5e" />
              </div>
              <div>
                <h3 className="section-title">Level 4: Hardware & Storage Infrastructure</h3>
                <p className="section-subtitle">
                  Hardware performance is governed by 4 pillars: CPU, Memory, Disk I/O, and Network. When physical resources bottleneck, you can either increase capacity or reduce request arrival rates through query optimization.
                </p>
              </div>
            </div>
          </div>

          <div className="cards-two-col">
            {/* Storage Hierarchy */}
            <div className="methodology-card">
              <div className="card-top-head">
                <HardDrive size={16} color="#38bdf8" />
                <h4>1. Storage Hierarchy & Latency Targets</h4>
              </div>
              <p className="card-desc">
                Production database health is measured in milliseconds of disk latency:
              </p>
              <div className="latency-badges-wrap">
                <div className="latency-box box-excellent">
                  <span className="latency-val">&lt; 5 ms</span>
                  <span className="latency-lbl">Excellent (NVMe SSD / SAN Tier 1)</span>
                </div>
                <div className="latency-box box-acceptable">
                  <span className="latency-val">5 - 15 ms</span>
                  <span className="latency-lbl">Acceptable for Data Files</span>
                </div>
                <div className="latency-box box-warning">
                  <span className="latency-val">15 - 20 ms</span>
                  <span className="latency-lbl">Warning: I/O Bottleneck Emerging</span>
                </div>
                <div className="latency-box box-critical">
                  <span className="latency-val">&gt; 20 ms</span>
                  <span className="latency-lbl">Critical: Severe Disk Contention</span>
                </div>
              </div>

              <ul className="bullet-feature-list" style={{ marginTop: '12px' }}>
                <li>
                  <strong>Separate Log & Data Files:</strong> Transaction log writes are sequential, while data file I/O is random. Placing them on separate physical drives prevents head contention and log latency.
                </li>
                <li>
                  <strong>64KB Allocation Unit Size:</strong> Format NTFS / ReFS volumes holding SQL Server data and log files with 64KB block size to align with SQL Server's 64KB extent architecture.
                </li>
              </ul>
            </div>

            {/* Memory & CPU */}
            <div className="methodology-card">
              <div className="card-top-head">
                <Cpu size={16} color="#c084fc" />
                <h4>2. Memory Sizing & MAXDOP Guidelines</h4>
              </div>
              <ul className="bullet-feature-list">
                <li>
                  <strong>Max Server Memory Calculation:</strong> Never leave SQL Server at the default 2,147,483,647 MB. Reserve memory for the OS and external components:
                  <div className="formula-box">
                    <code>Max SQL Memory = Total RAM - (1 GB for OS + 1 GB per 4 GB of RAM between 4-16 GB + 1 GB per 8 GB above 16 GB)</code>
                  </div>
                </li>
                <li>
                  <strong>Page Life Expectancy (PLE):</strong> Measures how long an 8KB data page remains cached in the buffer pool. The old rule of 300 seconds is obsolete. Target:
                  <code>Target PLE = (Buffer Pool GB / 4) * 300 seconds</code>
                </li>
                <li>
                  <strong>Cost Threshold for Parallelism:</strong> The default value of <strong>5</strong> is far too low (established in 1998 on Pentium II CPUs). Setting it to <strong>35–50</strong> prevents simple queries from spinning up parallel coordinator overhead.
                </li>
                <li>
                  <strong>MAXDOP:</strong> Limit MAXDOP to the physical cores per NUMA node (max 8) to prevent cross-NUMA memory transfer latency.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {(activeLevel === 'level4' || activeLevel === 'all') && <Level4Extras onCopy={handleCopyCode} copiedId={copiedScriptId} />}

      {/* ========================================================================= */}
      {/* SECTION: SQLOS SCHEDULER & THREAD LIFECYCLE (DEEP DIVE)                   */}
      {/* ========================================================================= */}
      {(activeLevel === 'sqlos' || activeLevel === 'all') && (
        <div className="methodology-section glass-panel">
          <div className="section-title-row">
            <div className="section-title-group">
              <div className="section-badge-icon badge-blue-glow">
                <Cpu size={18} color="#38bdf8" />
              </div>
              <div>
                <h3 className="section-title">SQLOS Schedulers & Thread Lifecycle Engine</h3>
                <p className="section-subtitle">
                  SQL Server manages its own non-preemptive user-mode scheduling operating system (SQLOS). Every worker thread transitions through a 3-state loop until completion.
                </p>
              </div>
            </div>
          </div>

          {/* Interactive Flow Diagram */}
          <div className="sqlos-diagram-container">
            <div className="sqlos-flow-card">
              <div className="sqlos-step-box step-running">
                <div className="sqlos-node-badge">State 1</div>
                <h4>RUNNING</h4>
                <p>Thread is actively executing instructions on a physical CPU core.</p>
                <div className="sqlos-quantum-pill">Fixed Quantum: 4 milliseconds</div>
              </div>

              <div className="flow-arrow-col">
                <div className="flow-arrow-label">Needs Resource (I/O, Lock, Latch)</div>
                <div className="arrow-line-down">➔</div>
                <div className="flow-arrow-sub">State changes to SUSPENDED</div>
              </div>

              <div className="sqlos-step-box step-suspended">
                <div className="sqlos-node-badge">State 2</div>
                <h4>SUSPENDED</h4>
                <p>Thread is placed on the <strong>Waiter List</strong> (unordered queue). Waits for resource signal.</p>
                <div className="sqlos-metrics-tag">Wait Time Accumulates Here</div>
              </div>

              <div className="flow-arrow-col">
                <div className="flow-arrow-label">Resource Granted / Quantum Expired</div>
                <div className="arrow-line-down">➔</div>
                <div className="flow-arrow-sub">Thread moves to Runnable Queue</div>
              </div>

              <div className="sqlos-step-box step-runnable">
                <div className="sqlos-node-badge">State 3</div>
                <h4>RUNNABLE</h4>
                <p>Thread has all resources and is waiting for CPU core scheduler to become free (FIFO queue).</p>
                <div className="sqlos-metrics-tag">Signal Wait Time Accumulates</div>
              </div>

              <div className="flow-arrow-col">
                <div className="flow-arrow-label">Scheduler Dispatches Thread</div>
                <div className="arrow-line-down">➔</div>
                <div className="flow-arrow-sub">Back to RUNNING on Processor</div>
              </div>
            </div>

            {/* Quantum Exhaustion & Resource Governor Details */}
            <div className="sqlos-details-grid">
              <div className="methodology-card">
                <div className="card-top-head">
                  <Clock size={16} color="#fbbf24" />
                  <h4>Quantum Exhaustion (4ms Fixed Slice)</h4>
                </div>
                <p className="card-desc">
                  If a thread executes on the CPU for 4 milliseconds without needing to wait for any external resource (e.g. scanning an in-memory table), it voluntarily yields the CPU:
                </p>
                <ul className="bullet-feature-list">
                  <li>The thread yields voluntarily and moves <strong>directly from RUNNING to the RUNNABLE Queue</strong> without ever entering SUSPENDED.</li>
                  <li>This records an <code>SOS_SCHEDULER_YIELD</code> wait type with <strong>zero resource wait time</strong> (only signal wait time).</li>
                  <li>If the Runnable Queue is long, this indicates high CPU pressure or tight loops.</li>
                </ul>
              </div>

              <div className="methodology-card">
                <div className="card-top-head">
                  <Sliders size={16} color="#c084fc" />
                  <h4>Resource Governor 9:3:1 Priority Scheduling</h4>
                </div>
                <p className="card-desc">
                  SQL Server Enterprise Edition allows defining relative priorities across workload groups sharing a resource pool:
                </p>
                <div className="priority-ratio-box">
                  <div className="ratio-item ratio-high">
                    <span className="ratio-num">9</span>
                    <span className="ratio-lbl">HIGH Priority</span>
                  </div>
                  <div className="ratio-sep">:</div>
                  <div className="ratio-item ratio-med">
                    <span className="ratio-num">3</span>
                    <span className="ratio-lbl">MEDIUM Priority</span>
                  </div>
                  <div className="ratio-sep">:</div>
                  <div className="ratio-item ratio-low">
                    <span className="ratio-num">1</span>
                    <span className="ratio-lbl">LOW Priority</span>
                  </div>
                </div>
                <p className="card-desc" style={{ marginTop: '8px' }}>
                  For every 1 low-priority thread permitted to run, 3 medium-priority and 9 high-priority threads are allowed to jump ahead in the Runnable Queue and execute first.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION: TOP 9 WAIT TYPES DIAGNOSTIC MATRIX                               */}
      {/* ========================================================================= */}
      {(activeLevel === 'waits' || activeLevel === 'all') && (
        <div className="methodology-section glass-panel">
          <div className="section-title-row">
            <div className="section-title-group">
              <div className="section-badge-icon badge-rose-glow">
                <Activity size={18} color="#f43f5e" />
              </div>
              <div>
                <h3 className="section-title">Top 9 Wait Types Diagnostic Matrix</h3>
                <p className="section-subtitle">
                  Wait statistics identify the exact physical bottleneck obstructing query execution. Avoid knee-jerk configuration changes and diagnose root causes systematically.
                </p>
              </div>
            </div>

            {/* Wait Search */}
            <div className="wait-search-box">
              <Search size={14} color="#64748b" />
              <input
                type="text"
                placeholder="Search wait types (e.g. CXPACKET, WRITELOG)..."
                value={waitSearchQuery}
                onChange={(e) => setWaitSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Wait Tabs */}
          <div className="wait-pill-tabs">
            {TOP_WAIT_DATA.filter((w) =>
              w.name.toLowerCase().includes(waitSearchQuery.toLowerCase()) ||
              w.title.toLowerCase().includes(waitSearchQuery.toLowerCase())
            ).map((w) => (
              <button
                key={w.name}
                className={`wait-pill-btn ${activeWaitType === w.name ? 'active' : ''}`}
                onClick={() => setActiveWaitType(w.name)}
              >
                <span>{w.name}</span>
                <span className="wait-category-tag">{w.category}</span>
              </button>
            ))}
          </div>

          {/* Active Wait Detail Card */}
          {(() => {
            const currentWait = TOP_WAIT_DATA.find((w) => w.name === activeWaitType) || TOP_WAIT_DATA[0];
            return (
              <div className="wait-detail-panel glass-panel">
                <div className="wait-header-row">
                  <div>
                    <span className="badge badge-critical" style={{ fontSize: '11px' }}>
                      {currentWait.category}
                    </span>
                    <h3 className="wait-headline">
                      {currentWait.name}: {currentWait.title}
                    </h3>
                  </div>

                  <div className="wait-knee-jerk-warning">
                    <AlertTriangle size={16} color="#f43f5e" />
                    <div>
                      <strong>AVOID KNEE-JERK REACTION:</strong>
                      <p>{currentWait.avoidKneeJerk}</p>
                    </div>
                  </div>
                </div>

                {WAIT_EXTRA[currentWait.name] && (
                  <div className="wait-further-box">
                    <strong>Further analysis (from your PDF)</strong>
                    <ul className="bullet-feature-list">
                      {WAIT_EXTRA[currentWait.name].further.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                    {WAIT_EXTRA[currentWait.name].note && (
                      <div className="wait-update-note">Update: {WAIT_EXTRA[currentWait.name].note}</div>
                    )}
                  </div>
                )}
                <div className="cards-two-col" style={{ marginTop: '16px' }}>
                  <div className="wait-sub-card">
                    <h4>What Does It Mean?</h4>
                    <p>{currentWait.whatItMeans}</p>

                    <h4 style={{ marginTop: '16px' }}>Possible Root Causes</h4>
                    <ul className="bullet-feature-list">
                      {currentWait.rootCauses.map((rc, idx) => (
                        <li key={idx}>{rc}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="wait-sub-card">
                    <h4>Actionable Solutions & Tuning Playbook</h4>
                    <ul className="bullet-feature-list">
                      {currentWait.solutions.map((sol, idx) => (
                        <li key={idx}>{sol}</li>
                      ))}
                    </ul>

                    <div className="tsql-copy-card" style={{ marginTop: '16px' }}>
                      <div className="tsql-header">
                        <span>Diagnostic T-SQL Script</span>
                        <button
                          className="btn-copy-sm"
                          onClick={() => handleCopyCode(`wait-${currentWait.name}`, currentWait.diagnosticSql)}
                        >
                          {copiedScriptId === `wait-${currentWait.name}` ? (
                            <Check size={12} color="#34d399" />
                          ) : (
                            <Copy size={12} />
                          )}
                          <span>
                            {copiedScriptId === `wait-${currentWait.name}` ? 'Copied' : 'Copy T-SQL'}
                          </span>
                        </button>
                      </div>
                      <pre><code>{currentWait.diagnosticSql}</code></pre>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION: RAID PENALTY CALCULATOR & STORAGE FORMULAS                       */}
      {/* ========================================================================= */}
      {(activeLevel === 'raid' || activeLevel === 'all') && (
        <div className="methodology-section glass-panel">
          <div className="section-title-row">
            <div className="section-title-group">
              <div className="section-badge-icon badge-amber-glow">
                <Calculator size={18} color="#fbbf24" />
              </div>
              <div>
                <h3 className="section-title">RAID Write Penalty & I/O Load Calculator</h3>
                <p className="section-subtitle">
                  Storage drives experience multiplied physical I/O operations per write depending on RAID configuration. Calculate the exact I/O load per disk for your workload.
                </p>
              </div>
            </div>
          </div>

          <div className="cards-two-col">
            {/* Interactive Calculator Inputs */}
            <div className="methodology-card">
              <div className="card-top-head">
                <Sliders size={16} color="#38bdf8" />
                <h4>Workload Parameters</h4>
              </div>

              <div className="calc-inputs-grid">
                <div className="calc-input-group">
                  <label>Read Operations / sec:</label>
                  <input
                    type="number"
                    value={raidReads}
                    onChange={(e) => setRaidReads(Number(e.target.value))}
                    min={0}
                    step={50}
                  />
                </div>

                <div className="calc-input-group">
                  <label>Write Operations / sec:</label>
                  <input
                    type="number"
                    value={raidWrites}
                    onChange={(e) => setRaidWrites(Number(e.target.value))}
                    min={0}
                    step={50}
                  />
                </div>

                <div className="calc-input-group">
                  <label>Number of Disks in Array (N):</label>
                  <input
                    type="number"
                    value={raidDisks}
                    onChange={(e) => setRaidDisks(Number(e.target.value))}
                    min={2}
                    max={64}
                  />
                </div>
              </div>

              <div className="calc-summary-box">
                <span>Total Application I/O: <strong>{raidReads + raidWrites} IOPS</strong></span>
                <span>Workload Profile: <strong>{((raidReads / (raidReads + raidWrites || 1)) * 100).toFixed(0)}% Reads / {((raidWrites / (raidReads + raidWrites || 1)) * 100).toFixed(0)}% Writes</strong></span>
              </div>
            </div>

            {/* Calculated Results Matrix */}
            <div className="methodology-card">
              <div className="card-top-head">
                <HardDrive size={16} color="#34d399" />
                <h4>Calculated Physical I/Os per Disk</h4>
              </div>

              <div className="raid-results-grid">
                <div className="raid-res-card">
                  <div className="raid-res-title">RAID 0 (Striped)</div>
                  <div className="raid-res-val">{raidCalculations.raid0} IOPS/disk</div>
                  <div className="raid-formula">Formula: (R + W) / N</div>
                  <span className="badge badge-low">Write Penalty: 1x (No fault tolerance)</span>
                </div>

                <div className="raid-res-card">
                  <div className="raid-res-title">RAID 1 (Mirrored)</div>
                  <div className="raid-res-val">{raidCalculations.raid1} IOPS/disk</div>
                  <div className="raid-formula">Formula: (R + 2*W) / 2</div>
                  <span className="badge badge-info">Write Penalty: 2x (1 disk failure)</span>
                </div>

                <div className="raid-res-card">
                  <div className="raid-res-title">RAID 5 (Parity)</div>
                  <div className="raid-res-val">{raidCalculations.raid5} IOPS/disk</div>
                  <div className="raid-formula">Formula: (R + 4*W) / N</div>
                  <span className="badge badge-warning">Write Penalty: 4x (2 reads + 2 writes)</span>
                </div>

                <div className="raid-res-card">
                  <div className="raid-res-title">RAID 6 (Dual Parity)</div>
                  <div className="raid-res-val">{raidCalculations.raid6} IOPS/disk</div>
                  <div className="raid-formula">Corrected: (R + 6*W) / N</div>
                  <div className="raid-formula">Your PDF used (N−2): {raidCalculations.raid6Pdf} IOPS/disk</div>
                  <span className="badge badge-critical">Write Penalty: 6x (3 reads + 3 writes)</span>
                </div>

                <div className="raid-res-card highlight-card">
                  <div className="raid-res-title">RAID 10 (Striped Mirror)</div>
                  <div className="raid-res-val">{raidCalculations.raid10} IOPS/disk</div>
                  <div className="raid-formula">Formula: (R + 2*W) / N</div>
                  <span className="badge badge-low">Write Penalty: 2x (Best for OLTP & Logs)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {(activeLevel === 'costly' || activeLevel === 'all') && <CostlyQueriesSection onCopy={handleCopyCode} copiedId={copiedScriptId} />}

      {/* ========================================================================= */}
      {/* SECTION: INTERACTIVE DBA PERFORMANCE AUDIT CHECKLIST                      */}
      {/* ========================================================================= */}
      <div className="methodology-section glass-panel">
        <div className="section-title-row">
          <div className="section-title-group">
            <div className="section-badge-icon badge-green-glow">
              <ShieldCheck size={18} color="#34d399" />
            </div>
            <div>
              <h3 className="section-title">Interactive DBA Performance Audit Checklist</h3>
              <p className="section-subtitle">
                Use this checklist to systematically verify your database health across all 4 optimization levels. Progress is saved interactively.
              </p>
            </div>
          </div>

          <div className="checklist-progress-pill">
            <span>
              {Object.values(completedChecklist).filter(Boolean).length} / {CHECKLIST_ITEMS.length} Completed
            </span>
          </div>
        </div>

        <div className="audit-checklist-grid">
          {CHECKLIST_ITEMS.map((item) => (
            <div
              key={item.id}
              className={`audit-checklist-row ${completedChecklist[item.id] ? 'checked' : ''}`}
              onClick={() => toggleChecklistItem(item.id)}
            >
              <input
                type="checkbox"
                checked={!!completedChecklist[item.id]}
                onChange={() => {}}
                className="audit-checkbox"
              />
              <div className="audit-row-content">
                <div className="audit-row-header">
                  <span className={`badge ${item.levelBadge}`}>{item.level}</span>
                  <span className="audit-title">{item.title}</span>
                </div>
                <p className="audit-desc">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// STATIC DATA: TOP 9 WAITS (FROM USER'S DOCUMENT & MODERN INTERNALS)
// =============================================================================
const TOP_WAIT_DATA = [
  {
    name: 'CXPACKET',
    title: 'Parallelism Thread Coordination & Skew',
    category: 'Parallelism',
    whatItMeans:
      'Query is executing across multiple CPU cores in parallel. A thread has completed its slice of work or is blocked and is waiting for other worker threads in the parallel query team to finish.',
    avoidKneeJerk:
      'Do NOT set server-wide MAXDOP to 1! Disabling parallelism cripples big analytical queries, index maintenance, and DBCC CHECKDB.',
    rootCauses: [
      'Skewed data distribution among worker threads (one thread processes 99% of rows while others sit idle).',
      'Missing indexes forcing parallel table scans.',
      'Outdated statistics causing improper thread allocation.',
      'Cost Threshold for Parallelism set to default (5), triggering parallelism for trivial queries.',
      'One of the worker threads is blocked by an exclusive lock or page latch.'
    ],
    solutions: [
      'Set Cost Threshold for Parallelism to 35–50 to restrict parallelism to genuinely expensive queries.',
      'Configure MAXDOP = physical cores per NUMA node (max 8).',
      'Update statistics with FULLSCAN to eliminate thread cardinality skew.',
      'In SQL Server 2016 SP2 / 2017+, distinguish benign coordinator waits (now classified under CXCONSUMER) from genuine worker skew in CXPACKET.'
    ],
    diagnosticSql: `-- Check for thread workload imbalance in running parallel queries
SELECT 
    r.session_id,
    t.exec_context_id AS thread_id,
    t.scheduler_id,
    t.wait_type,
    t.wait_duration_ms,
    r.cpu_time,
    r.total_elapsed_time,
    st.text AS query_sql
FROM sys.dm_os_waiting_tasks t
JOIN sys.dm_exec_requests r ON t.session_id = r.session_id
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
WHERE t.wait_type IN ('CXPACKET', 'CXCONSUMER')
ORDER BY r.session_id, t.exec_context_id;`
  },
  {
    name: 'PAGEIOLATCH_XX',
    title: 'Data Page Read from Disk into Buffer Pool',
    category: 'Disk I/O / Memory',
    whatItMeans:
      'A query requested a data page that does not reside in the Buffer Pool RAM cache. The task is suspended waiting for the page to be read from physical storage into memory (SH = Shared Read, EX = Exclusive Write).',
    avoidKneeJerk:
      'Do NOT automatically assume the disk storage subsystem is faulty! In 90% of cases, poor query plans (table scans) are forcing SQL Server to read millions of unneeded pages.',
    rootCauses: [
      'Missing indexes causing massive clustered index scans or table scans.',
      'Buffer Pool memory pressure (Page Life Expectancy dropping below threshold).',
      'Implicit data type conversions forcing full index scans.',
      'High storage latency (> 15 ms read latency on data drives).'
    ],
    solutions: [
      'Create covering nonclustered indexes to turn scans into selective index seeks.',
      'Correlate with sys.dm_io_virtual_file_stats to inspect per-drive read latency.',
      'Increase server memory to allow larger buffer pool caching.',
      'Move data files to NVMe or fast enterprise SAN tiering.'
    ],
    diagnosticSql: `-- Identify data files experiencing highest read stall latency
SELECT 
    DB_NAME(fs.database_id) AS DatabaseName,
    mf.name AS LogicalFileName,
    mf.physical_name AS PhysicalPath,
    fs.num_of_reads,
    fs.io_stall_read_ms,
    CAST(fs.io_stall_read_ms / NULLIF(fs.num_of_reads, 0) AS DECIMAL(10,2)) AS AvgReadLatency_ms
FROM sys.dm_io_virtual_file_stats(NULL, NULL) fs
JOIN sys.master_files mf ON fs.database_id = mf.database_id AND fs.file_id = mf.file_id
WHERE fs.num_of_reads > 1000
ORDER BY AvgReadLatency_ms DESC;`
  },
  {
    name: 'WRITELOG',
    title: 'Transaction Log Flush to Disk',
    category: 'Transaction Log / I/O',
    whatItMeans:
      'A transaction has committed (COMMIT TRAN) and is waiting for the 60KB log block buffer in memory to be flushed synchronously to the physical LDF disk file (Write-Ahead Logging protocol).',
    avoidKneeJerk:
      'Do NOT create multiple log files (.ldf)! SQL Server only writes to one log file sequentially at a time; adding more log files provides zero I/O benefit.',
    rootCauses: [
      'Slow disk subsystem hosting the .ldf file (> 5 ms write latency).',
      'Tiny, frequent commits (e.g. committing inside a tight loop instead of batching).',
      'Excessive Virtual Log Files (VLF fragmentation) due to small autogrowth increments.',
      'Massive page splits in indexes with random GUID clustering keys.'
    ],
    solutions: [
      'Move transaction log (.ldf) files to dedicated ultra-fast NVMe storage.',
      'Batch multiple INSERTs/UPDATEs into a single transaction to reduce log block flushes.',
      'Pre-size log file and fix autogrowth to prevent VLF proliferation (> 1,000 VLFs).',
      'Remove unused nonclustered indexes to reduce DML logging overhead.'
    ],
    diagnosticSql: `-- Check Transaction Log Flush Latency and VLF counts
SELECT 
    DB_NAME(fs.database_id) AS DatabaseName,
    mf.name AS LogFileName,
    fs.num_of_writes,
    fs.io_stall_write_ms,
    CAST(fs.io_stall_write_ms / NULLIF(fs.num_of_writes, 0) AS DECIMAL(10,2)) AS AvgLogWriteLatency_ms
FROM sys.dm_io_virtual_file_stats(NULL, NULL) fs
JOIN sys.master_files mf ON fs.database_id = mf.database_id AND fs.file_id = mf.file_id
WHERE mf.type_desc = 'LOG';`
  },
  {
    name: 'ASYNC_NETWORK_IO',
    title: 'Client Application Consumption Delay',
    category: 'Network / Client App',
    whatItMeans:
      'SQL Server has populated network output buffers and is waiting for the client application to acknowledge receipt and fetch more data packets. The database engine is throttled by the client.',
    avoidKneeJerk:
      'Do NOT blame the network infrastructure or routers! In almost all cases, the network is fine; the client application code is processing data Row-By-Agonizing-Row (RBAR).',
    rootCauses: [
      'Client application fetching huge result sets and processing row-by-row before reading next batch.',
      'Query executed in SSMS grid mode returning 500,000 rows (SSMS UI rendering bottleneck).',
      'Third-party ORM client buffering unpaged queries into memory.',
      'Network interface card (NIC) misconfiguration or duplex mismatch (rare).'
    ],
    solutions: [
      'Optimize client code: use DataReader streaming or fetch smaller paged sets.',
      'Apply filtering in T-SQL instead of downloading millions of rows for app-level filtering.',
      'Implement OFFSET-FETCH or pagination for large data grids.'
    ],
    diagnosticSql: `-- Identify queries currently waiting on client consumption
SELECT 
    r.session_id,
    r.status,
    r.command,
    t.wait_duration_ms,
    r.cpu_time,
    r.total_elapsed_time,
    st.text AS query_sql
FROM sys.dm_os_waiting_tasks t
JOIN sys.dm_exec_requests r ON t.session_id = r.session_id
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
WHERE t.wait_type = 'ASYNC_NETWORK_IO'
ORDER BY t.wait_duration_ms DESC;`
  },
  {
    name: 'PAGELATCH_XX',
    title: 'In-Memory Buffer Pool Data Page Contention',
    category: 'Memory / Concurrency',
    whatItMeans:
      'Short-term in-memory synchronization latch protecting an 8KB data page that is ALREADY loaded in RAM. Threads are competing to read/write the same in-memory page structure simultaneously.',
    avoidKneeJerk:
      'Do NOT confuse PAGELATCH with PAGEIOLATCH! PAGEIOLATCH is disk I/O; PAGELATCH is purely in-memory concurrency contention.',
    rootCauses: [
      'Classic TempDB allocation contention on PFS, GAM, and SGAM pages (Page 1, 2, 3).',
      'Last-page insert hotspots on clustered indexes with monotonically increasing keys (e.g. IDENTITY or GETDATE()).',
      'Frequent page splits occurring during heavy concurrent inserts.'
    ],
    solutions: [
      'For TempDB: Configure 8 equal data files, enable TF 1118 (default in 2016+), enable In-Memory TempDB Metadata.',
      'For Last-Page Hotspots: Hash the clustering key, use partition-based staggering, or provision index FILLFACTOR.',
      'Inspect wait resource (e.g. 2:1:1 = DB 2 [TempDB], File 1, Page 1 [PFS]).'
    ],
    diagnosticSql: `-- Decode PAGELATCH wait resources to pinpoint table & page
SELECT 
    session_id,
    wait_type,
    wait_duration_ms,
    wait_resource,
    SUBSTRING(wait_resource, 1, CHARINDEX(':', wait_resource) - 1) AS DatabaseId
FROM sys.dm_os_waiting_tasks
WHERE wait_type LIKE 'PAGELATCH_%'
ORDER BY wait_duration_ms DESC;`
  },
  {
    name: 'SOS_SCHEDULER_YIELD',
    title: 'Thread Quantum Exhaustion (CPU Yielding)',
    category: 'CPU Scheduling',
    whatItMeans:
      'A worker thread has consumed its entire 4 millisecond CPU quantum without encountering an I/O or locking wait, and has voluntarily stepped down to let another thread execute.',
    avoidKneeJerk:
      'Do NOT immediately assume CPU core count is inadequate. Often it means a query is running an unindexed table scan or nested loop that is entirely cached in RAM.',
    rootCauses: [
      'In-memory table scans processing millions of cached pages without disk waits.',
      'Scalar user-defined functions (UDFs) executing iterative logic per row.',
      'High runnable queue lengths indicating insufficient CPU threads for workload.',
      'Spinlock contention on high-core server architectures.'
    ],
    solutions: [
      'Add missing indexes to eliminate CPU-intensive memory scans.',
      'Inline scalar UDFs or rewrite as Inline Table-Valued Functions (iTVFs).',
      'Enable Hyper-Threading to provide additional logical schedulers for OLTP concurrency.',
      'Examine runnable tasks count via sys.dm_os_schedulers.'
    ],
    diagnosticSql: `-- Check CPU Scheduler health and runnable worker task queues
SELECT 
    scheduler_id,
    cpu_id,
    status,
    is_online,
    current_tasks_count,
    runnable_tasks_count,
    current_workers_count,
    work_queue_count
FROM sys.dm_os_schedulers
WHERE status = 'VISIBLE ONLINE'
ORDER BY runnable_tasks_count DESC;`
  },
  {
    name: 'LCK_M_XX',
    title: 'Lock Blocking & Concurrency Conflicts',
    category: 'Locking / Concurrency',
    whatItMeans:
      'A task is waiting to acquire a lock (e.g. Shared, Exclusive, Intent-Exclusive) on a row, page, or table, but cannot proceed because another session holds an incompatible lock.',
    avoidKneeJerk:
      'Do NOT default to sprinkling NOLOCK everywhere! Dirty reads can return corrupted data and phantom rows.',
    rootCauses: [
      'Long-running transactions holding exclusive locks during batch updates.',
      'Lock escalation from row-level locks to a full table lock (> 5,000 row modifications).',
      'Queries scanning large tables under default READ COMMITTED isolation.',
      'Synchronous High Availability (Availability Group / Mirroring) commit delays.'
    ],
    solutions: [
      'Enable Read Committed Snapshot Isolation (RCSI) so readers do not block writers.',
      'Break massive updates into smaller chunks (e.g. 2,000 rows per batch).',
      'Enable partition-level lock escalation: ALTER TABLE t SET (LOCK_ESCALATION = AUTO).',
      'Capture blocked process reports in Extended Events.'
    ],
    diagnosticSql: `-- Find current blocking chains and lead blocking SPID
SELECT 
    blocking.session_id AS BlockingSessionId,
    blocked.session_id AS BlockedSessionId,
    blocked.wait_type,
    blocked.wait_duration_ms,
    blocked_txt.text AS BlockedSQL,
    blocking_txt.text AS BlockingSQL
FROM sys.dm_os_waiting_tasks blocked
JOIN sys.dm_exec_requests r ON blocked.session_id = r.session_id
JOIN sys.dm_exec_sessions blocking ON blocked.blocking_session_id = blocking.session_id
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) blocked_txt
OUTER APPLY (
    SELECT TOP 1 st.text 
    FROM sys.dm_exec_requests r2
    CROSS APPLY sys.dm_exec_sql_text(r2.sql_handle) st
    WHERE r2.session_id = blocking.session_id
) blocking_txt
WHERE blocked.wait_type LIKE 'LCK_%';`
  },
  {
    name: 'OLEDB',
    title: 'OLE DB External Provider & DMV Processing',
    category: 'External / DMVs',
    whatItMeans:
      'SQL Server has called out through the OLE DB provider interface and is waiting for data to return from the external provider.',
    avoidKneeJerk:
      'Do NOT assume linked servers are configured! SQL Server uses OLE DB internally for many operations.',
    rootCauses: [
      'Third-party monitoring agents polling DMVs (many DMVs use OLE DB internally).',
      'DBCC CHECKDB integrity check processing.',
      'Slow performance or network latency to a remote Linked Server.'
    ],
    solutions: [
      'Verify if linked servers are actively executing slow queries; push filters to remote server.',
      'Check if monitoring tools are querying heavy DMVs at high frequency (e.g. every second).',
      'Schedule DBCC CHECKDB to run during low-traffic maintenance windows.'
    ],
    diagnosticSql: `-- Check active linked server requests or external calls
SELECT session_id, wait_type, wait_duration_ms, wait_resource
FROM sys.dm_os_waiting_tasks
WHERE wait_type = 'OLEDB'
ORDER BY wait_duration_ms DESC;`
  },
  {
    name: 'BACKUPXX',
    title: 'Backup Engine & Virtual Device Waits',
    category: 'Maintenance',
    whatItMeans:
      'Threads waiting during native backup/restore operations (BACKUPBUFFER, BACKUPIO, BACKUPTHREAD).',
    avoidKneeJerk:
      'Do NOT cancel backups immediately; check throughput and Instant File Initialization (IFI).',
    rootCauses: [
      'Backups writing over slow network shares or tape storage.',
      'Slow target backup drive with insufficient write throughput.',
      'Data file zero-initialization delay (Instant File Initialization disabled).'
    ],
    solutions: [
      'Enable Instant File Initialization (IFI) by granting Perform Volume Maintenance Tasks to SQL Server service account.',
      'Use backup compression to reduce written I/O by 60–80%.',
      'Tune backup buffer count and block size (BUFFERCOUNT, MAXTRANSFERSIZE).'
    ],
    diagnosticSql: `-- Check active backup throughput and ETA
SELECT 
    session_id,
    command,
    percent_complete,
    estimated_completion_time / 60000 AS EstCompletionMinutes,
    total_elapsed_time / 60000 AS ElapsedMinutes
FROM sys.dm_exec_requests
WHERE command LIKE 'BACKUP%' OR command LIKE 'RESTORE%';`
  }
];

// =============================================================================
// STATIC DATA: INTERACTIVE AUDIT CHECKLIST ITEMS
// =============================================================================
const CHECKLIST_ITEMS = [
  {
    id: 'chk-sarg',
    level: 'LEVEL 1: DEV',
    levelBadge: 'badge-blue',
    title: 'Eliminate Non-Sargable Column Expressions',
    description: 'Verify no indexed columns are wrapped in functions (e.g. YEAR(col), SUBSTRING(col)) or CONVERT_IMPLICIT in WHERE/JOIN clauses.'
  },
  {
    id: 'chk-star',
    level: 'LEVEL 1: DEV',
    levelBadge: 'badge-blue',
    title: 'Replace SELECT * with Explicit Columns',
    description: 'Ensure all queries project only necessary columns to enable nonclustered index covering seeks and avoid Key Lookups.'
  },
  {
    id: 'chk-exists',
    level: 'LEVEL 1: DEV',
    levelBadge: 'badge-blue',
    title: 'Use EXISTS over COUNT(*) for Row Checks',
    description: 'Ensure existence verification utilizes early-termination IF EXISTS rather than scanning the entire table with COUNT(*).'
  },
  {
    id: 'chk-union',
    level: 'LEVEL 1: DEV',
    levelBadge: 'badge-blue',
    title: 'Prefer UNION ALL over UNION',
    description: 'Use UNION ALL whenever result streams are known to be distinct to bypass unnecessary sort-distinct operations.'
  },
  {
    id: 'chk-rbar',
    level: 'LEVEL 2: PROCEDURAL',
    levelBadge: 'badge-purple',
    title: 'Eliminate RBAR Loops and Cursors',
    description: 'Convert iterative WHILE loops and scalar row-by-row function calls into set-based batch statements or iTVFs.'
  },
  {
    id: 'chk-temp',
    level: 'LEVEL 2: PROCEDURAL',
    levelBadge: 'badge-purple',
    title: 'Audit #Temp vs @Table Usage',
    description: 'Verify table variables (@table) are strictly limited to < 50 rows; use #temp tables with primary keys for larger sets.'
  },
  {
    id: 'chk-nocount',
    level: 'LEVEL 2: PROCEDURAL',
    levelBadge: 'badge-purple',
    title: 'Set SET NOCOUNT ON in Stored Procedures',
    description: 'Ensure all stored procedures and triggers suppress row-count network roundtrips to reduce network latency.'
  },
  {
    id: 'chk-stats',
    level: 'LEVEL 3: DBA',
    levelBadge: 'badge-amber',
    title: 'Maintain Statistics on Ascending Keys',
    description: 'Schedule frequent statistics updates on high-modification identity and date columns to avoid 1-row estimation regressions.'
  },
  {
    id: 'chk-tempdb',
    level: 'LEVEL 3: DBA',
    levelBadge: 'badge-amber',
    title: 'Configure Equal TempDB Data Files',
    description: 'Provision 1 data file per physical core up to 8 with identical initial sizing and autogrowth settings on fast storage.'
  },
  {
    id: 'chk-rcsi',
    level: 'LEVEL 3: DBA',
    levelBadge: 'badge-amber',
    title: 'Evaluate Read Committed Snapshot (RCSI)',
    description: 'Enable RCSI at database level to eliminate reader-writer blocking concurrency issues without dirty reads.'
  },
  {
    id: 'chk-ctp',
    level: 'LEVEL 4: HARDWARE',
    levelBadge: 'badge-rose',
    title: 'Tune Cost Threshold for Parallelism & MAXDOP',
    description: 'Raise Cost Threshold for Parallelism from default 5 up to 35–50, and cap MAXDOP to NUMA node cores (max 8).'
  },
  {
    id: 'chk-mem',
    level: 'LEVEL 4: HARDWARE',
    levelBadge: 'badge-rose',
    title: 'Cap Max Server Memory',
    description: 'Ensure Max Server Memory leaves sufficient RAM (4–8 GB) for operating system buffer, thread stacks, and external processes.'
  }
];

// Order exactly as listed in the PDF (Top Wait Types)
const PDF_WAIT_ORDER = ['CXPACKET','OLEDB','WRITELOG','ASYNC_NETWORK_IO','PAGEIOLATCH_XX','BACKUPXX','SOS_SCHEDULER_YIELD','PAGELATCH_XX','LCK_M_XX'];
TOP_WAIT_DATA.sort((a, b) => PDF_WAIT_ORDER.indexOf(a.name) - PDF_WAIT_ORDER.indexOf(b.name));

// "Further analysis" bullets taken from the PDF, plus a correction note where relevant
const WAIT_EXTRA: Record<string, { further: string[]; note?: string }> = {
  CXPACKET: {
    further: [
      'Correlate with PAGEIOLATCH_SH waits: if present, suspect large scans.',
      'Examine the plan: does the parallelism make sense?',
      'Find the non-CXPACKET wait of the slow worker thread: that is the real cause.',
      'Example: 1 coordinator + 4 workers. If only the coordinator waits, workers are done and it is the cause; if 3 workers are also stuck, look at those workers.'
    ],
    note: 'Since SQL Server 2016 SP2 / 2017 CU3 the benign consumer wait is reported as CXCONSUMER.'
  },
  OLEDB: { further: ['What are the queries doing that wait on OLEDB?', 'If linked servers are used, what is slow on the remote side?', 'DBCC CHECKDB and many DMVs use OLE DB internally, so a monitoring tool polling DMVs can cause it.'] },
  WRITELOG: {
    further: [
      'Correlate with sys.dm_io_virtual_file_stats latency. Look for LOGBUFFER waits (internal log buffer contention).',
      'Check average disk write queue length for the log drive.',
      'Check average transaction size and whether frequent page splits occur.'
    ],
    note: 'Your PDF cites a 31/32 outstanding-write limit. That was 32 in older builds and 112 per database on 64-bit from SQL Server 2012.'
  },
  ASYNC_NETWORK_IO: { further: ['Analyze client application code (RBAR, slow consumer).', 'Then analyze network latency, duplex settings and TCP offload.', 'Easy to demonstrate: run a big query in SSMS on the same machine as the server.'] },
  PAGEIOLATCH_XX: {
    further: [
      'SH mode: the page will be read. EX mode: the page will be changed.',
      'Find which tables and indexes are being read.',
      'Check latency with sys.dm_io_virtual_file_stats and the Avg Disk sec/Read counter.',
      'Look for implicit conversions in plans and for buffer pool pressure (Page Life Expectancy).'
    ]
  },
  BACKUPXX: { further: ['BACKUPBUFFER: waiting for a buffer or data (slow tape or network target?).', 'BACKUPIO: reading data files (slow data I/O?).', 'BACKUPTHREAD: waiting on another thread, such as zero-initialization (see PREEMPTIVE_OS_WRITEFILEGATHER).'] },
  SOS_SCHEDULER_YIELD: {
    further: [
      'It means the thread used its 4 ms quantum and yielded, or it is backing off a spinlock.',
      'These waits have zero resource wait time and do NOT appear in sys.dm_os_waiting_tasks.',
      'A tiny count of PAGEIOLATCH waits suggests the workload is memory-resident. Look for long Runnable Queues.',
      'Call-stack analysis usually shows spinlocks are not involved.'
    ]
  },
  PAGELATCH_XX: {
    further: ['SH: page will be read. EX: page will be changed (both in memory).', 'It does NOT mean add memory or I/O capacity.', 'Find the page(s) waited on, the queries, and the table and index structure.'],
    note: 'Trace flag 1118 in your PDF is built in since SQL Server 2016. Add equal-sized TempDB files instead.'
  },
  LCK_M_XX: {
    further: [
      'Follow the blocking chain with sys.dm_os_waiting_tasks to the lead blocker.',
      'Use the blocked process report to capture long lock waits.',
      'Synchronous mirroring or AG commit delay can hold locks longer.'
    ],
    note: 'Prefer snapshot isolation (RCSI) over Read Uncommitted. Dirty reads can return wrong data.'
  }
};
