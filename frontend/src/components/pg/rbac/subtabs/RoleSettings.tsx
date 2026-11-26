import React, { useState, useEffect } from 'react';
import { Plus, Users, X, Trash2, KeyRound, ShieldOff, RefreshCw, Check } from 'lucide-react';
import { PgRole, PgRoleParamSetting, DDLOperation } from '../../../../types/rbac';
import { GetPgRoleParamSettings } from '../../../../../wailsjs/go/main/App';

interface RoleSettingsProps {
  role: PgRole;
  allRoles: PgRole[];
  onAddOp: (op: DDLOperation) => void;
  pendingOps?: DDLOperation[];
  refreshKey?: number;
}

function qIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function qLit(val: string): string {
  return `'${val.replace(/'/g, "''")}'`;
}

function generateStrongPassword(length: number = 20): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_';
  const arr = new Uint32Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < length; i++) arr[i] = Math.floor(Math.random() * chars.length);
  }
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

export const RoleSettings: React.FC<RoleSettingsProps> = ({
  role,
  allRoles,
  onAddOp,
  pendingOps = [],
  refreshKey = 0,
}) => {
  const [settings, setSettings] = useState<PgRoleParamSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newParam, setNewParam] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDB, setNewDB] = useState('');

  const [selectedParentRole, setSelectedParentRole] = useState('');
  const [withAdminOption, setWithAdminOption] = useState(false);
  const [selectedMemberRole, setSelectedMemberRole] = useState('');

  // Password Rotation
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwCopied, setPwCopied] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // Safe Offboarding
  const [reassignTarget, setReassignTarget] = useState('postgres');
  const [includeDropOwned, setIncludeDropOwned] = useState(true);
  const [includeDropRole, setIncludeDropRole] = useState(true);

  useEffect(() => {
    setNewPassword('');
    setConfirmPassword('');
    setPwCopied(false);
    setPwError(null);
  }, [role.oid]);

  useEffect(() => {
    if (!(window as any)?.go?.main?.App?.GetPgRoleParamSettings) return;
    setLoading(true);
    GetPgRoleParamSettings(role.name)
      .then((data) => setSettings(data ?? []))
      .catch((e) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [role.name, refreshKey]);

  const handleAddParam = () => {
    if (!newParam || !newValue) return;
    onAddOp({
      type: 'ALTER_ROLE_SET',
      roleName: role.name,
      paramName: newParam,
      value: newValue,
      database: newDB || undefined,
    });
    setNewParam('');
    setNewValue('');
    setNewDB('');
  };

  const handleRoleAttrToggle = (attr: string, currentVal: boolean) => {
    onAddOp({
      type: 'ALTER_ROLE',
      roleName: role.name,
      attribute: currentVal ? `NO${attr}` : attr,
      value: '',
    });
  };

  const getEffectiveAttr = (attr: string, baseVal: boolean): { value: boolean; staged: boolean } => {
    const stagedOp = pendingOps.find(
      (o): o is Extract<DDLOperation, { type: 'ALTER_ROLE' }> =>
        o.type === 'ALTER_ROLE' &&
        o.roleName === role.name &&
        (o.attribute === attr || o.attribute === `NO${attr}`),
    );
    if (!stagedOp) {
      return { value: baseVal, staged: false };
    }
    return { value: stagedOp.attribute === attr, staged: true };
  };

  const handleGeneratePassword = () => {
    const generated = generateStrongPassword(20);
    setNewPassword(generated);
    setConfirmPassword(generated);
    setPwError(null);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(generated);
      setPwCopied(true);
      setTimeout(() => setPwCopied(false), 2500);
    }
  };

  const handleStagePassword = () => {
    if (!newPassword) {
      setPwError('Enter or generate a new password first.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.');
      return;
    }
    setPwError(null);
    onAddOp({
      type: 'RAW_SQL',
      label: `Rotate Password (${role.name})`,
      sql: `ALTER ROLE ${qIdent(role.name)} WITH PASSWORD ${qLit(newPassword)};`,
    });
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleEmergencyLockout = () => {
    onAddOp({
      type: 'RAW_SQL',
      label: `Emergency Lockout (${role.name})`,
      sql: [
        `ALTER ROLE ${qIdent(role.name)} NOLOGIN;`,
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = ${qLit(role.name)} AND pid <> pg_backend_pid();`,
      ].join('\n'),
    });
  };

  const handleSafeOffboard = () => {
    const stmts = [`REASSIGN OWNED BY ${qIdent(role.name)} TO ${qIdent(reassignTarget)};`];
    if (includeDropOwned) stmts.push(`DROP OWNED BY ${qIdent(role.name)};`);
    if (includeDropRole) stmts.push(`DROP ROLE ${qIdent(role.name)};`);
    onAddOp({
      type: 'RAW_SQL',
      label: `Safe Offboard (${role.name})`,
      sql: stmts.join('\n'),
    });
  };

  const attrRows: Array<{ label: string; attr: string; baseValue: boolean; dangerous?: boolean }> = [
    { label: 'LOGIN', attr: 'LOGIN', baseValue: role.canLogin },
    { label: 'INHERIT', attr: 'INHERIT', baseValue: role.inheritPrivs },
    { label: 'CREATEDB', attr: 'CREATEDB', baseValue: role.canCreateDB },
    { label: 'CREATEROLE', attr: 'CREATEROLE', baseValue: role.canCreateRole },
    { label: 'REPLICATION', attr: 'REPLICATION', baseValue: role.isReplication, dangerous: true },
    { label: 'BYPASSRLS', attr: 'BYPASSRLS', baseValue: role.bypassRLS, dangerous: true },
  ];

  const parentCandidates = allRoles.filter(
    (r) => r.name !== role.name && !(role.memberOf ?? []).includes(r.name),
  );
  const memberCandidates = allRoles.filter(
    (r) => r.name !== role.name && !(role.members ?? []).includes(r.name),
  );
  const reassignCandidates = allRoles.filter((r) => r.name !== role.name && !r.isPredefined);

  return (
    <div>
      {/* Role Memberships */}
      <section className="rbac-section">
        <h3 className="rbac-section-title">
          <Users size={12} /> ROLE MEMBERSHIPS
        </h3>
        <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
              Member Of (inherits privileges from these groups / pg_* roles):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {(role.memberOf ?? []).length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Not a member of any group role.</span>
              ) : (
                role.memberOf.map((parent) => (
                  <span key={parent} className="rbac-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span>{parent}</span>
                    <button
                      type="button"
                      className="rbac-icon-btn"
                      style={{ padding: 1, color: 'var(--accent-red)' }}
                      title={`Revoke ${parent} from ${role.name}`}
                      onClick={() => onAddOp({ type: 'REVOKE_ROLE', parentRole: parent, memberRole: role.name })}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={selectedParentRole}
                onChange={(e) => setSelectedParentRole(e.target.value)}
                className="rbac-select"
                style={{ minWidth: 190 }}
              >
                <option value="">Select group / pg_* role…</option>
                {parentCandidates.map((r) => (
                  <option key={r.oid} value={r.name}>{r.name}</option>
                ))}
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={withAdminOption}
                  onChange={(e) => setWithAdminOption(e.target.checked)}
                />
                <span>WITH ADMIN OPTION</span>
              </label>
              <button
                type="button"
                disabled={!selectedParentRole}
                className="rbac-btn rbac-btn-primary"
                onClick={() => {
                  if (!selectedParentRole) return;
                  onAddOp({
                    type: 'GRANT_ROLE',
                    parentRole: selectedParentRole,
                    memberRole: role.name,
                    withAdminOption,
                  });
                  setSelectedParentRole('');
                }}
              >
                <Plus size={12} /> Grant Membership
              </button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
              Members (roles belonging to {role.name}):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {(role.members ?? []).length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>No member roles.</span>
              ) : (
                role.members.map((member) => (
                  <span key={member} className="rbac-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span>{member}</span>
                    <button
                      type="button"
                      className="rbac-icon-btn"
                      style={{ padding: 1, color: 'var(--accent-red)' }}
                      title={`Remove ${member} from ${role.name}`}
                      onClick={() => onAddOp({ type: 'REVOKE_ROLE', parentRole: role.name, memberRole: member })}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={selectedMemberRole}
                onChange={(e) => setSelectedMemberRole(e.target.value)}
                className="rbac-select"
                style={{ minWidth: 190 }}
              >
                <option value="">Select role to add as member…</option>
                {memberCandidates.map((r) => (
                  <option key={r.oid} value={r.name}>{r.name}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedMemberRole}
                className="rbac-btn"
                onClick={() => {
                  if (!selectedMemberRole) return;
                  onAddOp({
                    type: 'GRANT_ROLE',
                    parentRole: role.name,
                    memberRole: selectedMemberRole,
                  });
                  setSelectedMemberRole('');
                }}
              >
                <Plus size={12} /> Add Member
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Password Rotation (Login Roles only) */}
      {role.canLogin && (
        <section className="rbac-section">
          <h3 className="rbac-section-title">
            <KeyRound size={12} /> PASSWORD ROTATION
          </h3>
          <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPwError(null);
                }}
                placeholder="New password"
                className="rbac-input"
                style={{ flex: 1, minWidth: 160 }}
              />
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPwError(null);
                }}
                placeholder="Confirm password"
                className="rbac-input"
                style={{ flex: 1, minWidth: 160 }}
              />
              <button type="button" className="rbac-btn" onClick={handleGeneratePassword}>
                {pwCopied ? <Check size={12} style={{ color: 'var(--accent-emerald)' }} /> : <RefreshCw size={12} />}
                <span>{pwCopied ? 'Generated & Copied!' : 'Generate Strong'}</span>
              </button>
              <button
                type="button"
                className="rbac-btn rbac-btn-primary"
                disabled={!newPassword}
                onClick={handleStagePassword}
              >
                Stage Password Update
              </button>
            </div>
            {pwError && <div className="rbac-empty-error-box">{pwError}</div>}
          </div>
        </section>
      )}

      {/* Role Attributes */}
      <section className="rbac-section">
        <h3 className="rbac-section-title">ROLE ATTRIBUTES</h3>
        <div className="rbac-table-wrap">
          {attrRows.map((row) => {
            const { value: effectiveVal, staged } = getEffectiveAttr(row.attr, row.baseValue);
            return (
              <div key={row.attr} className="rbac-row-item">
                <span className="rbac-mono" style={{ flex: 1, fontSize: 12.5 }}>
                  {row.label}
                  {row.dangerous && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent-amber)' }}>
                      ⚠ sensitive
                    </span>
                  )}
                  {staged && (
                    <span style={{ marginLeft: 8, fontSize: 10.5, color: 'var(--accent-cyan)', fontWeight: 700 }}>
                      (staged)
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="rbac-toggle"
                  onClick={() => handleRoleAttrToggle(row.attr, effectiveVal)}
                  style={{
                    background: effectiveVal
                      ? row.dangerous
                        ? 'var(--accent-amber)'
                        : 'var(--accent-blue)'
                      : 'var(--border-medium)',
                  }}
                >
                  <span className="rbac-toggle-knob" style={{ left: effectiveVal ? 20 : 2 }} />
                </button>
                <span style={{ fontSize: 11.5, width: 30, color: effectiveVal ? 'var(--accent-cyan)' : 'var(--text-dim)' }}>
                  {effectiveVal ? 'ON' : 'OFF'}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Connection limit */}
      <section className="rbac-section">
        <h3 className="rbac-section-title">CONNECTION LIMIT</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            key={`${role.oid}-connlimit-${refreshKey}`}
            type="number"
            defaultValue={role.connLimit === -1 ? '' : role.connLimit}
            placeholder="-1 (unlimited)"
            className="rbac-input"
            style={{ width: 160 }}
            onBlur={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) {
                onAddOp({
                  type: 'ALTER_ROLE',
                  roleName: role.name,
                  attribute: 'CONNECTION LIMIT',
                  value: val,
                });
              }
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>-1 = unlimited</span>
        </div>
      </section>

      {/* Valid Until */}
      <section className="rbac-section">
        <h3 className="rbac-section-title">VALID UNTIL</h3>
        <input
          key={`${role.oid}-validuntil-${refreshKey}`}
          type="date"
          defaultValue={role.validUntil?.split('T')[0] ?? ''}
          className="rbac-input"
          style={{ width: 180 }}
          onBlur={(e) => {
            if (e.target.value) {
              onAddOp({
                type: 'ALTER_ROLE',
                roleName: role.name,
                attribute: 'VALID UNTIL',
                value: `'${e.target.value}'`,
              });
            }
          }}
        />
      </section>

      {/* Runtime parameter overrides */}
      <section className="rbac-section">
        <h3 className="rbac-section-title">RUNTIME PARAMETER OVERRIDES (ALTER ROLE SET)</h3>
        {loading ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</p>
        ) : error ? (
          <div className="rbac-empty-error-box">{error}</div>
        ) : settings.length > 0 ? (
          <div className="rbac-table-wrap">
            <table className="rbac-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Value</th>
                  <th>Database</th>
                </tr>
              </thead>
              <tbody>
                {settings.map((s, i) => (
                  <tr key={i}>
                    <td className="rbac-mono">{s.paramName}</td>
                    <td className="rbac-mono" style={{ color: 'var(--accent-cyan)' }}>{s.value}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.database ?? 'ALL'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>No parameter overrides set.</p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          <input
            value={newParam}
            onChange={(e) => setNewParam(e.target.value)}
            placeholder="e.g. statement_timeout"
            className="rbac-input"
            style={{ flex: 1, minWidth: 160 }}
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value"
            className="rbac-input"
            style={{ width: 110 }}
          />
          <input
            value={newDB}
            onChange={(e) => setNewDB(e.target.value)}
            placeholder="db (opt)"
            className="rbac-input"
            style={{ width: 110 }}
          />
          <button
            type="button"
            onClick={handleAddParam}
            disabled={!newParam || !newValue}
            className="rbac-btn rbac-btn-primary"
          >
            <Plus size={12} /> Add
          </button>
        </div>
      </section>

      {/* Danger Zone: Emergency Lockout + Safe Offboard */}
      <section className="rbac-section">
        <h3 className="rbac-section-title" style={{ color: 'var(--accent-red)' }}>
          DANGER ZONE — LOCKOUT &amp; SAFE OFFBOARDING
        </h3>
        <div
          className="rbac-card"
          style={{
            borderColor: 'rgba(244, 63, 94, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* Emergency Lockout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>Emergency Lockout</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                Sets <code className="rbac-mono">NOLOGIN</code> and terminates active sessions for{' '}
                <code className="rbac-mono">{role.name}</code> immediately without dropping owned objects.
              </div>
            </div>
            <button
              type="button"
              disabled={role.isPredefined || role.name === 'postgres' || !role.canLogin}
              className="rbac-btn rbac-btn-danger"
              onClick={handleEmergencyLockout}
            >
              <ShieldOff size={12} /> Stage Emergency Lockout
            </button>
          </div>

          {/* Safe Offboard Wizard */}
          <div
            style={{
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>
              Safe Offboard / Reassign Ownership &amp; Drop Role
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              {role.isPredefined || role.name === 'postgres'
                ? 'System and built-in roles cannot be offboarded or dropped.'
                : 'Transfers all owned objects to another owner before revoking remaining privileges and dropping the role.'}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reassign owned objects to:</label>
              <select
                value={reassignTarget}
                onChange={(e) => setReassignTarget(e.target.value)}
                className="rbac-select"
                disabled={role.isPredefined || role.name === 'postgres'}
              >
                {reassignCandidates.map((r) => (
                  <option key={r.oid} value={r.name}>{r.name}</option>
                ))}
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={includeDropOwned}
                  onChange={(e) => setIncludeDropOwned(e.target.checked)}
                />
                <span>DROP OWNED BY</span>
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={includeDropRole}
                  onChange={(e) => setIncludeDropRole(e.target.checked)}
                />
                <span>DROP ROLE</span>
              </label>
              <div className="rbac-spacer" />
              <button
                type="button"
                disabled={role.isPredefined || role.name === 'postgres' || !reassignTarget}
                className="rbac-btn rbac-btn-danger"
                onClick={handleSafeOffboard}
              >
                <Trash2 size={12} /> Stage Safe Offboard
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
