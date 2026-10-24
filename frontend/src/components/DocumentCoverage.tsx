import React, { useState } from 'react';
import { Copy, Check, AlertTriangle, CheckCircle2, Info, FileText } from 'lucide-react';

/* ============================================================================
   Content below is traced to the user's PDF "SQL Server: Performance Improvements"
   (23 pages). Each correction quotes the PDF and states the engine reality.
   ============================================================================ */

export interface DocCorrection {
  id: string;
  area: string;
  status: 'outdated' | 'inaccurate' | 'nuance';
  topic: string;
  quote: string;
  reality: string;
}

export const CORRECTIONS: DocCorrection[] = [
  {
    id: 'adaptive',
    area: 'Development / Joins',
    status: 'outdated',
    topic: 'Adaptive Joins are columnstore-only',
    quote: "Adaptive Joins … It's applicable only to columnstore indexes",
    reality:
      'True in SQL Server 2017. From SQL Server 2019 (compat level 150), Batch Mode on Rowstore lets Adaptive Joins run on ordinary rowstore tables, with no columnstore index. The query still has to be eligible for batch mode.'
  },
  {
    id: 'tablevar',
    area: 'Procedural',
    status: 'inaccurate',
    topic: 'Table variables are faster than #temp tables',
    quote:
      'Use Table Variables instead of Temporary Tables: For smaller datasets, consider using table variables instead of temporary tables as they can have lower overhead and faster access.',
    reality:
      'Table variables also live in TempDB, not RAM. They have no column statistics, so before SQL 2019 the optimizer estimated 1 row. SQL 2019 Deferred Compilation fixes the row count but still gives no histograms. Use #temp tables when you join or filter on the data or it holds more than a few hundred rows. A table variable is fine for a handful of rows. Its different rollback behavior can also be useful.'
  },
  {
    id: 'joinorder',
    area: 'Development / Joins',
    status: 'inaccurate',
    topic: 'Join text order controls execution order',
    quote: 'Sequence: INNER JOIN (Smaller Set) ⇒ INNER JOIN (Larger Set). Advantage: minimize the number of comparisons',
    reality:
      'The cost-based optimizer reorders INNER JOINs using statistics, so the order you type usually does not change the plan. It only matters with OPTION (FORCE ORDER), with OUTER JOIN (which cannot be freely reordered), or when a huge join count makes the optimizer stop searching early. Reducing rows early is still a good goal. You achieve it with filters and indexes, not by textual order.'
  },
  {
    id: 'groupby',
    area: 'Development',
    status: 'inaccurate',
    topic: 'GROUP BY is better than DISTINCT',
    quote:
      'GROUP BY implicitly sorts the data … On the other hand, DISTINCT typically requires a separate sorting operation.',
    reality:
      'SQL Server produces the same plan for SELECT DISTINCT a and GROUP BY a: a Stream Aggregate if the data is already ordered, otherwise a Hash Aggregate. Neither guarantees sorted output, so you need ORDER BY. Use GROUP BY when you need aggregates, and DISTINCT when you only need to remove duplicates. Often the better fix is to remove the join that created the duplicates.'
  },
  {
    id: 'cache',
    area: 'Development',
    status: 'nuance',
    topic: '"Query caching" and its scope',
    quote: 'Query caching in SQL Server involves storing the execution plans … Query caching is specific to each SQL Server instance or database.',
    reality:
      'SQL Server caches execution plans, never query results. The plan cache is one instance-wide memory area. Plans are keyed by batch text, SET options and database context. Ad-hoc workloads can bloat it, so consider "optimize for ad hoc workloads" and parameterized queries (sp_executesql).'
  },
  {
    id: 'cte',
    area: 'Development',
    status: 'inaccurate',
    topic: 'CTEs improve performance',
    quote: 'Consider breaking down complex queries … or using common table expressions (CTEs) to improve query readability and performance.',
    reality:
      'A CTE is only a named subquery. SQL Server inlines it and does not materialize it, so there is no performance gain and a CTE referenced twice is evaluated twice. Use a CTE for readability. Use an indexed #temp table when you want to materialize an intermediate result.'
  },
  {
    id: 'offload',
    area: 'Development',
    status: 'nuance',
    topic: 'Offload calculations to the application',
    quote: 'Instead, consider performing complex calculations or transformations at the application level.',
    reality:
      'Filtering, joining and aggregating should stay in the database, because moving raw rows to the app costs network and ASYNC_NETWORK_IO. Offloading makes sense for CPU-heavy, non-relational work such as parsing, formatting and models. It also pays off because SQL Server cores are expensive to license. Scalar UDFs per row are the main thing to avoid.'
  },
  {
    id: 'ne',
    area: 'Development / Sargability',
    status: 'nuance',
    topic: '!= always scans',
    quote: 'For example, the != condition requires scanning all the rows to identify the matching rows.',
    reality:
      'col <> value can be turned into two range seeks (< value and > value). It is only a scan in practice when most rows qualify or no useful index exists. Sargability is a property of the predicate shape plus the statistics, not an absolute rule.'
  },
  {
    id: 'inexists',
    area: 'Development',
    status: 'nuance',
    topic: 'IN evaluates the whole list, EXISTS short-circuits',
    quote: 'the IN and NOT IN operators may need to evaluate the entire list of values before returning the result.',
    reality:
      'IN (subquery) and EXISTS are both planned as semi-joins and usually give identical plans. The real difference is NULL semantics: NOT IN returns no rows if the subquery produces even one NULL. Prefer NOT EXISTS for anti-joins. The EXISTS vs COUNT(*) advice in your PDF is correct.'
  },
  {
    id: 'locking',
    area: 'Procedural',
    status: 'nuance',
    topic: 'Prefer row-level locking',
    quote: 'Consider using row-level locking instead of table-level locking where possible.',
    reality:
      'The engine picks lock granularity itself. Forcing ROWLOCK raises lock-memory cost and can still escalate at about 5,000 locks. Better levers are good indexes (seeks, not scans), short transactions, batching updates under 5,000 rows, and Read Committed Snapshot (RCSI).'
  },
  {
    id: 'tf1118',
    area: 'DBA / TempDB',
    status: 'outdated',
    topic: 'Enable trace flag 1118',
    quote: 'Classic tempdb contention: Add more tempdb datafiles; Enable trace flag 1118; Reduce temp table usage',
    reality:
      'From SQL Server 2016, TempDB behavior of TF 1117 and 1118 is built in (uniform extents, equal growth), so there is nothing to enable. Add equal-sized data files (up to 8). On 2019+, Memory-Optimized TempDB Metadata removes much of the system-table PAGELATCH contention.'
  },
  {
    id: 'cxpacket',
    area: 'Waits / CXPACKET',
    status: 'outdated',
    topic: 'CXPACKET includes the coordinator wait',
    quote: 'Parallel operations are taking place … 1 Co-ordinate threads and 4 workers threads. In that case only co ordinate threads is the root cause.',
    reality:
      'Your analysis of which thread to inspect is correct. Since SQL Server 2016 SP2 and 2017 CU3, the benign consumer-side wait was split out into CXCONSUMER, so CXPACKET is a stronger skew signal than before. The advice not to set server MAXDOP to 1 stands.'
  },
  {
    id: 'readunc',
    area: 'Waits / LCK_M_XX',
    status: 'inaccurate',
    topic: 'Read Uncommitted and locking hints to stop blocking',
    quote: 'Different isolation level (Read Uncommited); Locking hints',
    reality:
      'READ UNCOMMITTED (NOLOCK) avoids blocking but can return dirty, duplicated or missing rows and can fail mid-scan. Your own first suggestion, snapshot isolation (readers do not block writers), is the right fix. Prefer RCSI. Treat NOLOCK as a last resort for approximate reporting only.'
  },
  {
    id: 'raid6',
    area: 'Hardware / RAID',
    status: 'inaccurate',
    topic: 'RAID 6 divisor is (disks − 2)',
    quote: 'RAID 6: I/Os per disk = (Reads + 6 × Writes) / (Number of disks in the array − 2) … = 3300 / 6 = 550',
    reality:
      'Parity is spread across all disks, so back-end I/O is divided by all N disks, not N−2. The correct figure for that example is (300 + 3000) / 8 = 412.5 IOPS per disk. Your RAID 0, 1, 5 and 10 formulas and worked examples are correct. The calculator on the Process page shows both numbers.'
  },
  {
    id: 'iscsi',
    area: 'Hardware / Storage',
    status: 'inaccurate',
    topic: 'iSCSI listed as a high-speed storage type',
    quote: 'High-Speed Storage: NVMe SSD, PCIe SSD, SATA SSD, iSCSI interfaces offer faster disk I/O operations',
    reality:
      'iSCSI is a network protocol that carries block I/O over TCP/IP, not a drive technology. It adds network latency and is usually slower than local NVMe. It is a valid SAN transport, especially on 10/25GbE with multipathing. It is not inherently faster than SSDs.'
  },
  {
    id: 'highcpu',
    area: 'Hardware / CPU',
    status: 'nuance',
    topic: 'High CPU: get more CPU',
    quote: 'High CPU: Need more CPU. More clock speed. CPU will read data from disk. So disk must be faster as well.',
    reality:
      'Find out why CPU is high before buying cores: scans from missing indexes, implicit conversions, scalar UDFs, excessive recompiles, or parallel plans on cheap queries. SQL Server is licensed per core, so added cores are expensive, while higher clock speed helps OLTP. Disk speed affects waits, not CPU.'
  },
  {
    id: 'iowaits',
    area: 'Hardware / Waits',
    status: 'inaccurate',
    topic: 'Definitions of IO_COMPLETION, LOGMGR and PAGEIOLATCH',
    quote:
      'IO_COMPLETION … can occur when reading or writing data from disk, network communication … LOGMGR … writing or flushing of transaction log … PAGEIOLATCH … waiting for a latch on a data page to be released',
    reality:
      'Network waits are ASYNC_NETWORK_IO, not IO_COMPLETION. LOGMGR is mostly the log manager waiting for outstanding log I/O while closing a database. Log flush waits are WRITELOG. PAGEIOLATCH means a page is being read from disk into the buffer pool while its latch is held (your later section defines it correctly).'
  },
  {
    id: 'affinity',
    area: 'Hardware / CPU',
    status: 'nuance',
    topic: 'Set CPU affinity for dedicated CPUs',
    quote: 'Set CPU affinity to allocate specific CPU cores or processors to SQL Server.',
    reality:
      'Leave affinity at the default for almost all servers. A fixed mask can create hot schedulers and stops SQL Server and Windows from balancing work. Valid uses are multi-instance consolidation or licensing limits.'
  },
  {
    id: 'mirroring',
    area: 'DBA / HA',
    status: 'outdated',
    topic: 'Database Mirroring and SQL Server Profiler',
    quote: 'Database Mirroring or Always on Availability Groups … Use SQL Server Profiler or Extended Events',
    reality:
      'Database Mirroring has been deprecated since SQL Server 2012, so use Always On Availability Groups. SQL Server Profiler and SQL Trace are deprecated, so use Extended Events (the lighter replacement you also mention).'
  },
  {
    id: 'indexmaint',
    area: 'DBA / Indexes',
    status: 'nuance',
    topic: 'Rebuild or reorganize indexes regularly',
    quote: 'Regularly monitor and maintain indexes by rebuilding or reorganizing them … analyzing index fragmentation levels',
    reality:
      'Commonly cited guidance is reorganize at 5–30% fragmentation and rebuild above 30%, and only for indexes over about 1,000 pages. On SSD or SAN storage, fragmentation matters much less than statistics. A rebuild refreshes statistics with a full scan, while a reorganize does not.'
  },
  {
    id: 'writelog',
    area: 'Waits / WRITELOG',
    status: 'nuance',
    topic: 'The 31/32 outstanding log write limit',
    quote: 'If constantly 31/32 then the internal limit has been reached for outstanding transaction log writes for a single database',
    reality:
      'This limit was 32 in older builds. It was raised to 112 per database on 64-bit starting with SQL Server 2012. Check your version before using 32 as the threshold. The rest of that section (do not add log files, batch commits, remove unused indexes) is correct.'
  },
  {
    id: 'pgcomp',
    area: 'Development / Compression',
    status: 'nuance',
    topic: 'PostgreSQL pg_compression / pg_zstd',
    quote: 'The "pg_compression" and "pg_zstd" extensions, for example, provide compression capabilities for PostgreSQL tables.',
    reality:
      'I could not verify extensions with those names. PostgreSQL compresses large values through TOAST (pglz, and LZ4 from version 14). Verify this line before sharing the document. It is not SQL Server specific.'
  }
];

