/**
 * Extended plan diagnostics (browser-mode port of pkg/sqlplan/diagnostics_extra.go):
 *  1. Key / RID Lookup detector
 *  2. Table / Index / Row Count / Window Spool detector
 *  3. Missing statistics (<ColumnsWithNoStatistics>)
 *  4. Parameter sniffing (<ParameterList> compiled vs runtime values)
 *  5. Non-sargable predicates (functions on columns, leading wildcard LIKE)
 *  6. Row goals (TOP / FAST N / EXISTS)
 *  7. Adaptive Joins & Intelligent Query Processing state
 *
 * The logic is intentionally identical to the Go implementation so desktop and browser mode agree.
 */
import {
  AdaptiveJoinFinding,
  AdaptiveProcessing,
  AdvancedDiagnostics,
  FindingSeverity,
  IQPFeature,
  KeyLookupFinding,
  MissingStatsFinding,
  NonSargableFinding,
  ParameterSniffingFinding,
  RowGoalFinding,
  SniffedParameter,
  SpoolFinding,
} from '../types/plan';

type ExtraDiagnostics = Pick<
  AdvancedDiagnostics,
  'keyLookups' | 'spools' | 'missingStatistics' | 'parameterSniffing' | 'nonSargable' | 'rowGoals' | 'adaptive'
>;

export interface ExtraAntiPattern {
  type: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  affectedStatements: string[];
  recommendation: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, INFO: 1 };
const severityRank = (s: string): number => SEVERITY_RANK[s?.toUpperCase()] || 0;
const atLeastSeverity = (cur: FindingSeverity, min: FindingSeverity): FindingSeverity =>
  severityRank(cur) < severityRank(min) ? min : cur;

const trimBr = (s: string | null | undefined): string => (s || '').trim().replace(/^[[\]]+|[[\]]+$/g, '');
const qn = (s: string): string => `[${trimBr(s)}]`;
const uniq = (arr: string[]): string[] => Array.from(new Set(arr));
const fmtCount = (n: number): string => Math.round(n).toString();

const attr = (e: Element | null | undefined, name: string): string => (e ? e.getAttribute(name) || '' : '');
const attrNum = (e: Element | null | undefined, name: string): number => {
  const v = parseFloat(attr(e, name));
  return Number.isNaN(v) ? 0 : v;
};
const attrTrue = (e: Element | null | undefined, name: string): boolean => {
  const v = attr(e, name);
  return v === '1' || v.toLowerCase() === 'true';
};
const nm = (e: Element): string => e.localName || e.tagName;

interface StmtContext {
  id: string;
  text: string;
  cost: number;
  elem: Element;
}

function walkStmt(e: Element, ancestors: Element[], visit: (el: Element, anc: Element[]) => void): void {
  Array.from(e.children).forEach((c) => {
    const name = nm(c);
    if (name.startsWith('Stmt')) return;
    visit(c, ancestors);
    if (name === 'RelOp') {
      walkStmt(c, [...ancestors, c], visit);
    } else {
      walkStmt(c, ancestors, visit);
    }
  });
}

/** Locate an element owned by this operator itself (depth <= 2, never inside a child RelOp) */
function relOpFind(relOp: Element, name: string): Element | null {
  for (const c of Array.from(relOp.children)) {
    if (nm(c) === 'RelOp') continue;
    if (nm(c) === name) return c;
    for (const gc of Array.from(c.children)) {
      if (nm(gc) === name) return gc;
    }
  }
  return null;
}

function childRelOps(relOp: Element): Element[] {
  const out: Element[] = [];
  const rec = (e: Element) => {
    Array.from(e.children).forEach((c) => {
      if (nm(c) === 'RelOp') out.push(c);
      else rec(c);
    });
  };
  rec(relOp);
  return out;
}

function sumCounters(relOp: Element, attrName: string): { sum: number; found: boolean } {
  const ri = relOpFind(relOp, 'RunTimeInformation');
  if (!ri) return { sum: 0, found: false };
  let sum = 0;
  let found = false;
  Array.from(ri.children).forEach((c) => {
    if (nm(c) === 'RunTimeCountersPerThread' && c.hasAttribute(attrName)) {
      sum += parseFloat(c.getAttribute(attrName) || '0') || 0;
      found = true;
    }
  });
  return { sum, found };
}

function counterAttr(relOp: Element, attrName: string): string {
  const ri = relOpFind(relOp, 'RunTimeInformation');
  if (!ri) return '';
  for (const c of Array.from(ri.children)) {
    if (nm(c) === 'RunTimeCountersPerThread' && attr(c, attrName) !== '') return attr(c, attrName);
  }
  return '';
}

function ownCostPercent(relOp: Element, stmtCost: number): number {
  if (stmtCost <= 0) return 0;
  let own = attrNum(relOp, 'EstimatedTotalSubtreeCost');
  childRelOps(relOp).forEach((c) => {
    own -= attrNum(c, 'EstimatedTotalSubtreeCost');
  });
  if (own < 0) own = 0;
  return Math.round((own / stmtCost) * 1000) / 10;
}

function findFirstObject(relOp: Element): Element | null {
  for (const c of childRelOps(relOp)) {
    const obj = relOpFind(c, 'Object');
    if (obj) return obj;
    const deep = findFirstObject(c);
    if (deep) return deep;
  }
  return null;
}

function lookupKindOf(r: Element): string {
  const p = attr(r, 'PhysicalOp').toLowerCase();
  const l = attr(r, 'LogicalOp').toLowerCase();
  if (p.includes('rid lookup') || l.includes('rid lookup')) return 'RID Lookup';
  if (p.includes('key lookup') || l.includes('key lookup')) return 'Key Lookup';
  const is = relOpFind(r, 'IndexScan');
  if (is && attrTrue(is, 'Lookup')) {
    const obj = relOpFind(r, 'Object');
    if (obj && attr(obj, 'IndexKind').toLowerCase() === 'heap') return 'RID Lookup';
    return 'Key Lookup';
  }
  return '';
}

function findDrivingIndex(outer: Element, table: string, excludeIndex: string): string {
  const obj = relOpFind(outer, 'Object');
  if (
    obj &&
    !lookupKindOf(outer) &&
    trimBr(attr(obj, 'Table')).toLowerCase() === trimBr(table).toLowerCase() &&
    trimBr(attr(obj, 'Index')).toLowerCase() !== trimBr(excludeIndex).toLowerCase()
  ) {
    return trimBr(attr(obj, 'Index'));
  }
  for (const c of childRelOps(outer)) {
    const idx = findDrivingIndex(c, table, excludeIndex);
    if (idx) return idx;
  }
  return '';
}

