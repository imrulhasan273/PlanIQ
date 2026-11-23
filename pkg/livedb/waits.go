package livedb

import (
	"context"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/imrulhasan273/PlanIQ/pkg/configdb"
)

// GetWaitStats returns aggregated instance wait statistics from sys.dm_os_wait_stats
func (c *Client) GetWaitStats(ctx context.Context, limit int) ([]LiveWaitStat, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected {
		return nil, fmt.Errorf("not connected")
	}

	if limit <= 0 {
		limit = 50
	} else if limit > 500 {
		limit = 500
	}

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected")
	}

	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	sqlWaits := fmt.Sprintf(`
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	WITH FilteredWaits AS (
		SELECT 
			wait_type,
			waiting_tasks_count,
			wait_time_ms,
			signal_wait_time_ms
		FROM sys.dm_os_wait_stats
		WHERE wait_type NOT IN (
			'CLR_SEMAPHORE','LAZYWRITER_SLEEP','RESOURCE_QUEUE','SLEEP_TASK',
			'SLEEP_SYSTEMTASK','SQLTRACE_BUFFER_FLUSH','WAITFOR','LOGMGR_QUEUE',
			'CHECKPOINT_QUEUE','REQUEST_FOR_DEADLOCK_SEARCH','XE_TIMER_EVENT',
			'BROKER_TO_FLUSH','BROKER_TASK_STOP','CLR_MANUAL_EVENT',
			'CLR_AUTO_EVENT','DISPATCHER_QUEUE_SEMAPHORE','FT_IFTS_SCHEDULER_IDLE_WAIT',
			'XE_DISPATCHER_WAIT','XE_DISPATCHER_JOIN','SQLTRACE_INCREMENTAL_FLUSH_SLEEP',
			'DIRTY_PAGE_POLL','HADR_FILESTREAM_IOMGR_IOCOMPLETION','SP_SERVER_DIAGNOSTICS_SLEEP',
			'QDS_PERSIST_TASK_MAIN_LOOP_SLEEP','QDS_CLEANUP_STALE_QUERIES_TASK_MAIN_LOOP_SLEEP',
			'QDS_SHUTDOWN_QUEUE','VDI_CLIENT_OTHER','SOS_WORK_DISPATCHER',
			'HADR_WORK_QUEUE','BROKER_TRANSMITTER','HADR_NOTIFICATION_DEQUEUE',
			'PREEMPTIVE_XE_DISPATCHER','PREEMPTIVE_XE_GETTARGETSTATE','HADR_CLUSAPI_CALL',
			'HADR_TIMER_TASK','QDS_ASYNC_QUEUE','ONDEMAND_TASK_QUEUE',
			'PVS_PREALLOCATE','BROKER_EVENTHANDLER','BROKER_RECEIVE_WAITFOR',
			'SLEEP_BPOOL_FLUSH','SOS_PHYS_PAGE_CACHE','PARALLEL_REDO_WORKER_WAIT_WORK',
			'PARALLEL_REDO_FLOW_CONTROL','UCS_SESSION_REGISTRATION','SERVER_IDLE_CHECK',
			'REDO_THREAD_PENDING_WORK','PREEMPTIVE_HADR_LEASE_MECHANISM',
			'PREEMPTIVE_SP_SERVER_DIAGNOSTICS','PREEMPTIVE_OS_AUTHENTICATIONOPS',
			'PREEMPTIVE_OS_GENERICOPS','PREEMPTIVE_OS_QUERYREGISTRY','PREEMPTIVE_XE_CALLBACKEXECUTE',
			'STARTUP_DEPENDENCY_MANAGER','WAIT_FOR_RESULTS'
		)
		AND wait_type NOT LIKE 'SLEEP_%%'
		AND wait_type NOT LIKE 'XE_%%'
		AND wait_type NOT LIKE 'BROKER_%%'
		AND wait_type NOT LIKE 'FT_%%'
		AND wait_type NOT LIKE 'HADR_NOTIFICATION%%'
		AND wait_type NOT LIKE 'PREEMPTIVE_XE_%%'
		AND wait_time_ms > 100
	),
	TotalWait AS (
		SELECT CAST(NULLIF(SUM(wait_time_ms), 0) AS FLOAT) AS total_ms FROM FilteredWaits
	)
	SELECT TOP (%d)
		fw.wait_type,
		fw.waiting_tasks_count,
		fw.wait_time_ms,
		fw.signal_wait_time_ms,
		ROUND(100.0 * fw.wait_time_ms / ISNULL(tw.total_ms, 1), 2) AS percentage
	FROM FilteredWaits fw
	CROSS JOIN TotalWait tw
	ORDER BY fw.wait_time_ms DESC;
	`, limit)

	rows, err := c.db.QueryContext(queryCtx, sqlWaits)
	if err != nil {
		return nil, fmt.Errorf("failed to query wait stats: %w", err)
	}
	defer rows.Close()

	var stats []LiveWaitStat
	for rows.Next() {
		var s LiveWaitStat
		if err := rows.Scan(&s.WaitType, &s.WaitingTasksCount, &s.WaitTimeMs, &s.SignalWaitTimeMs, &s.Percentage); err != nil {
			continue
		}
		// Categorize
		wt := strings.ToUpper(s.WaitType)
		if strings.HasPrefix(wt, "PAGEIO") || wt == "WRITELOG" || strings.HasPrefix(wt, "IO_") {
			s.WaitCategory = "Disk I/O"
		} else if strings.HasPrefix(wt, "LCK_") {
			s.WaitCategory = "Locking"
		} else if strings.HasPrefix(wt, "CXPACKET") || strings.HasPrefix(wt, "CXCONSUMER") {
			s.WaitCategory = "Parallelism"
		} else if wt == "SOS_SCHEDULER_YIELD" || strings.HasPrefix(wt, "THREADPOOL") {
			s.WaitCategory = "CPU Scheduler"
		} else if wt == "ASYNC_NETWORK_IO" {
			s.WaitCategory = "Network"
		} else if strings.HasPrefix(wt, "RESOURCE_SEMAPHORE") {
			s.WaitCategory = "Memory"
		} else {
			s.WaitCategory = "Engine"
		}
		stats = append(stats, s)
	}
	return stats, nil
}


