import React, { useState, useMemo } from 'react';
import {
  Clock,
  HardDrive,
  Cpu,
  Layers,
  Network,
  Lock,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Search,
  Filter,
  ArrowRight,
  Activity,
  Flame,
  Info,
  ExternalLink,
  ShieldAlert,
  Zap,
  BarChart2,
  Copy,
  Check,
  Terminal,
  Settings
} from 'lucide-react';
import { PlanAnalysis, PlanNode } from '../../types/plan';

interface PgWaitStatsTabProps {
  plan: PlanAnalysis;
  onNavigateTab?: (tab: string) => void;
}

export interface PgWaitReferenceItem {
  waitEvent: string;
  waitClass: 'IO' | 'Lock' | 'LWLock' | 'IPC' | 'Client' | 'Activity' | 'Timeout' | 'CPU';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';
  shortDesc: string;
  internalMechanics: string;
  correlatedOperators: string;
  dbaPrescription: string[];
}

export const PG_WAIT_REFERENCE_LIBRARY: PgWaitReferenceItem[] = [
  {
    waitEvent: 'DataFileRead',
    waitClass: 'IO',
    severity: 'CRITICAL',
    shortDesc: 'Waiting for a read of a relation block from storage disk into shared_buffers.',
    internalMechanics:
      'Backend requested an 8KB data page that was absent in PostgreSQL shared_buffers cache. The process yields and waits for OS/disk storage subsystem to return the block.',
    correlatedOperators: 'Seq Scan, Index Scan, Bitmap Heap Scan, Index Only Scan.',
    dbaPrescription: [
      'Increase shared_buffers (typically 25% of total server RAM) to retain working set in memory.',
      'Check effective_io_concurrency on SSD/NVMe (set to 200) to allow asynchronous prefetching.',
      'Create covering indexes to eliminate full table Sequential Scans.',
      'Review random_page_cost (lower to 1.1 on SSDs) to encourage index usage over sequential reads.'
    ]
  },
  {
    waitEvent: 'BufFileRead / BufFileWrite',
    waitClass: 'IO',
    severity: 'CRITICAL',
    shortDesc: 'Writing or reading temporary run files on disk because query memory exceeded work_mem.',
    internalMechanics:
      'PostgreSQL Sort (external merge sort) or Hash Join (multi-batch hash) ran out of allocated work_mem RAM and created temporary files in base/pgsql_tmp to complete operation.',
    correlatedOperators: 'Sort (external merge), Hash Join (multi-batch), HashAggregate, Materialize.',
    dbaPrescription: [
      'Increase work_mem for the session: SET work_mem = "64MB" or "128MB".',
      'Optimize query ORDER BY or GROUP BY clauses to avoid unnecessary intermediate sorting.',
      'Ensure index matches ORDER BY columns to eliminate explicit Sort operator entirely.',
      'Monitor pg_stat_database.temp_files and temp_bytes to track disk spill frequency.'
    ]
  },
  {
    waitEvent: 'relation (Lock)',
    waitClass: 'Lock',
    severity: 'CRITICAL',
    shortDesc: 'Heavy relation-level table lock contention between concurrent transactions.',
    internalMechanics:
      'A query is waiting to acquire a heavyweight table lock (e.g. AccessExclusiveLock during DDL, RowExclusiveLock during UPDATE/DELETE). Often caused by unindexed foreign keys or long transactions.',
    correlatedOperators: 'UPDATE, DELETE, TRUNCATE, ALTER TABLE, CREATE INDEX (non-concurrent).',
    dbaPrescription: [
      'Always use CREATE INDEX CONCURRENTLY and DROP INDEX CONCURRENTLY to avoid AccessExclusiveLock.',
      'Add indexes to Foreign Key referencing columns to prevent share locks on referenced tables during DELETE.',
      'Keep transactions brief; commit or rollback immediately instead of leaving transactions open in application.',
      'Configure idle_in_transaction_session_timeout to automatically disconnect orphaned locks.'
    ]
  },
  {
    waitEvent: 'tuple (Lock)',
    waitClass: 'Lock',
    severity: 'HIGH',
    shortDesc: 'Waiting for a row-level lock held by another concurrent transaction.',
    internalMechanics:
      'Two or more transactions are modifying or selecting (FOR UPDATE / FOR SHARE) the exact same rows in a relation. The second transaction blocks until the first commits or rolls back.',
    correlatedOperators: 'UPDATE, DELETE, SELECT ... FOR UPDATE, SELECT ... FOR SHARE.',
    dbaPrescription: [
      'Ensure concurrent updates modify rows in consistent primary-key order to eliminate deadlocks.',
      'Use SELECT ... FOR UPDATE SKIP LOCKED for queue worker patterns instead of blocking locks.',
      'Shorten write transactions and avoid performing external HTTP calls or heavy processing while holding row locks.'
    ]
  },
  {
    waitEvent: 'buffer_content (LWLock)',
    waitClass: 'LWLock',
    severity: 'HIGH',
    shortDesc: 'Lightweight lock contention on a specific page inside shared_buffers.',
    internalMechanics:
      'Multiple backend processes are attempting to read or modify the exact same 8KB buffer page simultaneously. Highly active "hot" rows or indexes cause buffer contention.',
    correlatedOperators: 'Index Scan on hot index root/branch, Seq Scan on hot small table.',
    dbaPrescription: [
      'Distribute hot writes across partition ranges or hash partitions.',
      'Check fillfactor on write-intensive tables to allow HOT (Heap-Only Tuples) updates.',
      'Increase shared_buffers to reduce buffer mapping hash collision and eviction churn.'
    ]
  },
  {
    waitEvent: 'ParallelFinish / IPC',
    waitClass: 'IPC',
    severity: 'MEDIUM',
    shortDesc: 'Gather node waiting for background parallel workers to complete execution chunks.',
    internalMechanics:
      'The coordinating backend leader process has completed its portion of the plan and is blocked at Gather or Gather Merge waiting for parallel worker threads to finish transmitting data tuples.',
    correlatedOperators: 'Gather, Gather Merge, Parallel Seq Scan, Parallel Hash Join.',
    dbaPrescription: [
      'Inspect worker row distribution skew to verify workers received equal tuple volume.',
      'Tune max_parallel_workers_per_gather based on CPU core count (typically 2-4 for OLTP, 8+ for DW).',
      'Increase work_mem if parallel workers are each spilling to disk.',
      'Raise min_parallel_table_scan_size if parallel query is overhead on small tables.'
    ]
  },
  {
    waitEvent: 'WALSync / WALWrite',
    waitClass: 'IO',
    severity: 'HIGH',
    shortDesc: 'Waiting for write-ahead log (WAL) data to be flushed to physical disk storage (fsync).',
    internalMechanics:
      'Occurs at transaction COMMIT when synchronous_commit is ON. The client backend waits for disk controller to acknowledge that all WAL records have been safely written to durable non-volatile media.',
    correlatedOperators: 'COMMIT, INSERT, UPDATE, DELETE.',
    dbaPrescription: [
      'Place pg_wal directory on high-speed NVMe storage with high write IOPS and write cache.',
      'For batch bulk-loading, temporarily set synchronous_commit = off or commit in batches of 1,000+ rows.',
      'Ensure commit_delay and commit_siblings are tuned if grouping commits.',
      'Check disk write cache battery-backed unit (BBU).'
    ]
  },
  {
    waitEvent: 'ClientRead',
    waitClass: 'Client',
    severity: 'INFO',
    shortDesc: 'PostgreSQL backend is idle, waiting for the client application to send the next command.',
    internalMechanics:
      'The database completed the query quickly, but the client connection has not sent the next request. If inside a transaction block, this keeps locks open and prevents VACUUM from cleaning dead rows.',
    correlatedOperators: 'Idle client connection, Application latency.',
    dbaPrescription: [
      'Eliminate application latency between statements inside BEGIN ... COMMIT blocks.',
      'Use connection pooling (PgBouncer or Supavisor) with transaction pooling mode.',
      'Set idle_in_transaction_session_timeout = "30s" to kill forgotten open transactions.'
    ]
  },
  {
    waitEvent: 'VacuumDelay',
    waitClass: 'Activity',
    severity: 'INFO',
    shortDesc: 'Autovacuum worker is intentionally sleeping to prevent saturating disk I/O bandwidth.',
    internalMechanics:
      'PostgreSQL autovacuum enforces cost limits (vacuum_cost_limit) by sleeping (vacuum_cost_delay) when accumulated I/O points exceed thresholds.',
    correlatedOperators: 'Autovacuum, VACUUM.',
    dbaPrescription: [
      'On modern SSD/NVMe storage, increase autovacuum_vacuum_cost_limit (e.g. from 200 to 2000) or lower autovacuum_vacuum_cost_delay to 2ms.',
      'Ensure tables with heavy UPDATE/DELETE are vacuumed before table bloat and index bloat expand.'
    ]
  },
  {
    waitEvent: 'JIT Compilation Overhead',
    waitClass: 'CPU',
    severity: 'HIGH',
    shortDesc: 'Time spent by LLVM compiling expressions exceeds the runtime savings.',
    internalMechanics:
      'When query cost exceeds jit_above_cost (default 100,000), PostgreSQL invokes LLVM JIT. If the query runs in under 100ms, JIT compilation (50-200ms) can make the query significantly slower.',
    correlatedOperators: 'Aggregate, Hash Join, Complex Filter Predicates.',
    dbaPrescription: [
      'For OLTP workloads with short queries, disable JIT: SET jit = off; or raise jit_above_cost to 500,000.',
      'Inspect JIT timing in EXPLAIN (ANALYZE): if JIT generation/optimization > 50% of total query time, disable JIT.'
    ]
  }
];

