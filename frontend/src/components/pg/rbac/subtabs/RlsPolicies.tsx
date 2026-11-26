import React, { useState, useEffect, useMemo } from 'react';
import { Trash2, Shield, AlertCircle, ToggleLeft, ToggleRight, Plus } from 'lucide-react';
import { PgRole, PgRLSPolicy, PgRLSTableStatus, DDLOperation } from '../../../../types/rbac';
import { GetPgRLSPolicies, GetPgRLSTableStatuses } from '../../../../../wailsjs/go/main/App';
import {
  DynamicTableFilter,
  DynamicColumnFilter,
  DynamicFilterColumn,
  applyDynamicFilters,
  createDefaultDynamicFilter,
} from '../components/DynamicTableFilter';

interface RlsPoliciesProps {
  role: PgRole;
  onAddOp: (op: DDLOperation) => void;
  globalSearch: string;
  refreshKey?: number;
}

export const RlsPolicies: React.FC<RlsPoliciesProps> = ({ role, onAddOp, globalSearch, refreshKey = 0 }) => {
  const [policies, setPolicies] = useState<PgRLSPolicy[]>([]);
  const [tableStatuses, setTableStatuses] = useState<PgRLSTableStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Policy Builder state
  const [showBuilder, setShowBuilder] = useState(false);
  const [targetTable, setTargetTable] = useState('');
  const [policyName, setPolicyName] = useState('');
  const [command, setCommand] = useState('ALL');
  const [permissive, setPermissive] = useState(true);
  const [targetRoles, setTargetRoles] = useState(role.name);
  const [usingExpr, setUsingExpr] = useState('');
  const [withCheckExpr, setWithCheckExpr] = useState('');
  const [tableFilters, setTableFilters] = useState<DynamicColumnFilter[]>(() => [
    createDefaultDynamicFilter('__any__'),
  ]);

  useEffect(() => {
    setTargetRoles(role.name);
  }, [role.name]);

  useEffect(() => {
    if (!(window as any)?.go?.main?.App?.GetPgRLSPolicies) return;
    setLoading(true);
    Promise.all([GetPgRLSPolicies(), GetPgRLSTableStatuses()])
      .then(([pols, statuses]) => {
        setPolicies(pols ?? []);
        const list = statuses ?? [];
        setTableStatuses(list);
        if (list.length > 0 && !targetTable) {
          setTargetTable(`${list[0].tableSchema}.${list[0].tableName}`);
        }
      })
      .catch((e) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleStagePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetTable || !policyName.trim()) return;
    const dotIdx = targetTable.indexOf('.');
    const tableSchema = dotIdx !== -1 ? targetTable.slice(0, dotIdx) : 'public';
    const tableName = dotIdx !== -1 ? targetTable.slice(dotIdx + 1) : targetTable;
    const roles = targetRoles
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    onAddOp({
      type: 'CREATE_POLICY',
      tableSchema,
      tableName,
      policyName: policyName.trim(),
      command,
      permissive,
      roles,
      usingExpr: usingExpr.trim() || undefined,
      withCheckExpr: withCheckExpr.trim() || undefined,
    });
    setPolicyName('');
    setUsingExpr('');
    setWithCheckExpr('');
    setShowBuilder(false);
  };

  const q = globalSearch.toLowerCase();
  const filteredPolicies = q
    ? policies.filter(
        (p) =>
          p.policyName.toLowerCase().includes(q) ||
          p.tableName.toLowerCase().includes(q) ||
          p.tableSchema.toLowerCase().includes(q),
      )
    : policies;

  const rlsTableFilterCols = useMemo<DynamicFilterColumn[]>(
    () => [
      { id: '__any__', label: 'All Columns', placeholder: 'Filter tables or RLS status...' },
      { id: 'tableSchema', label: 'Schema' },
      { id: 'tableName', label: 'Table' },
      { id: 'rls', label: 'RLS Status', options: ['RLS ON', 'RLS OFF'] },
      { id: 'force', label: 'Force RLS', options: ['FORCE ON', 'FORCE OFF'] },
    ],
    [],
  );

  const filteredTableStatuses = useMemo(
    () =>
      applyDynamicFilters(tableStatuses, tableFilters, rlsTableFilterCols, (s, colId) => {
        if (colId === 'tableSchema') return s.tableSchema;
        if (colId === 'tableName') return s.tableName;
        if (colId === 'rls') return s.rlsEnabled ? 'RLS ON' : 'RLS OFF';
        if (colId === 'force') return s.forceRLS ? 'FORCE ON' : 'FORCE OFF';
        return `${s.tableSchema}.${s.tableName}`;
      }),
    [tableStatuses, tableFilters, rlsTableFilterCols],
  );

  if (loading)
    return <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-muted)' }}>Loading RLS policies…</div>;
  if (error)
    return (
      <div className="rbac-empty-error-box" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertCircle size={14} />
        <span>{error}</span>
      </div>
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', gap: 12 }}>
      <div className="rbac-sticky-controls" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="rbac-toolbar" style={{ marginBottom: 0 }}>
          <Shield size={14} style={{ color: 'var(--accent-blue)' }} />
          <span style={{ color: 'var(--text-main)', fontSize: 13.5, fontWeight: 700 }}>
            Row-Level Security Policies
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            ({filteredPolicies.length} policies)
          </span>
          <div className="rbac-spacer" />
          <button
            type="button"
            className="rbac-btn rbac-btn-primary"
            disabled={tableStatuses.length === 0}
            onClick={() => setShowBuilder((v) => !v)}
          >
            <Plus size={12} /> {showBuilder ? 'Close Builder' : 'New Policy'}
          </button>
        </div>

        {/* Inline Policy Builder */}
        {showBuilder && (
          <form onSubmit={handleStagePolicy} className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="rbac-section-title">Create Row-Level Security Policy</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select
                value={targetTable}
                onChange={(e) => setTargetTable(e.target.value)}
                className="rbac-select"
              >
                {tableStatuses.map((s) => {
                  const full = `${s.tableSchema}.${s.tableName}`;
                  return <option key={full} value={full}>{full}</option>;
                })}
              </select>
              <input
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
                placeholder="Policy name (e.g. tenant_isolation)"
                className="rbac-input"
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '120px 140px 1fr', gap: 8 }}>
              <select value={command} onChange={(e) => setCommand(e.target.value)} className="rbac-select">
                {['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}
                onChange={(e) => setPermissive(e.target.value === 'PERMISSIVE')}
                className="rbac-select"
              >
                <option value="PERMISSIVE">PERMISSIVE</option>
                <option value="RESTRICTIVE">RESTRICTIVE</option>
              </select>
              <input
                value={targetRoles}
                onChange={(e) => setTargetRoles(e.target.value)}
                placeholder="Target roles comma-separated (blank = PUBLIC)"
                className="rbac-input"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input
                value={usingExpr}
                onChange={(e) => setUsingExpr(e.target.value)}
                placeholder="USING expr (e.g. owner_id = current_user)"
                className="rbac-input rbac-mono"
              />
              <input
                value={withCheckExpr}
                onChange={(e) => setWithCheckExpr(e.target.value)}
                placeholder="WITH CHECK expr (optional)"
                className="rbac-input rbac-mono"
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="rbac-btn" onClick={() => setShowBuilder(false)}>
                Cancel
              </button>
              <button type="submit" className="rbac-btn rbac-btn-primary" disabled={!policyName.trim() || !targetTable}>
                Stage CREATE POLICY
              </button>
            </div>
          </form>
        )}

        {tableStatuses.length > 0 && (
          <DynamicTableFilter
            columns={rlsTableFilterCols}
            filters={tableFilters}
            onChange={setTableFilters}
            totalCount={tableStatuses.length}
            filteredCount={filteredTableStatuses.length}
            itemLabel="tables"
            compact
          />
        )}
      </div>

      <div className="rbac-scroll-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Table RLS status */}
        {tableStatuses.length > 0 && (
          <div className="rbac-table-wrap">
            <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
              TABLE RLS STATUS
            </div>
            <div style={{ maxHeight: 170, overflowY: 'auto' }}>
              {filteredTableStatuses.map((s) => (
                <div key={`${s.tableSchema}.${s.tableName}`} className="rbac-row-item">
                  <span className="rbac-mono" style={{ flex: 1, fontSize: 12 }}>
                    {s.tableSchema}.{s.tableName}
                  </span>
                  <button
                    type="button"
                    className="rbac-btn"
                    style={
                      s.rlsEnabled
                        ? { borderColor: 'var(--accent-blue)', color: 'var(--accent-cyan)', background: 'rgba(59,130,246,0.12)' }
                        : undefined
                    }
                    onClick={() =>
                      onAddOp({ type: 'ALTER_TABLE_RLS', tableSchema: s.tableSchema, tableName: s.tableName, enable: !s.rlsEnabled })
                    }
                  >
                    {s.rlsEnabled ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                    {s.rlsEnabled ? 'RLS ON' : 'RLS OFF'}
                  </button>
                  {s.rlsEnabled && (
                    <button
                      type="button"
                      className="rbac-btn"
                      style={
                        s.forceRLS
                          ? { borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', background: 'rgba(245,158,11,0.12)' }
                          : undefined
                      }
                      onClick={() =>
                        onAddOp({ type: 'ALTER_TABLE_RLS', tableSchema: s.tableSchema, tableName: s.tableName, enable: true, force: !s.forceRLS })
                      }
                    >
                      FORCE: {s.forceRLS ? 'ON' : 'OFF'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Policies list */}
      {filteredPolicies.length === 0 ? (
        <div className="rbac-card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12.5 }}>
          No RLS policies defined in this database.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredPolicies.map((pol) => (
            <div key={`${pol.tableSchema}.${pol.tableName}.${pol.policyName}`} className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="rbac-mono" style={{ fontWeight: 700, fontSize: 12.5 }}>{pol.policyName}</span>
                <span className="rbac-stat-pill" style={{ color: 'var(--accent-cyan)', borderColor: 'var(--accent-blue)' }}>
                  {pol.command}
                </span>
                <span
                  className="rbac-stat-pill"
                  style={{
                    color: pol.permissive ? 'var(--accent-blue)' : 'var(--accent-amber)',
                    borderColor: pol.permissive ? 'var(--accent-blue)' : 'var(--accent-amber)',
                  }}
                >
                  {pol.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  ON {pol.tableSchema}.{pol.tableName}
                </span>
                <div className="rbac-spacer" />
                <button
                  type="button"
                  className="rbac-icon-btn"
                  style={{ color: 'var(--accent-red)' }}
                  title="Drop policy"
                  onClick={() =>
                    onAddOp({ type: 'DROP_POLICY', tableSchema: pol.tableSchema, tableName: pol.tableName, policyName: pol.policyName })
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {pol.roles.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  TO: <span className="rbac-mono" style={{ color: 'var(--text-main)' }}>{pol.roles.join(', ')}</span>
                </div>
              )}
              {pol.usingExpr && (
                <div className="rbac-mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  USING: <span style={{ color: 'var(--accent-cyan)' }}>{pol.usingExpr}</span>
                </div>
              )}
              {pol.checkExpr && (
                <div className="rbac-mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  WITH CHECK: <span style={{ color: 'var(--accent-cyan)' }}>{pol.checkExpr}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
};
