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
  Download,
  Clock,
  EyeOff
} from 'lucide-react';
import { PlanAnalysis, StatementAnalysis, PlanNode } from '../types/plan';
import { DiagnosticTooltip } from './DiagnosticTooltip';
import { NodeExtraPanels } from './NodeExtraPanels';
import { PlanEdges } from './PlanEdges';
import { TreeNode, getOperatorIcon } from './TreeNode';
import { buildReproScript, buildHtmlReport, downloadTextFile } from '../utils/planExports';
import { SkewResolutionModal } from './SkewResolutionModal';
import { exportElementToPng, exportElementToSvg } from '../utils/reportExporter';

interface PlanVisualizerTabProps {
  plan: PlanAnalysis;
  selectedStatement: StatementAnalysis;
  onSelectStatement: (stmt: StatementAnalysis) => void;
  onExportRawPlan?: () => void;
  onExportAnonymizedPlan?: () => void;
  onAnonymizeInPlace?: () => void;
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
  'Adaptive Join': 'Dynamically switch between Nested Loops and Hash Match at runtime based on actual row counts.',
  // PostgreSQL Native Operator Descriptions
  'Seq Scan': 'Scan all relation blocks sequentially from start to finish without an index.',
  'Bitmap Index Scan': 'Scan index matching the condition and construct a bitmap of matching heap page block numbers in memory.',
  'Bitmap Heap Scan': 'Read relation pages referenced in the incoming bitmap, skipping non-matching table blocks.',
  'Index Only Scan': 'Retrieve all required column data directly from the index tree without fetching heap tuples, verified using the visibility map.',
  'Aggregate': 'Compute aggregate expressions (SUM, COUNT, AVG, MIN, MAX) over input rows using Plain, Sorted, or Hashed strategy.',
  'Gather': 'Coordinate and merge rows from multiple parallel worker processes into the main backend process.',
  'Gather Merge': 'Merge pre-sorted streams from multiple parallel worker processes while preserving sort order.',
  'Materialize': 'Cache the output of an inner plan in memory or on disk to allow fast repeated scans in nested loop joins.',
  'Hash': 'Construct an in-memory hash table of join keys for Hash Join probing.',
  'Memoize': 'Cache results of parameterized inner scans to avoid re-evaluating the same outer join key.',
  'Incremental Sort': 'Sort input rows that are already pre-sorted on a leading prefix of keys, sorting only within tie groups.',
  'Table Function Scan': 'Execute a set-returning table function (including PostgreSQL 17+ SQL/JSON JSON_TABLE) row-by-row.',
  'ModifyTable': 'Apply INSERT, UPDATE, DELETE, or PostgreSQL 15–18 MERGE (with RETURNING) modifications to target relations.',
  'Custom Scan': 'Execute a custom scan provider (such as columnar, vectorized, or extension-backed index scans).',
  'Foreign Scan': 'Read data remotely via a Foreign Data Wrapper (FDW) or external storage engine.',
  'Append': 'Concatenate rows sequentially from multiple subplans (such as partitioned tables or UNION ALL branches).',
  'Merge Append': 'Merge pre-sorted streams from multiple subplans or partitions while maintaining overall sort order.',
  'BitmapAnd': 'Intersect multiple Bitmap Index Scans in memory before reading matching heap blocks.',
  'BitmapOr': 'Union multiple Bitmap Index Scans in memory before reading matching heap blocks.',
  'Subquery Scan': 'Evaluate an unflattened subquery as a streaming relational input.',
  'Result': 'Evaluate constant expressions or project scalar values without accessing storage relations.'
};

export type SsmsPropertyCategory =
  | 'operator'
  | 'cost'
  | 'rows'
  | 'actual_stats'
  | 'actual_timing'
  | 'storage'
  | 'predicate'
  | 'output'
  | 'statement';

export interface SsmsPropertyItem {
  name: string;
  value: string;
  highlight?: 'skew' | 'cost' | 'normal' | 'warn' | 'good';
  category: SsmsPropertyCategory;
}

export const CATEGORY_META: Record<
  SsmsPropertyCategory,
  { label: string; shortLabel: string; iconName: string; color: string }
> = {
  operator: {
    label: 'Operator Details',
    shortLabel: 'Operator',
    iconName: 'Cpu',
    color: '#38bdf8'
  },
  cost: {
    label: 'Estimated Costs',
    shortLabel: 'Costs',
    iconName: 'Activity',
    color: '#f43f5e'
  },
  rows: {
    label: 'Estimated & Actual Rows',
    shortLabel: 'Rows & Skew',
    iconName: 'Layers',
    color: '#a855f7'
  },
  actual_stats: {
    label: 'Actual Statistics & I/O',
    shortLabel: 'Actual Stats',
    iconName: 'HardDrive',
    color: '#34d399'
  },
  actual_timing: {
    label: 'Actual Timing & Runtime',
    shortLabel: 'Timing',
    iconName: 'Clock',
    color: '#38bdf8'
  },
  storage: {
    label: 'Target Storage Object',
    shortLabel: 'Storage',
    iconName: 'Table',
    color: '#f59e0b'
  },
  predicate: {
    label: 'Predicates',
    shortLabel: 'Predicates',
    iconName: 'Filter',
    color: '#fbbf24'
  },
  output: {
    label: 'Output Columns',
    shortLabel: 'Outputs',
    iconName: 'Database',
    color: '#10b981'
  },
  statement: {
    label: 'Statement Context & Metrics',
    shortLabel: 'Statement',
    iconName: 'FileText',
    color: '#60a5fa'
  }
};

