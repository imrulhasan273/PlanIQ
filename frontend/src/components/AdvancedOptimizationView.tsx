import React, { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Check,
  Map as MapIcon,
  FileSearch,
  BarChart3,
  Shuffle,
  MemoryStick,
  ListTree,
  Rocket,
  History,
  Lock,
  Radar,
  Layers,
  Zap,
  FlaskConical,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  XCircle
} from 'lucide-react';

/* ---------------------------------------------------------------------------
   Types
--------------------------------------------------------------------------- */
type Tone = 'blue' | 'amber' | 'green' | 'rose' | 'purple';
interface FlowStep {
  title: string;
  sub?: string;
  tone: Tone;
}
interface Topic {
  id: string;
  title: string;
  tier: 'Foundation' | 'Intermediate' | 'Advanced';
  icon: React.ReactNode;
  summary: string;
  flow?: FlowStep[];
  flowCaption?: string;
  ascii?: { title: string; body: string };
  points: { h: string; t: string }[];
  table?: { title: string; head: string[]; rows: string[][] };
  pitfalls: string[];
  scripts: { title: string; sql: string }[];
  tryIt?: string;
}

/* ---------------------------------------------------------------------------
   Topic content
--------------------------------------------------------------------------- */
const TOPICS: Topic[] = [
  {
    id: 'plans',
    title: 'Reading Execution Plans',
    tier: 'Foundation',
    icon: <FileSearch size={15} />,
    summary:
      'A plan is a tree of operators. Rows flow from the right (data access) to the left (final result). The goal is to find where estimated and actual numbers diverge, because that is where the optimizer was misled.',
    flow: [
      { title: 'Get the ACTUAL plan', sub: 'Estimated plans hide runtime facts', tone: 'blue' },
      { title: 'Find the hot operator', sub: 'Largest actual time/reads, not just cost %', tone: 'amber' },
      { title: 'Compare est vs actual rows', sub: 'Big gap = statistics / CE issue', tone: 'rose' },
      { title: 'Read the warnings', sub: 'Spills, implicit conversions, missing stats', tone: 'purple' },
      { title: 'Fix, re-run, compare', sub: 'Use STATISTICS IO/TIME', tone: 'green' }
    ],
    ascii: {
      title: 'How to read it',
      body: `SELECT  <-- reads here last (leftmost)
  └── Hash Match (Join)            data flows RIGHT -> LEFT
        ├── Clustered Index Scan   (Orders)     <- start reading at the right/top
        └── Index Seek             (Customers)

Arrow thickness = rows. Thick arrow into a Nested Loops inner side = many executions.`
    },
    points: [
      { h: 'Estimated vs Actual rows', t: 'Estimates are per execution. For the inner side of a Nested Loops, Actual Rows is the total across all executions, so compare Estimated Rows × Estimated Executions to Actual Rows.' },
      { h: 'Cost % is an estimate', t: 'Even in an actual plan, operator cost % is the optimizer\'s estimate. Trust actual time, actual rows and logical reads over cost %.' },
      { h: 'Actual Rows Read vs Actual Rows', t: 'If an Index Seek reads 5 million rows but returns 10, a residual predicate is filtering late. The index key is not matching the predicate.' },
      { h: 'Warnings that matter', t: 'Spill to TempDB (sort/hash), implicit conversion, no join predicate, missing statistics, and operator memory grant warnings.' },
      { h: 'Key Lookup', t: 'A seek plus many lookups can cost more than a scan. Fix with INCLUDE columns on the nonclustered index.' }
    ],
    pitfalls: [
      'Tuning from the estimated plan only. You miss spills and the real row counts.',
      'Chasing the highest cost % operator while the real time is elsewhere.',
      'Ignoring "Number of Executions" on the inner side of a loop.'
    ],
    scripts: [
      {
        title: 'Measure before and after',
        sql: `SET STATISTICS IO, TIME ON;
-- run the query with "Include Actual Execution Plan" (Ctrl+M) on
SELECT ... ;
SET STATISTICS IO, TIME OFF;
-- Compare logical reads and CPU time, not just duration.`
      },
      {
        title: 'Get a cached plan for a statement',
        sql: `SELECT TOP (10) st.text, qp.query_plan, qs.execution_count,
       qs.total_worker_time / qs.execution_count AS avg_cpu_us
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle)  st
CROSS APPLY sys.dm_exec_query_plan(qs.plan_handle) qp
WHERE st.text LIKE N'%YourTableName%'
ORDER BY qs.total_worker_time DESC;`
      }
    ],
    tryIt: 'Open the Plan Visualizer tab, select a node, and hover the Rows and Skew properties to see this logic applied to your loaded plan.'
  },
  {
    id: 'stats',
    title: 'Statistics, Histograms & Cardinality',
    tier: 'Intermediate',
    icon: <BarChart3 size={15} />,
    summary:
      'The optimizer never reads your data to choose a plan. It reads statistics. A histogram has up to 200 steps per column, so bad statistics produce bad row estimates, which produce wrong joins, wrong memory grants and wrong parallelism (this is the cause of cardinality skew).',
    flow: [
      { title: 'Predicate in query', sub: 'WHERE Status = 5', tone: 'blue' },
      { title: 'Look up histogram', sub: 'Step with EQ_ROWS / RANGE_ROWS', tone: 'amber' },
      { title: 'Estimate rows', sub: 'Combine predicates (CE model)', tone: 'purple' },
      { title: 'Choose operators', sub: 'Seek vs scan, join type, grant', tone: 'rose' },
      { title: 'Run & compare', sub: 'Actual vs estimated', tone: 'green' }
    ],
    ascii: {
      title: 'The ascending key problem',
      body: `Histogram last step:  OrderDate <= 2026-10-01
New rows arrive:      2026-10-02 ... 2026-10-24  (not in histogram yet)

Old behavior (legacy CE): estimate about 1 row  -> nested loops, tiny grant, then 100,000 rows arrive
CE 120+ (compat 120+):    uses an out-of-range average guess, usually better
Fix: update statistics often on date / identity columns`
    },
    points: [
      { h: 'Histogram (max 200 steps)', t: 'Stores values and row counts. A single column histogram cannot see correlation between columns, so multi-column predicates rely on density and model assumptions.' },
      { h: 'Density vector', t: 'Average rows per distinct value. It is used for OPTIMIZE FOR UNKNOWN and for joins.' },
      { h: 'Auto-update threshold', t: 'The old rule was 500 rows + 20%. On compat 130+ it is a dynamic threshold that shrinks the percentage as the table grows, so large tables refresh more often.' },
      { h: 'Sampling', t: 'Default sampling can miss skew. Use FULLSCAN for critical, skewed, or large-but-important tables. PERSIST_SAMPLE_PERCENT keeps your choice.' },
      { h: 'Filtered and multi-column stats', t: 'Create them when two columns are correlated (country + state) or one value range is hot.' },
      { h: 'Minimum estimate', t: 'The optimizer never estimates fewer than 1 row. A plan estimating 1 row on a large input is the classic sign of stale or missing statistics.' }
    ],
    pitfalls: [
      'Rebuilding indexes and assuming statistics are fine. A reorganize does not update statistics.',
      'Updating with a tiny sample on a skewed column.',
      'Table variables and some functions have no statistics. Use #temp tables for large sets.'
    ],
    scripts: [
      {
        title: 'Inspect histogram and statistics freshness',
        sql: `DBCC SHOW_STATISTICS ('dbo.Orders', 'IX_Orders_CustomerID') WITH HISTOGRAM;

SELECT s.name, sp.last_updated, sp.rows, sp.rows_sampled,
       sp.modification_counter, sp.steps
FROM sys.stats s
CROSS APPLY sys.dm_db_stats_properties(s.object_id, s.stats_id) sp
WHERE s.object_id = OBJECT_ID('dbo.Orders')
ORDER BY sp.modification_counter DESC;`
      },
      {
        title: 'Fix and prevent',
        sql: `UPDATE STATISTICS dbo.Orders WITH FULLSCAN;

-- Keep a chosen sample for later auto-updates
UPDATE STATISTICS dbo.Orders WITH SAMPLE 25 PERCENT, PERSIST_SAMPLE_PERCENT = ON;

-- Correlated columns
CREATE STATISTICS st_Customers_Country_State ON dbo.Customers (Country, State);

-- Update in the background instead of blocking the user query
ALTER DATABASE CURRENT SET AUTO_UPDATE_STATISTICS_ASYNC ON;`
      }
    ],
    tryIt: 'In the Plan Visualizer, a [3372x Skew] badge means this exact problem. Click it to open the resolution plan.'
  },
  {
    id: 'sniffing',
    title: 'Parameter Sniffing',
    tier: 'Intermediate',
    icon: <Shuffle size={15} />,
    summary:
      'When a procedure first compiles, the optimizer "sniffs" the parameter values and builds a plan tuned for them. That plan is cached and reused. If later values have very different row counts, the cached plan can be terrible.',
    flow: [
      { title: 'First call @Status = RARE', sub: '10 rows', tone: 'blue' },
      { title: 'Plan compiled', sub: 'Seek + Nested Loops + lookups', tone: 'amber' },
      { title: 'Plan cached', sub: 'Reused for every call', tone: 'purple' },
      { title: 'Call @Status = COMMON', sub: '5,000,000 rows', tone: 'rose' },
      { title: 'Same plan, slow', sub: 'Millions of lookups', tone: 'rose' }
    ],
    points: [
      { h: 'OPTION (RECOMPILE)', t: 'Fresh plan every execution using real values. Best for rarely executed or very skewed queries. Costs CPU for each compile.' },
      { h: 'OPTIMIZE FOR (@p = value)', t: 'Builds the plan for a value you choose. Good when you know a typical or worst-case value.' },
      { h: 'OPTIMIZE FOR UNKNOWN', t: 'Uses the average density, so you get a stable, medium plan. Not optimal for anyone, but predictable.' },
      { h: 'Branching / dynamic SQL', t: 'Route rare values and common values to different statements so each gets its own plan.' },
      { h: 'PSP optimization (SQL 2022)', t: 'At compat level 160, Parameter Sensitive Plan optimization can keep up to three plans for one query for different ranges of an equality predicate. It is automatic and needs no code change.' },
      { h: 'Query Store hints / forcing', t: 'Force a good plan, or apply a hint without changing application code (hints are available in SQL 2022 and Azure SQL).' }
    ],
    pitfalls: [
      'Using OPTIMIZE FOR UNKNOWN everywhere. It hides the problem for the common case.',
      'Testing in SSMS with local variables. They are not sniffed, so you see a different plan from production.',
      'Clearing the plan cache to "fix" it. It returns after the next bad first call.'
    ],
    scripts: [
      {
        title: 'Typical fixes',
        sql: `-- 1) Recompile when values vary wildly
SELECT OrderID, Total FROM dbo.Orders WHERE Status = @Status
OPTION (RECOMPILE);

-- 2) Plan for a representative value
SELECT OrderID, Total FROM dbo.Orders WHERE Status = @Status
OPTION (OPTIMIZE FOR (@Status = 'SHIPPED'));

-- 3) Stable average plan
SELECT OrderID, Total FROM dbo.Orders WHERE Status = @Status
OPTION (OPTIMIZE FOR UNKNOWN);`
      },
      {
        title: 'See compiled vs runtime values (heavy; do not run often on busy servers)',
        sql: `SELECT TOP (20) st.text, qp.query_plan
FROM sys.dm_exec_cached_plans cp
CROSS APPLY sys.dm_exec_query_plan(cp.plan_handle) qp
CROSS APPLY sys.dm_exec_sql_text(cp.plan_handle)   st
WHERE CAST(qp.query_plan AS nvarchar(max)) LIKE N'%ParameterCompiledValue%'
  AND st.text LIKE N'%usp_GetOrders%';
-- In the plan XML compare ParameterCompiledValue with ParameterRuntimeValue.`
      }
    ],
    tryIt: 'Look at the plan properties for Parameter List: compiled value vs runtime value tells you immediately.'
  },
  {
    id: 'grants',
    title: 'Memory Grants & Spills',
    tier: 'Advanced',
    icon: <MemoryStick size={15} />,
    summary:
      'Sorts and hash operators need workspace memory, reserved before the query starts based on estimated rows and row size. Over-estimates waste memory and block other queries. Under-estimates make the operator spill to TempDB.',
    flow: [
      { title: 'Estimate rows × row size', sub: 'Optimizer sizes the grant', tone: 'blue' },
      { title: 'Request grant', sub: 'Waits in queue if memory is short', tone: 'amber' },
      { title: 'Run with granted memory', sub: 'Used vs Granted', tone: 'purple' },
      { title: 'Too small?', sub: 'Spill to TempDB (Sort/Hash Warning)', tone: 'rose' },
      { title: 'Too big?', sub: 'RESOURCE_SEMAPHORE for others', tone: 'rose' }
    ],
    points: [
      { h: 'Where to see it', t: 'The root operator of an actual plan shows Granted, Used, Desired and Ideal memory. Granted far above Used means an over-estimate. A spill warning means an under-estimate.' },
      { h: 'RESOURCE_SEMAPHORE', t: 'Queries waiting for a grant. Usually many large over-estimated grants. Fix the estimates first, not the memory.' },
      { h: 'Per-query cap', t: 'By default a query can take up to 25% of the workspace memory. Resource Governor can lower it.' },
      { h: 'Memory Grant Feedback', t: 'Batch mode in SQL 2017; row mode in SQL 2019 (compat 150). Persisted across restarts in SQL 2022. It adjusts the grant after a run.' },
      { h: 'Variable-length columns', t: 'The optimizer assumes about half of a VARCHAR(n) is used, so oversized columns inflate grants. Size columns realistically.' },
      { h: 'Hints', t: 'MIN_GRANT_PERCENT and MAX_GRANT_PERCENT can fix a stubborn query. Use them as a last step.' }
    ],
    pitfalls: [
      'Adding RAM to cure RESOURCE_SEMAPHORE without fixing row estimates.',
      'Sorting on wide columns you do not need (SELECT * with ORDER BY).',
      'Ignoring the grant when the plan "looks fine".'
    ],
    scripts: [
      {
        title: 'Live grants and queued requests',
        sql: `SELECT session_id, requested_memory_kb, granted_memory_kb, used_memory_kb,
       ideal_memory_kb, wait_time_ms, dop
FROM sys.dm_exec_query_memory_grants
ORDER BY requested_memory_kb DESC;

SELECT * FROM sys.dm_exec_query_resource_semaphores;  -- waiter_count > 0 means queueing`
      },
      {
        title: 'Cap an over-grant',
        sql: `SELECT ... FROM dbo.BigTable ORDER BY SomeCol
OPTION (MAX_GRANT_PERCENT = 5);   -- a percent of the max allowed per-query grant`
      }
    ],
    tryIt: 'In the Plan Visualizer, open the root node and check the memory grant block for Granted vs Used.'
  },
  {
    id: 'indexes',
    title: 'Index Design Strategy',
    tier: 'Foundation',
    icon: <ListTree size={15} />,
    summary:
      'A good index makes the common query a narrow seek that returns just the rows needed. A bad index set slows every write and still does not help. Design from the queries, then verify with the plan.',
    flow: [
      { title: 'Equality columns first', sub: 'WHERE a = @a', tone: 'blue' },
      { title: 'Then range / sort column', sub: 'AND b >= @b / ORDER BY', tone: 'amber' },
      { title: 'INCLUDE the rest', sub: 'Cover SELECT columns', tone: 'purple' },
      { title: 'Seek with no lookup', sub: 'Narrow, covering', tone: 'green' }
    ],
    ascii: {
      title: 'Key lookup tipping point',
      body: `Nonclustered seek finds N rows, then N Key Lookups (random reads)
Rule of thumb: when N reaches about 25 to 33 percent of the table's PAGE count,
a scan is cheaper than N lookups, so the optimizer switches to a scan.
Fix: add INCLUDE columns so no lookup is needed.`
    },
    points: [
      { h: 'Key order', t: 'Put equality columns first, then the range or ORDER BY column. Selectivity helps break ties, but it is a heuristic. Always verify with the plan.' },
      { h: 'INCLUDE columns', t: 'Add output columns to the leaf level without making the key wide. This removes Key Lookups.' },
      { h: 'Filtered indexes', t: 'Index only the rows you query (WHERE IsActive = 1). Smaller and cheaper, but parameterized queries may not match them without a recompile.' },
      { h: 'Clustered key', t: 'Keep it narrow, unique, static and ever-increasing. It is copied into every nonclustered index.' },
      { h: 'Columnstore', t: 'Excellent for large analytic scans and aggregates. Not for point lookups on OLTP tables.' },
      { h: 'Missing index DMV limits', t: 'It ignores existing indexes, does not order key columns well, does not suggest filtered or columnstore indexes, and resets on restart. Treat it as hints, not a design.' }
    ],
    pitfalls: [
      'Creating every suggestion from the missing-index DMV. You get overlapping, duplicate indexes.',
      'Never dropping unused indexes. Each one is paid for on every INSERT/UPDATE/DELETE.',
      'Random GUID clustered keys (page splits, fragmentation).'
    ],
    scripts: [
      {
        title: 'Missing index candidates (review, do not blindly create)',
        sql: `SELECT TOP (20)
       ROUND(s.avg_total_user_cost * s.avg_user_impact * (s.user_seeks + s.user_scans), 0) AS score,
       d.statement, d.equality_columns, d.inequality_columns, d.included_columns,
       s.user_seeks, s.avg_user_impact
FROM sys.dm_db_missing_index_group_stats s
JOIN sys.dm_db_missing_index_groups  g ON s.group_handle = g.index_group_handle
JOIN sys.dm_db_missing_index_details d ON g.index_handle  = d.index_handle
ORDER BY score DESC;`
      },
      {
        title: 'Write-heavy, rarely read indexes',
        sql: `SELECT OBJECT_NAME(i.object_id) AS tbl, i.name AS idx,
       us.user_seeks, us.user_scans, us.user_lookups, us.user_updates
FROM sys.indexes i
LEFT JOIN sys.dm_db_index_usage_stats us
  ON us.object_id = i.object_id AND us.index_id = i.index_id AND us.database_id = DB_ID()
WHERE OBJECTPROPERTY(i.object_id, 'IsUserTable') = 1
  AND i.type_desc = 'NONCLUSTERED' AND i.is_primary_key = 0 AND i.is_unique_constraint = 0
ORDER BY ISNULL(us.user_updates, 0) DESC;`
      }
    ],
    tryIt: 'The Missing Indexes tab of PlanIQ reads these suggestions from your plan. Combine them with the key-order rules above.'
  },
  {
    id: 'iqp',
    title: 'Intelligent Query Processing (IQP)',
    tier: 'Intermediate',
    icon: <Rocket size={15} />,
    summary:
      'IQP features fix common plan problems automatically, with no code changes. Most are enabled simply by raising the database compatibility level, so test with Query Store first.',
    flow: [
      { title: 'Raise compat level', sub: '150 = 2019, 160 = 2022', tone: 'blue' },
      { title: 'Features activate', sub: 'Per query, when eligible', tone: 'purple' },
      { title: 'Compare in Query Store', sub: 'Watch for regressions', tone: 'amber' },
      { title: 'Force or disable per query', sub: 'USE HINT(...)', tone: 'green' }
    ],
    table: {
      title: 'What arrives where',
      head: ['Feature', 'Version', 'Compat', 'What it does'],
      rows: [
        ['Adaptive Joins (batch mode)', '2017', '140', 'Chooses Nested Loops or Hash at runtime by row count'],
        ['Batch Mode Memory Grant Feedback', '2017', '140', 'Tunes the grant after a run'],
        ['Interleaved Execution (MSTVF)', '2017', '140', 'Uses the real row count of multi-statement TVFs'],
        ['Batch Mode on Rowstore', '2019', '150', 'Batch mode without a columnstore index'],
        ['Row Mode Memory Grant Feedback', '2019', '150', 'Grant feedback for ordinary row-mode plans'],
        ['Table Variable Deferred Compilation', '2019', '150', 'Real row count of table variables (still no histogram)'],
        ['Scalar UDF Inlining', '2019', '150', 'Turns eligible scalar UDFs into set-based expressions'],
        ['Parameter Sensitive Plan', '2022', '160', 'Multiple plans for one parameterized query'],
        ['DOP Feedback', '2022', '160', 'Adjusts degree of parallelism over time'],
        ['CE Feedback / Persisted MGF', '2022', '160', 'Needs Query Store; learns better estimates and grants']
      ]
    },
    points: [
      { h: 'Why this corrects the old advice', t: 'Older guidance said Adaptive Joins are columnstore-only, scalar UDFs always kill performance, and table variables always estimate 1 row. All three changed in 2019.' },
      { h: 'Risk', t: 'A compat-level change can change plans. Capture a Query Store baseline first so you can compare and force the old plan.' },
      { h: 'Eligibility', t: 'Features have conditions (for example, UDF inlining skips UDFs using certain constructs). A feature "not firing" is normal.' }
    ],
    pitfalls: [
      'Raising compat level on production without a Query Store baseline.',
      'Assuming UDF inlining always applies.',
      'Forgetting that IQP does not fix missing indexes or stale statistics.'
    ],
    scripts: [
      {
        title: 'Check and change compat level',
        sql: `SELECT name, compatibility_level FROM sys.databases;
ALTER DATABASE CURRENT SET COMPATIBILITY_LEVEL = 160;  -- SQL Server 2022`
      },
      {
        title: 'Opt a single query out of a feature',
        sql: `SELECT ... FROM ...
OPTION (USE HINT('DISABLE_BATCH_MODE_ADAPTIVE_JOINS'));
-- Others: DISABLE_BATCH_MODE_MEMORY_GRANT_FEEDBACK,
--         DISABLE_DEFERRED_COMPILATION_TV, DISABLE_TSQL_SCALAR_UDF_INLINING`
      }
    ],
    tryIt: 'Check the Tuning Playbook anti-pattern for Scalar UDFs. On 2019 and later it may already be handled by inlining.'
  },
  {
    id: 'querystore',
    title: 'Query Store Workflow',
    tier: 'Intermediate',
    icon: <History size={15} />,
    summary:
      'Query Store is a flight recorder for queries and plans. It stores runtime stats per plan and per time interval, so you can see what changed and force a known good plan.',
    flow: [
      { title: 'Capture', sub: 'Plans and stats per interval', tone: 'blue' },
      { title: 'Detect', sub: 'Regressed Queries report', tone: 'rose' },
      { title: 'Compare', sub: 'Plan A vs plan B', tone: 'amber' },
      { title: 'Force', sub: 'sp_query_store_force_plan', tone: 'purple' },
      { title: 'Verify', sub: 'Runtime stats improve', tone: 'green' }
    ],
    points: [
      { h: 'Where to start', t: 'Open Regressed Queries or Top Resource Consumers in SSMS. Pick a query with several plans and compare duration, CPU and reads per plan.' },
      { h: 'Forcing a plan', t: 'Forcing is a temporary tool. It can fail if the schema changes (an index is dropped), so monitor forced plans for failures.' },
      { h: 'Wait stats per query', t: 'Query Wait Stats (2017+) show whether a query is slow from CPU, locks, I/O or memory.' },
      { h: 'Capture mode', t: 'AUTO ignores trivial and rare queries, which keeps overhead and size under control. On by default for new databases in SQL 2022.' },
      { h: 'Automatic plan correction', t: 'FORCE_LAST_GOOD_PLAN can revert regressions automatically. Review what it did.' }
    ],
    pitfalls: [
      'Forcing plans and forgetting them. Revisit after schema or data changes.',
      'Leaving Query Store full (it goes read-only). Set size and cleanup policies.',
      'Comparing only averages. Look at variance and execution counts.'
    ],
    scripts: [
      {
        title: 'Enable with sane settings',
        sql: `ALTER DATABASE CURRENT SET QUERY_STORE = ON
(OPERATION_MODE = READ_WRITE, QUERY_CAPTURE_MODE = AUTO,
 MAX_STORAGE_SIZE_MB = 1024, INTERVAL_LENGTH_MINUTES = 30,
 CLEANUP_POLICY = (STALE_QUERY_THRESHOLD_DAYS = 30));`
      },
      {
        title: 'Plans per query, then force the good one',
        sql: `SELECT p.query_id, p.plan_id, p.last_execution_time,
       rs.avg_duration / 1000.0 AS avg_ms, rs.avg_cpu_time / 1000.0 AS avg_cpu_ms,
       rs.avg_logical_io_reads, rs.count_executions
FROM sys.query_store_plan p
JOIN sys.query_store_runtime_stats rs ON rs.plan_id = p.plan_id
WHERE p.query_id = 123   -- your query_id
ORDER BY rs.avg_duration;

EXEC sp_query_store_force_plan @query_id = 123, @plan_id = 456;
-- Undo: EXEC sp_query_store_unforce_plan @query_id = 123, @plan_id = 456;`
      }
    ],
    tryIt: 'Use this before changing compatibility level so you have a baseline to roll back to.'
  },
  {
    id: 'concurrency',
    title: 'Concurrency, Isolation & Deadlocks',
    tier: 'Advanced',
    icon: <Lock size={15} />,
    summary:
      'Blocking is waiting for a lock held by another session. A deadlock is two sessions each waiting for the other, so SQL Server kills one. Both are design problems, not just configuration.',
    table: {
      title: 'Isolation levels',
      head: ['Level', 'Readers block writers?', 'Dirty reads', 'Notes'],
      rows: [
        ['READ UNCOMMITTED (NOLOCK)', 'No', 'Yes', 'Can also duplicate or skip rows. Avoid for correctness.'],
        ['READ COMMITTED (default)', 'Yes (shared locks)', 'No', 'Blocking between readers and writers.'],
        ['READ COMMITTED SNAPSHOT (RCSI)', 'No (row versions)', 'No', 'Same code, no reader/writer blocking. Uses version store.'],
        ['SNAPSHOT', 'No (row versions)', 'No', 'Transaction-level consistency; update conflicts possible.'],
        ['REPEATABLE READ / SERIALIZABLE', 'Yes', 'No', 'Stronger guarantees, more blocking and deadlocks.']
      ]
    },
    flow: [
      { title: 'Session 1 locks A', sub: 'Wants B', tone: 'blue' },
      { title: 'Session 2 locks B', sub: 'Wants A', tone: 'amber' },
      { title: 'Circular wait', sub: 'Neither can proceed', tone: 'rose' },
      { title: 'Deadlock monitor', sub: 'Picks a victim (error 1205)', tone: 'purple' },
      { title: 'Retry or fix order', sub: 'Index, order, shorter txn', tone: 'green' }
    ],
    points: [
      { h: 'RCSI is the usual fix', t: 'It removes reader/writer blocking without dirty reads. Costs version-store space in TempDB (or the database with Accelerated Database Recovery) and 14 bytes per row.' },
      { h: 'Reading a deadlock graph', t: 'Find the victim, the two processes, the resources (keys/pages) and the statements. Most deadlocks come from inconsistent access order or a lookup that needs a missing index.' },
      { h: 'Lock escalation', t: 'About 5,000 locks on one object can escalate to a table lock. Batch large updates and index properly.' },
      { h: 'Lead blocker', t: 'Always follow the chain to the head. The head blocker is often an open transaction or a slow client.' },
      { h: 'Retry logic', t: 'Applications should retry on error 1205. It is an expected condition.' }
    ],
    pitfalls: [
      'Using NOLOCK as a standard hint.',
      'Long transactions that include user think time or network calls.',
      'Enabling RCSI without watching TempDB version store size.'
    ],
    scripts: [
      {
        title: 'Enable RCSI',
        sql: `ALTER DATABASE [YourDb] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
-- ROLLBACK IMMEDIATE disconnects other sessions. Run in a maintenance window.`
      },
      {
        title: 'Recent deadlocks from system_health',
        sql: `SELECT CAST(event_data AS xml) AS deadlock_xml
FROM sys.fn_xe_file_target_read_file(N'system_health*.xel', NULL, NULL, NULL)
WHERE object_name = N'xml_deadlock_report';
-- Open the XML result in SSMS to see the graph.`
      },
      {
        title: 'Current blocking chain',
        sql: `SELECT r.session_id, r.blocking_session_id, r.wait_type, r.wait_time,
       DB_NAME(r.database_id) AS db, st.text
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
WHERE r.blocking_session_id <> 0;`
      }
    ]
  },
  {
    id: 'xevents',
    title: 'Extended Events',
    tier: 'Intermediate',
    icon: <Radar size={15} />,
    summary:
      'Extended Events (XE) is the lightweight replacement for SQL Trace and Profiler. You choose events, filters (predicates), actions and a target, so you only pay for what you capture.',
    flow: [
      { title: 'Event', sub: 'rpc_completed, deadlock, wait_info', tone: 'blue' },
      { title: 'Predicate', sub: 'duration > 1 s (filter early)', tone: 'amber' },
      { title: 'Actions', sub: 'sql_text, database_name, app', tone: 'purple' },
      { title: 'Target', sub: 'event_file (.xel) or ring buffer', tone: 'green' }
    ],
    points: [
      { h: 'Filter in the session', t: 'Predicates run before data is stored. A duration filter turns a firehose into a short list.' },
      { h: 'Units', t: 'Duration is in microseconds. 1,000,000 equals 1 second.' },
      { h: 'Useful events', t: 'rpc_completed, sql_batch_completed, sql_statement_completed, xml_deadlock_report, blocked_process_report, wait_info, and query_post_execution_showplan (expensive, use sparingly).' },
      { h: 'Blocked process report', t: 'Needs the "blocked process threshold" setting and the blocked_process_report event.' },
      { h: 'system_health', t: 'Already running by default. It records deadlocks, errors and long waits.' }
    ],
    pitfalls: [
      'Capturing actual showplans for every query. It is expensive.',
      'Writing to a ring buffer for long periods and losing events. Prefer event_file.',
      'No predicate, so the session captures everything.'
    ],
    scripts: [
      {
        title: 'Slow statements session',
        sql: `CREATE EVENT SESSION [PlanIQ_Slow] ON SERVER
ADD EVENT sqlserver.sql_statement_completed (
  ACTION (sqlserver.sql_text, sqlserver.database_name, sqlserver.client_app_name)
  WHERE duration > 1000000)
ADD TARGET package0.event_file (SET filename = N'PlanIQ_Slow.xel', max_file_size = (50))
WITH (EVENT_RETENTION_MODE = ALLOW_SINGLE_EVENT_LOSS, STARTUP_STATE = OFF);

ALTER EVENT SESSION [PlanIQ_Slow] ON SERVER STATE = START;`
      },
      {
        title: 'Blocked process report',
        sql: `EXEC sp_configure 'show advanced options', 1; RECONFIGURE;
EXEC sp_configure 'blocked process threshold (s)', 10; RECONFIGURE;
-- Then add event sqlserver.blocked_process_report to a session.`
      }
    ]
  },
  {
    id: 'partitioning',
    title: 'Partitioning & Data Lifecycle',
    tier: 'Advanced',
    icon: <Layers size={15} />,
    summary:
      'Partitioning splits a table by a key (usually date). Its first benefit is manageability: switch in new data and switch out old data instantly. Query speedup only comes from partition elimination, which needs a predicate on the partition key.',
    ascii: {
      title: 'Sliding window',
      body: `RANGE RIGHT on OrderDate

P1: < 2024-01-01 | P2: 2024 | P3: 2025 | P4: 2026 | (new empty partition at the right)
   |                                           |
   +-- SWITCH OUT to archive (metadata only)   +-- SPLIT adds next boundary

WHERE OrderDate >= '2026-01-01'  ->  touches P4 only (elimination)
WHERE CustomerID = 42            ->  touches ALL partitions (no key predicate)`
    },
    points: [
      { h: 'Not a magic speed switch', t: 'Without a partition-key predicate every partition is probed, and plans can get slightly worse. Do it for lifecycle first.' },
      { h: 'Aligned indexes', t: 'Keep indexes on the same partition scheme. Partition switching requires alignment and identical structure.' },
      { h: 'Where the key goes', t: 'The partition column must be part of the clustered key (and any unique index).' },
      { h: 'Statistics', t: 'Incremental statistics let SQL Server update only changed partitions.' },
      { h: 'Alternatives', t: 'Archiving old rows to a separate table or database is simpler and often enough.' }
    ],
    pitfalls: [
      'Partitioning small tables.',
      'Queries that do not filter on the partition column.',
      'Forgetting to create the next partition ahead of time.'
    ],
    scripts: [
      {
        title: 'Monthly/Yearly partitioning skeleton',
        sql: `CREATE PARTITION FUNCTION pf_OrderDate (date)
AS RANGE RIGHT FOR VALUES ('2024-01-01', '2025-01-01', '2026-01-01');

CREATE PARTITION SCHEME ps_OrderDate AS PARTITION pf_OrderDate ALL TO ([PRIMARY]);

CREATE TABLE dbo.OrdersP (
    OrderID   bigint NOT NULL,
    OrderDate date   NOT NULL,
    Total     money  NOT NULL,
    CONSTRAINT PK_OrdersP PRIMARY KEY CLUSTERED (OrderDate, OrderID)
) ON ps_OrderDate (OrderDate);

-- Which partition does a value land in?
SELECT $PARTITION.pf_OrderDate('2025-06-15') AS partition_number;`
      },
      {
        title: 'Switch old data out (target must match structure and partition)',
        sql: `ALTER TABLE dbo.OrdersP SWITCH PARTITION 1 TO dbo.OrdersArchive;
-- Metadata-only operation: effectively instant, regardless of row count.`
      }
    ]
  },
  {
    id: 'inmemory',
    title: 'In-Memory OLTP',
    tier: 'Advanced',
    icon: <Zap size={15} />,
    summary:
      'Memory-optimized tables use optimistic, lock-free structures. They remove locking and latching for hot, high-concurrency workloads, but they cost memory and have restrictions. It is a specialist tool.',
    flow: [
      { title: 'Hot contention?', sub: 'PAGELATCH_EX on last page, locks', tone: 'rose' },
      { title: 'Candidate', sub: 'Session state, staging, queues', tone: 'amber' },
      { title: 'Size memory', sub: 'Data + index + row versions', tone: 'purple' },
      { title: 'Measure', sub: 'Throughput and latency', tone: 'green' }
    ],
    points: [
      { h: 'Good fits', t: 'Very high insert rates with last-page latch contention, session state, ETL staging, and temp-table-heavy code (memory-optimized table types).' },
      { h: 'Durability', t: 'SCHEMA_AND_DATA is durable. SCHEMA_ONLY survives restarts as structure only, so use it for disposable data.' },
      { h: 'Hash indexes', t: 'Need a good BUCKET_COUNT. Great for equality lookups, poor for ranges (use a range index).' },
      { h: 'Not a fix for scans', t: 'Analytic scans are better served by columnstore.' },
      { h: 'Do not confuse', t: 'Memory-Optimized TempDB Metadata (2019) is a separate, lighter feature that removes system-table contention in TempDB.' }
    ],
    pitfalls: [
      'Running out of memory (the database can stop accepting changes).',
      'Poor hash bucket sizing.',
      'Choosing it before fixing indexes, queries and statistics.'
    ],
    scripts: [
      {
        title: 'Disposable session-state table',
        sql: `-- One-time: add a MEMORY_OPTIMIZED_DATA filegroup and container to the database first
CREATE TABLE dbo.SessionState (
    SessionId int NOT NULL PRIMARY KEY NONCLUSTERED HASH WITH (BUCKET_COUNT = 1048576),
    Payload   varbinary(4000) NULL,
    UpdatedAt datetime2 NOT NULL
) WITH (MEMORY_OPTIMIZED = ON, DURABILITY = SCHEMA_ONLY);`
      }
    ]
  }
];