const sanitizeIdent = (s: string): string => s.replace(/[^A-Za-z0-9_]/g, '_');

const INTERNAL_COLUMN_RE = /^(Bmk|Expr|Uniq|Chk|IsBaseRow|Union|Segment|Rank|Rowset)\d+$/;
const FAST_N_RE = /\bFAST\s+\d+/i;
const TOP_RE = /\bTOP\b|\bSET\s+ROWCOUNT\b/i;
const EXISTS_IN_RE = /\bEXISTS\b|\bIN\s*\(/i;
const COLUMN_REF_RE = /\[[^[\]]+\]\.\[[^[\]]+\]/;
const LEADING_LIKE_RE = /\[[^[\]]+\]\.\[[^[\]]+\]\s+like\s+N?'%/i;
const HALLOWEEN_OPS_RE = /insert|update|delete|merge/i;

// ---------------------------------------------------------------------------
// Non-sargable scanner
// ---------------------------------------------------------------------------

const NON_SARGABLE_REMEDIES: Record<string, string> = {
  datepart: "Rewrite date-part filters as a half-open range: WHERE col >= '2024-01-01' AND col < '2025-01-01'.",
  year: "Rewrite YEAR(col) = n as a half-open range: col >= 'n-01-01' AND col < '(n+1)-01-01'.",
  month: 'Rewrite MONTH(col) filters as a date range (or add an indexed computed column).',
  day: 'Rewrite DAY(col) filters as a date range (or add an indexed computed column).',
  datename: 'Compare against date ranges instead of formatting the column.',
  dateadd: 'Move date arithmetic to the other side: col >= DATEADD(day, -7, @d) instead of DATEADD(day, 7, col) >= @d.',
  datediff: 'Move date arithmetic to the parameter side: col >= DATEADD(day, -@n, GETDATE()).',
  eomonth: 'Compare against a computed date range instead of wrapping the column.',
  isnull: 'Replace ISNULL(col, x) = y with (col = y OR col IS NULL) (or ensure the column is NOT NULL).',
  coalesce: 'Replace COALESCE(col, x) = y with (col = y OR col IS NULL).',
  upper: 'Drop UPPER/LOWER: the default collation is already case-insensitive. Otherwise add an indexed computed column.',
  lower: 'Drop UPPER/LOWER: the default collation is already case-insensitive. Otherwise add an indexed computed column.',
  ltrim: 'Store trimmed values (or add an indexed computed column) instead of trimming the column at query time.',
  rtrim: 'Store trimmed values (SQL Server ignores trailing spaces in = comparisons anyway).',
  trim: 'Store trimmed values (or add an indexed computed column).',
  substring: "Use col LIKE 'prefix%' for prefix matches, or an indexed computed column for the extracted value.",
  left: "Use col LIKE 'prefix%' instead of LEFT(col, n) = 'prefix'.",
  right: 'Use an indexed computed column over REVERSE/RIGHT, or store the suffix separately.',
  len: 'Avoid LEN(col) filters; use an indexed computed column.',
  datalength: 'Avoid DATALENGTH(col) filters; use an indexed computed column.',
  charindex: "Use LIKE 'x%' (sargable) or full-text search for substring searches.",
  patindex: "Use LIKE 'x%' (sargable) or full-text search.",
  replace: 'Normalize data at write time or use an indexed computed column.',
  convert: "Compare in the column's own type: convert the parameter/constant, not the column.",
  cast: "Compare in the column's own type: cast the parameter/constant, not the column.",
  abs: 'Rewrite ABS(col) < n as col > -n AND col < n.',
  round: 'Rewrite as a range predicate on the raw column.',
  floor: 'Rewrite as a range predicate on the raw column.',
  ceiling: 'Rewrite as a range predicate on the raw column.',
  format: 'FORMAT() on a column cannot use an index; compare against typed ranges instead.',
  str: 'Compare numbers as numbers; do not stringify the column.',
  concat: 'Compare each column separately instead of concatenating them.',
  stuff: 'Use an indexed computed column for the transformed value.',
  reverse: 'Use an indexed computed column over REVERSE(col) for suffix searches.',
  isnumeric: 'Validate at write time; avoid ISNUMERIC(col) in WHERE.',
  isdate: 'Validate at write time; avoid ISDATE(col) in WHERE.',
};

const isIdentStart = (c: string): boolean => /[A-Za-z_]/.test(c);
const isIdentChar = (c: string): boolean => /[A-Za-z0-9_]/.test(c);

/** s[i] === "'" ; returns the index just after the closing quote */
function skipQuoted(s: string, start: number): number {
  let i = start + 1;
  while (i < s.length) {
    if (s[i] === "'") {
      if (i + 1 < s.length && s[i + 1] === "'") {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return i;
}

function balancedArgs(s: string, open: number): string {
  let depth = 0;
  for (let k = open; k < s.length; k++) {
    const ch = s[k];
    if (ch === "'") {
      k = skipQuoted(s, k) - 1;
    } else if (ch === '[') {
      const j = s.indexOf(']', k);
      if (j >= 0) k = j;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) return s.slice(open + 1, k);
    }
  }
  return s.slice(open + 1);
}

/** Names (lower-case) of non-sargable functions whose arguments contain a real table column reference */
export function findWrappedColumnFunctions(pred: string): string[] {
  const found: string[] = [];
  const n = pred.length;
  let i = 0;
  while (i < n) {
    const c = pred[i];
    if (c === "'") {
      i = skipQuoted(pred, i);
    } else if (c === '[') {
      const j = pred.indexOf(']', i);
      i = j < 0 ? n : j + 1;
    } else if (isIdentStart(c)) {
      let j = i;
      while (j < n && isIdentChar(pred[j])) j++;
      const name = pred.slice(i, j).toLowerCase();
      if (j < n && pred[j] === '(' && Object.prototype.hasOwnProperty.call(NON_SARGABLE_REMEDIES, name)) {
        if (COLUMN_REF_RE.test(balancedArgs(pred, j))) found.push(name);
      }
      i = j;
    } else {
      i++;
    }
  }
  return uniq(found);
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

interface ParamAggregate {
  finding: ParameterSniffingFinding;
  stmtIds: Set<string>;
  mitigations: string[];
}

function detectParamMitigation(upperText: string): string {
  if (upperText.includes('DISABLE_PARAMETER_SNIFFING')) return "USE HINT('DISABLE_PARAMETER_SNIFFING')";
  if (upperText.includes('OPTIMIZE FOR UNKNOWN')) return 'OPTIMIZE FOR UNKNOWN';
  if (upperText.includes('OPTIMIZE FOR')) return 'OPTIMIZE FOR (@p = value)';
  if (upperText.includes('RECOMPILE')) return 'OPTION (RECOMPILE)';
  return '';
}

export function computeExtraDiagnostics(
  xmlDoc: Document,
  ceModelVersion: string | undefined,
  scalarUdfCount: number
): ExtraDiagnostics {
  const keyLookups: KeyLookupFinding[] = [];
  const spools: SpoolFinding[] = [];
  const missingStatistics: MissingStatsFinding[] = [];
  const parameterSniffing: ParameterSniffingFinding[] = [];
  const nonSargable: NonSargableFinding[] = [];
  const rowGoals: RowGoalFinding[] = [];

  const adaptive: AdaptiveProcessing = {
    adaptiveJoins: [],
    batchModeOperators: 0,
    totalOperators: 0,
    batchOnRowstore: false,
    features: [],
    summary: '',
  };

  // Statement contexts (same ID fallback as the main client parser)
  const contexts: StmtContext[] = [];
  xmlDoc.querySelectorAll('StmtSimple, StmtCond, StmtCursor').forEach((el, idx) => {
    contexts.push({
      id: attr(el, 'StatementId') || attr(el, 'StatementCompId') || `${idx + 1}`,
      text: attr(el, 'StatementText').trim(),
      cost: attrNum(el, 'StatementSubTreeCost'),
      elem: el,
    });
  });

  const missingByKey = new Map<string, MissingStatsFinding>();
  const paramByKey = new Map<string, ParamAggregate>();
  const paramOrder: string[] = [];
  const mgfStatuses: string[] = [];
  const dopFeedback: string[] = [];
  let hasInterleaved = false;
  let hasInlineUdf = false;
  let hasPsp = false;

  contexts.forEach((ctx) => {
    let stmtSkewed = false;
    let rowGoalSeen = false;
    const stmtSigs: string[] = [];
    const upperText = ctx.text.toUpperCase();

    walkStmt(ctx.elem, [], (el, anc) => {
      switch (nm(el)) {
        case 'QueryPlan':
          if (attrTrue(el, 'ContainsInterleavedExecutionCandidates')) hasInterleaved = true;
          if (attrTrue(el, 'ContainsInlineScalarTsqlUdfs')) hasInlineUdf = true;
          if (attr(el, 'DOPFeedbackAdjusted')) dopFeedback.push(attr(el, 'DOPFeedbackAdjusted'));
          break;
        case 'MemoryGrantInfo':
          if (attr(el, 'IsMemoryGrantFeedbackAdjusted')) mgfStatuses.push(attr(el, 'IsMemoryGrantFeedbackAdjusted'));
          break;
        case 'Dispatcher':
        case 'ParameterSensitivePredicate':
          hasPsp = true;
          break;
        case 'ColumnsWithNoStatistics': {
          const nodeId = anc.length > 0 ? parseInt(attr(anc[anc.length - 1], 'NodeId') || '0', 10) || 0 : 0;
          Array.from(el.children).forEach((cr) => {
            if (nm(cr) !== 'ColumnReference') return;
            const key = `${ctx.id}|${attr(cr, 'Database')}|${attr(cr, 'Schema')}|${attr(cr, 'Table')}`;
            let f = missingByKey.get(key);
            if (!f) {
              f = {
                statementId: ctx.id,
                nodeId,
                database: trimBr(attr(cr, 'Database')),
                schema: trimBr(attr(cr, 'Schema')),
                table: trimBr(attr(cr, 'Table')),
                columns: [],
                severity: 'HIGH',
                description: '',
                remedy: '',
                suggestedDdl: '',
              };
              missingByKey.set(key, f);
              missingStatistics.push(f);
            }
            const col = trimBr(attr(cr, 'Column'));
            if (col) f.columns = uniq([...f.columns, col]);
          });
          break;
        }
        case 'ParameterList': {
          const params: SniffedParameter[] = [];
          const sigParts: string[] = [];
          let anyCompiled = false;
          Array.from(el.children).forEach((cr) => {
            if (nm(cr) !== 'ColumnReference') return;
            const name = attr(cr, 'Column');
            if (!name) return;
            const hasCompiled = cr.hasAttribute('ParameterCompiledValue');
            const hasRuntime = cr.hasAttribute('ParameterRuntimeValue');
            const compiled = attr(cr, 'ParameterCompiledValue');
            const runtime = attr(cr, 'ParameterRuntimeValue');
            if (hasCompiled) anyCompiled = true;
            params.push({
              name,
              dataType: attr(cr, 'ParameterDataType'),
              compiledValue: compiled,
              runtimeValue: runtime,
              hasRuntime,
              mismatch: hasCompiled && hasRuntime && compiled.trim() !== runtime.trim(),
            });
            sigParts.push(`${name}=${compiled}|${runtime}`);
          });
          if (params.length === 0 || !anyCompiled) break;

          const sig = sigParts.join(';');
          let agg = paramByKey.get(sig);
          if (!agg) {
            agg = {
              finding: {
                affectedStatements: [],
                parameters: params,
                hasRuntimeValues: params.some((p) => p.hasRuntime),
                hasMismatch: params.some((p) => p.mismatch),
                hasEstimateImpact: false,
                mitigation: '',
                severity: 'INFO',
                description: '',
                remedy: '',
              },
              stmtIds: new Set<string>(),
              mitigations: [],
            };
            paramByKey.set(sig, agg);
            paramOrder.push(sig);
          }
          if (!agg.stmtIds.has(ctx.id)) {
            agg.stmtIds.add(ctx.id);
            agg.finding.affectedStatements.push(`Stmt #${ctx.id}`);
            const m = detectParamMitigation(upperText);
            if (m) agg.mitigations = uniq([...agg.mitigations, m]);
          }
          stmtSigs.push(sig);
          break;
        }
        case 'RelOp': {
          const result = analyzeRelOp(el, anc, ctx, upperText, {
            keyLookups,
            spools,
            nonSargable,
            rowGoals,
            adaptive,
          });
          if (result.skewed) stmtSkewed = true;
          if (result.rowGoal) rowGoalSeen = true;
          break;
        }
        default:
          break;
      }
    });

    if (stmtSkewed) {
      stmtSigs.forEach((sig) => {
        const agg = paramByKey.get(sig);
        if (agg) agg.finding.hasEstimateImpact = true;
      });
    }

    if (!rowGoalSeen && FAST_N_RE.test(ctx.text)) {
      rowGoals.push({
        statementId: ctx.id,
        nodeId: 0,
        physicalOp: 'Statement',
        source: 'FAST N query hint',
        estimateRows: 0,
        estimateRowsWithoutGoal: 0,
        actualRows: 0,
        hasActualRows: false,
        reductionFactor: 0,
        misfired: false,
        severity: 'INFO',
        description:
          'OPTION (FAST n) forces a row goal: the optimizer favors a plan that returns the first rows quickly (typically Nested Loops) even if it is slower for the complete result set.',
        remedy:
          "Verify the client really consumes only the first rows; otherwise remove FAST n or add OPTION (USE HINT('DISABLE_OPTIMIZER_ROWGOAL')) (SQL Server 2016 SP1+).",
      });
    }
  });

  finalizeMissingStats(missingStatistics);
  finalizeParameterSniffing(parameterSniffing, paramByKey, paramOrder);
  finalizeAdaptive(adaptive, ceModelVersion, scalarUdfCount, mgfStatuses, dopFeedback, hasInterleaved, hasInlineUdf, hasPsp);

  keyLookups.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.lookupCount - a.lookupCount);
  spools.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  nonSargable.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.costPercent - a.costPercent);
  rowGoals.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  return { keyLookups, spools, missingStatistics, parameterSniffing, nonSargable, rowGoals, adaptive };
}

// ---------------------------------------------------------------------------
// Per-operator analysis
// ---------------------------------------------------------------------------

interface Sinks {
  keyLookups: KeyLookupFinding[];
  spools: SpoolFinding[];
  nonSargable: NonSargableFinding[];
  rowGoals: RowGoalFinding[];
  adaptive: AdaptiveProcessing;
}

function analyzeRelOp(
  relOp: Element,
  anc: Element[],
  ctx: StmtContext,
  upperText: string,
  sinks: Sinks
): { skewed: boolean; rowGoal: boolean } {
  void upperText;
  const nodeId = parseInt(attr(relOp, 'NodeId') || '0', 10) || 0;
  const phys = attr(relOp, 'PhysicalOp');
  const logical = attr(relOp, 'LogicalOp');
  const physLower = phys.toLowerCase();
  const estRows = attrNum(relOp, 'EstimateRows');
  const actualRes = sumCounters(relOp, 'ActualRows');
  const execRes = sumCounters(relOp, 'ActualExecutions');
  const actual = actualRes.sum;
  const hasActual = actualRes.found;
  const perExec = execRes.found && execRes.sum > 0 ? actual / execRes.sum : actual;
  const costPct = ownCostPercent(relOp, ctx.cost);

  const out = { skewed: false, rowGoal: false };
  sinks.adaptive.totalOperators++;

  // Execution mode
  const mode = counterAttr(relOp, 'ActualExecutionMode') || attr(relOp, 'EstimatedExecutionMode');
  if (mode.toLowerCase() === 'batch') {
    sinks.adaptive.batchModeOperators++;
    const is = relOpFind(relOp, 'IndexScan');
    if (is && attr(is, 'Storage').toLowerCase() === 'rowstore') sinks.adaptive.batchOnRowstore = true;
  }

  // Cardinality misestimate marker (used to correlate parameter sniffing)
  if (hasActual && estRows > 0) {
    const ratio = perExec / estRows;
    if ((ratio > 10 && actual >= 1000) || (perExec > 0 && ratio < 0.1 && estRows >= 100)) out.skewed = true;
  }

  const lookupKind = lookupKindOf(relOp);
  if (lookupKind) analyzeLookup(relOp, anc, ctx, lookupKind, nodeId, estRows, actual, hasActual, costPct, sinks);

  if (physLower.includes('spool')) analyzeSpool(relOp, anc, ctx, nodeId, phys, logical, estRows, actual, hasActual, costPct, sinks);

  if (physLower.includes('scan') || physLower.includes('seek') || physLower.includes('lookup') || physLower === 'filter') {
    analyzeNonSargable(relOp, ctx, nodeId, phys, costPct, sinks);
  }

  if (relOp.hasAttribute('EstimateRowsWithoutRowGoal')) {
    const without = attrNum(relOp, 'EstimateRowsWithoutRowGoal');
    if (without > estRows * 1.0001) {
      out.rowGoal = true;
      analyzeRowGoal(ctx, nodeId, phys, estRows, without, perExec, hasActual, sinks);
    }
  }

  const aj = relOpFind(relOp, 'AdaptiveJoin');
  if (phys.toLowerCase() === 'adaptive join' || aj) {
    analyzeAdaptiveJoin(relOp, aj, ctx, nodeId, estRows, actual, hasActual, sinks);
  }

  return out;
}

function analyzeLookup(
  relOp: Element,
  anc: Element[],
  ctx: StmtContext,
  kind: string,
  nodeId: number,
  estRows: number,
  actual: number,
  hasActual: boolean,
  costPct: number,
  sinks: Sinks
): void {
  const obj = relOpFind(relOp, 'Object');
  const schema = obj ? trimBr(attr(obj, 'Schema')) : '';
  const table = obj ? trimBr(attr(obj, 'Table')) : '';
  const lookupIdx = obj ? trimBr(attr(obj, 'Index')) : '';

  let seekIdx = '';
  let outerRows = 0;
  if (anc.length > 0) {
    const parent = anc[anc.length - 1];
    if (attr(parent, 'PhysicalOp').toLowerCase().includes('nested loops')) {
      const sib = childRelOps(parent).find((s) => s !== relOp);
      if (sib) {
        outerRows = attrNum(sib, 'EstimateRows');
        seekIdx = findDrivingIndex(sib, table, lookupIdx);
      }
    }
  }

  let cols: string[] = [];
  const ol = relOpFind(relOp, 'OutputList');
  if (ol) {
    Array.from(ol.children).forEach((cr) => {
      if (nm(cr) !== 'ColumnReference') return;
      const c = attr(cr, 'Column');
      if (!c || INTERNAL_COLUMN_RE.test(c)) return;
      cols.push(trimBr(c));
    });
  }
  cols = uniq(cols);

  let lookups = outerRows > 0 ? outerRows * estRows : estRows;
  if (hasActual) lookups = actual;

  let severity: FindingSeverity = 'INFO';
  if (lookups >= 10000) severity = 'CRITICAL';
  else if (lookups >= 1000) severity = 'HIGH';
  else if (lookups >= 100 || costPct >= 10) severity = 'MEDIUM';
  if (costPct >= 25) severity = atLeastSeverity(severity, 'HIGH');

  const include = cols.length > 0 ? `INCLUDE (${cols.map(qn).join(', ')})` : '';
  const target = schema ? `${qn(schema)}.${qn(table)}` : qn(table);
  const what = cols.length > 0 ? `${cols.length} column(s) the index does not contain` : 'columns the index does not contain (used by a predicate)';
  const description = `${kind} on ${target} is performed ~${fmtCount(lookups)} time(s)${hasActual ? '' : ' (estimated)'}: each row found by the index seek requires an extra random read into the base table to fetch ${what}.`;

  let remedy: string;
  if (kind === 'RID Lookup' && include) {
    remedy = `The table is a heap. Create a clustered index (usually on the primary key) so RID lookups become cheaper Key Lookups, or build a covering index with ${include}.`;
  } else if (kind === 'RID Lookup') {
    remedy = 'The table is a heap. Create a clustered index (usually on the primary key) so RID lookups become cheaper Key Lookups, or build a covering index.';
  } else if (seekIdx && include) {
    remedy = `Add the fetched columns to the existing index ${qn(seekIdx)}: ${include}.`;
  } else if (include) {
    remedy = `Create a covering index on the seek columns with ${include}.`;
  } else {
    remedy = 'Create a covering index so the lookup is no longer needed.';
  }
  if (lookups >= 1000) {
    remedy += ' At this volume the optimizer may soon abandon the index entirely for a full scan (tipping point).';
  }

  sinks.keyLookups.push({
    statementId: ctx.id,
    nodeId,
    lookupKind: kind,
    schema,
    table,
    lookupIndex: lookupIdx,
    seekIndex: seekIdx,
    estimateRows: estRows,
    lookupCount: Math.round(lookups),
    hasActualRows: hasActual,
    costPercent: costPct,
    fetchedColumns: cols,
    includeClause: include,
    severity,
    description,
    remedy,
  });
}

function analyzeSpool(
  relOp: Element,
  anc: Element[],
  ctx: StmtContext,
  nodeId: number,
  phys: string,
  logical: string,
  estRows: number,
  actual: number,
  hasActual: boolean,
  costPct: number,
  sinks: Sinks
): void {
  const physLower = phys.toLowerCase();
  const logLower = logical.toLowerCase();

  let kind = 'Spool';
  if (logLower.includes('eager')) kind = 'Eager';
  else if (logLower.includes('lazy')) kind = 'Lazy';
  else if (physLower.includes('row count')) kind = 'Row Count';
  else if (physLower.includes('window')) kind = 'Window';

  const halloween = kind === 'Eager' && anc.some((a) => HALLOWEEN_OPS_RE.test(attr(a, 'PhysicalOp')));

  const rebinds = sumCounters(relOp, 'ActualRebinds').sum;
  const rewinds = sumCounters(relOp, 'ActualRewinds').sum;
  const obj = findFirstObject(relOp);
  const table = obj ? trimBr(attr(obj, 'Table')) : '';

  let severity: FindingSeverity = 'INFO';
  let purpose: string;
  let description: string;
  let remedy: string;

  if (physLower.includes('index spool') && kind === 'Eager') {
    severity = 'HIGH';
    purpose = 'Temporary Index Built at Runtime';
    description =
      'An Eager Index Spool makes SQL Server build a throw-away index in TempDB on every execution of this branch because no suitable permanent index exists.';
    remedy =
      "Create the permanent index the optimizer wanted (check the Nested Loops inner-side seek predicate / Missing Index recommendations) so the spool disappears.";
  } else if (halloween) {
    purpose = 'Halloween Protection';
    description =
      'Eager Spool under a data-modification operator: the engine fully materializes the rows to be changed so the update cannot re-read rows it already modified.';
    remedy =
      'Normally harmless. If expensive, avoid reading and modifying the same index key (e.g. UPDATE ... SET key = key + 1), or modify through a different index/staging table.';
  } else if (kind === 'Eager') {
    severity = 'MEDIUM';
    purpose = 'Full Materialization (Blocking)';
    description =
      'Eager Table Spool blocks the pipeline: it consumes and stores the entire input in TempDB before returning the first row.';
    remedy =
      'Check for self-referencing joins, multiple reads of the same CTE/subquery, or missing indexes. Materializing the subquery in an indexed #temp table is often cheaper.';
  } else if (kind === 'Lazy') {
    purpose = 'Cached Rows for Repeated Reads';
    description = 'Lazy Table Spool stores rows on demand so the inner side can be rewound instead of re-executed.';
    remedy = 'Usually beneficial. If rebinds are high, review the join order, or rewrite correlated subqueries as set-based joins.';
    if (rebinds >= 1000 || costPct >= 10) severity = 'MEDIUM';
  } else if (kind === 'Row Count') {
    purpose = 'Row Count Optimization';
    description =
      'Row Count Spool only counts rows (used for NOT IN / anti-semi join existence checks). Cheap, but can indicate a NOT IN against a nullable column.';
    remedy = 'Prefer NOT EXISTS, or make the compared columns NOT NULL.';
  } else if (kind === 'Window') {
    purpose = 'Window Function Frame Buffer';
    description =
      'Window Spool buffers rows for a window frame. The default RANGE frame spools to disk in TempDB, a ROWS frame does it in memory.';
    remedy = 'Specify ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW instead of the default RANGE frame.';
  } else {
    purpose = 'Intermediate Result Cache';
    description = 'A spool operator stores intermediate rows in TempDB.';
    remedy = 'Review the join/subquery producing the spooled rows.';
  }

  if (costPct >= 40) severity = atLeastSeverity(severity, 'HIGH');
  else if (costPct >= 20) severity = atLeastSeverity(severity, 'MEDIUM');
  if (costPct >= 30 && physLower.includes('index spool') && kind === 'Eager') severity = 'CRITICAL';

  sinks.spools.push({
    statementId: ctx.id,
    nodeId,
    physicalOp: phys,
    logicalOp: logical,
    kind,
    purpose,
    table,
    estimateRows: estRows,
    estimateRebinds: attrNum(relOp, 'EstimateRebinds'),
    estimateRewinds: attrNum(relOp, 'EstimateRewinds'),
    actualRows: actual,
    actualRebinds: rebinds,
    actualRewinds: rewinds,
    hasActualRows: hasActual,
    costPercent: costPct,
    severity,
    description,
    remedy,
  });
}

function analyzeNonSargable(
  relOp: Element,
  ctx: StmtContext,
  nodeId: number,
  phys: string,
  costPct: number,
  sinks: Sinks
): void {
  const pred = relOpFind(relOp, 'Predicate');
  if (!pred) return;
  const scalar = pred.querySelector('ScalarOperator');
  if (!scalar) return;
  const text = attr(scalar, 'ScalarString');
  if (!text) return;

  const funcs = findWrappedColumnFunctions(text);
  const wildcard = LEADING_LIKE_RE.test(text);
  if (funcs.length === 0 && !wildcard) return;

  const obj = relOpFind(relOp, 'Object');
  const table = obj ? trimBr(attr(obj, 'Table')) : '';
  const index = obj ? trimBr(attr(obj, 'Index')) : '';
  const tableCard = attrNum(relOp, 'TableCardinality');
  const isScan = phys.toLowerCase().includes('scan');

  let severity: FindingSeverity = 'MEDIUM';
  if (isScan && (tableCard >= 100000 || costPct >= 20)) severity = 'HIGH';
  else if (isScan && tableCard > 0 && tableCard < 1000 && costPct < 10) severity = 'INFO';
  if (isScan && costPct >= 40) severity = 'CRITICAL';

  const what: string[] = funcs.map((f) => `${f.toUpperCase()}()`);
  const remedies: string[] = funcs.map((f) => NON_SARGABLE_REMEDIES[f]);
  if (wildcard) {
    what.push("LIKE '%…' (leading wildcard)");
    remedies.push("A leading wildcard cannot use B-tree order: use Full-Text Search, a reversed/computed column, or avoid the leading '%'.");
  }

  let description = `Predicate applies ${what.join(', ')} to an indexed column. This hides the column from index seeks (non-sargable): the expression is evaluated row by row${isScan ? ' during a scan' : ''}.`;
  if (table) description += ` Table: ${table}.`;

  sinks.nonSargable.push({
    statementId: ctx.id,
    nodeId,
    physicalOp: phys,
    table,
    index,
    functions: funcs.map((f) => f.toUpperCase()),
    leadingWildcard: wildcard,
    predicate: text,
    tableCardinality: tableCard,
    costPercent: costPct,
    severity,
    description,
    remedy: uniq(remedies).join(' '),
  });
}

function analyzeRowGoal(
  ctx: StmtContext,
  nodeId: number,
  phys: string,
  estRows: number,
  without: number,
  perExec: number,
  hasActual: boolean,
  sinks: Sinks
): void {
  let source = 'Optimizer row goal';
  if (FAST_N_RE.test(ctx.text)) source = 'FAST N query hint';
  else if (TOP_RE.test(ctx.text)) source = 'TOP';
  else if (EXISTS_IN_RE.test(ctx.text)) source = 'EXISTS / IN semi-join';

  const reduction = estRows > 0 ? Math.round((without / estRows) * 10) / 10 : 0;
  const misfired = hasActual && estRows > 0 && perExec / estRows > 10;

  let severity: FindingSeverity = 'INFO';
  if (misfired && perExec / estRows >= 100) severity = 'CRITICAL';
  else if (misfired) severity = 'HIGH';
  else if (reduction >= 10) severity = 'MEDIUM';

  let description = `${source} set a row goal on ${phys}: the optimizer reduced its row estimate from ${fmtCount(without)} to ${fmtCount(estRows)} (${reduction.toFixed(1)}x) assuming matching rows are spread evenly and the scan can stop early.`;
  if (misfired) {
    description += ` The row goal MISFIRED: the operator actually produced ~${fmtCount(perExec)} rows per execution, far more than the ${fmtCount(estRows)} estimated (matching rows were rarer or clustered at the end of the scan).`;
  } else if (!hasActual && reduction >= 10) {
    description += ' Run the Actual plan to verify the goal was met; if matching rows are rare the plan can degrade into a very long scan.';
  }

  let remedy =
    "If the plan is slower than expected, test OPTION (USE HINT('DISABLE_OPTIMIZER_ROWGOAL')) (SQL Server 2016 SP1+) or QUERYTRACEON 4138, and add an index supporting both the filter and the ORDER BY so the goal can be met cheaply.";
  if (source === 'TOP') remedy = `Make sure TOP has a deterministic ORDER BY backed by an index. ${remedy}`;

  sinks.rowGoals.push({
    statementId: ctx.id,
    nodeId,
    physicalOp: phys,
    source,
    estimateRows: estRows,
    estimateRowsWithoutGoal: without,
    actualRows: Math.round(perExec),
    hasActualRows: hasActual,
    reductionFactor: reduction,
    misfired,
    severity,
    description,
    remedy,
  });
}

function analyzeAdaptiveJoin(
  relOp: Element,
  aj: Element | null,
  ctx: StmtContext,
  nodeId: number,
  estRows: number,
  actual: number,
  hasActual: boolean,
  sinks: Sinks
): void {
  const attrOf = (name: string): string => attr(relOp, name) || attr(aj, name) || counterAttr(relOp, name);

  const f: AdaptiveJoinFinding = {
    statementId: ctx.id,
    nodeId,
    thresholdRows: 0,
    hasThreshold: false,
    estimatedJoinType: attrOf('EstimatedJoinType'),
    actualJoinType: counterAttr(relOp, 'ActualJoinType') || attr(relOp, 'ActualJoinType') || attr(aj, 'ActualJoinType'),
    estimateRows: estRows,
    actualRows: actual,
    hasActualRows: hasActual,
    description: '',
  };
  const t = attrOf('AdaptiveThresholdRows');
  if (t) {
    f.thresholdRows = parseFloat(t) || 0;
    f.hasThreshold = true;
  }

  if (f.actualJoinType && f.hasThreshold) {
    f.description = `Adaptive Join resolved to ${f.actualJoinType} at runtime (threshold ${fmtCount(f.thresholdRows)} rows, estimated join type ${f.estimatedJoinType || 'n/a'}). The join algorithm was chosen from the real build-side row count instead of the compile-time estimate.`;
  } else if (f.actualJoinType) {
    f.description = `Adaptive Join resolved to ${f.actualJoinType} at runtime.`;
  } else if (f.hasThreshold) {
    f.description = `Adaptive Join switches from Nested Loops to Hash Match when the build input exceeds ${fmtCount(f.thresholdRows)} rows. This is an Estimated plan, so the runtime choice is not available.`;
  } else {
    f.description =
      'Adaptive Join defers the Hash vs Nested Loops decision until the build input has been read at runtime, protecting against cardinality misestimates.';
  }
  sinks.adaptive.adaptiveJoins.push(f);
}

// ---------------------------------------------------------------------------
// Finalizers
// ---------------------------------------------------------------------------

function finalizeMissingStats(list: MissingStatsFinding[]): void {
  list.forEach((f) => {
    f.columns.sort();
    const target = f.schema ? `${qn(f.schema)}.${qn(f.table)}` : qn(f.table);
    const quoted = f.columns.map(qn);
    f.severity = f.table.startsWith('#') ? 'MEDIUM' : 'HIGH';
    f.description = `The optimizer had NO statistics on ${quoted.join(', ')} of ${target}, so it guessed selectivity (fixed 10%/30% heuristics). Row estimates, join order and memory grants are unreliable.`;
    f.remedy =
      'Ensure AUTO_CREATE_STATISTICS is ON (and the DB is not read-only), then create/refresh the statistics. Auto-creation is skipped for read-only databases, some column types, and when disabled.';
    let stat = sanitizeIdent(`ST_${trimBr(f.table)}_${f.columns.join('_')}`);
    if (stat.length > 120) stat = stat.slice(0, 120);
    f.suggestedDdl = `CREATE STATISTICS [${stat}]\nON ${target} (${quoted.join(', ')})\nWITH FULLSCAN;`;
  });
  list.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function finalizeParameterSniffing(
  out: ParameterSniffingFinding[],
  byKey: Map<string, ParamAggregate>,
  order: string[]
): void {
  order.forEach((key) => {
    const agg = byKey.get(key)!;
    const f = agg.finding;
    f.mitigation = agg.mitigations.join(', ');

    const mismatches = f.parameters
      .filter((p) => p.mismatch)
      .map((p) => `${p.name} compiled for ${p.compiledValue}, ran with ${p.runtimeValue}`);

    if (f.hasMismatch && f.hasEstimateImpact) {
      f.severity = 'HIGH';
      f.description = `Classic parameter sniffing: the cached plan was built for different values than this execution (${mismatches.join('; ')}) and the cardinality estimates are visibly wrong for the runtime values.`;
    } else if (f.hasMismatch) {
      f.severity = 'MEDIUM';
      f.description = `Compile-time and runtime parameter values differ (${mismatches.join('; ')}). The plan is optimized for the sniffed values and may be a poor fit for this execution.`;
    } else if (f.hasRuntimeValues) {
      f.severity = 'INFO';
      f.description =
        'Compile-time and runtime parameter values match for this execution, but the plan will be reused for other values and could be unsuitable for skewed data.';
    } else {
      f.severity = 'INFO';
      f.description =
        'This plan was compiled by sniffing the parameter values listed below and will be reused for every future execution. Capture the Actual plan to compare against runtime values.';
    }
    f.remedy =
      'Options: OPTION (RECOMPILE) for volatile/skewed predicates; OPTION (OPTIMIZE FOR UNKNOWN) or OPTIMIZE FOR (@p = typical) for a stable generic plan; split skewed branches into separate procedures; SQL Server 2022 Parameter Sensitive Plan optimization; or force a good plan via Query Store.';
    out.push(f);
  });
  out.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function finalizeAdaptive(
  ap: AdaptiveProcessing,
  ceModelVersion: string | undefined,
  scalarUdfCount: number,
  mgf: string[],
  dop: string[],
  interleaved: boolean,
  inlineUdf: boolean,
  psp: boolean
): void {
  const parsed = ceModelVersion ? parseInt(ceModelVersion.trim(), 10) : NaN;
  const ceVersion = Number.isNaN(parsed) ? -1 : parsed;

  const eligible = (minVersion: number, detail: string): { s: IQPFeature['status']; d: string } => {
    if (ceVersion < 0) return { s: 'Unknown', d: `Compatibility level could not be determined from this plan. ${detail}` };
    if (ceVersion >= minVersion) return { s: 'Eligible', d: detail };
    return {
      s: 'Not Applicable',
      d: `Requires database compatibility level ${minVersion}+ (this plan was compiled under level ${ceVersion}). ${detail}`,
    };
  };
  const add = (name: string, status: IQPFeature['status'], detail: string) => ap.features.push({ name, status, detail });

  if (ap.adaptiveJoins.length > 0) {
    add('Adaptive Joins', 'Active', `${ap.adaptiveJoins.length} Adaptive Join operator(s) found in this plan.`);
  } else {
    const r = eligible(140, 'Requires batch mode and an Enterprise-class edition; chosen only when the optimizer sees a join with a wide estimate gap.');
    add('Adaptive Joins', r.s, r.d);
  }

  if (ap.batchModeOperators > 0) {
    let d = `${ap.batchModeOperators} of ${ap.totalOperators} operators run in batch mode.`;
    if (ap.batchOnRowstore) d += ' Batch mode on rowstore is in use (no columnstore index needed).';
    add('Batch Mode Execution', 'Active', d);
  } else {
    const r = eligible(150, 'Batch mode on rowstore helps analytic queries (large scans/aggregations); this plan chose row mode.');
    add('Batch Mode Execution', r.s, r.d);
  }

  if (mgf.length > 0) {
    add('Memory Grant Feedback', 'Active', `Status reported by the engine: ${uniq(mgf).join(', ')}.`);
  } else {
    const r = eligible(140, 'Adjusts memory grants between executions (batch mode from 140, row mode from 150) to fix spills and over-grants.');
    add('Memory Grant Feedback', r.s, r.d);
  }

  if (interleaved) {
    add('Interleaved Execution', 'Active', 'Plan contains multi-statement TVF candidates whose cardinality is materialized before optimization.');
  } else {
    const r = eligible(140, 'Only applies to multi-statement table-valued functions (MSTVF).');
    add('Interleaved Execution', r.s, r.d);
  }

  if (inlineUdf) {
    add('Scalar UDF Inlining', 'Active', 'Scalar T-SQL UDFs were inlined into the query plan.');
  } else if (scalarUdfCount > 0) {
    const r = eligible(150, '');
    const d =
      r.s === 'Eligible'
        ? 'Scalar UDF(s) are present but were NOT inlined: inlining is blocked by constructs like loops, table variables, GETDATE-style nondeterminism, or side-effecting calls.'
        : r.d;
    add('Scalar UDF Inlining', r.s, d.trim());
  } else {
    const r = eligible(150, 'Rewrites eligible scalar UDFs as relational expressions (no scalar UDFs seen in this plan).');
    add('Scalar UDF Inlining', r.s, r.d);
  }

  if (psp) {
    add('Parameter Sensitive Plan (PSP)', 'Active', 'A dispatcher plan with multiple query variants is in use for skewed parameters.');
  } else {
    const r = eligible(160, 'Creates multiple plans for skewed parameter values automatically (SQL Server 2022).');
    add('Parameter Sensitive Plan (PSP)', r.s, r.d);
  }

  if (dop.length > 0) {
    add('Degree of Parallelism Feedback', 'Active', `Status reported by the engine: ${uniq(dop).join(', ')}.`);
  } else {
    const r = eligible(160, 'Automatically lowers MAXDOP for queries with inefficient parallelism (SQL Server 2022).');
    add('Degree of Parallelism Feedback', r.s, r.d);
  }

  const active = ap.features.filter((f) => f.status === 'Active').length;
  if (ceVersion < 0) {
    ap.summary = `${active} IQP feature(s) active. Compatibility level could not be detected.`;
  } else if (ceVersion < 140) {
    ap.summary = `Compiled under compatibility level ${ceVersion}: most Intelligent Query Processing features (140+) are unavailable. Raising the level (after regression testing) unlocks adaptive joins, memory grant feedback and more.`;
  } else {
    ap.summary = `Compiled under compatibility level ${ceVersion}: ${active} of ${ap.features.length} IQP features are active in this plan.`;
  }
}

// ---------------------------------------------------------------------------
// Anti-pattern promotion + health score
// ---------------------------------------------------------------------------

export function buildFindingAntiPatterns(d: ExtraDiagnostics): ExtraAntiPattern[] {
  const result: ExtraAntiPattern[] = [];
  const add = (
    type: string,
    severity: FindingSeverity,
    title: string,
    description: string,
    recommendation: string,
    affected: string[]
  ) => {
    if (affected.length === 0) return;
    result.push({ type, severity, title, description, affectedStatements: uniq(affected), recommendation });
  };

  {
    const affected: string[] = [];
    let sev: FindingSeverity = 'INFO';
    (d.keyLookups || []).forEach((k) => {
      if (severityRank(k.severity) >= severityRank('HIGH')) {
        affected.push(`Stmt #${k.statementId} (${k.table})`);
        sev = atLeastSeverity(sev, k.severity);
      }
    });
    add(
      'KEY_LOOKUP',
      sev,
      'Heavy Key / RID Lookups',
      'Index seeks are followed by thousands of per-row lookups into the base table to fetch columns the index does not contain.',
      'Add the fetched columns to the driving index with INCLUDE, or create a covering index.',
      affected
    );
  }
  {
    const affected: string[] = [];
    let sev: FindingSeverity = 'INFO';
    (d.spools || []).forEach((s) => {
      if (severityRank(s.severity) >= severityRank('HIGH')) {
        affected.push(`Stmt #${s.statementId} (Node ${s.nodeId} ${s.physicalOp})`);
        sev = atLeastSeverity(sev, s.severity);
      }
    });
    add(
      'SPOOL',
      sev,
      'Expensive Spool Operators',
      'Spool operators materialize intermediate rows in TempDB (an Eager Index Spool builds a temporary index on every execution).',
      'Create the permanent index the optimizer wanted, or materialize the subquery into an indexed temp table.',
      affected
    );
  }
  add(
    'MISSING_STATISTICS',
    'HIGH',
    'Columns With No Statistics',
    'The optimizer compiled this plan without statistics on filtered/joined columns and used guessed selectivity.',
    'Enable AUTO_CREATE_STATISTICS and create the listed statistics (CREATE STATISTICS ... WITH FULLSCAN).',
    (d.missingStatistics || []).map((m) => `Stmt #${m.statementId} (${m.table})`)
  );
  {
    const affected: string[] = [];
    let sev: FindingSeverity = 'INFO';
    (d.parameterSniffing || []).forEach((p) => {
      if (severityRank(p.severity) >= severityRank('MEDIUM')) {
        affected.push(...p.affectedStatements);
        sev = atLeastSeverity(sev, p.severity);
      }
    });
    add(
      'PARAMETER_SNIFFING',
      sev,
      'Parameter Sniffing Mismatch',
      'The plan was compiled for parameter values that differ from the runtime values.',
      'Use OPTION (RECOMPILE), OPTIMIZE FOR UNKNOWN, split skewed paths, or SQL Server 2022 PSP optimization.',
      affected
    );
  }
  {
    const affected: string[] = [];
    let sev: FindingSeverity = 'INFO';
    (d.nonSargable || []).forEach((n) => {
      if (severityRank(n.severity) >= severityRank('MEDIUM')) {
        affected.push(`Stmt #${n.statementId} (${n.table})`);
        sev = atLeastSeverity(sev, n.severity);
      }
    });
    add(
      'NON_SARGABLE',
      sev,
      'Non-Sargable Predicates',
      'Functions wrapped around indexed columns (or leading-wildcard LIKE) block index seeks and force row-by-row evaluation.',
      'Rewrite predicates so the bare column is compared to a computed constant/range, or add an indexed computed column.',
      affected
    );
  }
  {
    const affected: string[] = [];
    let sev: FindingSeverity = 'INFO';
    (d.rowGoals || []).forEach((r) => {
      if (r.misfired) {
        affected.push(`Stmt #${r.statementId} (Node ${r.nodeId})`);
        sev = atLeastSeverity(sev, r.severity);
      }
    });
    add(
      'ROW_GOAL_MISFIRE',
      sev,
      'Row Goal Misfire (TOP / FAST N / EXISTS)',
      'The optimizer assumed matching rows would be found quickly, but far more rows were processed than estimated.',
      "Test OPTION (USE HINT('DISABLE_OPTIMIZER_ROWGOAL')) and add an index supporting the filter and sort order.",
      affected
    );
  }

  return result;
}

const worst = (sevs: string[]): number => sevs.reduce((acc, s) => Math.max(acc, severityRank(s)), 0);

/** Score deduction contributed by the 7 extended detectors (mirrors extraHealthPenalty in Go) */
export function extraHealthPenalty(d: ExtraDiagnostics): number {
  let penalty = 0;

  const kl = worst((d.keyLookups || []).map((k) => k.severity));
  if (kl >= 3) penalty += 10;
  else if (kl === 2) penalty += 5;

  const sp = worst((d.spools || []).map((s) => s.severity));
  if (sp >= 3) penalty += 10;
  else if (sp === 2) penalty += 5;

  if ((d.missingStatistics || []).length > 0) penalty += 12;

  const ps = d.parameterSniffing || [];
  if (ps.some((p) => p.hasMismatch && p.hasEstimateImpact)) penalty += 10;
  else if (ps.some((p) => p.hasMismatch)) penalty += 5;

  const ns = worst((d.nonSargable || []).map((n) => n.severity));
  if (ns >= 3) penalty += 12;
  else if (ns === 2) penalty += 6;

  if ((d.rowGoals || []).some((r) => r.misfired)) penalty += 8;

  return penalty;
}
