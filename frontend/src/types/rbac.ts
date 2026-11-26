// ─────────────────────────────────────────────────────────────────────────────
// PostgreSQL Security & RBAC Studio — TypeScript Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PgRole {
  name: string;
  oid: number;
  isSuperuser: boolean;
  inheritPrivs: boolean;
  canCreateRole: boolean;
  canCreateDB: boolean;
  canLogin: boolean;
  isReplication: boolean;
  bypassRLS: boolean;
  connLimit: number;         // -1 = unlimited
  validUntil?: string | null;
  memberOf: string[];
  members: string[];
  isPredefined: boolean;    // pg_* built-in roles
}

export interface PgObjectPrivilege {
  objectSchema: string;
  objectName: string;
  objectType: string;
  grantee: string;
  grantor: string;
  privilegeType: string;
  isGrantable: boolean;
}

export interface PgColumnPrivilege {
  tableSchema: string;
  tableName: string;
  columnName: string;
  grantee: string;
  privilegeType: string;
  isGrantable: boolean;
}

export interface PgDefaultPrivilege {
  forRole: string;
  inSchema?: string | null;
  objectType: string; // TABLE, SEQUENCE, FUNCTION, TYPE, SCHEMA
  grantee: string;
  privilege: string;
  isGrantable: boolean;
}

export interface PgRLSPolicy {
  policyName: string;
  tableSchema: string;
  tableName: string;
  command: string;
  permissive: boolean;
  roles: string[];
  usingExpr?: string | null;
  checkExpr?: string | null;
}

export interface PgRLSTableStatus {
  tableSchema: string;
  tableName: string;
  rlsEnabled: boolean;
  forceRLS: boolean;
}

export interface PgForeignDataWrapper {
  name: string;
  owner: string;
  handler?: string | null;
  validator?: string | null;
  acl: string[];
}

export interface PgForeignServer {
  oid: number;
  name: string;
  fdwName: string;
  type?: string | null;
  version?: string | null;
  options: Record<string, string>;
  acl: string[];
}

export interface PgUserMapping {
  serverName: string;
  localRole: string; // "PUBLIC" if no specific user
  options: Record<string, string>; // password value is redacted
}

export interface PgRoleParamSetting {
  roleName: string;
  database?: string | null; // null = ALL
  paramName: string;
  value: string;
}

export interface PgSecurableObject {
  schema: string;
  name: string;
  objectType: string;
  owner: string;
}

export interface PgSecurableCatalog {
  databases: string[];
  schemas: string[];
  tables: PgSecurableObject[];
  sequences: PgSecurableObject[];
  functions: PgSecurableObject[];
}

export interface PgRbacOverview {
  roles: PgRole[];
  fdws: PgForeignDataWrapper[];
  servers: PgForeignServer[];
  catalog?: PgSecurableCatalog;
}

export interface PgSchemaPrivilege {
  schemaName: string;
  grantee: string;
  grantor: string;
  privilegeType: string;
  isGrantable: boolean;
}

export interface PgDatabasePrivilege {
  databaseName: string;
  grantee: string;
  grantor: string;
  privilegeType: string;
  isGrantable: boolean;
}

export interface SecurityAuditFinding {
  checkName: string;
  severity: string;
  title: string;
  description: string;
  affectedItems: string[];
  fixDDL: string;
}

export interface PgQueryResult {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  rowsAffected: number;
  error: string; // non-empty if query errored
}

// ─── DDL Operation primitives used by useDDLGenerator ───────────────────────

export type DDLOperation =
  | {
      type: 'GRANT';
      privilege: string;
      objectType: string;
      objectName: string;
      grantee: string;
      withGrantOption?: boolean;
    }
  | {
      type: 'REVOKE';
      privilege: string;
      objectType: string;
      objectName: string;
      grantee: string;
      cascade?: boolean;
    }
  | {
      type: 'GRANT_COLUMN';
      privilege: string;
      tableSchema: string;
      tableName: string;
      columnName: string;
      grantee: string;
    }
  | {
      type: 'REVOKE_COLUMN';
      privilege: string;
      tableSchema: string;
      tableName: string;
      columnName: string;
      grantee: string;
    }
  | {
      type: 'ALTER_ROLE';
      roleName: string;
      attribute: string;
      value: string | number | boolean;
    }
  | {
      type: 'ALTER_ROLE_SET';
      roleName: string;
      paramName: string;
      value: string;
      database?: string; // undefined = ALL
    }
  | {
      type: 'CREATE_POLICY';
      tableSchema: string;
      tableName: string;
      policyName: string;
      command: string;
      permissive: boolean;
      roles: string[];
      usingExpr?: string;
      withCheckExpr?: string;
    }
  | {
      type: 'DROP_POLICY';
      tableSchema: string;
      tableName: string;
      policyName: string;
    }
  | {
      type: 'ALTER_TABLE_RLS';
      tableSchema: string;
      tableName: string;
      enable: boolean;
      force?: boolean;
    }
  | {
      type: 'ALTER_DEFAULT_PRIVS';
      forRole: string;
      inSchema?: string;
      objectType: string;
      privilege: string;
      grantee: string;
      revoke?: boolean;
    }
  | {
      type: 'CREATE_ROLE';
      roleName: string;
      options: Partial<{
        login: boolean;
        superuser: boolean;
        inherit: boolean;
        createRole: boolean;
        createDB: boolean;
        replication: boolean;
        bypassRLS: boolean;
        connLimit: number;
        password: string;
        validUntil: string;
      }>;
    }
  | {
      type: 'DROP_ROLE';
      roleName: string;
    }
  | {
      type: 'GRANT_ROLE';
      parentRole: string;
      memberRole: string;
      withAdminOption?: boolean;
    }
  | {
      type: 'REVOKE_ROLE';
      parentRole: string;
      memberRole: string;
    }
  | {
      type: 'RAW_SQL';
      sql: string;
      label?: string;
    };

// ─── Privilege matrix helper ──────────────────────────────────────────────────

/** All privileges per object type */
export const OBJECT_PRIVILEGES: Record<string, string[]> = {
  table: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'],
  view: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRIGGER'],
  sequence: ['USAGE', 'SELECT', 'UPDATE'],
  function: ['EXECUTE'],
  procedure: ['EXECUTE'],
  schema: ['USAGE', 'CREATE'],
  database: ['CONNECT', 'CREATE', 'TEMP'],
  type: ['USAGE'],
  foreign_table: ['SELECT'],
};

/** Predefined pg_* role names (PG 14+) */
export const PREDEFINED_PG_ROLES = [
  'pg_read_all_data',
  'pg_write_all_data',
  'pg_read_all_settings',
  'pg_read_all_stats',
  'pg_stat_scan_tables',
  'pg_monitor',
  'pg_database_owner',
  'pg_signal_backend',
  'pg_checkpoint',
  'pg_maintain',
  'pg_use_reserved_connections',
  'pg_create_subscription',
  'pg_read_server_files',
  'pg_write_server_files',
  'pg_execute_server_program',
] as const;

/** Roles that grant dangerous OS-level access */
export const DANGEROUS_PG_ROLES = new Set([
  'pg_read_server_files',
  'pg_write_server_files',
  'pg_execute_server_program',
]);

/** Severity badge colour map */
export const SEVERITY_COLOR: Record<SecurityAuditFinding['severity'], string> = {
  CRITICAL: 'var(--severity-critical, #ef4444)',
  HIGH:     'var(--severity-high, #f97316)',
  MEDIUM:   'var(--severity-medium, #eab308)',
  INFO:     'var(--severity-info, #3b82f6)',
};
