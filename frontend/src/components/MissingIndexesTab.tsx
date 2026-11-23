import React, { useState } from 'react';
import { KeyRound, Copy, Check, Search, Database, Layers, Zap, ShieldCheck } from 'lucide-react';
import { PlanAnalysis, MissingIndexInfo, ConsolidatedIndex } from '../types/plan';
import { DiagnosticTooltip } from './DiagnosticTooltip';

interface MissingIndexesTabProps {
  plan: PlanAnalysis;
}

export const MissingIndexesTab: React.FC<MissingIndexesTabProps> = ({ plan }) => {
  const [viewMode, setViewMode] = useState<'consolidated' | 'raw'>('consolidated');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);

  const rawIndexes: MissingIndexInfo[] = plan?.allMissingIndexes || [];
  const consolidatedList: ConsolidatedIndex[] = plan?.diagnostics?.consolidatedIndexes || [];

  const filteredRawIndexes = rawIndexes.filter((idx) => {
    if (!idx) return false;
    const eq = (idx.equalityColumns || []).join(' ');
    const ineq = (idx.inequalityColumns || []).join(' ');
    const inc = (idx.includeColumns || []).join(' ');
    const text = `${idx.table || ''} ${idx.schema || ''} ${eq} ${ineq} ${inc}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  const filteredConsolidated = consolidatedList.filter((idx) => {
    if (!idx) return false;
    const eq = (idx.equalityColumns || []).join(' ');
    const ineq = (idx.inequalityColumns || []).join(' ');
    const inc = (idx.includeColumns || []).join(' ');
    const text = `${idx.table || ''} ${idx.schema || ''} ${eq} ${ineq} ${inc}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  const handleCopySingle = (ddl: string, index: number) => {
    navigator.clipboard.writeText(ddl || '');
    setCopiedIdx(index);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleCopyAllRaw = () => {
    const allDDL = filteredRawIndexes
      .map((idx, i) => `-- Index #${i + 1} for ${idx.schema || 'dbo'}.${idx.table || ''} (Impact: ${(idx.impact || 0).toFixed(1)}%)\n${idx.suggestedDdl || ''}`)
      .join('\n\n');
    navigator.clipboard.writeText(allDDL);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleCopyAllConsolidated = () => {
    const allDDL = filteredConsolidated
      .map((idx, i) => `-- Consolidated Index #${i + 1} on ${idx.schema || 'dbo'}.${idx.table || ''} (Replaces ${idx.combinedFromCount || 1} recommendations)\n${idx.suggestedDdl || ''}`)
      .join('\n\n');
    navigator.clipboard.writeText(allDDL);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div className="tab-scroll-container">
      {/* Top Consolidator Banner */}
      {consolidatedList.length > 0 && (
        <div className="consolidator-banner glass-panel">
          <div className="consolidator-left">
            <div className="consolidator-tag">
              <Zap size={15} color="#34d399" />
              <span>Smart Index Consolidator</span>
              <DiagnosticTooltip guideKey="consolidatedIndexesTab" />
            </div>
            <h3 className="consolidator-title">
              Consolidated {rawIndexes.length} Raw Suggestions ➔ {consolidatedList.length} Composite Covering Indexes
            </h3>
            <p className="consolidator-desc">
              SQL Server generates isolated missing index recommendations per query without cross-table deduplication. PlanIQ merges overlapping EQUALITY and INCLUDE columns to prevent excessive index write penalties.
            </p>
          </div>

          <div className="consolidator-view-switcher">
            <button
              className={`switcher-btn ${viewMode === 'consolidated' ? 'active' : ''}`}
              onClick={() => setViewMode('consolidated')}
            >
              <ShieldCheck size={14} />
              <span>Smart Consolidated ({consolidatedList.length})</span>
            </button>
            <button
              className={`switcher-btn ${viewMode === 'raw' ? 'active' : ''}`}
              onClick={() => setViewMode('raw')}
            >
              <Layers size={14} />
              <span>Raw SQL Server Hints ({rawIndexes.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Search & Actions Bar */}
      <div className="indexes-action-bar glass-panel">
        <div className="search-box">
          <Search size={15} color="#94a3b8" />
          <input
            type="text"
            className="search-input"
            placeholder={viewMode === 'consolidated' ? 'Filter consolidated indexes by table or column...' : 'Filter raw index recommendations...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="indexes-meta-actions">
          <DiagnosticTooltip guideKey={viewMode === 'consolidated' ? 'consolidatedIndexesTab' : 'rawMissingIndexes'} />
          <span className="badge badge-success">
            {viewMode === 'consolidated' ? `${filteredConsolidated.length} Consolidated Indexes` : `${filteredRawIndexes.length} Raw Hints`}
          </span>
          <button
            className="btn btn-secondary"
            onClick={viewMode === 'consolidated' ? handleCopyAllConsolidated : handleCopyAllRaw}
          >
            {copiedAll ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
            <span>{copiedAll ? 'All Copied!' : viewMode === 'consolidated' ? 'Copy All Consolidated DDL' : 'Copy All Raw DDL'}</span>
          </button>
        </div>
      </div>

      {/* CONSOLIDATED INDEX VIEW */}
      {viewMode === 'consolidated' ? (
        filteredConsolidated.length > 0 ? (
          <div className="indexes-grid">
            {filteredConsolidated.map((idx, i) => {
              const isCopied = copiedIdx === i;
              const eqCols = idx.equalityColumns || [];
              const ineqCols = idx.inequalityColumns || [];
              const incCols = idx.includeColumns || [];
              return (
                <div key={i} className="index-card glass-panel consolidated-border">
                  <div className="index-card-header">
                    <div className="index-table-row">
                      <Database size={16} color="#38bdf8" />
                      <span className="index-table-title">
                        {idx.schema ? `${idx.schema}.${idx.table || ''}` : (idx.table || '')}
                      </span>
                      {(idx.combinedFromCount || 1) > 1 && (
                        <span className="badge badge-success" style={{ fontSize: '11px' }}>
                          ⚡ Replaces {idx.combinedFromCount} Raw Queries
                        </span>
                      )}
                    </div>
                    <div className="index-impact-badge">
                      <span className="impact-label">Avg Impact:</span>
                      <span className="impact-value">{(idx.averageImpact || 0) > 0 ? `${(idx.averageImpact || 0).toFixed(1)}%` : 'High'}</span>
                    </div>
                  </div>

                  {idx.storageBenefit && (
                    <div className="consolidated-benefit-line">
                      <ShieldCheck size={13} color="#34d399" />
                      <span>{idx.storageBenefit}</span>
                    </div>
                  )}

                  <div className="index-columns-breakdown">
                    {eqCols.length > 0 && (
                      <div className="column-group-row">
                        <span className="col-type-label">Equality:</span>
                        <div className="cols-list">
                          {eqCols.map((c, ci) => (
                            <span key={ci} className="col-tag equality-col">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {ineqCols.length > 0 && (
                      <div className="column-group-row">
                        <span className="col-type-label">Inequality:</span>
                        <div className="cols-list">
                          {ineqCols.map((c, ci) => (
                            <span key={ci} className="col-tag inequality-col">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {incCols.length > 0 && (
                      <div className="column-group-row">
                        <span className="col-type-label">Include:</span>
                        <div className="cols-list">
                          {incCols.map((c, ci) => (
                            <span key={ci} className="col-tag include-col">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Formatted DDL Code Block */}
                  <div className="ddl-block-wrapper">
                    <pre className="sql-code-block">{idx.suggestedDdl || ''}</pre>
                    <button
                      className="btn-copy-code"
                      onClick={() => handleCopySingle(idx.suggestedDdl || '', i)}
                      title="Copy Index DDL"
                    >
                      {isCopied ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                      <span>{isCopied ? 'Copied' : 'Copy DDL'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-tree-state">
            <KeyRound size={40} color="#64748b" />
            <h3>No Consolidated Indexes Found</h3>
            <p className="text-muted">No recommendations matching your search filter.</p>
          </div>
        )
      ) : (
        /* RAW ENGINE INDEX VIEW */
        filteredRawIndexes.length > 0 ? (
          <div className="indexes-grid">
            {filteredRawIndexes.map((idx, i) => {
              const isCopied = copiedIdx === i;
              const isTempTable = (idx.table || '').startsWith('[#') || (idx.table || '').startsWith('#');
              const eqCols = idx.equalityColumns || [];
              const ineqCols = idx.inequalityColumns || [];
              const incCols = idx.includeColumns || [];
              return (
                <div key={i} className="index-card glass-panel">
                  <div className="index-card-header">
                    <div className="index-table-row">
                      <Database size={16} color="#38bdf8" />
                      <span className="index-table-title">
                        {idx.schema ? `${idx.schema}.${idx.table || ''}` : (idx.table || '')}
                      </span>
                      {isTempTable && (
                        <span className="badge badge-high" style={{ fontSize: '10px' }}>
                          Temp Table (#)
                        </span>
                      )}
                    </div>
                    <div className="index-impact-badge">
                      <span className="impact-label">Impact:</span>
                      <span className="impact-value">{(idx.impact || 0) > 0 ? `${(idx.impact || 0).toFixed(1)}%` : 'High'}</span>
                    </div>
                  </div>

                  <div className="index-columns-breakdown">
                    {eqCols.length > 0 && (
                      <div className="column-group-row">
                        <span className="col-type-label">Equality:</span>
                        <div className="cols-list">
                          {eqCols.map((c, ci) => (
                            <span key={ci} className="col-tag equality-col">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {ineqCols.length > 0 && (
                      <div className="column-group-row">
                        <span className="col-type-label">Inequality:</span>
                        <div className="cols-list">
                          {ineqCols.map((c, ci) => (
                            <span key={ci} className="col-tag inequality-col">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {incCols.length > 0 && (
                      <div className="column-group-row">
                        <span className="col-type-label">Include:</span>
                        <div className="cols-list">
                          {incCols.map((c, ci) => (
                            <span key={ci} className="col-tag include-col">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="ddl-block-wrapper">
                    <pre className="sql-code-block">{idx.suggestedDdl || ''}</pre>
                    <button
                      className="btn-copy-code"
                      onClick={() => handleCopySingle(idx.suggestedDdl || '', i)}
                      title="Copy Index DDL"
                    >
                      {isCopied ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                      <span>{isCopied ? 'Copied' : 'Copy DDL'}</span>
                    </button>
                  </div>

                  <div className="index-footer-meta">
                    <span className="text-dim">From Stmt #{idx.statementId || '1'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-tree-state">
            <KeyRound size={40} color="#64748b" />
            <h3>No Missing Indexes Found</h3>
            <p className="text-muted">No recommendations matching your search filter.</p>
          </div>
        )
      )}
    </div>
  );
};
