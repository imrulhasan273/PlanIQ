package livedb

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strings"
	"time"
)

func classifyPgWaitCategory(waitType string) (category, desc, rec string) {
	switch strings.ToLower(strings.TrimSpace(waitType)) {
	case "lock":
		return "Lock", "Backend waiting to acquire a heavyweight relation, tuple, or transaction lock.", "Inspect blocking PIDs in pg_locks / pg_stat_activity, keep transactions short, and access tables in consistent order."
	case "lwlock":
		return "Latch / LWLock", "Lightweight lock contention on internal PostgreSQL shared memory structures (BufferMapping, WALInsert, LockManager).", "Reduce hot-page contention, check shared_buffers sizing, and avoid excessive concurrent table/partition locks."
	case "io":
		return "Disk I/O", "Backend waiting on physical storage reads/writes or WAL flush (DataFileRead, WALWrite, BufFileRead).", "Add selective B-tree indexes to avoid sequential scans, tune shared_buffers/work_mem, and check storage latency."
	case "bufferpin":
		return "Memory / Buffer", "Backend waiting for an exclusive pin on a shared buffer page (often VACUUM vs long-running queries).", "Keep transactions short so VACUUM can reclaim pages without stalling."
	case "ipc":
		return "Parallelism / IPC", "Inter-process coordination wait (e.g. parallel worker synchronization or synchronous replication).", "Inspect max_parallel_workers_per_gather and synchronous_standby_names latency."
	case "client":
		return "Network / Client", "Backend waiting for the client application to send/receive data (ClientRead/ClientWrite).", "Check client-side row-by-row processing, network latency, and idle-in-transaction connection pooling."
	case "cpu", "":
		return "CPU", "Backend actively executing on CPU without an active wait event.", "Inspect top CPU queries in pg_stat_statements for sequential scans, large sorts, or hash builds."
	default:
		return "Other Wait", "PostgreSQL internal wait event.", "Correlate with pg_stat_activity and pg_stat_statements."
	}
}

func (c *Client) pgGetActiveSessions(ctx context.Context, limit int) ([]ActiveSession, error) {
	if limit <= 0 {
		limit = 50
	}
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	q := `
		SELECT
			pid,
			COALESCE(state, 'active'),
			COALESCE(backend_type, 'client backend'),
			COALESCE(datname, ''),
			COALESCE(usename, ''),
			COALESCE(host(client_addr), 'local'),
			COALESCE(application_name, ''),
			COALESCE(wait_event, COALESCE(wait_event_type, 'CPU')),
			COALESCE(wait_event_type, 'CPU'),
			COALESCE((pg_blocking_pids(pid))[1], 0),
			COALESCE(EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) * 1000, 0)::bigint,
			COALESCE(query, '')
		FROM pg_stat_activity
		WHERE pid <> pg_backend_pid()
		  AND state IS NOT NULL
		  AND state <> 'idle'
		ORDER BY query_start ASC NULLS LAST
		LIMIT $1;
	`
	rows, err := c.db.QueryContext(queryCtx, q, limit)
	if err != nil {
		return nil, fmt.Errorf("pg_stat_activity query failed: %w", err)
	}
	defer rows.Close()

	sessions := make([]ActiveSession, 0)
	for rows.Next() {
		var s ActiveSession
		var elapsedMs int64
		if err := rows.Scan(
			&s.SPID, &s.Status, &s.Command, &s.DatabaseName, &s.LoginName,
			&s.HostName, &s.ProgramName, &s.WaitType, &s.LastWaitType,
			&s.BlockingSPID, &elapsedMs, &s.QueryText,
		); err != nil {
			continue
		}
		if elapsedMs < 0 {
			elapsedMs = 0
		}
		s.TotalElapsedTimeMs = elapsedMs
		s.CPUTimeMs = elapsedMs
		if s.WaitType != "CPU" {
			s.WaitTimeMs = elapsedMs
		}
		s.PlanHandle = fmt.Sprintf("pg:%d", s.SPID)
		sessions = append(sessions, s)
	}
	return sessions, nil
}

func (c *Client) pgGetIdleSessions(ctx context.Context, limit int) ([]IdleSession, error) {
	if limit <= 0 {
		limit = 50
	}
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	q := `
		SELECT
			pid,
			COALESCE(state, 'idle'),
			COALESCE(usename, ''),
			COALESCE(host(client_addr), 'local'),
			COALESCE(application_name, ''),
			COALESCE(datname, ''),
			CASE WHEN state LIKE 'idle in transaction%' THEN 1 ELSE 0 END,
			COALESCE(to_char(query_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
			COALESCE(to_char(state_change AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
			COALESCE(EXTRACT(EPOCH FROM (clock_timestamp() - state_change))::bigint, 0),
			COALESCE(query, '')
		FROM pg_stat_activity
		WHERE pid <> pg_backend_pid()
		  AND state IN ('idle', 'idle in transaction', 'idle in transaction (aborted)')
		ORDER BY (state LIKE 'idle in transaction%') DESC, state_change ASC NULLS LAST
		LIMIT $1;
	`
	rows, err := c.db.QueryContext(queryCtx, q, limit)
	if err != nil {
		return nil, fmt.Errorf("pg idle sessions query failed: %w", err)
	}
	defer rows.Close()

	list := make([]IdleSession, 0)
	for rows.Next() {
		var s IdleSession
		if err := rows.Scan(
			&s.SPID, &s.Status, &s.LoginName, &s.HostName, &s.ProgramName,
			&s.DatabaseName, &s.OpenTransactions, &s.LastRequestStartTime,
			&s.LastRequestEndTime, &s.IdleSeconds, &s.LastQueryText,
		); err != nil {
			continue
		}
		if s.IdleSeconds < 0 {
			s.IdleSeconds = 0
		}
		list = append(list, s)
	}
	return list, nil
}

