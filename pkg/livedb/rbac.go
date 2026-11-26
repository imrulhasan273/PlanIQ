package livedb

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
// PostgreSQL Security & RBAC Studio — Catalog Query Functions
// All functions operate on the active pg connection via c.db (pgx driver).
// ─────────────────────────────────────────────────────────────────────────────

const rbacQueryTimeout = 10 * time.Second

func rbacCtx(parent context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, rbacQueryTimeout)
}

// ─── Roles ────────────────────────────────────────────────────────────────────

// PgGetAllRoles returns every role in the cluster with membership info.
func (c *Client) PgGetAllRoles(ctx context.Context) ([]PgRole, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	const q = `
SELECT
    r.oid,
    r.rolname,
    r.rolsuper,
    r.rolinherit,
    r.rolcreaterole,
    r.rolcreatedb,
    r.rolcanlogin,
    r.rolreplication,
    r.rolbypassrls,
    r.rolconnlimit,
    r.rolvaliduntil::text,
    COALESCE(
        ARRAY(SELECT pg_get_userbyid(m.roleid)
              FROM pg_auth_members m WHERE m.member = r.oid
              ORDER BY 1),
        '{}'::text[]
    ) AS member_of,
    COALESCE(
        ARRAY(SELECT pg_get_userbyid(m.member)
              FROM pg_auth_members m WHERE m.roleid = r.oid
              ORDER BY 1),
        '{}'::text[]
    ) AS members
FROM pg_roles r
ORDER BY r.rolcanlogin DESC, r.rolname;`

	rows, err := db.QueryContext(qCtx, q)
	if err != nil {
		return nil, fmt.Errorf("PgGetAllRoles query: %w", err)
	}
	defer rows.Close()

	var roles []PgRole
	for rows.Next() {
		var r PgRole
		var validUntil sql.NullString
		var memberOf, members []string

		if err := rows.Scan(
			&r.OID, &r.Name, &r.IsSuperuser, &r.InheritPrivs,
			&r.CanCreateRole, &r.CanCreateDB, &r.CanLogin,
			&r.IsReplication, &r.BypassRLS, &r.ConnLimit,
			&validUntil,
			pgArray(&memberOf),
			pgArray(&members),
		); err != nil {
			return nil, fmt.Errorf("PgGetAllRoles scan: %w", err)
		}

		if validUntil.Valid {
			r.ValidUntil = &validUntil.String
		}
		r.MemberOf = memberOf
		r.Members = members
		r.IsPredefined = strings.HasPrefix(r.Name, "pg_")
		roles = append(roles, r)
	}
	return roles, rows.Err()
}

// ─── Object Privileges ────────────────────────────────────────────────────────

// PgGetTablePrivilegesForRole returns table/view-level grants for a role.
func (c *Client) PgGetTablePrivilegesForRole(ctx context.Context, roleName string) ([]PgObjectPrivilege, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	const q = `
SELECT tp.table_schema, tp.table_name, COALESCE(t.table_type, 'BASE TABLE'),
       tp.grantee, tp.grantor, tp.privilege_type, tp.is_grantable
FROM information_schema.table_privileges tp
LEFT JOIN information_schema.tables t
  ON t.table_schema = tp.table_schema AND t.table_name = tp.table_name
WHERE tp.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND (
    tp.grantee = $1
    OR (
      tp.grantee <> 'PUBLIC'
      AND EXISTS (
        SELECT 1 FROM pg_roles rr
        WHERE rr.rolname = tp.grantee
          AND pg_has_role($1, rr.oid, 'USAGE')
      )
    )
  )
ORDER BY tp.table_schema, tp.table_name, tp.privilege_type, tp.grantee;`

	rows, err := db.QueryContext(qCtx, q, roleName)
	if err != nil {
		return nil, fmt.Errorf("PgGetTablePrivilegesForRole query: %w", err)
	}
	defer rows.Close()

	var privs []PgObjectPrivilege
	for rows.Next() {
		var p PgObjectPrivilege
		var tableType, isGrantable string
		if err := rows.Scan(&p.ObjectSchema, &p.ObjectName, &tableType, &p.Grantee, &p.Grantor, &p.PrivilegeType, &isGrantable); err != nil {
			return nil, fmt.Errorf("PgGetTablePrivilegesForRole scan: %w", err)
		}
		if tableType == "VIEW" {
			p.ObjectType = "view"
		} else {
			p.ObjectType = "table"
		}
		p.IsGrantable = isGrantable == "YES"
		privs = append(privs, p)
	}
	return privs, rows.Err()
}

// PgGetSchemaPrivilegesForRole returns schema-level ACL entries (direct and inherited) for a role.
func (c *Client) PgGetSchemaPrivilegesForRole(ctx context.Context, roleName string) ([]PgSchemaPrivilege, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	const q = `
SELECT
    n.nspname,
    CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE acl.grantee::regrole::text END,
    CASE WHEN acl.grantor = 0 THEN 'PUBLIC' ELSE acl.grantor::regrole::text END,
    acl.privilege_type,
    acl.is_grantable
FROM pg_namespace n
CROSS JOIN LATERAL aclexplode(n.nspacl) AS acl
WHERE n.nspacl IS NOT NULL
  AND (
    (acl.grantee <> 0 AND acl.grantee::regrole::text = $1)
    OR (acl.grantee <> 0 AND pg_has_role($1, acl.grantee, 'USAGE'))
  )
ORDER BY n.nspname;`

	rows, err := db.QueryContext(qCtx, q, roleName)
	if err != nil {
		return nil, fmt.Errorf("PgGetSchemaPrivilegesForRole query: %w", err)
	}
	defer rows.Close()

	var privs []PgSchemaPrivilege
	for rows.Next() {
		var p PgSchemaPrivilege
		if err := rows.Scan(&p.SchemaName, &p.Grantee, &p.Grantor, &p.PrivilegeType, &p.IsGrantable); err != nil {
			return nil, fmt.Errorf("PgGetSchemaPrivilegesForRole scan: %w", err)
		}
		privs = append(privs, p)
	}
	return privs, rows.Err()
}

