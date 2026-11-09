import {
  PlanAnalysis,
  StatementAnalysis,
  PlanNode,
  ExecutiveVerdict,
  AdvancedDiagnostics,
  HardwareMetrics,
  PLERiskAssessment,
  TableIOLeader,
  KeyLookupFinding,
  SpoolFinding,
  MissingStatsFinding,
  NonSargableFinding,
  RowGoalFinding,
  PgNodeInfo,
  PgStatementInfo,
  PgBufferCounters,
  PgNodeBadge,
  PgNodeProp,
} from '../types/plan';
import { applyFindingsAndWaitInsights } from './planFindings';

// Raw Postgres EXPLAIN JSON shapes
export interface RawPgNode {
  'Node Type': string;
  Strategy?: string;
  'Partial Mode'?: string;
  'Join Type'?: string;
  'Parallel Aware'?: boolean;
  'Parent Relationship'?: string;
  'Subplan Name'?: string;
  'Relation Name'?: string;
  Schema?: string;
  Alias?: string;
  'Index Name'?: string;
  'Scan Direction'?: string;
  'Startup Cost'?: number;
  'Total Cost': number;
  'Plan Rows': number;
  'Plan Width'?: number;
  'Actual Startup Time'?: number;
  'Actual Total Time'?: number;
  'Actual Rows'?: number;
  'Actual Loops'?: number;
  'Rows Removed by Filter'?: number;
  'Rows Removed by Index Recheck'?: number;
  'Rows Removed by Join Filter'?: number;
  'Heap Fetches'?: number;
  'Exact Heap Blocks'?: number;
  'Lossy Heap Blocks'?: number;
  'Sort Method'?: string;
  'Sort Space Used'?: number;
  'Sort Space Type'?: string;
  'Hash Buckets'?: number;
  'Hash Batches'?: number;
  'Original Hash Batches'?: number;
  'Peak Memory Usage'?: number;
  'Workers Planned'?: number;
  'Workers Launched'?: number;
  Filter?: string;
  'Index Cond'?: string;
  'Recheck Cond'?: string;
  'Hash Cond'?: string;
  'Merge Cond'?: string;
  'Join Filter'?: string;
  'Shared Hit Blocks'?: number;
  'Shared Read Blocks'?: number;
  'Shared Dirtied Blocks'?: number;
  'Shared Written Blocks'?: number;
  'Local Hit Blocks'?: number;
  'Local Read Blocks'?: number;
  'Local Dirtied Blocks'?: number;
  'Local Written Blocks'?: number;
  'Temp Read Blocks'?: number;
  'Temp Written Blocks'?: number;
  'I/O Read Time'?: number;
  'I/O Write Time'?: number;
  Plans?: RawPgNode[];
  [key: string]: any;
}

export interface RawPgExplainRoot {
  Plan: RawPgNode;
  'Planning Time'?: number;
  'Execution Time'?: number;
  'Planning'?: any;
  Triggers?: Array<{
    'Trigger Name': string;
    Constraint?: string;
    Relation?: string;
    Time: number;
    Calls: number;
  }>;
  JIT?: {
    Functions?: number;
    Options?: any;
    Timing?: {
      Generation?: number;
      Inlining?: number;
      Optimization?: number;
      Emission?: number;
      Total?: number;
    };
  };
  Settings?: Record<string, string>;
  'Query Identifier'?: string | number;
  Query?: string;
  [key: string]: any;
}

export interface UnwrappedPgData {
  rootList: RawPgExplainRoot[];
  extractedQuery?: string;
}

/** Helper to clean query text from wrapping SQL statements */
function cleanQueryKey(k: string): string {
  if (!k) return '';
  return k.replace(/^\s*EXPLAIN\s*(\([^)]*\))?\s*/i, '').trim();
}

/** Unwraps PostgreSQL EXPLAIN plans from standard JSON, pgAdmin/DBeaver exports, table query wrappers, etc. */
export function unwrapPgExplainData(parsed: any): UnwrappedPgData | null {
  if (!parsed) return null;

  // Case 1: Direct array of root statements with .Plan
  if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.Plan) {
    return { rootList: parsed as RawPgExplainRoot[] };
  }

  // Case 2: Direct object with .Plan
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.Plan) {
    return { rootList: [parsed as RawPgExplainRoot] };
  }

  // Case 3: Direct object with .Plans array
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.Plans)) {
    return { rootList: [{ Plan: parsed } as any] };
  }

  // Case 4: Wrapper object with query text as key (e.g., DBeaver / pgAdmin table export)
  // Example: { "EXPLAIN (...) select ...": [ { "QUERY PLAN": "[\n { \"Plan\": ... } ]" } ] }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const [key, val] of Object.entries(parsed)) {
      let queryFromKey = '';
      if (/explain|select|insert|update|delete|with/i.test(key)) {
        queryFromKey = cleanQueryKey(key);
      }

      // Check if value is array of rows
      if (Array.isArray(val)) {
        for (const row of val) {
          if (row && typeof row === 'object') {
            for (const [colKey, colVal] of Object.entries(row)) {
              if (/query.?plan|plan|explain/i.test(colKey)) {
                if (typeof colVal === 'string') {
                  try {
                    const parsedSub = JSON.parse(colVal);
                    if (Array.isArray(parsedSub) && parsedSub[0]?.Plan) {
                      return { rootList: parsedSub, extractedQuery: queryFromKey };
                    }
                    if (parsedSub?.Plan) {
                      return { rootList: [parsedSub], extractedQuery: queryFromKey };
                    }
                  } catch {
                    // Not valid JSON string
                  }
                } else if (Array.isArray(colVal) && colVal[0]?.Plan) {
                  return { rootList: colVal, extractedQuery: queryFromKey };
                } else if ((colVal as any)?.Plan) {
                  return { rootList: [colVal as any], extractedQuery: queryFromKey };
                }
              }
            }
          }
        }
      }

      // Check if value itself is a string containing JSON
      if (typeof val === 'string' && (val.trim().startsWith('[') || val.trim().startsWith('{'))) {
        try {
          const parsedSub = JSON.parse(val);
          if (Array.isArray(parsedSub) && parsedSub[0]?.Plan) {
            return { rootList: parsedSub, extractedQuery: queryFromKey };
          }
          if (parsedSub?.Plan) {
            return { rootList: [parsedSub], extractedQuery: queryFromKey };
          }
        } catch {}
      }
    }
  }

  // Case 5: Array of rows where row has "QUERY PLAN" (e.g., [ { "QUERY PLAN": "[ ... ]" } ])
  if (Array.isArray(parsed)) {
    for (const row of parsed) {
      if (row && typeof row === 'object') {
        for (const [colKey, colVal] of Object.entries(row)) {
          if (/query.?plan|plan|explain/i.test(colKey)) {
            if (typeof colVal === 'string') {
              try {
                const parsedSub = JSON.parse(colVal);
                if (Array.isArray(parsedSub) && parsedSub[0]?.Plan) {
                  return { rootList: parsedSub };
                }
                if (parsedSub?.Plan) {
                  return { rootList: [parsedSub] };
                }
              } catch {}
            } else if (Array.isArray(colVal) && colVal[0]?.Plan) {
              return { rootList: colVal };
            } else if ((colVal as any)?.Plan) {
              return { rootList: [colVal as any] };
            }
          }
        }
      }
    }
  }

  return null;
}

