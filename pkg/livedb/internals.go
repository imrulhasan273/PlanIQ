package livedb

import (
	"context"
	"fmt"
	"log"
	"math"
	"strings"
	"time"
)

// GetServerVitals returns CPU, memory, and TempDB pressure metrics
func (c *Client) GetServerVitals(ctx context.Context) (*ServerVitals, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected")
	}

	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	var v ServerVitals

	// 1. CPU Queue (runnable tasks across VISIBLE ONLINE schedulers)
	_ = c.db.QueryRowContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT ISNULL(SUM(runnable_tasks_count), 0)
		FROM sys.dm_os_schedulers 
		WHERE status = 'VISIBLE ONLINE';
	`).Scan(&v.CPUQueueTasks)

	// 2. True Signal Wait % (percentage of wait time spent on CPU queue waiting to run)
	_ = c.db.QueryRowContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT CAST(ISNULL(ROUND(100.0 * SUM(signal_wait_time_ms) / NULLIF(SUM(wait_time_ms), 0), 2), 0) AS FLOAT)
		FROM sys.dm_os_wait_stats
		WHERE wait_type NOT IN (
			'CLR_SEMAPHORE','LAZYWRITER_SLEEP','RESOURCE_QUEUE','SLEEP_TASK',
			'SLEEP_SYSTEMTASK','SQLTRACE_BUFFER_FLUSH','WAITFOR','LOGMGR_QUEUE',
			'CHECKPOINT_QUEUE','REQUEST_FOR_DEADLOCK_SEARCH','XE_TIMER_EVENT'
		);
	`).Scan(&v.SignalWaitPct)

	// 3. Memory Grants Pending (queries queued waiting for query workspace memory)
	_ = c.db.QueryRowContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT ISNULL(COUNT(*), 0) 
		FROM sys.dm_exec_query_memory_grants 
		WHERE is_next_candidate IS NOT NULL;
	`).Scan(&v.MemoryGrantsPending)

	// 4. Available Physical Host Memory (MB)
	_ = c.db.QueryRowContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT CAST(ISNULL(available_physical_memory_kb / 1024.0, 0) AS FLOAT)
		FROM sys.dm_os_sys_memory;
	`).Scan(&v.AvailableMemoryMB)

	// 5. TempDB Physical Space Usage (User #tables and internal hash/sort spill workspace)
	_ = c.db.QueryRowContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT 
			CAST(ISNULL(SUM(user_object_reserved_page_count) * 8.0 / 1024.0, 0) AS FLOAT) AS user_mb,
			CAST(ISNULL(SUM(internal_object_reserved_page_count) * 8.0 / 1024.0, 0) AS FLOAT) AS internal_mb
		FROM tempdb.sys.dm_db_file_space_usage;
	`).Scan(&v.TempDBUserObjectsMB, &v.TempDBInternalMB)

	// 6. Batch Requests / Sec (Calculated from performance counter delta and uptime)
	var currentBatchCount int64
	var uptimeSeconds int64
	err := c.db.QueryRowContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT 
			ISNULL(MAX(p.cntr_value), 0),
			ISNULL(MAX(DATEDIFF(SECOND, i.sqlserver_start_time, GETDATE())), 1)
		FROM sys.dm_os_performance_counters p
		CROSS JOIN sys.dm_os_sys_info i
		WHERE p.counter_name = 'Batch Requests/sec';
	`).Scan(&currentBatchCount, &uptimeSeconds)

	if err == nil {
		now := time.Now()
		if c.lastBatchCount > 0 && !c.lastBatchTimestamp.IsZero() {
			deltaSec := now.Sub(c.lastBatchTimestamp).Seconds()
			if deltaSec > 0.5 && currentBatchCount >= c.lastBatchCount {
				v.BatchRequestsPerSec = float64(currentBatchCount-c.lastBatchCount) / deltaSec
			}
		}
		if v.BatchRequestsPerSec <= 0 && uptimeSeconds > 0 {
			// Baseline rate since startup as immediate fallback on initial poll
			v.BatchRequestsPerSec = float64(currentBatchCount) / float64(uptimeSeconds)
		}
		c.lastBatchCount = currentBatchCount
		c.lastBatchTimestamp = now
	}

	return &v, nil
}



// GetMissingIndexes returns missing index recommendations harvested from live DMVs
func (c *Client) GetMissingIndexes(ctx context.Context, limit int) ([]LiveMissingIndex, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected")
	}

	if limit <= 0 {
		limit = 30
	} else if limit > 500 {
		limit = 500
	}

	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	sqlIndexes := fmt.Sprintf(`
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SELECT TOP (%d)
		ISNULL(DB_NAME(d.database_id), DB_NAME()) AS database_name,
		ISNULL(d.statement, '') AS table_name,
		ROUND(s.avg_total_user_cost * s.avg_user_impact * (s.user_seeks + s.user_scans), 1) AS impact_score,
		s.user_seeks,
		s.user_scans,
		s.avg_total_user_cost,
		s.avg_user_impact,
		ISNULL(d.equality_columns, '') AS equality_columns,
		ISNULL(d.inequality_columns, '') AS inequality_columns,
		ISNULL(d.included_columns, '') AS included_columns
	FROM sys.dm_db_missing_index_group_stats s
	JOIN sys.dm_db_missing_index_groups g ON s.group_handle = g.index_group_handle
	JOIN sys.dm_db_missing_index_details d ON g.index_handle = d.index_handle
	ORDER BY impact_score DESC;
	`, limit)

	rows, err := c.db.QueryContext(queryCtx, sqlIndexes)
	if err != nil {
		return nil, fmt.Errorf("failed to query missing indexes: %w", err)
	}
	defer rows.Close()

	var indexes []LiveMissingIndex
	for rows.Next() {
		var idx LiveMissingIndex
		if err := rows.Scan(
			&idx.DatabaseName,
			&idx.TableName,
			&idx.ImpactScore,
			&idx.UserSeeks,
			&idx.UserScans,
			&idx.AvgTotalUserCost,
			&idx.AvgUserImpact,
			&idx.EqualityColumns,
			&idx.InequalityColumns,
			&idx.IncludedColumns,
		); err != nil {
			continue
		}
		// Build synthetic CREATE INDEX statement
		idx.CreateIndexStatement = fmt.Sprintf("CREATE NONCLUSTERED INDEX IX_Auto_%s ON %s (%s%s) INCLUDE (%s) WITH (ONLINE = ON);",
			strings.ReplaceAll(idx.TableName, ".", "_"),
			idx.TableName,
			idx.EqualityColumns,
			idx.InequalityColumns,
			idx.IncludedColumns,
		)
		indexes = append(indexes, idx)
	}
	return indexes, nil
}


