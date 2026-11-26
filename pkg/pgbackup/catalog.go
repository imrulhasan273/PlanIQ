package pgbackup

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/imrulhasan273/PlanIQ/pkg/livedb"
)

func buildReadOnlyPGConnStr(cfg livedb.ConnectionConfig, overrideDB string) string {
	port := cfg.Port
	if port == 0 {
		port = 5432
	}
	dbName := strings.TrimSpace(overrideDB)
	if dbName == "" {
		dbName = strings.TrimSpace(cfg.Database)
	}
	if dbName == "" {
		dbName = "postgres"
	}
	timeout := cfg.TimeoutSeconds
	if timeout <= 0 {
		timeout = 6
	}

	sslMode := "disable"
	if cfg.Encrypt {
		if cfg.TrustServerCertificate {
			sslMode = "require"
		} else {
			sslMode = "verify-full"
		}
	}

	u := &url.URL{
		Scheme: "postgres",
		Host:   fmt.Sprintf("%s:%d", cfg.Server, port),
		Path:   "/" + dbName,
	}
	if cfg.Username != "" {
		if cfg.Password != "" {
			u.User = url.UserPassword(cfg.Username, cfg.Password)
		} else {
			u.User = url.User(cfg.Username)
		}
	}

	q := url.Values{}
	q.Set("sslmode", sslMode)
	q.Set("connect_timeout", fmt.Sprintf("%d", timeout))
	q.Set("application_name", "PlanIQ-Backup-Catalog")
	q.Set("default_transaction_read_only", "on")
	u.RawQuery = q.Encode()
	return u.String()
}

// FetchBackupCatalog inspects PostgreSQL databases, tablespaces, schemas, tables, and extensions.
func FetchBackupCatalog(ctx context.Context, cfg livedb.ConnectionConfig, targetDB string) (*BackupCatalog, error) {
	qCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()

	dbName := strings.TrimSpace(targetDB)
	if dbName == "" {
		dbName = strings.TrimSpace(cfg.Database)
	}
	if dbName == "" {
		dbName = "postgres"
	}

	db, err := sql.Open("pgx", buildReadOnlyPGConnStr(cfg, dbName))
	if err != nil {
		return nil, fmt.Errorf("failed to open catalog connection: %w", err)
	}
	defer db.Close()

	if err := db.PingContext(qCtx); err != nil {
		return nil, fmt.Errorf("failed to connect to database %q: %w", dbName, err)
	}

	catalog := &BackupCatalog{
		Databases:      []PgDatabaseMeta{},
		Tablespaces:    []PgTablespaceMeta{},
		Schemas:        []string{},
		Tables:         []PgTableMeta{},
		Extensions:     []string{},
		ActiveDatabase: dbName,
	}

	// Server version info
	var verNumStr, verRaw string
	_ = db.QueryRowContext(qCtx, `SHOW server_version_num;`).Scan(&verNumStr)
	_ = db.QueryRowContext(qCtx, `SHOW server_version;`).Scan(&verRaw)
	fmt.Sscanf(verNumStr, "%d", &catalog.ServerVersionNum)
	catalog.ServerVersion = verRaw

	// Databases
	dbRows, err := db.QueryContext(qCtx, `
		SELECT
			d.datname,
			COALESCE(pg_get_userbyid(d.datdba), ''),
			pg_encoding_to_char(d.encoding),
			COALESCE(ts.spcname, 'pg_default'),
			COALESCE(pg_database_size(d.oid), 0)
		FROM pg_database d
		LEFT JOIN pg_tablespace ts ON ts.oid = d.dattablespace
		WHERE NOT d.datistemplate
		ORDER BY d.datname;
	`)
	if err == nil {
		defer dbRows.Close()
		for dbRows.Next() {
			var item PgDatabaseMeta
			if scanErr := dbRows.Scan(&item.Name, &item.Owner, &item.Encoding, &item.Tablespace, &item.SizeBytes); scanErr == nil {
				catalog.Databases = append(catalog.Databases, item)
			}
		}
	}

	// Tablespaces (size query can fail on non-privileged accounts, so fall back gracefully)
	tsRows, err := db.QueryContext(qCtx, `
		SELECT
			t.spcname,
			COALESCE(pg_get_userbyid(t.spcowner), ''),
			COALESCE(pg_tablespace_location(t.oid), '')
		FROM pg_tablespace t
		ORDER BY t.spcname;
	`)
	if err == nil {
		defer tsRows.Close()
		for tsRows.Next() {
			var ts PgTablespaceMeta
			if scanErr := tsRows.Scan(&ts.Name, &ts.Owner, &ts.Location); scanErr == nil {
				var sz int64
				if szErr := db.QueryRowContext(qCtx, `SELECT pg_tablespace_size($1);`, ts.Name).Scan(&sz); szErr == nil {
					ts.SizeBytes = sz
				}
				catalog.Tablespaces = append(catalog.Tablespaces, ts)
			}
		}
	}

	// User schemas in target DB
	schRows, err := db.QueryContext(qCtx, `
		SELECT nspname
		FROM pg_namespace
		WHERE nspname NOT LIKE 'pg\_%' ESCAPE '\'
		  AND nspname <> 'information_schema'
		ORDER BY nspname;
	`)
	if err == nil {
		defer schRows.Close()
		for schRows.Next() {
			var s string
			if scanErr := schRows.Scan(&s); scanErr == nil {
				catalog.Schemas = append(catalog.Schemas, s)
			}
		}
	}

	// Tables, partitioned tables, views, matviews, foreign tables
	tblRows, err := db.QueryContext(qCtx, `
		SELECT
			n.nspname,
			c.relname,
			CASE c.relkind
				WHEN 'r' THEN 'table'
				WHEN 'p' THEN 'partitioned_table'
				WHEN 'v' THEN 'view'
				WHEN 'm' THEN 'matview'
				WHEN 'f' THEN 'foreign_table'
				ELSE 'table'
			END AS obj_type,
			COALESCE(ts.spcname, COALESCE(dts.spcname, 'pg_default')) AS tblspace,
			COALESCE(pg_get_userbyid(c.relowner), ''),
			COALESCE(pg_total_relation_size(c.oid), 0)
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		LEFT JOIN pg_tablespace ts ON ts.oid = c.reltablespace AND c.reltablespace <> 0
		LEFT JOIN pg_database d ON d.datname = current_database()
		LEFT JOIN pg_tablespace dts ON dts.oid = d.dattablespace
		WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
		  AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
		  AND n.nspname <> 'information_schema'
		ORDER BY n.nspname, c.relname;
	`)
	if err == nil {
		defer tblRows.Close()
		for tblRows.Next() {
			var t PgTableMeta
			if scanErr := tblRows.Scan(&t.Schema, &t.Name, &t.ObjectType, &t.Tablespace, &t.Owner, &t.SizeBytes); scanErr == nil {
				catalog.Tables = append(catalog.Tables, t)
			}
		}
	}

	// Extensions
	extRows, err := db.QueryContext(qCtx, `SELECT extname FROM pg_extension ORDER BY extname;`)
	if err == nil {
		defer extRows.Close()
		for extRows.Next() {
			var ext string
			if scanErr := extRows.Scan(&ext); scanErr == nil {
				catalog.Extensions = append(catalog.Extensions, ext)
			}
		}
	}

	return catalog, nil
}
