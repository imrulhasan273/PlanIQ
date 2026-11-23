package livedb

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	_ "github.com/microsoft/go-mssqldb"
)

// Client manages connection and live query execution to SQL Server or PostgreSQL
type Client struct {
	mu                  sync.RWMutex
	db                  *sql.DB
	engine              string // "sqlserver" or "postgresql"
	config              ConnectionConfig
	status              ConnectionStatus
	lastBatchCount      int64
	lastBatchTimestamp  time.Time
	lastSchedSampleTime time.Time
	lastSchedYields     map[int]int64
	lastSchedSwitches   map[int]int64
	lastPLEOverall      float64
	lastPLETimestamp    time.Time
}

// GlobalClient is the default singleton instance for the app
var (
	defaultClient *Client
	once          sync.Once
)

// GetClient returns the singleton live DB client
func GetClient() *Client {
	once.Do(func() {
		defaultClient = &Client{
			status: ConnectionStatus{
				Connected:  false,
				IsReadOnly: true,
			},
		}
	})
	return defaultClient
}

// resolveEngine normalizes the target database engine ("postgresql" or "sqlserver").
func resolveEngine(cfg ConnectionConfig) string {
	switch strings.ToLower(strings.TrimSpace(cfg.Engine)) {
	case "postgresql", "postgres", "pg":
		return "postgresql"
	case "sqlserver", "mssql":
		return "sqlserver"
	}
	if cfg.Port == 5432 || strings.EqualFold(strings.TrimSpace(cfg.Database), "postgres") {
		return "postgresql"
	}
	return "sqlserver"
}

func (c *Client) isPostgres() bool {
	return c.engine == "postgresql"
}

// buildPostgresConnStr constructs a read-only PostgreSQL connection URI for pgx/stdlib.
func buildPostgresConnStr(cfg ConnectionConfig, appName string) string {
	host := strings.TrimSpace(cfg.Server)
	if host == "" {
		host = "localhost"
	}
	port := cfg.Port
	if port == 0 {
		port = 5432
	}
	dbName := strings.TrimSpace(cfg.Database)
	if dbName == "" {
		dbName = "postgres"
	}
	timeout := cfg.TimeoutSeconds
	if timeout <= 0 {
		timeout = 4
	}

	query := url.Values{}
	query.Set("application_name", appName)
	query.Set("connect_timeout", fmt.Sprintf("%d", timeout))
	query.Set("default_transaction_read_only", "on")

	if cfg.Encrypt {
		if cfg.TrustServerCertificate {
			query.Set("sslmode", "require")
		} else {
			query.Set("sslmode", "verify-full")
		}
	} else {
		query.Set("sslmode", "disable")
	}

	var userInfo *url.Userinfo
	if cfg.AuthType == "windows" {
		if strings.TrimSpace(cfg.Username) != "" {
			userInfo = url.User(strings.TrimSpace(cfg.Username))
		}
	} else if strings.TrimSpace(cfg.Username) != "" {
		if cfg.Password != "" {
			userInfo = url.UserPassword(strings.TrimSpace(cfg.Username), cfg.Password)
		} else {
			userInfo = url.User(strings.TrimSpace(cfg.Username))
		}
	}

	u := &url.URL{
		Scheme:   "postgres",
		User:     userInfo,
		Host:     fmt.Sprintf("%s:%d", host, port),
		Path:     "/" + dbName,
		RawQuery: query.Encode(),
	}
	return u.String()
}

func formatPostgresConnectError(cfg ConnectionConfig, err error) string {
	msg := err.Error()
	if cfg.Encrypt && (strings.Contains(strings.ToLower(msg), "server refused tls") ||
		strings.Contains(strings.ToLower(msg), "ssl is not enabled") ||
		strings.Contains(strings.ToLower(msg), "does not support ssl")) {
		return fmt.Sprintf("Failed to connect: %v (Tip: disable 'Enable SSL' if your local PostgreSQL instance has ssl = off)", err)
	}
	return fmt.Sprintf("Failed to connect: %v", err)
}

