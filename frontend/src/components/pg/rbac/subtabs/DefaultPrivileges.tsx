import React, { useState, useEffect, useMemo } from 'react';
import { Star, Plus, Trash2, AlertCircle } from 'lucide-react';
import { PgRole, PgDefaultPrivilege, DDLOperation } from '../../../../types/rbac';
import { GetPgDefaultPrivileges } from '../../../../../wailsjs/go/main/App';
import {
  DynamicTableFilter,
  DynamicColumnFilter,
  DynamicFilterColumn,
  applyDynamicFilters,
  createDefaultDynamicFilter,
} from '../components/DynamicTableFilter';

interface DefaultPrivilegesProps {
  role: PgRole;
  onAddOp: (op: DDLOperation) => void;
  refreshKey?: number;
}

export const DefaultPrivileges: React.FC<DefaultPrivilegesProps> = ({ role, onAddOp, refreshKey = 0 }) => {
  const [defaults, setDefaults] = useState<PgDefaultPrivilege[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DynamicColumnFilter[]>(() => [
    createDefaultDynamicFilter('__any__'),
  ]);

  useEffect(() => {
    if (!(window as any)?.go?.main?.App?.GetPgDefaultPrivileges) return;
    setLoading(true);
    GetPgDefaultPrivileges()
      .then((data) => setDefaults(data ?? []))
      .catch((e) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [role.name, refreshKey]);

  const forRole = useMemo(
    () => defaults.filter((d) => d.forRole === role.name),
    [defaults, role.name],
  );

  const filterColumns = useMemo<DynamicFilterColumn[]>(
    () => [
      { id: '__any__', label: 'All Columns', placeholder: 'Filter rules by privilege, grantee, schema...' },
      { id: 'objectType', label: 'Object Type', options: ['TABLE', 'SEQUENCE', 'FUNCTION', 'TYPE', 'SCHEMA'] },
      { id: 'privilege', label: 'Privilege', options: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'USAGE', 'EXECUTE', 'CREATE'] },
      { id: 'grantee', label: 'Grantee' },
      { id: 'inSchema', label: 'Schema' },
    ],
    [],
  );

  const filteredForRole = useMemo(
    () =>
      applyDynamicFilters(forRole, filters, filterColumns, (d, colId) => {
        if (colId === 'objectType') return d.objectType;
        if (colId === 'privilege') return d.privilege;
        if (colId === 'grantee') return d.grantee;
        if (colId === 'inSchema') return d.inSchema ?? '';
        return `${d.objectType} ${d.privilege} ${d.grantee} ${d.inSchema ?? ''}`;
      }),
    [forRole, filters, filterColumns],
  );

  const byObjType = filteredForRole.reduce<Record<string, PgDefaultPrivilege[]>>((acc, d) => {
    if (!acc[d.objectType]) acc[d.objectType] = [];
    acc[d.objectType].push(d);
    return acc;
  }, {});

  if (loading)
    return <div style={{ padding: 20, fontSize: 12.5, color: 'var(--text-muted)' }}>Loading default privileges…</div>;
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
        <div className="rbac-section-title">
          <Star size={14} style={{ color: 'var(--accent-blue)' }} />
          <span style={{ color: 'var(--text-main)', textTransform: 'none', fontSize: 13.5 }}>Default Privileges</span>
          <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--text-dim)' }}>
            — applies to future objects created by {role.name}
          </span>
        </div>

        {forRole.length > 0 && (
          <DynamicTableFilter
            columns={filterColumns}
            filters={filters}
            onChange={setFilters}
            totalCount={forRole.length}
            filteredCount={filteredForRole.length}
            itemLabel="rules"
            compact
          />
        )}
      </div>

      <div className="rbac-scroll-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Object.keys(byObjType).length === 0 ? (
        <div className="rbac-card" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12.5 }}>
          {forRole.length === 0
            ? `No default privileges configured for ${role.name}.`
            : 'No default privilege rules match the active filters.'}
        </div>
      ) : (
        Object.entries(byObjType).map(([objType, items]) => (
          <div key={objType} className="rbac-table-wrap">
            <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
              {objType}S
            </div>
            {items.map((item, i) => (
              <div key={i} className="rbac-row-item">
                <span className="rbac-mono" style={{ flex: 1, fontSize: 12, color: 'var(--accent-cyan)' }}>
                  {item.privilege}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>→</span>
                <span className="rbac-mono" style={{ fontSize: 12, color: 'var(--text-main)' }}>
                  {item.grantee}
                </span>
                {item.inSchema && (
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>in {item.inSchema}</span>
                )}
                {item.isGrantable && (
                  <span style={{ fontSize: 11, color: 'var(--accent-blue)' }}>with grant option</span>
                )}
                <button
                  type="button"
                  className="rbac-icon-btn"
                  style={{ color: 'var(--accent-red)' }}
                  title="Revoke default privilege"
                  onClick={() =>
                    onAddOp({
                      type: 'ALTER_DEFAULT_PRIVS',
                      forRole: role.name,
                      inSchema: item.inSchema ?? undefined,
                      objectType: item.objectType,
                      privilege: item.privilege,
                      grantee: item.grantee,
                      revoke: true,
                    })
                  }
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        ))
      )}

      <AddDefaultPriv role={role} onAddOp={onAddOp} />
      </div>
    </div>
  );
};

const AddDefaultPriv: React.FC<{ role: PgRole; onAddOp: (op: DDLOperation) => void }> = ({ role, onAddOp }) => {
  const [objType, setObjType] = useState('TABLE');
  const [privilege, setPrivilege] = useState('SELECT');
  const [grantee, setGrantee] = useState('');
  const [schema, setSchema] = useState('');

  const privilegeOptions: Record<string, string[]> = {
    TABLE: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'],
    SEQUENCE: ['USAGE', 'SELECT', 'UPDATE'],
    FUNCTION: ['EXECUTE'],
    TYPE: ['USAGE'],
    SCHEMA: ['USAGE', 'CREATE'],
  };

  return (
    <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className="rbac-section-title">+ Add Default Privilege Rule</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <select
          value={objType}
          onChange={(e) => {
            setObjType(e.target.value);
            setPrivilege(privilegeOptions[e.target.value]?.[0] ?? 'SELECT');
          }}
          className="rbac-select"
        >
          {Object.keys(privilegeOptions).map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={privilege} onChange={(e) => setPrivilege(e.target.value)} className="rbac-select">
          {(privilegeOptions[objType] ?? []).map((p) => <option key={p}>{p}</option>)}
        </select>
        <input
          value={grantee}
          onChange={(e) => setGrantee(e.target.value)}
          placeholder="grantee role"
          className="rbac-input"
          style={{ width: 140 }}
        />
        <input
          value={schema}
          onChange={(e) => setSchema(e.target.value)}
          placeholder="schema (opt)"
          className="rbac-input"
          style={{ width: 120 }}
        />
        <button
          type="button"
          disabled={!grantee}
          className="rbac-btn rbac-btn-primary"
          onClick={() => {
            if (!grantee) return;
            onAddOp({
              type: 'ALTER_DEFAULT_PRIVS',
              forRole: role.name,
              inSchema: schema || undefined,
              objectType: objType,
              privilege,
              grantee,
            });
            setGrantee('');
            setSchema('');
          }}
        >
          <Plus size={12} /> Add Rule
        </button>
      </div>
    </div>
  );
};
