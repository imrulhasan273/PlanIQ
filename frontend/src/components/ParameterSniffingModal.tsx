import React, { useState } from 'react';
import {
  Sliders,
  X,
  AlertTriangle,
  Copy,
  Check,
  Zap,
  Layers,
  HelpCircle,
  Sparkles,
  Database,
  ArrowRight
} from 'lucide-react';
import { ParameterSniffingFinding, SniffedParameter } from '../types/plan';

interface ParameterSniffingModalProps {
  isOpen: boolean;
  onClose: () => void;
  finding?: ParameterSniffingFinding;
  querySnippet?: string;
}

export const ParameterSniffingModal: React.FC<ParameterSniffingModalProps> = ({
  isOpen,
  onClose,
  finding,
  querySnippet,
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

  const params: SniffedParameter[] = finding?.parameters || [];
  const hasMismatch = finding?.hasMismatch || params.some((p) => p.mismatch);

  // Generate customized T-SQL remedies using real detected parameter names
  const primaryParam = params[0]?.name || '@ParameterName';
  const primaryVal = params[0]?.compiledValue || "'Active'";

  const tsqlRecompile = `-- 1. Force recompile on every execution (ideal for volatile/batch reporting)
SELECT ...
FROM dbo.YourTable
WHERE Status = ${primaryParam}
OPTION (RECOMPILE);`;

  const tsqlOptimizeFor = `-- 2. Force optimizer to compile using a representative standard value
SELECT ...
FROM dbo.YourTable
WHERE Status = ${primaryParam}
OPTION (OPTIMIZE FOR (${primaryParam} = ${primaryVal}));`;

  const tsqlOptimizeUnknown = `-- 3. Instruct optimizer to ignore specific sniffed histogram step and use average density
SELECT ...
FROM dbo.YourTable
WHERE Status = ${primaryParam}
OPTION (OPTIMIZE FOR UNKNOWN);`;

  const tsqlLocalVar = `-- 4. Local Variable Masking (forces compile-time average density without recompiles)
DECLARE @Local_${primaryParam.replace(/^@/, '')} AS INT = ${primaryParam};

SELECT ...
FROM dbo.YourTable
WHERE Status = @Local_${primaryParam.replace(/^@/, '')};`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container glass-panel"
        style={{ maxWidth: '820px', maxHeight: '90vh', overflowY: 'auto' }}
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
                background: hasMismatch ? 'rgba(244, 63, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                border: `1px solid ${hasMismatch ? 'rgba(244, 63, 94, 0.35)' : 'rgba(56, 189, 248, 0.35)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sliders size={20} color={hasMismatch ? '#f43f5e' : '#38bdf8'} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 className="modal-title" style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  Parameter Sniffing & Runtime Variable Inspector
                </h3>
                <span
                  style={{
                    background: hasMismatch ? 'rgba(244, 63, 94, 0.2)' : 'rgba(52, 211, 153, 0.2)',
                    color: hasMismatch ? '#f43f5e' : '#34d399',
                    border: `1px solid ${hasMismatch ? 'rgba(244, 63, 94, 0.4)' : 'rgba(52, 211, 153, 0.4)'}`,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {hasMismatch ? 'SKEW DETECTED' : 'PARAMETERS OK'}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                Inspect Compiled vs. Runtime Execution values from &lt;ParameterList&gt; ShowPlan XML.
              </p>
            </div>
          </div>
          <button className="btn-close" onClick={onClose} title="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Overview Box */}
        <div style={{ padding: '0 24px 16px' }}>
          <div
            style={{
              background: hasMismatch
                ? 'linear-gradient(135deg, rgba(244, 63, 94, 0.12) 0%, rgba(15, 23, 42, 0.8) 100%)'
                : 'rgba(15, 23, 42, 0.6)',
              border: `1px solid ${hasMismatch ? 'rgba(244, 63, 94, 0.35)' : 'rgba(255, 255, 255, 0.08)'}`,
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <AlertTriangle size={16} color={hasMismatch ? '#f43f5e' : '#38bdf8'} />
              <strong style={{ fontSize: '13px', color: '#fff' }}>
                {hasMismatch
                  ? 'Runtime Values Diverge From Cached Parameter Values'
                  : 'Parameter List Analysis'}
              </strong>
            </div>
            <p style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: '1.6', margin: 0 }}>
              {finding?.description ||
                'SQL Server compiles and optimizes queries based on the specific parameter values passed on the FIRST run. When subsequent executions supply values with vastly different data densities or cardinality selectivity, the cached plan can lead to catastrophic index seeks, massive key lookups, or severe tempdb spills.'}
            </p>
          </div>

          {/* Parameter Comparison Table */}
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', marginBottom: '10px' }}>
              Detected Query Parameters ({params.length})
            </h4>
            {params.length > 0 ? (
              <div style={{ border: '1px solid #1e293b', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#090d16', borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Parameter Name</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Data Type</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Compiled Value (Cached)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Runtime Value (Actual)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Variance Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {params.map((p, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid rgba(30, 41, 59, 0.5)',
                          background: p.mismatch ? 'rgba(244, 63, 94, 0.05)' : undefined,
                        }}
                      >
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#38bdf8' }}>
                          <code>{p.name}</code>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                          <code>{p.dataType || 'unknown'}</code>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#f8fafc', fontWeight: 600 }}>
                          <code>{p.compiledValue || '(null)'}</code>
                        </td>
                        <td style={{ padding: '10px 12px', color: p.mismatch ? '#f43f5e' : '#34d399', fontWeight: 600 }}>
                          <code>{p.hasRuntime ? p.runtimeValue || '(null)' : 'Not captured'}</code>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {p.mismatch ? (
                            <span
                              style={{
                                background: 'rgba(244, 63, 94, 0.2)',
                                color: '#f43f5e',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '10.5px',
                                fontWeight: 800,
                              }}
                            >
                              MISMATCH / SKEW
                            </span>
                          ) : (
                            <span
                              style={{
                                background: 'rgba(52, 211, 153, 0.2)',
                                color: '#34d399',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '10.5px',
                                fontWeight: 700,
                              }}
                            >
                              MATCHES
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '13px' }}>
                No explicit parameter declarations found in this execution plan.
              </p>
            )}
          </div>

          {/* Actionable Remedies Section */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={16} color="#34d399" />
              <span>4 Battle-Tested T-SQL Parameter Sniffing Fixes</span>
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              {/* Fix 1: RECOMPILE */}
              <div
                style={{
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '12.5px', color: '#38bdf8' }}>1. OPTION (RECOMPILE)</strong>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 6px', fontSize: '10px' }}
                    onClick={() => handleCopy(tsqlRecompile, 'recompile')}
                  >
                    {copiedKey === 'recompile' ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                    <span>{copiedKey === 'recompile' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '0 0 6px', lineHeight: '1.4' }}>
                  Eliminates plan cache reuse for this statement. Recomputes optimal execution plan per execution.
                </p>
                <pre
                  style={{
                    background: '#040711',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: '#bae6fd',
                    overflowX: 'auto',
                    margin: 0,
                  }}
                >
                  {tsqlRecompile}
                </pre>
              </div>

              {/* Fix 2: OPTIMIZE FOR UNKNOWN */}
              <div
                style={{
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '12.5px', color: '#34d399' }}>2. OPTION (OPTIMIZE FOR UNKNOWN)</strong>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 6px', fontSize: '10px' }}
                    onClick={() => handleCopy(tsqlOptimizeUnknown, 'unknown')}
                  >
                    {copiedKey === 'unknown' ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                    <span>{copiedKey === 'unknown' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '0 0 6px', lineHeight: '1.4' }}>
                  Instructs the optimizer to ignore specific parameter values and use overall density vector average.
                </p>
                <pre
                  style={{
                    background: '#040711',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: '#a7f3d0',
                    overflowX: 'auto',
                    margin: 0,
                  }}
                >
                  {tsqlOptimizeUnknown}
                </pre>
              </div>

              {/* Fix 3: OPTIMIZE FOR SPECIFIC VALUE */}
              <div
                style={{
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '12.5px', color: '#fbbf24' }}>3. OPTION (OPTIMIZE FOR (@P = Val))</strong>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 6px', fontSize: '10px' }}
                    onClick={() => handleCopy(tsqlOptimizeFor, 'opt_val')}
                  >
                    {copiedKey === 'opt_val' ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                    <span>{copiedKey === 'opt_val' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '0 0 6px', lineHeight: '1.4' }}>
                  Locks the cached plan to the most critical or frequent business value (e.g. active tenants).
                </p>
                <pre
                  style={{
                    background: '#040711',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: '#fde68a',
                    overflowX: 'auto',
                    margin: 0,
                  }}
                >
                  {tsqlOptimizeFor}
                </pre>
              </div>

              {/* Fix 4: Local Variable Assignment */}
              <div
                style={{
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '12.5px', color: '#a78bfa' }}>4. Local Variable Masking</strong>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 6px', fontSize: '10px' }}
                    onClick={() => handleCopy(tsqlLocalVar, 'local_var')}
                  >
                    {copiedKey === 'local_var' ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                    <span>{copiedKey === 'local_var' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '0 0 6px', lineHeight: '1.4' }}>
                  Assigning to a local variable prevents parameter sniffing without requiring query recompilation.
                </p>
                <pre
                  style={{
                    background: '#040711',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: '#ddd6fe',
                    overflowX: 'auto',
                    margin: 0,
                  }}
                >
                  {tsqlLocalVar}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
