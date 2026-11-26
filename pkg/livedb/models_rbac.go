package livedb

// ─────────────────────────────────────────────────────────────────────────────
// PostgreSQL Security & RBAC Studio — Go Models
// ─────────────────────────────────────────────────────────────────────────────

// PgRole represents a database role (login or group) from pg_roles.
type PgRole struct {
	Name          string   `json:"name"`
	OID           int64    `json:"oid"`
	IsSuperuser   bool     `json:"isSuperuser"`
	InheritPrivs  bool     `json:"inheritPrivs"`
	CanCreateRole bool     `json:"canCreateRole"`
	CanCreateDB   bool     `json:"canCreateDB"`
	CanLogin      bool     `json:"canLogin"`
	IsReplication bool     `json:"isReplication"`
	BypassRLS     bool     `json:"bypassRLS"`
	ConnLimit     int      `json:"connLimit"`    // -1 = unlimited
	ValidUntil    *string  `json:"validUntil"`  // nil = never
	MemberOf      []string `json:"memberOf"`
	Members       []string `json:"members"`
	IsPredefined  bool     `json:"isPredefined"` // pg_* built-in roles
}

// PgObjectPrivilege represents a granted privilege on a database object.
type PgObjectPrivilege struct {
	ObjectSchema  string `json:"objectSchema"`
	ObjectName    string `json:"objectName"`
	ObjectType    string `json:"objectType"` // table, view, sequence, function, schema, database, type
	Grantee       string `json:"grantee"`
	Grantor       string `json:"grantor"`
	PrivilegeType string `json:"privilegeType"`
	IsGrantable   bool   `json:"isGrantable"`
}

// PgColumnPrivilege represents a column-level privilege.
type PgColumnPrivilege struct {
	TableSchema   string `json:"tableSchema"`
	TableName     string `json:"tableName"`
	ColumnName    string `json:"columnName"`
	Grantee       string `json:"grantee"`
	PrivilegeType string `json:"privilegeType"`
	IsGrantable   bool   `json:"isGrantable"`
}

// PgDefaultPrivilege represents an ALTER DEFAULT PRIVILEGES rule (pg_default_acl).
type PgDefaultPrivilege struct {
	ForRole    string  `json:"forRole"`    // role that creates objects
	InSchema   *string `json:"inSchema"`  // nil = any schema
	ObjectType string  `json:"objectType"` // TABLE, SEQUENCE, FUNCTION, TYPE, SCHEMA
	Grantee    string  `json:"grantee"`
	Privilege  string  `json:"privilege"`
	IsGrantable bool   `json:"isGrantable"`
}

// PgRLSPolicy represents a row-level security policy from pg_policy.
type PgRLSPolicy struct {
	PolicyName  string   `json:"policyName"`
	TableSchema string   `json:"tableSchema"`
	TableName   string   `json:"tableName"`
	Command     string   `json:"command"` // ALL, SELECT, INSERT, UPDATE, DELETE
	Permissive  bool     `json:"permissive"`
	Roles       []string `json:"roles"`
	UsingExpr   *string  `json:"usingExpr"`
	CheckExpr   *string  `json:"checkExpr"`
}

// PgRLSTableStatus reports whether RLS is enabled on a table.
type PgRLSTableStatus struct {
	TableSchema  string `json:"tableSchema"`
	TableName    string `json:"tableName"`
	RLSEnabled   bool   `json:"rlsEnabled"`
	ForceRLS     bool   `json:"forceRLS"`
}

// PgForeignDataWrapper represents a foreign-data wrapper from pg_foreign_data_wrapper.
type PgForeignDataWrapper struct {
	Name      string   `json:"name"`
	Owner     string   `json:"owner"`
	Handler   *string  `json:"handler"`
	Validator *string  `json:"validator"`
	ACL       []string `json:"acl"`
}

// PgForeignServer represents a foreign server from pg_foreign_server.
type PgForeignServer struct {
	OID     int64             `json:"oid"`
	Name    string            `json:"name"`
	FDWName string            `json:"fdwName"`
	Type    *string           `json:"type"`
	Version *string           `json:"version"`
	Options map[string]string `json:"options"`
	ACL     []string          `json:"acl"`
}

// PgUserMapping represents a user mapping for a foreign server.
type PgUserMapping struct {
	ServerName string            `json:"serverName"`
	LocalRole  string            `json:"localRole"` // "PUBLIC" if umuser = 0
	Options    map[string]string `json:"options"`   // password value is redacted
}

// PgRoleParamSetting represents a per-role configuration override (ALTER ROLE SET).
type PgRoleParamSetting struct {
	RoleName  string  `json:"roleName"`
	Database  *string `json:"database"` // nil = ALL
	ParamName string  `json:"paramName"`
	Value     string  `json:"value"`
}

// PgSecurableObject represents a database object available to grant privileges on.
type PgSecurableObject struct {
	Schema     string `json:"schema"`
	Name       string `json:"name"`
	ObjectType string `json:"objectType"` // table, view, materialized_view, foreign_table, sequence, function, procedure
	Owner      string `json:"owner"`
}

// PgSecurableCatalog holds all user-level securable objects in the connected database.
type PgSecurableCatalog struct {
	Databases []string            `json:"databases"`
	Schemas   []string            `json:"schemas"`
	Tables    []PgSecurableObject `json:"tables"`
	Sequences []PgSecurableObject `json:"sequences"`
	Functions []PgSecurableObject `json:"functions"`
}

// PgRbacOverview bundles the top-level data needed to populate the RBAC Studio.
type PgRbacOverview struct {
	Roles   []PgRole               `json:"roles"`
	FDWs    []PgForeignDataWrapper `json:"fdws"`
	Servers []PgForeignServer      `json:"servers"`
	Catalog *PgSecurableCatalog    `json:"catalog,omitempty"`
}

// PgSchemaPrivilege is a parsed schema-level ACL entry.
type PgSchemaPrivilege struct {
	SchemaName    string `json:"schemaName"`
	Grantee       string `json:"grantee"`
	Grantor       string `json:"grantor"`
	PrivilegeType string `json:"privilegeType"`
	IsGrantable   bool   `json:"isGrantable"`
}

// PgDatabasePrivilege is a parsed database-level ACL entry.
type PgDatabasePrivilege struct {
	DatabaseName  string `json:"databaseName"`
	Grantee       string `json:"grantee"`
	Grantor       string `json:"grantor"`
	PrivilegeType string `json:"privilegeType"`
	IsGrantable   bool   `json:"isGrantable"`
}

// SecurityAuditFinding is a single result from the automated security scan.
type SecurityAuditFinding struct {
	CheckName     string   `json:"checkName"`
	Severity      string   `json:"severity"` // CRITICAL, HIGH, MEDIUM, INFO
	Title         string   `json:"title"`
	Description   string   `json:"description"`
	AffectedItems []string `json:"affectedItems"`
	FixDDL        string   `json:"fixDDL"`
}

// PgQueryResult holds rows returned from an impersonated query.
type PgQueryResult struct {
	Columns []string        `json:"columns"`
	Rows    [][]interface{} `json:"rows"`
	RowsAffected int64     `json:"rowsAffected"`
	Error   string          `json:"error"` // non-empty if the query errored
}
