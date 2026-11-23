import React, { useState } from 'react';
import {
  Activity,
  Database,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Gauge,
  Flame,
  Layers,
} from 'lucide-react';
import { BufferPoolConsumer, PLEReport } from '../../types/livedb';

interface PgSharedBuffersViewProps {
  pleReport: PLEReport | null;
  bufferPool: BufferPoolConsumer[];
  isLoading: boolean;
  onRefresh: () => void;
  pollingToggle: React.ReactNode;
}

export const PgSharedBuffersView: React.FC<PgSharedBuffersViewProps> = ({
  pleReport,
  bufferPool,
  isLoading,
  onRefresh,
  pollingToggle,
}) => {
  const [viewMode, setViewMode] = useState<'cache' | 'relations'>('cache');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const hitRatio = pleReport?.bufferCacheHitRatio ?? 0;
  const sharedBuffersMB = pleReport?.maxServerMemoryMb ?? 0;
  const effectiveCacheMB = pleReport?.targetServerMemoryMb ?? 0;
  const workMemMB = pleReport?.totalServerMemoryMb ?? 0;
  const tempFiles = pleReport?.memoryGrantsPendingCount ?? 0;
  const tempSpillMB = pleReport?.pleBurnRateSecondsPerMin ?? 0;
  const buffersClean = pleReport?.lazyWritesPerSec ?? 0;
  const maxwrittenClean = pleReport?.freeListStallsPerSec ?? 0;
  const diskReadsMB = pleReport?.pageReadsMbPerSec ?? 0;
  const status = pleReport?.status || 'HEALTHY';

  const ratioColor =
    status === 'CRITICAL' ? '#f43f5e' : status === 'WARNING' ? '#fbbf24' : '#34d399';

  const handleCopy = (id: string, sql: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(sql);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    }
  };

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
            <h3 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 2px', color: '#f1f5f9' }}>
              PostgreSQL shared_buffers &amp; Cache Telemetry
            </h3>
            <span
              className="radar-badge-darling"
              title="Harvested from pg_stat_database, pg_stat_bgwriter, pg_statio_user_tables, and pg_settings"
            >
              PostgreSQL Memory
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '11.5px', color: '#94a3b8' }}>
            Extracted from <code>pg_stat_database</code>, <code>pg_stat_bgwriter</code>,{' '}
            <code>pg_statio_user_tables</code>, and <code>pg_settings</code>. Monitors cache hit ratio,{' '}
            <code>shared_buffers</code>, <code>work_mem</code> spills, and physical disk reads.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {pollingToggle}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(15, 23, 42, 0.7)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'cache' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('cache')}
              style={{ fontSize: '11px', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Activity size={12} />
              <span>Cache &amp; Disk Reads</span>
              {pleReport && (
                <span
                  className={`radar-pill-${status === 'CRITICAL' ? 'danger' : status === 'WARNING' ? 'warn' : 'success'}`}
                  style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '10px' }}
                >
                  {hitRatio.toFixed(1)}%
                </span>
              )}
            </button>

            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'relations' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setViewMode('relations')}
              style={{ fontSize: '11px', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Database size={12} />
              <span>Relations &amp; Size</span>
              <span style={{ fontSize: '10px', opacity: 0.8 }}>({bufferPool.length})</span>
            </button>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm radar-ctrl-btn"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw size={11} className={isLoading ? 'spin' : ''} />
            <span>Poll Metrics</span>
          </button>
        </div>
      </div>

      {viewMode === 'cache' ? (
        <div
          className="radar-scrollable-block"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', paddingRight: '4px' }}
        >
          {/* 4 Authentic PostgreSQL KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Buffer Cache Hit Ratio
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: `${ratioColor}22`,
                    color: ratioColor,
                  }}
                >
                  {status}
                </span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: ratioColor }}>
                {hitRatio.toFixed(2)}%
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                OLTP target: &ge; 99% (<code>blks_hit / (blks_hit + blks_read)</code>)
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                  shared_buffers
                </span>
                <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 600 }}>pg_settings</span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#38bdf8' }}>
                {sharedBuffersMB >= 1024
                  ? `${(sharedBuffersMB / 1024).toFixed(2)} GB`
                  : `${sharedBuffersMB.toFixed(0)} MB`}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                <code>effective_cache_size</code>:{' '}
                {effectiveCacheMB >= 1024
                  ? `${(effectiveCacheMB / 1024).toFixed(1)} GB`
                  : `${effectiveCacheMB.toFixed(0)} MB`}
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                  work_mem &amp; Temp Spills
                </span>
                <HardDrive size={14} color="#fbbf24" />
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: tempSpillMB > 100 ? '#fbbf24' : '#f1f5f9' }}>
                {workMemMB.toFixed(1)} MB
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                <code>pgsql_tmp</code> spills: {tempSpillMB.toFixed(1)} MB ({tempFiles.toLocaleString()} files)
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                  pg_stat_bgwriter
                </span>
                <Gauge size={14} color="#c084fc" />
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: maxwrittenClean > 0 ? '#fbbf24' : '#34d399' }}>
                {buffersClean.toLocaleString()}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                <code>buffers_clean</code> · <code>maxwritten_clean</code>: {maxwrittenClean.toLocaleString()} · Disk reads: {diskReadsMB.toFixed(1)} MB
              </p>
            </div>
          </div>

          {/* Summary Verdict Banner */}
          {pleReport?.summary && (
            <div
              className="glass-panel"
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                borderLeft: `4px solid ${ratioColor}`,
                fontSize: '12px',
                color: '#cbd5e1',
              }}
            >
              <strong style={{ color: ratioColor, display: 'block', marginBottom: '2px' }}>
                PostgreSQL Buffer Cache Summary
              </strong>
              {pleReport.summary}
            </div>
          )}

          {/* Top Disk-Reading Tables (pg_statio_user_tables) */}
          <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Layers size={16} color="#38bdf8" />
              <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 700, color: '#f1f5f9' }}>
                Top Physical Disk-Reading Tables (<code>pg_statio_user_tables</code>)
              </h4>
            </div>

            {!pleReport?.tableEvictionImpacts?.length ? (
              <div style={{ textAlign: 'center', padding: '18px', color: '#94a3b8', fontSize: '12px' }}>
                <CheckCircle2 size={24} color="#34d399" style={{ margin: '0 auto 6px' }} />
                <div>No user tables with significant physical disk reads recorded yet.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="radar-sticky-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8' }}>Table</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', color: '#94a3b8' }}>Relation Size</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', color: '#94a3b8' }}>Physical Disk Reads</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', color: '#94a3b8' }}>Cache Hit %</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8' }}>Seq Scans</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#94a3b8' }}>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pleReport.tableEvictionImpacts.map((t, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: '#f1f5f9' }}>
                          {t.schemaName}.{t.tableName}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#cbd5e1' }}>
                          {t.currentCachedMb.toFixed(1)} MB
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#fbbf24' }}>
                          {(t.estimatedEvictedMb ?? 0).toFixed(1)} MB
                        </td>
                        <td
                          style={{
                            padding: '8px 10px',
                            textAlign: 'right',
                            fontWeight: 700,
                            color: t.bufferPoolPercent < 95 ? '#f43f5e' : '#34d399',
                          }}
                        >
                          {t.bufferPoolPercent.toFixed(1)}%
                        </td>
                        <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{t.pushedOutByQuery}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background:
                                t.evictionRisk === 'CRITICAL'
                                  ? 'rgba(244,63,94,0.2)'
                                  : t.evictionRisk === 'HIGH'
                                  ? 'rgba(251,191,36,0.2)'
                                  : 'rgba(56,189,248,0.15)',
                              color:
                                t.evictionRisk === 'CRITICAL'
                                  ? '#f43f5e'
                                  : t.evictionRisk === 'HIGH'
                                  ? '#fbbf24'
                                  : '#38bdf8',
                            }}
                          >
                            {t.evictionRisk}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top Physical-Read Queries (pg_stat_statements) */}
          <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Flame size={16} color="#fbbf24" />
              <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 700, color: '#f1f5f9' }}>
                Top Disk-Reading Queries (<code>pg_stat_statements.shared_blks_read</code>)
              </h4>
            </div>

            {!pleReport?.culpritQueries?.length ? (
              <div style={{ textAlign: 'center', padding: '18px', color: '#94a3b8', fontSize: '12px' }}>
                <CheckCircle2 size={24} color="#34d399" style={{ margin: '0 auto 6px' }} />
                <div>
                  No high physical-read queries found in <code>pg_stat_statements</code> (ensure{' '}
                  <code>CREATE EXTENSION pg_stat_statements;</code> is enabled for query-level block attribution).
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {pleReport.culpritQueries.map((q, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(15, 23, 42, 0.5)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#fbbf24' }}>
                        {q.totalPhysicalReadsMb.toFixed(1)} MB disk reads · {q.executionCount.toLocaleString()} calls · avg {q.avgDurationMs.toFixed(1)} ms
                      </span>
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>queryid: {q.queryHash}</span>
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        fontSize: '11px',
                        color: '#cbd5e1',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'Consolas, monospace',
                      }}
                    >
                      {q.queryText}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PostgreSQL Memory Tuning Prescriptions */}
          {pleReport?.doctorInsights && pleReport.doctorInsights.length > 0 && (
            <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <AlertTriangle size={16} color="#38bdf8" />
                <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 700, color: '#f1f5f9' }}>
                  PostgreSQL Memory &amp; Cache Prescriptions
                </h4>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {pleReport.doctorInsights.map((ins, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'rgba(15, 23, 42, 0.45)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      padding: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '12.5px', color: '#f1f5f9' }}>{ins.title}</strong>
                      <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 700 }}>{ins.category}</span>
                    </div>
                    <p style={{ margin: '0 0 6px', fontSize: '11.5px', color: '#94a3b8' }}>{ins.diagnosis}</p>
                    <p style={{ margin: '0 0 8px', fontSize: '11.5px', color: '#34d399' }}>
                      Recommendation: {ins.actionableRemedy}
                    </p>
                    {ins.suggestedTsql && (
                      <div style={{ position: 'relative' }}>
                        <pre
                          style={{
                            margin: 0,
                            padding: '8px 10px',
                            background: 'rgba(0,0,0,0.35)',
                            borderRadius: '6px',
                            fontSize: '11px',
                            color: '#38bdf8',
                            overflowX: 'auto',
                          }}
                        >
                          <code>{ins.suggestedTsql}</code>
                        </pre>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleCopy(`pg-ins-${i}`, ins.suggestedTsql)}
                          style={{ position: 'absolute', top: '6px', right: '6px', fontSize: '10px', padding: '2px 6px' }}
                        >
                          {copiedId === `pg-ins-${i}` ? <Check size={10} /> : <Copy size={10} />}
                          <span>{copiedId === `pg-ins-${i}` ? 'Copied' : 'Copy SQL'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Relations & Footprint View */
        <div className="glass-panel radar-table-scroll-panel">
          <table className="radar-sticky-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'rgba(15, 23, 42, 0.85)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Database</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Relation (Schema.Table)</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Buffer Activity</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>Total Relation Size</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>Share %</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>Est. Live Rows</th>
              </tr>
            </thead>
            <tbody>
              {bufferPool.map((b, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '9px 12px', color: '#94a3b8' }}>{b.databaseName}</td>
                  <td style={{ padding: '9px 12px', fontWeight: 700, color: '#f1f5f9' }}>
                    {b.schemaName}.{b.objectName}
                  </td>
                  <td style={{ padding: '9px 12px', color: '#38bdf8' }}>{b.indexName}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#e2e8f0' }}>
                    {b.bufferSizeMb.toFixed(2)} MB
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#34d399' }}>
                    {b.percentageOfBuffer.toFixed(1)}%
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#94a3b8' }}>
                    {(b.rowCount ?? 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
