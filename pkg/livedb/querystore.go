package livedb

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// GetQueryStoreDiagnostic probes the server to understand why Query Store data may be empty
func (c *Client) GetQueryStoreDiagnostic(ctx context.Context, hours int) (*QueryStoreDiagnostic, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected")
	}
	if hours <= 0 {
		hours = 24
	}

	diag := &QueryStoreDiagnostic{}
	diagCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	// 1. Current database, version, and QS state
	probeSQL := `
	SELECT
		DB_NAME() AS current_db,
		CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(50)) AS sql_version,
		ISNULL(CAST(desired_state_desc AS VARCHAR(50)), 'N/A') AS qs_desired,
		ISNULL(CAST(actual_state_desc AS VARCHAR(50)), 'N/A') AS qs_actual,
		ISNULL(CASE WHEN actual_state IN (1,2,3,4) THEN 1 ELSE 0 END, 0) AS qs_on
	FROM sys.database_query_store_options;`

	row := c.db.QueryRowContext(diagCtx, probeSQL)
	var qsOn int
	if err := row.Scan(&diag.CurrentDB, &diag.SQLServerVersion, &diag.QSDesiredState, &diag.QSActualState, &qsOn); err != nil {
		diag.QSError = fmt.Sprintf("QS options probe failed: %v", err)
	}
	diag.IsQueryStoreOn = qsOn == 1

	// 2. Total rows in query_store_runtime_stats
	if diag.IsQueryStoreOn {
		r1 := c.db.QueryRowContext(diagCtx, `SELECT COUNT_BIG(*) FROM sys.query_store_runtime_stats;`)
		if err := r1.Scan(&diag.QSRuntimeStatsRows); err != nil {
			diag.QSError += fmt.Sprintf(" | Total QS count failed: %v", err)
		}

		// 3. Rows in time window
		r2 := c.db.QueryRowContext(diagCtx,
			`SELECT COUNT_BIG(*) FROM sys.query_store_runtime_stats WHERE last_execution_time >= DATEADD(HOUR, -@p1, GETUTCDATE());`, hours)
		if err := r2.Scan(&diag.QSWindowRows); err != nil {
			diag.QSError += fmt.Sprintf(" | QS window count failed: %v", err)
		}
	}

	// 4. DMV plan cache total
	r3 := c.db.QueryRowContext(diagCtx, `
	SELECT COUNT_BIG(*) FROM sys.dm_exec_query_stats qs
	CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
	WHERE st.text IS NOT NULL AND st.text NOT LIKE '%dm_exec_query_stats%';`)
	if err := r3.Scan(&diag.DMVPlanCacheRows); err != nil {
		diag.DMVError = fmt.Sprintf("DMV total count failed: %v", err)
	}

	// 5. DMV rows in time window
	r4 := c.db.QueryRowContext(diagCtx, `
	SELECT COUNT_BIG(*) FROM sys.dm_exec_query_stats qs
	CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
	WHERE st.text IS NOT NULL AND st.text NOT LIKE '%dm_exec_query_stats%'
	  AND qs.last_execution_time >= DATEADD(HOUR, -@p1, GETDATE());`, hours)
	if err := r4.Scan(&diag.DMVWindowRows); err != nil {
		diag.DMVError += fmt.Sprintf(" | DMV window count failed: %v", err)
	}

	fmt.Printf("[Diagnostic] DB=%s QSOn=%v QSTotal=%d QSWindow=%d DMVTotal=%d DMVWindow=%d QSErr=%s DMVErr=%s\n",
		diag.CurrentDB, diag.IsQueryStoreOn, diag.QSRuntimeStatsRows, diag.QSWindowRows,
		diag.DMVPlanCacheRows, diag.DMVWindowRows, diag.QSError, diag.DMVError)

	return diag, nil
}

// GetQueryStoreTop queries top queries by CPU, duration, or reads from Query Store (default 24h)
func (c *Client) GetQueryStoreTop(ctx context.Context, orderBy string, topN int) ([]QueryStoreEntry, error) {
	return c.GetQueryStoreTopWindow(ctx, orderBy, topN, 24)
}

