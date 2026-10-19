import { PlanAnalysis } from '../types/plan';

export function exportDiagnosticReportHTML(plan: PlanAnalysis) {
  const verdict = plan.executiveVerdict;
  const now = new Date().toLocaleString();

  const missingIndexesHtml = plan.allMissingIndexes.map((idx, i) => `
    <div class="card index-card">
      <div class="card-header">
        <span class="badge badge-success">#${i + 1} - ${idx.table}</span>
        <span class="impact-badge">Impact: ${idx.impact.toFixed(1)}%</span>
      </div>
      <p style="margin: 6px 0; color: #94a3b8; font-size: 13px;">
        <strong>Equality:</strong> ${idx.equalityColumns.join(', ') || 'None'} | 
        <strong>Inequality:</strong> ${idx.inequalityColumns.join(', ') || 'None'} | 
        <strong>Include:</strong> ${idx.includeColumns.join(', ') || 'None'}
      </p>
      <pre><code>${idx.suggestedDdl}</code></pre>
    </div>
  `).join('');

  const antiPatternsHtml = plan.antiPatterns.map((ap) => `
    <div class="card ap-card severity-${ap.severity}">
      <div class="card-header">
        <span class="badge badge-${ap.severity}">${ap.severity.toUpperCase()}</span>
        <strong style="font-size: 14px;">${ap.title} (${(ap.affectedStatements || []).join(', ')})</strong>
      </div>
      <p style="margin: 8px 0; color: #e2e8f0; font-size: 13px;">${ap.description}</p>
      <div style="background: rgba(56, 189, 248, 0.1); border-left: 3px solid #38bdf8; padding: 8px 12px; border-radius: 4px; font-size: 13px; color: #bae6fd;">
        <strong>Fix:</strong> ${ap.recommendation}
      </div>
    </div>
  `).join('');

  const waitStatsHtml = (plan.waitStats || []).map((ws) => `
    <tr>
      <td><code>${ws.waitType}</code></td>
      <td><span class="badge badge-info">${ws.category}</span></td>
      <td style="text-align: right; font-weight: 600;">${ws.waitTimeMs.toLocaleString()} ms</td>
      <td style="text-align: right;">${ws.waitCount.toLocaleString()}</td>
    </tr>
  `).join('');

  const statementsHtml = plan.statements.map((s) => `
    <tr>
      <td style="font-weight: 600;">#${s.statementId}</td>
      <td style="text-align: right; font-weight: 700; color: ${s.statementSubTreeCost > 10 ? '#f43f5e' : '#38bdf8'};">
        ${s.statementSubTreeCost.toFixed(2)}
      </td>
      <td style="text-align: right;">${s.costPercentage.toFixed(1)}%</td>
      <td style="font-size: 12px; color: #94a3b8; max-width: 450px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${s.statementText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      </td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PlanIQ Diagnostic Report - ${plan.planName}</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #0f172a;
      --card-border: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --cyan: #38bdf8;
      --emerald: #34d399;
      --rose: #f43f5e;
      --amber: #fbbf24;
      --indigo: #818cf8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: 40px;
      line-height: 1.5;
    }
    .header {
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 24px;
      margin-bottom: 32px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .title-row h1 { font-size: 28px; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 12px; }
    .subtitle { color: var(--text-muted); font-size: 14px; margin-top: 4px; }
    .meta-box { text-align: right; font-size: 12px; color: var(--text-muted); }

    .verdict-banner {
      background: linear-gradient(135deg, rgba(244, 63, 94, 0.12) 0%, rgba(15, 23, 42, 0.8) 100%);
      border: 1px solid rgba(244, 63, 94, 0.35);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 32px;
    }
    .verdict-tag { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; color: var(--cyan); margin-bottom: 8px; }
    .verdict-headline { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 12px; }
    .verdict-summary { font-size: 14px; color: #cbd5e1; margin-bottom: 16px; line-height: 1.6; }
    .verdict-fix { background: rgba(52, 211, 153, 0.1); border-left: 4px solid var(--emerald); padding: 12px 16px; border-radius: 6px; font-size: 14px; color: #a7f3d0; }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 36px;
    }
    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 18px;
    }
    .metric-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px; }
    .metric-val { font-size: 24px; font-weight: 800; color: #fff; }

    h2 { font-size: 18px; font-weight: 700; margin: 32px 0 16px; color: #e2e8f0; border-bottom: 1px solid var(--card-border); padding-bottom: 8px; }
    
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 14px;
    }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }

    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-critical { background: rgba(244, 63, 94, 0.2); color: var(--rose); border: 1px solid rgba(244, 63, 94, 0.4); }
    .badge-high { background: rgba(251, 191, 36, 0.2); color: var(--amber); border: 1px solid rgba(251, 191, 36, 0.4); }
    .badge-medium { background: rgba(129, 140, 248, 0.2); color: var(--indigo); border: 1px solid rgba(129, 140, 248, 0.4); }
    .badge-success { background: rgba(52, 211, 153, 0.2); color: var(--emerald); border: 1px solid rgba(52, 211, 153, 0.4); }
    .badge-info { background: rgba(56, 189, 248, 0.2); color: var(--cyan); border: 1px solid rgba(56, 189, 248, 0.4); }
    .impact-badge { font-weight: 700; color: var(--emerald); font-size: 13px; }

    pre {
      background: #06090f;
      border: 1px solid #1e293b;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 12px;
      color: #38bdf8;
      margin-top: 8px;
    }

    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    th { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--card-border); color: var(--text-muted); font-size: 11px; text-transform: uppercase; }
    td { padding: 10px 12px; border-bottom: 1px solid rgba(30, 41, 59, 0.5); }
    tr:hover { background: rgba(255, 255, 255, 0.02); }

    @media print {
      body { background: #fff; color: #1e293b; padding: 20px; }
      .verdict-banner, .card, .metric-card { border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; }
      pre { background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title-row">
      <h1>PlanIQ Executive Diagnostic Report</h1>
      <div class="subtitle">Execution Plan Analysis & AI Root Cause Audit • <code>${plan.planName}</code></div>
    </div>
    <div class="meta-box">
      <div>Generated: <strong>${now}</strong></div>
      <div>Engine: <strong>PlanIQ / Wails v2</strong></div>
    </div>
  </div>

  ${verdict ? `
  <div class="verdict-banner">
    <div class="verdict-tag">⚡ 10-Second Executive Root Cause Verdict</div>
    <div class="verdict-headline">${verdict.headline}</div>
    <div class="verdict-summary">${verdict.summary}</div>
    <div class="verdict-fix">
      <strong>Actionable Resolution:</strong> ${verdict.actionableFix}
    </div>
  </div>
  ` : ''}

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-label">Total SubTree Cost</div>
      <div class="metric-val" style="color: var(--cyan);">${plan.totalSubTreeCost.toFixed(2)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Total Statements</div>
      <div class="metric-val" style="color: var(--indigo);">${plan.totalStatements}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Missing Indexes</div>
      <div class="metric-val" style="color: var(--emerald);">${plan.allMissingIndexes.length}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Detected Anti-Patterns</div>
      <div class="metric-val" style="color: var(--amber);">${plan.antiPatterns.length}</div>
    </div>
  </div>

  <h2>Detected Query Anti-Patterns (${plan.antiPatterns.length})</h2>
  ${antiPatternsHtml || '<p style="color: var(--text-muted);">No critical anti-patterns detected.</p>'}

  ${plan.waitStats && plan.waitStats.length > 0 ? `
  <h2>Execution Wait Statistics</h2>
  <div class="card" style="padding: 0; overflow: hidden;">
    <table>
      <thead>
        <tr>
          <th>Wait Type</th>
          <th>Category</th>
          <th style="text-align: right;">Wait Time</th>
          <th style="text-align: right;">Wait Count</th>
        </tr>
      </thead>
      <tbody>
        ${waitStatsHtml}
      </tbody>
    </table>
  </div>
  ` : ''}

  <h2>Missing Index Recommendations (${plan.allMissingIndexes.length})</h2>
  ${missingIndexesHtml || '<p style="color: var(--text-muted);">No missing indexes recommended by SQL Server optimizer.</p>'}

  <h2>Statement Cost Breakdown (Top 24)</h2>
  <div class="card" style="padding: 0; overflow: hidden;">
    <table>
      <thead>
        <tr>
          <th>Stmt #</th>
          <th style="text-align: right;">SubTree Cost</th>
          <th style="text-align: right;">Cost %</th>
          <th>Query Text</th>
        </tr>
      </thead>
      <tbody>
        ${statementsHtml}
      </tbody>
    </table>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PlanIQ_Report_${plan.planName.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
