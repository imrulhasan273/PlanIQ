import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Activity,
  Zap,
  Play,
  Pause,
  RefreshCw,
  Clock,
  Database,
  Cpu,
  Layers,
  ShieldAlert,
  Server,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  FileCode2,
  HardDrive,
  Eye,
  CheckCircle2,
  KeyRound,
  Filter,
  Plus,
  X,
  Search,
  ChevronDown,
  SlidersHorizontal,
  Copy,
  Check,
  AlertOctagon,
  Terminal,
  ListFilter,
  Flame,
  GitCommit,
  Sparkles,
  Info,
  Moon,
  BarChart3,
  HelpCircle,
  FolderTree,
  Trash2
} from 'lucide-react';
import {
  ActiveSession,
  QueryStoreEntry,
  LiveDeadlockReport,
  ServerVitals,
  ConnectionStatus,
  LiveWaitStat,
  LiveBlockingSession,
  LiveMissingIndex,
  LiveTempDBUsage,
  ColumnFilter,
  IdleSession,
  PerformanceAdvisor,
  WaitTimeHistoryPoint,
  BufferPoolConsumer,
  UnusedIndex,
  DuplicateIndex
} from '../types/livedb';
import {
  GetLiveActiveSessions,
  GetLiveSessionPlan,
  GetLiveQueryStore,
  GetLiveDeadlocks,
  GetLiveServerVitals
} from '../../wailsjs/go/main/App';

interface LiveRadarTabProps {
  status: ConnectionStatus | null;
  onOpenConnectModal: () => void;
  onLoadPlanXML: (xml: string, name: string) => void;
  onLoadDeadlockXML: (xml: string) => void;
}

type SubTabType =
  | 'advisors'
  | 'sessions'
  | 'sleeping'
  | 'waithistory'
  | 'blocking'
  | 'waits'
  | 'querystore'
  | 'bufferpool'
  | 'indexes'
  | 'deadlocks'
  | 'tempdb'
  | 'vitals';

interface ColumnDef {
  id: string;
  label: string;
  defaultVisible: boolean;
  type: 'text' | 'number' | 'category';
}

const SESSION_COLUMNS: ColumnDef[] = [
  { id: 'spid', label: 'SPID', defaultVisible: true, type: 'number' },
  { id: 'status', label: 'Status', defaultVisible: true, type: 'category' },
  { id: 'command', label: 'Command', defaultVisible: true, type: 'category' },
  { id: 'databaseName', label: 'Database', defaultVisible: false, type: 'category' },
  { id: 'elapsed', label: 'Elapsed', defaultVisible: true, type: 'number' },
  { id: 'waitType', label: 'Wait Type', defaultVisible: true, type: 'category' },
  { id: 'cpu', label: 'CPU Time', defaultVisible: true, type: 'number' },
  { id: 'readsWrites', label: 'Reads / Writes', defaultVisible: true, type: 'number' },
  { id: 'memory', label: 'Memory Grant', defaultVisible: false, type: 'number' },
  { id: 'programHost', label: 'Program / Host', defaultVisible: true, type: 'text' },
  { id: 'login', label: 'Login User', defaultVisible: false, type: 'text' },
  { id: 'progress', label: 'Progress %', defaultVisible: false, type: 'number' },
  { id: 'queryPreview', label: 'Query Preview', defaultVisible: true, type: 'text' },
  { id: 'action', label: 'Action', defaultVisible: true, type: 'text' }
];

