import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Users,
  User,
  BookOpen,
  AlertTriangle,
  Search,
  Lock,
  Unlock,
  UserPlus,
  GitBranch,
  Layers,
} from 'lucide-react';
import { PgRole, DANGEROUS_PG_ROLES } from '../../../types/rbac';

// ─── Props ────────────────────────────────────────────────────────────────────

interface RoleTreeProps {
  roles: PgRole[];
  selectedRole: PgRole | null;
  onSelectRole: (role: PgRole) => void;
  onOpenCreateRole: () => void;
  globalSearch: string;
}

type TreeSectionKey = 'login' | 'groups' | 'predefined' | 'hierarchy' | 'standalone' | 'standalonePg';
type ViewMode = 'grouped' | 'hierarchy';

// ─── Component ────────────────────────────────────────────────────────────────

export const RoleTree: React.FC<RoleTreeProps> = ({
  roles,
  selectedRole,
  onSelectRole,
  onOpenCreateRole,
  globalSearch,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [expanded, setExpanded] = useState<Record<TreeSectionKey, boolean>>({
    login: true,
    groups: true,
    predefined: false,
    hierarchy: true,
    standalone: true,
    standalonePg: false,
  });
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [localSearch, setLocalSearch] = useState('');

  const searchTerm = (globalSearch || localSearch).toLowerCase().trim();

  const roleByName = useMemo(() => {
    const map = new Map<string, PgRole>();
    roles.forEach((r) => map.set(r.name, r));
    return map;
  }, [roles]);

  // Helper: check if a role or any descendant matches searchTerm
  const subtreeMatches = useMemo(() => {
    if (!searchTerm) return () => true;
    const memo = new Map<string, boolean>();
    const check = (name: string, visiting: Set<string>): boolean => {
      if (memo.has(name)) return memo.get(name)!;
      if (visiting.has(name)) return false;
      visiting.add(name);
      const r = roleByName.get(name);
      if (!r) return false;
      let match = r.name.toLowerCase().includes(searchTerm);
      if (!match) {
        for (const m of r.members ?? []) {
          if (check(m, visiting)) {
            match = true;
            break;
          }
        }
      }
      visiting.delete(name);
      memo.set(name, match);
      return match;
    };
    return (name: string) => check(name, new Set());
  }, [roleByName, searchTerm]);

  const { loginRoles, groupRoles, predefinedRoles } = useMemo(() => {
    const q = searchTerm;
    const filtered = q ? roles.filter((r) => r.name.toLowerCase().includes(q)) : roles;
    return {
      loginRoles: filtered.filter((r) => r.canLogin && !r.isPredefined),
      groupRoles: filtered.filter((r) => !r.canLogin && !r.isPredefined),
      predefinedRoles: filtered.filter((r) => r.isPredefined),
    };
  }, [roles, searchTerm]);

  const { hierarchyRoots, standaloneUserRoles, standalonePgRoles } = useMemo(() => {
    // Roots = roles that have members and are not members of any other role
    let roots = roles.filter(
      (r) => (r.members ?? []).length > 0 && (r.memberOf ?? []).length === 0,
    );
    if (roots.length === 0) {
      roots = roles.filter((r) => (r.members ?? []).length > 0);
    }
    const filteredRoots = roots.filter((r) => subtreeMatches(r.name));

    const standalone = roles.filter(
      (r) => (r.members ?? []).length === 0 && (r.memberOf ?? []).length === 0,
    );
    const matchingStandalone = searchTerm
      ? standalone.filter((r) => r.name.toLowerCase().includes(searchTerm))
      : standalone;

    return {
      hierarchyRoots: filteredRoots,
      standaloneUserRoles: matchingStandalone.filter((r) => !r.isPredefined),
      standalonePgRoles: matchingStandalone.filter((r) => r.isPredefined),
    };
  }, [roles, searchTerm, subtreeMatches]);

  const toggle = (section: TreeSectionKey) =>
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));

  const isNodeExpanded = (key: string, defaultOpen: boolean) => {
    if (key in expandedNodes) return expandedNodes[key];
    return defaultOpen;
  };

  const toggleNode = (key: string, currentOpen: boolean) =>
    setExpandedNodes((prev) => ({ ...prev, [key]: !currentOpen }));

  const renderRecursiveNode = (
    role: PgRole,
    pathKey: string,
    defaultExpandChildren: boolean,
    visited: Set<string>,
    showParentHint: boolean,
  ): React.ReactNode => {
    const memberRoles = (role.members ?? [])
      .map((name) => roleByName.get(name))
      .filter((r): r is PgRole => Boolean(r))
      .filter((r) => !visited.has(r.name) && (!searchTerm || subtreeMatches(r.name)));

    const hasChildren = memberRoles.length > 0;
    const open = hasChildren && (searchTerm ? true : isNodeExpanded(pathKey, defaultExpandChildren));

    const nextVisited = new Set(visited);
    nextVisited.add(role.name);

    return (
      <div key={pathKey}>
        <RoleNode
          role={role}
          selected={selectedRole?.oid === role.oid}
          hasChildren={hasChildren}
          memberCount={(role.members ?? []).length}
          isExpanded={open}
          onToggleExpand={() => toggleNode(pathKey, open)}
          onClick={() => onSelectRole(role)}
          showParentHint={showParentHint}
        />
        {hasChildren && open && (
          <div className="rbac-tree-children">
            {memberRoles.map((child) =>
              renderRecursiveNode(
                child,
                `${pathKey}>${child.name}`,
                defaultExpandChildren,
                nextVisited,
                false,
              ),
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search, New Role & View Toggle */}
      <div className="rbac-sidebar-search" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="rbac-search-wrap">
          <Search size={12} className="rbac-search-icon" />
          <input
            className="rbac-input with-icon"
            style={{ width: '100%' }}
            placeholder="Filter roles…"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="rbac-btn rbac-btn-primary"
          style={{ width: '100%' }}
          onClick={onOpenCreateRole}
        >
          <UserPlus size={12} />
          New Role / Group
        </button>

        <div className="rbac-view-toggle" role="tablist" aria-label="Role view mode">
          <button
            type="button"
            className={`rbac-view-toggle-btn ${viewMode === 'grouped' ? 'active' : ''}`}
            onClick={() => setViewMode('grouped')}
            title="Show roles categorized by Login, Group, and Predefined"
          >
            <Layers size={11} />
            <span>Grouped</span>
          </button>
          <button
            type="button"
            className={`rbac-view-toggle-btn ${viewMode === 'hierarchy' ? 'active' : ''}`}
            onClick={() => setViewMode('hierarchy')}
            title="Show Parent → Child role inheritance tree"
          >
            <GitBranch size={11} />
            <span>Hierarchy</span>
          </button>
        </div>
      </div>

      {/* Tree Content */}
      <div className="rbac-tree-scroll">
        {viewMode === 'grouped' ? (
          <>
            <TreeSection
              label="Group Roles"
              icon={<Users size={13} />}
              count={groupRoles.length}
              expanded={expanded.groups}
              onToggle={() => toggle('groups')}
            >
              {groupRoles.map((r) =>
                renderRecursiveNode(r, `grp:${r.name}`, true, new Set(), false),
              )}
            </TreeSection>

            <TreeSection
              label="Login Roles"
              icon={<User size={13} />}
              count={loginRoles.length}
              expanded={expanded.login}
              onToggle={() => toggle('login')}
            >
              {loginRoles.map((r) =>
                renderRecursiveNode(r, `login:${r.name}`, false, new Set(), true),
              )}
            </TreeSection>

            <TreeSection
              label="Predefined (pg_*)"
              icon={<BookOpen size={13} />}
              count={predefinedRoles.length}
              expanded={expanded.predefined}
              onToggle={() => toggle('predefined')}
            >
              {predefinedRoles.map((r) =>
                renderRecursiveNode(r, `pg:${r.name}`, false, new Set(), false),
              )}
            </TreeSection>
          </>
        ) : (
          <>
            <TreeSection
              label="Inheritance Trees"
              icon={<GitBranch size={13} />}
              count={hierarchyRoots.length}
              expanded={expanded.hierarchy}
              onToggle={() => toggle('hierarchy')}
            >
              {hierarchyRoots.length === 0 ? (
                <div style={{ padding: '6px 16px', fontSize: 11.5, color: 'var(--text-dim)' }}>
                  No role memberships defined yet.
                </div>
              ) : (
                hierarchyRoots.map((r) =>
                  renderRecursiveNode(r, `hier:${r.name}`, true, new Set(), false),
                )
              )}
            </TreeSection>

            <TreeSection
              label="Standalone Users"
              icon={<User size={13} />}
              count={standaloneUserRoles.length}
              expanded={expanded.standalone}
              onToggle={() => toggle('standalone')}
            >
              {standaloneUserRoles.map((r) => (
                <RoleNode
                  key={r.oid}
                  role={r}
                  selected={selectedRole?.oid === r.oid}
                  hasChildren={false}
                  memberCount={0}
                  isExpanded={false}
                  onToggleExpand={() => {}}
                  onClick={() => onSelectRole(r)}
                  showParentHint={false}
                />
              ))}
            </TreeSection>

            <TreeSection
              label="Standalone (pg_*)"
              icon={<BookOpen size={13} />}
              count={standalonePgRoles.length}
              expanded={expanded.standalonePg}
              onToggle={() => toggle('standalonePg')}
            >
              {standalonePgRoles.map((r) => (
                <RoleNode
                  key={r.oid}
                  role={r}
                  selected={selectedRole?.oid === r.oid}
                  hasChildren={false}
                  memberCount={0}
                  isExpanded={false}
                  onToggleExpand={() => {}}
                  onClick={() => onSelectRole(r)}
                  showParentHint={false}
                />
              ))}
            </TreeSection>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="rbac-sidebar-footer">{roles.length} total roles</div>
    </div>
  );
};

// ─── Tree Section ─────────────────────────────────────────────────────────────

const TreeSection: React.FC<{
  label: string;
  icon: React.ReactNode;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ label, icon, count, expanded, onToggle, children }) => (
  <div>
    <button type="button" className="rbac-tree-section-btn" onClick={onToggle}>
      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      {icon}
      <span>{label}</span>
      <span className="rbac-tree-count">{count}</span>
    </button>
    {expanded && <div>{children}</div>}
  </div>
);

// ─── Role Node ────────────────────────────────────────────────────────────────

const RoleNode: React.FC<{
  role: PgRole;
  selected: boolean;
  hasChildren: boolean;
  memberCount: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClick: () => void;
  showParentHint: boolean;
}> = ({
  role,
  selected,
  hasChildren,
  memberCount,
  isExpanded,
  onToggleExpand,
  onClick,
  showParentHint,
}) => {
  const isDangerous = (role.memberOf ?? []).some((m) => DANGEROUS_PG_ROLES.has(m));

  const badgeColor = role.isSuperuser
    ? 'var(--accent-red)'
    : isDangerous || role.bypassRLS
    ? 'var(--accent-amber)'
    : !role.canLogin && !role.isPredefined
    ? 'var(--accent-cyan)'
    : 'var(--accent-blue)';

  return (
    <div
      className={`rbac-role-node ${selected ? 'selected' : ''}`}
      style={{ paddingLeft: 10 }}
      onClick={onClick}
    >
      {/* Expand chevron for parent roles with members */}
      <span
        style={{
          width: 14,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'var(--text-dim)',
        }}
        onClick={(e) => {
          if (hasChildren) {
            e.stopPropagation();
            onToggleExpand();
          }
        }}
        title={hasChildren ? (isExpanded ? 'Collapse members' : 'Expand members') : undefined}
      >
        {hasChildren ? (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
      </span>

      <span
        className="rbac-avatar"
        style={{
          background: 'rgba(59, 130, 246, 0.14)',
          color: badgeColor,
          border: `1px solid ${badgeColor}`,
        }}
      >
        {!role.canLogin && !role.isPredefined ? <Users size={11} /> : role.name.charAt(0).toUpperCase()}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="rbac-role-name">{role.name}</div>
        {showParentHint && (role.memberOf ?? []).length > 0 && (
          <div className="rbac-member-sub" title={`Inherits from: ${role.memberOf.join(', ')}`}>
            ↳ {role.memberOf.join(', ')}
          </div>
        )}
      </div>

      <span className="rbac-role-badges">
        {memberCount > 0 && (
          <Badge color="var(--accent-cyan)" title={`${memberCount} member(s)`}>
            {memberCount}
          </Badge>
        )}
        {role.isSuperuser && (
          <Badge color="var(--accent-red)" title="SUPERUSER">S</Badge>
        )}
        {role.bypassRLS && (
          <Badge color="var(--accent-amber)" title="BYPASSRLS">B</Badge>
        )}
        {role.canLogin ? (
          <span title="LOGIN" style={{ display: 'inline-flex', color: 'var(--text-muted)' }}>
            <Unlock size={10} />
          </span>
        ) : (
          <span title="NOLOGIN" style={{ display: 'inline-flex', color: 'var(--text-dim)', opacity: 0.5 }}>
            <Lock size={10} />
          </span>
        )}
        {isDangerous && (
          <span title="Dangerous role membership" style={{ display: 'inline-flex', color: 'var(--accent-amber)' }}>
            <AlertTriangle size={10} />
          </span>
        )}
      </span>
    </div>
  );
};

const Badge: React.FC<{ color: string; title: string; children: React.ReactNode }> = ({
  color,
  title,
  children,
}) => (
  <span
    className="rbac-badge"
    title={title}
    style={{ border: `1px solid ${color}`, color }}
  >
    {children}
  </span>
);