// GetPerformanceAdvisors returns automated AI performance insights and anomaly alerts (SolarWinds DPA Advisors)
func (c *Client) GetPerformanceAdvisors(ctx context.Context) ([]PerformanceAdvisor, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected")
	}

	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	const sqlAdvisorQueries = `
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SET LOCK_TIMEOUT 1000;
	SELECT TOP (25)
		qs.query_hash,
		qs.execution_count,
		ROUND(qs.total_worker_time / 1000.0, 1) AS total_cpu_ms,
		ROUND(qs.total_elapsed_time / 1000.0, 1) AS total_duration_ms,
		ROUND(qs.total_logical_reads, 1) AS total_reads,
		qs.plan_generation_num,
		ISNULL(t.text, 'SELECT ...') AS query_text,
		ISNULL(CONVERT(VARCHAR(19), qs.last_execution_time, 120), '') AS last_exec_time
	FROM sys.dm_exec_query_stats qs
	CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) t
	ORDER BY qs.total_worker_time DESC;
	`

	rows, err := c.db.QueryContext(queryCtx, sqlAdvisorQueries)
	if err != nil {
		return nil, fmt.Errorf("failed to query performance advisors: %w", err)
	}
	defer rows.Close()

	var advisors []PerformanceAdvisor
	idx := 1
	for rows.Next() {
		var qHash []byte
		var execCount int64
		var totalCpu float64
		var totalDuration float64
		var totalReads float64
		var planGenNum int
		var qText string
		var lastExecTime string

		if err := rows.Scan(&qHash, &execCount, &totalCpu, &totalDuration, &totalReads, &planGenNum, &qText, &lastExecTime); err != nil {
			continue
		}

		qTextTrim := strings.TrimSpace(qText)
		hashStr := hex.EncodeToString(qHash)
		if len(hashStr) > 8 {
			hashStr = hashStr[:8]
		}

		displayTime := lastExecTime
		if t, err := time.Parse("2006-01-02 15:04:05", lastExecTime); err == nil {
			displayTime = t.Format("2006-01-02 15:04")
		} else if displayTime == "" {
			displayTime = time.Now().Format("2006-01-02 15:04")
		}

		// Heuristic 1: In-Memory / CPU Burner (CPU > 80% of Duration)
		if totalDuration > 0 && (totalCpu/totalDuration) >= 0.8 && totalCpu > 500 {
			advisors = append(advisors, PerformanceAdvisor{
				ID:             fmt.Sprintf("adv-cpu-%d", idx),
				Severity:       "critical",
				Category:       "CPU/Memory",
				Title:          fmt.Sprintf("Query #%s accounted for high CPU execution (100%% In-Memory/CPU)", hashStr),
				Description:    fmt.Sprintf("CPU time (%.0f ms) is ~%.0f%% of total elapsed duration (%.0f ms). Query is spinning on CPU with minimal disk wait, indicating clustered index scans or scalar function overhead.", totalCpu, (totalCpu/totalDuration)*100, totalDuration),
				QueryText:      qTextTrim,
				MetricValue:    fmt.Sprintf("%.0f ms CPU (%d Executions)", totalCpu, execCount),
				Timestamp:      displayTime,
				Recommendation: "Analyze plan for missing index or scalar function inlining. Verify SARGable WHERE clauses.",
			})
			idx++
		}

		// Heuristic 2: High execution frequency
		if execCount > 5000 {
			advisors = append(advisors, PerformanceAdvisor{
				ID:             fmt.Sprintf("adv-exec-%d", idx),
				Severity:       "warning",
				Category:       "Executions",
				Title:          fmt.Sprintf("Query #%s has high execution frequency (%d executions)", hashStr, execCount),
				Description:    fmt.Sprintf("High execution volume query generating significant plan cache churn and lock overhead."),
				QueryText:      qTextTrim,
				MetricValue:    fmt.Sprintf("%d Executions", execCount),
				Timestamp:      displayTime,
				Recommendation: "Consider client-side caching or batching queries to reduce round-trips to SQL Server.",
			})
			idx++
		}

		// Heuristic 3: Plan compilation churn
		if planGenNum > 3 {
			advisors = append(advisors, PerformanceAdvisor{
				ID:             fmt.Sprintf("adv-plan-%d", idx),
				Severity:       "warning",
				Category:       "Plan Regression",
				Title:          fmt.Sprintf("Query #%s plan has changed / recompiled %d times", hashStr, planGenNum),
				Description:    "Multiple plan compilations detected. May indicate parameter sniffing or temporary table schema modifications triggering recompilation.",
				QueryText:      qTextTrim,
				MetricValue:    fmt.Sprintf("%d Recompilations", planGenNum),
				Timestamp:      displayTime,
				Recommendation: "Check for OPTION(RECOMPILE) or optimize query parameter sniffing with OPTIMIZE FOR.",
			})
			idx++
		}
	}

	return advisors, nil
}

