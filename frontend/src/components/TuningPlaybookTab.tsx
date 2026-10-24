import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  GitFork,
  Search,
  Filter,
  Flame,
  Code2,
  Copy,
  Check,
  Zap,
  ArrowRight,
  Database,
  Layers,
  Cpu,
  Sliders,
  ChevronDown,
  ChevronRight,
  Info,
  ExternalLink,
  ShieldAlert,
  Boxes,
  Compass
} from 'lucide-react';
import { PlanAnalysis, StatementAnalysis } from '../types/plan';
import { PerformanceProcessView } from './PerformanceProcessView';
import { AdvancedOptimizationView } from './AdvancedOptimizationView';

interface TuningPlaybookTabProps {
  plan: PlanAnalysis | null;
  onNavigateToStatement?: (stmt: StatementAnalysis) => void;
}

interface AntiPatternItem {
  id: string;
  title: string;
  category: 'Joins & Physics' | 'Sargability & Syntax' | 'Memory & TempDB' | 'Cardinality & Statistics' | 'Parallelism & Concurrency';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';
  summary: string;
  engineMechanics: string;
  asciiDiagram?: string;
  badSql: string;
  goodSql: string;
  remedyList: string[];
  detectorKey: string;
  applicableHints: string[];
}

const PLAYBOOK_PATTERNS: AntiPatternItem[] = [
  {
    id: 'non-sargable-convert',
    title: 'Non-Sargable Implicit Data Type Conversions',
    category: 'Sargability & Syntax',
    severity: 'CRITICAL',
    summary:
      'Applying CONVERT_IMPLICIT to indexed columns forces full table/index scans because B-Tree order is lost.',
    engineMechanics:
      'When comparing columns of different data types (e.g. VARCHAR column compared with NVARCHAR parameter, or INT compared with BIGINT), SQL Server data type precedence rules force the lower-precedence column to be converted on-the-fly for EVERY row. The storage engine cannot use B-tree index seek predicates.',
    asciiDiagram: `[Query Predicate] WHERE VarcharCol = N'TestVal'
       │ (Data Type Precedence: NVARCHAR > VARCHAR)
       ▼
[Storage Engine] CONVERT_IMPLICIT(nvarchar(50), [VarcharCol], 0) = N'TestVal'
       │ (Expression applied to column -> Index Seek BLOCKED)
       ▼
[Plan Operator] Clustered Index Scan (100% of pages read from disk)`,
    badSql: `-- Bad: Parameter is NVARCHAR, but column is VARCHAR(50)
DECLARE @AccountCode NVARCHAR(50) = N'ACC-9821';
SELECT CustomerID, Balance
FROM dbo.Accounts
WHERE AccountCode = @AccountCode; -- CONVERT_IMPLICIT triggers scan!`,
    goodSql: `-- Good: Align parameter type exactly with underlying column
DECLARE @AccountCode VARCHAR(50) = 'ACC-9821';
SELECT CustomerID, Balance
FROM dbo.Accounts
WHERE AccountCode = @AccountCode; -- Allows direct Index Seek!`,
    remedyList: [
      'Ensure ORM / ADO.NET parameters use matching data types (e.g. VarChar instead of NVarChar).',
      'Never wrap indexed columns inside functions in WHERE or JOIN clauses.',
      'PlanIQ flags this warning automatically via CONVERT_IMPLICIT detector.'
    ],
    detectorKey: 'implicitConversions',
    applicableHints: ["USE HINT('FORCE_DEFAULT_CARDINALITY_ESTIMATION')"]
  },
  {
    id: 'unindexed-temp-heap',
    title: 'Unindexed TempDB Heap Created via SELECT ... INTO',
    category: 'Memory & TempDB',
    severity: 'CRITICAL',
    summary:
      'SELECT ... INTO creates a temporary table with no clustered index, causing downstream nested loops to perform repetitive table scans.',
    engineMechanics:
      'SELECT ... INTO creates a heap in TempDB. While fast to populate, heaps have no B-tree root page. When subsequent queries in the same stored procedure join to this #temp table, SQL Server cannot perform Index Seeks and must scan the entire heap repeatedly for each outer row.',
    asciiDiagram: `Step 1: SELECT ColA, ColB INTO #Temp FROM BigTable;  <-- Unindexed Heap
Step 2: SELECT * FROM Orders o JOIN #Temp t ON o.ID = t.ID;
        │
        ├── Outer: Orders (Seek)
        └── Inner: #Temp (FULL TABLE SCAN x 50,000 outer iterations!)`,
    badSql: `-- Bad: Creates an unindexed heap in TempDB
SELECT AccountID, ReportDate, TotalBalance
INTO #DailyAccounts
FROM dbo.Accounts
WHERE Status = 'ACTIVE';

-- Subsequent join scans the entire heap for every iteration!
SELECT o.*
FROM dbo.Orders o
JOIN #DailyAccounts d ON o.AccountID = d.AccountID;`,
    goodSql: `-- Good: Pre-create #temp with a Clustered Primary Key
CREATE TABLE #DailyAccounts (
    AccountID INT NOT NULL PRIMARY KEY CLUSTERED,
    ReportDate DATETIME2 NOT NULL,
    TotalBalance DECIMAL(18,2) NOT NULL
);

INSERT INTO #DailyAccounts (AccountID, ReportDate, TotalBalance)
SELECT AccountID, ReportDate, TotalBalance
FROM dbo.Accounts
WHERE Status = 'ACTIVE';

-- Subsequent join uses high-speed Clustered Index Seek!
SELECT o.*
FROM dbo.Orders o
JOIN #DailyAccounts d ON o.AccountID = d.AccountID;`,
    remedyList: [
      'Always use explicit CREATE TABLE #temp with a CLUSTERED PRIMARY KEY on join keys.',
      'Drop temp tables explicitly with DROP TABLE #temp at the end of execution.',
      'If row count > 10,000, consider creating a secondary nonclustered index on filter columns.'
    ],
    detectorKey: 'tempdbHeaps',
    applicableHints: ['WITH (TABLOCK)']
  },
  {
    id: 'tempdb-spills',
    title: 'Memory Grant Starvation & TempDB Spills',
    category: 'Memory & TempDB',
    severity: 'CRITICAL',
    summary:
      'When cardinality underestimates cause insufficient memory grants, Hash and Sort operations spill to disk TempDB.',
    engineMechanics:
      'Sort and Hash Match operators require workspace memory (memory grant) allocated upfront. If the optimizer underestimates row counts (e.g. expects 100 rows but gets 1,000,000 rows), the allocated RAM buffer overflows and excess rows must be written to disk TempDB worktables (Level 1 or Level 2 spill).',
    asciiDiagram: `[Optimizer Estimate] 500 rows -> 1,024 KB Memory Grant
       │
[Runtime Reality] 450,000 rows arrive!
       │ (Memory buffer exhausted)
       ▼
[TempDB Spill] 449,500 rows spilled to physical disk TempDB
       ▼
Result: Massive I/O latency, thread serialization, wait: PAGEIOLATCH_SH / IO_COMPLETION`,
    badSql: `-- Bad: Outdated statistics or parameter sniffing cause row underestimate
SELECT CustomerID, OrderDate, Amount,
       ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY Amount DESC) AS Rn
FROM dbo.Orders
WHERE OrderDate >= @StartDate; -- Underestimates rows, causing SORT to spill!`,
    goodSql: `-- Good: Create covering index pre-sorted by ORDER BY keys to eliminate Sort
CREATE NONCLUSTERED INDEX IX_Orders_Cust_Amount
ON dbo.Orders (CustomerID, Amount DESC)
INCLUDE (OrderDate);

-- Or grant sufficient memory via query hint if sorting is unavoidable:
SELECT CustomerID, OrderDate, Amount,
       ROW_NUMBER() OVER (PARTITION BY CustomerID ORDER BY Amount DESC) AS Rn
FROM dbo.Orders
WHERE OrderDate >= @StartDate
OPTION (MIN_GRANT_PERCENT = 10);`,
    remedyList: [
      'Eliminate the Sort operator by creating an index matching the ORDER BY or PARTITION BY columns.',
      'Update statistics with FULLSCAN on affected tables.',
      'Use OPTION (MIN_GRANT_PERCENT = X) to provide guaranteed memory headroom.'
    ],
    detectorKey: 'memoryGrant',
    applicableHints: ['OPTION (MIN_GRANT_PERCENT = 20)', 'OPTION (RECOMPILE)']
  },
  {
    id: 'legacy-ce-70',
    title: 'Legacy Cardinality Estimator (CE Version 70) Regression',
    category: 'Cardinality & Statistics',
    severity: 'HIGH',
    summary:
      'Using the SQL Server 7.0 Cardinality Estimator suppresses modern adaptive optimizations and multi-predicate correlation.',
    engineMechanics:
      'SQL Server 2014 introduced a modernized Cardinality Estimator (CE 120+). Plans marked CEVersion="70" are running on the legacy SQL Server 7.0 algorithm (1998), which assumes total independence between filter predicates and uses simplistic exponential backoff for joins.',
    asciiDiagram: `Modern CE (130/150/160): Adaptive Joins, Batch Mode on Rowstore, Correlation
Legacy CE (70):         Fixed 1998 heuristic, no adaptive features, poor cardinality`,
    badSql: `-- Query forced to legacy CE via database compatibility or trace flag 9481
SELECT *
FROM dbo.Orders o
JOIN dbo.Customers c ON o.CustomerID = c.CustomerID
WHERE c.Country = 'US' AND c.State = 'NY'
OPTION (QUERYTRACEON 9481); -- Triggers CE 70 legacy estimation`,
    goodSql: `-- Query using modern default Cardinality Estimator
SELECT *
FROM dbo.Orders o
JOIN dbo.Customers c ON o.CustomerID = c.CustomerID
WHERE c.Country = 'US' AND c.State = 'NY'
OPTION (USE HINT('FORCE_DEFAULT_CARDINALITY_ESTIMATION'));`,
    remedyList: [
      'Switch Database Compatibility Level to modern target (150 for SQL 2019, 160 for SQL 2022).',
      'Remove legacy trace flags 9481 or 2312 unless specifically validated for legacy regressions.',
      'Use USE HINT(\'FORCE_DEFAULT_CARDINALITY_ESTIMATION\') to test modern CE behavior.'
    ],
    detectorKey: 'cardinalityEngine',
    applicableHints: ["USE HINT('FORCE_DEFAULT_CARDINALITY_ESTIMATION')"]
  },
  {
    id: 'scalar-udf-rbar',
    title: 'Scalar User-Defined Function (RBAR) Execution Penalty',
    category: 'Sargability & Syntax',
    severity: 'HIGH',
    summary:
      'Scalar T-SQL functions execute once per row (Row-By-Agonizing-Row) outside the relational pipeline, multiplying runtime 100x.',
    engineMechanics:
      'In SQL Server prior to 2019, scalar UDFs are black boxes to the query optimizer. The relational engine must switch contexts between the relational execution pipeline and the T-SQL procedural interpreter for EVERY single row, disabling parallelism and accumulating CPU scheduling waits.',
    asciiDiagram: `SELECT OrderID, dbo.fn_CalculateTax(SubTotal) AS Tax
FROM dbo.Orders; -- 1,000,000 Rows

[Relational Pipeline] ──(Row 1)──> [T-SQL Context Switch] -> Exec UDF -> Return
                      ──(Row 2)──> [T-SQL Context Switch] -> Exec UDF -> Return
                      ... 1,000,000 Context Switches!
                      Wait: SOS_SCHEDULER_YIELD`,
    badSql: `-- Bad: Scalar UDF called in SELECT column projection or WHERE clause
SELECT OrderID, CustomerID, dbo.fn_GetCustomerTier(CustomerID) AS Tier
FROM dbo.Orders
WHERE OrderDate >= '2024-01-01';`,
    goodSql: `-- Good: Inline Table-Valued Function (iTVF) or direct relational JOIN
-- Option A: Inline Table-Valued Function (expands into query tree)
SELECT o.OrderID, o.CustomerID, c.Tier
FROM dbo.Orders o
CROSS APPLY dbo.itvf_GetCustomerTier(o.CustomerID) c
WHERE o.OrderDate >= '2024-01-01';

-- Option B: Direct relational expression or CASE statement
SELECT o.OrderID, o.CustomerID,
       CASE WHEN cust.AnnualSpend > 100000 THEN 'PLATINUM' ELSE 'STANDARD' END AS Tier
FROM dbo.Orders o
JOIN dbo.Customers cust ON o.CustomerID = cust.CustomerID;`,
    remedyList: [
      'Convert scalar UDFs to Inline Table-Valued Functions (iTVFs).',
      'Enable Scalar UDF Inlining in SQL Server 2019+ (Database Compat Level >= 150).',
      'Replace procedural logic with relational JOINs or computed columns.'
    ],
    detectorKey: 'scalarUdfWarnings',
    applicableHints: ["USE HINT('ENABLE_SCALAR_UDF_INLINING')"]
  },
  {
    id: 'parallelism-thread-skew',
    title: 'Parallelism Thread Workload Distribution Skew',
    category: 'Parallelism & Concurrency',
    severity: 'HIGH',
    summary:
      'Parallel query assigns 90%+ of row workload to a single thread while other threads sit idle in CXPACKET wait.',
    engineMechanics:
      'Parallel operators split row streams across worker threads. If range partitioning or hash distribution keys contain high duplicate frequency or skew, one thread processes millions of rows while others finish in milliseconds. Faster threads wait at Gather Streams (CXPACKET), wasting CPU cores.',
    asciiDiagram: `Thread 1: [==================== 980,000 rows ====================] (Busy 100% CPU)
Thread 2: [=== 5,000 rows ===] ────> WAITING IN CXPACKET (Idle)
Thread 3: [=== 7,000 rows ===] ────> WAITING IN CXPACKET (Idle)
Thread 4: [=== 8,000 rows ===] ────> WAITING IN CXPACKET (Idle)
Overall query duration is pinned to Thread 1!`,
    badSql: `-- Query with uneven join key distribution triggering thread skew
SELECT o.RegionID, COUNT(*), SUM(o.TotalAmount)
FROM dbo.Orders o
JOIN dbo.Regions r ON o.RegionID = r.RegionID
GROUP BY o.RegionID; -- RegionID 1 contains 95% of all company orders!`,
    goodSql: `-- Good: Distribute workload evenly or optimize index seek strategy
-- Provide an index that eliminates parallel hash match redistribution:
CREATE NONCLUSTERED INDEX IX_Orders_Region_Amount
ON dbo.Orders (RegionID)
INCLUDE (TotalAmount);

-- Or test with controlled MAXDOP:
SELECT o.RegionID, COUNT(*), SUM(o.TotalAmount)
FROM dbo.Orders o
JOIN dbo.Regions r ON o.RegionID = r.RegionID
GROUP BY o.RegionID
OPTION (MAXDOP 4);`,
    remedyList: [
      'Inspect thread row distribution in PlanIQ Parallelism Skew detector.',
      'Check for data skew where a single key value dominates the dataset.',
      'Verify Cost Threshold for Parallelism is set to at least 50 on the instance.'
    ],
    detectorKey: 'parallelismSkew',
    applicableHints: ['OPTION (MAXDOP 4)', "USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE')"]
  },
  {
    id: 'key-lookup-tipping-point',
    title: 'Key Lookup / Bookmark Lookup Death Spiral',
    category: 'Joins & Physics',
    severity: 'HIGH',
    summary:
      'A NonClustered Index Seek followed by millions of Key Lookups is dramatically slower than a simple Clustered Index Scan.',
    engineMechanics:
      'NonClustered indexes only store the indexed keys + clustering key. When a query requests columns not present in the index, SQL Server must perform a Key Lookup into the Clustered Index for EVERY qualifying row. Beyond 1-3% of table rows (the tipping point), random I/O from lookups destroys performance.',
    asciiDiagram: `NonClustered Index Seek (150,000 rows found)
       │
       ▼ (150,000 random I/O seeks into base table!)
Key Lookup (Clustered Index) -> 150,000 random page reads
       ▼
Result: Massive PAGEIOLATCH_SH disk latency. A Clustered Index Scan would have been 10x faster!`,
    badSql: `-- Query selects columns (Notes, Balance) not included in index IX_Orders_Date
SELECT OrderID, OrderDate, CustomerID, Notes, Balance
FROM dbo.Orders
WHERE OrderDate >= '2024-01-01'; -- 200,000 Key Lookups!`,
    goodSql: `-- Good: Turn NonClustered index into a 100% COVERING index
CREATE NONCLUSTERED INDEX IX_Orders_Date_Covering
ON dbo.Orders (OrderDate)
INCLUDE (CustomerID, Notes, Balance);

-- Query now executes as a pure Index Seek with 0 Key Lookups!
SELECT OrderID, OrderDate, CustomerID, Notes, Balance
FROM dbo.Orders
WHERE OrderDate >= '2024-01-01';`,
    remedyList: [
      'Add missing projection columns to the INCLUDE clause of the NonClustered index.',
      'Consult PlanIQ "Missing Indexes" tab for consolidated covering index recommendations.',
      'If table is very narrow, consider making the lookup columns part of the composite key.'
    ],
    detectorKey: 'keyLookups',
    applicableHints: ['WITH (FORCESEEK)']
  },
  {
    id: 'parameter-sniffing',
    title: 'Parameter Sniffing & Suboptimal Cached Plans',
    category: 'Cardinality & Statistics',
    severity: 'HIGH',
    summary:
      'Stored procedure compiles an execution plan optimized for an uncommon parameter value, crippling subsequent executions.',
    engineMechanics:
      'On first execution, SQL Server "sniffs" the runtime parameter values and creates a plan optimized for that specific cardinality. If compiled with an atypical value (e.g. status "FLAGGED" matching 5 rows), subsequent calls with typical values ("ACTIVE" matching 2,000,000 rows) use the tiny-plan and choke on Nested Loops & Key Lookups.',
    asciiDiagram: `Execution 1: @Status = 'FRAUD' (5 rows) -> Optimizer builds Nested Loops + Key Lookup
Execution 2: @Status = 'ACTIVE' (2,000,000 rows) -> REUSES CACHED PLAN!
             Result: 2,000,000 Key Lookups -> Query times out!`,
    badSql: `-- Bad: Vulnerable to parameter sniffing on skewed status values
CREATE PROCEDURE dbo.GetOrdersByStatus
    @Status VARCHAR(20)
AS
BEGIN
    SELECT OrderID, CustomerID, TotalAmount
    FROM dbo.Orders
    WHERE Status = @Status;
END;`,
    goodSql: `-- Solution A: Optimize for average / unknown distribution
CREATE PROCEDURE dbo.GetOrdersByStatus
    @Status VARCHAR(20)
AS
BEGIN
    SELECT OrderID, CustomerID, TotalAmount
    FROM dbo.Orders
    WHERE Status = @Status
    OPTION (OPTIMIZE FOR UNKNOWN);
END;

-- Solution B: If query is infrequent and high-stakes, recompile each time:
-- OPTION (RECOMPILE);`,
    remedyList: [
      'Use OPTION (OPTIMIZE FOR UNKNOWN) to optimize for statistical average density.',
      'Use local variable assignment trick (DECLARE @LocalStatus = @Status) to force density vector.',
      'Use OPTION (RECOMPILE) for complex stored procedures with wildly variable inputs.'
    ],
    detectorKey: 'parameterSniffing',
    applicableHints: ['OPTION (OPTIMIZE FOR UNKNOWN)', 'OPTION (RECOMPILE)']
  },
  {
    id: 'row-goal-misfire',
    title: 'Row Goal Misfire via TOP (N) or EXISTS',
    category: 'Joins & Physics',
    severity: 'MEDIUM',
    summary:
      'TOP (N) or FAST (N) tricks the optimizer into picking an unindexed scan, assuming it will find N rows immediately.',
    engineMechanics:
      'When TOP (N) or EXISTS is present, the optimizer applies a "Row Goal", modifying cardinality estimates on the assumption that execution will terminate early. It may pick a Table Scan over an Index Seek assuming it will hit N rows on the first few pages. If target rows are at the back of the table, the entire table is scanned.',
    asciiDiagram: `Normal Query: Table Scan cost = 1,000 | Index Seek cost = 50 -> Optimizer picks Index Seek
With TOP (10): Optimizer assumes Scan will find 10 rows immediately!
Row Goal Scan Cost = 0.5 -> Optimizer picks SCAN!
Reality: Qualifying rows are on the last 5 pages -> Entire 100GB table is scanned!`,
    badSql: `-- Bad: Row goal causes optimizer to pick table scan over index seek
SELECT TOP (10) OrderID, OrderDate, CustomerID
FROM dbo.Orders
WHERE Status = 'PENDING'
ORDER BY OrderDate DESC;`,
    goodSql: `-- Solution: Disable row goal or enforce index seek
SELECT TOP (10) OrderID, OrderDate, CustomerID
FROM dbo.Orders
WHERE Status = 'PENDING'
ORDER BY OrderDate DESC
OPTION (USE HINT('DISABLE_OPTIMIZER_ROWGOAL'));`,
    remedyList: [
      'Use USE HINT(\'DISABLE_OPTIMIZER_ROWGOAL\') to allow full cardinality evaluation.',
      'Create composite index on (Status, OrderDate DESC) to allow genuine early termination seek.'
    ],
    detectorKey: 'rowGoals',
    applicableHints: ["USE HINT('DISABLE_OPTIMIZER_ROWGOAL')"]
  }
];

