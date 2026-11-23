import React, { useState } from 'react';
import {
  GitFork,
  X,
  Zap,
  Layers,
  Copy,
  Check,
  Cpu,
  Database,
  ArrowRight,
  TrendingUp,
  Sliders,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { AdaptiveProcessing, AdaptiveJoinFinding, IQPFeature } from '../types/plan';

interface AdaptiveJoinsModalProps {
  isOpen: boolean;
  onClose: () => void;
  adaptive?: AdaptiveProcessing;
}

export const AdaptiveJoinsModal: React.FC<AdaptiveJoinsModalProps> = ({
  isOpen,
  onClose,
  adaptive,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const joins: AdaptiveJoinFinding[] = adaptive?.adaptiveJoins || [];
  const hasAdaptive = joins.length > 0;
  const hasBatchOnRowstore = adaptive?.batchOnRowstore || false;
  const batchOps = adaptive?.batchModeOperators || 0;
  const totalOps = adaptive?.totalOperators || 0;

  const features: IQPFeature[] = adaptive?.features || [
    {
      name: 'Adaptive Joins',
      status: hasAdaptive ? 'Active' : 'Eligible (Compat 140+)',
      detail: 'Dynamically defers choice between Nested Loops and Hash Join until runtime row count is observed.',
    },
    {
      name: 'Batch Mode on Rowstore',
      status: hasBatchOnRowstore ? 'Active' : 'Eligible (Compat 150+)',
      detail: 'Executes rowstore queries in vectorized ~900-row batches instead of row-by-row.',
    },
    {
      name: 'Memory Grant Feedback',
      status: 'Active (Engine Autotuning)',
      detail: 'Adjusts memory grants across subsequent executions to prevent TempDB spills or RAM over-allocation.',
    },
    {
      name: 'Scalar UDF Inlining',
      status: 'Eligible (Compat 150+)',
      detail: 'Inlines T-SQL scalar user-defined functions into relational expressions to avoid RBAR iteration.',
    },
  ];

  const tsqlEnableBatch = `-- Enable Batch Mode on Rowstore at Database Scoped Level (SQL 2019+ Compat 150+)
ALTER DATABASE SCOPED CONFIGURATION SET BATCH_MODE_ON_ROWSTORE = ON;

-- Or disable specifically for a troublesome query with hint:
SELECT ...
FROM dbo.LargeTable
OPTION (USE HINT('DISALLOW_BATCH_MODE'));`;

  const tsqlDisallowAdaptive = `-- Force standard join choice if Adaptive Join threshold causes instability:
SELECT ...
FROM dbo.Orders o
JOIN dbo.Customers c ON o.CustomerID = c.CustomerID
OPTION (USE HINT('DISABLE_ADAPTIVE_PLAN'));`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container glass-panel"
        style={{ maxWidth: '840px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <GitFork size={20} color="#38bdf8" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 className="modal-title" style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  Adaptive Joins & Batch Mode on Rowstore (SQL 2019/2022 IQP)
                </h3>
                <span
                  style={{
                    background: 'rgba(56, 189, 248, 0.2)',
                    color: '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  IQP Engine
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                Intelligent Query Processing inspection for Adaptive Joins, vectorized execution, and memory mechanics.
              </p>
            </div>
          </div>
          <button className="btn-close" onClick={onClose} title="Close modal">
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '0 24px 20px' }}>
          {/* IQP High Level Overview */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12) 0%, rgba(15, 23, 42, 0.8) 100%)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Cpu size={16} color="#38bdf8" />
              <strong style={{ fontSize: '13px', color: '#fff' }}>
                Intelligent Query Processing (IQP) Architecture
              </strong>
            </div>
            <p style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: '1.6', margin: 0 }}>
              {adaptive?.summary ||
                'Adaptive Joins defer the decision between Nested Loops (fast for small inputs) and Hash Match (scalable for large inputs) until the first input is scanned. In addition, Batch Mode on Rowstore allows traditional rowstore tables to benefit from CPU vectorization without requiring columnstore indexes.'}
            </p>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b' }}>Adaptive Joins</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: hasAdaptive ? '#34d399' : '#94a3b8', marginTop: '4px' }}>
                {joins.length} Operators
              </div>
            </div>
            <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b' }}>Batch Mode on Rowstore</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: hasBatchOnRowstore ? '#38bdf8' : '#94a3b8', marginTop: '4px' }}>
                {hasBatchOnRowstore ? 'Enabled / Active' : 'Not Active in Plan'}
              </div>
            </div>
            <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b' }}>Vectorized Operators</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#fbbf24', marginTop: '4px' }}>
                {batchOps} / {totalOps || 'N/A'}
              </div>
            </div>
          </div>

          {/* Adaptive Joins Breakdown */}
          {hasAdaptive && (
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', marginBottom: '10px' }}>
                Detected Adaptive Join Operators
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {joins.map((aj, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#090d16',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      padding: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '13px' }}>
                        Node #{aj.nodeId} (Stmt #{aj.statementId})
                      </span>
                      <span
                        style={{
                          background: 'rgba(52, 211, 153, 0.2)',
                          color: '#34d399',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        Runtime Decision: {aj.actualJoinType || 'Adaptive'}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '12px', marginBottom: '8px' }}>
                      <div>
                        <span style={{ color: '#64748b' }}>Inflection Threshold:</span>{' '}
                        <strong style={{ color: '#fbbf24' }}>{aj.hasThreshold ? aj.thresholdRows.toLocaleString() + ' rows' : 'Calculated'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Actual Input Rows:</span>{' '}
                        <strong style={{ color: '#f8fafc' }}>{aj.hasActualRows ? aj.actualRows.toLocaleString() : 'N/A'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Estimated Rows:</span>{' '}
                        <strong style={{ color: '#94a3b8' }}>{aj.estimateRows.toLocaleString()}</strong>
                      </div>
                    </div>

                    <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: 0, lineHeight: '1.4' }}>
                      {aj.description ||
                        `If input rows < ${aj.thresholdRows}, Nested Loops was executed; otherwise, the plan dynamically transitioned to a Hash Match join.`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* IQP Feature Status Matrix */}
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', marginBottom: '10px' }}>
              Intelligent Query Processing (IQP) Feature Matrix
            </h4>
            <div style={{ border: '1px solid #1e293b', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#090d16', borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Feature</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Technical Mechanism</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map((feat, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(30, 41, 59, 0.5)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: '#e2e8f0' }}>{feat.name}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span
                          style={{
                            background: feat.status.includes('Active')
                              ? 'rgba(52, 211, 153, 0.2)'
                              : 'rgba(56, 189, 248, 0.15)',
                            color: feat.status.includes('Active') ? '#34d399' : '#38bdf8',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                          }}
                        >
                          {feat.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: '11.5px' }}>{feat.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Database Configuration T-SQL */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={15} color="#34d399" />
              <span>T-SQL IQP Engine Controls</span>
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '12px', color: '#38bdf8' }}>Configure Batch Mode on Rowstore</strong>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 6px', fontSize: '10px' }}
                    onClick={() => handleCopy(tsqlEnableBatch, 'batch_sql')}
                  >
                    {copiedKey === 'batch_sql' ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                    <span>Copy</span>
                  </button>
                </div>
                <pre
                  style={{
                    background: '#040711',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '10.5px',
                    color: '#bae6fd',
                    overflowX: 'auto',
                    margin: 0,
                  }}
                >
                  {tsqlEnableBatch}
                </pre>
              </div>

              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '12px', color: '#34d399' }}>Disable Adaptive Joins Hint</strong>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 6px', fontSize: '10px' }}
                    onClick={() => handleCopy(tsqlDisallowAdaptive, 'adaptive_sql')}
                  >
                    {copiedKey === 'adaptive_sql' ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                    <span>Copy</span>
                  </button>
                </div>
                <pre
                  style={{
                    background: '#040711',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '10.5px',
                    color: '#a7f3d0',
                    overflowX: 'auto',
                    margin: 0,
                  }}
                >
                  {tsqlDisallowAdaptive}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
