import { PlanAnalysis, StatementAnalysis } from '../types/plan';

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

/** Runnable T-SQL: declares the sniffed parameters (runtime value when present, else compiled) and runs the statement. */
export function buildReproScript(stmt: StatementAnalysis): string {
  const s = stmt as any;
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
