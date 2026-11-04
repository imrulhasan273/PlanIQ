import React from 'react';
import { AlertTriangle, Clock, Flag, Hourglass, Variable, RefreshCw, Zap } from 'lucide-react';
import { PlanAnalysis, StatementAnalysis, PlanNode } from '../types/plan';
import { applyFindingsAndWaitInsights } from '../utils/planFindings';

interface Props {
  node: PlanNode;
  statement: StatementAnalysis;
  plan: PlanAnalysis;
  onSelectNodeId?: (nodeId: number) => void;
}

const sevColor: Record<string, string> = { Critical: '#f87171', Warning: '#fbbf24', Info: '#60a5fa' };

const section: React.CSSProperties = {
  background: 'rgba(15,23,42,0.55)',
  border: '1px solid rgba(148,163,184,0.18)',
  borderRadius: 8,
  padding: '10px 12px',
  marginBottom: 10,
};
const heading: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: '#cbd5e1',
  marginBottom: 6,
};
const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '2px 0', color: '#e2e8f0' };
const dim: React.CSSProperties = { color: '#94a3b8' };

export const NodeExtraPanels: React.FC<Props> = ({ node, statement, plan, onSelectNodeId }) => {
  const n = node as any;
  const s = statement as any;
  const p = plan as any;

  // Auto-enrich plan and statement on the fly so Findings by Benefit & wait insights ALWAYS appear!
  if (plan && (!s.findings || s.findings.length === 0 || !p.waitStats?.[0]?.timeModel)) {
    applyFindingsAndWaitInsights(plan);
  }

  const opWarnings: { kind: string; description: string }[] = n.operatorWarnings || [];
  const stmtWarnings: any[] = (statement.warnings || []).filter(
    (w: any) => !w.nodeId || w.nodeId === node.nodeId
  );
  const waitStats: any[] = (p.waitStats || []).slice(0, 8);
  const traceFlags: any[] = s.traceFlags || [];
  const params: any[] = s.parameters || [];
  const qts = s.queryTimeStats;
  const findings: any[] = s.findings || [];

  const totalElapsed = (p.statements || []).reduce((acc: number, st: any) => acc + (st.queryTimeStats?.elapsedTimeMs || st.actualElapsedMs || 0), 0) || 1;

  return (
    <div className="node-extra-panels">
      {/* 1. BENEFIT SCORING FINDINGS */}
      {findings.length > 0 && (
        <div style={{ ...section, borderColor: 'rgba(248,113,113,0.45)', background: 'rgba(239, 68, 68, 0.05)' }}>
          <div style={{ ...heading, color: '#fca5a5' }}>
            <Zap size={13} color="#f87171" /> Findings by Benefit ({findings.length})
          </div>
          {findings.map((f, i) => (
            <div
              key={i}
              onClick={() => f.nodeId !== undefined && onSelectNodeId?.(f.nodeId)}
              style={{
                fontSize: 12,
                padding: '6px 4px',
                borderBottom: i < findings.length - 1 ? '1px solid rgba(148,163,184,0.1)' : 'none',
                cursor: f.nodeId !== undefined ? 'pointer' : 'default',
                borderRadius: 4,
                background: f.nodeId === node.nodeId ? 'rgba(56,189,248,0.12)' : 'transparent',
              }}
              title={f.nodeId !== undefined ? `Click to jump to Node #${f.nodeId}` : 'Statement finding'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <strong style={{ color: sevColor[f.severity] || '#e2e8f0' }}>
                  {f.type}
                  {f.nodeId !== undefined && <span style={{ color: '#38bdf8', marginLeft: 4 }}>[Node #{f.nodeId}]</span>}
                </strong>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: f.maxBenefitPercent ? 'rgba(52, 211, 153, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                    color: f.maxBenefitPercent ? '#34d399' : '#94a3b8',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.maxBenefitPercent !== null && f.maxBenefitPercent !== undefined ? `+${f.maxBenefitPercent}% benefit` : 'info'}
                </span>
              </div>
              <div style={{ ...dim, fontSize: 11, marginTop: 2 }}>{f.message}</div>
            </div>
          ))}
        </div>
      )}

      {/* 2. OPERATOR WARNINGS */}
      {(opWarnings.length > 0 || stmtWarnings.length > 0) && (
        <div style={{ ...section, borderColor: 'rgba(245,158,11,0.45)' }}>
          <div style={{ ...heading, color: '#fbbf24' }}>
            <AlertTriangle size={13} /> Warnings ({opWarnings.length + stmtWarnings.length})
          </div>
          {opWarnings.map((w, i) => (
            <div key={`ow${i}`} style={{ fontSize: 12, padding: '3px 0', color: '#fde68a' }}>
              <strong>{w.kind}:</strong> {w.description}
            </div>
          ))}
          {stmtWarnings.map((w: any, i: number) => (
            <div key={`sw${i}`} style={{ fontSize: 12, padding: '3px 0', color: '#fde68a' }}>
              <strong>{w.kind}:</strong> {w.description || w.issue}
            </div>
          ))}
        </div>
      )}

      {/* 3. EXECUTION DETAILS */}
      {(n.estimateRebinds > 0 || n.estimateRewinds > 0 || n.executionMode || n.actualExecutions > 0) && (
        <div style={section}>
          <div style={heading}>
            <RefreshCw size={13} /> Execution Details
          </div>
          {n.executionMode && (
            <div style={row}><span style={dim}>Execution Mode</span><span>{n.executionMode}</span></div>
          )}
          {n.actualExecutions > 0 && (
            <div style={row}><span style={dim}>Actual Executions</span><span>{n.actualExecutions.toLocaleString()}</span></div>
          )}
          <div style={row}><span style={dim}>Est. Rebinds</span><span>{(n.estimateRebinds || 0).toLocaleString()}</span></div>
          <div style={row}><span style={dim}>Est. Rewinds</span><span>{(n.estimateRewinds || 0).toLocaleString()}</span></div>
          {n.hasActualRows && (
            <>
              <div style={row}><span style={dim}>Actual Rebinds</span><span>{(n.actualRebinds || 0).toLocaleString()}</span></div>
              <div style={row}><span style={dim}>Actual Rewinds</span><span>{(n.actualRewinds || 0).toLocaleString()}</span></div>
            </>
          )}
        </div>
      )}

      {/* 4. QUERY TIME STATS */}
      {qts && (
        <div style={section}>
          <div style={heading}><Clock size={13} /> Query Time Stats</div>
          <div style={row}><span style={dim}>CPU Time</span><span>{qts.cpuTimeMs.toLocaleString()} ms</span></div>
          <div style={row}><span style={dim}>Elapsed Time</span><span>{qts.elapsedTimeMs.toLocaleString()} ms</span></div>
        </div>
      )}

      {/* 5. ENHANCED WAIT STATS WITH LATENCY & BENEFIT */}
      {waitStats.length > 0 && (
        <div style={section}>
          <div style={heading}><Hourglass size={13} /> Wait Stats</div>
          {waitStats.map((w, i) => {
            const count = Number(w.waitCount) || 1;
            const ms = Number(w.waitTimeMs) || 0;
            const avg = w.avgLatencyMs ?? (count > 0 ? (ms / count).toFixed(1) : ms);
            const model = w.timeModel || 'elapsed time based';
            const benefit = w.benefitPercent ?? (totalElapsed > 0 ? Math.min(100, Math.round((ms / totalElapsed) * 1000) / 10) : 0);
            return (
              <div key={i} style={{ ...row, flexDirection: 'column', gap: 2, padding: '4px 0', borderBottom: i < waitStats.length - 1 ? '1px solid rgba(148,163,184,0.08)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{w.waitType}</span>
                  <span style={dim}>{ms.toLocaleString()} ms · {count.toLocaleString()}×</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                  <span>avg {avg} ms/wait · {model}</span>
                  {benefit > 0 && (
                    <span style={{ color: '#34d399', fontWeight: 600 }}>up to {benefit}% of elapsed</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. TRACE FLAGS */}
      {traceFlags.length > 0 && (
        <div style={section}>
          <div style={heading}><Flag size={13} /> Trace Flags ({traceFlags.length})</div>
          {traceFlags.map((t, i) => (
            <div key={i} style={row}>
              <span>TF {t.value}</span>
              <span style={dim}>{t.scope} · {t.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* 7. PARAMETERS */}
      {params.length > 0 && (
        <div style={section}>
          <div style={heading}><Variable size={13} /> Parameters ({params.length})</div>
          {params.map((q, i) => (
            <div key={i} style={{ fontSize: 12, padding: '3px 0', color: '#e2e8f0' }}>
              <strong>{q.column}</strong> <span style={dim}>{q.parameterType}</span>
              <div style={dim}>
                Compiled: {q.compiledValue || '—'}
                {q.hasRuntime && (
                  <span style={{ color: q.mismatch ? '#f87171' : '#94a3b8' }}> · Runtime: {q.runtimeValue}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
