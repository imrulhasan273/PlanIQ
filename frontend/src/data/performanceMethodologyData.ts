// =============================================================================
// Static SQL Server performance methodology & wait-type reference data
// =============================================================================
export const TOP_WAIT_DATA = [
  {
    name: 'CXPACKET',
    title: 'Parallelism Thread Coordination & Skew',
    category: 'Parallelism',
    whatItMeans:
      'Query is executing across multiple CPU cores in parallel. A thread has completed its slice of work or is blocked and is waiting for other worker threads in the parallel query team to finish.',
    avoidKneeJerk:
      'Do NOT set server-wide MAXDOP to 1! Disabling parallelism cripples big analytical queries, index maintenance, and DBCC CHECKDB.',
    rootCauses: [
      'Skewed data distribution among worker threads (one thread processes 99% of rows while others sit idle).',
      'Missing indexes forcing parallel table scans.',
      'Outdated statistics causing improper thread allocation.',
      'Cost Threshold for Parallelism set to default (5), triggering parallelism for trivial queries.',
      'One of the worker threads is blocked by an exclusive lock or page latch.'
    ],
    solutions: [
      'Set Cost Threshold for Parallelism to 35–50 to restrict parallelism to genuinely expensive queries.',
      'Configure MAXDOP = physical cores per NUMA node (max 8).',
      'Update statistics with FULLSCAN to eliminate thread cardinality skew.',
      'In SQL Server 2016 SP2 / 2017+, distinguish benign coordinator waits (now classified under CXCONSUMER) from genuine worker skew in CXPACKET.'
    ],
    diagnosticSql: `-- Check for thread workload imbalance in running parallel queries
SELECT 
    r.session_id,
    t.exec_context_id AS thread_id,
    t.scheduler_id,
    t.wait_type,
    t.wait_duration_ms,
    r.cpu_time,
    r.total_elapsed_time,
    st.text AS query_sql
FROM sys.dm_os_waiting_tasks t
JOIN sys.dm_exec_requests r ON t.session_id = r.session_id
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
WHERE t.wait_type IN ('CXPACKET', 'CXCONSUMER')
ORDER BY r.session_id, t.exec_context_id;`
  },
  {
    name: 'PAGEIOLATCH_XX',
    title: 'Data Page Read from Disk into Buffer Pool',
    category: 'Disk I/O / Memory',
    whatItMeans:
      'A query requested a data page that does not reside in the Buffer Pool RAM cache. The task is suspended waiting for the page to be read from physical storage into memory (SH = Shared Read, EX = Exclusive Write).',
    avoidKneeJerk:
      'Do NOT automatically assume the disk storage subsystem is faulty! In 90% of cases, poor query plans (table scans) are forcing SQL Server to read millions of unneeded pages.',
    rootCauses: [
      'Missing indexes causing massive clustered index scans or table scans.',
      'Buffer Pool memory pressure (Page Life Expectancy dropping below threshold).',
      'Implicit data type conversions forcing full index scans.',
      'High storage latency (> 15 ms read latency on data drives).'
    ],
    solutions: [
      'Create covering nonclustered indexes to turn scans into selective index seeks.',
      'Correlate with sys.dm_io_virtual_file_stats to inspect per-drive read latency.',
      'Increase server memory to allow larger buffer pool caching.',
      'Move data files to NVMe or fast enterprise SAN tiering.'
    ],
    diagnosticSql: `-- Identify data files experiencing highest read stall latency
SELECT 
    DB_NAME(fs.database_id) AS DatabaseName,
    mf.name AS LogicalFileName,
    mf.physical_name AS PhysicalPath,
    fs.num_of_reads,
    fs.io_stall_read_ms,
    CAST(fs.io_stall_read_ms / NULLIF(fs.num_of_reads, 0) AS DECIMAL(10,2)) AS AvgReadLatency_ms
FROM sys.dm_io_virtual_file_stats(NULL, NULL) fs
JOIN sys.master_files mf ON fs.database_id = mf.database_id AND fs.file_id = mf.file_id
WHERE fs.num_of_reads > 1000
ORDER BY AvgReadLatency_ms DESC;`
  },
  {
    name: 'WRITELOG',
    title: 'Transaction Log Flush to Disk',
    category: 'Transaction Log / I/O',
    whatItMeans:
      'A transaction has committed (COMMIT TRAN) and is waiting for the 60KB log block buffer in memory to be flushed synchronously to the physical LDF disk file (Write-Ahead Logging protocol).',
    avoidKneeJerk:
      'Do NOT create multiple log files (.ldf)! SQL Server only writes to one log file sequentially at a time; adding more log files provides zero I/O benefit.',
    rootCauses: [
      'Slow disk subsystem hosting the .ldf file (> 5 ms write latency).',
      'Tiny, frequent commits (e.g. committing inside a tight loop instead of batching).',
      'Excessive Virtual Log Files (VLF fragmentation) due to small autogrowth increments.',
      'Massive page splits in indexes with random GUID clustering keys.'
    ],
    solutions: [
      'Move transaction log (.ldf) files to dedicated ultra-fast NVMe storage.',
      'Batch multiple INSERTs/UPDATEs into a single transaction to reduce log block flushes.',
      'Pre-size log file and fix autogrowth to prevent VLF proliferation (> 1,000 VLFs).',
      'Remove unused nonclustered indexes to reduce DML logging overhead.'
    ],
    diagnosticSql: `-- Check Transaction Log Flush Latency and VLF counts
SELECT 
    DB_NAME(fs.database_id) AS DatabaseName,
    mf.name AS LogFileName,
    fs.num_of_writes,
    fs.io_stall_write_ms,
    CAST(fs.io_stall_write_ms / NULLIF(fs.num_of_writes, 0) AS DECIMAL(10,2)) AS AvgLogWriteLatency_ms
FROM sys.dm_io_virtual_file_stats(NULL, NULL) fs
JOIN sys.master_files mf ON fs.database_id = mf.database_id AND fs.file_id = mf.file_id
WHERE mf.type_desc = 'LOG';`
  },
  {
    name: 'ASYNC_NETWORK_IO',
    title: 'Client Application Consumption Delay',
    category: 'Network / Client App',
    whatItMeans:
      'SQL Server has populated network output buffers and is waiting for the client application to acknowledge receipt and fetch more data packets. The database engine is throttled by the client.',
    avoidKneeJerk:
      'Do NOT blame the network infrastructure or routers! In almost all cases, the network is fine; the client application code is processing data Row-By-Agonizing-Row (RBAR).',
    rootCauses: [
      'Client application fetching huge result sets and processing row-by-row before reading next batch.',
      'Query executed in SSMS grid mode returning 500,000 rows (SSMS UI rendering bottleneck).',
      'Third-party ORM client buffering unpaged queries into memory.',
      'Network interface card (NIC) misconfiguration or duplex mismatch (rare).'
    ],
    solutions: [
      'Optimize client code: use DataReader streaming or fetch smaller paged sets.',
      'Apply filtering in T-SQL instead of downloading millions of rows for app-level filtering.',
      'Implement OFFSET-FETCH or pagination for large data grids.'
    ],
    diagnosticSql: `-- Identify queries currently waiting on client consumption
SELECT 
    r.session_id,
    r.status,
    r.command,
    t.wait_duration_ms,
    r.cpu_time,
    r.total_elapsed_time,
    st.text AS query_sql
FROM sys.dm_os_waiting_tasks t
JOIN sys.dm_exec_requests r ON t.session_id = r.session_id
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
WHERE t.wait_type = 'ASYNC_NETWORK_IO'
ORDER BY t.wait_duration_ms DESC;`
  },
  {
    name: 'PAGELATCH_XX',
    title: 'In-Memory Buffer Pool Data Page Contention',
    category: 'Memory / Concurrency',
    whatItMeans:
      'Short-term in-memory synchronization latch protecting an 8KB data page that is ALREADY loaded in RAM. Threads are competing to read/write the same in-memory page structure simultaneously.',
    avoidKneeJerk:
      'Do NOT confuse PAGELATCH with PAGEIOLATCH! PAGEIOLATCH is disk I/O; PAGELATCH is purely in-memory concurrency contention.',
    rootCauses: [
      'Classic TempDB allocation contention on PFS, GAM, and SGAM pages (Page 1, 2, 3).',
      'Last-page insert hotspots on clustered indexes with monotonically increasing keys (e.g. IDENTITY or GETDATE()).',
      'Frequent page splits occurring during heavy concurrent inserts.'
    ],
    solutions: [
      'For TempDB: Configure 8 equal data files, enable TF 1118 (default in 2016+), enable In-Memory TempDB Metadata.',
      'For Last-Page Hotspots: Hash the clustering key, use partition-based staggering, or provision index FILLFACTOR.',
      'Inspect wait resource (e.g. 2:1:1 = DB 2 [TempDB], File 1, Page 1 [PFS]).'
    ],
    diagnosticSql: `-- Decode PAGELATCH wait resources to pinpoint table & page
SELECT 
    session_id,
    wait_type,
    wait_duration_ms,
    wait_resource,
    SUBSTRING(wait_resource, 1, CHARINDEX(':', wait_resource) - 1) AS DatabaseId
FROM sys.dm_os_waiting_tasks
WHERE wait_type LIKE 'PAGELATCH_%'
ORDER BY wait_duration_ms DESC;`
  },
  {
    name: 'SOS_SCHEDULER_YIELD',
    title: 'Thread Quantum Exhaustion (CPU Yielding)',
    category: 'CPU Scheduling',
    whatItMeans:
      'A worker thread has consumed its entire 4 millisecond CPU quantum without encountering an I/O or locking wait, and has voluntarily stepped down to let another thread execute.',
    avoidKneeJerk:
      'Do NOT immediately assume CPU core count is inadequate. Often it means a query is running an unindexed table scan or nested loop that is entirely cached in RAM.',
    rootCauses: [
      'In-memory table scans processing millions of cached pages without disk waits.',
      'Scalar user-defined functions (UDFs) executing iterative logic per row.',
      'High runnable queue lengths indicating insufficient CPU threads for workload.',
      'Spinlock contention on high-core server architectures.'
    ],
    solutions: [
      'Add missing indexes to eliminate CPU-intensive memory scans.',
      'Inline scalar UDFs or rewrite as Inline Table-Valued Functions (iTVFs).',
      'Enable Hyper-Threading to provide additional logical schedulers for OLTP concurrency.',
      'Examine runnable tasks count via sys.dm_os_schedulers.'
    ],
    diagnosticSql: `-- Check CPU Scheduler health and runnable worker task queues
SELECT 
    scheduler_id,
    cpu_id,
    status,
    is_online,
    current_tasks_count,
    runnable_tasks_count,
    current_workers_count,
    work_queue_count
FROM sys.dm_os_schedulers
WHERE status = 'VISIBLE ONLINE'
ORDER BY runnable_tasks_count DESC;`
  },
  {
    name: 'LCK_M_XX',
    title: 'Lock Blocking & Concurrency Conflicts',
    category: 'Locking / Concurrency',
    whatItMeans:
      'A task is waiting to acquire a lock (e.g. Shared, Exclusive, Intent-Exclusive) on a row, page, or table, but cannot proceed because another session holds an incompatible lock.',
    avoidKneeJerk:
      'Do NOT default to sprinkling NOLOCK everywhere! Dirty reads can return corrupted data and phantom rows.',
    rootCauses: [
      'Long-running transactions holding exclusive locks during batch updates.',
      'Lock escalation from row-level locks to a full table lock (> 5,000 row modifications).',
      'Queries scanning large tables under default READ COMMITTED isolation.',
      'Synchronous High Availability (Availability Group / Mirroring) commit delays.'
    ],
    solutions: [
      'Enable Read Committed Snapshot Isolation (RCSI) so readers do not block writers.',
      'Break massive updates into smaller chunks (e.g. 2,000 rows per batch).',
      'Enable partition-level lock escalation: ALTER TABLE t SET (LOCK_ESCALATION = AUTO).',
      'Capture blocked process reports in Extended Events.'
    ],
    diagnosticSql: `-- Find current blocking chains and lead blocking SPID
SELECT 
    blocking.session_id AS BlockingSessionId,
    blocked.session_id AS BlockedSessionId,
    blocked.wait_type,
    blocked.wait_duration_ms,
    blocked_txt.text AS BlockedSQL,
    blocking_txt.text AS BlockingSQL
FROM sys.dm_os_waiting_tasks blocked
JOIN sys.dm_exec_requests r ON blocked.session_id = r.session_id
JOIN sys.dm_exec_sessions blocking ON blocked.blocking_session_id = blocking.session_id
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) blocked_txt
OUTER APPLY (
    SELECT TOP 1 st.text 
    FROM sys.dm_exec_requests r2
    CROSS APPLY sys.dm_exec_sql_text(r2.sql_handle) st
    WHERE r2.session_id = blocking.session_id
) blocking_txt
WHERE blocked.wait_type LIKE 'LCK_%';`
  },
  {
    name: 'OLEDB',
    title: 'OLE DB External Provider & DMV Processing',
    category: 'External / DMVs',
    whatItMeans:
      'SQL Server has called out through the OLE DB provider interface and is waiting for data to return from the external provider.',
    avoidKneeJerk:
      'Do NOT assume linked servers are configured! SQL Server uses OLE DB internally for many operations.',
    rootCauses: [
      'Third-party monitoring agents polling DMVs (many DMVs use OLE DB internally).',
      'DBCC CHECKDB integrity check processing.',
      'Slow performance or network latency to a remote Linked Server.'
    ],
    solutions: [
      'Verify if linked servers are actively executing slow queries; push filters to remote server.',
      'Check if monitoring tools are querying heavy DMVs at high frequency (e.g. every second).',
      'Schedule DBCC CHECKDB to run during low-traffic maintenance windows.'
    ],
    diagnosticSql: `-- Check active linked server requests or external calls
SELECT session_id, wait_type, wait_duration_ms, wait_resource
FROM sys.dm_os_waiting_tasks
WHERE wait_type = 'OLEDB'
ORDER BY wait_duration_ms DESC;`
  },
  {
    name: 'BACKUPXX',
    title: 'Backup Engine & Virtual Device Waits',
    category: 'Maintenance',
    whatItMeans:
      'Threads waiting during native backup/restore operations (BACKUPBUFFER, BACKUPIO, BACKUPTHREAD).',
    avoidKneeJerk:
      'Do NOT cancel backups immediately; check throughput and Instant File Initialization (IFI).',
    rootCauses: [
      'Backups writing over slow network shares or tape storage.',
      'Slow target backup drive with insufficient write throughput.',
      'Data file zero-initialization delay (Instant File Initialization disabled).'
    ],
    solutions: [
      'Enable Instant File Initialization (IFI) by granting Perform Volume Maintenance Tasks to SQL Server service account.',
      'Use backup compression to reduce written I/O by 60–80%.',
      'Tune backup buffer count and block size (BUFFERCOUNT, MAXTRANSFERSIZE).'
    ],
    diagnosticSql: `-- Check active backup throughput and ETA
SELECT 
    session_id,
    command,
    percent_complete,
    estimated_completion_time / 60000 AS EstCompletionMinutes,
    total_elapsed_time / 60000 AS ElapsedMinutes
FROM sys.dm_exec_requests
WHERE command LIKE 'BACKUP%' OR command LIKE 'RESTORE%';`
  }
];