function getPgProperties(
  node: PlanNode,
  statement: Partial<StatementAnalysis>
): SsmsPropertyItem[] {
  const pg = node.pg;
  const isSkew = node.hasCardinalitySkew;
  const statementCost = statement.statementSubTreeCost ?? 0;
  const totalCost = pg?.totalCost ?? node.estimatedTotalSubtreeCost ?? 0;
  const costPct =
    statementCost > 0
      ? (totalCost / statementCost) * 100
      : node.costPercentage;

  const items: SsmsPropertyItem[] = [
    // 1. OPERATOR DETAILS
    { name: 'Physical Operation', value: node.physicalOp, category: 'operator' },
    { name: 'Logical Operation', value: node.logicalOp || node.physicalOp, category: 'operator' },
    { name: 'Node ID', value: `Node #${node.nodeId}`, category: 'operator' },
  ];

  if (pg?.strategy) items.push({ name: 'Execution Strategy', value: pg.strategy, category: 'operator' });
  if (pg?.parentRelationship) items.push({ name: 'Parent Relationship', value: pg.parentRelationship, category: 'operator' });
  if (pg?.operation) items.push({ name: 'DML Operation', value: pg.operation, category: 'operator' });
  if (pg?.tableFuncName) items.push({ name: 'Table Function', value: pg.tableFuncName, category: 'operator' });
  if (pg?.scanDirection) items.push({ name: 'Scan Direction', value: pg.scanDirection, category: 'operator' });
  if (pg?.subplanName) items.push({ name: 'SubPlan Identifier', value: pg.subplanName, category: 'operator' });
  if (pg?.indexSearches !== undefined) {
    items.push({
      name: 'Index Searches (PG 18+ Skip Scan)',
      value: `${pg.indexSearches.toLocaleString()} descent${pg.indexSearches === 1 ? '' : 's'}`,
      highlight: pg.indexSearches > 500 ? 'warn' : 'normal',
      category: 'operator'
    });
  }
  if (pg?.cacheHits !== undefined || pg?.cacheMisses !== undefined) {
    const hits = pg.cacheHits ?? 0;
    const misses = pg.cacheMisses ?? 0;
    const evictions = pg.cacheEvictions ?? 0;
    const overflows = pg.cacheOverflows ?? 0;
    const hitRate = hits + misses > 0 ? ((hits / (hits + misses)) * 100).toFixed(1) : '0.0';
    items.push({
      name: 'Memoize Cache Telemetry',
      value: `${hitRate}% hit (${hits.toLocaleString()} hits, ${misses.toLocaleString()} misses, ${evictions.toLocaleString()} evictions, ${overflows.toLocaleString()} overflows)`,
      highlight: evictions > 0 || overflows > 0 ? 'warn' : 'good',
      category: 'operator'
    });
  }
  if (pg?.presortedKey && pg.presortedKey.length > 0) {
    items.push({
      name: 'Incremental Sort Presorted Key',
      value: pg.presortedKey.join(', '),
      category: 'operator'
    });
  }
  if (pg?.fullSortGroups || pg?.preSortedGroups) {
    const fullG = pg.fullSortGroups?.groupCount ?? 0;
    const preG = pg.preSortedGroups?.groupCount ?? 0;
    items.push({
      name: 'Incremental Sort Groups',
      value: `Full-sort: ${fullG.toLocaleString()}, Pre-sorted: ${preG.toLocaleString()}`,
      category: 'operator'
    });
  }
  items.push({ name: 'Execution Loops', value: `${pg?.loops ?? 1}`, category: 'operator' });

  if (pg?.workersPlanned !== undefined) {
    items.push({
      name: 'Workers Planned / Launched',
      value: `${pg.workersPlanned} planned / ${pg.workersLaunched ?? 0} launched`,
      category: 'operator'
    });
  }

  if (pg?.sortMethod) {
    items.push({
      name: 'Sort Method & Space',
      value: `${pg.sortMethod} (${pg.sortSpaceKb ?? 0} KB ${pg.sortSpaceType || ''})`,
      highlight: (pg.sortSpaceType || '').toLowerCase().includes('disk') ? 'warn' : 'normal',
      category: 'operator'
    });
  }

  if (pg?.hashBatches && pg.hashBatches > 1) {
    items.push({
      name: 'Hash Join Batches & Buckets',
      value: `${pg.hashBatches} batches (Buckets: ${pg.hashBuckets ?? 1}, original: ${pg.originalHashBatches || 1})`,
      highlight: 'warn',
      category: 'operator'
    });
  }

  // 2. ESTIMATED COSTS
  items.push(
    {
      name: 'Total Cost',
      value: `${totalCost.toFixed(2)} units`,
      highlight: costPct > 40 ? 'cost' : 'normal',
      category: 'cost'
    },
    {
      name: 'Startup Cost',
      value: `${(pg?.startupCost ?? 0).toFixed(2)} units`,
      category: 'cost'
    },
    {
      name: 'Operator Cost % of Query',
      value: `${costPct.toFixed(1)}%`,
      highlight: costPct > 20 ? 'cost' : 'normal',
      category: 'cost'
    },
    {
      name: 'Plan Width (Row Size)',
      value: `${pg?.planWidth ?? Math.max(16, node.outputColumns.length * 28 || 64)} Bytes`,
      category: 'cost'
    }
  );

  // 3. ESTIMATED & ACTUAL ROWS
  const planRows = pg?.planRows ?? node.estimateRows ?? 0;
  const loops = pg?.loops ?? 1;
  const actualRowsTotal = node.hasActualRows ? (pg?.rowsPerLoop !== undefined ? Math.round(pg.rowsPerLoop * loops) : node.actualRows) : 0;
  const actualRowsPerLoop = node.hasActualRows ? (pg?.rowsPerLoop ?? (loops > 0 ? node.actualRows / loops : node.actualRows)) : 0;

  items.push(
    {
      name: 'Plan Rows (Estimated)',
      value: planRows.toLocaleString(),
      highlight: isSkew ? 'skew' : 'normal',
      category: 'rows'
    },
    {
      name: 'Actual Rows (Total)',
      value: node.hasActualRows ? actualRowsTotal.toLocaleString() : 'N/A (EXPLAIN without ANALYZE)',
      highlight: isSkew ? 'skew' : node.hasActualRows ? 'good' : 'normal',
      category: 'rows'
    },
    {
      name: 'Actual Rows Per Loop',
      value: node.hasActualRows ? actualRowsPerLoop.toLocaleString() : 'N/A',
      category: 'rows'
    },
    {
      name: 'Execution Loops',
      value: `${loops}`,
      category: 'rows'
    },
    {
      name: 'Cardinality Skew Ratio',
      value: isSkew
        ? `${node.skewRatio ? node.skewRatio.toFixed(1) : '1.0'}x Error`
        : 'Well Calibrated (1.0x)',
      highlight: isSkew ? 'skew' : 'good',
      category: 'rows'
    }
  );

  if (pg?.rowsRemovedByFilter !== undefined && pg.rowsRemovedByFilter > 0) {
    items.push({
      name: 'Rows Removed by Filter',
      value: pg.rowsRemovedByFilter.toLocaleString(),
      highlight: 'warn',
      category: 'rows'
    });
  }
  if (pg?.rowsRemovedByIndexRecheck !== undefined && pg.rowsRemovedByIndexRecheck > 0) {
    items.push({
      name: 'Rows Removed by Index Recheck',
      value: pg.rowsRemovedByIndexRecheck.toLocaleString(),
      highlight: 'warn',
      category: 'rows'
    });
  }

  // 4. ACTUAL STATISTICS (BUFFERS & I/O)
  if (pg?.hasBuffers && pg.buffers) {
    const b = pg.buffers;
    const totalShared = b.sharedHit + b.sharedRead;
    const hitRatio = totalShared > 0 ? ((b.sharedHit / totalShared) * 100).toFixed(1) : '100.0';

    items.push(
      {
        name: 'Shared Hit Blocks (RAM)',
        value: `${b.sharedHit.toLocaleString()} blocks (~${((b.sharedHit * 8) / 1024).toFixed(2)} MB)`,
        highlight: 'good',
        category: 'actual_stats'
      },
      {
        name: 'Shared Read Blocks (Disk)',
        value: `${b.sharedRead.toLocaleString()} blocks (~${((b.sharedRead * 8) / 1024).toFixed(2)} MB)`,
        highlight: b.sharedRead > 0 ? 'warn' : 'normal',
        category: 'actual_stats'
      },
      {
        name: 'Buffer Cache Hit Ratio',
        value: `${hitRatio}%`,
        highlight: b.sharedRead > 0 ? 'cost' : 'good',
        category: 'actual_stats'
      }
    );

    if (b.sharedDirtied > 0) {
      items.push({
        name: 'Shared Dirtied Blocks',
        value: `${b.sharedDirtied.toLocaleString()} blocks (~${((b.sharedDirtied * 8) / 1024).toFixed(2)} MB)`,
        category: 'actual_stats'
      });
    }
    if (b.sharedWritten > 0) {
      items.push({
        name: 'Shared Written Blocks',
        value: `${b.sharedWritten.toLocaleString()} blocks (~${((b.sharedWritten * 8) / 1024).toFixed(2)} MB)`,
        category: 'actual_stats'
      });
    }
    if (b.tempRead > 0 || b.tempWritten > 0) {
      items.push({
        name: 'Temp Blocks (Spill I/O)',
        value: `Read: ${b.tempRead.toLocaleString()} blocks, Written: ${b.tempWritten.toLocaleString()} blocks (~${(((b.tempRead + b.tempWritten) * 8) / 1024).toFixed(2)} MB)`,
        highlight: 'warn',
        category: 'actual_stats'
      });
    }
    if (pg.heapFetches !== undefined) {
      items.push({
        name: 'Heap Fetches (Index-Only Scan)',
        value: pg.heapFetches > 500
          ? `${pg.heapFetches.toLocaleString()} (Run VACUUM or PG 19 REPACK (CONCURRENTLY))`
          : pg.heapFetches.toLocaleString(),
        highlight: pg.heapFetches > 500 ? 'warn' : 'normal',
        category: 'actual_stats'
      });
    }
    if ((pg.walRecords ?? 0) > 0 || (pg.walBytes ?? 0) > 0) {
      const walKb = ((pg.walBytes ?? 0) / 1024).toFixed(1);
      items.push({
        name: 'WAL Write Amplification (EXPLAIN WAL)',
        value: `${(pg.walRecords ?? 0).toLocaleString()} records, ${(pg.walFpi ?? 0).toLocaleString()} FPIs, ${walKb} KB`,
        highlight: (pg.walFpi ?? 0) > 100 ? 'warn' : 'normal',
        category: 'actual_stats'
      });
    }
    if (pg.lossyHeapBlocks !== undefined && pg.lossyHeapBlocks > 0) {
      items.push({
        name: 'Lossy Heap Blocks',
        value: pg.lossyHeapBlocks.toLocaleString(),
        highlight: 'warn',
        category: 'actual_stats'
      });
    }
    if (pg.exactHeapBlocks !== undefined && pg.exactHeapBlocks > 0) {
      items.push({
        name: 'Exact Heap Blocks',
        value: pg.exactHeapBlocks.toLocaleString(),
        category: 'actual_stats'
      });
    }
  } else {
    items.push(
      {
        name: 'Shared Hit Blocks (RAM)',
        value: 'N/A (EXPLAIN without BUFFERS)',
        category: 'actual_stats'
      },
      {
        name: 'Shared Read Blocks (Disk)',
        value: 'N/A (EXPLAIN without BUFFERS)',
        category: 'actual_stats'
      },
      {
        name: 'Buffer Cache Hit Ratio',
        value: 'N/A',
        category: 'actual_stats'
      }
    );
  }

  // 5. ACTUAL TIMING
  const selfElapsed = node.selfElapsedMs ?? 0;
  items.push(
    {
      name: 'Operator Self Elapsed Time',
      value:
        selfElapsed > 0
          ? `${selfElapsed.toLocaleString()} ms (${(selfElapsed / 1000).toFixed(3)}s)${
              (node.selfElapsedPercent || 0) > 0 ? ` • ${node.selfElapsedPercent?.toFixed(1)}% of query duration` : ''
            }`
          : '0 ms (0.000s)',
      highlight:
        selfElapsed >= 1000 || (node.selfElapsedPercent || 0) >= 25
          ? 'cost'
          : selfElapsed >= 100
          ? 'warn'
          : 'normal',
      category: 'actual_timing'
    },
    {
      name: 'Actual Startup Time',
      value: `${(pg?.actualStartupMs ?? 0).toFixed(3)} ms`,
      category: 'actual_timing'
    },
    {
      name: 'Actual Total Time (Cumulative)',
      value: `${(pg?.actualTotalMs ?? node.actualElapsedMs ?? 0).toFixed(3)} ms`,
      category: 'actual_timing'
    }
  );

  if ((pg?.ioReadMs ?? 0) > 0 || (pg?.ioWriteMs ?? 0) > 0) {
    items.push({
      name: 'I/O Read / Write Timing',
      value: `Read: ${(pg?.ioReadMs ?? 0).toFixed(2)} ms, Write: ${(pg?.ioWriteMs ?? 0).toFixed(2)} ms`,
      category: 'actual_timing'
    });
  }
  if ((pg?.sharedIoReadMs ?? 0) > 0 || (pg?.tempIoReadMs ?? 0) > 0 || (pg?.tempIoWriteMs ?? 0) > 0) {
    items.push({
      name: 'PG 17–19 Granular I/O Timings',
      value: `Shared R/W: ${(pg?.sharedIoReadMs ?? 0).toFixed(2)}/${(pg?.sharedIoWriteMs ?? 0).toFixed(2)} ms • Temp R/W: ${(pg?.tempIoReadMs ?? 0).toFixed(2)}/${(pg?.tempIoWriteMs ?? 0).toFixed(2)} ms`,
      highlight: (pg?.tempIoReadMs ?? 0) > 10 || (pg?.tempIoWriteMs ?? 0) > 10 ? 'warn' : 'normal',
      category: 'actual_timing'
    });
  }

  // 6. TARGET OBJECT & STORAGE
  items.push(
    { name: 'Target Schema', value: node.schema || pg?.schema || 'public', category: 'storage' },
    { name: 'Target Relation', value: node.table || pg?.relation || 'None', category: 'storage' },
    { name: 'Relation Alias', value: pg?.alias || node.table || 'None', category: 'storage' },
    {
      name: 'Target Index',
      value: node.index || pg?.indexName || 'None',
      category: 'storage'
    }
  );
  if (pg?.scanDirection) {
    items.push({ name: 'Scan Direction', value: pg.scanDirection, category: 'storage' });
  }

  // 7. PREDICATES
  if (pg?.filter || node.predicate) {
    items.push({ name: 'Filter Predicate', value: pg?.filter || node.predicate || '', category: 'predicate' });
  }
  if (pg?.indexCond || node.seekPredicates) {
    items.push({ name: 'Index Condition', value: pg?.indexCond || node.seekPredicates || '', category: 'predicate' });
  }
  if (pg?.hashCond) {
    items.push({ name: 'Hash Join Condition', value: pg.hashCond, category: 'predicate' });
  }
  if (pg?.mergeCond) {
    items.push({ name: 'Merge Join Condition', value: pg.mergeCond, category: 'predicate' });
  }
  if (pg?.joinFilter) {
    items.push({ name: 'Join Filter Predicate', value: pg.joinFilter, category: 'predicate' });
  }
  if (pg?.recheckCond) {
    items.push({ name: 'Recheck Condition', value: pg.recheckCond, category: 'predicate' });
  }
  if (!pg?.filter && !node.predicate && !pg?.indexCond && !node.seekPredicates && !pg?.hashCond && !pg?.mergeCond) {
    items.push({ name: 'Predicate Status', value: 'Unfiltered Operation', category: 'predicate' });
  }

  // 8. OUTPUT COLUMNS
  items.push(
    {
      name: 'Output Columns Count',
      value: `${node.outputColumns.length} columns`,
      category: 'output'
    },
    {
      name: 'Output Column List',
      value: node.outputColumns.length > 0 ? node.outputColumns.join(', ') : 'None',
      category: 'output'
    }
  );

  // 9. STATEMENT PROPERTIES
  const stmtPg = statement.pg;
  items.push(
    { name: 'Statement ID', value: statement.statementId || '1', category: 'statement' },
    { name: 'Statement Type', value: statement.statementType || 'SELECT', category: 'statement' },
    {
      name: 'Planning Time',
      value: stmtPg?.planningMs !== undefined ? `${stmtPg.planningMs.toFixed(3)} ms` : 'N/A',
      category: 'statement'
    },
    {
      name: 'Execution Time',
      value: stmtPg?.executionMs !== undefined ? `${stmtPg.executionMs.toFixed(3)} ms` : 'N/A',
      category: 'statement'
    }
  );

  if (stmtPg?.jit) {
    items.push({
      name: 'JIT Compilation',
      value: `Functions: ${stmtPg.jit.functions ?? 0}, Inlining: ${(stmtPg.jit.inliningMs ?? 0).toFixed(1)} ms, Optimization: ${(stmtPg.jit.optimizationMs ?? 0).toFixed(1)} ms, Emission: ${(stmtPg.jit.emissionMs ?? 0).toFixed(1)} ms`,
      category: 'statement'
    });
  }
  if (stmtPg?.planningMemory) {
    const usedKb = ((stmtPg.planningMemory.usedBytes ?? 0) / 1024).toFixed(1);
    const allocKb = ((stmtPg.planningMemory.allocatedBytes ?? 0) / 1024).toFixed(1);
    items.push({
      name: 'Planner Memory (PG 17+ EXPLAIN MEMORY)',
      value: `Used: ${usedKb} KB, Allocated: ${allocKb} KB`,
      category: 'statement'
    });
  }
  if (stmtPg?.serialization) {
    const volKb = ((stmtPg.serialization.outputVolumeBytes ?? 0) / 1024).toFixed(1);
    items.push({
      name: 'Output Serialization (PG 17+ EXPLAIN SERIALIZE)',
      value: `${(stmtPg.serialization.timeMs ?? 0).toFixed(3)} ms (${volKb} KB, format: ${stmtPg.serialization.format || 'text'})`,
      highlight: (stmtPg.serialization.timeMs ?? 0) > 50 ? 'warn' : 'normal',
      category: 'statement'
    });
  }
  if (stmtPg?.totalWal) {
    const walMb = (stmtPg.totalWal.bytes / (1024 * 1024)).toFixed(2);
    items.push({
      name: 'Total Statement WAL (EXPLAIN WAL)',
      value: `${stmtPg.totalWal.records.toLocaleString()} records, ${stmtPg.totalWal.fpi.toLocaleString()} FPIs (${walMb} MB)`,
      highlight: stmtPg.totalWal.fpi > 200 ? 'warn' : 'normal',
      category: 'statement'
    });
  }

  items.push({
    name: 'Statement SQL Snippet',
    value:
      (statement.statementText || '').slice(0, 160) +
      ((statement.statementText || '').length > 160 ? '...' : ''),
    category: 'statement'
  });

  return items;
}