// GetQueryStoreTopWindow queries top queries by CPU, duration, or reads within a specified hours window
func (c *Client) GetQueryStoreTopWindow(ctx context.Context, orderBy string, topN int, hours int) ([]QueryStoreEntry, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected")
	}

	if topN <= 0 || topN > 500 {
		topN = 25
	}
	if hours <= 0 {
		hours = 24
	}

	var sortCol string
	switch strings.ToLower(orderBy) {
	case "cpu":
		sortCol = "ps.total_cpu_us DESC"
	case "duration":
		sortCol = "ps.total_duration_us DESC"
	case "reads":
		sortCol = "ps.total_reads DESC"
	case "spills":
		sortCol = "ps.total_reads DESC"
	default:
		sortCol = "ps.total_cpu_us DESC"
	}

	// PerformanceStudio 4-phase architecture:
	// Phase 1: Pre-filter matching interval IDs from sys.query_store_runtime_stats_interval
	// Phase 2: Aggregate runtime_stats by plan_id into #plan_stats using EXISTS semi-join
	// Phase 3 & 4: Hydrate TOP N with query text, plan XML, and metadata
	sqlQuery := fmt.Sprintf(`
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

	DROP TABLE IF EXISTS #intervals;
	CREATE TABLE #intervals (
		runtime_stats_interval_id bigint NOT NULL PRIMARY KEY CLUSTERED
	);
	INSERT INTO #intervals (runtime_stats_interval_id)
	SELECT rsi.runtime_stats_interval_id
	FROM sys.query_store_runtime_stats_interval AS rsi
	WHERE rsi.start_time >= DATEADD(HOUR, -%d, GETUTCDATE())
	OPTION (RECOMPILE);

	DROP TABLE IF EXISTS #plan_stats;
	CREATE TABLE #plan_stats (
		plan_id bigint NOT NULL PRIMARY KEY CLUSTERED,
		total_cpu_us float NOT NULL,
		total_duration_us float NOT NULL,
		total_reads float NOT NULL,
		total_writes float NOT NULL,
		total_physical_reads float NOT NULL,
		total_memory_pages float NOT NULL,
		total_executions bigint NOT NULL,
		last_execution_time datetimeoffset NOT NULL,
		execution_type_desc nvarchar(60) NOT NULL
	);
	INSERT INTO #plan_stats
	SELECT
		rs.plan_id,
		SUM(rs.avg_cpu_time * rs.count_executions),
		SUM(rs.avg_duration * rs.count_executions),
		SUM(rs.avg_logical_io_reads * rs.count_executions),
		SUM(rs.avg_logical_io_writes * rs.count_executions),
		SUM(rs.avg_physical_io_reads * rs.count_executions),
		SUM(rs.avg_query_max_used_memory * rs.count_executions),
		SUM(rs.count_executions),
		MAX(rs.last_execution_time),
		ISNULL(MAX(rs.execution_type_desc), 'Regular')
	FROM sys.query_store_runtime_stats AS rs
	WHERE EXISTS
	(
		SELECT 1
		FROM #intervals AS i
		WHERE i.runtime_stats_interval_id = rs.runtime_stats_interval_id
	)
	GROUP BY rs.plan_id
	OPTION (RECOMPILE);

	SELECT TOP (%d)
		q.query_id,
		p.plan_id,
		ISNULL(CONVERT(varchar(64), q.query_hash, 1), '') AS query_hash,
		ISNULL(CONVERT(varchar(64), p.query_plan_hash, 1), '') AS plan_hash,
		ISNULL(OBJECT_SCHEMA_NAME(q.object_id, DB_ID()) + '.' + OBJECT_NAME(q.object_id, DB_ID()), '') AS module_name,
		ISNULL(qt.query_sql_text, '') AS query_sql_text,
		ps.total_executions,
		CAST(ps.total_cpu_us / 1000.0 AS float) AS total_cpu_ms,
		CAST((ps.total_cpu_us / 1000.0) / NULLIF(ps.total_executions, 0) AS float) AS avg_cpu_ms,
		CAST(ps.total_duration_us / 1000.0 AS float) AS total_duration_ms,
		CAST((ps.total_duration_us / 1000.0) / NULLIF(ps.total_executions, 0) AS float) AS avg_duration_ms,
		CAST(ps.total_reads AS bigint) AS total_logical_reads,
		CAST(ps.total_reads / NULLIF(ps.total_executions, 0) AS float) AS avg_logical_reads,
		CAST(ps.total_physical_reads AS bigint) AS total_physical_reads,
		CAST(ps.total_physical_reads / NULLIF(ps.total_executions, 0) AS float) AS avg_physical_reads,
		CAST(ps.total_writes AS bigint) AS total_writes,
		CAST(ps.total_writes / NULLIF(ps.total_executions, 0) AS float) AS avg_writes,
		CAST(ps.total_memory_pages * 8.0 / 1024.0 AS float) AS total_memory_mb,
		CAST((ps.total_memory_pages * 8.0 / 1024.0) / NULLIF(ps.total_executions, 0) AS float) AS avg_memory_mb,
		0.0 AS total_spills_mb,
		CONVERT(varchar(19), ps.last_execution_time, 120) AS last_execution_time,
		ps.execution_type_desc AS execution_type,
		ISNULL(p.query_plan, '') AS query_plan
	FROM #plan_stats AS ps
	JOIN sys.query_store_plan AS p ON ps.plan_id = p.plan_id
	JOIN sys.query_store_query AS q ON p.query_id = q.query_id
	JOIN sys.query_store_query_text AS qt ON q.query_text_id = qt.query_text_id
	ORDER BY %s;
	`, hours, topN, sortCol)

	queryCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	rows, err := c.db.QueryContext(queryCtx, sqlQuery)
	if err != nil {
		fmt.Printf("[QueryStore] QS query failed (falling back to DMV): %v\n", err)
	}
	var entries []QueryStoreEntry

	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var e QueryStoreEntry
			var qText, planXML, qHash, pHash, modName, execType sql.NullString

			err := rows.Scan(
				&e.QueryID,
				&e.PlanID,
				&qHash,
				&pHash,
				&modName,
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
				&e.TotalWrites,
				&e.AvgWrites,
				&e.TotalMemoryMB,
				&e.AvgMemoryMB,
				&e.TotalSpillsMB,
				&e.LastExecutionTime,
				&execType,
				&planXML,
			)
			if err != nil {
				fmt.Printf("[QueryStore] Scan error: %v\n", err)
				continue
			}
			if qHash.Valid {
				e.QueryHash = qHash.String
			}
			if pHash.Valid {
				e.PlanHash = pHash.String
			}
			if modName.Valid {
				e.ModuleName = modName.String
			}
			if execType.Valid {
				e.ExecutionType = execType.String
			}
			if qText.Valid {
				e.QueryText = strings.TrimSpace(qText.String)
			}
			if planXML.Valid {
				e.PlanXML = planXML.String
			}
			entries = append(entries, e)
		}

		// Hydrate wait profile from sys.query_store_wait_stats if available
		if len(entries) > 0 {
			planIDs := make([]string, 0, len(entries))
			for _, ent := range entries {
				planIDs = append(planIDs, fmt.Sprintf("%d", ent.PlanID))
			}
			waitSQL := fmt.Sprintf(`
			SELECT
				w.plan_id,
				w.wait_category_desc,
				CAST(SUM(w.total_query_wait_time_ms) AS FLOAT) AS total_wait_ms
			FROM sys.query_store_wait_stats w
			JOIN sys.query_store_runtime_stats_interval i ON w.runtime_stats_interval_id = i.runtime_stats_interval_id
			WHERE i.start_time >= DATEADD(HOUR, -%d, GETUTCDATE())
			  AND w.plan_id IN (%s)
			GROUP BY w.plan_id, w.wait_category_desc;`, hours, strings.Join(planIDs, ","))

			wCtx, wCancel := context.WithTimeout(ctx, 8*time.Second)
			wRows, wErr := c.db.QueryContext(wCtx, waitSQL)
			wCancel()
			if wErr == nil {
				defer wRows.Close()
				waitMap := make(map[int64]map[string]float64)
				for wRows.Next() {
					var pID int64
					var cat string
					var ms float64
					if wRows.Scan(&pID, &cat, &ms) == nil {
						if waitMap[pID] == nil {
							waitMap[pID] = make(map[string]float64)
						}
						waitMap[pID][cat] = ms
					}
				}
				for i := range entries {
					if profile, ok := waitMap[entries[i].PlanID]; ok {
						entries[i].WaitProfile = profile
					}
				}
			}
		}
	}
	fmt.Printf("[QueryStore] QS rows returned: %d (window=%dh, topN=%d, orderBy=%s)\n", len(entries), hours, topN, orderBy)

	// If Query Store returned 0 rows or is not enabled, seamlessly pull real queries from DMV plan cache (sys.dm_exec_query_stats)
	if len(entries) == 0 {
		dmvEntries, dmvErr := c.getTopQueriesFromDMV(ctx, orderBy, topN, hours)
		fmt.Printf("[QueryStore] DMV fallback returned: %d rows (err=%v)\n", len(dmvEntries), dmvErr)
		if dmvErr == nil && len(dmvEntries) > 0 {
			return dmvEntries, nil
		}
	}

	return entries, nil
}