/* ---------------------------------------------------------------------------
   Hands-on lab scenarios
--------------------------------------------------------------------------- */
interface LabScenario {
  id: string;
  title: string;
  badSql: string;
  question: string;
  options: { text: string; correct: boolean; why: string }[];
  fixedSql: string;
  takeaway: string;
}

const LAB: LabScenario[] = [
  {
    id: 'year',
    title: 'The slow date filter',
    badSql: `SELECT OrderID, Total
FROM dbo.Orders
WHERE YEAR(OrderDate) = 2025;   -- index on OrderDate exists`,
    question: 'The plan shows an Index Scan reading every row. What is the best fix?',
    options: [
      { text: 'Add another index on YEAR(OrderDate) via hint', correct: false, why: 'You cannot hint an index into seeking when the column is wrapped in a function.' },
      { text: 'Rewrite as a range on the bare column', correct: true, why: 'A range lets SQL Server seek the OrderDate index to the start of the range and stop at the end.' },
      { text: 'Add OPTION (MAXDOP 1)', correct: false, why: 'Parallelism is unrelated to why the engine cannot seek.' }
    ],
    fixedSql: `SELECT OrderID, Total
FROM dbo.Orders
WHERE OrderDate >= '20250101' AND OrderDate < '20260101';`,
    takeaway: 'Keep the indexed column bare. Move the logic to the other side of the comparison.'
  },
  {
    id: 'notin',
    title: 'The query that returns nothing',
    badSql: `-- Customers who never ordered
SELECT c.CustomerID
FROM dbo.Customers c
WHERE c.CustomerID NOT IN (SELECT o.CustomerID FROM dbo.Orders o);
-- Returns 0 rows, but you know there are customers without orders.`,
    question: 'Why does it return zero rows?',
    options: [
      { text: 'Orders.CustomerID contains a NULL, so NOT IN becomes UNKNOWN', correct: true, why: 'x NOT IN (1, NULL) cannot be true. One NULL poisons the whole predicate.' },
      { text: 'The optimizer chose a hash join', correct: false, why: 'The join method never changes the result set.' },
      { text: 'Statistics are out of date', correct: false, why: 'Stale statistics change the plan, not the logical result.' }
    ],
    fixedSql: `SELECT c.CustomerID
FROM dbo.Customers c
WHERE NOT EXISTS (SELECT 1 FROM dbo.Orders o WHERE o.CustomerID = c.CustomerID);`,
    takeaway: 'Use NOT EXISTS for anti-joins. It is NULL-safe and gives the optimizer an anti semi join.'
  },
  {
    id: 'lookup',
    title: 'Seek with a million lookups',
    badSql: `SELECT OrderID, CustomerID, Total, Notes
FROM dbo.Orders
WHERE CustomerID = @CustomerID;
-- Index IX_Orders_CustomerID (CustomerID). Plan: Index Seek + Key Lookup x 800,000`,
    question: 'Which change removes the lookups?',
    options: [
      { text: 'Replace the nonclustered index with a clustered one', correct: false, why: 'A table has one clustered index and it is probably already used for another purpose.' },
      { text: 'Add INCLUDE (Total, Notes) to the nonclustered index, or select fewer columns', correct: true, why: 'A covering index holds every needed column at the leaf, so no trip back to the clustered index is needed.' },
      { text: 'Add NOLOCK', correct: false, why: 'Locking hints do not change how data is fetched.' }
    ],
    fixedSql: `CREATE INDEX IX_Orders_CustomerID
ON dbo.Orders (CustomerID)
INCLUDE (Total, Notes);   -- and avoid SELECT * if Notes is wide`,
    takeaway: 'Cover the query with INCLUDE columns. Also ask whether you really need every column.'
  },
  {
    id: 'sniff',
    title: 'Fast in SSMS, slow in the app',
    badSql: `-- Stored procedure
CREATE PROCEDURE dbo.usp_GetOrders @Status varchar(20) AS
SELECT OrderID, Total FROM dbo.Orders WHERE Status = @Status;
-- Runs in 20 ms for 'CANCELLED' and 40 seconds for 'SHIPPED' with the same cached plan.`,
    question: 'What is the most appropriate first fix?',
    options: [
      { text: 'Clear the plan cache every hour', correct: false, why: 'The problem returns at the next bad first call.' },
      { text: 'Use OPTION (RECOMPILE) or a branching/OPTIMIZE FOR strategy for this statement', correct: true, why: 'This is parameter sniffing. Different values need different plans, or at least a deliberate plan choice.' },
      { text: 'Increase max server memory', correct: false, why: 'Memory does not change which plan the cache holds.' }
    ],
    fixedSql: `CREATE OR ALTER PROCEDURE dbo.usp_GetOrders @Status varchar(20) AS
SELECT OrderID, Total FROM dbo.Orders WHERE Status = @Status
OPTION (RECOMPILE);   -- or OPTIMIZE FOR / separate statements per skew class`,
    takeaway: 'When the same query has very different row counts per value, stop sharing one plan blindly.'
  }
];