// =============================================================================
// STATIC DATA: INTERACTIVE AUDIT CHECKLIST ITEMS
// =============================================================================
export const CHECKLIST_ITEMS = [
  {
    id: 'chk-sarg',
    level: 'LEVEL 1: DEV',
    levelBadge: 'badge-blue',
    title: 'Eliminate Non-Sargable Column Expressions',
    description: 'Verify no indexed columns are wrapped in functions (e.g. YEAR(col), SUBSTRING(col)) or CONVERT_IMPLICIT in WHERE/JOIN clauses.'
  },
  {
    id: 'chk-star',
    level: 'LEVEL 1: DEV',
    levelBadge: 'badge-blue',
    title: 'Replace SELECT * with Explicit Columns',
    description: 'Ensure all queries project only necessary columns to enable nonclustered index covering seeks and avoid Key Lookups.'
  },
  {
    id: 'chk-exists',
    level: 'LEVEL 1: DEV',
    levelBadge: 'badge-blue',
    title: 'Use EXISTS over COUNT(*) for Row Checks',
    description: 'Ensure existence verification utilizes early-termination IF EXISTS rather than scanning the entire table with COUNT(*).'
  },
  {
    id: 'chk-union',
    level: 'LEVEL 1: DEV',
    levelBadge: 'badge-blue',
    title: 'Prefer UNION ALL over UNION',
    description: 'Use UNION ALL whenever result streams are known to be distinct to bypass unnecessary sort-distinct operations.'
  },
  {
    id: 'chk-rbar',
    level: 'LEVEL 2: PROCEDURAL',
    levelBadge: 'badge-purple',
    title: 'Eliminate RBAR Loops and Cursors',
    description: 'Convert iterative WHILE loops and scalar row-by-row function calls into set-based batch statements or iTVFs.'
  },
  {
    id: 'chk-temp',
    level: 'LEVEL 2: PROCEDURAL',
    levelBadge: 'badge-purple',
    title: 'Audit #Temp vs @Table Usage',
    description: 'Verify table variables (@table) are strictly limited to < 50 rows; use #temp tables with primary keys for larger sets.'
  },
  {
    id: 'chk-nocount',
    level: 'LEVEL 2: PROCEDURAL',
    levelBadge: 'badge-purple',
    title: 'Set SET NOCOUNT ON in Stored Procedures',
    description: 'Ensure all stored procedures and triggers suppress row-count network roundtrips to reduce network latency.'
  },
  {
    id: 'chk-stats',
    level: 'LEVEL 3: DBA',
    levelBadge: 'badge-amber',
    title: 'Maintain Statistics on Ascending Keys',
    description: 'Schedule frequent statistics updates on high-modification identity and date columns to avoid 1-row estimation regressions.'
  },
  {
    id: 'chk-tempdb',
    level: 'LEVEL 3: DBA',
    levelBadge: 'badge-amber',
    title: 'Configure Equal TempDB Data Files',
    description: 'Provision 1 data file per physical core up to 8 with identical initial sizing and autogrowth settings on fast storage.'
  },
  {
    id: 'chk-rcsi',
    level: 'LEVEL 3: DBA',
    levelBadge: 'badge-amber',
    title: 'Evaluate Read Committed Snapshot (RCSI)',
    description: 'Enable RCSI at database level to eliminate reader-writer blocking concurrency issues without dirty reads.'
  },
  {
    id: 'chk-ctp',
    level: 'LEVEL 4: HARDWARE',
    levelBadge: 'badge-rose',
    title: 'Tune Cost Threshold for Parallelism & MAXDOP',
    description: 'Raise Cost Threshold for Parallelism from default 5 up to 35–50, and cap MAXDOP to NUMA node cores (max 8).'
  },
  {
    id: 'chk-mem',
    level: 'LEVEL 4: HARDWARE',
    levelBadge: 'badge-rose',
    title: 'Cap Max Server Memory',
    description: 'Ensure Max Server Memory leaves sufficient RAM (4–8 GB) for operating system buffer, thread stacks, and external processes.'
  }
];