// getTopQueriesFromDMV extracts real queries directly from sys.dm_exec_query_stats (TOP N first for extreme speed)
func (c *Client) getTopQueriesFromDMV(ctx context.Context, orderBy string, topN int, hours int) ([]QueryStoreEntry, error) {
	if hours <= 0 {
		hours = 24
	}
	if topN <= 0 || topN > 500 {
		topN = 25
	}
	var dmvSort string
	switch strings.ToLower(orderBy) {
	case "cpu":
		dmvSort = "qs.total_worker_time DESC"
	case "duration":
		dmvSort = "qs.total_elapsed_time DESC"
	case "reads":
		dmvSort = "qs.total_logical_reads DESC"
	case "spills":
		dmvSort = "qs.total_logical_reads DESC"
	default:
		dmvSort = "qs.total_worker_time DESC"
	}

	// Filter and TOP N FIRST, then join sys.dm_exec_sql_text on only the TOP rows
	dmvQuery := fmt.Sprintf(`
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	WITH top_qs AS (
		SELECT TOP %d
			qs.sql_handle,
			qs.statement_start_offset,
			qs.statement_end_offset,
			qs.query_hash,
			qs.query_plan_hash,
			CAST(qs.execution_count AS BIGINT) AS execution_count,
			CAST(qs.total_worker_time / 1000.0 AS FLOAT) AS total_cpu_ms,
			CAST((qs.total_worker_time / 1000.0) / NULLIF(qs.execution_count, 0) AS FLOAT) AS avg_cpu_ms,
			CAST(qs.total_elapsed_time / 1000.0 AS FLOAT) AS total_duration_ms,
			CAST((qs.total_elapsed_time / 1000.0) / NULLIF(qs.execution_count, 0) AS FLOAT) AS avg_duration_ms,
			CAST(qs.total_logical_reads AS BIGINT) AS total_logical_reads,
			CAST(CAST(qs.total_logical_reads AS FLOAT) / NULLIF(qs.execution_count, 0) AS FLOAT) AS avg_logical_reads,
			CAST(qs.total_physical_reads AS BIGINT) AS total_physical_reads,
			CAST(CAST(qs.total_physical_reads AS FLOAT) / NULLIF(qs.execution_count, 0) AS FLOAT) AS avg_physical_reads,
			CAST(qs.total_logical_writes AS BIGINT) AS total_writes,
			CAST(CAST(qs.total_logical_writes AS FLOAT) / NULLIF(qs.execution_count, 0) AS FLOAT) AS avg_writes,
			ISNULL(CONVERT(VARCHAR(19), qs.last_execution_time, 120), '') AS last_execution_time
		FROM sys.dm_exec_query_stats qs
		WHERE qs.last_execution_time >= DATEADD(HOUR, -%d, GETDATE())
		ORDER BY %s
	)
	SELECT
		ABS(CAST(CHECKSUM(tqs.query_hash) AS BIGINT)) AS query_id,
		ABS(CAST(CHECKSUM(tqs.query_plan_hash) AS BIGINT)) AS plan_id,
		ISNULL(CONVERT(VARCHAR(64), tqs.query_hash, 1), '') AS query_hash,
		ISNULL(CONVERT(VARCHAR(64), tqs.query_plan_hash, 1), '') AS plan_hash,
		ISNULL(OBJECT_SCHEMA_NAME(st.objectid, st.dbid) + '.' + OBJECT_NAME(st.objectid, st.dbid), '') AS module_name,
		ISNULL(SUBSTRING(st.text, (tqs.statement_start_offset/2)+1, 
			((CASE tqs.statement_end_offset
			  WHEN -1 THEN DATALENGTH(st.text)
			  ELSE tqs.statement_end_offset
			  END - tqs.statement_start_offset)/2) + 1), st.text) AS query_sql_text,
		tqs.execution_count,
		tqs.total_cpu_ms,
		tqs.avg_cpu_ms,
		tqs.total_duration_ms,
		tqs.avg_duration_ms,
		tqs.total_logical_reads,
		tqs.avg_logical_reads,
		tqs.total_physical_reads,
		tqs.avg_physical_reads,
		tqs.total_writes,
		tqs.avg_writes,
		0.0 AS total_memory_mb,
		0.0 AS avg_memory_mb,
		0.0 AS total_spills_mb,
		tqs.last_execution_time,
		'Regular' AS execution_type
	FROM top_qs tqs
	CROSS APPLY sys.dm_exec_sql_text(tqs.sql_handle) st
	WHERE st.text IS NOT NULL AND st.text NOT LIKE '%%%%dm_exec_query_stats%%%%'
	ORDER BY %s;
	`, topN, hours, dmvSort, dmvSort)

	dmvCtx, dmvCancel := context.WithTimeout(ctx, 15*time.Second)
	defer dmvCancel()

	rows, err := c.db.QueryContext(dmvCtx, dmvQuery)
	if err != nil {
		fmt.Printf("[DMV] Windowed query error: %v\n", err)
		return nil, err
	}
	var entries []QueryStoreEntry
	defer rows.Close()
	for rows.Next() {
		var e QueryStoreEntry
		var qText, qHash, pHash, modName, execType sql.NullString
		if err := rows.Scan(
			&e.QueryID,
			&e.PlanID,
			&qHash,
			&pHash,
			&modName,
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
			&e.TotalWrites,
			&e.AvgWrites,
			&e.TotalMemoryMB,
			&e.AvgMemoryMB,
			&e.TotalSpillsMB,
			&e.LastExecutionTime,
			&execType,
		); err == nil {
			if qHash.Valid {
				e.QueryHash = qHash.String
			}
			if pHash.Valid {
				e.PlanHash = pHash.String
			}
			if modName.Valid {
				e.ModuleName = modName.String
			}
			if execType.Valid {
				e.ExecutionType = execType.String
			}
			if qText.Valid {
				e.QueryText = strings.TrimSpace(qText.String)
			}
			entries = append(entries, e)
		} else {
			fmt.Printf("[DMV] Scan error: %v\n", err)
		}
	}

	fmt.Printf("[DMV] Windowed query returned %d rows (window=%dh)\n", len(entries), hours)

	// If no queries returned for the window, fall back to entire plan cache (no time filter)
	if len(entries) == 0 {
		fallbackQuery := fmt.Sprintf(`
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		WITH top_qs AS (
			SELECT TOP %d
				qs.sql_handle,
				qs.statement_start_offset,
				qs.statement_end_offset,
				qs.query_hash,
				qs.query_plan_hash,
				CAST(qs.execution_count AS BIGINT) AS execution_count,
				CAST(qs.total_worker_time / 1000.0 AS FLOAT) AS total_cpu_ms,
				CAST((qs.total_worker_time / 1000.0) / NULLIF(qs.execution_count, 0) AS FLOAT) AS avg_cpu_ms,
				CAST(qs.total_elapsed_time / 1000.0 AS FLOAT) AS total_duration_ms,
				CAST((qs.total_elapsed_time / 1000.0) / NULLIF(qs.execution_count, 0) AS FLOAT) AS avg_duration_ms,
				CAST(qs.total_logical_reads AS BIGINT) AS total_logical_reads,
				CAST(CAST(qs.total_logical_reads AS FLOAT) / NULLIF(qs.execution_count, 0) AS FLOAT) AS avg_logical_reads,
				CAST(qs.total_physical_reads AS BIGINT) AS total_physical_reads,
				CAST(CAST(qs.total_physical_reads AS FLOAT) / NULLIF(qs.execution_count, 0) AS FLOAT) AS avg_physical_reads,
				CAST(qs.total_logical_writes AS BIGINT) AS total_writes,
				CAST(CAST(qs.total_logical_writes AS FLOAT) / NULLIF(qs.execution_count, 0) AS FLOAT) AS avg_writes,
				ISNULL(CONVERT(VARCHAR(19), qs.last_execution_time, 120), '') AS last_execution_time
			FROM sys.dm_exec_query_stats qs
			ORDER BY %s
		)
		SELECT
			ABS(CAST(CHECKSUM(tqs.query_hash) AS BIGINT)) AS query_id,
			ABS(CAST(CHECKSUM(tqs.query_plan_hash) AS BIGINT)) AS plan_id,
			ISNULL(CONVERT(VARCHAR(64), tqs.query_hash, 1), '') AS query_hash,
			ISNULL(CONVERT(VARCHAR(64), tqs.query_plan_hash, 1), '') AS plan_hash,
			ISNULL(OBJECT_SCHEMA_NAME(st.objectid, st.dbid) + '.' + OBJECT_NAME(st.objectid, st.dbid), '') AS module_name,
			ISNULL(SUBSTRING(st.text, (tqs.statement_start_offset/2)+1, 
				((CASE tqs.statement_end_offset
				  WHEN -1 THEN DATALENGTH(st.text)
				  ELSE tqs.statement_end_offset
				  END - tqs.statement_start_offset)/2) + 1), st.text) AS query_sql_text,
			tqs.execution_count,
			tqs.total_cpu_ms,
			tqs.avg_cpu_ms,
			tqs.total_duration_ms,
			tqs.avg_duration_ms,
			tqs.total_logical_reads,
			tqs.avg_logical_reads,
			tqs.total_physical_reads,
			tqs.avg_physical_reads,
			tqs.total_writes,
			tqs.avg_writes,
			0.0 AS total_memory_mb,
			0.0 AS avg_memory_mb,
			0.0 AS total_spills_mb,
			tqs.last_execution_time,
			'Regular' AS execution_type
		FROM top_qs tqs
		CROSS APPLY sys.dm_exec_sql_text(tqs.sql_handle) st
		WHERE st.text IS NOT NULL AND st.text NOT LIKE '%%%%dm_exec_query_stats%%%%'
		ORDER BY %s;
		`, topN, dmvSort, dmvSort)

		// Create a fresh context — the previous dmvCtx may already be expired
		fbCtx, fbCancel := context.WithTimeout(ctx, 15*time.Second)
		defer fbCancel()
		fbRows, fbErr := c.db.QueryContext(fbCtx, fallbackQuery)
		if fbErr == nil {
			defer fbRows.Close()
			for fbRows.Next() {
				var e QueryStoreEntry
				var qText, qHash, pHash, modName, execType sql.NullString
				if err := fbRows.Scan(
					&e.QueryID,
					&e.PlanID,
					&qHash,
					&pHash,
					&modName,
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
					&e.TotalWrites,
					&e.AvgWrites,
					&e.TotalMemoryMB,
					&e.AvgMemoryMB,
					&e.TotalSpillsMB,
					&e.LastExecutionTime,
					&execType,
				); err == nil {
					if qHash.Valid {
						e.QueryHash = qHash.String
					}
					if pHash.Valid {
						e.PlanHash = pHash.String
					}
					if modName.Valid {
						e.ModuleName = modName.String
					}
					if execType.Valid {
						e.ExecutionType = execType.String
					}
					if qText.Valid {
						e.QueryText = strings.TrimSpace(qText.String)
					}
					entries = append(entries, e)
				}
			}
		}
	}

	return entries, nil
}

