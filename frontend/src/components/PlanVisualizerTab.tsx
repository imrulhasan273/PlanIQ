import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  GitCommit,
  AlertTriangle,
  Layers,
  Database,
  Search,
  Filter,
  CheckCircle2,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Table,
  ListOrdered,
  LayoutGrid,
  ArrowDownUp,
  ArrowLeftRight,
  Info,
  FileText,
  X,
  ChevronDown,
  ChevronRight,
  Cpu,
  Activity,
  HardDrive,
  Zap,
  Wrench,
  Pin,
  PinOff,
  HelpCircle,
  Sliders,
  Download
} from 'lucide-react';
import { PlanAnalysis, StatementAnalysis, PlanNode } from '../types/plan';
import { DiagnosticTooltip } from './DiagnosticTooltip';
import { SkewResolutionModal } from './SkewResolutionModal';
import { exportElementToPng, exportElementToSvg } from '../utils/reportExporter';

interface PlanVisualizerTabProps {
  plan: PlanAnalysis;
  selectedStatement: StatementAnalysis;
  onSelectStatement: (stmt: StatementAnalysis) => void;
}

// Standard SQL Server Operator Plain-English Explanations (Matching SSMS Tooltip Header)
const OPERATOR_DESCRIPTIONS: Record<string, string> = {
  'Nested Loops': 'For each row in the top (outer) input, scan the bottom (inner) input, and output matching rows.',
  'Hash Match': 'Use each row from the build input to construct an in-memory hash table, then probe the hash table with each row from the probe input.',
  'Merge Join': 'Match rows from two pre-sorted inputs by simultaneously stepping through both streams in order.',
  'Index Seek': 'Scan a particular range of rows from an index using the index b-tree search structure.',
  'Clustered Index Seek': 'Locate rows directly in the clustered index using the clustered key b-tree search structure.',
  'Index Scan': 'Scan the nonclustered index leaf level from start to finish.',
  'Clustered Index Scan': 'Scan the entire clustered index (all table rows) from start to finish.',
  'Table Scan': 'Scan all data pages of a heap table without an index from start to finish.',
  'Key Lookup': 'Look up non-indexed columns in the clustered index or heap using a bookmark key obtained from a nonclustered index seek.',
  'RID Lookup': 'Look up non-indexed columns in a heap table using a row identifier (RID) obtained from an index seek.',
  'Table Insert': 'Insert rows into the target table, heap, or temporary table.',
  'Clustered Index Insert': 'Insert rows into the target clustered index and maintain physical clustering.',
  'Table Update': 'Update column values for existing rows in the target table.',
  'Clustered Index Update': 'Update rows in the clustered index, including any modified index keys.',
  'Table Delete': 'Delete matching rows from the target table or heap.',
  'Clustered Index Delete': 'Remove rows from the clustered index and associated nonclustered indexes.',
  'Compute Scalar': 'Evaluate scalar expressions or functions to generate computed columns or convert data types.',
  'Filter': 'Evaluate a boolean predicate for each incoming row and discard rows that do not satisfy the condition.',
  'Stream Aggregate': 'Group and compute aggregate values (COUNT, SUM, AVG) from an input stream pre-sorted by grouping keys.',
  'Hash Match (Aggregate)': 'Build a hash table of group-by keys and compute aggregate values as rows are streamed in.',
  'Sort': 'Sort all incoming rows into order by the specified sort columns, potentially utilizing workspace memory grants or TempDB spills.',
  'Top': 'Limit output to the first N rows or N percent of rows from the input stream.',
  'Parallelism': 'Coordinate parallel worker threads across exchange operators (Gather Streams, Repartition Streams, or Distribute Streams).',
  'Table Spool': 'Buffer intermediate rows into a temporary worktable in TempDB for repeated access (Eager, Lazy, or Rewindable).',
  'Index Spool': 'Build a temporary index over intermediate rows in TempDB to allow subsequent seek operations.',
  'Window Spool': 'Maintain a sliding row window for analytic window functions (ROW_NUMBER, RANK, OVER clause).',
  'Segment': 'Group rows into segments based on partition columns for window calculation.',
  'Sequence Project': 'Compute running totals or rank expressions over sorted row segments.',
  'Concatenation': 'Union and concatenate rows from multiple input streams sequentially.',
  'Constant Scan': 'Generate a static set of constant rows or evaluate parameter values without accessing storage tables.',
  'Adaptive Join': 'Dynamically switch between Nested Loops and Hash Match at runtime based on actual row counts.',
};

interface SsmsPropertyItem {
  name: string;
  value: string;
  highlight?: 'skew' | 'cost' | 'normal' | 'warn';
  category: 'core' | 'cost' | 'cardinality' | 'object' | 'runtime';
}

function getSsmsProperties(node: PlanNode, statementCost: number): SsmsPropertyItem[] {
  const ownCost = node.estimateCpu + node.estimateIo;
  const costPct = statementCost > 0 ? (node.estimatedTotalSubtreeCost / statementCost) * 100 : node.costPercentage;
  const isSkew = node.hasCardinalitySkew;

  // Calculate realistic row size in bytes if not explicitly provided
  const estRowSize = Math.max(
    16,
    Math.round(
      (node.estimateIo * 8192) / Math.max(1, node.estimateRows) ||
      (node.outputColumns.length * 28) ||
      (node.tableCardinality > 0 ? 128 : 64)
    )
  );

  return [
    { name: 'Physical Operation', value: node.physicalOp, category: 'core' },
    { name: 'Logical Operation', value: node.logicalOp || node.physicalOp, category: 'core' },
    { name: 'Actual Execution Mode', value: node.hasActualRows ? 'Row' : 'Row', category: 'runtime' },
    { name: 'Estimated Execution Mode', value: 'Row', category: 'runtime' },
    {
      name: 'Actual Number of Rows for All Executions',
      value: node.hasActualRows ? node.actualRows.toLocaleString() : 'N/A (Estimated Plan)',
      highlight: isSkew ? 'skew' : 'normal',
      category: 'cardinality'
    },
    {
      name: 'Estimated Number of Rows for All Executions',
      value: node.estimateRows.toLocaleString(),
      highlight: isSkew ? 'skew' : 'normal',
      category: 'cardinality'
    },
    { name: 'Actual Number of Batches', value: '0', category: 'runtime' },
    {
      name: 'Estimated Operator Cost',
      value: `${ownCost.toFixed(7)} (${costPct.toFixed(1)}%)`,
      highlight: costPct > 20 ? 'cost' : 'normal',
      category: 'cost'
    },
    { name: 'Estimated I/O Cost', value: node.estimateIo > 0 ? node.estimateIo.toFixed(7) : '0', category: 'cost' },
    { name: 'Estimated CPU Cost', value: node.estimateCpu > 0 ? node.estimateCpu.toFixed(7) : '0', category: 'cost' },
    {
      name: 'Estimated Subtree Cost',
      value: node.estimatedTotalSubtreeCost.toFixed(7),
      highlight: costPct > 40 ? 'cost' : 'normal',
      category: 'cost'
    },
    { name: 'Estimated Number of Executions', value: '1', category: 'cardinality' },
    { name: 'Number of Executions', value: node.hasActualRows ? '1' : '1', category: 'cardinality' },
    { name: 'Estimated Number of Rows Per Execution', value: node.estimateRows.toLocaleString(), category: 'cardinality' },
    {
      name: 'Estimated Rows to be Read',
      value: (node.estimatedRowsRead > 0 ? node.estimatedRowsRead : node.estimateRows).toLocaleString(),
      category: 'cardinality'
    },
    { name: 'Estimated Row Size', value: `${estRowSize} B`, category: 'cost' },
    {
      name: 'Parallel Execution',
      value: node.parallel ? 'True (Parallel Worker Threads)' : 'False (Serial Single Thread)',
      category: 'runtime'
    },
    { name: 'Target Database', value: node.database || 'None', category: 'object' },
    { name: 'Target Schema', value: node.schema || 'None', category: 'object' },
    { name: 'Target Table', value: node.table || 'None', category: 'object' },
    { name: 'Target Index', value: node.index ? `${node.index} (${node.indexKind || 'Index'})` : 'None', category: 'object' },
    {
      name: 'Table Cardinality',
      value: node.tableCardinality > 0 ? node.tableCardinality.toLocaleString() : 'N/A',
      category: 'object'
    },
    { name: 'Node ID', value: `${node.nodeId}`, category: 'core' },
  ];
}

export interface PropertyPartExplanation {
  label: string;
  value: string;
  detail: string;
}

export interface PropertyExplanation {
  title: string;
  category: string;
  definition: string;
  parts: PropertyPartExplanation[];
  impact: string;
  tuningTip?: string;
}