export const VERIFIED_CORRECT: string[] = [
  'Thread quantum is a fixed 4 ms and cannot be changed',
  'Waiter List is unordered; Runnable Queue is FIFO',
  'Resource Governor importance is weighted 9 : 3 : 1',
  'SOS_SCHEDULER_YIELD does not appear in sys.dm_os_waiting_tasks',
  'Do not set server-wide MAXDOP to 1 for CXPACKET',
  'MAXDOP = cores per NUMA node, or 8',
  'Do not add extra transaction log files for WRITELOG',
  'ASYNC_NETWORK_IO is usually a slow client (RBAR)',
  'PAGELATCH is not PAGEIOLATCH, so do not just add memory or I/O',
  'EXISTS beats COUNT(*) for existence checks',
  'Leading wildcards and expressions on columns are non-sargable',
  'UNION ALL beats UNION when no duplicates are possible',
  'RAID 0, 1, 5 and 10 formulas and worked examples',
  'Sparse column limitations (no clustered/PK/unique)',
  'Row and page compression trade I/O for CPU',
  'Hyper-threading can help quantum-exhaustion on slow cores'
];

/* ---------------------------------------------------------------------------
   Reusable small pieces
--------------------------------------------------------------------------- */
interface CopyProps {
  onCopy: (id: string, text: string) => void;
  copiedId: string | null;
}