export const TuningPlaybookTab: React.FC<TuningPlaybookTabProps> = ({ plan, onNavigateToStatement }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [onlyDetected, setOnlyDetected] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'methodology' | 'advanced' | 'patterns' | 'joins' | 'hints'>('methodology');
  const [expandedId, setExpandedId] = useState<string | null>('non-sargable-convert');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Analyze active plan to detect which playbook patterns are present in current loaded plan
  const detectedPatternIds = useMemo(() => {
    const detected = new Set<string>();
    if (!plan) return detected;

    const diag = plan.diagnostics;

    // Check implicit conversions
    if (diag?.implicitConversions && diag.implicitConversions.length > 0) {
      detected.add('non-sargable-convert');
    }

    // Check tempdb unindexed heaps
    const hasHeap = (plan.statements || []).some(
      (s) => /SELECT[\s\S]+?INTO\s+#[A-Za-z0-9_]+/i.test(s.statementText || '')
    );
    if (hasHeap) detected.add('unindexed-temp-heap');

    // Check memory spills
    if (diag?.memoryGrant?.hasSpills) detected.add('tempdb-spills');

    // Check legacy CE
    if (diag?.cardinalityEngine?.isLegacy) detected.add('legacy-ce-70');

    // Check scalar UDF
    if (diag?.scalarUdfWarnings && diag.scalarUdfWarnings.length > 0) {
      detected.add('scalar-udf-rbar');
    }

    // Check parallelism skew
    if (diag?.parallelismSkew?.hasSkew) detected.add('parallelism-thread-skew');

    // Check key lookups
    if (diag?.keyLookups && diag.keyLookups.length > 0) {
      detected.add('key-lookup-tipping-point');
    }

    // Check parameter sniffing
    if (diag?.parameterSniffing && diag.parameterSniffing.length > 0) {
      detected.add('parameter-sniffing');
    }

    // Check row goals
    if (diag?.rowGoals && diag.rowGoals.length > 0) {
      detected.add('row-goal-misfire');
    }

    return detected;
  }, [plan]);

  // Filtered patterns
  const filteredPatterns = useMemo(() => {
    let list = [...PLAYBOOK_PATTERNS];

    if (onlyDetected) {
      list = list.filter((p) => detectedPatternIds.has(p.id));
    }

    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.category.toLowerCase() === selectedCategory.toLowerCase());
    }

    if (selectedSeverity !== 'all') {
      list = list.filter((p) => p.severity === selectedSeverity);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.summary.toLowerCase().includes(q) ||
          p.engineMechanics.toLowerCase().includes(q) ||
          p.badSql.toLowerCase().includes(q) ||
          p.applicableHints.some((h) => h.toLowerCase().includes(q))
      );
    }

    return list;
  }, [selectedCategory, selectedSeverity, searchQuery, onlyDetected, detectedPatternIds]);

  const handleCopyCode = (code: string, id: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedCodeId(id);
      setTimeout(() => setCopiedCodeId(null), 2000);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="playbook-tab-container">
      {/* 1. Playbook Hero Header */}
      <div className="playbook-header glass-panel">
        <div className="playbook-title-row">
          <div className="playbook-title-group">
            <div className="playbook-icon-badge">
              <BookOpen size={22} color="#c084fc" />
            </div>
            <div>
              <h1 className="playbook-headline">SQL Server Tuning Playbook & Anti-Pattern Lab</h1>
              <p className="playbook-subtext">
                Definitive DBA guide to query processor internals, operator physics, anti-patterns, and production-ready T-SQL rewrites.
              </p>
            </div>
          </div>

          <div className="playbook-nav-tabs">
            <button
              className={`playbook-subtab-btn ${activeTab === 'methodology' ? 'active' : ''}`}
              onClick={() => setActiveTab('methodology')}
            >
              <Compass size={14} />
              <span>DB Improvement Process (4 Levels)</span>
            </button>
            <button
              className={`playbook-subtab-btn ${activeTab === 'advanced' ? 'active' : ''}`}
              onClick={() => setActiveTab('advanced')}
            >
              <Cpu size={14} />
              <span>Advanced Optimization</span>
            </button>
            <button
              className={`playbook-subtab-btn ${activeTab === 'patterns' ? 'active' : ''}`}
              onClick={() => setActiveTab('patterns')}
            >
              <ShieldAlert size={14} />
              <span>Anti-Pattern Lab ({PLAYBOOK_PATTERNS.length})</span>
            </button>
            <button
              className={`playbook-subtab-btn ${activeTab === 'joins' ? 'active' : ''}`}
              onClick={() => setActiveTab('joins')}
            >
              <Boxes size={14} />
              <span>Join Physics & Algorithms</span>
            </button>
            <button
              className={`playbook-subtab-btn ${activeTab === 'hints' ? 'active' : ''}`}
              onClick={() => setActiveTab('hints')}
            >
              <Sliders size={14} />
              <span>Query Hints & Guides</span>
            </button>
          </div>
        </div>

        {/* Active Plan Detected Anti-Patterns Banner */}
        {plan && detectedPatternIds.size > 0 && (
          <div className="active-patterns-detected-callout">
            <div className="callout-left">
              <Flame size={20} color="#f43f5e" />
              <div>
                <strong>
                  {detectedPatternIds.size} Anti-Pattern(s) Detected in Active Plan ({plan.planName})
                </strong>
                <p>Click any detected pattern to jump directly to its engine mechanics and rewrite playbook.</p>
              </div>
            </div>

            <div className="callout-pills-wrap">
              {Array.from(detectedPatternIds).map((id) => {
                const item = PLAYBOOK_PATTERNS.find((p) => p.id === id);
                if (!item) return null;
                return (
                  <button
                    key={id}
                    className="detected-item-pill"
                    onClick={() => {
                      setActiveTab('patterns');
                      setExpandedId(id);
                      const el = document.getElementById(`pattern-${id}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                  >
                    <span>⚠️ {item.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 1. TAB CONTENT 0: End-to-End DB Performance Improvement Methodology (From User's Architecture Guide) */}
      {activeTab === 'methodology' && <PerformanceProcessView />}

      {activeTab === 'advanced' && <AdvancedOptimizationView />}

      {/* 2. TAB CONTENT 1: Anti-Pattern Catalog */}
      {activeTab === 'patterns' && (
        <div className="playbook-patterns-section">
          {/* Controls Bar */}
          <div className="playbook-controls-bar glass-panel">
            <div className="search-box-wrap">
              <Search size={15} color="#94a3b8" />
              <input
                type="text"
                className="playbook-search-input"
                placeholder="Search anti-patterns, hints, operators, or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                  ✕
                </button>
              )}
            </div>

            <div className="category-filters-row">
              {plan && detectedPatternIds.size > 0 && (
                <button
                  className={`filter-chip chip-detected ${onlyDetected ? 'active' : ''}`}
                  onClick={() => setOnlyDetected(!onlyDetected)}
                >
                  <Flame size={12} />
                  <span>Found in Plan ({detectedPatternIds.size})</span>
                </button>
              )}

              <button
                className={`filter-chip ${selectedCategory === 'all' && !onlyDetected ? 'active' : ''}`}
                onClick={() => {
                  setSelectedCategory('all');
                  setOnlyDetected(false);
                }}
              >
                All Categories
              </button>
              <button
                className={`filter-chip ${selectedCategory === 'Sargability & Syntax' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('Sargability & Syntax')}
              >
                Sargability
              </button>
              <button
                className={`filter-chip ${selectedCategory === 'Memory & TempDB' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('Memory & TempDB')}
              >
                Memory & TempDB
              </button>
              <button
                className={`filter-chip ${selectedCategory === 'Cardinality & Statistics' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('Cardinality & Statistics')}
              >
                Cardinality Engine
              </button>
              <button
                className={`filter-chip ${selectedCategory === 'Parallelism & Concurrency' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('Parallelism & Concurrency')}
              >
                Parallelism
              </button>
              <button
                className={`filter-chip ${selectedCategory === 'Joins & Physics' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('Joins & Physics')}
              >
                Joins & Physics
              </button>
            </div>
          </div>

          {/* Patterns List */}
          <div className="patterns-cards-list">
            {filteredPatterns.map((pattern) => {
              const isExpanded = expandedId === pattern.id;
              const isDetectedInPlan = detectedPatternIds.has(pattern.id);

              return (
                <div
                  id={`pattern-${pattern.id}`}
                  key={pattern.id}
                  className={`pattern-card glass-panel ${isDetectedInPlan ? 'pattern-detected' : ''} ${isExpanded ? 'pattern-expanded' : ''}`}
                >
                  <div className="pattern-card-header-row" onClick={() => toggleExpand(pattern.id)}>
                    <div className="pattern-header-left">
                      <div className="pattern-title-line">
                        <span className="pattern-title">{pattern.title}</span>
                        {isDetectedInPlan && (
                          <span className="active-in-plan-tag">
                            <Flame size={11} />
                            <span>Active in Loaded Plan</span>
                          </span>
                        )}
                      </div>

                      <div className="pattern-meta-badges">
                        <span className="meta-category-badge">{pattern.category}</span>
                        <span className={`badge badge-${pattern.severity.toLowerCase()}`}>
                          {pattern.severity}
                        </span>
                        {pattern.applicableHints.map((hint, hIdx) => (
                          <span key={hIdx} className="hint-pill">
                            {hint}
                          </span>
                        ))}
                      </div>

                      <p className="pattern-summary-text">{pattern.summary}</p>
                    </div>

                    <div className="pattern-header-right">
                      <button className="expand-chevron-btn">
                        {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Playbook Dossier */}
                  {isExpanded && (
                    <div className="pattern-expanded-body">
                      {/* Mechanics & Diagram */}
                      <div className="mechanics-section">
                        <h4 className="body-subheading">
                          <Cpu size={15} color="#38bdf8" />
                          <span>Relational Engine Mechanics (Under The Hood)</span>
                        </h4>
                        <p className="mechanics-desc">{pattern.engineMechanics}</p>

                        {pattern.asciiDiagram && (
                          <div className="ascii-diagram-wrap">
                            <pre className="ascii-diagram">{pattern.asciiDiagram}</pre>
                          </div>
                        )}
                      </div>

                      {/* Before / After T-SQL Comparison */}
                      <div className="code-comparison-grid">
                        {/* Bad Code */}
                        <div className="code-col code-bad">
                          <div className="code-header">
                            <span className="code-label label-bad">❌ Anti-Pattern T-SQL (Problem)</span>
                            <button
                              className="btn-copy-code"
                              onClick={() => handleCopyCode(pattern.badSql, `bad-${pattern.id}`)}
                            >
                              {copiedCodeId === `bad-${pattern.id}` ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                              <span>{copiedCodeId === `bad-${pattern.id}` ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                          <pre className="code-block">{pattern.badSql}</pre>
                        </div>

                        {/* Good Code */}
                        <div className="code-col code-good">
                          <div className="code-header">
                            <span className="code-label label-good">✅ Production-Ready Rewrite (Solution)</span>
                            <button
                              className="btn-copy-code"
                              onClick={() => handleCopyCode(pattern.goodSql, `good-${pattern.id}`)}
                            >
                              {copiedCodeId === `good-${pattern.id}` ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                              <span>{copiedCodeId === `good-${pattern.id}` ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                          <pre className="code-block">{pattern.goodSql}</pre>
                        </div>
                      </div>

                      {/* DBA Action Plan Checklist */}
                      <div className="dba-prescription-section">
                        <h4 className="body-subheading">
                          <ShieldAlert size={15} color="#34d399" />
                          <span>DBA Tuning Checklist & Best Practices</span>
                        </h4>
                        <ul className="prescription-list">
                          {pattern.remedyList.map((rem, rIdx) => (
                            <li key={rIdx} className="prescription-item">
                              <ArrowRight size={14} color="#34d399" className="arrow-icon" />
                              <span>{rem}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. TAB CONTENT 2: Relational Join Physics Lab */}
      {activeTab === 'joins' && (
        <div className="playbook-joins-section glass-panel">
          <div className="joins-hero-header">
            <Boxes size={24} color="#38bdf8" />
            <div>
              <h2 className="section-headline">Relational Join Physics & Physical Operator Deep-Dive</h2>
              <p className="section-subtext">
                How SQL Server executes joins in hardware memory and disk: algorithm mechanics, optimal use cases, and failure modes.
              </p>
            </div>
          </div>

          <div className="join-cards-grid">
            {/* 1. Nested Loops */}
            <div className="join-operator-card">
              <div className="join-card-header">
                <span className="join-op-title">Nested Loops Join</span>
                <span className="join-badge cyan-badge">OLTP / Small Sets</span>
              </div>
              <p className="join-summary">
                For every row in the Outer input, executes an Index Seek on the Inner input.
              </p>

              <div className="join-physics-block">
                <strong>Algorithm Mechanics:</strong>
                <p>Two nested for-loops. Requires no memory grant upfront. Highly efficient when outer row count is tiny (1 to 500 rows) and inner table has a direct index seek.</p>
              </div>

              <div className="join-strengths-block">
                <span className="text-emerald">✅ When It Shines:</span>
                <ul>
                  <li>Highly selective OLTP queries returning a handful of rows.</li>
                  <li>Fast First Row response time (starts streaming immediately).</li>
                  <li>Zero memory grant requirement.</li>
                </ul>
              </div>

              <div className="join-hazards-block">
                <span className="text-rose">⚠️ Danger Zone / Failure Mode:</span>
                <ul>
                  <li>If outer input cardinality explodes (e.g. 500,000 rows), executes 500,000 inner seeks &rarr; catastrophic CPU/disk burn!</li>
                  <li>Row goal misfires from TOP (N) tricking optimizer into picking loops.</li>
                </ul>
              </div>
            </div>

            {/* 2. Hash Match */}
            <div className="join-operator-card">
              <div className="join-card-header">
                <span className="join-op-title">Hash Match Join</span>
                <span className="join-badge purple-badge">Analytics / Large Sets</span>
              </div>
              <p className="join-summary">
                Builds an in-memory hash table on the smaller input, then probes with the larger input.
              </p>

              <div className="join-physics-block">
                <strong>Algorithm Mechanics:</strong>
                <p>Phase 1 (Build): Reads entire build input and creates a hash bucket table in RAM. Phase 2 (Probe): Streams probe input and checks hash matches.</p>
              </div>

              <div className="join-strengths-block">
                <span className="text-emerald">✅ When It Shines:</span>
                <ul>
                  <li>Joining massive unsorted tables without indexes.</li>
                  <li>Equi-joins in data warehouses and analytics.</li>
                  <li>Scales effectively across multiple CPU cores in parallel.</li>
                </ul>
              </div>

              <div className="join-hazards-block">
                <span className="text-rose">⚠️ Danger Zone / Failure Mode:</span>
                <ul>
                  <li>Requires memory grant upfront. Must wait in RESOURCE_SEMAPHORE if RAM is scarce.</li>
                  <li>If build input exceeds memory grant, spills to physical TempDB disk.</li>
                  <li>Stop-and-go operator: cannot return rows until build phase finishes.</li>
                </ul>
              </div>
            </div>

            {/* 3. Merge Join */}
            <div className="join-operator-card">
              <div className="join-card-header">
                <span className="join-op-title">Merge Join</span>
                <span className="join-badge emerald-badge">Pre-Sorted Data</span>
              </div>
              <p className="join-summary">
                Simultaneously walks through two pre-sorted inputs in synchronous linear order.
              </p>

              <div className="join-physics-block">
                <strong>Algorithm Mechanics:</strong>
                <p>Requires both inputs to be sorted on join keys. Linear single-pass sweep (O(N + M)). One-to-Many joins stream instantly without worktables.</p>
              </div>

              <div className="join-strengths-block">
                <span className="text-emerald">✅ When It Shines:</span>
                <ul>
                  <li>Inputs are already sorted by clustered indexes.</li>
                  <li>Extremely low CPU overhead and minimal memory usage.</li>
                  <li>Predictable linear execution scaling.</li>
                </ul>
              </div>

              <div className="join-hazards-block">
                <span className="text-rose">⚠️ Danger Zone / Failure Mode:</span>
                <ul>
                  <li>If inputs are not sorted, optimizer injects an expensive Sort operator.</li>
                  <li>Many-to-Many joins create temporary worktables in TempDB.</li>
                </ul>
              </div>
            </div>

            {/* 4. Adaptive Join */}
            <div className="join-operator-card">
              <div className="join-card-header">
                <span className="join-op-title">Adaptive Join (SQL 2017+)</span>
                <span className="join-badge amber-badge">Intelligent Query Processing</span>
              </div>
              <p className="join-summary">
                Dynamically defers join algorithm choice to runtime based on actual row counts.
              </p>

              <div className="join-physics-block">
                <strong>Algorithm Mechanics:</strong>
                <p>Calculates a threshold row count. If actual rows arriving from build input &lt; threshold, executes Nested Loops. If &ge; threshold, switches to Hash Match.</p>
              </div>

              <div className="join-strengths-block">
                <span className="text-emerald">✅ When It Shines:</span>
                <ul>
                  <li>Queries with wildly fluctuating input sizes across executions.</li>
                  <li>Protects against parameter sniffing regressions.</li>
                  <li>Part of SQL Server 2017+ Batch Mode on Rowstore IQP family.</li>
                </ul>
              </div>

              <div className="join-hazards-block">
                <span className="text-rose">⚠️ Danger Zone / Failure Mode:</span>
                <ul>
                  <li>Always reserves memory for Hash Match even if Nested Loops is picked.</li>
                  <li>Requires database compatibility level 140+ (SQL 2017) or 150+ (SQL 2019).</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. TAB CONTENT 3: Query Hints & Plan Guides Cheat Sheet */}
      {activeTab === 'hints' && (
        <div className="playbook-hints-section glass-panel">
          <div className="hints-hero-header">
            <Sliders size={24} color="#818cf8" />
            <div>
              <h2 className="section-headline">Essential T-SQL Query Hints Reference & Plan Guides</h2>
              <p className="section-subtext">
                Targeted optimizer directives to force safe execution plans, control parallelism, and overcome estimation bugs.
              </p>
            </div>
          </div>

          <div className="hints-table-wrapper">
            <table className="hints-table">
              <thead>
                <tr>
                  <th>Query Hint</th>
                  <th>Category</th>
                  <th>Primary Purpose</th>
                  <th>When to Use</th>
                  <th>Risk / Caution</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>OPTION (RECOMPILE)</code></td>
                  <td>Compilation</td>
                  <td>Forces fresh plan compilation on every execution with current parameter values.</td>
                  <td>Complex reports with wildly variable parameters; bypasses parameter sniffing.</td>
                  <td>High CPU compile overhead if used on queries running 1,000 times/sec.</td>
                </tr>
                <tr>
                  <td><code>OPTION (OPTIMIZE FOR UNKNOWN)</code></td>
                  <td>Cardinality</td>
                  <td>Instructs optimizer to ignore sniffed parameters and use average statistical density.</td>
                  <td>Parameter sniffing issues where the statistical average plan is reliable.</td>
                  <td>May still pick suboptimal plans if dataset distribution is highly skewed.</td>
                </tr>
                <tr>
                  <td><code>OPTION (MAXDOP 1)</code></td>
                  <td>Parallelism</td>
                  <td>Restricts query execution to a single CPU core (Serial plan).</td>
                  <td>Queries suffering from thread skew, excessive CXPACKET, or latch contention.</td>
                  <td>Caps throughput for legitimate large parallel aggregations.</td>
                </tr>
                <tr>
                  <td><code>OPTION (MIN_GRANT_PERCENT = X)</code></td>
                  <td>Memory Grant</td>
                  <td>Guarantees minimum workspace memory percentage to prevent TempDB spills.</td>
                  <td>Hash Match and Sort operators spilling to disk TempDB due to row underestimates.</td>
                  <td>Reserves memory that other concurrent queries cannot use.</td>
                </tr>
                <tr>
                  <td><code>WITH (FORCESEEK)</code></td>
                  <td>Index Directives</td>
                  <td>Forces optimizer to use an Index Seek on the table instead of a scan.</td>
                  <td>When tipping point causes the optimizer to pick an unwanted table scan.</td>
                  <td>Query errors if no seekable index exists on filter columns.</td>
                </tr>
                <tr>
                  <td><code>USE HINT('FORCE_DEFAULT_CARDINALITY_ESTIMATION')</code></td>
                  <td>Cardinality</td>
                  <td>Forces the modern SQL 2014+ Cardinality Estimator (CE 120/130/150).</td>
                  <td>Modernizing legacy databases running under CEVersion="70".</td>
                  <td>Validate before deploying to ensure no legacy correlation regressions.</td>
                </tr>
                <tr>
                  <td><code>USE HINT('DISABLE_OPTIMIZER_ROWGOAL')</code></td>
                  <td>Row Goals</td>
                  <td>Disables early-termination cost reduction for TOP, FAST, and EXISTS.</td>
                  <td>When TOP (N) tricks the optimizer into picking an unindexed scan.</td>
                  <td>Queries genuinely benefiting from early exit may take slightly longer to compile.</td>
                </tr>
                <tr>
                  <td><code>USE HINT('ENABLE_PARALLEL_PLAN_PREFERENCE')</code></td>
                  <td>Parallelism</td>
                  <td>Forces parallel plan creation even below Cost Threshold for Parallelism.</td>
                  <td>Testing parallel scalability on multi-core servers.</td>
                  <td>Can overwhelm CPU schedulers on busy OLTP servers.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