// GetWaitHistory returns hourly/daily wait time history and anomalies (SolarWinds DPA Trend Chart)
// If connected to SQL Server, it queries the past 7 days from sys.query_store_wait_stats and caches locally.
// If disconnected or offline, it transparently returns cached points from local SQLite.
func (c *Client) GetWaitHistory(ctx context.Context) ([]WaitTimeHistoryPoint, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	// 1. Offline Fallback: If not connected, load from local SQLite cache
	if !c.status.Connected || c.db == nil {
		store, err := configdb.GetDB()
		if err == nil {
			cached, err := store.GetStoredWaitHistory(c.status.ServerName, c.status.DatabaseName, 7)
			if err == nil && len(cached) > 0 {
				var pts []WaitTimeHistoryPoint
				for _, p := range cached {
					pts = append(pts, WaitTimeHistoryPoint{
						IntervalLabel:  p.IntervalLabel,
						TotalWaitMs:    p.TotalWaitMs,
						CPUWaitMs:      p.CPUWaitMs,
						LockWaitMs:     p.LockWaitMs,
						IOWaitMs:       p.IOWaitMs,
						MemoryWaitMs:   p.MemoryWaitMs,
						OtherWaitMs:    p.OtherWaitMs,
						ExecutionCount: p.ExecutionCount,
						IsAnomaly:      p.IsAnomaly,
						AnomalyReason:  p.AnomalyReason,
					})
				}
				return pts, nil
			}
		}
		return nil, fmt.Errorf("not connected and no local history cache available")
	}

	queryCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	// Query up to 168 hourly intervals (7 days) from Query Store
	const sqlWaitHistory = `
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SET LOCK_TIMEOUT 1500;
	IF EXISTS (SELECT 1 FROM sys.databases WHERE name = DB_NAME() AND is_query_store_on = 1)
	BEGIN
		SELECT TOP (168)
			CONVERT(VARCHAR(16), i.start_time, 120) AS interval_label,
			ISNULL(SUM(w.total_query_wait_time_ms), 0) AS total_wait_ms,
			ISNULL(SUM(CASE WHEN w.wait_category_desc = 'CPU' THEN w.total_query_wait_time_ms ELSE 0 END), 0) AS cpu_wait_ms,
			ISNULL(SUM(CASE WHEN w.wait_category_desc IN ('Lock', 'Latch') THEN w.total_query_wait_time_ms ELSE 0 END), 0) AS lock_wait_ms,
			ISNULL(SUM(CASE WHEN w.wait_category_desc IN ('Buffer IO', 'Other Disk IO') THEN w.total_query_wait_time_ms ELSE 0 END), 0) AS io_wait_ms,
			ISNULL(SUM(CASE WHEN w.wait_category_desc = 'Memory' THEN w.total_query_wait_time_ms ELSE 0 END), 0) AS memory_wait_ms,
			ISNULL(SUM(CASE WHEN w.wait_category_desc NOT IN ('CPU', 'Lock', 'Latch', 'Buffer IO', 'Other Disk IO', 'Memory') THEN w.total_query_wait_time_ms ELSE 0 END), 0) AS other_wait_ms,
			COUNT(DISTINCT w.plan_id) AS exec_count
		FROM sys.query_store_wait_stats w
		JOIN sys.query_store_runtime_stats_interval i ON w.runtime_stats_interval_id = i.runtime_stats_interval_id
		WHERE i.start_time >= DATEADD(DAY, -7, SYSDATETIMEOFFSET())
		GROUP BY i.start_time
		ORDER BY i.start_time DESC;
	END
	ELSE
	BEGIN
		SELECT 'NoQueryStore' AS interval_label, 0 AS total_wait_ms, 0, 0, 0, 0, 0, 0;
	END
	`

	rows, err := c.db.QueryContext(queryCtx, sqlWaitHistory)
	if err != nil {
		// If query fails, attempt to read from local SQLite
		store, sErr := configdb.GetDB()
		if sErr == nil {
			cached, cErr := store.GetStoredWaitHistory(c.status.ServerName, c.status.DatabaseName, 7)
			if cErr == nil && len(cached) > 0 {
				var pts []WaitTimeHistoryPoint
				for _, p := range cached {
					pts = append(pts, WaitTimeHistoryPoint{
						IntervalLabel:  p.IntervalLabel,
						TotalWaitMs:    p.TotalWaitMs,
						CPUWaitMs:      p.CPUWaitMs,
						LockWaitMs:     p.LockWaitMs,
						IOWaitMs:       p.IOWaitMs,
						MemoryWaitMs:   p.MemoryWaitMs,
						OtherWaitMs:    p.OtherWaitMs,
						ExecutionCount: p.ExecutionCount,
						IsAnomaly:      p.IsAnomaly,
						AnomalyReason:  p.AnomalyReason,
					})
				}
				return pts, nil
			}
		}
		return nil, fmt.Errorf("failed to query wait history: %w", err)
	}
	defer rows.Close()

	var points []WaitTimeHistoryPoint
	for rows.Next() {
		var p WaitTimeHistoryPoint
		if err := rows.Scan(
			&p.IntervalLabel,
			&p.TotalWaitMs,
			&p.CPUWaitMs,
			&p.LockWaitMs,
			&p.IOWaitMs,
			&p.MemoryWaitMs,
			&p.OtherWaitMs,
			&p.ExecutionCount,
		); err != nil {
			continue
		}
		if p.IntervalLabel == "NoQueryStore" || p.TotalWaitMs == 0 {
			continue
		}
		// Calculate anomaly heuristic (> 250s total wait in interval)
		if p.TotalWaitMs > 250000 {
			p.IsAnomaly = true
			if p.LockWaitMs > p.CPUWaitMs && p.LockWaitMs > p.IOWaitMs {
				p.AnomalyReason = "Severe Lock Contention Spike"
			} else if p.IOWaitMs > p.CPUWaitMs {
				p.AnomalyReason = "Disk I/O Latency Bottleneck"
			} else {
				p.AnomalyReason = "CPU Processing Surge"
			}
		}
		points = append(points, p)
	}

	// 2. Persist to local SQLite for instant offline playback & history scrubbing
	if len(points) > 0 {
		go func(pts []WaitTimeHistoryPoint, srv, dbName string) {
			store, err := configdb.GetDB()
			if err != nil {
				return
			}
			var stored []configdb.StoredWaitPoint
			for _, p := range pts {
				stored = append(stored, configdb.StoredWaitPoint{
					ServerName:     srv,
					DatabaseName:   dbName,
					IntervalLabel:  p.IntervalLabel,
					TotalWaitMs:    p.TotalWaitMs,
					CPUWaitMs:      p.CPUWaitMs,
					LockWaitMs:     p.LockWaitMs,
					IOWaitMs:       p.IOWaitMs,
					MemoryWaitMs:   p.MemoryWaitMs,
					OtherWaitMs:    p.OtherWaitMs,
					ExecutionCount: p.ExecutionCount,
					IsAnomaly:      p.IsAnomaly,
					AnomalyReason:  p.AnomalyReason,
				})
			}
			_ = store.SaveWaitHistorySnapshots(srv, dbName, stored)
			_ = store.PurgeOldWaitHistory(7)
		}(points, c.status.ServerName, c.status.DatabaseName)
	}

	return points, nil
}