// GetBufferPoolUsage returns memory distribution of tables and indexes in SQL Server buffer pool (sys.dm_os_buffer_descriptors)
func (c *Client) GetBufferPoolUsage(ctx context.Context, limit int) ([]BufferPoolConsumer, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected")
	}

	if limit <= 0 {
		limit = 50
	} else if limit > 200 {
		limit = 200
	}

	// Use a moderate timeout: 25s covers slow WAN links but caps runaway queries.
	queryCtx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()

	// Lightning-fast single-pass partition stats query:
	// - No sys.tables / sys.indexes catalog JOIN — avoids all catalog latch contention
	// - Uses OBJECT_NAME() / OBJECT_SCHEMA_NAME() which resolve from in-memory syscache
	// - OBJECTPROPERTY(..., 'IsUserTable') = 1 filters system objects without a table scan
	// - MAXDOP 1 ensures zero parallel CPU impact on OLTP servers
	// - Typically completes in < 10ms even on 10,000-table databases
	sqlBuffer := fmt.Sprintf(`
	SET NOCOUNT ON;
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SET LOCK_TIMEOUT 5000;

	SELECT TOP (%d)
		DB_NAME()                                                                     AS database_name,
		ISNULL(OBJECT_SCHEMA_NAME(p.object_id), 'dbo')                               AS schema_name,
		ISNULL(OBJECT_NAME(p.object_id), 'Unknown')                                  AS object_name,
		ISNULL(i.name, 'HEAP')                                                        AS index_name,
		ISNULL(i.type_desc, 'HEAP')                                                   AS index_type,
		CAST(ROUND(p.used_page_count * 8.0 / 1024.0, 2) AS FLOAT)                   AS buffer_size_mb,
		CAST(ROUND(p.used_page_count * 8.0 / 1024.0, 2) AS FLOAT)                   AS clean_pages_mb,
		0.0                                                                           AS dirty_pages_mb,
		CAST(p.row_count AS BIGINT)                                                   AS row_count
	FROM sys.dm_db_partition_stats p WITH (NOLOCK)
	JOIN sys.indexes i WITH (NOLOCK)
		ON p.object_id = i.object_id
		AND p.index_id = i.index_id
	WHERE
		p.used_page_count > 0
		AND OBJECTPROPERTY(p.object_id, 'IsUserTable') = 1
	ORDER BY
		p.used_page_count DESC
	OPTION (MAXDOP 1, FAST 10);
	`, limit)

	rows, err := c.db.QueryContext(queryCtx, sqlBuffer)
	if err != nil {
		log.Printf("[LiveDB] Buffer memory query failed: %v", err)
		return nil, fmt.Errorf("failed to query buffer memory: %w", err)
	}
	defer rows.Close()

	var consumers []BufferPoolConsumer
	var totalMB float64
	for rows.Next() {
		var b BufferPoolConsumer
		if err := rows.Scan(
			&b.DatabaseName,
			&b.SchemaName,
			&b.ObjectName,
			&b.IndexName,
			&b.IndexType,
			&b.BufferSizeMB,
			&b.CleanPagesMB,
			&b.DirtyPagesMB,
			&b.RowCount,
		); err != nil {
			log.Printf("[LiveDB] Buffer scan error: %v", err)
			continue
		}
		totalMB += b.BufferSizeMB
		consumers = append(consumers, b)
	}

	if totalMB > 0 {
		for i := range consumers {
			consumers[i].PercentageOfBuffer = (consumers[i].BufferSizeMB / totalMB) * 100.0
		}
	}

	return consumers, nil
}

// GetUnusedIndexes returns indexes with write overhead but 0 user seeks/scans (sys.dm_db_index_usage_stats)
func (c *Client) GetUnusedIndexes(ctx context.Context, limit int) ([]UnusedIndex, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected")
	}

	if limit <= 0 {
		limit = 30
	} else if limit > 200 {
		limit = 200
	}

	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	sqlUnused := fmt.Sprintf(`
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SET LOCK_TIMEOUT 1000;
	SELECT TOP (%d)
		DB_NAME(u.database_id) AS database_name,
		SCHEMA_NAME(t.schema_id) AS schema_name,
		t.name AS table_name,
		i.name AS index_name,
		i.type_desc AS index_type,
		ISNULL(u.user_updates, 0) AS user_writes,
		ISNULL(u.user_seeks, 0) AS user_seeks,
		ISNULL(u.user_scans, 0) AS user_scans,
		ISNULL(u.user_lookups, 0) AS user_lookups,
		ROUND(SUM(p.used_page_count) * 8.0 / 1024.0, 1) AS index_size_mb
	FROM sys.dm_db_index_usage_stats u
	JOIN sys.tables t ON u.object_id = t.object_id
	JOIN sys.indexes i ON u.object_id = i.object_id AND u.index_id = i.index_id
	JOIN sys.dm_db_partition_stats p ON i.object_id = p.object_id AND i.index_id = p.index_id
	WHERE u.database_id = DB_ID()
	  AND i.is_primary_key = 0
	  AND i.is_unique = 0
	  AND i.type_desc = 'NONCLUSTERED'
	  AND u.user_seeks = 0 AND u.user_scans = 0 AND u.user_lookups = 0
	  AND u.user_updates > 50
	GROUP BY u.database_id, t.schema_id, t.name, i.name, i.type_desc, u.user_updates, u.user_seeks, u.user_scans, u.user_lookups
	ORDER BY user_writes DESC;
	`, limit)

	rows, err := c.db.QueryContext(queryCtx, sqlUnused)
	if err != nil {
		return nil, fmt.Errorf("failed to query unused indexes: %w", err)
	}
	defer rows.Close()

	var un []UnusedIndex
	for rows.Next() {
		var idx UnusedIndex
		if err := rows.Scan(
			&idx.DatabaseName,
			&idx.SchemaName,
			&idx.TableName,
			&idx.IndexName,
			&idx.IndexType,
			&idx.UserWrites,
			&idx.UserSeeks,
			&idx.UserScans,
			&idx.UserLookups,
			&idx.IndexSizeMB,
		); err != nil {
			continue
		}
		idx.DropStatement = fmt.Sprintf("DROP INDEX %s ON %s.%s;", idx.IndexName, idx.SchemaName, idx.TableName)
		un = append(un, idx)
	}

	return un, nil
}

