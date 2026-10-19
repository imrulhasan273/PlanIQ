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
  Check
} from 'lucide-react';
import { PlanAnalysis, StatementAnalysis } from '../types/plan';

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

  return (
    <div className="tab-scroll-container">
      {/* 10-Second Executive Root Cause Verdict Banner */}
      {verdict && (
        <div className="verdict-hero-card glass-panel">
          <div className="verdict-top-row">
            <div className="verdict-title-tag">
              <Zap size={16} color="#38bdf8" />
              <span>10-Second Executive Root Cause Verdict</span>
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
                Evaluates Cardinality Estimator version, RAM memory grants, TempDB spills, scalar UDF penalties, implicit conversions, and parallelism skew.
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

          {/* 6 Advanced Root Cause Diagnostic Cards */}
          <div className="diagnostics-cards-grid">
            {/* 1. Memory Grant & TempDB Spill Inspector */}
            <div className="diag-card glass-panel">
              <div className="diag-card-header">
                <div className="diag-icon-title">
                  <Database size={16} color="#a855f7" />
                  <span className="diag-title">Memory Grant & Spills</span>
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
                  <div className="diag-empty-text">
                    ✓ No memory grant allocated (all operations executed within stream buffers).
                  </div>
                )}
              </div>
            </div>

            {/* 2. Cardinality Estimation Model Version */}
            <div className="diag-card glass-panel">
              <div className="diag-card-header">
                <div className="diag-icon-title">
                  <Cpu size={16} color="#38bdf8" />
                  <span className="diag-title">Cardinality Estimator (CE)</span>
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
                  <div className="diag-empty-text">Default Cardinality Estimator active.</div>
                )}
              </div>
            </div>

            {/* 3. Implicit Data Type Conversions (Sargability) */}
            <div className="diag-card glass-panel">
              <div className="diag-card-header">
                <div className="diag-icon-title">
                  <AlertTriangle size={16} color="#f43f5e" />
                  <span className="diag-title">Implicit Conversions</span>
                </div>
                {diag.implicitConversions.length > 0 ? (
                  <span className="badge badge-critical">{diag.implicitConversions.length} Non-Sargable</span>
                ) : (
                  <span className="badge badge-success">Clean Sargability</span>
                )}
              </div>
              <div className="diag-card-body">
                {diag.implicitConversions.length > 0 ? (
                  <>
                    <div className="diag-items-list">
                      {diag.implicitConversions.slice(0, 3).map((conv, i) => (
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
                  <div className="diag-empty-text">✓ No CONVERT_IMPLICIT performance penalties detected.</div>
                )}
              </div>
            </div>

            {/* 4. Scalar UDF (RBAR) Penalty */}
            <div className="diag-card glass-panel">
              <div className="diag-card-header">
                <div className="diag-icon-title">
                  <FunctionSquare size={16} color="#fbbf24" />
                  <span className="diag-title">Scalar UDF (RBAR) Penalty</span>
                </div>
                {diag.scalarUdfWarnings.length > 0 ? (
                  <span className="badge badge-critical">{diag.scalarUdfWarnings.length} UDF Detected</span>
                ) : (
                  <span className="badge badge-success">No Scalar UDFs</span>
                )}
              </div>
              <div className="diag-card-body">
                {diag.scalarUdfWarnings.length > 0 ? (
                  <>
                    <div className="diag-items-list">
                      {diag.scalarUdfWarnings.map((udf, i) => (
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
                  <div className="diag-empty-text">✓ No scalar user-defined functions suppressing parallelism.</div>
                )}
              </div>
            </div>

            {/* 5. Parallelism & Worker Thread Skew */}
            <div className="diag-card glass-panel">
              <div className="diag-card-header">
                <div className="diag-icon-title">
                  <SplitSquareVertical size={16} color="#34d399" />
                  <span className="diag-title">Parallel Worker Distribution</span>
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
                  <div className="diag-empty-text">✓ Multi-threaded parallel execution is balanced.</div>
                )}
              </div>
            </div>

            {/* 6. Smart Missing Index Consolidation */}
            <div className="diag-card glass-panel">
              <div className="diag-card-header">
                <div className="diag-icon-title">
                  <KeyRound size={16} color="#34d399" />
                  <span className="diag-title">Missing Index Consolidator</span>
                </div>
                <span className="badge badge-success">
                  {diag.consolidatedIndexes.length} Composite Targets
                </span>
              </div>
              <div className="diag-card-body">
                {diag.consolidatedIndexes.length > 0 ? (
                  <>
                    <div className="diag-metric-row">
                      <span className="diag-metric-label">Redundancy Reduction:</span>
                      <strong className="diag-metric-val">
                        {plan.allMissingIndexes.length} Raw Hints ➔ {diag.consolidatedIndexes.length} Composite Indexes
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
                        <span>Inspect Smart Consolidated Indexes ({diag.consolidatedIndexes.length})</span>
                      </button>
                    )}
                  </>
                ) : (
                  <div className="diag-empty-text">✓ No missing index consolidation required.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="metrics-grid">
        <div className="metric-card glass-panel">
          <div className="metric-header">
            <span className="metric-label">Total Subtree Cost</span>
            <TrendingUp size={18} color="#38bdf8" />
          </div>
          <div className="metric-value">{plan.totalSubTreeCost.toFixed(2)}</div>
          <div className="metric-subtext">Sum of all statement execution estimates</div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-header">
            <span className="metric-label">Total Statements</span>
            <Layers size={18} color="#818cf8" />
          </div>
          <div className="metric-value">{plan.totalStatements}</div>
          <div className="metric-subtext">Stored Procedure / Batch query blocks</div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-header">
            <span className="metric-label">Missing Indexes</span>
            <KeyRound size={18} color="#34d399" />
          </div>
          <div className="metric-value">{plan.allMissingIndexes.length}</div>
          <div className="metric-subtext">
            {diag?.consolidatedIndexes && diag.consolidatedIndexes.length > 0
              ? `Can be consolidated into ${diag.consolidatedIndexes.length} composite indexes`
              : 'Engine suggested index recommendations'}
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-header">
            <span className="metric-label">Parallelism Status</span>
            <Cpu size={18} color="#fbbf24" />
          </div>
          <div className="metric-value" style={{ fontSize: '18px', marginTop: '6px' }}>
            {plan.maxDopReason || 'Parallel Enabled'}
          </div>
          <div className="metric-subtext">
            {plan.maxDopReason === 'MaxDOPSetToOne'
              ? '⚠️ Single-threaded execution enforced'
              : 'Multi-threaded query execution available'}
          </div>
        </div>
      </div>

      {/* Wait Statistics Dashboard (<WaitStats>) */}
      {plan.waitStats && plan.waitStats.length > 0 && (
        <div className="section-block">
          <div className="section-title-row">
            <Clock size={18} color="#fbbf24" />
            <h2 className="section-title">Query Wait Statistics (Bottleneck Breakdown)</h2>
            <span className="badge badge-high">{plan.waitStats.length} Waits Recorded</span>
          </div>

          <div className="wait-stats-grid">
            {plan.waitStats.map((ws, idx) => (
              <div key={idx} className="wait-stat-card glass-panel">
                <div className="wait-stat-top">
                  <div className="wait-type-name">
                    {getWaitIcon(ws.category)}
                    <span>{ws.waitType}</span>
                  </div>
                  <span className="badge badge-info">{ws.category}</span>
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
      {plan.antiPatterns.length > 0 && (
        <div className="section-block">
          <div className="section-title-row">
            <AlertTriangle size={18} color="#f43f5e" />
            <h2 className="section-title">Detected Engine Bottlenecks & Anti-Patterns</h2>
            <span className="badge badge-critical">{plan.antiPatterns.length} Found</span>
          </div>

          <div className="antipatterns-grid">
            {plan.antiPatterns.map((ap, idx) => (
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
                {ap.affectedStatements.length > 0 && (
                  <div className="affected-stmts">
                    <span className="affected-label">Affected:</span>
                    {ap.affectedStatements.map((s, i) => (
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
          <span className="section-subtitle">Ranked by SubTree Cost descending</span>
        </div>

        <div className="glass-panel table-wrapper">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>Stmt #</th>
                <th style={{ width: '140px' }}>Type</th>
                <th>Query Preview</th>
                <th style={{ width: '130px' }}>Est. Rows</th>
                <th style={{ width: '180px' }}>Subtree Cost & %</th>
                <th style={{ width: '120px' }}>Warnings</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Actions</th>
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
                      <div className="stmt-text-cell" title={stmt.statementText}>
                        {stmt.statementText || '<No query text available>'}
                      </div>
                    </td>
                    <td className="text-muted">
                      {stmt.statementEstRows > 0 ? stmt.statementEstRows.toLocaleString() : '-'}
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
                        {stmt.warnings.length > 0 && (
                          <span className="badge badge-critical" title="Warnings detected">
                            {stmt.warnings.length} Warn
                          </span>
                        )}
                        {stmt.missingIndexes.length > 0 && (
                          <span className="badge badge-success" title="Missing index recommendation">
                            {stmt.missingIndexes.length} Idx
                          </span>
                        )}
                        {stmt.warnings.length === 0 && stmt.missingIndexes.length === 0 && (
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