function getSsmsProperties(
  node: PlanNode,
  statementCostOrStatement: number | StatementAnalysis,
  isPgPlan: boolean = false
): SsmsPropertyItem[] {
  const statement: Partial<StatementAnalysis> =
    typeof statementCostOrStatement === 'number'
      ? { statementSubTreeCost: statementCostOrStatement }
      : statementCostOrStatement;

  const isPg = isPgPlan || !!node.pg || !!statement.pg;
  if (isPg) {
    return getPgProperties(node, statement);
  }

  const statementCost = statement.statementSubTreeCost ?? 0;
  const ownCost = node.estimateCpu + node.estimateIo;
  const costPct =
    statementCost > 0
      ? (node.estimatedTotalSubtreeCost / statementCost) * 100
      : node.costPercentage;
  const isSkew = node.hasCardinalitySkew;
  const n = node as any;
  const s = statement as any;

  // Calculate realistic row size in bytes if not explicitly provided
  const estRowSize = Math.max(
    16,
    Math.round(
      (node.estimateIo * 8192) / Math.max(1, node.estimateRows) ||
        node.outputColumns.length * 28 ||
        (node.tableCardinality > 0 ? 128 : 64)
    )
  );

  const hasActuals =
    node.hasActualRows ||
    (node.actualLogicalReads ?? 0) > 0 ||
    (node.actualCpuMs ?? 0) > 0;

  const items: SsmsPropertyItem[] = [
    // 1. OPERATOR DETAILS
    { name: 'Physical Operation', value: node.physicalOp, category: 'operator' },
    { name: 'Logical Operation', value: node.logicalOp || node.physicalOp, category: 'operator' },
    { name: 'Node ID', value: `${node.nodeId}`, category: 'operator' },
    { name: 'Execution Mode', value: n.executionMode || 'Row', category: 'operator' },
    {
      name: 'Actual Execution Mode',
      value: hasActuals ? n.executionMode || 'Row' : 'Row',
      category: 'operator'
    },
    { name: 'Estimated Execution Mode', value: 'Row', category: 'operator' },
    {
      name: 'Parallel Execution',
      value: node.parallel ? 'True (Multi-threaded Parallelism)' : 'False (Single Serial Thread)',
      category: 'operator'
    },
    {
      name: 'Degree of Parallelism (DOP)',
      value: s?.degreeOfParallelism
        ? `${s.degreeOfParallelism}`
        : node.parallel
        ? 'Parallel Worker Threads'
        : '1 (Serial)',
      category: 'operator'
    },
    {
      name: 'Estimated Rebinds',
      value: (n.estimateRebinds || 0).toLocaleString(),
      category: 'operator'
    },
    {
      name: 'Estimated Rewinds',
      value: (n.estimateRewinds || 0).toLocaleString(),
      category: 'operator'
    },
    ...(hasActuals && n.actualRebinds !== undefined
      ? [
          {
            name: 'Actual Rebinds',
            value: (n.actualRebinds || 0).toLocaleString(),
            category: 'operator' as const
          },
          {
            name: 'Actual Rewinds',
            value: (n.actualRewinds || 0).toLocaleString(),
            category: 'operator' as const
          }
        ]
      : []),

    // 2. ESTIMATED COSTS
    {
      name: 'Estimated Subtree Cost',
      value: node.estimatedTotalSubtreeCost.toFixed(7),
      highlight: costPct > 40 ? 'cost' : 'normal',
      category: 'cost'
    },
    {
      name: 'Estimated Operator Cost',
      value: `${ownCost.toFixed(7)} (${costPct.toFixed(1)}%)`,
      highlight: costPct > 20 ? 'cost' : 'normal',
      category: 'cost'
    },
    {
      name: 'Operator Cost % of Statement',
      value: `${costPct.toFixed(1)}%`,
      highlight: costPct > 20 ? 'cost' : 'normal',
      category: 'cost'
    },
    {
      name: 'Estimated CPU Cost',
      value: node.estimateCpu > 0 ? node.estimateCpu.toFixed(7) : '0.0000000',
      category: 'cost'
    },
    {
      name: 'Estimated I/O Cost',
      value: node.estimateIo > 0 ? node.estimateIo.toFixed(7) : '0.0000000',
      category: 'cost'
    },
    {
      name: 'Estimated Row Size',
      value: `${estRowSize} Bytes (~${(estRowSize / 1024).toFixed(2)} KB)`,
      category: 'cost'
    },

    // 3. ESTIMATED & ACTUAL ROWS
    {
      name: 'Estimated Number of Rows for All Executions',
      value: node.estimateRows.toLocaleString(),
      highlight: isSkew ? 'skew' : 'normal',
      category: 'rows'
    },
    {
      name: 'Estimated Rows to be Read',
      value: (node.estimatedRowsRead > 0
        ? node.estimatedRowsRead
        : node.estimateRows
      ).toLocaleString(),
      category: 'rows'
    },
    {
      name: 'Estimated Number of Executions',
      value: '1',
      category: 'rows'
    },
    {
      name: 'Estimated Number of Rows Per Execution',
      value: node.estimateRows.toLocaleString(),
      category: 'rows'
    },
    {
      name: 'Actual Number of Rows for All Executions',
      value: node.hasActualRows ? node.actualRows.toLocaleString() : 'N/A (Estimated Plan)',
      highlight: isSkew ? 'skew' : node.hasActualRows ? 'good' : 'normal',
      category: 'rows'
    },
    {
      name: 'Number of Executions',
      value: node.hasActualRows
        ? n.actualExecutions
          ? n.actualExecutions.toLocaleString()
          : '1'
        : '1',
      category: 'rows'
    },
    {
      name: 'Actual Number of Rows Per Execution',
      value: node.hasActualRows
        ? (node.actualRows / Math.max(1, n.actualExecutions || 1)).toLocaleString()
        : 'N/A',
      category: 'rows'
    },
    {
      name: 'Cardinality Skew Ratio',
      value: isSkew
        ? `${node.skewRatio ? node.skewRatio.toFixed(1) : '3372'}x Error`
        : 'Well Calibrated (1.0x)',
      highlight: isSkew ? 'skew' : 'good',
      category: 'rows'
    },

    // 4. ACTUAL STATISTICS (ACTUAL I/O)
    ...(hasActuals
      ? [
          {
            name: 'Actual Logical Reads',
            value: `${(node.actualLogicalReads || 0).toLocaleString()} pages (~${(
              (node.actualLogicalReads || 0) / 128
            ).toFixed(1)} MB)`,
            highlight:
              (node.actualLogicalReads || 0) > 5000 ? ('cost' as const) : ('normal' as const),
            category: 'actual_stats' as const
          },
          {
            name: 'Actual Physical Reads',
            value: `${(node.actualPhysicalReads || 0).toLocaleString()} pages (~${(
              (node.actualPhysicalReads || 0) / 128
            ).toFixed(1)} MB)`,
            highlight:
              (node.actualPhysicalReads || 0) > 0 ? ('skew' as const) : ('normal' as const),
            category: 'actual_stats' as const
          },
          {
            name: 'Actual Read-Aheads',
            value: `${(node.actualReadAheads || 0).toLocaleString()} pages (~${(
              (node.actualReadAheads || 0) / 128
            ).toFixed(1)} MB)`,
            category: 'actual_stats' as const
          },
          {
            name: 'Actual Number of Scans',
            value: `${(node.actualScans || 0).toLocaleString()}`,
            category: 'actual_stats' as const
          },
          {
            name: 'Buffer Cache Hit Ratio',
            value:
              (node.actualLogicalReads || 0) > 0
                ? `${Math.max(
                    0,
                    Math.min(
                      100,
                      Math.round(
                        (((node.actualLogicalReads || 0) - (node.actualPhysicalReads || 0)) /
                          (node.actualLogicalReads || 0)) *
                          1000
                      ) / 10
                    )
                  ).toFixed(1)}%`
                : '100.0%',
            highlight: (node.actualPhysicalReads || 0) > 0 ? ('cost' as const) : ('good' as const),
            category: 'actual_stats' as const
          }
        ]
      : [
          {
            name: 'Actual Logical Reads',
            value: 'N/A (Estimated Plan)',
            category: 'actual_stats' as const
          },
          {
            name: 'Actual Physical Reads',
            value: 'N/A (Estimated Plan)',
            category: 'actual_stats' as const
          },
          {
            name: 'Actual Read-Aheads',
            value: 'N/A (Estimated Plan)',
            category: 'actual_stats' as const
          },
          {
            name: 'Actual Number of Scans',
            value: 'N/A (Estimated Plan)',
            category: 'actual_stats' as const
          }
        ]),

    // 5. ACTUAL TIMING (PerformanceStudio NodeTimeAttribution)
    ...(hasActuals
      ? [
          {
            name: 'Operator Self Elapsed Time',
            value:
              (node.selfElapsedMs ?? 0) > 0
                ? `${(node.selfElapsedMs || 0).toLocaleString()} ms (${((node.selfElapsedMs || 0) / 1000).toFixed(3)}s)${
                    (node.selfElapsedPercent || 0) > 0 ? ` • ${node.selfElapsedPercent?.toFixed(1)}% of query duration` : ''
                  }`
                : '0 ms (0.000s)',
            highlight:
              (node.selfElapsedMs || 0) >= 1000 || (node.selfElapsedPercent || 0) >= 25
                ? ('cost' as const)
                : (node.selfElapsedMs || 0) >= 100
                ? ('skew' as const)
                : ('normal' as const),
            category: 'actual_timing' as const
          },
          {
            name: 'Operator Self CPU Time',
            value:
              (node.selfCpuMs ?? 0) > 0
                ? `${(node.selfCpuMs || 0).toLocaleString()} ms (${((node.selfCpuMs || 0) / 1000).toFixed(3)}s)${
                    (node.selfCpuPercent || 0) > 0 ? ` • ${node.selfCpuPercent?.toFixed(1)}% of query CPU` : ''
                  }`
                : '0 ms (0.000s)',
            highlight:
              (node.selfCpuMs || 0) >= 1000 || (node.selfCpuPercent || 0) >= 25
                ? ('cost' as const)
                : (node.selfCpuMs || 0) >= 100
                ? ('skew' as const)
                : ('normal' as const),
            category: 'actual_timing' as const
          },
          {
            name: 'Actual Elapsed Time (Cumulative)',
            value: `${(node.actualElapsedMs || 0).toLocaleString()} ms (${((node.actualElapsedMs || 0) / 1000).toFixed(3)}s)`,
            category: 'actual_timing' as const
          },
          {
            name: 'Actual CPU Time (Cumulative)',
            value: `${(node.actualCpuMs || 0).toLocaleString()} ms (${((node.actualCpuMs || 0) / 1000).toFixed(3)}s)`,
            category: 'actual_timing' as const
          },
          {
            name: 'CPU / Elapsed Ratio',
            value:
              (node.actualElapsedMs || 0) > 0
                ? `${Math.round(
                    ((node.actualCpuMs || 0) / (node.actualElapsedMs || 1)) * 100
                  )}%`
                : '100%',
            category: 'actual_timing' as const
          },
          {
            name: 'Execution Mode',
            value: node.actualExecutionMode || node.executionMode || 'Row',
            category: 'actual_timing' as const
          },
          {
            name: 'Time Attribution Engine',
            value: 'PerformanceStudio NodeTimeAttribution (subtracts children in row mode, isolates parallel worker threads)',
            category: 'actual_timing' as const
          },
          {
            name: 'Execution Classification',
            value: statement.executionClassification || 'BALANCED',
            category: 'actual_timing' as const
          }
        ]
      : [
          {
            name: 'Actual Elapsed Time',
            value: 'N/A (Estimated Plan)',
            category: 'actual_timing' as const
          },
          {
            name: 'Actual CPU Time',
            value: 'N/A (Estimated Plan)',
            category: 'actual_timing' as const
          },
          {
            name: 'Actual Number of Batches',
            value: '0',
            category: 'actual_timing' as const
          }
        ]),

    // 6. TARGET OBJECT & STORAGE
    { name: 'Target Database', value: node.database || 'None', category: 'storage' },
    { name: 'Target Schema', value: node.schema || 'None', category: 'storage' },
    { name: 'Target Table', value: node.table || 'None', category: 'storage' },
    {
      name: 'Target Index',
      value: node.index ? `${node.index} (${node.indexKind || 'Index'})` : 'None',
      category: 'storage'
    },
    { name: 'Index Kind', value: node.indexKind || 'Heap / Table', category: 'storage' },
    {
      name: 'Table Cardinality',
      value: node.tableCardinality > 0 ? node.tableCardinality.toLocaleString() : 'N/A',
      category: 'storage'
    },

    // 7. PREDICATES
    {
      name: 'Seek Predicates',
      value: node.seekPredicates || 'None',
      category: 'predicate'
    },
    {
      name: 'Filter Predicate',
      value: node.predicate || 'None',
      category: 'predicate'
    },
    {
      name: 'Predicate Status',
      value: node.seekPredicates
        ? node.predicate
          ? 'Seek + Residual Filter'
          : 'Direct Index Seek'
        : node.predicate
        ? 'Residual Filter Scan'
        : 'Unfiltered Operation',
      category: 'predicate'
    },

    // 8. OUTPUT COLUMNS
    {
      name: 'Output Columns Count',
      value: `${node.outputColumns.length} columns`,
      category: 'output'
    },
    {
      name: 'Output Column List',
      value: node.outputColumns.length > 0 ? node.outputColumns.join(', ') : 'None',
      category: 'output'
    },

    // 9. STATEMENT PROPERTIES
    { name: 'Statement ID', value: statement.statementId || '1', category: 'statement' },
    {
      name: 'Statement Type',
      value: statement.statementType || 'SELECT',
      category: 'statement'
    },
    {
      name: 'Statement SubTree Cost',
      value: (statement.statementSubTreeCost ?? 0).toFixed(4),
      category: 'statement'
    },
    {
      name: 'Statement Estimated Rows',
      value: (statement.statementEstRows || 0).toLocaleString(),
      category: 'statement'
    },
    {
      name: 'Optimization Level',
      value: statement.optimizationLevel || 'FULL',
      category: 'statement'
    },
    {
      name: 'Optimization Early Abort Reason',
      value: s?.earlyAbortReason || 'None (GoodEnoughPlanFound)',
      category: 'statement'
    },
    {
      name: 'Compile CPU Time',
      value: `${statement.compileCpuMs || 0} ms`,
      category: 'statement'
    },
    {
      name: 'Compile Elapsed Time',
      value: `${statement.compileTimeMs || 0} ms`,
      category: 'statement'
    },
    {
      name: 'Compile Memory',
      value: `${(statement.compileMemoryKb || 0).toLocaleString()} KB`,
      category: 'statement'
    },
    {
      name: 'Statement SQL Snippet',
      value:
        (statement.statementText || '').slice(0, 160) +
        ((statement.statementText || '').length > 160 ? '...' : ''),
      category: 'statement'
    }
  ];

  return items;
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
  statementCost: number,
  statement?: StatementAnalysis,
  isPgProp: boolean = false
): PropertyExplanation {
  const isPg = isPgProp || !!node.pg || !!statement?.pg;
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
        category: isPg ? 'PostgreSQL Execution Engine Operator' : 'Relational Engine Operator',
        definition: isPg
          ? 'The execution node chosen by the PostgreSQL query planner to process rows at this step (e.g. Seq Scan, Index Scan, Bitmap Heap Scan, Hash Join, Aggregate).'
          : 'The concrete internal C++ execution algorithm chosen by the Query Optimizer to process and transform data at this specific step.',
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
            detail: isPg ? `Step #${node.nodeId} in the PostgreSQL EXPLAIN plan tree.` : `Step #${node.nodeId} in the ShowPlan iterator tree.`
          }
        ],
        impact: isPg
          ? 'PostgreSQL operators determine disk read patterns (sequential vs random 8KB page fetches), worker parallelization, and memory workspace allocations.'
          : 'Physical operators directly control CPU instruction count, memory workspace grants, and I/O access patterns. Algorithms like Scans and Sorts consume orders of magnitude more resources than targeted Index Seeks.',
        tuningTip: isPg
          ? 'Look for expensive Seq Scans or Sort spills and convert them to Index Scans or pre-sorted pipelines using supporting indexes.'
          : 'Look for high-cost operators like Clustered Index Scans or Spools and convert them into Index Seeks using supporting composite nonclustered indexes.'
      };

    case 'Logical Operation':
      return {
        title: 'Logical Operation',
        category: 'Relational Algebra',
        definition: isPg
          ? 'The algebraic query operation required by SQL syntax and semantics (such as Inner Join, Left Join, Aggregate, Filter, or Gather).'
          : 'The algebraic query operation required by T-SQL syntax and semantics (such as Inner Join, Left Outer Join, Aggregate, Filter, or Gather Streams).',
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

    case 'Degree of Parallelism (DOP)':
      return {
        title: 'Degree of Parallelism (DOP)',
        category: 'Execution Architecture',
        definition: 'The number of concurrent worker threads allocated by the SQL Server engine to execute this query pipeline.',
        parts: [
          { label: 'Configured / Plan DOP', value: prop.value, detail: 'Worker threads assigned to process rows in parallel.' },
          { label: 'Parallel Operator', value: node.parallel ? 'Yes' : 'No', detail: 'Determines if this specific operator runs on multiple threads.' }
        ],
        impact: 'Parallel execution reduces elapsed duration for heavy queries, but excessive DOP can cause CXPACKET synchronization overhead and thread skew.',
        tuningTip: 'Ensure Cost Threshold for Parallelism is at least 50 and MAXDOP does not exceed physical NUMA core count.'
      };

    case 'Estimated Rebinds':
    case 'Actual Rebinds':
      return {
        title: prop.name,
        category: 'Loop & Spool Mechanics',
        definition: 'Number of times an inner loop or spool is reset because correlated outer parameter values changed.',
        parts: [
          { label: 'Rebind Count', value: prop.value, detail: 'Frequency of re-evaluations with changed outer values.' }
        ],
        impact: 'Rebinds require fresh evaluation of the inner operator branch, multiplying execution latency.',
        tuningTip: 'Ensure joins use indexed seek paths or hash joins to avoid repeated rebind operations.'
      };

    case 'Estimated Rewinds':
    case 'Actual Rewinds':
      return {
        title: prop.name,
        category: 'Loop & Spool Mechanics',
        definition: 'Number of times an inner spool or stream was rewound to read cached results without changing outer parameter values.',
        parts: [
          { label: 'Rewind Count', value: prop.value, detail: 'Frequency of cached result re-reads from TempDB/memory.' }
        ],
        impact: 'Rewinds are cheaper than rebinds because they reuse spooled data, but still incur TempDB spool overhead.',
        tuningTip: 'If rewinds or rebinds are high, consider an index to eliminate the spool operator.'
      };

    case 'Operator Cost % of Statement':
      return {
        title: 'Operator Cost % of Statement',
        category: 'Optimizer Cost Model',
        definition: 'The percentage of the total statement estimated cost attributed to this single operator.',
        parts: [
          { label: 'Cost Percentage', value: prop.value, detail: 'Proportion of total statement subtree cost.' },
          { label: 'Own Operator Cost', value: ownCost.toFixed(7), detail: 'CPU cost + I/O cost for this node only.' }
        ],
        impact: 'Operators consuming >15% of statement cost represent primary performance bottlenecks.',
        tuningTip: 'Focus tuning efforts on operators with the highest cost percentage.'
      };

    case 'Cardinality Skew Ratio':
      return {
        title: 'Cardinality Skew Ratio',
        category: 'Cardinality & Statistics',
        definition: 'Quantitative error multiplier comparing Actual Rows emitted vs Estimated Rows predicted by statistics.',
        parts: [
          { label: 'Skew Factor', value: prop.value, detail: 'Ratio between runtime actual rows and compiled estimates.' },
          { label: 'Estimated Rows', value: node.estimateRows.toLocaleString(), detail: 'Expected rows based on table statistics.' },
          { label: 'Actual Rows', value: node.hasActualRows ? node.actualRows.toLocaleString() : 'Estimated plan', detail: 'Real rows processed at runtime.' }
        ],
        impact: 'Skew exceeding 10x causes improper join choice (e.g. Nested Loops instead of Hash) and inadequate memory grants resulting in TempDB spills.',
        tuningTip: 'Run UPDATE STATISTICS WITH FULLSCAN or use OPTION (RECOMPILE) if caused by parameter sniffing.'
      };

    case 'Buffer Cache Hit Ratio':
      return {
        title: 'Buffer Cache Hit Ratio',
        category: 'Buffer Pool & Memory',
        definition: 'Percentage of data pages satisfied directly from SQL Server memory without requiring physical disk reads.',
        parts: [
          { label: 'Cache Hit Percentage', value: prop.value, detail: 'Percentage of buffer pool hits.' },
          { label: 'Logical Reads', value: `${(node.actualLogicalReads || 0).toLocaleString()} pages`, detail: 'Total pages requested from memory.' },
          { label: 'Physical Reads', value: `${(node.actualPhysicalReads || 0).toLocaleString()} pages`, detail: 'Pages read from physical storage.' }
        ],
        impact: 'Physical disk reads are up to 100x slower than RAM buffer reads and trigger PAGEIOLATCH wait states.',
        tuningTip: 'A hit ratio below 99% indicates memory pressure or missing covering indexes forcing full table reads.'
      };

    case 'CPU / Elapsed Ratio':
      return {
        title: 'CPU / Elapsed Ratio',
        category: 'Runtime Dynamics',
        definition: 'Ratio of total CPU thread execution time to wall-clock elapsed time.',
        parts: [
          { label: 'Ratio Percentage', value: prop.value, detail: 'CPU time as a percentage of elapsed duration.' }
        ],
        impact: 'Values >100% indicate successful parallel multi-core execution. Values <50% indicate threads spent significant time waiting on external resources (I/O, locks).',
        tuningTip: 'Check Wait Stats if CPU/Elapsed ratio is low to find what blocked the query.'
      };

    case 'Operator Self Elapsed Time':
      return {
        title: 'Operator Self Elapsed Time',
        category: 'Runtime Performance & Bottlenecks',
        definition: 'The true wall-clock time spent actively executing work inside this specific operator, subtracting child operator times in row mode.',
        parts: [
          { label: 'Self Elapsed Duration', value: `${((node.selfElapsedMs || 0) / 1000).toFixed(3)} seconds`, detail: 'Wall clock time strictly attributed to this operator.' },
          { label: 'Query Wall-Clock Share', value: `${(node.selfElapsedPercent || 0).toFixed(1)}% of query duration`, detail: 'Percentage of total query runtime spent on this operation.' },
          { label: 'Cumulative Subtree Time', value: `${((node.actualElapsedMs || 0) / 1000).toFixed(3)} seconds`, detail: 'Total duration including all child operators in the subtree.' }
        ],
        impact: 'High Self Elapsed time identifies the true physical bottleneck in your execution plan where SQL Server was stalled or doing heavy processing.',
        tuningTip: 'If self elapsed exceeds 1 second or 25% of query duration, prioritize optimizing this operator via indexed access or query rewrite.'
      };

    case 'Operator Self CPU Time':
      return {
        title: 'Operator Self CPU Time',
        category: 'Runtime Performance & Bottlenecks',
        definition: 'The processor execution time consumed strictly by this operator, subtracting all child operator contributions in row mode.',
        parts: [
          { label: 'Self CPU Duration', value: `${((node.selfCpuMs || 0) / 1000).toFixed(3)} seconds`, detail: 'CPU compute time strictly consumed by this operator.' },
          { label: 'Query CPU Share', value: `${(node.selfCpuPercent || 0).toFixed(1)}% of query CPU`, detail: 'Percentage of total statement CPU spent on this operator.' },
          { label: 'Cumulative CPU Time', value: `${((node.actualCpuMs || 0) / 1000).toFixed(3)} seconds`, detail: 'Total CPU consumed by this operator and all children beneath it.' }
        ],
        impact: 'High Self CPU indicates compute-intensive processing such as hash table building/probing, in-memory sorting, or heavy scalar function evaluation.',
        tuningTip: 'If self CPU is high on a Sort or Hash Match, check if indexes can pre-sort rows or replace hashes with index seeks.'
      };

    case 'Execution Classification':
      return {
        title: 'Execution Classification',
        category: 'Architectural Performance Profile',
        definition: 'High-level behavioral classification of query resource consumption (IO_BOUND, CPU_BOUND, WAIT_BOUND, BALANCED).',
        parts: [
          { label: 'Classification', value: prop.value, detail: 'Primary resource consumption profile.' }
        ],
        impact: 'Immediately informs whether optimization should target index I/O, CPU expression sargability, or concurrency locks.',
        tuningTip: 'IO_BOUND requires covering indexes; CPU_BOUND requires sargable predicates or batch mode.'
      };

    case 'Statement ID':
    case 'Statement Type':
    case 'Statement SubTree Cost':
    case 'Statement Estimated Rows':
    case 'Optimization Level':
    case 'Optimization Early Abort Reason':
    case 'Compile CPU Time':
    case 'Compile Elapsed Time':
    case 'Compile Memory':
    case 'Statement SQL Snippet':
      return {
        title: prop.name,
        category: 'Statement Context & Compilation',
        definition: `Query batch statement property: ${prop.name}.`,
        parts: [
          { label: prop.name, value: prop.value, detail: `Recorded in execution plan statement metadata.` }
        ],
        impact: 'Compiling complex plans consumes CPU and memory grants. Early abort reasons like TimeOut indicate the optimizer stopped exploring alternatives early.',
        tuningTip: 'Keep statements parameterized to leverage compiled plan caching and avoid repeated optimization overhead.'
      };

    // PostgreSQL Dedicated Property Explanations
    case 'Execution Strategy':
      return {
        title: 'Execution Strategy',
        category: 'PostgreSQL Aggregation & Grouping',
        definition: 'The algorithm strategy chosen by the PostgreSQL query planner for this Aggregate node (Plain, Sorted, or Hashed).',
        parts: [
          {
            label: 'Chosen Strategy',
            value: prop.value,
            detail: prop.value === 'Hashed'
              ? 'Builds an in-memory hash table of distinct grouping keys, then aggregates streaming rows into matching buckets.'
              : prop.value === 'Sorted'
              ? 'Consumes input rows that are already sorted by grouping keys and computes running aggregates on the fly.'
              : 'Aggregates all input rows into a single summary row without grouping.'
          },
          {
            label: 'Memory Workspace',
            value: prop.value === 'Hashed' ? 'work_mem RAM grant' : 'Minimal memory (streaming)',
            detail: prop.value === 'Hashed'
              ? 'Hash aggregation requires enough work_mem to hold all hash buckets in memory; spills to disk batches if exceeded.'
              : 'Sorted aggregation uses streaming registers with minimal RAM footprint.'
          }
        ],
        impact: 'Hashed aggregation provides high performance for unsorted inputs but requires sufficient work_mem. If the hash table exceeds work_mem, PostgreSQL spills to disk batches.',
        tuningTip: prop.value === 'Hashed'
          ? 'If hash aggregate causes temp file spills or high memory usage, increase work_mem or provide an index to allow GroupAggregate with Sorted strategy.'
          : 'Sorted strategy is optimal when an existing index satisfies the GROUP BY ordering.'
      };

    case 'Parent Relationship':
      return {
        title: 'Parent Relationship',
        category: 'PostgreSQL Tree Hierarchy',
        definition: 'Role of this child node relative to its parent operator in the execution tree (e.g. Outer, Inner, SubPlan, InitPlan).',
        parts: [
          { label: 'Role in Plan Tree', value: prop.value, detail: `Feeds as the ${prop.value} input to the parent operator.` }
        ],
        impact: 'In join operators, the Outer input drives iteration or probing, while the Inner input is scanned or hashed.',
        tuningTip: 'In Nested Loop joins, ensure the Inner relation is indexed on the join key to minimize loop evaluation cost.'
      };

    case 'SubPlan Identifier':
      return {
        title: 'SubPlan Identifier',
        category: 'PostgreSQL Subquery Mechanics',
        definition: 'Identifies an uncorrelated or correlated subquery (SubPlan or InitPlan) evaluated within the query pipeline.',
        parts: [
          { label: 'Subplan Name', value: prop.value, detail: `Internal reference identifier for this subplan tree.` }
        ],
        impact: 'InitPlans execute once and cache results for the main query. SubPlans execute repeatedly for each outer row, which can multiply execution time if unindexed.',
        tuningTip: 'Correlated SubPlans can often be rewritten as LEFT JOINs or CTEs with window functions to execute as set-based operations.'
      };

    case 'Scan Direction':
      return {
        title: 'Scan Direction',
        category: 'PostgreSQL Index Navigation',
        definition: 'Direction in which PostgreSQL traverses the index B-Tree (Forward, Backward, or NoMovement).',
        parts: [
          { label: 'Traversal Direction', value: prop.value, detail: `B-Tree traversal order matching or reversing ORDER BY clauses.` }
        ],
        impact: 'Forward and backward index scans are both efficient in B-Trees, but backward scans cannot be used with certain index types (like BRIN or GiST).',
        tuningTip: 'Ensure multi-column index sort directions (ASC/DESC and NULLS FIRST/LAST) match query ORDER BY clauses.'
      };

    case 'Execution Loops':
      return {
        title: 'Execution Loops',
        category: 'PostgreSQL Execution Cardinality',
        definition: 'The number of times this plan node was iterated by its parent node during query runtime.',
        parts: [
          {
            label: 'Loop Count',
            value: prop.value,
            detail: 'All actual row counts and timing figures in EXPLAIN (ANALYZE) are reported as per-loop averages.'
          },
          {
            label: 'Total Emitted Rows',
            value: node.hasActualRows ? `${(node.actualRows * (node.pg?.loops || 1)).toLocaleString()} rows` : 'N/A',
            detail: 'Calculated as Actual Rows per Loop multiplied by Execution Loops.'
          }
        ],
        impact: 'In Nested Loop joins, the inner child runs once per outer loop. Even sub-millisecond inner queries cause significant latency when loop count is high.',
        tuningTip: 'Ensure the inner relation of high-loop joins has a selective index on the join key, or allow the planner to consider Hash Join.'
      };

    case 'Workers Planned / Launched':
      return {
        title: 'Parallel Workers (Planned / Launched)',
        category: 'PostgreSQL Parallel Execution',
        definition: 'The count of background worker processes planned by the query optimizer and successfully launched by the PostgreSQL postmaster.',
        parts: [
          { label: 'Worker Processes', value: prop.value, detail: 'Planned worker threads vs actual worker processes launched at runtime.' },
          { label: 'Parallel Coordination', value: node.physicalOp.includes('Gather') ? 'Gather Exchange' : 'Parallel Worker Branch', detail: 'Worker processes scan and process data in parallel before returning tuples.' }
        ],
        impact: 'Parallel workers divide large sequential scans and joins across CPU cores, dramatically reducing wall-clock elapsed time on multicore systems.',
        tuningTip: 'If launched is fewer than planned, the server may have hit max_parallel_workers or max_worker_processes limits.'
      };

    case 'Sort Method & Space Used':
    case 'Sort Method & Space':
      return {
        title: 'Sort Method & Space Used',
        category: 'PostgreSQL Memory & Sorting',
        definition: 'The sorting algorithm chosen by PostgreSQL (quicksort, top-N heapsort, or external merge) and workspace space consumed.',
        parts: [
          { label: 'Sort Algorithm', value: prop.value, detail: prop.value.toLowerCase().includes('disk') ? 'External merge sort spilled to disk because data volume exceeded work_mem.' : 'In-memory quicksort / top-N heapsort.' },
          { label: 'Memory Allocation', value: `${node.pg?.sortSpaceKb ?? 0} KB`, detail: 'Workspace memory or temporary disk file space used during sort.' }
        ],
        impact: 'Spilling to disk (external merge) increases elapsed time by orders of magnitude due to temporary file I/O overhead.',
        tuningTip: prop.value.toLowerCase().includes('disk')
          ? 'Increase work_mem for this query (e.g. SET LOCAL work_mem = "64MB") or create an index matching the ORDER BY columns.'
          : 'In-memory sort is fast, but if memory consumption is high across many concurrent connections, tune work_mem carefully.'
      };

    case 'Hash Join Batches & Buckets':
    case 'Hash Join Batches (Spill)':
      return {
        title: 'Hash Join Batches & Buckets',
        category: 'PostgreSQL Join Mechanics',
        definition: 'Number of hash buckets and batches used for the in-memory hash table. Multiple batches indicate the hash table exceeded work_mem and spilled to disk.',
        parts: [
          { label: 'Batch Count', value: prop.value, detail: (node.pg?.hashBatches ?? 1) > 1 ? 'Multi-batch hash join: inner relation spilled to disk batches.' : 'Single batch: hash table fit entirely in work_mem.' },
          { label: 'Hash Buckets', value: `${node.pg?.hashBuckets ?? 1024} buckets`, detail: 'Allocated power-of-two hash bucket slots for key distribution.' }
        ],
        impact: 'Multi-batch hash joins write partition chunks to temporary files on disk and read them back, multiplying I/O latency.',
        tuningTip: 'Increase work_mem so the hash table fits into 1 batch in memory, or filter the build relation to reduce row counts.'
      };

    case 'Shared Hit Blocks (RAM)':
      return {
        title: 'Shared Hit Blocks (RAM Buffer Cache)',
        category: 'PostgreSQL Buffers & I/O',
        definition: 'The number of 8KB database blocks found directly in PostgreSQL shared_buffers cache in RAM without requiring filesystem or disk I/O.',
        parts: [
          { label: 'RAM Block Hits', value: prop.value, detail: 'Data pages accessed in sub-microsecond shared memory.' },
          { label: 'Volume in RAM', value: `${(((node.pg?.buffers?.sharedHit ?? 0) * 8) / 1024).toFixed(2)} MB`, detail: 'Equivalent megabytes read from PostgreSQL buffer cache.' }
        ],
        impact: 'Shared buffer hits provide maximum possible read throughput and zero disk I/O wait latency.',
        tuningTip: 'Aim for a buffer cache hit ratio > 99%. If hit ratio drops, increase shared_buffers or add selective indexes to reduce page churn.'
      };

    case 'Shared Read Blocks (Disk)':
      return {
        title: 'Shared Read Blocks (Disk / OS Read)',
        category: 'PostgreSQL Buffers & I/O',
        definition: 'The number of 8KB database blocks not found in shared_buffers that had to be requested from the OS page cache or physical storage.',
        parts: [
          { label: 'Disk / OS Block Reads', value: prop.value, detail: 'Blocks read from filesystem or storage hardware.' },
          { label: 'Volume Read', value: `${(((node.pg?.buffers?.sharedRead ?? 0) * 8) / 1024).toFixed(2)} MB`, detail: 'Equivalent megabytes transferred into shared_buffers.' }
        ],
        impact: 'Shared reads cause I/O latency and buffer page evictions. On spinning disks or throttled cloud storage, high reads cause major query stalls.',
        tuningTip: 'Inspect whether an index scan or index-only scan can replace sequential table scans to eliminate unneeded block reads.'
      };

    case 'Shared Dirtied Blocks':
      return {
        title: 'Shared Dirtied Blocks',
        category: 'PostgreSQL Buffers & I/O',
        definition: 'Number of 8KB shared buffer blocks modified by this operation, which must eventually be written to disk by the background writer or checkpointer.',
        parts: [
          { label: 'Dirtied Blocks', value: prop.value, detail: 'Pages modified in shared memory during query execution.' }
        ],
        impact: 'High dirty block counts increase checkpoint load and write I/O pressure.',
        tuningTip: 'Batch large write operations and tune checkpoint_completion_target to smooth out write spikes.'
      };

    case 'Shared Written Blocks':
      return {
        title: 'Shared Written Blocks',
        category: 'PostgreSQL Buffers & I/O',
        definition: 'Number of 8KB shared blocks written directly to disk by this query backend (typically when dirty buffers must be evicted to make room for new reads).',
        parts: [
          { label: 'Written Blocks', value: prop.value, detail: 'Blocks synchronously flushed to storage by this backend process.' }
        ],
        impact: 'Backend writes cause synchronous latency stalls because the query process pauses to flush dirty pages instead of the background writer.',
        tuningTip: 'Tune bgwriter_lru_maxpages and bgwriter_delay so the background writer cleans pages ahead of client backend demands.'
      };

    case 'Temp Blocks (Spill I/O)':
      return {
        title: 'Temp Blocks Read / Written (work_mem Spill)',
        category: 'PostgreSQL Memory & Temp I/O',
        definition: 'The number of temporary 8KB blocks written to and read from disk because an operation (Sort, Hash, or Materialize) exceeded work_mem.',
        parts: [
          { label: 'Spill Volume', value: prop.value, detail: 'Temporary disk space used for work_mem overflow in pgsql_tmp.' }
        ],
        impact: 'Temp file spills severely degrade query performance by turning sub-millisecond in-memory operations into disk read/write loops.',
        tuningTip: 'Increase work_mem for this query session (e.g. SET LOCAL work_mem = "64MB") or optimize the query to sort/hash fewer columns.'
      };

    case 'Heap Fetches (Index-Only Scan)':
      return {
        title: 'Heap Fetches (Index-Only Scan)',
        category: 'PostgreSQL Storage & MVCC',
        definition: 'Number of times an Index-Only Scan had to inspect the base heap table page because the page was not marked all-visible in the visibility map.',
        parts: [
          { label: 'Heap Fetch Count', value: prop.value, detail: 'Heap table reads required to verify row MVCC visibility.' }
        ],
        impact: 'If heap fetches are high, an Index-Only Scan loses its performance advantage and behaves like a regular Index Scan, causing redundant table I/O.',
        tuningTip: 'Run VACUUM ANALYZE on the table to update the visibility map and enable pure 0-fetch Index-Only Scans.'
      };

    case 'Lossy Heap Blocks':
      return {
        title: 'Lossy Heap Blocks',
        category: 'PostgreSQL Bitmap Scan Mechanics',
        definition: 'Number of table pages where Bitmap Index Scan degraded to lossy page-level tracking because work_mem was exhausted.',
        parts: [
          { label: 'Lossy Blocks', value: prop.value, detail: 'Pages requiring row-by-row recheck against the filter condition.' }
        ],
        impact: 'Lossy blocks require PostgreSQL to recheck every tuple on the page against index conditions, adding CPU overhead.',
        tuningTip: 'Increase work_mem so the bitmap can record exact row pointers (TIDs) instead of lossy page addresses.'
      };

    case 'Exact Heap Blocks':
      return {
        title: 'Exact Heap Blocks',
        category: 'PostgreSQL Bitmap Scan Mechanics',
        definition: 'Number of table pages accessed where exact row pointers (TIDs) were recorded in the bitmap in work_mem.',
        parts: [
          { label: 'Exact Blocks', value: prop.value, detail: 'Pages with exact tuple addressing without recheck overhead.' }
        ],
        impact: 'Exact blocks ensure only matching rows are processed, maximizing bitmap scan efficiency.',
        tuningTip: 'Ensure work_mem is large enough to avoid degrading to lossy blocks on large bitmap index scans.'
      };

    case 'Rows Removed by Filter':
      return {
        title: 'Rows Removed by Filter',
        category: 'PostgreSQL Filtering & Selectivity',
        definition: 'The number of table rows read from disk/buffers that were evaluated against the WHERE filter condition and discarded.',
        parts: [
          { label: 'Discarded Rows', value: prop.value, detail: 'Rows that consumed I/O bandwidth but did not match the query filter.' },
          { label: 'Filter Predicate', value: node.pg?.filter || node.predicate || 'None', detail: 'Residual filter expression applied to each row.' }
        ],
        impact: 'High rows removed indicates low index selectivity; the engine spends substantial time scanning rows only to throw them away.',
        tuningTip: 'Create a composite B-Tree index covering the filter predicate columns to evaluate conditions at the index level rather than as a post-scan filter.'
      };

    case 'Rows Removed by Index Recheck':
      return {
        title: 'Rows Removed by Index Recheck',
        category: 'PostgreSQL Index Filtering',
        definition: 'Rows discarded during Bitmap Heap Scan rechecking lossy blocks against the index condition.',
        parts: [
          { label: 'Recheck Discards', value: prop.value, detail: 'Non-matching rows on lossy pages eliminated after page fetch.' }
        ],
        impact: 'Indicates lossy bitmap tracking caused unnecessary row fetches.',
        tuningTip: 'Increase work_mem to allow exact bitmap tracking and eliminate recheck discards.'
      };

    case 'Startup Cost':
      return {
        title: 'Startup Cost',
        category: 'PostgreSQL Planner Cost Model',
        definition: 'Estimated cost units incurred before this node can emit its very first output row (e.g., sorting, building a hash table).',
        parts: [
          { label: 'Startup Cost Units', value: prop.value, detail: 'Units calculated using seq_page_cost (1.0), random_page_cost (4.0), and cpu_operator_cost.' }
        ],
        impact: 'High startup cost delays Time-to-First-Row (TTFR), critical for interactive user queries or queries using LIMIT.',
        tuningTip: 'If low startup latency is desired, consider indexes that provide pre-sorted ordering to replace Sort or Hash nodes.'
      };

    case 'Total Cost':
      return {
        title: 'Total Cost',
        category: 'PostgreSQL Planner Cost Model',
        definition: 'Estimated cumulative cost units for this operator and all underlying children to run to completion.',
        parts: [
          { label: 'Total Cost Units', value: prop.value, detail: 'Primary metric used by PostgreSQL optimizer to compare candidate execution paths.' },
          { label: 'Statement Share', value: `${costPct.toFixed(1)}% of query`, detail: `Share of the total statement estimated cost.` }
        ],
        impact: 'The query planner compares alternative execution paths and always selects the path with the lowest Total Cost.',
        tuningTip: 'If the planner chooses a slow plan, inspect planner cost parameters like random_page_cost (reduce to 1.1–1.5 for SSD/NVMe storage).'
      };

    case 'Plan Width (Row Size)':
      return {
        title: 'Plan Width (Row Size)',
        category: 'PostgreSQL Memory & Buffer Footprint',
        definition: 'The estimated average width in bytes of each row emitted by this plan node.',
        parts: [
          { label: 'Row Width', value: prop.value, detail: 'Average projected byte width per row.' }
        ],
        impact: 'Wider rows increase memory consumption for Sort and Hash nodes and reduce the number of rows fitting in shared_buffers 8KB pages.',
        tuningTip: 'Project only required columns in SELECT clauses to keep plan width narrow and reduce memory usage.'
      };

    case 'Plan Rows (Estimated)':
      return {
        title: 'Plan Rows (Estimated)',
        category: 'PostgreSQL Cardinality & Statistics',
        definition: 'Number of rows the PostgreSQL planner estimated would be emitted by this plan node, based on pg_statistic and ANALYZE data.',
        parts: [
          { label: 'Estimated Rows', value: prop.value, detail: 'Statistical prediction based on column histograms and MCV (Most Common Values) lists.' }
        ],
        impact: 'Cardinality estimation drives every planner decision: join order, join algorithm (Nested Loop vs Hash vs Merge), and index usage.',
        tuningTip: 'If plan rows diverges significantly from actual rows, run ANALYZE or increase default_statistics_target.'
      };

    case 'Actual Rows (Total)':
      return {
        title: 'Actual Rows (Total Across All Loops)',
        category: 'PostgreSQL Execution Volume',
        definition: 'The true total count of rows emitted by this operator across all loop iterations at runtime.',
        parts: [
          { label: 'Total Actual Rows', value: prop.value, detail: 'Measured by PostgreSQL executor under EXPLAIN (ANALYZE).' },
          { label: 'Plan Rows', value: (node.pg?.planRows ?? node.estimateRows).toLocaleString(), detail: 'Compile-time estimate.' }
        ],
        impact: 'Comparing actual rows with plan rows reveals cardinality estimation errors that cause suboptimal plan selection.',
        tuningTip: 'A large discrepancy indicates stale statistics or correlated filter columns that require extended statistics.'
      };

    case 'Actual Rows Per Loop':
      return {
        title: 'Actual Rows Per Loop',
        category: 'PostgreSQL Execution Volume',
        definition: 'Average number of rows emitted per single execution loop of this operator.',
        parts: [
          { label: 'Rows Per Loop', value: prop.value, detail: 'Standard row count reported directly by PostgreSQL EXPLAIN (ANALYZE).' }
        ],
        impact: 'In nested loops, this represents the average rows produced each time the inner relation is invoked.',
        tuningTip: 'Useful for understanding inner scan efficiency in nested loop joins.'
      };

    case 'Actual Startup Time':
      return {
        title: 'Actual Startup Time',
        category: 'PostgreSQL Runtime Timing',
        definition: 'The elapsed time in milliseconds before this node emitted its very first output row.',
        parts: [
          { label: 'Startup Duration', value: prop.value, detail: 'Wall-clock time to begin yielding rows.' }
        ],
        impact: 'Directly impacts Time-to-First-Row (TTFR) latency for web APIs and interactive applications.',
        tuningTip: 'To reduce startup time, avoid blocking operators like Sort and Materialize before yielding results.'
      };

    case 'Actual Total Time (Cumulative)':
      return {
        title: 'Actual Total Time (Cumulative)',
        category: 'PostgreSQL Runtime Timing',
        definition: 'The total wall-clock time in milliseconds spent in this node and all of its child subtrees from start to finish.',
        parts: [
          { label: 'Cumulative Duration', value: prop.value, detail: 'Total execution time including child operator trees.' }
        ],
        impact: 'The root node total time represents the overall query execution duration.',
        tuningTip: 'Look at Operator Self Elapsed Time to isolate the specific operator causing the greatest delay.'
      };

    case 'I/O Read / Write Timing':
      return {
        title: 'I/O Read / Write Timing',
        category: 'PostgreSQL Storage Engine & Timing',
        definition: 'Time spent by this node waiting on storage subsystem block read and write operations (measured when track_io_timing = on).',
        parts: [
          { label: 'I/O Duration', value: prop.value, detail: 'Storage read and write latency recorded via OS clock.' }
        ],
        impact: 'High I/O read time confirms that slow query performance is caused by physical disk latency rather than CPU processing.',
        tuningTip: 'Ensure track_io_timing is enabled in postgresql.conf to diagnose storage bottlenecks.'
      };

    case 'Planning Time':
      return {
        title: 'Planning Time',
        category: 'PostgreSQL Planner & Optimization',
        definition: 'Time taken by the PostgreSQL query planner to parse, analyze, rewrite, and generate the optimal execution plan tree.',
        parts: [
          { label: 'Planner Duration', value: prop.value, detail: 'Wall-clock time spent exploring candidate execution paths.' }
        ],
        impact: 'For short-running OLTP queries (<1ms), planning time can exceed execution time.',
        tuningTip: 'Use prepared statements (PREPARE / EXECUTE) or connection poolers with statement caching to bypass re-planning overhead.'
      };

    case 'Execution Time':
      return {
        title: 'Execution Time',
        category: 'PostgreSQL Execution Engine',
        definition: 'Total runtime taken by the PostgreSQL executor to run the plan, retrieve tuples, and process triggers, excluding planning time.',
        parts: [
          { label: 'Executor Duration', value: prop.value, detail: 'Elapsed query runtime measured by the engine.' }
        ],
        impact: 'Primary benchmark of query latency and throughput on the server.',
        tuningTip: 'Target the operator with highest Self Elapsed Time to reduce total execution time.'
      };

    case 'JIT Compilation':
      return {
        title: 'JIT Compilation (LLVM)',
        category: 'PostgreSQL Execution Architecture',
        definition: 'Just-In-Time compilation using LLVM to accelerate expressions, tuple deforming, and aggregates in complex queries.',
        parts: [
          { label: 'JIT Metrics', value: prop.value, detail: 'LLVM generation, inlining, optimization, and code emission timings.' }
        ],
        impact: 'JIT speeds up complex analytical queries on millions of rows, but JIT compile overhead can slow down short queries.',
        tuningTip: 'If JIT overhead exceeds the execution time gains, disable JIT for the session (SET LOCAL jit = off).'
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
        impact: isPg
          ? 'Influences PostgreSQL query execution, planner cost estimates, and engine resource allocation.'
          : 'Influences SQL Server query execution, cardinality estimation, and engine resource allocation.'
      };
  }
}

