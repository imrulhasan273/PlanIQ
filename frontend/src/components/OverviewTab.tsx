import React from 'react';
import {
  AlertTriangle,
  TrendingUp,
  Layers,
  KeyRound,
  Cpu,
  ArrowRight,
  Sparkles,
  Zap,
  Clock,
  HardDrive,
  Network,
  Activity,
  CheckCircle2,
  ShieldAlert,
  Database,
  FunctionSquare,
  SplitSquareVertical,
  AlertCircle,
  FileCode2,
  Copy,
  Check,
  Search,
  Disc,
  BarChart3,
  Sliders,
  Code2,
  Target,
  GitFork,
  Filter
} from 'lucide-react';
import { PlanAnalysis, StatementAnalysis, SniffedParameter, IQPFeature } from '../types/plan';
import { DiagnosticTooltip } from './DiagnosticTooltip';
import { QueryPreviewCell } from './QueryPreviewModal';
import { ParameterSniffingModal } from './ParameterSniffingModal';
import { AdaptiveJoinsModal } from './AdaptiveJoinsModal';

interface OverviewTabProps {
  plan: PlanAnalysis;
  onSelectStatement: (stmt: StatementAnalysis, targetTab: 'visualizer' | 'advisor') => void;
  onNavigateTab?: (tab: 'overview' | 'visualizer' | 'advisor' | 'indexes' | 'comparator') => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  plan,
  onSelectStatement,
  onNavigateTab,
}) => {
  const verdict = plan.executiveVerdict;
  const diag = plan.diagnostics;
  const culpritStmt = plan.statements.find(
    (s) => s.statementId === verdict?.culpritStatementId
  );

  const [diagCategory, setDiagCategory] = React.useState<'all' | 'engine' | 'indexes' | 'predicates'>('all');
  const [onlyIssues, setOnlyIssues] = React.useState<boolean>(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [isParamSniffingOpen, setIsParamSniffingOpen] = React.useState<boolean>(false);
  const [isAdaptiveOpen, setIsAdaptiveOpen] = React.useState<boolean>(false);

  const handleCopy = (text: string, id: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Compute issue status for each of the 13 diagnostic detectors
  const hasIssues = {
    memoryGrant: !!(diag?.memoryGrant?.hasSpills || diag?.memoryGrant?.isBloated),
    cardinalityEngine: !!diag?.cardinalityEngine?.isLegacy,
    parallelismSkew: !!(diag?.parallelismSkew?.hasSkew || plan.maxDopReason === 'MaxDOPSetToOne'),
    rowGoals: (diag?.rowGoals || []).some((r) => r.misfired || r.reductionFactor >= 10),
    adaptive: (diag?.adaptive?.adaptiveJoins || []).length > 0,
    keyLookups: (diag?.keyLookups?.length || 0) > 0,
    spools: (diag?.spools?.length || 0) > 0,
    missingStatistics: (diag?.missingStatistics?.length || 0) > 0,
    consolidatedIndexes: (diag?.consolidatedIndexes?.length || 0) > 0,
    nonSargable: (diag?.nonSargable?.length || 0) > 0,
    parameterSniffing: (diag?.parameterSniffing || []).some((p) => p.hasMismatch || p.hasEstimateImpact),
    implicitConversions: (diag?.implicitConversions?.length || 0) > 0,
    scalarUdfWarnings: (diag?.scalarUdfWarnings?.length || 0) > 0,
  };

  const totalIssuesCount = Object.values(hasIssues).filter(Boolean).length;

  const shouldRenderCard = (category: 'engine' | 'indexes' | 'predicates', hasCardIssue: boolean) => {
    if (diagCategory !== 'all' && diagCategory !== category) return false;
    if (onlyIssues && !hasCardIssue) return false;
    return true;
  };

  return (
    <div className="tab-scroll-container">
      {/* 10-Second Executive Root Cause Verdict Banner */}
      {verdict && (
        <div className="verdict-hero-card glass-panel">
          <div className="verdict-top-row">
            <div className="verdict-title-tag">
              <Zap size={16} color="#38bdf8" />
              <span>10-Second Executive Root Cause Verdict</span>
              <DiagnosticTooltip guideKey="executiveVerdict" />
            </div>
            <span className="badge badge-critical" style={{ fontSize: '11px' }}>
              Culprit: Stmt #{verdict.culpritStatementId} ({verdict.costPercentage}% Cost)
            </span>
          </div>

          <h2 className="verdict-headline">{verdict.headline}</h2>
          <p className="verdict-summary">{verdict.summary}</p>

          <div className="verdict-fix-box">
            <div className="verdict-fix-label">
              <CheckCircle2 size={15} color="#34d399" />
              <strong>Recommended Action:</strong>
            </div>
            <div className="verdict-fix-text">{verdict.actionableFix}</div>
          </div>

          {culpritStmt && (
            <div className="verdict-action-buttons">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onSelectStatement(culpritStmt, 'visualizer')}
              >
                <span>Inspect Stmt #{culpritStmt.statementId} Tree</span>
                <ArrowRight size={13} />
              </button>
              <button
                className="btn btn-ai btn-sm"
                onClick={() => onSelectStatement(culpritStmt, 'advisor')}
              >
                <Sparkles size={13} />
                <span>Ask AI to Rewrite Stmt #{culpritStmt.statementId}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Plan Health Score & Deep XML Diagnostics Dashboard */}
      {diag && (
        <div className="section-block">
          <div className="diagnostics-hero-header glass-panel">
            <div className="diagnostics-header-left">
              <div className="diagnostics-badge-row">
                <ShieldAlert size={18} color="#38bdf8" />
                <span className="diagnostics-section-badge">Deep ShowPlan XML Diagnostics</span>
              </div>
              <h3 className="diagnostics-headline">Root Cause Engine Health Analysis</h3>
              <p className="diagnostics-subtext">
                Evaluates Key Lookups, Spool Operators, Missing Statistics, Parameter Sniffing, Non-Sargable Predicates, Row Goals, Adaptive Joins/IQP, RAM Grants, Spills, and Parallelism.
              </p>
            </div>

            {/* Health Score Pill */}
            <div className={`health-score-container grade-${diag.scoreGrade.toLowerCase()}`}>
              <div className="health-score-gauge">
                <span className="health-score-val">{diag.healthScore}</span>
                <span className="health-score-max">/100</span>
              </div>
              <div className="health-grade-box">
                <span className="health-grade-label">Grade</span>
                <span className="health-grade-letter">{diag.scoreGrade}</span>
              </div>
            </div>
          </div>

          {/* Interactive Diagnostic Category Filter Bar */}
          <div className="diag-filter-bar">
            <div className="diag-filter-group">
              <button
                className={`diag-filter-pill ${diagCategory === 'all' ? 'active' : ''}`}
                onClick={() => setDiagCategory('all')}
              >
                <span>All Detectors</span>
                <span className="badge badge-info" style={{ fontSize: '10px', padding: '1px 5px' }}>13</span>
              </button>
              <button
                className={`diag-filter-pill ${diagCategory === 'engine' ? 'active' : ''}`}
                onClick={() => setDiagCategory('engine')}
              >
                <Cpu size={12} />
                <span>Engine & Memory</span>
                <span className="badge badge-info" style={{ fontSize: '10px', padding: '1px 5px' }}>5</span>
              </button>
              <button
                className={`diag-filter-pill ${diagCategory === 'indexes' ? 'active' : ''}`}
                onClick={() => setDiagCategory('indexes')}
              >
                <KeyRound size={12} />
                <span>Indexes & Operators</span>
                <span className="badge badge-info" style={{ fontSize: '10px', padding: '1px 5px' }}>4</span>
              </button>
              <button
                className={`diag-filter-pill ${diagCategory === 'predicates' ? 'active' : ''}`}
                onClick={() => setDiagCategory('predicates')}
              >
                <Sliders size={12} />
                <span>Query & Predicates</span>
                <span className="badge badge-info" style={{ fontSize: '10px', padding: '1px 5px' }}>4</span>
              </button>
            </div>

            <button
              className={`diag-filter-toggle ${onlyIssues ? 'active' : ''}`}
              onClick={() => setOnlyIssues(!onlyIssues)}
              title="Filter to only cards with detected bottlenecks or warnings"
            >
              <AlertTriangle size={12} />
              <span>Only Show Issues ({totalIssuesCount})</span>
            </button>
          </div>

          {/* 13 Advanced Root Cause Diagnostic Cards */}
          <div className="diagnostics-cards-grid">
            {/* 1. Key Lookup / Bookmark Lookup Detector */}
            {shouldRenderCard('indexes', hasIssues.keyLookups) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <Search size={16} color="#f43f5e" />
                    <span className="diag-title">Key & Bookmark Lookups</span>
                    <DiagnosticTooltip guideKey="keyLookups" />
                  </div>
                  {diag.keyLookups && diag.keyLookups.length > 0 ? (
                    <span className={`badge badge-${diag.keyLookups.some(k => k.severity === 'CRITICAL') ? 'critical' : diag.keyLookups.some(k => k.severity === 'HIGH') ? 'high' : 'medium'}`}>
                      {diag.keyLookups.length} {diag.keyLookups.length === 1 ? 'Lookup' : 'Lookups'} Detected
                    </span>
                  ) : (
                    <span className="badge badge-success">Clean (0 Lookups)</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {diag.keyLookups && diag.keyLookups.length > 0 ? (
                    <>
                      <div className="diag-metric-row">
                        <span className="diag-metric-label">Total Bookmark Lookups:</span>
                        <strong className="diag-metric-val">
                          {diag.keyLookups.reduce((acc, k) => acc + k.lookupCount, 0).toLocaleString()} Executions
                        </strong>
                      </div>
                      <div className="diag-items-list">
                        {diag.keyLookups.slice(0, 3).map((kl, i) => (
                          <div key={i} className="diag-sub-item danger-border" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                              <span className="diag-sub-tag">Stmt #{kl.statementId} ({kl.lookupKind})</span>
                              <span className="text-dim" style={{ fontSize: '10px' }}>~{kl.lookupCount.toLocaleString()} lookups</span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 600 }}>
                              {kl.schema ? `[${kl.schema}].` : ''}[{kl.table}]
                            </div>
                            {kl.seekIndex && (
                              <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                Driving Index: <code style={{ color: '#38bdf8' }}>{kl.seekIndex}</code>
                              </div>
                            )}
                            {kl.fetchedColumns.length > 0 && (
                              <div className="diag-chips-wrap" style={{ marginTop: '2px' }}>
                                {kl.fetchedColumns.slice(0, 5).map((col: string, cIdx: number) => (
                                  <span key={cIdx} className="diag-chip">[{col}]</span>
                                ))}
                                {kl.fetchedColumns.length > 5 && (
                                  <span className="diag-chip">+{kl.fetchedColumns.length - 5} more</span>
                                )}
                              </div>
                            )}
                            {kl.includeClause && (
                              <div style={{ marginTop: '4px', width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                  className={`diag-copy-btn ${copiedId === `kl-${i}` ? 'copied' : ''}`}
                                  onClick={() => handleCopy(kl.includeClause, `kl-${i}`)}
                                  title="Copy suggested INCLUDE clause"
                                >
                                  {copiedId === `kl-${i}` ? <Check size={11} /> : <Copy size={11} />}
                                  <span>{copiedId === `kl-${i}` ? 'Copied INCLUDE' : 'Copy INCLUDE'}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="diag-remedy">
                        <strong>Fix:</strong> Add fetched columns to the driving nonclustered index using <code>INCLUDE (...)</code> to convert bookmark lookups into efficient covering index seeks.
                      </p>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <div className="diag-clean-icon">
                        <CheckCircle2 size={20} color="#34d399" />
                      </div>
                      <span className="diag-clean-title">100% Covering Index Seeks</span>
                      <p className="diag-clean-desc">No Key or RID bookmark lookups detected. All required columns exist in driving indexes.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. Table Spool & Eager/Lazy Spool Detector */}
            {shouldRenderCard('indexes', hasIssues.spools) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <Disc size={16} color="#f97316" />
                    <span className="diag-title">TempDB Spool Operators</span>
                    <DiagnosticTooltip guideKey="spools" />
                  </div>
                  {diag.spools && diag.spools.length > 0 ? (
                    <span className={`badge badge-${diag.spools.some(s => s.severity === 'CRITICAL' || s.physicalOp === 'Index Spool') ? 'critical' : 'high'}`}>
                      {diag.spools.length} {diag.spools.length === 1 ? 'Spool' : 'Spools'} Active
                    </span>
                  ) : (
                    <span className="badge badge-success">No Spools</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {diag.spools && diag.spools.length > 0 ? (
                    <>
                      <div className="diag-metric-row">
                        <span className="diag-metric-label">Spool Allocations:</span>
                        <strong className="diag-metric-val">{diag.spools.length} Operator(s) writing to TempDB</strong>
                      </div>
                      <div className="diag-items-list">
                        {diag.spools.slice(0, 3).map((sp, i) => (
                          <div key={i} className="diag-sub-item danger-border" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '3px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                              <span className="diag-sub-tag">Stmt #{sp.statementId} (Node #{sp.nodeId})</span>
                              <span className="badge badge-medium" style={{ fontSize: '9px', padding: '1px 5px' }}>{sp.kind} Spool</span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#fed7aa', fontWeight: 600 }}>
                              {sp.physicalOp} {sp.table ? `on [${sp.table}]` : ''}
                            </div>
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                              Purpose: <span style={{ color: '#cbd5e1' }}>{sp.purpose}</span>
                            </div>
                            {sp.costPercent > 0 && (
                              <div style={{ fontSize: '10px', color: '#fdba74' }}>
                                Cost: {sp.costPercent.toFixed(1)}% of statement
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="diag-remedy">
                        <strong>Fix:</strong> {diag.spools[0]?.remedy || 'Create permanent indexes on the inner join keys or materialize intermediate results in explicit indexed temp tables.'}
                      </p>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <div className="diag-clean-icon">
                        <CheckCircle2 size={20} color="#34d399" />
                      </div>
                      <span className="diag-clean-title">Zero TempDB Spool Overhead</span>
                      <p className="diag-clean-desc">No intermediate Table, Index, or Window spool operators materializing rows into TempDB.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. Missing Statistics Warning (<ColumnsWithNoStatistics>) */}
            {shouldRenderCard('indexes', hasIssues.missingStatistics) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <BarChart3 size={16} color="#ec4899" />
                    <span className="diag-title">Missing Column Statistics</span>
                    <DiagnosticTooltip guideKey="missingStatistics" />
                  </div>
                  {diag.missingStatistics && diag.missingStatistics.length > 0 ? (
                    <span className="badge badge-critical">
                      {diag.missingStatistics.length} {diag.missingStatistics.length === 1 ? 'Table' : 'Tables'} Blind
                    </span>
                  ) : (
                    <span className="badge badge-success">Statistics Complete</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {diag.missingStatistics && diag.missingStatistics.length > 0 ? (
                    <>
                      <div className="diag-alert-line danger">
                        🚨 Optimizer compiled query without column statistics. Cardinality estimates and memory sizing are unreliable.
                      </div>
                      <div className="diag-items-list">
                        {diag.missingStatistics.slice(0, 3).map((ms, i) => (
                          <div key={i} className="diag-sub-item danger-border" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                              <span className="diag-sub-tag">Stmt #{ms.statementId}</span>
                              <strong style={{ fontSize: '11px', color: '#ffffff' }}>
                                {ms.schema ? `[${ms.schema}].` : ''}[{ms.table}]
                              </strong>
                            </div>
                            <div className="diag-chips-wrap">
                              {ms.columns.map((c: string, cIdx: number) => (
                                <span key={cIdx} className="diag-chip">[{c}]</span>
                              ))}
                            </div>
                            {ms.suggestedDdl && (
                              <div style={{ marginTop: '4px', width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                  className={`diag-copy-btn ${copiedId === `ms-${i}` ? 'copied' : ''}`}
                                  onClick={() => handleCopy(ms.suggestedDdl, `ms-${i}`)}
                                  title="Copy CREATE STATISTICS DDL"
                                >
                                  {copiedId === `ms-${i}` ? <Check size={11} /> : <Copy size={11} />}
                                  <span>{copiedId === `ms-${i}` ? 'Copied DDL' : 'Copy CREATE STATISTICS'}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="diag-remedy">
                        <strong>Fix:</strong> Enable <code>AUTO_CREATE_STATISTICS</code> on the database and create missing statistics using <code>CREATE STATISTICS ... WITH FULLSCAN;</code>.
                      </p>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <div className="diag-clean-icon">
                        <CheckCircle2 size={20} color="#34d399" />
                      </div>
                      <span className="diag-clean-title">Statistics Complete</span>
                      <p className="diag-clean-desc">No missing column statistics warnings. Optimizer had valid distribution histograms for all evaluated columns.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. Parameter Sniffing & Parameter List Inspector */}
            {shouldRenderCard('predicates', hasIssues.parameterSniffing) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <Sliders size={16} color="#8b5cf6" />
                    <span className="diag-title">Parameter Sniffing & Values</span>
                    <DiagnosticTooltip guideKey="parameterSniffing" />
                  </div>
                  {diag.parameterSniffing && diag.parameterSniffing.some(p => p.hasMismatch && p.hasEstimateImpact) ? (
                    <span className="badge badge-critical">Sniffing Impact</span>
                  ) : diag.parameterSniffing && diag.parameterSniffing.some(p => p.hasMismatch) ? (
                    <span className="badge badge-high">Value Mismatch</span>
                  ) : diag.parameterSniffing && diag.parameterSniffing.length > 0 ? (
                    <span className="badge badge-info">{diag.parameterSniffing.reduce((acc, p) => acc + p.parameters.length, 0)} Sniffed</span>
                  ) : (
                    <span className="badge badge-success">No Parameters</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {diag.parameterSniffing && diag.parameterSniffing.length > 0 ? (
                    <>
                      <div className="diag-metric-row">
                        <span className="diag-metric-label">Sniffed Parameter Sets:</span>
                        <strong className="diag-metric-val">{diag.parameterSniffing.length} Definition(s)</strong>
                      </div>
                      <div className="diag-items-list">
                        {diag.parameterSniffing.slice(0, 2).map((ps, i) => (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {ps.parameters.map((p: SniffedParameter, pIdx: number) => (
                              <div key={pIdx} className="param-compare-card">
                                <div className="param-name-row">
                                  <div className="param-title-wrap">
                                    <span className="param-name-text">{p.name}</span>
                                    {p.dataType && <span className="param-type-badge">{p.dataType}</span>}
                                  </div>
                                  {p.mismatch ? (
                                    <span className="badge badge-critical" style={{ fontSize: '9px', padding: '1px 6px' }}>
                                      Mismatch
                                    </span>
                                  ) : p.hasRuntime ? (
                                    <span className="badge badge-success" style={{ fontSize: '9px', padding: '1px 6px' }}>
                                      Matched
                                    </span>
                                  ) : null}
                                </div>
                                <div className="param-compare-grid">
                                  <div className="param-col">
                                    <span className="param-col-label">Compiled Plan</span>
                                    <code className="param-val-compiled" title={p.compiledValue || '<null>'}>
                                      {p.compiledValue || '<null>'}
                                    </code>
                                  </div>
                                  {p.hasRuntime && (
                                    <div className="param-col">
                                      <span className="param-col-label">Actual Runtime</span>
                                      <code className={`param-val-runtime ${p.mismatch ? 'mismatch' : ''}`} title={p.runtimeValue || '<null>'}>
                                        {p.runtimeValue || '<null>'}
                                      </code>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                            {ps.mitigation && (
                              <div style={{ fontSize: '10px', color: '#34d399', background: 'rgba(52, 211, 153, 0.1)', padding: '3px 6px', borderRadius: '4px' }}>
                                Active Mitigation: <code>{ps.mitigation}</code>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="diag-remedy">
                        <strong>Fix:</strong> {diag.parameterSniffing[0]?.remedy || 'Use OPTION (RECOMPILE) for volatile parameters, OPTION (OPTIMIZE FOR UNKNOWN) for stable plans, or SQL 2022 PSP optimization.'}
                      </p>
                      <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                          onClick={() => setIsParamSniffingOpen(true)}
                        >
                          <Sliders size={12} color="#8b5cf6" />
                          <span>Parameter Sniffing Deep Dive & Fixes</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <div className="diag-clean-icon">
                        <CheckCircle2 size={20} color="#34d399" />
                      </div>
                      <span className="diag-clean-title">Clean Parameter Alignment</span>
                      <p className="diag-clean-desc">No query parameters recorded in plan or compiled values match runtime execution values.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 5. Non-Sargable Function Calls in WHERE */}
            {shouldRenderCard('predicates', hasIssues.nonSargable) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <Code2 size={16} color="#f43f5e" />
                    <span className="diag-title">Non-Sargable Predicates</span>
                    <DiagnosticTooltip guideKey="nonSargable" />
                  </div>
                  {diag.nonSargable && diag.nonSargable.length > 0 ? (
                    <span className="badge badge-critical">
                      {diag.nonSargable.length} {diag.nonSargable.length === 1 ? 'Expression' : 'Expressions'}
                    </span>
                  ) : (
                    <span className="badge badge-success">Sargable Predicates</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {diag.nonSargable && diag.nonSargable.length > 0 ? (
                    <>
                      <div className="diag-alert-line danger">
                        🚨 Functions wrapped around indexed columns prevent B-Tree Index Seeks and force per-row evaluations.
                      </div>
                      <div className="diag-items-list">
                        {diag.nonSargable.slice(0, 3).map((ns, i) => (
                          <div key={i} className="diag-sub-item danger-border" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '3px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                              <span className="diag-sub-tag">Stmt #{ns.statementId} (Node #{ns.nodeId})</span>
                              <div className="diag-chips-wrap">
                                {ns.functions.map((fn: string, fIdx: number) => (
                                  <span key={fIdx} className="badge badge-critical" style={{ fontSize: '9px', padding: '1px 5px' }}>{fn}</span>
                                ))}
                                {ns.leadingWildcard && (
                                  <span className="badge badge-critical" style={{ fontSize: '9px', padding: '1px 5px' }}>LIKE '%...'</span>
                                )}
                              </div>
                            </div>
                            <div style={{ fontSize: '11px', color: '#ffffff', fontWeight: 600 }}>
                              {ns.table ? `[${ns.table}] ` : ''}({ns.physicalOp})
                            </div>
                            <div className="diag-sub-code" style={{ width: '100%' }} title={ns.predicate}>
                              {ns.predicate}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="diag-remedy">
                        <strong>Fix:</strong> {diag.nonSargable[0]?.remedy || 'Rewrite predicate to compare the bare column to computed date ranges or constants, or add an indexed computed column.'}
                      </p>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <div className="diag-clean-icon">
                        <CheckCircle2 size={20} color="#34d399" />
                      </div>
                      <span className="diag-clean-title">100% Sargable Predicates</span>
                      <p className="diag-clean-desc">No functions wrapping indexed columns in WHERE or JOIN predicates. All searches can seek directly on B-Trees.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 6. Row Goal / TOP / FAST N Pitfalls */}
            {shouldRenderCard('engine', hasIssues.rowGoals) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <Target size={16} color="#06b6d4" />
                    <span className="diag-title">Row Goal & TOP Pitfalls</span>
                    <DiagnosticTooltip guideKey="rowGoals" />
                  </div>
                  {diag.rowGoals && diag.rowGoals.some(r => r.misfired) ? (
                    <span className="badge badge-critical">Goal Misfired</span>
                  ) : diag.rowGoals && diag.rowGoals.length > 0 ? (
                    <span className="badge badge-info">{diag.rowGoals.length} Row Goals</span>
                  ) : (
                    <span className="badge badge-success">No Row Goals</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {diag.rowGoals && diag.rowGoals.length > 0 ? (
                    <>
                      <div className="diag-items-list">
                        {diag.rowGoals.slice(0, 2).map((rg, i) => (
                          <div key={i} className={`diag-sub-item ${rg.misfired ? 'danger-border' : ''}`} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '3px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                              <span className="diag-sub-tag">Stmt #{rg.statementId} ({rg.source})</span>
                              {rg.reductionFactor > 0 && (
                                <span className="badge badge-medium" style={{ fontSize: '9px', padding: '1px 5px' }}>
                                  {rg.reductionFactor.toFixed(1)}x Row Reduction
                                </span>
                              )}
                            </div>
                            <div className="diag-metric-row" style={{ width: '100%', marginTop: '3px' }}>
                              <span className="diag-metric-label">Estimated With Goal:</span>
                              <strong className="diag-metric-val">{rg.estimateRows.toLocaleString()} rows</strong>
                            </div>
                            {rg.estimateRowsWithoutGoal > 0 && (
                              <div className="diag-metric-row" style={{ width: '100%' }}>
                                <span className="diag-metric-label">Without Goal (Base):</span>
                                <span className="text-dim">{rg.estimateRowsWithoutGoal.toLocaleString()} rows</span>
                              </div>
                            )}
                            {rg.misfired && (
                              <div className="diag-alert-line danger" style={{ width: '100%', marginTop: '2px' }}>
                                🚨 Misfired: Produced ~{rg.actualRows.toLocaleString()} actual rows vs {rg.estimateRows.toLocaleString()} estimated.
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="diag-remedy">
                        <strong>Fix:</strong> {diag.rowGoals[0]?.remedy || "Use OPTION (USE HINT('DISABLE_OPTIMIZER_ROWGOAL')) if the early-exit plan turns into a full table scan."}
                      </p>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <div className="diag-clean-icon">
                        <CheckCircle2 size={20} color="#34d399" />
                      </div>
                      <span className="diag-clean-title">No Row Goal Distortion</span>
                      <p className="diag-clean-desc">No TOP, FAST N, or EXISTS cardinality reductions altering the optimizer cost model.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 7. Adaptive Joins & Intelligent Query Processing (SQL Server 2017+) */}
            {shouldRenderCard('engine', hasIssues.adaptive) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <GitFork size={16} color="#10b981" />
                    <span className="diag-title">Adaptive Joins & IQP (2017+)</span>
                    <DiagnosticTooltip guideKey="adaptive" />
                  </div>
                  {diag.adaptive && diag.adaptive.adaptiveJoins.length > 0 ? (
                    <span className="badge badge-success">
                      {diag.adaptive.adaptiveJoins.length} Adaptive Joins
                    </span>
                  ) : diag.adaptive && diag.adaptive.batchModeOperators > 0 ? (
                    <span className="badge badge-info">
                      {diag.adaptive.batchModeOperators} Batch Ops
                    </span>
                  ) : (
                    <span className="badge badge-info">IQP Status</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {diag.adaptive ? (
                    <>
                      {diag.adaptive.adaptiveJoins.length > 0 && (
                        <div className="diag-alert-line warning" style={{ marginBottom: '4px' }}>
                          ⚡ Adaptive Join: Switches from Nested Loops to Hash Match at <strong>{diag.adaptive.adaptiveJoins[0].thresholdRows} rows</strong>.
                          {diag.adaptive.adaptiveJoins[0].actualJoinType && (
                            <span> Resolved to <strong>{diag.adaptive.adaptiveJoins[0].actualJoinType}</strong> at runtime.</span>
                          )}
                        </div>
                      )}
                      <div className="diag-metric-row">
                        <span className="diag-metric-label">Execution Mode:</span>
                        <strong className="diag-metric-val">
                          {diag.adaptive.batchModeOperators} / {diag.adaptive.totalOperators} Operators in Batch Mode
                          {diag.adaptive.batchOnRowstore ? ' (Batch on Rowstore)' : ''}
                        </strong>
                      </div>
                      <div className="diag-chips-wrap" style={{ marginTop: '4px' }}>
                        {diag.adaptive.features.slice(0, 5).map((f: IQPFeature, i: number) => (
                          <span
                            key={i}
                            className={`diag-chip ${f.status === 'Active' ? 'chip-active' : f.status === 'Eligible' ? 'chip-eligible' : 'chip-na'}`}
                            title={f.detail}
                          >
                            {f.name}: {f.status}
                          </span>
                        ))}
                      </div>
                      <p className="diag-desc-text" style={{ marginTop: '4px' }}>
                        {diag.adaptive.summary}
                      </p>
                      <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                          onClick={() => setIsAdaptiveOpen(true)}
                        >
                          <GitFork size={12} color="#10b981" />
                          <span>Adaptive Joins & Batch Mode Deep Dive</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <div className="diag-clean-icon">
                        <CheckCircle2 size={20} color="#38bdf8" />
                      </div>
                      <span className="diag-clean-title">Standard Execution Mode</span>
                      <p className="diag-clean-desc">Intelligent Query Processing status not recorded or standard row-mode execution in effect.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 8. Memory Grant & TempDB Spill Inspector */}
            {shouldRenderCard('engine', hasIssues.memoryGrant) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <Database size={16} color="#a855f7" />
                    <span className="diag-title">Memory Grant & Spills</span>
                    <DiagnosticTooltip guideKey="memoryGrant" />
                  </div>
                  {diag.memoryGrant?.hasSpills ? (
                    <span className="badge badge-critical">Spill Warning</span>
                  ) : diag.memoryGrant?.isBloated ? (
                    <span className="badge badge-high">Bloated Grant</span>
                  ) : (
                    <span className="badge badge-success">Healthy Grant</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {diag.memoryGrant ? (
                    <>
                      <div className="diag-metric-row">
                        <span className="diag-metric-label">Granted / Max Used:</span>
                        <strong className="diag-metric-val">
                          {(diag.memoryGrant.grantedMemoryKb / 1024).toFixed(1)} MB / {(diag.memoryGrant.maxUsedMemoryKb / 1024).toFixed(1)} MB
                        </strong>
                      </div>
                      {diag.memoryGrant.serialDesiredKb > 0 && (
                        <div className="diag-metric-row">
                          <span className="diag-metric-label">Serial Desired Memory:</span>
                          <span className="text-dim">{diag.memoryGrant.serialDesiredKb.toLocaleString()} KB</span>
                        </div>
                      )}
                      {diag.memoryGrant.isBloated && (
                        <div className="diag-alert-line warning">
                          ⚠️ Over-allocated: {diag.memoryGrant.wastedPercent}% unused ({diag.memoryGrant.wastedMemoryMb} MB RAM reserved but unconsumed).
                        </div>
                      )}
                      {diag.memoryGrant.hasSpills && (
                        <div className="diag-alert-line danger">
                          🚨 {diag.memoryGrant.spillDetails || 'Data spilled to TempDB during Hash/Sort operations.'}
                        </div>
                      )}
                      <p className="diag-remedy"><strong>Fix:</strong> {diag.memoryGrant.remedy}</p>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <div className="diag-clean-icon">
                        <CheckCircle2 size={20} color="#34d399" />
                      </div>
                      <span className="diag-clean-title">Optimal Streaming Buffers</span>
                      <p className="diag-clean-desc">No memory grant required. All operations executed directly within stream buffers with zero TempDB spills.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 9. Cardinality Estimation Model Version */}
            {shouldRenderCard('engine', hasIssues.cardinalityEngine) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <Cpu size={16} color="#38bdf8" />
                    <span className="diag-title">Cardinality Estimator (CE)</span>
                    <DiagnosticTooltip guideKey="cardinalityEngine" />
                  </div>
                  {diag.cardinalityEngine?.isLegacy ? (
                    <span className="badge badge-high">Legacy CE (v{diag.cardinalityEngine.modelVersion})</span>
                  ) : (
                    <span className="badge badge-success">Modern CE (v{diag.cardinalityEngine?.modelVersion || '120+'})</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {diag.cardinalityEngine ? (
                    <>
                      <div className="diag-metric-row">
                        <span className="diag-metric-label">CE Engine Version:</span>
                        <strong className="diag-metric-val">
                          Version {diag.cardinalityEngine.modelVersion} {diag.cardinalityEngine.isLegacy ? '(SQL Server 2000-2012 legacy algorithm)' : '(SQL 2014+ Modern Estimator)'}
                        </strong>
                      </div>
                      <p className="diag-desc-text">{diag.cardinalityEngine.description}</p>
                      <p className="diag-remedy"><strong>Action:</strong> {diag.cardinalityEngine.remedy}</p>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <div className="diag-clean-icon">
                        <CheckCircle2 size={20} color="#34d399" />
                      </div>
                      <span className="diag-clean-title">Modern Estimator Active</span>
                      <p className="diag-clean-desc">Query compiled with modern SQL Server Cardinality Estimation model.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 10. Parallelism & Worker Thread Skew */}
            {shouldRenderCard('engine', hasIssues.parallelismSkew) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <SplitSquareVertical size={16} color="#34d399" />
                    <span className="diag-title">Parallel Worker Distribution</span>
                    <DiagnosticTooltip guideKey="parallelismSkew" />
                  </div>
                  {diag.parallelismSkew?.hasSkew ? (
                    <span className="badge badge-critical">{diag.parallelismSkew.skewRatio}x Skew</span>
                  ) : plan.maxDopReason === 'MaxDOPSetToOne' ? (
                    <span className="badge badge-high">MaxDOP 1 Forced</span>
                  ) : (
                    <span className="badge badge-success">Balanced</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {diag.parallelismSkew?.hasSkew ? (
                    <>
                      <div className="diag-metric-row">
                        <span className="diag-metric-label">Thread Imbalance:</span>
                        <strong className="diag-metric-val">{diag.parallelismSkew.skewRatio}x Skew Ratio</strong>
                      </div>
                      <div className="thread-bars-container">
                        {diag.parallelismSkew.threads.map((t) => (
                          <div key={t.threadId} className="thread-bar-row">
                            <span className="thread-name">T#{t.threadId}</span>
                            <div className="thread-track">
                              <div className="thread-fill" style={{ width: `${t.percentage}%` }} />
                            </div>
                            <span className="thread-pct">{t.percentage}%</span>
                          </div>
                        ))}
                      </div>
                      <p className="diag-remedy"><strong>Fix:</strong> {diag.parallelismSkew.remedy}</p>
                    </>
                  ) : plan.maxDopReason === 'MaxDOPSetToOne' ? (
                    <>
                      <div className="diag-alert-line warning">
                        ⚠️ Single-threaded execution forced: Query plan is restricted to MAXDOP 1 at server or query level.
                      </div>
                      <p className="diag-remedy"><strong>Fix:</strong> Review Cost Threshold for Parallelism (recommended: 50) and MAXDOP settings.</p>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <div className="diag-clean-icon">
                        <CheckCircle2 size={20} color="#34d399" />
                      </div>
                      <span className="diag-clean-title">Balanced Thread Distribution</span>
                      <p className="diag-clean-desc">Worker threads processed an evenly distributed volume of rows with zero thread starvation.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 11. Smart Missing Index Consolidation */}
            {shouldRenderCard('indexes', hasIssues.consolidatedIndexes) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <KeyRound size={16} color="#34d399" />
                    <span className="diag-title">Missing Index Consolidator</span>
                    <DiagnosticTooltip guideKey="consolidatedIndexes" />
                  </div>
                  <span className="badge badge-success">
                    {(diag.consolidatedIndexes || []).length} Composite Targets
                  </span>
                </div>
                <div className="diag-card-body">
                  {(diag.consolidatedIndexes || []).length > 0 ? (
                    <>
                      <div className="diag-metric-row">
                        <span className="diag-metric-label">Redundancy Reduction:</span>
                        <strong className="diag-metric-val">
                          {(plan.allMissingIndexes || []).length} Raw Hints ➔ {(diag.consolidatedIndexes || []).length} Composite Indexes
                        </strong>
                      </div>
                      <p className="diag-desc-text">
                        Merges overlapping EQUALITY, INEQUALITY, and INCLUDE columns across identical tables to prevent index sprawl and save write IOPS.
                      </p>
                      {onNavigateTab && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ marginTop: '8px', width: '100%' }}
                          onClick={() => onNavigateTab('indexes')}
                        >
                          <KeyRound size={13} color="#34d399" />
                          <span>Inspect Smart Consolidated Indexes ({(diag.consolidatedIndexes || []).length})</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <div className="diag-clean-icon">
                        <CheckCircle2 size={20} color="#34d399" />
                      </div>
                      <span className="diag-clean-title">No Redundant Index Sprawl</span>
                      <p className="diag-clean-desc">All missing index recommendations are unique or no index suggestions were generated.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 12. Implicit Data Type Conversions (Sargability) */}
            {shouldRenderCard('predicates', hasIssues.implicitConversions) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <AlertTriangle size={16} color="#f43f5e" />
                    <span className="diag-title">Implicit Conversions</span>
                    <DiagnosticTooltip guideKey="implicitConversions" />
                  </div>
                  {(diag.implicitConversions || []).length > 0 ? (
                    <span className="badge badge-critical">{(diag.implicitConversions || []).length} Non-Sargable</span>
                  ) : (
                    <span className="badge badge-success">Clean Sargability</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {(diag.implicitConversions || []).length > 0 ? (
                    <>
                      <div className="diag-items-list">
                        {(diag.implicitConversions || []).slice(0, 3).map((conv, i) => (
                          <div key={i} className="diag-sub-item">
                            <span className="diag-sub-tag">Stmt #{conv.statementId}</span>
                            <span className="diag-sub-code" title={conv.expression}>{conv.expression || conv.convertIssue}</span>
                          </div>
                        ))}
                      </div>
                      <p className="diag-remedy">
                        <strong>Fix:</strong> Parameter and variable data types do not match column types, invalidating Index Seeks. Match types exactly.
                      </p>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <div className="diag-clean-icon">
                        <CheckCircle2 size={20} color="#34d399" />
                      </div>
                      <span className="diag-clean-title">Clean Data Types</span>
                      <p className="diag-clean-desc">No CONVERT_IMPLICIT conversions detected on indexed table columns.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 13. Scalar UDF (RBAR) Penalty */}
            {shouldRenderCard('predicates', hasIssues.scalarUdfWarnings) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <FunctionSquare size={16} color="#fbbf24" />
                    <span className="diag-title">Scalar UDF (RBAR) Penalty</span>
                    <DiagnosticTooltip guideKey="scalarUdfWarnings" />
                  </div>
                  {(diag.scalarUdfWarnings || []).length > 0 ? (
                    <span className="badge badge-critical">{(diag.scalarUdfWarnings || []).length} UDF Detected</span>
                  ) : (
                    <span className="badge badge-success">No Scalar UDFs</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {(diag.scalarUdfWarnings || []).length > 0 ? (
                    <>
                      <div className="diag-items-list">
                        {(diag.scalarUdfWarnings || []).map((udf, i) => (
                          <div key={i} className="diag-sub-item danger-border">
                            <span className="diag-sub-tag">Stmt #{udf.statementId}</span>
                            <code className="diag-sub-code">{udf.functionName}</code>
                          </div>
                        ))}
                      </div>
                      <p className="diag-remedy">
                        <strong>Fix:</strong> Scalar UDFs force Row-By-Agonizing-Row evaluation and suppress parallelism. Convert to an <code>Inline Table-Valued Function (iTVF)</code> or enable SQL 2019+ Scalar Inlining.
                      </p>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <div className="diag-clean-icon">
                        <CheckCircle2 size={20} color="#34d399" />
                      </div>
                      <span className="diag-clean-title">Zero Scalar UDF Penalties</span>
                      <p className="diag-clean-desc">No Row-By-Agonizing-Row (RBAR) scalar functions detected in execution plan.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="metrics-grid">
        <div className="metric-card glass-panel">
          <div className="metric-header">
            <span className="metric-label">Total Subtree Cost</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <DiagnosticTooltip guideKey="totalSubtreeCost" />
              <TrendingUp size={18} color="#38bdf8" />
            </div>
          </div>
          <div className="metric-value">{plan.totalSubTreeCost.toFixed(2)}</div>
          <div className="metric-subtext">Sum of all statement execution estimates</div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-header">
            <span className="metric-label">Total Statements</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <DiagnosticTooltip guideKey="totalStatements" />
              <Layers size={18} color="#818cf8" />
            </div>
          </div>
          <div className="metric-value">{plan.totalStatements}</div>
          <div className="metric-subtext">Stored Procedure / Batch query blocks</div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-header">
            <span className="metric-label">Missing Indexes</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <DiagnosticTooltip guideKey="missingIndexesMetric" />
              <KeyRound size={18} color="#34d399" />
            </div>
          </div>
          <div className="metric-value">{(plan.allMissingIndexes || []).length}</div>
          <div className="metric-subtext">
            {(diag?.consolidatedIndexes || []).length > 0
              ? `Can be consolidated into ${diag?.consolidatedIndexes?.length} composite indexes`
              : 'Engine suggested index recommendations'}
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-header">
            <span className="metric-label">Parallelism Status</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <DiagnosticTooltip guideKey="parallelismStatus" />
              <Cpu size={18} color="#fbbf24" />
            </div>
          </div>
          <div className="metric-value" style={{ fontSize: '18px', marginTop: '6px' }}>
            {plan.maxDopReason === 'MaxDOPSetToOne'
              ? 'MaxDOP = 1 (Serial)'
              : (plan.maxDopReason || 'Parallel Enabled')}
          </div>
          <div className="metric-subtext">
            {plan.maxDopReason === 'MaxDOPSetToOne'
              ? '⚠️ Single-threaded execution enforced'
              : 'Multi-threaded query execution available'}
          </div>
        </div>
      </div>

      {/* Dedicated I/O & Hardware Metrics Widget */}
      {plan.hardwareMetrics && (
        <div className="section-block">
          <div className="section-title-row">
            <HardDrive size={18} color="#38bdf8" />
            <h2 className="section-title">Server I/O & Hardware Execution Metrics</h2>
            <DiagnosticTooltip guideKey="logicalReadsMetric" />
            <span className="badge badge-info">
              {plan.hardwareMetrics.hasRuntimeMetrics ? 'Actual Runtime Stats' : 'Estimated Plan Profile'}
            </span>
            {plan.hardwareMetrics.cacheHitRatioPercent === 100 && (
              <span className="badge badge-success" style={{ marginLeft: 'auto' }}>
                <CheckCircle2 size={12} style={{ marginRight: '4px' }} />
                100% Buffer Cache Hit (0 Disk I/O)
              </span>
            )}
            {plan.hardwareMetrics.totalPhysicalReads > 0 && (
              <span className="badge badge-critical" style={{ marginLeft: 'auto' }}>
                <AlertTriangle size={12} style={{ marginRight: '4px' }} />
                Disk Reads: {plan.hardwareMetrics.totalPhysicalReadsMb} MB
              </span>
            )}
          </div>

          {/* 4 Dedicated Hardware Metric Cards */}
          <div className="metrics-grid" style={{ marginBottom: '20px' }}>
            {/* 1. Total Logical Reads (RAM Touched) */}
            <div className="metric-card glass-panel hardware-kpi-card">
              <div className="metric-header">
                <span className="metric-label">Total Logical Reads (RAM Touched)</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <DiagnosticTooltip guideKey="logicalReadsMetric" />
                  <Database size={18} color="#38bdf8" />
                </div>
              </div>
              <div className="metric-value">
                {plan.hardwareMetrics.totalLogicalReadsMb > 0
                  ? `${plan.hardwareMetrics.totalLogicalReadsMb.toLocaleString()} MB`
                  : `${plan.hardwareMetrics.totalLogicalReads.toLocaleString()} pgs`}
              </div>
              <div className="metric-subtext">
                <strong>{plan.hardwareMetrics.totalLogicalReads.toLocaleString()}</strong> 8KB memory pages read from buffer cache
              </div>
            </div>

            {/* 2. Physical Disk Reads */}
            <div className="metric-card glass-panel hardware-kpi-card">
              <div className="metric-header">
                <span className="metric-label">Physical Disk Reads</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <DiagnosticTooltip guideKey="physicalReadsMetric" />
                  <Disc size={18} color={plan.hardwareMetrics.totalPhysicalReads > 0 ? '#f43f5e' : '#34d399'} />
                </div>
              </div>
              <div className="metric-value" style={{ color: plan.hardwareMetrics.totalPhysicalReads > 0 ? '#fda4af' : '#34d399' }}>
                {plan.hardwareMetrics.totalPhysicalReadsMb} MB
              </div>
              <div className="metric-subtext">
                {plan.hardwareMetrics.totalPhysicalReads === 0 ? (
                  <span style={{ color: '#34d399' }}>✅ 100% Cache Hit (Zero disk latency)</span>
                ) : (
                  <span style={{ color: '#fda4af' }}>
                    {plan.hardwareMetrics.totalPhysicalReads.toLocaleString()} disk reads ({plan.hardwareMetrics.totalReadAheads.toLocaleString()} read-ahead)
                  </span>
                )}
              </div>
            </div>

            {/* 3. CPU vs Elapsed Time */}
            <div className="metric-card glass-panel hardware-kpi-card">
              <div className="metric-header">
                <span className="metric-label">CPU vs. Elapsed Clock</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <DiagnosticTooltip guideKey="cpuVsElapsedMetric" />
                  <Cpu size={18} color="#c084fc" />
                </div>
              </div>
              <div className="metric-value" style={{ fontSize: '18px', marginTop: '4px' }}>
                {plan.hardwareMetrics.totalActualCpuMs.toLocaleString()} ms CPU / {plan.hardwareMetrics.totalActualElapsedMs.toLocaleString()} ms Clock
              </div>
              <div className="metric-subtext">
                {plan.hardwareMetrics.totalActualElapsedMs > 0 ? (
                  <>
                    <strong style={{ color: '#c084fc' }}>{plan.hardwareMetrics.cpuUtilizationRatio}%</strong> CPU active
                    {plan.hardwareMetrics.waitTimeMs > 0 && (
                      <span className="text-dim"> ({plan.hardwareMetrics.waitTimeMs} ms wait time)</span>
                    )}
                  </>
                ) : (
                  <span>Compile CPU: {plan.statements[0]?.compileCpuMs || 0} ms</span>
                )}
              </div>
            </div>

            {/* 4. Memory Grant Wait Time */}
            <div className="metric-card glass-panel hardware-kpi-card">
              <div className="metric-header">
                <span className="metric-label">Memory Grant Wait Time</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <DiagnosticTooltip guideKey="memoryGrantWaitMetric" />
                  <Activity size={18} color={plan.hardwareMetrics.memoryGrantWaitTimeMs > 0 ? '#f43f5e' : '#fbbf24'} />
                </div>
              </div>
              <div className="metric-value" style={{ color: plan.hardwareMetrics.memoryGrantWaitTimeMs > 0 ? '#fda4af' : '#fbbf24' }}>
                {plan.hardwareMetrics.memoryGrantWaitTimeMs} ms Wait
              </div>
              <div className="metric-subtext">
                {plan.hardwareMetrics.grantedMemoryKb > 0 ? (
                  <span>
                    Granted: <strong>{(plan.hardwareMetrics.grantedMemoryKb / 1024).toFixed(1)} MB</strong> (Used: {(plan.hardwareMetrics.maxUsedMemoryKb / 1024).toFixed(1)} MB)
                  </span>
                ) : (
                  <span>Immediate grant (No semaphore queue)</span>
                )}
              </div>
            </div>
          </div>

          {/* Table-by-Table I/O Heatmap & Leaderboard */}
          {plan.hardwareMetrics.topIoLeaders && plan.hardwareMetrics.topIoLeaders.length > 0 && (
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
              <div className="section-title-row" style={{ marginBottom: '14px' }}>
                <BarChart3 size={16} color="#38bdf8" />
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                  Top I/O Consumers Leaderboard (Table-Level Read Breakdown)
                </h3>
                <DiagnosticTooltip guideKey="tableIoLeaderboard" />
                <span className="text-dim" style={{ fontSize: '12px', marginLeft: 'auto' }}>
                  Ranked by Logical Read Volume (Pages & MB)
                </span>
              </div>

              <div className="table-wrapper">
                <table className="leaderboard-table io-heatmap-table">
                  <thead>
                    <tr>
                      <th style={{ width: '70px' }}>Rank</th>
                      <th style={{ width: '220px' }}>Table Name</th>
                      <th style={{ width: '160px' }}>Logical Reads (RAM)</th>
                      <th>I/O Heatmap (% of Query Reads)</th>
                      <th style={{ width: '150px' }}>Disk & Read-Aheads</th>
                      <th style={{ width: '200px' }}>Access Operations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.hardwareMetrics.topIoLeaders.map((item) => {
                      const isTopLeader = item.rank === 1 && item.readPercent > 30;
                      return (
                        <tr key={item.rank} className={isTopLeader ? 'heavy-row' : ''}>
                          <td>
                            <span className={`rank-badge rank-${item.rank <= 3 ? item.rank : 'other'}`}>
                              #{item.rank}
                            </span>
                          </td>
                          <td>
                            <div className="table-identity">
                              <span className="table-full-name font-mono" title={`${item.database}.${item.schema}.${item.table}`}>
                                {item.schema ? `${item.schema}.${item.table}` : item.table}
                              </span>
                              {item.indexesUsed && item.indexesUsed.length > 0 && (
                                <div className="index-tags-stack">
                                  {item.indexesUsed.map((idxName, i) => (
                                    <span key={i} className="index-used-tag" title={`Index: ${idxName}`}>
                                      {idxName}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="reads-volume-cell">
                              <strong>{item.logicalReads.toLocaleString()}</strong> <span className="text-muted">pgs</span>
                              <span className="badge badge-info" style={{ fontSize: '11px', padding: '1px 5px' }}>
                                {item.logicalReadsMb} MB
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="io-progress-cell">
                              <div className="io-progress-track">
                                <div
                                  className={`io-progress-fill ${item.readPercent > 50 ? 'fill-danger' : item.readPercent > 20 ? 'fill-warning' : 'fill-primary'}`}
                                  style={{ width: `${Math.max(3, Math.min(item.readPercent, 100))}%` }}
                                />
                              </div>
                              <span className="io-pct-label font-mono">
                                {item.readPercent.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="disk-reads-cell text-muted" style={{ fontSize: '12px' }}>
                              <span>{item.physicalReads.toLocaleString()} disk</span>
                              <span className="text-dim"> / {item.readAheads.toLocaleString()} ahead</span>
                            </div>
                          </td>
                          <td>
                            <div className="ops-badges-stack">
                              {(item.accessOperations || []).map((op, i) => (
                                <span
                                  key={i}
                                  className={`op-badge ${op.includes('Scan') ? 'op-scan' : op.includes('Seek') ? 'op-seek' : 'op-other'}`}
                                >
                                  {op}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Wait Statistics Dashboard (<WaitStats>) */}
      {plan.waitStats && plan.waitStats.length > 0 && (
        <div className="section-block">
          <div className="section-title-row">
            <Clock size={18} color="#fbbf24" />
            <h2 className="section-title">Query Wait Statistics (Bottleneck Breakdown)</h2>
            <DiagnosticTooltip guideKey="waitStats" />
            <span className="badge badge-high">{plan.waitStats.length} Waits Recorded</span>
          </div>

          <div className="wait-stats-grid">
            {plan.waitStats.map((ws, idx) => (
              <div key={idx} className="wait-stat-card glass-panel">
                <div className="wait-stat-header">
                  <div className="wait-stat-name-row" title={ws.waitType}>
                    {getWaitIcon(ws.category)}
                    <span className="wait-name-full">{ws.waitType}</span>
                  </div>
                  <div className="wait-category-row">
                    <span className="badge badge-info">{ws.category}</span>
                  </div>
                </div>
                <div className="wait-metric-row">
                  <div className="wait-num">
                    <span className="wait-label">Wait Time:</span>
                    <strong>{ws.waitTimeMs.toLocaleString()} ms</strong>
                  </div>
                  <div className="wait-num">
                    <span className="wait-label">Count:</span>
                    <strong>{ws.waitCount.toLocaleString()}</strong>
                  </div>
                </div>
                <p className="wait-desc">{ws.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anti-Patterns Banner */}
      {(plan.antiPatterns || []).length > 0 && (
        <div className="section-block">
          <div className="section-title-row">
            <AlertTriangle size={18} color="#f43f5e" />
            <h2 className="section-title">Detected Engine Bottlenecks & Anti-Patterns</h2>
            <span className="badge badge-critical">{(plan.antiPatterns || []).length} Found</span>
          </div>

          <div className="antipatterns-grid">
            {(plan.antiPatterns || []).map((ap, idx) => (
              <div key={idx} className={`antipattern-card glass-panel border-${ap.severity.toLowerCase()}`}>
                <div className="antipattern-top">
                  <span className={`badge badge-${ap.severity === 'CRITICAL' ? 'critical' : ap.severity === 'HIGH' ? 'high' : 'info'}`}>
                    {ap.severity}
                  </span>
                  <span className="antipattern-title">{ap.title}</span>
                </div>
                <p className="antipattern-desc">{ap.description}</p>
                <div className="antipattern-recommendation">
                  <strong>Fix:</strong> {ap.recommendation}
                </div>
                {(ap.affectedStatements || []).length > 0 && (
                  <div className="affected-stmts">
                    <span className="affected-label">Affected:</span>
                    {(ap.affectedStatements || []).map((s, i) => (
                      <span key={i} className="affected-badge">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Statement Cost Leaderboard */}
      <div className="section-block">
        <div className="section-title-row">
          <Layers size={18} color="#38bdf8" />
          <h2 className="section-title">Statement Cost Leaderboard (Top Spenders)</h2>
          <DiagnosticTooltip guideKey="costliestStatements" />
          <span className="section-subtitle">Ranked by SubTree Cost descending</span>
        </div>

        <div className="glass-panel table-wrapper">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th style={{ width: '75px' }}>Stmt #</th>
                <th style={{ width: '130px' }}>Type</th>
                <th>Query Preview</th>
                <th style={{ width: '100px' }}>Est. Rows</th>
                <th style={{ width: '160px' }}>Profile & Reads</th>
                <th style={{ width: '170px' }}>Subtree Cost & %</th>
                <th style={{ width: '110px' }}>Warnings</th>
                <th style={{ width: '140px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plan.statements.map((stmt) => {
                const isHeavy = stmt.costPercentage > 20;
                return (
                  <tr key={stmt.statementId} className={isHeavy ? 'heavy-row' : ''}>
                    <td>
                      <span className={`stmt-id-badge ${isHeavy ? 'heavy-badge' : ''}`}>
                        #{stmt.statementId}
                      </span>
                    </td>
                    <td>
                      <span className="stmt-type-tag">{stmt.statementType}</span>
                    </td>
                    <td>
                      <QueryPreviewCell
                        statement={stmt}
                        onInspectPlan={(s) => onSelectStatement(s, 'visualizer')}
                        onOptimizeAI={(s) => onSelectStatement(s, 'advisor')}
                      />
                    </td>
                    <td className="text-muted">
                      {stmt.statementEstRows > 0 ? stmt.statementEstRows.toLocaleString() : '-'}
                    </td>
                    <td>
                      <div className="profile-classification-cell">
                        {stmt.executionClassification === 'IO_BOUND' && (
                          <span className="badge badge-io-bound" title={stmt.executionClassificationReason || 'I/O Bound statement'}>
                            💽 I/O Bound
                          </span>
                        )}
                        {stmt.executionClassification === 'CPU_BOUND' && (
                          <span className="badge badge-cpu-bound" title={stmt.executionClassificationReason || 'CPU Bound statement'}>
                            ⚡ CPU Bound
                          </span>
                        )}
                        {stmt.executionClassification === 'WAIT_BOUND' && (
                          <span className="badge badge-wait-bound" title={stmt.executionClassificationReason || 'Wait Bound statement'}>
                            ⏳ Wait Bound
                          </span>
                        )}
                        {(stmt.executionClassification === 'BALANCED' || !stmt.executionClassification) && (
                          <span className="badge badge-balanced" title={stmt.executionClassificationReason || 'Balanced statement'}>
                            ⚖️ Balanced
                          </span>
                        )}
                        {stmt.actualLogicalReads !== undefined && stmt.actualLogicalReads > 0 && (
                          <div className="stmt-reads-hint text-dim" title={`${stmt.actualLogicalReads.toLocaleString()} logical reads`}>
                            📖 {stmt.actualLogicalReadsMb} MB ({stmt.actualLogicalReads.toLocaleString()} pgs)
                          </div>
                        )}
                        {stmt.actualCpuMs !== undefined && stmt.actualCpuMs > 0 && (
                          <div className="stmt-cpu-hint text-dim" title={`${stmt.actualCpuMs} ms CPU / ${stmt.actualElapsedMs} ms elapsed`}>
                            ⏱️ {stmt.actualCpuMs} ms CPU
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="cost-progress-cell">
                        <div className="cost-numbers">
                          <strong>{stmt.statementSubTreeCost.toFixed(2)}</strong>
                          <span className="text-muted">({stmt.costPercentage.toFixed(1)}%)</span>
                        </div>
                        <div className="progress-track">
                          <div
                            className={`progress-fill ${isHeavy ? 'fill-heavy' : 'fill-normal'}`}
                            style={{ width: `${Math.min(stmt.costPercentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="warnings-stack">
                        {(stmt.warnings || []).length > 0 && (
                          <span className="badge badge-critical" title="Warnings detected">
                            {(stmt.warnings || []).length} Warn
                          </span>
                        )}
                        {(stmt.missingIndexes || []).length > 0 && (
                          <span className="badge badge-success" title="Missing index recommendation">
                            {(stmt.missingIndexes || []).length} Idx
                          </span>
                        )}
                        {(stmt.warnings || []).length === 0 && (stmt.missingIndexes || []).length === 0 && (
                          <span className="text-dim">-</span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="action-buttons-cell">
                        <button
                          className="btn-table-action"
                          onClick={() => onSelectStatement(stmt, 'visualizer')}
                          title="Inspect Operator Tree"
                        >
                          <span>Plan</span>
                          <ArrowRight size={13} />
                        </button>
                        <button
                          className="btn-table-action btn-table-ai"
                          onClick={() => onSelectStatement(stmt, 'advisor')}
                          title="Get AI Optimization Advice"
                        >
                          <Sparkles size={12} color="#c084fc" />
                          <span>AI</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ParameterSniffingModal
        isOpen={isParamSniffingOpen}
        onClose={() => setIsParamSniffingOpen(false)}
        finding={diag?.parameterSniffing?.[0]}
      />

      <AdaptiveJoinsModal
        isOpen={isAdaptiveOpen}
        onClose={() => setIsAdaptiveOpen(false)}
        adaptive={diag?.adaptive}
      />
    </div>
  );
};

function getWaitIcon(category: string) {
  switch (category) {
    case 'Disk I/O':
      return <HardDrive size={14} color="#f43f5e" />;
    case 'Parallelism':
      return <Cpu size={14} color="#fbbf24" />;
    case 'Network / Client':
      return <Network size={14} color="#38bdf8" />;
    case 'Memory Grant':
      return <Activity size={14} color="#a855f7" />;
    default:
      return <Clock size={14} color="#94a3b8" />;
  }
}
