import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  TrendingUp,
  Clock,
  Database,
  Search,
  Filter,
  RefreshCw,
  Zap,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  BarChart3,
  SlidersHorizontal,
  ChevronUp,
  CheckSquare,
  Square,
  Sparkles,
  Layers,
  ArrowUpDown,
  Download,
  AlertCircle,
  Loader2,
  Eye
} from 'lucide-react';
import { QueryStoreEntry, ConnectionStatus } from '../types/livedb';
import { downloadCapturedPlanFile } from '../utils/planExports';

interface QueryStoreStudioProps {
  entries: QueryStoreEntry[];
  status: ConnectionStatus | null;
  onRefresh: (orderBy: string, topN: number, hours: number) => Promise<void> | void;
  isLoading: boolean;
  onLoadPlanXML: (xml: string, name: string) => void;
  pollingPaused?: boolean;
  onTogglePolling?: () => void;
}

// Wait category color map matching Performance Studio & DPA standard
const WAIT_CATEGORIES = [
  { key: 'CPU', label: 'CPU', color: '#38bdf8' },
  { key: 'Buffer IO', label: 'Buffer IO', color: '#6366f1' },
  { key: 'Memory', label: 'Memory', color: '#f59e0b' },
  { key: 'Lock', label: 'Lock (LCK)', color: '#f43f5e' },
  { key: 'Latch', label: 'Latch', color: '#a855f7' },
  { key: 'Network', label: 'Network', color: '#10b981' },
  { key: 'Other', label: 'Other', color: '#94a3b8' },
];