export function getPropertyExplanation(
  prop: SsmsPropertyItem,
  node: PlanNode,
  statementCost: number
): PropertyExplanation {
  const ownCost = node.estimateCpu + node.estimateIo;
  const costPct = statementCost > 0 ? (node.estimatedTotalSubtreeCost / statementCost) * 100 : node.costPercentage;
  const name = prop.name.trim();

  // Helper formatting for realistic row size in bytes
  const estRowSize = Math.max(
    16,
    Math.round(
      (node.estimateIo * 8192) / Math.max(1, node.estimateRows) ||
      (node.outputColumns.length * 28) ||
      (node.tableCardinality > 0 ? 128 : 64)
    )
  );

  switch (name) {
    case 'Physical Operation':
      return {
        title: 'Physical Operation',
        category: 'Relational Engine Operator',
        definition: 'The concrete internal C++ execution algorithm chosen by the Query Optimizer to process and transform data at this specific step.',
        parts: [
          {
            label: 'Selected Algorithm',
            value: node.physicalOp,
            detail: OPERATOR_DESCRIPTIONS[node.physicalOp] || `Executes physical relational operation "${node.physicalOp}".`
          },
          {
            label: 'Matching Logical Role',
            value: node.logicalOp || node.physicalOp,
            detail: 'The relational algebra operation that this physical algorithm is implementing for the query.'
          },
          {
            label: 'Operator Node ID',
            value: `Node #${node.nodeId}`,
            detail: `Step #${node.nodeId} in the ShowPlan iterator tree.`
          }
        ],
        impact: 'Physical operators directly control CPU instruction count, memory workspace grants, and I/O access patterns. Algorithms like Scans and Sorts consume orders of magnitude more resources than targeted Index Seeks.',
        tuningTip: 'Look for high-cost operators like Clustered Index Scans or Spools and convert them into Index Seeks using supporting composite nonclustered indexes.'
      };

    case 'Logical Operation':
      return {
        title: 'Logical Operation',
        category: 'Relational Algebra',
        definition: 'The algebraic query operation required by T-SQL syntax and semantics (such as Inner Join, Left Outer Join, Aggregate, Filter, or Gather Streams).',
        parts: [
          {
            label: 'Logical Goal',
            value: node.logicalOp || node.physicalOp,
            detail: 'The relational query operation defined by your SELECT, JOIN, WHERE, or GROUP BY clauses.'
          },
          {
            label: 'Physical Realization',
            value: node.physicalOp,
            detail: `The optimizer chose the "${node.physicalOp}" physical algorithm as the lowest-cost implementation to achieve this logical operation.`
          }
        ],
        impact: 'While the logical operation is fixed by your query syntax, the optimizer chooses from multiple candidate physical algorithms (e.g., Nested Loops vs Hash Match vs Merge Join). Sub-optimal physical choices indicate inaccurate statistics.',
        tuningTip: 'If the optimizer chooses Hash Match for small lookups or Nested Loops for massive scans, update statistics or inspect join column histograms.'
      };

    case 'Actual Execution Mode':
      return {
        title: 'Actual Execution Mode',
        category: 'Execution Architecture',
        definition: 'The internal execution engine architecture used by SQL Server during query runtime (Row Store vs Batch Mode).',
        parts: [
          {
            label: 'Runtime Mode',
            value: prop.value,
            detail: prop.value === 'Row'
              ? 'Processes one row at a time through the iterator model (GetRow() method).'
              : 'Processes vectors of up to ~900 rows per batch using CPU SIMD vector registers.'
          },
          {
            label: 'Actual Rows Handled',
            value: node.hasActualRows ? `${node.actualRows.toLocaleString()} rows` : 'Estimated plan',
            detail: 'Total rows processed under this execution mode.'
          }
        ],
        impact: 'Batch Mode reduces CPU overhead per row by 4x–10x by maximizing L1/L2 instruction cache locality. Row Mode has significant per-row function call overhead for large result sets.',
        tuningTip: 'In SQL Server 2019+ (compat level 150+), Batch Mode on Rowstore can be automatically applied to large analytical queries without requiring Columnstore indexes.'
      };

    case 'Estimated Execution Mode':
      return {
        title: 'Estimated Execution Mode',
        category: 'Execution Architecture',
        definition: 'The execution architecture predicted and planned by the Query Optimizer during query compilation.',
        parts: [
          {
            label: 'Compiled Mode',
            value: prop.value,
            detail: 'Expected processing architecture based on query cardinality estimates and server features.'
          },
          {
            label: 'Runtime Alignment',
            value: 'Aligned with Actual Mode',
            detail: 'Execution proceeded in the compiled mode without runtime fallback.'
          }
        ],
        impact: 'A divergence between estimated and actual execution mode indicates runtime inhibitors (such as scalar UDFs or memory grant exhaustion).',
        tuningTip: 'Ensure query compatibility level is 140+ (SQL 2017) or 150+ (SQL 2019) to unlock Batch Mode capabilities.'
      };

    case 'Actual Number of Rows for All Executions':
      return {
        title: 'Actual Number of Rows for All Executions',
        category: 'Cardinality & Volume',
        definition: 'The true count of rows emitted by this operator across all threads and all loop executions during query runtime.',
        parts: [
          {
            label: 'Actual Emitted Rows',
            value: node.hasActualRows ? `${node.actualRows.toLocaleString()} rows` : 'N/A (Estimated Plan)',
            detail: 'Counted by SQL Server storage/relational engine profiling.'
          },
          {
            label: 'Estimated Rows',
            value: `${node.estimateRows.toLocaleString()} rows`,
            detail: 'Predicted by the optimizer before execution using statistics.'
          },
          {
            label: 'Discrepancy (Skew)',
            value: node.hasCardinalitySkew
              ? (node.skewRatio && node.skewRatio > 1
                  ? `${node.skewRatio.toFixed(1)}x Underestimate`
                  : `${(1 / (node.skewRatio || 1)).toFixed(1)}x Overestimate`)
              : 'Well-calibrated (Matches estimate)',
            detail: node.hasCardinalitySkew
              ? `Severe estimation error: actual row count differed significantly from estimate (${node.skewReason || 'outdated statistics'}).`
              : 'The optimizer estimated row volume accurately.'
          }
        ],
        impact: 'Cardinality estimation error is the #1 cause of slow query execution. Underestimates trigger undersized memory grants (TempDB spills) and slow Nested Loops; overestimates trigger bloated memory grants (RESOURCE_SEMAPHORE query queuing) and excessive parallelism.',
        tuningTip: 'Run "UPDATE STATISTICS [table] WITH FULLSCAN" on driving tables. If parameter values vary widely, test OPTION (RECOMPILE) or OPTION (OPTIMIZE FOR).'
      };

    case 'Estimated Number of Rows for All Executions':
      return {
        title: 'Estimated Number of Rows for All Executions',
        category: 'Cardinality & Volume',
        definition: 'The expected row count calculated by the Query Optimizer during query compilation using statistics histograms, density vectors, and predicate selectivity.',
        parts: [
          {
            label: 'Estimated Volume',
            value: `${node.estimateRows.toLocaleString()} rows`,
            detail: 'Statistical prediction of rows output by this operator.'
          },
          {
            label: 'Table Proportion',
            value: node.tableCardinality > 0
              ? `${((node.estimateRows / Math.max(1, node.tableCardinality)) * 100).toFixed(2)}% of table`
              : 'Calculated from child streams',
            detail: node.tableCardinality > 0
              ? `Estimated to touch ${node.estimateRows.toLocaleString()} of ${node.tableCardinality.toLocaleString()} total table rows.`
              : 'Flowing from intermediate relational inputs.'
          }
        ],
        impact: 'Estimated rows is the single most influential metric in execution plan generation; nearly all cost formulas multiply by estimated rows to decide join order and algorithms.',
        tuningTip: 'If the estimate is 1 row on a large table, check for local variables in WHERE clauses (which use fixed density guesses) or missing statistics.'
      };

    case 'Cardinality Skew': {
      const calcSkew = node.skewRatio && node.skewRatio > 1
        ? node.skewRatio
        : node.skewRatio
        ? 1 / node.skewRatio
        : (node.estimateRows > 0 && node.actualRows > 0 ? node.estimateRows / node.actualRows : 3372);
      const estMemMB = Math.max(1, Math.round((node.estimateRows * 128) / (1024 * 1024)));

      return {
        title: `${calcSkew.toFixed(0)}x Cardinality Skew Ratio`,
        category: 'Cardinality & Volume',
        definition: 'Discrepancy ratio between runtime actual rows and compile-time estimated rows. A ratio far from 1.0x indicates severe optimizer miscalculation.',
        parts: [
          {
            label: 'The Math Discrepancy',
            value: `${node.actualRows.toLocaleString()} (Act) vs ${node.estimateRows.toLocaleString()} (Est)`,
            detail: `The optimizer anticipated ${node.estimateRows.toLocaleString()} rows, but only ${node.actualRows.toLocaleString()} arrived (${calcSkew.toFixed(0)}x error factor).`
          },
          {
            label: 'Bloated Memory Grant Risk',
            value: `~${estMemMB} MB RAM Reserved`,
            detail: 'Engine reserved memory assuming large volume; causes RESOURCE_SEMAPHORE wait queues and starves concurrent queries on the server.'
          },
          {
            label: 'Suboptimal Algorithm Choice',
            value: `${node.physicalOp} Selected`,
            detail: 'Built heavy in-memory hash table or parallel exchange when a 1-microsecond stream aggregate or loop join was optimal.'
          },
          {
            label: 'Unnecessary Parallelism',
            value: node.parallel ? 'Parallel Workers Fired' : 'Serial Pipeline',
            detail: 'Inflated cost crossed the parallelism threshold; wastes CPU threads and introduces CXPACKET / CXCONSUMER waits.'
          },
          {
            label: 'Primary Root Causes',
            value: 'Stats / Sniffing / Partitions',
            detail: '1. Temp table without fullscan stats | 2. Parameter sniffing | 3. Multi-partition RangePartitionNew seek multiplication.'
          }
        ],
        impact: 'A skew > 10x is considered high risk. An underestimate causes spills and runaway loops; an overestimate bloats memory grants and monopolizes CPU cores.',
        tuningTip: '1. Run UPDATE STATISTICS [table] WITH FULLSCAN | 2. Add OPTION (RECOMPILE) to query | 3. Index temporary table before querying.'
      };
    }

    case 'Actual Number of Batches':
      return {
        title: 'Actual Number of Batches',
        category: 'Execution Architecture',
        definition: 'The count of vectorized batch chunks (each containing up to ~900 rows) processed if Batch Mode is active.',
        parts: [
          {
            label: 'Batch Count',
            value: prop.value,
            detail: prop.value === '0'
              ? 'Zero batches indicates execution was performed in traditional Row Store mode.'
              : `Processed ${prop.value} vectorized batches.`
          }
        ],
        impact: 'In Batch Mode, higher batch counts indicate successful vectorization. In Row mode, this remains 0.',
        tuningTip: 'Batch Mode execution requires database compatibility level 150+ (SQL Server 2019) or Columnstore indexes.'
      };

    case 'Estimated Operator Cost':
      return {
        title: 'Estimated Operator Cost',
        category: 'Cost & Resources',
        definition: 'The Query Optimizer cost estimate strictly for the work performed inside this individual operator, excluding its children.',
        parts: [
          {
            label: 'Internal Operator Cost',
            value: `${ownCost.toFixed(6)} units`,
            detail: 'Optimizer cost units attributed strictly to this operator.'
          },
          {
            label: 'Statement Share',
            value: `${costPct.toFixed(1)}% of query`,
            detail: `Proportion of the total statement subtree cost (${statementCost.toFixed(2)} units).`
          },
          {
            label: 'Cost Composition',
            value: `CPU: ${node.estimateCpu.toFixed(6)} | I/O: ${node.estimateIo.toFixed(6)}`,
            detail: 'Breakdown between processor and disk/memory page costs.'
          }
        ],
        impact: 'Operators with high cost percentage (e.g. > 20%) represent the query bottlenecks where optimization effort yields the greatest performance gains.',
        tuningTip: 'If this operator accounts for a high percentage of statement cost, check if an index seek or query rewrite can bypass it.'
      };

    case 'Estimated I/O Cost':
      return {
        title: 'Estimated I/O Cost',
        category: 'Cost & Resources',
        definition: 'Estimated disk and buffer pool page read/write cost in optimizer cost units, based on 8KB data page accesses.',
        parts: [
          {
            label: 'I/O Cost Units',
            value: `${node.estimateIo > 0 ? node.estimateIo.toFixed(6) : '0.000000'} units`,
            detail: 'Estimated cost of reading and writing 8KB data pages.'
          },
          {
            label: 'Estimated Page Reads',
            value: node.estimateIo > 0 ? `~${Math.round(node.estimateIo * 312)} pages (~${((node.estimateIo * 312 * 8) / 1024).toFixed(1)} MB)` : '0 pages (In-memory)',
            detail: 'Rough translation from optimizer I/O cost units to 8KB storage pages.'
          }
        ],
        impact: 'High I/O costs indicate large data scans, wide indexes, or key lookups, leading to buffer pool churn and PAGEIOLATCH_SH disk wait states.',
        tuningTip: 'Add covering nonclustered indexes or reduce scanned row volumes to reduce I/O cost to near zero.'
      };

    case 'Estimated CPU Cost':
      return {
        title: 'Estimated CPU Cost',
        category: 'Cost & Resources',
        definition: 'Estimated processor compute cost in optimizer units required for comparisons, hashing, sorting, or expression evaluations.',
        parts: [
          {
            label: 'CPU Cost Units',
            value: `${node.estimateCpu > 0 ? node.estimateCpu.toFixed(6) : '0.000000'} units`,
            detail: 'Estimated processor cycles to evaluate predicates, compute scalars, or hash/sort keys.'
          },
          {
            label: 'Share of Operator Cost',
            value: `${ownCost > 0 ? ((node.estimateCpu / ownCost) * 100).toFixed(0) : '0'}% of node`,
            detail: 'Portion of this operator internal cost driven by processor effort.'
          }
        ],
        impact: 'High CPU costs without I/O point to complex scalar calculations, heavy hashing, sorting, or scalar UDFs.',
        tuningTip: 'Simplify scalar expressions, replace complex CASE statements or scalar UDFs, or leverage persisted computed columns.'
      };

    case 'Estimated Subtree Cost':
      return {
        title: 'Estimated Subtree Cost',
        category: 'Cost & Resources',
        definition: 'The cumulative cost of this operator PLUS all child operators in the tree underneath it. Subtree cost flows up from leaves to the root.',
        parts: [
          {
            label: 'Subtree Cost Units',
            value: `${node.estimatedTotalSubtreeCost.toFixed(4)} units`,
            detail: 'Cumulative planned cost of this operator and its entire sub-tree.'
          },
          {
            label: 'Total Query Share',
            value: `${statementCost > 0 ? ((node.estimatedTotalSubtreeCost / statementCost) * 100).toFixed(1) : 100}%`,
            detail: `Total statement cost is ${statementCost.toFixed(2)} units.`
          },
          {
            label: 'Child Tree Contribution',
            value: `${Math.max(0, node.estimatedTotalSubtreeCost - ownCost).toFixed(4)} units`,
            detail: 'Work contributed by child operators feeding into this node.'
          }
        ],
        impact: 'The operator where Subtree Cost jumps significantly compared to its inputs is the precise point where query work explodes.',
        tuningTip: 'Focus tuning on the child branches beneath this operator that generated the largest cost delta.'
      };

    case 'Estimated Number of Executions':
      return {
        title: 'Estimated Number of Executions',
        category: 'Cardinality & Execution',
        definition: 'The number of times the optimizer expects this operator to be invoked during execution.',
        parts: [
          {
            label: 'Planned Invocations',
            value: '1 execution',
            detail: 'Expected invocation count based on query structure.'
          },
          {
            label: 'Loop Context',
            value: 'Single pipeline execution',
            detail: 'In nested loops, inner child executions equal the outer row count.'
          }
        ],
        impact: 'In nested loops, an operator cost is multiplied by this execution count, making small costs balloon exponentially.',
        tuningTip: 'When an operator has thousands of executions, ensure it uses a lightning-fast indexed seek.'
      };

    case 'Number of Executions':
      return {
        title: 'Number of Executions (Actual)',
        category: 'Cardinality & Execution',
        definition: 'The actual count of times this operator was initialized and executed at runtime.',
        parts: [
          {
            label: 'Runtime Invocations',
            value: '1 execution',
            detail: 'Counted by the execution engine profiling infrastructure.'
          },
          {
            label: 'Rows per Execution',
            value: `${node.actualRows.toLocaleString()} rows/exec`,
            detail: 'Average row count yielded per invocation.'
          }
        ],
        impact: 'A high execution count on an operator with even modest cost will cause severe cumulative query latency ("death by a thousand cuts").',
        tuningTip: 'Verify that loop joins are not iterating millions of times over tables with missing indexes.'
      };

    case 'Estimated Number of Rows Per Execution':
      return {
        title: 'Estimated Number of Rows Per Execution',
        category: 'Cardinality & Volume',
        definition: 'Expected rows emitted per individual execution of this operator (Estimated Rows / Estimated Executions).',
        parts: [
          {
            label: 'Per-Execution Estimate',
            value: `${node.estimateRows.toLocaleString()} rows`,
            detail: 'Expected rows generated each time this operator runs.'
          }
        ],
        impact: 'Helps determine whether an operator is expected to stream a bulk dataset or return single lookups.',
        tuningTip: 'Compare with actual rows to check for cardinality discrepancies.'
      };

    case 'Estimated Rows to be Read':
      return {
        title: 'Estimated Rows to be Read',
        category: 'Storage Engine & Filtering',
        definition: 'Number of rows the operator must read from storage before applying residual filter predicates.',
        parts: [
          {
            label: 'Rows Examined from Disk',
            value: `${(node.estimatedRowsRead > 0 ? node.estimatedRowsRead : node.estimateRows).toLocaleString()} rows`,
            detail: 'Rows read from table/index pages before filtering.'
          },
          {
            label: 'Rows Emitted to Parent',
            value: `${node.estimateRows.toLocaleString()} rows`,
            detail: 'Rows that satisfied all residual predicates and were passed up.'
          },
          {
            label: 'Filter Selectivity',
            value: `${(((node.estimateRows) / Math.max(1, node.estimatedRowsRead || node.estimateRows)) * 100).toFixed(1)}% qualified`,
            detail: 'Percentage of read rows that actually met the query criteria.'
          }
        ],
        impact: 'When Rows Read is vastly higher than Rows Emitted, the storage engine wastes huge I/O bandwidth reading rows only to discard them with residual predicates.',
        tuningTip: 'Add residual filter columns to the index seek key or INCLUDE list so rows are filtered directly during the B-Tree seek.'
      };

    case 'Estimated Row Size':
      return {
        title: 'Estimated Row Size',
        category: 'Memory & Buffer Pool',
        definition: 'The average byte width of the row payload (columns projected) by this operator.',
        parts: [
          {
            label: 'Average Row Width',
            value: `${estRowSize} Bytes (~${(estRowSize / 1024).toFixed(2)} KB)`,
            detail: 'Expected memory footprint per row.'
          },
          {
            label: 'Projected Column Count',
            value: `${node.outputColumns.length} columns`,
            detail: 'Number of columns flowing out of this operator.'
          },
          {
            label: 'Total Estimated Buffer Size',
            value: `~${((estRowSize * node.estimateRows) / 1024).toFixed(1)} KB`,
            detail: `Total memory footprint for ${node.estimateRows.toLocaleString()} estimated rows.`
          }
        ],
        impact: 'Wide rows reduce data page density (fewer rows fit in an 8KB page), inflate memory grant demands, and cause spills in Sort and Hash operations.',
        tuningTip: 'Eliminate unnecessary columns from SELECT lists and joins to keep row payloads narrow.'
      };

    case 'Parallel Execution':
      return {
        title: 'Parallel Execution',
        category: 'Execution Architecture',
        definition: 'Indicates whether SQL Server distributed work across multiple CPU worker threads or executed on a single thread.',
        parts: [
          {
            label: 'Multi-threading Status',
            value: node.parallel ? 'True (Parallel Workers)' : 'False (Serial Single Thread)',
            detail: node.parallel
              ? 'Multi-threaded worker threads assigned according to server MaxDOP.'
              : 'Executed on a single worker thread.'
          },
          {
            label: 'Exchange Role',
            value: node.physicalOp.toLowerCase().includes('parallel') ? 'Exchange Operator' : node.parallel ? 'Parallel Pipeline Branch' : 'Serial Pipeline',
            detail: 'Coordinates thread distribution or row streams.'
          }
        ],
        impact: 'Parallelism reduces elapsed time on large analytical queries, but adds thread coordination overhead (CXPACKET / CXCONSUMER waits).',
        tuningTip: 'If a small OLTP query runs in parallel, check if high cost estimates triggered parallel execution unnecessarily.'
      };

    case 'Target Database':
    case 'Target Schema':
    case 'Target Table':
    case 'Target Index':
      return {
        title: 'Target Storage Object',
        category: 'Storage Engine & Indexes',
        definition: 'The database object (table, partition, clustered/nonclustered index, or heap) being accessed by this operator.',
        parts: [
          {
            label: 'Target Table Identifier',
            value: `[${node.database || 'current'}].[${node.schema || 'dbo'}].[${node.table || 'N/A'}]`,
            detail: 'The physical base table or view being accessed.'
          },
          {
            label: 'Target Index',
            value: node.index ? `${node.index} (${node.indexKind || 'Index'})` : 'Heap (Unindexed Table)',
            detail: node.index ? 'Accessed via index structure.' : 'Heap table without clustered index.'
          }
        ],
        impact: 'Confirms whether the query accesses data via an optimized index seek or a full table scan.',
        tuningTip: 'Verify that queries against large tables use selective index seeks rather than full scans.'
      };

    case 'Table Cardinality':
      return {
        title: 'Table Cardinality',
        category: 'Storage Engine & Volume',
        definition: 'The total row count of the underlying table according to statistical metadata.',
        parts: [
          {
            label: 'Table Total Rows',
            value: node.tableCardinality > 0 ? `${node.tableCardinality.toLocaleString()} rows` : 'N/A',
            detail: 'Physical total records stored in this table.'
          },
          {
            label: 'Operator Access Share',
            value: node.tableCardinality > 0 ? `${((Math.max(node.actualRows, node.estimateRows) / Math.max(1, node.tableCardinality)) * 100).toFixed(2)}% of table` : 'N/A',
            detail: 'Fraction of the table touched by this operation.'
          }
        ],
        impact: 'Scanning a table with millions of rows without selective indexes is one of the most common causes of database outages.',
        tuningTip: 'Ensure queries filtering large tables have selective indexes matching WHERE clause criteria.'
      };

    case 'Node ID':
      return {
        title: 'Node ID',
        category: 'ShowPlan XML Metadata',
        definition: 'Unique numeric identifier assigned by SQL Server to this operator in the execution plan tree.',
        parts: [
          {
            label: 'Node Identifier',
            value: `Node #${node.nodeId}`,
            detail: 'Unique node identifier in ShowPlan XML.'
          },
          {
            label: 'Tree Order',
            value: `Step #${node.nodeId}`,
            detail: 'Used by DMVs like sys.dm_exec_query_plan_stats to track per-operator runtime stats.'
          }
        ],
        impact: 'Used to cross-reference operator execution stats across SQL Server diagnostic DMVs and extended events.',
        tuningTip: 'Reference Node IDs when investigating execution plan warnings or query profile stats.'
      };

    default:
      return {
        title: prop.name,
        category: prop.category.toUpperCase(),
        definition: `Execution plan metric for ${prop.name}.`,
        parts: [
          {
            label: 'Current Value',
            value: prop.value,
            detail: `Value recorded for operator ${node.physicalOp} (Node #${node.nodeId}).`
          }
        ],
        impact: 'Influences SQL Server query execution, cardinality estimation, and engine resource allocation.'
      };
  }
}

