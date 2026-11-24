import { PlanAnalysis, PlanNode, StatementAnalysis } from '../types/plan';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

function sqlLiteral(type: string, value: string): string {
  const v = (value ?? '').trim();
  if (!v || /^null$/i.test(v)) return 'NULL';
  if (/^\(?-?\d+(\.\d+)?\)?$/.test(v)) return v.replace(/^\((.*)\)$/, '$1');
  if (/^0x[0-9a-f]+$/i.test(v)) return v;
  if (/(int|decimal|numeric|float|real|money|bit)/i.test(type) && !isNaN(Number(v))) return v;
  const unquoted = v.replace(/^N?'(.*)'$/s, '$1');
  const prefix = /^n/i.test(type) ? 'N' : '';
  return `${prefix}'${unquoted.replace(/'/g, "''")}'`;
}

/** Runnable script: declares sniffed parameters for SQL Server or EXPLAIN (ANALYZE, BUFFERS) for PostgreSQL. */
export function buildReproScript(stmt: StatementAnalysis): string {
  const s = stmt as any;
  if (stmt.pg || s.engine === 'postgresql') {
    const lines: string[] = [];
    lines.push(`-- PostgreSQL Repro Script for Statement #${stmt.statementId}`);
    lines.push('-- Generated from execution plan: EXPLAIN (ANALYZE, BUFFERS, SETTINGS, VERBOSE)');
    if (stmt.pg?.settings) {
      Object.entries(stmt.pg.settings).forEach(([k, v]) => {
        lines.push(`-- Session setting: ${k} = '${v}'`);
      });
    }
    lines.push('BEGIN;');
    lines.push('EXPLAIN (ANALYZE, BUFFERS, SETTINGS, VERBOSE)');
    lines.push((stmt.statementText || '').trim().replace(/;?\s*$/, ';'));
    lines.push('ROLLBACK;');
    return lines.join('\n');
  }

  const lines: string[] = [];
  lines.push(`-- Repro script for statement #${stmt.statementId} (${stmt.statementType})`);
  lines.push('-- Generated from the execution plan: parameter values come from the plan (runtime value if captured, otherwise compiled value).');
  (s.traceFlags || []).forEach((t: any) => lines.push(`-- Plan was compiled with trace flag ${t.value} (${t.scope}, ${t.status})`));
  lines.push('SET STATISTICS IO, TIME ON;');
  lines.push('');
  const params: any[] = s.parameters || [];
  params.forEach((p) => {
    const val = p.hasRuntime ? p.runtimeValue : p.compiledValue;
    const note = p.mismatch ? `  -- compiled with ${p.compiledValue || 'NULL'}, ran with ${p.runtimeValue}` : '';
    lines.push(`DECLARE ${p.column} ${p.parameterType || 'sql_variant'} = ${sqlLiteral(p.parameterType || '', val)};${note}`);
  });
  if (params.length) lines.push('');
  lines.push((stmt.statementText || '').trim().replace(/;?\s*$/, ';'));
  return lines.join('\n');
}