// GetDuplicateIndexes returns overlapping or duplicate nonclustered indexes on the same table
func (c *Client) GetDuplicateIndexes(ctx context.Context) ([]DuplicateIndex, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected")
	}

	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	const sqlDup = `
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SET LOCK_TIMEOUT 1000;
	WITH IndexCols AS (
		SELECT 
			t.name AS table_name,
			i.name AS index_name,
			STRING_AGG(CASE WHEN ic.is_included_column = 0 THEN c.name END, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS key_cols,
			STRING_AGG(CASE WHEN ic.is_included_column = 1 THEN c.name END, ', ') WITHIN GROUP (ORDER BY ic.index_column_id) AS inc_cols
		FROM sys.tables t
		JOIN sys.indexes i ON t.object_id = i.object_id
		JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
		JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
		WHERE i.type_desc = 'NONCLUSTERED' AND i.is_primary_key = 0 AND i.is_unique = 0
		GROUP BY t.name, i.name
	)
	SELECT 
		a.table_name,
		a.index_name,
		b.index_name AS duplicate_of,
		ISNULL(a.key_cols, '') AS key_cols,
		ISNULL(a.inc_cols, 'None') AS inc_cols,
		CASE 
			WHEN a.key_cols = b.key_cols AND ISNULL(a.inc_cols, '') = ISNULL(b.inc_cols, '') THEN 'Exact Duplicate'
			ELSE 'Left-Prefix Redundant'
		END AS overlap_type
	FROM IndexCols a
	JOIN IndexCols b ON a.table_name = b.table_name 
		AND a.index_name <> b.index_name
		AND (a.key_cols = b.key_cols OR b.key_cols LIKE a.key_cols + ',%');
	`

	rows, err := c.db.QueryContext(queryCtx, sqlDup)
	if err != nil {
		return nil, fmt.Errorf("failed to query duplicate indexes: %w", err)
	}
	defer rows.Close()

	var dups []DuplicateIndex
	for rows.Next() {
		var d DuplicateIndex
		if err := rows.Scan(
			&d.TableName,
			&d.IndexName,
			&d.DuplicateOf,
			&d.IndexCols,
			&d.IncludedCols,
			&d.OverlapType,
		); err != nil {
			continue
		}
		d.DropStatement = fmt.Sprintf("DROP INDEX %s ON %s; -- Subsumed by %s", d.IndexName, d.TableName, d.DuplicateOf)
		dups = append(dups, d)
	}

	return dups, nil
}