func (c *Client) pgGetBlockingSessions(ctx context.Context) ([]LiveBlockingSession, error) {
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	q := `
		SELECT
			blocker.pid,
			COALESCE(blocker.state, ''),
			COALESCE(blocker.usename, ''),
			COALESCE(blocker.application_name, ''),
			COALESCE(blocker.query, ''),
			blocked.pid,
			COALESCE(blocked.state, ''),
			COALESCE(blocked.usename, ''),
			COALESCE(blocked.application_name, ''),
			COALESCE(blocked.wait_event, COALESCE(blocked.wait_event_type, 'Lock')),
			COALESCE(EXTRACT(EPOCH FROM (clock_timestamp() - blocked.query_start)) * 1000, 0)::bigint,
			COALESCE(blocked.query, ''),
			COALESCE(l.locktype || COALESCE(':' || l.relation::regclass::text, ''), 'relation'),
			COALESCE(l.mode, 'ExclusiveLock')
		FROM pg_stat_activity blocked
		CROSS JOIN LATERAL unnest(pg_blocking_pids(blocked.pid)) AS blocker_pid
		JOIN pg_stat_activity blocker ON blocker.pid = blocker_pid
		LEFT JOIN LATERAL (
			SELECT locktype, relation, mode
			FROM pg_locks
			WHERE pid = blocked.pid AND NOT granted
			LIMIT 1
		) l ON true
		ORDER BY blocked.query_start ASC NULLS LAST;
	`
	rows, err := c.db.QueryContext(queryCtx, q)
	if err != nil {
		return nil, fmt.Errorf("pg blocking query failed: %w", err)
	}
	defer rows.Close()

	list := make([]LiveBlockingSession, 0)
	for rows.Next() {
		var b LiveBlockingSession
		if err := rows.Scan(
			&b.RootBlockerSPID, &b.RootBlockerStatus, &b.RootBlockerLogin,
			&b.RootBlockerProgram, &b.RootBlockerQuery,
			&b.BlockedSPID, &b.BlockedStatus, &b.BlockedLogin,
			&b.BlockedProgram, &b.BlockedWaitType, &b.BlockedWaitTimeMs,
			&b.BlockedQuery, &b.LockResource, &b.LockMode,
		); err != nil {
			continue
		}
		if b.BlockedWaitTimeMs < 0 {
			b.BlockedWaitTimeMs = 0
		}
		list = append(list, b)
	}
	return list, nil
}

func (c *Client) pgGetTempDBUsage(ctx context.Context, limit int) ([]LiveTempDBUsage, error) {
	if limit <= 0 {
		limit = 20
	}
	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	q := `
		SELECT
			datid::int,
			datname,
			COALESCE(temp_bytes, 0) / 1048576.0,
			COALESCE(temp_files, 0)
		FROM pg_stat_database
		WHERE datname IS NOT NULL AND datname NOT LIKE 'template%'
		ORDER BY temp_bytes DESC
		LIMIT $1;
	`
	rows, err := c.db.QueryContext(queryCtx, q, limit)
	if err != nil {
		return nil, fmt.Errorf("pg temp usage query failed: %w", err)
	}
	defer rows.Close()

	list := make([]LiveTempDBUsage, 0)
	for rows.Next() {
		var t LiveTempDBUsage
		var tempFiles int64
		if err := rows.Scan(&t.SPID, &t.DatabaseName, &t.InternalObjectsAllocMB, &tempFiles); err != nil {
			continue
		}
		t.LoginName = "postgres"
		t.ProgramName = fmt.Sprintf("pgsql_tmp (%d files)", tempFiles)
		t.QueryText = fmt.Sprintf("Cumulative temporary spill files in database %s (%d temp files, %.2f MB)", t.DatabaseName, tempFiles, t.InternalObjectsAllocMB)
		list = append(list, t)
	}
	return list, nil
}

func (c *Client) pgGetLiveDeadlocks(ctx context.Context, limit int) ([]LiveDeadlockReport, error) {
	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	var totalDeadlocks int64
	_ = c.db.QueryRowContext(queryCtx, `SELECT COALESCE(deadlocks, 0) FROM pg_stat_database WHERE datname = current_database();`).Scan(&totalDeadlocks)

	// PostgreSQL writes detailed deadlock cycle graphs to server logs rather than an in-memory XML ring buffer.
	// Return an empty slice (no mock data); users can load PostgreSQL deadlock logs in the Deadlock tab.
	_ = totalDeadlocks
	return []LiveDeadlockReport{}, nil
}

func (c *Client) pgGetSessionPlan(_ context.Context, _ string) (string, error) {
	return "", fmt.Errorf("PostgreSQL does not cache XML execution plans per PID in memory; run EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) and open or paste the JSON in PlanIQ")
}

func (c *Client) pgGetServerVitals(ctx context.Context) (*ServerVitals, error) {
	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	v := &ServerVitals{}
	var activeCount, waitingCount int
	_ = c.db.QueryRowContext(queryCtx, `
		SELECT
			COUNT(*) FILTER (WHERE state = 'active' AND pid <> pg_backend_pid()),
			COUNT(*) FILTER (WHERE state = 'active' AND wait_event_type IS NOT NULL AND pid <> pg_backend_pid())
		FROM pg_stat_activity;
	`).Scan(&activeCount, &waitingCount)
	v.CPUQueueTasks = activeCount
	if activeCount > 0 {
		v.SignalWaitPct = math.Round((float64(activeCount-waitingCount)/float64(activeCount))*1000) / 10
	}

	var totalXacts int64
	var tempBytes int64
	_ = c.db.QueryRowContext(queryCtx, `
		SELECT COALESCE(xact_commit + xact_rollback, 0), COALESCE(temp_bytes, 0)
		FROM pg_stat_database
		WHERE datname = current_database();
	`).Scan(&totalXacts, &tempBytes)
	v.TempDBInternalMB = math.Round((float64(tempBytes)/1048576.0)*100) / 100

	now := time.Now()
	if !c.lastBatchTimestamp.IsZero() && totalXacts >= c.lastBatchCount {
		elapsed := now.Sub(c.lastBatchTimestamp).Seconds()
		if elapsed > 0.2 {
			v.BatchRequestsPerSec = math.Round((float64(totalXacts-c.lastBatchCount)/elapsed)*10) / 10
		}
	}
	c.lastBatchCount = totalXacts
	c.lastBatchTimestamp = now

	var sharedBuffersMB float64
	_ = c.db.QueryRowContext(queryCtx, `
		SELECT COALESCE(pg_size_bytes(current_setting('shared_buffers')) / 1048576.0, 0);
	`).Scan(&sharedBuffersMB)
	v.AvailableMemoryMB = math.Round(sharedBuffersMB*10) / 10

	var waitingLocks int
	_ = c.db.QueryRowContext(queryCtx, `
		SELECT COUNT(*) FROM pg_locks WHERE NOT granted;
	`).Scan(&waitingLocks)
	v.MemoryGrantsPending = waitingLocks

	return v, nil
}