/** Check whether raw string content represents a PostgreSQL EXPLAIN JSON */
export function isPgExplainJson(content: string): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
    return false;
  }
  // Fast substring check
  if (
    trimmed.includes('"Node Type"') ||
    trimmed.includes('\\"Node Type\\"') ||
    trimmed.includes('"Plan"') ||
    trimmed.includes('\\"Plan\\"') ||
    trimmed.includes('"QUERY PLAN"') ||
    trimmed.includes('"query_plan"') ||
    trimmed.includes('"query plan"') ||
    (trimmed.includes('"Total Cost"') && trimmed.includes('"Plan Rows"')) ||
    (trimmed.includes('\\"Total Cost\\"') && trimmed.includes('\\"Plan Rows\\"'))
  ) {
    return true;
  }

  // Full parser fallback verification
  try {
    const parsed = JSON.parse(trimmed);
    return !!unwrapPgExplainData(parsed);
  } catch {
    return false;
  }
}

/** Extract buffer counters from a raw node */
function extractBuffers(raw: RawPgNode): PgBufferCounters {
  return {
    sharedHit: raw['Shared Hit Blocks'] || 0,
    sharedRead: raw['Shared Read Blocks'] || 0,
    sharedDirtied: raw['Shared Dirtied Blocks'] || 0,
    sharedWritten: raw['Shared Written Blocks'] || 0,
    localHit: raw['Local Hit Blocks'] || 0,
    localRead: raw['Local Read Blocks'] || 0,
    localDirtied: raw['Local Dirtied Blocks'] || 0,
    localWritten: raw['Local Written Blocks'] || 0,
    tempRead: raw['Temp Read Blocks'] || 0,
    tempWritten: raw['Temp Written Blocks'] || 0,
  };
}

/** Sum two buffer structs */
function addBuffers(a: PgBufferCounters, b: PgBufferCounters): PgBufferCounters {
  return {
    sharedHit: a.sharedHit + b.sharedHit,
    sharedRead: a.sharedRead + b.sharedRead,
    sharedDirtied: a.sharedDirtied + b.sharedDirtied,
    sharedWritten: a.sharedWritten + b.sharedWritten,
    localHit: a.localHit + b.localHit,
    localRead: a.localRead + b.localRead,
    localDirtied: a.localDirtied + b.localDirtied,
    localWritten: a.localWritten + b.localWritten,
    tempRead: a.tempRead + b.tempRead,
    tempWritten: a.tempWritten + b.tempWritten,
  };
}

/** Subtract buffers (for self-buffer attribution) */
function subtractBuffers(a: PgBufferCounters, b: PgBufferCounters): PgBufferCounters {
  return {
    sharedHit: Math.max(0, a.sharedHit - b.sharedHit),
    sharedRead: Math.max(0, a.sharedRead - b.sharedRead),
    sharedDirtied: Math.max(0, a.sharedDirtied - b.sharedDirtied),
    sharedWritten: Math.max(0, a.sharedWritten - b.sharedWritten),
    localHit: Math.max(0, a.localHit - b.localHit),
    localRead: Math.max(0, a.localRead - b.localRead),
    localDirtied: Math.max(0, a.localDirtied - b.localDirtied),
    localWritten: Math.max(0, a.localWritten - b.localWritten),
    tempRead: Math.max(0, a.tempRead - b.tempRead),
    tempWritten: Math.max(0, a.tempWritten - b.tempWritten),
  };
}