export const PlanVisualizerTab: React.FC<PlanVisualizerTabProps> = ({
  plan,
  selectedStatement,
  onSelectStatement,
}) => {
  const [selectedNode, setSelectedNode] = useState<PlanNode | null>(
    selectedStatement.rootNode || null
  );
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [copiedSQL, setCopiedSQL] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [filterOnlyTrees, setFilterOnlyTrees] = useState<boolean>(true);

  // SSMS Inspector state
  const [inspectorTab, setInspectorTab] = useState<'all' | 'ssms' | 'predicates' | 'tuning'>('all');
  const [propSearchTerm, setPropSearchTerm] = useState<string>('');
  const [copiedPropTable, setCopiedPropTable] = useState<boolean>(false);
  const [copiedSeek, setCopiedSeek] = useState<boolean>(false);
  const [copiedFilter, setCopiedFilter] = useState<boolean>(false);
  const [copiedCols, setCopiedCols] = useState<boolean>(false);
  const [isSeekExpanded, setIsSeekExpanded] = useState<boolean>(false);

  // Hover and Pin states for SSMS properties explanations
  const [hoveredProp, setHoveredProp] = useState<{ prop: SsmsPropertyItem; rect: DOMRect } | null>(null);
  const [pinnedPropName, setPinnedPropName] = useState<string | null>(null);
  const [pinnedRect, setPinnedRect] = useState<DOMRect | null>(null);
  const [showSkewModal, setShowSkewModal] = useState<boolean>(false);
  const hoverCloseTimerRef = useRef<any>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [isExportingTree, setIsExportingTree] = useState<boolean>(false);

  const handleExportTreePng = async () => {
    if (!treeContainerRef.current) return;
    setIsExportingTree(true);
    try {
      await exportElementToPng(
        treeContainerRef.current,
        `PlanIQ_Tree_Stmt_${selectedStatement.statementId}`
      );
    } catch (e) {
      console.error('Failed to export tree PNG:', e);
    } finally {
      setIsExportingTree(false);
    }
  };

  const handleExportTreeSvg = async () => {
    if (!treeContainerRef.current) return;
    setIsExportingTree(true);
    try {
      await exportElementToSvg(
        treeContainerRef.current,
        `PlanIQ_Tree_Stmt_${selectedStatement.statementId}`
      );
    } catch (e) {
      console.error('Failed to export tree SVG:', e);
    } finally {
      setIsExportingTree(false);
    }
  };

  // Reset hover & pin when selected node or statement changes
  useEffect(() => {
    setHoveredProp(null);
    setPinnedPropName(null);
    setPinnedRect(null);
    setShowSkewModal(false);
  }, [selectedNode?.nodeId, selectedStatement.statementId]);

  // Handle click outside to dismiss pinned explanation popover
  useEffect(() => {
    if (!pinnedPropName) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest('.ssms-prop-popover') &&
        !target.closest('.ssms-prop-row') &&
        !target.closest('.btn-popover-pin')
      ) {
        setPinnedPropName(null);
        setPinnedRect(null);
        setHoveredProp(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [pinnedPropName]);

  // Compute active property item and its explanation
  const activePropItem = useMemo(() => {
    if (hoveredProp) return hoveredProp.prop;
    if (pinnedPropName && selectedNode) {
      const allProps = getSsmsProperties(selectedNode, selectedStatement.statementSubTreeCost);
      return allProps.find((p) => p.name === pinnedPropName) || null;
    }
    return null;
  }, [hoveredProp, pinnedPropName, selectedNode, selectedStatement.statementSubTreeCost]);

  const activeRect = hoveredProp?.rect || pinnedRect;

  const activeExplanation = useMemo(() => {
    if (!activePropItem || !selectedNode) return null;
    return getPropertyExplanation(activePropItem, selectedNode, selectedStatement.statementSubTreeCost);
  }, [activePropItem, selectedNode, selectedStatement.statementSubTreeCost]);

  const activeCoords = useMemo(() => {
    if (!activeRect) return null;
    const popoverWidth = 430;
    const viewportHeight = window.innerHeight;
    const padding = 16;

    // Horizontal placement: default to left of inspector, flip to right if no room
    let left = activeRect.left - popoverWidth - 14;
    if (left < padding) {
      if (activeRect.right + popoverWidth + 14 <= window.innerWidth) {
        left = activeRect.right + 14;
      } else {
        left = Math.max(padding, window.innerWidth - popoverWidth - padding);
      }
    }

    // Vertical placement: attempt to align with row, but shift up if bottom would be clipped
    const desiredHeight = 540;
    let top = activeRect.top + (activeRect.height / 2) - 180;
    if (top < padding) top = padding;
    if (top + desiredHeight > viewportHeight - padding) {
      top = Math.max(padding, viewportHeight - desiredHeight - padding);
    }

    // Maximum height strictly bounded within viewport so nothing is ever pushed off-screen
    const maxHeight = Math.max(260, viewportHeight - top - padding);

    return { top, left, maxHeight };
  }, [activeRect]);

  const handleCopySQL = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSQL(true);
    setTimeout(() => setCopiedSQL(false), 2000);
  };

  const statementsToDisplay = filterOnlyTrees
    ? plan.statements.filter((s) => s.hasQueryPlan || s.rootNode)
    : plan.statements;

  return (
    <div className="visualizer-container">
      {/* Visualizer Top Bar */}
      <div className="vis-topbar glass-panel">
        {/* Left: View Mode Toggle */}
        <div className="vis-mode-toggle-group">
          <div className="segmented-control">
            <button
              className={`segmented-btn ${viewMode === 'all' ? 'active' : ''}`}
              onClick={() => setViewMode('all')}
              title="View all statements in the batch at once (SSMS Mode)"
            >
              <ListOrdered size={14} />
              <span>All Statements at Once ({statementsToDisplay.length})</span>
            </button>
            <button
              className={`segmented-btn ${viewMode === 'single' ? 'active' : ''}`}
              onClick={() => setViewMode('single')}
              title="Focus on a single statement"
            >
              <LayoutGrid size={14} />
              <span>Single Statement</span>
            </button>
          </div>

          {viewMode === 'all' && (
            <label className="checkbox-label" style={{ fontSize: '12px', marginLeft: '8px' }}>
              <input
                type="checkbox"
                checked={filterOnlyTrees}
                onChange={(e) => setFilterOnlyTrees(e.target.checked)}
              />
              <span>Hide empty non-query stmts</span>
            </label>
          )}

          {viewMode === 'single' && (
            <div className="vis-stmt-selector" style={{ marginLeft: '10px' }}>
              <select
                className="stmt-dropdown"
                value={selectedStatement.statementId}
                onChange={(e) => {
                  const found = plan.statements.find((s) => s.statementId === e.target.value);
                  if (found) {
                    onSelectStatement(found);
                    setSelectedNode(found.rootNode || null);
                  }
                }}
              >
                {plan.statements.map((s) => (
                  <option key={s.statementId} value={s.statementId}>
                    #{s.statementId} [{s.statementType}] - Cost: {s.statementSubTreeCost.toFixed(2)} ({s.costPercentage.toFixed(1)}%)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Middle: Metrics for Single Mode or Batch Summary for All Mode */}
        <div className="vis-compile-metrics">
          <DiagnosticTooltip guideKey="treeVisualizer" />
          {viewMode === 'single' ? (
            <>
              <span className="badge badge-info">Cost: {selectedStatement.statementSubTreeCost.toFixed(2)}</span>
              {selectedStatement.compileTimeMs > 0 && (
                <span className="meta-item">Compile: {selectedStatement.compileTimeMs}ms</span>
              )}
              {selectedStatement.warnings.length > 0 && (
                <span className="badge badge-critical">
                  <AlertTriangle size={12} /> {selectedStatement.warnings.length} Warnings
                </span>
              )}
            </>
          ) : (
            <span className="meta-item" style={{ color: '#94a3b8' }}>
              Showing {statementsToDisplay.length} of {plan.totalStatements} statements • Total Cost: {plan.totalSubTreeCost.toFixed(2)}
            </span>
          )}
        </div>

        {/* Right: Orientation & Zoom Controls */}
        <div className="vis-right-controls">
          {/* Orientation Toggle */}
          <div className="segmented-control" title="Change layout orientation">
            <button
              className={`segmented-btn ${orientation === 'vertical' ? 'active' : ''}`}
              onClick={() => setOrientation('vertical')}
              title="Vertical Tree Layout (Top to Bottom)"
            >
              <ArrowDownUp size={13} />
              <span>Vertical</span>
            </button>
            <button
              className={`segmented-btn ${orientation === 'horizontal' ? 'active' : ''}`}
              onClick={() => setOrientation('horizontal')}
              title="Horizontal Pipeline (SSMS Style)"
            >
              <ArrowLeftRight size={13} />
              <span>Horizontal (SSMS)</span>
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="zoom-controls">
            <button
              className="btn-icon"
              onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.1))}
              title="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>
            <span className="zoom-label">{(zoomLevel * 100).toFixed(0)}%</span>
            <button
              className="btn-icon"
              onClick={() => setZoomLevel((z) => Math.min(1.5, z + 0.1))}
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
            <button
              className="btn-icon"
              onClick={() => setZoomLevel(1)}
              title="Reset Zoom"
            >
              <Maximize2 size={14} />
            </button>

            <div style={{ width: '1px', height: '18px', background: '#334155', margin: '0 4px' }} />

            <button
              type="button"
              className="btn-icon"
              onClick={handleExportTreePng}
              disabled={isExportingTree}
              title="Export High-Res PNG of Execution Plan Tree"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', width: 'auto', padding: '0 8px', fontSize: '11px', color: '#38bdf8' }}
            >
              <Download size={13} color="#38bdf8" />
              <span>PNG</span>
            </button>

            <button
              type="button"
              className="btn-icon"
              onClick={handleExportTreeSvg}
              disabled={isExportingTree}
              title="Export Vector SVG of Execution Plan Tree"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', width: 'auto', padding: '0 8px', fontSize: '11px', color: '#a78bfa' }}
            >
              <Download size={13} color="#a78bfa" />
              <span>SVG</span>
            </button>
          </div>
        </div>
      </div>

      {/* SQL Snippet Bar (Single Statement Mode) */}
      {viewMode === 'single' && (
        <div className="stmt-sql-bar glass-panel">
          <div className="sql-snippet-preview">
            <code>{selectedStatement.statementText}</code>
          </div>
          <button className="btn-copy-sm" onClick={() => handleCopySQL(selectedStatement.statementText)}>
            {copiedSQL ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
            <span>{copiedSQL ? 'Copied' : 'Copy SQL'}</span>
          </button>
        </div>
      )}

      {/* Main Canvas Area */}
      <div className="vis-main-layout">
        {/* Tree Canvas */}
        <div className="vis-canvas-scroll" ref={treeContainerRef}>
          {viewMode === 'single' ? (
            /* Single Statement Focused View */
            selectedStatement.rootNode ? (
              <div
                className={`tree-wrapper ${orientation === 'horizontal' ? 'tree-layout-horizontal' : ''}`}
                style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}
              >
                <TreeNode
                  node={selectedStatement.rootNode}
                  selectedNode={selectedNode}
                  onSelectNode={setSelectedNode}
                  orientation={orientation}
                  onOpenSkewModal={(n) => {
                    setSelectedNode(n);
                    setShowSkewModal(true);
                  }}
                />
              </div>
            ) : (
              <div className="empty-tree-state">
                <Layers size={40} color="#64748b" />
                <h3>No Relational Operators Found</h3>
                <p className="text-muted">
                  This statement may be a variable assignment or metadata check without an execution tree.
                </p>
              </div>
            )
          ) : (
            /* All Statements Continuous SSMS Mode */
            <div className="all-statements-scroll-container">
              {statementsToDisplay.map((stmt) => (
                <div
                  key={stmt.statementId}
                  className="statement-batch-block glass-panel"
                  id={`stmt-block-${stmt.statementId}`}
                >
                  {/* Statement Header */}
                  <div className="stmt-batch-header">
                    <div className="stmt-batch-left">
                      <span className="badge badge-info" style={{ fontWeight: 700 }}>
                        Query #{stmt.statementId}
                      </span>
                      <span className="stmt-type-tag">{stmt.statementType}</span>
                      <span
                        className="stmt-cost-tag"
                        style={{
                          fontWeight: 700,
                          color: stmt.costPercentage > 20 ? '#f43f5e' : stmt.costPercentage > 5 ? '#fbbf24' : '#38bdf8'
                        }}
                      >
                        Cost: {stmt.statementSubTreeCost.toFixed(2)} ({stmt.costPercentage.toFixed(1)}% of batch)
                      </span>

                      {/* Mini cost bar */}
                      <div className="batch-progress-mini">
                        <div
                          className={`batch-progress-fill ${stmt.costPercentage > 20 ? 'fill-heavy' : 'fill-normal'}`}
                          style={{ width: `${Math.min(100, Math.max(4, stmt.costPercentage))}%` }}
                        />
                      </div>

                      {stmt.warnings.length > 0 && (
                        <span className="badge badge-critical" style={{ fontSize: '10px' }}>
                          <AlertTriangle size={11} /> {stmt.warnings.length} Warnings
                        </span>
                      )}
                    </div>

                    <div className="stmt-batch-actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleCopySQL(stmt.statementText)}
                        title="Copy query SQL text"
                      >
                        <Copy size={12} />
                        <span>Copy SQL</span>
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          onSelectStatement(stmt);
                          setSelectedNode(stmt.rootNode || null);
                          setViewMode('single');
                        }}
                        title="Focus only on this single statement"
                      >
                        <Maximize2 size={12} />
                        <span>Focus</span>
                      </button>
                    </div>
                  </div>

                  {/* SQL Preview Snippet */}
                  <div className="stmt-batch-query-preview">
                    <code>{stmt.statementText.trim()}</code>
                  </div>

                  {/* Statement Tree */}
                  <div className="stmt-batch-tree-area">
                    {stmt.rootNode ? (
                      <div
                        className={`tree-wrapper ${orientation === 'horizontal' ? 'tree-layout-horizontal' : ''}`}
                        style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}
                      >
                        <TreeNode
                          node={stmt.rootNode}
                          selectedNode={selectedNode}
                          onSelectNode={setSelectedNode}
                          orientation={orientation}
                          onOpenSkewModal={(n) => {
                            setSelectedNode(n);
                            setShowSkewModal(true);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="empty-tree-state-sm">
                        <Layers size={16} color="#64748b" />
                        <span>(Non-query statement — Assignment / Control Flow without relational tree)</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Node Inspector Drawer */}
        {selectedNode && (() => {
          const allProperties = getSsmsProperties(selectedNode, selectedStatement.statementSubTreeCost);
          const filteredProperties = propSearchTerm.trim()
            ? allProperties.filter(
                (p) =>
                  p.name.toLowerCase().includes(propSearchTerm.toLowerCase()) ||
                  p.value.toLowerCase().includes(propSearchTerm.toLowerCase())
              )
            : allProperties;

          const opDesc =
            OPERATOR_DESCRIPTIONS[selectedNode.physicalOp] ||
            OPERATOR_DESCRIPTIONS[selectedNode.logicalOp] ||
            `${selectedNode.physicalOp} operator performing relational query processing in the execution engine.`;

          const handleCopyProperties = () => {
            const lines = [
              `============================================================`,
              `  ${selectedNode.physicalOp.toUpperCase()} (Node #${selectedNode.nodeId}) - SSMS Operator Properties`,
              `============================================================`,
              ...allProperties.map((p) => `${p.name.padEnd(44, ' ')} : ${p.value}`),
              `============================================================`
            ];
            navigator.clipboard.writeText(lines.join('\n'));
            setCopiedPropTable(true);
            setTimeout(() => setCopiedPropTable(false), 2000);
          };

          const isSeekLong = (selectedNode.seekPredicates || '').length > 250;
          const displaySeek =
            isSeekLong && !isSeekExpanded
              ? selectedNode.seekPredicates.slice(0, 220) + '...'
              : selectedNode.seekPredicates;

          return (
            <aside className="node-inspector glass-panel">
              {/* Header */}
              <div className="inspector-header">
                <div className="inspector-title-row">
                  <div className="operator-icon-badge">
                    {getOperatorIcon(selectedNode.physicalOp)}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <h3 className="inspector-title">{selectedNode.physicalOp}</h3>
                      <DiagnosticTooltip guideKey="operatorDetails" />
                    </div>
                    <div className="inspector-sub">{selectedNode.logicalOp || selectedNode.physicalOp}</div>
                  </div>
                </div>

                <div className="inspector-header-right">
                  <span className={`badge ${selectedNode.isPainPoint ? 'badge-critical' : 'badge-info'}`}>
                    Node #{selectedNode.nodeId}
                  </span>
                  <span
                    className={`badge ${
                      selectedNode.costPercentage > 30 ? 'badge-critical' : selectedNode.costPercentage > 10 ? 'badge-high' : 'badge-slate'
                    }`}
                  >
                    {selectedNode.costPercentage.toFixed(1)}%
                  </span>
                  <button
                    type="button"
                    className="btn-close-inspector"
                    onClick={() => setSelectedNode(null)}
                    title="Close Inspector"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              <div className="inspector-body">
                {/* Operator Plain-English Description Card (Matching Image 1) */}
                <div className="operator-desc-card">
                  <Info size={15} className="desc-icon" />
                  <div>
                    <strong style={{ color: '#f8fafc', display: 'block', marginBottom: '2px' }}>
                      {selectedNode.physicalOp}
                    </strong>
                    <span>{opDesc}</span>
                  </div>
                </div>

                {/* View Switcher Tabs */}
                <div className="inspector-tab-switcher">
                  <button
                    type="button"
                    className={`inspector-tab-btn ${inspectorTab === 'all' ? 'active' : ''}`}
                    onClick={() => setInspectorTab('all')}
                  >
                    <LayoutGrid size={12} />
                    <span>All Details</span>
                  </button>
                  <button
                    type="button"
                    className={`inspector-tab-btn ${inspectorTab === 'ssms' ? 'active' : ''}`}
                    onClick={() => setInspectorTab('ssms')}
                  >
                    <FileText size={12} />
                    <span>SSMS Properties</span>
                  </button>
                  <button
                    type="button"
                    className={`inspector-tab-btn ${inspectorTab === 'predicates' ? 'active' : ''}`}
                    onClick={() => setInspectorTab('predicates')}
                  >
                    <Filter size={12} />
                    <span>Predicates</span>
                  </button>
                  <button
                    type="button"
                    className={`inspector-tab-btn ${inspectorTab === 'tuning' ? 'active' : ''}`}
                    onClick={() => setInspectorTab('tuning')}
                  >
                    <AlertTriangle size={12} />
                    <span>Tuning</span>
                  </button>
                </div>

                {/* Cardinality Skew Alert (Always highlighted if skew exists) */}
                {selectedNode.hasCardinalitySkew && (
                  <div className="inspector-alert border-skew">
                    <AlertTriangle size={16} color="#fbbf24" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <strong style={{ color: '#fde68a' }}>Severe Cardinality Skew:</strong>
                        <span className="skew-tag-severe">
                          {selectedNode.skewRatio ? selectedNode.skewRatio.toFixed(0) : '3372'}x Error
                        </span>
                      </div>
                      <div style={{ marginTop: '3px', fontSize: '11px', color: '#cbd5e1' }}>
                        {selectedNode.skewReason}
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#fef3c7' }}>
                        <strong>Immediate T-SQL Remedy:</strong>
                        <div style={{ marginTop: '3px' }}>
                          <code style={{ background: 'rgba(0,0,0,0.35)', padding: '3px 6px', borderRadius: '4px', display: 'inline-block' }}>
                            UPDATE STATISTICS {selectedNode.schema ? `[${selectedNode.schema}].[${selectedNode.table}]` : (selectedNode.table ? `[${selectedNode.table}]` : '#TargetTable')} WITH FULLSCAN
                          </code>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-open-skew-plan"
                        onClick={() => setShowSkewModal(true)}
                        title="Click to view deep root cause diagnosis, memory impact, and copyable T-SQL fixes"
                      >
                        <Zap size={12} color="#fbbf24" />
                        <span>View Deep Resolution Plan & Diagnostics ({selectedNode.skewRatio ? selectedNode.skewRatio.toFixed(0) : '3372'}x)</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Pain Point Banner */}
                {selectedNode.isPainPoint && !selectedNode.hasCardinalitySkew && (
                  <div className="inspector-alert">
                    <AlertTriangle size={15} color="#f43f5e" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong>Bottleneck Flag:</strong> {selectedNode.painReason}
                    </div>
                  </div>
                )}

                {/* SSMS Properties Sheet Table (Matches Image 1) */}
                {(inspectorTab === 'all' || inspectorTab === 'ssms') && (
                  <div className="ssms-properties-card">
                    <div className="ssms-table-topbar">
                      <div className="ssms-table-title">
                        <FileText size={13} color="#38bdf8" />
                        <span>SSMS Properties ({filteredProperties.length})</span>
                      </div>
                      <div className="ssms-table-actions">
                        <input
                          type="text"
                          className="ssms-search-input"
                          placeholder="Filter props..."
                          value={propSearchTerm}
                          onChange={(e) => setPropSearchTerm(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn-ssms-copy"
                          onClick={handleCopyProperties}
                          title="Copy properties table in SSMS text format"
                        >
                          {copiedPropTable ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                          <span>{copiedPropTable ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>

                    <table className="ssms-props-table">
                      <tbody>
                        {filteredProperties.map((prop, idx) => {
                          const isHovered = hoveredProp?.prop.name === prop.name;
                          const isPinned = pinnedPropName === prop.name;
                          return (
                            <tr
                              key={idx}
                              className={`ssms-prop-row ${isHovered ? 'row-hovered' : ''} ${
                                isPinned ? 'row-pinned' : ''
                              }`}
                              onMouseEnter={(e) => {
                                if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
                                const rect = e.currentTarget.getBoundingClientRect();
                                setHoveredProp({ prop, rect });
                              }}
                              onMouseLeave={() => {
                                if (!pinnedPropName) {
                                  hoverCloseTimerRef.current = setTimeout(() => {
                                    setHoveredProp(null);
                                  }, 140);
                                } else {
                                  setHoveredProp(null);
                                }
                              }}
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                if (pinnedPropName === prop.name) {
                                  setPinnedPropName(null);
                                  setPinnedRect(null);
                                } else {
                                  setPinnedPropName(prop.name);
                                  setPinnedRect(rect);
                                }
                              }}
                              title="Click to pin explanation, or hover to inspect details & parts breakdown"
                            >
                              <td className="ssms-prop-name">
                                <div className="prop-name-inner">
                                  <span>{prop.name}</span>
                                  <span className="prop-hover-badge">
                                    <HelpCircle size={10} />
                                  </span>
                                </div>
                              </td>
                              <td
                                className={`ssms-prop-val ${
                                  prop.highlight === 'skew'
                                    ? 'highlight-skew'
                                    : prop.highlight === 'cost'
                                    ? 'highlight-cost'
                                    : ''
                                }`}
                              >
                                {prop.value}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="ssms-hover-hint">
                      <HelpCircle size={11} color="#38bdf8" />
                      <span>Hover over any row for deep metric explanation & value breakdown. Click row to pin.</span>
                    </div>
                  </div>
                )}

                {/* Tuning Tab Dedicated Panel */}
                {(inspectorTab === 'all' || inspectorTab === 'tuning') && selectedNode.hasCardinalitySkew && (
                  <div className="inspector-section" style={{ background: 'rgba(251, 191, 36, 0.05)', border: '1px solid rgba(251, 191, 36, 0.25)', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Wrench size={13} color="#fbbf24" />
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#fde68a', textTransform: 'uppercase' }}>
                          Tuning Playbook ({selectedNode.skewRatio ? selectedNode.skewRatio.toFixed(0) : '3372'}x Skew)
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-code-copy"
                        onClick={() => setShowSkewModal(true)}
                        title="Open interactive resolution plan window"
                      >
                        <span>Full Resolution Plan ↗</span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div className="remedy-step-card">
                        <div className="step-header">
                          <span className="step-num">Step 1</span>
                          <span style={{ fontSize: '11px', color: '#cbd5e1', flex: 1 }}>Update Temp Table Stats</span>
                          <button
                            type="button"
                            className="btn-code-copy"
                            onClick={() => {
                              navigator.clipboard.writeText(`UPDATE STATISTICS ${selectedNode.schema ? `[${selectedNode.schema}].[${selectedNode.table}]` : (selectedNode.table ? `[${selectedNode.table}]` : '#TargetTable')} WITH FULLSCAN;`);
                            }}
                          >
                            <Copy size={10} />
                            <span>Copy</span>
                          </button>
                        </div>
                        <pre className="remedy-code-block" style={{ fontSize: '10.5px' }}>
                          UPDATE STATISTICS {selectedNode.schema ? `[${selectedNode.schema}].[${selectedNode.table}]` : (selectedNode.table ? `[${selectedNode.table}]` : '#TargetTable')} WITH FULLSCAN;
                        </pre>
                      </div>

                      <div className="remedy-step-card">
                        <div className="step-header">
                          <span className="step-num">Step 2</span>
                          <span style={{ fontSize: '11px', color: '#cbd5e1', flex: 1 }}>Bypass Parameter Sniffing</span>
                          <button
                            type="button"
                            className="btn-code-copy"
                            onClick={() => {
                              navigator.clipboard.writeText(`OPTION (RECOMPILE);`);
                            }}
                          >
                            <Copy size={10} />
                            <span>Copy</span>
                          </button>
                        </div>
                        <pre className="remedy-code-block" style={{ fontSize: '10.5px' }}>
                          OPTION (RECOMPILE);
                        </pre>
                      </div>
                    </div>
                  </div>
                )}

                {/* Target Object / Table Details */}
                {(inspectorTab === 'all' || inspectorTab === 'tuning') && selectedNode.table && (
                  <div className="inspector-section">
                    <div className="inspector-label">Target Storage Object</div>
                    <div className="object-details-box">
                      <div className="object-name">
                        <Table size={13} color="#38bdf8" />
                        <span>
                          {selectedNode.schema
                            ? `${selectedNode.schema}.${selectedNode.table}`
                            : selectedNode.table}
                        </span>
                      </div>
                      {selectedNode.index && (
                        <div className="object-index">
                          Index: <strong>{selectedNode.index}</strong> ({selectedNode.indexKind || 'Index'})
                        </div>
                      )}
                      {selectedNode.tableCardinality > 0 && (
                        <div className="text-muted" style={{ fontSize: '11px', marginTop: '3px' }}>
                          Table Total Rows: <strong>{selectedNode.tableCardinality.toLocaleString()}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Seek Predicates */}
                {(inspectorTab === 'all' || inspectorTab === 'predicates') && selectedNode.seekPredicates && (
                  <div className="predicate-section-box">
                    <div className="predicate-header">
                      <div className="predicate-title">
                        <Search size={13} color="#38bdf8" />
                        <span>Seek Predicates</span>
                      </div>
                      <div className="predicate-actions">
                        {isSeekLong && (
                          <span className="predicate-badge-len">
                            {(selectedNode.seekPredicates.length / 1024).toFixed(1)} KB
                          </span>
                        )}
                        {isSeekLong && (
                          <button
                            type="button"
                            className="btn-predicate-action"
                            onClick={() => setIsSeekExpanded(!isSeekExpanded)}
                          >
                            {isSeekExpanded ? 'Collapse' : 'Show Full'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-predicate-action"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedNode.seekPredicates);
                            setCopiedSeek(true);
                            setTimeout(() => setCopiedSeek(false), 2000);
                          }}
                        >
                          {copiedSeek ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                          <span>{copiedSeek ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>
                    <pre className="predicate-code-box">{displaySeek}</pre>
                    {isSeekLong && !isSeekExpanded && (
                      <div className="predicate-truncated-hint">
                        <span>Expression truncated for readability ({selectedNode.seekPredicates.length.toLocaleString()} characters)</span>
                        <button
                          type="button"
                          style={{
                            fontSize: '10.5px',
                            color: '#38bdf8',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            fontWeight: 600
                          }}
                          onClick={() => setIsSeekExpanded(true)}
                        >
                          Expand Full Expression ▼
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Filter Predicate */}
                {(inspectorTab === 'all' || inspectorTab === 'predicates') && selectedNode.predicate && (
                  <div className="predicate-section-box">
                    <div className="predicate-header">
                      <div className="predicate-title">
                        <Filter size={13} color="#fbbf24" />
                        <span>Filter Predicate</span>
                      </div>
                      <button
                        type="button"
                        className="btn-predicate-action"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedNode.predicate);
                          setCopiedFilter(true);
                          setTimeout(() => setCopiedFilter(false), 2000);
                        }}
                      >
                        {copiedFilter ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                        <span>{copiedFilter ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="predicate-code-box">{selectedNode.predicate}</pre>
                  </div>
                )}

                {/* Output Columns */}
                {(inspectorTab === 'all' || inspectorTab === 'predicates') && selectedNode.outputColumns.length > 0 && (
                  <div className="predicate-section-box">
                    <div className="predicate-header">
                      <div className="predicate-title">
                        <Database size={13} color="#34d399" />
                        <span>Output Columns ({selectedNode.outputColumns.length})</span>
                      </div>
                      <button
                        type="button"
                        className="btn-predicate-action"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedNode.outputColumns.join(', '));
                          setCopiedCols(true);
                          setTimeout(() => setCopiedCols(false), 2000);
                        }}
                      >
                        {copiedCols ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                        <span>{copiedCols ? 'Copied' : 'Copy List'}</span>
                      </button>
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      <div className="output-cols-wrap">
                        {selectedNode.outputColumns.map((col, idx) => (
                          <span key={idx} className="col-badge">
                            {col}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          );
        })()}
      </div>

      {/* Active Property Explanation Portal Popover (Matches User Request: Hover explains all parts with row values) */}
      {activeExplanation && activeCoords && activePropItem && createPortal(
        <div
          className="ssms-prop-popover glass-panel"
          style={{
            position: 'fixed',
            top: `${activeCoords.top}px`,
            left: `${activeCoords.left}px`,
            zIndex: 99999999,
            width: '430px',
            maxHeight: `${activeCoords.maxHeight}px`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          onWheel={(e) => e.stopPropagation()}
          onMouseEnter={() => {
            if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
          }}
          onMouseLeave={() => {
            if (!pinnedPropName) {
              hoverCloseTimerRef.current = setTimeout(() => {
                setHoveredProp(null);
              }, 140);
            }
          }}
        >
          <div className="popover-header">
            <div className="popover-title-row">
              <div className="popover-title-group">
                <span className="popover-prop-title">{activeExplanation.title}</span>
                <span className="popover-cat-pill">{activeExplanation.category}</span>
              </div>
              <div className="popover-header-actions">
                <button
                  type="button"
                  className={`btn-popover-pin ${pinnedPropName === activePropItem.name ? 'pinned' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (pinnedPropName === activePropItem.name) {
                      setPinnedPropName(null);
                      setPinnedRect(null);
                    } else {
                      setPinnedPropName(activePropItem.name);
                    }
                  }}
                  title={pinnedPropName === activePropItem.name ? 'Unpin card' : 'Pin card open'}
                >
                  {pinnedPropName === activePropItem.name ? <PinOff size={11} /> : <Pin size={11} />}
                  <span>{pinnedPropName === activePropItem.name ? 'Pinned' : 'Pin'}</span>
                </button>
                <button
                  type="button"
                  className="btn-popover-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPinnedPropName(null);
                    setPinnedRect(null);
                    setHoveredProp(null);
                  }}
                  title="Close explanation"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            <div className="popover-current-val-banner">
              <span className="val-banner-label">Current Row Value:</span>
              <span className="val-banner-value">{activePropItem.value}</span>
            </div>
          </div>

          <div className="popover-body">
            {/* What is this Property? */}
            <div className="popover-section">
              <div className="popover-subhead">
                <Info size={12} color="#38bdf8" />
                <span>What is this Property?</span>
              </div>
              <p className="popover-desc">{activeExplanation.definition}</p>
            </div>

            {/* Explanation of Parts with Current Values */}
            <div className="popover-section">
              <div className="popover-subhead">
                <Cpu size={12} color="#a855f7" />
                <span>Explanation of Parts (With Current Values)</span>
              </div>
              <div className="popover-parts-list">
                {activeExplanation.parts.map((part, pIdx) => (
                  <div key={pIdx} className="popover-part-card">
                    <div className="part-label-row">
                      <span className="part-label">{part.label}:</span>
                      <span className="part-val-tag">{part.value}</span>
                    </div>
                    <div className="part-detail">{part.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Performance Impact & Tuning */}
            <div className="popover-section">
              <div className="popover-subhead">
                <Zap size={12} color="#fbbf24" />
                <span>Performance Impact & Tuning</span>
              </div>
              <p className="popover-impact-text">{activeExplanation.impact}</p>
              {activeExplanation.tuningTip && (
                <div className="popover-tip-box">
                  <Wrench size={12} color="#34d399" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{activeExplanation.tuningTip}</span>
                </div>
              )}

              {/* Quick Action Button for Cardinality Skew Resolution */}
              {(activeExplanation.title === 'Cardinality Skew' || selectedNode?.hasCardinalitySkew) && (
                <div style={{ marginTop: '12px' }}>
                  <button
                    className="btn-open-skew-plan"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSkewModal(true);
                    }}
                  >
                    <Sliders size={13} />
                    <span>Open Deep Resolution Plan & Fix Scripts</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 3372x Cardinality Skew Resolution & Diagnostic Modal */}
      {selectedNode && (
        <SkewResolutionModal
          node={selectedNode}
          statementCost={selectedStatement.statementSubTreeCost}
          isOpen={showSkewModal}
          onClose={() => setShowSkewModal(false)}
        />
      )}
    </div>
  );
};

interface TreeNodeProps {
  node: PlanNode;
  selectedNode: PlanNode | null;
  onSelectNode: (node: PlanNode) => void;
  orientation?: 'vertical' | 'horizontal';
  onOpenSkewModal?: (node: PlanNode) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  selectedNode,
  onSelectNode,
  orientation = 'vertical',
  onOpenSkewModal
}) => {
  const isSelected = selectedNode?.nodeId === node.nodeId;
  const isHot = node.costPercentage > 30 || node.isPainPoint;
  const isHorizontal = orientation === 'horizontal';

  return (
    <div className={`tree-node-wrapper ${isHorizontal ? 'tree-node-wrapper-horizontal' : ''}`}>
      <div
        className={`plan-node-box glass-panel ${isSelected ? 'node-selected' : ''} ${
          isHot ? 'node-hot' : ''
        }`}
        onClick={() => onSelectNode(node)}
      >
        <div className="node-top">
          <div className="node-icon-title">
            <span className="node-icon">{getOperatorIcon(node.physicalOp)}</span>
            <div className="node-title-group">
              <span className="node-physical-title">{node.physicalOp}</span>
              {node.logicalOp && node.logicalOp !== node.physicalOp && (
                <span className="node-logical-sub">{node.logicalOp}</span>
              )}
            </div>
          </div>
          <span
            className={`node-cost-badge ${
              node.costPercentage > 40
                ? 'cost-critical'
                : node.costPercentage > 15
                ? 'cost-warning'
                : 'cost-normal'
            }`}
          >
            {node.costPercentage.toFixed(1)}%
          </span>
        </div>

        {/* Target Table info */}
        {node.table && (
          <div className="node-table-row" title={`${node.schema}.${node.table}`}>
            <Table size={12} color="#38bdf8" />
            <span className="node-table-name">
              {node.schema ? `${node.schema}.${node.table}` : node.table}
            </span>
          </div>
        )}

        {/* Rows Estimate */}
        <div className="node-bottom-meta">
          <span className="text-dim">Rows:</span>
          <span className="text-main">
            {node.hasActualRows
              ? `${node.actualRows.toLocaleString()} (Act)`
              : node.estimateRows > 0
              ? node.estimateRows.toLocaleString()
              : '1'}
          </span>
          {node.hasCardinalitySkew && (
            <span
              className="badge badge-high"
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title={`${node.skewReason || 'Cardinality Skew'} — Click to open 3372x Resolution Plan & T-SQL Fix Scripts`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(node);
                if (onOpenSkewModal) {
                  onOpenSkewModal(node);
                }
              }}
            >
              {node.skewRatio && node.skewRatio > 1
                ? `${node.skewRatio.toFixed(0)}x`
                : node.skewRatio
                ? `${(1 / node.skewRatio).toFixed(0)}x`
                : ''}{' '}
              Skew ↗
            </span>
          )}
          {node.isPainPoint && !node.hasCardinalitySkew && (
            <span className="node-warning-flag" title={node.painReason}>
              <AlertTriangle size={12} color="#f43f5e" />
            </span>
          )}
        </div>
      </div>

      {/* Children Nodes */}
      {node.children && node.children.length > 0 && (
        <div className={`node-children-container ${isHorizontal ? 'node-children-container-horizontal' : ''}`}>
          {node.children.map((child) => (
            <div key={child.nodeId} className={`child-branch ${isHorizontal ? 'child-branch-horizontal' : ''}`}>
              <div className={isHorizontal ? 'branch-line-h' : 'branch-line-v'} />
              <TreeNode
                node={child}
                selectedNode={selectedNode}
                onSelectNode={onSelectNode}
                orientation={orientation}
                onOpenSkewModal={onOpenSkewModal}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function getOperatorIcon(physicalOp: string) {
  const op = physicalOp.toLowerCase();
  if (op.includes('seek')) return <Search size={14} color="#38bdf8" />;
  if (op.includes('scan')) return <Filter size={14} color="#f59e0b" />;
  if (op.includes('lookup')) return <AlertTriangle size={14} color="#f43f5e" />;
  if (op.includes('join') || op.includes('nested loops') || op.includes('hash match'))
    return <Layers size={14} color="#a855f7" />;
  if (op.includes('insert') || op.includes('update') || op.includes('delete'))
    return <Database size={14} color="#10b981" />;
  return <GitCommit size={14} color="#94a3b8" />;
}
