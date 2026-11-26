import React, { useState } from 'react';
import {
  Grid3X3,
  Star,
  Shield,
  Link2,
  SlidersHorizontal,
  AlertTriangle,
  Terminal,
} from 'lucide-react';
import { PgRbacOverview, PgRole, SecurityAuditFinding, DDLOperation } from '../../../types/rbac';
import { PrivilegeMatrix } from './subtabs/PrivilegeMatrix';
import { DefaultPrivileges } from './subtabs/DefaultPrivileges';
import { RlsPolicies } from './subtabs/RlsPolicies';
import { FdwMappings } from './subtabs/FdwMappings';
import { RoleSettings } from './subtabs/RoleSettings';
import { SecurityAuditor } from './subtabs/SecurityAuditor';
import { ImpersonationDrawer } from './modals/ImpersonationDrawer';

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkspaceSubTab =
  | 'matrix'
  | 'default-privs'
  | 'rls'
  | 'fdw'
  | 'settings'
  | 'auditor';

interface RbacWorkspaceProps {
  role: PgRole;
  overview: PgRbacOverview;
  auditFindings: SecurityAuditFinding[];
  activeDatabase?: string;
  onAddOp: (op: DDLOperation) => void;
  pendingOps?: DDLOperation[];
  globalSearch: string;
  refreshKey?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const RbacWorkspace: React.FC<RbacWorkspaceProps> = ({
  role,
  overview,
  auditFindings,
  activeDatabase,
  onAddOp,
  pendingOps = [],
  globalSearch,
  refreshKey = 0,
}) => {
  const [subTab, setSubTab] = useState<WorkspaceSubTab>('matrix');
  const [showImpersonate, setShowImpersonate] = useState(false);

  const criticalCount = auditFindings.filter((f) => f.severity === 'CRITICAL').length;
  const highCount = auditFindings.filter((f) => f.severity === 'HIGH').length;
  const auditBadgeCount = criticalCount + highCount;

  const tabs: Array<{
    key: WorkspaceSubTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    badgeColor?: string;
  }> = [
      { key: 'matrix', label: 'Privilege Matrix', icon: <Grid3X3 size={13} /> },
      { key: 'default-privs', label: 'Default Privs', icon: <Star size={13} /> },
      { key: 'rls', label: 'RLS Policies', icon: <Shield size={13} /> },
      { key: 'fdw', label: 'FDW & Mappings', icon: <Link2 size={13} /> },
      { key: 'settings', label: 'Role Settings', icon: <SlidersHorizontal size={13} /> },
      {
        key: 'auditor',
        label: 'Security Audit',
        icon: <AlertTriangle size={13} />,
        badge: auditBadgeCount || undefined,
        badgeColor: criticalCount > 0 ? 'var(--accent-red)' : 'var(--accent-amber)',
      },
    ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Breadcrumb + Test as Role */}
      <div className="rbac-breadcrumb">
        <span>Roles</span>
        <span>/</span>
        <span className="rbac-mono" style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>
          {role.name}
        </span>
        <span>/</span>
        <span>{tabs.find((t) => t.key === subTab)?.label}</span>
        <div className="rbac-spacer" />
        <button
          type="button"
          className="rbac-btn"
          style={{ padding: '3px 10px', fontSize: 11.5 }}
          onClick={() => setShowImpersonate(true)}
          title={`Run a read-only test query impersonating ${role.name}`}
        >
          <Terminal size={12} /> Test as Role
        </button>
      </div>

      {/* Subtab bar */}
      <div className="rbac-subtab-bar">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSubTab(tab.key)}
            className={`rbac-subtab-btn ${subTab === tab.key ? 'active' : ''}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className="rbac-subtab-badge"
                style={{ background: tab.badgeColor ?? 'var(--accent-blue)' }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Subtab content */}
      <div
        className={`rbac-subtab-content ${
          subTab === 'matrix' || subTab === 'default-privs' || subTab === 'rls' || subTab === 'auditor'
            ? 'rbac-subtab-flex'
            : ''
        }`}
      >
        {subTab === 'matrix' && (
          <PrivilegeMatrix
            role={role}
            allRoles={overview.roles ?? []}
            catalog={overview.catalog}
            onAddOp={onAddOp}
            pendingOps={pendingOps}
            globalSearch={globalSearch}
            refreshKey={refreshKey}
          />
        )}
        {subTab === 'default-privs' && (
          <DefaultPrivileges role={role} onAddOp={onAddOp} refreshKey={refreshKey} />
        )}
        {subTab === 'rls' && (
          <RlsPolicies role={role} onAddOp={onAddOp} globalSearch={globalSearch} refreshKey={refreshKey} />
        )}
        {subTab === 'fdw' && (
          <FdwMappings servers={overview.servers ?? []} fdws={overview.fdws ?? []} role={role} onAddOp={onAddOp} />
        )}
        {subTab === 'settings' && (
          <RoleSettings
            role={role}
            allRoles={overview.roles ?? []}
            onAddOp={onAddOp}
            pendingOps={pendingOps}
            refreshKey={refreshKey}
          />
        )}
        {subTab === 'auditor' && (
          <SecurityAuditor findings={auditFindings} onAddOp={onAddOp} />
        )}
      </div>

      {showImpersonate && (
        <ImpersonationDrawer
          roleName={role.name}
          catalog={overview.catalog}
          activeDatabase={activeDatabase}
          onClose={() => setShowImpersonate(false)}
        />
      )}
    </div>
  );
};