func (c *Client) pgGetWaitStats(ctx context.Context, limit int) ([]LiveWaitStat, error) {
	if limit <= 0 {
		limit = 20
	}
	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	q := `
		SELECT
			COALESCE(wait_event, 'CPU_ACTIVE'),
			COALESCE(wait_event_type, 'CPU'),
			COUNT(*),
			COALESCE(SUM(GREATEST(EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) * 1000, 1))::bigint, 0)
		FROM pg_stat_activity
		WHERE pid <> pg_backend_pid()
		  AND state = 'active'
		GROUP BY COALESCE(wait_event, 'CPU_ACTIVE'), COALESCE(wait_event_type, 'CPU')
		ORDER BY 4 DESC
		LIMIT $1;
	`
	rows, err := c.db.QueryContext(queryCtx, q, limit)
	if err != nil {
		return nil, fmt.Errorf("pg wait stats query failed: %w", err)
	}
	defer rows.Close()

	list := make([]LiveWaitStat, 0)
	var totalMs int64
	for rows.Next() {
		var w LiveWaitStat
		var waitTypeRaw string
		if err := rows.Scan(&w.WaitType, &waitTypeRaw, &w.WaitingTasksCount, &w.WaitTimeMs); err != nil {
			continue
		}
		cat, desc, rec := classifyPgWaitCategory(waitTypeRaw)
		w.WaitCategory = cat
		w.Description = desc
		w.Recommendation = rec
		totalMs += w.WaitTimeMs
		list = append(list, w)
	}
	if totalMs > 0 {
		for i := range list {
			list[i].Percentage = math.Round((float64(list[i].WaitTimeMs)/float64(totalMs))*1000) / 10
		}
	}
	return list, nil
}

func (c *Client) pgGetQueryStoreDiagnostic(ctx context.Context, _ int) (*QueryStoreDiagnostic, error) {
	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	diag := &QueryStoreDiagnostic{
		CurrentDB:        c.status.DatabaseName,
		SQLServerVersion: c.status.ServerVersion,
	}

	var hasPgss bool
	_ = c.db.QueryRowContext(queryCtx, `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements');`).Scan(&hasPgss)
	diag.IsQueryStoreOn = hasPgss
	if hasPgss {
		diag.QSDesiredState = "INSTALLED (pg_stat_statements)"
		diag.QSActualState = "ACTIVE"
		_ = c.db.QueryRowContext(queryCtx, `SELECT COUNT(*) FROM pg_stat_statements;`).Scan(&diag.QSRuntimeStatsRows)
		diag.QSWindowRows = diag.QSRuntimeStatsRows
	} else {
		diag.QSDesiredState = "pg_stat_statements not installed"
		diag.QSActualState = "FALLBACK (pg_stat_activity)"
		diag.QSError = "Install pg_stat_statements (CREATE EXTENSION pg_stat_statements;) for historical top-query telemetry."
	}
	_ = c.db.QueryRowContext(queryCtx, `SELECT COUNT(*) FROM pg_stat_activity WHERE pid <> pg_backend_pid();`).Scan(&diag.DMVPlanCacheRows)
	diag.DMVWindowRows = diag.DMVPlanCacheRows
	return diag, nil
}

func (c *Client) pgGetQueryStoreTopWindow(ctx context.Context, orderBy string, topN int, _ int) ([]QueryStoreEntry, error) {
	if topN <= 0 || topN > 500 {
		topN = 25
	}
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var hasPgss bool
	_ = c.db.QueryRowContext(queryCtx, `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements');`).Scan(&hasPgss)

	if hasPgss {
		orderCol := "total_exec_time DESC"
		switch strings.ToLower(orderBy) {
		case "reads", "logical_reads":
			orderCol = "(shared_blks_hit + shared_blks_read) DESC"
		case "executions", "calls":
			orderCol = "calls DESC"
		case "duration", "cpu":
			orderCol = "total_exec_time DESC"
		}

		q := fmt.Sprintf(`
			SELECT
				COALESCE(queryid, 0),
				COALESCE(query, ''),
				COALESCE(calls, 0),
				COALESCE(total_exec_time, 0),
				COALESCE(mean_exec_time, 0),
				COALESCE(shared_blks_hit + shared_blks_read, 0),
				COALESCE(shared_blks_read, 0),
				COALESCE(shared_blks_written, 0),
				COALESCE(temp_blks_written * 8.0 / 1024.0, 0)
			FROM pg_stat_statements
			WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
			ORDER BY %s
			LIMIT $1;
		`, orderCol)

		rows, err := c.db.QueryContext(queryCtx, q, topN)
		if err == nil {
			defer rows.Close()
			entries := make([]QueryStoreEntry, 0)
			nowStr := time.Now().UTC().Format(time.RFC3339)
			for rows.Next() {
				var e QueryStoreEntry
				if err := rows.Scan(
					&e.QueryID, &e.QueryText, &e.ExecutionCount,
					&e.TotalDurationMs, &e.AvgDurationMs,
					&e.TotalLogicalReads, &e.TotalPhysicalReads,
					&e.TotalWrites, &e.TotalSpillsMB,
				); err != nil {
					continue
				}
				e.PlanID = e.QueryID
				e.TotalCPUMs = e.TotalDurationMs
				e.AvgCPUMs = e.AvgDurationMs
				if e.ExecutionCount > 0 {
					e.AvgLogicalReads = float64(e.TotalLogicalReads) / float64(e.ExecutionCount)
					e.AvgPhysicalReads = float64(e.TotalPhysicalReads) / float64(e.ExecutionCount)
					e.AvgWrites = float64(e.TotalWrites) / float64(e.ExecutionCount)
				}
				e.LastExecutionTime = nowStr
				e.ExecutionType = "pg_stat_statements"
				entries = append(entries, e)
			}
			return entries, nil
		}
	}

	// Graceful fallback to live pg_stat_activity when pg_stat_statements is unavailable
	rows, err := c.db.QueryContext(queryCtx, `
		SELECT
			pid,
			COALESCE(query, ''),
			COALESCE(EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) * 1000, 0),
			COALESCE(to_char(query_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')
		FROM pg_stat_activity
		WHERE pid <> pg_backend_pid()
		  AND query IS NOT NULL
		  AND btrim(query) <> ''
		ORDER BY query_start ASC NULLS LAST
		LIMIT $1;
	`, topN)
	if err != nil {
		return nil, fmt.Errorf("pg fallback query stats failed: %w", err)
	}
	defer rows.Close()

	entries := make([]QueryStoreEntry, 0)
	for rows.Next() {
		var e QueryStoreEntry
		if err := rows.Scan(&e.QueryID, &e.QueryText, &e.TotalDurationMs, &e.LastExecutionTime); err != nil {
			continue
		}
		if e.TotalDurationMs < 0 {
			e.TotalDurationMs = 0
		}
		e.PlanID = e.QueryID
		e.ExecutionCount = 1
		e.AvgDurationMs = e.TotalDurationMs
		e.TotalCPUMs = e.TotalDurationMs
		e.AvgCPUMs = e.TotalDurationMs
		e.ExecutionType = "pg_stat_activity"
		entries = append(entries, e)
	}
	return entries, nil
}

