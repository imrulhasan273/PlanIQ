import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, CheckCircle2, AlertTriangle, Cpu, Wrench } from 'lucide-react';

export interface DiagnosticGuideContent {
  title: string;
  category: string;
  definition: string;
  healthyRange: string;
  warningThreshold: string;
  impact: string;
  howToFix: string;
}

export const DIAGNOSTIC_GUIDES: Record<string, DiagnosticGuideContent> = {
  keyLookups: {
    title: 'Key & Bookmark Lookups',
    category: 'Indexes & Operators',
    definition: 'An Index Seek found qualifying rows in a nonclustered index, but the index lacked one or more columns requested by the SELECT/WHERE/JOIN clauses. SQL Server is forced to perform a clustered Key Lookup (or heap RID Lookup) for every single row.',
    healthyRange: '0 Lookups (Ideal: 100% covering index). Minor impact if < 50 lookups.',
    warningThreshold: '> 500 Lookups per execution is alarming; > 5,000 lookups is a critical I/O bottleneck.',
    impact: 'Excessive random 8KB page reads from disk/buffer pool (PAGEIOLATCH_SH waits), severe nested loop overhead, and elevated CPU.',
    howToFix: 'Expand the driving nonclustered index by adding fetched columns into the INCLUDE (...) clause to make the index covering.'
  },
  spools: {
    title: 'TempDB Spool Operators',
    category: 'Indexes & Operators',
    definition: 'Physical operators (Table Spool, Index Spool, Row Count Spool, Window Spool) that write and cache intermediate rowsets into TempDB (Lazy or Eager) to avoid re-evaluating expressions or to provide Halloween protection.',
    healthyRange: '0 Spool Operators. Queries should stream data directly through memory without intermediate spooling.',
    warningThreshold: 'Any Index Spool on large tables, or Table Spool with Rebinds > 10 or row count > 10,000.',
    impact: 'Heavy TempDB contention (PAGELATCH_UP waits on allocation maps), unexpected disk I/O latency, and serialized nested loop iterations.',
    howToFix: 'Pre-create indexed #temp tables for repeated subqueries, rewrite correlated subqueries with CROSS APPLY or window functions, or add supporting indexes on joined tables.'
  },
  missingStatistics: {
    title: 'Missing Column Statistics',
    category: 'Engine & Memory',
    definition: 'SQL Server emitted <ColumnsWithNoStatistics> during query compilation because no distribution histogram exists for columns evaluated in predicates, joins, or grouping.',
    healthyRange: '0 Missing Statistics. All filtered columns should have active distribution statistics.',
    warningThreshold: 'Any missing statistic on tables with > 10,000 rows is critical.',
    impact: 'Blind optimizer guessing (e.g., estimating 1 row instead of 500,000), resulting in disastrous join orders, incorrect join algorithms (Nested Loops instead of Hash), and undersized memory grants.',
    howToFix: 'Verify AUTO_CREATE_STATISTICS is enabled on the database, and run CREATE STATISTICS [stat_name] ON [table]([column]) WITH FULLSCAN;.'
  },
  parameterSniffing: {
    title: 'Parameter Sniffing & Values',
    category: 'Query & Predicates',
    definition: 'SQL Server generates and caches an execution plan tailored to the parameter values supplied on initial compilation (<ParameterCompiledValue>). When invoked with different values (<ParameterRuntimeValue>), the plan may be sub-optimal.',
    healthyRange: 'Compiled and runtime values exhibit similar selectivity profiles (e.g., both return small row counts).',
    warningThreshold: 'Compiled for unique ID (~1 row) but executed with wildcard or generic status (~100,000 rows), or vice versa.',
    impact: 'Intermittent, unpredictable query timeouts where stored procedures execute in milliseconds for some parameters and minutes for others.',
    howToFix: 'Use OPTION (OPTIMIZE FOR (@param = <typical_val>)) for stable plans, OPTION (RECOMPILE) for volatile predicates, copy parameters to local variables, or enable SQL Server 2022 Parameter Sensitive Plan (PSP) optimization.'
  },
  nonSargable: {
    title: 'Non-Sargable Predicates',
    category: 'Query & Predicates',
    definition: 'Mathematical, date, or string functions wrapped around indexed columns in WHERE or JOIN predicates (e.g., YEAR(Date), SUBSTRING(Code), ISNULL(Col, val), LIKE \'%text\'). This invalidates B-Tree ordering and prevents index seek operations.',
    healthyRange: '0 Non-Sargable Predicates. 100% of predicates should compare bare columns directly to constants or computed ranges.',
    warningThreshold: 'Any function call on an indexed column in large tables (> 50,000 rows) is a major issue.',
    impact: 'Forces full clustered index or table scans with per-row scalar function evaluation, causing massive CPU utilization and prolonged query duration.',
    howToFix: 'Rewrite expressions to compare bare columns to ranges (e.g., Date >= \'2024-01-01\' AND Date < \'2025-01-01\'), or create a PERSISTED indexed computed column.'
  },
  rowGoals: {
    title: 'Row Goal & TOP Pitfalls',
    category: 'Query & Predicates',
    definition: 'When queries contain TOP (N), FAST N, EXISTS, or IN, the optimizer assumes rows will be found early and chooses a plan with a "row goal", frequently selecting Nested Loops or serial scans.',
    healthyRange: 'Reduction factor < 5x and estimated rows without goal closely match actual data distribution.',
    warningThreshold: 'Reduction factor > 10x where the engine expects 5 rows but must scan millions to find them.',
    impact: 'Catastrophic plan regressions where the engine selects an aggressive nested loops plan that scans millions of pages before finding qualifying rows.',
    howToFix: 'Use OPTION (USE HINT(\'DISABLE_OPTIMIZER_ROWGOAL\')) to instruct the optimizer to evaluate the full result set cost.'
  },
  adaptive: {
    title: 'Adaptive Joins & Intelligent Query Processing',
    category: 'Engine & Memory',
    definition: 'SQL Server 2017+ feature that dynamically pauses at runtime during join execution to choose between Hash Match and Nested Loops based on the input row count threshold.',
    healthyRange: 'Batch mode execution on rowstore/columnstore with stable adaptive join threshold choices.',
    warningThreshold: 'Frequent fallback to row mode due to inhibitors (e.g., scalar UDFs, XML, multi-statement table functions).',
    impact: 'Suboptimal join strategies when row counts oscillate around the threshold.',
    howToFix: 'Maintain database compatibility level 140+ (SQL 2017) or 150+ (SQL 2019+), eliminate row-mode inhibitors, and review memory grant requirements.'
  },
  memoryGrant: {
    title: 'Memory Grant & TempDB Spills',
    category: 'Engine & Memory',
    definition: 'Workspace RAM allocated to sort, hash join, and aggregate operators. Under-allocation causes TempDB spills; over-allocation starves concurrent queries.',
    healthyRange: 'Wasted Memory < 20%, 0 TempDB Spills. Granted RAM closely matches Max Used RAM.',
    warningThreshold: 'Any TempDB Spill (Sort/Hash) is critical. Wasted RAM > 50% or > 256MB is considered bloated.',
    impact: 'Spills cause massive TempDB write/read latency (IO_COMPLETION waits). Bloated grants cause RESOURCE_SEMAPHORE query queuing.',
    howToFix: 'Update statistics on join/filter columns to fix underestimations. Create supporting indexes to eliminate Sort operators. Use OPTION (MAX_GRANT_PERCENT = n) if needed.'
  },
  parallelismSkew: {
    title: 'Parallelism Thread Skew',
    category: 'Engine & Memory',
    definition: 'In multi-threaded execution (MaxDOP > 1), work is split across parallel worker threads. Skew occurs when row distribution is uneven across threads.',
    healthyRange: 'Skew Ratio < 1.5x (all worker threads process approximately equal row counts within ±25%).',
    warningThreshold: 'Skew Ratio > 2.5x indicates thread starvation; > 5.0x means 1 thread does virtually all the work.',
    impact: 'CXPACKET and CXCONSUMER waits. The query consumes 8+ CPU cores but finishes no faster than a single-threaded query.',
    howToFix: 'Address skewed partition keys or join columns, update statistics, or consider appropriate MaxDOP settings.'
  },
  cardinalityEngine: {
    title: 'Cardinality Estimation Engine',
    category: 'Engine & Memory',
    definition: 'The optimizer mathematical formula used to estimate how many rows will be returned by predicates and joins.',
    healthyRange: 'CE Version 120+ (SQL 2014) to 160 (SQL 2022).',
    warningThreshold: 'CE Version 70 (Legacy CE from SQL Server 2000-2012) in modern databases.',
    impact: 'Legacy CE assumes complete independence between predicate columns, causing inaccurate estimates on correlated columns.',
    howToFix: 'Upgrade database compatibility level or use OPTION (USE HINT(\'FORCE_DEFAULT_CARDINALITY_ESTIMATION\')).'
  },
  consolidatedIndexes: {
    title: 'Smart Consolidated Indexes',
    category: 'Indexes & Operators',
    definition: 'PlanIQ automated engine that merges overlapping missing index recommendations on the same table, deduplicating EQUALITY and INCLUDE columns.',
    healthyRange: 'Combined From Count > 1 indicates consolidated storage and write savings.',
    warningThreshold: 'Individual raw SQL Server suggestions create dozens of overlapping redundant indexes.',
    impact: 'Reduces index maintenance overhead, transaction log volume, and buffer pool fragmentation.',
    howToFix: 'Deploy the consolidated composite index and remove redundant single-column nonclustered indexes.'
  },
  implicitConversions: {
    title: 'Implicit Data Type Conversions',
    category: 'Query & Predicates',
    definition: 'CONVERT_IMPLICIT operations occurring on table columns due to mismatched parameter data types (e.g., comparing VARCHAR column with NVARCHAR parameter).',
    healthyRange: '0 Implicit Conversions on indexed columns.',
    warningThreshold: 'Any implicit conversion on an index key column.',
    impact: 'Converts index seeks into full table scans; increases per-row CPU conversion time.',
    howToFix: 'Align application/ORM parameter types with table column data types.'
  },
  scalarUdfWarnings: {
    title: 'Scalar User-Defined Functions',
    category: 'Query & Predicates',
    definition: 'T-SQL scalar functions executing per-row in queries (Row-By-Agonizing-Row / RBAR).',
    healthyRange: '0 Scalar UDFs in data queries.',
    warningThreshold: 'Any scalar UDF evaluated against multi-row result sets.',
    impact: 'Prevents parallelism (forces MaxDOP = 1), causes massive context switching, and hides CPU execution costs from query plans.',
    howToFix: 'Convert to an inline Table-Valued Function (iTVF), rewrite logic into query expressions, or enable SQL Server 2019+ Scalar UDF Inlining.'
  },
  executiveVerdict: {
    title: '10-Second Executive Root Cause Verdict',
    category: 'Overview & Metrics',
    definition: 'Synthesizes all statements, operator costs, and diagnostic signals to identify the single query statement responsible for the overwhelming majority of execution cost.',
    healthyRange: 'Balanced statement profile; no single statement dominating > 80% of total batch cost unless intentional.',
    warningThreshold: 'A single statement consuming > 80% of total subtree cost with severe anti-patterns (Key Lookups, Spills, Missing Stats).',
    impact: 'Directs DBA and engineering focus straight to the 1% of SQL code causing 99% of database slowdowns.',
    howToFix: 'Focus optimization effort exclusively on the identified culprit statement first (add covering index, eliminate non-sargable functions, fix parameter sniffing).'
  },
  totalSubtreeCost: {
    title: 'Total Subtree Cost',
    category: 'Overview & Metrics',
    definition: 'The cumulative optimizer estimated work units (relative score based on CPU and disk I/O cost models) across all statements in the execution plan.',
    healthyRange: '< 5.0 for high-frequency OLTP transactions; < 20.0 for moderate reporting.',
    warningThreshold: 'Cost > 50.0 is heavy; Cost > 1,000.0 indicates massive table scans or complex analytics needing tuning.',
    impact: 'Directly dictates memory grant sizing, parallelism candidacy (Cost Threshold for Parallelism), and CPU consumption.',
    howToFix: 'Identify high-cost operators (scans, sorts, hash joins) and create covering indexes or reduce processed row volume.'
  },
  totalStatements: {
    title: 'Batch Statement Count',
    category: 'Overview & Metrics',
    definition: 'The total number of individual SQL statements (queries, DDL, SET statements, variable assignments) enclosed in the stored procedure or batch.',
    healthyRange: '1 to 5 statements for focused procedures. Modular code with dedicated purposes.',
    warningThreshold: '> 30 statements in a single procedure can indicate a "god procedure" prone to parameter sniffing and compilation overhead.',
    impact: 'Long batches increase transaction lock duration, compilation latency, and plan cache bloat.',
    howToFix: 'Refactor complex multi-statement procedures into focused micro-procedures or modular sub-routines.'
  },
  missingIndexesMetric: {
    title: 'Missing Index Suggestions',
    category: 'Overview & Metrics',
    definition: 'Indexes suggested by the SQL Server Query Optimizer during cost estimation where it determined a nonclustered index would have reduced statement cost.',
    healthyRange: '0 missing index warnings on mature production tables.',
    warningThreshold: 'Missing index impact > 50% or estimated cost reduction > 100 units.',
    impact: 'Forces table or clustered index scans; increases disk read I/O and query duration by orders of magnitude.',
    howToFix: 'Use PlanIQ Consolidated Indexes tab to deploy merged composite covering indexes.'
  },
  parallelismStatus: {
    title: 'Parallelism & MaxDOP Status',
    category: 'Overview & Metrics',
    definition: 'Indicates whether the query is allowed to execute across multiple CPU worker threads or is constrained to single-threaded serial execution.',
    healthyRange: 'Multi-threaded parallelism available with MaxDOP matched to NUMA node cores (typically 2 to 8).',
    warningThreshold: 'Forced serial execution (MaxDOP = 1) on heavy queries, or severe CXPACKET thread skew.',
    impact: 'Serial execution prevents queries from utilizing available CPU cores, causing long-running batch queries to run up to 16x slower.',
    howToFix: 'Remove OPTION (MAXDOP 1) hints if inappropriate; check Cost Threshold for Parallelism; resolve scalar UDF inhibitors that force serial mode.'
  },
  costliestStatements: {
    title: 'Costliest Statements Breakdown',
    category: 'Overview & Metrics',
    definition: 'Statement-by-statement ranking of all queries within the batch, detailing relative cost %, compile time, estimated rows, and physical statement text.',
    healthyRange: 'Statements consume proportional resources aligned with their business significance.',
    warningThreshold: '1 statement accounts for > 85% of total batch runtime or cost.',
    impact: 'Enables precise pinpointing of query bottlenecks instead of blind trial-and-error across large stored procedures.',
    howToFix: 'Select the statement and navigate to Plan Tree Visualizer or AI Advisor for deep inspection.'
  },
  waitStats: {
    title: 'Execution Wait Statistics',
    category: 'Overview & Metrics',
    definition: 'ShowPlan XML captured wait statistics recording how many milliseconds threads waited for resources during query execution.',
    healthyRange: 'Wait time < 5% of total elapsed time; predominant waits are CPU scheduling (SOS_SCHEDULER_YIELD).',
    warningThreshold: 'PAGEIOLATCH_SH / PAGEIOLATCH_EX (disk read/write), LCK_* (blocking), or RESOURCE_SEMAPHORE (memory starvation).',
    impact: 'Reveals the exact external bottleneck (disk, memory, locks, network) stalling query execution.',
    howToFix: 'Target the specific wait category: add indexes for PAGEIOLATCH; adjust isolation level or indexing for LCK; tune memory grants for RESOURCE_SEMAPHORE.'
  },
  treeVisualizer: {
    title: 'Plan Tree Visualizer',
    category: 'Visualizer & Operators',
    definition: 'Interactive hierarchical tree showing physical relational operators (Index Seek, Clustered Index Scan, Hash Match, Nested Loops, Sort) and row pipelines.',
    healthyRange: 'Index Seeks with high selectivity; narrow row pipelines; balanced subtree cost distribution.',
    warningThreshold: 'Thick data flow lines entering Nested Loops; Table Scans with > 90% subtree cost; TempDB Spills.',
    impact: 'Allows DBAs to follow the actual execution order from right-to-left and identify the exact operator where costs explode.',
    howToFix: 'Click on any operator node to view its detailed properties, runtime metrics, and suggested optimizations in the inspector panel.'
  },
  operatorDetails: {
    title: 'Operator Properties & Metrics',
    category: 'Visualizer & Operators',
    definition: 'Detailed physical and logical attributes of a selected execution plan operator, including estimated vs actual rows, execution mode (Row vs Batch), CPU and I/O costs.',
    healthyRange: 'Actual Rows / Estimated Rows ratio between 0.8x and 1.2x; zero spills.',
    warningThreshold: 'Actual Rows / Estimated Rows difference > 10x (cardinality estimation miscalculation); Spills to TempDB.',
    impact: 'Large cardinality estimation discrepancies cause the optimizer to select disastrous join types.',
    howToFix: 'Update outdated statistics on driving table columns or use Query Store plan forcing.'
  },
  consolidatedIndexesTab: {
    title: 'Smart Consolidated Indexes',
    category: 'Optimization',
    definition: 'PlanIQ proprietary deduplication algorithm that merges multiple overlapping single-column missing index suggestions into optimal composite nonclustered indexes.',
    healthyRange: 'Consolidated index replaces 2+ redundant suggestions while maintaining 100% query coverage.',
    warningThreshold: 'Creating too many single-column indexes degrades INSERT/UPDATE/DELETE performance by up to 300%.',
    impact: 'Reduces index maintenance overhead, saves transaction log write volume, and prevents buffer pool thrashing.',
    howToFix: 'Review the generated composite DDL and deploy during scheduled maintenance.'
  },
  rawMissingIndexes: {
    title: 'Engine Missing Index Hints',
    category: 'Optimization',
    definition: 'Raw index recommendations extracted directly from the <MissingIndexes> node of the execution plan XML.',
    healthyRange: 'Impact > 50% indicates significant performance gain potential.',
    warningThreshold: 'Multiple overlapping recommendations on the same table with identical equality keys.',
    impact: 'Guides index creation based on SQL Server optimizer cost formulas.',
    howToFix: 'Compare raw suggestions against existing table indexes to avoid duplicate index sprawl.'
  },
  aiAdvisor: {
    title: 'AI Performance Doctor & Rewriter',
    category: 'Optimization',
    definition: 'Intelligent query tuning assistant that inspects T-SQL syntax and execution plan bottlenecks to generate production-ready code rewrites.',
    healthyRange: 'Rewrites preserve identical relational semantics while transforming non-sargable expressions and loops into set-based operations.',
    warningThreshold: 'Complex correlated subqueries, cursor loops, or heavy scalar UDFs.',
    impact: 'Provides actionable code diffs and explanation of performance benefits.',
    howToFix: 'Inspect the side-by-side Monaco Diff Editor and test the optimized query in a staging environment.'
  },
  planComparator: {
    title: 'Plan Comparator (Before vs After)',
    category: 'Optimization',
    definition: 'Side-by-side comparison engine that contrasts two execution plans to measure the tangible impact of an index addition or query rewrite.',
    healthyRange: 'Cost Delta < 0% (cost reduction), Compile CPU reduction, and elimination of Lookups or Spills.',
    warningThreshold: 'Plan regression where cost or memory grant increased after code modification.',
    impact: 'Mathematically proves performance improvements before deploying changes to production.',
    howToFix: 'Verify that the new plan eliminates high-cost operators without introducing new spills or warnings.'
  }
};

