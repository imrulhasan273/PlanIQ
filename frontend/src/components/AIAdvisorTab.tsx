import React, { useState } from 'react';
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
import { PlanAnalysis, StatementAnalysis, AIResponse } from '../types/plan';
import { GetAIAdvice } from '../../wailsjs/go/main/App';
import { advisor } from '../../wailsjs/go/models';
import { DiffEditor } from '@monaco-editor/react';
import { generateOfflineAdviceClient } from '../utils/sqlOptimizer';
import { DiagnosticTooltip } from './DiagnosticTooltip';

interface AIAdvisorTabProps {
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

export const AIAdvisorTab: React.FC<AIAdvisorTabProps> = ({
  plan,
  selectedStatement,
  onSelectStatement,
  aiConfig,
  onOpenSettings,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedRewrite, setCopiedRewrite] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'diff' | 'code'>('diff');
  const [sanitizeLiterals, setSanitizeLiterals] = useState<boolean>(true);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('strategy_a');
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  const handleRunAnalysis = async () => {
    setLoading(true);
    setError(null);
    setSelectedStrategyId('strategy_a');
    try {
      const req = new advisor.AIRequest({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        endpointUrl: aiConfig.endpointUrl,
        statement: selectedStatement,
        fullPlan: plan,
      });
      // Set sanitization property
      (req as any).sanitizeBeforeAI = sanitizeLiterals;

      if (
        typeof window !== 'undefined' &&
        (window as any).go?.main?.App?.GetAIAdvice &&
        aiConfig.provider !== 'offline'
      ) {
        const res = await GetAIAdvice(req);
        setResponse(res);
      } else {
        // Run high-precision deterministic DBA optimizer rule engine
        const offlineRes = generateOfflineAdviceClient(selectedStatement, plan);
        setResponse(offlineRes);
      }
    } catch (err: any) {
      console.warn('External AI provider call failed, falling back to deterministic DBA rule engine:', err);
      setError(`External AI (${aiConfig.provider.toUpperCase()}) Notice: ${err?.message || err}. Showing offline deterministic rule engine analysis below.`);
      try {
        const fallbackRes = generateOfflineAdviceClient(selectedStatement, plan);
        setResponse(fallbackRes);
      } catch {
        setError(err?.message || 'Failed to generate AI advice');
      }
    } finally {
      setLoading(false);
    }
  };

  const strategies =
    response?.strategies && response.strategies.length > 0
      ? response.strategies
      : [
          {
            id: 'strategy_a',
            title: 'Strategy A: Structured Temp Table with Clustered PK',
            description: 'Pre-allocates schema to eliminate TempDB catalog latch contention and enable Index Seeks.',
            sql: response?.recommendedRewrite || '',
            estimatedGain: 'Converts heap scan into clustered seeks',
          },
          ...(response?.alternativeRewrite
            ? [
                {
                  id: 'strategy_b',
                  title: 'Strategy B: Inlined CTE (Zero TempDB I/O)',
                  description: 'Eliminates TempDB allocations and catalog latches entirely by inlining logic.',
                  sql: response.alternativeRewrite,
                  estimatedGain: '100% TempDB allocations and I/O eliminated',
                },
              ]
            : []),
        ];

  const currentStrategy = strategies.find((s) => s.id === selectedStrategyId) || strategies[0];
  const activeSql = currentStrategy?.sql || response?.recommendedRewrite || '';

  const handleCopyRewrite = () => {
    if (activeSql) {
      navigator.clipboard.writeText(activeSql);
      setCopiedRewrite(true);
      setTimeout(() => setCopiedRewrite(false), 2000);
    }
  };

  return (
    <div className="tab-scroll-container">
      {/* Top Config & Trigger Bar */}
      <div className="advisor-header-bar glass-panel">
        <div className="advisor-stmt-select">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <label className="text-muted" style={{ fontSize: '12px' }}>Analyzing Statement:</label>
            <DiagnosticTooltip guideKey="aiAdvisor" />
          </div>
          <select
            className="stmt-dropdown"
            value={selectedStatement.statementId}
            onChange={(e) => {
              const found = plan.statements.find((s) => s.statementId === e.target.value);
              if (found) {
                onSelectStatement(found);
                setResponse(null); // reset advice for new statement
              }
            }}
          >
            {plan.statements.map((s) => (
              <option key={s.statementId} value={s.statementId}>
                #{s.statementId} [{s.statementType}] - Cost: {s.statementSubTreeCost.toFixed(2)} ({s.costPercentage.toFixed(1)}%)
              </option>
            ))}
          </select>
        </div>

        {/* Privacy Sanitizer Toggle */}
        <label
          className="sanitize-toggle-btn"
          title="Scrubs table literals, parameters, and strings before sending to LLM"
        >
          <input
            type="checkbox"
            checked={sanitizeLiterals}
            onChange={(e) => setSanitizeLiterals(e.target.checked)}
          />
          <ShieldCheck size={14} color={sanitizeLiterals ? '#34d399' : '#94a3b8'} />
          <span style={{ color: sanitizeLiterals ? '#6ee7b7' : '#94a3b8', fontSize: '11px', fontWeight: 500 }}>
            {sanitizeLiterals ? 'Privacy Masking ON' : 'Privacy Masking OFF'}
          </span>
        </label>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onOpenSettings}
          title="Configure API Keys for Gemini, OpenAI, or Local Ollama"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Bot size={13} color="#38bdf8" />
          <span>Provider: {aiConfig.provider.toUpperCase()}</span>
          <span className="badge badge-info" style={{ fontSize: '10px', padding: '1px 5px' }}>Configure</span>
        </button>

        <button
          className="btn btn-ai"
          onClick={handleRunAnalysis}
          disabled={loading}
        >
          {loading ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
          <span>{loading ? 'Analyzing Query...' : 'Run AI Advisory Analysis'}</span>
        </button>
      </div>

      {/* Offline Mode Banner with Direct Add API Key Button */}
      {aiConfig.provider === 'offline' && (
        <div
          className="offline-banner glass-panel"
          style={{
            margin: '0 0 16px 0',
            padding: '10px 16px',
            borderRadius: '8px',
            border: '1px solid rgba(192, 132, 252, 0.3)',
            background: 'rgba(192, 132, 252, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#e2e8f0' }}>
            <Sparkles size={16} color="#c084fc" style={{ flexShrink: 0 }} />
            <span>
              Currently in <strong>Offline Mode (Deterministic Rules)</strong>. Add a <strong>Google Gemini</strong>, <strong>OpenAI (GPT-4o)</strong>, or <strong>Local Ollama</strong> API key for deep multi-table reasoning and semantic query rewrites.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ai btn-sm"
            onClick={onOpenSettings}
            style={{ whiteSpace: 'nowrap' }}
          >
            <span>Add API Key</span>
          </button>
        </div>
      )}

      {/* Error Notice */}
      {error && (
        <div className="error-banner glass-panel">
          <AlertCircle size={18} color="#f43f5e" />
          <div className="error-text">
            <strong>Analysis Error:</strong> {error}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onOpenSettings}>
            Check API Keys
          </button>
        </div>
      )}

      {/* Advisory Output */}
      {response ? (
        <div className="advisor-results-layout">
          {/* Executive Summary Card */}
          <div className="advice-card glass-panel highlight-purple">
            <div className="advice-card-header">
              <Sparkles size={18} color="#c084fc" />
              <h3>Executive Diagnosis</h3>
              <span className="badge badge-info" style={{ marginLeft: 'auto' }}>
                {response.providerUsed}
              </span>
            </div>
            <p className="advice-summary-text">{response.summary}</p>
          </div>

          {/* Resource Gains & Performance Impact Matrix */}
          {response.estimatedGains && Object.keys(response.estimatedGains).length > 0 && (
            <div className="advice-card glass-panel">
              <div className="advice-card-header">
                <Zap size={18} color="#f59e0b" />
                <h3>Resource Gains & Performance Impact Matrix</h3>
              </div>
              <div className="resource-gains-grid">
                {Object.entries(response.estimatedGains).map(([key, val], idx) => {
                  let Icon = Zap;
                  const lowerKey = key.toLowerCase();
                  if (lowerKey.includes('tempdb') || lowerKey.includes('io') || lowerKey.includes('read')) Icon = Database;
                  else if (lowerKey.includes('lock') || lowerKey.includes('concurrency')) Icon = Lock;
                  else if (lowerKey.includes('grant') || lowerKey.includes('memory') || lowerKey.includes('spill')) Icon = Cpu;
                  return (
                    <div key={idx} className="gain-card">
                      <div className="gain-card-header">
                        <Icon size={12} color="#38bdf8" />
                        <span>{key}</span>
                      </div>
                      <div className="gain-card-value">{val}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Detailed Technical Optimizations / Multiple Categorized Suggestions */}
          {response.technicalSuggestions && response.technicalSuggestions.length > 0 && (
            <div className="advice-card glass-panel">
              <div className="advice-card-header">
                <Layers size={18} color="#c084fc" />
                <h3>Detailed Technical Optimizations ({response.technicalSuggestions.length} Findings)</h3>
              </div>
              <div className="technical-suggestions-list">
                {response.technicalSuggestions.map((sug, idx) => {
                  const sevClass =
                    sug.severity === 'CRITICAL'
                      ? 'badge-severity-critical'
                      : sug.severity === 'HIGH'
                      ? 'badge-severity-high'
                      : 'badge-severity-medium';
                  return (
                    <div key={idx} className="technical-suggestion-card">
                      <div className="technical-suggestion-header">
                        <div className="technical-suggestion-title-group">
                          <span className="suggestion-category-badge">{sug.category}</span>
                          <span className="technical-suggestion-title">{sug.title}</span>
                        </div>
                        <span className={sevClass}>{sug.severity}</span>
                      </div>

                      {sug.impact && (
                        <div className="suggestion-impact-callout">
                          <Zap size={13} color="#34d399" />
                          <span><strong>Expected Gain:</strong> {sug.impact}</span>
                        </div>
                      )}

                      <div className="suggestion-detail-box">
                        <div className="suggestion-detail-label">
                          <Cpu size={12} color="#94a3b8" />
                          <span>SQL Server Engine Mechanics</span>
                        </div>
                        <p style={{ whiteSpace: 'pre-line', margin: 0 }}>
                          {sug.technicalDetail}
                        </p>
                      </div>

                      {sug.actionItem && (
                        <div className="suggestion-action-item">
                          <Wrench size={14} color="#38bdf8" style={{ marginTop: '2px', flexShrink: 0 }} />
                          <div>
                            <strong style={{ color: '#38bdf8' }}>Action Item: </strong>
                            <span>{sug.actionItem}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Root Cause Analysis */}
          <div className="advice-card glass-panel">
            <div className="advice-card-header">
              <AlertCircle size={18} color="#f43f5e" />
              <h3>Root Cause Breakdown</h3>
            </div>
            <div className="advice-body-text" style={{ whiteSpace: 'pre-line' }}>
              {response.rootCause}
            </div>
          </div>

          {/* Recommended Query Rewrite with Monaco Diff Editor */}
          <div className="advice-card glass-panel">
            <div className="advice-card-header">
              <Wrench size={18} color="#38bdf8" />
              <h3>Optimized Query Rewrite</h3>

              {/* View Mode Toggle */}
              <div className="diff-view-mode-toggle" style={{ marginLeft: 'auto', marginRight: '10px' }}>
                <button
                  className={`btn-toggle-sm ${viewMode === 'diff' ? 'active' : ''}`}
                  onClick={() => setViewMode('diff')}
                  title="Side-by-side Monaco visual diff"
                >
                  <SplitSquareVertical size={13} />
                  <span>Monaco Diff</span>
                </button>
                <button
                  className={`btn-toggle-sm ${viewMode === 'code' ? 'active' : ''}`}
                  onClick={() => setViewMode('code')}
                  title="Standard code block"
                >
                  <Code2 size={13} />
                  <span>Code View</span>
                </button>
              </div>

              <button className="btn-copy-sm" onClick={handleCopyRewrite}>
                {copiedRewrite ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                <span>{copiedRewrite ? 'Copied' : 'Copy Rewritten SQL'}</span>
              </button>
            </div>

            {/* Query Tuning Strategy Badges */}
            {response.tuningStrategies && response.tuningStrategies.length > 0 && (
              <div className="tuning-strategies-bar">
                <span className="tuning-strategies-label">Query Tuning Applied:</span>
                <div className="tuning-strategies-tags">
                  {response.tuningStrategies.map((strat, idx) => (
                    <span key={idx} className="badge badge-strategy">
                      <Check size={11} color="#34d399" />
                      <span>{strat}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Dynamic Multi-Strategy Selector */}
            {strategies.length > 1 && (
              <div className="rewrite-strategy-tabs">
                {strategies.map((strat) => (
                  <button
                    key={strat.id}
                    type="button"
                    className={`strategy-tab-btn ${selectedStrategyId === strat.id ? 'active' : ''}`}
                    onClick={() => setSelectedStrategyId(strat.id)}
                  >
                    <span>{strat.title}</span>
                  </button>
                ))}
              </div>
            )}

            {currentStrategy?.description && (
              <div className="strategy-meta-banner">
                <span>{currentStrategy.description}</span>
                {currentStrategy.estimatedGain && (
                  <span className="strategy-gain-badge">
                    <Check size={11} color="#34d399" />
                    <span>{currentStrategy.estimatedGain}</span>
                  </span>
                )}
              </div>
            )}

            {/* Monaco Side-by-Side Diff Viewer */}
            {viewMode === 'diff' ? (
              <div className="monaco-diff-container">
                <div className="diff-legend-bar">
                  <span className="legend-original">Original Statement (Before)</span>
                  <span className="legend-arrow">➔</span>
                  <span className="legend-modified">
                    {currentStrategy?.title || 'Optimized Query Rewrite'} (After)
                  </span>
                </div>
                <DiffEditor
                  height="360px"
                  language="sql"
                  theme="vs-dark"
                  original={selectedStatement.statementText}
                  modified={activeSql}
                  options={{
                    readOnly: true,
                    renderSideBySide: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 12,
                    lineNumbers: 'on',
                    folding: true,
                  }}
                />
              </div>
            ) : (
              <pre className="sql-code-block">{activeSql}</pre>
            )}

            {response.rewriteExplanation && (
              <div className="rewrite-explanation" style={{ marginTop: '12px' }}>
                <div className="explanation-title">
                  <Lightbulb size={14} color="#f59e0b" />
                  <span>Why this rewrite is faster:</span>
                </div>
                <p className="text-muted" style={{ whiteSpace: 'pre-line' }}>
                  {response.rewriteExplanation}
                </p>
              </div>
            )}
          </div>

          {/* Index Recommendations */}
          {response.indexRecommendations && response.indexRecommendations.length > 0 && (
            <div className="advice-card glass-panel">
              <div className="advice-card-header">
                <CheckCircle2 size={18} color="#34d399" />
                <h3>Targeted Index Strategy</h3>
              </div>
              <div className="index-recommendations-list">
                {response.indexRecommendations.map((ddl, idx) => (
                  <pre key={idx} className="sql-code-block" style={{ marginTop: '8px' }}>
                    {ddl}
                  </pre>
                ))}
              </div>
            </div>
          )}

          {/* DBA Pre-Deployment & Verification Checklist */}
          {response.implementationChecklist && response.implementationChecklist.length > 0 && (
            <div className="advice-card glass-panel">
              <div className="advice-card-header">
                <ListChecks size={18} color="#34d399" />
                <h3>DBA Pre-Deployment & Verification Checklist</h3>
              </div>
              <div className="checklist-grid">
                {response.implementationChecklist.map((item, idx) => {
                  const isChecked = !!checkedItems[idx];
                  return (
                    <div
                      key={idx}
                      className={`checklist-item ${isChecked ? 'checked' : ''}`}
                      onClick={() => setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>{item}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Server Config & Engine Tuning Tips */}
          {response.serverConfigTips && response.serverConfigTips.length > 0 && (
            <div className="advice-card glass-panel">
              <div className="advice-card-header">
                <Lightbulb size={18} color="#fbbf24" />
                <h3>Engine & Workload Tuning Tips</h3>
              </div>
              <ul className="config-tips-list">
                {response.serverConfigTips.map((tip, idx) => (
                  <li key={idx} className="config-tip-item">
                    <ArrowRight size={14} color="#38bdf8" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="empty-advisor-state glass-panel">
          <div className="empty-advisor-icon">
            <Sparkles size={48} color="#c084fc" />
          </div>
          <h2>AI Query Optimization Advisor</h2>
          <p className="text-muted" style={{ maxWidth: '550px', margin: '8px auto 20px' }}>
            Click <strong>"Run AI Advisory Analysis"</strong> above to perform deep performance diagnostics
            on Statement #{selectedStatement.statementId} ({selectedStatement.statementType}, Cost:{' '}
            {selectedStatement.statementSubTreeCost.toFixed(2)}).
          </p>
          <div className="empty-features-grid">
            <div className="empty-feature-item">
              <AlertCircle size={16} color="#f43f5e" />
              <span>Detects Non-Sargable Clauses & Converts</span>
            </div>
            <div className="empty-feature-item">
              <Wrench size={16} color="#38bdf8" />
              <span>Monaco Side-by-Side Diff Viewer</span>
            </div>
            <div className="empty-feature-item">
              <CheckCircle2 size={16} color="#34d399" />
              <span>Consolidates Covering Indexes</span>
            </div>
            <div className="empty-feature-item">
              <ShieldCheck size={16} color="#34d399" />
              <span>Enterprise Literal Privacy Sanitizer</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
