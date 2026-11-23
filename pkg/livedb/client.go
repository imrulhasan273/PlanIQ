package livedb

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	_ "github.com/microsoft/go-mssqldb"
)

// Client manages connection and live query execution to SQL Server
type Client struct {
	mu                  sync.RWMutex
	db                  *sql.DB
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

// Connect attempts connection to a SQL Server instance
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
		return nil, fmt.Errorf("demo mode is disabled; please connect to a valid SQL Server instance")
	}

	if cfg.Port == 0 {
		cfg.Port = 1433
	}
	if cfg.TimeoutSeconds == 0 {
		cfg.TimeoutSeconds = 4
	}

	// Build connection string
	query := url.Values{}
	query.Add("database", cfg.Database)
	query.Add("connection timeout", fmt.Sprintf("%d", cfg.TimeoutSeconds))
	query.Add("app name", "PlanIQ-Live-Radar")
	query.Add("ApplicationIntent", "ReadOnly") // Enforce read-only intent
	// keepalive: send TCP keep-alive probes every 30 seconds.
	// This prevents WAN firewalls/NAT gateways from silently killing idle connections
	// mid-query, which manifests as "read tcp ... i/o timeout" errors.
	query.Add("keepAlive", "30")
	// packet size: larger TDS packets reduce round-trips over high-latency WAN links.
	query.Add("packet size", "32767")
	// dial timeout: separate from query timeout; caps initial TCP handshake.
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
		connStr = fmt.Sprintf("server=%s;port=%d;integrated security=SSPI;%s", cfg.Server, cfg.Port, query.Encode())
	} else {
		// SQL Authentication
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
			ErrorMessage: fmt.Sprintf("Failed to initialize driver: %v", err),
		}
		return &c.status, err
	}

	// Ping with timeout
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
				ErrorMessage: fmt.Sprintf("Failed to connect: %v", err),
			}
			return &c.status, err
		}
	}
	latency := time.Since(start).Milliseconds()

	// Query server info
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
	}

	return &c.status, nil
}

// TestConnection tests a SQL Server connection without changing the active client state
func (c *Client) TestConnection(ctx context.Context, cfg ConnectionConfig) (*ConnectionStatus, error) {
	if cfg.AuthType == "demo" || strings.ToLower(cfg.Server) == "demo" || strings.ToLower(cfg.Server) == "localhost-demo" {
		return nil, fmt.Errorf("demo mode is disabled; please connect to a valid SQL Server instance")
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
		connStr = fmt.Sprintf("server=%s;port=%d;integrated security=SSPI;%s", cfg.Server, cfg.Port, query.Encode())
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