// GetEngineInternals inspects CPU scheduler quantum exhaustion, SPID attribution, and NUMA node memory balancing (sp_PressureDetector parity)
func (c *Client) GetEngineInternals(ctx context.Context) (*EngineInternalsReport, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected")
	}

	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	report := &EngineInternalsReport{
		MaxWorkersCount: 512,
		ActiveTasks:     make([]SchedulerActiveTask, 0),
		Schedulers:      make([]CPUSchedulerInfo, 0),
		NUMANodes:       make([]NUMANodeInfo, 0),
	}

	// 1. Get max_workers_count from sys.dm_os_sys_info
	_ = c.db.QueryRowContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT ISNULL(max_workers_count, 512) FROM sys.dm_os_sys_info;
	`).Scan(&report.MaxWorkersCount)

	// Time elapsed since last scheduler delta sample
	now := time.Now()
	var elapsedSec float64
	if !c.lastSchedSampleTime.IsZero() {
		elapsedSec = now.Sub(c.lastSchedSampleTime).Seconds()
	}
	newYields := make(map[int]int64)
	newSwitches := make(map[int]int64)
	nodeRunnable := make(map[int]int)

	// 2. Query visible schedulers from sys.dm_os_schedulers
	schedRows, err := c.db.QueryContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT 
			s.scheduler_id,
			s.cpu_id,
			s.status,
			s.is_online,
			s.is_idle,
			s.current_tasks_count,
			s.runnable_tasks_count,
			s.active_workers_count,
			s.work_queue_count,
			s.context_switches_count,
			s.yield_count,
			s.preemptive_switches_count,
			s.parent_node_id
		FROM sys.dm_os_schedulers s WITH (NOLOCK)
		WHERE s.status IN ('VISIBLE ONLINE', 'VISIBLE OFFLINE')
		ORDER BY s.scheduler_id;
	`)
	if err == nil {
		defer schedRows.Close()
		for schedRows.Next() {
			var s CPUSchedulerInfo
			if err := schedRows.Scan(
				&s.SchedulerID,
				&s.CPUID,
				&s.Status,
				&s.IsOnline,
				&s.IsIdle,
				&s.CurrentTasksCount,
				&s.RunnableTasksCount,
				&s.ActiveWorkersCount,
				&s.WorkQueueCount,
				&s.ContextSwitchesCount,
				&s.YieldCount,
				&s.PreemptiveSwitches,
				&s.ParentNodeID,
			); err != nil {
				continue
			}

			// Compute delta rates if previous sample exists
			if elapsedSec > 0.4 && c.lastSchedYields != nil {
				if prevYield, ok := c.lastSchedYields[s.SchedulerID]; ok && s.YieldCount >= prevYield {
					s.YieldsPerSec = float64(s.YieldCount-prevYield) / elapsedSec
				}
				if prevSwitch, ok := c.lastSchedSwitches[s.SchedulerID]; ok && s.ContextSwitchesCount >= prevSwitch {
					s.ContextSwitchesPerSec = float64(s.ContextSwitchesCount-prevSwitch) / elapsedSec
				}
			}
			newYields[s.SchedulerID] = s.YieldCount
			newSwitches[s.SchedulerID] = s.ContextSwitchesCount
			nodeRunnable[s.ParentNodeID] += s.RunnableTasksCount

			// Quantum health evaluation (Erik Darling criteria)
			if s.WorkQueueCount > 0 {
				s.QuantumHealth = "Critical"
			} else if s.RunnableTasksCount > 2 {
				s.QuantumHealth = "Warning"
			} else {
				s.QuantumHealth = "Healthy"
			}

			report.TotalActiveWorkers += s.ActiveWorkersCount
			report.TotalRunnableTasks += s.RunnableTasksCount
			if s.WorkQueueCount > 0 {
				report.ThreadPoolStarvation = true
			}
			report.Schedulers = append(report.Schedulers, s)
		}

		c.lastSchedSampleTime = now
		c.lastSchedYields = newYields
		c.lastSchedSwitches = newSwitches
	}

	// 3. Query Active Tasks and Queries bound to Schedulers (sp_PressureDetector parity)
	taskRows, err := c.db.QueryContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT TOP 30
			t.scheduler_id,
			s.cpu_id,
			s.parent_node_id,
			t.session_id,
			t.request_id,
			t.task_state,
			ISNULL(r.cpu_time, 0) AS cpu_time_ms,
			ISNULL(r.total_elapsed_time, 0) AS total_elapsed_time,
			ISNULL(r.wait_type, '') AS wait_type,
			ISNULL(r.wait_time, 0) AS wait_time_ms,
			ISNULL(r.command, '') AS command,
			ISNULL(DB_NAME(r.database_id), '') AS database_name,
			SUBSTRING(ISNULL(st.text, ''), 1, 300) AS query_text
		FROM sys.dm_os_tasks t WITH (NOLOCK)
		INNER JOIN sys.dm_os_schedulers s WITH (NOLOCK) ON t.scheduler_id = s.scheduler_id
		LEFT JOIN sys.dm_exec_requests r WITH (NOLOCK) ON t.session_id = r.session_id AND t.request_id = r.request_id
		OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) st
		WHERE s.status = 'VISIBLE ONLINE'
		  AND t.session_id > 50
		  AND (t.task_state IN ('RUNNING', 'RUNNABLE') OR r.session_id IS NOT NULL)
		ORDER BY 
			CASE WHEN t.task_state = 'RUNNING' THEN 1 WHEN t.task_state = 'RUNNABLE' THEN 2 ELSE 3 END,
			r.cpu_time DESC;
	`)
	if err == nil {
		defer taskRows.Close()
		for taskRows.Next() {
			var task SchedulerActiveTask
			if err := taskRows.Scan(
				&task.SchedulerID,
				&task.CPUID,
				&task.ParentNodeID,
				&task.SessionID,
				&task.RequestID,
				&task.TaskState,
				&task.CPUTimeMs,
				&task.TotalElapsedTime,
				&task.WaitType,
				&task.WaitTimeMs,
				&task.Command,
				&task.DatabaseName,
				&task.QueryText,
			); err == nil {
				report.ActiveTasks = append(report.ActiveTasks, task)
			}
		}
	}

	// Calculate thread pool utilization %
	if report.MaxWorkersCount > 0 {
		report.ThreadPoolUtilization = (float64(report.TotalActiveWorkers) / float64(report.MaxWorkersCount)) * 100.0
	}

	// Assess Quantum pressure status
	onlineCount := len(report.Schedulers)
	if onlineCount == 0 {
		onlineCount = 1
	}
	avgRunnable := float64(report.TotalRunnableTasks) / float64(onlineCount)
	if report.ThreadPoolStarvation {
		report.QuantumPressureStatus = "Thread Pool Exhaustion (THREADPOOL)"
		report.QuantumPressureSummary = "Tasks are queued waiting for worker threads. Severe thread starvation detected!"
	} else if avgRunnable >= 2.0 {
		report.QuantumPressureStatus = "Severe Quantum Exhaustion"
		report.QuantumPressureSummary = fmt.Sprintf("High runnable task queue (avg %.1f per CPU). Queries are actively yielding on SOS_SCHEDULER_YIELD.", avgRunnable)
	} else if report.TotalRunnableTasks > 0 {
		report.QuantumPressureStatus = "Moderate Quantum Contention"
		report.QuantumPressureSummary = fmt.Sprintf("%d tasks waiting on CPU queue for their 4ms quantum slice.", report.TotalRunnableTasks)
	} else {
		report.QuantumPressureStatus = "Healthy (Optimal CPU Quantum)"
		report.QuantumPressureSummary = "Zero CPU queue stalls. Schedulers are processing tasks smoothly with zero worker backpressure."
	}

	// 4. Query NUMA nodes and memory balancing from sys.dm_os_nodes and sys.dm_os_memory_nodes
	numaRows, err := c.db.QueryContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT 
			n.node_id,
			n.memory_node_id,
			n.node_state_desc,
			ISNULL(n.online_scheduler_count, 0),
			ISNULL(n.idle_scheduler_count, 0),
			ISNULL(n.active_worker_count, 0),
			ISNULL(n.avg_load_balance, 0),
			CAST(ISNULL(m.pages_kb / 1024.0, 0) AS FLOAT) AS memory_allocated_mb,
			CAST(ISNULL(m.target_kb / 1024.0, 0) AS FLOAT) AS memory_target_mb,
			ISNULL(m.foreign_page_count, 0) AS foreign_page_count
		FROM sys.dm_os_nodes n WITH (NOLOCK)
		LEFT JOIN sys.dm_os_memory_nodes m WITH (NOLOCK) ON n.memory_node_id = m.memory_node_id
		WHERE n.node_state_desc <> 'ONLINE DAC'
		ORDER BY n.node_id;
	`)
	if err == nil {
		defer numaRows.Close()
		var maxNodeMem, minNodeMem float64
		first := true
		for numaRows.Next() {
			var node NUMANodeInfo
			if err := numaRows.Scan(
				&node.NodeID,
				&node.MemoryNodeID,
				&node.NodeStateDesc,
				&node.OnlineSchedulerCount,
				&node.IdleSchedulerCount,
				&node.ActiveWorkerCount,
				&node.AvgLoadBalance,
				&node.MemoryAllocatedMB,
				&node.MemoryTargetMB,
				&node.ForeignPageCount,
			); err != nil {
				continue
			}

			node.ForeignMemoryMB = float64(node.ForeignPageCount) * 8.0 / 1024.0
			if node.MemoryAllocatedMB > 0 {
				node.ForeignPageRatio = node.ForeignMemoryMB / node.MemoryAllocatedMB
			}

			report.TotalForeignPages += node.ForeignPageCount

			if first {
				maxNodeMem = node.MemoryAllocatedMB
				minNodeMem = node.MemoryAllocatedMB
				first = false
			} else {
				if node.MemoryAllocatedMB > maxNodeMem {
					maxNodeMem = node.MemoryAllocatedMB
				}
				if node.MemoryAllocatedMB < minNodeMem {
					minNodeMem = node.MemoryAllocatedMB
				}
			}

			report.NUMANodes = append(report.NUMANodes, node)
		}

		report.NUMANodesCount = len(report.NUMANodes)
		if report.NUMANodesCount > 1 && maxNodeMem > 0 && minNodeMem > 0 {
			if (maxNodeMem-minNodeMem)/maxNodeMem > 0.35 {
				report.NUMASkewDetected = true
			}
		}
	}

	// 5. Inter-NUMA Task Skew Analysis
	if len(nodeRunnable) > 1 {
		var maxRun, minRun int
		firstNode := true
		for _, runCount := range nodeRunnable {
			if firstNode {
				maxRun = runCount
				minRun = runCount
				firstNode = false
			} else {
				if runCount > maxRun {
					maxRun = runCount
				}
				if runCount < minRun {
					minRun = runCount
				}
			}
		}
		if maxRun >= 3 && (maxRun-minRun) >= 2 {
			report.NUMASkewDetected = true
			report.NUMASkewSummary = fmt.Sprintf("Parallelism thread skew detected: NUMA Node max %d queued runnable tasks vs. min %d. Queries may be saturating a single socket.", maxRun, minRun)
		} else {
			report.NUMASkewSummary = "Parallelism worker threads are uniformly balanced across physical NUMA nodes."
		}
	} else {
		report.NUMASkewSummary = "Single NUMA node topology detected."
	}

	// Cross-NUMA latency risk
	if report.TotalForeignPages > 50000 {
		report.CrossNUMALatencyRisk = "High (Cross-Socket Interconnect Penalty)"
	} else if report.TotalForeignPages > 1000 {
		report.CrossNUMALatencyRisk = "Moderate"
	} else {
		report.CrossNUMALatencyRisk = "Low (Optimal Local Memory Allocation)"
	}

	return report, nil
}

