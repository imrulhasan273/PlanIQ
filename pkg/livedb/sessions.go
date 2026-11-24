package livedb

import (
	"context"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/imrulhasan273/PlanIQ/pkg/configdb"
)

// GetActiveSessions fetches running/blocked requests from sys.dm_exec_requests
func (c *Client) GetActiveSessions(ctx context.Context, limit int) ([]ActiveSession, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected to database")
	}
	if c.isPostgres() {
		return c.pgGetActiveSessions(ctx, limit)
	}

	if limit <= 0 {
		limit = 200
	} else if limit > 10000 {
		limit = 10000
	}

	queryCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	sqlQuery := fmt.Sprintf(`
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SET LOCK_TIMEOUT 1500;

	SELECT TOP (%d)
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
		CAST(ISNULL(r.granted_query_memory, 0) * 8.0 / 1024.0 AS FLOAT) AS granted_memory_mb,
		ISNULL(SUBSTRING(t.text, (r.statement_start_offset/2)+1, 
			((CASE r.statement_end_offset WHEN -1 THEN DATALENGTH(t.text) ELSE r.statement_end_offset END - r.statement_start_offset)/2)+1), 
			t.text) AS query_text,
		CASE WHEN r.plan_handle IS NOT NULL THEN 1 ELSE 0 END AS has_plan,
		CONVERT(varchar(128), r.plan_handle, 1) AS plan_handle,
		CONVERT(varchar(128), r.sql_handle, 1) AS sql_handle,
		ISNULL(r.percent_complete, 0) AS percent_complete
	FROM sys.dm_exec_requests r
	JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
	OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
	WHERE s.is_user_process = 1
	  AND r.session_id <> @@SPID
	ORDER BY r.total_elapsed_time DESC, r.cpu_time DESC;
	`, limit)

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

	if !c.status.Connected || c.db == nil {
		return "", fmt.Errorf("not connected to database")
	}
	if c.isPostgres() {
		return c.pgGetSessionPlan(ctx, planHandleHex)
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

// ExplainQuery captures a live execution plan (PostgreSQL EXPLAIN FORMAT JSON or SQL Server ShowPlan XML) for raw SQL query text.
func (c *Client) ExplainQuery(ctx context.Context, queryText string) (string, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected || c.db == nil {
		return "", fmt.Errorf("not connected to database")
	}
	if c.isPostgres() {
		return c.pgExplainQuery(ctx, queryText)
	}

	cleanSQL := strings.TrimSpace(queryText)
	if cleanSQL == "" {
		return "", fmt.Errorf("empty SQL query text")
	}

	queryCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// Step 1: Attempt to locate matching cached plan in DMV plan cache or Query Store
	prefix := cleanSQL
	if len(prefix) > 120 {
		prefix = prefix[:120]
	}

	var planXML sql.NullString
	dmvQuery := `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT TOP 1 qp.query_plan
		FROM sys.dm_exec_query_stats qs
		CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
		CROSS APPLY sys.dm_exec_query_plan(qs.plan_handle) qp
		WHERE st.text IS NOT NULL
		  AND qp.query_plan IS NOT NULL
		  AND (LTRIM(RTRIM(st.text)) = @p1 OR CHARINDEX(@p2, st.text) > 0)
		ORDER BY qs.last_execution_time DESC;
	`
	_ = c.db.QueryRowContext(queryCtx, dmvQuery, cleanSQL, prefix).Scan(&planXML)

	if !planXML.Valid || strings.TrimSpace(planXML.String) == "" {
		qsQuery := `
			SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
			IF EXISTS (SELECT 1 FROM sys.database_query_store_options WHERE actual_state IN (1, 2, 3, 4))
			BEGIN
				SELECT TOP 1 p.query_plan
				FROM sys.query_store_query_text qt
				JOIN sys.query_store_query q ON qt.query_text_id = q.query_text_id
				JOIN sys.query_store_plan p ON q.query_id = p.query_id
				WHERE p.query_plan IS NOT NULL
				  AND (LTRIM(RTRIM(qt.query_sql_text)) = @p1 OR CHARINDEX(@p2, qt.query_sql_text) > 0)
				ORDER BY p.last_execution_time DESC;
			END
			ELSE
			BEGIN
				SELECT CAST(NULL AS NVARCHAR(MAX));
			END
		`
		_ = c.db.QueryRowContext(queryCtx, qsQuery, cleanSQL, prefix).Scan(&planXML)
	}

	if planXML.Valid && strings.TrimSpace(planXML.String) != "" {
		return planXML.String, nil
	}

	// Step 2: Generate non-executing estimated ShowPlan XML on an isolated pooled connection
	conn, err := c.db.Conn(queryCtx)
	if err != nil {
		return "", fmt.Errorf("failed to acquire dedicated SQL Server connection for SHOWPLAN_XML: %w", err)
	}
	defer func() {
		_, _ = conn.ExecContext(context.Background(), "SET SHOWPLAN_XML OFF;")
		_ = conn.Close()
	}()

	if _, err := conn.ExecContext(queryCtx, "SET SHOWPLAN_XML ON;"); err != nil {
		return "", fmt.Errorf("failed to enable SHOWPLAN_XML: %w", err)
	}

	rows, err := conn.QueryContext(queryCtx, cleanSQL)
	if err != nil {
		return "", fmt.Errorf("failed to capture SQL Server execution plan (note: batches referencing undeclared local variables require a cached plan): %w", err)
	}
	defer rows.Close()

	var xmlResult string
	for rows.Next() {
		var chunk sql.NullString
		if scanErr := rows.Scan(&chunk); scanErr == nil && chunk.Valid && strings.TrimSpace(chunk.String) != "" {
			xmlResult = chunk.String
			break
		}
	}
	if strings.TrimSpace(xmlResult) == "" {
		return "", fmt.Errorf("no execution plan XML generated by SQL Server for this query")
	}
	return xmlResult, nil
}


func parseDeadlockMetadata(xmlStr string) (victimSpid int, procCount int, resCount int, dlType string, summary string) {
	// 1. Find victim process id
	var victimProcID string
	if m := rxVictimProc.FindStringSubmatch(xmlStr); len(m) > 1 {
		victimProcID = m[1]
	} else if m := rxVictimAttr.FindStringSubmatch(xmlStr); len(m) > 1 {
		victimProcID = m[1]
	}

	// 2. Map process id -> spid
	procSpidMap := make(map[string]int)
	var spids []int

	for _, m := range rxProcess.FindAllStringSubmatch(xmlStr, -1) {
		if len(m) > 2 {
			pID := m[1]
			spid, _ := strconv.Atoi(m[2])
			if spid > 0 {
				procSpidMap[pID] = spid
				spids = append(spids, spid)
			}
		}
	}
	for _, m := range rxProcessAlt.FindAllStringSubmatch(xmlStr, -1) {
		if len(m) > 2 {
			spid, _ := strconv.Atoi(m[1])
			pID := m[2]
			if spid > 0 && procSpidMap[pID] == 0 {
				procSpidMap[pID] = spid
				spids = append(spids, spid)
			}
		}
	}

	procCount = len(procSpidMap)
	if procCount == 0 {
		procCount = len(spids)
	}

	if victimProcID != "" && procSpidMap[victimProcID] > 0 {
		victimSpid = procSpidMap[victimProcID]
	} else if len(spids) > 0 {
		victimSpid = spids[0]
	}

	// 3. Count lock resource types
	keyCount := len(rxKeyLock.FindAllString(xmlStr, -1))
	pageCount := len(rxPageLock.FindAllString(xmlStr, -1))
	objCount := len(rxObjectLock.FindAllString(xmlStr, -1))
	exchCount := len(rxExchange.FindAllString(xmlStr, -1))
	resCount = keyCount + pageCount + objCount + exchCount
	if resCount == 0 {
		resCount = 2
	}

	// 4. Deadlock classification
	if exchCount > 0 {
		dlType = "Parallelism / Exchange Deadlock"
	} else if pageCount > 0 {
		dlType = "Page Lock Contention (PAGELOCK)"
	} else if objCount > 0 {
		dlType = "Table / Object Lock Escalation"
	} else if keyCount > 0 {
		dlType = "Reverse Order Key Lock Contention"
	} else {
		dlType = "Resource Deadlock Cycle"
	}

	// 5. Extract table/index object names
	var objNames []string
	for _, m := range rxObjectName.FindAllStringSubmatch(xmlStr, -1) {
		if len(m) > 1 && m[1] != "" {
			name := m[1]
			found := false
			for _, existing := range objNames {
				if existing == name {
					found = true
					break
				}
			}
			if !found {
				objNames = append(objNames, name)
			}
		}
	}

	if len(spids) >= 2 && len(objNames) >= 1 {
		summary = fmt.Sprintf("SPID #%d and SPID #%d deadlocked on %s", spids[0], spids[1], strings.Join(objNames, " & "))
	} else if len(spids) >= 2 {
		summary = fmt.Sprintf("Circular lock dependency between SPID #%d and SPID #%d", spids[0], spids[1])
	} else if len(objNames) >= 1 {
		summary = fmt.Sprintf("Deadlock on locked resource %s", strings.Join(objNames, " & "))
	} else {
		summary = "Deadlock cycle extracted from system_health session"
	}

	return
}

// GetLiveDeadlocks queries the default system_health Extended Events ring buffer & event file
// If disconnected or offline, it transparently returns cached deadlocks from local SQLite.
func (c *Client) GetLiveDeadlocks(ctx context.Context, limit int) ([]LiveDeadlockReport, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected || c.db == nil {
		store, err := configdb.GetDB()
		if err == nil {
			cached, err := store.GetStoredDeadlocks(c.status.ServerName, 7)
			if err == nil && len(cached) > 0 {
				var reps []LiveDeadlockReport
				for _, d := range cached {
					reps = append(reps, LiveDeadlockReport{
						Timestamp:           d.Timestamp,
						VictimSPID:          d.VictimSPID,
						ProcessCount:        d.ProcessCount,
						LockedResourceCount: d.LockedResourceCount,
						DeadlockType:        d.DeadlockType,
						DeadlockGraphXML:    d.DeadlockGraphXML,
						Summary:             d.Summary,
					})
				}
				return reps, nil
			}
		}
		return nil, fmt.Errorf("not connected and no local deadlock history available")
	}
	if c.isPostgres() {
		return c.pgGetLiveDeadlocks(ctx, limit)
	}

	if limit <= 0 || limit > 25 {
		limit = 15
	}

	queryCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()

	// 1. Primary: Query the in-memory ring buffer (fastest, 0 disk I/O)
	const xelRingBufferQuery = `
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SET LOCK_TIMEOUT 3000;
	WITH DeadlockEvents AS (
		SELECT 
			CAST(target_data AS XML) AS TargetData
		FROM sys.dm_xe_session_targets st
		JOIN sys.dm_xe_sessions s ON s.address = st.event_session_address
		WHERE s.name = 'system_health'
		  AND st.target_name = 'ring_buffer'
	)
	SELECT TOP 15
		e.x.value('@timestamp', 'datetime2') AS [Timestamp],
		e.x.query('.') AS DeadlockReportXML
	FROM DeadlockEvents de
	CROSS APPLY de.TargetData.nodes('//RingBufferTarget/event[@name="xml_deadlock_report"]') AS e(x)
	ORDER BY e.x.value('@timestamp', 'datetime2') DESC;
	`

	var reports []LiveDeadlockReport
	rows, err := c.db.QueryContext(queryCtx, xelRingBufferQuery)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var ts time.Time
			var xmlContent sql.NullString
			if err := rows.Scan(&ts, &xmlContent); err != nil {
				continue
			}
			if xmlContent.Valid && len(xmlContent.String) > 0 {
				vSpid, pCount, rCount, dType, sum := parseDeadlockMetadata(xmlContent.String)
				reports = append(reports, LiveDeadlockReport{
					Timestamp:           ts.Format("2006-01-02 15:04:05"),
					VictimSPID:          vSpid,
					ProcessCount:        pCount,
					LockedResourceCount: rCount,
					DeadlockType:        dType,
					DeadlockGraphXML:    xmlContent.String,
					Summary:             sum,
				})
			}
		}
	}

	// 2. Fallback: If ring buffer had 0 deadlocks or was wrapped, try system_health event_file (.xel)
	if len(reports) == 0 {
		const xelFileQuery = `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SET LOCK_TIMEOUT 3000;
		SELECT TOP 10
			CAST(event_data AS XML).value('(event/@timestamp)[1]', 'datetime2') AS [Timestamp],
			CAST(event_data AS XML).query('(event/data[@name="xml_report"]/value/deadlock)[1]') AS DeadlockReportXML
		FROM sys.fn_xe_file_target_read_file('system_health*.xel', null, null, null)
		WHERE object_name = 'xml_deadlock_report'
		ORDER BY [Timestamp] DESC;
		`
		fileRows, fileErr := c.db.QueryContext(queryCtx, xelFileQuery)
		if fileErr == nil {
			defer fileRows.Close()
			for fileRows.Next() {
				var ts time.Time
				var xmlContent sql.NullString
				if err := fileRows.Scan(&ts, &xmlContent); err != nil {
					continue
				}
				if xmlContent.Valid && len(xmlContent.String) > 0 {
					vSpid, pCount, rCount, dType, sum := parseDeadlockMetadata(xmlContent.String)
					reports = append(reports, LiveDeadlockReport{
						Timestamp:           ts.Format("2006-01-02 15:04:05"),
						VictimSPID:          vSpid,
						ProcessCount:        pCount,
						LockedResourceCount: rCount,
						DeadlockType:        dType,
						DeadlockGraphXML:    xmlContent.String,
						Summary:             sum,
					})
				}
			}
		}
	}

	// Persist to local SQLite for offline deadlock analysis
	if len(reports) > 0 {
		go func(reps []LiveDeadlockReport, srv string) {
			store, err := configdb.GetDB()
			if err != nil {
				return
			}
			var stored []configdb.StoredDeadlock
			for _, r := range reps {
				stored = append(stored, configdb.StoredDeadlock{
					ServerName:          srv,
					Timestamp:           r.Timestamp,
					VictimSPID:          r.VictimSPID,
					DeadlockGraphXML:    r.DeadlockGraphXML,
					ProcessCount:        r.ProcessCount,
					LockedResourceCount: r.LockedResourceCount,
					DeadlockType:        r.DeadlockType,
					Summary:             r.Summary,
				})
			}
			_ = store.SaveDeadlockSnapshots(srv, stored)
		}(reports, c.status.ServerName)
	}

	return reports, nil
}