interface DiagnosticTooltipProps {
  guideKey: string;
}

export const DiagnosticTooltip: React.FC<DiagnosticTooltipProps> = ({ guideKey }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<any>(null);

  const guide = DIAGNOSTIC_GUIDES[guideKey];

  const calculateCoords = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 370;
    const popoverHeight = 360;

    // Default: anchor below button
    let top = rect.bottom + 8;
    // If popover goes off the bottom of the viewport and there is room above, flip it up!
    if (top + popoverHeight > window.innerHeight - 16 && rect.top > popoverHeight + 16) {
      top = Math.max(16, rect.top - popoverHeight - 8);
    }

    // Default: align with trigger left
    let left = rect.left;
    // If popover clips past right window edge, shift left
    if (left + popoverWidth > window.innerWidth - 16) {
      left = Math.max(16, rect.right - popoverWidth);
    }
    if (left < 16) left = 16;

    setCoords({ top, left });
  };

  const handleOpen = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    calculateCoords();
    setIsOpen(true);
  };

  const handleClose = () => {
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 180);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
    } else {
      calculateCoords();
      setIsOpen(true);
    }
  };

  useEffect(() => {
    if (isOpen) {
      calculateCoords();
      const onScrollOrResize = () => calculateCoords();
      window.addEventListener('scroll', onScrollOrResize, true);
      window.addEventListener('resize', onScrollOrResize);
      return () => {
        window.removeEventListener('scroll', onScrollOrResize, true);
        window.removeEventListener('resize', onScrollOrResize);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!guide) return null;

  return (
    <div className="diag-tooltip-wrap" style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={triggerRef}
        type="button"
        className={`diag-info-trigger ${isOpen ? 'active' : ''}`}
        onClick={handleToggle}
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
        aria-label={`Learn more about ${guide.title}`}
        title="Click or hover for deep diagnostic details, healthy ranges, and fix guidelines"
      >
        <HelpCircle size={14} />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className="diag-info-popover glass-panel"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 99999999,
              margin: 0,
            }}
            onMouseEnter={() => {
              if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
            }}
            onMouseLeave={handleClose}
          >
            <div className="diag-info-header">
              <div className="diag-info-title-row">
                <span className="diag-info-title">{guide.title}</span>
                <span className="diag-info-cat-pill">{guide.category}</span>
              </div>
            </div>

            <div className="diag-info-body">
              {/* What is it */}
              <div className="diag-info-section">
                <div className="diag-info-subhead">
                  <Cpu size={12} color="#38bdf8" />
                  <span>What is it?</span>
                </div>
                <p className="diag-info-text">{guide.definition}</p>
              </div>

              {/* Thresholds / Ranges */}
              <div className="diag-info-ranges-grid">
                <div className="diag-info-range-card healthy">
                  <div className="range-card-header">
                    <CheckCircle2 size={12} color="#34d399" />
                    <span>Healthy Range</span>
                  </div>
                  <div className="range-card-content">{guide.healthyRange}</div>
                </div>

                <div className="diag-info-range-card warning">
                  <div className="range-card-header">
                    <AlertTriangle size={12} color="#fbbf24" />
                    <span>Warning Threshold</span>
                  </div>
                  <div className="range-card-content">{guide.warningThreshold}</div>
                </div>
              </div>

              {/* Performance Impact */}
              <div className="diag-info-section" style={{ marginTop: '8px' }}>
                <div className="diag-info-subhead">
                  <AlertTriangle size={12} color="#f87171" />
                  <span>Performance Impact</span>
                </div>
                <p className="diag-info-text danger-text">{guide.impact}</p>
              </div>

              {/* Actionable Fix */}
              <div className="diag-info-section fix-section" style={{ marginTop: '8px' }}>
                <div className="diag-info-subhead">
                  <Wrench size={12} color="#38bdf8" />
                  <span>How to Fix</span>
                </div>
                <p className="diag-info-text fix-text">{guide.howToFix}</p>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