func openAndPingPostgres(ctx context.Context, cfg ConnectionConfig, appName string) (*sql.DB, *ConnectionStatus, error) {
	if cfg.Port == 0 {
		cfg.Port = 5432
	}
	if cfg.TimeoutSeconds <= 0 {
		cfg.TimeoutSeconds = 4
	}

	connStr := buildPostgresConnStr(cfg, appName)
	db, err := sql.Open("pgx", connStr)
	if err != nil {
		return nil, &ConnectionStatus{
			Connected:    false,
			ServerType:   "postgresql",
			ErrorMessage: fmt.Sprintf("Failed to initialize PostgreSQL driver: %v", err),
		}, err
	}

	start := time.Now()
	pingCtx, cancel := context.WithTimeout(ctx, time.Duration(cfg.TimeoutSeconds)*time.Second)
	defer cancel()

	if err := db.PingContext(pingCtx); err != nil {
		_ = db.Close()
		errMsg := formatPostgresConnectError(cfg, err)
		return nil, &ConnectionStatus{
			Connected:    false,
			ServerType:   "postgresql",
			ErrorMessage: errMsg,
		}, fmt.Errorf("%s", errMsg)
	}
	latency := time.Since(start).Milliseconds()

	var version, srvName, dbName string
	var activeSessions int
	queryCtx, cancelQuery := context.WithTimeout(ctx, 3*time.Second)
	defer cancelQuery()

	row := db.QueryRowContext(queryCtx, `
		SELECT
			COALESCE(split_part(version(), ',', 1), 'PostgreSQL'),
			COALESCE(host(inet_server_addr()), current_setting('cluster_name', true), ''),
			current_database(),
			(SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active');
	`)
	if err := row.Scan(&version, &srvName, &dbName, &activeSessions); err != nil {
		version = "PostgreSQL"
		srvName = cfg.Server
		dbName = cfg.Database
		activeSessions = 1
	}
	if strings.TrimSpace(srvName) == "" {
		srvName = cfg.Server
	}

	status := &ConnectionStatus{
		Connected:      true,
		ServerVersion:  version,
		ServerName:     srvName,
		DatabaseName:   dbName,
		ActiveSessions: activeSessions,
		LatencyMs:      latency,
		IsReadOnly:     true,
		IsDemo:         false,
		ServerType:     "postgresql",
	}
	return db, status, nil
}

