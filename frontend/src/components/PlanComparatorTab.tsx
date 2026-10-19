import React, { useState } from 'react';
import {
  GitCompare,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Layers,
  Upload,
  FileCode2,
  Sparkles
} from 'lucide-react';
import { PlanComparison } from '../types/plan';
import { ComparePlans } from '../../wailsjs/go/main/App';
import { parseShowPlanXMLClient, comparePlansClient } from '../utils/clientPlanParser';

export const PlanComparatorTab: React.FC = () => {
  const [comparison, setComparison] = useState<PlanComparison | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [xmlA, setXmlA] = useState<string>('');
  const [xmlB, setXmlB] = useState<string>('');
  const [nameA, setNameA] = useState<string>('Plan A (Before Index)');
  const [nameB, setNameB] = useState<string>('Plan B (After Index)');

  const handleRunSampleComparison = async () => {
    setLoading(true);
    try {
      // Calls ComparePlans in App.js which will return sample comparison
      const res = await ComparePlans(xmlA || '<sampleA/>', xmlB || '<sampleB/>', nameA, nameB);
      setComparison(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!xmlA.trim() || !xmlB.trim()) return;
    setLoading(true);
    try {
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.ComparePlans) {
        const res = await ComparePlans(xmlA, xmlB, nameA, nameB);
        setComparison(res);
      } else {
        const pA = parseShowPlanXMLClient(xmlA, nameA);
        const pB = parseShowPlanXMLClient(xmlB, nameB);
        const res = comparePlansClient(pA, pB);
        setComparison(res);
      }
    } catch (err: any) {
      alert('Failed to compare plans: ' + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-scroll-container">
      {/* Comparator Hero Top Bar */}
      <div className="comparator-header-bar glass-panel">
        <div>
          <div className="section-title-row">
            <GitCompare size={18} color="#38bdf8" />
            <h2 className="section-title">Execution Plan Comparator ("Before vs After")</h2>
            <span className="badge badge-info">A / B Benchmark</span>
          </div>
          <p className="text-muted" style={{ fontSize: '12px', marginTop: '4px' }}>
            Compare two execution plans side-by-side to verify query rewrites, index additions, and cost reductions.
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleRunSampleComparison}
          disabled={loading}
        >
          <FileCode2 size={15} />
          <span>Load Sample Comparison (Before vs After)</span>
        </button>
      </div>

      {/* Comparison Results Card */}
      {comparison ? (
        <div className="comparator-results-wrap">
          {/* Executive Improvement Hero Banner */}
          <div className="comparison-hero-card glass-panel">
            <div className="comp-hero-left">
              <span className="badge badge-success" style={{ fontSize: '12px' }}>
                {comparison.isImprovement ? '🚀 Massive Performance Improvement' : '⚠️ Cost Increased'}
              </span>
              <div className="comp-percent-value">
                {comparison.costReductionPercent > 0
                  ? `-${comparison.costReductionPercent.toFixed(1)}%`
                  : `+${Math.abs(comparison.costReductionPercent).toFixed(1)}%`}
              </div>
              <div className="comp-cost-transition">
                <span>Subtree Cost: </span>
                <strong className="cost-before">{comparison.costBefore.toFixed(2)}</strong>
                <ArrowRight size={14} color="#94a3b8" />
                <strong className="cost-after">{comparison.costAfter.toFixed(2)}</strong>
              </div>
            </div>

            <div className="comp-hero-right">
              <div className="comp-stat-box">
                <span className="comp-stat-lbl">Missing Indexes Resolved</span>
                <span className="comp-stat-val">
                  {comparison.resolvedIndexesCount} of {comparison.missingIndexesBefore} Fixed
                </span>
              </div>
              <div className="comp-summary-p">{comparison.summaryVerdict}</div>
            </div>
          </div>

          {/* Statement by Statement Diff Breakdown */}
          <div className="section-block">
            <div className="section-title-row">
              <Layers size={18} color="#38bdf8" />
              <h3 className="section-title">Statement Cost Diff Table</h3>
            </div>

            <div className="glass-panel table-wrapper">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>Stmt #</th>
                    <th>Query Preview</th>
                    <th style={{ width: '130px' }}>Plan A Cost</th>
                    <th style={{ width: '130px' }}>Plan B Cost</th>
                    <th style={{ width: '150px' }}>Cost Reduction</th>
                    <th style={{ width: '120px', textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.statementsDiff.map((diff, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className="stmt-id-badge">#{diff.statementId}</span>
                      </td>
                      <td>
                        <div className="stmt-text-cell" title={diff.querySnippet}>
                          {diff.querySnippet}
                        </div>
                      </td>
                      <td className="text-muted">
                        <strong>{diff.costA.toFixed(2)}</strong>
                      </td>
                      <td style={{ color: diff.hasImprovement ? '#34d399' : '#f43f5e' }}>
                        <strong>{diff.costB.toFixed(2)}</strong>
                      </td>
                      <td>
                        <div className="diff-badge-wrap">
                          <span className={`badge ${diff.hasImprovement ? 'badge-success' : 'badge-critical'}`}>
                            {diff.costDiffPct > 0 ? `-${diff.costDiffPct.toFixed(1)}%` : `+${Math.abs(diff.costDiffPct).toFixed(1)}%`}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {diff.hasImprovement ? (
                          <span className="badge badge-success" style={{ gap: '3px' }}>
                            <CheckCircle2 size={11} /> Faster
                          </span>
                        ) : (
                          <span className="badge badge-critical" style={{ gap: '3px' }}>
                            <AlertTriangle size={11} /> Slower
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Empty / Input Form to Compare Custom Plans */
        <div className="comparator-input-layout">
          <form onSubmit={handleCustomCompare} className="comparator-form glass-panel">
            <div className="comp-inputs-grid">
              {/* Plan A (Baseline) */}
              <div className="comp-plan-input-col">
                <div className="comp-col-header">
                  <span className="badge badge-critical">Plan A (Slow / Baseline)</span>
                  <input
                    type="text"
                    className="form-input"
                    value={nameA}
                    onChange={(e) => setNameA(e.target.value)}
                    placeholder="Plan A Name"
                    style={{ marginTop: '6px' }}
                  />
                </div>
                <textarea
                  className="form-textarea"
                  rows={10}
                  placeholder="Paste Plan A ShowPlan XML..."
                  value={xmlA}
                  onChange={(e) => setXmlA(e.target.value)}
                />
              </div>

              {/* Plan B (Optimized) */}
              <div className="comp-plan-input-col">
                <div className="comp-col-header">
                  <span className="badge badge-success">Plan B (Optimized / After Fix)</span>
                  <input
                    type="text"
                    className="form-input"
                    value={nameB}
                    onChange={(e) => setNameB(e.target.value)}
                    placeholder="Plan B Name"
                    style={{ marginTop: '6px' }}
                  />
                </div>
                <textarea
                  className="form-textarea"
                  rows={10}
                  placeholder="Paste Plan B ShowPlan XML..."
                  value={xmlB}
                  onChange={(e) => setXmlB(e.target.value)}
                />
              </div>
            </div>

            <div className="comparator-submit-bar">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!xmlA.trim() || !xmlB.trim() || loading}
              >
                <GitCompare size={15} />
                <span>Compare Plans Now</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
