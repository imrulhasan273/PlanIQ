import React, { useState } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Lock,
  TrendingUp,
  Terminal,
  Gauge,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { EngineInternalsReport, ServerVitals } from '../../types/livedb';

interface PgVitalsViewProps {
  vitals: ServerVitals | null;
  engineInternals: EngineInternalsReport | null;
  pollingToggle: React.ReactNode;
}

export const PgVitalsView: React.FC<PgVitalsViewProps> = ({
  vitals,
  engineInternals,
  pollingToggle,
}) => {
  const [subTab, setSubTab] = useState<'overview' | 'backends'>('overview');

  return (
    <div className="section-block radar-subtab-section">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          flexWrap: 'wrap',
          gap: '10px',
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#f1f5f9' }}>
              PostgreSQL Server Vitals &amp; Backend Internals
            </h3>
            <span
              className="radar-badge-darling"
              title="Live telemetry from pg_stat_activity, pg_stat_database, pg_locks, and pg_stat_user_tables"
            >
              PostgreSQL Engine
            </span>
          </div>
          <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: '#94a3b8' }}>
            Extracted from <code>pg_stat_activity</code>, <code>pg_stat_database</code>, <code>pg_locks</code>, and{' '}
            <code>pg_stat_user_tables</code>. Tracks connection saturation, lock waits, transaction rate, and dead-tuple bloat.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {pollingToggle}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              background: 'rgba(15, 23, 42, 0.6)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <button
              type="button"
              className={`btn btn-sm ${subTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSubTab('overview')}
              style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Activity size={13} />
              <span>Overview</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${subTab === 'backends' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSubTab('backends')}
              style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Terminal size={13} color="#38bdf8" />
              <span>Active Backend PIDs</span>
              {engineInternals && (engineInternals.activeTasks?.length || 0) > 0 && (
                <span className="radar-pill-info" style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '10px' }}>
                  {engineInternals.activeTasks?.length || 0} active
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {subTab === 'overview' ? (
        <div
          className="radar-scrollable-block"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          {/* 4 Authentic PostgreSQL Vitals Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#94a3b8', fontSize: '12px' }}>
                <Cpu size={16} color="#38bdf8" />
                <span>Active Queries (pg_stat_activity)</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: (vitals?.cpuQueueTasks || 0) > 5 ? '#fbbf24' : '#34d399' }}>
                {vitals?.cpuQueueTasks ?? 0}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                Currently executing backends · CPU-active ratio: {(vitals?.signalWaitPct ?? 0).toFixed(1)}%
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#94a3b8', fontSize: '12px' }}>
                <Lock size={16} color="#818cf8" />
                <span>Waiting Lock Requests (pg_locks)</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: (vitals?.memoryGrantsPending || 0) > 0 ? '#f43f5e' : '#34d399' }}>
                {vitals?.memoryGrantsPending ?? 0}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                Un-granted lock waiters (<code>pg_locks WHERE NOT granted</code>)
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#94a3b8', fontSize: '12px' }}>
                <HardDrive size={16} color="#fbbf24" />
                <span>pgsql_tmp Spill Volume</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9' }}>
                {(vitals?.tempDbInternalMb ?? 0).toFixed(1)} MB
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                <code>shared_buffers</code>: {(vitals?.availableMemoryMb ?? 0).toFixed(0)} MB · Temp sort/hash spill bytes
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#94a3b8', fontSize: '12px' }}>
                <TrendingUp size={16} color="#34d399" />
                <span>Transactions / Sec (TPS)</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#34d399' }}>
                {(vitals?.batchRequestsPerSec ?? 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                Instantaneous <code>xact_commit + xact_rollback</code> throughput from <code>pg_stat_database</code>
              </p>
            </div>
          </div>

          {/* PostgreSQL Backend Pool & Autovacuum Summary */}
          {engineInternals && (
            <div className="glass-panel" style={{ padding: '18px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Gauge size={18} color="#38bdf8" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>
                    PostgreSQL Backend Pool &amp; Autovacuum Telemetry
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSubTab('backends')}
                  style={{ fontSize: '11px', padding: '3px 8px', color: '#38bdf8' }}
                >
                  Inspect Active PIDs ({engineInternals.activeTasks?.length || 0}) &rarr;
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <div className="telemetry-stat-card" style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
                  <div className="telemetry-stat-lbl" style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Connection Pool (max_connections)
                  </div>
                  <div
                    className="telemetry-stat-val"
                    style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      color: engineInternals.threadPoolStarvation ? '#f43f5e' : '#34d399',
                      margin: '4px 0',
                    }}
                  >
                    {engineInternals.totalActiveWorkers} / {engineInternals.maxWorkersCount} (
                    {engineInternals.threadPoolUtilization.toFixed(1)}%)
                  </div>
                  <div className="telemetry-stat-sub" style={{ fontSize: '10.5px', color: '#64748b' }}>
                    {engineInternals.quantumPressureStatus}
                  </div>
                </div>

                <div className="telemetry-stat-card" style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
                  <div className="telemetry-stat-lbl" style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Active Executing Backends
                  </div>
                  <div className="telemetry-stat-val" style={{ fontSize: '16px', fontWeight: 700, color: '#38bdf8', margin: '4px 0' }}>
                    {engineInternals.totalRunnableTasks} Active PIDs
                  </div>
                  <div className="telemetry-stat-sub" style={{ fontSize: '10.5px', color: '#64748b' }}>
                    Excluding idle connections &amp; PlanIQ monitor
                  </div>
                </div>

                <div className="telemetry-stat-card" style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
                  <div className="telemetry-stat-lbl" style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Dead Tuples / Autovacuum Health
                  </div>
                  <div
                    className="telemetry-stat-val"
                    style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      color: engineInternals.numaSkewDetected ? '#fbbf24' : '#34d399',
                      margin: '4px 0',
                    }}
                  >
                    {engineInternals.totalForeignPages.toLocaleString()} Dead Tuples
                  </div>
                  <div className="telemetry-stat-sub" style={{ fontSize: '10.5px', color: '#64748b' }}>
                    {engineInternals.numaSkewSummary}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Active Backend PIDs Table */
        <div className="glass-panel radar-table-scroll-panel">
          {!engineInternals?.activeTasks?.length ? (
            <div style={{ padding: '36px', textAlign: 'center' }}>
              <CheckCircle2 size={32} color="#34d399" style={{ margin: '0 auto 10px' }} />
              <h4 style={{ margin: '0 0 6px', color: '#f1f5f9' }}>No Active PostgreSQL Queries Running</h4>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                All non-monitoring backends in <code>pg_stat_activity</code> are currently idle.
              </p>
            </div>
          ) : (
            <table className="radar-sticky-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.85)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>PID</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>State</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Wait Event</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Database</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>Elapsed</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>SQL Query</th>
                </tr>
              </thead>
              <tbody>
                {engineInternals.activeTasks.map((t, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: '#38bdf8' }}>#{t.sessionId}</td>
                    <td style={{ padding: '9px 12px', color: '#e2e8f0' }}>{t.taskState}</td>
                    <td style={{ padding: '9px 12px', color: t.waitType === 'CPU' ? '#34d399' : '#fbbf24' }}>
                      {t.waitType}
                    </td>
                    <td style={{ padding: '9px 12px', color: '#94a3b8' }}>{t.databaseName}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: '#e2e8f0' }}>
                      {(t.totalElapsedTime / 1000).toFixed(2)}s
                    </td>
                    <td
                      style={{
                        padding: '9px 12px',
                        color: '#cbd5e1',
                        fontFamily: 'Consolas, monospace',
                        maxWidth: '420px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={t.queryText}
                    >
                      {t.queryText || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {engineInternals?.numaSkewDetected && (
        <div
          style={{
            marginTop: '10px',
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(251, 191, 36, 0.12)',
            border: '1px solid rgba(251, 191, 36, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#fde68a',
          }}
        >
          <AlertTriangle size={15} color="#fbbf24" />
          <span>{engineInternals.numaSkewSummary}</span>
        </div>
      )}
    </div>
  );
};