// SyncSevenDayHistory explicitly pulls 7-day rolling telemetry from Query Store and system_health,
// persisting all points into local SQLite so the DBA has full offline history.
func (c *Client) SyncSevenDayHistory(ctx context.Context) (*SevenDaySyncResult, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("cannot sync history: not connected to SQL Server")
	}

	res := &SevenDaySyncResult{
		ServerName:   c.status.ServerName,
		DatabaseName: c.status.DatabaseName,
		SyncedAt:     time.Now().UTC().Format(time.RFC3339),
	}

	// 1. Check if Query Store is enabled
	var qsOn int
	checkCtx, checkCancel := context.WithTimeout(ctx, 4*time.Second)
	defer checkCancel()
	_ = c.db.QueryRowContext(checkCtx, `SELECT is_query_store_on FROM sys.databases WHERE name = DB_NAME();`).Scan(&qsOn)
	res.IsQueryStoreOn = (qsOn == 1)

	// 2. Fetch wait history (up to 7 days = 168 hours)
	pts, err := c.GetWaitHistory(ctx)
	if err == nil {
		res.IntervalsSynced = len(pts)
	}

	// 3. Fetch deadlocks from system_health
	deadlocks, dErr := c.GetLiveDeadlocks(ctx, 25)
	if dErr == nil {
		res.DeadlocksSynced = len(deadlocks)
	}

	if !res.IsQueryStoreOn {
		res.Message = fmt.Sprintf("Synced %d deadlocks from system_health. Note: Query Store is currently DISABLED on database '%s'. Enable Query Store for full hourly wait category breakdowns.", res.DeadlocksSynced, res.DatabaseName)
	} else {
		res.Message = fmt.Sprintf("Successfully harvested %d hourly wait intervals and %d deadlocks from Query Store & system_health into local SQLite.", res.IntervalsSynced, res.DeadlocksSynced)
	}

	return res, nil
}