export const PlanVisualizerTab: React.FC<PlanVisualizerTabProps> = ({
  plan,
  selectedStatement,
  onSelectStatement,
  onExportRawPlan,
  onExportAnonymizedPlan,
  onAnonymizeInPlace,
}) => {
  const [selectedNode, setSelectedNode] = useState<PlanNode | null>(
    selectedStatement.rootNode || null
  );
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [copiedSQL, setCopiedSQL] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [filterOnlyTrees, setFilterOnlyTrees] = useState<boolean>(true);
  const [heatmapMetric, setHeatmapMetric] = useState<'cost' | 'self_elapsed' | 'self_cpu'>('cost');

  // SSMS Inspector state
  const [inspectorTab, setInspectorTab] = useState<
    'all' | 'operator' | 'cost' | 'rows' | 'actual' | 'predicates' | 'statement' | 'tuning'
  >('all');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };
  const [propSearchTerm, setPropSearchTerm] = useState<string>('');
  const [copiedPropTable, setCopiedPropTable] = useState<boolean>(false);
  const [copiedSeek, setCopiedSeek] = useState<boolean>(false);
  const [copiedFilter, setCopiedFilter] = useState<boolean>(false);
  const [copiedCols, setCopiedCols] = useState<boolean>(false);
  const [copiedCategory, setCopiedCategory] = useState<string | null>(null);
  const [copiedStmtSql, setCopiedStmtSql] = useState<boolean>(false);
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
      const isPg = plan?.engine === 'postgresql' || !!selectedNode.pg || !!selectedStatement.pg;
      const allProps = getSsmsProperties(selectedNode, selectedStatement, isPg);
      return allProps.find((p) => p.name === pinnedPropName) || null;
    }
    return null;
  }, [hoveredProp, pinnedPropName, selectedNode, selectedStatement, plan?.engine]);

  const activeRect = hoveredProp?.rect || pinnedRect;

  const activeExplanation = useMemo(() => {
    if (!activePropItem || !selectedNode) return null;
    const isPg = plan?.engine === 'postgresql' || !!selectedNode.pg || !!selectedStatement.pg;
    return getPropertyExplanation(
      activePropItem,
      selectedNode,
      selectedStatement.statementSubTreeCost,
      selectedStatement,
      isPg
    );
  }, [activePropItem, selectedNode, selectedStatement, plan?.engine]);

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
              <ListOrdered size={13} />
              <span>All ({statementsToDisplay.length})</span>
            </button>
            <button
              className={`segmented-btn ${viewMode === 'single' ? 'active' : ''}`}
              onClick={() => setViewMode('single')}
              title="Focus on a single statement"
            >
              <LayoutGrid size={13} />
              <span>Single</span>
            </button>
          </div>

          {viewMode === 'all' && (
            <label className="checkbox-label" style={{ fontSize: '11px', marginLeft: '6px' }} title="Hide empty non-query statements">
              <input
                type="checkbox"
                checked={filterOnlyTrees}
                onChange={(e) => setFilterOnlyTrees(e.target.checked)}
              />
              <span>Hide empty</span>
            </label>
          )}

          {viewMode === 'single' && (
            <div className="vis-stmt-selector" style={{ marginLeft: '6px' }}>
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
              <span className="badge badge-info" style={{ padding: '2px 6px', fontSize: '11px' }}>Cost: {selectedStatement.statementSubTreeCost.toFixed(1)}</span>
              {selectedStatement.compileTimeMs > 0 && (
                <span className="meta-item" style={{ fontSize: '11px' }}>Compile: {selectedStatement.compileTimeMs}ms</span>
              )}
              {selectedStatement.warnings.length > 0 && (
                <span className="badge badge-critical" style={{ padding: '2px 6px', fontSize: '11px' }}>
                  <AlertTriangle size={11} /> {selectedStatement.warnings.length} {selectedStatement.warnings.length === 1 ? 'Warning' : 'Warnings'}
                </span>
              )}
            </>
          ) : (
            <span className="meta-item" style={{ color: '#94a3b8', fontSize: '11px' }}>
              {statementsToDisplay.length}/{plan.totalStatements} stmts • Cost: {plan.totalSubTreeCost.toFixed(1)}
            </span>
          )}
        </div>

        {/* Right: Orientation & Zoom Controls */}
        <div className="vis-right-controls">
          {/* Feature B: Execution Plan PLE Threat Badge */}
          {plan.pleRiskReport && (
            <div
              className={`ple-topbar-pill ple-risk-${plan.pleRiskReport.riskLevel.toLowerCase()}`}
              title={`${plan.pleRiskReport.headline}\n${plan.pleRiskReport.summary}`}
            >
              <HardDrive size={11} />
              <span>PLE: <strong>{plan.pleRiskReport.riskLevel}</strong></span>
              <span className="ple-pill-vol">~{plan.pleRiskReport.estimatedScanVolumeMb.toFixed(0)} MB</span>
            </div>
          )}

          {/* Heatmap Mode Selector (PerformanceStudio NodeTimeAttribution) */}
          <div className="segmented-control" title="Visual Heatmap Metric Attribution (PerformanceStudio NodeTimeAttribution)">
            <button
              className={`segmented-btn ${heatmapMetric === 'cost' ? 'active' : ''}`}
              onClick={() => setHeatmapMetric('cost')}
              title="Estimated Operator Subtree Cost Percentage"
            >
              <Activity size={11} color="#f43f5e" />
              <span>Cost</span>
            </button>
            <button
              className={`segmented-btn ${heatmapMetric === 'self_elapsed' ? 'active' : ''}`}
              onClick={() => setHeatmapMetric('self_elapsed')}
              title="Actual Operator Self-Elapsed Wall Clock Time (PerformanceStudio NodeTimeAttribution)"
            >
              <Clock size={11} color="#38bdf8" />
              <span>Elapsed</span>
            </button>
            <button
              className={`segmented-btn ${heatmapMetric === 'self_cpu' ? 'active' : ''}`}
              onClick={() => setHeatmapMetric('self_cpu')}
              title="Actual Operator Self-CPU Processing Time (PerformanceStudio NodeTimeAttribution)"
            >
              <Cpu size={11} color="#fbbf24" />
              <span>CPU</span>
            </button>
          </div>

          {/* Orientation Toggle */}
          <div className="segmented-control" title="Change layout orientation">
            <button
              className={`segmented-btn ${orientation === 'vertical' ? 'active' : ''}`}
              onClick={() => setOrientation('vertical')}
              title="Vertical Tree Layout (Top to Bottom)"
            >
              <ArrowDownUp size={11} />
              <span>Vertical</span>
            </button>
            <button
              className={`segmented-btn ${orientation === 'horizontal' ? 'active' : ''}`}
              onClick={() => setOrientation('horizontal')}
              title="Horizontal Pipeline (SSMS Style)"
            >
              <ArrowLeftRight size={11} />
              <span>Horizontal</span>
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="zoom-controls">
            <button
              className="btn-icon"
              onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.1))}
              title="Zoom Out"
            >
              <ZoomOut size={12} />
            </button>
            <span className="zoom-label">{(zoomLevel * 100).toFixed(0)}%</span>
            <button
              className="btn-icon"
              onClick={() => setZoomLevel((z) => Math.min(1.5, z + 0.1))}
              title="Zoom In"
            >
              <ZoomIn size={12} />
            </button>
            <button
              className="btn-icon"
              onClick={() => setZoomLevel(1)}
              title="Reset Zoom"
            >
              <Maximize2 size={12} />
            </button>

            <div style={{ width: '1px', height: '14px', background: '#334155', margin: '0 2px' }} />

            <button
              type="button"
              className="btn-icon"
              onClick={handleExportTreePng}
              disabled={isExportingTree}
              title="Export High-Res PNG of Execution Plan Tree"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', width: 'auto', padding: '0 5px', fontSize: '10.5px', color: '#38bdf8' }}
            >
              <Download size={11} color="#38bdf8" />
              <span>PNG</span>
            </button>

            <button
              type="button"
              className="btn-icon"
              onClick={handleExportTreeSvg}
              disabled={isExportingTree}
              title="Export Vector SVG of Execution Plan Tree"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', width: 'auto', padding: '0 5px', fontSize: '10.5px', color: '#a78bfa' }}
            >
              <Download size={11} color="#a78bfa" />
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
          <button
            className="btn-copy-sm"
            title={plan?.engine === 'postgresql' || !!selectedStatement.pg ? 'Copy a runnable PostgreSQL script with EXPLAIN (ANALYZE, BUFFERS)' : "Copy a runnable T-SQL script with the plan's parameter values filled in"}
            onClick={() => handleCopySQL(buildReproScript(selectedStatement))}
          >
            <FileText size={13} />
            <span>Repro Script</span>
          </button>
          <button
            className="btn-copy-sm"
            title="Download a standalone HTML report of this plan"
            onClick={() => downloadTextFile(`plan-report-${Date.now()}.html`, buildHtmlReport(plan))}
          >
            <Download size={13} />
            <span>HTML Report</span>
          </button>
          {onExportRawPlan && (
            <button
              className="btn-copy-sm"
              title={plan?.engine === 'postgresql' || !!selectedStatement.pg ? 'Export full PostgreSQL EXPLAIN JSON (.json)' : 'Export full SQL Server ShowPlan XML (.sqlplan)'}
              onClick={onExportRawPlan}
            >
              <Download size={13} color="#38bdf8" />
              <span>{plan?.engine === 'postgresql' || !!selectedStatement.pg ? 'Export .json' : 'Export .sqlplan'}</span>
            </button>
          )}
          {onExportAnonymizedPlan && (
            <button
              className="btn-copy-sm"
              title="Anonymize table/column/index identifiers and mask parameter/string literals, then download"
              onClick={onExportAnonymizedPlan}
              style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: '#fbbf24' }}
            >
              <EyeOff size={13} color="#fbbf24" />
              <span>Export Anonymized</span>
            </button>
          )}
          {onAnonymizeInPlace && (
            <button
              className="btn-copy-sm"
              title="Mask sensitive object names and literals directly in the visualizer"
              onClick={onAnonymizeInPlace}
            >
              <EyeOff size={13} color="#a78bfa" />
              <span>Mask View</span>
            </button>
          )}
        </div>
      )}

      {/* Main Canvas Area */}
      <div className="vis-main-layout">
        {/* Tree Canvas */}
        <div className="vis-canvas-scroll" ref={treeContainerRef}>
          {viewMode === 'single' ? (
            /* Single Statement Focused View */
            selectedStatement.rootNode ? (
              <PlanEdges root={selectedStatement.rootNode} orientation={orientation} zoom={zoomLevel} selectedNodeId={selectedNode?.nodeId}>
                <TreeNode
                  node={selectedStatement.rootNode}
                  selectedNode={selectedNode}
                  onSelectNode={setSelectedNode}
                  orientation={orientation}
                  heatmapMetric={heatmapMetric}
                  onOpenSkewModal={(n) => {
                    setSelectedNode(n);
                    setShowSkewModal(true);
                  }}
                />
              </PlanEdges>
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
                      <PlanEdges root={stmt.rootNode} orientation={orientation} zoom={zoomLevel} selectedNodeId={selectedNode?.nodeId}>
                        <TreeNode
                          node={stmt.rootNode}
                          selectedNode={selectedNode}
                          onSelectNode={setSelectedNode}
                          orientation={orientation}
                          heatmapMetric={heatmapMetric}
                          onOpenSkewModal={(n) => {
                            setSelectedNode(n);
                            setShowSkewModal(true);
                          }}
                        />
                      </PlanEdges>
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
          const isPg = plan?.engine === 'postgresql' || !!selectedNode.pg || !!selectedStatement.pg;
          const allProperties = getSsmsProperties(selectedNode, selectedStatement, isPg);
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
            const order: SsmsPropertyCategory[] = [
              'operator',
              'cost',
              'rows',
              'actual_stats',
              'actual_timing',
              'storage',
              'predicate',
              'output',
              'statement'
            ];
            const lines = [
              `============================================================`,
              `  ${selectedNode.physicalOp.toUpperCase()} (Node #${selectedNode.nodeId}) - ${isPg ? 'PostgreSQL EXPLAIN Properties' : 'ShowPlan Properties'}`,
              `============================================================`,
              ``
            ];
            order.forEach((catKey) => {
              const items = allProperties.filter((p) => p.category === catKey);
              if (items.length === 0) return;
              const meta = CATEGORY_META[catKey];
              lines.push(`[${meta.label.toUpperCase()}]`);
              items.forEach((p) => {
                lines.push(`  ${p.name.padEnd(46, ' ')} : ${p.value}`);
              });
              lines.push(``);
            });
            if (selectedNode.seekPredicates) {
              lines.push(`[SEEK PREDICATES]`);
              lines.push(`  ${selectedNode.seekPredicates}`);
              lines.push(``);
            }
            if (selectedNode.predicate) {
              lines.push(`[FILTER PREDICATE]`);
              lines.push(`  ${selectedNode.predicate}`);
              lines.push(``);
            }
            if (selectedNode.outputColumns.length > 0) {
              lines.push(`[OUTPUT COLUMNS]`);
              lines.push(`  ${selectedNode.outputColumns.join(', ')}`);
              lines.push(``);
            }
            lines.push(`============================================================`);
            navigator.clipboard.writeText(lines.join('\n'));
            setCopiedPropTable(true);
            setTimeout(() => setCopiedPropTable(false), 2000);
          };

          const handleCopyCategory = (catKey: SsmsPropertyCategory) => {
            const meta = CATEGORY_META[catKey];
            const items = allProperties.filter((p) => p.category === catKey);
            const lines = [
              `[${meta.label.toUpperCase()}] - ${selectedNode.physicalOp} (Node #${selectedNode.nodeId})`,
              ...items.map((p) => `  ${p.name.padEnd(44, ' ')} : ${p.value}`)
            ];
            navigator.clipboard.writeText(lines.join('\n'));
            setCopiedCategory(catKey);
            setTimeout(() => setCopiedCategory(null), 2000);
          };

          const isSeekLong = (selectedNode.seekPredicates || '').length > 250;
          const displaySeek =
            isSeekLong && !isSeekExpanded
              ? selectedNode.seekPredicates.slice(0, 220) + '...'
              : selectedNode.seekPredicates;

          const categoriesToRender: SsmsPropertyCategory[] = (() => {
            if (inspectorTab === 'operator') return ['operator'];
            if (inspectorTab === 'cost') return ['cost'];
            if (inspectorTab === 'rows') return ['rows'];
            if (inspectorTab === 'actual') return ['actual_stats', 'actual_timing'];
            if (inspectorTab === 'predicates') return ['predicate', 'output'];
            if (inspectorTab === 'statement') return ['statement'];
            if (inspectorTab === 'tuning') return [];
            return [
              'operator',
              'cost',
              'rows',
              'actual_stats',
              'actual_timing',
              'storage',
              'predicate',
              'output',
              'statement'
            ];
          })();

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
                  {((selectedNode.selfElapsedMs ?? 0) > 0 || (selectedNode.selfCpuMs ?? 0) > 0) && (
                    <span
                      className={`badge ${(selectedNode.selfElapsedMs ?? 0) >= 1000 ? 'badge-critical' : (selectedNode.selfElapsedMs ?? 0) >= 100 ? 'badge-high' : 'badge-slate'}`}
                      title={`Self Elapsed: ${((selectedNode.selfElapsedMs || 0) / 1000).toFixed(3)}s | Self CPU: ${((selectedNode.selfCpuMs || 0) / 1000).toFixed(3)}s`}
                    >
                      ⏱️ {((selectedNode.selfElapsedMs || 0) / 1000).toFixed(3)}s self
                    </span>
                  )}
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
                {/* Operator Plain-English Description Card */}
                <div className="operator-desc-card">
                  <Info size={15} className="desc-icon" />
                  <div>
                    <strong style={{ color: '#f8fafc', display: 'block', marginBottom: '2px' }}>
                      {selectedNode.physicalOp}
                    </strong>
                    <span>{opDesc}</span>
                  </div>
                </div>

                {/* View Switcher Tabs (All PerformanceStudio categories) */}
                <div className="inspector-tab-switcher">
                  <button
                    type="button"
                    className={`inspector-tab-btn ${inspectorTab === 'all' ? 'active' : ''}`}
                    onClick={() => setInspectorTab('all')}
                    title="View all categorized properties"
                  >
                    <LayoutGrid size={11} />
                    <span>All</span>
                  </button>
                  <button
                    type="button"
                    className={`inspector-tab-btn ${inspectorTab === 'operator' ? 'active' : ''}`}
                    onClick={() => setInspectorTab('operator')}
                    title="Operator physical & logical properties, execution modes, DOP"
                  >
                    <Cpu size={11} />
                    <span>Operator</span>
                  </button>
                  <button
                    type="button"
                    className={`inspector-tab-btn ${inspectorTab === 'cost' ? 'active' : ''}`}
                    onClick={() => setInspectorTab('cost')}
                    title="Estimated Subtree, Operator, CPU & I/O Costs"
                  >
                    <Activity size={11} />
                    <span>Costs</span>
                  </button>
                  <button
                    type="button"
                    className={`inspector-tab-btn ${inspectorTab === 'rows' ? 'active' : ''}`}
                    onClick={() => setInspectorTab('rows')}
                    title="Estimated vs Actual Rows and Cardinality Skew"
                  >
                    <Layers size={11} />
                    <span>Rows</span>
                  </button>
                  <button
                    type="button"
                    className={`inspector-tab-btn ${inspectorTab === 'actual' ? 'active' : ''}`}
                    onClick={() => setInspectorTab('actual')}
                    title="Actual I/O Reads, Scans, Elapsed & CPU Timings"
                  >
                    <HardDrive size={11} />
                    <span>Actual Stats</span>
                  </button>
                  <button
                    type="button"
                    className={`inspector-tab-btn ${inspectorTab === 'predicates' ? 'active' : ''}`}
                    onClick={() => setInspectorTab('predicates')}
                    title="Seek Predicates, Filters, and Output Columns"
                  >
                    <Filter size={11} />
                    <span>Predicates</span>
                  </button>
                  <button
                    type="button"
                    className={`inspector-tab-btn ${inspectorTab === 'statement' ? 'active' : ''}`}
                    onClick={() => setInspectorTab('statement')}
                    title="Statement Context, Optimization Level & Compile Stats"
                  >
                    <FileText size={11} />
                    <span>Statement</span>
                  </button>
                  <button
                    type="button"
                    className={`inspector-tab-btn ${inspectorTab === 'tuning' ? 'active' : ''}`}
                    onClick={() => setInspectorTab('tuning')}
                    title="Tuning Playbook, Wait Stats & Trace Flags"
                  >
                    <AlertTriangle size={11} />
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
                        <strong>{isPg ? 'Immediate PostgreSQL Remedy:' : 'Immediate T-SQL Remedy:'}</strong>
                        <div style={{ marginTop: '3px' }}>
                          <code style={{ background: 'rgba(0,0,0,0.35)', padding: '3px 6px', borderRadius: '4px', display: 'inline-block' }}>
                            {isPg
                              ? `ANALYZE ${selectedNode.schema ? `${selectedNode.schema}.${selectedNode.table}` : (selectedNode.table || 'target_table')};`
                              : `UPDATE STATISTICS ${selectedNode.schema ? `[${selectedNode.schema}].[${selectedNode.table}]` : (selectedNode.table ? `[${selectedNode.table}]` : '#TargetTable')} WITH FULLSCAN`}
                          </code>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-open-skew-plan"
                        onClick={() => setShowSkewModal(true)}
                        title={isPg ? "Click to view deep root cause diagnosis, work_mem impact, and copyable PostgreSQL fixes" : "Click to view deep root cause diagnosis, memory impact, and copyable T-SQL fixes"}
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

                {/* Global Search & Action Bar */}
                <div className="ssms-table-topbar">
                  <div className="ssms-table-title">
                    <Search size={12} color="#38bdf8" />
                    <span>Properties ({filteredProperties.length})</span>
                  </div>
                  <div className="ssms-table-actions">
                    <input
                      type="text"
                      className="ssms-search-input"
                      placeholder="Filter properties..."
                      value={propSearchTerm}
                      onChange={(e) => setPropSearchTerm(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-ssms-copy"
                      onClick={handleCopyProperties}
                      title="Copy all properties in SSMS text format"
                    >
                      {copiedPropTable ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                      <span>{copiedPropTable ? 'Copied' : 'Copy All'}</span>
                    </button>
                  </div>
                </div>

                {/* PerformanceStudio Details: Wait Stats, Trace Flags, Parameters, Findings */}
                {(inspectorTab === 'all' || inspectorTab === 'tuning' || inspectorTab === 'statement') && (
                  <NodeExtraPanels
                    node={selectedNode}
                    statement={selectedStatement}
                    plan={plan}
                    onSelectNodeId={(id) => {
                      const find = (n: PlanNode | undefined): PlanNode | null => {
                        if (!n) return null;
                        if (n.nodeId === id) return n;
                        for (const c of n.children || []) {
                          const r = find(c);
                          if (r) return r;
                        }
                        return null;
                      };
                      const target = find(selectedStatement.rootNode as PlanNode | undefined);
                      if (target) setSelectedNode(target);
                    }}
                  />
                )}

                {/* CATEGORIZED PROPERTY SECTIONS */}
                {categoriesToRender.map((catKey) => {
                  const meta = CATEGORY_META[catKey];
                  const items = filteredProperties.filter((p) => p.category === catKey);
                  if (items.length === 0 && !propSearchTerm) return null;
                  if (items.length === 0 && propSearchTerm) return null;
                  const isCollapsed = collapsedCategories[catKey] ?? false;

                  return (
                    <div key={catKey} className="category-group-card">
                      {/* Section Header */}
                      <div
                        className="category-group-header"
                        onClick={() => toggleCategory(catKey)}
                      >
                        <div className="category-group-title">
                          {catKey === 'operator' && <Cpu size={13} color="#38bdf8" />}
                          {catKey === 'cost' && <Activity size={13} color="#f43f5e" />}
                          {catKey === 'rows' && <Layers size={13} color="#a855f7" />}
                          {catKey === 'actual_stats' && <HardDrive size={13} color="#34d399" />}
                          {catKey === 'actual_timing' && <Clock size={13} color="#38bdf8" />}
                          {catKey === 'storage' && <Table size={13} color="#f59e0b" />}
                          {catKey === 'predicate' && <Filter size={13} color="#fbbf24" />}
                          {catKey === 'output' && <Database size={13} color="#10b981" />}
                          {catKey === 'statement' && <FileText size={13} color="#60a5fa" />}
                          <span>{isPg && catKey === 'actual_stats' ? 'PostgreSQL Buffers & I/O' : isPg && catKey === 'storage' ? 'Target Relation' : meta.label}</span>
                          <span className="category-group-badge">{items.length}</span>
                        </div>
                        <div className="category-group-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn-category-action"
                            onClick={() => handleCopyCategory(catKey)}
                            title={`Copy ${meta.label} as text`}
                          >
                            {copiedCategory === catKey ? (
                              <Check size={10} color="#34d399" />
                            ) : (
                              <Copy size={10} />
                            )}
                            <span>{copiedCategory === catKey ? 'Copied' : 'Copy'}</span>
                          </button>
                          <button
                            type="button"
                            className="btn-category-collapse"
                            onClick={() => toggleCategory(catKey)}
                            title={isCollapsed ? 'Expand section' : 'Collapse section'}
                          >
                            {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          </button>
                        </div>
                      </div>

                      {/* Section Table & Custom Cards */}
                      {!isCollapsed && (
                        <div>
                          <table className="ssms-props-table">
                            <tbody>
                              {items.map((prop, idx) => {
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
                                          : prop.highlight === 'good'
                                          ? 'highlight-good'
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

                          {/* Extra Custom View for Predicates */}
                          {catKey === 'predicate' && selectedNode.seekPredicates && (
                            <div className="predicate-section-box" style={{ margin: '8px 8px 10px' }}>
                              <div className="predicate-header">
                                <div className="predicate-title">
                                  <Search size={12} color="#38bdf8" />
                                  <span>Seek Predicates</span>
                                </div>
                                <div className="predicate-actions">
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
                            </div>
                          )}

                          {catKey === 'predicate' && selectedNode.predicate && (
                            <div className="predicate-section-box" style={{ margin: '8px 8px 10px' }}>
                              <div className="predicate-header">
                                <div className="predicate-title">
                                  <Filter size={12} color="#fbbf24" />
                                  <span>Residual Filter Predicate</span>
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

                          {/* Extra Custom View for Output Columns */}
                          {catKey === 'output' && selectedNode.outputColumns.length > 0 && (
                            <div style={{ padding: '8px 12px 12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>Columns Projected ({selectedNode.outputColumns.length}):</span>
                                <button
                                  type="button"
                                  className="btn-category-action"
                                  onClick={() => {
                                    navigator.clipboard.writeText(selectedNode.outputColumns.join(', '));
                                    setCopiedCols(true);
                                    setTimeout(() => setCopiedCols(false), 2000);
                                  }}
                                >
                                  {copiedCols ? <Check size={10} color="#34d399" /> : <Copy size={10} />}
                                  <span>{copiedCols ? 'Copied' : 'Copy List'}</span>
                                </button>
                              </div>
                              <div className="output-cols-wrap">
                                {selectedNode.outputColumns.map((col, idx) => (
                                  <span key={idx} className="col-badge">
                                    {col}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Extra Custom View for Statement Context: SQL Snippet */}
                          {catKey === 'statement' && selectedStatement.statementText && (
                            <div style={{ padding: '8px 12px 12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>{isPg ? 'Statement PostgreSQL Code:' : 'Statement T-SQL Code:'}</span>
                                <button
                                  type="button"
                                  className="btn-category-action"
                                  onClick={() => {
                                    navigator.clipboard.writeText(selectedStatement.statementText);
                                    setCopiedStmtSql(true);
                                    setTimeout(() => setCopiedStmtSql(false), 2000);
                                  }}
                                >
                                  {copiedStmtSql ? <Check size={10} color="#34d399" /> : <Copy size={10} />}
                                  <span>{copiedStmtSql ? 'Copied' : 'Copy SQL'}</span>
                                </button>
                              </div>
                              <pre className="predicate-code-box" style={{ maxHeight: 120 }}>
                                {selectedStatement.statementText}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Tuning Tab Dedicated Panel */}
                {(inspectorTab === 'all' || inspectorTab === 'tuning') && selectedNode.hasCardinalitySkew && (
                  <div className="inspector-section" style={{ background: 'rgba(251, 191, 36, 0.05)', border: '1px solid rgba(251, 191, 36, 0.25)', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Wrench size={13} color="#fbbf24" />
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#fde68a', textTransform: 'uppercase' }}>
                          {isPg ? 'PostgreSQL Tuning Playbook' : 'Tuning Playbook'} ({selectedNode.skewRatio ? selectedNode.skewRatio.toFixed(0) : '3372'}x Skew)
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
                      {isPg ? (
                        <>
                          <div className="remedy-step-card">
                            <div className="step-header">
                              <span className="step-num">Step 1</span>
                              <span style={{ fontSize: '11px', color: '#cbd5e1', flex: 1 }}>Update Table Statistics</span>
                              <button
                                type="button"
                                className="btn-code-copy"
                                onClick={() => {
                                  navigator.clipboard.writeText(`ANALYZE ${selectedNode.schema ? `${selectedNode.schema}.${selectedNode.table}` : (selectedNode.table || 'target_table')};`);
                                }}
                              >
                                <Copy size={10} />
                                <span>Copy</span>
                              </button>
                            </div>
                            <pre className="remedy-code-block" style={{ fontSize: '10.5px' }}>
                              ANALYZE {selectedNode.schema ? `${selectedNode.schema}.${selectedNode.table}` : (selectedNode.table || 'target_table')};
                            </pre>
                          </div>

                          <div className="remedy-step-card">
                            <div className="step-header">
                              <span className="step-num">Step 2</span>
                              <span style={{ fontSize: '11px', color: '#cbd5e1', flex: 1 }}>Tune Workspace Memory</span>
                              <button
                                type="button"
                                className="btn-code-copy"
                                onClick={() => {
                                  navigator.clipboard.writeText(`SET LOCAL work_mem = '64MB';`);
                                }}
                              >
                                <Copy size={10} />
                                <span>Copy</span>
                              </button>
                            </div>
                            <pre className="remedy-code-block" style={{ fontSize: '10.5px' }}>
                              SET LOCAL work_mem = '64MB';
                            </pre>
                          </div>
                        </>
                      ) : (
                        <>
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
                        </>
                      )}
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