/** Parse PostgreSQL EXPLAIN (FORMAT JSON) into standard PlanIQ PlanAnalysis */
export function parsePgExplainJson(jsonContent: string, planName: string = 'PostgreSQL Execution Plan'): PlanAnalysis {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (err: any) {
    throw new Error(`Failed to parse PostgreSQL EXPLAIN JSON: ${err?.message || err}`);
  }

  const unwrapped = unwrapPgExplainData(parsed);
  if (!unwrapped || unwrapped.rootList.length === 0 || !unwrapped.rootList[0]?.Plan) {
    throw new Error('Unrecognized PostgreSQL EXPLAIN JSON format: Missing "Plan" root object.');
  }

  const { rootList, extractedQuery } = unwrapped;

  let nextNodeId = 1;
  const statements: StatementAnalysis[] = [];

  rootList.forEach((rootItem, stmtIdx) => {
    const rawPlan = rootItem.Plan;
    const stmtId = `${stmtIdx + 1}`;
    const totalCost = rawPlan['Total Cost'] || 0;
    const executionMs = rootItem['Execution Time'] || 0;
    const planningMs = rootItem['Planning Time'] || 0;
    const hasAnalyze = typeof rawPlan['Actual Total Time'] === 'number';

    // Global buffer counter accumulator
    let stmtBuffers: PgBufferCounters = {
      sharedHit: 0,
      sharedRead: 0,
      sharedDirtied: 0,
      sharedWritten: 0,
      localHit: 0,
      localRead: 0,
      localDirtied: 0,
      localWritten: 0,
      tempRead: 0,
      tempWritten: 0,
    };

    // Recursive node converter
    const convertNode = (raw: RawPgNode): PlanNode => {
      const curId = nextNodeId++;
      const nodeType = raw['Node Type'] || 'Result';
      const strategy = raw.Strategy;
      const physicalOp = strategy ? `${nodeType} (${strategy})` : nodeType;
      const logicalOp = raw['Join Type'] ? `${raw['Join Type']} Join` : physicalOp;
      const loops = Math.max(1, raw['Actual Loops'] || 1);
      const rowsPerLoop = raw['Actual Rows'] ?? 0;
      const totalActualRows = (raw['Actual Rows'] !== undefined) ? rowsPerLoop * loops : 0;
      const planRows = raw['Plan Rows'] || 0;
      const hasActualRows = raw['Actual Rows'] !== undefined;

      const actualStartupMs = raw['Actual Startup Time'];
      const actualTotalMs = raw['Actual Total Time'];
      const cumElapsedMs = (actualTotalMs !== undefined) ? actualTotalMs * loops : 0;

      const nodeBuffers = extractBuffers(raw);
      stmtBuffers = addBuffers(stmtBuffers, nodeBuffers);

      // Process children first to calculate self/exclusive time and child buffers
      const rawChildren = raw.Plans || [];
      const children: PlanNode[] = rawChildren.map(convertNode);

      let childCumElapsedMs = 0;
      let childBuffers: PgBufferCounters = {
        sharedHit: 0,
        sharedRead: 0,
        sharedDirtied: 0,
        sharedWritten: 0,
        localHit: 0,
        localRead: 0,
        localDirtied: 0,
        localWritten: 0,
        tempRead: 0,
        tempWritten: 0,
      };

      for (const kid of children) {
        if (kid.actualElapsedMs) {
          childCumElapsedMs += kid.actualElapsedMs;
        }
        if (kid.pg?.buffers) {
          childBuffers = addBuffers(childBuffers, kid.pg.buffers);
        }
      }

      // Self/exclusive elapsed time
      const selfElapsedMs = hasAnalyze
        ? Math.max(0, cumElapsedMs - childCumElapsedMs)
        : 0;

      // Self buffers
      const selfBuffers = subtractBuffers(nodeBuffers, childBuffers);

      // Skew detection
      let hasCardinalitySkew = false;
      let skewRatio = 1;
      let skewReason = '';
      if (hasActualRows && planRows > 0) {
        skewRatio = totalActualRows / planRows;
        if (skewRatio > 10.0 || (totalActualRows > 0 && skewRatio < 0.1)) {
          hasCardinalitySkew = true;
          skewReason = `Cardinality Skew: ${totalActualRows.toLocaleString()} actual rows vs ${planRows.toLocaleString()} estimated (${skewRatio.toFixed(1)}x error). Run ANALYZE on ${raw['Relation Name'] || 'table'}.`;
        }
      }

      // Cost percentage relative to statement
      let costPercentage = 0;
      if (totalCost > 0) {
        costPercentage = Math.min(100, (raw['Total Cost'] / totalCost) * 100);
      }

      // Self cost share
      const childTotalCost = (raw.Plans || []).reduce((acc, c) => acc + (c['Total Cost'] || 0), 0);
      const ownCost = Math.max(0, raw['Total Cost'] - childTotalCost);

      // Badges
      const badges: PgNodeBadge[] = [];
      if (raw['Sort Method']) {
        const isSpill = (raw['Sort Space Type'] || '').toLowerCase().includes('disk');
        badges.push({
          label: isSpill ? `Disk Spill (${Math.round((raw['Sort Space Used'] || 0))} KB)` : `${raw['Sort Method']} (${Math.round((raw['Sort Space Used'] || 0))} KB)`,
          tone: isSpill ? 'bad' : 'info',
          title: `Sort Method: ${raw['Sort Method']}, Space: ${raw['Sort Space Used']} KB (${raw['Sort Space Type']})`,
        });
      }
      if (raw['Hash Batches'] && raw['Hash Batches'] > 1) {
        badges.push({
          label: `Hash Spilled (${raw['Hash Batches']} batches)`,
          tone: 'bad',
          title: `Hash join spilled to disk into ${raw['Hash Batches']} batches (original: ${raw['Original Hash Batches'] || 1})`,
        });
      }
      if (raw['Lossy Heap Blocks'] && raw['Lossy Heap Blocks'] > 0) {
        badges.push({
          label: `Lossy Blocks (${raw['Lossy Heap Blocks']})`,
          tone: 'warn',
          title: `Bitmap heap scan exceeded work_mem and became lossy (${raw['Lossy Heap Blocks']} lossy blocks)`,
        });
      }
      if (raw['Heap Fetches'] && raw['Heap Fetches'] > 1000) {
        badges.push({
          label: `${raw['Heap Fetches'].toLocaleString()} Heap Fetches`,
          tone: 'warn',
          title: `Index Only Scan had to fetch ${raw['Heap Fetches'].toLocaleString()} heap pages because visibility map is stale. Run VACUUM.`,
        });
      }
      if (raw['Rows Removed by Filter'] && raw['Rows Removed by Filter'] > 5000) {
        badges.push({
          label: `Filter Removed ${raw['Rows Removed by Filter'].toLocaleString()}`,
          tone: 'warn',
          title: `Predicate discarded ${raw['Rows Removed by Filter'].toLocaleString()} rows sequentially. Missing index!`,
        });
      }
      if (raw['Workers Planned'] && raw['Workers Planned'] > (raw['Workers Launched'] || 0)) {
        badges.push({
          label: `Worker Shortage (${raw['Workers Launched'] || 0}/${raw['Workers Planned']})`,
          tone: 'warn',
          title: `Planned ${raw['Workers Planned']} parallel workers, but only ${raw['Workers Launched'] || 0} launched. max_parallel_workers exhausted.`,
        });
      }

      // Target table/relation
      const relation = raw['Relation Name'] || '';
      const schema = raw.Schema || 'public';
      const indexName = raw['Index Name'] || '';

      // Pain points
      let isPainPoint = false;
      let painReason = '';
      const opLower = physicalOp.toLowerCase();
      if (opLower.includes('seq scan') && totalActualRows > 5000) {
        isPainPoint = true;
        painReason = `Sequential Scan on ${relation} processed ${totalActualRows.toLocaleString()} rows. Consider adding an index.`;
      } else if (badges.some((b) => b.tone === 'bad')) {
        isPainPoint = true;
        painReason = badges.find((b) => b.tone === 'bad')?.title || 'Memory spill to disk';
      } else if (hasCardinalitySkew) {
        isPainPoint = true;
        painReason = skewReason;
      } else if (costPercentage > 40) {
        isPainPoint = true;
        painReason = `High subtree cost (${costPercentage.toFixed(1)}% of query cost).`;
      }

      // Predicates
      const filter = raw.Filter || raw['Join Filter'] || '';
      const indexCond = raw['Index Cond'] || raw['Recheck Cond'] || '';

      // Output columns
      const outputCols: string[] = raw.Output || [];

      // Logical reads / physical reads equivalent in PG
      // Shared Hit = Logical reads served from RAM cache
      // Shared Read = Physical reads from disk/OS cache
      const actualLogicalReads = nodeBuffers.sharedHit + nodeBuffers.sharedRead;
      const actualPhysicalReads = nodeBuffers.sharedRead;

      const pgInfo: PgNodeInfo = {
        nodeType,
        strategy,
        partialMode: raw['Partial Mode'],
        joinType: raw['Join Type'],
        parallelAware: !!raw['Parallel Aware'],
        parentRelationship: raw['Parent Relationship'],
        subplanName: raw['Subplan Name'],
        relation,
        schema,
        alias: raw.Alias,
        indexName,
        scanDirection: raw['Scan Direction'],
        loops,
        neverExecuted: hasAnalyze && loops === 0,
        hasTiming: hasAnalyze,
        startupCost: raw['Startup Cost'] || 0,
        totalCost: raw['Total Cost'] || 0,
        planRows,
        planWidth: raw['Plan Width'] || 0,
        rowsPerLoop,
        actualStartupMs,
        actualTotalMs,
        rowsRemovedByFilter: raw['Rows Removed by Filter'],
        rowsRemovedByIndexRecheck: raw['Rows Removed by Index Recheck'],
        rowsRemovedByJoinFilter: raw['Rows Removed by Join Filter'],
        heapFetches: raw['Heap Fetches'],
        exactHeapBlocks: raw['Exact Heap Blocks'],
        lossyHeapBlocks: raw['Lossy Heap Blocks'],
        sortMethod: raw['Sort Method'],
        sortSpaceKb: raw['Sort Space Used'],
        sortSpaceType: raw['Sort Space Type'],
        hashBuckets: raw['Hash Buckets'],
        hashBatches: raw['Hash Batches'],
        originalHashBatches: raw['Original Hash Batches'],
        peakMemoryKb: raw['Peak Memory Usage'],
        workersPlanned: raw['Workers Planned'],
        workersLaunched: raw['Workers Launched'],
        filter,
        indexCond,
        recheckCond: raw['Recheck Cond'],
        hashCond: raw['Hash Cond'],
        mergeCond: raw['Merge Cond'],
        joinFilter: raw['Join Filter'],
        buffers: nodeBuffers,
        selfBuffers,
        ioReadMs: raw['I/O Read Time'] || 0,
        ioWriteMs: raw['I/O Write Time'] || 0,
        hasBuffers: (nodeBuffers.sharedHit + nodeBuffers.sharedRead + nodeBuffers.tempRead + nodeBuffers.tempWritten) > 0,
      };

      // Built-in PG Property list for the inspector
      const pgProps: PgNodeProp[] = [
        { name: 'Node Type', value: nodeType },
        { name: 'Total Cost', value: `${raw['Total Cost'].toFixed(2)} (${costPercentage.toFixed(1)}%)`, highlight: costPercentage > 35 ? 'cost' : 'normal' },
        { name: 'Startup Cost', value: (raw['Startup Cost'] || 0).toFixed(2) },
        { name: 'Estimated Rows', value: planRows.toLocaleString(), highlight: hasCardinalitySkew ? 'skew' : 'normal' },
        { name: 'Actual Rows', value: hasActualRows ? `${totalActualRows.toLocaleString()} (${loops} loop${loops > 1 ? 's' : ''})` : 'N/A' },
        ...(hasActualRows ? [{ name: 'Actual Total Time', value: `${cumElapsedMs.toFixed(3)} ms (${selfElapsedMs.toFixed(3)} ms self)` }] : []),
        ...(nodeBuffers.sharedHit > 0 ? [{ name: 'Shared Hit Blocks (RAM)', value: `${nodeBuffers.sharedHit.toLocaleString()} (${((nodeBuffers.sharedHit * 8) / 1024).toFixed(2)} MB)` }] : []),
        ...(nodeBuffers.sharedRead > 0 ? [{ name: 'Shared Read Blocks (Disk)', value: `${nodeBuffers.sharedRead.toLocaleString()} (${((nodeBuffers.sharedRead * 8) / 1024).toFixed(2)} MB)` }] : []),
        ...(nodeBuffers.tempRead > 0 || nodeBuffers.tempWritten > 0 ? [{ name: 'Temp Blocks (Spill)', value: `Read: ${nodeBuffers.tempRead}, Written: ${nodeBuffers.tempWritten}` }] : []),
        ...(relation ? [{ name: 'Target Table', value: schema ? `${schema}.${relation}` : relation }] : []),
        ...(indexName ? [{ name: 'Target Index', value: indexName }] : []),
        ...(filter ? [{ name: 'Filter Predicate', value: filter }] : []),
        ...(indexCond ? [{ name: 'Index Condition', value: indexCond }] : []),
      ];

      return {
        nodeId: curId,
        physicalOp,
        logicalOp,
        estimateRows: planRows,
        estimatedRowsRead: planRows,
        estimateCpu: ownCost * 0.5,
        estimateIo: ownCost * 0.5,
        estimatedTotalSubtreeCost: totalCost,
        tableCardinality: planRows,
        parallel: !!raw['Parallel Aware'],
        costPercentage,
        database: 'PostgreSQL',
        schema,
        table: relation,
        index: indexName,
        indexKind: indexName ? 'B-Tree' : '',
        seekPredicates: indexCond,
        predicate: filter,
        outputColumns: outputCols,
        warnings: [],
        operatorWarnings: badges.map((b) => ({ kind: b.label, description: b.title || b.label })),
        estimateRebinds: 0,
        estimateRewinds: 0,
        executionMode: raw['Parallel Aware'] ? 'Parallel' : 'Row',
        actualExecutionMode: raw['Parallel Aware'] ? 'Parallel' : 'Row',
        hasActualRows,
        actualRows: totalActualRows,
        actualLogicalReads,
        actualPhysicalReads,
        actualReadAheads: 0,
        actualScans: opLower.includes('scan') ? 1 : 0,
        actualCpuMs: selfElapsedMs,
        actualElapsedMs: cumElapsedMs,
        selfElapsedMs,
        selfCpuMs: selfElapsedMs,
        selfElapsedPercent: executionMs > 0 ? Math.round((selfElapsedMs / executionMs) * 1000) / 10 : 0,
        selfCpuPercent: executionMs > 0 ? Math.round((selfElapsedMs / executionMs) * 1000) / 10 : 0,
        heatIntensity: executionMs > 0 ? Math.min(1, selfElapsedMs / Math.max(1, executionMs)) : (costPercentage / 100),
        hasCardinalitySkew,
        skewRatio,
        skewReason,
        isPainPoint,
        painReason,
        children,
        pg: pgInfo,
        pgProps,
        pgBadges: badges,
      } as unknown as PlanNode;
    };

    const rootNode = convertNode(rawPlan);

    const effectiveQuery = rootItem.Query || extractedQuery;
    const stmtType = effectiveQuery ? extractStmtType(effectiveQuery) : 'EXPLAIN';
    const stmtText = effectiveQuery || `EXPLAIN Plan (Cost: ${totalCost.toFixed(2)}, Execution: ${executionMs.toFixed(2)} ms)`;

    const stmtAnalysis: StatementAnalysis = {
      statementId: stmtId,
      statementCompId: `pg-${stmtId}`,
      statementType: stmtType,
      statementText: stmtText,
      statementSubTreeCost: totalCost,
      statementEstRows: rawPlan['Plan Rows'] || 0,
      costPercentage: 100, // normalized later across statements
      compileTimeMs: Math.round(planningMs),
      compileCpuMs: Math.round(planningMs),
      compileMemoryKb: 0,
      optimizationLevel: 'Postgres Optimizer',
      hasQueryPlan: true,
      rootNode,
      warnings: [],
      missingIndexes: [],
      painPointsCount: 0,
      actualCpuMs: Math.round(executionMs),
      actualElapsedMs: Math.round(executionMs),
      actualLogicalReads: stmtBuffers.sharedHit + stmtBuffers.sharedRead,
      actualLogicalReadsMb: Math.round(((stmtBuffers.sharedHit + stmtBuffers.sharedRead) * 8 / 1024) * 10) / 10,
      actualPhysicalReads: stmtBuffers.sharedRead,
      actualReadAheads: 0,
      hasActualMetrics: hasAnalyze,
      executionClassification: stmtBuffers.sharedRead > 500 ? 'IO_BOUND' : 'CPU_BOUND',
      executionClassificationReason: stmtBuffers.sharedRead > 500 ? 'High shared block disk reads' : 'Balanced in-memory execution',
      traceFlags: [],
      parameters: [],
      nodeWaitStats: [],
      pg: {
        planningMs,
        executionMs,
        hasAnalyze,
        hasBuffers: (stmtBuffers.sharedHit + stmtBuffers.sharedRead) > 0,
        jit: rootItem.JIT ? {
          functions: rootItem.JIT.Functions,
          totalMs: rootItem.JIT.Timing?.Total,
          generationMs: rootItem.JIT.Timing?.Generation,
          inliningMs: rootItem.JIT.Timing?.Inlining,
          optimizationMs: rootItem.JIT.Timing?.Optimization,
          emissionMs: rootItem.JIT.Timing?.Emission,
        } : undefined,
        triggers: (rootItem.Triggers || []).map((t) => ({
          name: t['Trigger Name'],
          relation: t.Relation,
          timeMs: t.Time,
          calls: t.Calls,
        })),
        settings: rootItem.Settings,
        queryId: rootItem['Query Identifier'] ? String(rootItem['Query Identifier']) : undefined,
        totalBuffers: stmtBuffers,
        queryTextProvided: !!effectiveQuery,
      },
    } as unknown as StatementAnalysis;

    statements.push(stmtAnalysis);
  });

  // Calculate total costs & percentages across statements
  const totalSubTreeCost = statements.reduce((acc, s) => acc + s.statementSubTreeCost, 0);
  statements.forEach((s) => {
    if (totalSubTreeCost > 0) {
      s.costPercentage = (s.statementSubTreeCost / totalSubTreeCost) * 100;
    }
  });

  // Detect PostgreSQL bottlenecks and missing indexes
  const missingIndexes = detectPgMissingIndexes(statements);
  statements.forEach((s) => {
    s.missingIndexes = missingIndexes.filter((mi) => mi.statementId === s.statementId);
  });

  // Build Table I/O Leaderboard from buffers
  const topIoLeaders = buildPgIoLeaders(statements);

  // Hardware Metrics
  const totalLogicalReads = statements.reduce((acc, s) => acc + (s.actualLogicalReads || 0), 0);
  const totalPhysicalReads = statements.reduce((acc, s) => acc + (s.actualPhysicalReads || 0), 0);
  const totalElapsedMs = statements.reduce((acc, s) => acc + (s.actualElapsedMs || 0), 0);

  const hardwareMetrics: HardwareMetrics = {
    hasRuntimeMetrics: statements.some((s) => s.hasActualMetrics),
    totalLogicalReads,
    totalLogicalReadsMb: Math.round((totalLogicalReads * 8 / 1024) * 10) / 10,
    totalPhysicalReads,
    totalPhysicalReadsMb: Math.round((totalPhysicalReads * 8 / 1024) * 10) / 10,
    totalReadAheads: 0,
    totalReadAheadsMb: 0,
    totalLobLogicalReads: 0,
    totalLobPhysicalReads: 0,
    cacheHitRatioPercent: totalLogicalReads > 0
      ? Math.max(0, Math.min(100, Math.round(((totalLogicalReads - totalPhysicalReads) / totalLogicalReads) * 1000) / 10))
      : 100,
    totalActualCpuMs: totalElapsedMs,
    totalActualElapsedMs: totalElapsedMs,
    cpuUtilizationRatio: 100,
    waitTimeMs: 0,
    memoryGrantWaitTimeMs: 0,
    requestedMemoryKb: 0,
    grantedMemoryKb: 0,
    maxUsedMemoryKb: 0,
    maxQueryMemoryKb: 0,
    estimatedAvailableMemoryKb: 0,
    estimatedPagesCached: 0,
    isMemoryGrantFeedbackAdjusted: 'None',
    topIoLeaders,
  };

  // Executive Root Cause Verdict
  const executiveVerdict = generatePgExecutiveVerdict(statements, totalSubTreeCost);

  // Buffer Pool / PLE Risk Assessment (adapted for Postgres shared_buffers)
  const pleRiskReport = evaluatePgBufferRisk(statements);

  // Diagnostics Health Analysis
  const diagnostics = generatePgDiagnostics(statements, missingIndexes);

  const analysisResult = {
    engine: 'postgresql',
    planName,
    totalStatements: statements.length,
    totalSubTreeCost,
    maxDopReason: '',
    statements,
    waitStats: [],
    allMissingIndexes: missingIndexes,
    antiPatterns: [],
    executiveVerdict,
    diagnostics,
    hardwareMetrics,
    pleRiskReport,
    cachedPlanSizeKb: 0,
    maxCompileMemory: 0,
    globalWarnings: [],
  } as unknown as PlanAnalysis;

  (analysisResult as any).findings = applyFindingsAndWaitInsights(analysisResult);
  return analysisResult;
}

