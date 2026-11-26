import React, { useState } from 'react';
import { UserPlus, Users, User, Shield, Check } from 'lucide-react';
import { PgRole, DDLOperation } from '../../../../types/rbac';

interface CreateRoleModalProps {
  existingRoles: PgRole[];
  onCancel: () => void;
  onCreate: (ops: DDLOperation[]) => void;
}

export const CreateRoleModal: React.FC<CreateRoleModalProps> = ({
  existingRoles,
  onCancel,
  onCreate,
}) => {
  const [roleKind, setRoleKind] = useState<'login' | 'group'>('login');
  const [roleName, setRoleName] = useState('');
  const [password, setPassword] = useState('');
  const [connLimit, setConnLimit] = useState('-1');
  const [validUntil, setValidUntil] = useState('');
  const [inherit, setInherit] = useState(true);
  const [createDB, setCreateDB] = useState(false);
  const [createRole, setCreateRole] = useState(false);
  const [replication, setReplication] = useState(false);
  const [bypassRLS, setBypassRLS] = useState(false);
  const [superuser, setSuperuser] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const toggleGroup = (name: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = roleName.trim();
    if (!trimmed) {
      setError('Role name is required.');
      return;
    }
    if (existingRoles.some((r) => r.name === trimmed)) {
      setError(`Role "${trimmed}" already exists.`);
      return;
    }

    const parsedLimit = parseInt(connLimit, 10);
    const ops: DDLOperation[] = [
      {
        type: 'CREATE_ROLE',
        roleName: trimmed,
        options: {
          login: roleKind === 'login',
          superuser,
          inherit,
          createRole,
          createDB,
          replication,
          bypassRLS,
          connLimit: isNaN(parsedLimit) ? -1 : parsedLimit,
          password: roleKind === 'login' && password ? password : undefined,
          validUntil: validUntil || undefined,
        },
      },
    ];

    selectedGroups.forEach((groupName) => {
      ops.push({
        type: 'GRANT_ROLE',
        parentRole: groupName,
        memberRole: trimmed,
      });
    });

    onCreate(ops);
  };

  const availableGroups = existingRoles.filter((r) => !r.canLogin || r.isPredefined);

  return (
    <div className="rbac-modal-backdrop" onClick={onCancel}>
      <div className="rbac-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="rbac-modal-header">
          <UserPlus size={16} style={{ color: 'var(--accent-blue)' }} />
          <span>Create PostgreSQL Role / Group</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="rbac-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
            {error && <div className="rbac-empty-error-box">{error}</div>}

            {/* Kind Switcher */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={`rbac-btn ${roleKind === 'login' ? 'rbac-btn-primary' : ''}`}
                style={{ flex: 1 }}
                onClick={() => setRoleKind('login')}
              >
                <User size={13} /> Login User (LOGIN)
              </button>
              <button
                type="button"
                className={`rbac-btn ${roleKind === 'group' ? 'rbac-btn-primary' : ''}`}
                style={{ flex: 1 }}
                onClick={() => setRoleKind('group')}
              >
                <Users size={13} /> Group Role (NOLOGIN)
              </button>
            </div>

            {/* Name & Password */}
            <div style={{ display: 'grid', gridTemplateColumns: roleKind === 'login' ? '1fr 1fr' : '1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Role Name *
                </label>
                <input
                  className="rbac-input"
                  style={{ width: '100%' }}
                  placeholder={roleKind === 'login' ? 'e.g. app_service' : 'e.g. app_readonly_grp'}
                  value={roleName}
                  onChange={(e) => {
                    setRoleName(e.target.value);
                    setError(null);
                  }}
                />
              </div>

              {roleKind === 'login' && (
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>
                    Password (optional)
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="rbac-input"
                    style={{ width: '100%' }}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Connection Limit & Valid Until */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Connection Limit (-1 = unlimited)
                </label>
                <input
                  type="number"
                  className="rbac-input"
                  style={{ width: '100%' }}
                  value={connLimit}
                  onChange={(e) => setConnLimit(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Valid Until (optional)
                </label>
                <input
                  type="date"
                  className="rbac-input"
                  style={{ width: '100%' }}
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
            </div>

            {/* Privileges / Attributes */}
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                Role Attributes
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'INHERIT (inherit group privs)', checked: inherit, set: setInherit, warn: false },
                  { label: 'CREATEDB', checked: createDB, set: setCreateDB, warn: false },
                  { label: 'CREATEROLE', checked: createRole, set: setCreateRole, warn: false },
                  { label: 'REPLICATION', checked: replication, set: setReplication, warn: true },
                  { label: 'BYPASSRLS', checked: bypassRLS, set: setBypassRLS, warn: true },
                  { label: 'SUPERUSER', checked: superuser, set: setSuperuser, warn: true },
                ].map((attr) => (
                  <label
                    key={attr.label}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer', color: attr.warn ? 'var(--accent-amber)' : 'var(--text-main)' }}
                  >
                    <input
                      type="checkbox"
                      checked={attr.checked}
                      onChange={(e) => attr.set(e.target.checked)}
                    />
                    <span>{attr.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Initial Group / Predefined Role Memberships */}
            {availableGroups.length > 0 && (
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Initial Memberships (Member Of)
                </label>
                <div
                  style={{
                    maxHeight: 140,
                    overflowY: 'auto',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 6,
                    padding: 8,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    background: 'var(--bg-canvas)',
                  }}
                >
                  {availableGroups.map((g) => {
                    const active = selectedGroups.has(g.name);
                    return (
                      <button
                        key={g.oid}
                        type="button"
                        onClick={() => toggleGroup(g.name)}
                        className="rbac-pill-filter"
                        style={
                          active
                            ? { borderColor: 'var(--accent-blue)', color: 'var(--accent-cyan)', background: 'rgba(59,130,246,0.14)' }
                            : undefined
                        }
                      >
                        {active && <Check size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />}
                        <span className="rbac-mono">{g.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="rbac-modal-footer">
            <button type="button" onClick={onCancel} className="rbac-btn" style={{ flex: 1 }}>
              Cancel
            </button>
            <button type="submit" className="rbac-btn rbac-btn-primary" style={{ flex: 1 }}>
              <Shield size={13} /> Stage Create DDL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