export const PgWaitStatsTab: React.FC<PgWaitStatsTabProps> = ({ plan, onNavigateTab }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [copiedEvent, setCopiedEvent] = useState<string | null>(null);

  const firstStmtPg = plan.statements[0]?.pg;
  const executionMs = firstStmtPg?.executionMs || plan.hardwareMetrics?.totalActualElapsedMs || 0;
  const planningMs = firstStmtPg?.planningMs || 0;
  const totalMs = executionMs + planningMs;

  const planningPct = totalMs > 0 ? (planningMs / totalMs) * 100 : 0;
  const executionPct = totalMs > 0 ? (executionMs / totalMs) * 100 : 100;

  // Buffer counts
  const totalLogicalReads = plan.hardwareMetrics?.totalLogicalReads || 0;
  const totalPhysicalReads = plan.hardwareMetrics?.totalPhysicalReads || 0;
  const cacheHitRatio = plan.hardwareMetrics?.cacheHitRatioPercent ?? 100;

  // Spills
  const allNodes: PlanNode[] = [];
  plan.statements.forEach((s) => {
    const walk = (n?: PlanNode) => {
      if (!n) return;
      allNodes.push(n);
      if (n.children) n.children.forEach(walk);
    };
    walk(s.rootNode);
  });

  const spillNodes = allNodes.filter(
    (n) =>
      (n.pg?.sortSpaceType || '').toLowerCase().includes('disk') ||
      (n.pg?.hashBatches || 0) > 1 ||
      (n.pg?.buffers?.tempRead || 0) > 0 ||
      (n.pg?.buffers?.tempWritten || 0) > 0
  );

  const hasIoWait = totalPhysicalReads > 500;
  const hasSpill = spillNodes.length > 0;
  const hasJit = !!(firstStmtPg?.jit && (firstStmtPg.jit.totalMs || 0) > 5);

  // Derived active wait profile
  const activeWaitProfile = [
    ...(hasIoWait
      ? [
          {
            name: 'IO:DataFileRead',
            category: 'Disk Storage I/O',
            severity: 'CRITICAL',
            detail: `${totalPhysicalReads.toLocaleString()} blocks read from physical disk (cache miss).`,
            remedy: 'Increase shared_buffers or add covering indexes.',
          },
        ]
      : []),
    ...(hasSpill
      ? [
          {
            name: 'IO:BufFileRead / BufFileWrite',
            category: 'Temporary Disk Spill',
            severity: 'CRITICAL',
            detail: `${spillNodes.length} operator(s) exceeded work_mem and spilled to disk run files.`,
            remedy: 'Increase work_mem for session or tune ORDER BY / Hash joins.',
          },
        ]
      : []),
    ...(hasJit
      ? [
          {
            name: 'CPU:JIT Compilation',
            category: 'LLVM Code Generation',
            severity: 'HIGH',
            detail: `JIT overhead added ${firstStmtPg?.jit?.totalMs?.toFixed(2)} ms (${firstStmtPg?.jit?.functions || 0} functions).`,
            remedy: 'Set jit = off or raise jit_above_cost if query is latency-sensitive.',
          },
        ]
      : []),
    {
      name: 'CPU:Execution & Tuple Evaluation',
      category: 'In-Memory Compute',
      severity: 'INFO',
      detail: `Active engine processing time: ${executionMs.toFixed(2)} ms across relational operators.`,
      remedy: 'Optimize operator trees and eliminate sequential table scans.',
    },
  ];

  // Filtered reference library
  const filteredLibrary = useMemo(() => {
    return PG_WAIT_REFERENCE_LIBRARY.filter((item) => {
      const matchSearch =
        item.waitEvent.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.shortDesc.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.internalMechanics.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.correlatedOperators.toLowerCase().includes(searchTerm.toLowerCase());

      const matchClass = selectedClass === 'all' || item.waitClass === selectedClass;
      return matchSearch && matchClass;
    });
  }, [searchTerm, selectedClass]);

  const handleCopy = (text: string, id: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedEvent(id);
      setTimeout(() => setCopiedEvent(null), 2000);
    }
  };

  return (
    <div className="tab-scroll-container">
      {/* Top Timing & Latency Hero */}
      <div className="verdict-hero-card glass-panel" style={{ borderLeft: '4px solid #38bdf8' }}>
        <div className="verdict-top-row">
          <div className="verdict-title-tag">
            <Clock size={16} color="#38bdf8" />
            <span>PostgreSQL Execution Latency & Wait Analysis</span>
          </div>
          <span className="badge badge-info" style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
            EXPLAIN Timing & Buffers
          </span>
        </div>

        {/* Planning vs Execution Progress Bar */}
        <div style={{ margin: '14px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>
              Planning Time: {planningMs.toFixed(3)} ms ({planningPct.toFixed(1)}%)
            </span>
            <span style={{ color: '#34d399', fontWeight: 600 }}>
              Execution Time: {executionMs.toFixed(2)} ms ({executionPct.toFixed(1)}%)
            </span>
          </div>
          <div style={{ height: '8px', width: '100%', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${planningPct}%`, background: '#38bdf8' }} title={`Planning: ${planningMs.toFixed(3)} ms`} />
            <div style={{ width: `${executionPct}%`, background: '#34d399' }} title={`Execution: ${executionMs.toFixed(2)} ms`} />
          </div>
        </div>

        {/* Core Latency Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            marginTop: '12px',
          }}
        >
          <div className="diag-sub-item glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>shared_buffers Hit Ratio</span>
            <div style={{ fontSize: '18px', fontWeight: 700, color: cacheHitRatio >= 95 ? '#34d399' : '#fbbf24', marginTop: '2px' }}>
              {cacheHitRatio.toFixed(1)}%
            </div>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
              Hit: {totalLogicalReads.toLocaleString()} | Disk: {totalPhysicalReads.toLocaleString()}
            </span>
          </div>

          <div className="diag-sub-item glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>work_mem Spills</span>
            <div style={{ fontSize: '18px', fontWeight: 700, color: hasSpill ? '#f43f5e' : '#34d399', marginTop: '2px' }}>
              {hasSpill ? `${spillNodes.length} Spills (Disk)` : '0 Spills (RAM)'}
            </div>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
              {hasSpill ? 'Exceeded session work_mem' : 'Fully in memory'}
            </span>
          </div>

          <div className="diag-sub-item glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>JIT Compilation Overhead</span>
            <div style={{ fontSize: '18px', fontWeight: 700, color: hasJit ? '#fbbf24' : '#34d399', marginTop: '2px' }}>
              {firstStmtPg?.jit?.totalMs ? `${firstStmtPg.jit.totalMs.toFixed(2)} ms` : '0 ms'}
            </div>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
              {hasJit ? `${firstStmtPg?.jit?.functions || 0} functions compiled` : 'JIT not invoked'}
            </span>
          </div>

          <div className="diag-sub-item glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Triggers Execution Time</span>
            <div style={{ fontSize: '18px', fontWeight: 700, color: (firstStmtPg?.triggers || []).length > 0 ? '#a855f7' : '#34d399', marginTop: '2px' }}>
              {(firstStmtPg?.triggers || []).reduce((acc: number, t: any) => acc + (t.timeMs || 0), 0).toFixed(2)} ms
            </div>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
              {(firstStmtPg?.triggers || []).length} active triggers
            </span>
          </div>
        </div>
      </div>

      {/* Detected Query Bottlenecks & Wait Profile */}
      <div className="section-block" style={{ marginTop: '20px' }}>
        <div className="diagnostics-hero-header glass-panel">
          <div className="diagnostics-header-left">
            <div className="diagnostics-badge-row">
              <Activity size={16} color="#38bdf8" />
              <span className="diagnostics-section-badge">Active Query Wait & Bottleneck Profile</span>
            </div>
            <h3 className="diagnostics-headline">Bottlenecks Derived from Plan Execution</h3>
            <p className="diagnostics-subtext">
              Categorizes execution time between physical disk I/O, temporary work_mem spills, JIT compilation, and CPU evaluation.
            </p>
          </div>
        </div>

        <div className="diagnostics-cards-grid" style={{ marginTop: '12px' }}>
          {activeWaitProfile.map((wait, idx) => (
            <div key={idx} className="diag-card glass-panel" style={{ borderLeft: `3px solid ${wait.severity === 'CRITICAL' ? '#f43f5e' : wait.severity === 'HIGH' ? '#fbbf24' : '#38bdf8'}` }}>
              <div className="diag-card-header">
                <div className="diag-icon-title">
                  {wait.name.startsWith('IO') ? <HardDrive size={16} color="#f43f5e" /> : <Cpu size={16} color="#38bdf8" />}
                  <span className="diag-title">{wait.name}</span>
                </div>
                <span className={`badge badge-${wait.severity === 'CRITICAL' ? 'critical' : wait.severity === 'HIGH' ? 'high' : 'info'}`}>
                  {wait.category}
                </span>
              </div>
              <div className="diag-card-body">
                <p style={{ fontSize: '12px', color: '#cbd5e1', margin: '4px 0 8px 0' }}>
                  {wait.detail}
                </p>
                <div className="diag-remedy-row" style={{ width: '100%' }}>
                  <span style={{ fontWeight: 600, color: '#34d399' }}>DBA Fix:</span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{wait.remedy}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PostgreSQL Top Wait Types Reference Library */}
      <div className="section-block" style={{ marginTop: '24px' }}>
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={18} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
                  PostgreSQL Wait Event & Performance Dictionary
                </h3>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Complete reference for pg_stat_activity wait events, internal mechanics, and postgresql.conf tuning parameters.
              </p>
            </div>

            {/* Search and Category Filter */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <div className="search-input-wrap" style={{ position: 'relative', minWidth: '180px' }}>
                <Search size={13} style={{ position: 'absolute', left: '8px', top: '8px', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search wait events..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '5px 8px 5px 28px',
                    fontSize: '11px',
                    color: '#f8fafc',
                    outline: 'none',
                    width: '100%',
                  }}
                />
              </div>

              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  color: '#38bdf8',
                  outline: 'none',
                }}
              >
                <option value="all">All Wait Classes</option>
                <option value="IO">IO (Storage & Disk)</option>
                <option value="Lock">Lock (Table & Row)</option>
                <option value="LWLock">LWLock (Lightweight RAM)</option>
                <option value="IPC">IPC (Parallel Workers)</option>
                <option value="Client">Client (Network/App)</option>
                <option value="Activity">Activity (Vacuum/CP)</option>
                <option value="CPU">CPU / JIT</option>
              </select>
            </div>
          </div>

          {/* Reference Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredLibrary.map((item, idx) => (
              <div
                key={idx}
                className="glass-panel"
                style={{
                  padding: '14px',
                  borderLeft: `4px solid ${
                    item.severity === 'CRITICAL'
                      ? '#f43f5e'
                      : item.severity === 'HIGH'
                      ? '#fbbf24'
                      : item.severity === 'MEDIUM'
                      ? '#38bdf8'
                      : '#34d399'
                  }`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <code style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>{item.waitEvent}</code>
                    <span className="badge badge-info" style={{ fontSize: '10px' }}>{item.waitClass}</span>
                  </div>
                  <span
                    className={`badge badge-${
                      item.severity === 'CRITICAL'
                        ? 'critical'
                        : item.severity === 'HIGH'
                        ? 'high'
                        : item.severity === 'MEDIUM'
                        ? 'info'
                        : 'success'
                    }`}
                    style={{ fontSize: '10px' }}
                  >
                    {item.severity}
                  </span>
                </div>

                <p style={{ fontSize: '12px', color: '#e2e8f0', margin: '4px 0 8px 0', fontWeight: 500 }}>
                  {item.shortDesc}
                </p>

                <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '6px', padding: '10px', margin: '8px 0' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    <strong>Internal Mechanics:</strong> {item.internalMechanics}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    <strong>Correlated Operators:</strong> <code style={{ color: '#c084fc' }}>{item.correlatedOperators}</code>
                  </div>
                </div>

                <div style={{ marginTop: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#34d399' }}>PostgreSQL DBA Prescriptions:</span>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '11px', color: '#cbd5e1' }}>
                    {item.dbaPrescription.map((presc, pIdx) => (
                      <li key={pIdx} style={{ marginBottom: '3px' }}>{presc}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