function extractStmtType(sql: string): string {
  const match = sql.trim().match(/^(SELECT|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXPLAIN)\b/i);
  return match ? match[1].toUpperCase() : 'SELECT';
}

/** Walk plan nodes looking for Seq Scans with selective filters to recommend indexes */
function detectPgMissingIndexes(statements: StatementAnalysis[]): any[] {
  const missing: any[] = [];
  statements.forEach((stmt) => {
    const walk = (node: PlanNode | undefined) => {
      if (!node) return;
      const op = node.physicalOp.toLowerCase();
      if (op.includes('seq scan') && node.table && (node.actualRows || node.estimateRows) > 2000) {
        const filter = node.predicate || '';
        const removed = (node.pg?.rowsRemovedByFilter || 0);
        if (filter || removed > 1000) {
          // Extract column candidates from filter
          const cols = extractFilterColumns(filter);
          const colList = cols.length > 0 ? cols : ['id'];
          const idxName = `idx_${node.table.toLowerCase()}_${colList.join('_').slice(0, 30)}`;
          const ddl = `CREATE INDEX CONCURRENTLY ${idxName} ON ${node.schema || 'public'}.${node.table} (${colList.join(', ')});`;

          missing.push({
            statementId: stmt.statementId,
            impact: Math.min(95, Math.round(removed > 5000 ? 90 : 75)),
            database: 'postgres',
            schema: node.schema || 'public',
            table: node.table,
            equalityColumns: colList,
            inequalityColumns: [],
            includeColumns: [],
            suggestedDdl: ddl,
          });
        }
      }
      if (node.children) node.children.forEach(walk);
    };
    walk(stmt.rootNode);
  });
  return missing;
}

