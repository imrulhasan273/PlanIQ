import React, { useState } from 'react';
import {
  KeyRound,
  Copy,
  Check,
  Search,
  Database,
  Layers,
  Zap,
  ShieldCheck,
  Info,
  ExternalLink,
  Flame,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { PlanAnalysis, MissingIndexInfo } from '../../types/plan';

interface PgIndexAdvisorTabProps {
  plan: PlanAnalysis;
}

export const PgIndexAdvisorTab: React.FC<PgIndexAdvisorTabProps> = ({ plan }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);

  const rawIndexes: MissingIndexInfo[] = plan?.allMissingIndexes || [];

  const filteredIndexes = rawIndexes.filter((idx) => {
    if (!idx) return false;
    const text = `${idx.table || ''} ${idx.schema || ''} ${(idx.equalityColumns || []).join(' ')} ${(idx.inequalityColumns || []).join(' ')} ${(idx.includeColumns || []).join(' ')}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  const handleCopySingle = (ddl: string, index: number) => {
    navigator.clipboard.writeText(ddl || '');
    setCopiedIdx(index);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleCopyAll = () => {
    const allDDL = filteredIndexes
      .map((idx, i) => `-- PostgreSQL Index #${i + 1} for ${idx.schema || 'public'}.${idx.table || ''} (Impact: ${(idx.impact || 0).toFixed(1)}%)\n${idx.suggestedDdl || ''}`)
      .join('\n\n');
    navigator.clipboard.writeText(allDDL);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div className="tab-scroll-container">
      {/* Top PostgreSQL Index Consolidator Banner */}
      <div className="consolidator-banner glass-panel" style={{ borderLeft: '4px solid #38bdf8' }}>
        <div className="consolidator-left">
          <div className="consolidator-tag">
            <KeyRound size={15} color="#38bdf8" />
            <span>PostgreSQL Smart Index Advisor</span>
          </div>
          <h3 className="consolidator-title">
            {rawIndexes.length > 0
              ? `${rawIndexes.length} Recommended Indexes with CONCURRENTLY Safety`
              : 'Zero Missing Indexes Detected — Scan Access is Optimal'}
          </h3>
          <p className="consolidator-desc">
            PostgreSQL creates indexes safely in production using <code>CREATE INDEX CONCURRENTLY</code> to avoid holding an <code>AccessExclusiveLock</code> that would block incoming application SELECT, INSERT, UPDATE, and DELETE transactions.
          </p>
        </div>

        {rawIndexes.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleCopyAll}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {copiedAll ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
              <span>{copiedAll ? 'Copied All DDL' : 'Copy All Scripts'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Index List Section */}
      <div className="section-block" style={{ marginTop: '20px' }}>
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={16} color="#38bdf8" />
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                Recommended PostgreSQL Index DDL Statements
              </h4>
            </div>

            <div className="search-input-wrap" style={{ position: 'relative', minWidth: '220px' }}>
              <Search size={13} style={{ position: 'absolute', left: '8px', top: '8px', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Filter by table or column..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '4px 8px 4px 28px',
                  fontSize: '11px',
                  color: '#f8fafc',
                  outline: 'none',
                  width: '100%',
                }}
              />
            </div>
          </div>

          {filteredIndexes.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredIndexes.map((idx, i) => (
                <div
                  key={i}
                  className="glass-panel"
                  style={{
                    padding: '14px',
                    borderLeft: `4px solid ${idx.impact > 80 ? '#38bdf8' : '#34d399'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                        {idx.schema || 'public'}.{idx.table}
                      </span>
                      <span className="badge badge-info" style={{ fontSize: '10px' }}>
                        PostgreSQL B-Tree
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        className={`badge ${idx.impact > 80 ? 'badge-critical' : 'badge-high'}`}
                        style={{ fontSize: '10.5px' }}
                      >
                        Impact: {idx.impact.toFixed(1)}%
                      </span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleCopySingle(idx.suggestedDdl || '', i)}
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                      >
                        {copiedIdx === i ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                        <span>{copiedIdx === i ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Code snippet block */}
                  <div style={{ background: 'rgba(15, 23, 42, 0.7)', borderRadius: '6px', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <code style={{ fontSize: '12px', color: '#38bdf8', fontFamily: 'monospace', display: 'block', wordBreak: 'break-all' }}>
                      {idx.suggestedDdl}
                    </code>
                  </div>

                  {/* Target Column metadata */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px', fontSize: '11px', color: '#94a3b8' }}>
                    {idx.equalityColumns && idx.equalityColumns.length > 0 && (
                      <div>
                        <strong style={{ color: '#34d399' }}>Key Columns:</strong> {idx.equalityColumns.join(', ')}
                      </div>
                    )}
                    {idx.includeColumns && idx.includeColumns.length > 0 && (
                      <div>
                        <strong style={{ color: '#c084fc' }}>INCLUDE (Covering):</strong> {idx.includeColumns.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="diag-clean-state" style={{ padding: '24px' }}>
              <CheckCircle2 size={32} color="#34d399" />
              <h4 style={{ margin: '8px 0 4px 0', color: '#f8fafc' }}>
                {searchTerm ? 'No indexes match search query' : 'No Missing Indexes Detected'}
              </h4>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                Every accessed table in this plan is served through existing indexes or selective scans.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* PostgreSQL Indexing Architectural Guide */}
      <div className="section-block" style={{ marginTop: '24px' }}>
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <ShieldCheck size={16} color="#38bdf8" />
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
              PostgreSQL Indexing Best Practices & Architecture
            </h4>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', fontSize: '12px' }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '6px', padding: '12px' }}>
              <div style={{ fontWeight: 600, color: '#38bdf8', marginBottom: '4px' }}>
                1. CONCURRENTLY Safety
              </div>
              <p style={{ margin: 0, color: '#cbd5e1', fontSize: '11px' }}>
                Standard <code>CREATE INDEX</code> takes an <code>AccessExclusiveLock</code>, locking out all concurrent reads and writes until completion. Always build indexes in production with <code>CONCURRENTLY</code>.
              </p>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '6px', padding: '12px' }}>
              <div style={{ fontWeight: 600, color: '#34d399', marginBottom: '4px' }}>
                2. Partial Indexes (WHERE Clause)
              </div>
              <p style={{ margin: 0, color: '#cbd5e1', fontSize: '11px' }}>
                If you query only active records (e.g. <code>WHERE status = 'ACTIVE'</code>), create a partial index. Partial indexes are 90%+ smaller, stay entirely in <code>shared_buffers</code>, and cost near-zero on inserts.
              </p>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '6px', padding: '12px' }}>
              <div style={{ fontWeight: 600, color: '#c084fc', marginBottom: '4px' }}>
                3. Covering Indexes (INCLUDE)
              </div>
              <p style={{ margin: 0, color: '#cbd5e1', fontSize: '11px' }}>
                PostgreSQL 11+ supports <code>INCLUDE (col)</code> on B-Tree indexes. Non-key columns are stored in leaf pages, enabling pure <strong>Index-Only Scans</strong> without touching table heap pages.
              </p>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '6px', padding: '12px' }}>
              <div style={{ fontWeight: 600, color: '#fbbf24', marginBottom: '4px' }}>
                4. BRIN for Time-Series & Logs
              </div>
              <p style={{ margin: 0, color: '#cbd5e1', fontSize: '11px' }}>
                For append-only tables ordered by date or sequential ID, Block Range Indexes (BRIN) take less than 1% the space of B-Trees and allow lightning-fast range scans.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