/** Standalone, shareable HTML report. */
export function buildHtmlReport(plan: PlanAnalysis): string {
  const p = plan as any;
  const statements: any[] = p.statements || [];
  const fmt = (n: number) => Number(n || 0).toLocaleString();
  const css = `body{font:14px/1.5 Segoe UI,Arial,sans-serif;margin:0;background:#0f172a;color:#e2e8f0}
main{max-width:1000px;margin:auto;padding:24px}h1{margin:0 0 4px}h2{margin-top:32px;border-bottom:1px solid #334155;padding-bottom:6px}
.card{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px 16px;margin:12px 0}
table{width:100%;border-collapse:collapse}td,th{padding:5px 8px;border-bottom:1px solid #334155;text-align:left;font-size:13px}
.Critical{color:#f87171}.Warning{color:#fbbf24}.Info{color:#60a5fa}.dim{color:#94a3b8}.good{color:#34d399}
pre{background:#020617;padding:10px;border-radius:8px;overflow:auto;white-space:pre-wrap;font-size:12px}`;

  const waitRows = (p.waitStats || [])
    .map(
      (w: any) =>
        `<tr><td>${esc(w.waitType)}</td><td>${fmt(w.waitTimeMs)} ms</td><td>${fmt(w.waitCount)}</td><td>${w.showAverage ? esc(w.avgLatencyMs) + ' ms' : ''}</td><td class="good">${w.benefitPercent ? 'up to ' + esc(w.benefitPercent) + '%' : ''}</td></tr>`
    )
    .join('');

  const stmtHtml = statements
    .map((s) => {
      const findings: any[] = s.findings || [];
      const rows = findings
        .map(
          (f) =>
            `<tr><td class="${esc(f.severity)}">${esc(f.severity)}</td><td>${esc(f.type)}${f.nodeId !== undefined ? ' <span class="dim">(Node ' + f.nodeId + ')</span>' : ''}</td><td>${esc(f.message)}</td><td class="good">${f.maxBenefitPercent != null ? 'up to ' + f.maxBenefitPercent + '%' : '—'}</td></tr>`
        )
        .join('');
      return `<div class="card"><h3>Statement #${esc(s.statementId)} <span class="dim">— cost ${esc(Number(s.statementSubTreeCost).toFixed(4))} (${esc(Number(s.costPercentage || 0).toFixed(1))}%)</span></h3>
<pre>${esc((s.statementText || '').trim())}</pre>
${s.queryTimeStats ? `<p class="dim">CPU ${fmt(s.queryTimeStats.cpuTimeMs)} ms · Elapsed ${fmt(s.queryTimeStats.elapsedTimeMs)} ms</p>` : ''}
${rows ? `<table><tr><th>Severity</th><th>Finding</th><th>Details</th><th>Benefit</th></tr>${rows}</table>` : '<p class="dim">No findings.</p>'}
${(s.missingIndexes || []).map((m: any) => `<pre>${esc(m.suggestedDdl)}</pre>`).join('')}</div>`;
    })
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Execution Plan Report — ${esc(p.planName)}</title><style>${css}</style></head><body><main>
<h1>Execution Plan Report</h1><div class="dim">${esc(p.planName)} · ${statements.length} statement(s) · total cost ${esc(Number(p.totalSubTreeCost || 0).toFixed(4))} · generated ${new Date().toLocaleString()}</div>
${p.executiveVerdict ? `<div class="card"><strong>${esc(p.executiveVerdict.headline)}</strong><p>${esc(p.executiveVerdict.summary)}</p></div>` : ''}
${waitRows ? `<h2>Wait Statistics</h2><div class="card"><table><tr><th>Wait</th><th>Time</th><th>Count</th><th>Avg latency</th><th>Benefit</th></tr>${waitRows}</table></div>` : ''}
<h2>Statements &amp; Findings</h2>${stmtHtml}</main></body></html>`;
}

export function downloadTextFile(filename: string, content: string, mime = 'text/html') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Raw & Anonymized / Masked Execution Plan Exporter (.sqlplan & .json)
// ═══════════════════════════════════════════════════════════════════════════════

type IdKind =
  | 'server'
  | 'db'
  | 'schema'
  | 'table'
  | 'index'
  | 'column'
  | 'alias'
  | 'param'
  | 'trigger'
  | 'constraint'
  | 'func'
  | 'cte';

const SYSTEM_SCHEMAS = new Set([
  'dbo',
  'sys',
  'information_schema',
  'pg_catalog',
  'pg_toast',
  'pg_temp',
  'public',
]);

const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null', 'true', 'false',
  'join', 'inner', 'left', 'right', 'full', 'outer', 'cross', 'on', 'as', 'case',
  'when', 'then', 'else', 'end', 'group', 'by', 'order', 'asc', 'desc', 'having',
  'limit', 'offset', 'union', 'all', 'distinct', 'with', 'recursive', 'insert',
  'into', 'values', 'update', 'set', 'delete', 'merge', 'using', 'matched',
  'between', 'like', 'ilike', 'similar', 'to', 'any', 'some', 'exists', 'count',
  'sum', 'avg', 'min', 'max', 'coalesce', 'nullif', 'cast', 'varchar', 'nvarchar',
  'char', 'nchar', 'text', 'int', 'integer', 'bigint', 'smallint', 'numeric',
  'decimal', 'float', 'real', 'double', 'precision', 'boolean', 'bool', 'date',
  'timestamp', 'timestamptz', 'time', 'interval', 'uuid', 'json', 'jsonb', 'bytea',
  'bit', 'money', 'datetime', 'datetime2', 'top', 'percent', 'over', 'partition',
  'row_number', 'rank', 'dense_rank', 'filter', 'within', 'returning', 'for',
  'share', 'update', 'skip', 'locked', 'nowait', 'table', 'index', 'only',
  'hashed', 'plain', 'sorted', 'parallel', 'partial', 'finalize',
]);

class DeterministicMapper {
  private counters: Record<IdKind, number> = {
    server: 0,
    db: 0,
    schema: 0,
    table: 0,
    index: 0,
    column: 0,
    alias: 0,
    param: 0,
    trigger: 0,
    constraint: 0,
    func: 0,
    cte: 0,
  };
  private map = new Map<string, string>();
  private prefixes: Record<IdKind, string>;

  constructor(style: 'sqlserver' | 'postgresql') {
    this.prefixes =
      style === 'postgresql'
        ? {
            server: 'server',
            db: 'db',
            schema: 'schema',
            table: 'table',
            index: 'idx',
            column: 'col',
            alias: 't',
            param: 'p',
            trigger: 'trg',
            constraint: 'con',
            func: 'fn',
            cte: 'cte',
          }
        : {
            server: 'Server',
            db: 'DB',
            schema: 'Schema',
            table: 'Table',
            index: 'Ix',
            column: 'Col',
            alias: 'Alias',
            param: '@p',
            trigger: 'Trg',
            constraint: 'Con',
            func: 'Fn',
            cte: 'CTE',
          };
  }

  register(kind: IdKind, rawName: string): string {
    const clean = stripBrackets(rawName).trim();
    if (!clean) return rawName;

    // Preserve SQL Server temp table sigil (# / ##) and PG/SQL system schemas
    if (kind === 'schema' && SYSTEM_SCHEMAS.has(clean.toLowerCase())) {
      return clean;
    }
    if (SQL_KEYWORDS.has(clean.toLowerCase())) {
      return clean;
    }

    const lookupKey = clean.toLowerCase();
    const existing = this.map.get(lookupKey);
    if (existing) {
      return existing;
    }

    this.counters[kind] += 1;
    const seq = String(this.counters[kind]).padStart(2, '0');
    let anon: string;
    if (kind === 'param') {
      anon = clean.startsWith('@') ? `@p${seq}` : `p${seq}`;
    } else if (clean.startsWith('##')) {
      anon = `##TempTable_${seq}`;
    } else if (clean.startsWith('#')) {
      anon = `#TempTable_${seq}`;
    } else {
      anon = `${this.prefixes[kind]}_${seq}`;
    }

    this.map.set(lookupKey, anon);
    return anon;
  }

  get(rawName: string): string | undefined {
    return this.map.get(stripBrackets(rawName).trim().toLowerCase());
  }

  entriesSortedLongest(): Array<[string, string]> {
    return Array.from(this.map.entries()).sort((a, b) => b[0].length - a[0].length);
  }
}

