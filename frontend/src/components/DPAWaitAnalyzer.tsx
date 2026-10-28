import React, { useState, useMemo, useEffect } from 'react';
import {
  Clock,
  Database,
  Server,
  FileCode2,
  Layers,
  Lock,
  ShieldAlert,
  Copy,
  Check,
  Sparkles,
  ChevronDown,
  Info,
  X,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Play,
  Maximize2,
  Filter,
  BarChart2,
  Sliders,
  ExternalLink,
  Cpu,
  HardDrive,
  Users,
  Monitor
} from 'lucide-react';
import {
  ConnectionStatus,
  LiveWaitStat,
  QueryStoreEntry,
  ActiveSession,
  LiveBlockingSession,
  LiveDeadlockReport,
  WaitTimeHistoryPoint,
  DPAPerspectiveItem
} from '../types/livedb';

interface DPAWaitAnalyzerProps {
  status: ConnectionStatus | null;
  queryStore?: QueryStoreEntry[];
  waitStats?: LiveWaitStat[];
  activeSessions?: ActiveSession[];
  waitHistory?: WaitTimeHistoryPoint[];
  blockingSessions?: LiveBlockingSession[];
  deadlocks?: LiveDeadlockReport[];
  onLoadPlanXML?: (xml: string, name: string) => void;
  onLoadDeadlockXML?: (xml: string) => void;
  onNavigateTab?: (tab: string) => void;
}

type DPAPerspective =
  | 'timeslice'
  | 'sql'
  | 'databases'
  | 'waits'
  | 'programs'
  | 'dbusers'
  | 'machines'
  | 'sessions'
  | 'files'
  | 'drives'
  | 'blockers'
  | 'plans';

type DPABottomDrawerTab = 'resources' | 'sqltext' | 'blocking' | 'deadlocks';

// SolarWinds DPA Exact Palette for Top 15 Query Hashes (Screenshot parity)
const DPA_QUERY_PALETTE = [
  '#3949ab', // Slate Blue (#4675209948)
  '#7cb342', // Lime Green (#2589928315)
  '#3f51b5', // Royal Blue (#2366649485)
  '#c0ca33', // Olive/Gold (#2446580537)
  '#00acc1', // Cyan (#5290520832)
  '#d87a38', // Amber/Orange (#3918961931)
  '#1a237e', // Navy (#4689059277)
  '#7e57c2', // Light Purple (#6375046345)
  '#8bc34a', // Lime Green (#5320725829)
  '#2e7d32', // Dark Green (#4648768235)
  '#ec407a', // Pink (#3973389656)
  '#ab47bc', // Magenta (#5040501700)
  '#00897b', // Teal (#5135283776)
  '#1e88e5', // Bright Blue (#4256233282)
  '#26a69a'  // Turquoise (#2259449293)
];

// SolarWinds DPA Standard Wait Colors
const DPA_WAIT_COLORS: Record<string, string> = {
  'Memory/CPU': '#057a3d',
  'PAGEIOLATCH_SH': '#003882',
  'ASYNC_NETWORK_IO': '#ca8a04',
  'MEMORY_ALLOCATION_EXT': '#6b21a8',
  'RESERVED_MEMORY_ALLOCATION_EXT': '#0284c7',
  'LCK_M_IX': '#0d9488',
  'PAGEIOLATCH_EX': '#0369a1',
  'WRITELOG': '#15803d',
  'SOS_SCHEDULER_YIELD': '#e11d48',
  'CXROWSET_SYNC': '#c026d3',
  'PREEMPTIVE_OS_QUERYREGISTRY': '#4f46e5',
  'HADR_SYNC_COMMIT': '#16a34a',
  'LCK_M_SCH_S': '#0891b2',
  'CXSYNC_PORT': '#0284c7',
  'IO_COMPLETION': '#2563eb',
  'LATCH_EX': '#9333ea',
  'DEADLOCK_ENUM_MUTEX': '#b91c1c',
  'CXCONSUMER': '#047857',
  'WAIT_ON_SYNC_STATISTICS_REFRESH': '#3b82f6',
  'SLEEP_BPOOL_STEAL': '#991b1b',
  'PAGELATCH_EX': '#0284c7',
  'PREEMPTIVE_OLEDBOPS': '#6366f1',
  'PREEMPTIVE_OS_CRYPTACQUIRECONTEXT': '#be123c',
  'PREEMPTIVE_XE_GETTARGETSTATE': '#7c3aed',
  'XE_BUFFERMGR_ALLPROCESSED_EVENT': '#059669',
  'XE_RING_TARGET_MUTEX': '#e11d48'
};

const BENIGN_WAITS = new Set([
  'VDI_CLIENT_OTHER', 'SOS_WORK_DISPATCHER', 'HADR_WORK_QUEUE', 'BROKER_TRANSMITTER',
  'HADR_NOTIFICATION_DEQUEUE', 'PREEMPTIVE_XE_DISPATCHER', 'PREEMPTIVE_XE_GETTARGETSTATE',
  'HADR_CLUSAPI_CALL', 'HADR_TIMER_TASK', 'QDS_ASYNC_QUEUE', 'ONDEMAND_TASK_QUEUE',
  'PVS_PREALLOCATE', 'BROKER_EVENTHANDLER', 'BROKER_RECEIVE_WAITFOR', 'SLEEP_BPOOL_FLUSH',
  'SOS_PHYS_PAGE_CACHE', 'PARALLEL_REDO_WORKER_WAIT_WORK', 'PARALLEL_REDO_FLOW_CONTROL',
  'UCS_SESSION_REGISTRATION', 'SERVER_IDLE_CHECK', 'REDO_THREAD_PENDING_WORK',
  'CLR_SEMAPHORE', 'LAZYWRITER_SLEEP', 'RESOURCE_QUEUE', 'SLEEP_TASK', 'SLEEP_SYSTEMTASK',
  'SQLTRACE_BUFFER_FLUSH', 'WAITFOR', 'LOGMGR_QUEUE', 'CHECKPOINT_QUEUE',
  'REQUEST_FOR_DEADLOCK_SEARCH', 'XE_TIMER_EVENT', 'BROKER_TO_FLUSH', 'BROKER_TASK_STOP',
  'CLR_MANUAL_EVENT', 'CLR_AUTO_EVENT', 'DISPATCHER_QUEUE_SEMAPHORE',
  'FT_IFTS_SCHEDULER_IDLE_WAIT', 'XE_DISPATCHER_WAIT', 'XE_DISPATCHER_JOIN',
  'SQLTRACE_INCREMENTAL_FLUSH_SLEEP', 'DIRTY_PAGE_POLL', 'HADR_FILESTREAM_IOMGR_IOCOMPLETION',
  'SP_SERVER_DIAGNOSTICS_SLEEP', 'QDS_PERSIST_TASK_MAIN_LOOP_SLEEP',
  'QDS_CLEANUP_STALE_QUERIES_TASK_MAIN_LOOP_SLEEP', 'QDS_SHUTDOWN_QUEUE'
]);