// Connect attempts a read-only connection to a SQL Server or PostgreSQL instance
func (c *Client) Connect(ctx context.Context, cfg ConnectionConfig) (*ConnectionStatus, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// If already connected, close previous
	if c.db != nil {
		_ = c.db.Close()
		c.db = nil
	}

	// Demo mode is prohibited - only real database connections allowed
	if cfg.AuthType == "demo" || strings.ToLower(cfg.Server) == "demo" || strings.ToLower(cfg.Server) == "localhost-demo" {
		return nil, fmt.Errorf("demo mode is disabled; please connect to a valid database instance")
	}

	engine := resolveEngine(cfg)
	cfg.Engine = engine

	if engine == "postgresql" {
		db, st, err := openAndPingPostgres(ctx, cfg, "PlanIQ-Live-Radar")
		if err != nil {
			c.status = *st
			return &c.status, err
		}
		c.db = db
		c.engine = "postgresql"
		c.config = cfg
		c.status = *st
		return &c.status, nil
	}

	if cfg.Port == 0 {
		cfg.Port = 1433
	}
	if cfg.TimeoutSeconds == 0 {
		cfg.TimeoutSeconds = 4
	}

	// Build SQL Server connection string
	query := url.Values{}
	query.Add("database", cfg.Database)
	query.Add("connection timeout", fmt.Sprintf("%d", cfg.TimeoutSeconds))
	query.Add("app name", "PlanIQ-Live-Radar")
	query.Add("ApplicationIntent", "ReadOnly") // Enforce read-only intent
	query.Add("keepAlive", "30")
	query.Add("packet size", "32767")
	query.Add("dial timeout", "8")

	if cfg.Encrypt {
		query.Add("encrypt", "true")
	} else {
		query.Add("encrypt", "disable")
	}

	if cfg.TrustServerCertificate {
		query.Add("trustservercertificate", "true")
	}

	var connStr string
	if cfg.AuthType == "windows" {
		connStr = fmt.Sprintf("server=%s;port=%d;integrated security=SSPI;%s", strings.ReplaceAll(cfg.Server, ";", ""), cfg.Port, query.Encode())
	} else {
		u := &url.URL{
			Scheme:   "sqlserver",
			User:     url.UserPassword(cfg.Username, cfg.Password),
			Host:     fmt.Sprintf("%s:%d", cfg.Server, cfg.Port),
			RawQuery: query.Encode(),
		}
		connStr = u.String()
	}

	db, err := sql.Open("sqlserver", connStr)
	if err != nil {
		c.status = ConnectionStatus{
			Connected:    false,
			ServerType:   "sqlserver",
			ErrorMessage: fmt.Sprintf("Failed to initialize driver: %v", err),
		}
		return &c.status, err
	}

	start := time.Now()
	pingCtx, cancel := context.WithTimeout(ctx, time.Duration(cfg.TimeoutSeconds)*time.Second)
	defer cancel()

	if err := db.PingContext(pingCtx); err != nil {
		_ = db.Close()

		// If URL-encoded ping failed and SQL authentication is used, attempt ADO format with literal curly-bracketed password
		if cfg.AuthType != "windows" {
			escapedPwd := strings.ReplaceAll(cfg.Password, "}", "}}")
			adoConnStr := fmt.Sprintf("server=%s;port=%d;database=%s;user id=%s;password={%s};connection timeout=%d;app name=PlanIQ-Live-Radar;ApplicationIntent=ReadOnly",
				strings.ReplaceAll(cfg.Server, ";", ""), cfg.Port, strings.ReplaceAll(cfg.Database, ";", ""), strings.ReplaceAll(cfg.Username, ";", ""), escapedPwd, cfg.TimeoutSeconds)
			if cfg.Encrypt {
				adoConnStr += ";encrypt=true"
			} else {
				adoConnStr += ";encrypt=disable"
			}
			if cfg.TrustServerCertificate {
				adoConnStr += ";trustservercertificate=true"
			}

			if db2, err2 := sql.Open("sqlserver", adoConnStr); err2 == nil {
				pingCtx2, cancel2 := context.WithTimeout(ctx, time.Duration(cfg.TimeoutSeconds)*time.Second)
				defer cancel2()
				if err3 := db2.PingContext(pingCtx2); err3 == nil {
					db = db2
					err = nil
				} else {
					_ = db2.Close()
				}
			}
		}

		if err != nil {
			c.status = ConnectionStatus{
				Connected:    false,
				ServerType:   "sqlserver",
				ErrorMessage: fmt.Sprintf("Failed to connect: %v", err),
			}
			return &c.status, err
		}
	}
	latency := time.Since(start).Milliseconds()

	var version, srvName, dbName string
	queryCtx, cancelQuery := context.WithTimeout(ctx, 3*time.Second)
	defer cancelQuery()

	row := db.QueryRowContext(queryCtx, `
		SELECT 
			SUBSTRING(@@VERSION, 1, CHARINDEX(' - ', @@VERSION) - 1),
			@@SERVERNAME,
			DB_NAME();
	`)
	if err := row.Scan(&version, &srvName, &dbName); err != nil {
		version = "Microsoft SQL Server"
		srvName = cfg.Server
		dbName = cfg.Database
	}

	c.db = db
	c.engine = "sqlserver"
	c.config = cfg
	c.status = ConnectionStatus{
		Connected:      true,
		ServerVersion:  version,
		ServerName:     srvName,
		DatabaseName:   dbName,
		ActiveSessions: 1,
		LatencyMs:      latency,
		IsReadOnly:     true,
		IsDemo:         false,
		ServerType:     "sqlserver",
	}

	return &c.status, nil
}

