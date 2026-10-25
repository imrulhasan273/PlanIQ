package livedb

import (
	"context"
	"database/sql"
	"encoding/hex"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/microsoft/go-mssqldb"
)

// Client manages connection and live query execution to SQL Server
type Client struct {
	mu     sync.RWMutex
	db     *sql.DB
	config ConnectionConfig
	status ConnectionStatus
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

	// Demo mode for testing/showcase
	if cfg.AuthType == "demo" || strings.ToLower(cfg.Server) == "demo" || strings.ToLower(cfg.Server) == "localhost-demo" {
		c.config = cfg
		c.status = ConnectionStatus{
			Connected:      true,
			ServerVersion:  "Microsoft SQL Server 2022 (RTM-CU12) (KB5033663) - 16.0.4115.5 (X64) Enterprise Edition",
			ServerName:     "PROD-SQL01.corp.internal",
			DatabaseName:   "SalesDB",
			ActiveSessions: 14,
			LatencyMs:      12,
			IsReadOnly:     true,
			IsDemo:         true,
		}
		return &c.status, nil
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
		c.status = ConnectionStatus{
			Connected:    false,
			ErrorMessage: fmt.Sprintf("Failed to connect: %v", err),
		}
		return &c.status, err
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

// GetActiveSessions fetches running/blocked requests from sys.dm_exec_requests
func (c *Client) GetActiveSessions(ctx context.Context) ([]ActiveSession, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected {
		return nil, fmt.Errorf("not connected to SQL Server")
	}

	if c.status.IsDemo || c.db == nil {
		return getDemoActiveSessions(), nil
	}

	queryCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	const sqlQuery = `
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SET LOCK_TIMEOUT 1500;

	SELECT TOP 50
		r.session_id,
		r.status,
		r.command,
		ISNULL(DB_NAME(r.database_id), 'master') AS db_name,
		ISNULL(s.login_name, '') AS login_name,
		ISNULL(s.host_name, '') AS host_name,
		ISNULL(s.program_name, '') AS program_name,
		ISNULL(r.wait_type, '') AS wait_type,
		r.wait_time AS wait_time_ms,
		ISNULL(r.last_wait_type, '') AS last_wait_type,
		r.blocking_session_id,
		r.cpu_time AS cpu_time_ms,
		r.total_elapsed_time AS total_elapsed_time_ms,
		r.logical_reads,
		r.writes,
		CAST(r.granted_query_memory * 8.0 / 1024.0 AS FLOAT) AS granted_memory_mb,
		ISNULL(SUBSTRING(t.text, (r.statement_start_offset/2)+1, 
			((CASE r.statement_end_offset WHEN -1 THEN DATALENGTH(t.text) ELSE r.statement_end_offset END - r.statement_start_offset)/2)+1), 
			t.text) AS query_text,
		CASE WHEN r.plan_handle IS NOT NULL THEN 1 ELSE 0 END AS has_plan,
		master.dbo.fn_varbintohexstr(r.plan_handle) AS plan_handle,
		master.dbo.fn_varbintohexstr(r.sql_handle) AS sql_handle,
		r.percent_complete
	FROM sys.dm_exec_requests r
	JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
	OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
	WHERE s.is_user_process = 1
	  AND r.session_id <> @@SPID
	ORDER BY r.total_elapsed_time DESC, r.cpu_time DESC;
	`

	rows, err := c.db.QueryContext(queryCtx, sqlQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to query active sessions: %w", err)
	}
	defer rows.Close()

	var sessions []ActiveSession
	for rows.Next() {
		var s ActiveSession
		var planHex, sqlHex sql.NullString
		var qText sql.NullString

		err := rows.Scan(
			&s.SPID,
			&s.Status,
			&s.Command,
			&s.DatabaseName,
			&s.LoginName,
			&s.HostName,
			&s.ProgramName,
			&s.WaitType,
			&s.WaitTimeMs,
			&s.LastWaitType,
			&s.BlockingSPID,
			&s.CPUTimeMs,
			&s.TotalElapsedTimeMs,
			&s.LogicalReads,
			&s.Writes,
			&s.GrantedMemoryMB,
			&qText,
			&s.HasPlan,
			&planHex,
			&sqlHex,
			&s.PercentComplete,
		)
		if err != nil {
			continue
		}
		if qText.Valid {
			s.QueryText = strings.TrimSpace(qText.String)
		}
		if planHex.Valid {
			s.PlanHandle = planHex.String
		}
		if sqlHex.Valid {
			s.SQLHandle = sqlHex.String
		}

		sessions = append(sessions, s)
	}

	return sessions, nil
}

// GetSessionPlan extracts the ShowPlan XML for an active session plan handle or SPID
func (c *Client) GetSessionPlan(ctx context.Context, planHandleHex string) (string, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected {
		return "", fmt.Errorf("not connected to database")
	}

	if c.status.IsDemo || c.db == nil {
		return getDemoShowPlanXML(), nil
	}

	queryCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	var spid int
	handleStr := strings.TrimSpace(planHandleHex)

	// Check if identifier format is "spid:handle"
	if idx := strings.Index(handleStr, ":"); idx != -1 {
		prefix := handleStr[:idx]
		if s, err := strconv.Atoi(prefix); err == nil && s > 0 {
			spid = s
			handleStr = strings.TrimSpace(handleStr[idx+1:])
		}
	}

	var planXML sql.NullString

	// Step 1: If an active SPID is provided, query sys.dm_exec_requests directly.
	// This uses SQL Server's internal varbinary plan_handle without string conversion roundtrips!
	if spid > 0 {
		spidQuery := `
			SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
			SELECT TOP 1 ISNULL(p.query_plan, t.query_plan)
			FROM sys.dm_exec_requests r
			OUTER APPLY sys.dm_exec_query_plan(r.plan_handle) p
			OUTER APPLY sys.dm_exec_text_query_plan(r.plan_handle, r.statement_start_offset, r.statement_end_offset) t
			WHERE r.session_id = @p1
			  AND (p.query_plan IS NOT NULL OR t.query_plan IS NOT NULL);
		`
		_ = c.db.QueryRowContext(queryCtx, spidQuery, spid).Scan(&planXML)
	}

	// Step 2: Query by decoding hex string into native []byte (VARBINARY) parameter
	if (!planXML.Valid || len(strings.TrimSpace(planXML.String)) == 0) && len(handleStr) > 0 {
		cleanHex := strings.TrimPrefix(strings.TrimPrefix(handleStr, "0x"), "0X")
		binHandle, err := hex.DecodeString(cleanHex)
		if err == nil && len(binHandle) > 0 {
			// Try sys.dm_exec_query_plan(@p1)
			q1 := `
				SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
				SELECT query_plan 
				FROM sys.dm_exec_query_plan(@p1);
			`
			_ = c.db.QueryRowContext(queryCtx, q1, binHandle).Scan(&planXML)

			// Try sys.dm_exec_text_query_plan(@p1, 0, -1) for statement-level plan
			if !planXML.Valid || len(strings.TrimSpace(planXML.String)) == 0 {
				q2 := `
					SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
					SELECT query_plan 
					FROM sys.dm_exec_text_query_plan(@p1, 0, -1);
				`
				_ = c.db.QueryRowContext(queryCtx, q2, binHandle).Scan(&planXML)
			}

			// Try sys.dm_exec_query_plan_stats(@p1) if SQL Server 2019+
			if !planXML.Valid || len(strings.TrimSpace(planXML.String)) == 0 {
				q3 := `
					IF OBJECT_ID('sys.dm_exec_query_plan_stats') IS NOT NULL
					BEGIN
						SELECT query_plan 
						FROM sys.dm_exec_query_plan_stats(@p1);
					END
					ELSE
					BEGIN
						SELECT CAST(NULL AS NVARCHAR(MAX));
					END
				`
				_ = c.db.QueryRowContext(queryCtx, q3, binHandle).Scan(&planXML)
			}
		} else {
			// Fallback: T-SQL CONVERT(varbinary(64), @p1, 1) if raw string passed
			q4 := `
				SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
				DECLARE @h varbinary(64);
				BEGIN TRY
					IF LEFT(@p1, 2) = '0x' OR LEFT(@p1, 2) = '0X'
						SET @h = CONVERT(varbinary(64), @p1, 1);
					ELSE
						SET @h = CONVERT(varbinary(64), '0x' + @p1, 1);
				END TRY
				BEGIN CATCH
					SET @h = NULL;
				END CATCH;

				IF @h IS NOT NULL
				BEGIN
					SELECT TOP 1 query_plan FROM sys.dm_exec_query_plan(@h);
				END
				ELSE
				BEGIN
					SELECT CAST(NULL AS NVARCHAR(MAX));
				END
			`
			_ = c.db.QueryRowContext(queryCtx, q4, handleStr).Scan(&planXML)
		}
	}

	if !planXML.Valid || len(strings.TrimSpace(planXML.String)) == 0 {
		return "", fmt.Errorf("no execution plan XML returned from SQL Server (the plan may not be in cache or the query has completed)")
	}

	return planXML.String, nil
}

// GetQueryStoreTop queries top queries by CPU, duration, or reads from Query Store
func (c *Client) GetQueryStoreTop(ctx context.Context, orderBy string, topN int) ([]QueryStoreEntry, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected {
		return nil, fmt.Errorf("not connected")
	}

	if c.status.IsDemo || c.db == nil {
		return getDemoQueryStoreEntries(), nil
	}

	if topN <= 0 || topN > 50 {
		topN = 15
	}

	var sortCol string
	switch strings.ToLower(orderBy) {
	case "cpu":
		sortCol = "SUM(rs.count_executions * rs.avg_cpu_time) DESC"
	case "duration":
		sortCol = "SUM(rs.count_executions * rs.avg_duration) DESC"
	case "reads":
		sortCol = "SUM(rs.count_executions * rs.avg_logical_io_reads) DESC"
	case "spills":
		sortCol = "SUM(rs.count_executions * rs.avg_tempdb_space_used) DESC"
	default:
		sortCol = "SUM(rs.count_executions * rs.avg_cpu_time) DESC"
	}

	sqlQuery := fmt.Sprintf(`
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SELECT TOP %d
		q.query_id,
		p.plan_id,
		qt.query_sql_text,
		SUM(rs.count_executions) AS total_executions,
		SUM(rs.count_executions * rs.avg_cpu_time) / 1000.0 AS total_cpu_ms,
		AVG(rs.avg_cpu_time) / 1000.0 AS avg_cpu_ms,
		SUM(rs.count_executions * rs.avg_duration) / 1000.0 AS total_duration_ms,
		AVG(rs.avg_duration) / 1000.0 AS avg_duration_ms,
		SUM(rs.count_executions * rs.avg_logical_io_reads) AS total_logical_reads,
		AVG(rs.avg_logical_io_reads) AS avg_logical_reads,
		SUM(rs.count_executions * rs.avg_physical_io_reads) AS total_physical_reads,
		AVG(rs.avg_physical_io_reads) AS avg_physical_reads,
		SUM(rs.count_executions * rs.avg_tempdb_space_used) * 8.0 / 1024.0 AS total_spills_mb,
		CONVERT(VARCHAR(19), MAX(rs.last_execution_time), 120) AS last_execution_time,
		p.query_plan
	FROM sys.query_store_query q
	JOIN sys.query_store_plan p ON q.query_id = p.query_id
	JOIN sys.query_store_query_text qt ON q.query_text_id = qt.query_text_id
	JOIN sys.query_store_runtime_stats rs ON p.plan_id = rs.plan_id
	WHERE rs.last_execution_time >= DATEADD(HOUR, -24, GETUTCDATE())
	GROUP BY q.query_id, p.plan_id, qt.query_sql_text, p.query_plan
	ORDER BY %s;
	`, topN, sortCol)

	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	rows, err := c.db.QueryContext(queryCtx, sqlQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to query Query Store: %w", err)
	}
	defer rows.Close()

	var entries []QueryStoreEntry
	for rows.Next() {
		var e QueryStoreEntry
		var qText, planXML sql.NullString

		err := rows.Scan(
			&e.QueryID,
			&e.PlanID,
			&qText,
			&e.ExecutionCount,
			&e.TotalCPUMs,
			&e.AvgCPUMs,
			&e.TotalDurationMs,
			&e.AvgDurationMs,
			&e.TotalLogicalReads,
			&e.AvgLogicalReads,
			&e.TotalPhysicalReads,
			&e.AvgPhysicalReads,
			&e.TotalSpillsMB,
			&e.LastExecutionTime,
			&planXML,
		)
		if err != nil {
			continue
		}
		if qText.Valid {
			e.QueryText = strings.TrimSpace(qText.String)
		}
		if planXML.Valid {
			e.PlanXML = planXML.String
		}
		entries = append(entries, e)
	}

	return entries, nil
}

// GetLiveDeadlocks queries the default system_health Extended Events ring buffer
func (c *Client) GetLiveDeadlocks(ctx context.Context, limit int) ([]LiveDeadlockReport, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected {
		return nil, fmt.Errorf("not connected")
	}

	if c.status.IsDemo || c.db == nil {
		return getDemoDeadlocks(), nil
	}

	if limit <= 0 || limit > 20 {
		limit = 10
	}

	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	const xelQuery = `
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	WITH DeadlockEvents AS (
		SELECT 
			CAST(target_data AS XML) AS TargetData
		FROM sys.dm_xe_session_targets st
		JOIN sys.dm_xe_sessions s ON s.address = st.event_session_address
		WHERE s.name = 'system_health'
		  AND st.target_name = 'ring_buffer'
	)
	SELECT TOP 10
		e.x.value('@timestamp', 'datetime2') AS [Timestamp],
		e.x.query('.') AS DeadlockReportXML
	FROM DeadlockEvents de
	CROSS APPLY de.TargetData.nodes('//RingBufferTarget/event[@name="xml_deadlock_report"]') AS e(x)
	ORDER BY e.x.value('@timestamp', 'datetime2') DESC;
	`

	rows, err := c.db.QueryContext(queryCtx, xelQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to query system_health deadlocks: %w", err)
	}
	defer rows.Close()

	var reports []LiveDeadlockReport
	for rows.Next() {
		var ts time.Time
		var xmlContent sql.NullString
		if err := rows.Scan(&ts, &xmlContent); err != nil {
			continue
		}
		if xmlContent.Valid && len(xmlContent.String) > 0 {
			reports = append(reports, LiveDeadlockReport{
				Timestamp:        ts.Format("2006-01-02 15:04:05"),
				DeadlockGraphXML: xmlContent.String,
				Summary:          "Deadlock extracted from live system_health session buffer",
			})
		}
	}

	if len(reports) == 0 {
		// Return demo or empty
		return []LiveDeadlockReport{}, nil
	}

	return reports, nil
}

// GetServerVitals returns CPU, memory, and TempDB pressure metrics
func (c *Client) GetServerVitals(ctx context.Context) (*ServerVitals, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected {
		return nil, fmt.Errorf("not connected")
	}

	if c.status.IsDemo || c.db == nil {
		return &ServerVitals{
			CPUQueueTasks:       1,
			SignalWaitPct:       8.4,
			MemoryGrantsPending: 0,
			AvailableMemoryMB:   18432.0,
			TempDBUserObjectsMB: 420.5,
			TempDBInternalMB:    128.0,
			BatchRequestsPerSec: 1420.0,
		}, nil
	}

	queryCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	const vitalsQuery = `
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SELECT 
		ISNULL(SUM(runnable_tasks_count), 0) AS cpu_queue_tasks,
		CAST(ISNULL(AVG(100.0 * signal_worker_time_ms / NULLIF(work_queue_count, 0)), 0) AS FLOAT) AS signal_wait_pct
	FROM sys.dm_os_schedulers 
	WHERE status = 'VISIBLE ONLINE';
	`
	var v ServerVitals
	if err := c.db.QueryRowContext(queryCtx, vitalsQuery).Scan(&v.CPUQueueTasks, &v.SignalWaitPct); err != nil {
		v.CPUQueueTasks = 0
		v.SignalWaitPct = 0
	}

	// Memory grants pending
	_ = c.db.QueryRowContext(queryCtx, `
		SELECT ISNULL(COUNT(*), 0) 
		FROM sys.dm_exec_query_memory_grants 
		WHERE is_next_candidate IS NOT NULL;
	`).Scan(&v.MemoryGrantsPending)

	return &v, nil
}