function extractFilterColumns(filter: string): string[] {
  if (!filter) return [];
  // Match simple patterns like (col = 123) or ((col)::text = ...)
  const matches = filter.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(=|<|>|LIKE|ILIKE|IN)\b/gi) || [];
  const cols = new Set<string>();
  matches.forEach((m) => {
    const col = m.split(/\s+/)[0].replace(/[()]/g, '');
    if (col && !['and', 'or', 'not', 'true', 'false', 'null'].includes(col.toLowerCase())) {
      cols.add(col);
    }
  });
  return Array.from(cols).slice(0, 4);
}

function buildPgIoLeaders(statements: StatementAnalysis[]): TableIOLeader[] {
  const map = new Map<string, {
    database: string;
    schema: string;
    table: string;
    logicalReads: number;
    physicalReads: number;
    ops: Set<string>;
    indexes: Set<string>;
  }>();

  statements.forEach((s) => {
    const walk = (n: PlanNode | undefined) => {
      if (!n) return;
      if (n.table) {
        const key = `${n.schema || 'public'}.${n.table}`;
        let item = map.get(key);
        if (!item) {
          item = {
            database: 'postgres',
            schema: n.schema || 'public',
            table: n.table,
            logicalReads: 0,
            physicalReads: 0,
            ops: new Set(),
            indexes: new Set(),
          };
          map.set(key, item);
        }
        item.logicalReads += n.actualLogicalReads || 0;
        item.physicalReads += n.actualPhysicalReads || 0;
        item.ops.add(n.physicalOp);
        if (n.index) item.indexes.add(n.index);
      }
      if (n.children) n.children.forEach(walk);
    };
    walk(s.rootNode);
  });

  const totalLogical = Array.from(map.values()).reduce((a, b) => a + b.logicalReads, 0);

  return Array.from(map.values())
    .sort((a, b) => b.logicalReads - a.logicalReads)
    .map((item, idx) => ({
      rank: idx + 1,
      database: item.database,
      schema: item.schema,
      table: item.table,
      logicalReads: item.logicalReads,
      logicalReadsMb: Math.round((item.logicalReads * 8 / 1024) * 10) / 10,
      physicalReads: item.physicalReads,
      physicalReadsMb: Math.round((item.physicalReads * 8 / 1024) * 10) / 10,
      readAheads: 0,
      readAheadsMb: 0,
      readPercent: totalLogical > 0 ? Math.round((item.logicalReads / totalLogical) * 1000) / 10 : 0,
      accessOperations: Array.from(item.ops),
      indexesUsed: Array.from(item.indexes),
    }));
}