func (c *Client) pgGetLiveDPAPerspective(ctx context.Context, perspective string) ([]DPAPerspectiveItem, error) {
	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	var groupExpr, secExpr string
	switch strings.ToLower(strings.TrimSpace(perspective)) {
	case "databases":
		groupExpr = "COALESCE(datname, '(none)')"
		secExpr = "'Database'"
	case "users", "logins":
		groupExpr = "COALESCE(usename, '(system)')"
		secExpr = "'Role'"
	case "programs", "applications":
		groupExpr = "COALESCE(NULLIF(application_name, ''), '(unnamed client)')"
		secExpr = "'Application'"
	case "machines", "hosts":
		groupExpr = "COALESCE(host(client_addr), 'localhost')"
		secExpr = "'Client Host'"
	default:
		groupExpr = "COALESCE(wait_event, COALESCE(wait_event_type, 'CPU'))"
		secExpr = "COALESCE(wait_event_type, 'CPU')"
	}

	q := fmt.Sprintf(`
		SELECT
			%s AS name,
			%s AS secondary,
			COUNT(*)::int AS session_count,
			COALESCE(SUM(GREATEST(EXTRACT(EPOCH FROM (clock_timestamp() - query_start)), 0)) FILTER (WHERE state = 'active'), 0) AS wait_sec
		FROM pg_stat_activity
		WHERE pid <> pg_backend_pid()
		GROUP BY 1, 2
		ORDER BY session_count DESC, wait_sec DESC
		LIMIT 20;
	`, groupExpr, secExpr)

	rows, err := c.db.QueryContext(queryCtx, q)
	if err != nil {
		return nil, fmt.Errorf("pg DPA perspective query failed: %w", err)
	}
	defer rows.Close()

	items := make([]DPAPerspectiveItem, 0)
	var totalSessions int
	for rows.Next() {
		var item DPAPerspectiveItem
		if err := rows.Scan(&item.Name, &item.Secondary, &item.SessionCount, &item.WaitSec); err != nil {
			continue
		}
		item.CPUSec = item.WaitSec
		item.ExecCount = int64(item.SessionCount)
		totalSessions += item.SessionCount
		items = append(items, item)
	}
	if totalSessions > 0 {
		for i := range items {
			items[i].Percentage = math.Round((float64(items[i].SessionCount)/float64(totalSessions))*1000) / 10
		}
	}
	return items, nil
}

func (c *Client) pgGetMissingIndexes(ctx context.Context, limit int) ([]LiveMissingIndex, error) {
	if limit <= 0 {
		limit = 20
	}
	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	q := `
		SELECT
			current_database(),
			schemaname || '.' || relname,
			COALESCE(seq_scan, 0),
			COALESCE(idx_scan, 0),
			COALESCE(seq_tup_read, 0),
			COALESCE(n_live_tup, 0)
		FROM pg_stat_user_tables
		WHERE seq_scan > 25
		  AND seq_tup_read > 10000
		  AND n_live_tup > 1000
		  AND COALESCE(idx_scan, 0) < seq_scan
		ORDER BY seq_tup_read DESC
		LIMIT $1;
	`
	rows, err := c.db.QueryContext(queryCtx, q, limit)
	if err != nil {
		return nil, fmt.Errorf("pg missing index heuristic query failed: %w", err)
	}
	defer rows.Close()

	list := make([]LiveMissingIndex, 0)
	for rows.Next() {
		var m LiveMissingIndex
		var seqTupRead, liveTup int64
		if err := rows.Scan(&m.DatabaseName, &m.TableName, &m.UserScans, &m.UserSeeks, &seqTupRead, &liveTup); err != nil {
			continue
		}
		m.AvgTotalUserCost = float64(seqTupRead) / float64(maxInt64(m.UserScans, 1))
		m.AvgUserImpact = math.Min(99.0, math.Round((float64(m.UserScans)/float64(m.UserScans+m.UserSeeks))*1000)/10)
		m.ImpactScore = math.Round(math.Log10(float64(seqTupRead+10))*m.AvgUserImpact*10) / 10
		m.EqualityColumns = "Inspect WHERE/JOIN filter predicates"
		m.CreateIndexStatement = fmt.Sprintf("-- High sequential scan activity (%d seq_scans, %d rows read, ~%d live rows)\nCREATE INDEX CONCURRENTLY idx_%s_filter ON %s (<predicate_columns>);",
			m.UserScans, seqTupRead, liveTup, strings.ReplaceAll(m.TableName, ".", "_"), m.TableName)
		list = append(list, m)
	}
	return list, nil
}

func (c *Client) pgGetBufferPoolUsage(ctx context.Context, limit int) ([]BufferPoolConsumer, error) {
	if limit <= 0 {
		limit = 25
	}
	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	q := `
		SELECT
			current_database(),
			s.schemaname,
			s.relname,
			COALESCE(pg_total_relation_size(s.relid) / 1048576.0, 0),
			COALESCE(s.n_live_tup, 0),
			COALESCE(io.heap_blks_hit + io.idx_blks_hit, 0)
		FROM pg_stat_user_tables s
		LEFT JOIN pg_statio_user_tables io ON io.relid = s.relid
		ORDER BY pg_total_relation_size(s.relid) DESC
		LIMIT $1;
	`
	rows, err := c.db.QueryContext(queryCtx, q, limit)
	if err != nil {
		return nil, fmt.Errorf("pg buffer usage query failed: %w", err)
	}
	defer rows.Close()

	list := make([]BufferPoolConsumer, 0)
	var totalMB float64
	for rows.Next() {
		var b BufferPoolConsumer
		var blksHit int64
		if err := rows.Scan(&b.DatabaseName, &b.SchemaName, &b.ObjectName, &b.BufferSizeMB, &b.RowCount, &blksHit); err != nil {
			continue
		}
		b.IndexName = fmt.Sprintf("%d buffer hits", blksHit)
		b.IndexType = "TABLE + INDEXES"
		b.CleanPagesMB = b.BufferSizeMB
		totalMB += b.BufferSizeMB
		list = append(list, b)
	}
	if totalMB > 0 {
		for i := range list {
			list[i].PercentageOfBuffer = math.Round((list[i].BufferSizeMB/totalMB)*1000) / 10
		}
	}
	return list, nil
}