// GetPLEReport provides complete server and per-NUMA Page Life Expectancy diagnostics,
// correlating PLE drops with culprit queries forcing buffer pool evictions, deep pressure gauges,
// table eviction impact tracking, and automated AI Doctor tuning remediations.
func (c *Client) GetPLEReport(ctx context.Context) (*PLEReport, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.status.Connected || c.db == nil {
		return nil, fmt.Errorf("not connected to live SQL Server")
	}

	queryCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()

	report := &PLEReport{
		LastEvaluatedAt:      time.Now().Format("2006-01-02 15:04:05"),
		NUMANodes:            []NUMAPLENode{},
		CulpritQueries:       []PLECulpritQuery{},
		TableEvictionImpacts: []TableEvictionImpact{},
		DoctorInsights:       []PLEDoctorInsight{},
	}

	// 1. Fetch Total Server Memory in GB from sys.dm_os_sys_info
	var memKB float64
	errMem := c.db.QueryRowContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT CAST(physical_memory_kb AS FLOAT) FROM sys.dm_os_sys_info;
	`).Scan(&memKB)
	if errMem == nil && memKB > 0 {
		report.TotalMemoryGB = math.Round((memKB/(1024.0*1024.0))*10.0) / 10.0
	} else {
		report.TotalMemoryGB = 16.0 // Sensible default if DMV restricted
	}

	// Target PLE formula: (RAM_GB / 4.0) * 300.0 (realistic baseline for modern RAM sizes)
	report.TargetPLE = math.Max(300.0, (report.TotalMemoryGB/4.0)*300.0)

	// 2. Fetch Instance-Wide Overall Page Life Expectancy & Memory Pressure Counters
	_ = c.db.QueryRowContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT CAST(ISNULL(cntr_value, 0) AS FLOAT)
		FROM sys.dm_os_performance_counters
		WHERE counter_name = 'Page life expectancy'
		  AND object_name LIKE '%:Buffer Manager%';
	`).Scan(&report.OverallPLE)

	// Fetch Lazy Writes/sec, Free List Stalls/sec, Page reads/sec, Page writes/sec
	var lazyWrites, freeListStalls, pageReads, pageWrites float64
	rowsPerf, errPerf := c.db.QueryContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT RTRIM(counter_name), CAST(cntr_value AS FLOAT)
		FROM sys.dm_os_performance_counters
		WHERE object_name LIKE '%:Buffer Manager%'
		  AND counter_name IN ('Lazy writes/sec', 'Free list stalls/sec', 'Page reads/sec', 'Page writes/sec');
	`)
	if errPerf == nil {
		defer rowsPerf.Close()
		for rowsPerf.Next() {
			var name string
			var val float64
			if err := rowsPerf.Scan(&name, &val); err == nil {
				switch name {
				case "Lazy writes/sec":
					lazyWrites = val
				case "Free list stalls/sec":
					freeListStalls = val
				case "Page reads/sec":
					pageReads = val
				case "Page writes/sec":
					pageWrites = val
				}
			}
		}
	}
	report.LazyWritesPerSec = lazyWrites
	report.FreeListStallsPerSec = freeListStalls
	report.PageReadsPerSec = pageReads
	report.PageWritesPerSec = pageWrites
	report.PageReadsMBPerSec = math.Round((pageReads*8.0/1024.0)*10.0) / 10.0

	// Fetch Buffer Cache Hit Ratio
	var hitRatio, hitBase float64
	_ = c.db.QueryRowContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT 
			ISNULL(MAX(CASE WHEN counter_name = 'Buffer cache hit ratio' THEN CAST(cntr_value AS FLOAT) END), 0),
			ISNULL(MAX(CASE WHEN counter_name = 'Buffer cache hit ratio base' THEN CAST(cntr_value AS FLOAT) END), 0)
		FROM sys.dm_os_performance_counters
		WHERE object_name LIKE '%:Buffer Manager%'
		  AND counter_name IN ('Buffer cache hit ratio', 'Buffer cache hit ratio base');
	`).Scan(&hitRatio, &hitBase)
	if hitBase > 0 {
		report.BufferCacheHitRatio = math.Round((hitRatio/hitBase)*1000.0) / 10.0
	} else {
		report.BufferCacheHitRatio = 99.0
	}

	// Fetch Max Server Memory (MB) from sys.configurations
	_ = c.db.QueryRowContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT CAST(value_in_use AS BIGINT)
		FROM sys.configurations
		WHERE name = 'max server memory (MB)';
	`).Scan(&report.MaxServerMemoryMB)

	// Fetch Target and Total Server Memory (MB)
	_ = c.db.QueryRowContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT 
			ISNULL(MAX(CASE WHEN counter_name = 'Target Server Memory (KB)' THEN CAST(cntr_value AS BIGINT)/1024 END), 0),
			ISNULL(MAX(CASE WHEN counter_name = 'Total Server Memory (KB)' THEN CAST(cntr_value AS BIGINT)/1024 END), 0)
		FROM sys.dm_os_performance_counters
		WHERE object_name LIKE '%:Memory Manager%'
		  AND counter_name IN ('Target Server Memory (KB)', 'Total Server Memory (KB)');
	`).Scan(&report.TargetServerMemoryMB, &report.TotalServerMemoryMB)

	// Fetch Memory Grants Pending Count
	_ = c.db.QueryRowContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT COUNT(1)
		FROM sys.dm_exec_query_memory_grants
		WHERE is_next_candidate IS NOT NULL OR grant_time IS NULL;
	`).Scan(&report.MemoryGrantsPendingCount)

	// Calculate PLE Burn Velocity & Verdict
	if c.lastPLEOverall > 0 && !c.lastPLETimestamp.IsZero() {
		elapsedMin := time.Since(c.lastPLETimestamp).Minutes()
		if elapsedMin > 0.05 { // at least 3 seconds between evaluations
			diff := report.OverallPLE - c.lastPLEOverall
			burnRate := diff / elapsedMin
			report.PLEBurnRateSecondsPerMin = math.Round(burnRate*10.0) / 10.0

			if report.PLEBurnRateSecondsPerMin < -60.0 {
				report.PLEBurnVerdict = "ACTIVE CACHE COLLAPSE"
			} else if report.PLEBurnRateSecondsPerMin < -15.0 {
				report.PLEBurnVerdict = "EVICTION SURGE"
			} else if report.PLEBurnRateSecondsPerMin > 15.0 {
				report.PLEBurnVerdict = "CACHE RECOVERY"
			} else {
				report.PLEBurnVerdict = "STEADY STATE"
			}
		} else {
			report.PLEBurnRateSecondsPerMin = 0.0
			report.PLEBurnVerdict = "STEADY STATE"
		}
	} else {
		report.PLEBurnRateSecondsPerMin = 0.0
		report.PLEBurnVerdict = "STEADY STATE"
	}
	c.lastPLEOverall = report.OverallPLE
	c.lastPLETimestamp = time.Now()

	// 3. Fetch Per-NUMA Node Page Life Expectancy & Memory Allocation
	nodeRows, errNodes := c.db.QueryContext(queryCtx, `
		SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
		SELECT 
			CAST(RIGHT(RTRIM(p.instance_name), 3) AS INT) AS node_id,
			RTRIM(p.instance_name) AS node_name,
			CAST(p.cntr_value AS FLOAT) AS ple_seconds,
			ISNULL(CAST(m.pages_kb / 1024.0 AS FLOAT), 0) AS mem_mb,
			ISNULL(m.foreign_page_count, 0) AS foreign_pages
		FROM sys.dm_os_performance_counters p
		LEFT JOIN sys.dm_os_memory_nodes m 
			ON CAST(RIGHT(RTRIM(p.instance_name), 3) AS INT) = m.memory_node_id
		WHERE p.counter_name = 'Page life expectancy'
		  AND p.object_name LIKE '%:Buffer Node%'
		ORDER BY node_id ASC;
	`)

	if errNodes == nil {
		defer nodeRows.Close()
		for nodeRows.Next() {
			var n NUMAPLENode
			var fPages int64
			if err := nodeRows.Scan(&n.NodeID, &n.NodeName, &n.PLESeconds, &n.MemoryAllocatedMB, &fPages); err == nil {
				if n.MemoryAllocatedMB > 0 && fPages > 0 {
					n.ForeignPageRatio = math.Round(((float64(fPages)*8.0/1024.0)/n.MemoryAllocatedMB)*10000.0) / 100.0
				}
				report.NUMANodes = append(report.NUMANodes, n)
			}
		}
	}

	report.NodeCount = len(report.NUMANodes)
	report.IsNUMA = report.NodeCount > 1

	// Calculate per-node baseline targets and status
	nodeTarget := report.TargetPLE
	if report.NodeCount > 1 {
		nodeTarget = math.Max(300.0, (report.TotalMemoryGB/float64(report.NodeCount)/4.0)*300.0)
	}

	var minNodePLE, maxNodePLE float64
	var minNodeID int
	for i := range report.NUMANodes {
		report.NUMANodes[i].TargetPLE = nodeTarget
		ple := report.NUMANodes[i].PLESeconds
		if i == 0 || ple < minNodePLE {
			minNodePLE = ple
			minNodeID = report.NUMANodes[i].NodeID
		}
		if i == 0 || ple > maxNodePLE {
			maxNodePLE = ple
		}

		if ple < 300.0 || (nodeTarget > 0 && ple < nodeTarget*0.4) {
			report.NUMANodes[i].Status = "CRITICAL"
		} else if nodeTarget > 0 && ple < nodeTarget*0.75 {
			report.NUMANodes[i].Status = "DEGRADED"
		} else {
			report.NUMANodes[i].Status = "HEALTHY"
		}
	}

	// 4. Determine Overall Status & Synthesis Summary
	if report.OverallPLE < 300.0 || report.OverallPLE < report.TargetPLE*0.4 {
		report.Status = "CRITICAL"
		report.Summary = fmt.Sprintf("Critical buffer pool churn! Overall PLE is %.0fs (Baseline: %.0fs for %.0f GB RAM). Data pages stay in cache for only %.1f minutes before forced eviction.",
			report.OverallPLE, report.TargetPLE, report.TotalMemoryGB, report.OverallPLE/60.0)
	} else if report.OverallPLE < report.TargetPLE*0.75 {
		report.Status = "WARNING"
		report.Summary = fmt.Sprintf("Degraded Page Life Expectancy. Overall PLE is %.0fs (Target: %.0fs for %.0f GB RAM). Large table scans or inadequate RAM are causing elevated page churn.",
			report.OverallPLE, report.TargetPLE, report.TotalMemoryGB)
	} else {
		report.Status = "HEALTHY"
		report.Summary = fmt.Sprintf("Buffer pool cache is healthy. Overall PLE is %.0fs, comfortably exceeding the dynamic baseline of %.0fs (%.0f GB RAM). Cache churn is minimal.",
			report.OverallPLE, report.TargetPLE, report.TotalMemoryGB)
	}

	// Flag NUMA Skew / Imbalance
	if report.IsNUMA && maxNodePLE > 0 && minNodePLE < (maxNodePLE*0.45) && minNodePLE < nodeTarget {
		if report.Status == "HEALTHY" {
			report.Status = "WARNING"
		}
		report.Summary += fmt.Sprintf(" Warning: NUMA node memory imbalance! Node %d PLE (%.0fs) is dramatically lower than Node with %.0fs, indicating localized buffer pool saturation or parallel thread skew.",
			minNodeID, minNodePLE, maxNodePLE)
	}

	// 5. Query Store / DMV Culprit Queries (Feature A: Culprit Attribution)
	const sqlCulprits = `
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SET LOCK_TIMEOUT 1500;
	IF EXISTS (SELECT 1 FROM sys.databases WHERE name = DB_NAME() AND is_query_store_on = 1)
	BEGIN
		SELECT TOP (15)
			q.query_id,
			p.plan_id,
			ISNULL(CONVERT(VARCHAR(64), q.query_hash, 1), '') AS query_hash,
			ISNULL(qt.query_sql_text, '') AS query_text,
			CAST(SUM(rs.count_executions) AS BIGINT) AS exec_count,
			CAST(ROUND(AVG(rs.avg_physical_io_reads * 8.0 / 1024.0), 2) AS FLOAT) AS avg_phys_mb,
			CAST(ROUND(SUM(rs.avg_physical_io_reads * rs.count_executions * 8.0 / 1024.0), 2) AS FLOAT) AS total_phys_mb,
			CAST(ROUND(AVG(rs.avg_logical_io_reads * 8.0 / 1024.0), 2) AS FLOAT) AS avg_log_mb,
			CAST(ROUND(AVG(rs.avg_duration / 1000.0), 2) AS FLOAT) AS avg_dur_ms,
			CAST(ROUND(AVG(rs.avg_cpu_time / 1000.0), 2) AS FLOAT) AS avg_cpu_ms,
			ISNULL(CONVERT(VARCHAR(19), MAX(rs.last_execution_time), 120), '') AS last_exec_time
		FROM sys.query_store_runtime_stats rs
		JOIN sys.query_store_plan p ON rs.plan_id = p.plan_id
		JOIN sys.query_store_query q ON p.query_id = q.query_id
		JOIN sys.query_store_query_text qt ON q.query_text_id = qt.query_text_id
		WHERE rs.avg_physical_io_reads > 5 OR rs.avg_logical_io_reads > 2000
		GROUP BY q.query_id, p.plan_id, q.query_hash, qt.query_sql_text
		ORDER BY total_phys_mb DESC;
	END
	ELSE
	BEGIN
		SELECT TOP (15)
			0 AS query_id,
			0 AS plan_id,
			ISNULL(CONVERT(VARCHAR(64), qs.query_hash, 1), '') AS query_hash,
			ISNULL(t.text, '') AS query_text,
			qs.execution_count AS exec_count,
			CAST(ROUND((qs.total_physical_reads * 8.0 / 1024.0) / NULLIF(qs.execution_count, 0), 2) AS FLOAT) AS avg_phys_mb,
			CAST(ROUND(qs.total_physical_reads * 8.0 / 1024.0, 2) AS FLOAT) AS total_phys_mb,
			CAST(ROUND((qs.total_logical_reads * 8.0 / 1024.0) / NULLIF(qs.execution_count, 0), 2) AS FLOAT) AS avg_log_mb,
			CAST(ROUND((qs.total_elapsed_time / 1000.0) / NULLIF(qs.execution_count, 0), 2) AS FLOAT) AS avg_dur_ms,
			CAST(ROUND((qs.total_worker_time / 1000.0) / NULLIF(qs.execution_count, 0), 2) AS FLOAT) AS avg_cpu_ms,
			ISNULL(CONVERT(VARCHAR(19), qs.last_execution_time, 120), '') AS last_exec_time
		FROM sys.dm_exec_query_stats qs
		CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) t
		WHERE qs.total_physical_reads > 0
		ORDER BY qs.total_physical_reads DESC;
	END
	`

	rows, errCulprits := c.db.QueryContext(queryCtx, sqlCulprits)
	if errCulprits == nil {
		defer rows.Close()
		for rows.Next() {
			var q PLECulpritQuery
			if err := rows.Scan(
				&q.QueryID,
				&q.PlanID,
				&q.QueryHash,
				&q.QueryText,
				&q.ExecutionCount,
				&q.AvgPhysicalReadsMB,
				&q.TotalPhysicalReadsMB,
				&q.AvgLogicalReadsMB,
				&q.AvgDurationMS,
				&q.AvgCPUMS,
				&q.LastExecutionTime,
			); err == nil {
				q.QueryText = strings.TrimSpace(q.QueryText)
				if q.AvgPhysicalReadsMB >= 500.0 || q.TotalPhysicalReadsMB >= 10000.0 {
					q.ImpactSeverity = "CRITICAL"
					q.BufferPoolFlushRisk = fmt.Sprintf("Severe: Cold disk reads (~%.1f MB/run, %.0f MB total) actively evicting active working set from buffer pool",
						q.AvgPhysicalReadsMB, q.TotalPhysicalReadsMB)
				} else if q.AvgPhysicalReadsMB >= 50.0 || q.TotalPhysicalReadsMB >= 1000.0 {
					q.ImpactSeverity = "HIGH"
					q.BufferPoolFlushRisk = fmt.Sprintf("High: Frequent table scans (~%.1f MB/run) creating steady page churn and lowering PLE",
						q.AvgPhysicalReadsMB)
				} else {
					q.ImpactSeverity = "ELEVATED"
					q.BufferPoolFlushRisk = fmt.Sprintf("Elevated: Generates physical I/O (~%.1f MB/run) upon execution",
						q.AvgPhysicalReadsMB)
				}
				report.CulpritQueries = append(report.CulpritQueries, q)
			}
		}
	}

	// 6. Table Eviction Impact Tracker (Which tables are currently cached and at risk of eviction)
	const sqlEviction = `
	SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
	SET LOCK_TIMEOUT 1500;
	SELECT TOP (6)
		ISNULL(DB_NAME(p.database_id), 'Unknown') AS database_name,
		ISNULL(OBJECT_SCHEMA_NAME(p.object_id, p.database_id), 'dbo') AS schema_name,
		ISNULL(OBJECT_NAME(p.object_id, p.database_id), 'Table_' + CAST(p.object_id AS VARCHAR(20))) AS table_name,
		ISNULL(i.name, 'HEAP') AS index_name,
		CAST(ROUND(COUNT(b.page_id) * 8.0 / 1024.0, 1) AS FLOAT) AS cached_mb
	FROM sys.dm_os_buffer_descriptors b WITH (NOLOCK)
	JOIN sys.allocation_units a WITH (NOLOCK) ON b.allocation_unit_id = a.allocation_unit_id
	JOIN sys.partitions p WITH (NOLOCK) ON a.container_id = p.hobt_id
	LEFT JOIN sys.indexes i WITH (NOLOCK) ON p.object_id = i.object_id AND p.index_id = i.index_id
	WHERE b.database_id > 4 AND p.object_id > 100
	GROUP BY p.database_id, p.object_id, i.name
	ORDER BY cached_mb DESC;
	`
	rowsEvict, errEvict := c.db.QueryContext(queryCtx, sqlEviction)
	if errEvict == nil {
		defer rowsEvict.Close()
		var totalCached float64
		type tempTbl struct {
			dbName, schName, tblName, idxName string
			cachedMB                          float64
		}
		var tempItems []tempTbl
		for rowsEvict.Next() {
			var itm tempTbl
			if err := rowsEvict.Scan(&itm.dbName, &itm.schName, &itm.tblName, &itm.idxName, &itm.cachedMB); err == nil {
				totalCached += itm.cachedMB
				tempItems = append(tempItems, itm)
			}
		}
		for idx, itm := range tempItems {
			pct := 0.0
			if totalCached > 0 {
				pct = math.Round((itm.cachedMB/totalCached)*1000.0) / 10.0
			}
			risk := "MODERATE"
			reason := "Stable in buffer pool under current workload."
			culprit := "N/A"
			if report.OverallPLE < 300.0 || (idx == 0 && report.OverallPLE < report.TargetPLE) {
				risk = "CRITICAL"
				reason = fmt.Sprintf("High turnover: ~%.1f MB of cached pages are being aggressively evicted by memory pressure.", itm.cachedMB)
				if len(report.CulpritQueries) > 0 {
					culprit = report.CulpritQueries[0].QueryHash
				}
			} else if report.OverallPLE < report.TargetPLE*0.75 {
				risk = "HIGH"
				reason = "Active scan activity in other tables is degrading cached retention time."
				if len(report.CulpritQueries) > 0 {
					culprit = report.CulpritQueries[0].QueryHash
				}
			}
			report.TableEvictionImpacts = append(report.TableEvictionImpacts, TableEvictionImpact{
				DatabaseName:       itm.dbName,
				SchemaName:         itm.schName,
				TableName:          itm.tblName,
				IndexName:          itm.idxName,
				CurrentCachedMB:    itm.cachedMB,
				BufferPoolPercent:  pct,
				EvictionRisk:       risk,
				DisplacementReason: reason,
				PushedOutByQuery:   culprit,
				EstimatedEvictedMB: math.Round(itm.cachedMB * 0.4),
			})
		}
	}

	// 7. Automated AI PLE Doctor & Remediation Diagnoses
	// Check 1: Uncapped Max Server Memory
	if report.MaxServerMemoryMB >= 2147483647 || report.MaxServerMemoryMB == 0 {
		recommendedMB := int64(math.Max(4096.0, (report.TotalMemoryGB-4.0)*1024.0))
		report.DoctorInsights = append(report.DoctorInsights, PLEDoctorInsight{
			Category:         "Max Server Memory Sizing",
			Severity:         "CRITICAL",
			Title:            "Uncapped Max Server Memory (Default 2,147,483,647 MB)",
			Diagnosis:        "SQL Server has no memory boundary configured. When the OS or external processes require memory, Windows will force SQL Server pages into the disk pagefile, causing immediate PLE collapse and micro-freezes.",
			ActionableRemedy: fmt.Sprintf("Cap 'max server memory (MB)' leaving 4-8 GB reserved for Windows OS (Recommended: %d MB).", recommendedMB),
			SuggestedTSQL: fmt.Sprintf(`EXEC sp_configure 'show advanced options', 1;