function generatePgExecutiveVerdict(statements: StatementAnalysis[], totalCost: number): ExecutiveVerdict | undefined {
  if (statements.length === 0) return undefined;
  const culpritStmt = statements[0];

  // Find the single node with the highest exclusive self-time or cost
  let maxNode: PlanNode | null = null;
  let maxTimeOrCost = -1;

  const walk = (n: PlanNode | undefined) => {
    if (!n) return;
    const metric = n.selfElapsedMs || (n.estimatedTotalSubtreeCost * 0.1);
    if (metric > maxTimeOrCost) {
      maxTimeOrCost = metric;
      maxNode = n;
    }
    if (n.children) n.children.forEach(walk);
  };
  walk(culpritStmt.rootNode);

  const topOp = maxNode ? (maxNode as PlanNode).physicalOp : 'Query';
  const table = maxNode && (maxNode as PlanNode).table ? ` on ${(maxNode as PlanNode).table}` : '';
  const costPct = Math.round(culpritStmt.costPercentage);

  let actionableFix = 'Run EXPLAIN (ANALYZE, BUFFERS) and verify indexes on filtered and join columns.';
  if (topOp.toLowerCase().includes('seq scan')) {
    actionableFix = `Create an index on ${(maxNode as any)?.table || 'the scanned table'} to convert Seq Scan to an Index Scan or Index Only Scan.`;
  } else if (topOp.toLowerCase().includes('sort') && (maxNode as any)?.pg?.sortSpaceType === 'Disk') {
    actionableFix = `Increase work_mem (currently spills to disk) or add an index matching the ORDER BY clause.`;
  } else if ((maxNode as any)?.hasCardinalitySkew) {
    actionableFix = `Run ANALYZE ${(maxNode as any)?.table || ''} to update stale column distribution statistics.`;
  }

  return {
    culpritStatementId: culpritStmt.statementId,
    costPercentage: costPct,
    headline: `PostgreSQL Query #${culpritStmt.statementId} Bottleneck: ${topOp}${table} dominates execution`,
    summary: `The query spent most of its time/cost in ${topOp}${table}. ${
      (maxNode as any)?.selfElapsedMs
        ? `Operator self-time is ${((maxNode as any).selfElapsedMs).toFixed(2)} ms.`
        : `Operator cost is ${(maxNode as any)?.estimatedTotalSubtreeCost.toFixed(2)}.`
    }`,
    topOperator: topOp,
    actionableFix,
  };
}