// TestConnection tests a SQL Server or PostgreSQL connection without changing the active client state
func (c *Client) TestConnection(ctx context.Context, cfg ConnectionConfig) (*ConnectionStatus, error) {
	if cfg.AuthType == "demo" || strings.ToLower(cfg.Server) == "demo" || strings.ToLower(cfg.Server) == "localhost-demo" {
		return nil, fmt.Errorf("demo mode is disabled; please connect to a valid database instance")
	}

	engine := resolveEngine(cfg)
	cfg.Engine = engine

	if engine == "postgresql" {
		db, st, err := openAndPingPostgres(ctx, cfg, "PlanIQ-Test-Connection")
		if db != nil {
			_ = db.Close()
		}
		return st, err
	}

	if cfg.Port == 0 {
		cfg.Port = 1433
	}
	if cfg.TimeoutSeconds == 0 {
		cfg.TimeoutSeconds = 4
	}

	query := url.Values{}
	query.Add("database", cfg.Database)
	query.Add("connection timeout", fmt.Sprintf("%d", cfg.TimeoutSeconds))
	query.Add("app name", "PlanIQ-Test-Connection")
	query.Add("ApplicationIntent", "ReadOnly")
	query.Add("dial timeout", "5")

	if cfg.Encrypt {
		query.Add("encrypt", "true")
	} else {
		query.Add("encrypt", "disable")
	}

	if cfg.TrustServerCertificate {
		query.Add("trustservercertificate", "true")
	}

	var connStr string
	if cfg.AuthType == "windows" {
		connStr = fmt.Sprintf("server=%s;port=%d;integrated security=SSPI;%s", strings.ReplaceAll(cfg.Server, ";", ""), cfg.Port, query.Encode())
	} else {
		u := &url.URL{
			Scheme:   "sqlserver",
			User:     url.UserPassword(cfg.Username, cfg.Password),
			Host:     fmt.Sprintf("%s:%d", cfg.Server, cfg.Port),
			RawQuery: query.Encode(),
		}
		connStr = u.String()
	}

	db, err := sql.Open("sqlserver", connStr)
	if err != nil {
		return &ConnectionStatus{
			Connected:    false,
			ServerType:   "sqlserver",
			ErrorMessage: fmt.Sprintf("Failed to initialize driver: %v", err),
		}, err
	}
	defer db.Close()

	start := time.Now()
	pingCtx, cancel := context.WithTimeout(ctx, time.Duration(cfg.TimeoutSeconds)*time.Second)
	defer cancel()

	if err := db.PingContext(pingCtx); err != nil {
		_ = db.Close()

		// If URL-encoded ping failed and SQL authentication is used, attempt ADO format with literal curly-bracketed password
		if cfg.AuthType != "windows" {
			escapedPwd := strings.ReplaceAll(cfg.Password, "}", "}}")
			adoConnStr := fmt.Sprintf("server=%s;port=%d;database=%s;user id=%s;password={%s};connection timeout=%d;app name=PlanIQ-Test-Connection;ApplicationIntent=ReadOnly",
				strings.ReplaceAll(cfg.Server, ";", ""), cfg.Port, strings.ReplaceAll(cfg.Database, ";", ""), strings.ReplaceAll(cfg.Username, ";", ""), escapedPwd, cfg.TimeoutSeconds)
			if cfg.Encrypt {
				adoConnStr += ";encrypt=true"
			} else {
				adoConnStr += ";encrypt=disable"
			}
			if cfg.TrustServerCertificate {
				adoConnStr += ";trustservercertificate=true"
			}

			if db2, err2 := sql.Open("sqlserver", adoConnStr); err2 == nil {
				pingCtx2, cancel2 := context.WithTimeout(ctx, time.Duration(cfg.TimeoutSeconds)*time.Second)
				defer cancel2()
				if err3 := db2.PingContext(pingCtx2); err3 == nil {
					db = db2
					err = nil
				} else {
					_ = db2.Close()
				}
			}
		}

		if err != nil {
			return &ConnectionStatus{
				Connected:    false,
				ServerType:   "sqlserver",
				ErrorMessage: fmt.Sprintf("Connection failed: %v", err),
			}, err
		}
	}
	latency := time.Since(start).Milliseconds()

	var version, srvName, dbName string
	queryCtx, cancelQuery := context.WithTimeout(ctx, 3*time.Second)
	defer cancelQuery()

	row := db.QueryRowContext(queryCtx, `
		SELECT 
			SUBSTRING(@@VERSION, 1, CHARINDEX(' - ', @@VERSION) - 1),
			@@SERVERNAME,
			DB_NAME();
	`)
	if err := row.Scan(&version, &srvName, &dbName); err != nil {
		version = "Microsoft SQL Server"
		srvName = cfg.Server
		dbName = cfg.Database
	}

	return &ConnectionStatus{
		Connected:      true,
		ServerVersion:  version,
		ServerName:     srvName,
		DatabaseName:   dbName,
		ActiveSessions: 1,
		LatencyMs:      latency,
		IsReadOnly:     true,
		IsDemo:         false,
		ServerType:     "sqlserver",
	}, nil
}

// Disconnect closes active connection
func (c *Client) Disconnect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.db != nil {
		_ = c.db.Close()
		c.db = nil
	}
	c.engine = ""
	c.status = ConnectionStatus{
		Connected:  false,
		IsReadOnly: true,
	}
	return nil
}

// GetStatus returns the current connection status
func (c *Client) GetStatus() ConnectionStatus {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.status
}