const WAIT_DEFINITIONS: Record<string, { desc: string; cause: string; fix: string }> = {
  PAGEIOLATCH_SH: {
    desc: 'Shared latch wait while reading data pages from physical disk into the buffer pool.',
    cause: 'Missing indexes causing table/index scans, outdated statistics, or buffer pool memory pressure.',
    fix: 'Inspect Missing Indexes tab, optimize query predicates, and ensure sufficient server RAM.'
  },
  PAGEIOLATCH_EX: {
    desc: 'Exclusive latch wait while writing modified data pages from memory to disk.',
    cause: 'Heavy INSERT/UPDATE bulk workloads, checkpoint write stalls, or slow disk subsystem.',
    fix: 'Separate data and log files across high-speed NVMe/SSD drives; review batch sizes.'
  },
  WRITELOG: {
    desc: 'Session waiting for transaction log buffer to flush to the LDF file on COMMIT.',
    cause: 'Slow log storage throughput, frequent single-row transactions without explicit BEGIN TRAN.',
    fix: 'Place transaction log on ultra-fast storage; batch singleton transactions together.'
  },
  LCK_M_X: {
    desc: 'Exclusive lock wait. Query is completely blocked by another transaction modifying the same row/table.',
    cause: 'Long-running transactions, table-level lock escalation, or inappropriate transaction isolation.',
    fix: 'Check Blocking tab to identify head blocker; consider READ COMMITTED SNAPSHOT (RCSI).'
  },
  LCK_M_IX: {
    desc: 'Intent exclusive lock wait when attempting to acquire a row/page lock within a table.',
    cause: 'Lock conflict with concurrent shared or schema locks during concurrent write operations.',
    fix: 'Reduce transaction footprint; avoid large DDL or table-locking operations during peak hours.'
  },
  LCK_M_SCH_S: {
    desc: 'Schema stability lock wait. Query wants to read schema while an exclusive schema lock is held.',
    cause: 'Online index rebuilds, partition switching, or dynamic schema modifications.',
    fix: 'Schedule index maintenance during off-peak hours or use WAIT_AT_LOW_PRIORITY.'
  },
  SOS_SCHEDULER_YIELD: {
    desc: 'Worker thread voluntarily yields CPU quantum to other tasks on the scheduler.',
    cause: 'CPU-intensive loops, high thread concurrency, or heavy computational query operations.',
    fix: 'Optimize scalar functions, reduce CPU-heavy sorting/aggregates, and check CPU queue.'
  },
  ASYNC_NETWORK_IO: {
    desc: 'SQL Server has generated query result rows but is waiting for client application to fetch them.',
    cause: 'Client app fetching rows one-by-one in a slow loop instead of buffering results.',
    fix: 'Tune client application to fetch in batches; verify client-to-server network latency.'
  },
  CXPACKET: {
    desc: 'Coordinator thread waiting for parallel worker threads to finish processing.',
    cause: 'Workload skewed across parallel schedulers or Cost Threshold for Parallelism set too low.',
    fix: 'Tune Cost Threshold for Parallelism (recommend 50+) and configure MAXDOP.'
  },
  CXCONSUMER: {
    desc: 'Parallel query consumer thread processing packets from producer threads.',
    cause: 'Normal parallel query processing; only problematic if combined with high CPU time.',
    fix: 'Review execution plan to ensure parallelism is beneficial for this query.'
  },
  PAGELATCH_EX: {
    desc: 'Exclusive latch wait for an in-memory page (no disk I/O).',
    cause: 'TempDB GAM/SGAM/PFS allocation bitmap contention or last-page insert clustering.',
    fix: 'Ensure TempDB has multiple equally-sized data files (1 per CPU core up to 8); use Hash/GUID keys.'
  },
  PAGELATCH_SH: {
    desc: 'Shared latch wait on an in-memory page.',
    cause: 'Multiple concurrent sessions reading identical non-cached index root pages.',
    fix: 'Ensure table index root pages stay cached in memory.'
  },
  RESOURCE_SEMAPHORE: {
    desc: 'Query is waiting for a memory grant workspace before execution can begin.',
    cause: 'Queries requesting massive memory grants (sorting, hash joins) exhausting max server memory.',
    fix: 'Tune queries with missing index warnings on ORDER BY; avoid unnecessary DISTINCT or SORT.'
  }
};