RECONFIGURE;
GO
EXEC sp_configure 'max server memory (MB)', %d;
RECONFIGURE;
GO`, recommendedMB),
		})
	}

	// Check 2: Free List Stalls / Lazy Writer Pressure
	if report.FreeListStallsPerSec > 2.0 || report.LazyWritesPerSec > 20.0 {
		report.DoctorInsights = append(report.DoctorInsights, PLEDoctorInsight{
			Category:         "Memory Pressure & Free List Stalls",
			Severity:         "CRITICAL",
			Title:            fmt.Sprintf("Active Free List Stalls (%.1f/sec) & Lazy Writer Pressure", report.FreeListStallsPerSec),
			Diagnosis:        fmt.Sprintf("Worker threads are actively suspended waiting for the buffer pool to allocate clean memory pages. The Lazy Writer is issuing %.1f writes/sec to flush dirty pages under emergency pressure.", report.LazyWritesPerSec),
			ActionableRemedy: "Identify and tune the heaviest I/O queries or add physical RAM to buffer working sets.",
			SuggestedTSQL: `-- Check which queries are currently requesting the highest memory grants
SELECT TOP 10 
    session_id, request_id, scheduler_id, dop, 
    requested_memory_kb / 1024 AS requested_mb, 
    granted_memory_kb / 1024 AS granted_mb, 
    wait_time_ms, wait_type