// Display order for Top Wait Types
const TOP_WAIT_ORDER = ['CXPACKET','OLEDB','WRITELOG','ASYNC_NETWORK_IO','PAGEIOLATCH_XX','BACKUPXX','SOS_SCHEDULER_YIELD','PAGELATCH_XX','LCK_M_XX'];
TOP_WAIT_DATA.sort((a, b) => TOP_WAIT_ORDER.indexOf(a.name) - TOP_WAIT_ORDER.indexOf(b.name));

// Additional diagnostic guidance and version-specific notes per wait category
export const WAIT_EXTRA: Record<string, { further: string[]; note?: string }> = {
  CXPACKET: {
    further: [
      'Correlate with PAGEIOLATCH_SH waits: if present, suspect large scans.',
      'Examine the plan: does the parallelism make sense?',
      'Find the non-CXPACKET wait of the slow worker thread: that is the real cause.',
      'Example: 1 coordinator + 4 workers. If only the coordinator waits, workers are done and it is the cause; if 3 workers are also stuck, look at those workers.'
    ],
    note: 'Since SQL Server 2016 SP2 / 2017 CU3 the benign consumer wait is reported as CXCONSUMER.'
  },
  OLEDB: { further: ['What are the queries doing that wait on OLEDB?', 'If linked servers are used, what is slow on the remote side?', 'DBCC CHECKDB and many DMVs use OLE DB internally, so a monitoring tool polling DMVs can cause it.'] },
  WRITELOG: {
    further: [
      'Correlate with sys.dm_io_virtual_file_stats latency. Look for LOGBUFFER waits (internal log buffer contention).',
      'Check average disk write queue length for the log drive.',
      'Check average transaction size and whether frequent page splits occur.'
    ],
    note: 'Older docs cite a 31/32 outstanding-write limit; on 64-bit SQL Server 2012+ the limit was raised to 112 per database.'
  },
  ASYNC_NETWORK_IO: { further: ['Analyze client application code (RBAR, slow consumer).', 'Then analyze network latency, duplex settings and TCP offload.', 'Easy to demonstrate: run a big query in SSMS on the same machine as the server.'] },
  PAGEIOLATCH_XX: {
    further: [
      'SH mode: the page will be read. EX mode: the page will be changed.',
      'Find which tables and indexes are being read.',
      'Check latency with sys.dm_io_virtual_file_stats and the Avg Disk sec/Read counter.',
      'Look for implicit conversions in plans and for buffer pool pressure (Page Life Expectancy).'
    ]
  },
  BACKUPXX: { further: ['BACKUPBUFFER: waiting for a buffer or data (slow tape or network target?).', 'BACKUPIO: reading data files (slow data I/O?).', 'BACKUPTHREAD: waiting on another thread, such as zero-initialization (see PREEMPTIVE_OS_WRITEFILEGATHER).'] },
  SOS_SCHEDULER_YIELD: {
    further: [
      'It means the thread used its 4 ms quantum and yielded, or it is backing off a spinlock.',
      'These waits have zero resource wait time and do NOT appear in sys.dm_os_waiting_tasks.',
      'A tiny count of PAGEIOLATCH waits suggests the workload is memory-resident. Look for long Runnable Queues.',
      'Call-stack analysis usually shows spinlocks are not involved.'
    ]
  },
  PAGELATCH_XX: {
    further: ['SH: page will be read. EX: page will be changed (both in memory).', 'It does NOT mean add memory or I/O capacity.', 'Find the page(s) waited on, the queries, and the table and index structure.'],
    note: 'Trace flag 1118 behavior is built in since SQL Server 2016. Add equal-sized TempDB files instead.'
  },
  LCK_M_XX: {
    further: [
      'Follow the blocking chain with sys.dm_os_waiting_tasks to the lead blocker.',
      'Use the blocked process report to capture long lock waits.',
      'Synchronous mirroring or AG commit delay can hold locks longer.'
    ],
    note: 'Prefer snapshot isolation (RCSI) over Read Uncommitted. Dirty reads can return wrong data.'
  }
};