function stripBrackets(s: string): string {
  return s.replace(/^\[(.*)\]$/, '$1').replace(/^"(.*)"$/, '$1');
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskSqlTextLiteralsAndIds(sqlText: string, mapper: DeterministicMapper, bracketSyntax: boolean): string {
  if (!sqlText) return sqlText;

  // Mask single-quoted string literals (preserving quotes, handling escaped '')
  // Protect them behind tokens so identifier substitution doesn't touch masked literals.
  let out = sqlText.replace(/(N?'(?:''|[^'])*')/g, (match) => {
    return match.startsWith('N') || match.startsWith('n') ? "N'***'" : "'***'";
  });

  // Replace bracketed [Identifier] tokens if SQL Server
  if (bracketSyntax) {
    out = out.replace(/\[([^\]]+)\]/g, (full, inner) => {
      const mapped = mapper.get(inner);
      return mapped ? `[${mapped}]` : full;
    });
  } else {
    // PostgreSQL double-quoted identifiers "Ident"
    out = out.replace(/"([^"]+)"/g, (full, inner) => {
      const mapped = mapper.get(inner);
      return mapped ? `"${mapped}"` : full;
    });
  }

  // Replace standalone numeric literals outside $1/$2 positional params and identifiers
  out = out.replace(/(?<![a-zA-Z0-9_$])(\d+(?:\.\d+)?)(?![a-zA-Z0-9_])/g, '0');

  // Replace known unquoted identifiers (longest first)
  for (const [origLower, anon] of mapper.entriesSortedLongest()) {
    if (origLower.length < 2 && !origLower.startsWith('@')) continue;
    const escaped = escapeRegExp(origLower);
    const rx = origLower.startsWith('@')
      ? new RegExp(`${escaped}(?![a-zA-Z0-9_])`, 'gi')
      : new RegExp(`(?<![a-zA-Z0-9_@])${escaped}(?![a-zA-Z0-9_])`, 'gi');
    out = out.replace(rx, anon);
  }

  return out;
}

