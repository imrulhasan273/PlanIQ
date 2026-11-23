import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Bot,
  Copy,
  Check,
  AlertCircle,
  Lightbulb,
  CheckCircle2,
  Wrench,
  Loader2,
  ArrowRight,
  ShieldCheck,
  SplitSquareVertical,
  Code2,
  Zap,
  Database,
  Lock,
  Cpu,
  Layers,
  ListChecks,
} from 'lucide-react';
import { PlanAnalysis, StatementAnalysis, AIResponse, PlanNode } from '../../types/plan';
import { DiffEditor } from '@monaco-editor/react';

interface PgAIAdvisorTabProps {
  plan: PlanAnalysis;
  selectedStatement: StatementAnalysis;
  onSelectStatement: (stmt: StatementAnalysis) => void;
  aiConfig: {
    provider: 'offline' | 'gemini' | 'openai' | 'ollama';
    apiKey: string;
    model: string;
    endpointUrl: string;
  };
  onOpenSettings: () => void;
}

export const PgAIAdvisorTab: React.FC<PgAIAdvisorTabProps> = ({
  plan,
  selectedStatement,
  onSelectStatement,
  aiConfig,
  onOpenSettings,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [copiedRewrite, setCopiedRewrite] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'diff' | 'code'>('diff');
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('strategy_a');
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  const firstStmtPg = selectedStatement.pg || plan.statements[0]?.pg;
  const originalSql = selectedStatement.statementText || plan.statements[0]?.statementText || 'SELECT * FROM table;';

  // Find bottlenecks in selected statement
  const stmtNodes: PlanNode[] = [];
  const walk = (n?: PlanNode) => {
    if (!n) return;
    stmtNodes.push(n);
    if (n.children) n.children.forEach(walk);
  };
  walk(selectedStatement.rootNode);

  const hasSpill = stmtNodes.some(
    (n) =>
      (n.pg?.sortSpaceType || '').toLowerCase().includes('disk') ||
      (n.pg?.hashBatches || 0) > 1 ||
      (n.pg?.buffers?.tempRead || 0) > 0
  );

  const seqScans = stmtNodes.filter((n) => n.physicalOp.toLowerCase().includes('seq scan'));
  const hasSeqScan = seqScans.length > 0;

  // Generate deterministic PostgreSQL rewrite strategies
  const strategyA_sql = useMemo(() => {
    let sql = originalSql.trim();
    // Add work_mem session setting if spill detected
    if (hasSpill) {
      return `-- Step 1: Allocate sufficient work_mem for sort/hash in this transaction block\nBEGIN;\nSET LOCAL work_mem = '64MB';\n\n${sql}\n\nCOMMIT;`;
    }
    // Optimize CTE or query structure
    return `-- PostgreSQL Optimized Execution\n${sql}`;
  }, [originalSql, hasSpill]);

  const strategyB_sql = useMemo(() => {
    let sql = originalSql.trim();
    return `-- Strategy B: Force Index Usage and Lower Random Page Cost for NVMe/SSD\nBEGIN;\nSET LOCAL random_page_cost = 1.1;\nSET LOCAL effective_cache_size = '12GB';\n\n${sql}\n\nCOMMIT;`;
  }, [originalSql]);

  const strategyC_sql = useMemo(() => {
    // Clean type casts like (status)::text = 'COMPLETED'::text
    let sql = originalSql.replace(/\(([a-zA-Z0-9_]+)\)::text\s*=\s*'([^']+)'::text/g, "$1 = '$2'");
    return `-- Strategy C: Clean Sargable Predicates & Type Casts\n${sql}`;
  }, [originalSql]);

  const strategies = [
    {
      id: 'strategy_a',
      title: 'Strategy A: Transaction-Scoped work_mem Allocation',
      description: 'Increases work_mem within a local transaction block to eliminate disk file spills without bloating global server memory.',
      sql: strategyA_sql,
      estimatedGain: hasSpill ? 'Eliminates 100% of temporary disk run-files and I/O latency' : 'Optimal memory sizing',
    },
    {
      id: 'strategy_b',
      title: 'Strategy B: Planner Cost Adjustments (random_page_cost)',
      description: 'Adjusts random_page_cost to 1.1 (SSD standard) to encourage index-driven plans over sequential scans.',
      sql: strategyB_sql,
      estimatedGain: 'Converts sequential scans to indexed path lookups',
    },
    {
      id: 'strategy_c',
      title: 'Strategy C: Sargable Predicate Cleanup',
      description: 'Removes redundant explicit type casting on columns so B-Tree indexes can be directly used.',
      sql: strategyC_sql,
      estimatedGain: 'Enables index seek without expression index requirement',
    },
  ];

  const currentStrategy = strategies.find((s) => s.id === selectedStrategyId) || strategies[0];
  const activeSql = currentStrategy.sql;

  const handleCopyRewrite = () => {
    navigator.clipboard.writeText(activeSql);
    setCopiedRewrite(true);
    setTimeout(() => setCopiedRewrite(false), 2000);
  };

  const checklistItems = [
    'Always use CREATE INDEX CONCURRENTLY when applying supporting indexes in production.',
    'Run ANALYZE schema.table on target relations to update planner statistics and eliminate cardinality skews.',
    'Test query performance using EXPLAIN (ANALYZE, BUFFERS) before and after changes.',
    'Set work_mem locally via SET LOCAL work_mem rather than globally in postgresql.conf to avoid OOM killer risk under high concurrency.',
    'Verify autovacuum is keeping table bloat low and visibility maps up to date for Index-Only Scans.',
  ];

  const toggleCheck = (idx: number) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="tab-scroll-container">
      {/* Top Banner */}
      <div className="verdict-hero-card glass-panel" style={{ borderLeft: '4px solid #c084fc' }}>
        <div className="verdict-top-row">
          <div className="verdict-title-tag">
            <Sparkles size={16} color="#c084fc" />
            <span>PostgreSQL AI Performance Doctor</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span className="badge badge-info" style={{ fontSize: '10px' }}>
              Provider: {aiConfig.provider.toUpperCase()}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={onOpenSettings} style={{ fontSize: '11px', padding: '2px 8px' }}>
              Configure AI
            </button>
          </div>
        </div>

        <h3 style={{ margin: '8px 0 4px 0', fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
          Automated PostgreSQL Query Rewrites & work_mem Tuning
        </h3>
        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
          Analyzes PostgreSQL execution bottlenecks (disk spills, sequential scans, non-sargable casts) and produces idiomatic PostgreSQL rewrites and transaction-scoped tuning strategies.
        </p>

        {/* Strategy Selector Pills */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
          {strategies.map((strat) => (
            <button
              key={strat.id}
              className={`btn-sm ${selectedStrategyId === strat.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '11px' }}
              onClick={() => setSelectedStrategyId(strat.id)}
            >
              <span>{strat.title.split(':')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Strategy Details Box */}
      <div className="section-block" style={{ marginTop: '16px' }}>
        <div className="glass-panel" style={{ padding: '14px', borderLeft: '3px solid #38bdf8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
              {currentStrategy.title}
            </h4>
            <span className="badge badge-success" style={{ fontSize: '10px' }}>
              Gain: {currentStrategy.estimatedGain}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1' }}>
            {currentStrategy.description}
          </p>
        </div>
      </div>

      {/* Editor Block (Monaco Diff / Code) */}
      <div className="section-block" style={{ marginTop: '16px' }}>
        <div className="glass-panel" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Code2 size={16} color="#38bdf8" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                {viewMode === 'diff' ? 'Side-by-Side SQL Comparison (Before vs After)' : 'Optimized PostgreSQL SQL'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className={`btn-sm ${viewMode === 'diff' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '10.5px' }}
                onClick={() => setViewMode('diff')}
              >
                Diff View
              </button>
              <button
                className={`btn-sm ${viewMode === 'code' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '10.5px' }}
                onClick={() => setViewMode('code')}
              >
                Code View
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleCopyRewrite}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
              >
                {copiedRewrite ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                <span>{copiedRewrite ? 'Copied' : 'Copy SQL'}</span>
              </button>
            </div>
          </div>

          <div style={{ height: '320px', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
            {viewMode === 'diff' ? (
              <DiffEditor
                height="100%"
                original={originalSql}
                modified={activeSql}
                language="sql"
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 12,
                }}
              />
            ) : (
              <pre
                style={{
                  height: '100%',
                  margin: 0,
                  padding: '12px',
                  background: '#1e1e1e',
                  color: '#38bdf8',
                  fontSize: '12px',
                  overflow: 'auto',
                  fontFamily: 'monospace',
                }}
              >
                {activeSql}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* PostgreSQL DBA Implementation Checklist */}
      <div className="section-block" style={{ marginTop: '20px' }}>
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <ListChecks size={16} color="#34d399" />
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
              PostgreSQL Tuning & Safe Deployment Checklist
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {checklistItems.map((item, idx) => (
              <div
                key={idx}
                onClick={() => toggleCheck(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: checkedItems[idx] ? 'rgba(52, 211, 153, 0.1)' : 'rgba(15, 23, 42, 0.4)',
                  border: `1px solid ${checkedItems[idx] ? 'rgba(52, 211, 153, 0.3)' : 'rgba(255, 255, 255, 0.05)'}`,
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: checkedItems[idx] ? '#94a3b8' : '#e2e8f0',
                  textDecoration: checkedItems[idx] ? 'line-through' : 'none',
                }}
              >
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px',
                    border: `1px solid ${checkedItems[idx] ? '#34d399' : '#94a3b8'}`,
                    background: checkedItems[idx] ? '#34d399' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {checkedItems[idx] && <Check size={12} color="#0f172a" />}
                </div>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