// PgGetDatabasePrivilegesForRole returns database-level ACL entries (direct and inherited) for a role.
func (c *Client) PgGetDatabasePrivilegesForRole(ctx context.Context, roleName string) ([]PgDatabasePrivilege, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	const q = `
SELECT
    d.datname,
    CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE acl.grantee::regrole::text END,
    CASE WHEN acl.grantor = 0 THEN 'PUBLIC' ELSE acl.grantor::regrole::text END,
    acl.privilege_type,
    acl.is_grantable
FROM pg_database d
CROSS JOIN LATERAL aclexplode(d.datacl) AS acl
WHERE d.datacl IS NOT NULL
  AND (
    (acl.grantee <> 0 AND acl.grantee::regrole::text = $1)
    OR (acl.grantee <> 0 AND pg_has_role($1, acl.grantee, 'USAGE'))
  )
ORDER BY d.datname;`

	rows, err := db.QueryContext(qCtx, q, roleName)
	if err != nil {
		return nil, fmt.Errorf("PgGetDatabasePrivilegesForRole query: %w", err)
	}
	defer rows.Close()

	var privs []PgDatabasePrivilege
	for rows.Next() {
		var p PgDatabasePrivilege
		if err := rows.Scan(&p.DatabaseName, &p.Grantee, &p.Grantor, &p.PrivilegeType, &p.IsGrantable); err != nil {
			return nil, fmt.Errorf("PgGetDatabasePrivilegesForRole scan: %w", err)
		}
		privs = append(privs, p)
	}
	return privs, rows.Err()
}

// PgGetColumnPrivileges returns column-level grants for a specific role + table.
func (c *Client) PgGetColumnPrivileges(ctx context.Context, roleName, schema, table string) ([]PgColumnPrivilege, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	const q = `
SELECT table_schema, table_name, column_name, privilege_type, is_grantable
FROM information_schema.column_privileges
WHERE grantee = $1
  AND ($2 = '' OR table_schema = $2)
  AND ($3 = '' OR table_name = $3)
ORDER BY table_schema, table_name, column_name, privilege_type;`

	rows, err := db.QueryContext(qCtx, q, roleName, schema, table)
	if err != nil {
		return nil, fmt.Errorf("PgGetColumnPrivileges query: %w", err)
	}
	defer rows.Close()

	var privs []PgColumnPrivilege
	for rows.Next() {
		var p PgColumnPrivilege
		var isGrantable string
		if err := rows.Scan(&p.TableSchema, &p.TableName, &p.ColumnName, &p.PrivilegeType, &isGrantable); err != nil {
			return nil, fmt.Errorf("PgGetColumnPrivileges scan: %w", err)
		}
		p.Grantee = roleName
		p.IsGrantable = isGrantable == "YES"
		privs = append(privs, p)
	}
	return privs, rows.Err()
}

// PgGetTableColumns returns all column names of a given table/view ordered by ordinal position.
func (c *Client) PgGetTableColumns(ctx context.Context, schema, table string) ([]string, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	const q = `
SELECT column_name
FROM information_schema.columns
WHERE table_schema = $1
  AND table_name = $2
ORDER BY ordinal_position;`

	rows, err := db.QueryContext(qCtx, q, schema, table)
	if err != nil {
		return nil, fmt.Errorf("PgGetTableColumns query: %w", err)
	}
	defer rows.Close()

	cols := make([]string, 0)
	for rows.Next() {
		var col string
		if err := rows.Scan(&col); err != nil {
			return nil, fmt.Errorf("PgGetTableColumns scan: %w", err)
		}
		cols = append(cols, col)
	}
	return cols, rows.Err()
}

// PgGetSequencePrivilegesForRole returns sequence-level ACL entries for a role.
func (c *Client) PgGetSequencePrivilegesForRole(ctx context.Context, roleName string) ([]PgObjectPrivilege, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	const q = `
SELECT
    n.nspname,
    c.relname,
    CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE acl.grantee::regrole::text END,
    CASE WHEN acl.grantor = 0 THEN 'PUBLIC' ELSE acl.grantor::regrole::text END,
    acl.privilege_type,
    acl.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
WHERE c.relkind = 'S'
  AND c.relacl IS NOT NULL
  AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND (
    (acl.grantee <> 0 AND acl.grantee::regrole::text = $1)
    OR (acl.grantee <> 0 AND pg_has_role($1, acl.grantee, 'USAGE'))
  )
ORDER BY n.nspname, c.relname, acl.privilege_type;`

	rows, err := db.QueryContext(qCtx, q, roleName)
	if err != nil {
		return nil, fmt.Errorf("PgGetSequencePrivilegesForRole query: %w", err)
	}
	defer rows.Close()

	privs := make([]PgObjectPrivilege, 0)
	for rows.Next() {
		var p PgObjectPrivilege
		if err := rows.Scan(&p.ObjectSchema, &p.ObjectName, &p.Grantee, &p.Grantor, &p.PrivilegeType, &p.IsGrantable); err != nil {
			return nil, fmt.Errorf("PgGetSequencePrivilegesForRole scan: %w", err)
		}
		p.ObjectType = "sequence"
		privs = append(privs, p)
	}
	return privs, rows.Err()
}

// PgGetFunctionPrivilegesForRole returns function/procedure EXECUTE grants (direct and inherited) for a role.
func (c *Client) PgGetFunctionPrivilegesForRole(ctx context.Context, roleName string) ([]PgObjectPrivilege, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	const q = `
SELECT
    n.nspname,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig,
    CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS obj_type,
    CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE acl.grantee::regrole::text END,
    CASE WHEN acl.grantor = 0 THEN 'PUBLIC' ELSE acl.grantor::regrole::text END,
    acl.privilege_type,
    acl.is_grantable
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(p.proacl) AS acl
WHERE p.proacl IS NOT NULL
  AND p.prokind IN ('f', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND (
    (acl.grantee <> 0 AND acl.grantee::regrole::text = $1)
    OR (acl.grantee <> 0 AND pg_has_role($1, acl.grantee, 'USAGE'))
  )
ORDER BY n.nspname, sig;`

	rows, err := db.QueryContext(qCtx, q, roleName)
	if err != nil {
		return nil, fmt.Errorf("PgGetFunctionPrivilegesForRole query: %w", err)
	}
	defer rows.Close()

	privs := make([]PgObjectPrivilege, 0)
	for rows.Next() {
		var p PgObjectPrivilege
		if err := rows.Scan(&p.ObjectSchema, &p.ObjectName, &p.ObjectType, &p.Grantee, &p.Grantor, &p.PrivilegeType, &p.IsGrantable); err != nil {
			return nil, fmt.Errorf("PgGetFunctionPrivilegesForRole scan: %w", err)
		}
		privs = append(privs, p)
	}
	return privs, rows.Err()
}

