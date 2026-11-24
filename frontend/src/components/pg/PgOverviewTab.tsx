import React, { useState } from 'react';
import {
  Zap,
  ArrowRight,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  HardDrive,
  Cpu,
  KeyRound,
  CheckCircle2,
  Sliders,
  Database,
  Layers,
  Search,
  Activity,
  Copy,
  Check,
  TrendingDown,
  Clock,
  Settings
} from 'lucide-react';
import { PlanAnalysis, StatementAnalysis, PlanNode } from '../../types/plan';
import { DiagnosticTooltip } from '../DiagnosticTooltip';

interface PgOverviewTabProps {
  plan: PlanAnalysis;
  onSelectStatement: (stmt: StatementAnalysis, targetTab: 'visualizer' | 'advisor') => void;
  onNavigateTab?: (tab: string) => void;
}

export const PgOverviewTab: React.FC<PgOverviewTabProps> = ({
  plan,
  onSelectStatement,
  onNavigateTab,
}) => {
  const [diagCategory, setDiagCategory] = useState<'all' | 'memory' | 'indexes' | 'engine'>('all');
  const [onlyIssues, setOnlyIssues] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const verdict = plan.executiveVerdict;
  const culpritStmt = plan.statements.find(
    (s) => s.statementId === String(verdict?.culpritStatementId || 1)
  ) || plan.statements[0];

  const firstStmtPg = plan.statements[0]?.pg;
  const diag = plan.diagnostics;
  const ple = plan.pleRiskReport;

  // Extract all nodes recursively for analysis
  const allNodes: PlanNode[] = [];
  plan.statements.forEach((stmt) => {
    const walk = (n?: PlanNode) => {
      if (!n) return;
      allNodes.push(n);
      if (n.children) n.children.forEach(walk);
    };
    walk(stmt.rootNode);
  });

  // 1. work_mem & Disk Spills Detector
  const spillNodes = allNodes.filter(
    (n) =>
      (n.pg?.sortSpaceType || '').toLowerCase().includes('disk') ||
      (n.pg?.hashBatches || 0) > 1 ||
      (n.pg?.buffers?.tempRead || 0) > 0 ||
      (n.pg?.buffers?.tempWritten || 0) > 0
  );

  // 2. Sequential Scans with High Filter Discards
  const seqScanFilterNodes = allNodes.filter((n) => {
    const isSeq = n.physicalOp.toLowerCase().includes('seq scan');
    const removed = n.pg?.rowsRemovedByFilter || 0;
    const filter = n.predicate || n.pg?.filter;
    return isSeq && (removed > 500 || (filter && (n.actualRows || n.estimateRows) > 1000));
  });

  // 3. Cardinality Estimation Skews
  const skewedNodes = allNodes.filter((n) => {
    if (!n.hasActualRows) return false;
    const est = n.estimateRows;
    const act = n.actualRows;
    if (est === 0 && act > 10) return true;
    if (est > 0) {
      const ratio = act > est ? act / est : est / Math.max(1, act);
      return ratio >= 3.0 && Math.abs(act - est) > 100;
    }
    return false;
  });

  // 4. JIT & Planner Settings
  const hasJit = !!(firstStmtPg?.jit && (firstStmtPg.jit.functions || 0) > 0);
  const pgSettings = firstStmtPg?.settings || {};

  // 5. Parallel Query Workers
  const parallelNodes = allNodes.filter(
    (n) =>
      n.physicalOp.toLowerCase().includes('gather') ||
      (n.pg?.workersPlanned || 0) > 0 ||
      (n.pg?.workersLaunched || 0) > 0
  );

  // 6. Index Access & Heap Fetches (Visibility map issue)
  const indexNodesWithHeapFetches = allNodes.filter(
    (n) => (n.pg?.heapFetches || 0) > 100
  );

  // 7. CTE & Materialize
  const materializeNodes = allNodes.filter(
    (n) =>
      n.physicalOp.toLowerCase().includes('materialize') ||
      n.physicalOp.toLowerCase().includes('cte scan')
  );

  // 8. Missing Indexes
  const missingIndexes = plan.allMissingIndexes || [];

  // 9. Type Casts & Non-Sargable Predicates
  const typeCastNodes = allNodes.filter((n) => {
    const filter = n.predicate || n.pg?.filter || '';
    return filter.includes('::') || /lower\(|upper\(|date\(|to_char\(/i.test(filter);
  });

  // 10. Triggers & UDFs
  const triggers = firstStmtPg?.triggers || [];

  // Issues map
  const hasIssues = {
    workMem: spillNodes.length > 0,
    seqScans: seqScanFilterNodes.length > 0,
    cardinality: skewedNodes.length > 0,
    jit: hasJit && (firstStmtPg?.jit?.totalMs || 0) > (firstStmtPg?.executionMs || 100) * 0.3,
    parallelism: parallelNodes.some((p) => (p.pg?.workersLaunched || 0) < (p.pg?.workersPlanned || 0)),
    heapFetches: indexNodesWithHeapFetches.length > 0,
    materialize: materializeNodes.length > 1,
    missingIndexes: missingIndexes.length > 0,
    typeCasts: typeCastNodes.length > 0,
    triggers: triggers.some((t: any) => (t.timeMs || 0) > 10),
  };

  const totalIssuesCount = Object.values(hasIssues).filter(Boolean).length;

  const shouldRenderCard = (category: 'memory' | 'indexes' | 'engine', hasCardIssue: boolean) => {
    if (diagCategory !== 'all' && diagCategory !== category) return false;
    if (onlyIssues && !hasCardIssue) return false;
    return true;
  };

  const handleCopy = (text: string, id: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Buffer metrics
  const totalLogicalReads = plan.hardwareMetrics?.totalLogicalReads || 0;
  const totalPhysicalReads = plan.hardwareMetrics?.totalPhysicalReads || 0;
  const cacheHitRatio = plan.hardwareMetrics?.cacheHitRatioPercent ?? 100;
  const scanVolumeMb = plan.hardwareMetrics?.totalLogicalReadsMb || 0;
  const physicalMb = plan.hardwareMetrics?.totalPhysicalReadsMb || 0;

  return (
    <div className="tab-scroll-container">
      {/* 10-Second Executive Root Cause Verdict Banner */}
      {verdict && (
        <div className="verdict-hero-card glass-panel" style={{ borderLeft: '4px solid #38bdf8' }}>
          <div className="verdict-top-row">
            <div className="verdict-title-tag">
              <Zap size={16} color="#38bdf8" />
              <span>PostgreSQL Executive Root Cause Verdict</span>
              <DiagnosticTooltip guideKey="executiveVerdict" />
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="badge badge-info" style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
                PostgreSQL Engine
              </span>
              <span
                className={`badge ${plan.totalStatements === 1 && (diag?.healthScore ?? 0) >= 80 ? 'badge-success' : 'badge-critical'}`}
                style={{ fontSize: '11px' }}
              >
                {plan.totalStatements === 1
                  ? `Single Query Plan (${verdict.costPercentage}% of Plan)`
                  : `Culprit: Stmt #${verdict.culpritStatementId} (${verdict.costPercentage}% Cost)`}
              </span>
            </div>
          </div>

          <h2 className="verdict-headline">{verdict.headline}</h2>
          <p className="verdict-summary">{verdict.summary}</p>

          {/* Quick Metrics Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '10px',
              margin: '12px 0',
              padding: '10px 14px',
              background: 'rgba(15, 23, 42, 0.4)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            <div>
              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Planning Time</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8' }}>
                {firstStmtPg?.planningMs ? `${firstStmtPg.planningMs.toFixed(3)} ms` : 'N/A'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Execution Time</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#34d399' }}>
                {firstStmtPg?.executionMs ? `${firstStmtPg.executionMs.toFixed(2)} ms` : `${plan.hardwareMetrics?.totalActualElapsedMs || 0} ms`}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>shared_buffers Hit</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: cacheHitRatio >= 95 ? '#34d399' : '#fbbf24' }}>
                {cacheHitRatio.toFixed(1)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Disk Spills</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: spillNodes.length > 0 ? '#f43f5e' : '#34d399' }}>
                {spillNodes.length > 0 ? `${spillNodes.length} Node(s)` : 'None (RAM)'}
              </div>
            </div>
          </div>

          <div className="verdict-fix-box">
            <div className="verdict-fix-label">
              <CheckCircle2 size={15} color="#34d399" />
              <strong>PostgreSQL DBA Action:</strong>
            </div>
            <div className="verdict-fix-text">{verdict.actionableFix}</div>
          </div>

          {culpritStmt && (
            <div className="verdict-action-buttons">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onSelectStatement(culpritStmt, 'visualizer')}
              >
                <span>Inspect Operator Tree</span>
                <ArrowRight size={13} />
              </button>
              <button
                className="btn btn-ai btn-sm"
                onClick={() => onSelectStatement(culpritStmt, 'advisor')}
              >
                <Sparkles size={13} />
                <span>PostgreSQL AI Advisor</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* PostgreSQL shared_buffers Ingestion & Eviction Risk */}
      {ple && (
        <div className="ple-risk-card glass-panel" style={{ borderLeft: `4px solid ${ple.riskLevel === 'HIGH' ? '#f43f5e' : ple.riskLevel === 'MODERATE' ? '#fbbf24' : '#34d399'}` }}>
          <div className="ple-risk-top">
            <div className="ple-risk-tag">
              <Database size={15} color="#38bdf8" />
              <span>PostgreSQL shared_buffers & Memory Footprint</span>
            </div>
            <span
              className={`badge badge-${ple.riskLevel === 'HIGH' ? 'critical' : ple.riskLevel === 'MODERATE' ? 'high' : 'success'}`}
            >
              {ple.riskLevel} Cache Impact
            </span>
          </div>

          <div className="ple-risk-main-grid">
            <div className="ple-risk-content">
              <h3 className="ple-risk-headline">{ple.headline}</h3>
              <p className="ple-risk-summary">{ple.summary}</p>

              {ple.culpritOperators && ple.culpritOperators.length > 0 && (
                <div className="ple-culprit-ops">
                  <span className="ple-ops-label">Operators Ingesting Heavy Blocks:</span>
                  <div className="ple-ops-tags">
                    {ple.culpritOperators.map((op, i) => (
                      <span key={i} className="ple-op-tag">
                        <AlertTriangle size={11} />
                        {op}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="ple-risk-side-metrics">
              <div className="ple-side-metric-item">
                <span className="ple-side-label">Buffer Ingestion Volume</span>
                <span className="ple-side-val">~{scanVolumeMb.toFixed(1)} MB</span>
                <span className="ple-side-sub">Shared hit: {totalLogicalReads.toLocaleString()} blocks (8KB)</span>
              </div>
              <div className="ple-side-metric-item">
                <span className="ple-side-label">Physical Disk Reads</span>
                <span className="ple-side-val">~{physicalMb.toFixed(1)} MB</span>
                <span className="ple-side-sub">Disk misses: {totalPhysicalReads.toLocaleString()} blocks</span>
              </div>
            </div>
          </div>

          <div className="ple-remedy-box">
            <div className="ple-remedy-label">
              <CheckCircle2 size={15} color="#34d399" />
              <strong>Buffer Pool Protection Action:</strong>
            </div>
            <div className="ple-remedy-text">{ple.mitigationAction}</div>
          </div>
        </div>
      )}

      {/* PostgreSQL Diagnostics Dashboard */}
      {diag && (
        <div className="section-block">
          <div className="diagnostics-hero-header glass-panel">
            <div className="diagnostics-header-left">
              <div className="diagnostics-badge-row">
                <ShieldAlert size={18} color="#38bdf8" />
                <span className="diagnostics-section-badge">PostgreSQL Engine Diagnostics</span>
              </div>
              <h3 className="diagnostics-headline">EXPLAIN (ANALYZE, BUFFERS) Root Cause Analysis</h3>
              <p className="diagnostics-subtext">
                Evaluates work_mem disk spills, sequential scan filter discards, cardinality estimation skews, JIT overhead, parallel worker distribution, and visibility map heap fetches.
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

          {/* Transparent 5-Pillar Weighted Score Breakdown */}
          {diag.healthBreakdown && diag.healthBreakdown.length > 0 && (
            <div
              className="glass-panel"
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                border: '1px solid var(--border-subtle)',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Weighted Rating Breakdown (100 Points Across 5 Diagnostic Pillars)
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Total: <strong style={{ color: '#e2e8f0' }}>{diag.healthScore}/100</strong> • Grade <strong style={{ color: '#38bdf8' }}>{diag.scoreGrade}</strong> (A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 45, F &lt; 45)
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
                {diag.healthBreakdown.map((p) => {
                  const pct = p.maxScore > 0 ? Math.round((p.score / p.maxScore) * 100) : 100;
                  const barColor =
                    p.status === 'critical' ? '#f43f5e' : p.status === 'warn' ? '#fbbf24' : '#34d399';
                  return (
                    <div
                      key={p.id}
                      style={{
                        background: 'rgba(15, 23, 42, 0.55)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '5px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#e2e8f0' }}>{p.name}</span>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: barColor, fontFamily: 'Consolas, monospace' }}>
                          {p.score}/{p.maxScore}
                        </span>
                      </div>
                      <div style={{ height: '5px', width: '100%', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '3px', transition: 'width 0.3s ease' }} />
                      </div>
                      <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: 1.35 }} title={p.summary}>
                        <strong style={{ color: '#64748b' }}>Weight {p.weightPct}%:</strong> {p.summary}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interactive Diagnostic Category Filter Bar */}
          <div className="diag-filter-bar">
            <div className="diag-filter-group">
              <button
                className={`diag-filter-pill ${diagCategory === 'all' ? 'active' : ''}`}
                onClick={() => setDiagCategory('all')}
              >
                <span>All Detectors</span>
                <span className="badge badge-info" style={{ fontSize: '10px', padding: '1px 5px' }}>10</span>
              </button>
              <button
                className={`diag-filter-pill ${diagCategory === 'memory' ? 'active' : ''}`}
                onClick={() => setDiagCategory('memory')}
              >
                <HardDrive size={12} />
                <span>Memory & work_mem</span>
                <span className="badge badge-info" style={{ fontSize: '10px', padding: '1px 5px' }}>3</span>
              </button>
              <button
                className={`diag-filter-pill ${diagCategory === 'indexes' ? 'active' : ''}`}
                onClick={() => setDiagCategory('indexes')}
              >
                <KeyRound size={12} />
                <span>Indexes & Scans</span>
                <span className="badge badge-info" style={{ fontSize: '10px', padding: '1px 5px' }}>4</span>
              </button>
              <button
                className={`diag-filter-pill ${diagCategory === 'engine' ? 'active' : ''}`}
                onClick={() => setDiagCategory('engine')}
              >
                <Cpu size={12} />
                <span>Engine & Workers</span>
                <span className="badge badge-info" style={{ fontSize: '10px', padding: '1px 5px' }}>3</span>
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

          {/* 10 PostgreSQL Diagnostic Cards */}
          <div className="diagnostics-cards-grid">
            {/* 1. work_mem & Disk Spill Detector */}
            {shouldRenderCard('memory', hasIssues.workMem) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <HardDrive size={16} color="#f43f5e" />
                    <span className="diag-title">work_mem & Disk Spills</span>
                  </div>
                  {spillNodes.length > 0 ? (
                    <span className="badge badge-critical">
                      {spillNodes.length} Disk Spill{spillNodes.length > 1 ? 's' : ''} Detected
                    </span>
                  ) : (
                    <span className="badge badge-success">Clean (In-Memory)</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {spillNodes.length > 0 ? (
                    <>
                      <div className="diag-metric-row">
                        <span className="diag-metric-label">Spill Details:</span>
                        <strong className="diag-metric-val" style={{ color: '#f43f5e' }}>
                          {spillNodes.map((n) => `${n.pg?.sortMethod || 'external'} (${n.pg?.sortSpaceKb || 0} KB)`).join(', ')}
                        </strong>
                      </div>
                      <div className="diag-items-list">
                        {spillNodes.slice(0, 3).map((node, i) => (
                          <div key={i} className="diag-sub-item danger-border" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                              <span className="diag-sub-tag">Node #{node.nodeId}: {node.physicalOp}</span>
                              <span className="text-dim" style={{ fontSize: '10px' }}>Space: {node.pg?.sortSpaceKb || 0} KB {node.pg?.sortSpaceType}</span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                              Operation exceeded PostgreSQL allocated <code>work_mem</code> and wrote temporary run files to storage.
                            </div>
                            <div className="diag-remedy-row" style={{ width: '100%' }}>
                              <span>Remedy:</span>
                              <code>SET work_mem = '64MB';</code>
                              <button
                                className="copy-action-btn"
                                onClick={() => handleCopy("SET work_mem = '64MB';", `workmem-${i}`)}
                              >
                                {copiedId === `workmem-${i}` ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <CheckCircle2 size={24} color="#34d399" />
                      <p>All Sort and Hash operations fitted comfortably inside allocated <code>work_mem</code>.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. Sequential Scans with High Filter Discards */}
            {shouldRenderCard('indexes', hasIssues.seqScans) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <Search size={16} color="#fbbf24" />
                    <span className="diag-title">Seq Scan Filter Loss</span>
                  </div>
                  {seqScanFilterNodes.length > 0 ? (
                    <span className="badge badge-high">
                      {seqScanFilterNodes.length} Table{seqScanFilterNodes.length > 1 ? 's' : ''} Scanned
                    </span>
                  ) : (
                    <span className="badge badge-success">Clean (Index Driven)</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {seqScanFilterNodes.length > 0 ? (
                    <>
                      <div className="diag-metric-row">
                        <span className="diag-metric-label">Max Discarded Rows:</span>
                        <strong className="diag-metric-val">
                          {Math.max(...seqScanFilterNodes.map((n) => n.pg?.rowsRemovedByFilter || 0)).toLocaleString()} Rows
                        </strong>
                      </div>
                      <div className="diag-items-list">
                        {seqScanFilterNodes.slice(0, 3).map((node, i) => (
                          <div key={i} className="diag-sub-item warning-border" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                              <span className="diag-sub-tag">{node.schema || 'public'}.{node.table}</span>
                              <span className="text-dim" style={{ fontSize: '10px' }}>
                                Removed: {(node.pg?.rowsRemovedByFilter || 0).toLocaleString()} rows
                              </span>
                            </div>
                            {node.predicate && (
                              <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                Filter: <code style={{ color: '#fbbf24' }}>{node.predicate}</code>
                              </div>
                            )}
                            <div className="diag-remedy-row" style={{ width: '100%' }}>
                              <span>Action: Add B-Tree or Partial Index with CONCURRENTLY</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <CheckCircle2 size={24} color="#34d399" />
                      <p>No Sequential Scans with excessive row discards detected.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. Cardinality Estimation Skews */}
            {shouldRenderCard('engine', hasIssues.cardinality) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <TrendingDown size={16} color="#fbbf24" />
                    <span className="diag-title">Estimation Skews (Actual vs Plan)</span>
                  </div>
                  {skewedNodes.length > 0 ? (
                    <span className="badge badge-high">{skewedNodes.length} Skewed Nodes</span>
                  ) : (
                    <span className="badge badge-success">Accurate (&lt; 3x)</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {skewedNodes.length > 0 ? (
                    <>
                      <div className="diag-items-list">
                        {skewedNodes.slice(0, 3).map((node, i) => (
                          <div key={i} className="diag-sub-item warning-border" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                              <span className="diag-sub-tag">Node #{node.nodeId} ({node.physicalOp})</span>
                              <span style={{ fontSize: '10px', color: '#fbbf24', fontWeight: 600 }}>
                                Plan: {node.estimateRows.toLocaleString()} vs Actual: {node.actualRows.toLocaleString()}
                              </span>
                            </div>
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                              Planner misestimated row volume by {node.estimateRows > 0 ? (node.actualRows / node.estimateRows).toFixed(1) : '∞'}x.
                            </div>
                            <div className="diag-remedy-row" style={{ width: '100%' }}>
                              <span>Remedy:</span>
                              <code>ANALYZE {node.schema || 'public'}.{node.table || 'table'};</code>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <CheckCircle2 size={24} color="#34d399" />
                      <p>PostgreSQL planner cardinality estimates closely matched actual runtime rows.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. Planner & JIT Settings */}
            {shouldRenderCard('engine', hasIssues.jit) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <Settings size={16} color="#38bdf8" />
                    <span className="diag-title">JIT & PostgreSQL Planner</span>
                  </div>
                  <span className={`badge ${hasJit ? 'badge-info' : 'badge-neutral'}`}>
                    {hasJit ? 'JIT Active' : 'JIT Inactive'}
                  </span>
                </div>
                <div className="diag-card-body">
                  <div className="diag-metric-row">
                    <span className="diag-metric-label">JIT Total Time:</span>
                    <strong className="diag-metric-val">
                      {firstStmtPg?.jit?.totalMs ? `${firstStmtPg.jit.totalMs.toFixed(2)} ms` : '0 ms'}
                    </strong>
                  </div>
                  {hasJit && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0' }}>
                      Functions compiled: {firstStmtPg?.jit?.functions || 0} (Generation: {(firstStmtPg?.jit?.generationMs || 0).toFixed(2)}ms, Inlining: {(firstStmtPg?.jit?.inliningMs || 0).toFixed(2)}ms, Optimization: {(firstStmtPg?.jit?.optimizationMs || 0).toFixed(2)}ms)
                    </div>
                  )}
                  {Object.keys(pgSettings).length > 0 && (
                    <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
                      <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Session Settings:</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                        {Object.entries(pgSettings).map(([k, v]) => (
                          <span key={k} style={{ fontSize: '10.5px', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                            <code>{k} = {String(v)}</code>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 5. Parallel Query Workers */}
            {shouldRenderCard('engine', hasIssues.parallelism) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <Cpu size={16} color="#818cf8" />
                    <span className="diag-title">Parallel Workers</span>
                  </div>
                  {parallelNodes.length > 0 ? (
                    <span className="badge badge-info">
                      {parallelNodes.reduce((acc, p) => acc + (p.pg?.workersLaunched || 0), 0)} Workers Active
                    </span>
                  ) : (
                    <span className="badge badge-neutral">Serial Execution</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {parallelNodes.length > 0 ? (
                    <div className="diag-items-list">
                      {parallelNodes.map((p, idx) => (
                        <div key={idx} className="diag-sub-item info-border" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                            <span className="diag-sub-tag">Node #{p.nodeId}: {p.physicalOp}</span>
                            <span style={{ fontSize: '10px', color: '#818cf8' }}>
                              Workers: {p.pg?.workersLaunched || 0} / {p.pg?.workersPlanned || 0} planned
                            </span>
                          </div>
                          {(p.pg?.workersLaunched || 0) < (p.pg?.workersPlanned || 0) && (
                            <div style={{ fontSize: '10.5px', color: '#fbbf24' }}>
                              Fewer workers launched than planned. Check <code>max_parallel_workers</code> or system load.
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="diag-clean-state">
                      <p>Executed single-threaded. Cost was below <code>parallel_setup_cost</code> or parallel query is disabled.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 6. Index Access & Heap Fetches */}
            {shouldRenderCard('indexes', hasIssues.heapFetches) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <KeyRound size={16} color="#34d399" />
                    <span className="diag-title">Index-Only Scan & Visibility</span>
                  </div>
                  {indexNodesWithHeapFetches.length > 0 ? (
                    <span className="badge badge-high">Heap Fetches High</span>
                  ) : (
                    <span className="badge badge-success">Clean (Covered)</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {indexNodesWithHeapFetches.length > 0 ? (
                    <div className="diag-items-list">
                      {indexNodesWithHeapFetches.map((node, i) => (
                        <div key={i} className="diag-sub-item warning-border" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                            <span className="diag-sub-tag">{node.physicalOp} on {node.table}</span>
                            <span style={{ fontSize: '10px', color: '#fbbf24' }}>
                              Heap Fetches: {(node.pg?.heapFetches || 0).toLocaleString()}
                            </span>
                          </div>
                          <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                            Index-Only Scan had to consult table heap because data pages were not all-visible in the visibility map.
                          </div>
                          <div className="diag-remedy-row" style={{ width: '100%' }}>
                            <span>Remedy:</span>
                            <code>VACUUM {node.schema || 'public'}.{node.table};</code>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="diag-clean-state">
                      <CheckCircle2 size={24} color="#34d399" />
                      <p>No excessive heap fetches in Index Only Scans. Visibility map is fresh.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 7. CTE & Materialization Footprint */}
            {shouldRenderCard('memory', hasIssues.materialize) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <Layers size={16} color="#c084fc" />
                    <span className="diag-title">CTE & Materialization</span>
                  </div>
                  {materializeNodes.length > 0 ? (
                    <span className="badge badge-info">{materializeNodes.length} Materialized</span>
                  ) : (
                    <span className="badge badge-success">Inlined / Zero Spool</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {materializeNodes.length > 0 ? (
                    <div className="diag-items-list">
                      {materializeNodes.map((n, i) => (
                        <div key={i} className="diag-sub-item info-border" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                            <span className="diag-sub-tag">Node #{n.nodeId}: {n.physicalOp}</span>
                            <span style={{ fontSize: '10px', color: '#c084fc' }}>Rows: {n.actualRows.toLocaleString()}</span>
                          </div>
                          <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                            Intermediate rows buffered in memory. Consider <code>WITH ... AS NOT MATERIALIZED</code> (PG 12+) if optimization fences hurt join pushdowns.
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="diag-clean-state">
                      <p>No heavy CTE or Materialize buffering detected.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 8. PostgreSQL Missing Indexes */}
            {shouldRenderCard('indexes', hasIssues.missingIndexes) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <KeyRound size={16} color="#38bdf8" />
                    <span className="diag-title">PostgreSQL Index Advisor</span>
                  </div>
                  {missingIndexes.length > 0 ? (
                    <span className="badge badge-critical">{missingIndexes.length} Suggestions</span>
                  ) : (
                    <span className="badge badge-success">Optimal</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {missingIndexes.length > 0 ? (
                    <>
                      <div className="diag-items-list">
                        {missingIndexes.slice(0, 3).map((idx, i) => (
                          <div key={i} className="diag-sub-item danger-border" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                              <span className="diag-sub-tag">{idx.schema || 'public'}.{idx.table}</span>
                              <span className="badge badge-critical" style={{ fontSize: '10px' }}>Impact: {idx.impact}%</span>
                            </div>
                            <code style={{ fontSize: '10px', color: '#38bdf8', wordBreak: 'break-all' }}>
                              {idx.suggestedDdl}
                            </code>
                          </div>
                        ))}
                      </div>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ marginTop: '8px', width: '100%' }}
                        onClick={() => onNavigateTab && onNavigateTab('indexes')}
                      >
                        <span>View All {missingIndexes.length} Index Recommendations</span>
                        <ArrowRight size={12} />
                      </button>
                    </>
                  ) : (
                    <div className="diag-clean-state">
                      <CheckCircle2 size={24} color="#34d399" />
                      <p>No high-impact missing indexes detected.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 9. Type Casts & Predicate Antipatterns */}
            {shouldRenderCard('indexes', hasIssues.typeCasts) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <Sliders size={16} color="#fbbf24" />
                    <span className="diag-title">Type Casts in Predicates</span>
                  </div>
                  {typeCastNodes.length > 0 ? (
                    <span className="badge badge-high">{typeCastNodes.length} Casts Found</span>
                  ) : (
                    <span className="badge badge-success">Clean (Sargable)</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {typeCastNodes.length > 0 ? (
                    <div className="diag-items-list">
                      {typeCastNodes.slice(0, 3).map((n, i) => (
                        <div key={i} className="diag-sub-item warning-border" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                          <span className="diag-sub-tag">Node #{n.nodeId} on {n.table}</span>
                          <code style={{ fontSize: '10px', color: '#fbbf24', wordBreak: 'break-all' }}>
                            {n.predicate || n.pg?.filter}
                          </code>
                          <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                            Type casting (e.g. <code>::text</code>) disables standard B-Tree index lookups unless an expression index exists.
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="diag-clean-state">
                      <CheckCircle2 size={24} color="#34d399" />
                      <p>No non-sargable type casts or wrapped functions detected in predicates.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 10. Triggers & UDFs */}
            {shouldRenderCard('engine', hasIssues.triggers) && (
              <div className="diag-card glass-panel">
                <div className="diag-card-header">
                  <div className="diag-icon-title">
                    <Clock size={16} color="#a855f7" />
                    <span className="diag-title">Triggers & Execution Functions</span>
                  </div>
                  {triggers.length > 0 ? (
                    <span className="badge badge-info">{triggers.length} Trigger{triggers.length > 1 ? 's' : ''}</span>
                  ) : (
                    <span className="badge badge-success">0 Triggers</span>
                  )}
                </div>
                <div className="diag-card-body">
                  {triggers.length > 0 ? (
                    <div className="diag-items-list">
                      {triggers.map((trig: any, i: number) => (
                        <div key={i} className="diag-sub-item info-border" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                            <span className="diag-sub-tag">{trig.name}</span>
                            <span style={{ fontSize: '10px', color: '#a855f7', fontWeight: 600 }}>
                              {(trig.timeMs || 0).toFixed(2)} ms ({trig.calls || 0} calls)
                            </span>
                          </div>
                          {trig.relation && (
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                              Relation: {trig.relation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="diag-clean-state">
                      <CheckCircle2 size={24} color="#34d399" />
                      <p>No triggers executed during this query statement.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top Table Buffer I/O Leaderboard */}
      {plan.hardwareMetrics?.topIoLeaders && plan.hardwareMetrics.topIoLeaders.length > 0 && (
        <div className="section-block" style={{ marginTop: '20px' }}>
          <div className="glass-panel" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={16} color="#38bdf8" />
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                  PostgreSQL Table Buffer I/O Leaderboard
                </h4>
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Sorted by total blocks touched (Shared Hit + Read)
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: '11px' }}>
                    <th style={{ padding: '8px 10px' }}>Table / Relation</th>
                    <th style={{ padding: '8px 10px' }}>Schema</th>
                    <th style={{ padding: '8px 10px' }}>Shared Hit (RAM)</th>
                    <th style={{ padding: '8px 10px' }}>Shared Read (Disk)</th>
                    <th style={{ padding: '8px 10px' }}>Total Volume</th>
                    <th style={{ padding: '8px 10px' }}>Cache Hit %</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.hardwareMetrics.topIoLeaders.map((lead, idx) => {
                    const hitBlocks = Math.max(0, lead.logicalReads - lead.physicalReads);
                    const hitPercent = lead.logicalReads > 0
                      ? Math.round((hitBlocks / lead.logicalReads) * 1000) / 10
                      : 100;
                    return (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: '#e2e8f0' }}>
                          {lead.table}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#94a3b8' }}>
                          {lead.schema || 'public'}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#34d399' }}>
                          {hitBlocks.toLocaleString()} blocks
                        </td>
                        <td style={{ padding: '8px 10px', color: lead.physicalReads > 0 ? '#fbbf24' : '#94a3b8' }}>
                          {lead.physicalReads.toLocaleString()} blocks
                        </td>
                        <td style={{ padding: '8px 10px', color: '#38bdf8', fontWeight: 600 }}>
                          {(lead.logicalReadsMb || 0).toFixed(2)} MB
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span
                            className={`badge ${hitPercent >= 90 ? 'badge-success' : hitPercent >= 70 ? 'badge-high' : 'badge-critical'}`}
                            style={{ fontSize: '10px' }}
                          >
                            {hitPercent.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