// GetBlockingSessions returns live blocking cascades and victims
func (c *Client) GetBlockingSessions(ctx context.Context) ([]LiveBlockingSession, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected")
	}
	if c.isPostgres() {
		return c.pgGetBlockingSessions(ctx)
	}

	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	const sqlBlocks = `
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SELECT 
		b.blocking_session_id AS root_blocker_spid,
		ISNULL(s_blocker.status, 'sleeping') AS root_blocker_status,
		ISNULL(s_blocker.login_name, '') AS root_blocker_login,
		ISNULL(s_blocker.program_name, '') AS root_blocker_program,
		ISNULL(t_blocker.text, '') AS root_blocker_query,
		b.session_id AS blocked_spid,
		ISNULL(r.status, 'suspended') AS blocked_status,
		ISNULL(s_blocked.login_name, '') AS blocked_login,
		ISNULL(s_blocked.program_name, '') AS blocked_program,
		ISNULL(b.wait_type, '') AS blocked_wait_type,
		b.wait_duration_ms AS blocked_wait_time_ms,
		ISNULL(t_blocked.text, '') AS blocked_query,
		ISNULL(b.resource_description, '') AS lock_resource,
		'Exclusive (X)' AS lock_mode
	FROM sys.dm_os_waiting_tasks b
	JOIN sys.dm_exec_sessions s_blocker ON b.blocking_session_id = s_blocker.session_id
	JOIN sys.dm_exec_sessions s_blocked ON b.session_id = s_blocked.session_id
	LEFT JOIN sys.dm_exec_requests r ON b.session_id = r.session_id
	OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t_blocked
	LEFT JOIN sys.dm_exec_requests r_blocker ON b.blocking_session_id = r_blocker.session_id
	OUTER APPLY sys.dm_exec_sql_text(r_blocker.sql_handle) t_blocker
	WHERE b.blocking_session_id > 0
	  AND b.blocking_session_id <> b.session_id;
	`

	rows, err := c.db.QueryContext(queryCtx, sqlBlocks)
	if err != nil {
		return nil, fmt.Errorf("failed to query blocking sessions: %w", err)
	}
	defer rows.Close()

	var blocks []LiveBlockingSession
	for rows.Next() {
		var bs LiveBlockingSession
		if err := rows.Scan(
			&bs.RootBlockerSPID,
			&bs.RootBlockerStatus,
			&bs.RootBlockerLogin,
			&bs.RootBlockerProgram,
			&bs.RootBlockerQuery,
			&bs.BlockedSPID,
			&bs.BlockedStatus,
			&bs.BlockedLogin,
			&bs.BlockedProgram,
			&bs.BlockedWaitType,
			&bs.BlockedWaitTimeMs,
			&bs.BlockedQuery,
			&bs.LockResource,
			&bs.LockMode,
		); err != nil {
			continue
		}
		blocks = append(blocks, bs)
	}
	return blocks, nil
}


