/**
 * Benefit-scored findings engine, modelled on PerformanceStudio's PlanAnalyzer + BenefitScorer.
 * Each finding carries `maxBenefitPercent`: the most elapsed time (as a % of the statement)
 * that could be saved by fixing it (null when it can't be quantified).
 */
import { PlanAnalysis, StatementAnalysis, PlanNode } from '../types/plan';

export type FindingSeverity = 'Critical' | 'Warning' | 'Info';

export interface PlanFinding {
  ruleNumber: number;
  type: string;
  severity: FindingSeverity;
  message: string;
  statementId: string;
  nodeId?: number;
  maxBenefitPercent: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const cap = (n: number) => round1(Math.max(0, Math.min(100, n)));

// ---- Wait stats config (from PerformanceStudio WaitStats.json semantics) ----
const EXTERNAL_WAITS = new Set(['ASYNC_NETWORK_IO', 'SOS_SCHEDULER_YIELD']);
const DIRECT_WAITS = new Set(['RESOURCE_SEMAPHORE', 'ASYNC_NETWORK_IO', 'RESOURCE_SEMAPHORE_QUERY_COMPILE']);
const SHOW_AVG_PREFIX = ['PAGEIOLATCH_', 'WRITELOG', 'IO_COMPLETION', 'ASYNC_IO_COMPLETION', 'LCK_M_', 'PAGELATCH_', 'ASYNC_NETWORK_IO'];

export function waitTimeModel(waitType: string): 'direct' | 'cpu time based' | 'elapsed time based' {
  if (DIRECT_WAITS.has(waitType)) return 'direct';
  if (waitType.startsWith('PREEMPTIVE_') || EXTERNAL_WAITS.has(waitType)) return 'cpu time based';
  return 'elapsed time based';
}

export function showAverageWait(waitType: string): boolean {
  return SHOW_AVG_PREFIX.some((p) => waitType.startsWith(p));
}

function stmtElapsed(stmt: any): number {
  return stmt.queryTimeStats?.elapsedTimeMs || stmt.actualElapsedMs || 0;
}

function ownElapsedMs(node: any): number {
  if (!node.hasActualRows) return 0;
  const el = node.actualElapsedMs || 0;
  if ((node.executionMode || '').toLowerCase() === 'batch') return el;
  const kids: any[] = node.children || [];
  const childSum = kids.reduce((a, c) => a + (c.actualElapsedMs || 0), 0);
  return Math.max(0, el - childSum);
}

/** benefit% from operator self-time (actual) or own cost share (estimated) */
function operatorBenefit(node: any, stmt: any): number | null {
  const ms = stmtElapsed(stmt);
  if (node.hasActualRows && ms > 0) return cap((ownElapsedMs(node) / ms) * 100);
  if (!node.hasActualRows && stmt.statementSubTreeCost > 0) {
    const kids: any[] = node.children || [];
    const own = Math.max(0, (node.estimatedTotalSubtreeCost || 0) - kids.reduce((a, c) => a + (c.estimatedTotalSubtreeCost || 0), 0));
    return cap((own / stmt.statementSubTreeCost) * 100);
  }
  return null;
}

function forEachNode(node: PlanNode | undefined, fn: (n: any) => void) {
  if (!node) return;
  fn(node);
  (node.children || []).forEach((c) => forEachNode(c, fn));
}

const isScan = (n: any) => /scan/i.test(n.physicalOp || '') && !/(constant|spool)/i.test(n.physicalOp || '');
const isTemp = (n: any) => /^\[?[#@]/.test(n.table || '');

function nodeFindings(node: any, stmt: any, out: PlanFinding[]) {
  const sid = String(stmt.statementId);
  const add = (f: Omit<PlanFinding, 'statementId' | 'nodeId'>) => out.push({ ...f, statementId: sid, nodeId: node.nodeId });
  const phys = node.physicalOp || '';
  const logical = node.logicalOp || '';

  // Rule 1: Filter operator
  if (phys === 'Filter' && node.predicate) {
    const kids: any[] = node.children || [];
    let benefit: number | null = null;
    const ms = stmtElapsed(stmt);
    if (node.hasActualRows && ms > 0 && kids.length) benefit = cap((Math.max(...kids.map((c) => c.actualElapsedMs || 0)) / ms) * 100);
    else if (!node.hasActualRows && stmt.statementSubTreeCost > 0 && kids.length)
      benefit = cap((kids.reduce((a, c) => a + (c.estimatedTotalSubtreeCost || 0), 0) / stmt.statementSubTreeCost) * 100);
    add({
      ruleNumber: 1,
      type: 'Filter Operator',
      severity: 'Warning',
      message: `Filter discards rows late in the plan${node.hasActualRows ? ` (${node.actualRows.toLocaleString()} rows out)` : ''}. Push the predicate down to the data access or index it so the child work is avoided.`,
      maxBenefitPercent: benefit,
    });
  }

  // Rule 2: Eager index spool
  if (phys === 'Index Spool' && /eager/i.test(logical)) {
    add({
      ruleNumber: 2,
      type: 'Eager Index Spool',
      severity: 'Warning',
      message: 'Optimizer is building a temporary index on the fly. Create a permanent index on the spooled columns.',
      maxBenefitPercent: operatorBenefit(node, stmt),
    });
  }

  // Rule 5: Row estimate mismatch (Cardinality Skew)
  if (node.hasCardinalitySkew) {
    add({
      ruleNumber: 5,
      type: 'Row Estimate Mismatch',
      severity: 'Critical',
      message: node.skewReason || `Severe cardinality error: ${node.actualRows?.toLocaleString()} actual vs ${node.estimateRows?.toLocaleString()} estimated (${node.skewRatio?.toFixed(0)}x error).`,
      maxBenefitPercent: operatorBenefit(node, stmt),
    });
  }

  // Rule 7: spills
  const spill = (node.operatorWarnings || []).find((w: any) => /Spill/i.test(w.kind));
  if (spill) {
    add({
      ruleNumber: 7,
      type: 'Spill',
      severity: 'Critical',
      message: `${phys} spilled to tempdb. ${spill.description} Fix cardinality estimates or increase memory grant.`,
      maxBenefitPercent: operatorBenefit(node, stmt),
    });
  }

  // Rule 10: lookups
  if (/lookup/i.test(phys)) {
    add({
      ruleNumber: 10,
      type: /rid/i.test(phys) ? 'RID Lookup' : 'Key Lookup',
      severity: 'Warning',
      message: `${phys} on ${node.table || 'table'}${node.hasActualRows ? ` executed for ${node.actualRows.toLocaleString()} rows` : ''}. Add the fetched columns as INCLUDE columns to the seeking index.`,
      maxBenefitPercent: operatorBenefit(node, stmt),
    });
  }

  // Rule 11: scan with residual predicate
  if (isScan(node) && node.predicate && !isTemp(node)) {
    add({
      ruleNumber: 11,
      type: 'Scan With Predicate',
      severity: 'Warning',
      message: `${phys} on ${node.table || 'table'} applies a residual predicate row by row. An index on the predicate columns would allow a seek.`,
      maxBenefitPercent: operatorBenefit(node, stmt),
    });
  }

  // Rule 14: lazy table spool rebind/rewind ratio
  if (phys === 'Table Spool' && /lazy/i.test(logical) && node.hasActualRows) {
    const rebinds = node.actualRebinds || 0;
    const rewinds = node.actualRewinds || 0;
    if (rebinds > 0 && rebinds >= rewinds) {
      add({
        ruleNumber: 14,
        type: 'Lazy Spool Ineffective',
        severity: 'Warning',
        message: `Lazy spool rebinds (${rebinds.toLocaleString()}) outnumber rewinds (${rewinds.toLocaleString()}), so the spool is rebuilt instead of reused.`,
        maxBenefitPercent: null,
      });
    }
  }

  // Rule 16: nested loops high inner executions
  if (phys === 'Nested Loops' && (node.children || []).length >= 2) {
    const inner = node.children[1];
    const execs = inner.actualExecutions || 0;
    if (execs >= 1000) {
      const ms = stmtElapsed(stmt);
      let benefit: number | null = null;
      if (inner.hasActualRows && ms > 0 && inner.actualElapsedMs > 0) benefit = cap((inner.actualElapsedMs / ms) * 100);
      add({
        ruleNumber: 16,
        type: 'Nested Loops High Executions',
        severity: execs >= 100000 ? 'Critical' : 'Warning',
        message: `Inner side of Nested Loops (Node ${inner.nodeId}) executed ${execs.toLocaleString()} times. Consider a hash/merge join or supporting index.`,
        maxBenefitPercent: benefit,
      });
    }
  }

  // Rule 17: many-to-many merge join
  if (node.manyToMany) {
    add({
      ruleNumber: 17,
      type: 'Many-to-Many Merge Join',
      severity: 'Warning',
      message: 'Merge join is many-to-many and uses a worktable in tempdb. Ensure at least one input is unique on the join keys.',
      maxBenefitPercent: null,
    });
  }

  // Rule 22: table variable
  if (/^\[?@/.test(node.table || '')) {
    add({
      ruleNumber: 22,
      type: 'Table Variable',
      severity: 'Info',
      message: `Table variable ${node.table} has no statistics; the optimizer guesses 1 row. Consider a #temp table for larger sets.`,
      maxBenefitPercent: null,
    });
  }

  // Rule 23: table-valued function
  if (/table-valued function/i.test(phys)) {
    add({
      ruleNumber: 23,
      type: 'Table-Valued Function',
      severity: 'Info',
      message: 'Multi-statement table-valued function is a black box to the optimizer. Convert to an inline TVF.',
      maxBenefitPercent: null,
    });
  }

  // Rule 24: top above scan
  if (phys === 'Top' && (node.children || []).some((c: any) => isScan(c))) {
    add({
      ruleNumber: 24,
      type: 'Top Above Scan',
      severity: 'Info',
      message: 'TOP sits directly above a scan; an index matching the ORDER BY lets SQL Server stop early.',
      maxBenefitPercent: null,
    });
  }
}

function statementFindings(stmt: any, out: PlanFinding[]) {
  const sid = String(stmt.statementId);
  const add = (f: Omit<PlanFinding, 'statementId'>) => out.push({ ...f, statementId: sid });
  const ms = stmtElapsed(stmt);
  const text: string = stmt.statementText || '';

  // Rule 3: serial plan
  if (stmt.nonParallelPlanReason && stmt.rootNode) {
    let benefit: number | null = null;
    if (ms > 0 && stmt.actualCpuMs > 0 && stmt.statementSubTreeCost >= 1) {
      const dop = stmt.degreeOfParallelism > 1 ? stmt.degreeOfParallelism : 4;
      benefit = cap(((stmt.actualCpuMs * (dop - 1)) / dop / ms) * 100);
    }
    add({
      ruleNumber: 3,
      type: 'Serial Plan',
      severity: 'Info',
      message: `Plan runs serially: ${stmt.nonParallelPlanReason}.`,
      maxBenefitPercent: benefit,
    });
  }

  // Statement-level warnings (SpillToTempDb, PlanAffectingConvert)
  (stmt.warnings || []).forEach((w: any) => {
    if (/Spill/i.test(w.kind)) {
      add({
        ruleNumber: 7,
        type: 'TempDB Spill',
        severity: 'Critical',
        message: w.description || 'Operator spilled memory pages to TempDB due to insufficient memory grant.',
        maxBenefitPercent: ms > 0 && stmt.actualElapsedMs > stmt.actualCpuMs ? cap(((stmt.actualElapsedMs - stmt.actualCpuMs) / ms) * 100) : 15.0,
      });
    } else if (/Convert/i.test(w.kind)) {
      add({
        ruleNumber: 29,
        type: 'Plan Affecting Convert',
        severity: 'Warning',
        message: w.description || `Implicit type conversion on ${w.expression || 'column'} may prevent index seek.`,
        maxBenefitPercent: null,
      });
    }
  });

  // Rule 9: memory grant
  const mg = stmt.memoryGrantInfo;
  if (mg) {
    const grantMb = mg.grantedKb / 1024;
    if (mg.grantedKb >= 1048576 && mg.hasMaxUsed) {
      const usedNothing = mg.maxUsedKb <= 0;
      const ratio = usedNothing ? 0 : mg.grantedKb / mg.maxUsedKb;
      if (usedNothing || ratio >= 10) {
        add({
          ruleNumber: 9,
          type: 'Excessive Memory Grant',
          severity: 'Warning',
          message: usedNothing
            ? `Granted ${Math.round(grantMb).toLocaleString()} MB but the query used none of it.`
            : `Granted ${Math.round(grantMb).toLocaleString()} MB but only used ${Math.round(mg.maxUsedKb / 1024).toLocaleString()} MB (${Math.round(ratio)}x overestimate).`,
          maxBenefitPercent: null,
        });
      }
    }
    if (mg.grantWaitMs > 0) {
      add({
        ruleNumber: 9,
        type: 'Memory Grant Wait',
        severity: mg.grantWaitMs >= 5000 ? 'Critical' : 'Warning',
        message: `Query waited ${mg.grantWaitMs.toLocaleString()} ms for a memory grant before it could start.`,
        maxBenefitPercent: ms > 0 ? cap((mg.grantWaitMs / ms) * 100) : null,
      });
    }
    if (mg.grantedKb >= 1048576) {
      add({
        ruleNumber: 9,
        type: 'Large Memory Grant',
        severity: grantMb >= 4096 ? 'Critical' : 'Warning',
        message: `Query was granted ${Math.round(grantMb).toLocaleString()} MB of memory.`,
        maxBenefitPercent: null,
      });
    }
  }

  // Rule 18 / 19: compile
  if (/memory/i.test(stmt.earlyAbortReason || '')) {
    add({
      ruleNumber: 18,
      type: 'Compile Memory Exceeded',
      severity: 'Critical',
      message: 'Optimizer aborted early because compile memory was exceeded; the plan may be suboptimal. Simplify the query.',
      maxBenefitPercent: null,
    });
  }
  if ((stmt.compileCpuMs || 0) >= 1000) {
    add({
      ruleNumber: 19,
      type: 'High Compile CPU',
      severity: stmt.compileCpuMs >= 5000 ? 'Critical' : 'Warning',
      message: `Compiling this statement took ${stmt.compileCpuMs.toLocaleString()} ms of CPU.`,
      maxBenefitPercent: ms > 0 ? cap((stmt.compileCpuMs / ms) * 100) : null,
    });
  }

  // Rule 27: OPTIMIZE FOR UNKNOWN
  if (/OPTIMIZE\s+FOR\s*(\([^)]*UNKNOWN|UNKNOWN)/i.test(text)) {
    add({
      ruleNumber: 27,
      type: 'Optimize For Unknown',
      severity: 'Info',
      message: 'OPTIMIZE FOR UNKNOWN uses average density statistics, producing generic estimates for every parameter value.',
      maxBenefitPercent: null,
    });
  }

  // Rule 20: local variables without RECOMPILE
  if (!/RECOMPILE/i.test(text) && /\b(WHERE|ON|HAVING)\b/i.test(text)) {
    const known = new Set((stmt.parameters || []).map((p: any) => String(p.column).toLowerCase()));
    const locals = Array.from(new Set((text.match(/(?<!@)@[A-Za-z_][\w]*/g) || []).map((v) => v.toLowerCase()))).filter(
      (v) => !known.has(v)
    );
    if (locals.length > 0 && !stmt.parameters?.length) {
      add({
        ruleNumber: 20,
        type: 'Local Variables',
        severity: 'Warning',
        message: `Local variable(s) ${locals.slice(0, 4).join(', ')} in a filter are not sniffed, so row estimates use density averages. Use OPTION (RECOMPILE) or parameterise via sp_executesql.`,
        maxBenefitPercent: null,
      });
    }
  }

  // Rule 31: Exact Vector Distance Scan (SQL Server 2025)
  if (/\bVECTOR_DISTANCE\s*\(/i.test(text) && !/\bVECTOR_SEARCH\s*\(/i.test(text)) {
    add({
      ruleNumber: 31,
      type: 'Exact Vector Distance Scan',
      severity: 'Warning',
      message:
        'Query uses exact k-NN VECTOR_DISTANCE() without VECTOR_SEARCH(). On SQL Server 2025, create a DiskANN vector index (CREATE VECTOR INDEX) and switch to VECTOR_SEARCH() for Approximate Nearest Neighbor (ANN) index lookups.',
      maxBenefitPercent: null,
    });
  }
}

/** Run all rules, attach `findings` to each statement, enrich wait stats, return flat list. */
export function applyFindingsAndWaitInsights(plan: PlanAnalysis): PlanFinding[] {
  const all: PlanFinding[] = [];
  (plan.statements as StatementAnalysis[]).forEach((stmt: any) => {
    const list: PlanFinding[] = [];
    statementFindings(stmt, list);
    forEachNode(stmt.rootNode, (n) => nodeFindings(n, stmt, list));
    // Highest benefit first; unquantified last (ordered by severity)
    const sevRank = { Critical: 0, Warning: 1, Info: 2 } as const;
    list.sort((a, b) => {
      const ab = a.maxBenefitPercent ?? -1;
      const bb = b.maxBenefitPercent ?? -1;
      if (bb !== ab) return bb - ab;
      return sevRank[a.severity] - sevRank[b.severity];
    });
    stmt.findings = list;
    all.push(...list);
  });

  // Wait stats: average latency, time model, and benefit (% of total elapsed)
  const totalElapsed = (plan.statements as any[]).reduce((a, s) => a + stmtElapsed(s), 0);
  ((plan as any).waitStats || []).forEach((w: any) => {
    w.timeModel = waitTimeModel(w.waitType);
    w.avgLatencyMs = w.waitCount > 0 ? Math.round((w.waitTimeMs / w.waitCount) * 100) / 100 : 0;
    w.showAverage = showAverageWait(w.waitType) && w.waitCount > 0;
    w.benefitPercent = totalElapsed > 0 ? cap((w.waitTimeMs / totalElapsed) * 100) : null;
  });
  return all;
}