const SqlCard: React.FC<CopyProps & { id: string; title: string; sql: string }> = ({
  id,
  title,
  sql,
  onCopy,
  copiedId
}) => (
  <div className="tsql-copy-card">
    <div className="tsql-header">
      <span>{title}</span>
      <button className="btn-copy-sm" onClick={() => onCopy(id, sql)}>
        {copiedId === id ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
        <span>{copiedId === id ? 'Copied' : 'Copy T-SQL'}</span>
      </button>
    </div>
    <pre>
      <code>{sql}</code>
    </pre>
  </div>
);

const STATUS_LABEL: Record<DocCorrection['status'], string> = {
  outdated: 'Outdated',
  inaccurate: 'Inaccurate',
  nuance: 'Needs nuance'
};

export const CorrectionsGrid: React.FC = () => {
  const [filter, setFilter] = useState<'all' | DocCorrection['status']>('all');
  const shown = CORRECTIONS.filter((c) => filter === 'all' || c.status === filter);
  const count = (s: DocCorrection['status']) => CORRECTIONS.filter((c) => c.status === s).length;

  return (
    <>
      <div className="corr-filter-row">
        <button className={`corr-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          All ({CORRECTIONS.length})
        </button>
        {(['inaccurate', 'outdated', 'nuance'] as const).map((s) => (
          <button
            key={s}
            className={`corr-chip chip-${s} ${filter === s ? 'active' : ''}`}
            onClick={() => setFilter(s)}
          >
            {STATUS_LABEL[s]} ({count(s)})
          </button>
        ))}
      </div>

      <div className="corrections-grid">
        {shown.map((c) => (
          <div className="correction-card" key={c.id}>
            <div className="correction-header">
              <div className="corr-meta-row">
                <span className={`corr-status status-${c.status}`}>{STATUS_LABEL[c.status]}</span>
                <span className="corr-area">{c.area}</span>
              </div>
              <h4>{c.topic}</h4>
            </div>
            <div className="correction-body">
              <div className="correction-old">
                <span className="tag-old">From your PDF</span>
                <p>"{c.quote}"</p>
              </div>
              <div className="correction-new">
                <span className="tag-new">Engine reality</span>
                <p>{c.reality}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="verified-box">
        <div className="verified-title">
          <CheckCircle2 size={15} color="#34d399" />
          <span>Checked and correct in your PDF ({VERIFIED_CORRECT.length})</span>
        </div>
        <div className="verified-chips">
          {VERIFIED_CORRECT.map((v) => (
            <span className="verified-chip" key={v}>
              {v}
            </span>
          ))}
        </div>
      </div>
    </>
  );
};

const CoverageHeader: React.FC<{ title: string; note: string }> = ({ title, note }) => (
  <div className="coverage-head">
    <FileText size={15} color="#38bdf8" />
    <div>
      <strong>{title}</strong>
      <p>{note}</p>
    </div>
  </div>
);

/* ---------------------------------------------------------------------------
   Level 1 extras (PDF: NULL handling, EXISTS/IN, caching, sargable table)
--------------------------------------------------------------------------- */
export const Level1Extras: React.FC<CopyProps> = (p) => (
  <div className="methodology-section glass-panel">
    <CoverageHeader
      title="More from your Development Level section"
      note="Topics in the PDF that were not on the page before: NULL handling, EXISTS vs IN, plan cache and sargability."
    />
    <div className="cards-two-col">
      <div className="methodology-card">
        <div className="card-top-head">
          <AlertTriangle size={16} color="#fbbf24" />
          <h4>Properly Handle NULL Values</h4>
        </div>
        <p className="card-desc">
          Your PDF says to handle NULL in JOIN and WHERE (for example with COALESCE). Two traps matter most:
        </p>
        <ul className="bullet-feature-list">
          <li>
            <strong>NOT IN with a NULL in the list returns zero rows</strong>, because x NOT IN (1, NULL) evaluates to UNKNOWN. Use NOT EXISTS.
          </li>
          <li>
            <strong>Wrapping an indexed column in COALESCE/ISNULL</strong> makes it non-sargable. Prefer <code>col = @v OR col IS NULL</code>, or a computed or filtered index.
          </li>
          <li>
            <strong>NULL = NULL is not true.</strong> Joins on nullable columns silently drop NULL rows.
          </li>
        </ul>
        <SqlCard
          {...p}
          id="null-notexists"
          title="NOT IN vs NOT EXISTS with NULLs"
          sql={`-- Returns NO rows if any Orders.CustomerID is NULL
SELECT c.CustomerID FROM dbo.Customers c
WHERE c.CustomerID NOT IN (SELECT o.CustomerID FROM dbo.Orders o);

-- Safe and optimizer-friendly (anti semi join)
SELECT c.CustomerID FROM dbo.Customers c
WHERE NOT EXISTS (SELECT 1 FROM dbo.Orders o WHERE o.CustomerID = c.CustomerID);`}
        />
      </div>

      <div className="methodology-card">
        <div className="card-top-head">
          <CheckCircle2 size={16} color="#34d399" />
          <h4>EXISTS / NOT EXISTS vs IN / NOT IN</h4>
        </div>
        <div className="sargable-table-wrap">
          <table className="sargable-table">
            <thead>
              <tr>
                <th>Claim in PDF</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>EXISTS stops at the first match</td>
                <td>
                  <span className="badge badge-low">True</span> (semi-join short-circuit)
                </td>
              </tr>
              <tr>
                <td>IN evaluates the whole list</td>
                <td>
                  <span className="badge badge-warning">Mostly no</span>: the plan is usually identical
                </td>
              </tr>
              <tr>
                <td>EXISTS handles NULL more intuitively</td>
                <td>
                  <span className="badge badge-low">True</span> (the main reason to prefer NOT EXISTS)
                </td>
              </tr>
              <tr>
                <td>Use EXISTS over COUNT(*)</td>
                <td>
                  <span className="badge badge-low">True</span>
                </td>
              </tr>
              <tr>
                <td>Use IN () for exact values</td>
                <td>
                  <span className="badge badge-low">True</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flow-mini">
          <span className="fm fm-blue">Outer row</span>
          <span className="fm-arrow">→</span>
          <span className="fm fm-amber">Probe inner (index seek)</span>
          <span className="fm-arrow">→</span>
          <span className="fm fm-green">First match? stop</span>
        </div>
      </div>
    </div>

    <div className="methodology-card">
      <div className="card-top-head">
        <Info size={16} color="#38bdf8" />
        <h4>Sargable vs Non-sargable patterns (extended from your table)</h4>
      </div>
      <div className="sargable-table-wrap">
        <table className="sargable-table">
          <thead>
            <tr>
              <th>Non-sargable</th>
              <th>Sargable rewrite</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>WHERE CAST(Salary AS INT) &gt; 50000</code> (your example)
              </td>
              <td>
                <code>WHERE Salary &gt; 50000</code> (match the column's type)
              </td>
            </tr>
            <tr>
              <td>
                <code>WHERE YEAR(OrderDate) = 2024</code>
              </td>
              <td>
                <code>WHERE OrderDate &gt;= '20240101' AND OrderDate &lt; '20250101'</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>WHERE Name LIKE '%son'</code>
              </td>
              <td>
                <code>LIKE 'son%'</code>, full-text search, or a reversed computed column
              </td>
            </tr>
            <tr>
              <td>
                <code>WHERE ISNULL(Status, 0) = 1</code>
              </td>
              <td>
                <code>WHERE Status = 1</code> (or handle NULL separately)
              </td>
            </tr>
            <tr>
              <td>
                <code>WHERE Qty * 2 &gt; 100</code>
              </td>
              <td>
                <code>WHERE Qty &gt; 50</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

/* ---------------------------------------------------------------------------
   Level 2 extras (PDF: procedure checklist, preserve table, error handling)
--------------------------------------------------------------------------- */
export const Level2Extras: React.FC<CopyProps> = (p) => (
  <div className="methodology-section glass-panel">
    <CoverageHeader
      title="More from your Procedural Level section"
      note="The PDF's procedure checklist turned into a template: incremental load, TRY/CATCH, short transactions, no chatty PRINT."
    />
    <div className="cards-two-col">
      <div className="methodology-card">
        <div className="card-top-head">
          <CheckCircle2 size={16} color="#34d399" />
          <h4>Your procedure checklist</h4>
        </div>
        <ul className="bullet-feature-list">
          <li>Use parameterized procedures, which reuse plans and cut compile cost.</li>
          <li>Avoid excessive triggers, since they run inside the caller's transaction.</li>
          <li>Avoid excessive logging or PRINT, since every message costs I/O.</li>
          <li>Keep transactions short and handle errors (TRY/CATCH).</li>
          <li>Use a preserve (incremental) table instead of a full refresh.</li>
          <li>Prefer set-based work. If you must use a cursor, use LOCAL FAST_FORWARD.</li>
          <li>Review procedure dependencies and keep statistics current.</li>
        </ul>
      </div>
      <SqlCard
        {...p}
        id="proc-template"
        title="Procedure template (short txn, error handling)"
        sql={`CREATE OR ALTER PROCEDURE dbo.usp_LoadDailySales
    @LoadDate date
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRAN;

        -- Incremental ("preserve table") load: only new/changed rows
        MERGE dbo.SalesPreserve AS t
        USING (SELECT OrderID, Amount, ModifiedAt
               FROM dbo.SalesStage
               WHERE ModifiedAt >= @LoadDate) AS s
           ON t.OrderID = s.OrderID
        WHEN MATCHED AND t.Amount <> s.Amount
             THEN UPDATE SET t.Amount = s.Amount, t.ModifiedAt = s.ModifiedAt
        WHEN NOT MATCHED BY TARGET
             THEN INSERT (OrderID, Amount, ModifiedAt)
                  VALUES (s.OrderID, s.Amount, s.ModifiedAt);

        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;  -- rethrow to the caller
    END CATCH
END;`}
      />
    </div>
  </div>
);

/* ---------------------------------------------------------------------------
   Level 3 extras (PDF: the big DBA list)
--------------------------------------------------------------------------- */
const DBA_TOPICS: { t: string; doc: string; note: string }[] = [
  { t: 'Database design and indexing', doc: 'Normalize; index WHERE/JOIN/ORDER BY columns.', note: 'Also drop duplicate and unused indexes. Every index taxes writes.' },
  { t: 'Partitioning', doc: 'Split large tables by a key such as date.', note: 'Mostly helps manageability (SWITCH, archive). Speedup needs partition elimination, so filter on the partition key.' },
  { t: 'Statistics', doc: 'Update statistics; ascending-key columns go stale.', note: 'Auto-update uses a dynamic threshold on compat 130+. Add scheduled FULLSCAN on critical tables.' },
  { t: 'Query Store / execution plans', doc: 'Find costly queries and tune them.', note: 'Query Store is on by default for new databases in SQL 2022. You can force a plan.' },
  { t: 'Configuration (memory, MAXDOP)', doc: 'Set max server memory, parallelism, MAXDOP.', note: 'Also raise Cost Threshold for Parallelism from 5 (community norm is 25–50).' },
  { t: 'TempDB', doc: 'Initial size, autogrowth, separate disks.', note: 'Equal-sized files, up to 8. Mixed-extent flags are built in since 2016.' },
  { t: 'Maintenance', doc: 'Backups, integrity checks, defrag.', note: 'DBCC CHECKDB regularly (it shows up as OLEDB waits). Test restores.' },
  { t: 'Tracing, deadlocks, blocking', doc: 'Profiler/XE, system_health, blocking DMVs.', note: 'Use Extended Events. Profiler is deprecated. See the scripts below.' },
  { t: 'Plan cache', doc: 'Reuse plans to avoid compile cost.', note: 'Watch ad-hoc plan bloat. Parameterize.' },
  { t: 'Compression', doc: 'Row and page compression.', note: 'Test CPU impact. Great for scan-heavy, read-mostly data.' },
  { t: 'Log management', doc: 'Size logs and back them up.', note: 'Pre-size to avoid many VLFs. Take frequent log backups in FULL recovery.' },
  { t: 'Resource Governor', doc: 'Prioritize workloads.', note: 'Enterprise feature. Workload importance maps to the 9:3:1 runnable-queue rule.' },
  { t: 'HA / replication', doc: 'Mirroring, Always On, replication.', note: 'Mirroring is deprecated, so use Availability Groups. Readable secondaries offload reporting.' },
  { t: 'Agent jobs', doc: 'Schedule jobs away from peak load.', note: 'Stagger index, stats and backup jobs. Watch overlap.' },
  { t: 'Version upgrade', doc: 'Upgrade for performance features.', note: 'Raise compat level after testing in Query Store (IQP features depend on it).' },
  { t: 'Scaling, sharding, archiving', doc: 'Scale up/out, shard, archive cold data.', note: 'Archive first (cheapest). Sharding is a last resort with real application cost.' },
  { t: 'Monitoring and alerting', doc: 'Counters and alerts.', note: 'Track PLE, waits, latency, blocking, log growth and failed jobs.' },
  { t: 'Query parallelism', doc: 'Divide work across processors.', note: 'Good for big queries, harmful for tiny ones when threshold is 5.' }
];

export const Level3Extras: React.FC<CopyProps> = (p) => (
  <div className="methodology-section glass-panel">
    <CoverageHeader
      title="Your full Architecture / DBA checklist, with modern notes"
      note="Every DBA-level item from your PDF is listed here with the updated guidance."
    />
    <div className="dba-topic-grid">
      {DBA_TOPICS.map((d) => (
        <div className="dba-topic" key={d.t}>
          <strong>{d.t}</strong>
          <span className="dba-doc">PDF: {d.doc}</span>
          <span className="dba-note">{d.note}</span>
        </div>
      ))}
    </div>
    <div className="cards-two-col">
      <SqlCard
        {...p}
        id="frag-check"
        title="Index fragmentation (5% / 30% rule)"
        sql={`SELECT OBJECT_NAME(ips.object_id) AS tbl, i.name AS idx,
       ips.avg_fragmentation_in_percent, ips.page_count,
       CASE WHEN ips.avg_fragmentation_in_percent >= 30 THEN 'REBUILD'
            WHEN ips.avg_fragmentation_in_percent >= 5  THEN 'REORGANIZE'
            ELSE 'OK' END AS action
FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') ips
JOIN sys.indexes i ON i.object_id = ips.object_id AND i.index_id = ips.index_id
WHERE ips.page_count > 1000 AND i.index_id > 0
ORDER BY ips.avg_fragmentation_in_percent DESC;`}
      />
      <SqlCard
        {...p}
        id="vlf-check"
        title="VLF count (log management)"
        sql={`-- SQL Server 2016 SP2+ / 2017+
SELECT DB_NAME(d.database_id) AS db, COUNT(*) AS vlf_count
FROM sys.databases d
CROSS APPLY sys.dm_db_log_info(d.database_id) li
GROUP BY d.database_id
ORDER BY vlf_count DESC;
-- Many thousands of VLFs slow recovery and log backups.`}
      />
    </div>
  </div>
);

/* ---------------------------------------------------------------------------
   Level 4 extras (PDF: pillars, storage, bottleneck resolutions)
--------------------------------------------------------------------------- */
export const Level4Extras: React.FC<CopyProps> = (p) => (
  <div className="methodology-section glass-panel">
    <CoverageHeader
      title="Your Hardware Level section, with corrections"
      note="The four pillars, the disk-bottleneck list, and the notes on affinity, cooling and interconnects."
    />
    <div className="four-pillars">
      {[
        { n: 'Memory', c: 'blue', d: 'Buffer pool, grants, PLE' },
        { n: 'Disk I/O', c: 'amber', d: 'Latency, IOPS, throughput' },
        { n: 'Processor', c: 'purple', d: 'Runnable queue, signal waits' },
        { n: 'Network', c: 'rose', d: 'ASYNC_NETWORK_IO, latency' }
      ].map((x) => (
        <div className={`pillar pillar-${x.c}`} key={x.n}>
          <strong>{x.n}</strong>
          <span>{x.d}</span>
        </div>
      ))}
    </div>
    <p className="card-desc">
      Once a bottleneck is found you can <strong>increase capacity</strong> or <strong>decrease the arrival rate of requests</strong>. Cutting
      arrivals means tuning queries, caching in the app, and archiving, and it is usually cheaper than hardware.
    </p>
    <div className="cards-two-col">
      <div className="methodology-card">
        <div className="card-top-head">
          <CheckCircle2 size={16} color="#34d399" />
          <h4>Disk bottleneck resolutions (your 11 items)</h4>
        </div>
        <ul className="bullet-feature-list">
          <li>Use a faster I/O path (controllers, HBAs, NVMe).</li>
          <li>Use RAID. Prefer RAID 10 for log and write-heavy data (see calculator).</li>
          <li>Use a SAN with multipathing. Watch queue depth and latency.</li>
          <li>Replace HDD with SSD.</li>
          <li>Align partitions. Use a 64 KB allocation unit for SQL files.</li>
          <li>Add memory to cut physical reads.</li>
          <li>Use multiple files and filegroups to spread I/O.</li>
          <li>Put the log on a separate drive.</li>
          <li>Use partitioned tables (partition elimination reduces I/O).</li>
          <li>Fix the query first: scans cause most PAGEIOLATCH waits.</li>
          <li>Compress cold, read-mostly data.</li>
        </ul>
      </div>
      <SqlCard
        {...p}
        id="file-latency"
        title="Per-file latency (ties to PAGEIOLATCH and WRITELOG)"
        sql={`SELECT DB_NAME(vfs.database_id) AS db, mf.type_desc, mf.physical_name,
       vfs.num_of_reads, vfs.num_of_writes,
       vfs.io_stall_read_ms  / NULLIF(vfs.num_of_reads, 0)  AS avg_read_ms,
       vfs.io_stall_write_ms / NULLIF(vfs.num_of_writes, 0) AS avg_write_ms
FROM sys.dm_io_virtual_file_stats(NULL, NULL) vfs
JOIN sys.master_files mf
  ON mf.database_id = vfs.database_id AND mf.file_id = vfs.file_id
ORDER BY avg_read_ms DESC;
-- Guidance: data files under ~20 ms, log files under ~5 ms.`}
      />
    </div>
  </div>
);

/* ---------------------------------------------------------------------------
   Finding costly queries (PDF p.14)
--------------------------------------------------------------------------- */
export const CostlyQueriesSection: React.FC<CopyProps> = (p) => {
  const [tab, setTab] = useState<'xe' | 'qs' | 'dmv'>('xe');
  return (
    <div className="methodology-section glass-panel">
      <CoverageHeader
        title="Finding Costly Queries: three methods from your PDF"
        note="Extended Events (rpc_completed), Query Store, and sys.dm_exec_procedure_stats, with ready scripts."
      />
      <div className="wait-pill-tabs">
        <button className={`wait-pill-btn ${tab === 'xe' ? 'active' : ''}`} onClick={() => setTab('xe')}>
          Extended Events
        </button>
        <button className={`wait-pill-btn ${tab === 'qs' ? 'active' : ''}`} onClick={() => setTab('qs')}>
          Query Store
        </button>
        <button className={`wait-pill-btn ${tab === 'dmv' ? 'active' : ''}`} onClick={() => setTab('dmv')}>
          dm_exec_procedure_stats
        </button>
      </div>

      {tab === 'xe' && (
        <div className="cards-two-col">
          <div className="methodology-card">
            <h4 className="mini-h">When to use it</h4>
            <ul className="bullet-feature-list">
              <li>You need individual executions (duration, CPU, reads, writes) and the exact parameters.</li>
              <li>
                Capture <code>rpc_completed</code> (procedure calls) and <code>sql_batch_completed</code>. Filter by duration to keep overhead low.
              </li>
              <li>Add blocking and wait events to the same session for context.</li>
              <li>Durations are in microseconds. 1,000,000 = 1 second.</li>
            </ul>
          </div>
          <SqlCard
            {...p}
            id="xe-slow"
            title="Slow-procedure Extended Events session"
            sql={`CREATE EVENT SESSION [PlanIQ_SlowProcs] ON SERVER
ADD EVENT sqlserver.rpc_completed (
    ACTION (sqlserver.database_name, sqlserver.client_app_name, sqlserver.sql_text)
    WHERE duration > 1000000                -- > 1 second
),
ADD EVENT sqlserver.sql_batch_completed (
    ACTION (sqlserver.database_name, sqlserver.client_app_name, sqlserver.sql_text)
    WHERE duration > 1000000
)
ADD TARGET package0.event_file (SET filename = N'PlanIQ_SlowProcs.xel', max_file_size = (50))
WITH (MAX_MEMORY = 4096 KB, EVENT_RETENTION_MODE = ALLOW_SINGLE_EVENT_LOSS, STARTUP_STATE = OFF);

ALTER EVENT SESSION [PlanIQ_SlowProcs] ON SERVER STATE = START;`}
          />
        </div>
      )}

      {tab === 'qs' && (
        <div className="cards-two-col">
          <div className="methodology-card">
            <h4 className="mini-h">When to use it</h4>
            <ul className="bullet-feature-list">
              <li>You want history, trends and plan changes (regressions) over days and weeks.</li>
              <li>Compare plans for the same query_id and force the last good plan if needed.</li>
              <li>Built-in reports: Top Resource Consumers, Regressed Queries, Query Wait Stats.</li>
              <li>Times are stored in microseconds. Divide by 1000 for ms.</li>
            </ul>
          </div>
          <SqlCard
            {...p}
            id="qs-top"
            title="Top CPU queries from Query Store"
            sql={`SELECT TOP (20)
       q.query_id, LEFT(qt.query_sql_text, 200) AS sql_text,
       SUM(rs.count_executions)                               AS executions,
       SUM(rs.avg_cpu_time * rs.count_executions) / 1000.0    AS total_cpu_ms,
       SUM(rs.avg_duration * rs.count_executions) / 1000.0    AS total_duration_ms,
       SUM(rs.avg_logical_io_reads * rs.count_executions)     AS total_logical_reads
FROM sys.query_store_query q
JOIN sys.query_store_query_text    qt ON qt.query_text_id = q.query_text_id
JOIN sys.query_store_plan          p  ON p.query_id       = q.query_id
JOIN sys.query_store_runtime_stats rs ON rs.plan_id       = p.plan_id
GROUP BY q.query_id, qt.query_sql_text
ORDER BY total_cpu_ms DESC;`}
          />
        </div>
      )}

      {tab === 'dmv' && (
        <div className="cards-two-col">
          <div className="methodology-card">
            <h4 className="mini-h">When to use it</h4>
            <ul className="bullet-feature-list">
              <li>Quick triage with no setup. It shows cumulative stats for cached procedures.</li>
              <li>
                Stats reset when the plan leaves cache or the server restarts, so check <code>cached_time</code>.
              </li>
              <li>
                Follow up with <code>sys.dm_exec_query_stats</code> for per-statement detail and plans.
              </li>
            </ul>
          </div>
          <SqlCard
            {...p}
            id="dmv-proc"
            title="Costliest cached stored procedures"
            sql={`SELECT TOP (20)
       DB_NAME(ps.database_id) AS db,
       OBJECT_SCHEMA_NAME(ps.object_id, ps.database_id) + '.' +
       OBJECT_NAME(ps.object_id, ps.database_id)        AS proc_name,
       ps.execution_count,
       ps.total_worker_time / 1000                      AS total_cpu_ms,
       ps.total_worker_time / NULLIF(ps.execution_count, 0) / 1000 AS avg_cpu_ms,
       ps.total_elapsed_time / 1000                     AS total_elapsed_ms,
       ps.total_logical_reads, ps.total_physical_reads,
       ps.cached_time, ps.last_execution_time
FROM sys.dm_exec_procedure_stats ps
ORDER BY ps.total_worker_time DESC;`}
          />
        </div>
      )}
    </div>
  );
};