// PgGetSecurableObjects returns all databases, user schemas, tables/views, sequences, and functions.
func (c *Client) PgGetSecurableObjects(ctx context.Context) (*PgSecurableCatalog, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	cat := &PgSecurableCatalog{
		Databases: make([]string, 0),
		Schemas:   make([]string, 0),
		Tables:    make([]PgSecurableObject, 0),
		Sequences: make([]PgSecurableObject, 0),
		Functions: make([]PgSecurableObject, 0),
	}

	if rows, err := db.QueryContext(qCtx, `SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname;`); err == nil {
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err == nil {
				cat.Databases = append(cat.Databases, name)
			}
		}
		rows.Close()
	}

	if rows, err := db.QueryContext(qCtx, `
SELECT nspname
FROM pg_namespace
WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND nspname NOT LIKE 'pg_temp_%'
  AND nspname NOT LIKE 'pg_toast_temp_%'
ORDER BY nspname;`); err == nil {
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err == nil {
				cat.Schemas = append(cat.Schemas, name)
			}
		}
		rows.Close()
	}

	if rows, err := db.QueryContext(qCtx, `
SELECT
    n.nspname,
    c.relname,
    CASE c.relkind
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
        WHEN 'f' THEN 'foreign_table'
        ELSE 'table'
    END AS obj_type,
    COALESCE(pg_get_userbyid(c.relowner), '') AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND n.nspname NOT LIKE 'pg_temp_%'
ORDER BY n.nspname, c.relname;`); err == nil {
		for rows.Next() {
			var o PgSecurableObject
			if err := rows.Scan(&o.Schema, &o.Name, &o.ObjectType, &o.Owner); err == nil {
				cat.Tables = append(cat.Tables, o)
			}
		}
		rows.Close()
	}

	if rows, err := db.QueryContext(qCtx, `
SELECT
    n.nspname,
    c.relname,
    'sequence' AS obj_type,
    COALESCE(pg_get_userbyid(c.relowner), '') AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'S'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND n.nspname NOT LIKE 'pg_temp_%'
ORDER BY n.nspname, c.relname;`); err == nil {
		for rows.Next() {
			var o PgSecurableObject
			if err := rows.Scan(&o.Schema, &o.Name, &o.ObjectType, &o.Owner); err == nil {
				cat.Sequences = append(cat.Sequences, o)
			}
		}
		rows.Close()
	}

	if rows, err := db.QueryContext(qCtx, `
SELECT
    n.nspname,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig,
    CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS obj_type,
    COALESCE(pg_get_userbyid(p.proowner), '') AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prokind IN ('f', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND n.nspname NOT LIKE 'pg_temp_%'
ORDER BY n.nspname, sig;`); err == nil {
		for rows.Next() {
			var o PgSecurableObject
			if err := rows.Scan(&o.Schema, &o.Name, &o.ObjectType, &o.Owner); err == nil {
				cat.Functions = append(cat.Functions, o)
			}
		}
		rows.Close()
	}

	return cat, nil
}

// ─── Default Privileges ───────────────────────────────────────────────────────