export const LiveRadarTab: React.FC<LiveRadarTabProps> = ({
  status,
  onOpenConnectModal,
  onLoadPlanXML,
  onLoadDeadlockXML,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>('sessions');

  // Live Data States
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [queryStoreEntries, setQueryStoreEntries] = useState<QueryStoreEntry[]>([]);
  const [deadlocks, setDeadlocks] = useState<LiveDeadlockReport[]>([]);
  const [vitals, setVitals] = useState<ServerVitals | null>(null);
  const [waitStats, setWaitStats] = useState<LiveWaitStat[]>([]);
  const [blockingSessions, setBlockingSessions] = useState<LiveBlockingSession[]>([]);
  const [missingIndexes, setMissingIndexes] = useState<LiveMissingIndex[]>([]);
  const [tempDbUsage, setTempDbUsage] = useState<LiveTempDBUsage[]>([]);
  const [idleSessions, setIdleSessions] = useState<IdleSession[]>([]);

  // Enterprise Observability States (SolarWinds DPA Engine)
  const [advisors, setAdvisors] = useState<PerformanceAdvisor[]>([]);
  const [advisorFilter, setAdvisorFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [advisorCategoryFilter, setAdvisorCategoryFilter] = useState<string>('all');
  const [advisorViewMode, setAdvisorViewMode] = useState<'hourly' | 'daily'>('hourly');
  const [advisorSelectedDay, setAdvisorSelectedDay] = useState<string>('all');
  const [advisorSelectedHour, setAdvisorSelectedHour] = useState<string>('all');
  const [expandedAdvisorId, setExpandedAdvisorId] = useState<string | null>(null);

  const [waitHistory, setWaitHistory] = useState<WaitTimeHistoryPoint[]>([]);
  const [waitGranularity, setWaitGranularity] = useState<'hourly' | 'daily'>('hourly');
  const [selectedHistoryPoint, setSelectedHistoryPoint] = useState<WaitTimeHistoryPoint | null>(null);

  const [bufferPool, setBufferPool] = useState<BufferPoolConsumer[]>([]);
  const [bufferPoolError, setBufferPoolError] = useState<string | null>(null);
  const [bufferLimit, setBufferLimit] = useState<number>(() => {
    const saved = localStorage.getItem('planiq_radar_buffer_limit');
    return saved ? parseInt(saved, 10) : 50;
  });
  const [bufferLimitInput, setBufferLimitInput] = useState<string>(bufferLimit.toString());

  const [indexSubTab, setIndexSubTab] = useState<'missing' | 'unused' | 'duplicate'>('missing');
  const [unusedIndexes, setUnusedIndexes] = useState<UnusedIndex[]>([]);
  const [duplicateIndexes, setDuplicateIndexes] = useState<DuplicateIndex[]>([]);
  const [unusedLimit, setUnusedLimit] = useState<number>(() => {
    const saved = localStorage.getItem('planiq_radar_unused_limit');
    return saved ? parseInt(saved, 10) : 30;
  });
  const [unusedLimitInput, setUnusedLimitInput] = useState<string>(unusedLimit.toString());

  // Sorting & Controls
  const [qsOrderBy, setQsOrderBy] = useState<'cpu' | 'duration' | 'reads' | 'spills'>('cpu');
  const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [selectedPlanLoading, setSelectedPlanLoading] = useState<string | null>(null);

  // Column Visibility State for Active Sessions
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    SESSION_COLUMNS.forEach((c) => {
      init[c.id] = c.defaultVisible;
    });
    return init;
  });
  const [showColPicker, setShowColPicker] = useState<boolean>(false);

  // Dynamic Multi-Column Filters for Active Sessions
  const [sessionFilters, setSessionFilters] = useState<ColumnFilter[]>([
    { id: 'f-1', columnId: 'status', operator: 'contains', value: '' }
  ]);

  // Dynamic Filters for Sleeping / Idle Sessions
  const [idleFilters, setIdleFilters] = useState<ColumnFilter[]>([
    { id: 'idl-1', columnId: 'status', operator: 'contains', value: '' }
  ]);

  // Dynamic Multi-Column Filters for Query Store
  const [qsFilters, setQsFilters] = useState<ColumnFilter[]>([
    { id: 'qs-1', columnId: 'queryText', operator: 'contains', value: '' }
  ]);

  // Dynamic Filters for Wait Stats
  const [waitCategoryFilter, setWaitCategoryFilter] = useState<string>('all');
  const [waitSearch, setWaitSearch] = useState<string>('');

  // Selected Session for 360° Detail Modal
  const [inspectSession, setInspectSession] = useState<any | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Helper to extract Day and Hour from advisor timestamp
  const parseAdvisorTimestamp = (ts: string) => {
    if (!ts) return { day: 'Today', hour: 'Current Hour', raw: '' };
    if (/^\d{4}-\d{2}-\d{2}/.test(ts)) {
      const parts = ts.split(' ');
      const datePart = parts[0];
      const timePart = parts[1] || '00:00';
      const hourPart = timePart.split(':')[0] + ':00';
      return { day: datePart, hour: hourPart, raw: ts };
    }
    if (ts.includes(' as of ')) {
      const [d, h] = ts.split(' as of ');
      return { day: d.trim(), hour: h.trim(), raw: ts };
    }
    return { day: 'Today', hour: ts, raw: ts };
  };

  const { uniqueAdvisorDays, uniqueAdvisorHours } = useMemo(() => {
    const daysSet = new Set<string>();
    const hoursSet = new Set<string>();
    advisors.forEach((adv) => {
      const { day, hour } = parseAdvisorTimestamp(adv.timestamp || '');
      if (day) daysSet.add(day);
      if (hour) hoursSet.add(hour);
    });
    return {
      uniqueAdvisorDays: Array.from(daysSet).sort(),
      uniqueAdvisorHours: Array.from(hoursSet).sort(),
    };
  }, [advisors]);

  // Aggregated wait points for Hourly vs Daily Wait Trend
  const displayWaitPoints = useMemo(() => {
    if (waitGranularity === 'hourly') return waitHistory;
    const dayMap: Record<string, WaitTimeHistoryPoint> = {};
    waitHistory.forEach((pt) => {
      const dayKey = pt.intervalLabel.split(' ')[0] || pt.intervalLabel;
      if (!dayMap[dayKey]) {
        dayMap[dayKey] = {
          intervalLabel: dayKey,
          totalWaitMs: 0,
          cpuWaitMs: 0,
          lockWaitMs: 0,
          ioWaitMs: 0,
          memoryWaitMs: 0,
          otherWaitMs: 0,
          executionCount: 0,
          isAnomaly: false,
          anomalyReason: ''
        };
      }
      dayMap[dayKey].totalWaitMs += pt.totalWaitMs;
      dayMap[dayKey].cpuWaitMs += pt.cpuWaitMs;
      dayMap[dayKey].lockWaitMs += pt.lockWaitMs;
      dayMap[dayKey].ioWaitMs += pt.ioWaitMs;
      dayMap[dayKey].memoryWaitMs += pt.memoryWaitMs;
      dayMap[dayKey].otherWaitMs += pt.otherWaitMs;
      dayMap[dayKey].executionCount += pt.executionCount;
      if (pt.isAnomaly) {
        dayMap[dayKey].isAnomaly = true;
        dayMap[dayKey].anomalyReason = pt.anomalyReason;
      }
    });
    return Object.values(dayMap);
  }, [waitHistory, waitGranularity]);

  const timerRef = useRef<any>(null);
  const isConnected = status && status.connected;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const formatDuration = (seconds?: number) => {
    const totalSec = Math.max(0, Math.floor(seconds ?? 0));
    if (totalSec < 60) return `${totalSec}s`;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  };

  // Configurable Row Limits with LocalStorage Persistence
  const [activeLimit, setActiveLimit] = useState<number>(() => {
    const saved = localStorage.getItem('planiq_radar_active_limit');
    return saved ? parseInt(saved, 10) : 200;
  });
  const [activeLimitInput, setActiveLimitInput] = useState<string>(activeLimit.toString());

  const [idleLimit, setIdleLimit] = useState<number>(() => {
    const saved = localStorage.getItem('planiq_radar_idle_limit');
    return saved ? parseInt(saved, 10) : 500;
  });
  const [idleLimitInput, setIdleLimitInput] = useState<string>(idleLimit.toString());

  const [qsLimit, setQsLimit] = useState<number>(() => {
    const saved = localStorage.getItem('planiq_radar_qs_limit');
    return saved ? parseInt(saved, 10) : 25;
  });
  const [qsLimitInput, setQsLimitInput] = useState<string>(qsLimit.toString());

  const [waitsLimit, setWaitsLimit] = useState<number>(() => {
    const saved = localStorage.getItem('planiq_radar_waits_limit');
    return saved ? parseInt(saved, 10) : 50;
  });
  const [waitsLimitInput, setWaitsLimitInput] = useState<string>(waitsLimit.toString());

  const [deadlocksLimit, setDeadlocksLimit] = useState<number>(() => {
    const saved = localStorage.getItem('planiq_radar_deadlocks_limit');
    return saved ? parseInt(saved, 10) : 15;
  });
  const [deadlocksLimitInput, setDeadlocksLimitInput] = useState<string>(deadlocksLimit.toString());

  const [indexesLimit, setIndexesLimit] = useState<number>(() => {
    const saved = localStorage.getItem('planiq_radar_indexes_limit');
    return saved ? parseInt(saved, 10) : 30;
  });
  const [indexesLimitInput, setIndexesLimitInput] = useState<string>(indexesLimit.toString());

  const [tempDbLimit, setTempDbLimit] = useState<number>(() => {
    const saved = localStorage.getItem('planiq_radar_tempdb_limit');
    return saved ? parseInt(saved, 10) : 100;
  });
  const [tempDbLimitInput, setTempDbLimitInput] = useState<string>(tempDbLimit.toString());

  // Limit Apply Handlers
  const applyActiveLimit = (val: number | string) => {
    const parsed = typeof val === 'number' ? val : parseInt(val, 10);
    const valid = isNaN(parsed) || parsed < 1 ? 200 : Math.min(5000, parsed);
    setActiveLimit(valid);
    setActiveLimitInput(valid.toString());
    localStorage.setItem('planiq_radar_active_limit', valid.toString());
  };

  const applyIdleLimit = (val: number | string) => {
    const parsed = typeof val === 'number' ? val : parseInt(val, 10);
    const valid = isNaN(parsed) || parsed < 1 ? 500 : Math.min(10000, parsed);
    setIdleLimit(valid);
    setIdleLimitInput(valid.toString());
    localStorage.setItem('planiq_radar_idle_limit', valid.toString());
  };

  const applyQsLimit = (val: number | string) => {
    const parsed = typeof val === 'number' ? val : parseInt(val, 10);
    const valid = isNaN(parsed) || parsed < 1 ? 25 : Math.min(500, parsed);
    setQsLimit(valid);
    setQsLimitInput(valid.toString());
    localStorage.setItem('planiq_radar_qs_limit', valid.toString());
  };

  const applyWaitsLimit = (val: number | string) => {
    const parsed = typeof val === 'number' ? val : parseInt(val, 10);
    const valid = isNaN(parsed) || parsed < 1 ? 50 : Math.min(500, parsed);
    setWaitsLimit(valid);
    setWaitsLimitInput(valid.toString());
    localStorage.setItem('planiq_radar_waits_limit', valid.toString());
  };

  const applyDeadlocksLimit = (val: number | string) => {
    const parsed = typeof val === 'number' ? val : parseInt(val, 10);
    const valid = isNaN(parsed) || parsed < 1 ? 15 : Math.min(100, parsed);
    setDeadlocksLimit(valid);
    setDeadlocksLimitInput(valid.toString());
    localStorage.setItem('planiq_radar_deadlocks_limit', valid.toString());
  };

  const applyIndexesLimit = (val: number | string) => {
    const parsed = typeof val === 'number' ? val : parseInt(val, 10);
    const valid = isNaN(parsed) || parsed < 1 ? 30 : Math.min(200, parsed);
    setIndexesLimit(valid);
    setIndexesLimitInput(valid.toString());
    localStorage.setItem('planiq_radar_indexes_limit', valid.toString());
  };

  const applyTempDbLimit = (val: number | string) => {
    const parsed = typeof val === 'number' ? val : parseInt(val, 10);
    const valid = isNaN(parsed) || parsed < 1 ? 100 : Math.min(1000, parsed);
    setTempDbLimit(valid);
    setTempDbLimitInput(valid.toString());
    localStorage.setItem('planiq_radar_tempdb_limit', valid.toString());
  };

  const applyBufferLimit = (val: number | string) => {
    const parsed = typeof val === 'number' ? val : parseInt(val, 10);
    const valid = isNaN(parsed) || parsed < 1 ? 50 : Math.min(200, parsed);
    setBufferLimit(valid);
    setBufferLimitInput(valid.toString());
    localStorage.setItem('planiq_radar_buffer_limit', valid.toString());
  };

  const applyUnusedLimit = (val: number | string) => {
    const parsed = typeof val === 'number' ? val : parseInt(val, 10);
    const valid = isNaN(parsed) || parsed < 1 ? 30 : Math.min(200, parsed);
    setUnusedLimit(valid);
    setUnusedLimitInput(valid.toString());
    localStorage.setItem('planiq_radar_unused_limit', valid.toString());
  };

  // Fetch data
  const fetchData = async () => {
    if (!isConnected) return;
    setIsLoading(true);
    try {
      const app = (window as any).go?.main?.App;
      if (typeof window !== 'undefined' && app) {
        if (activeSubTab === 'advisors') {
          if (app.GetLiveAdvisors) {
            const adv = await app.GetLiveAdvisors();
            setAdvisors(adv || []);
          }
        } else if (activeSubTab === 'sessions') {
          const res = await app.GetLiveActiveSessions(activeLimit);
          setSessions(res || []);
          if (app.GetLiveIdleSessions) {
            app.GetLiveIdleSessions(idleLimit).then((idles: any) => setIdleSessions(idles || []));
          }
        } else if (activeSubTab === 'sleeping') {
          if (app.GetLiveIdleSessions) {
            const idles = await app.GetLiveIdleSessions(idleLimit);
            setIdleSessions(idles || []);
          }
        } else if (activeSubTab === 'waithistory') {
          if (app.GetLiveWaitHistory) {
            const hist = await app.GetLiveWaitHistory();
            setWaitHistory(hist || []);
            if (hist && hist.length > 0 && !selectedHistoryPoint) {
              setSelectedHistoryPoint(hist[hist.length - 1]);
            }
          }
        } else if (activeSubTab === 'blocking') {
          if (app.GetLiveBlockingSessions) {
            const blk = await app.GetLiveBlockingSessions();
            setBlockingSessions(blk || []);
          }
          const res = await app.GetLiveActiveSessions(activeLimit);
          setSessions(res || []);
        } else if (activeSubTab === 'waits') {
          if (app.GetLiveWaitStats) {
            const w = await app.GetLiveWaitStats(waitsLimit);
            setWaitStats(w || []);
          }
        } else if (activeSubTab === 'querystore') {
          const qs = await app.GetLiveQueryStore(qsOrderBy, qsLimit);
          setQueryStoreEntries(qs || []);
        } else if (activeSubTab === 'bufferpool') {
          if (app.GetLiveBufferPool) {
            setBufferPoolError(null);
            try {
              const bp = await app.GetLiveBufferPool(bufferLimit);
              setBufferPool(bp || []);
            } catch (err: any) {
              console.error('Buffer pool query failed:', err);
              setBufferPoolError(err?.message || String(err));
              setBufferPool([]);
            }
          }
        } else if (activeSubTab === 'indexes') {
          if (app.GetLiveMissingIndexes) {
            const idxs = await app.GetLiveMissingIndexes(indexesLimit);
            setMissingIndexes(idxs || []);
          }
          if (app.GetLiveUnusedIndexes) {
            const unused = await app.GetLiveUnusedIndexes(unusedLimit);
            setUnusedIndexes(unused || []);
          }
          if (app.GetLiveDuplicateIndexes) {
            const dups = await app.GetLiveDuplicateIndexes();
            setDuplicateIndexes(dups || []);
          }
        } else if (activeSubTab === 'deadlocks') {
          const dls = await app.GetLiveDeadlocks(deadlocksLimit);
          setDeadlocks(dls || []);
        } else if (activeSubTab === 'tempdb') {
          if (app.GetLiveTempDBUsage) {
            const tdb = await app.GetLiveTempDBUsage(tempDbLimit);
            setTempDbUsage(tdb || []);
          }
        } else if (activeSubTab === 'vitals') {
          const v = await app.GetLiveServerVitals();
          setVitals(v);
        }

        // Background preload advisors count once if empty
        if (advisors.length === 0 && app.GetLiveAdvisors) {
          app.GetLiveAdvisors().then((adv: any) => {
            if (adv) setAdvisors(adv);
          });
        }
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch live data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh interval
  useEffect(() => {
    fetchData();

    if (!isAutoRefresh || !isConnected) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const interval = activeSubTab === 'sessions' || activeSubTab === 'blocking' ? 2500 : 5000;
    timerRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isConnected, isAutoRefresh, activeSubTab, qsOrderBy, activeLimit, idleLimit, qsLimit, waitsLimit, deadlocksLimit, indexesLimit, tempDbLimit]);

  // Handle Inspect Live Plan
  const handleInspectPlan = async (session: ActiveSession) => {
    if (!session.planHandle && !session.spid) {
      alert('This query does not have a cached plan handle or active SPID available in memory.');
      return;
    }
    const targetKey = `${session.spid}:${session.planHandle || ''}`;
    setSelectedPlanLoading(session.planHandle || `${session.spid}`);
    try {
      const app = (window as any).go?.main?.App;
      if (typeof window !== 'undefined' && app?.GetLiveSessionPlan) {
        const xml = await app.GetLiveSessionPlan(targetKey);
        if (xml) {
          onLoadPlanXML(xml, `Live SPID #${session.spid} (${session.databaseName})`);
        } else {
          alert('Unable to extract execution plan XML from live DMVs.');
        }
      }
    } catch (e: any) {
      alert(`Failed to retrieve live plan: ${e.message}`);
    } finally {
      setSelectedPlanLoading(null);
    }
  };

  // Handle Query Store Open
  const handleOpenQueryStorePlan = (entry: QueryStoreEntry) => {
    if (entry.planXml) {
      onLoadPlanXML(entry.planXml, `QueryStore Query #${entry.queryId} (Plan #${entry.planId})`);
    } else {
      alert('Plan XML is not available for this Query Store entry.');
    }
  };

  // Handle Deadlock Open
  const handleOpenDeadlock = (dl: LiveDeadlockReport) => {
    if (dl.deadlockGraphXml) {
      onLoadDeadlockXML(dl.deadlockGraphXml);
    }
  };

  // Dynamic Filter Logic for Active Sessions
  const addSessionFilter = () => {
    // When adding next filter, intelligently pick the first column NOT already selected
    const usedCols = new Set(sessionFilters.map((f) => f.columnId));
    const nextCol = SESSION_COLUMNS.find((c) => !usedCols.has(c.id) && c.id !== 'action') || SESSION_COLUMNS[0];
    const newFilter: ColumnFilter = {
      id: `filter-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      columnId: nextCol.id,
      operator: nextCol.type === 'number' ? 'gte' : 'contains',
      value: ''
    };
    setSessionFilters([...sessionFilters, newFilter]);
  };

  const updateSessionFilter = (id: string, updates: Partial<ColumnFilter>) => {
    setSessionFilters((prev) =>
      prev.map((f) => {
        if (f.id === id) {
          const updated = { ...f, ...updates };
          // If column changed, reset operator default based on type
          if (updates.columnId && updates.columnId !== f.columnId) {
            const colDef = SESSION_COLUMNS.find((c) => c.id === updates.columnId);
            updated.operator = colDef?.type === 'number' ? 'gte' : 'contains';
            updated.value = '';
          }
          return updated;
        }
        return f;
      })
    );
  };

  const removeSessionFilter = (id: string) => {
    setSessionFilters((prev) => prev.filter((f) => f.id !== id));
  };

  const applyQuickPreset = (preset: string) => {
    if (preset === 'clear') {
      setSessionFilters([]);
      return;
    }
    if (preset === 'blocked') {
      setSessionFilters([
        { id: `f-${Date.now()}`, columnId: 'status', operator: 'contains', value: 'BLOCKED' }
      ]);
    } else if (preset === 'running') {
      setSessionFilters([
        { id: `f-${Date.now()}`, columnId: 'status', operator: 'equals', value: 'running' }
      ]);
    } else if (preset === 'highcpu') {
      setSessionFilters([
        { id: `f-${Date.now()}`, columnId: 'cpu', operator: 'gte', value: '5000' }
      ]);
    } else if (preset === 'longrunning') {
      setSessionFilters([
        { id: `f-${Date.now()}`, columnId: 'elapsed', operator: 'gte', value: '10' }
      ]);
    } else if (preset === 'locks') {
      setSessionFilters([
        { id: `f-${Date.now()}`, columnId: 'waitType', operator: 'contains', value: 'LCK_' }
      ]);
    } else if (preset === 'pageio') {
      setSessionFilters([
        { id: `f-${Date.now()}`, columnId: 'waitType', operator: 'contains', value: 'PAGEIO' }
      ]);
    }
  };

  // Filtered Sessions Memo
  const filteredSessions = useMemo(() => {
    if (sessionFilters.length === 0) return sessions;

    return sessions.filter((s) => {
      const isBlocked = (s.blockingSpid ?? 0) > 0;
      return sessionFilters.every((filter) => {
        if (!filter.value || filter.value.trim() === '') return true;
        const val = filter.value.trim().toLowerCase();

        switch (filter.columnId) {
          case 'spid': {
            const targetSpid = parseInt(val, 10);
            if (isNaN(targetSpid)) return true;
            if (filter.operator === 'gte') return (s.spid ?? 0) >= targetSpid;
            if (filter.operator === 'lte') return (s.spid ?? 0) <= targetSpid;
            return s.spid === targetSpid;
          }
          case 'status': {
            if (val === 'blocked') return isBlocked;
            const statusStr = (s.status || '').toLowerCase();
            if (filter.operator === 'equals') return statusStr === val;
            return statusStr.includes(val) || (isBlocked && 'blocked'.includes(val));
          }
          case 'command':
            return (s.command || '').toLowerCase().includes(val);
          case 'databaseName':
            return (s.databaseName || '').toLowerCase().includes(val);
          case 'elapsed': {
            const sec = parseFloat(val);
            if (isNaN(sec)) return true;
            const elapsedSec = (s.totalElapsedTimeMs ?? 0) / 1000.0;
            if (filter.operator === 'gte') return elapsedSec >= sec;
            if (filter.operator === 'lte') return elapsedSec <= sec;
            return elapsedSec >= sec;
          }
          case 'waitType':
            return (
              (s.waitType || '').toLowerCase().includes(val) ||
              (s.lastWaitType || '').toLowerCase().includes(val)
            );
          case 'cpu': {
            const targetCpu = parseFloat(val);
            if (isNaN(targetCpu)) return true;
            const cpu = s.cpuTimeMs ?? 0;
            if (filter.operator === 'gte') return cpu >= targetCpu;
            if (filter.operator === 'lte') return cpu <= targetCpu;
            return cpu >= targetCpu;
          }
          case 'readsWrites': {
            const targetReads = parseInt(val, 10);
            if (isNaN(targetReads)) return true;
            const reads = s.logicalReads ?? 0;
            if (filter.operator === 'gte') return reads >= targetReads;
            if (filter.operator === 'lte') return reads <= targetReads;
            return reads >= targetReads;
          }
          case 'memory': {
            const targetMem = parseFloat(val);
            if (isNaN(targetMem)) return true;
            const mem = s.grantedMemoryMb ?? 0;
            if (filter.operator === 'gte') return mem >= targetMem;
            if (filter.operator === 'lte') return mem <= targetMem;
            return mem >= targetMem;
          }
          case 'programHost':
            return (
              (s.programName || '').toLowerCase().includes(val) ||
              (s.hostName || '').toLowerCase().includes(val)
            );
          case 'login':
            return (s.loginName || '').toLowerCase().includes(val);
          case 'progress': {
            const targetProg = parseFloat(val);
            if (isNaN(targetProg)) return true;
            return (s.percentComplete ?? 0) >= targetProg;
          }
          case 'queryPreview':
            return (s.queryText || '').toLowerCase().includes(val);
          default:
            return true;
        }
      });
    });
  }, [sessions, sessionFilters]);

  // Idle filter helpers
  const addIdleFilter = () => {
    setIdleFilters([
      ...idleFilters,
      { id: `idl-${Date.now()}`, columnId: 'programName', operator: 'contains', value: '' }
    ]);
  };

  const updateIdleFilter = (id: string, updates: Partial<ColumnFilter>) => {
    setIdleFilters((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const removeIdleFilter = (id: string) => {
    setIdleFilters((prev) => prev.filter((f) => f.id !== id));
  };

  // Dynamic Filters for Sleeping / Idle Sessions
  const filteredIdleSessions = useMemo(() => {
    if (idleFilters.length === 0) return idleSessions;
    return idleSessions.filter((s) => {
      return idleFilters.every((filter) => {
        if (!filter.value || filter.value.trim() === '') return true;
        const val = filter.value.trim().toLowerCase();
        switch (filter.columnId) {
          case 'spid':
            return (s.spid ?? '').toString().includes(val);
          case 'status':
            return (s.status || '').toLowerCase().includes(val);
          case 'openTransactions': {
            const num = parseInt(val, 10);
            return isNaN(num) || (s.openTransactions ?? 0) >= num;
          }
          case 'idleSeconds': {
            const sec = parseFloat(val);
            return isNaN(sec) || (s.idleSeconds ?? 0) >= sec;
          }
          case 'programName':
            return (s.programName || '').toLowerCase().includes(val);
          case 'loginName':
            return (s.loginName || '').toLowerCase().includes(val);
          case 'hostName':
            return (s.hostName || '').toLowerCase().includes(val);
          case 'databaseName':
            return (s.databaseName || '').toLowerCase().includes(val);
          case 'lastQueryText':
            return (s.lastQueryText || '').toLowerCase().includes(val);
          default:
            return true;
        }
      });
    });
  }, [idleSessions, idleFilters]);

  // Dynamic Filters for Query Store
  const filteredQueryStore = useMemo(() => {
    return queryStoreEntries.filter((q) => {
      return qsFilters.every((f) => {
        if (!f.value || f.value.trim() === '') return true;
        const val = f.value.trim().toLowerCase();
        if (f.columnId === 'queryText') {
          return (q.queryText || '').toLowerCase().includes(val);
        }
        if (f.columnId === 'queryId') {
          return (q.queryId ?? '').toString().includes(val) || (q.planId ?? '').toString().includes(val);
        }
        if (f.columnId === 'minCpu') {
          const cpu = parseFloat(val);
          return isNaN(cpu) || ((q.totalCpuMs ?? 0) / 1000.0) >= cpu;
        }
        if (f.columnId === 'spillsOnly') {
          return (q.totalSpillsMb ?? 0) > 0;
        }
        return true;
      });
    });
  }, [queryStoreEntries, qsFilters]);

  // Filtered Wait Stats
  const filteredWaitStats = useMemo(() => {
    return waitStats.filter((w) => {
      const matchCat =
        waitCategoryFilter === 'all' ||
        (w.waitCategory || '').toLowerCase() === waitCategoryFilter.toLowerCase();
      const matchText =
        !waitSearch ||
        (w.waitType || '').toLowerCase().includes(waitSearch.toLowerCase()) ||
        (w.description || '').toLowerCase().includes(waitSearch.toLowerCase());
      return matchCat && matchText;
    });
  }, [waitStats, waitCategoryFilter, waitSearch]);

  if (!isConnected) {
    return (
      <div className="tab-scroll-container">
        <div
          className="glass-panel"
          style={{
            maxWidth: '640px',
            margin: '40px auto',
            padding: '40px 30px',
            textAlign: 'center',
            borderRadius: '12px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(129, 140, 248, 0.2))',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <Zap size={28} color="#38bdf8" />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 8px', color: '#f8fafc' }}>
            Live SQL Server Radar Disconnected
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: '1.5', margin: '0 0 24px' }}>
            Connect to Microsoft SQL Server with strict read-only safety to monitor active queries in real-time,
            diagnose blocking cascades, analyze instance wait stats, inspect Query Store bottlenecks, and stream deadlocks.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button type="button" className="btn btn-primary" onClick={onOpenConnectModal}>
              <Zap size={14} />
              <span>Connect to SQL Server</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const blockedCount = sessions.filter((s) => (s.blockingSpid ?? 0) > 0).length;

  // Render Functions for Subtab Filters (Fixed / Sticky Header Area)
  const renderActiveSessionsFilters = () => (
    <div className="radar-filter-bar-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={13} color="#38bdf8" />
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#f1f5f9' }}>
            Dynamic Multi-Column Filters:
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            Showing <strong style={{ color: '#38bdf8' }}>{filteredSessions.length}</strong> of {sessions.length} sessions (Limit: {activeLimit})
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Row Limit Control for Active Sessions */}
          <div className="radar-limit-ctrl" title="Configure maximum active sessions fetched from SQL Server (Default: 200)">
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Limit:</span>
            <input
              type="number"
              min={1}
              max={5000}
              className="radar-limit-input"
              value={activeLimitInput}
              onChange={(e) => setActiveLimitInput(e.target.value)}
              onBlur={() => applyActiveLimit(activeLimitInput)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyActiveLimit(activeLimitInput);
              }}
              title="Type custom limit and press Enter (Default: 200)"
            />
            <div className="radar-limit-presets">
              {[50, 100, 200, 500, 1000].map((val) => (
                <button
                  key={val}
                  type="button"
                  className={`radar-limit-pill ${activeLimit === val ? 'active' : ''}`}
                  onClick={() => applyActiveLimit(val)}
                  title={`Set limit to ${val}`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* Column Visibility Toggle Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm radar-ctrl-btn"
              onClick={() => setShowColPicker(!showColPicker)}
              title="Configure displayed columns"
            >
              <SlidersHorizontal size={11} />
              <span>Columns ({Object.values(visibleColumns).filter(Boolean).length})</span>
              <ChevronDown size={10} />
            </button>

          {showColPicker && (
            <div className="radar-col-picker-menu">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#f1f5f9' }}>Toggle Table Columns</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '10px', cursor: 'pointer', padding: 0 }}
                    onClick={() => {
                      const all: Record<string, boolean> = {};
                      SESSION_COLUMNS.forEach((c) => (all[c.id] = true));
                      setVisibleColumns(all);
                    }}
                  >
                    All
                  </button>
                  <span style={{ color: '#475569' }}>•</span>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '10px', cursor: 'pointer', padding: 0 }}
                    onClick={() => {
                      const defs: Record<string, boolean> = {};
                      SESSION_COLUMNS.forEach((c) => (defs[c.id] = c.defaultVisible));
                      setVisibleColumns(defs);
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px' }}>
                {SESSION_COLUMNS.map((col) => (
                  <label
                    key={col.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '10.5px',
                      color: visibleColumns[col.id] ? '#f1f5f9' : '#64748b',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!visibleColumns[col.id]}
                      onChange={(e) =>
                        setVisibleColumns({ ...visibleColumns, [col.id]: e.target.checked })
                      }
                      style={{ cursor: 'pointer', accentColor: '#38bdf8' }}
                    />
                    <span>{col.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

      {/* Filter Row: side-by-side chips */}
      <div className="radar-filter-row">
        {sessionFilters.map((filter) => {
          const colDef = SESSION_COLUMNS.find((c) => c.id === filter.columnId);
          const usedCols = new Set(sessionFilters.map((f) => f.columnId));

          return (
            <div key={filter.id} className="radar-filter-chip">
              {/* Column selector */}
              <select
                className="radar-filter-select"
                value={filter.columnId}
                onChange={(e) => {
                  const newCol = e.target.value;
                  const newColDef = SESSION_COLUMNS.find((c) => c.id === newCol);
                  updateSessionFilter(filter.id, {
                    columnId: newCol,
                    operator: newColDef?.type === 'number' ? 'gte' : 'contains',
                    value: ''
                  });
                }}
              >
                <optgroup label="Available Columns">
                  {SESSION_COLUMNS.filter((c) => !usedCols.has(c.id) || c.id === filter.columnId).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
                {SESSION_COLUMNS.filter((c) => usedCols.has(c.id) && c.id !== filter.columnId).length > 0 && (
                  <optgroup label="Already Filtered">
                    {SESSION_COLUMNS.filter((c) => usedCols.has(c.id)).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} (in use)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              {/* Operator */}
              {colDef?.type === 'number' ? (
                <select
                  className="radar-filter-operator"
                  value={filter.operator}
                  onChange={(e) =>
                    updateSessionFilter(filter.id, { operator: e.target.value as any })
                  }
                >
                  <option value="gte">&gt;=</option>
                  <option value="lte">&lt;=</option>
                  <option value="equals">=</option>
                </select>
              ) : (
                <select
                  className="radar-filter-operator"
                  value={filter.operator}
                  onChange={(e) =>
                    updateSessionFilter(filter.id, { operator: e.target.value as any })
                  }
                >
                  <option value="contains">contains</option>
                  <option value="equals">equals</option>
                </select>
              )}

              {/* Dynamic Value Input with Suggestions */}
              {filter.columnId === 'status' ? (
                <div style={{ display: 'flex', gap: '3px' }}>
                  <input
                    type="text"
                    className="radar-filter-input"
                    placeholder="e.g. running, blocked..."
                    value={filter.value}
                    onChange={(e) => updateSessionFilter(filter.id, { value: e.target.value })}
                    list={`list-status-${filter.id}`}
                  />
                  <datalist id={`list-status-${filter.id}`}>
                    <option value="running" />
                    <option value="suspended" />
                    <option value="sleeping" />
                    <option value="blocked" />
                  </datalist>
                </div>
              ) : filter.columnId === 'waitType' ? (
                <div style={{ display: 'flex', gap: '3px' }}>
                  <input
                    type="text"
                    className="radar-filter-input"
                    placeholder="e.g. PAGEIO, LCK, CX..."
                    value={filter.value}
                    onChange={(e) => updateSessionFilter(filter.id, { value: e.target.value })}
                    list={`list-wait-${filter.id}`}
                  />
                  <datalist id={`list-wait-${filter.id}`}>
                    <option value="PAGEIOLATCH_SH" />
                    <option value="LCK_M_X" />
                    <option value="LCK_M_S" />
                    <option value="CXPACKET" />
                    <option value="SOS_SCHEDULER_YIELD" />
                    <option value="ASYNC_NETWORK_IO" />
                    <option value="WRITELOG" />
                  </datalist>
                </div>
              ) : filter.columnId === 'command' ? (
                <div style={{ display: 'flex', gap: '3px' }}>
                  <input
                    type="text"
                    className="radar-filter-input"
                    placeholder="SELECT, UPDATE..."
                    value={filter.value}
                    onChange={(e) => updateSessionFilter(filter.id, { value: e.target.value })}
                    list={`list-cmd-${filter.id}`}
                  />
                  <datalist id={`list-cmd-${filter.id}`}>
                    <option value="SELECT" />
                    <option value="UPDATE" />
                    <option value="INSERT" />
                    <option value="DELETE" />
                    <option value="BACKUP DATABASE" />
                    <option value="ALTER INDEX" />
                  </datalist>
                </div>
              ) : (
                <input
                  type={colDef?.type === 'number' ? 'number' : 'text'}
                  className="radar-filter-input"
                  placeholder={
                    colDef?.type === 'number' ? 'Enter value...' : `Search ${colDef?.label}...`
                  }
                  value={filter.value}
                  onChange={(e) => updateSessionFilter(filter.id, { value: e.target.value })}
                />
              )}

              {/* Remove Filter Button */}
              <button
                type="button"
                className="radar-filter-remove-btn"
                onClick={() => removeSessionFilter(filter.id)}
                title="Remove this filter"
              >
                <X size={10} />
              </button>
            </div>
          );
        })}

        {/* Add New Filter Button (Chains to Next Unselected Column) */}
        <button
          type="button"
          className="radar-add-filter-btn"
          onClick={addSessionFilter}
          title="Add new column filter side-by-side"
        >
          <Plus size={12} />
          <span>Add Column Filter</span>
        </button>
      </div>

      {/* Quick 1-Click Presets */}
      <div className="radar-presets-row">
        <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600 }}>Quick Presets:</span>
        <button
          type="button"
          className="radar-preset-chip"
          onClick={() => applyQuickPreset('blocked')}
        >
          <AlertOctagon size={10} color="#f43f5e" />
          <span>Blocked Sessions</span>
        </button>
        <button
          type="button"
          className="radar-preset-chip"
          onClick={() => applyQuickPreset('running')}
        >
          <Activity size={10} color="#34d399" />
          <span>Active Running</span>
        </button>
        <button
          type="button"
          className="radar-preset-chip"
          onClick={() => applyQuickPreset('highcpu')}
        >
          <Flame size={10} color="#fbbf24" />
          <span>High CPU (&gt;5s)</span>
        </button>
        <button
          type="button"
          className="radar-preset-chip"
          onClick={() => applyQuickPreset('longrunning')}
        >
          <Clock size={10} color="#38bdf8" />
          <span>Long Running (&gt;10s)</span>
        </button>
        <button
          type="button"
          className="radar-preset-chip"
          onClick={() => applyQuickPreset('locks')}
        >
          <ShieldAlert size={10} color="#f43f5e" />
          <span>Lock Waits (LCK_*)</span>
        </button>
        <button
          type="button"
          className="radar-preset-chip"
          onClick={() => applyQuickPreset('pageio')}
        >
          <HardDrive size={10} color="#a78bfa" />
          <span>Disk I/O (PAGEIO*)</span>
        </button>
        {sessionFilters.length > 0 && (
          <button
            type="button"
            className="radar-preset-chip danger"
            onClick={() => applyQuickPreset('clear')}
            title="Clear all column filters"
          >
            <X size={10} />
            <span>Clear All</span>
          </button>
        )}
      </div>
    </div>
  );

  const renderSleepingFilters = () => (
    <>
      {/* Open Transaction Warning Alert */}
      {idleSessions.filter((s) => (s.openTransactions ?? 0) > 0).length > 0 && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '0px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} color="#fbbf24" />
            <span style={{ fontSize: '12px', color: '#fef3c7' }}>
              <strong>High Severity Warning:</strong> {idleSessions.filter((s) => (s.openTransactions ?? 0) > 0).length} sleeping connection(s) have uncommitted open transactions! These hold exclusive locks on data pages, block other queries, and prevent transaction log truncation.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              setIdleFilters([
                { id: 'open-xact', columnId: 'openTransactions', operator: 'gte', value: '1' }
              ])
            }
            style={{ fontSize: '11px', borderColor: 'rgba(245, 158, 11, 0.4)', color: '#fbbf24' }}
          >
            Isolate Open Transactions
          </button>
        </div>
      )}

      {/* Dynamic Side-by-Side Multi-Column Filter Row for Sleeping Connections */}
      <div className="radar-filter-bar-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Moon size={13} color="#818cf8" />
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#f1f5f9' }}>
              Sleeping & Idle Connections (sys.dm_exec_sessions):
            </span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Showing <strong style={{ color: '#818cf8' }}>{filteredIdleSessions.length}</strong> of {idleSessions.length} (Limit: {idleLimit})
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Limit Control for Sleeping Sessions */}
            <div className="radar-limit-ctrl" title="Configure maximum sleeping connections fetched from SQL Server (Default: 500)">
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Limit:</span>
              <input
                type="number"
                min={1}
                max={10000}
                className="radar-limit-input"
                value={idleLimitInput}
                onChange={(e) => setIdleLimitInput(e.target.value)}
                onBlur={() => applyIdleLimit(idleLimitInput)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyIdleLimit(idleLimitInput);
                }}
                title="Type custom limit and press Enter (Default: 500)"
              />
              <div className="radar-limit-presets">
                {[100, 250, 500, 1000, 2500].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`radar-limit-pill ${idleLimit === val ? 'active' : ''}`}
                    onClick={() => applyIdleLimit(val)}
                    title={`Set limit to ${val}`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm radar-ctrl-btn"
              onClick={fetchData}
              disabled={isLoading}
              title="Poll sleeping sessions from SQL Server"
            >
              <RefreshCw size={11} className={isLoading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="radar-filter-row">
          {idleFilters.map((filter) => (
            <div key={filter.id} className="radar-filter-chip">
              <select
                className="radar-filter-select"
                value={filter.columnId}
                onChange={(e) => updateIdleFilter(filter.id, { columnId: e.target.value })}
              >
                <option value="programName">Program / App Pool</option>
                <option value="status">Status</option>
                <option value="loginName">Login User</option>
                <option value="hostName">Host Machine</option>
                <option value="databaseName">Database</option>
                <option value="openTransactions">Open Transactions</option>
                <option value="idleSeconds">Min Idle Seconds</option>
                <option value="lastQueryText">Last Executed SQL</option>
                <option value="spid">SPID</option>
              </select>

              <select
                className="radar-filter-operator"
                value={filter.operator}
                onChange={(e) => updateIdleFilter(filter.id, { operator: e.target.value as any })}
              >
                {['openTransactions', 'idleSeconds', 'spid'].includes(filter.columnId) ? (
                  <>
                    <option value="gte">&gt;=</option>
                    <option value="lte">&lt;=</option>
                    <option value="equals">=</option>
                  </>
                ) : (
                  <>
                    <option value="contains">contains</option>
                    <option value="equals">equals</option>
                  </>
                )}
              </select>

              <input
                type={['openTransactions', 'idleSeconds', 'spid'].includes(filter.columnId) ? 'number' : 'text'}
                className="radar-filter-input"
                placeholder="Filter value..."
                value={filter.value}
                onChange={(e) => updateIdleFilter(filter.id, { value: e.target.value })}
              />

              <button
                type="button"
                className="radar-filter-remove-btn"
                onClick={() => removeIdleFilter(filter.id)}
                title="Remove this filter"
              >
                <X size={10} />
              </button>
            </div>
          ))}

          <button
            type="button"
            className="radar-add-filter-btn"
            onClick={addIdleFilter}
            title="Add another sleeping filter condition"
          >
            <Plus size={12} />
            <span>Add Filter</span>
          </button>
        </div>

        {/* Quick presets for sleeping sessions */}
        <div className="radar-presets-row">
          <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600 }}>Quick Presets:</span>
          <button
            type="button"
            className={`radar-preset-chip ${idleFilters.some((f) => f.columnId === 'openTransactions') ? 'active' : ''}`}
            onClick={() =>
              setIdleFilters([
                { id: 'open-xact', columnId: 'openTransactions', operator: 'gte', value: '1' }
              ])
            }
          >
            <AlertTriangle size={10} color="#fbbf24" />
            <span>Open Transactions (&gt;0)</span>
          </button>
          <button
            type="button"
            className={`radar-preset-chip ${idleFilters.some((f) => f.columnId === 'idleSeconds') ? 'active' : ''}`}
            onClick={() =>
              setIdleFilters([
                { id: 'idle-long', columnId: 'idleSeconds', operator: 'gte', value: '600' }
              ])
            }
          >
            <Clock size={10} color="#38bdf8" />
            <span>Idle &gt; 10 Mins</span>
          </button>
          <button
            type="button"
            className={`radar-preset-chip ${idleFilters.some((f) => f.columnId === 'programName') ? 'active' : ''}`}
            onClick={() =>
              setIdleFilters([
                { id: 'ef-pools', columnId: 'programName', operator: 'contains', value: 'EntityFramework' }
              ])
            }
          >
            <Activity size={10} color="#a78bfa" />
            <span>EntityFramework Pools</span>
          </button>
          {idleFilters.length > 0 && (
            <button
              type="button"
              className="radar-preset-chip danger"
              onClick={() => setIdleFilters([])}
            >
              <X size={10} />
              <span>Clear Filters</span>
            </button>
          )}
        </div>
      </div>
    </>
  );

  const renderQueryStoreFilters = () => (
    <div className="radar-filter-bar-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={14} color="#818cf8" />
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>
            Query Store Bottlenecks (Last 24 Hours)
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            Showing {filteredQueryStore.length} of {queryStoreEntries.length} queries (Top {qsLimit})
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Limit Control for Query Store */}
          <div className="radar-limit-ctrl" title="Configure top queries fetched from Query Store (Default: 25)">
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Limit:</span>
            <input
              type="number"
              min={1}
              max={500}
              className="radar-limit-input"
              value={qsLimitInput}
              onChange={(e) => setQsLimitInput(e.target.value)}
              onBlur={() => applyQsLimit(qsLimitInput)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyQsLimit(qsLimitInput);
              }}
              title="Type custom limit and press Enter (Default: 25)"
            />
            <div className="radar-limit-presets">
              {[15, 25, 50, 100].map((val) => (
                <button
                  key={val}
                  type="button"
                  className={`radar-limit-pill ${qsLimit === val ? 'active' : ''}`}
                  onClick={() => applyQsLimit(val)}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* Order By Metric */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['cpu', 'duration', 'reads', 'spills'] as const).map((metric) => (
              <button
                key={metric}
                type="button"
                className={`btn btn-sm ${qsOrderBy === metric ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setQsOrderBy(metric)}
                style={{ textTransform: 'uppercase', fontSize: '10.5px' }}
              >
                Top {metric}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Side-by-Side Filter Row for Query Store */}
      <div className="radar-filter-row" style={{ marginTop: '4px' }}>
        <div className="radar-filter-chip">
          <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600 }}>Filter Query Text:</span>
          <input
            type="text"
            className="radar-filter-input"
            style={{ width: '180px' }}
            placeholder="Contains SQL text..."
            value={qsFilters.find((f) => f.columnId === 'queryText')?.value || ''}
            onChange={(e) =>
              setQsFilters([
                { id: 'qs-1', columnId: 'queryText', operator: 'contains', value: e.target.value }
              ])
            }
          />
        </div>

        <button
          type="button"
          className={`radar-preset-chip ${qsFilters.some((f) => f.columnId === 'spillsOnly') ? 'active' : ''}`}
          onClick={() => {
            const hasSpills = qsFilters.some((f) => f.columnId === 'spillsOnly');
            if (hasSpills) {
              setQsFilters(qsFilters.filter((f) => f.columnId !== 'spillsOnly'));
            } else {
              setQsFilters([...qsFilters, { id: 'spills', columnId: 'spillsOnly', operator: 'gte', value: '1' }]);
            }
          }}
        >
          <HardDrive size={10} color="#f43f5e" />
          <span>Spills &gt; 0 MB</span>
        </button>
      </div>
    </div>
  );

  const renderWaitStatsFilters = () => (
    <div className="radar-filter-bar-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={14} color="#fbbf24" />
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>
            Instance-Wide Wait Statistics Breakdown (sys.dm_os_wait_stats)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Limit Control for Wait Stats */}
          <div className="radar-limit-ctrl" title="Configure top wait types fetched from sys.dm_os_wait_stats (Default: 50)">
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Limit:</span>
            <input
              type="number"
              min={1}
              max={500}
              className="radar-limit-input"
              value={waitsLimitInput}
              onChange={(e) => setWaitsLimitInput(e.target.value)}
              onBlur={() => applyWaitsLimit(waitsLimitInput)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyWaitsLimit(waitsLimitInput);
              }}
              title="Type custom limit and press Enter (Default: 50)"
            />
            <div className="radar-limit-presets">
              {[25, 50, 100].map((val) => (
                <button
                  key={val}
                  type="button"
                  className={`radar-limit-pill ${waitsLimit === val ? 'active' : ''}`}
                  onClick={() => applyWaitsLimit(val)}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {['all', 'Disk I/O', 'Locking', 'Parallelism', 'CPU Scheduler', 'Network', 'Memory'].map((cat) => (
              <button
                key={cat}
                type="button"
                className={`btn btn-sm ${waitCategoryFilter === cat ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setWaitCategoryFilter(cat)}
                style={{ fontSize: '10px', padding: '2px 8px' }}
              >
                {cat === 'all' ? 'All Categories' : cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
        <Search size={12} color="#64748b" />
        <input
          type="text"
          className="radar-filter-input"
          style={{ width: '240px' }}
          placeholder="Search wait type (e.g. PAGEIO, CXPACKET, LCK)..."
          value={waitSearch}
          onChange={(e) => setWaitSearch(e.target.value)}
        />
      </div>
    </div>
  );

  return (
    <div className="tab-scroll-container radar-tab-container">
      {/* ========================================================
          STICKY TOP HEADER (RED MARKED AREA)
          Includes:
          1. Server Info + Sub-navigation ribbon + Pause/Poll controls
          2. Dynamic Multi-Column Filters & Quick Presets & Column Picker
          ======================================================== */}
      <div className="radar-sticky-header">
        {/* Top Live Control Ribbon */}
        <div
          className="glass-panel radar-top-ribbon"
          style={{
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            borderRadius: '10px',
          }}
        >
        {/* Left: Instance info & Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#34d399',
                boxShadow: '0 0 8px #34d399',
              }}
            />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>
              {status.serverName}
            </span>
            <span
              style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '4px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}
            >
              {status.databaseName}
            </span>
            {status.isDemo && (
              <span
                style={{
                  fontSize: '9.5px',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'rgba(244, 63, 94, 0.15)',
                  color: '#f43f5e',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                }}
              >
                Demo Mode
              </span>
            )}
          </div>

          <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.1)' }} />

          {/* Sub Navigation Bar - Enterprise Observability Ribbons */}
          <div className="radar-subnav-bar">
            {/* 0. SolarWinds DPA Performance Advisors */}
            <button
              type="button"
              className={`radar-subnav-btn ${activeSubTab === 'advisors' ? 'active active-advisors' : ''}`}
              onClick={() => setActiveSubTab('advisors')}
              title="Automated SolarWinds DPA Performance Advisors & Anomaly Alerts"
              style={activeSubTab === 'advisors' ? { borderColor: '#818cf8', color: '#818cf8' } : undefined}
            >
              <Sparkles size={12} className="radar-subnav-icon" color="#818cf8" />
              <span>Advisors</span>
              {advisors.length > 0 && (
                <span className="radar-count-pill" style={{ background: 'rgba(129, 140, 248, 0.25)', color: '#818cf8', fontWeight: 800 }}>
                  {advisors.length}
                </span>
              )}
            </button>

            {/* 1. Active Sessions */}
            <button
              type="button"
              className={`radar-subnav-btn ${activeSubTab === 'sessions' ? 'active active-sessions' : ''}`}
              onClick={() => setActiveSubTab('sessions')}
              title="Active executing SQL requests (sys.dm_exec_requests)"
            >
              <Activity size={12} className="radar-subnav-icon" />
              <span>Active Sessions</span>
              <span className="radar-count-pill">{sessions.length}</span>
              {blockedCount > 0 && (
                <span className="radar-blocked-pill">
                  {blockedCount} Blocked
                </span>
              )}
            </button>

            {/* 2. Sleeping & Idle Connections (sys.dm_exec_sessions) */}
            <button
              type="button"
              className={`radar-subnav-btn ${activeSubTab === 'sleeping' ? 'active active-sleeping' : ''}`}
              onClick={() => setActiveSubTab('sleeping')}
              title="Sleeping, connection-pool, and dormant sessions from sys.dm_exec_sessions"
            >
              <Moon size={12} className="radar-subnav-icon" />
              <span>Sleeping & Idle</span>
              <span className="radar-count-pill">{idleSessions.length}</span>
              {idleSessions.filter((s) => (s.openTransactions ?? 0) > 0).length > 0 && (
                <span className="radar-blocked-pill" style={{ background: '#f59e0b' }}>
                  {idleSessions.filter((s) => (s.openTransactions ?? 0) > 0).length} Open Xact
                </span>
              )}
            </button>

            {/* 3. Wait Trend Stacked Bar Chart (SolarWinds DPA) */}
            <button
              type="button"
              className={`radar-subnav-btn ${activeSubTab === 'waithistory' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('waithistory')}
              title="SolarWinds DPA Wait Trend & Anomaly Stacked Bar Chart"
              style={activeSubTab === 'waithistory' ? { borderColor: '#10b981', color: '#10b981' } : undefined}
            >
              <BarChart3 size={12} className="radar-subnav-icon" color="#10b981" />
              <span>Wait Trend</span>
            </button>

            {/* 4. Blocking & Lock Tree */}
            <button
              type="button"
              className={`radar-subnav-btn ${activeSubTab === 'blocking' ? 'active active-blocking' : ''}`}
              onClick={() => setActiveSubTab('blocking')}
              title="Head-blocker hierarchy and victim sessions (sys.dm_os_waiting_tasks)"
            >
              <GitCommit size={12} className="radar-subnav-icon" />
              <span>Blocking Tree</span>
              {blockedCount > 0 && (
                <span className="radar-blocked-pill" style={{ background: '#ef4444' }}>
                  {blockedCount}
                </span>
              )}
            </button>

            {/* 5. Wait Statistics */}
            <button
              type="button"
              className={`radar-subnav-btn ${activeSubTab === 'waits' ? 'active active-waits' : ''}`}
              onClick={() => setActiveSubTab('waits')}
              title="Cumulative SQL Server engine wait stats (sys.dm_os_wait_stats)"
            >
              <Clock size={12} className="radar-subnav-icon" />
              <span>Wait Stats</span>
            </button>

            {/* 6. Query Store */}
            <button
              type="button"
              className={`radar-subnav-btn ${activeSubTab === 'querystore' ? 'active active-querystore' : ''}`}
              onClick={() => setActiveSubTab('querystore')}
              title="Query Store top CPU/Duration/IO bottlenecks"
            >
              <TrendingUp size={12} className="radar-subnav-icon" />
              <span>Query Store Top</span>
            </button>

            {/* 7. Buffer Pool RAM Inspector */}
            <button
              type="button"
              className={`radar-subnav-btn ${activeSubTab === 'bufferpool' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('bufferpool')}
              title="Buffer Pool RAM Inspector: tables and indexes caching RAM (sys.dm_os_buffer_descriptors)"
              style={activeSubTab === 'bufferpool' ? { borderColor: '#38bdf8', color: '#38bdf8' } : undefined}
            >
              <Layers size={12} className="radar-subnav-icon" color="#38bdf8" />
              <span>Buffer Pool</span>
            </button>

            {/* 8. Index Hygiene & Waste */}
            <button
              type="button"
              className={`radar-subnav-btn ${activeSubTab === 'indexes' ? 'active active-indexes' : ''}`}
              onClick={() => setActiveSubTab('indexes')}
              title="Index Hygiene: Missing, Unused Waste, and Redundant Indexes"
            >
              <FolderTree size={12} className="radar-subnav-icon" />
              <span>Index Hygiene</span>
              {unusedIndexes.length > 0 && (
                <span className="radar-count-pill" style={{ background: 'rgba(244, 63, 94, 0.2)', color: '#f43f5e' }}>
                  {unusedIndexes.length} Waste
                </span>
              )}
            </button>

            {/* 9. Live Deadlocks */}
            <button
              type="button"
              className={`radar-subnav-btn ${activeSubTab === 'deadlocks' ? 'active active-deadlocks' : ''}`}
              onClick={() => setActiveSubTab('deadlocks')}
              title="Recent deadlocks captured by system_health XE ring buffer"
            >
              <ShieldAlert size={12} className="radar-subnav-icon" />
              <span>Deadlocks</span>
            </button>

            {/* 10. TempDB Allocation */}
            <button
              type="button"
              className={`radar-subnav-btn ${activeSubTab === 'tempdb' ? 'active active-tempdb' : ''}`}
              onClick={() => setActiveSubTab('tempdb')}
              title="TempDB allocation per active session & internal spills"
            >
              <HardDrive size={12} className="radar-subnav-icon" />
              <span>TempDB Usage</span>
            </button>

            {/* 11. Server Vitals */}
            <button
              type="button"
              className={`radar-subnav-btn ${activeSubTab === 'vitals' ? 'active active-vitals' : ''}`}
              onClick={() => setActiveSubTab('vitals')}
              title="CPU queue, memory grants pending, and batch requests/sec"
            >
              <Cpu size={12} className="radar-subnav-icon" />
              <span>Server Vitals</span>
            </button>
          </div>
        </div>

        {/* Right: Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            Updated: {lastUpdated.toLocaleTimeString()}
          </span>

          <button
            type="button"
            className="btn btn-secondary btn-sm radar-ctrl-btn"
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            title={isAutoRefresh ? 'Pause polling' : 'Resume live polling'}
          >
            {isAutoRefresh ? (
              <>
                <Pause size={11} color="#fbbf24" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play size={11} color="#34d399" />
                <span>Auto</span>
              </>
            )}
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm radar-ctrl-btn"
            onClick={fetchData}
            disabled={isLoading}
            title="Poll DMVs now"
          >
            <RefreshCw size={11} className={isLoading ? 'spin' : ''} />
            <span>Poll</span>
          </button>
        </div>
      </div>

      {/* Dynamic Filters Bar for the Current Active Sub-Tab (Sticky Header) */}
      {activeSubTab === 'sessions' && renderActiveSessionsFilters()}
      {activeSubTab === 'sleeping' && renderSleepingFilters()}
      {activeSubTab === 'querystore' && renderQueryStoreFilters()}
      {activeSubTab === 'waits' && renderWaitStatsFilters()}
    </div>

    {/* ========================================================
        SCROLLABLE CONTENT AREA (TABLES, HIERARCHIES, VITALS)
        ======================================================== */}
    <div className="radar-content-area">
      {/* ========================================================
          PAGE 0: SOLARWINDS DPA PERFORMANCE ADVISORS
          ======================================================== */}
      {activeSubTab === 'advisors' && (
        <div className="section-block radar-subtab-section">
          {/* Top Banner Matching SolarWinds Screenshot */}
          <div
            className="glass-panel"
            style={{
              flexShrink: 0,
              padding: '16px 20px',
              borderRadius: '10px',
              marginBottom: '16px',
              borderLeft: '4px solid #818cf8',
              background: 'rgba(30, 41, 59, 0.75)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(129, 140, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={16} color="#818cf8" />
              </div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#f1f5f9' }}>
                Advisors
              </h3>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: '#cbd5e1', lineHeight: '1.5' }}>
              PlanIQ employs proprietary heuristics inspired by SolarWinds DPA to provide you with rich real-time analysis of top queries. 
              Identifies potentially harmful aspects of query execution, in-memory CPU burners, execution volume spikes, and plan regressions relative to baseline patterns.
            </p>
            {/* Row 1: Severity, Category & Re-Analyze */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Filter Severity:</span>
              {(['all', 'critical', 'warning', 'info'] as const).map((sev) => (
                <button
                  key={sev}
                  type="button"
                  className={`btn btn-sm ${advisorFilter === sev ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setAdvisorFilter(sev)}
                  style={{ fontSize: '10.5px', padding: '2px 8px', textTransform: 'capitalize' }}
                >
                  {sev}
                </button>
              ))}

              <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Category:</span>
              <select
                className="radar-filter-select"
                value={advisorCategoryFilter}
                onChange={(e) => setAdvisorCategoryFilter(e.target.value)}
                style={{ width: '135px', padding: '2px 8px', fontSize: '11px' }}
              >
                <option value="all">All Categories</option>
                <option value="CPU/Memory">CPU / Memory</option>
                <option value="Executions">Executions</option>
                <option value="Plan Regression">Plan Regression</option>
                <option value="TempDB Spill">TempDB Spill</option>
                <option value="Tuning Advice">Tuning Advice</option>
                <option value="Blocking">Blocking</option>
              </select>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={fetchData}
                disabled={isLoading}
                style={{ marginLeft: 'auto', fontSize: '11px' }}
              >
                <RefreshCw size={11} className={isLoading ? 'spin' : ''} />
                <span>Re-Analyze</span>
              </button>
            </div>

            {/* Row 2: Day-Wise vs Hourly Granularity & Date/Hour Filters (SolarWinds DPA Style) */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Granularity:</span>
              <div className="radar-limit-presets" style={{ background: 'rgba(0,0,0,0.3)', padding: '2px', borderRadius: '4px' }}>
                <button
                  type="button"
                  className={`radar-limit-pill ${advisorViewMode === 'hourly' ? 'active' : ''}`}
                  onClick={() => setAdvisorViewMode('hourly')}
                  style={{ fontSize: '10.5px', padding: '2px 8px' }}
                  title="Group findings by individual hour"
                >
                  Hourly Breakdown
                </button>
                <button
                  type="button"
                  className={`radar-limit-pill ${advisorViewMode === 'daily' ? 'active' : ''}`}
                  onClick={() => setAdvisorViewMode('daily')}
                  style={{ fontSize: '10.5px', padding: '2px 8px' }}
                  title="Group findings by calendar day"
                >
                  Day-Wise Summary
                </button>
              </div>

              <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Day:</span>
              <select
                className="radar-filter-select"
                value={advisorSelectedDay}
                onChange={(e) => setAdvisorSelectedDay(e.target.value)}
                style={{ minWidth: '130px', padding: '2px 8px', fontSize: '11px' }}
              >
                <option value="all">All Days ({uniqueAdvisorDays.length})</option>
                {uniqueAdvisorDays.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>

              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Hour:</span>
              <select
                className="radar-filter-select"
                value={advisorSelectedHour}
                onChange={(e) => setAdvisorSelectedHour(e.target.value)}
                style={{ minWidth: '110px', padding: '2px 8px', fontSize: '11px' }}
              >
                <option value="all">All Hours ({uniqueAdvisorHours.length})</option>
                {uniqueAdvisorHours.map((hr) => (
                  <option key={hr} value={hr}>{hr}</option>
                ))}
              </select>

              {(advisorSelectedDay !== 'all' || advisorSelectedHour !== 'all') && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setAdvisorSelectedDay('all');
                    setAdvisorSelectedHour('all');
                  }}
                  style={{ fontSize: '10px', padding: '2px 7px', color: '#f87171' }}
                  title="Reset date and hour filters"
                >
                  Clear Time Filters
                </button>
              )}
            </div>
          </div>

          {/* Grouped by Date Headers (Matching SolarWinds Screenshot!) */}
          {(() => {
            const filteredAdvisors = advisors.filter((adv) => {
              if (advisorFilter !== 'all' && adv.severity !== advisorFilter) return false;
              if (advisorCategoryFilter !== 'all' && adv.category !== advisorCategoryFilter) return false;
              const { day, hour } = parseAdvisorTimestamp(adv.timestamp || '');
              if (advisorSelectedDay !== 'all' && day !== advisorSelectedDay) return false;
              if (advisorSelectedHour !== 'all' && hour !== advisorSelectedHour) return false;
              return true;
            });

            if (filteredAdvisors.length === 0) {
              return (
                <div className="glass-panel" style={{ padding: '36px', textAlign: 'center', borderRadius: '10px' }}>
                  <CheckCircle2 size={36} color="#34d399" style={{ margin: '0 auto 12px' }} />
                  <h4 style={{ margin: '0 0 6px', fontSize: '15px', color: '#f1f5f9' }}>No Findings Match Filter Criteria</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                    Try selecting "All Days" or "All Hours" above, or change severity filters.
                  </p>
                </div>
              );
            }

            // Group by Day or Hour based on advisorViewMode
            const groups: Record<string, PerformanceAdvisor[]> = {};
            filteredAdvisors.forEach((adv) => {
              const { day, hour } = parseAdvisorTimestamp(adv.timestamp || '');
              let groupKey = adv.timestamp || 'Recent Findings';
              if (advisorViewMode === 'daily') {
                groupKey = day || 'Recent Date';
              } else {
                groupKey = day === 'Today' ? hour : `${day} as of ${hour}`;
              }
              if (!groups[groupKey]) groups[groupKey] = [];
              groups[groupKey].push(adv);
            });

            return (
              <div
                className="radar-scrollable-block"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  paddingRight: '6px'
                }}
              >
                {Object.entries(groups).map(([dateLabel, items]) => (
                  <div key={dateLabel} className="advisor-date-group">
                    <div className="advisor-date-header">
                      <Clock size={12} color="#94a3b8" />
                      <span>{dateLabel}</span>
                      <span style={{ fontSize: '10.5px', color: '#64748b' }}>({items.length} finding{items.length > 1 ? 's' : ''})</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {items.map((adv) => {
                        const isExpanded = expandedAdvisorId === adv.id;
                        return (
                          <div
                            key={adv.id}
                            className={`advisor-card ${adv.severity}`}
                          >
                            <div className="advisor-header-row">
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1 }}>
                                <div className={`advisor-info-icon-badge ${adv.severity}`}>
                                  {adv.severity === 'critical' ? '!' : 'i'}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', lineHeight: '1.4' }}>
                                    {adv.title}{' '}
                                    <button
                                      type="button"
                                      onClick={() => setExpandedAdvisorId(isExpanded ? null : adv.id)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#38bdf8',
                                        cursor: 'pointer',
                                        padding: 0,
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        textDecoration: 'underline'
                                      }}
                                    >
                                      {isExpanded ? 'show less' : 'read more...'}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                <span
                                  style={{
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    background: adv.severity === 'critical' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                    color: adv.severity === 'critical' ? '#f43f5e' : '#fbbf24',
                                    border: `1px solid ${adv.severity === 'critical' ? 'rgba(244, 63, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                                  }}
                                >
                                  {adv.metricValue}
                                </span>
                              </div>
                            </div>

                            {/* Expandable Deep-Dive Details */}
                            {isExpanded && (
                              <div
                                style={{
                                  marginTop: '8px',
                                  paddingTop: '10px',
                                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '8px'
                                }}
                              >
                                <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1' }}>
                                  {adv.description}
                                </p>

                                {adv.queryText && (
                                  <div style={{ background: 'rgba(15, 23, 42, 0.85)', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                                      EXECUTING SQL STATEMENT:
                                    </div>
                                    <pre
                                      style={{
                                        margin: 0,
                                        fontSize: '11px',
                                        fontFamily: 'Consolas, monospace',
                                        color: '#38bdf8',
                                        whiteSpace: 'pre-wrap',
                                        maxHeight: '120px',
                                        overflowY: 'auto'
                                      }}
                                    >
                                      {adv.queryText}
                                    </pre>
                                  </div>
                                )}

                                <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '8px 12px', borderRadius: '6px' }}>
                                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#34d399', marginBottom: '2px' }}>
                                    💡 Tuning Advice & Recommendation:
                                  </div>
                                  <div style={{ fontSize: '11.5px', color: '#e2e8f0' }}>
                                    {adv.recommendation}
                                  </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                                  {adv.queryText && (
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => handleCopy(adv.queryText!, `adv-sql-${adv.id}`)}
                                      style={{ fontSize: '11px' }}
                                    >
                                      {copiedKey === `adv-sql-${adv.id}` ? <Check size={11} /> : <Copy size={11} />}
                                      <span>Copy SQL</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => {
                                      if (adv.queryText) {
                                        handleCopy(adv.queryText, `adv-ai-${adv.id}`);
                                        alert("SQL query copied to clipboard! Switch to the 'AI Advisor' tab to run full multi-dimensional LLM diagnosis.");
                                      }
                                    }}
                                    style={{ fontSize: '11px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                                  >
                                    <Sparkles size={11} />
                                    <span>Analyze with AI Advisor</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================================
          PAGE 1: ACTIVE SESSIONS
          ======================================================== */}
      {activeSubTab === 'sessions' && (
        <div className="section-block radar-subtab-section">
          {/* Sessions Data Table */}
          {filteredSessions.length === 0 ? (
            <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', borderRadius: '10px' }}>
              <CheckCircle2 size={32} color="#34d399" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '15px', color: '#e2e8f0', margin: '0 0 6px' }}>
                {sessions.length === 0 ? 'Zero User Requests Currently Active' : 'No Sessions Match Active Filters'}
              </h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                {sessions.length === 0
                  ? 'The SQL Server engine is idle. In-flight requests from client apps or background jobs will appear here.'
                  : 'Try broadening your filter criteria or click "Clear All" above.'}
              </p>
            </div>
          ) : (
            <div className="glass-panel radar-table-scroll-panel">
              <table className="radar-sticky-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    {visibleColumns.spid && (
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>SPID</th>
                    )}
                    {visibleColumns.status && (
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Status</th>
                    )}
                    {visibleColumns.command && (
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Command</th>
                    )}
                    {visibleColumns.databaseName && (
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Database</th>
                    )}
                    {visibleColumns.elapsed && (
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Elapsed</th>
                    )}
                    {visibleColumns.waitType && (
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Wait Type / Last Wait</th>
                    )}
                    {visibleColumns.cpu && (
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>CPU Time</th>
                    )}
                    {visibleColumns.readsWrites && (
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Logical Reads / Writes</th>
                    )}
                    {visibleColumns.memory && (
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Memory</th>
                    )}
                    {visibleColumns.programHost && (
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Program / Host</th>
                    )}
                    {visibleColumns.login && (
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Login</th>
                    )}
                    {visibleColumns.progress && (
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Progress</th>
                    )}
                    {visibleColumns.queryPreview && (
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Query Preview</th>
                    )}
                    {visibleColumns.action && (
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((s) => {
                    const isBlocked = (s.blockingSpid ?? 0) > 0;
                    const elapsedSec = (s.totalElapsedTimeMs ?? 0) / 1000;
                    const isBlocker = sessions.some((other) => other.blockingSpid === s.spid);

                    return (
                      <tr
                        key={s.spid}
                        className={`radar-data-row ${isBlocked ? 'is-blocked' : ''}`}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        {/* SPID */}
                        {visibleColumns.spid && (
                          <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ color: isBlocked ? '#f43f5e' : isBlocker ? '#fbbf24' : '#38bdf8' }}>
                                #{s.spid}
                              </span>
                              {isBlocker && (
                                <span
                                  style={{
                                    fontSize: '9px',
                                    padding: '1px 4px',
                                    borderRadius: '3px',
                                    background: 'rgba(251, 191, 36, 0.2)',
                                    color: '#fbbf24',
                                    border: '1px solid rgba(251, 191, 36, 0.4)',
                                    fontWeight: 700
                                  }}
                                  title={`SPID #${s.spid} is blocking other sessions`}
                                >
                                  BLOCKER
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Status */}
                        {visibleColumns.status && (
                          <td style={{ padding: '10px 12px' }}>
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                background: isBlocked
                                  ? 'rgba(244, 63, 94, 0.2)'
                                  : s.status === 'running'
                                  ? 'rgba(52, 211, 153, 0.2)'
                                  : 'rgba(251, 191, 36, 0.2)',
                                color: isBlocked ? '#f43f5e' : s.status === 'running' ? '#34d399' : '#fbbf24',
                                border: `1px solid ${isBlocked ? 'rgba(244, 63, 94, 0.35)' : 'transparent'}`
                              }}
                            >
                              {isBlocked ? `BLOCKED BY #${s.blockingSpid}` : (s.status || 'running')}
                            </span>
                          </td>
                        )}

                        {/* Command */}
                        {visibleColumns.command && (
                          <td style={{ padding: '10px 12px' }}>
                            <span
                              style={{
                                fontSize: '10.5px',
                                fontWeight: 600,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(255, 255, 255, 0.06)',
                                color: '#e2e8f0',
                                border: '1px solid rgba(255, 255, 255, 0.08)'
                              }}
                            >
                              {s.command || 'BATCH'}
                            </span>
                          </td>
                        )}

                        {/* Database */}
                        {visibleColumns.databaseName && (
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ color: '#38bdf8', fontSize: '11px', fontWeight: 600 }}>
                              {s.databaseName || 'master'}
                            </span>
                          </td>
                        )}

                        {/* Elapsed Duration */}
                        {visibleColumns.elapsed && (
                          <td style={{ padding: '10px 12px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontWeight: 600,
                                color: elapsedSec > 30 ? '#f43f5e' : elapsedSec > 5 ? '#fbbf24' : '#cbd5e1'
                              }}
                            >
                              <Clock size={11} color={elapsedSec > 30 ? '#f43f5e' : '#94a3b8'} />
                              {(elapsedSec ?? 0).toFixed(1)}s
                            </span>
                          </td>
                        )}

                        {/* Wait Type & Last Wait */}
                        {visibleColumns.waitType && (
                          <td style={{ padding: '10px 12px' }}>
                            {s.waitType ? (
                              <div>
                                <span style={{ color: '#fbbf24', fontWeight: 600 }}>{s.waitType}</span>
                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                  {((s.waitTimeMs ?? 0) / 1000).toFixed(1)}s wait
                                  {s.lastWaitType && s.lastWaitType !== s.waitType && (
                                    <span style={{ color: '#64748b' }}> • Prev: {s.lastWaitType}</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: '#64748b', fontSize: '11px' }}>None (Active on CPU)</span>
                            )}
                          </td>
                        )}

                        {/* CPU Time */}
                        {visibleColumns.cpu && (
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ color: '#e2e8f0', fontWeight: 600 }}>
                              {((s.cpuTimeMs ?? 0) / 1000).toFixed(1)}s
                            </div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>
                              {(s.cpuTimeMs ?? 0).toLocaleString()} ms
                            </div>
                          </td>
                        )}

                        {/* Logical Reads / Writes */}
                        {visibleColumns.readsWrites && (
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ color: '#cbd5e1' }}>
                              {(s.logicalReads ?? 0).toLocaleString()} reads
                            </div>
                            {(s.writes ?? 0) > 0 && (
                              <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                {(s.writes ?? 0).toLocaleString()} writes
                              </div>
                            )}
                          </td>
                        )}

                        {/* Memory Grant */}
                        {visibleColumns.memory && (
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ color: (s.grantedMemoryMb ?? 0) > 512 ? '#fbbf24' : '#94a3b8', fontWeight: 600 }}>
                              {(s.grantedMemoryMb ?? 0).toFixed(0)} MB
                            </span>
                          </td>
                        )}

                        {/* Program / Host */}
                        {visibleColumns.programHost && (
                          <td style={{ padding: '10px 12px' }}>
                            <div
                              style={{
                                color: '#e2e8f0',
                                maxWidth: '140px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={s.programName}
                            >
                              {s.programName || 'SQL Client'}
                            </div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>
                              {s.hostName || 'local'}
                            </div>
                          </td>
                        )}

                        {/* Login */}
                        {visibleColumns.login && (
                          <td style={{ padding: '10px 12px', color: '#cbd5e1', fontSize: '11px' }}>
                            {s.loginName || 'system'}
                          </td>
                        )}

                        {/* Progress */}
                        {visibleColumns.progress && (
                          <td style={{ padding: '10px 12px' }}>
                            {(s.percentComplete ?? 0) > 0 ? (
                              <div style={{ width: '80px' }}>
                                <div style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 600, marginBottom: '2px' }}>
                                  {(s.percentComplete ?? 0).toFixed(1)}%
                                </div>
                                <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                                  <div
                                    style={{
                                      width: `${Math.min(s.percentComplete ?? 0, 100)}%`,
                                      height: '100%',
                                      background: '#38bdf8'
                                    }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: '#475569', fontSize: '10.5px' }}>-</span>
                            )}
                          </td>
                        )}

                        {/* Query Preview */}
                        {visibleColumns.queryPreview && (
                          <td style={{ padding: '10px 12px', maxWidth: '280px' }}>
                            <div
                              style={{
                                fontFamily: 'Consolas, monospace',
                                fontSize: '11px',
                                color: '#94a3b8',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                cursor: 'pointer'
                              }}
                              title="Click to view complete details"
                              onClick={() => setInspectSession(s)}
                            >
                              {s.queryText || 'Query text unavailable'}
                            </div>
                          </td>
                        )}

                        {/* Actions */}
                        {visibleColumns.action && (
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setInspectSession(s)}
                                style={{ fontSize: '11px', padding: '3px 7px' }}
                                title="Open full 360° diagnostics for this session"
                              >
                                <Info size={11} color="#94a3b8" />
                                <span>Details</span>
                              </button>

                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleInspectPlan(s)}
                                disabled={selectedPlanLoading === (s.planHandle || `${s.spid}`)}
                                style={{ fontSize: '11px', padding: '3px 8px' }}
                                title="Inspect ShowPlan XML in PlanIQ visualizer"
                              >
                                {selectedPlanLoading === (s.planHandle || `${s.spid}`) ? (
                                  <RefreshCw size={11} className="spin" />
                                ) : (
                                  <Eye size={11} color="#38bdf8" />
                                )}
                                <span>Plan</span>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          PAGE: SLEEPING & IDLE SESSIONS (SYS.DM_EXEC_SESSIONS)
          ======================================================== */}
      {activeSubTab === 'sleeping' && (
        <div className="section-block radar-subtab-section">
          {/* Sleeping Sessions Table */}
          {filteredIdleSessions.length === 0 ? (
            <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', borderRadius: '10px' }}>
              <CheckCircle2 size={32} color="#34d399" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '15px', color: '#e2e8f0', margin: '0 0 6px' }}>
                {idleSessions.length === 0 ? 'Zero Sleeping Sessions' : 'No Sleeping Sessions Match Filters'}
              </h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                {idleSessions.length === 0
                  ? 'All user connections are actively executing requests.'
                  : 'Try adjusting your filter values or click "Clear Filters".'}
              </p>
            </div>
          ) : (
            <div className="glass-panel radar-table-scroll-panel">
              <table className="radar-sticky-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'rgba(15, 23, 42, 0.85)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>SPID</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Status</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Open Xacts</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Idle Duration</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Program / App Pool</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Database</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Login / Host</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Last Executed Statement</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIdleSessions.map((s) => {
                    const hasOpenXact = s.openTransactions > 0;
                    return (
                      <tr
                        key={s.spid}
                        className={`radar-data-row ${hasOpenXact ? 'is-blocked' : ''}`}
                        style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}
                      >
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: hasOpenXact ? '#f59e0b' : '#818cf8' }}>
                          #{s.spid}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              background: hasOpenXact ? 'rgba(245, 158, 11, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                              color: hasOpenXact ? '#fbbf24' : '#94a3b8',
                              border: `1px solid ${hasOpenXact ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`
                            }}
                          >
                            {hasOpenXact ? 'OPEN TRANSACTION' : s.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontWeight: 700, color: hasOpenXact ? '#f43f5e' : '#64748b' }}>
                            {s.openTransactions}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={11} color="#94a3b8" />
                            {formatDuration(s.idleSeconds)}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ color: '#e2e8f0', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.programName}>
                            {s.programName || 'SQL Client'}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ color: '#38bdf8', fontSize: '11px', fontWeight: 600 }}>
                            {s.databaseName || 'master'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ color: '#cbd5e1', fontSize: '11px' }}>{s.loginName}</div>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>{s.hostName}</div>
                        </td>
                        <td style={{ padding: '10px 12px', maxWidth: '320px' }}>
                          <div
                            style={{
                              fontFamily: 'Consolas, monospace',
                              fontSize: '11px',
                              color: '#94a3b8',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              cursor: 'pointer'
                            }}
                            title="Click to view details"
                            onClick={() => setInspectSession(s)}
                          >
                            {s.lastQueryText || 'Last statement not cached in DMV'}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setInspectSession(s)}
                              style={{ fontSize: '11px', padding: '3px 7px' }}
                            >
                              <Info size={11} color="#94a3b8" />
                              <span>Details</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleCopy(`KILL ${s.spid};`, `kill-${s.spid}`)}
                              style={{ fontSize: '11px', borderColor: hasOpenXact ? 'rgba(239, 68, 68, 0.4)' : undefined, color: hasOpenXact ? '#f87171' : undefined }}
                              title="Copy KILL statement to clipboard"
                            >
                              {copiedKey === `kill-${s.spid}` ? <Check size={11} /> : <Terminal size={11} />}
                              <span>KILL</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          PAGE: SOLARWINDS WAIT TREND STACKED BAR CHART
          ======================================================== */}
      {activeSubTab === 'waithistory' && (
        <div className="section-block radar-subtab-section radar-scrollable-block" style={{ overflowY: 'auto' }}>
          {/* Wait Trend Card Container */}
          <div className="wait-trend-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 2px', color: '#f1f5f9' }}>
                  Daily & Hourly Wait-Time Trend & Anomaly Baselines
                </h3>
                <p style={{ margin: 0, fontSize: '11.5px', color: '#94a3b8' }}>
                  Historical wait categories aggregated from SQL Server Query Store. Green indicates normal range; Red indicates anomaly spike exceeding baseline.
                </p>
              </div>

              {/* View Granularity Switcher & Chart Legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Granularity:</span>
                  <div className="radar-limit-presets" style={{ background: 'rgba(0,0,0,0.3)', padding: '2px', borderRadius: '4px' }}>
                    <button
                      type="button"
                      className={`radar-limit-pill ${waitGranularity === 'hourly' ? 'active' : ''}`}
                      onClick={() => setWaitGranularity('hourly')}
                      style={{ fontSize: '10.5px', padding: '2px 8px' }}
                      title="View individual hourly query store runtime intervals"
                    >
                      Hourly Intervals
                    </button>
                    <button
                      type="button"
                      className={`radar-limit-pill ${waitGranularity === 'daily' ? 'active' : ''}`}
                      onClick={() => setWaitGranularity('daily')}
                      style={{ fontSize: '10.5px', padding: '2px 8px' }}
                      title="Aggregate wait categories by calendar day"
                    >
                      Day-Wise Summary
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#10b981' }} />
                    <span>CPU / Memory</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#f43f5e' }} />
                    <span>Locking / Latch</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#38bdf8' }} />
                    <span>Disk I/O</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#fbbf24' }} />
                    <span>Workspace RAM</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#a855f7' }} />
                    <span>Network / Other</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Stacked Bar Chart */}
            {(() => {
              const maxWait = Math.max(1, ...displayWaitPoints.map((p) => p.totalWaitMs || 1));
              return (
                <div className="wait-chart-bars-wrap">
                  {displayWaitPoints.map((pt, i) => {
                    const isSelected = selectedHistoryPoint?.intervalLabel === pt.intervalLabel;
                    const heightPct = Math.max(14, (pt.totalWaitMs / maxWait) * 100);
                    const cpuPct = (pt.cpuWaitMs / (pt.totalWaitMs || 1)) * 100;
                    const lockPct = (pt.lockWaitMs / (pt.totalWaitMs || 1)) * 100;
                    const ioPct = (pt.ioWaitMs / (pt.totalWaitMs || 1)) * 100;
                    const memPct = (pt.memoryWaitMs / (pt.totalWaitMs || 1)) * 100;
                    const otherPct = Math.max(0, 100 - (cpuPct + lockPct + ioPct + memPct));

                    return (
                      <div
                        key={i}
                        className="wait-chart-col"
                        onClick={() => setSelectedHistoryPoint(pt)}
                        title={`${pt.intervalLabel}: ${(pt.totalWaitMs / 1000).toFixed(1)}s total wait (${pt.executionCount.toLocaleString()} queries)`}
                      >
                        {/* Anomaly Indicator Pill */}
                        <div className={`wait-anomaly-indicator ${pt.isAnomaly ? 'anomaly' : 'normal'}`}>
                          {pt.isAnomaly ? 'Spike' : 'Normal'}
                        </div>

                        {/* Stacked Vertical Bar */}
                        <div
                          className="wait-stacked-bar"
                          style={{
                            height: `${heightPct}%`,
                            border: isSelected ? '2px solid #ffffff' : undefined,
                            transform: isSelected ? 'scale(1.08)' : undefined
                          }}
                        >
                          <div className="wait-bar-segment" style={{ height: `${cpuPct}%`, background: '#10b981' }} />
                          <div className="wait-bar-segment" style={{ height: `${lockPct}%`, background: '#f43f5e' }} />
                          <div className="wait-bar-segment" style={{ height: `${ioPct}%`, background: '#38bdf8' }} />
                          <div className="wait-bar-segment" style={{ height: `${memPct}%`, background: '#fbbf24' }} />
                          <div className="wait-bar-segment" style={{ height: `${otherPct}%`, background: '#a855f7' }} />
                        </div>

                        {/* Date Label */}
                        <span className="wait-chart-label" style={{ color: isSelected ? '#38bdf8' : undefined }}>
                          {pt.intervalLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Drilldown Panel for Selected Interval */}
          {selectedHistoryPoint && (
            <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>
                    Interval Analysis: {selectedHistoryPoint.intervalLabel}
                  </span>
                  <span
                    className={`wait-anomaly-indicator ${selectedHistoryPoint.isAnomaly ? 'anomaly' : 'normal'}`}
                    style={{ position: 'static' }}
                  >
                    {selectedHistoryPoint.isAnomaly ? `ANOMALY: ${selectedHistoryPoint.anomalyReason}` : 'Within Normal Baseline'}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {selectedHistoryPoint.executionCount.toLocaleString()} Query Executions Monitored
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '10px 14px', borderRadius: '6px', borderLeft: '3px solid #10b981' }}>
                  <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>CPU / Memory Time</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#10b981' }}>
                    {(selectedHistoryPoint.cpuWaitMs / 1000).toFixed(1)}s
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>
                    {((selectedHistoryPoint.cpuWaitMs / (selectedHistoryPoint.totalWaitMs || 1)) * 100).toFixed(1)}% of interval
                  </div>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '10px 14px', borderRadius: '6px', borderLeft: '3px solid #f43f5e' }}>
                  <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Locking & Latching</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#f43f5e' }}>
                    {(selectedHistoryPoint.lockWaitMs / 1000).toFixed(1)}s
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>
                    {((selectedHistoryPoint.lockWaitMs / (selectedHistoryPoint.totalWaitMs || 1)) * 100).toFixed(1)}% of interval
                  </div>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '10px 14px', borderRadius: '6px', borderLeft: '3px solid #38bdf8' }}>
                  <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Buffer & Disk I/O</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#38bdf8' }}>
                    {(selectedHistoryPoint.ioWaitMs / 1000).toFixed(1)}s
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>
                    {((selectedHistoryPoint.ioWaitMs / (selectedHistoryPoint.totalWaitMs || 1)) * 100).toFixed(1)}% of interval
                  </div>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '10px 14px', borderRadius: '6px', borderLeft: '3px solid #fbbf24' }}>
                  <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Workspace RAM Grants</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#fbbf24' }}>
                    {(selectedHistoryPoint.memoryWaitMs / 1000).toFixed(1)}s
                  </div>
                  <div style={{ fontSize: '10px', color: '#64748b' }}>
                    {((selectedHistoryPoint.memoryWaitMs / (selectedHistoryPoint.totalWaitMs || 1)) * 100).toFixed(1)}% of interval
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          PAGE 4: VISUAL BLOCKING TREE & LOCK HIERARCHY
          ======================================================== */}
      {activeSubTab === 'blocking' && (
        <div className="section-block radar-subtab-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px', color: '#f1f5f9' }}>
                Head-Blocker Hierarchy & Lock Wait Analysis
              </h3>
              <p style={{ margin: 0, fontSize: '11.5px', color: '#94a3b8' }}>
                Extracted from <code>sys.dm_os_waiting_tasks</code> and <code>sys.dm_tran_locks</code>. Identifies root blocker SPID and victim cascade.
              </p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm radar-ctrl-btn" onClick={fetchData} disabled={isLoading}>
              <RefreshCw size={11} className={isLoading ? 'spin' : ''} />
              <span>Poll Locks</span>
            </button>
          </div>

          {blockingSessions.length === 0 ? (
            <div className="glass-panel" style={{ padding: '36px', textAlign: 'center', borderRadius: '10px' }}>
              <CheckCircle2 size={36} color="#34d399" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '15px', color: '#e2e8f0', margin: '0 0 6px' }}>
                Zero Blocking Lock Contention Detected
              </h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                No active processes are currently blocked or waiting on resource locks.
              </p>
            </div>
          ) : (
            <div className="radar-scrollable-block" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(() => {
                const rootGroups: Record<number, LiveBlockingSession[]> = {};
                blockingSessions.forEach((b) => {
                  if (!rootGroups[b.rootBlockerSpid]) rootGroups[b.rootBlockerSpid] = [];
                  rootGroups[b.rootBlockerSpid].push(b);
                });

                return Object.entries(rootGroups).map(([rootSpidStr, victims]) => {
                  const rootSpid = parseInt(rootSpidStr, 10);
                  const first = victims[0];
                  const rootIdle = idleSessions.find((s) => s.spid === rootSpid);
                  const hasOpenXact = (rootIdle?.openTransactions ?? 0) > 0;

                  return (
                    <div key={rootSpid} className="blocking-tree-card">
                      {/* Root Blocker Node */}
                      <div className="blocking-tree-root">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              background: '#ef4444',
                              color: '#ffffff',
                              padding: '3px 9px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 800,
                              letterSpacing: '0.4px',
                              boxShadow: '0 0 10px rgba(239, 68, 68, 0.4)'
                            }}
                          >
                            ROOT BLOCKER SPID #{rootSpid}
                          </span>
                          <span style={{ fontSize: '11.5px', color: '#cbd5e1' }}>
                            Status: <strong style={{ color: '#f1f5f9' }}>{first.rootBlockerStatus}</strong> • App: <strong>{first.rootBlockerProgram || 'SQL Client'}</strong> • User: {first.rootBlockerLogin || 'System'}
                          </span>
                          <span
                            style={{
                              fontSize: '10.5px',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: 'rgba(251, 191, 36, 0.2)',
                              color: '#fbbf24',
                              border: '1px solid rgba(251, 191, 36, 0.4)'
                            }}
                          >
                            Holding {first.lockMode} on {first.lockResource}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleCopy(`KILL ${rootSpid};`, `kill-${rootSpid}`)}
                            style={{ fontSize: '11px', borderColor: 'rgba(239, 68, 68, 0.5)', color: '#f87171' }}
                            title="Copy KILL statement for root blocker"
                          >
                            {copiedKey === `kill-${rootSpid}` ? <Check size={11} /> : <Terminal size={11} />}
                            <span>KILL #{rootSpid}</span>
                          </button>
                        </div>
                      </div>

                      {hasOpenXact && (
                        <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.35)', padding: '6px 12px', borderRadius: '4px', margin: '8px 0', fontSize: '11.5px', color: '#fef3c7', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <AlertTriangle size={13} color="#fbbf24" />
                          <span><strong>Rollback Alert:</strong> This session has uncommitted open transactions. If killed, SQL Server will roll back all in-flight row modifications.</span>
                        </div>
                      )}

                      {first.rootBlockerQuery && (
                        <div style={{ margin: '8px 0', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '6px', fontSize: '11px', fontFamily: 'Consolas, monospace', color: '#94a3b8' }}>
                          {first.rootBlockerQuery}
                        </div>
                      )}

                      {/* Tree Branch Connecting Victims */}
                      <div className="blocking-tree-children">
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                          └─► Blocked Victim Sessions ({victims.length} Waiting):
                        </div>
                        {victims.map((vic, vIdx) => (
                          <div key={vIdx} className="blocking-victim-node">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#fbbf24' }}>
                                  Victim SPID #{vic.blockedSpid}
                                </span>
                                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                  Waiting <strong style={{ color: '#f43f5e' }}>{((vic.blockedWaitTimeMs || 0) / 1000).toFixed(1)}s</strong> on <code>{vic.blockedWaitType}</code>
                                </span>
                                <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                                  ({vic.blockedLogin} @ {vic.blockedProgram})
                                </span>
                              </div>

                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleCopy(`KILL ${vic.blockedSpid};`, `kill-${vic.blockedSpid}`)}
                                style={{ fontSize: '10px', padding: '2px 6px' }}
                              >
                                {copiedKey === `kill-${vic.blockedSpid}` ? <Check size={10} /> : <Terminal size={10} />}
                                <span>KILL #{vic.blockedSpid}</span>
                              </button>
                            </div>

                            <div style={{ fontSize: '10.5px', fontFamily: 'Consolas, monospace', color: '#cbd5e1', background: 'rgba(0,0,0,0.25)', padding: '6px 10px', borderRadius: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {vic.blockedQuery || 'Query text unavailable'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          PAGE 3: WAIT STATISTICS ENGINE (SYS.DM_OS_WAIT_STATS)
          ======================================================== */}
      {activeSubTab === 'waits' && (
        <div className="section-block radar-subtab-section">
          <div className="glass-panel radar-table-scroll-panel">
            <table className="radar-sticky-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.85)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Wait Type</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Category</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Wait Time (sec)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>% of Total Waits</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Waiting Tasks</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Prescription & Tuning Advice</th>
                </tr>
              </thead>
              <tbody>
                {filteredWaitStats.map((w) => (
                  <tr key={w.waitType} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#fbbf24' }}>
                      {w.waitType}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(56, 189, 248, 0.15)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.3)'
                        }}
                      >
                        {w.waitCategory}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#e2e8f0', fontWeight: 600 }}>
                      {((w.waitTimeMs ?? 0) / 1000).toFixed(1)}s
                    </td>
                    <td style={{ padding: '10px 12px', width: '160px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(w.percentage ?? 0, 100)}%`,
                              height: '100%',
                              background: (w.percentage ?? 0) > 25 ? '#f43f5e' : (w.percentage ?? 0) > 10 ? '#fbbf24' : '#38bdf8'
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#f1f5f9', minWidth: '40px' }}>
                          {(w.percentage ?? 0).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                      {(w.waitingTasksCount ?? 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', maxWidth: '380px' }}>
                      <div style={{ fontSize: '11px', color: '#cbd5e1', marginBottom: '2px' }}>
                        {w.description}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#34d399' }}>
                        💡 {w.recommendation}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          PAGE 4: QUERY STORE TOP BOTTLENECKS
          ======================================================== */}
      {activeSubTab === 'querystore' && (
        <div className="section-block radar-subtab-section">
          <div className="glass-panel radar-table-scroll-panel">
            <table className="radar-sticky-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Query / Plan ID</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Executions</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Total CPU</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Avg Duration</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Total Reads</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>TempDB Spills</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Last Executed</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Query Text</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueryStore.map((e) => (
                  <tr key={`${e.queryId}-${e.planId}`} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '10px 12px', color: '#38bdf8', fontWeight: 600 }}>
                      Q#{e.queryId} <span style={{ color: '#64748b' }}>/ P#{e.planId}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                      {(e.executionCount ?? 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#f43f5e', fontWeight: 600 }}>
                      {((e.totalCpuMs ?? 0) / 1000).toFixed(1)}s
                    </td>
                    <td style={{ padding: '10px 12px', color: '#fbbf24' }}>
                      {(e.avgDurationMs ?? 0).toFixed(1)}ms
                    </td>
                    <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                      {(e.totalLogicalReads ?? 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {(e.totalSpillsMb ?? 0) > 0 ? (
                        <span style={{ color: '#f43f5e', fontWeight: 600 }}>{(e.totalSpillsMb ?? 0).toFixed(1)}MB</span>
                      ) : (
                        <span style={{ color: '#64748b' }}>0 MB</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '11px' }}>
                      {e.lastExecutionTime || 'Recent'}
                    </td>
                    <td style={{ padding: '10px 12px', maxWidth: '300px' }}>
                      <div
                        style={{
                          fontFamily: 'Consolas, monospace',
                          fontSize: '11px',
                          color: '#94a3b8',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={e.queryText}
                      >
                        {e.queryText}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleOpenQueryStorePlan(e)}
                        style={{ fontSize: '11px', padding: '3px 8px' }}
                        title="Load this Query Store plan into PlanIQ visualizer and AI doctor"
                      >
                        <Zap size={11} />
                        <span>Load Plan</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          PAGE 5: LIVE DEADLOCKS
          ======================================================== */}
      {activeSubTab === 'deadlocks' && (
        <div className="section-block radar-subtab-section">
          <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
              Recent Deadlocks from `system_health` Extended Events Buffer (Showing {deadlocks.length})
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="radar-limit-ctrl" title="Configure maximum deadlocks retrieved (Default: 15)">
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Limit:</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="radar-limit-input"
                  value={deadlocksLimitInput}
                  onChange={(e) => setDeadlocksLimitInput(e.target.value)}
                  onBlur={() => applyDeadlocksLimit(deadlocksLimitInput)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyDeadlocksLimit(deadlocksLimitInput);
                  }}
                  title="Type custom limit and press Enter (Default: 15)"
                />
                <div className="radar-limit-presets">
                  {[10, 15, 25, 50].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`radar-limit-pill ${deadlocksLimit === val ? 'active' : ''}`}
                      onClick={() => applyDeadlocksLimit(val)}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={fetchData} disabled={isLoading}>
                <RefreshCw size={11} className={isLoading ? 'spin' : ''} />
                <span>Poll Buffer</span>
              </button>
            </div>
          </div>

          {deadlocks.length === 0 ? (
            <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', borderRadius: '10px' }}>
              <CheckCircle2 size={32} color="#34d399" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '15px', color: '#e2e8f0', margin: '0 0 6px' }}>
                Zero Deadlocks in system_health Buffer
              </h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                No deadlock events found in the ring buffer target for the active session window.
              </p>
            </div>
          ) : (
            <div className="radar-scrollable-block" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {deadlocks.map((dl, idx) => (
                <div
                  key={idx}
                  className="glass-panel"
                  style={{
                    padding: '14px 18px',
                    borderRadius: '8px',
                    borderLeft: '4px solid #f43f5e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span
                        style={{
                          background: 'rgba(244, 63, 94, 0.2)',
                          color: '#f43f5e',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        Victim SPID #{dl.victimSpid}
                      </span>
                      <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 600 }}>
                        {dl.deadlockType || 'Reverse Order Lock Acquisition'}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {dl.timestamp}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1' }}>
                      {dl.summary}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleOpenDeadlock(dl)}
                    style={{ background: '#f43f5e', borderColor: '#f43f5e', fontSize: '11.5px' }}
                  >
                    <ShieldAlert size={12} />
                    <span>View Deadlock Graph</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          PAGE: BUFFER POOL RAM INSPECTOR
          ======================================================== */}
      {activeSubTab === 'bufferpool' && (
        <div className="section-block radar-subtab-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px', color: '#f1f5f9' }}>
                Buffer Pool RAM Inspector (Where is my Memory going?)
              </h3>
              <p style={{ margin: 0, fontSize: '11.5px', color: '#94a3b8' }}>
                Harvested from database partition cache & storage allocation. Displays tables and indexes consuming SQL Server RAM.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="radar-limit-ctrl" title="Configure maximum cached objects shown (Default: 50)">
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Limit:</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  className="radar-limit-input"
                  value={bufferLimitInput}
                  onChange={(e) => setBufferLimitInput(e.target.value)}
                  onBlur={() => applyBufferLimit(bufferLimitInput)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyBufferLimit(bufferLimitInput);
                  }}
                  title="Type custom limit and press Enter (Default: 50)"
                />
                <div className="radar-limit-presets">
                  {[25, 50, 100, 200].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`radar-limit-pill ${bufferLimit === val ? 'active' : ''}`}
                      onClick={() => applyBufferLimit(val)}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm radar-ctrl-btn" onClick={fetchData} disabled={isLoading}>
                <RefreshCw size={11} className={isLoading ? 'spin' : ''} />
                <span>Poll Buffer Cache</span>
              </button>
            </div>
          </div>

          {bufferPoolError && (
            <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#fca5a5', fontSize: '12px', marginBottom: '12px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: '#f87171' }}>Buffer Pool Query Error:</strong> {bufferPoolError}
                <div style={{ marginTop: '4px', color: '#cbd5e1', fontSize: '11px' }}>
                  Note: Inspecting <code>sys.dm_os_buffer_descriptors</code> requires <code>VIEW SERVER STATE</code> (SQL Server 2019 and earlier) or <code>VIEW SERVER PERFORMANCE STATE</code> (SQL Server 2022) permission for this login.
                </div>
              </div>
            </div>
          )}

          <div className="glass-panel radar-table-scroll-panel">
            <table className="radar-sticky-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Database & Object</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Index & Type</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Cached RAM (MB)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>% of Buffer Cache</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Clean vs Dirty Ratio</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Row Count</th>
                </tr>
              </thead>
              <tbody>
                {bufferPool.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center', color: '#94a3b8' }}>
                      {isLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <RefreshCw size={22} className="spin" style={{ color: '#38bdf8' }} />
                          <span style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 600 }}>Scanning SQL Server RAM buffer descriptors...</span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>Inspecting in-memory cache allocation units (typically takes 15–25s on large production servers)</span>
                        </div>
                      ) : bufferPoolError ? (
                        <div style={{ color: '#fca5a5' }}>
                          Unable to retrieve buffer pool metrics. Please verify SQL Server permissions above.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                          <Database size={24} style={{ color: '#64748b' }} />
                          <span style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 600 }}>No cached tables currently resident in Buffer Pool</span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            Click "Poll Buffer Cache" to rescan in-memory data pages for this database.
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  bufferPool.map((b, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700, color: '#f1f5f9' }}>
                          {b.schemaName}.{b.objectName}
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                          {b.databaseName}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ color: '#38bdf8', fontWeight: 600 }}>{b.indexName}</div>
                        <span style={{ fontSize: '10px', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '3px' }}>
                          {b.indexType}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#e2e8f0' }}>
                        {b.bufferSizeMb.toFixed(1)} MB
                      </td>
                      <td style={{ padding: '10px 12px', width: '140px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(b.percentageOfBuffer || 0, 100)}%`, height: '100%', background: '#38bdf8' }} />
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', minWidth: '36px' }}>
                            {(b.percentageOfBuffer || 0).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', minWidth: '160px' }}>
                        <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span style={{ color: '#38bdf8' }}>Clean: {b.cleanPagesMb.toFixed(1)} MB</span>
                          <span style={{ color: '#f59e0b' }}>Dirty: {b.dirtyPagesMb.toFixed(1)} MB</span>
                        </div>
                        <div className="buffer-ratio-bar">
                          <div className="buffer-clean-seg" style={{ width: `${(b.cleanPagesMb / (b.bufferSizeMb || 1)) * 100}%` }} />
                          <div className="buffer-dirty-seg" style={{ width: `${(b.dirtyPagesMb / (b.bufferSizeMb || 1)) * 100}%` }} />
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                        {b.rowCount > 0 ? b.rowCount.toLocaleString() : 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          PAGE 8: INDEX HYGIENE & WASTE ANALYZER
          Includes:
          1. Missing Indexes (DMVs)
          2. Unused Indexes (Zero Seeks, High Writes)
          3. Duplicate & Redundant Indexes (Overlapping Prefix)
          ======================================================== */}
      {activeSubTab === 'indexes' && (
        <div className="section-block radar-subtab-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 2px', color: '#f1f5f9' }}>
                Index Hygiene & Waste Engine
              </h3>
              <p style={{ margin: 0, fontSize: '11.5px', color: '#94a3b8' }}>
                Comprehensive multi-dimensional analysis: Missing indexes, write-burden unused indexes, and duplicate indexes.
              </p>
            </div>

            {/* 3-Way Sub-Segment Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(15, 23, 42, 0.7)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <button
                type="button"
                className={`btn btn-sm ${indexSubTab === 'missing' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setIndexSubTab('missing')}
                style={{ fontSize: '11px', padding: '3px 10px' }}
              >
                <span>Missing Indexes</span>
                <span style={{ fontSize: '10px', opacity: 0.8 }}>({missingIndexes.length})</span>
              </button>

              <button
                type="button"
                className={`btn btn-sm ${indexSubTab === 'unused' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setIndexSubTab('unused')}
                style={{ fontSize: '11px', padding: '3px 10px', background: indexSubTab === 'unused' ? '#f43f5e' : undefined, borderColor: indexSubTab === 'unused' ? '#f43f5e' : undefined }}
              >
                <span>Unused Indexes</span>
                <span style={{ fontSize: '10px', opacity: 0.8 }}>({unusedIndexes.length})</span>
              </button>

              <button
                type="button"
                className={`btn btn-sm ${indexSubTab === 'duplicate' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setIndexSubTab('duplicate')}
                style={{ fontSize: '11px', padding: '3px 10px' }}
              >
                <span>Duplicates</span>
                <span style={{ fontSize: '10px', opacity: 0.8 }}>({duplicateIndexes.length})</span>
              </button>
            </div>
          </div>

          {/* VIEW A: MISSING INDEXES */}
          {indexSubTab === 'missing' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                <div className="radar-limit-ctrl" title="Configure maximum missing indexes harvested (Default: 30)">
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Limit:</span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    className="radar-limit-input"
                    value={indexesLimitInput}
                    onChange={(e) => setIndexesLimitInput(e.target.value)}
                    onBlur={() => applyIndexesLimit(indexesLimitInput)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') applyIndexesLimit(indexesLimitInput);
                    }}
                    title="Type custom limit and press Enter (Default: 30)"
                  />
                  <div className="radar-limit-presets">
                    {[15, 30, 50, 100].map((val) => (
                      <button
                        key={val}
                        type="button"
                        className={`radar-limit-pill ${indexesLimit === val ? 'active' : ''}`}
                        onClick={() => applyIndexesLimit(val)}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="radar-scrollable-block" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {missingIndexes.map((idx, i) => (
                  <div
                    key={i}
                    className="glass-panel"
                    style={{
                      padding: '16px',
                      borderRadius: '10px',
                      borderLeft: '4px solid #34d399'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>
                          {idx.tableName}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: 'rgba(52, 211, 153, 0.2)',
                            color: '#34d399',
                            border: '1px solid rgba(52, 211, 153, 0.4)'
                          }}
                        >
                          Impact: {(idx.impactScore ?? 0).toFixed(1)}% Cost Reduction
                        </span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          Seeks: {(idx.userSeeks ?? 0).toLocaleString()} • Scans: {(idx.userScans ?? 0).toLocaleString()}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleCopy(idx.createIndexStatement, `idx-${i}`)}
                        style={{ fontSize: '11px' }}
                      >
                        {copiedKey === `idx-${i}` ? <Check size={11} /> : <Copy size={11} />}
                        <span>Copy CREATE INDEX</span>
                      </button>
                    </div>

                    <div style={{ fontSize: '11.5px', color: '#cbd5e1', marginBottom: '8px' }}>
                      Equality: <strong>{idx.equalityColumns || 'None'}</strong> • Inequality: <strong>{idx.inequalityColumns || 'None'}</strong> • Include: <strong>{idx.includedColumns || 'None'}</strong>
                    </div>

                    <pre
                      style={{
                        background: 'rgba(15, 23, 42, 0.8)',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        color: '#a5b4fc',
                        fontFamily: 'Consolas, monospace',
                        margin: 0,
                        overflowX: 'auto'
                      }}
                    >
                      {idx.createIndexStatement}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW B: UNUSED INDEXES (WRITE & STORAGE WASTE) */}
          {indexSubTab === 'unused' && (
            <div>
              <div style={{ background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.3)', padding: '10px 14px', borderRadius: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: '#fecdd3' }}>
                  <strong>Write Overhead Warning:</strong> These indexes receive continuous writes (INSERT, UPDATE, DELETE) but have recorded <strong>0 user seeks, scans, or lookups</strong>. They slow down database write operations and consume RAM and disk space needlessly.
                </span>
              </div>

              <div className="glass-panel radar-table-scroll-panel">
                <table className="radar-sticky-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Table</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Unused Index Name</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Index Size (MB)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>User Writes</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>User Reads</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unusedIndexes.map((u, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#f1f5f9' }}>
                          {u.schemaName}.{u.tableName}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#f43f5e', fontWeight: 600 }}>
                          {u.indexName}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>
                          {u.indexSizeMb.toFixed(1)} MB
                        </td>
                        <td style={{ padding: '10px 12px', color: '#f59e0b', fontWeight: 700 }}>
                          {u.userWrites.toLocaleString()} writes
                        </td>
                        <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                          0 seeks / 0 scans
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleCopy(u.dropStatement, `drop-unused-${i}`)}
                            style={{ fontSize: '11px', borderColor: 'rgba(244, 63, 94, 0.4)', color: '#f43f5e' }}
                            title="Copy DROP INDEX statement"
                          >
                            {copiedKey === `drop-unused-${i}` ? <Check size={11} /> : <Trash2 size={11} />}
                            <span>Copy DROP INDEX</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW C: DUPLICATE & REDUNDANT INDEXES */}
          {indexSubTab === 'duplicate' && (
            <div>
              <div style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '10px 14px', borderRadius: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: '#e0f2fe' }}>
                  <strong>Redundancy Detection:</strong> These indexes share identical left-prefix key columns with other existing indexes on the same table, making them redundant and wasting storage.
                </span>
              </div>

              <div className="glass-panel radar-table-scroll-panel">
                <table className="radar-sticky-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Table</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Redundant Index</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Duplicate / Subsumed By</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Key Columns</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Overlap Type</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicateIndexes.map((d, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#f1f5f9' }}>
                          {d.tableName}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#fbbf24', fontWeight: 600 }}>
                          {d.indexName}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#38bdf8' }}>
                          {d.duplicateOf}
                        </td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '11px', color: '#cbd5e1' }}>
                          {d.indexCols}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: d.overlapType === 'Exact Duplicate' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(251, 191, 36, 0.2)',
                              color: d.overlapType === 'Exact Duplicate' ? '#f43f5e' : '#fbbf24'
                            }}
                          >
                            {d.overlapType}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleCopy(d.dropStatement, `drop-dup-${i}`)}
                            style={{ fontSize: '11px', borderColor: 'rgba(251, 191, 36, 0.4)', color: '#fbbf24' }}
                            title="Copy DROP INDEX statement"
                          >
                            {copiedKey === `drop-dup-${i}` ? <Check size={11} /> : <Trash2 size={11} />}
                            <span>Copy DROP</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          PAGE 7: TEMPDB ALLOCATION & MEMORY USAGE
          ======================================================== */}
      {activeSubTab === 'tempdb' && (
        <div className="section-block radar-subtab-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px', color: '#f1f5f9' }}>
                TempDB Space Allocation per Active Request
              </h3>
              <p style={{ margin: 0, fontSize: '11.5px', color: '#94a3b8' }}>
                Harvested from <code>sys.dm_db_task_space_usage</code>. Shows user temporary tables (#tables) and internal hash/sort spill workspace.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="radar-limit-ctrl" title="Configure maximum active tasks analyzed for TempDB workspace (Default: 100)">
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Limit:</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  className="radar-limit-input"
                  value={tempDbLimitInput}
                  onChange={(e) => setTempDbLimitInput(e.target.value)}
                  onBlur={() => applyTempDbLimit(tempDbLimitInput)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyTempDbLimit(tempDbLimitInput);
                  }}
                  title="Type custom limit and press Enter (Default: 100)"
                />
                <div className="radar-limit-presets">
                  {[50, 100, 200, 500].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`radar-limit-pill ${tempDbLimit === val ? 'active' : ''}`}
                      onClick={() => applyTempDbLimit(val)}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm radar-ctrl-btn" onClick={fetchData} disabled={isLoading}>
                <RefreshCw size={11} className={isLoading ? 'spin' : ''} />
                <span>Poll TempDB</span>
              </button>
            </div>
          </div>

          <div className="glass-panel radar-table-scroll-panel">
            <table className="radar-sticky-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>SPID</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>User #Temp Alloc (MB)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Internal Spill Alloc (MB)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>User / Program</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Active Statement</th>
                </tr>
              </thead>
              <tbody>
                {tempDbUsage.map((tdb) => (
                  <tr key={tdb.spid} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#38bdf8' }}>
                      #{tdb.spid}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                      {(tdb.userObjectsAllocMb ?? 0).toFixed(1)} MB
                    </td>
                    <td style={{ padding: '10px 12px', color: (tdb.internalObjectsAllocMb ?? 0) > 100 ? '#f43f5e' : '#fbbf24', fontWeight: 600 }}>
                      {(tdb.internalObjectsAllocMb ?? 0).toFixed(1)} MB
                    </td>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                      {tdb.loginName} @ {tdb.programName}
                    </td>
                    <td style={{ padding: '10px 12px', maxWidth: '380px' }}>
                      <div
                        style={{
                          fontFamily: 'Consolas, monospace',
                          fontSize: '11px',
                          color: '#94a3b8',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {tdb.queryText || 'Query text unavailable'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          PAGE 8: SERVER VITALS
          ======================================================== */}
      {activeSubTab === 'vitals' && (
        <div className="section-block radar-subtab-section">
          <div className="radar-scrollable-block">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            {/* CPU Queue */}
            <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#94a3b8', fontSize: '12px' }}>
                <Cpu size={16} color="#38bdf8" />
                <span>CPU Queue & Scheduler</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: (vitals?.cpuQueueTasks || 0) > 0 ? '#fbbf24' : '#34d399' }}>
                {vitals?.cpuQueueTasks ?? 0}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                Runnable tasks waiting for CPU slice. Signal wait: {(vitals?.signalWaitPct ?? 0).toFixed(1)}%
              </p>
            </div>

            {/* Memory Grants */}
            <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#94a3b8', fontSize: '12px' }}>
                <Activity size={16} color="#818cf8" />
                <span>Memory Grants Pending</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: (vitals?.memoryGrantsPending || 0) > 0 ? '#f43f5e' : '#34d399' }}>
                {vitals?.memoryGrantsPending ?? 0}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                Queries stalled waiting for workspace memory grants on RESOURCE_SEMAPHORE.
              </p>
            </div>

            {/* TempDB Space */}
            <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#94a3b8', fontSize: '12px' }}>
                <HardDrive size={16} color="#fbbf24" />
                <span>TempDB Physical Space</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9' }}>
                {((vitals?.tempDbUserObjectsMb ?? 0) + (vitals?.tempDbInternalMb ?? 0)).toFixed(1)} MB
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                User #temp tables: {(vitals?.tempDbUserObjectsMb ?? 0).toFixed(1)} MB • Hash/Sort spills: {(vitals?.tempDbInternalMb ?? 0).toFixed(1)} MB
              </p>
            </div>

            {/* Batch Requests */}
            <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#94a3b8', fontSize: '12px' }}>
                <TrendingUp size={16} color="#34d399" />
                <span>Batch Requests / Sec</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#34d399' }}>
                {(vitals?.batchRequestsPerSec ?? 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                Instantaneous SQL Server throughput rate across all active connections.
              </p>
            </div>
          </div>
        </div>
        </div>
      )}
      </div> {/* Closing radar-content-area */}

      {/* ========================================================
          SESSION 360° INSPECTION MODAL (FULL METRICS + KILL SCRIPT)
          ======================================================== */}
      {inspectSession && (
        <div className="radar-modal-overlay" onClick={() => setInspectSession(null)}>
          <div className="radar-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Activity size={18} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>
                  Live Session Diagnostic Inspector: SPID #{inspectSession.spid}
                </h3>
              </div>
              <button
                type="button"
                className="radar-filter-remove-btn"
                onClick={() => setInspectSession(null)}
                style={{ width: '24px', height: '24px' }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Status / Command</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>
                    {(inspectSession.status || '').toUpperCase()} ({inspectSession.command || ''})
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Elapsed Duration</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>
                    {((inspectSession.totalElapsedTimeMs ?? 0) / 1000).toFixed(2)} seconds
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>CPU Time</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#fbbf24' }}>
                    {((inspectSession.cpuTimeMs ?? 0) / 1000).toFixed(2)} seconds
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Logical Reads / Writes</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#cbd5e1' }}>
                    {(inspectSession.logicalReads ?? 0).toLocaleString()} / {(inspectSession.writes ?? 0).toLocaleString()}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Memory Grant</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#818cf8' }}>
                    {(inspectSession.grantedMemoryMb ?? 0).toFixed(1)} MB
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Blocking SPID</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: (inspectSession.blockingSpid ?? 0) > 0 ? '#f43f5e' : '#34d399' }}>
                    {(inspectSession.blockingSpid ?? 0) > 0 ? `Blocked by #${inspectSession.blockingSpid}` : 'None (Not Blocked)'}
                  </div>
                </div>
              </div>

              {/* Wait Info */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24', marginBottom: '4px' }}>
                  Wait State Details:
                </div>
                <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                  Current Wait: <strong>{inspectSession.waitType || 'None (Active on CPU)'}</strong> • Wait Duration: <strong>{((inspectSession.waitTimeMs ?? 0) / 1000).toFixed(2)}s</strong> • Last Wait: {inspectSession.lastWaitType || 'None'}
                </div>
              </div>

              {/* Query Text */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#f1f5f9' }}>Active T-SQL Query Text:</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopy(inspectSession.queryText, 'modal-qtext')}
                    style={{ fontSize: '11px' }}
                  >
                    {copiedKey === 'modal-qtext' ? <Check size={11} /> : <Copy size={11} />}
                    <span>Copy Query</span>
                  </button>
                </div>
                <pre
                  style={{
                    background: 'rgba(0, 0, 0, 0.4)',
                    padding: '12px',
                    borderRadius: '8px',
                    fontSize: '11.5px',
                    color: '#94a3b8',
                    fontFamily: 'Consolas, monospace',
                    margin: 0,
                    maxHeight: '180px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {inspectSession.queryText || 'Query text not available'}
                </pre>
              </div>

              {/* Plan Handle & Handles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#64748b', minWidth: '80px' }}>Plan Handle:</span>
                  <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{inspectSession.planHandle || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#64748b', minWidth: '80px' }}>SQL Handle:</span>
                  <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{inspectSession.sqlHandle || 'N/A'}</span>
                </div>
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleCopy(`KILL ${inspectSession.spid};`, 'kill-modal')}
                  style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171' }}
                >
                  {copiedKey === 'kill-modal' ? <Check size={11} /> : <Terminal size={11} />}
                  <span>Copy KILL {inspectSession.spid};</span>
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setInspectSession(null)}
                  >
                    Close
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      const s = inspectSession;
                      setInspectSession(null);
                      handleInspectPlan(s);
                    }}
                  >
                    <Eye size={12} />
                    <span>Inspect Plan in PlanIQ Visualizer</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