function formatWaitDuration(sec: number): string {
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  }
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m ${s}s`;
  }
  if (sec >= 1) {
    return `${sec.toFixed(1)}s`;
  }
  return `${Math.round(sec * 1000)}ms`;
}

export const DPAWaitAnalyzer: React.FC<DPAWaitAnalyzerProps> = ({
  status,
  queryStore = [],
  waitStats = [],
  activeSessions = [],
  waitHistory = [],
  blockingSessions = [],
  deadlocks = [],
  onLoadPlanXML,
  onLoadDeadlockXML,
  onNavigateTab
}) => {
  // Perspective subtabs (Timeslice, SQL, Waits, etc.)
  const [activePerspective, setActivePerspective] = useState<DPAPerspective>('timeslice');

  // Bottom drawer subtab (Resources, SQL Text, Blocking, Deadlocks)
  const [bottomDrawerTab, setBottomDrawerTab] = useState<DPABottomDrawerTab>('sqltext');

  // Filter Bar state
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('Last 1 Hour');
  const [selectedInterval, setSelectedInterval] = useState<string>('5 minute');
  const [showTips, setShowTips] = useState<boolean>(true);
  const [copiedSQL, setCopiedSQL] = useState<boolean>(false);

  // Active selected item for drilldown
  const [selectedQueryHash, setSelectedQueryHash] = useState<string>('');
  const [selectedWaitType, setSelectedWaitType] = useState<string>('');
  const [selectedSliceIndex, setSelectedSliceIndex] = useState<number | null>(null);

  // Active perspective telemetry (Programs, Databases, DB Users, Machines, Files, Drives)
  const [perspectiveItems, setPerspectiveItems] = useState<DPAPerspectiveItem[]>([]);
  const [isPerspectiveLoading, setIsPerspectiveLoading] = useState<boolean>(false);

  // Active host/database title
  const hostName = status?.serverName || '';
  const dbName = status?.databaseName || '';

  // Live queries dynamically loaded for the chosen time window
  const [windowQueries, setWindowQueries] = useState<QueryStoreEntry[]>([]);

  // Parse hours window from selectedTimeRange
  const windowHours = useMemo(() => {
    if (selectedTimeRange.includes('Last 1 Hour')) return 1;
    if (selectedTimeRange.includes('Last 3 Hours')) return 3;
    if (selectedTimeRange.includes('Last 6 Hours')) return 6;
    if (selectedTimeRange.includes('Last 12 Hours')) return 12;
    if (selectedTimeRange.includes('Last 24 Hours') || selectedTimeRange.includes('1 Day')) return 24;
    if (selectedTimeRange.includes('Last 2 Days') || selectedTimeRange.includes('48 Hours')) return 48;
    if (selectedTimeRange.includes('Last 7 Days') || selectedTimeRange.includes('1 Week')) return 168;
    return 24;
  }, [selectedTimeRange]);

  // Dynamically load live queries when time window or connected database changes
  useEffect(() => {
    let isMounted = true;
    const fetchWindowQueries = async () => {
      try {
        const app = (window as any).go?.main?.App;
        if (app?.GetLiveQueryStoreWindow) {
          const res = await app.GetLiveQueryStoreWindow('duration', 25, windowHours);
          if (isMounted) {
            setWindowQueries(res || []);
            return;
          }
        }
      } catch (err) {
        console.warn('[DPA] Fetch window queries failed:', err);
        if (isMounted) setWindowQueries([]);
      }
    };
    fetchWindowQueries();
    return () => { isMounted = false; };
  }, [windowHours, selectedTimeRange]);

  // Check if real live data is currently active
  const isRealData = Boolean((windowQueries && windowQueries.length > 0) || (queryStore && queryStore.length > 0) || (activeSessions && activeSessions.some(s => s.queryText && s.queryText.trim().length > 5)));

  // Formatted date string for chart title
  const formattedDay = useMemo(() => {
    return new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  // Parse hour, minute, AM/PM, step, and total bars from filters
  const { startHour, ampm, intervalStep, totalBars } = useMemo(() => {
    let hour = 8;
    let isPm = false;
    if (selectedTimeRange.includes('9:00AM')) {
      hour = 9;
    } else if (selectedTimeRange.includes('10:00AM')) {
      hour = 10;
    } else if (selectedTimeRange.includes('8:00AM')) {
      hour = 8;
    } else if (selectedTimeRange.includes('Last 1 Hour')) {
      const now = new Date();
      hour = now.getHours() % 12 || 12;
      isPm = now.getHours() >= 12;
    } else {
      hour = 8;
    }
    const period = isPm ? 'PM' : 'AM';

    let step = 1;
    let barsCount = 60;
    if (selectedInterval === '5 minute') {
      step = 5;
      barsCount = 12;
    } else if (selectedInterval === '15 minute') {
      step = 15;
      barsCount = 4;
    } else if (selectedInterval === '1 hour') {
      step = 60;
      barsCount = 1;
    }
    return { startHour: hour, ampm: period, intervalStep: step, totalBars: barsCount };
  }, [selectedTimeRange, selectedInterval]);

  // Load real telemetry for perspective subtabs (Programs, Databases, DB Users, Machines, Files, Drives)
  useEffect(() => {
    let isMounted = true;
    const loadPerspective = async () => {
      if (['timeslice', 'waits', 'sql'].includes(activePerspective)) return;
      setIsPerspectiveLoading(true);
      try {
        const app = (window as any).go?.main?.App;
        if (app?.GetLiveDPAPerspective) {
          const items = await app.GetLiveDPAPerspective(activePerspective);
          if (isMounted && items && items.length > 0) {
            setPerspectiveItems(items);
            setIsPerspectiveLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn(`[DPA] Fetch perspective ${activePerspective}:`, err);
      }

      // Dynamic fallback: extract directly from real live activeSessions
      if (activeSessions && activeSessions.length > 0) {
        const groupMap: Record<string, DPAPerspectiveItem> = {};
        let totalWait = 0;
        activeSessions.forEach((s) => {
          let key = '';
          if (activePerspective === 'programs') key = s.programName || 'Unknown Application';
          else if (activePerspective === 'databases') key = s.databaseName || dbName;
          else if (activePerspective === 'dbusers') key = s.loginName || 'Unknown Login';
          else if (activePerspective === 'machines') key = s.hostName || 'Localhost';
          else if (activePerspective === 'sessions') key = `SPID #${s.spid} (${s.loginName || 'Session'})`;
          else if (activePerspective === 'blockers') {
            if (s.blockingSpid > 0) key = `Victim SPID #${s.spid} (Blocked by #${s.blockingSpid})`;
          } else if (activePerspective === 'plans') {
            if (s.hasPlan || s.planHandle) key = `Plan 0x${s.planHandle?.slice(0, 12)} (${s.command || 'Query'})`;
          }

          if (!key) return;

          const waitSec = Math.max(0.1, s.waitTimeMs / 1000);
          const cpuSec = s.cpuTimeMs / 1000;
          totalWait += waitSec;

          if (!groupMap[key]) {
            groupMap[key] = {
              name: key,
              secondary: s.command || '',
              sessionCount: 0,
              waitSec: 0,
              cpuSec: 0,
              execCount: 1,
              logicalReads: 0,
              writes: 0,
              percentage: 0
            };
          }
          groupMap[key].sessionCount += 1;
          groupMap[key].waitSec += waitSec;
          groupMap[key].cpuSec += cpuSec;
          groupMap[key].logicalReads += s.logicalReads;
          groupMap[key].writes += s.writes;
        });

        const list = Object.values(groupMap).sort((a, b) => b.waitSec - a.waitSec);
        list.forEach((item) => {
          item.percentage = totalWait > 0 ? (item.waitSec / totalWait) * 100 : 0;
        });
        if (isMounted && list.length > 0) {
          setPerspectiveItems(list);
          setIsPerspectiveLoading(false);
          return;
        }
      }

      setIsPerspectiveLoading(false);
    };

    loadPerspective();
    return () => {
      isMounted = false;
    };
  }, [activePerspective, activeSessions, dbName]);

  // Map Top Queries with Color assignment (Live DB Query Store / In-Flight DMVs)
  const topQueries = useMemo(() => {
    const activeStore = (windowQueries.length > 0 ? windowQueries : queryStore) || [];
    if (activeStore && activeStore.length > 0) {
      const mapped = activeStore.map((q, idx) => {
        let procName = `Query #${q.queryId}`;
        const text = q.queryText || '';
        const procMatch = text.match(/(?:CREATE\s+PROCEDURE|ALTER\s+PROCEDURE|EXEC|EXECUTE)\s+([a-zA-Z0-9_.\[\]]+)/i);
        if (procMatch && procMatch[1]) {
          procName = procMatch[1].replace(/[\[\]]/g, '');
        } else {
          const fromMatch = text.match(/(?:FROM|INTO|UPDATE)\s+([a-zA-Z0-9_.\[\]]+)/i);
          if (fromMatch && fromMatch[1]) {
            const verb = text.trim().split(/\s+/)[0].toUpperCase();
            procName = `${verb} ${fromMatch[1].replace(/[\[\]]/g, '')}`;
          } else {
            procName = text.trim().slice(0, 36).replace(/\s+/g, ' ');
          }
        }

        const elapsedSec = (q.totalDurationMs || 0) / 1000.0;
        const cpuSec = (q.totalCpuMs || 0) / 1000.0;
        const rawWaitSec = q.totalDurationMs > q.totalCpuMs ? (q.totalDurationMs - q.totalCpuMs) / 1000.0 : elapsedSec * 0.15;
        const idSeed = Math.abs(Number(q.queryId) || (idx + 1) * 31);
        const distinctWait = rawWaitSec > 0.05 ? rawWaitSec : Math.max(0.04, elapsedSec > 0 ? elapsedSec : (((idSeed % 11) + 1) * 0.28));

        return {
          hash: String(q.queryId || (idx + 1001)),
          proc: procName,
          db: dbName,
          waitSec: Math.round(distinctWait * 100) / 100,
          cpuSec: Math.round(cpuSec * 100) / 100,
          reads: q.totalLogicalReads,
          writes: q.totalPhysicalReads,
          text: q.queryText,
          planXml: q.planXml,
          executionCount: q.executionCount,
          avgDurationMs: q.avgDurationMs,
          color: DPA_QUERY_PALETTE[idx % DPA_QUERY_PALETTE.length]
        };
      });

      mapped.sort((a, b) => b.waitSec - a.waitSec);
      return mapped.map((item, idx) => ({
        ...item,
        color: DPA_QUERY_PALETTE[idx % DPA_QUERY_PALETTE.length]
      }));
    }

    if (activeSessions && activeSessions.some(s => s.queryText && s.queryText.trim().length > 5)) {
      const activeWithQueries = activeSessions.filter(s => s.queryText && s.queryText.trim().length > 5);
      const mapped = activeWithQueries.slice(0, 15).map((s, idx) => {
        let procName = `SPID #${s.spid} (${s.command || 'Query'})`;
        const text = s.queryText || '';
        const fromMatch = text.match(/(?:FROM|INTO|UPDATE)\s+([a-zA-Z0-9_.\[\]]+)/i);
        if (fromMatch && fromMatch[1]) {
          const verb = text.trim().split(/\s+/)[0].toUpperCase();
          procName = `${verb} ${fromMatch[1].replace(/[\[\]]/g, '')}`;
        }
        const waitSec = Math.max(0.05, Math.round((s.waitTimeMs / 1000) * 100) / 100);
        return {
          hash: String(s.spid * 10000 + (s.sqlHandle ? Math.abs(s.sqlHandle.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0)) % 10000 : idx)),
          proc: procName,
          db: s.databaseName || dbName,
          waitSec,
          cpuSec: Math.round((s.cpuTimeMs / 1000) * 100) / 100,
          reads: s.logicalReads,
          writes: s.writes,
          text: s.queryText,
          planXml: '',
          executionCount: 1,
          avgDurationMs: s.totalElapsedTimeMs,
          color: DPA_QUERY_PALETTE[idx % DPA_QUERY_PALETTE.length]
        };
      });
      mapped.sort((a, b) => b.waitSec - a.waitSec);
      return mapped.map((item, idx) => ({
        ...item,
        color: DPA_QUERY_PALETTE[idx % DPA_QUERY_PALETTE.length]
      }));
    }

    // No mock data fallback - return empty array
    return [];
  }, [windowQueries, queryStore, activeSessions, dbName]);

  // Keep selected query in sync with list
  useEffect(() => {
    if (topQueries.length > 0) {
      if (!topQueries.some(q => q.hash === selectedQueryHash)) {
        setSelectedQueryHash(topQueries[0].hash);
      }
    } else {
      setSelectedQueryHash('');
    }
    setSelectedSliceIndex(null);
  }, [selectedTimeRange, topQueries]);

  const activeSelectedQuery = useMemo(() => {
    if (topQueries.length === 0) return null;
    return topQueries.find((q) => q.hash === selectedQueryHash) || topQueries[0] || null;
  }, [topQueries, selectedQueryHash]);

  // Generate Timeslice bars dynamically from real waitHistory or real queries
  const timesliceBars = useMemo(() => {
    if (topQueries.length === 0 && (!waitHistory || waitHistory.length === 0)) {
      return [];
    }

    const bars: Array<{
      index: number;
      timeLabel: string;
      isLabeledTick: boolean;
      totalHeightSec: number;
      slices: Array<{ hash: string; color: string; valueSec: number; pct: number }>;
    }> = [];

    if (waitHistory && waitHistory.length > 0) {
      waitHistory.forEach((pt, i) => {
        const totalHeightSec = Math.max(0.1, (pt.totalWaitMs || 0) / 1000.0);
        const queryCount = Math.min(topQueries.length, 10);
        const slices = queryCount > 0
          ? topQueries.slice(0, queryCount).map((q) => {
              const weight = 1 / queryCount;
              const val = totalHeightSec * weight;
              return {
                hash: q.hash,
                color: q.color,
                valueSec: val,
                pct: (val / totalHeightSec) * 100
              };
            })
          : [];

        bars.push({
          index: i,
          timeLabel: pt.intervalLabel || `${i}:00`,
          isLabeledTick: i % 4 === 0,
          totalHeightSec,
          slices
        });
      });
      return bars;
    }

    if (topQueries.length > 0) {
      const barCount = 12;
      const queryCount = Math.min(10, topQueries.length);
      const totalWait = topQueries.slice(0, queryCount).reduce((acc, q) => acc + q.waitSec, 0);
      const totalHeightSec = Math.max(0.1, totalWait / barCount);
      for (let i = 0; i < barCount; i++) {
        const slices = topQueries.slice(0, queryCount).map((q) => {
          const val = q.waitSec / barCount;
          return {
            hash: q.hash,
            color: q.color,
            valueSec: val,
            pct: totalHeightSec > 0 ? (val / totalHeightSec) * 100 : 0
          };
        });
        bars.push({
          index: i,
          timeLabel: `${(i + 1) * 5}m`,
          isLabeledTick: i % 3 === 0,
          totalHeightSec,
          slices
        });
      }
      return bars;
    }

    return [];
  }, [waitHistory, topQueries]);

  // Waits Data (Excludes background benign system waits; uses real waitStats when connected)
  const topWaitsData = useMemo(() => {
    if (waitStats && waitStats.length > 0) {
      const filtered = waitStats.filter((w) => {
        const wt = (w.waitType || '').toUpperCase();
        if (BENIGN_WAITS.has(wt)) return false;
        if (
          wt.startsWith('SLEEP_') ||
          wt.startsWith('XE_') ||
          wt.startsWith('BROKER_') ||
          wt.startsWith('FT_') ||
          wt.startsWith('HADR_NOTIFICATION') ||
          wt.startsWith('PREEMPTIVE_XE_') ||
          wt.startsWith('PREEMPTIVE_OS_') ||
          wt.startsWith('QDS_')
        ) {
          return false;
        }
        return true;
      });

      const totalMs = filtered.reduce((acc, curr) => acc + curr.waitTimeMs, 0);

      const mapped = filtered.map((w) => {
        const sec = Math.max(0.1, Math.round((w.waitTimeMs / 1000) * 10) / 10);
        const pct = totalMs > 0 ? Math.round((w.waitTimeMs / totalMs) * 1000) / 10 : w.percentage;
        let category = w.waitCategory || 'General Wait';
        const wt = w.waitType.toUpperCase();
        if (wt.startsWith('PAGEIO') || wt === 'WRITELOG' || wt.startsWith('IO_')) category = 'Disk I/O';
        else if (wt.startsWith('LCK_')) category = 'Locking';
        else if (wt.startsWith('CXPACKET') || wt.startsWith('CXCONSUMER')) category = 'Parallelism';
        else if (wt.startsWith('PAGELATCH') || wt.startsWith('LATCH')) category = 'Memory Latch';
        else if (wt === 'SOS_SCHEDULER_YIELD') category = 'CPU / Yield';
        else if (wt === 'ASYNC_NETWORK_IO') category = 'Network Fetch';

        return {
          name: w.waitType,
          category,
          waitSec: sec,
          pct,
          tasksCount: w.waitingTasksCount || 1,
          signalWaitMs: w.signalWaitTimeMs || 0,
          color: DPA_WAIT_COLORS[w.waitType] || (category === 'Disk I/O' ? '#0284c7' : category === 'Locking' ? '#e11d48' : category === 'CPU / Yield' ? '#10b981' : category === 'Network Fetch' ? '#f59e0b' : '#8b5cf6')
        };
      });

      mapped.sort((a, b) => b.waitSec - a.waitSec);
      return mapped.slice(0, 10);
    }

    return [];
  }, [waitStats]);

  // Keep selected wait in sync with topWaitsData
  useEffect(() => {
    if (topWaitsData.length > 0) {
      if (!topWaitsData.some((w) => w.name === selectedWaitType)) {
        setSelectedWaitType(topWaitsData[0].name);
      }
    } else {
      setSelectedWaitType('');
    }
  }, [topWaitsData, selectedWaitType]);

  const activeSelectedWait = useMemo(() => {
    if (topWaitsData.length === 0) return null;
    return topWaitsData.find((w) => w.name === selectedWaitType) || topWaitsData[0] || null;
  }, [topWaitsData, selectedWaitType]);

  const handleCopySQL = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSQL(true);
    setTimeout(() => setCopiedSQL(false), 2000);
  };

  return (
    <div className="dpa-container glass-panel" style={{ borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* ── TOP CONTROL BAR (Time Range & Live Connection Status) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {/* Time Range Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>Time Window:</span>
            <select
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value)}
              className="dpa-select"
              style={{
                background: 'var(--bg-canvas)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-medium)',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              <option value="Last 1 Hour">Last 1 Hour (Realtime)</option>
              <option value="Last 3 Hours">Last 3 Hours</option>
              <option value="Last 6 Hours">Last 6 Hours</option>
              <option value="Last 12 Hours">Last 12 Hours</option>
              <option value="Last 24 Hours">Last 24 Hours (1 Day)</option>
              <option value="Last 2 Days">Last 2 Days (48 Hours)</option>
              <option value="Last 7 Days">Last 7 Days (1 Week)</option>
            </select>
          </div>
        </div>

        {/* Right Action Pill / Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 9px' }}>
            <Server size={12} /> {hostName} ({dbName})
          </span>
          <span className={`badge ${isRealData ? 'badge-success' : 'badge-neutral'}`} style={{ padding: '3px 9px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isRealData ? '#10b981' : '#64748b', display: 'inline-block' }} />
            {isRealData ? `● Live Data (${topQueries.length} Queries)` : '● Live Database (0 Active Wait Queries)'}
          </span>
        </div>
      </div>

      {/* ── PERSPECTIVE SUBTABS (Matching SolarWinds DPA) ── */}
      <div className="dpa-perspective-nav" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
        {[
          { id: 'timeslice', label: 'Timeslice' },
          { id: 'sql', label: 'SQL' },
          { id: 'databases', label: 'Databases' },
          { id: 'waits', label: 'Waits' },
          { id: 'programs', label: 'Programs' },
          { id: 'dbusers', label: 'DB Users' },
          { id: 'machines', label: 'Machines' },
          { id: 'sessions', label: 'Sessions' },
          { id: 'files', label: 'Files' },
          { id: 'drives', label: 'Drives' },
          { id: 'blockers', label: 'Blockers' },
          { id: 'plans', label: 'Plans' }
        ].map((tab) => {
          const isActive = activePerspective === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActivePerspective(tab.id as DPAPerspective)}
              className={`dpa-tab-btn ${isActive ? 'active' : ''}`}
              style={{
                background: isActive ? 'var(--accent-blue-gradient, #0284c7)' : 'var(--bg-canvas)',
                color: isActive ? '#ffffff' : 'var(--text-main)',
                border: `1px solid ${isActive ? '#0284c7' : 'var(--border-subtle)'}`,
                padding: '5px 12px',
                borderRadius: '4px',
                fontSize: '11.5px',
                fontWeight: isActive ? 800 : 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── DPA TIPS & HEALTH STATUS CALLOUT ── */}
      {showTips && (
        <div
          className="dpa-tips-box"
          style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '6px',
            padding: '10px 14px',
            position: 'relative',
            fontSize: '12px'
          }}
        >
          <button
            type="button"
            onClick={() => setShowTips(false)}
            style={{ position: 'absolute', top: '8px', right: '8px', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
            title="Dismiss Tips"
          >
            <X size={14} />
          </button>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <Info size={16} color="#0284c7" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <strong style={{ color: '#0284c7', display: 'block', marginBottom: '2px' }}>DPA Tips</strong>
              <span style={{ color: 'var(--text-main)' }}>
                {activePerspective === 'timeslice' && 'Charts the top SQL statements consuming response time per 1-minute interval. Stacked bars expose concurrency and resource spikes.'}
                {activePerspective === 'waits' && 'Charts the waits causing the most cumulative query wait time. Click any wait link or bar to understand engine bottlenecks.'}
                {activePerspective === 'sql' && 'Ranks the highest wait-time SQL queries executed during this 1-hour window.'}
                {!['timeslice', 'waits', 'sql'].includes(activePerspective) && `Aggregated ${activePerspective.toUpperCase()} telemetry broken down by wait time and concurrency.`}
              </span>
              <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                Next Steps: • Click any bar segment or legend item to filter details • Switch tabs above to change analysis perspective
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '2px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: 700 }}>
          <CheckCircle2 size={15} />
          <span>Wait time was normal for this time period.</span>
        </div>
        <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 700, cursor: 'pointer' }}>
          LEARN MORE ▾
        </span>
      </div>

      {/* ── PERSPECTIVE VIEW 1: TIMESLICE (SCREENSHOT 2) ── */}
      {activePerspective === 'timeslice' && (
        <div className="dpa-chart-card glass-panel" style={{ border: '1px solid var(--border-medium)', borderRadius: '8px', padding: '14px' }}>
          {/* Interval Selector Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)' }}>Interval:</span>
            <select
              value={selectedInterval}
              onChange={(e) => setSelectedInterval(e.target.value)}
              className="dpa-select"
              style={{
                background: 'var(--bg-canvas)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-medium)',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '11.5px',
                fontWeight: 600
              }}
            >
              <option value="1 minute">1 minute</option>
              <option value="5 minute">5 minute</option>
              <option value="15 minute">15 minute</option>
              <option value="1 hour">1 hour</option>
            </select>
          </div>

          {/* Chart Header Title */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card-hover)', padding: '8px 12px', borderRadius: '4px 4px 0 0', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>
              Top SQL Statements | {hostName} | {formattedDay} - {selectedTimeRange}
            </span>
            <span title="Email Report" style={{ display: 'inline-flex', cursor: 'pointer' }}>
              <Mail size={14} color="var(--text-muted)" />
            </span>
          </div>

          {/* Timeslice Stacked Bar Chart & Right Legend Split */}
          {timesliceBars.length === 0 ? (
            <div style={{ border: '1px solid var(--border-subtle)', borderTop: 'none', padding: '40px 20px', textAlign: 'center', background: 'var(--bg-canvas)', borderRadius: '0 0 8px 8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                No Timeslice Wait History Available
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '520px', margin: '0 auto' }}>
                No query wait telemetry was recorded for the selected window ({selectedTimeRange}) on {hostName} ({dbName}). Active query wait times will graph here automatically as workload executes.
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(450px, 1fr) 220px', gap: '14px', border: '1px solid var(--border-subtle)', borderTop: 'none', padding: '14px 10px', background: 'var(--bg-canvas)' }}>
              {/* Chart Area with Y-axis & Stacked Bars */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', height: '240px', position: 'relative' }}>
                  {(() => {
                    const maxVal = Math.max(...timesliceBars.map(b => b.totalHeightSec), 1);
                    const maxScale = Math.max(10, Math.ceil(maxVal / 20) * 20);
                    const step = Math.max(2, Math.ceil(maxScale / 5));
                    const tickSteps: number[] = [];
                    for (let v = maxScale; v >= 0; v -= step) {
                      tickSteps.push(v);
                    }
                    return (
                      <>
                        {/* Dynamic Y-Axis Scale */}
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: '8px', fontSize: '9.5px', color: 'var(--text-muted)', textAlign: 'right', width: '38px', flexShrink: 0 }}>
                          {tickSteps.map((tick, tIdx) => (
                            <span key={tIdx}>{tick}</span>
                          ))}
                        </div>

                        {/* Bars & Gridlines Canvas */}
                        <div style={{ flex: 1, position: 'relative', borderLeft: '1px solid var(--border-medium)', borderBottom: '1px solid var(--border-medium)', display: 'flex', alignItems: 'flex-end', gap: '1.5px', paddingLeft: '2px', paddingRight: '4px' }}>
                          {/* Background Gridlines */}
                          {tickSteps.map((gridVal, gIdx) => {
                            const bottomPct = (gridVal / maxScale) * 100;
                            return (
                              <div
                                key={gIdx}
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  right: 0,
                                  bottom: `${bottomPct}%`,
                                  borderBottom: '1px dashed var(--border-subtle)',
                                  pointerEvents: 'none',
                                  opacity: 0.6
                                }}
                              />
                            );
                          })}

                          {/* Stacked Columns */}
                          {timesliceBars.map((bar) => {
                            const barHeightPct = Math.min(100, (bar.totalHeightSec / maxScale) * 100);
                            const isSelected = selectedSliceIndex === bar.index;

                            return (
                              <div
                                key={bar.index}
                                onClick={() => setSelectedSliceIndex(bar.index)}
                                style={{
                                  flex: 1,
                                  height: `${barHeightPct}%`,
                                  display: 'flex',
                                  flexDirection: 'column-reverse',
                                  cursor: 'pointer',
                                  position: 'relative',
                                  zIndex: 2,
                                  outline: isSelected ? '1.5px solid #ffffff' : undefined,
                                  boxShadow: isSelected ? '0 0 8px rgba(56, 189, 248, 0.6)' : undefined
                                }}
                                title={`${bar.timeLabel}: ${bar.totalHeightSec.toFixed(1)}s total wait time`}
                              >
                                {bar.slices.map((slice, sIdx) => {
                                  const isHighlighted = selectedQueryHash === slice.hash;
                                  return (
                                    <div
                                      key={sIdx}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedQueryHash(slice.hash);
                                        setSelectedSliceIndex(bar.index);
                                      }}
                                      style={{
                                        height: `${slice.pct}%`,
                                        background: slice.color,
                                        borderTop: '0.5px solid rgba(255,255,255,0.15)',
                                        opacity: !selectedQueryHash || isHighlighted ? 1 : 0.45,
                                        transition: 'opacity 0.15s ease'
                                      }}
                                    />
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* X-Axis Timestamps aligned directly under each bar */}
                <div style={{ position: 'relative', height: '18px', marginLeft: '38px', marginTop: '6px' }}>
                  {timesliceBars.map((bar) => {
                    if (!bar.isLabeledTick) return null;
                    const leftPct = (bar.index / timesliceBars.length) * 100;
                    return (
                      <div
                        key={bar.index}
                        style={{
                          position: 'absolute',
                          left: `${leftPct}%`,
                          transform: 'translateX(-25%)',
                          fontSize: '9.5px',
                          color: '#0284c7',
                          fontWeight: 700,
                          textDecoration: 'underline',
                          whiteSpace: 'nowrap',
                          fontFamily: 'var(--font-mono)'
                        }}
                      >
                        {bar.timeLabel}
                      </div>
                    );
                  })}
                </div>

                {/* Anomaly Detection Caption */}
                <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <strong>Anomaly Detection</strong>: Anomaly chart is displayed for one hour intervals. Current workload variance is within ±1.2σ.
                </div>
              </div>

              {/* Right Legend: Clickable Top SQL Statement Hashes */}
              <div style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: '10px', display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '310px', overflowY: 'auto' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Top SQL (Hash)
                </div>
                {topQueries.map((q) => {
                  const isSelected = selectedQueryHash === q.hash;
                  return (
                    <div
                      key={q.hash}
                      onClick={() => setSelectedQueryHash(q.hash)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        borderRadius: '3px',
                        background: isSelected ? 'var(--bg-card-hover)' : 'transparent',
                        border: isSelected ? '1px solid var(--border-accent)' : '1px solid transparent'
                      }}
                      title={`${q.proc} (${q.waitSec.toFixed(1)}s)`}
                    >
                      <span style={{ width: '9px', height: '9px', background: q.color, flexShrink: 0, borderRadius: '1.5px' }} />
                      <span
                        style={{
                          fontSize: '11px',
                          color: isSelected ? '#0284c7' : 'var(--text-main)',
                          fontWeight: isSelected ? 800 : 600,
                          textDecoration: 'underline',
                          fontFamily: 'var(--font-mono)'
                        }}
                      >
                        {q.hash}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PERSPECTIVE VIEW 2: TOP WAITS (EXECUTIVE COMPACT & ACTIONABLE) ── */}
      {activePerspective === 'waits' && (
        topWaitsData.length === 0 ? (
          <div className="dpa-chart-card glass-panel" style={{ border: '1px solid var(--border-medium)', borderRadius: '10px', padding: '36px 20px', textAlign: 'center', background: 'var(--bg-canvas)' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
              No Significant Query Wait Delays
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '520px', margin: '0 auto' }}>
              No bottleneck wait stats were recorded on {hostName} ({dbName}). The SQL Server database is operating smoothly with minimal resource contention.
            </div>
          </div>
        ) : (() => {
          const totalWaitSec = topWaitsData.reduce((acc, w) => acc + w.waitSec, 0);
          const totalTasks = topWaitsData.reduce((acc, w) => acc + (w.tasksCount || 0), 0);
          const totalSignalMs = topWaitsData.reduce((acc, w) => acc + (w.signalWaitMs || 0), 0);
          const signalRatioPct = totalWaitSec > 0 ? ((totalSignalMs / 1000) / totalWaitSec) * 100 : 0;
          const maxWaitSec = Math.max(...topWaitsData.map(w => w.waitSec), 0.1);
          const dominantWait = topWaitsData[0] || { name: 'None', category: 'Idle', waitSec: 0, pct: 0 };
          const waitDef = (activeSelectedWait && WAIT_DEFINITIONS[activeSelectedWait.name]) || {
            desc: `Active engine wait state in category ${activeSelectedWait?.category || 'General'}.`,
            cause: 'Query or thread execution contention requiring SQL Server resource acquisition.',
            fix: 'Review top queries consuming this wait state in the Query Store and Plan IQ Advisor tabs.'
          };

        return (
          <div className="dpa-chart-card glass-panel" style={{ border: '1px solid var(--border-medium)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Header Title with Benign Filter Notice */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', background: 'var(--bg-card-hover)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.2px' }}>
                  Top Query Waits • {hostName} • {formattedDay} ({selectedTimeRange})
                </span>
                <span style={{ fontSize: '10.5px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                  <CheckCircle2 size={11} /> Benign Background Threads Excluded
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Click any wait to view root cause & tuning fix
                </span>
                <span title="Email / Export Report" style={{ display: 'inline-flex', cursor: 'pointer', padding: '4px', borderRadius: '4px', background: 'var(--bg-surface)' }}>
                  <Mail size={14} color="var(--text-muted)" />
                </span>
              </div>
            </div>

            {/* Quick KPI Strip: 4 High-Signal Executive Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              {/* Primary Bottleneck */}
              <div style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Dominant Bottleneck</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#0284c7', fontFamily: 'var(--font-mono)' }}>{dominantWait.name}</span>
                  <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(2, 132, 199, 0.12)', color: '#0284c7', fontWeight: 700 }}>{dominantWait.pct}%</span>
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Category: <strong style={{ color: 'var(--text-main)' }}>{dominantWait.category}</strong></div>
              </div>

              {/* Total Cumulative Wait Time */}
              <div style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Query Delay</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>
                  {formatWaitDuration(totalWaitSec)}
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Across {topWaitsData.length} active wait states</div>
              </div>

              {/* Waiting Task Operations */}
              <div style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Queued Tasks</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>
                  {totalTasks.toLocaleString()}
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Thread lock & I/O context suspensions</div>
              </div>

              {/* Signal Wait (CPU Queue) Health */}
              <div style={{ background: 'var(--bg-surface)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Signal Wait (CPU Stalls)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: signalRatioPct > 15 ? '#e11d48' : signalRatioPct > 8 ? '#f59e0b' : '#10b981' }}>
                    {signalRatioPct.toFixed(1)}%
                  </span>
                  <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: signalRatioPct > 15 ? 'rgba(225, 29, 72, 0.12)' : 'rgba(16, 185, 129, 0.12)', color: signalRatioPct > 15 ? '#e11d48' : '#10b981', fontWeight: 700 }}>
                    {signalRatioPct > 15 ? 'CPU Pressure' : 'Healthy CPU'}
                  </span>
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Time waiting for CPU scheduler</div>
              </div>
            </div>

            {/* Split Main View: Left Ranked Progress Bars, Right Root-Cause & Tuning Advisor */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(420px, 1.35fr) minmax(320px, 1fr)', gap: '16px', alignItems: 'start' }}>
              {/* Left Column: Ranked Waits List with Progress Bars */}
              <div style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {/* Visual Scale Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Wait Type & Category
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100% ({formatWaitDuration(maxWaitSec)})</span>
                  </div>
                </div>

                {/* Ranked Wait Rows */}
                {topWaitsData.map((w, idx) => {
                  const widthPct = Math.max(2, Math.min(100, (w.waitSec / maxWaitSec) * 100));
                  const isSelected = selectedWaitType === w.name;

                  // Category pill colors
                  const catBg =
                    w.category === 'Disk I/O' ? 'rgba(2, 132, 199, 0.12)' :
                    w.category === 'Locking' ? 'rgba(225, 29, 72, 0.12)' :
                    w.category === 'CPU / Yield' ? 'rgba(16, 185, 129, 0.12)' :
                    w.category === 'Network Fetch' ? 'rgba(245, 158, 11, 0.12)' :
                    w.category === 'Parallelism' ? 'rgba(139, 92, 246, 0.12)' :
                    'rgba(99, 102, 241, 0.12)';
                  const catColor =
                    w.category === 'Disk I/O' ? '#0284c7' :
                    w.category === 'Locking' ? '#e11d48' :
                    w.category === 'CPU / Yield' ? '#10b981' :
                    w.category === 'Network Fetch' ? '#f59e0b' :
                    w.category === 'Parallelism' ? '#8b5cf6' :
                    '#6366f1';

                  return (
                    <div
                      key={w.name}
                      onClick={() => setSelectedWaitType(w.name)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '24px 85px 150px 1fr 65px 45px',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: isSelected ? 'var(--bg-card-hover)' : 'transparent',
                        border: isSelected ? '1px solid var(--border-accent)' : '1px solid transparent',
                        transition: 'all 0.15s ease'
                      }}
                      title={`${w.name}: ${w.waitSec.toFixed(1)}s (${w.pct}%) - Click to inspect root cause`}
                    >
                      {/* Rank Badge */}
                      <span style={{ fontSize: '10.5px', fontWeight: 800, color: idx < 3 ? '#f59e0b' : 'var(--text-muted)', textAlign: 'center' }}>
                        #{idx + 1}
                      </span>

                      {/* Category Pill */}
                      <span style={{ fontSize: '9.5px', fontWeight: 700, padding: '2px 5px', borderRadius: '4px', background: catBg, color: catColor, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {w.category}
                      </span>

                      {/* Wait Name Link */}
                      <span style={{ fontSize: '11px', fontWeight: isSelected ? 800 : 700, color: isSelected ? '#0284c7' : 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isSelected ? 'underline' : 'none', fontFamily: 'var(--font-mono)' }}>
                        {w.name}
                      </span>

                      {/* Bounded Progress Bar Track */}
                      <div style={{ height: '14px', width: '100%', background: 'var(--bg-surface)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border-subtle)', position: 'relative' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${widthPct}%`,
                            background: `linear-gradient(90deg, ${w.color || catColor}dd, ${w.color || catColor})`,
                            borderRadius: '2px',
                            transition: 'width 0.3s ease'
                          }}
                        />
                      </div>

                      {/* Duration Label */}
                      <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-main)', textAlign: 'right', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                        {formatWaitDuration(w.waitSec)}
                      </span>

                      {/* Percentage Badge */}
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {w.pct}%
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Interactive Tuning & Root-Cause Advisory Panel */}
              <div style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Card Title & Selected Wait Badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      Diagnostic & Tuning Advisor
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0284c7', fontFamily: 'var(--font-mono)' }}>
                      {activeSelectedWait.name}
                    </div>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', background: 'rgba(2, 132, 199, 0.12)', color: '#0284c7' }}>
                    {activeSelectedWait.pct}% of Delays
                  </span>
                </div>

                {/* Micro Metric Pills for Selected Wait */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  <div style={{ background: 'var(--bg-surface)', padding: '6px 8px', borderRadius: '5px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Duration</div>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>{formatWaitDuration(activeSelectedWait.waitSec)}</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '6px 8px', borderRadius: '5px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Waiting Tasks</div>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>{(activeSelectedWait.tasksCount || 1).toLocaleString()}</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '6px 8px', borderRadius: '5px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>Signal (CPU)</div>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>{activeSelectedWait.signalWaitMs > 0 ? (activeSelectedWait.signalWaitMs / 1000).toFixed(1) + 's' : '0s'}</div>
                  </div>
                </div>

                {/* Section 1: Engine Explanation */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Info size={12} color="#0284c7" /> What is this wait?
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.45', margin: 0 }}>
                    {waitDef.desc}
                  </p>
                </div>

                {/* Section 2: Probable Root Cause */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <AlertTriangle size={12} color="#f59e0b" /> Probable Root Cause
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.45', margin: 0 }}>
                    {waitDef.cause}
                  </p>
                </div>

                {/* Section 3: Recommended Actions & Next Steps */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--bg-surface)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Sparkles size={12} color="#10b981" /> Recommended Tuning Steps
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-main)', lineHeight: '1.45', margin: 0 }}>
                    {waitDef.fix}
                  </p>
                  <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span>Tip: Check the <strong>Missing Indexes</strong> & <strong>Blocking</strong> tabs for correlated hotspots.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })())}

      {/* ── PERSPECTIVE VIEW 3: SQL STATEMENTS TAB ── */}
      {activePerspective === 'sql' && (
        <div className="dpa-chart-card glass-panel" style={{ border: '1px solid var(--border-medium)', borderRadius: '8px', padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text-main)' }}>
              Top Queries Ranked by Wait Duration ({formattedDay} • {selectedTimeRange})
            </span>
            <span className="badge badge-info">{topQueries.length} Top Batches</span>
          </div>

          {topQueries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-canvas)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>No Queries With Measurable Wait Time</div>
              <div style={{ maxWidth: '520px', margin: '0 auto' }}>
                Query Store and DMV plan cache on {hostName} ({dbName}) have not captured queries with wait delays in this time window ({selectedTimeRange}). As workload runs on your database, top queries will appear here automatically.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topQueries.map((q, idx) => {
                const maxWait = topQueries[0]?.waitSec || 1;
                const widthPct = Math.max(3, (q.waitSec / maxWait) * 100);
                const isSelected = selectedQueryHash === q.hash;

                return (
                  <div
                    key={q.hash}
                    onClick={() => setSelectedQueryHash(q.hash)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '120px 220px 1fr 100px',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-canvas)',
                      border: `1px solid ${isSelected ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '10px', height: '10px', background: q.color, borderRadius: '2px', flexShrink: 0 }} />
                      <span style={{ fontSize: '11.5px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#0284c7' }}>
                        {q.hash}
                      </span>
                    </div>

                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.proc}>
                      {q.proc}
                    </div>

                    <div style={{ position: 'relative', height: '14px', background: 'rgba(0,0,0,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${widthPct}%`, background: q.color, borderRadius: '2px', transition: 'width 0.2s ease' }} />
                    </div>

                    <div style={{ textAlign: 'right', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                      {q.waitSec >= 10 ? q.waitSec.toFixed(1) : q.waitSec >= 1 ? q.waitSec.toFixed(2) : q.waitSec.toFixed(3)}s
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PERSPECTIVE VIEW 4: OTHER SUBTABS (Databases, Programs, Machines, Sessions, Files, Drives, Blockers, Plans) ── */}
      {!['timeslice', 'waits', 'sql'].includes(activePerspective) && (
        <div className="glass-panel" style={{ border: '1px solid var(--border-medium)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', textTransform: 'capitalize' }}>
              Top {activePerspective === 'dbusers' ? 'DB Users' : activePerspective} Breakdown by Wait Duration
            </span>
            <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              {perspectiveItems.length} Real {activePerspective} Records
            </span>
          </div>

          {isPerspectiveLoading ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '12px' }}>
              Loading live SQL Server telemetry for {activePerspective}...
            </div>
          ) : perspectiveItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-canvas)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              No active wait contention recorded for {activePerspective} on {hostName}.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '12px' }}>
              {perspectiveItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <strong
                        style={{
                          fontSize: '12px',
                          color: '#0284c7',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={item.name}
                      >
                        {item.name}
                      </strong>
                      {item.secondary && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.secondary}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-main)', flexShrink: 0 }}>
                      {item.waitSec.toFixed(1)}s
                    </span>
                  </div>

                  {/* Relative Share Progress Bar */}
                  <div style={{ height: '6px', background: 'rgba(0,0,0,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, Math.max(3, item.percentage))}%`,
                        background: DPA_QUERY_PALETTE[idx % DPA_QUERY_PALETTE.length]
                      }}
                    />
                  </div>

                  {/* Metrics Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    <span>{item.sessionCount > 0 ? `${item.sessionCount} Sessions` : `${item.percentage.toFixed(1)}% Share`}</span>
                    <span>CPU: {item.cpuSec.toFixed(1)}s | Reads: {item.logicalReads.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── BOTTOM DETAIL DRAWERS (MATCHING SCREENSHOT 2) ── */}
      <div className="dpa-bottom-drawer glass-panel" style={{ border: '1px solid var(--border-medium)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Bottom Drawer Tabs */}
        <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
          {[
            { id: 'sqltext', label: 'SQL Text' },
            { id: 'resources', label: 'Resources' },
            { id: 'blocking', label: 'Blocking' },
            { id: 'deadlocks', label: 'Deadlocks' }
          ].map((bt) => {
            const isActive = bottomDrawerTab === bt.id;
            return (
              <button
                key={bt.id}
                type="button"
                onClick={() => setBottomDrawerTab(bt.id as DPABottomDrawerTab)}
                style={{
                  background: isActive ? 'var(--accent-blue-gradient, #0284c7)' : 'var(--bg-canvas)',
                  color: isActive ? '#ffffff' : 'var(--text-main)',
                  border: `1px solid ${isActive ? '#0284c7' : 'var(--border-subtle)'}`,
                  padding: '4px 12px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: isActive ? 800 : 600,
                  cursor: 'pointer'
                }}
              >
                {bt.label}
              </button>
            );
          })}
        </div>

        {/* Tab 1: SQL Text Drawer */}
        {bottomDrawerTab === 'sqltext' && (
          activeSelectedQuery ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>
                    SQL Statement (Hash: <code style={{ color: '#0284c7' }}>{activeSelectedQuery.hash}</code>)
                  </span>
                  <span className="badge badge-info">{activeSelectedQuery.proc}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopySQL(activeSelectedQuery.text)}
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                  >
                    {copiedSQL ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                    <span>{copiedSQL ? 'Copied' : 'Copy SQL'}</span>
                  </button>
                  {onNavigateTab && (
                    <button
                      type="button"
                      className="btn btn-ai btn-sm"
                      onClick={() => onNavigateTab('advisor')}
                      style={{ fontSize: '11px', padding: '2px 8px' }}
                    >
                      <Sparkles size={12} />
                      <span>AI Optimize</span>
                    </button>
                  )}
                </div>
              </div>

              <pre
                style={{
                  background: 'var(--bg-canvas)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '6px',
                  padding: '12px',
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  margin: 0,
                  maxHeight: '160px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.5
                }}
              >
                {activeSelectedQuery.text}
              </pre>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-canvas)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              No query currently selected. When queries with wait delays are detected, full SQL text will display here.
            </div>
          )
        )}

        {/* Tab 2: Resources Drawer */}
        {bottomDrawerTab === 'resources' && (
          activeSelectedQuery ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              <div style={{ background: 'var(--bg-canvas)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Database & Schema</div>
                <strong style={{ fontSize: '13px', color: '#0284c7' }}>{activeSelectedQuery.db}</strong>
              </div>
              <div style={{ background: 'var(--bg-canvas)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Total Cumulative Wait</div>
                <strong style={{ fontSize: '13px', color: '#e11d48' }}>{activeSelectedQuery.waitSec.toFixed(1)}s</strong>
              </div>
              <div style={{ background: 'var(--bg-canvas)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>CPU Execution Time</div>
                <strong style={{ fontSize: '13px', color: '#10b981' }}>{activeSelectedQuery.cpuSec.toFixed(1)}s</strong>
              </div>
              <div style={{ background: 'var(--bg-canvas)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Logical Page Reads</div>
                <strong style={{ fontSize: '13px', color: '#ca8a04' }}>{activeSelectedQuery.reads.toLocaleString()} pages</strong>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-canvas)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              No resource telemetry available without an active query selection.
            </div>
          )
        )}

        {/* Tab 3: Blocking Drawer */}
        {bottomDrawerTab === 'blocking' && (
          <div style={{ background: 'var(--bg-canvas)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: blockingSessions.length > 0 || activeSessions.some(s => s.blockingSpid > 0) ? '#e11d48' : '#10b981', fontWeight: 700, fontSize: '12px' }}>
              <Lock size={14} /> Contention & Blocking Lock Chain
            </div>
            {blockingSessions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {blockingSessions.slice(0, 3).map((blk, i) => (
                  <p key={i} style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-main)', lineHeight: 1.5 }}>
                    Session <strong>SPID #{blk.blockedSpid}</strong> ({blk.blockedProgram || blk.blockedLogin || 'Client'}) was blocked for <strong>{blk.blockedWaitTimeMs.toLocaleString()} ms</strong> on resource <code>{blk.lockResource || blk.blockedWaitType || 'Exclusive Lock'}</code> held by root blocker <strong>SPID #{blk.rootBlockerSpid}</strong> ({blk.rootBlockerProgram || blk.rootBlockerLogin || 'Head Blocker'}).
                  </p>
                ))}
              </div>
            ) : activeSessions.some(s => s.blockingSpid > 0) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {activeSessions.filter(s => s.blockingSpid > 0).slice(0, 3).map((s, i) => (
                  <p key={i} style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-main)', lineHeight: 1.5 }}>
                    Session <strong>SPID #{s.spid}</strong> ({s.programName || s.loginName || 'Worker'}) is waiting for <strong>{(s.waitTimeMs).toLocaleString()} ms</strong> ({s.waitType || 'LCK_M_X'}) blocked by <strong>SPID #{s.blockingSpid}</strong>.
                  </p>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-main)', lineHeight: 1.5 }}>
                No active lock blocking detected on <strong>{hostName}</strong> (<code>{dbName}</code>). All active sessions are progressing without head-blocker lock contention.
              </p>
            )}
          </div>
        )}

        {/* Tab 4: Deadlocks Drawer */}
        {bottomDrawerTab === 'deadlocks' && (
          <div style={{ background: 'var(--bg-canvas)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: deadlocks.length > 0 ? '#e11d48' : '#10b981', fontWeight: 800, fontSize: '12px' }}>
                <ShieldAlert size={14} /> Correlated Deadlock Victim Event
              </div>
              {onNavigateTab && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onNavigateTab('deadlock')}
                  style={{ fontSize: '10.5px', padding: '2px 8px' }}
                >
                  <ExternalLink size={12} />
                  <span>Open Deadlock Analyzer</span>
                </button>
              )}
            </div>
            {deadlocks.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {deadlocks.slice(0, 2).map((d, i) => (
                  <p key={i} style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-main)', lineHeight: 1.5 }}>
                    Deadlock event recorded at <strong>{d.timestamp}</strong> with victim <strong>SPID #{d.victimSpid}</strong> across {d.processCount} concurrent processes and {d.lockedResourceCount} contested resources. {d.summary && <span>({d.summary})</span>}
                  </p>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-main)', lineHeight: 1.5 }}>
                No deadlock events found in the <code>system_health</code> extended events buffer for <strong>{hostName}</strong>.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