function evaluatePgBufferRisk(statements: StatementAnalysis[]): PLERiskAssessment {
  let totalLogicalReads = 0;
  let totalPhysicalReads = 0;
  const scanOps: string[] = [];

  statements.forEach((s) => {
    totalLogicalReads += s.actualLogicalReads || 0;
    totalPhysicalReads += s.actualPhysicalReads || 0;
    const walk = (n: PlanNode | undefined) => {
      if (!n) return;
      if (n.physicalOp.toLowerCase().includes('seq scan') && n.table) {
        scanOps.push(`Seq Scan on ${n.table}`);
      }
      if (n.children) n.children.forEach(walk);
    };
    walk(s.rootNode);
  });

  const scanVolumeMb = Math.round(((totalLogicalReads * 8) / 1024) * 10) / 10;
  const physicalMb = Math.round(((totalPhysicalReads * 8) / 1024) * 10) / 10;

  if (scanVolumeMb > 500 || scanOps.length >= 2) {
    return {
      riskLevel: 'HIGH',
      score: 75,
      headline: 'High shared_buffers Ingestion & Cache Eviction Threat',
      summary: `Query touches ~${scanVolumeMb} MB of buffer pages (${physicalMb} MB read from physical disk). Repeated execution will flush hot tables out of PostgreSQL shared_buffers.`,
      estimatedScanVolumeMb: scanVolumeMb,
      bufferPoolEvictionRisk: 'High (~15-30% shared_buffers eviction per run)',
      culpritOperators: Array.from(new Set(scanOps)),
      mitigationAction: 'Add covering indexes to replace Sequential Scans with Index Seeks/Scans.',
    };
  }

  if (scanVolumeMb > 50 || scanOps.length > 0) {
    return {
      riskLevel: 'MODERATE',
      score: 40,
      headline: 'Moderate Buffer Cache Footprint',
      summary: `Query ingests ~${scanVolumeMb} MB into PostgreSQL shared_buffers. Monitor during peak production concurrency.`,
      estimatedScanVolumeMb: scanVolumeMb,
      bufferPoolEvictionRisk: 'Moderate (~3-10% buffer eviction)',
      culpritOperators: Array.from(new Set(scanOps)),
      mitigationAction: 'Review Seq Scans to ensure they are intended and narrow filter selectivity.',
    };
  }

  return {
    riskLevel: 'LOW',
    score: 10,
    headline: 'Optimal shared_buffers Footprint',
    summary: 'Minimal page reads. Query accesses data efficiently through index scans with high cache hit ratio.',
    estimatedScanVolumeMb: scanVolumeMb,
    bufferPoolEvictionRisk: 'Negligible (<1% buffer eviction)',
    culpritOperators: [],
    mitigationAction: 'No buffer tuning required.',
  };
}