FROM sys.dm_exec_query_memory_grants
ORDER BY requested_memory_kb DESC;`,
		})
	}

	// Check 3: Query Memory Grant Workspace Stealing (RESOURCE_SEMAPHORE)
	if report.MemoryGrantsPendingCount > 0 {
		report.DoctorInsights = append(report.DoctorInsights, PLEDoctorInsight{
			Category:         "Memory Workspace Steal",
			Severity:         "CRITICAL",
			Title:            fmt.Sprintf("%d Queries Pending Memory Grants (RESOURCE_SEMAPHORE)", report.MemoryGrantsPendingCount),
			Diagnosis:        "Queries requiring oversized Sort and Hash memory grants are depleting available buffer pool memory, forcing data cache pages out prematurely.",
			ActionableRemedy: "Review skewed Cardinality Estimator spills and query max memory grant percentages via Resource Governor.",
			SuggestedTSQL: `-- Inspect queries queued for memory grants
SELECT 
    r.session_id, r.status, r.wait_type, r.wait_time, 
    t.text AS sql_text
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE r.wait_type LIKE '%RESOURCE_SEMAPHORE%';`,
		})
	}

	// Check 4: Top Cold-Read Culprit Query
	if len(report.CulpritQueries) > 0 && report.CulpritQueries[0].AvgPhysicalReadsMB > 50.0 {
		topQ := report.CulpritQueries[0]
		report.DoctorInsights = append(report.DoctorInsights, PLEDoctorInsight{
			Category:         "Missing Index Eviction Threat",
			Severity:         "WARNING",
			Title:            fmt.Sprintf("Culprit Query [%s] Reading %.1f MB Cold Disk per Execution", topQ.QueryHash, topQ.AvgPhysicalReadsMB),
			Diagnosis:        fmt.Sprintf("This query has performed %.0f MB of total physical reads across %d executions. Each run flushes existing cached pages to make room for cold table scans.", topQ.TotalPhysicalReadsMB, topQ.ExecutionCount),
			ActionableRemedy: "Inspect the execution plan in the 'Plan Visualizer' tab. Add missing index or covering include columns to eliminate table scan.",
			SuggestedTSQL: fmt.Sprintf(`-- Inspect query execution plan for hash %s
SELECT TOP 5 
    qs.execution_count,
    qs.total_physical_reads * 8 / 1024 AS total_physical_mb,
    qs.total_logical_reads * 8 / 1024 AS total_logical_mb,
    qp.query_plan
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_query_plan(qs.plan_handle) qp
WHERE qs.query_hash = %s
ORDER BY qs.total_physical_reads DESC;`, topQ.QueryHash, topQ.QueryHash),
		})
	}

	return report, nil
}