// GetLiveDPAPerspective extracts real telemetry for Programs, Databases, Machines, Users, Files, Drives
func (c *Client) GetLiveDPAPerspective(ctx context.Context, perspective string) ([]DPAPerspectiveItem, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected")
	}

	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	var sqlQuery string
	switch strings.ToLower(perspective) {
	case "programs":
		sqlQuery = `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT TOP 20
			ISNULL(NULLIF(s.program_name, ''), 'Unknown Application') AS item_name,
			'' AS secondary,
			COUNT(s.session_id) AS session_count,
			CAST(ISNULL(SUM(CAST(s.total_elapsed_time AS BIGINT)), 0) / 1000.0 AS FLOAT) AS wait_sec,
			CAST(ISNULL(SUM(CAST(s.cpu_time AS BIGINT)), 0) / 1000.0 AS FLOAT) AS cpu_sec,
			ISNULL(SUM(CAST(s.logical_reads AS BIGINT)), 0) AS logical_reads,
			ISNULL(SUM(CAST(s.writes AS BIGINT)), 0) AS writes
		FROM sys.dm_exec_sessions s
		WHERE s.is_user_process = 1
		GROUP BY s.program_name
		ORDER BY wait_sec DESC, cpu_sec DESC;
		`
	case "dbusers":
		sqlQuery = `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT TOP 20
			ISNULL(NULLIF(s.login_name, ''), 'Unknown Login') AS item_name,
			'' AS secondary,
			COUNT(s.session_id) AS session_count,
			CAST(ISNULL(SUM(CAST(s.total_elapsed_time AS BIGINT)), 0) / 1000.0 AS FLOAT) AS wait_sec,
			CAST(ISNULL(SUM(CAST(s.cpu_time AS BIGINT)), 0) / 1000.0 AS FLOAT) AS cpu_sec,
			ISNULL(SUM(CAST(s.logical_reads AS BIGINT)), 0) AS logical_reads,
			ISNULL(SUM(CAST(s.writes AS BIGINT)), 0) AS writes
		FROM sys.dm_exec_sessions s
		WHERE s.is_user_process = 1
		GROUP BY s.login_name
		ORDER BY wait_sec DESC, cpu_sec DESC;
		`
	case "machines":
		sqlQuery = `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT TOP 20
			ISNULL(NULLIF(s.host_name, ''), 'Localhost') AS item_name,
			'' AS secondary,
			COUNT(s.session_id) AS session_count,
			CAST(ISNULL(SUM(CAST(s.total_elapsed_time AS BIGINT)), 0) / 1000.0 AS FLOAT) AS wait_sec,
			CAST(ISNULL(SUM(CAST(s.cpu_time AS BIGINT)), 0) / 1000.0 AS FLOAT) AS cpu_sec,
			ISNULL(SUM(CAST(s.logical_reads AS BIGINT)), 0) AS logical_reads,
			ISNULL(SUM(CAST(s.writes AS BIGINT)), 0) AS writes
		FROM sys.dm_exec_sessions s
		WHERE s.is_user_process = 1
		GROUP BY s.host_name
		ORDER BY wait_sec DESC, cpu_sec DESC;
		`
	case "databases":
		sqlQuery = `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT TOP 20
			d.name AS item_name,
			'' AS secondary,
			COUNT(s.session_id) AS session_count,
			CAST(ISNULL(SUM(vfs.io_stall), 0) / 1000.0 AS FLOAT) AS wait_sec,
			CAST(ISNULL(SUM(CAST(s.cpu_time AS BIGINT)), 0) / 1000.0 AS FLOAT) AS cpu_sec,
			ISNULL(SUM(CAST(s.logical_reads AS BIGINT)), 0) AS logical_reads,
			ISNULL(SUM(CAST(s.writes AS BIGINT)), 0) AS writes
		FROM sys.databases d
		LEFT JOIN sys.dm_exec_sessions s ON s.database_id = d.database_id AND s.is_user_process = 1
		LEFT JOIN sys.dm_io_virtual_file_stats(NULL, NULL) vfs ON vfs.database_id = d.database_id
		GROUP BY d.name
		ORDER BY wait_sec DESC, session_count DESC;
		`
	case "files":
		sqlQuery = `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT TOP 20
			mf.name + ' (' + DB_NAME(mf.database_id) + ')' AS item_name,
			mf.physical_name AS secondary,
			1 AS session_count,
			CAST(ISNULL(vfs.io_stall, 0) / 1000.0 AS FLOAT) AS wait_sec,
			CAST(ISNULL(vfs.io_stall_read_ms, 0) / 1000.0 AS FLOAT) AS cpu_sec,
			ISNULL(vfs.num_of_reads, 0) AS logical_reads,
			ISNULL(vfs.num_of_writes, 0) AS writes
		FROM sys.dm_io_virtual_file_stats(NULL, NULL) vfs
		JOIN sys.master_files mf ON vfs.database_id = mf.database_id AND vfs.file_id = mf.file_id
		ORDER BY vfs.io_stall DESC;
		`
	case "drives":
		sqlQuery = `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT TOP 10
			UPPER(SUBSTRING(mf.physical_name, 1, 2)) AS item_name,
			'' AS secondary,
			COUNT(DISTINCT mf.database_id) AS session_count,
			CAST(ISNULL(SUM(vfs.io_stall), 0) / 1000.0 AS FLOAT) AS wait_sec,
			CAST(ISNULL(SUM(vfs.io_stall_read_ms), 0) / 1000.0 AS FLOAT) AS cpu_sec,
			ISNULL(SUM(vfs.num_of_reads), 0) AS logical_reads,
			ISNULL(SUM(vfs.num_of_writes), 0) AS writes
		FROM sys.dm_io_virtual_file_stats(NULL, NULL) vfs
		JOIN sys.master_files mf ON vfs.database_id = mf.database_id AND vfs.file_id = mf.file_id
		WHERE mf.physical_name LIKE '[A-Za-z]:%'
		GROUP BY UPPER(SUBSTRING(mf.physical_name, 1, 2))
		ORDER BY wait_sec DESC;
		`
	case "sessions":
		sqlQuery = `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT TOP 25
			'SPID #' + CAST(s.session_id AS VARCHAR(10)) + ' (' + ISNULL(NULLIF(s.login_name, ''), 'Session') + ')' AS item_name,
			ISNULL(s.program_name, '') AS secondary,
			1 AS session_count,
			CAST(ISNULL(r.wait_time, 0) / 1000.0 AS FLOAT) AS wait_sec,
			CAST(ISNULL(s.cpu_time, 0) / 1000.0 AS FLOAT) AS cpu_sec,
			ISNULL(s.logical_reads, 0) AS logical_reads,
			ISNULL(s.writes, 0) AS writes
		FROM sys.dm_exec_sessions s
		LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
		WHERE s.is_user_process = 1
		ORDER BY wait_sec DESC, s.cpu_time DESC;
		`
	case "blockers":
		sqlQuery = `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT TOP 25
			'Blocker SPID #' + CAST(wt.blocking_session_id AS VARCHAR(10)) + ' (Blocking SPID #' + CAST(wt.session_id AS VARCHAR(10)) + ')' AS item_name,
			ISNULL(wt.wait_type, 'LCK') AS secondary,
			1 AS session_count,
			CAST(ISNULL(wt.wait_duration_ms, 0) / 1000.0 AS FLOAT) AS wait_sec,
			0.0 AS cpu_sec,
			0 AS logical_reads,
			0 AS writes
		FROM sys.dm_os_waiting_tasks wt
		WHERE wt.blocking_session_id IS NOT NULL AND wt.blocking_session_id != wt.session_id
		ORDER BY wt.wait_duration_ms DESC;
		`
	case "plans":
		sqlQuery = `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT TOP 25
			'Plan 0x' + SUBSTRING(CONVERT(VARCHAR(64), qs.plan_handle, 1), 3, 10) + ' (' + ISNULL(SUBSTRING(st.text, 1, 28), 'Query') + ')' AS item_name,
			ISNULL(DB_NAME(st.dbid), '') AS secondary,
			CAST(qs.execution_count AS INT) AS session_count,
			CAST(ISNULL(qs.total_elapsed_time - qs.total_worker_time, 0) / 1000.0 AS FLOAT) AS wait_sec,
			CAST(ISNULL(qs.total_worker_time, 0) / 1000.0 AS FLOAT) AS cpu_sec,
			ISNULL(qs.total_logical_reads, 0) AS logical_reads,
			ISNULL(qs.total_physical_reads, 0) AS writes
		FROM sys.dm_exec_query_stats qs
		CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
		ORDER BY wait_sec DESC;
		`
	default:
		return nil, fmt.Errorf("unsupported perspective: %s", perspective)
	}

	rows, err := c.db.QueryContext(queryCtx, sqlQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to query perspective %s: %w", perspective, err)
	}
	defer rows.Close()

	var items []DPAPerspectiveItem
	var totalWait float64
	for rows.Next() {
		var item DPAPerspectiveItem
		if err := rows.Scan(
			&item.Name,
			&item.Secondary,
			&item.SessionCount,
			&item.WaitSec,
			&item.CPUSec,
			&item.LogicalReads,
			&item.Writes,
		); err != nil {
			continue
		}
		totalWait += item.WaitSec
		items = append(items, item)
	}

	for i := range items {
		if totalWait > 0 {
			items[i].Percentage = (items[i].WaitSec / totalWait) * 100.0
		} else {
			items[i].Percentage = 0.0
		}
	}

	return items, nil
}

var (
	rxVictimProc = regexp.MustCompile(`(?i)<victimProcess\s+id="([^"]+)"`)
	rxVictimAttr = regexp.MustCompile(`(?i)<deadlock\s+[^>]*victim="([^"]+)"`)
	rxProcess    = regexp.MustCompile(`(?i)<process\s+[^>]*id="([^"]+)"[^>]*spid="(\d+)"`)
	rxProcessAlt = regexp.MustCompile(`(?i)<process\s+[^>]*spid="(\d+)"[^>]*id="([^"]+)"`)
	rxKeyLock    = regexp.MustCompile(`(?i)<keylock\b`)
	rxPageLock   = regexp.MustCompile(`(?i)<pagelock\b`)
	rxObjectLock = regexp.MustCompile(`(?i)<objectlock\b`)
	rxExchange   = regexp.MustCompile(`(?i)<exchangeEvent\b`)
	rxObjectName = regexp.MustCompile(`(?i)objectname="([^"]+)"`)
)