func (c *Client) pgGetUnusedIndexes(ctx context.Context, limit int) ([]UnusedIndex, error) {
	if limit <= 0 {
		limit = 25
	}
	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	q := `
		SELECT
			current_database(),
			s.schemaname,
			s.relname,
			s.indexrelname,
			COALESCE(pg_relation_size(s.indexrelid) / 1048576.0, 0),
			COALESCE(t.n_tup_ins + t.n_tup_upd + t.n_tup_del, 0),
			COALESCE(s.idx_scan, 0)
		FROM pg_stat_user_indexes s
		JOIN pg_index i ON i.indexrelid = s.indexrelid
		LEFT JOIN pg_stat_user_tables t ON t.relid = s.relid
		WHERE s.idx_scan = 0
		  AND NOT i.indisunique
		  AND NOT i.indisprimary
		ORDER BY pg_relation_size(s.indexrelid) DESC
		LIMIT $1;
	`
	rows, err := c.db.QueryContext(queryCtx, q, limit)
	if err != nil {
		return nil, fmt.Errorf("pg unused indexes query failed: %w", err)
	}
	defer rows.Close()

	list := make([]UnusedIndex, 0)
	for rows.Next() {
		var u UnusedIndex
		if err := rows.Scan(&u.DatabaseName, &u.SchemaName, &u.TableName, &u.IndexName, &u.IndexSizeMB, &u.UserWrites, &u.UserScans); err != nil {
			continue
		}
		u.IndexType = "BTREE / SECONDARY"
		u.DropStatement = fmt.Sprintf("DROP INDEX CONCURRENTLY IF EXISTS %s.%s;", u.SchemaName, u.IndexName)
		list = append(list, u)
	}
	return list, nil
}

func (c *Client) pgGetDuplicateIndexes(ctx context.Context) ([]DuplicateIndex, error) {
	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	q := `
		WITH idx_info AS (
			SELECT
				n.nspname || '.' || ct.relname AS table_name,
				ci.relname AS index_name,
				n.nspname AS schema_name,
				i.indkey::text AS key_cols,
				i.indisprimary,
				i.indisunique
			FROM pg_index i
			JOIN pg_class ct ON ct.oid = i.indrelid
			JOIN pg_class ci ON ci.oid = i.indexrelid
			JOIN pg_namespace n ON n.oid = ct.relnamespace
			WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
		)
		SELECT
			a.table_name,
			a.index_name,
			b.index_name,
			a.key_cols,
			a.schema_name
		FROM idx_info a
		JOIN idx_info b
		  ON a.table_name = b.table_name
		 AND a.index_name > b.index_name
		 AND a.key_cols = b.key_cols
		WHERE NOT a.indisprimary
		ORDER BY a.table_name, a.index_name;
	`
	rows, err := c.db.QueryContext(queryCtx, q)
	if err != nil {
		return nil, fmt.Errorf("pg duplicate indexes query failed: %w", err)
	}
	defer rows.Close()

	list := make([]DuplicateIndex, 0)
	for rows.Next() {
		var d DuplicateIndex
		var schemaName string
		if err := rows.Scan(&d.TableName, &d.IndexName, &d.DuplicateOf, &d.IndexCols, &schemaName); err != nil {
			continue
		}
		d.OverlapType = "Exact Duplicate"
		d.DropStatement = fmt.Sprintf("DROP INDEX CONCURRENTLY IF EXISTS %s.%s;", schemaName, d.IndexName)
		list = append(list, d)
	}
	return list, nil
}

func (c *Client) pgGetPerformanceAdvisors(ctx context.Context) ([]PerformanceAdvisor, error) {
	queryCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	advisors := make([]PerformanceAdvisor, 0)
	nowStr := time.Now().UTC().Format(time.RFC3339)

	// 1. Check Buffer Cache Hit Ratio
	var blksHit, blksRead, tempBytes, deadlocks int64
	if err := c.db.QueryRowContext(queryCtx, `
		SELECT COALESCE(blks_hit, 0), COALESCE(blks_read, 0), COALESCE(temp_bytes, 0), COALESCE(deadlocks, 0)
		FROM pg_stat_database WHERE datname = current_database();
	`).Scan(&blksHit, &blksRead, &tempBytes, &deadlocks); err == nil {
		if total := blksHit + blksRead; total > 1000 {
			ratio := (float64(blksHit) / float64(total)) * 100.0
			if ratio < 95.0 {
				advisors = append(advisors, PerformanceAdvisor{
					ID:             "pg-cache-hit-low",
					Severity:       "warning",
					Category:       "CPU/Memory",
					Title:          "Low shared_buffers Cache Hit Ratio",
					Description:    fmt.Sprintf("Database %s cache hit ratio is %.2f%% (below the 95%% OLTP baseline).", c.status.DatabaseName, ratio),
					MetricValue:    fmt.Sprintf("%.2f%%", ratio),
					Timestamp:      nowStr,
					Recommendation: "Review sequential scans on large tables and consider increasing shared_buffers (typically 25% of system RAM).",
				})
			}
		}
		if tempBytes > 100*1048576 {
			advisors = append(advisors, PerformanceAdvisor{
				ID:             "pg-temp-spills",
				Severity:       "warning",
				Category:       "TempDB Spill",
				Title:          "PostgreSQL Temp File Disk Spills Detected",
				Description:    fmt.Sprintf("Queries in %s have spilled %.1f MB to pgsql_tmp on disk.", c.status.DatabaseName, float64(tempBytes)/1048576.0),
				MetricValue:    fmt.Sprintf("%.1f MB", float64(tempBytes)/1048576.0),
				Timestamp:      nowStr,
				Recommendation: "Inspect sort/hash queries in pg_stat_statements and tune work_mem appropriately.",
			})
		}
		if deadlocks > 0 {
			advisors = append(advisors, PerformanceAdvisor{
				ID:             "pg-deadlocks",
				Severity:       "critical",
				Category:       "Blocking",
				Title:          "Database Deadlocks Recorded",
				Description:    fmt.Sprintf("pg_stat_database reports %d cumulative deadlock(s) in %s.", deadlocks, c.status.DatabaseName),
				MetricValue:    fmt.Sprintf("%d deadlocks", deadlocks),
				Timestamp:      nowStr,
				Recommendation: "Inspect PostgreSQL server logs for Error 40P01, enforce consistent lock ordering, and configure lock_timeout.",
			})
		}
	}

	// 2. Check idle-in-transaction sessions holding locks/MVCC snapshots
	var idleInTx int
	_ = c.db.QueryRowContext(queryCtx, `
		SELECT COUNT(*) FROM pg_stat_activity
		WHERE state LIKE 'idle in transaction%'
		  AND clock_timestamp() - state_change > interval '30 seconds';
	`).Scan(&idleInTx)
	if idleInTx > 0 {
		advisors = append(advisors, PerformanceAdvisor{
			ID:             "pg-idle-in-tx",
			Severity:       "critical",
			Category:       "Blocking",
			Title:          "Long-Running Idle-in-Transaction Sessions",
			Description:    fmt.Sprintf("%d session(s) have been idle in transaction for >30s, blocking autovacuum cleanup and potentially holding row locks.", idleInTx),
			MetricValue:    fmt.Sprintf("%d sessions", idleInTx),
			Timestamp:      nowStr,
			Recommendation: "Set idle_in_transaction_session_timeout and fix uncommitted transactions in application code.",
		})
	}

	return advisors, nil
}