function generatePgDiagnostics(statements: StatementAnalysis[], missingIndexes: any[]): AdvancedDiagnostics {
  const nonSargable: NonSargableFinding[] = [];
  const keyLookups: KeyLookupFinding[] = [];
  const spools: SpoolFinding[] = [];
  const missingStats: MissingStatsFinding[] = [];
  const rowGoals: RowGoalFinding[] = [];

  statements.forEach((stmt) => {
    const walk = (n: PlanNode | undefined) => {
      if (!n) return;

      // Filter predicate warnings (non-sargable / scan with filter)
      if (n.predicate && n.physicalOp.toLowerCase().includes('seq scan')) {
        nonSargable.push({
          statementId: stmt.statementId,
          nodeId: n.nodeId,
          physicalOp: n.physicalOp,
          table: n.table,
          index: '',
          functions: [],
          leadingWildcard: n.predicate.includes('%'),
          predicate: n.predicate,
          tableCardinality: n.tableCardinality,
          costPercent: n.costPercentage,
          severity: 'HIGH',
          description: `Sequential Scan applies filter "${n.predicate}" row-by-row on ${n.table}.`,
          remedy: `Create index on ${n.table} covering the filter columns.`,
        });
      }

      // Spool / Materialize / Sort Spills
      if (n.physicalOp.toLowerCase().includes('materialize') || n.physicalOp.toLowerCase().includes('sort')) {
        const isSpill = (n.pg?.sortSpaceType || '').toLowerCase().includes('disk') || ((n.pg?.hashBatches || 0) > 1);
        spools.push({
          statementId: stmt.statementId,
          nodeId: n.nodeId,
          physicalOp: n.physicalOp,
          logicalOp: n.logicalOp,
          kind: isSpill ? 'Disk Spill' : 'In-Memory Buffer',
          purpose: isSpill ? 'Postgres work_mem exceeded, spilled to temporary disk files' : 'Materialized intermediate rows',
          table: n.table || 'worktable',
          estimateRows: n.estimateRows,
          estimateRebinds: 0,
          estimateRewinds: 0,
          actualRows: n.actualRows,
          actualRebinds: 0,
          actualRewinds: 0,
          hasActualRows: n.hasActualRows,
          costPercent: n.costPercentage,
          severity: isSpill ? 'CRITICAL' : 'INFO',
          description: isSpill
            ? `${n.physicalOp} exceeded work_mem and spilled ${n.pg?.sortSpaceKb || 0} KB to disk.`
            : `${n.physicalOp} buffered ${n.actualRows.toLocaleString()} rows in RAM.`,
          remedy: isSpill ? 'Increase work_mem or tune query ORDER BY / Hash join.' : 'Safe.',
        });
      }

      // Skew / Missing Stats
      if (n.hasCardinalitySkew && n.table) {
        missingStats.push({
          statementId: stmt.statementId,
          nodeId: n.nodeId,
          database: 'postgres',
          schema: n.schema || 'public',
          table: n.table,
          columns: [],
          severity: 'CRITICAL',
          description: n.skewReason || `Cardinality estimation error on ${n.table}.`,
          remedy: `Run: ANALYZE ${n.schema || 'public'}.${n.table};`,
          suggestedDdl: `ANALYZE ${n.schema || 'public'}.${n.table};`,
        });
      }

      // Limit / Row Goals
      if (n.physicalOp.toLowerCase().includes('limit')) {
        rowGoals.push({
          statementId: stmt.statementId,
          nodeId: n.nodeId,
          physicalOp: 'Limit',
          source: 'LIMIT clause',
          estimateRows: n.estimateRows,
          estimateRowsWithoutGoal: n.estimateRows * 10,
          actualRows: n.actualRows,
          hasActualRows: n.hasActualRows,
          reductionFactor: 10,
          misfired: false,
          severity: 'INFO',
          description: `Query limited to ${n.actualRows || n.estimateRows} rows.`,
          remedy: 'Ensure supporting index exists on ORDER BY keys to stop scan early.',
        });
      }

      if (n.children) n.children.forEach(walk);
    };
    walk(stmt.rootNode);
  });

  // Calculate health score (0 - 100)
  let healthScore = 100;
  if (missingStats.length > 0) healthScore -= 20;
  if (spools.some((s) => s.severity === 'CRITICAL')) healthScore -= 25;
  if (missingIndexes.length > 0) healthScore -= 20;
  if (nonSargable.length > 0) healthScore -= 10;
  healthScore = Math.max(15, Math.min(100, healthScore));

  const scoreGrade = healthScore >= 90 ? 'A' : healthScore >= 75 ? 'B' : healthScore >= 60 ? 'C' : healthScore >= 40 ? 'D' : 'F';

  return {
    implicitConversions: [],
    consolidatedIndexes: [],
    scalarUdfWarnings: [],
    keyLookups,
    spools,
    missingStatistics: missingStats,
    parameterSniffing: [],
    nonSargable,
    rowGoals,
    healthScore,
    scoreGrade,
  };
}