/* ---------------------------------------------------------------------------
   Small UI pieces
--------------------------------------------------------------------------- */
const FlowDiagram: React.FC<{ steps: FlowStep[]; caption?: string }> = ({ steps, caption }) => (
  <div className="adv-flow">
    <div className="adv-flow-row">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div className={`adv-flow-step tone-${s.tone}`}>
            <span className="adv-flow-num">{i + 1}</span>
            <strong>{s.title}</strong>
            {s.sub && <span>{s.sub}</span>}
          </div>
          {i < steps.length - 1 && <span className="adv-flow-arrow">→</span>}
        </React.Fragment>
      ))}
    </div>
    {caption && <div className="adv-flow-caption">{caption}</div>}
  </div>
);

const CopyCode: React.FC<{ id: string; title: string; sql: string; copied: string | null; onCopy: (id: string, t: string) => void }> = ({
  id,
  title,
  sql,
  copied,
  onCopy
}) => (
  <div className="tsql-copy-card">
    <div className="tsql-header">
      <span>{title}</span>
      <button className="btn-copy-sm" onClick={() => onCopy(id, sql)}>
        {copied === id ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
        <span>{copied === id ? 'Copied' : 'Copy T-SQL'}</span>
      </button>
    </div>
    <pre>
      <code>{sql}</code>
    </pre>
  </div>
);

/* ---------------------------------------------------------------------------
   Main component
--------------------------------------------------------------------------- */
const STORAGE_KEY = 'planiq_adv_progress';
const PATH_STAGES: { name: string; tone: Tone; ids: string[] }[] = [
  { name: 'Stage 1: Foundation', tone: 'blue', ids: ['plans', 'indexes'] },
  { name: 'Stage 2: Intermediate', tone: 'amber', ids: ['stats', 'sniffing', 'querystore', 'xevents', 'iqp'] },
  { name: 'Stage 3: Advanced', tone: 'rose', ids: ['grants', 'concurrency', 'partitioning', 'inmemory', 'lab'] }
];

export const AdvancedOptimizationView: React.FC = () => {
  const [active, setActive] = useState<string>('path');
  const [copied, setCopied] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  });
  const [answers, setAnswers] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
    } catch {
      /* storage unavailable */
    }
  }, [done]);

  const onCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleDone = (id: string) => setDone((d) => ({ ...d, [id]: !d[id] }));
  const totalItems = TOPICS.length + 1; // + lab
  const doneCount = useMemo(() => Object.values(done).filter(Boolean).length, [done]);
  const topic = TOPICS.find((t) => t.id === active);
  const labScore = LAB.filter((s) => answers[s.id] !== undefined && s.options[answers[s.id]].correct).length;

  return (
    <div className="adv-layout">
      <nav className="adv-nav glass-panel">
        <button className={`adv-nav-btn ${active === 'path' ? 'active' : ''}`} onClick={() => setActive('path')}>
          <MapIcon size={15} />
          <span>Learning Path</span>
        </button>
        <div className="adv-nav-label">Topics</div>
        {TOPICS.map((t) => (
          <button key={t.id} className={`adv-nav-btn ${active === t.id ? 'active' : ''}`} onClick={() => setActive(t.id)}>
            {t.icon}
            <span>{t.title}</span>
            {done[t.id] && <CheckCircle2 size={13} color="#34d399" />}
          </button>
        ))}
        <div className="adv-nav-label">Practice</div>
        <button className={`adv-nav-btn ${active === 'lab' ? 'active' : ''}`} onClick={() => setActive('lab')}>
          <FlaskConical size={15} />
          <span>Tune This Query Lab</span>
          {done.lab && <CheckCircle2 size={13} color="#34d399" />}
        </button>
        <div className="adv-progress">
          <span>
            {doneCount} / {totalItems} completed
          </span>
          <div className="adv-progress-bar">
            <div style={{ width: `${(doneCount / totalItems) * 100}%` }} />
          </div>
        </div>
      </nav>

      <div className="adv-main">
        {/* Learning path */}
        {active === 'path' && (
          <div className="methodology-section glass-panel">
            <div className="section-title-row">
              <div className="section-title-group">
                <div className="section-badge-icon badge-blue-glow">
                  <MapIcon size={18} color="#38bdf8" />
                </div>
                <div>
                  <h3 className="section-title">Advanced Query Optimization: Learning Path</h3>
                  <p className="section-subtitle">
                    Follow the stages in order. Each topic has a diagram, key points, pitfalls and copyable scripts. Your progress is saved in this browser.
                  </p>
                </div>
              </div>
            </div>
            <div className="path-stages">
              {PATH_STAGES.map((st) => (
                <div className={`path-stage tone-${st.tone}`} key={st.name}>
                  <div className="path-stage-title">{st.name}</div>
                  {st.ids.map((id) => {
                    const t = TOPICS.find((x) => x.id === id);
                    const title = t ? t.title : 'Tune This Query Lab';
                    return (
                      <div className="path-item" key={id}>
                        <input type="checkbox" checked={!!done[id]} onChange={() => toggleDone(id)} className="audit-checkbox" />
                        <button className="path-link" onClick={() => setActive(id)}>
                          {title}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="adv-note">
              <Lightbulb size={14} color="#fbbf24" />
              <span>
                Order matters: statistics and indexes explain most plan problems. Parameter sniffing, memory grants and IQP only make sense once you can read estimates versus actuals.
              </span>
            </div>
          </div>
        )}

        {/* Topic pages */}
        {topic && (
          <div className="methodology-section glass-panel">
            <div className="section-title-row">
              <div className="section-title-group">
                <div className="section-badge-icon badge-purple-glow">{topic.icon}</div>
                <div>
                  <span className={`adv-tier tier-${topic.tier.toLowerCase()}`}>{topic.tier}</span>
                  <h3 className="section-title">{topic.title}</h3>
                  <p className="section-subtitle">{topic.summary}</p>
                </div>
              </div>
              <label className="adv-done-toggle">
                <input type="checkbox" className="audit-checkbox" checked={!!done[topic.id]} onChange={() => toggleDone(topic.id)} />
                <span>Mark as learned</span>
              </label>
            </div>

            {topic.flow && <FlowDiagram steps={topic.flow} caption={topic.flowCaption} />}

            {topic.ascii && (
              <div className="adv-ascii">
                <div className="adv-ascii-title">{topic.ascii.title}</div>
                <pre>{topic.ascii.body}</pre>
              </div>
            )}

            {topic.table && (
              <div className="methodology-card">
                <h4 className="mini-h">{topic.table.title}</h4>
                <div className="sargable-table-wrap">
                  <table className="sargable-table">
                    <thead>
                      <tr>
                        {topic.table.head.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topic.table.rows.map((r, i) => (
                        <tr key={i}>
                          {r.map((c, j) => (
                            <td key={j}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="adv-points">
              {topic.points.map((p) => (
                <div className="adv-point" key={p.h}>
                  <strong>{p.h}</strong>
                  <p>{p.t}</p>
                </div>
              ))}
            </div>

            <div className="adv-pitfalls">
              <div className="adv-pitfalls-title">
                <AlertTriangle size={14} color="#f43f5e" />
                <span>Common pitfalls</span>
              </div>
              <ul className="bullet-feature-list">
                {topic.pitfalls.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>

            <div className="cards-two-col">
              {topic.scripts.map((s, i) => (
                <CopyCode key={i} id={`${topic.id}-${i}`} title={s.title} sql={s.sql} copied={copied} onCopy={onCopy} />
              ))}
            </div>

            {topic.tryIt && (
              <div className="adv-note">
                <Lightbulb size={14} color="#38bdf8" />
                <span>
                  <strong>Try it in PlanIQ:</strong> {topic.tryIt}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Lab */}
        {active === 'lab' && (
          <div className="methodology-section glass-panel">
            <div className="section-title-row">
              <div className="section-title-group">
                <div className="section-badge-icon badge-amber-glow">
                  <FlaskConical size={18} color="#fbbf24" />
                </div>
                <div>
                  <h3 className="section-title">Tune This Query: Hands-on Lab</h3>
                  <p className="section-subtitle">
                    Read each query, pick the best fix, then see the explanation and rewrite. Score: {labScore} / {LAB.length}
                  </p>
                </div>
              </div>
              <label className="adv-done-toggle">
                <input type="checkbox" className="audit-checkbox" checked={!!done.lab} onChange={() => toggleDone('lab')} />
                <span>Mark as done</span>
              </label>
            </div>

            {LAB.map((s, idx) => {
              const picked = answers[s.id];
              const answered = picked !== undefined;
              return (
                <div className="lab-card" key={s.id}>
                  <div className="lab-title">
                    <span className="badge badge-info">Case {idx + 1}</span>
                    <strong>{s.title}</strong>
                  </div>
                  <pre className="lab-code">{s.badSql}</pre>
                  <p className="lab-q">{s.question}</p>
                  <div className="lab-options">
                    {s.options.map((o, oi) => {
                      const isPicked = picked === oi;
                      const cls = answered ? (o.correct ? 'opt-correct' : isPicked ? 'opt-wrong' : 'opt-dim') : '';
                      return (
                        <button
                          key={oi}
                          className={`lab-option ${cls}`}
                          disabled={answered}
                          onClick={() => setAnswers((a) => ({ ...a, [s.id]: oi }))}
                        >
                          {answered && o.correct && <CheckCircle2 size={14} color="#34d399" />}
                          {answered && isPicked && !o.correct && <XCircle size={14} color="#f43f5e" />}
                          <span>{o.text}</span>
                        </button>
                      );
                    })}
                  </div>
                  {answered && (
                    <div className="lab-reveal">
                      <p className="lab-why">{s.options[picked].why}</p>
                      <CopyCode id={`lab-${s.id}`} title="Rewrite" sql={s.fixedSql} copied={copied} onCopy={onCopy} />
                      <div className="adv-note">
                        <Lightbulb size={14} color="#fbbf24" />
                        <span>{s.takeaway}</span>
                      </div>
                      <button className="btn-copy-sm" onClick={() => setAnswers((a) => {
                        const n = { ...a };
                        delete n[s.id];
                        return n;
                      })}>
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