// PgGetDefaultPrivileges returns all ALTER DEFAULT PRIVILEGES rules.
func (c *Client) PgGetDefaultPrivileges(ctx context.Context) ([]PgDefaultPrivilege, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	// defaclobjtype: r=table, S=sequence, f=function, T=type, n=schema, p=procedure
	const q = `
SELECT
    pg_get_userbyid(d.defaclrole) AS for_role,
    n.nspname AS in_schema,
    CASE d.defaclobjtype
        WHEN 'r' THEN 'TABLE'
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'f' THEN 'FUNCTION'
        WHEN 'T' THEN 'TYPE'
        WHEN 'n' THEN 'SCHEMA'
        WHEN 'p' THEN 'PROCEDURE'
        ELSE d.defaclobjtype::text
    END AS object_type,
    acl.grantee::regrole::text AS grantee,
    acl.privilege_type,
    acl.is_grantable
FROM pg_default_acl d
CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE d.defaclacl IS NOT NULL
ORDER BY for_role, object_type, grantee;`

	rows, err := db.QueryContext(qCtx, q)
	if err != nil {
		return nil, fmt.Errorf("PgGetDefaultPrivileges query: %w", err)
	}
	defer rows.Close()

	var items []PgDefaultPrivilege
	for rows.Next() {
		var item PgDefaultPrivilege
		var inSchema sql.NullString
		if err := rows.Scan(&item.ForRole, &inSchema, &item.ObjectType, &item.Grantee, &item.Privilege, &item.IsGrantable); err != nil {
			return nil, fmt.Errorf("PgGetDefaultPrivileges scan: %w", err)
		}
		if inSchema.Valid {
			item.InSchema = &inSchema.String
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// ─── Row-Level Security ────────────────────────────────────────────────────────

// PgGetRLSPolicies returns all RLS policies in the connected database.
func (c *Client) PgGetRLSPolicies(ctx context.Context) ([]PgRLSPolicy, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	const q = `
SELECT
    p.polname,
    n.nspname,
    c.relname,
    CASE p.polcmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        ELSE 'ALL'
    END AS polcmd,
    p.polpermissive,
    COALESCE(
        ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles)),
        '{}'::text[]
    ) AS roles,
    pg_get_expr(p.polqual, p.polrelid)      AS using_expr,
    pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
ORDER BY n.nspname, c.relname, p.polname;`

	rows, err := db.QueryContext(qCtx, q)
	if err != nil {
		return nil, fmt.Errorf("PgGetRLSPolicies query: %w", err)
	}
	defer rows.Close()

	var policies []PgRLSPolicy
	for rows.Next() {
		var pol PgRLSPolicy
		var usingExpr, checkExpr sql.NullString
		var roles []string
		if err := rows.Scan(
			&pol.PolicyName, &pol.TableSchema, &pol.TableName,
			&pol.Command, &pol.Permissive,
			pgArray(&roles),
			&usingExpr, &checkExpr,
		); err != nil {
			return nil, fmt.Errorf("PgGetRLSPolicies scan: %w", err)
		}
		if usingExpr.Valid {
			pol.UsingExpr = &usingExpr.String
		}
		if checkExpr.Valid {
			pol.CheckExpr = &checkExpr.String
		}
		pol.Roles = roles
		policies = append(policies, pol)
	}
	return policies, rows.Err()
}

// PgGetRLSTableStatuses returns RLS enabled/force status for all tables.
func (c *Client) PgGetRLSTableStatuses(ctx context.Context) ([]PgRLSTableStatus, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	const q = `
SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
ORDER BY n.nspname, c.relname;`

	rows, err := db.QueryContext(qCtx, q)
	if err != nil {
		return nil, fmt.Errorf("PgGetRLSTableStatuses query: %w", err)
	}
	defer rows.Close()

	var statuses []PgRLSTableStatus
	for rows.Next() {
		var s PgRLSTableStatus
		if err := rows.Scan(&s.TableSchema, &s.TableName, &s.RLSEnabled, &s.ForceRLS); err != nil {
			return nil, fmt.Errorf("PgGetRLSTableStatuses scan: %w", err)
		}
		statuses = append(statuses, s)
	}
	return statuses, rows.Err()
}

// ─── Foreign Data Wrappers & Servers ──────────────────────────────────────────

// PgGetForeignDataWrappers returns all FDW definitions.
func (c *Client) PgGetForeignDataWrappers(ctx context.Context) ([]PgForeignDataWrapper, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	const q = `
SELECT
    fdw.fdwname,
    pg_get_userbyid(fdw.fdwowner) AS owner,
    p1.proname AS handler,
    p2.proname AS validator,
    COALESCE(
        ARRAY(SELECT acl_item::text FROM unnest(fdw.fdwacl) AS acl_item),
        '{}'::text[]
    ) AS acl
FROM pg_foreign_data_wrapper fdw
LEFT JOIN pg_proc p1 ON p1.oid = fdw.fdwhandler
LEFT JOIN pg_proc p2 ON p2.oid = fdw.fdwvalidator
ORDER BY fdw.fdwname;`

	rows, err := db.QueryContext(qCtx, q)
	if err != nil {
		return nil, fmt.Errorf("PgGetForeignDataWrappers query: %w", err)
	}
	defer rows.Close()

	var fdws []PgForeignDataWrapper
	for rows.Next() {
		var fdw PgForeignDataWrapper
		var handler, validator sql.NullString
		var acl []string
		if err := rows.Scan(&fdw.Name, &fdw.Owner, &handler, &validator, pgArray(&acl)); err != nil {
			return nil, fmt.Errorf("PgGetForeignDataWrappers scan: %w", err)
		}
		if handler.Valid {
			fdw.Handler = &handler.String
		}
		if validator.Valid {
			fdw.Validator = &validator.String
		}
		fdw.ACL = acl
		fdws = append(fdws, fdw)
	}
	return fdws, rows.Err()
}

// PgGetForeignServers returns all foreign server definitions.
func (c *Client) PgGetForeignServers(ctx context.Context) ([]PgForeignServer, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	const q = `
SELECT
    fs.oid,
    fs.srvname,
    fdw.fdwname,
    fs.srvtype,
    fs.srvversion,
    COALESCE(fs.srvoptions, '{}'::text[]) AS srvoptions,
    COALESCE(
        ARRAY(SELECT acl_item::text FROM unnest(fs.srvacl) AS acl_item),
        '{}'::text[]
    ) AS acl
FROM pg_foreign_server fs
JOIN pg_foreign_data_wrapper fdw ON fdw.oid = fs.srvfdw
ORDER BY fs.srvname;`

	rows, err := db.QueryContext(qCtx, q)
	if err != nil {
		return nil, fmt.Errorf("PgGetForeignServers query: %w", err)
	}
	defer rows.Close()

	var servers []PgForeignServer
	for rows.Next() {
		var srv PgForeignServer
		var srvType, srvVersion sql.NullString
		var options, acl []string
		if err := rows.Scan(&srv.OID, &srv.Name, &srv.FDWName, &srvType, &srvVersion, pgArray(&options), pgArray(&acl)); err != nil {
			return nil, fmt.Errorf("PgGetForeignServers scan: %w", err)
		}
		if srvType.Valid {
			srv.Type = &srvType.String
		}
		if srvVersion.Valid {
			srv.Version = &srvVersion.String
		}
		srv.Options = parseKeyValueArray(options)
		srv.ACL = acl
		servers = append(servers, srv)
	}
	return servers, rows.Err()
}

// PgGetUserMappings returns all user mappings for a given foreign server.
// Passwords in options are redacted.
func (c *Client) PgGetUserMappings(ctx context.Context, serverName string) ([]PgUserMapping, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	const q = `
SELECT
    srvname,
    COALESCE(usename, 'PUBLIC') AS local_role,
    COALESCE(umoptions, '{}'::text[]) AS options
FROM pg_user_mappings
WHERE ($1 = '' OR srvname = $1)
ORDER BY srvname, local_role;`

	rows, err := db.QueryContext(qCtx, q, serverName)
	if err != nil {
		return nil, fmt.Errorf("PgGetUserMappings query: %w", err)
	}
	defer rows.Close()

	var mappings []PgUserMapping
	for rows.Next() {
		var m PgUserMapping
		var options []string
		if err := rows.Scan(&m.ServerName, &m.LocalRole, pgArray(&options)); err != nil {
			return nil, fmt.Errorf("PgGetUserMappings scan: %w", err)
		}
		opts := parseKeyValueArray(options)
		// Redact password
		if _, hasPass := opts["password"]; hasPass {
			opts["password"] = "●●●●●●●●"
		}
		m.Options = opts
		mappings = append(mappings, m)
	}
	return mappings, rows.Err()
}

// ─── Per-Role Parameter Settings ──────────────────────────────────────────────

// PgGetRoleParamSettings returns all ALTER ROLE SET overrides for a role (or all roles if roleName="").
func (c *Client) PgGetRoleParamSettings(ctx context.Context, roleName string) ([]PgRoleParamSetting, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	qCtx, cancel := rbacCtx(ctx)
	defer cancel()

	const q = `
SELECT
    COALESCE(r.rolname, 'PUBLIC') AS rolname,
    d.datname,
    s.setconfig
FROM pg_db_role_setting s
LEFT JOIN pg_roles r ON r.oid = s.setrole
LEFT JOIN pg_database d ON d.oid = s.setdatabase
WHERE ($1 = '' OR r.rolname = $1)
ORDER BY rolname, d.datname;`

	rows, err := db.QueryContext(qCtx, q, roleName)
	if err != nil {
		return nil, fmt.Errorf("PgGetRoleParamSettings query: %w", err)
	}
	defer rows.Close()

	var settings []PgRoleParamSetting
	for rows.Next() {
		var rName string
		var datName sql.NullString
		var config []string
		if err := rows.Scan(&rName, &datName, pgArray(&config)); err != nil {
			return nil, fmt.Errorf("PgGetRoleParamSettings scan: %w", err)
		}
		for _, kv := range config {
			parts := strings.SplitN(kv, "=", 2)
			if len(parts) != 2 {
				continue
			}
			s := PgRoleParamSetting{
				RoleName:  rName,
				ParamName: parts[0],
				Value:     parts[1],
			}
			if datName.Valid {
				s.Database = &datName.String
			}
			settings = append(settings, s)
		}
	}
	return settings, rows.Err()
}

// ─── RBAC Overview ────────────────────────────────────────────────────────────

// PgGetRbacOverview fetches top-level RBAC data: roles + FDWs + foreign servers.
func (c *Client) PgGetRbacOverview(ctx context.Context) (*PgRbacOverview, error) {
	roles, err := c.PgGetAllRoles(ctx)
	if err != nil {
		return nil, err
	}
	if roles == nil {
		roles = []PgRole{}
	}
	fdws, err := c.PgGetForeignDataWrappers(ctx)
	if err != nil || fdws == nil {
		fdws = []PgForeignDataWrapper{}
	}
	servers, err := c.PgGetForeignServers(ctx)
	if err != nil || servers == nil {
		servers = []PgForeignServer{}
	}
	catalog, _ := c.PgGetSecurableObjects(ctx)
	return &PgRbacOverview{
		Roles:   roles,
		FDWs:    fdws,
		Servers: servers,
		Catalog: catalog,
	}, nil
}

// ─── Security Audit ───────────────────────────────────────────────────────────

// PgRunSecurityAudit executes all security checks and returns findings.
func (c *Client) PgRunSecurityAudit(ctx context.Context) ([]SecurityAuditFinding, error) {
	roles, err := c.PgGetAllRoles(ctx)
	if err != nil {
		return nil, err
	}

	var findings []SecurityAuditFinding

	// Check 1: CRITICAL — Superuser roles with LOGIN
	var superLogins []string
	for _, r := range roles {
		if r.IsSuperuser && r.CanLogin {
			superLogins = append(superLogins, r.Name)
		}
	}
	if len(superLogins) > 0 {
		findings = append(findings, SecurityAuditFinding{
			CheckName:     "superuser_with_login",
			Severity:      "CRITICAL",
			Title:         "Superuser roles with LOGIN privilege",
			Description:   "Roles with SUPERUSER + LOGIN can bypass all auditing, row-level security, and privilege checks. Create a dedicated NOLOGIN superuser for internal use and restrict direct login.",
			AffectedItems: superLogins,
			FixDDL:        buildRevokeSuperuserLoginDDL(superLogins),
		})
	}

	// Check 2: CRITICAL — BYPASSRLS on non-superuser login roles
	var bypassRLSRoles []string
	for _, r := range roles {
		if r.BypassRLS && !r.IsSuperuser && r.CanLogin {
			bypassRLSRoles = append(bypassRLSRoles, r.Name)
		}
	}
	if len(bypassRLSRoles) > 0 {
		findings = append(findings, SecurityAuditFinding{
			CheckName:     "bypassrls_non_superuser",
			Severity:      "CRITICAL",
			Title:         "Non-superuser login roles with BYPASSRLS",
			Description:   "BYPASSRLS on a login role completely defeats Row-Level Security policies, exposing all data to that role regardless of policies defined.",
			AffectedItems: bypassRLSRoles,
			FixDDL:        buildRevokeBypassRLSDDL(bypassRLSRoles),
		})
	}

	// Check 3: HIGH — Dangerous OS-escape roles granted
	dangerousRoles := []string{"pg_read_server_files", "pg_write_server_files", "pg_execute_server_program"}
	for _, r := range roles {
		for _, m := range r.MemberOf {
			for _, danger := range dangerousRoles {
				if m == danger {
					findings = append(findings, SecurityAuditFinding{
						CheckName:     "dangerous_pg_role_granted",
						Severity:      "HIGH",
						Title:         fmt.Sprintf("Dangerous role %s granted to %s", danger, r.Name),
						Description:   fmt.Sprintf("%s grants file system access to the PostgreSQL server. Unless intentional, this is a critical security risk.", danger),
						AffectedItems: []string{fmt.Sprintf("%s MEMBER OF %s", r.Name, danger)},
						FixDDL:        fmt.Sprintf("REVOKE %s FROM %s;", danger, r.Name),
					})
				}
			}
		}
	}

	// Check 4: MEDIUM — Login roles with no connection limit
	var noLimitLogins []string
	for _, r := range roles {
		if r.CanLogin && r.ConnLimit == -1 && !r.IsSuperuser {
			noLimitLogins = append(noLimitLogins, r.Name)
		}
	}
	if len(noLimitLogins) > 0 {
		findings = append(findings, SecurityAuditFinding{
			CheckName:     "no_connection_limit",
			Severity:      "MEDIUM",
			Title:         "Login roles with no connection limit",
			Description:   "Roles without a CONNECTION LIMIT can exhaust the server's max_connections during abnormal load or connection leaks.",
			AffectedItems: noLimitLogins,
			FixDDL:        buildSetConnLimitDDL(noLimitLogins),
		})
	}

	// Check 5: MEDIUM — Roles with CREATEROLE (privilege escalation risk)
	var createRoleRoles []string
	for _, r := range roles {
		if r.CanCreateRole && !r.IsSuperuser {
			createRoleRoles = append(createRoleRoles, r.Name)
		}
	}
	if len(createRoleRoles) > 0 {
		findings = append(findings, SecurityAuditFinding{
			CheckName:     "createrole_non_superuser",
			Severity:      "MEDIUM",
			Title:         "Non-superuser roles with CREATEROLE",
			Description:   "CREATEROLE allows the holder to create and manage roles, including granting themselves new privileges. Ensure this is intentional.",
			AffectedItems: createRoleRoles,
			FixDDL:        "-- Review each role; to revoke:\n" + buildRevokeCreateRoleDDL(createRoleRoles),
		})
	}

	// Check 6: HIGH — Roles with REPLICATION privilege
	var replRoles []string
	for _, r := range roles {
		if r.IsReplication && r.CanLogin && !r.IsSuperuser {
			replRoles = append(replRoles, r.Name)
		}
	}
	if len(replRoles) > 0 {
		findings = append(findings, SecurityAuditFinding{
			CheckName:     "replication_login_roles",
			Severity:      "HIGH",
			Title:         "Login roles with REPLICATION privilege",
			Description:   "Replication roles can stream all WAL data from the server. Confirm these are intentional replication accounts with strong passwords and VALID UNTIL set.",
			AffectedItems: replRoles,
			FixDDL:        "-- Confirm each role is legitimate replication account;\n-- Set password expiry: ALTER ROLE <role> VALID UNTIL '2027-12-31';",
		})
	}

	// Check 7: INFO — Predefined pg_* roles in use
	var predefinedInUse []string
	for _, r := range roles {
		if r.IsPredefined && len(r.Members) > 0 {
			predefinedInUse = append(predefinedInUse, fmt.Sprintf("%s → %s", r.Name, strings.Join(r.Members, ", ")))
		}
	}
	if len(predefinedInUse) > 0 {
		findings = append(findings, SecurityAuditFinding{
			CheckName:     "predefined_roles_in_use",
			Severity:      "INFO",
			Title:         "Predefined pg_* roles in use (inventory)",
			Description:   "These predefined roles are granted to application roles. Verify each is appropriate for the role's intended access level.",
			AffectedItems: predefinedInUse,
			FixDDL:        "-- No action required — informational only.",
		})
	}

	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db != nil {
		qCtx, cancel := rbacCtx(ctx)
		defer cancel()

		// Check 8: CRITICAL — PUBLIC CREATE privilege on public schema (PG < 15 or manually granted)
		var hasPublicCreate bool
		errPublic := db.QueryRowContext(qCtx, `
SELECT EXISTS (
  SELECT 1
  FROM pg_namespace n
  CROSS JOIN LATERAL aclexplode(n.nspacl) AS acl
  WHERE n.nspname = 'public'
    AND acl.grantee = 0
    AND acl.privilege_type = 'CREATE'
);`).Scan(&hasPublicCreate)
		if errPublic == nil && hasPublicCreate {
			findings = append(findings, SecurityAuditFinding{
				CheckName:     "public_schema_create",
				Severity:      "CRITICAL",
				Title:         "PUBLIC holds CREATE privilege on schema public",
				Description:   "Any database role can create objects in the public schema, enabling object-shadowing attacks (especially with default search_path).",
				AffectedItems: []string{"public schema (grantee: PUBLIC, privilege: CREATE)"},
				FixDDL:        "REVOKE CREATE ON SCHEMA public FROM PUBLIC;",
			})
		}

		// Check 9: HIGH — SECURITY DEFINER functions without pinned search_path
		if rows, errSec := db.QueryContext(qCtx, `
SELECT n.nspname, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef = true
  AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND NOT EXISTS (
    SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}'::text[])) AS cfg
    WHERE cfg LIKE 'search_path=%'
  )
ORDER BY n.nspname, sig;`); errSec == nil {
			var secDefItems []string
			var secDefFix strings.Builder
			for rows.Next() {
				var sch, sig string
				if err := rows.Scan(&sch, &sig); err == nil {
					secDefItems = append(secDefItems, sch+"."+sig)
					secDefFix.WriteString(fmt.Sprintf("ALTER FUNCTION %s.%s SET search_path = pg_catalog, %s;\n", pgQuoteIdent(sch), sig, pgQuoteIdent(sch)))
				}
			}
			rows.Close()
			if len(secDefItems) > 0 {
				findings = append(findings, SecurityAuditFinding{
					CheckName:     "secdef_without_search_path",
					Severity:      "HIGH",
					Title:         "SECURITY DEFINER functions missing fixed search_path",
					Description:   "SECURITY DEFINER functions without SET search_path are vulnerable to search_path hijacking by callers who control temp or user schemas.",
					AffectedItems: secDefItems,
					FixDDL:        secDefFix.String(),
				})
			}
		}

		// Check 10: HIGH — Weak pg_hba.conf authentication methods (trust / md5)
		if rows, errHba := db.QueryContext(qCtx, `
SELECT line_number, type, COALESCE(array_to_string(database, ','), 'all'), COALESCE(array_to_string(user_name, ','), 'all'), COALESCE(address, 'local'), auth_method
FROM pg_hba_file_rules
WHERE auth_method IN ('trust', 'md5')
ORDER BY line_number;`); errHba == nil {
			var hbaItems []string
			for rows.Next() {
				var line int
				var hbaType, dbs, users, addr, method string
				if err := rows.Scan(&line, &hbaType, &dbs, &users, &addr, &method); err == nil {
					hbaItems = append(hbaItems, fmt.Sprintf("line %d: %s db=%s user=%s addr=%s method=%s", line, hbaType, dbs, users, addr, method))
				}
			}
			rows.Close()
			if len(hbaItems) > 0 {
				findings = append(findings, SecurityAuditFinding{
					CheckName:     "weak_hba_auth",
					Severity:      "HIGH",
					Title:         "Weak pg_hba.conf auth rules (trust / md5)",
					Description:   "trust bypasses password checks and md5 is cryptographically weak. Upgrade pg_hba.conf rules to scram-sha-256 and run SELECT pg_reload_conf();.",
					AffectedItems: hbaItems,
					FixDDL:        "-- Update matching lines in pg_hba.conf to scram-sha-256, then reload config:\nSELECT pg_reload_conf();",
				})
			}
		}

		// Check 11: INFO — Expired login/role accounts (VALID UNTIL < now())
		if rows, errExp := db.QueryContext(qCtx, `
SELECT rolname, rolvaliduntil::text
FROM pg_roles
WHERE rolvaliduntil IS NOT NULL
  AND rolvaliduntil < now()
ORDER BY rolname;`); errExp == nil {
			var expItems []string
			var expFix strings.Builder
			for rows.Next() {
				var rName, validUntil string
				if err := rows.Scan(&rName, &validUntil); err == nil {
					expItems = append(expItems, fmt.Sprintf("%s (expired %s)", rName, validUntil))
					expFix.WriteString(fmt.Sprintf("-- ALTER ROLE %s VALID UNTIL '2027-12-31';\n", pgQuoteIdent(rName)))
				}
			}
			rows.Close()
			if len(expItems) > 0 {
				findings = append(findings, SecurityAuditFinding{
					CheckName:     "expired_roles",
					Severity:      "INFO",
					Title:         "Roles with expired VALID UNTIL timestamp",
					Description:   "These roles have passed their VALID UNTIL deadline and can no longer authenticate (or should be cleaned up).",
					AffectedItems: expItems,
					FixDDL:        expFix.String(),
				})
			}
		}
	}

	return findings, nil
}

// ─── Role Impersonation ───────────────────────────────────────────────────────

// PgRunImpersonatedQuery runs a query in a temporary connection with SET ROLE applied.
// It always resets the role before closing the connection, even on error.
func (c *Client) PgRunImpersonatedQuery(ctx context.Context, roleName, query string) (*PgQueryResult, error) {
	c.mu.RLock()
	db := c.db
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}
	return runImpersonatedQueryOnDB(ctx, db, roleName, query)
}

// PgRunImpersonatedQueryInDB runs an impersonated query against a specific target database.
func (c *Client) PgRunImpersonatedQueryInDB(ctx context.Context, roleName, dbName, query string) (*PgQueryResult, error) {
	c.mu.RLock()
	db := c.db
	cfg := c.config
	c.mu.RUnlock()
	if db == nil {
		return nil, fmt.Errorf("no active database connection")
	}

	targetDB := strings.TrimSpace(dbName)
	if targetDB == "" || strings.EqualFold(targetDB, strings.TrimSpace(cfg.Database)) {
		return runImpersonatedQueryOnDB(ctx, db, roleName, query)
	}

	cfg.Database = targetDB
	connStr := buildPostgresConnStr(cfg, "PlanIQ-RBAC-Sandbox")
	tempDB, err := sql.Open("pgx", connStr)
	if err != nil {
		return &PgQueryResult{Error: fmt.Sprintf("open database %q: %v", targetDB, err)}, nil
	}
	defer tempDB.Close()

	return runImpersonatedQueryOnDB(ctx, tempDB, roleName, query)
}

func runImpersonatedQueryOnDB(ctx context.Context, db *sql.DB, roleName, query string) (*PgQueryResult, error) {
	qCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	conn, err := db.Conn(qCtx)
	if err != nil {
		return nil, fmt.Errorf("PgRunImpersonatedQuery acquire conn: %w", err)
	}
	defer func() {
		// Always reset role
		resetCtx, resetCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer resetCancel()
		_, _ = conn.ExecContext(resetCtx, "RESET ROLE")
		conn.Close()
	}()

	// SET ROLE
	if _, err := conn.ExecContext(qCtx, fmt.Sprintf("SET ROLE %s", pgQuoteIdent(roleName))); err != nil {
		return &PgQueryResult{Error: fmt.Sprintf("SET ROLE failed: %v", err)}, nil
	}

	rows, err := conn.QueryContext(qCtx, query)
	if err != nil {
		return &PgQueryResult{Error: err.Error()}, nil
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return &PgQueryResult{Error: err.Error()}, nil
	}

	result := &PgQueryResult{Columns: cols}
	scanBuf := make([]interface{}, len(cols))
	scanPtrs := make([]interface{}, len(cols))
	for i := range scanBuf {
		scanPtrs[i] = &scanBuf[i]
	}

	for rows.Next() {
		if err := rows.Scan(scanPtrs...); err != nil {
			result.Error = err.Error()
			return result, nil
		}
		row := make([]interface{}, len(cols))
		for i, v := range scanBuf {
			switch t := v.(type) {
			case []byte:
				row[i] = string(t)
			default:
				row[i] = t
			}
		}
		result.Rows = append(result.Rows, row)
	}
	result.RowsAffected = int64(len(result.Rows))
	return result, rows.Err()
}

// ─── DDL Execution ────────────────────────────────────────────────────────────

// PgExecuteRbacScript executes a DDL script on the connected database when Write for RBAC is enabled.
// Each statement runs inside a single READ WRITE transaction while keeping Live Radar read-only.
func (c *Client) PgExecuteRbacScript(ctx context.Context, ddl string) error {
	c.mu.RLock()
	db := c.db
	allowWrite := c.config.AllowRbacWrite
	c.mu.RUnlock()
	if !allowWrite {
		return fmt.Errorf("RBAC write access is disabled for this connection. Enable 'Write for RBAC' in Connections (and re-enter the password) to apply DDL")
	}
	if db == nil {
		return fmt.Errorf("no active database connection")
	}

	stmts := splitSQLStatements(ddl)
	if len(stmts) == 0 {
		return fmt.Errorf("no executable SQL statements found in DDL script")
	}

	execCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	tx, err := db.BeginTx(execCtx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	if _, err := tx.ExecContext(execCtx, "SET TRANSACTION READ WRITE"); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("enable read-write transaction: %w", err)
	}

	for _, stmt := range stmts {
		if _, err := tx.ExecContext(execCtx, stmt); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("execute DDL statement %q: %w", truncate(stmt, 80), err)
		}
	}
	return tx.Commit()
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

// pgTextArray implements sql.Scanner for PostgreSQL text[] literals returned by pgx/database/sql.
type pgTextArray struct {
	dest *[]string
}

// pgArray wraps a *[]string for Scan of text[] columns via database/sql.
func pgArray(dest *[]string) sql.Scanner {
	return &pgTextArray{dest: dest}
}

// Scan parses PostgreSQL text[] wire/text formats into *[]string.
func (a *pgTextArray) Scan(src interface{}) error {
	if a.dest == nil {
		return fmt.Errorf("pgTextArray: nil destination")
	}
	if src == nil {
		*a.dest = []string{}
		return nil
	}
	switch v := src.(type) {
	case []string:
		out := make([]string, len(v))
		copy(out, v)
		*a.dest = out
		return nil
	case []byte:
		parsed, err := parsePgTextArrayLiteral(string(v))
		if err != nil {
			return err
		}
		*a.dest = parsed
		return nil
	case string:
		parsed, err := parsePgTextArrayLiteral(v)
		if err != nil {
			return err
		}
		*a.dest = parsed
		return nil
	default:
		return fmt.Errorf("pgTextArray: unsupported source type %T", src)
	}
}

// parsePgTextArrayLiteral parses a PostgreSQL text array literal like {}, {a,b}, or {"a,b","c\"d"}.
func parsePgTextArrayLiteral(s string) ([]string, error) {
	s = strings.TrimSpace(s)
	if s == "" || s == "{}" {
		return []string{}, nil
	}
	if !strings.HasPrefix(s, "{") || !strings.HasSuffix(s, "}") {
		return nil, fmt.Errorf("pgTextArray: invalid array literal %q", truncate(s, 40))
	}
	inner := s[1 : len(s)-1]
	if inner == "" {
		return []string{}, nil
	}

	result := make([]string, 0)
	i := 0
	for i < len(inner) {
		if inner[i] == '"' {
			// Quoted element
			i++
			var sb strings.Builder
			closed := false
			for i < len(inner) {
				ch := inner[i]
				if ch == '\\' && i+1 < len(inner) {
					sb.WriteByte(inner[i+1])
					i += 2
					continue
				}
				if ch == '"' {
					closed = true
					i++
					break
				}
				sb.WriteByte(ch)
				i++
			}
			if !closed {
				return nil, fmt.Errorf("pgTextArray: unterminated quoted element in %q", truncate(s, 40))
			}
			result = append(result, sb.String())
			if i < len(inner) {
				if inner[i] != ',' {
					return nil, fmt.Errorf("pgTextArray: expected comma at pos %d", i)
				}
				i++
			}
		} else {
			// Unquoted element
			start := i
			for i < len(inner) && inner[i] != ',' {
				i++
			}
			token := inner[start:i]
			if !strings.EqualFold(token, "NULL") {
				result = append(result, token)
			}
			if i < len(inner) && inner[i] == ',' {
				i++
			}
		}
	}
	return result, nil
}

// parseKeyValueArray converts ["key=value", ...] into map[string]string.
func parseKeyValueArray(arr []string) map[string]string {
	m := make(map[string]string, len(arr))
	for _, kv := range arr {
		parts := strings.SplitN(kv, "=", 2)
		if len(parts) == 2 {
			m[parts[0]] = parts[1]
		}
	}
	return m
}

// splitSQLStatements splits a DDL script into individual statements on semicolons,
// ignoring semicolons and '--' comments inside single/double-quoted SQL literals/identifiers,
// and stripping '--' line comments outside quotes.
func splitSQLStatements(ddl string) []string {
	stmts := make([]string, 0)
	var buf strings.Builder
	inSingleQuote := false
	inDoubleQuote := false

	for i := 0; i < len(ddl); i++ {
		ch := ddl[i]

		if inSingleQuote {
			buf.WriteByte(ch)
			if ch == '\'' {
				if i+1 < len(ddl) && ddl[i+1] == '\'' {
					buf.WriteByte(ddl[i+1])
					i++
				} else {
					inSingleQuote = false
				}
			}
			continue
		}

		if inDoubleQuote {
			buf.WriteByte(ch)
			if ch == '"' {
				if i+1 < len(ddl) && ddl[i+1] == '"' {
					buf.WriteByte(ddl[i+1])
					i++
				} else {
					inDoubleQuote = false
				}
			}
			continue
		}

		// Outside quotes: check for '--' line comment
		if ch == '-' && i+1 < len(ddl) && ddl[i+1] == '-' {
			for i < len(ddl) && ddl[i] != '\n' {
				i++
			}
			if i < len(ddl) && ddl[i] == '\n' {
				buf.WriteByte('\n')
			}
			continue
		}

		if ch == '\'' {
			inSingleQuote = true
			buf.WriteByte(ch)
			continue
		}
		if ch == '"' {
			inDoubleQuote = true
			buf.WriteByte(ch)
			continue
		}

		if ch == ';' {
			if s := strings.TrimSpace(buf.String()); s != "" {
				stmts = append(stmts, s)
			}
			buf.Reset()
			continue
		}

		buf.WriteByte(ch)
	}

	if s := strings.TrimSpace(buf.String()); s != "" {
		stmts = append(stmts, s)
	}
	return stmts
}

// truncate shortens a string to max n bytes.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// pgQuoteIdent double-quotes a PostgreSQL identifier.
func pgQuoteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

// ─── DDL fix builders ─────────────────────────────────────────────────────────

func buildRevokeSuperuserLoginDDL(roles []string) string {
	var sb strings.Builder
	sb.WriteString("-- Option A: revoke superuser from login role (create a dedicated NOLOGIN superuser instead)\n")
	for _, r := range roles {
		if r == "postgres" {
			continue // never advise revoking from postgres
		}
		sb.WriteString(fmt.Sprintf("ALTER ROLE %s NOSUPERUSER;\n", pgQuoteIdent(r)))
	}
	return sb.String()
}

func buildRevokeBypassRLSDDL(roles []string) string {
	var sb strings.Builder
	for _, r := range roles {
		sb.WriteString(fmt.Sprintf("ALTER ROLE %s NOBYPASSRLS;\n", pgQuoteIdent(r)))
	}
	return sb.String()
}

func buildSetConnLimitDDL(roles []string) string {
	var sb strings.Builder
	sb.WriteString("-- Set an appropriate connection limit for each application role:\n")
	for _, r := range roles {
		sb.WriteString(fmt.Sprintf("ALTER ROLE %s CONNECTION LIMIT 20; -- adjust as needed\n", pgQuoteIdent(r)))
	}
	return sb.String()
}

func buildRevokeCreateRoleDDL(roles []string) string {
	var sb strings.Builder
	for _, r := range roles {
		sb.WriteString(fmt.Sprintf("ALTER ROLE %s NOCREATEROLE;\n", pgQuoteIdent(r)))
	}
	return sb.String()
}
