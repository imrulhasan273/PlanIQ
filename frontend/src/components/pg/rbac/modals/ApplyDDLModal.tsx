import React, { useState } from 'react';
import { AlertTriangle, Shield, Check } from 'lucide-react';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ApplyDDLModalProps {
  ddl: string;
  opCount: number;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ApplyDDLModal: React.FC<ApplyDDLModalProps> = ({
  ddl,
  opCount,
  onCancel,
  onConfirm,
}) => {
  const [checks, setChecks] = useState({
    reviewed: false,
    testedDev: false,
    understood: false,
  });
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = checks.reviewed && checks.testedDev && checks.understood;

  const toggleCheck = (key: keyof typeof checks) =>
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleConfirm = async () => {
    if (!allChecked) return;
    setApplying(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setApplying(false);
    }
  };

  return (
    <div className="rbac-modal-backdrop" onClick={onCancel}>
      <div className="rbac-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="rbac-modal-header">
          <AlertTriangle size={16} style={{ color: 'var(--accent-amber)' }} />
          <span>Apply DDL to Server</span>
        </div>

        {/* Body */}
        <div className="rbac-modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            This will execute{' '}
            <strong style={{ color: 'var(--text-main)' }}>
              {opCount} statement{opCount !== 1 ? 's' : ''}
            </strong>{' '}
            inside a single transaction on the connected server.
          </p>

          <div className="rbac-card" style={{ maxHeight: 120, overflowY: 'auto', padding: 10 }}>
            <pre className="rbac-code-pre" style={{ color: 'var(--text-muted)' }}>
              {ddl.split('\n').slice(0, 8).join('\n')}
              {ddl.split('\n').length > 8 && '\n…'}
            </pre>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { key: 'reviewed' as const, label: 'I have reviewed the generated DDL above' },
              { key: 'testedDev' as const, label: 'I have tested this change in a dev environment' },
              { key: 'understood' as const, label: 'I understand GRANT/REVOKE changes are immediate' },
            ].map(({ key, label }) => (
              <label
                key={key}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
                onClick={() => toggleCheck(key)}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: `1px solid ${checks[key] ? 'var(--accent-blue)' : 'var(--border-medium)'}`,
                    background: checks[key] ? 'var(--accent-blue)' : 'transparent',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {checks[key] && <Check size={10} color="#fff" />}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
              </label>
            ))}
          </div>

          {error && <div className="rbac-empty-error-box">{error}</div>}
        </div>

        {/* Footer */}
        <div className="rbac-modal-footer">
          <button type="button" onClick={onCancel} className="rbac-btn" style={{ flex: 1 }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!allChecked || applying}
            className="rbac-btn rbac-btn-primary"
            style={{ flex: 1 }}
          >
            <Shield size={13} />
            {applying ? 'Applying…' : 'Confirm & Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};
