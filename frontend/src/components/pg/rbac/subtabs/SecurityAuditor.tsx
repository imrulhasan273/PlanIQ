import React, { useState } from 'react';
import { AlertCircle, Zap } from 'lucide-react';
import { SecurityAuditFinding, SEVERITY_COLOR, DDLOperation } from '../../../../types/rbac';

interface SecurityAuditorProps {
  findings: SecurityAuditFinding[];
  onAddOp: (op: DDLOperation) => void;
}

type SeverityFilter = 'all' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';

function hasExecutableSQL(ddl: string): boolean {
  return ddl
    .split('\n')
    .some((line) => {
      const t = line.trim();
      return t.length > 0 && !t.startsWith('--');
    });
}

export const SecurityAuditor: React.FC<SecurityAuditorProps> = ({ findings, onAddOp }) => {
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [copiedDDL, setCopiedDDL] = useState<string | null>(null);
  const [stagedKey, setStagedKey] = useState<string | null>(null);

  const counts = {
    CRITICAL: findings.filter((f) => f.severity === 'CRITICAL').length,
    HIGH: findings.filter((f) => f.severity === 'HIGH').length,
    MEDIUM: findings.filter((f) => f.severity === 'MEDIUM').length,
    INFO: findings.filter((f) => f.severity === 'INFO').length,
  };

  const filtered =
    filter === 'all' ? findings : findings.filter((f) => f.severity === filter);

  const copyDDL = (ddl: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(ddl);
      setCopiedDDL(key);
      setTimeout(() => setCopiedDDL(null), 1800);
    }
  };

  const stageFix = (finding: SecurityAuditFinding) => {
    onAddOp({
      type: 'RAW_SQL',
      label: `Audit Fix: ${finding.checkName}`,
      sql: finding.fixDDL,
    });
    setStagedKey(finding.checkName);
    setTimeout(() => setStagedKey(null), 1800);
  };

  if (findings.length === 0) {
    return (
      <div className="rbac-card" style={{ textAlign: 'center', padding: 36, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <AlertCircle size={26} style={{ opacity: 0.45 }} />
        <p style={{ fontSize: 13, margin: 0 }}>Click Run Audit in the header to scan security posture.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* Summary pills */}
      <div className="rbac-sticky-controls">
        <div className="rbac-toolbar">
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Filter:</span>
          <SeverityPill label="All" count={findings.length} active={filter === 'all'} onClick={() => setFilter('all')} />
          {(['CRITICAL', 'HIGH', 'MEDIUM', 'INFO'] as const).map((sev) => (
            <SeverityPill
              key={sev}
              label={sev}
              count={counts[sev]}
              color={SEVERITY_COLOR[sev]}
              active={filter === sev}
              onClick={() => setFilter(sev)}
            />
          ))}
        </div>
      </div>

      {/* Findings */}
      <div className="rbac-scroll-body">
        {filtered.map((finding) => {
          const sevColor = SEVERITY_COLOR[finding.severity] ?? 'var(--accent-blue)';
          const actionable = Boolean(finding.fixDDL && hasExecutableSQL(finding.fixDDL));
          return (
            <div
              key={finding.checkName}
              className="rbac-finding-card"
              style={{ border: `1px solid ${sevColor}` }}
            >
              <div
                className="rbac-finding-header"
                style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-card)' }}
              >
                <span
                  className="rbac-badge"
                  style={{ border: `1px solid ${sevColor}`, color: sevColor, padding: '2px 7px', flexShrink: 0 }}
                >
                  {finding.severity}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, margin: 0, color: 'var(--text-main)' }}>
                    {finding.title}
                  </p>
                  <p style={{ fontSize: 12, margin: '4px 0 0', color: 'var(--text-muted)' }}>
                    {finding.description}
                  </p>
                </div>
              </div>

              <div className="rbac-finding-body">
                {(finding.affectedItems ?? []).length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Affected:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {finding.affectedItems.map((item) => (
                        <span key={item} className="rbac-chip">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {finding.fixDDL && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Suggested fix:
                    </div>
                    <pre
                      className="rbac-code-pre"
                      style={{
                        padding: 8,
                        borderRadius: 6,
                        background: 'var(--bg-canvas)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {finding.fixDDL}
                    </pre>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="rbac-btn"
                        onClick={() => copyDDL(finding.fixDDL, finding.checkName)}
                      >
                        {copiedDDL === finding.checkName ? '✓ Copied!' : 'Copy Fix DDL'}
                      </button>
                      {actionable && (
                        <button
                          type="button"
                          className="rbac-btn rbac-btn-primary"
                          onClick={() => stageFix(finding)}
                        >
                          <Zap size={12} />
                          {stagedKey === finding.checkName ? '✓ Staged to Live DDL' : 'Stage Fix to Live DDL'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SeverityPill: React.FC<{
  label: string;
  count: number;
  color?: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, count, color, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="rbac-pill-filter"
    style={
      active
        ? { borderColor: color ?? 'var(--accent-blue)', color: color ?? 'var(--accent-cyan)', background: 'var(--bg-card)' }
        : undefined
    }
  >
    {label} ({count})
  </button>
);