func (c *Client) pgGetWaitHistory(ctx context.Context) ([]WaitTimeHistoryPoint, error) {
	waits, err := c.pgGetWaitStats(ctx, 50)
	if err != nil {
		return nil, err
	}
	pt := WaitTimeHistoryPoint{
		IntervalLabel: time.Now().Format("15:04"),
	}
	for _, w := range waits {
		ms := float64(w.WaitTimeMs)
		pt.TotalWaitMs += ms
		pt.ExecutionCount += w.WaitingTasksCount
		switch w.WaitCategory {
		case "CPU":
			pt.CPUWaitMs += ms
		case "Lock":
			pt.LockWaitMs += ms
		case "Disk I/O":
			pt.IOWaitMs += ms
		case "Memory / Buffer", "Latch / LWLock":
			pt.MemoryWaitMs += ms
		default:
			pt.OtherWaitMs += ms
		}
	}
	return []WaitTimeHistoryPoint{pt}, nil
}

func (c *Client) pgSyncSevenDayHistory(ctx context.Context) (*SevenDaySyncResult, error) {
	diag, _ := c.pgGetQueryStoreDiagnostic(ctx, 168)
	hasPgss := diag != nil && diag.IsQueryStoreOn
	msg := "Captured live PostgreSQL wait snapshot."
	if !hasPgss {
		msg = "Captured live snapshot. Enable pg_stat_statements for full query history."
	}
	return &SevenDaySyncResult{
		ServerName:      c.status.ServerName,
		DatabaseName:    c.status.DatabaseName,
		IsQueryStoreOn:  hasPgss,
		IntervalsSynced: 1,
		DeadlocksSynced: 0,
		Message:         msg,
		SyncedAt:        time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (c *Client) pgGetEngineInternals(ctx context.Context) (*EngineInternalsReport, error) {
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	report := &EngineInternalsReport{
		NUMANodesCount:        1,
		CrossNUMALatencyRisk:  "LOW",
		QuantumPressureStatus: "Healthy",
		Schedulers:            []CPUSchedulerInfo{},
		ActiveTasks:           []SchedulerActiveTask{},
		NUMANodes:             []NUMANodeInfo{},
	}

	_ = c.db.QueryRowContext(queryCtx, `SELECT setting::int FROM pg_settings WHERE name = 'max_connections';`).Scan(&report.MaxWorkersCount)
	_ = c.db.QueryRowContext(queryCtx, `SELECT COUNT(*) FROM pg_stat_activity;`).Scan(&report.TotalActiveWorkers)
	_ = c.db.QueryRowContext(queryCtx, `SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active' AND pid <> pg_backend_pid();`).Scan(&report.TotalRunnableTasks)

	if report.MaxWorkersCount > 0 {
		report.ThreadPoolUtilization = math.Round((float64(report.TotalActiveWorkers)/float64(report.MaxWorkersCount))*1000) / 10
		if report.ThreadPoolUtilization >= 85 {
			report.ThreadPoolStarvation = true
			report.QuantumPressureStatus = "Critical"
		} else if report.ThreadPoolUtilization >= 65 {
			report.QuantumPressureStatus = "Warning"
		}
	}

	// Populate active PostgreSQL backends into ActiveTasks for PID attribution
	if rows, err := c.db.QueryContext(queryCtx, `
		SELECT
			pid,
			COALESCE(UPPER(state), 'ACTIVE'),
			COALESCE(EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) * 1000, 0)::bigint,
			COALESCE(wait_event, COALESCE(wait_event_type, 'CPU')),
			COALESCE(backend_type, 'client backend'),
			COALESCE(datname, ''),
			COALESCE(query, '')
		FROM pg_stat_activity
		WHERE pid <> pg_backend_pid()
		  AND state IS NOT NULL
		  AND state <> 'idle'
		ORDER BY query_start ASC NULLS LAST
		LIMIT 50;
	`); err == nil {
		defer rows.Close()
		for rows.Next() {
			var t SchedulerActiveTask
			if err := rows.Scan(&t.SessionID, &t.TaskState, &t.TotalElapsedTime, &t.WaitType, &t.Command, &t.DatabaseName, &t.QueryText); err != nil {
				continue
			}
			if t.TotalElapsedTime < 0 {
				t.TotalElapsedTime = 0
			}
			t.CPUTimeMs = t.TotalElapsedTime
			if t.WaitType != "CPU" {
				t.WaitTimeMs = t.TotalElapsedTime
			}
			report.ActiveTasks = append(report.ActiveTasks, t)
		}
	}

	// Dead tuples / autovacuum summary across user tables
	var deadTuples int64
	var bloatedTables int
	_ = c.db.QueryRowContext(queryCtx, `
		SELECT COALESCE(SUM(n_dead_tup), 0),
		       COUNT(*) FILTER (WHERE n_dead_tup > 10000 AND n_dead_tup > n_live_tup * 0.2)
		FROM pg_stat_user_tables;
	`).Scan(&deadTuples, &bloatedTables)
	report.TotalForeignPages = deadTuples // Mapped cleanly as total dead tuples in PG mode
	if bloatedTables > 0 {
		report.NUMASkewDetected = true
		report.CrossNUMALatencyRisk = "HIGH"
		report.NUMASkewSummary = fmt.Sprintf("%d table(s) have high dead-tuple bloat (%d total dead tuples) awaiting autovacuum / VACUUM.", bloatedTables, deadTuples)
	} else {
		report.NUMASkewSummary = fmt.Sprintf("Autovacuum healthy across user tables (%d total dead tuples across current database).", deadTuples)
	}

	report.QuantumPressureSummary = fmt.Sprintf("PostgreSQL connections: %d / %d max_connections (%.1f%% utilized), %d active backends.",
		report.TotalActiveWorkers, report.MaxWorkersCount, report.ThreadPoolUtilization, report.TotalRunnableTasks)

	return report, nil
}

func (c *Client) pgGetPLEReport(ctx context.Context) (*PLEReport, error) {
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var sharedBuffersBytes, effectiveCacheBytes, workMemBytes int64
	_ = c.db.QueryRowContext(queryCtx, `
		SELECT
			COALESCE(pg_size_bytes(current_setting('shared_buffers')), 0),
			COALESCE(pg_size_bytes(current_setting('effective_cache_size')), 0),
			COALESCE(pg_size_bytes(current_setting('work_mem')), 0);
	`).Scan(&sharedBuffersBytes, &effectiveCacheBytes, &workMemBytes)

	sharedMB := math.Round((float64(sharedBuffersBytes)/1048576.0)*10) / 10
	effectiveMB := math.Round((float64(effectiveCacheBytes)/1048576.0)*10) / 10
	workMemMB := math.Round((float64(workMemBytes)/1048576.0)*10) / 10
	sharedGB := math.Round((sharedMB/1024.0)*100) / 100

	var blksHit, blksRead, tempBytes, tempFiles int64
	_ = c.db.QueryRowContext(queryCtx, `
		SELECT COALESCE(blks_hit, 0), COALESCE(blks_read, 0), COALESCE(temp_bytes, 0), COALESCE(temp_files, 0)
		FROM pg_stat_database
		WHERE datname = current_database();
	`).Scan(&blksHit, &blksRead, &tempBytes, &tempFiles)

	hitRatio := 100.0
	if total := blksHit + blksRead; total > 0 {
		hitRatio = math.Round((float64(blksHit)/float64(total))*10000) / 100
	}

	// Background writer stats (works on PG 12–19; buffers_clean & maxwritten_clean remain in pg_stat_bgwriter)
	var buffersClean, maxwrittenClean, buffersAlloc int64
	_ = c.db.QueryRowContext(queryCtx, `
		SELECT COALESCE(buffers_clean, 0), COALESCE(maxwritten_clean, 0), COALESCE(buffers_alloc, 0)
		FROM pg_stat_bgwriter;
	`).Scan(&buffersClean, &maxwrittenClean, &buffersAlloc)

	status := "HEALTHY"
	if hitRatio < 95 {
		status = "CRITICAL"
	} else if hitRatio < 99 {
		status = "WARNING"
	}

	// Top disk-reading tables from pg_statio_user_tables (mapped to TableEvictionImpacts)
	tableImpacts := make([]TableEvictionImpact, 0)
	if rows, err := c.db.QueryContext(queryCtx, `
		SELECT
			io.schemaname,
			io.relname,
			COALESCE(pg_total_relation_size(io.relid) / 1048576.0, 0),
			COALESCE(io.heap_blks_read + io.idx_blks_read, 0),
			COALESCE(io.heap_blks_hit + io.idx_blks_hit, 0),
			COALESCE(s.seq_scan, 0)
		FROM pg_statio_user_tables io
		LEFT JOIN pg_stat_user_tables s ON s.relid = io.relid
		WHERE (io.heap_blks_read + io.idx_blks_read) > 0
		ORDER BY (io.heap_blks_read + io.idx_blks_read) DESC
		LIMIT 15;
	`); err == nil {
		defer rows.Close()
		for rows.Next() {
			var schema, tbl string
			var sizeMB float64
			var diskBlks, hitBlks, seqScans int64
			if err := rows.Scan(&schema, &tbl, &sizeMB, &diskBlks, &hitBlks, &seqScans); err != nil {
				continue
			}
			diskMB := math.Round((float64(diskBlks)*8.0/1024.0)*100) / 100
			tblRatio := 100.0
			if diskBlks+hitBlks > 0 {
				tblRatio = math.Round((float64(hitBlks)/float64(diskBlks+hitBlks))*1000) / 10
			}
			risk := "MODERATE"
			if tblRatio < 90 || diskMB > 500 {
				risk = "CRITICAL"
			} else if tblRatio < 97 || diskMB > 100 {
				risk = "HIGH"
			}
			tableImpacts = append(tableImpacts, TableEvictionImpact{
				TableName:          tbl,
				SchemaName:         schema,
				DatabaseName:       c.status.DatabaseName,
				IndexName:          fmt.Sprintf("%.1f%% cache hit", tblRatio),
				CurrentCachedMB:    math.Round(sizeMB*10) / 10,
				BufferPoolPercent:  tblRatio,
				EvictionRisk:       risk,
				PushedOutByQuery:   fmt.Sprintf("%d seq scans", seqScans),
				EstimatedEvictedMB: diskMB,
				DisplacementReason: fmt.Sprintf("%d physical blocks read (%.1f MB) vs %d shared_buffers hits (%.1f%% hit ratio).", diskBlks, diskMB, hitBlks, tblRatio),
			})
		}
	}

	// Top physical-read queries from pg_stat_statements (if extension installed)
	culprits := make([]PLECulpritQuery, 0)
	var hasPgss bool
	_ = c.db.QueryRowContext(queryCtx, `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements');`).Scan(&hasPgss)
	if hasPgss {
		if rows, err := c.db.QueryContext(queryCtx, `
			SELECT
				COALESCE(queryid, 0),
				COALESCE(query, ''),
				COALESCE(calls, 0),
				COALESCE(shared_blks_read, 0),
				COALESCE(shared_blks_hit + shared_blks_read, 0),
				COALESCE(mean_exec_time, 0)
			FROM pg_stat_statements
			WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
			  AND shared_blks_read > 0
			ORDER BY shared_blks_read DESC
			LIMIT 15;
		`); err == nil {
			defer rows.Close()
			nowStr := time.Now().UTC().Format(time.RFC3339)
			for rows.Next() {
				var qid, calls, physBlks, totalBlks int64
				var qtext string
				var meanMs float64
				if err := rows.Scan(&qid, &qtext, &calls, &physBlks, &totalBlks, &meanMs); err != nil {
					continue
				}
				totalPhysMB := math.Round((float64(physBlks)*8.0/1024.0)*100) / 100
				avgPhysMB := totalPhysMB / float64(maxInt64(calls, 1))
				avgLogMB := (float64(totalBlks) * 8.0 / 1024.0) / float64(maxInt64(calls, 1))
				sev := "HIGH"
				if totalPhysMB > 500 || avgPhysMB > 20 {
					sev = "CRITICAL"
				}
				culprits = append(culprits, PLECulpritQuery{
					QueryID:              qid,
					PlanID:               qid,
					QueryHash:            fmt.Sprintf("%d", qid),
					QueryText:            qtext,
					ExecutionCount:       calls,
					AvgPhysicalReadsMB:   math.Round(avgPhysMB*100) / 100,
					TotalPhysicalReadsMB: totalPhysMB,
					AvgLogicalReadsMB:    math.Round(avgLogMB*100) / 100,
					AvgDurationMS:        math.Round(meanMs*100) / 100,
					AvgCPUMS:             math.Round(meanMs*100) / 100,
					ImpactSeverity:       sev,
					BufferPoolFlushRisk:  fmt.Sprintf("%.1f MB physical disk reads across %d calls", totalPhysMB, calls),
					LastExecutionTime:    nowStr,
				})
			}
		}
	}

	insights := []PLEDoctorInsight{
		{
			Category:         "shared_buffers",
			Severity:         status,
			Title:            fmt.Sprintf("shared_buffers Cache Hit Ratio: %.2f%%", hitRatio),
			Diagnosis:        fmt.Sprintf("shared_buffers = %.0f MB, effective_cache_size = %.0f MB, work_mem = %.1f MB. Recorded %d cache hits vs %d physical disk reads on database %s.", sharedMB, effectiveMB, workMemMB, blksHit, blksRead, c.status.DatabaseName),
			ActionableRemedy: "Aim for >= 99% buffer cache hit ratio on OLTP workloads. Tune shared_buffers to ~25% of system RAM, add indexes on high-seq-scan tables, and keep effective_cache_size at ~50–75% of RAM.",
			SuggestedTSQL:    "SELECT name, setting, unit, current_setting(name) AS formatted\nFROM pg_settings\nWHERE name IN ('shared_buffers', 'effective_cache_size', 'work_mem', 'maintenance_work_mem');",
		},
	}
	if tempBytes > 0 {
		tempMB := math.Round((float64(tempBytes)/1048576.0)*10) / 10
		insights = append(insights, PLEDoctorInsight{
			Category:         "work_mem / pgsql_tmp",
			Severity:         "WARNING",
			Title:            fmt.Sprintf("Temp File Spills Detected: %.1f MB (%d files)", tempMB, tempFiles),
			Diagnosis:        fmt.Sprintf("Sorts or hash joins exceeded work_mem (%.1f MB) and spilled %d temporary files to pgsql_tmp.", workMemMB, tempFiles),
			ActionableRemedy: "Increase work_mem carefully (per sort/hash operation) or optimize ORDER BY / hash join queries with supporting B-tree indexes.",
			SuggestedTSQL:    "SELECT datname, temp_files, pg_size_pretty(temp_bytes) AS temp_size\nFROM pg_stat_database\nWHERE temp_bytes > 0 ORDER BY temp_bytes DESC;",
		})
	}
	if maxwrittenClean > 0 {
		insights = append(insights, PLEDoctorInsight{
			Category:         "bgwriter",
			Severity:         "WARNING",
			Title:            fmt.Sprintf("bgwriter Hit maxwritten_clean Limit (%d times)", maxwrittenClean),
			Diagnosis:        fmt.Sprintf("Background writer stopped cleaning rounds early %d times after writing %d buffers (buffers_alloc = %d).", maxwrittenClean, buffersClean, buffersAlloc),
			ActionableRemedy: "Increase bgwriter_lru_maxpages and bgwriter_lru_multiplier in postgresql.conf so dirty buffers are flushed smoothly ahead of checkpoints.",
			SuggestedTSQL:    "SELECT buffers_clean, maxwritten_clean, buffers_alloc FROM pg_stat_bgwriter;",
		})
	}

	return &PLEReport{
		OverallPLE:           hitRatio,
		TargetPLE:            99.0,
		TotalMemoryGB:        sharedGB,
		Status:               status,
		Summary:              fmt.Sprintf("PostgreSQL shared_buffers = %.0f MB | effective_cache_size = %.0f MB | work_mem = %.1f MB | Cache Hit Ratio = %.2f%% (%d hits / %d disk reads).", sharedMB, effectiveMB, workMemMB, hitRatio, blksHit, blksRead),
		IsNUMA:               false,
		NodeCount:            1,
		NUMANodes:            []NUMAPLENode{},
		CulpritQueries:       culprits,
		LastEvaluatedAt:      time.Now().UTC().Format(time.RFC3339),
		LazyWritesPerSec:     float64(buffersClean),
		FreeListStallsPerSec: float64(maxwrittenClean),
		PageReadsPerSec:      float64(blksRead),
		PageWritesPerSec:     float64(buffersAlloc),
		PageReadsMBPerSec:    math.Round((float64(blksRead)*8.0/1024.0)*10) / 10,
		BufferCacheHitRatio:  hitRatio,
		MaxServerMemoryMB:    sharedMB,
		TargetServerMemoryMB: effectiveMB,
		TotalServerMemoryMB:  workMemMB,
		MemoryGrantsPendingCount: int(tempFiles),
		PLEBurnRateSecondsPerMin: math.Round((float64(tempBytes)/1048576.0)*10) / 10,
		PLEBurnVerdict:       fmt.Sprintf("%.2f%% Hit Ratio", hitRatio),
		TableEvictionImpacts: tableImpacts,
		DoctorInsights:       insights,
	}, nil
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// Keep unused sql import check satisfied if refactored
var _ = sql.ErrNoRows