// GetTempDBUsage returns task space allocation from sys.dm_db_task_space_usage
func (c *Client) GetTempDBUsage(ctx context.Context, limit int) ([]LiveTempDBUsage, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected")
	}
	if c.isPostgres() {
		return c.pgGetTempDBUsage(ctx, limit)
	}

	if limit <= 0 {
		limit = 100
	} else if limit > 1000 {
		limit = 1000
	}

	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	sqlTempDB := fmt.Sprintf(`
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SELECT TOP (%d)
		ts.session_id,
		ISNULL(DB_NAME(r.database_id), 'master') AS database_name,
		ISNULL(s.login_name, '') AS login_name,
		ISNULL(s.program_name, '') AS program_name,
		CAST(ts.user_objects_alloc_page_count * 8.0 / 1024.0 AS FLOAT) AS user_alloc_mb,
		CAST(ts.user_objects_dealloc_page_count * 8.0 / 1024.0 AS FLOAT) AS user_dealloc_mb,
		CAST(ts.internal_objects_alloc_page_count * 8.0 / 1024.0 AS FLOAT) AS internal_alloc_mb,
		CAST(ts.internal_objects_dealloc_page_count * 8.0 / 1024.0 AS FLOAT) AS internal_dealloc_mb,
		ISNULL(t.text, '') AS query_text
	FROM sys.dm_db_task_space_usage ts
	JOIN sys.dm_exec_sessions s ON ts.session_id = s.session_id
	LEFT JOIN sys.dm_exec_requests r ON ts.session_id = r.session_id
	OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
	WHERE s.is_user_process = 1
	  AND (ts.user_objects_alloc_page_count > 0 OR ts.internal_objects_alloc_page_count > 0)
	ORDER BY (ts.user_objects_alloc_page_count + ts.internal_objects_alloc_page_count) DESC;
	`, limit)

	rows, err := c.db.QueryContext(queryCtx, sqlTempDB)
	if err != nil {
		return nil, fmt.Errorf("failed to query TempDB usage: %w", err)
	}
	defer rows.Close()

	var usages []LiveTempDBUsage
	for rows.Next() {
		var u LiveTempDBUsage
		var qText sql.NullString
		if err := rows.Scan(
			&u.SPID,
			&u.DatabaseName,
			&u.LoginName,
			&u.ProgramName,
			&u.UserObjectsAllocMB,
			&u.UserObjectsDeallocMB,
			&u.InternalObjectsAllocMB,
			&u.InternalObjectsDeallocMB,
			&qText,
		); err != nil {
			continue
		}
		if qText.Valid {
			u.QueryText = strings.TrimSpace(qText.String)
		}
		usages = append(usages, u)
	}
	return usages, nil
}