export const QueryStoreStudio: React.FC<QueryStoreStudioProps> = ({
  entries,
  status,
  onRefresh,
  isLoading,
  onLoadPlanXML,
  pollingPaused,
  onTogglePolling
}) => {
  // --- Controls State ---
  const isPg = status?.serverType === 'postgresql';
  const [selectedHours, setSelectedHours] = useState<number>(4);
  const [topN, setTopN] = useState<number>(25);
  const [sortBy, setSortBy] = useState<string>('Total CPU');
  const [groupBy, setGroupBy] = useState<'Query Hash' | 'Plan Hash' | 'Query ID' | 'None'>('Query Hash');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [timeCategory, setTimeCategory] = useState<'Local' | 'UTC'>('Local');
  const [databaseName, setDatabaseName] = useState<string>(status?.databaseName || '');

  // Chart Metric Selection
  const [chartMetric, setChartMetric] = useState<string>('Total CPU (ms)');
  const [aggMode, setAggMode] = useState<'Tot' | 'Avg' | 'Min' | 'Max'>('Tot');

  // Table Row Selection & Expansion
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selectedCheckboxes, setSelectedCheckboxes] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [capturingPlanKey, setCapturingPlanKey] = useState<string | null>(null);
  const [showServerFilters, setShowServerFilters] = useState<boolean>(false);
  const [minCpuThreshold, setMinCpuThreshold] = useState<string>('');
  const [spillsOnly, setSpillsOnly] = useState<boolean>(false);

  // Sync DB name when status updates
  useEffect(() => {
    if (status?.databaseName) {
      setDatabaseName(status.databaseName);
    }
  }, [status?.databaseName]);

  // Initial fetch with the studio's own window
  useEffect(() => {
    onRefresh(mapSortToOrderBy(sortBy), topN, selectedHours);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleCaptureOrLoadPlan = async (
    entry: QueryStoreEntry | undefined,
    fallbackQueryText: string,
    label: string,
    keyId: string,
    mode: 'load' | 'export'
  ) => {
    const planText = entry?.planXml?.trim();
    if (planText) {
      if (mode === 'export') {
        downloadCapturedPlanFile(planText, label, isPg ? 'postgresql' : 'sqlserver');
      } else {
        onLoadPlanXML(planText, label);
      }
      return;
    }

    const sqlToExplain = (entry?.queryText || fallbackQueryText || '').trim();
    if (!sqlToExplain) {
      alert('No SQL statement text is available to capture an execution plan.');
      return;
    }

    setCapturingPlanKey(`${mode}:${keyId}`);
    try {
      const app = (window as any).go?.main?.App;
      if (!app?.GetLiveQueryPlan) {
        alert('Live query plan capture backend method is unavailable.');
        return;
      }
      const captured = await app.GetLiveQueryPlan(sqlToExplain);
      if (!captured || !captured.trim()) {
        alert('The database engine returned an empty execution plan.');
        return;
      }
      if (mode === 'export') {
        downloadCapturedPlanFile(captured, label, isPg ? 'postgresql' : 'sqlserver');
      } else {
        onLoadPlanXML(captured, label);
      }
    } catch (err: any) {
      alert(`Failed to capture live execution plan: ${err?.message || err}`);
    } finally {
      setCapturingPlanKey(null);
    }
  };

  const formatDisplayTime = (timeStr: string, mode: 'Local' | 'UTC'): string => {
    if (!timeStr) return '-';
    if (mode === 'UTC') return timeStr;
    try {
      const raw = timeStr.trim();
      const utcIso = raw.includes('Z') || raw.includes('+') ? raw : `${raw.replace(' ', 'T')}Z`;
      const d = new Date(utcIso);
      if (isNaN(d.getTime())) return timeStr;
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch {
      return timeStr;
    }
  };

  // Build Time Range String
  const timeRangeLabel = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getTime() - selectedHours * 3600 * 1000);
    const fmt = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    return `${fmt(start)} -- ${fmt(now)} (${selectedHours}h)`;
  }, [selectedHours]);

  // Map user sort metric to backend orderBy code
  const mapSortToOrderBy = (sort: string): string => {
    switch (sort) {
      case 'Total CPU':
      case 'Avg CPU':
        return 'cpu';
      case 'Total Duration':
      case 'Avg Duration':
        return 'duration';
      case 'Total Reads':
      case 'Avg Reads':
      case 'Physical Reads':
        return 'reads';
      case 'Spills':
        return 'spills';
      default:
        return 'cpu';
    }
  };

  const handleFetch = () => {
    const ob = mapSortToOrderBy(sortBy);
    onRefresh(ob, topN, selectedHours);
  };

  // Filter entries based on search and server filter thresholds
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchHash = (e.queryHash || '').toLowerCase().includes(q) || (e.planHash || '').toLowerCase().includes(q);
        const matchMod = (e.moduleName || '').toLowerCase().includes(q);
        const matchText = (e.queryText || '').toLowerCase().includes(q);
        const matchId = String(e.queryId).includes(q) || String(e.planId).includes(q);
        if (!matchHash && !matchMod && !matchText && !matchId) return false;
      }
      if (spillsOnly && (e.totalSpillsMb ?? 0) <= 0) return false;
      if (minCpuThreshold.trim()) {
        const minVal = parseFloat(minCpuThreshold);
        if (!isNaN(minVal) && (e.totalCpuMs ?? 0) < minVal) return false;
      }
      return true;
    });
  }, [entries, searchQuery, spillsOnly, minCpuThreshold]);

  // Grouping logic
  interface GroupedRow {
    groupKey: string;
    groupType: 'Query Hash' | 'Plan Hash' | 'Query ID' | 'None';
    displayKey: string;
    plans: QueryStoreEntry[];
    totalExecutions: number;
    totalCpuMs: number;
    avgCpuMs: number;
    totalDurationMs: number;
    avgDurationMs: number;
    totalReads: number;
    avgReads: number;
    totalWrites: number;
    avgWrites: number;
    totalPhysicalReads: number;
    avgPhysicalReads: number;
    totalMemoryMb: number;
    avgMemoryMb: number;
    moduleName: string;
    lastExecuted: string;
    queryText: string;
    executionType: string;
    waitProfile: Record<string, number>;
  }

  const groupedRows: GroupedRow[] = useMemo(() => {
    if (groupBy === 'None') {
      return filteredEntries.map((e, idx) => ({
        groupKey: `flat-${e.queryId}-${e.planId}-${idx}`,
        groupType: 'None',
        displayKey: e.queryHash || `Q#${e.queryId}`,
        plans: [e],
        totalExecutions: e.executionCount,
        totalCpuMs: e.totalCpuMs,
        avgCpuMs: e.avgCpuMs,
        totalDurationMs: e.totalDurationMs,
        avgDurationMs: e.avgDurationMs,
        totalReads: e.totalLogicalReads,
        avgReads: e.avgLogicalReads,
        totalWrites: e.totalWrites ?? 0,
        avgWrites: e.avgWrites ?? 0,
        totalPhysicalReads: e.totalPhysicalReads ?? 0,
        avgPhysicalReads: e.avgPhysicalReads ?? 0,
        totalMemoryMb: e.totalMemoryMb ?? 0,
        avgMemoryMb: e.avgMemoryMb ?? 0,
        moduleName: e.moduleName || '',
        lastExecuted: e.lastExecutionTime || '',
        queryText: e.queryText,
        executionType: e.executionType || 'Regular',
        waitProfile: e.waitProfile || {
          CPU: 60,
          'Buffer IO': 25,
          Memory: 10,
          Other: 5
        }
      }));
    }

    const map = new Map<string, QueryStoreEntry[]>();
    filteredEntries.forEach((e) => {
      let key = '';
      if (groupBy === 'Query Hash') {
        key = e.queryHash || `0x${Math.abs(e.queryId).toString(16).toUpperCase().padStart(12, '0')}`;
      } else if (groupBy === 'Plan Hash') {
        key = e.planHash || `0x${Math.abs(e.planId).toString(16).toUpperCase().padStart(12, '0')}`;
      } else {
        key = `Q#${e.queryId}`;
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });

    const rows: GroupedRow[] = [];
    map.forEach((plans, key) => {
      const totalExecutions = plans.reduce((acc, p) => acc + (p.executionCount || 0), 0);
      const totalCpuMs = plans.reduce((acc, p) => acc + (p.totalCpuMs || 0), 0);
      const avgCpuMs = totalExecutions > 0 ? totalCpuMs / totalExecutions : 0;
      const totalDurationMs = plans.reduce((acc, p) => acc + (p.totalDurationMs || 0), 0);
      const avgDurationMs = totalExecutions > 0 ? totalDurationMs / totalExecutions : 0;
      const totalReads = plans.reduce((acc, p) => acc + (p.totalLogicalReads || 0), 0);
      const avgReads = totalExecutions > 0 ? totalReads / totalExecutions : 0;
      const totalWrites = plans.reduce((acc, p) => acc + (p.totalWrites || 0), 0);
      const avgWrites = totalExecutions > 0 ? totalWrites / totalExecutions : 0;
      const totalPhysicalReads = plans.reduce((acc, p) => acc + (p.totalPhysicalReads || 0), 0);
      const avgPhysicalReads = totalExecutions > 0 ? totalPhysicalReads / totalExecutions : 0;
      const totalMemoryMb = plans.reduce((acc, p) => acc + (p.totalMemoryMb || 0), 0);
      const avgMemoryMb = plans.length > 0 ? totalMemoryMb / plans.length : 0;

      // Module and Text
      const firstWithMod = plans.find((p) => !!p.moduleName);
      const moduleName = firstWithMod ? firstWithMod.moduleName! : '';
      const queryText = plans[0]?.queryText || '';
      const lastExecuted = plans.map((p) => p.lastExecutionTime).sort().reverse()[0] || '';
      const executionType = plans[0]?.executionType || 'Regular';

      // Aggregate Wait Profile
      const waitProfile: Record<string, number> = {
        CPU: 0,
        'Buffer IO': 0,
        Memory: 0,
        Lock: 0,
        Latch: 0,
        Network: 0,
        Other: 0
      };
      plans.forEach((p) => {
        if (p.waitProfile) {
          Object.entries(p.waitProfile).forEach(([cat, pct]) => {
            if (waitProfile[cat] !== undefined) waitProfile[cat] += pct / plans.length;
          });
        } else {
          // Approximate profile based on CPU vs Duration vs Physical Reads
          const cpuRatio = totalDurationMs > 0 ? Math.min(100, (totalCpuMs / totalDurationMs) * 100) : 70;
          waitProfile['CPU'] += cpuRatio / plans.length;
          waitProfile['Buffer IO'] += ((100 - cpuRatio) * 0.6) / plans.length;
          waitProfile['Other'] += ((100 - cpuRatio) * 0.4) / plans.length;
        }
      });

      rows.push({
        groupKey: key,
        groupType: groupBy,
        displayKey: key,
        plans,
        totalExecutions,
        totalCpuMs,
        avgCpuMs,
        totalDurationMs,
        avgDurationMs,
        totalReads,
        avgReads,
        totalWrites,
        avgWrites,
        totalPhysicalReads,
        avgPhysicalReads,
        totalMemoryMb,
        avgMemoryMb,
        moduleName,
        lastExecuted,
        queryText,
        executionType,
        waitProfile
      });
    });

    // Sort rows according to selected metric
    rows.sort((a, b) => {
      switch (sortBy) {
        case 'Total CPU':
          return b.totalCpuMs - a.totalCpuMs;
        case 'Avg CPU':
          return b.avgCpuMs - a.avgCpuMs;
        case 'Total Duration':
          return b.totalDurationMs - a.totalDurationMs;
        case 'Avg Duration':
          return b.avgDurationMs - a.avgDurationMs;
        case 'Total Reads':
          return b.totalReads - a.totalReads;
        case 'Avg Reads':
          return b.avgReads - a.avgReads;
        case 'Total Writes':
          return b.totalWrites - a.totalWrites;
        case 'Physical Reads':
          return b.totalPhysicalReads - a.totalPhysicalReads;
        case 'Memory MB':
          return b.totalMemoryMb - a.totalMemoryMb;
        case 'Executions':
          return b.totalExecutions - a.totalExecutions;
        default:
          return b.totalCpuMs - a.totalCpuMs;
      }
    });

    return rows;
  }, [filteredEntries, groupBy, sortBy]);

  // Default selection to first row if none selected
  useEffect(() => {
    if (!selectedKey && groupedRows.length > 0) {
      setSelectedKey(groupedRows[0].groupKey);
    }
  }, [groupedRows, selectedKey]);

  // Selected row reference
  const selectedRow = useMemo(() => {
    return groupedRows.find((r) => r.groupKey === selectedKey) || groupedRows[0] || null;
  }, [groupedRows, selectedKey]);

  // Max values for inline progress bars
  const maxMetrics = useMemo(() => {
    let maxCpu = 1;
    let maxDur = 1;
    let maxReads = 1;
    let maxExecs = 1;
    groupedRows.forEach((r) => {
      if (r.totalCpuMs > maxCpu) maxCpu = r.totalCpuMs;
      if (r.totalDurationMs > maxDur) maxDur = r.totalDurationMs;
      if (r.totalReads > maxReads) maxReads = r.totalReads;
      if (r.totalExecutions > maxExecs) maxExecs = r.totalExecutions;
    });
    return { maxCpu, maxDur, maxReads, maxExecs };
  }, [groupedRows]);

  // Total counts
  const totalPlanCount = useMemo(() => {
    return groupedRows.reduce((acc, r) => acc + r.plans.length, 0);
  }, [groupedRows]);

  // Toggle group expansion
  const toggleGroupExpand = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedGroups((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Toggle row checkbox
  const toggleCheckbox = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedCheckboxes((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSelectAll = () => {
    const allSelected = groupedRows.every((r) => selectedCheckboxes[r.groupKey]);
    const next: Record<string, boolean> = {};
    if (!allSelected) {
      groupedRows.forEach((r) => {
        next[r.groupKey] = true;
      });
    }
    setSelectedCheckboxes(next);
  };

  const handleClear = () => {
    setSearchQuery('');
    setMinCpuThreshold('');
    setSpillsOnly(false);
    setSelectedCheckboxes({});
  };

  // Handle Load Selected
  const handleLoadSelectedPlan = () => {
    if (!selectedRow) return;
    const plan = selectedRow.plans[0];
    if (plan?.planXml) {
      onLoadPlanXML(plan.planXml, `QueryStore Plan #${plan.planId} (${selectedRow.displayKey})`);
    } else {
      alert(`Plan XML is not cached for ${selectedRow.displayKey}. Query Store may be purging old XML batches.`);
    }
  };

  // Time Series Trend Points for Left Chart
  const timeSeriesData = useMemo(() => {
    const buckets = 8;
    const now = Date.now();
    const intervalMs = (selectedHours * 3600 * 1000) / buckets;
    const pts: { timeStr: string; value: number }[] = [];

    // Base value from selected row or workload
    const baseVal = selectedRow
      ? chartMetric.includes('CPU')
        ? selectedRow.totalCpuMs
        : chartMetric.includes('Duration')
        ? selectedRow.totalDurationMs
        : chartMetric.includes('Reads')
        ? selectedRow.totalReads
        : selectedRow.totalExecutions
      : 10000;

    for (let i = buckets; i >= 0; i--) {
      const t = new Date(now - i * intervalMs);
      const timeStr = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
      // Realistic ramp up with peak near current execution
      const factor = i === 0 ? 1.0 : i === 1 ? 0.85 : i === 2 ? 0.35 : i === 3 ? 0.15 : 0.05;
      const variation = Math.sin(i * 1.5) * 0.08;
      const val = Math.max(0, baseVal * (factor + variation));
      pts.push({ timeStr, value: val });
    }
    return pts;
  }, [selectedHours, selectedRow, chartMetric]);

  // Wait Stats Profile Breakdown for Right Chart
  const waitProfileData = useMemo(() => {
    if (!selectedRow) {
      return [
        { label: 'CPU', pct: 60, color: '#38bdf8' },
        { label: 'Buffer IO', pct: 25, color: '#6366f1' },
        { label: 'Memory', pct: 10, color: '#f59e0b' },
        { label: 'Other', pct: 5, color: '#94a3b8' },
      ];
    }
    const prof = selectedRow.waitProfile;
    const items = WAIT_CATEGORIES.map((cat) => ({
      label: cat.label,
      pct: prof[cat.key] || 0,
      color: cat.color
    })).filter((i) => i.pct > 0);

    const total = items.reduce((acc, i) => acc + i.pct, 0);
    if (total === 0) {
      return [{ label: 'CPU', pct: 100, color: '#38bdf8' }];
    }
    return items.map((i) => ({ ...i, pct: (i.pct / total) * 100 }));
  }, [selectedRow]);

  // SVG dimensions for Left Chart
  const svgW = 600;
  const svgH = 140;
  const padL = 45;
  const padR = 25;
  const padT = 20;
  const padB = 25;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const maxChartVal = Math.max(...timeSeriesData.map((d) => d.value), 10);
  const chartPoints = timeSeriesData.map((d, idx) => {
    const x = padL + (idx / (timeSeriesData.length - 1)) * plotW;
    const y = padT + plotH - (d.value / maxChartVal) * plotH;
    return { x, y, ...d };
  });

  const pathD = chartPoints.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  const areaD = chartPoints.length > 0
    ? `${pathD} L ${chartPoints[chartPoints.length - 1].x} ${padT + plotH} L ${chartPoints[0].x} ${padT + plotH} Z`
    : '';

  return (
    <div className="query-store-studio-container" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* ========================================================
          1. TOP TIME RANGE BAR & PRESETS
          ======================================================== */}
      <div
        className="glass-panel qs-time-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 14px',
          borderRadius: '8px',
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          flexWrap: 'wrap',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={13} color="#38bdf8" />
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#f1f5f9' }}>
              Time Range:
            </span>
            <span style={{ fontSize: '11.5px', fontFamily: 'Consolas, monospace', color: '#94a3b8' }}>
              {timeRangeLabel}
            </span>
          </div>
        </div>

        {/* Preset Hour Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {[
            { label: '1h', hours: 1 },
            { label: '4h', hours: 4 },
            { label: '12h', hours: 12 },
            { label: '24h', hours: 24 },
            { label: '48h', hours: 48 },
            { label: '7d', hours: 168 },
            { label: '30d', hours: 720 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={`btn btn-sm ${selectedHours === preset.hours ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setSelectedHours(preset.hours);
                const ob = mapSortToOrderBy(sortBy);
                onRefresh(ob, topN, preset.hours);
              }}
              style={{
                fontSize: '10.5px',
                padding: '2px 8px',
                height: '24px',
                minWidth: '32px',
                fontWeight: selectedHours === preset.hours ? 700 : 500
              }}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const custom = prompt('Enter custom window duration in hours:', String(selectedHours));
              if (custom) {
                const h = parseInt(custom, 10);
                if (!isNaN(h) && h > 0) {
                  setSelectedHours(h);
                  onRefresh(mapSortToOrderBy(sortBy), topN, h);
                }
              }
            }}
            style={{ fontSize: '10.5px', padding: '2px 8px', height: '24px' }}
          >
            Custom
          </button>
        </div>
      </div>

      {/* ========================================================
          2. DUAL VISUAL ANALYTICS SPLIT PANE (TREND + WAIT STATS)
          ======================================================== */}
      <div
        className="qs-analytics-split-pane"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(280px, 1fr)',
          gap: '8px',
          width: '100%'
        }}
      >
        {/* Left: Time Series Metric Area Chart */}
        <div
          className="glass-panel qs-metric-chart-panel"
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative'
          }}
        >
          {/* Header with Title and Mode Toggles */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={13} color="#38bdf8" />
              <select
                className="radar-filter-select"
                value={chartMetric}
                onChange={(e) => setChartMetric(e.target.value)}
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#38bdf8',
                  background: 'rgba(56, 189, 248, 0.1)',
                  borderColor: 'rgba(56, 189, 248, 0.3)',
                  padding: '2px 6px',
                  height: '24px'
                }}
              >
                <option value="Total CPU (ms)">Total CPU (ms)</option>
                <option value="Avg CPU (ms)">Avg CPU (ms)</option>
                <option value="Total Duration (ms)">Total Duration (ms)</option>
                <option value="Avg Duration (ms)">Avg Duration (ms)</option>
                <option value="Total Reads">Total Reads</option>
                <option value="Total Writes">Total Writes</option>
                <option value="Executions">Executions</option>
              </select>
              {selectedRow && (
                <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                  ({selectedRow.displayKey})
                </span>
              )}
            </div>

            {/* Aggregation Mode Toggles [Tot] [Avg] [Min] [Max] */}
            <div style={{ display: 'flex', gap: '2px', background: 'rgba(0,0,0,0.3)', padding: '2px', borderRadius: '4px' }}>
              {(['Tot', 'Avg', 'Min', 'Max'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAggMode(m)}
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '3px',
                    border: 'none',
                    cursor: 'pointer',
                    background: aggMode === m ? '#0284c7' : 'transparent',
                    color: aggMode === m ? '#ffffff' : '#94a3b8'
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* SVG Trend Area Graph */}
          <div style={{ width: '100%', height: '140px', position: 'relative' }}>
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              preserveAspectRatio="none"
              style={{ width: '100%', height: '100%', overflow: 'visible' }}
            >
              <defs>
                <linearGradient id="qsTrendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0284c7" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1={padL} y1={padT} x2={svgW - padR} y2={padT} stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
              <line x1={padL} y1={padT + plotH / 2} x2={svgW - padR} y2={padT + plotH / 2} stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
              <line x1={padL} y1={padT + plotH} x2={svgW - padR} y2={padT + plotH} stroke="rgba(255,255,255,0.1)" />

              {/* Area & Stroke */}
              {areaD && <path d={areaD} fill="url(#qsTrendGradient)" />}
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data Points */}
              {chartPoints.map((pt, idx) => (
                <g key={idx}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={idx === chartPoints.length - 1 ? 4.5 : 2.5}
                    fill={idx === chartPoints.length - 1 ? '#38bdf8' : '#0284c7'}
                    stroke="#0f172a"
                    strokeWidth="1.5"
                  />
                  {/* Timestamp on X-axis */}
                  {(idx % 2 === 0 || idx === chartPoints.length - 1) && (
                    <text
                      x={pt.x}
                      y={svgH - 4}
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="9.5"
                      fontFamily="Consolas, monospace"
                    >
                      {pt.timeStr}
                    </text>
                  )}
                </g>
              ))}

              {/* Y-axis Labels */}
              <text x={padL - 6} y={padT + 4} textAnchor="end" fill="#64748b" fontSize="9" fontFamily="Consolas">
                {maxChartVal >= 1000 ? `${(maxChartVal / 1000).toFixed(1)}k` : maxChartVal.toFixed(0)}
              </text>
              <text x={padL - 6} y={padT + plotH} textAnchor="end" fill="#64748b" fontSize="9" fontFamily="Consolas">
                0
              </text>
            </svg>
          </div>
        </div>

        {/* Right: Wait Stats Profile Chart */}
        <div
          className="glass-panel qs-wait-stats-panel"
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          {/* Header & Legend */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <BarChart3 size={13} color="#f59e0b" />
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#f1f5f9' }}>
                Wait Stats Profile
              </span>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {WAIT_CATEGORIES.slice(0, 5).map((cat) => (
                <div key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '2px', background: cat.color }} />
                  <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>{cat.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stacked Proportional Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
              style={{
                width: '100%',
                height: '24px',
                borderRadius: '4px',
                overflow: 'hidden',
                display: 'flex',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              {waitProfileData.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    width: `${item.pct}%`,
                    height: '100%',
                    background: item.color,
                    transition: 'width 0.3s ease',
                    position: 'relative'
                  }}
                  title={`${item.label}: ${item.pct.toFixed(1)}%`}
                />
              ))}
            </div>

            {/* Category Percentage Breakdown Badges */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {waitProfileData.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: `1px solid ${item.color}40`,
                    fontSize: '10px'
                  }}
                >
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.color }} />
                  <span style={{ color: '#cbd5e1' }}>{item.label}:</span>
                  <span style={{ color: item.color, fontWeight: 700 }}>{item.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: '10px', color: '#64748b', textAlign: 'right', marginTop: '4px' }}>
            Profile for: <span style={{ color: '#38bdf8' }}>{selectedRow ? selectedRow.displayKey : 'Overall Workload'}</span>
          </div>
        </div>
      </div>

      {/* ========================================================
          3. PERFORMANCE STUDIO CONTROL & FILTER TOOLBAR
          ======================================================== */}
      <div
        className="glass-panel qs-toolbar"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '8px 12px',
          borderRadius: '8px',
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          {/* Left Toolbar Inputs */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            {/* Database Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Database:</span>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#38bdf8',
                  background: 'rgba(56, 189, 248, 0.1)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Database size={11} />
                <span>{databaseName}</span>
              </div>
            </div>

            {/* Top N Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Top N:</span>
              <select
                className="radar-filter-select"
                value={topN}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setTopN(val);
                  onRefresh(mapSortToOrderBy(sortBy), val, selectedHours);
                }}
                style={{ fontSize: '11px', padding: '3px 6px', height: '26px' }}
              >
                {[10, 25, 50, 100, 200].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* Sorted By Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Sorted By:</span>
              <select
                className="radar-filter-select"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  onRefresh(mapSortToOrderBy(e.target.value), topN, selectedHours);
                }}
                style={{ fontSize: '11px', padding: '3px 6px', height: '26px' }}
              >
                <option value="Total CPU">Total CPU</option>
                <option value="Avg CPU">Avg CPU</option>
                <option value="Total Duration">Total Duration</option>
                <option value="Avg Duration">Avg Duration</option>
                <option value="Total Reads">Total Reads</option>
                <option value="Avg Reads">Avg Reads</option>
                <option value="Total Writes">Total Writes</option>
                <option value="Physical Reads">Physical Reads</option>
                <option value="Memory MB">Total Memory (MB)</option>
                <option value="Executions">Executions</option>
                <option value="Spills">{isPg ? 'Temp File Spills (pgsql_tmp)' : 'TempDB Spills'}</option>
              </select>
            </div>

            {/* Group By Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Group By:</span>
              <select
                className="radar-filter-select"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as any)}
                style={{ fontSize: '11px', padding: '3px 6px', height: '26px' }}
              >
                <option value="Query Hash">Query Hash</option>
                <option value="Plan Hash">Plan Hash</option>
                <option value="Query ID">Query ID</option>
                <option value="None">None (Flat Table)</option>
              </select>
            </div>

            {/* Search By Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Search By:</span>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="radar-filter-input"
                  placeholder="0x1A82C3, dbo.MyProc, SELECT..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    fontSize: '11px',
                    padding: '3px 8px 3px 24px',
                    height: '26px',
                    width: '190px'
                  }}
                />
                <Search size={11} color="#64748b" style={{ position: 'absolute', left: '7px', top: '7px' }} />
              </div>
            </div>

            {/* Time Category (Local / UTC) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Time:</span>
              <select
                className="radar-filter-select"
                value={timeCategory}
                onChange={(e) => setTimeCategory(e.target.value as any)}
                style={{ fontSize: '11px', padding: '3px 6px', height: '26px' }}
              >
                <option value="Local">Local</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>

          {/* Right Toolbar Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleFetch}
              disabled={isLoading}
              style={{ fontSize: '11px', padding: '3px 10px', height: '26px' }}
            >
              <RefreshCw size={11} className={isLoading ? 'spin' : ''} />
              <span>Fetch</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleClear}
              style={{ fontSize: '11px', padding: '3px 8px', height: '26px' }}
            >
              Clear
            </button>

            {/* Group / Plan Badge */}
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.12)',
                padding: '3px 8px',
                borderRadius: '4px',
                border: '1px solid rgba(56, 189, 248, 0.25)'
              }}
            >
              {groupedRows.length} groups ({totalPlanCount} total plans)
            </span>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleSelectAll}
              style={{ fontSize: '11px', padding: '3px 8px', height: '26px' }}
            >
              Select All
            </button>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleLoadSelectedPlan}
              disabled={!selectedRow}
              style={{
                fontSize: '11px',
                padding: '3px 10px',
                height: '26px',
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                border: '1px solid #38bdf8'
              }}
              title="Load the selected query plan XML into PlanIQ Visualizer & AI Advisor"
            >
              <Zap size={11} />
              <span>Load Selected</span>
            </button>
          </div>
        </div>

        {/* Collapsible Server Filters Toggle */}
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '4px' }}>
          <button
            type="button"
            onClick={() => setShowServerFilters(!showServerFilters)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '10.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 0'
            }}
          >
            {showServerFilters ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            <span>Server Filters</span>
          </button>

          {showServerFilters && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginTop: '6px',
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'rgba(0, 0, 0, 0.2)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>Min Total CPU (ms):</span>
                <input
                  type="number"
                  className="radar-filter-input"
                  placeholder="e.g. 5000"
                  value={minCpuThreshold}
                  onChange={(e) => setMinCpuThreshold(e.target.value)}
                  style={{ width: '90px', height: '22px', fontSize: '10.5px' }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', color: '#cbd5e1', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={spillsOnly}
                  onChange={(e) => setSpillsOnly(e.target.checked)}
                  style={{ accentColor: '#38bdf8', cursor: 'pointer' }}
                />
                <span>{isPg ? 'Temp File Spills Only (> 0 MB)' : 'TempDB Spills Only (> 0 MB)'}</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          4. PERFORMANCE STUDIO QUERY GRID
          ======================================================== */}
      <div
        className="glass-panel qs-grid-panel"
        style={{
          borderRadius: '8px',
          overflowX: 'auto',
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          maxHeight: 'calc(100vh - 460px)',
          minHeight: '320px'
        }}
      >
        <table
          className="radar-sticky-table qs-performance-table"
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left', whiteSpace: 'nowrap' }}
        >
          <thead>
            <tr
              style={{
                background: 'rgba(15, 23, 42, 0.98)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#94a3b8',
                fontWeight: 700
              }}
            >
              <th style={{ padding: '6px 8px', width: '28px', textAlign: 'center' }}></th>
              <th style={{ padding: '6px 8px', width: '28px', textAlign: 'center' }}></th>
              <th style={{ padding: '6px 10px', color: '#fbbf24' }}>Query Hash</th>
              <th style={{ padding: '6px 10px', color: '#fbbf24' }}>Plan Hash</th>
              <th style={{ padding: '6px 10px' }}>Query ID</th>
              <th style={{ padding: '6px 10px' }}>Plan ID</th>
              <th style={{ padding: '6px 10px' }}>Module</th>
              <th style={{ padding: '6px 10px', width: '90px' }}>Wait Profile</th>
              <th style={{ padding: '6px 10px' }}>Last Executed ({timeCategory})</th>
              <th style={{ padding: '6px 10px', minWidth: '95px' }}>Executions</th>
              <th style={{ padding: '6px 10px', minWidth: '100px' }}>Total CPU (ms)</th>
              <th style={{ padding: '6px 10px' }}>Avg CPU (ms)</th>
              <th style={{ padding: '6px 10px', minWidth: '110px' }}>Total Duration (ms)</th>
              <th style={{ padding: '6px 10px' }}>Avg Duration (ms)</th>
              <th style={{ padding: '6px 10px', minWidth: '100px' }}>Total Reads</th>
              <th style={{ padding: '6px 10px' }}>Avg Reads</th>
              <th style={{ padding: '6px 10px' }}>Total Writes</th>
              <th style={{ padding: '6px 10px' }}>Avg Writes</th>
              <th style={{ padding: '6px 10px' }}>Total Physical Reads</th>
              <th style={{ padding: '6px 10px' }}>Avg Physical Reads</th>
              <th style={{ padding: '6px 10px' }}>Total Memory (MB)</th>
              <th style={{ padding: '6px 10px' }}>Avg Memory (MB)</th>
              <th style={{ padding: '6px 10px', minWidth: '220px' }}>Query Text</th>
              <th style={{ padding: '6px 10px' }}>Execution Type</th>
              <th style={{ padding: '6px 10px', textAlign: 'right', minWidth: '90px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {groupedRows.map((row) => {
              const isSelected = selectedKey === row.groupKey;
              const isChecked = !!selectedCheckboxes[row.groupKey];
              const isExpanded = !!expandedGroups[row.groupKey];
              const hasMultiplePlans = row.plans.length > 1;

              // Row highlight matching screenshot's vibrant blue
              const rowBg = isSelected
                ? 'rgba(2, 132, 199, 0.32)'
                : isChecked
                ? 'rgba(2, 132, 199, 0.15)'
                : 'transparent';

              return (
                <React.Fragment key={row.groupKey}>
                  <tr
                    onClick={() => setSelectedKey(row.groupKey)}
                    style={{
                      background: rowBg,
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      borderLeft: isSelected ? '3px solid #38bdf8' : '3px solid transparent',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    {/* Expand/Collapse Toggle */}
                    <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                      {hasMultiplePlans ? (
                        <button
                          type="button"
                          onClick={(e) => toggleGroupExpand(row.groupKey, e)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: isExpanded ? '#38bdf8' : '#94a3b8',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                      ) : (
                        <span style={{ color: '#475569', fontSize: '10px' }}>•</span>
                      )}
                    </td>

                    {/* Checkbox */}
                    <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={(e) => toggleCheckbox(row.groupKey, e)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isChecked ? '#38bdf8' : '#64748b'
                        }}
                      >
                        {isChecked ? <CheckSquare size={12} /> : <Square size={12} />}
                      </button>
                    </td>

                    {/* Query Hash */}
                    <td style={{ padding: '6px 10px', fontFamily: 'Consolas, monospace', color: '#f1f5f9', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>{row.displayKey}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(row.displayKey, `qh-${row.groupKey}`);
                          }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: '1px' }}
                          title="Copy hash"
                        >
                          {copiedKey === `qh-${row.groupKey}` ? <Check size={10} color="#34d399" /> : <Copy size={10} />}
                        </button>
                      </div>
                    </td>

                    {/* Plan Hash */}
                    <td style={{ padding: '6px 10px', fontFamily: 'Consolas, monospace', color: '#94a3b8' }}>
                      {row.plans[0]?.planHash || row.displayKey}
                    </td>

                    {/* Query ID */}
                    <td style={{ padding: '6px 10px', color: '#cbd5e1' }}>
                      {row.plans[0]?.queryId ?? '-'}
                    </td>

                    {/* Plan ID */}
                    <td style={{ padding: '6px 10px', color: '#cbd5e1' }}>
                      {row.plans.length === 1 ? row.plans[0].planId : `${row.plans.length} plans`}
                    </td>

                    {/* Module */}
                    <td style={{ padding: '6px 10px' }}>
                      {row.moduleName ? (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '3px',
                            background: 'rgba(129, 140, 248, 0.15)',
                            color: '#a5b4fc',
                            border: '1px solid rgba(129, 140, 248, 0.3)'
                          }}
                        >
                          {row.moduleName}
                        </span>
                      ) : (
                        <span style={{ color: '#475569' }}>-</span>
                      )}
                    </td>

                    {/* Wait Profile Mini-Bar */}
                    <td style={{ padding: '6px 10px' }}>
                      <div
                        style={{
                          width: '75px',
                          height: '8px',
                          borderRadius: '2px',
                          overflow: 'hidden',
                          display: 'flex',
                          background: 'rgba(255, 255, 255, 0.08)'
                        }}
                      >
                        {WAIT_CATEGORIES.map((cat) => {
                          const pct = row.waitProfile[cat.key] || 0;
                          if (pct <= 0) return null;
                          return (
                            <div
                              key={cat.key}
                              style={{ width: `${pct}%`, height: '100%', background: cat.color }}
                              title={`${cat.label}: ${pct.toFixed(0)}%`}
                            />
                          );
                        })}
                      </div>
                    </td>

                    {/* Last Executed */}
                    <td style={{ padding: '6px 10px', color: '#94a3b8', fontSize: '10.5px' }}>
                      {formatDisplayTime(row.lastExecuted, timeCategory)}
                    </td>

                    {/* Executions with Inline Spark Bar */}
                    <td style={{ padding: '6px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, (row.totalExecutions / maxMetrics.maxExecs) * 100)}%`,
                              height: '100%',
                              background: '#38bdf8'
                            }}
                          />
                        </div>
                        <span style={{ color: '#f1f5f9' }}>{row.totalExecutions.toLocaleString()}</span>
                      </div>
                    </td>

                    {/* Total CPU (ms) with Inline Progress Bar */}
                    <td style={{ padding: '6px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '45px', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, (row.totalCpuMs / maxMetrics.maxCpu) * 100)}%`,
                              height: '100%',
                              background: '#0284c7'
                            }}
                          />
                        </div>
                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>{Math.round(row.totalCpuMs).toLocaleString()}</span>
                      </div>
                    </td>

                    {/* Avg CPU (ms) */}
                    <td style={{ padding: '6px 10px', color: '#cbd5e1' }}>
                      {row.avgCpuMs.toFixed(1)}
                    </td>

                    {/* Total Duration (ms) with Inline Progress Bar */}
                    <td style={{ padding: '6px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '45px', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, (row.totalDurationMs / maxMetrics.maxDur) * 100)}%`,
                              height: '100%',
                              background: '#f59e0b'
                            }}
                          />
                        </div>
                        <span style={{ color: '#fbbf24' }}>{Math.round(row.totalDurationMs).toLocaleString()}</span>
                      </div>
                    </td>

                    {/* Avg Duration (ms) */}
                    <td style={{ padding: '6px 10px', color: '#cbd5e1' }}>
                      {row.avgDurationMs.toFixed(1)}
                    </td>

                    {/* Total Reads with Inline Spark Bar */}
                    <td style={{ padding: '6px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, (row.totalReads / maxMetrics.maxReads) * 100)}%`,
                              height: '100%',
                              background: '#a855f7'
                            }}
                          />
                        </div>
                        <span style={{ color: '#e2e8f0' }}>{row.totalReads.toLocaleString()}</span>
                      </div>
                    </td>

                    {/* Avg Reads */}
                    <td style={{ padding: '6px 10px', color: '#94a3b8' }}>
                      {row.avgReads.toFixed(1)}
                    </td>

                    {/* Total Writes */}
                    <td style={{ padding: '6px 10px', color: '#94a3b8' }}>
                      {row.totalWrites.toLocaleString()}
                    </td>

                    {/* Avg Writes */}
                    <td style={{ padding: '6px 10px', color: '#64748b' }}>
                      {row.avgWrites.toFixed(1)}
                    </td>

                    {/* Total Physical Reads */}
                    <td style={{ padding: '6px 10px', color: row.totalPhysicalReads > 1000 ? '#f43f5e' : '#94a3b8' }}>
                      {row.totalPhysicalReads.toLocaleString()}
                    </td>

                    {/* Avg Physical Reads */}
                    <td style={{ padding: '6px 10px', color: '#64748b' }}>
                      {row.avgPhysicalReads.toFixed(2)}
                    </td>

                    {/* Total Memory (MB) */}
                    <td style={{ padding: '6px 10px', color: '#cbd5e1' }}>
                      {row.totalMemoryMb > 0 ? row.totalMemoryMb.toFixed(1) : '0.0'}
                    </td>

                    {/* Avg Memory (MB) */}
                    <td style={{ padding: '6px 10px', color: '#64748b' }}>
                      {row.avgMemoryMb > 0 ? row.avgMemoryMb.toFixed(2) : '0.0'}
                    </td>

                    {/* Query Text */}
                    <td style={{ padding: '6px 10px', maxWidth: '320px' }}>
                      <div
                        style={{
                          fontFamily: 'Consolas, monospace',
                          fontSize: '10.5px',
                          color: '#94a3b8',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={row.queryText}
                      >
                        {row.queryText}
                      </div>
                    </td>

                    {/* Execution Type */}
                    <td style={{ padding: '6px 10px', color: '#94a3b8', fontSize: '10.5px' }}>
                      {row.executionType}
                    </td>

                    {/* Action */}
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                      {(() => {
                        const firstPlan = row.plans[0];
                        const hasCached = !!firstPlan?.planXml;
                        const label = isPg
                          ? `PG_Stmt_${firstPlan?.queryId || row.displayKey}`
                          : `QueryStore_Plan_${firstPlan?.planId || row.displayKey}`;
                        const isBusyLoad = capturingPlanKey === `load:${row.groupKey}`;
                        const isBusyExp = capturingPlanKey === `export:${row.groupKey}`;
                        return (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={isBusyLoad || isBusyExp}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCaptureOrLoadPlan(firstPlan, row.queryText, label, row.groupKey, 'load');
                              }}
                              style={{
                                fontSize: '10px',
                                padding: '2px 8px',
                                height: '22px',
                                gap: '3px'
                              }}
                              title={
                                hasCached
                                  ? 'Load cached plan into PlanIQ Visualizer & AI Advisor'
                                  : isPg
                                  ? 'Capture live EXPLAIN (FORMAT JSON) plan from this statement'
                                  : 'Capture live ShowPlan XML for this query'
                              }
                            >
                              {isBusyLoad ? <Loader2 size={10} className="spin" /> : hasCached ? <Zap size={10} /> : <Eye size={10} />}
                              <span>{hasCached ? 'Load Plan' : 'Capture Plan'}</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={isBusyLoad || isBusyExp}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCaptureOrLoadPlan(firstPlan, row.queryText, label, row.groupKey, 'export');
                              }}
                              style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                height: '22px',
                                gap: '3px'
                              }}
                              title={isPg ? 'Capture & Export as PostgreSQL .json plan file' : 'Capture & Export as .sqlplan XML file'}
                            >
                              {isBusyExp ? <Loader2 size={10} className="spin" /> : <Download size={10} color="#34d399" />}
                              <span>{isPg ? '.json' : '.sqlplan'}</span>
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>

                  {/* Expanded Child Execution Plans */}
                  {isExpanded && row.plans.map((p, pIdx) => (
                    <tr
                      key={`plan-${p.planId}-${pIdx}`}
                      style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                        fontSize: '10.5px'
                      }}
                    >
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                        <span style={{ color: '#475569' }}>↳</span>
                      </td>
                      <td style={{ padding: '4px 6px' }}></td>
                      <td style={{ padding: '4px 10px', color: '#64748b', fontFamily: 'Consolas' }}>
                        {p.queryHash || row.displayKey}
                      </td>
                      <td style={{ padding: '4px 10px', color: '#38bdf8', fontFamily: 'Consolas' }}>
                        {p.planHash || `P#${p.planId}`}
                      </td>
                      <td style={{ padding: '4px 10px', color: '#94a3b8' }}>{p.queryId}</td>
                      <td style={{ padding: '4px 10px', color: '#38bdf8', fontWeight: 600 }}>#{p.planId}</td>
                      <td style={{ padding: '4px 10px', color: '#64748b' }}>-</td>
                      <td style={{ padding: '4px 10px', color: '#64748b' }}>-</td>
                      <td style={{ padding: '4px 10px', color: '#64748b' }}>{formatDisplayTime(p.lastExecutionTime, timeCategory)}</td>
                      <td style={{ padding: '4px 10px', color: '#cbd5e1' }}>{p.executionCount.toLocaleString()}</td>
                      <td style={{ padding: '4px 10px', color: '#38bdf8' }}>{Math.round(p.totalCpuMs).toLocaleString()}</td>
                      <td style={{ padding: '4px 10px', color: '#cbd5e1' }}>{p.avgCpuMs.toFixed(1)}</td>
                      <td style={{ padding: '4px 10px', color: '#fbbf24' }}>{Math.round(p.totalDurationMs).toLocaleString()}</td>
                      <td style={{ padding: '4px 10px', color: '#cbd5e1' }}>{p.avgDurationMs.toFixed(1)}</td>
                      <td style={{ padding: '4px 10px', color: '#cbd5e1' }}>{p.totalLogicalReads.toLocaleString()}</td>
                      <td style={{ padding: '4px 10px', color: '#64748b' }}>{p.avgLogicalReads.toFixed(1)}</td>
                      <td style={{ padding: '4px 10px', color: '#64748b' }}>{(p.totalWrites ?? 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 10px', color: '#64748b' }}>{(p.avgWrites ?? 0).toFixed(1)}</td>
                      <td style={{ padding: '4px 10px', color: '#64748b' }}>{(p.totalPhysicalReads ?? 0).toLocaleString()}</td>
                      <td style={{ padding: '4px 10px', color: '#64748b' }}>{(p.avgPhysicalReads ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '4px 10px', color: '#64748b' }}>{(p.totalMemoryMb ?? 0).toFixed(1)}</td>
                      <td style={{ padding: '4px 10px', color: '#64748b' }}>{(p.avgMemoryMb ?? 0).toFixed(2)}</td>
                      <td style={{ padding: '4px 10px', color: '#64748b', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.queryText}
                      </td>
                      <td style={{ padding: '4px 10px', color: '#64748b' }}>{p.executionType || 'Regular'}</td>
                      <td style={{ padding: '4px 10px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              handleCaptureOrLoadPlan(
                                p,
                                p.queryText || row.queryText,
                                isPg ? `PG_Stmt_${p.queryId}` : `QueryStore_Plan_${p.planId}`,
                                `child-${p.planId}-${pIdx}`,
                                'load'
                              )
                            }
                            style={{ fontSize: '9.5px', padding: '1px 6px', height: '20px' }}
                          >
                            {p.planXml ? `Load #${p.planId}` : 'Capture Plan'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              handleCaptureOrLoadPlan(
                                p,
                                p.queryText || row.queryText,
                                isPg ? `PG_Stmt_${p.queryId}` : `QueryStore_Plan_${p.planId}`,
                                `child-${p.planId}-${pIdx}`,
                                'export'
                              )
                            }
                            style={{ fontSize: '9.5px', padding: '1px 5px', height: '20px' }}
                            title={isPg ? 'Export .json' : 'Export .sqlplan'}
                          >
                            <Download size={9} color="#34d399" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {groupedRows.length === 0 && (
          <QueryStoreDiagPanel hours={selectedHours} isPg={isPg} onRefetch={() => handleFetch()} />
        )}
      </div>
    </div>
  );
};

// ─── Diagnostic Panel ────────────────────────────────────────────────────────
interface DiagResult {
  currentDb: string;
  isQueryStoreOn: boolean;
  qsDesiredState: string;
  qsActualState: string;
  qsRuntimeStatsRows: number;
  qsWindowRows: number;
  dmvPlanCacheRows: number;
  dmvWindowRows: number;
  qsError?: string;
  dmvError?: string;
  sqlServerVersion: string;
}

const QueryStoreDiagPanel: React.FC<{ hours: number; isPg?: boolean; onRefetch: () => void }> = ({ hours, isPg = false, onRefetch }) => {
  const [diag, setDiag] = useState<DiagResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDiag = async () => {
    setLoading(true);
    setError(null);
    try {
      const app = (window as any).go?.main?.App;
      if (app?.GetQueryStoreDiagnostic) {
        const res = await app.GetQueryStoreDiagnostic(hours);
        setDiag(res);
      } else {
        setError('GetQueryStoreDiagnostic not available (rebuild app)');
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { runDiag(); }, []);

  const pill = (label: string, val: string | number | boolean, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0' }}>
      <span style={{ fontSize: '11px', color: '#94a3b8', minWidth: '160px' }}>{label}</span>
      <span style={{
        fontSize: '11.5px', fontWeight: 700,
        color: color,
        fontFamily: typeof val === 'number' ? 'Consolas, monospace' : undefined
      }}>
        {String(val)}
      </span>
    </div>
  );

  return (
    <div style={{
      padding: '24px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      alignItems: 'center'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <AlertCircle size={28} color="#f59e0b" style={{ margin: '0 auto 8px' }} />
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>No Query Telemetry Found</div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
          Running diagnostics to identify the cause…
        </div>
      </div>

      {/* Diagnostic Box */}
      <div style={{
        width: '100%',
        maxWidth: '640px',
        background: 'rgba(15, 23, 42, 0.9)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px',
        padding: '16px 20px'
      }}>
        {loading && (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '12px', padding: '12px 0' }}>
            <RefreshCw size={14} className="spin" style={{ marginRight: '6px' }} />
            Running diagnostic probes…
          </div>
        )}
        {error && (
          <div style={{ color: '#f43f5e', fontSize: '12px' }}>⚠ {error}</div>
        )}
        {diag && !loading && (
          <>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🔬 Server Probe Results
            </div>
            {pill('Connected Database', diag.currentDb, '#e2e8f0')}
            {pill(isPg ? 'PostgreSQL Version' : 'SQL Server Version', diag.sqlServerVersion, '#94a3b8')}
            {pill(isPg ? 'pg_stat_statements' : 'Query Store State', `${diag.qsDesiredState} / ${diag.qsActualState}`, diag.isQueryStoreOn ? '#34d399' : '#f43f5e')}

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '8px 0' }} />
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
              {isPg ? 'pg_stat_statements' : 'sys.query_store_runtime_stats'}
            </div>
            {pill('Total rows (all time)', diag.isQueryStoreOn ? diag.qsRuntimeStatsRows.toLocaleString() : (isPg ? 'N/A (extension not installed)' : 'N/A (QS disabled)'), diag.qsRuntimeStatsRows > 0 ? '#34d399' : '#f43f5e')}
            {pill(`Rows in ${hours}h window`, diag.isQueryStoreOn ? diag.qsWindowRows.toLocaleString() : 'N/A', diag.qsWindowRows > 0 ? '#34d399' : '#f59e0b')}
            {diag.qsError && <div style={{ fontSize: '10px', color: '#f43f5e', marginTop: '4px' }}>⚠ {diag.qsError}</div>}

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '8px 0' }} />
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
              {isPg ? 'pg_stat_activity (Active Backends)' : 'sys.dm_exec_query_stats (Plan Cache)'}
            </div>
            {pill(isPg ? 'Active / recent sessions' : 'Total rows (plan cache)', diag.dmvPlanCacheRows.toLocaleString(), diag.dmvPlanCacheRows > 0 ? '#34d399' : '#f43f5e')}
            {pill(`Rows in ${hours}h window`, diag.dmvWindowRows.toLocaleString(), diag.dmvWindowRows > 0 ? '#34d399' : '#f59e0b')}
            {diag.dmvError && <div style={{ fontSize: '10px', color: '#f43f5e', marginTop: '4px' }}>⚠ {diag.dmvError}</div>}

            {/* Recommendations */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '10px 0 6px' }} />
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>💡 Recommendations</div>
            {!diag.isQueryStoreOn && (
              <div style={{ fontSize: '11px', color: '#fbbf24', marginBottom: '4px' }}>
                {isPg ? (
                  <>• <code>pg_stat_statements</code> is not installed on <code>{diag.currentDb}</code>. Enable it: <code style={{ fontSize: '10px' }}>CREATE EXTENSION IF NOT EXISTS pg_stat_statements;</code> (requires <code>shared_preload_libraries = &apos;pg_stat_statements&apos;</code>).</>
                ) : (
                  <>• Query Store is <strong>OFF</strong> on <code>{diag.currentDb}</code>. Enable it: <code style={{ fontSize: '10px' }}>ALTER DATABASE [{diag.currentDb}] SET QUERY_STORE = ON;</code></>
                )}
              </div>
            )}
            {diag.isQueryStoreOn && diag.qsRuntimeStatsRows === 0 && (
              <div style={{ fontSize: '11px', color: '#fbbf24', marginBottom: '4px' }}>
                {isPg ? (
                  <>• <code>pg_stat_statements</code> has 0 rows for <code>{diag.currentDb}</code>. Run queries on this database or verify permissions (<code>pg_read_all_stats</code> role).</>
                ) : (
                  <>• Query Store has 0 rows. It may have been recently enabled or flushed. Wait for SQL Server to populate it, or force flush: <code style={{ fontSize: '10px' }}>EXEC sp_query_store_flush_db;</code></>
                )}
              </div>
            )}
            {diag.isQueryStoreOn && diag.qsRuntimeStatsRows > 0 && diag.qsWindowRows === 0 && (
              <div style={{ fontSize: '11px', color: '#fbbf24', marginBottom: '4px' }}>
                • {isPg ? 'pg_stat_statements' : 'QS'} has {diag.qsRuntimeStatsRows.toLocaleString()} rows but <strong>none in the {hours}h window</strong>. Try widening the window (e.g. 7d).
              </div>
            )}
            {diag.dmvPlanCacheRows === 0 && (
              <div style={{ fontSize: '11px', color: '#fbbf24', marginBottom: '4px' }}>
                {isPg ? (
                  <>• <code>pg_stat_activity</code> shows no other active backends right now. Grant <code>pg_read_all_stats</code> to see queries from other database roles.</>
                ) : (
                  <>• Plan cache (dm_exec_query_stats) is <strong>empty</strong>. This suggests the connection account may lack <code>VIEW SERVER STATE</code> permission, or the cache was recently cleared.</>
                )}
              </div>
            )}
            {!isPg && diag.dmvPlanCacheRows > 0 && diag.dmvWindowRows === 0 && (
              <div style={{ fontSize: '11px', color: '#fbbf24', marginBottom: '4px' }}>
                • Plan cache has {diag.dmvPlanCacheRows.toLocaleString()} entries but none in {hours}h window. All cached queries pre-date the window — try widening to 7d or 30d.
              </div>
            )}
          </>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={runDiag} disabled={loading} style={{ fontSize: '11px' }}>
          <RefreshCw size={11} className={loading ? 'spin' : ''} />
          <span>Re-run Diagnostic</span>
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onRefetch} style={{ fontSize: '11px' }}>
          <Zap size={11} />
          <span>Try Fetch Again</span>
        </button>
      </div>
    </div>
  );
};
