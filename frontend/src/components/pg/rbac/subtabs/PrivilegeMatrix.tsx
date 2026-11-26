import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  AlertCircle,
  ShieldAlert,
  Database,
  FolderTree,
  Table2,
  Hash,
  FunctionSquare,
  Sparkles,
  Search,
} from 'lucide-react';
import {
  DynamicTableFilter,
  DynamicColumnFilter,
  DynamicFilterColumn,
  applyDynamicFilters,
  createDefaultDynamicFilter,
} from '../components/DynamicTableFilter';
import {
  PgRole,
  PgObjectPrivilege,
  PgColumnPrivilege,
  PgSchemaPrivilege,
  PgDatabasePrivilege,
  PgSecurableCatalog,
  DDLOperation,
  OBJECT_PRIVILEGES,
} from '../../../../types/rbac';
import {
  GetPgTablePrivilegesForRole,
  GetPgSchemaPrivilegesForRole,
  GetPgDatabasePrivilegesForRole,
  GetPgSequencePrivilegesForRole,
  GetPgFunctionPrivilegesForRole,
  GetPgColumnPrivileges,
  GetPgTableColumns,
} from '../../../../../wailsjs/go/main/App';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrivilegeMatrixProps {
  role: PgRole;
  allRoles: PgRole[];
  catalog?: PgSecurableCatalog;
  onAddOp: (op: DDLOperation) => void;
  pendingOps?: DDLOperation[];
  globalSearch: string;
  refreshKey?: number;
}

type MatrixScope = 'database' | 'schema' | 'table' | 'sequence' | 'function';

interface MatrixRow {
  key: string;
  schema?: string;
  name: string;
  subType?: string;
  owner?: string;
}

interface EffectiveGrantInfo {
  direct: boolean;
  inheritedFrom: string[];
}

const COLUMN_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] as const;

function qIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const PrivilegeMatrix: React.FC<PrivilegeMatrixProps> = ({
  role,
  allRoles,
  catalog,
  onAddOp,
  pendingOps = [],
  globalSearch,
  refreshKey = 0,
}) => {
  const [scope, setScope] = useState<MatrixScope>('table');
  const [schemaFilter, setSchemaFilter] = useState<string>('all');
  const [onlyGranted, setOnlyGranted] = useState<boolean>(false);
  const [schemaWideBulk, setSchemaWideBulk] = useState<boolean>(false);
  const [showDynamicSearch, setShowDynamicSearch] = useState<boolean>(true);
  const [dynamicFilters, setDynamicFilters] = useState<DynamicColumnFilter[]>(() => [
    createDefaultDynamicFilter('__any__'),
  ]);

  // Blueprint drawer state
  const [showBlueprints, setShowBlueprints] = useState<boolean>(false);
  const [bpDatabase, setBpDatabase] = useState<string>('');
  const [bpSchema, setBpSchema] = useState<string>('public');

  const [tablePrivs, setTablePrivs] = useState<PgObjectPrivilege[]>([]);
  const [schemaPrivs, setSchemaPrivs] = useState<PgSchemaPrivilege[]>([]);
  const [dbPrivs, setDbPrivs] = useState<PgDatabasePrivilege[]>([]);
  const [seqPrivs, setSeqPrivs] = useState<PgObjectPrivilege[]>([]);
  const [funcPrivs, setFuncPrivs] = useState<PgObjectPrivilege[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [tableColumns, setTableColumns] = useState<Record<string, string[]>>({});
  const [colPrivs, setColPrivs] = useState<Record<string, PgColumnPrivilege[]>>({});

  useEffect(() => {
    if (catalog?.databases?.length && !bpDatabase) {
      setBpDatabase(catalog.databases[0]);
    }
    if (catalog?.schemas?.length) {
      if (!catalog.schemas.includes(bpSchema)) {
        setBpSchema(catalog.schemas.includes('public') ? 'public' : catalog.schemas[0]);
      }
    }
  }, [catalog, bpDatabase, bpSchema]);

  useEffect(() => {
    const app = (window as any)?.go?.main?.App;
    if (!app?.GetPgTablePrivilegesForRole) return;
    setLoading(true);
    setError(null);

    Promise.all([
      GetPgTablePrivilegesForRole(role.name).catch(() => []),
      app.GetPgSchemaPrivilegesForRole ? GetPgSchemaPrivilegesForRole(role.name).catch(() => []) : Promise.resolve([]),
      app.GetPgDatabasePrivilegesForRole ? GetPgDatabasePrivilegesForRole(role.name).catch(() => []) : Promise.resolve([]),
      app.GetPgSequencePrivilegesForRole ? GetPgSequencePrivilegesForRole(role.name).catch(() => []) : Promise.resolve([]),
      app.GetPgFunctionPrivilegesForRole ? GetPgFunctionPrivilegesForRole(role.name).catch(() => []) : Promise.resolve([]),
    ])
      .then(([t, s, d, sq, fn]) => {
        setTablePrivs(t ?? []);
        setSchemaPrivs(s ?? []);
        setDbPrivs(d ?? []);
        setSeqPrivs(sq ?? []);
        setFuncPrivs(fn ?? []);
      })
      .catch((e: any) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [role.name, refreshKey]);

  // Transitive parent roles (used for predefined pg_read_all_data / pg_write_all_data notice)
  const transitiveParents = useMemo(() => {
    const byName = new Map(allRoles.map((r) => [r.name, r]));
    const visited = new Set<string>();
    const queue = [...(role.memberOf ?? [])];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visited.has(curr)) continue;
      visited.add(curr);
      const r = byName.get(curr);
      if (r) {
        (r.memberOf ?? []).forEach((p) => {
          if (!visited.has(p)) queue.push(p);
        });
      }
    }
    return visited;
  }, [allRoles, role]);

  const hasReadAllData = transitiveParents.has('pg_read_all_data') || role.name === 'pg_read_all_data';
  const hasWriteAllData = transitiveParents.has('pg_write_all_data') || role.name === 'pg_write_all_data';

  const scopePrivileges = useMemo(() => {
    switch (scope) {
      case 'database':
        return OBJECT_PRIVILEGES['database'];
      case 'schema':
        return OBJECT_PRIVILEGES['schema'];
      case 'table':
        return OBJECT_PRIVILEGES['table'];
      case 'sequence':
        return OBJECT_PRIVILEGES['sequence'];
      case 'function':
        return OBJECT_PRIVILEGES['function'];
    }
  }, [scope]);

  // Lookup map: `${objKey}::${priv}` -> EffectiveGrantInfo
  const grantInfoMap = useMemo(() => {
    const map = new Map<string, EffectiveGrantInfo>();
    const record = (objKey: string, priv: string, grantee: string) => {
      const k = `${objKey}::${priv}`;
      let entry = map.get(k);
      if (!entry) {
        entry = { direct: false, inheritedFrom: [] };
        map.set(k, entry);
      }
      if (grantee === role.name) {
        entry.direct = true;
      } else if (grantee && !entry.inheritedFrom.includes(grantee)) {
        entry.inheritedFrom.push(grantee);
      }
    };

    if (scope === 'database') {
      dbPrivs.forEach((p) => record(p.databaseName, p.privilegeType, p.grantee));
    } else if (scope === 'schema') {
      schemaPrivs.forEach((p) => record(p.schemaName, p.privilegeType, p.grantee));
    } else if (scope === 'table') {
      tablePrivs.forEach((p) => record(`${p.objectSchema}.${p.objectName}`, p.privilegeType, p.grantee));
    } else if (scope === 'sequence') {
      seqPrivs.forEach((p) => record(`${p.objectSchema}.${p.objectName}`, p.privilegeType, p.grantee));
    } else if (scope === 'function') {
      funcPrivs.forEach((p) => record(`${p.objectSchema}.${p.objectName}`, p.privilegeType, p.grantee));
    }
    return map;
  }, [scope, dbPrivs, schemaPrivs, tablePrivs, seqPrivs, funcPrivs, role.name]);

  const ddlObjectType = useMemo(() => {
    switch (scope) {
      case 'database':
        return 'DATABASE';
      case 'schema':
        return 'SCHEMA';
      case 'table':
        return 'TABLE';
      case 'sequence':
        return 'SEQUENCE';
      case 'function':
        return 'FUNCTION';
    }
  }, [scope]);

  const getCellState = (row: MatrixRow, priv: string) => {
    const info = grantInfoMap.get(`${row.key}::${priv}`);
    const baseDirect = info?.direct ?? false;
    const inheritedFrom = info?.inheritedFrom ?? [];
    const objType = row.subType === 'procedure' ? 'PROCEDURE' : ddlObjectType;

    const staged = pendingOps.find(
      (o) =>
        (o.type === 'GRANT' || o.type === 'REVOKE') &&
        o.objectType === objType &&
        o.objectName === row.key &&
        o.privilege === priv &&
        o.grantee === role.name,
    );

    const direct = staged ? staged.type === 'GRANT' : baseDirect;
    const effective = direct || inheritedFrom.length > 0;
    return { direct, inheritedFrom, effective };
  };

  const hasPrivilege = (row: MatrixRow, priv: string) => getCellState(row, priv).direct;

  // All available schemas for filter dropdown
  const availableSchemas = useMemo(() => {
    const set = new Set<string>(catalog?.schemas ?? []);
    tablePrivs.forEach((p) => set.add(p.objectSchema));
    seqPrivs.forEach((p) => set.add(p.objectSchema));
    funcPrivs.forEach((p) => set.add(p.objectSchema));
    return Array.from(set).sort();
  }, [catalog?.schemas, tablePrivs, seqPrivs, funcPrivs]);

  // Reset dynamic filters when switching matrix object scope
  useEffect(() => {
    setDynamicFilters([createDefaultDynamicFilter('__any__')]);
  }, [scope]);

  // All rows for the current scope (before dynamic multi-column filtering)
  const baseRows = useMemo<MatrixRow[]>(() => {
    const q = globalSearch.toLowerCase().trim();
    const rowMap = new Map<string, MatrixRow>();

    if (scope === 'database') {
      (catalog?.databases ?? []).forEach((name) => rowMap.set(name, { key: name, name }));
      dbPrivs.forEach((p) => {
        if (!rowMap.has(p.databaseName)) rowMap.set(p.databaseName, { key: p.databaseName, name: p.databaseName });
      });
    } else if (scope === 'schema') {
      (catalog?.schemas ?? []).forEach((name) => rowMap.set(name, { key: name, name }));
      schemaPrivs.forEach((p) => {
        if (!rowMap.has(p.schemaName)) rowMap.set(p.schemaName, { key: p.schemaName, name: p.schemaName });
      });
    } else if (scope === 'table') {
      (catalog?.tables ?? []).forEach((o) =>
        rowMap.set(`${o.schema}.${o.name}`, {
          key: `${o.schema}.${o.name}`,
          schema: o.schema,
          name: o.name,
          subType: o.objectType,
          owner: o.owner,
        }),
      );
      tablePrivs.forEach((p) => {
        const k = `${p.objectSchema}.${p.objectName}`;
        if (!rowMap.has(k)) rowMap.set(k, { key: k, schema: p.objectSchema, name: p.objectName, subType: p.objectType });
      });
    } else if (scope === 'sequence') {
      (catalog?.sequences ?? []).forEach((o) =>
        rowMap.set(`${o.schema}.${o.name}`, {
          key: `${o.schema}.${o.name}`,
          schema: o.schema,
          name: o.name,
          subType: 'sequence',
          owner: o.owner,
        }),
      );
      seqPrivs.forEach((p) => {
        const k = `${p.objectSchema}.${p.objectName}`;
        if (!rowMap.has(k)) rowMap.set(k, { key: k, schema: p.objectSchema, name: p.objectName, subType: 'sequence' });
      });
    } else if (scope === 'function') {
      (catalog?.functions ?? []).forEach((o) =>
        rowMap.set(`${o.schema}.${o.name}`, {
          key: `${o.schema}.${o.name}`,
          schema: o.schema,
          name: o.name,
          subType: o.objectType,
          owner: o.owner,
        }),
      );
      funcPrivs.forEach((p) => {
        const k = `${p.objectSchema}.${p.objectName}`;
        if (!rowMap.has(k)) rowMap.set(k, { key: k, schema: p.objectSchema, name: p.objectName, subType: p.objectType });
      });
    }

    return Array.from(rowMap.values()).filter((r) => {
      if (r.schema && schemaFilter !== 'all' && r.schema !== schemaFilter) return false;
      if (q && !r.key.toLowerCase().includes(q)) return false;
      if (onlyGranted) {
        const anyEffective = scopePrivileges.some((priv) => getCellState(r, priv).effective);
        if (!anyEffective) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, catalog, dbPrivs, schemaPrivs, tablePrivs, seqPrivs, funcPrivs, schemaFilter, globalSearch, onlyGranted, pendingOps]);

  const filterColumns = useMemo<DynamicFilterColumn[]>(() => {
    const cols: DynamicFilterColumn[] = [
      { id: '__any__', label: 'All Columns', placeholder: `Search any ${scope} column...` },
    ];
    if (scope === 'table' || scope === 'sequence' || scope === 'function') {
      cols.push({ id: 'schema', label: 'Schema', options: availableSchemas, placeholder: 'e.g. public' });
      cols.push({ id: 'name', label: 'Name', placeholder: `e.g. alerts` });
      cols.push({ id: 'subType', label: 'Type', placeholder: `e.g. table, view` });
      cols.push({ id: 'owner', label: 'Owner', placeholder: 'Owner role' });
    } else {
      cols.push({ id: 'name', label: 'Name', placeholder: `Filter ${scope} name...` });
    }
    scopePrivileges.forEach((priv) => {
      cols.push({
        id: `priv:${priv}`,
        label: priv,
        options: ['Direct', 'Inherited', 'None'],
        placeholder: 'Direct, Inherited, None',
      });
    });
    return cols;
  }, [scope, availableSchemas, scopePrivileges]);

  const rows = useMemo<MatrixRow[]>(() => {
    return applyDynamicFilters(baseRows, dynamicFilters, filterColumns, (r, colId) => {
      if (colId === 'schema') return r.schema ?? '';
      if (colId === 'name') return r.name;
      if (colId === 'subType') return r.subType ?? '';
      if (colId === 'owner') return r.owner ?? '';
      if (colId.startsWith('priv:')) {
        const priv = colId.slice(5);
        const st = getCellState(r, priv);
        if (st.direct) return 'Direct';
        if (st.inheritedFrom.length > 0) return `Inherited (${st.inheritedFrom.join(', ')})`;
        return 'None';
      }
      return r.key;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRows, dynamicFilters, filterColumns]);

  const activeDynamicFilterCount = dynamicFilters.filter((f) => f.value.trim().length > 0).length;

  const toggleRow = async (row: MatrixRow) => {
    if (scope !== 'table' || !row.schema) return;
    if (expandedRows.has(row.key)) {
      setExpandedRows((prev) => {
        const s = new Set(prev);
        s.delete(row.key);
        return s;
      });
      return;
    }

    setExpandedRows((prev) => new Set(prev).add(row.key));
    const app = (window as any)?.go?.main?.App;
    try {
      const [cols, privData] = await Promise.all([
        !tableColumns[row.key] && app?.GetPgTableColumns
          ? GetPgTableColumns(row.schema, row.name).catch(() => [])
          : Promise.resolve(tableColumns[row.key] ?? []),
        app?.GetPgColumnPrivileges
          ? GetPgColumnPrivileges(role.name, row.schema, row.name).catch(() => [])
          : Promise.resolve([]),
      ]);
      setTableColumns((prev) => ({ ...prev, [row.key]: cols ?? [] }));
      setColPrivs((prev) => ({ ...prev, [row.key]: privData ?? [] }));
    } catch {}
  };

  const togglePriv = (row: MatrixRow, priv: string) => {
    const has = hasPrivilege(row, priv);
    const objType = row.subType === 'procedure' ? 'PROCEDURE' : ddlObjectType;
    onAddOp({
      type: has ? 'REVOKE' : 'GRANT',
      privilege: priv,
      objectType: objType,
      objectName: row.key,
      grantee: role.name,
    });
  };

  const hasColumnPriv = (schema: string, table: string, colName: string, priv: string) => {
    const key = `${schema}.${table}`;
    const base = (colPrivs[key] ?? []).some(
      (c) => c.columnName === colName && c.privilegeType === priv,
    );
    const staged = pendingOps.find(
      (o) =>
        (o.type === 'GRANT_COLUMN' || o.type === 'REVOKE_COLUMN') &&
        o.tableSchema === schema &&
        o.tableName === table &&
        o.columnName === colName &&
        o.privilege === priv &&
        o.grantee === role.name,
    );
    if (!staged) return base;
    return staged.type === 'GRANT_COLUMN';
  };

  const toggleColumnPriv = (schema: string, table: string, colName: string, priv: string) => {
    const has = hasColumnPriv(schema, table, colName, priv);
    onAddOp({
      type: has ? 'REVOKE_COLUMN' : 'GRANT_COLUMN',
      privilege: priv,
      tableSchema: schema,
      tableName: table,
      columnName: colName,
      grantee: role.name,
    });
  };

  const scopeTabs: Array<{ key: MatrixScope; label: string; icon: React.ReactNode }> = [
    { key: 'database', label: 'Databases', icon: <Database size={12} /> },
    { key: 'schema', label: 'Schemas', icon: <FolderTree size={12} /> },
    { key: 'table', label: 'Tables & Views', icon: <Table2 size={12} /> },
    { key: 'sequence', label: 'Sequences', icon: <Hash size={12} /> },
    { key: 'function', label: 'Functions', icon: <FunctionSquare size={12} /> },
  ];

  const applyPresetToListed = (privsToGrant: string[]) => {
    if (scope === 'table' && schemaWideBulk) {
      const targetSchemas =
        schemaFilter !== 'all'
          ? [schemaFilter]
          : Array.from(new Set(rows.map((r) => r.schema).filter((s): s is string => Boolean(s))));
      targetSchemas.forEach((sch) => {
        onAddOp({
          type: 'RAW_SQL',
          label: `Bulk GRANT on ${sch}`,
          sql: `GRANT ${privsToGrant.join(', ')} ON ALL TABLES IN SCHEMA ${qIdent(sch)} TO ${qIdent(role.name)};`,
        });
      });
      return;
    }

    rows.forEach((row) => {
      const objType = row.subType === 'procedure' ? 'PROCEDURE' : ddlObjectType;
      privsToGrant.forEach((priv) => {
        if (!hasPrivilege(row, priv)) {
          onAddOp({
            type: 'GRANT',
            privilege: priv,
            objectType: objType,
            objectName: row.key,
            grantee: role.name,
          });
        }
      });
    });
  };

  const revokeAllListed = () => {
    if (scope === 'table' && schemaWideBulk) {
      const targetSchemas =
        schemaFilter !== 'all'
          ? [schemaFilter]
          : Array.from(new Set(rows.map((r) => r.schema).filter((s): s is string => Boolean(s))));
      targetSchemas.forEach((sch) => {
        onAddOp({
          type: 'RAW_SQL',
          label: `Bulk REVOKE on ${sch}`,
          sql: `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${qIdent(sch)} FROM ${qIdent(role.name)};`,
        });
      });
      return;
    }

    rows.forEach((row) => {
      const objType = row.subType === 'procedure' ? 'PROCEDURE' : ddlObjectType;
      scopePrivileges.forEach((priv) => {
        if (hasPrivilege(row, priv)) {
          onAddOp({
            type: 'REVOKE',
            privilege: priv,
            objectType: objType,
            objectName: row.key,
            grantee: role.name,
            cascade: false,
          });
        }
      });
    });
  };

  const applyBlueprint = (kind: 'readonly' | 'readwrite' | 'migration' | 'monitoring') => {
    const db = bpDatabase || catalog?.databases?.[0] || 'postgres';
    const sch = bpSchema || 'public';
    const r = qIdent(role.name);
    const dbId = qIdent(db);
    const schId = qIdent(sch);

    let sql = '';
    let label = '';

    if (kind === 'readonly') {
      label = `Blueprint: Read-Only (${sch})`;
      sql = [
        `GRANT CONNECT ON DATABASE ${dbId} TO ${r};`,
        `GRANT USAGE ON SCHEMA ${schId} TO ${r};`,
        `GRANT SELECT ON ALL TABLES IN SCHEMA ${schId} TO ${r};`,
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schId} TO ${r};`,
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schId} GRANT SELECT ON TABLES TO ${r};`,
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schId} GRANT USAGE, SELECT ON SEQUENCES TO ${r};`,
      ].join('\n');
    } else if (kind === 'readwrite') {
      label = `Blueprint: App Read-Write (${sch})`;
      sql = [
        `GRANT CONNECT ON DATABASE ${dbId} TO ${r};`,
        `GRANT USAGE ON SCHEMA ${schId} TO ${r};`,
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schId} TO ${r};`,
        `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ${schId} TO ${r};`,
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schId} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${r};`,
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schId} GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${r};`,
      ].join('\n');
    } else if (kind === 'migration') {
      label = `Blueprint: CI/CD Migration (${sch})`;
      sql = [
        `GRANT CONNECT, CREATE ON DATABASE ${dbId} TO ${r};`,
        `GRANT USAGE, CREATE ON SCHEMA ${schId} TO ${r};`,
        `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${schId} TO ${r};`,
        `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${schId} TO ${r};`,
        `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schId} TO ${r};`,
      ].join('\n');
    } else {
      label = `Blueprint: Monitoring`;
      sql = [
        `GRANT CONNECT ON DATABASE ${dbId} TO ${r};`,
        `GRANT "pg_monitor" TO ${r};`,
      ].join('\n');
    }

    onAddOp({ type: 'RAW_SQL', label, sql });
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
        Loading permissions across databases, schemas, tables, sequences, and functions for {role.name}…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rbac-empty-error-box" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertCircle size={14} />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <div className="rbac-sticky-controls">
      {/* Superuser / Predefined Global Role Bypass Notice */}
      {role.isSuperuser && (
        <div
          className="rbac-card"
          style={{
            marginBottom: 12,
            borderColor: 'var(--accent-amber)',
            background: 'rgba(245, 158, 11, 0.10)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <ShieldAlert size={18} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-amber)' }}>
              Superuser Bypass Active
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-main)', marginTop: 2 }}>
              <code className="rbac-mono">{role.name}</code> has the <strong>SUPERUSER</strong> attribute — PostgreSQL implicitly grants full access to all databases, schemas, tables, sequences, and functions, and bypasses RLS regardless of the explicit ACL checkboxes below.
            </div>
          </div>
          {role.name !== 'postgres' && (
            <button
              type="button"
              className="rbac-btn rbac-btn-danger"
              onClick={() =>
                onAddOp({
                  type: 'ALTER_ROLE',
                  roleName: role.name,
                  attribute: 'NOSUPERUSER',
                  value: '',
                })
              }
            >
              Stage NOSUPERUSER
            </button>
          )}
        </div>
      )}

      {!role.isSuperuser && (hasReadAllData || hasWriteAllData) && (
        <div
          className="rbac-card"
          style={{
            marginBottom: 12,
            borderColor: 'var(--accent-cyan)',
            background: 'rgba(56, 189, 248, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <ShieldAlert size={16} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
          <div style={{ fontSize: 12, color: 'var(--text-main)' }}>
            Inherited predefined access:{' '}
            {hasReadAllData && <code className="rbac-mono">pg_read_all_data</code>}{' '}
            {hasWriteAllData && <code className="rbac-mono">pg_write_all_data</code>} — PostgreSQL grants global table/view/sequence access automatically via membership.
          </div>
        </div>
      )}

      {/* Scope Switcher */}
      <div className="rbac-toolbar" style={{ marginBottom: 10 }}>
        {scopeTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`rbac-btn ${scope === t.key ? 'rbac-btn-primary' : ''}`}
            onClick={() => setScope(t.key)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}

        <button
          type="button"
          className={`rbac-btn ${showBlueprints ? 'rbac-btn-primary' : ''}`}
          onClick={() => setShowBlueprints((v) => !v)}
          title="Apply one-click least-privilege permission bundles"
        >
          <Sparkles size={12} />
          <span>Blueprints</span>
        </button>

        <div className="rbac-spacer" />

        {(scope === 'table' || scope === 'sequence' || scope === 'function') && (
          <select
            value={schemaFilter}
            onChange={(e) => setSchemaFilter(e.target.value)}
            className="rbac-select"
            title="Filter by schema"
          >
            <option value="all">All Schemas ({availableSchemas.length})</option>
            {availableSchemas.map((s) => (
              <option key={s} value={s}>
                schema: {s}
              </option>
            ))}
          </select>
        )}

        <label
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={onlyGranted}
            onChange={(e) => setOnlyGranted(e.target.checked)}
          />
          <span>Only Granted</span>
        </label>
      </div>

      {/* Least-Privilege Blueprints Drawer */}
      {showBlueprints && (
        <div className="rbac-card" style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Sparkles size={13} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>
              One-Click Least-Privilege Blueprints for <code className="rbac-mono">{role.name}</code>
            </span>
            <div className="rbac-spacer" />
            <select value={bpDatabase} onChange={(e) => setBpDatabase(e.target.value)} className="rbac-select" title="Target Database">
              {(catalog?.databases ?? ['postgres']).map((d) => (
                <option key={d} value={d}>db: {d}</option>
              ))}
            </select>
            <select value={bpSchema} onChange={(e) => setBpSchema(e.target.value)} className="rbac-select" title="Target Schema">
              {(catalog?.schemas?.length ? catalog.schemas : ['public']).map((s) => (
                <option key={s} value={s}>schema: {s}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="rbac-btn" onClick={() => applyBlueprint('readonly')}>
              Read-Only Analyst
            </button>
            <button type="button" className="rbac-btn" onClick={() => applyBlueprint('readwrite')}>
              App Read-Write
            </button>
            <button type="button" className="rbac-btn" onClick={() => applyBlueprint('migration')}>
              CI/CD Migration
            </button>
            <button type="button" className="rbac-btn" onClick={() => applyBlueprint('monitoring')}>
              Monitoring (pg_monitor)
            </button>
          </div>
        </div>
      )}

      {/* Quick Presets */}
      <div className="rbac-toolbar">
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Quick grant to {rows.length} listed {scope}{rows.length === 1 ? '' : 's'}:
        </span>
        {scope === 'database' && (
          <>
            <button type="button" className="rbac-btn" disabled={rows.length === 0} onClick={() => applyPresetToListed(['CONNECT'])}>
              Connect Only
            </button>
            <button type="button" className="rbac-btn" disabled={rows.length === 0} onClick={() => applyPresetToListed(['CONNECT', 'TEMP', 'CREATE'])}>
              Full DB Access
            </button>
          </>
        )}
        {scope === 'schema' && (
          <>
            <button type="button" className="rbac-btn" disabled={rows.length === 0} onClick={() => applyPresetToListed(['USAGE'])}>
              Usage Only
            </button>
            <button type="button" className="rbac-btn" disabled={rows.length === 0} onClick={() => applyPresetToListed(['USAGE', 'CREATE'])}>
              Usage + Create
            </button>
          </>
        )}
        {scope === 'table' && (
          <>
            <button type="button" className="rbac-btn" disabled={rows.length === 0} onClick={() => applyPresetToListed(['SELECT'])}>
              Read Only
            </button>
            <button type="button" className="rbac-btn" disabled={rows.length === 0} onClick={() => applyPresetToListed(['SELECT', 'INSERT', 'UPDATE', 'DELETE'])}>
              Read-Write
            </button>
            <button type="button" className="rbac-btn" disabled={rows.length === 0} onClick={() => applyPresetToListed(scopePrivileges)}>
              Full Access
            </button>
            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-muted)', cursor: 'pointer', marginLeft: 4 }}
              title="Emit concise GRANT ... ON ALL TABLES IN SCHEMA instead of individual table statements"
            >
              <input
                type="checkbox"
                checked={schemaWideBulk}
                onChange={(e) => setSchemaWideBulk(e.target.checked)}
              />
              <span>Schema-wide DDL</span>
            </label>
          </>
        )}
        {(scope === 'sequence' || scope === 'function') && (
          <button type="button" className="rbac-btn" disabled={rows.length === 0} onClick={() => applyPresetToListed(scopePrivileges)}>
            Grant All Listed
          </button>
        )}

        <button
          type="button"
          className={`rbac-btn ${showDynamicSearch ? 'rbac-btn-primary' : ''}`}
          onClick={() => setShowDynamicSearch((v) => !v)}
          title="Filter table data dynamically by any column or privilege"
        >
          <Search size={12} />
          <span>Search{activeDynamicFilterCount > 0 ? ` (${activeDynamicFilterCount})` : ''}</span>
        </button>

        <div className="rbac-spacer" />

        {/* Legend */}
        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 6 }}>
          <strong style={{ color: 'var(--accent-cyan)' }}>✓</strong> Direct · <strong style={{ color: 'var(--accent-emerald)' }}>↳</strong> Inherited
        </span>

        <button
          type="button"
          className="rbac-btn rbac-btn-danger"
          disabled={rows.length === 0}
          onClick={revokeAllListed}
        >
          Revoke Listed
        </button>
      </div>

      {/* Dynamic Multi-Column Filters */}
      {showDynamicSearch && (
        <DynamicTableFilter
          columns={filterColumns}
          filters={dynamicFilters}
          onChange={setDynamicFilters}
          totalCount={baseRows.length}
          filteredCount={rows.length}
          itemLabel={`${scope}s`}
        />
      )}
      </div>

      {/* Matrix Table */}
      {rows.length === 0 ? (
        <div className="rbac-card" style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)', fontSize: 13 }}>
          {onlyGranted
            ? `No ${scope} privileges currently granted (directly or via groups) to ${role.name}. Uncheck "Only Granted" to see all ${scope}s.`
            : `No user ${scope}s found matching your current filter.`}
        </div>
      ) : (
        <div className="rbac-table-wrap rbac-scroll-body">
          <table className="rbac-table">
            <thead>
              <tr>
                <th className="sticky-col" style={{ minWidth: 220 }}>
                  {scope.toUpperCase()}
                </th>
                {scopePrivileges.map((priv) => (
                  <th key={priv} className="center" style={{ minWidth: 74 }}>
                    {priv}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const expanded = scope === 'table' && expandedRows.has(row.key);
                const cols = tableColumns[row.key] ?? [];

                return (
                  <React.Fragment key={row.key}>
                    <tr>
                      <td className="sticky-col rbac-mono">
                        {scope === 'table' && row.schema ? (
                          <button
                            type="button"
                            onClick={() => toggleRow(row)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-main)',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              fontSize: 12,
                              textAlign: 'left',
                            }}
                            title="Expand columns for column-level permissions"
                          >
                            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            <span style={{ color: 'var(--text-dim)' }}>{row.schema}.</span>
                            <span>{row.name}</span>
                            {row.subType && row.subType !== 'table' && (
                              <span className="rbac-badge" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-dim)', marginLeft: 4 }}>
                                {row.subType}
                              </span>
                            )}
                          </button>
                        ) : (
                          <span>
                            {row.schema && <span style={{ color: 'var(--text-dim)' }}>{row.schema}.</span>}
                            <span>{row.name}</span>
                          </span>
                        )}
                      </td>
                      {scopePrivileges.map((priv) => {
                        const { direct, inheritedFrom } = getCellState(row, priv);
                        const inheritedOnly = !direct && inheritedFrom.length > 0;
                        const tooltip = direct
                          ? inheritedFrom.length > 0
                            ? `Direct grant + inherited from ${inheritedFrom.join(', ')} — click to revoke direct grant`
                            : `Revoke direct ${priv}`
                          : inheritedOnly
                          ? `Inherited from ${inheritedFrom.join(', ')} — click to also grant directly`
                          : `Grant ${priv}`;

                        return (
                          <td key={priv} className="center">
                            <button
                              type="button"
                              onClick={() => togglePriv(row, priv)}
                              className={`rbac-check-btn ${direct ? 'active' : ''}`}
                              style={
                                inheritedOnly
                                  ? {
                                      borderColor: 'var(--accent-emerald)',
                                      background: 'rgba(16, 185, 129, 0.14)',
                                      color: 'var(--accent-emerald)',
                                    }
                                  : undefined
                              }
                              title={tooltip}
                            >
                              {direct ? '✓' : inheritedOnly ? '↳' : ''}
                            </button>
                          </td>
                        );
                      })}
                    </tr>

                    {/* Column-level expansion */}
                    {expanded && row.schema && (
                      <tr style={{ background: 'var(--bg-canvas)' }}>
                        <td colSpan={scopePrivileges.length + 1} style={{ padding: '8px 14px 12px 28px' }}>
                          {cols.length === 0 ? (
                            <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
                              No columns found or loading…
                            </span>
                          ) : (
                            <div className="rbac-table-wrap">
                              <table className="rbac-table">
                                <thead>
                                  <tr>
                                    <th>Column ({row.schema}.{row.name})</th>
                                    {COLUMN_PRIVS.map((cp) => (
                                      <th key={cp} className="center">{cp}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {cols.map((colName) => (
                                    <tr key={colName}>
                                      <td className="rbac-mono">↳ {colName}</td>
                                      {COLUMN_PRIVS.map((cp) => {
                                        const colHas = hasColumnPriv(row.schema!, row.name, colName, cp);
                                        return (
                                          <td key={cp} className="center">
                                            <button
                                              type="button"
                                              onClick={() => toggleColumnPriv(row.schema!, row.name, colName, cp)}
                                              className={`rbac-check-btn ${colHas ? 'active' : ''}`}
                                              title={colHas ? `Revoke ${cp} (${colName})` : `Grant ${cp} (${colName})`}
                                            >
                                              {colHas ? '✓' : ''}
                                            </button>
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