// GetIdleSessions fetches sleeping or dormant sessions from sys.dm_exec_sessions
func (c *Client) GetIdleSessions(ctx context.Context, limit int) ([]IdleSession, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected")
	}
	if c.isPostgres() {
		return c.pgGetIdleSessions(ctx, limit)
	}

	if limit <= 0 {
		limit = 500
	} else if limit > 10000 {
		limit = 10000
	}

	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	sqlIdle := fmt.Sprintf(`
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SET LOCK_TIMEOUT 1500;

	SELECT TOP (%d)
		s.session_id,
		s.status,
		ISNULL(s.login_name, '') AS login_name,
		ISNULL(s.host_name, '') AS host_name,
		ISNULL(s.program_name, '') AS program_name,
		ISNULL(DB_NAME(s.database_id), 'master') AS database_name,
		ISNULL(s.open_transaction_count, 0) AS open_transactions,
		ISNULL(CONVERT(VARCHAR(19), s.last_request_start_time, 120), '') AS last_start,
		ISNULL(CONVERT(VARCHAR(19), s.last_request_end_time, 120), '') AS last_end,
		ISNULL(DATEDIFF(SECOND, s.last_request_end_time, GETDATE()), 0) AS idle_seconds,
		s.cpu_time AS total_cpu_ms,
		s.total_elapsed_time AS total_elapsed_ms,
		s.logical_reads,
		s.writes,
		s.memory_usage * 8 AS memory_kb,
		ISNULL(t.text, '') AS last_query_text
	FROM sys.dm_exec_sessions s
	LEFT JOIN sys.dm_exec_connections c ON s.session_id = c.session_id
	OUTER APPLY sys.dm_exec_sql_text(c.most_recent_sql_handle) t
	WHERE s.is_user_process = 1
	  AND s.session_id <> @@SPID
	  AND (s.status = 'sleeping' OR s.status = 'dormant' OR s.open_transaction_count > 0)
	ORDER BY s.open_transaction_count DESC, s.last_request_end_time DESC;
	`, limit)

	rows, err := c.db.QueryContext(queryCtx, sqlIdle)
	if err != nil {
		return nil, fmt.Errorf("failed to query idle sessions: %w", err)
	}
	defer rows.Close()

	var idleSessions []IdleSession
	for rows.Next() {
		var is IdleSession
		var qText sql.NullString
		if err := rows.Scan(
			&is.SPID,
			&is.Status,
			&is.LoginName,
			&is.HostName,
			&is.ProgramName,
			&is.DatabaseName,
			&is.OpenTransactions,
			&is.LastRequestStartTime,
			&is.LastRequestEndTime,
			&is.IdleSeconds,
			&is.TotalCPUTimeMs,
			&is.TotalElapsedTimeMs,
			&is.LogicalReads,
			&is.Writes,
			&is.MemoryUsageKB,
			&qText,
		); err != nil {
			continue
		}
		if qText.Valid {
			is.LastQueryText = strings.TrimSpace(qText.String)
		}
		idleSessions = append(idleSessions, is)
	}
	return idleSessions, nil
}