function unescapeXmlAttr(val: string): string {
  return val
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeXmlAttr(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function maskXmlParamValue(rawVal: string): string {
  const trimmed = rawVal.trim();
  if (!trimmed || /^null$/i.test(trimmed) || /^\(null\)$/i.test(trimmed)) {
    return rawVal;
  }
  const hasParens = trimmed.startsWith('(') && trimmed.endsWith(')');
  const inner = hasParens ? trimmed.slice(1, -1).trim() : trimmed;
  let maskedInner = '0';
  if (/^null$/i.test(inner)) {
    maskedInner = 'NULL';
  } else if (/^N?'/i.test(inner)) {
    maskedInner = inner.startsWith('N') || inner.startsWith('n') ? "N'***'" : "'***'";
  } else if (/^-?\d+(\.\d+)?$/.test(inner)) {
    maskedInner = '0';
  } else if (/^0x[0-9a-f]+$/i.test(inner)) {
    maskedInner = '0x00';
  } else {
    maskedInner = "'***'";
  }
  return hasParens ? `(${maskedInner})` : maskedInner;
}

/**
 * Deterministically obfuscates SQL Server .sqlplan XML:
 * - Maps Server, Database, Schema, Table, Index, Column, Alias, and @Parameter names
 * - Masks ParameterCompiledValue, ParameterRuntimeValue, ConstValue, StatementText, and ScalarString literals
 */
export function anonymizeSqlPlanXml(xmlContent: string): string {
  if (!xmlContent || !xmlContent.trim()) return xmlContent;

  const mapper = new DeterministicMapper('sqlserver');

  const attrKinds: Array<[string, IdKind]> = [
    ['Server', 'server'],
    ['Database', 'db'],
    ['Schema', 'schema'],
    ['Table', 'table'],
    ['Index', 'index'],
    ['Alias', 'alias'],
    ['Column', 'column'],
  ];

  // Pass 1: Collect and replace structural object/column attributes
  let result = xmlContent;
  for (const [attrName, kind] of attrKinds) {
    const attrRx = new RegExp(`(\\b${attrName}=")([^"]*)(")`, 'g');
    result = result.replace(attrRx, (_full, prefix, rawVal, suffix) => {
      const decoded = unescapeXmlAttr(rawVal);
      if (!decoded.trim()) return `${prefix}${rawVal}${suffix}`;
      const actualKind: IdKind = kind === 'column' && decoded.trim().startsWith('@') ? 'param' : kind;
      const hadBrackets = decoded.trim().startsWith('[') && decoded.trim().endsWith(']');
      const anon = mapper.register(actualKind, decoded);
      const formatted = actualKind === 'param' ? anon : hadBrackets || (actualKind !== 'schema' || !SYSTEM_SCHEMAS.has(anon.toLowerCase())) ? `[${stripBrackets(anon)}]` : anon;
      return `${prefix}${escapeXmlAttr(formatted)}${suffix}`;
    });
  }

  // Pass 2: Scrub parameter runtime/compiled values
  for (const paramAttr of ['ParameterCompiledValue', 'ParameterRuntimeValue', 'ConstValue']) {
    const pRx = new RegExp(`(\\b${paramAttr}=")([^"]*)(")`, 'g');
    result = result.replace(pRx, (_full, prefix, rawVal, suffix) => {
      const decoded = unescapeXmlAttr(rawVal);
      const masked = maskXmlParamValue(decoded);
      return `${prefix}${escapeXmlAttr(masked)}${suffix}`;
    });
  }

  // Pass 3: Scrub StatementText and ScalarString expressions using registered identifiers & literal masking
  for (const exprAttr of ['StatementText', 'ScalarString']) {
    const eRx = new RegExp(`(\\b${exprAttr}=")([^"]*)(")`, 'g');
    result = result.replace(eRx, (_full, prefix, rawVal, suffix) => {
      const decoded = unescapeXmlAttr(rawVal);
      const scrubbed = maskSqlTextLiteralsAndIds(decoded, mapper, true);
      return `${prefix}${escapeXmlAttr(scrubbed)}${suffix}`;
    });
  }

  return result;
}

const PG_SYSTEM_TYPES = new Set([
  'int', 'int2', 'int4', 'int8', 'integer', 'bigint', 'smallint', 'numeric',
  'text', 'varchar', 'bpchar', 'char', 'bool', 'boolean', 'date', 'time',
  'timestamp', 'timestamptz', 'uuid', 'json', 'jsonb', 'bytea', 'float4', 'float8',
  'double', 'precision', 'real', 'oid', 'name', 'anyelement', 'unknown', 'record',
]);

function extractPgColumnCandidates(expr: string, mapper: DeterministicMapper) {
  if (!expr) return;
  const cleaned = expr.replace(/'(?:''|[^'])*'/g, ' ');
  // Qualified table.col references
  const qualRx = /\b([a-zA-Z_][a-zA-Z0-9_$]*)\.([a-zA-Z_][a-zA-Z0-9_$]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = qualRx.exec(cleaned)) !== null) {
    const colName = m[2];
    if (!SQL_KEYWORDS.has(colName.toLowerCase()) && !PG_SYSTEM_TYPES.has(colName.toLowerCase())) {
      mapper.register('column', colName);
    }
  }
  // Simple column tokens in Output / Sort Key / Group Key lists (avoid function calls followed by `(`)
  const simpleRx = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b(?!\s*\()/g;
  while ((m = simpleRx.exec(cleaned)) !== null) {
    const token = m[1];
    const lower = token.toLowerCase();
    if (!SQL_KEYWORDS.has(lower) && !PG_SYSTEM_TYPES.has(lower) && !mapper.get(token)) {
      mapper.register('column', token);
    }
  }
}

function collectPgIdentifiers(node: any, mapper: DeterministicMapper) {
  if (!node || typeof node !== 'object') return;
  if (typeof node['Schema'] === 'string' && node['Schema']) {
    mapper.register('schema', node['Schema']);
  }
  if (typeof node['Relation Name'] === 'string' && node['Relation Name']) {
    mapper.register('table', node['Relation Name']);
  }
  if (typeof node['Index Name'] === 'string' && node['Index Name']) {
    mapper.register('index', node['Index Name']);
  }
  if (typeof node['Alias'] === 'string' && node['Alias']) {
    mapper.register('alias', node['Alias']);
  }
  if (typeof node['Table Function Name'] === 'string' && node['Table Function Name']) {
    mapper.register('func', node['Table Function Name']);
  }
  if (typeof node['CTE Name'] === 'string' && node['CTE Name']) {
    mapper.register('cte', node['CTE Name']);
  }
  if (typeof node['Subplan Name'] === 'string' && node['Subplan Name']) {
    const m = /^CTE\s+(.+)$/i.exec(node['Subplan Name'].trim());
    if (m?.[1]) mapper.register('cte', m[1].trim());
  }

  for (const arrField of ['Output', 'Sort Key', 'Presorted Key', 'Group Key', 'Hash Key']) {
    if (Array.isArray(node[arrField])) {
      node[arrField].forEach((entry: any) => {
        if (typeof entry === 'string') extractPgColumnCandidates(entry, mapper);
      });
    }
  }
  for (const strField of ['Filter', 'Index Cond', 'Recheck Cond', 'Hash Cond', 'Merge Cond', 'Join Filter', 'Cache Key', 'One-Time Filter', 'TID Cond']) {
    if (typeof node[strField] === 'string') {
      extractPgColumnCandidates(node[strField], mapper);
    }
  }
  if (Array.isArray(node.Plans)) {
    node.Plans.forEach((child: any) => collectPgIdentifiers(child, mapper));
  }
}

function rewritePgNode(node: any, mapper: DeterministicMapper): any {
  if (!node || typeof node !== 'object') return node;
  const copy: any = { ...node };

  if (typeof copy['Schema'] === 'string' && copy['Schema']) {
    copy['Schema'] = mapper.register('schema', copy['Schema']);
  }
  if (typeof copy['Relation Name'] === 'string' && copy['Relation Name']) {
    copy['Relation Name'] = mapper.register('table', copy['Relation Name']);
  }
  if (typeof copy['Index Name'] === 'string' && copy['Index Name']) {
    copy['Index Name'] = mapper.register('index', copy['Index Name']);
  }
  if (typeof copy['Alias'] === 'string' && copy['Alias']) {
    copy['Alias'] = mapper.register('alias', copy['Alias']);
  }
  if (typeof copy['Table Function Name'] === 'string' && copy['Table Function Name']) {
    copy['Table Function Name'] = mapper.register('func', copy['Table Function Name']);
  }
  if (typeof copy['CTE Name'] === 'string' && copy['CTE Name']) {
    copy['CTE Name'] = mapper.register('cte', copy['CTE Name']);
  }
  if (typeof copy['Subplan Name'] === 'string' && copy['Subplan Name']) {
    const m = /^(CTE\s+)(.+)$/i.exec(copy['Subplan Name'].trim());
    if (m?.[2]) {
      const mapped = mapper.get(m[2].trim()) || mapper.register('cte', m[2].trim());
      copy['Subplan Name'] = `${m[1]}${mapped}`;
    }
  }

  for (const arrField of ['Output', 'Sort Key', 'Presorted Key', 'Group Key', 'Hash Key']) {
    if (Array.isArray(copy[arrField])) {
      copy[arrField] = copy[arrField].map((entry: any) =>
        typeof entry === 'string' ? maskSqlTextLiteralsAndIds(entry, mapper, false) : entry
      );
    }
  }
  for (const strField of ['Filter', 'Index Cond', 'Recheck Cond', 'Hash Cond', 'Merge Cond', 'Join Filter', 'Cache Key', 'One-Time Filter', 'TID Cond']) {
    if (typeof copy[strField] === 'string') {
      copy[strField] = maskSqlTextLiteralsAndIds(copy[strField], mapper, false);
    }
  }
  if (Array.isArray(copy.Plans)) {
    copy.Plans = copy.Plans.map((child: any) => rewritePgNode(child, mapper));
  }
  return copy;
}

/**
 * Deterministically obfuscates PostgreSQL EXPLAIN (FORMAT JSON) plans:
 * - Maps Schema, Relation Name, Index Name, Alias, Column, Trigger, Constraint, Function & CTE names
 * - Masks SQL string/numeric literals in Predicates, Output, Sort Keys, and Query text
 */
export function anonymizePgPlanJson(jsonContent: string): string {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch {
    return jsonContent;
  }

  const mapper = new DeterministicMapper('postgresql');

  const processRoot = (root: any) => {
    if (!root || typeof root !== 'object') return root;
    if (root.Plan) collectPgIdentifiers(root.Plan, mapper);
    if (Array.isArray(root.Triggers)) {
      root.Triggers.forEach((tr: any) => {
        if (tr['Trigger Name']) mapper.register('trigger', tr['Trigger Name']);
        if (tr['Relation']) mapper.register('table', tr['Relation']);
        if (tr['Constraint']) mapper.register('constraint', tr['Constraint']);
      });
    }

    const outRoot: any = { ...root };
    if (outRoot.Plan) {
      outRoot.Plan = rewritePgNode(outRoot.Plan, mapper);
    }
    if (Array.isArray(outRoot.Triggers)) {
      outRoot.Triggers = outRoot.Triggers.map((tr: any) => ({
        ...tr,
        ...(tr['Trigger Name'] ? { 'Trigger Name': mapper.register('trigger', tr['Trigger Name']) } : {}),
        ...(tr['Relation'] ? { Relation: mapper.register('table', tr['Relation']) } : {}),
        ...(tr['Constraint'] ? { Constraint: mapper.register('constraint', tr['Constraint']) } : {}),
      }));
    }
    if (typeof outRoot.Query === 'string' && outRoot.Query) {
      outRoot.Query = maskSqlTextLiteralsAndIds(outRoot.Query, mapper, false);
    }
    if (outRoot['Query Identifier'] !== undefined) {
      outRoot['Query Identifier'] = 0;
    }
    return outRoot;
  };

  if (Array.isArray(parsed)) {
    const out = parsed.map((item) => (item?.Plan ? processRoot(item) : item));
    return JSON.stringify(out, null, 2);
  }

  if (parsed && typeof parsed === 'object' && parsed.Plan) {
    return JSON.stringify([processRoot(parsed)], null, 2);
  }

  // Handle wrapped exports (DBeaver / pgAdmin) by replacing top-level SQL keys too
  if (parsed && typeof parsed === 'object') {
    const wrappedOut: Record<string, any> = {};
    for (const [k, v] of Object.entries(parsed)) {
      let transformedVal = v;
      if (Array.isArray(v)) {
        transformedVal = v.map((row) => {
          if (row && typeof row === 'object') {
            const newRow: Record<string, any> = {};
            for (const [rk, rv] of Object.entries(row)) {
              if (/query.?plan|plan|explain/i.test(rk) && typeof rv === 'string') {
                newRow[rk] = anonymizePgPlanJson(rv);
              } else if (/query.?plan|plan|explain/i.test(rk) && Array.isArray(rv)) {
                newRow[rk] = rv.map((r) => (r?.Plan ? processRoot(r) : r));
              } else {
                newRow[rk] = rv;
              }
            }
            return newRow;
          }
          return row;
        });
      }
      const anonKey = /explain|select|insert|update|delete|with/i.test(k)
        ? maskSqlTextLiteralsAndIds(k, mapper, false)
        : k;
      wrappedOut[anonKey] = transformedVal;
    }
    return JSON.stringify(wrappedOut, null, 2);
  }

  return jsonContent;
}

function reconstructPgNodeFromAnalysis(node: PlanNode): Record<string, any> {
  const obj: Record<string, any> = {
    'Node Type': node.physicalOp || 'Result',
    'Total Cost': Number(node.estimatedTotalSubtreeCost ?? 0),
    'Plan Rows': Number(node.estimateRows ?? 0),
  };
  if (node.pg?.startupCost !== undefined) obj['Startup Cost'] = node.pg.startupCost;
  if (node.pg?.planWidth !== undefined) obj['Plan Width'] = node.pg.planWidth;
  if (node.pg?.strategy) obj['Strategy'] = node.pg.strategy;
  if (node.pg?.parentRelationship) obj['Parent Relationship'] = node.pg.parentRelationship;
  if (node.pg?.subplanName) obj['Subplan Name'] = node.pg.subplanName;
  if (node.pg?.schema || node.schema) obj['Schema'] = node.pg?.schema || node.schema;
  if (node.pg?.relation || node.table) obj['Relation Name'] = node.pg?.relation || node.table;
  if (node.pg?.alias) obj['Alias'] = node.pg.alias;
  if (node.pg?.indexName || node.index) obj['Index Name'] = node.pg?.indexName || node.index;
  if (node.pg?.indexCond || node.seekPredicates) obj['Index Cond'] = node.pg?.indexCond || node.seekPredicates;
  if (node.pg?.filter || node.predicate) obj['Filter'] = node.pg?.filter || node.predicate;
  if (node.outputColumns?.length) obj['Output'] = node.outputColumns;
  if (node.hasActualRows) {
    obj['Actual Rows'] = node.actualRows;
    obj['Actual Loops'] = node.pg?.loops || node.actualScans || 1;
    if (node.actualElapsedMs > 0) obj['Actual Total Time'] = node.actualElapsedMs;
  }
  if (node.pg?.buffers) {
    if (node.pg.buffers.sharedHit) obj['Shared Hit Blocks'] = node.pg.buffers.sharedHit;
    if (node.pg.buffers.sharedRead) obj['Shared Read Blocks'] = node.pg.buffers.sharedRead;
    if (node.pg.buffers.tempRead) obj['Temp Read Blocks'] = node.pg.buffers.tempRead;
    if (node.pg.buffers.tempWritten) obj['Temp Written Blocks'] = node.pg.buffers.tempWritten;
  }
  if (node.children?.length) {
    obj['Plans'] = node.children.map(reconstructPgNodeFromAnalysis);
  }
  return obj;
}

function reconstructSqlNodeXml(node: PlanNode, indent = '          '): string {
  const childXml = (node.children || []).map((c) => reconstructSqlNodeXml(c, indent + '  ')).join('\n');
  const objAttrs: string[] = [];
  if (node.database) objAttrs.push(`Database="${escapeXmlAttr(`[${node.database}]`)}"`);
  if (node.schema) objAttrs.push(`Schema="${escapeXmlAttr(`[${node.schema}]`)}"`);
  if (node.table) objAttrs.push(`Table="${escapeXmlAttr(`[${node.table}]`)}"`);
  if (node.index) objAttrs.push(`Index="${escapeXmlAttr(`[${node.index}]`)}"`);
  const objTag = objAttrs.length > 0 ? `${indent}  <Object ${objAttrs.join(' ')} />` : '';
  return `${indent}<RelOp NodeId="${node.nodeId}" PhysicalOp="${escapeXmlAttr(node.physicalOp)}" LogicalOp="${escapeXmlAttr(node.logicalOp || node.physicalOp)}" EstimateRows="${node.estimateRows}" EstimateCPU="${node.estimateCpu}" EstimateIO="${node.estimateIo}" EstimatedTotalSubtreeCost="${node.estimatedTotalSubtreeCost}" Parallel="${node.parallel ? 1 : 0}">
${objTag}
${childXml}
${indent}</RelOp>`;
}

/** Ensures raw plan content exists, reconstructing valid .json or .sqlplan from parsed PlanAnalysis if opened without raw buffer. */
export function buildRawPlanContent(plan: PlanAnalysis, rawContent?: string): string {
  if (rawContent && rawContent.trim()) {
    return rawContent;
  }
  if (plan.engine === 'postgresql') {
    const arr = (plan.statements || []).map((stmt) => ({
      Plan: stmt.rootNode ? reconstructPgNodeFromAnalysis(stmt.rootNode) : { 'Node Type': 'Result', 'Total Cost': stmt.statementSubTreeCost, 'Plan Rows': 1 },
      ...(stmt.pg?.planningMs !== undefined ? { 'Planning Time': stmt.pg.planningMs } : {}),
      ...(stmt.pg?.executionMs !== undefined ? { 'Execution Time': stmt.pg.executionMs } : {}),
      ...(stmt.pg?.settings ? { Settings: stmt.pg.settings } : {}),
      ...(stmt.statementText ? { Query: stmt.statementText } : {}),
    }));
    return JSON.stringify(arr, null, 2);
  }

  const stmtsXml = (plan.statements || [])
    .map(
      (s) => `      <StmtSimple StatementId="${escapeXmlAttr(s.statementId)}" StatementType="${escapeXmlAttr(s.statementType || 'SELECT')}" StatementSubTreeCost="${s.statementSubTreeCost}" StatementText="${escapeXmlAttr(s.statementText || '')}">
        <QueryPlan>
${s.rootNode ? reconstructSqlNodeXml(s.rootNode) : ''}
        </QueryPlan>
      </StmtSimple>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<ShowPlanXML xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan" Version="1.6" Build="16.0">
  <BatchSequence>
    <Batch>
      <Statements>
${stmtsXml}
      </Statements>
    </Batch>
  </BatchSequence>
</ShowPlanXML>`;
}

/** Returns anonymized/masked .json (PostgreSQL) or .sqlplan (SQL Server) content. */
export function buildAnonymizedPlanContent(plan: PlanAnalysis, rawContent?: string): string {
  const raw = buildRawPlanContent(plan, rawContent);
  const isPg = plan.engine === 'postgresql' || raw.trim().startsWith('[') || raw.trim().startsWith('{');
  return isPg ? anonymizePgPlanJson(raw) : anonymizeSqlPlanXml(raw);
}

function sanitizeFilenameBase(name: string): string {
  return (name || 'execution_plan')
    .replace(/\.(sqlplan|xml|json)$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'execution_plan';
}

export function downloadCapturedPlanFile(content: string, baseName: string, engineHint?: string): void {
  const trimmed = (content || '').trim();
  const isJson = engineHint === 'postgresql' || trimmed.startsWith('[') || trimmed.startsWith('{');
  const ext = isJson ? 'json' : 'sqlplan';
  const mime = isJson ? 'application/json' : 'application/xml';
  const base = sanitizeFilenameBase(baseName);
  downloadTextFile(`${base}.${ext}`, content, mime);
}

export function exportRawPlanFile(plan: PlanAnalysis, rawContent?: string): void {
  const content = buildRawPlanContent(plan, rawContent);
  const isPg = plan.engine === 'postgresql' || content.trim().startsWith('[') || content.trim().startsWith('{');
  const ext = isPg ? 'json' : 'sqlplan';
  const mime = isPg ? 'application/json' : 'application/xml';
  const base = sanitizeFilenameBase(plan.planName);
  downloadTextFile(`${base}.${ext}`, content, mime);
}

export function exportAnonymizedPlanFile(plan: PlanAnalysis, rawContent?: string): string {
  const anonymized = buildAnonymizedPlanContent(plan, rawContent);
  const isPg = plan.engine === 'postgresql' || anonymized.trim().startsWith('[') || anonymized.trim().startsWith('{');
  const ext = isPg ? 'json' : 'sqlplan';
  const mime = isPg ? 'application/json' : 'application/xml';
  const base = sanitizeFilenameBase(plan.planName);
  downloadTextFile(`${base}.anonymized.${ext}`, anonymized, mime);
  return anonymized;
}
