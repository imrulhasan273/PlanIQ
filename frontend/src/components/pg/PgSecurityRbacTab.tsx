import React, { useState, useCallback } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Search,
  ChevronRight,
  User,
  Zap,
  AlertTriangle,
  Database,
} from 'lucide-react';
import {
  PgRbacOverview,
  PgRole,
  SecurityAuditFinding,
  DDLOperation,
} from '../../types/rbac';
import { RoleTree } from './rbac/RoleTree';
import { RbacWorkspace } from './rbac/RbacWorkspace';
import { LiveDDLPanel } from './rbac/LiveDDLPanel';
import { CreateRoleModal } from './rbac/modals/CreateRoleModal';
import './rbac/rbac.css';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PgSecurityRbacTabProps {
  overview: PgRbacOverview | null;
  auditFindings: SecurityAuditFinding[];
  isLoading: boolean;
  isAuditing: boolean;
  isConnected: boolean;
  allowRbacWrite?: boolean;
  activeDatabase?: string;
  error: string | null;
  pollingToggle: React.ReactNode;
  onRefresh: () => void;
  onRunAudit: () => void;
  onApplyDDL: (ddl: string) => Promise<void>;
  onOpenConnections?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const BOOLEAN_ATTR_KEYS = new Set([
  'LOGIN',
  'INHERIT',
  'CREATEDB',
  'CREATEROLE',
  'REPLICATION',
  'BYPASSRLS',
]);

function getAlterRoleAttrKey(attr: string): string {
  const upper = attr.toUpperCase();
  if (upper.startsWith('NO') && BOOLEAN_ATTR_KEYS.has(upper.slice(2))) {
    return upper.slice(2);
  }
  return upper;
}

export const PgSecurityRbacTab: React.FC<PgSecurityRbacTabProps> = ({
  overview,
  auditFindings,
  isLoading,
  isAuditing,
  isConnected,
  allowRbacWrite = false,
  activeDatabase,
  error,
  pollingToggle,
  onRefresh,
  onRunAudit,
  onApplyDDL,
  onOpenConnections,
}) => {
  const [selectedRole, setSelectedRole] = useState<PgRole | null>(null);
  const [pendingOps, setPendingOps] = useState<DDLOperation[]>([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreateRole, setShowCreateRole] = useState(false);

  const activeSelectedRole = React.useMemo(() => {
    if (!selectedRole) return null;
    return overview?.roles?.find((r) => r.oid === selectedRole.oid) ?? selectedRole;
  }, [overview?.roles, selectedRole]);

  const handleApplyDDLWithRefresh = useCallback(
    async (ddl: string) => {
      await onApplyDDL(ddl);
      setRefreshKey((k) => k + 1);
    },
    [onApplyDDL],
  );

  const handleRefreshAll = useCallback(() => {
    onRefresh();
    setRefreshKey((k) => k + 1);
  }, [onRefresh]);

  const handleExportReport = useCallback(
    (format: 'md' | 'json' | 'csv') => {
      if (!overview) return;
      const ts = new Date().toISOString();
      const dateSlug = ts.slice(0, 10);
      let content = '';
      let mime = 'text/plain;charset=utf-8';
      let ext = format;

      if (format === 'json') {
        mime = 'application/json;charset=utf-8';
        content = JSON.stringify({ generatedAt: ts, overview, auditFindings }, null, 2);
      } else if (format === 'csv') {
        mime = 'text/csv;charset=utf-8';
        const escapeCsv = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const header = ['Role', 'CanLogin', 'Superuser', 'Inherit', 'CreateRole', 'CreateDB', 'Replication', 'BypassRLS', 'ConnLimit', 'ValidUntil', 'MemberOf', 'Members'];
        const lines = (overview.roles ?? []).map((r) =>
          [
            escapeCsv(r.name),
            r.canLogin,
            r.isSuperuser,
            r.inheritPrivs,
            r.canCreateRole,
            r.canCreateDB,
            r.isReplication,
            r.bypassRLS,
            r.connLimit,
            escapeCsv(r.validUntil ?? ''),
            escapeCsv((r.memberOf ?? []).join('; ')),
            escapeCsv((r.members ?? []).join('; ')),
          ].join(','),
        );
        content = [header.join(','), ...lines].join('\n');
      } else {
        mime = 'text/markdown;charset=utf-8';
        const lines: string[] = [
          `# PostgreSQL RBAC & Security Audit Snapshot`,
          `- Generated: ${ts}`,
          `- Total Roles: ${(overview.roles ?? []).length}`,
          `- Audit Findings: ${auditFindings.length}`,
          '',
          `## Roles & Hierarchy`,
          `| Role | Login | Superuser | Inherit | BypassRLS | Member Of | Members |`,
          `|---|---|---|---|---|---|---|`,
          ...(overview.roles ?? []).map(
            (r) =>
              `| \`${r.name}\` | ${r.canLogin ? 'Yes' : 'No'} | ${r.isSuperuser ? 'Yes' : 'No'} | ${r.inheritPrivs ? 'Yes' : 'No'} | ${r.bypassRLS ? 'Yes' : 'No'} | ${(r.memberOf ?? []).join(', ') || '—'} | ${(r.members ?? []).join(', ') || '—'} |`,
          ),
          '',
          `## Security Audit Findings`,
        ];
        if (auditFindings.length === 0) {
          lines.push('_No audit findings recorded yet (click Run Audit first)._');
        } else {
          auditFindings.forEach((f) => {
            lines.push(`### [${f.severity}] ${f.title}`);
            lines.push(f.description);
            if (f.affectedItems?.length) {
              lines.push(`- Affected: ${f.affectedItems.map((x) => `\`${x}\``).join(', ')}`);
            }
            if (f.fixDDL) {
              lines.push('```sql\n' + f.fixDDL.trim() + '\n```');
            }
            lines.push('');
          });
        }
        content = lines.join('\n');
      }

      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `planiq-pg-rbac-${dateSlug}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [overview, auditFindings],
  );

  const handleSelectRole = useCallback(
    (nextRole: PgRole) => {
      if (selectedRole?.oid !== nextRole.oid) {
        setSelectedRole(nextRole);
        setPendingOps([]);
      }
    },
    [selectedRole?.oid],
  );

  const handleAddOp = useCallback((op: DDLOperation) => {
    setPendingOps((prev) => {
      if (op.type === 'ALTER_ROLE') {
        const targetKey = getAlterRoleAttrKey(op.attribute);
        const idx = prev.findIndex(
          (o) =>
            o.type === 'ALTER_ROLE' &&
            o.roleName === op.roleName &&
            getAlterRoleAttrKey(o.attribute) === targetKey,
        );
        if (idx !== -1) {
          const existing = prev[idx] as Extract<DDLOperation, { type: 'ALTER_ROLE' }>;
          if (existing.attribute === op.attribute && existing.value === op.value) {
            return prev;
          }
          if (BOOLEAN_ATTR_KEYS.has(targetKey) && op.value === '' && existing.value === '') {
            return prev.filter((_, i) => i !== idx);
          }
          return prev.map((o, i) => (i === idx ? op : o));
        }
      } else if (op.type === 'GRANT' || op.type === 'REVOKE') {
        const idx = prev.findIndex(
          (o) =>
            (o.type === 'GRANT' || o.type === 'REVOKE') &&
            o.objectType === op.objectType &&
            o.objectName === op.objectName &&
            o.privilege === op.privilege &&
            o.grantee === op.grantee,
        );
        if (idx !== -1) {
          const existing = prev[idx];
          if (existing.type === op.type) {
            return prev;
          }
          return prev.filter((_, i) => i !== idx);
        }
      } else if (op.type === 'GRANT_COLUMN' || op.type === 'REVOKE_COLUMN') {
        const idx = prev.findIndex(
          (o) =>
            (o.type === 'GRANT_COLUMN' || o.type === 'REVOKE_COLUMN') &&
            o.tableSchema === op.tableSchema &&
            o.tableName === op.tableName &&
            o.columnName === op.columnName &&
            o.privilege === op.privilege &&
            o.grantee === op.grantee,
        );
        if (idx !== -1) {
          const existing = prev[idx];
          if (existing.type === op.type) {
            return prev;
          }
          return prev.filter((_, i) => i !== idx);
        }
      }
      return [...prev, op];
    });
  }, []);

  const handleRemoveOp = useCallback((index: number) => {
    setPendingOps((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearOps = useCallback(() => {
    setPendingOps([]);
  }, []);

  // ── Stats bar ──────────────────────────────────────────────────────────────
  const stats = React.useMemo(() => {
    if (!overview?.roles) return null;
    const { roles } = overview;
    return {
      total: roles.length,
      loginRoles: roles.filter((r) => r.canLogin).length,
      superusers: roles.filter((r) => r.isSuperuser).length,
      criticalAudit: auditFindings.filter((f) => f.severity === 'CRITICAL').length,
    };
  }, [overview, auditFindings]);

  // ── Centered Empty / Loading / Error states ────────────────────────────────
  if (isLoading && !overview) {
    return (
      <div className="rbac-empty-state">
        <div className="rbac-empty-card">
          <div className="rbac-empty-icon">
            <RefreshCw size={24} className="rbac-spin" />
          </div>
          <h3 className="rbac-empty-title">Loading Security &amp; RBAC Studio</h3>
          <p className="rbac-empty-desc">
            Inspecting PostgreSQL roles, memberships, foreign data wrappers, and security posture…
          </p>
        </div>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="rbac-empty-state">
        <div className="rbac-empty-card">
          <div className="rbac-empty-icon error">
            <AlertTriangle size={24} />
          </div>
          <h3 className="rbac-empty-title">Failed to Load PostgreSQL RBAC Metadata</h3>
          <p className="rbac-empty-desc">
            The connected server returned an error while querying system security catalogs.
          </p>
          <div className="rbac-empty-error-box">{error}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button onClick={onRefresh} className="rbac-btn rbac-btn-primary">
              <RefreshCw size={13} />
              Retry
            </button>
            {onOpenConnections && (
              <button onClick={onOpenConnections} className="rbac-btn">
                <Database size={13} />
                Connections
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!isConnected && !overview) {
    return (
      <div className="rbac-empty-state">
        <div className="rbac-empty-card">
          <div className="rbac-empty-icon">
            <ShieldCheck size={26} />
          </div>
          <h3 className="rbac-empty-title">Security &amp; RBAC Studio</h3>
          <p className="rbac-empty-desc">
            Connect to a PostgreSQL server to inspect roles, privileges, Row-Level Security policies,
            FDW mappings, and run security audits.
          </p>
          {onOpenConnections && (
            <button onClick={onOpenConnections} className="rbac-btn rbac-btn-primary" style={{ marginTop: 4 }}>
              <Database size={13} />
              Go to Connections
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="rbac-empty-state">
        <div className="rbac-empty-card">
          <div className="rbac-empty-icon">
            <ShieldCheck size={26} />
          </div>
          <h3 className="rbac-empty-title">Ready to Load Security Metadata</h3>
          <p className="rbac-empty-desc">
            Click Load Roles to query pg_roles and security catalogs from the connected PostgreSQL server.
          </p>
          <button onClick={onRefresh} className="rbac-btn rbac-btn-primary" style={{ marginTop: 4 }}>
            <RefreshCw size={13} />
            Load Roles &amp; Privileges
          </button>
        </div>
      </div>
    );
  }

  // ── Main 3-panel layout ────────────────────────────────────────────────────
  return (
    <div className="rbac-root">
      {/* Header */}
      <div className="rbac-header">
        <div className="rbac-header-title">
          <ShieldCheck size={16} style={{ color: 'var(--accent-blue)' }} />
          <span>Security &amp; RBAC Studio</span>
        </div>

        {stats && (
          <div className="rbac-stats-row">
            <StatPill label="Roles" value={stats.total} />
            <StatPill label="Logins" value={stats.loginRoles} color="var(--accent-cyan)" />
            <StatPill
              label="Superusers"
              value={stats.superusers}
              color={stats.superusers > 1 ? 'var(--accent-amber)' : undefined}
            />
            {stats.criticalAudit > 0 && (
              <StatPill
                label="Critical Issues"
                value={stats.criticalAudit}
                color="var(--accent-red)"
              />
            )}
            <span
              className="rbac-stat-pill"
              style={{
                color: allowRbacWrite ? 'var(--accent-emerald)' : 'var(--accent-amber)',
                borderColor: allowRbacWrite ? 'var(--accent-emerald)' : 'var(--accent-amber)',
              }}
            >
              {allowRbacWrite ? 'RBAC Write Enabled' : 'RBAC Read-Only'}
            </span>
          </div>
        )}

        <div className="rbac-spacer" />

        <div className="rbac-search-wrap">
          <Search size={13} className="rbac-search-icon" />
          <input
            className="rbac-input with-icon"
            style={{ width: 190 }}
            placeholder="Search roles, objects…"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />
        </div>

        <button
          onClick={onRunAudit}
          disabled={isAuditing}
          className="rbac-btn rbac-btn-primary"
          style={
            auditFindings.some((f) => f.severity === 'CRITICAL')
              ? { background: 'var(--accent-red)', borderColor: 'var(--accent-red)' }
              : undefined
          }
        >
          {isAuditing ? <RefreshCw size={12} className="rbac-spin" /> : <Zap size={12} />}
          Run Audit
        </button>

        <select
          className="rbac-select"
          value=""
          title="Export RBAC & Audit Compliance Snapshot"
          onChange={(e) => {
            const fmt = e.target.value as 'md' | 'json' | 'csv' | '';
            if (fmt) handleExportReport(fmt);
          }}
        >
          <option value="" disabled>
            Export…
          </option>
          <option value="md">Export Markdown (.md)</option>
          <option value="csv">Export Roles CSV (.csv)</option>
          <option value="json">Export JSON (.json)</option>
        </select>

        {pollingToggle}

        <button onClick={handleRefreshAll} className="rbac-icon-btn" title="Refresh RBAC overview">
          <RefreshCw size={14} className={isLoading ? 'rbac-spin' : ''} />
        </button>
      </div>

      {/* 3-Panel Body */}
      <div className="rbac-body">
        <aside className="rbac-sidebar">
          <RoleTree
            roles={overview.roles ?? []}
            selectedRole={activeSelectedRole}
            onSelectRole={handleSelectRole}
            onOpenCreateRole={() => setShowCreateRole(true)}
            globalSearch={globalSearch}
          />
        </aside>

        <section className="rbac-workspace">
          {activeSelectedRole ? (
            <RbacWorkspace
              role={activeSelectedRole}
              overview={overview}
              auditFindings={auditFindings}
              activeDatabase={activeDatabase}
              onAddOp={handleAddOp}
              pendingOps={pendingOps}
              globalSearch={globalSearch}
              refreshKey={refreshKey}
            />
          ) : (
            <EmptyWorkspace />
          )}
        </section>

        <aside className="rbac-ddl-panel">
          <LiveDDLPanel
            ops={pendingOps}
            roleName={activeSelectedRole?.name}
            allowRbacWrite={allowRbacWrite}
            onRemoveOp={handleRemoveOp}
            onClearOps={handleClearOps}
            onApply={handleApplyDDLWithRefresh}
          />
        </aside>
      </div>

      {showCreateRole && (
        <CreateRoleModal
          existingRoles={overview.roles ?? []}
          onCancel={() => setShowCreateRole(false)}
          onCreate={(ops) => {
            ops.forEach(handleAddOp);
            setShowCreateRole(false);
          }}
        />
      )}
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatPill: React.FC<{ label: string; value: number; color?: string }> = ({
  label,
  value,
  color,
}) => (
  <span
    className="rbac-stat-pill"
    style={color ? { color, borderColor: color } : undefined}
  >
    {value} {label}
  </span>
);

const EmptyWorkspace: React.FC = () => (
  <div className="rbac-empty-state">
    <div className="rbac-empty-card">
      <div className="rbac-empty-icon">
        <User size={24} />
      </div>
      <h3 className="rbac-empty-title">Select a Role to Inspect</h3>
      <p className="rbac-empty-desc">
        Choose a login, group, or predefined pg_* role from the left sidebar to manage
        privileges, default ACLs, RLS policies, FDW mappings, and role parameters.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-dim)' }}>
        <ChevronRight size={13} />
        <span>Changes preview live as DDL in the right panel before execution</span>
      </div>
    </div>
  </div>
);
