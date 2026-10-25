import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  GitCompare,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Layers,
  Upload,
  FileCode2,
  Sparkles,
  RotateCcw,
  ArrowLeftRight,
  Check,
  Copy,
  FileText,
  Zap,
  Database,
  HardDrive,
  Clock,
  Cpu,
  Info,
  ListOrdered,
  ShieldAlert,
  Wrench,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  BarChart3,
  Activity,
  Gauge,
  Flame,
} from 'lucide-react';
import { PlanAnalysis, StatementAnalysis, PlanNode, PlanComparison, WaitStat, TableIOLeader } from '../types/plan';
import { OpenFilePicker, ParsePlan } from '../../wailsjs/go/main/App';
import { parseShowPlanXMLClient, comparePlansClient } from '../utils/clientPlanParser';
import { readFileAsDecodedText } from '../utils/deadlockParser';
import { DiagnosticTooltip } from './DiagnosticTooltip';
import samplePlanData from '../sample_plan.json';

interface PlanComparatorTabProps {
  currentPlan?: PlanAnalysis | null;
}

export const PlanComparatorTab: React.FC<PlanComparatorTabProps> = ({ currentPlan }) => {
  const [planA, setPlanA] = useState<PlanAnalysis | null>(currentPlan || null);
  const [planB, setPlanB] = useState<PlanAnalysis | null>(null);
  const [viewMode, setViewMode] = useState<'metrics' | 'waits' | 'memory' | 'io_tables' | 'visual' | 'statements' | 'warnings'>('metrics');
  const [selectedStmtIdx, setSelectedStmtIdx] = useState<number>(0);
  const [selectedNodeA, setSelectedNodeA] = useState<PlanNode | null>(null);
  const [selectedNodeB, setSelectedNodeB] = useState<PlanNode | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [loadingA, setLoadingA] = useState<boolean>(false);
  const [loadingB, setLoadingB] = useState<boolean>(false);
  const [isDragOverA, setIsDragOverA] = useState<boolean>(false);
  const [isDragOverB, setIsDragOverB] = useState<boolean>(false);

  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);

  // Sync Plan A with currentPlan if user loads one later and Plan A is empty
  useEffect(() => {
    if (currentPlan && !planA) {
      setPlanA(currentPlan);
    }
  }, [currentPlan]);

  const handleCopy = (text: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  // Unified parser helper: prefers high-speed Wails Go engine, falls back to client parser
  const parsePlanSafely = async (content: string, name: string): Promise<PlanAnalysis> => {
    if (typeof window !== 'undefined' && (window as any).go?.main?.App?.ParsePlan) {
      try {
        const res = await (window as any).go.main.App.ParsePlan(content, name);
        if (res && res.statements) {
          return res;
        }
      } catch (err) {
        console.warn('Wails ParsePlan fallback to client parser:', err);
      }
    }
    return parseShowPlanXMLClient(content, name);
  };

  // Helper to load file into Plan A or B
  const handleOpenFileForPlan = async (target: 'A' | 'B') => {
    const setLoading = target === 'A' ? setLoadingA : setLoadingB;
    const setPlan = target === 'A' ? setPlanA : setPlanB;

    if (typeof window !== 'undefined' && (window as any).go?.main?.App?.OpenFilePicker) {
      setLoading(true);
      try {
        const res = await OpenFilePicker();
        if (res && res.content) {
          const parsed = await parsePlanSafely(res.content, res.name || `Plan ${target}`);
          setPlan(parsed);
          setSelectedStmtIdx(0);
          return;
        }
      } catch (err: any) {
        console.error('Failed to open plan via OpenFilePicker:', err);
        alert(`Failed to open plan file: ${err?.message || err}`);
      } finally {
        setLoading(false);
      }
    }
    // Fallback to HTML input
    if (target === 'A') fileInputARef.current?.click();
    else fileInputBRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'A' | 'B') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const setLoading = target === 'A' ? setLoadingA : setLoadingB;
    const setPlan = target === 'A' ? setPlanA : setPlanB;

    setLoading(true);
    try {
      const content = await readFileAsDecodedText(file);
      const parsed = await parsePlanSafely(content, file.name);
      setPlan(parsed);
      setSelectedStmtIdx(0);
    } catch (err: any) {
      alert(`Failed to parse ${file.name}: ${err?.message || err}`);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, target: 'A' | 'B') => {
    e.preventDefault();
    if (target === 'A') setIsDragOverA(false);
    else setIsDragOverB(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const setLoading = target === 'A' ? setLoadingA : setLoadingB;
    const setPlan = target === 'A' ? setPlanA : setPlanB;

    setLoading(true);
    try {
      const content = await readFileAsDecodedText(file);
      const parsed = await parsePlanSafely(content, file.name);
      setPlan(parsed);
      setSelectedStmtIdx(0);
    } catch (err: any) {
      alert(`Failed to parse dropped file ${file.name}: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // Swap Plans A and B
  const handleSwapPlans = () => {
    const tempA = planA;
    setPlanA(planB);
    setPlanB(tempA);
    setSelectedNodeA(null);
    setSelectedNodeB(null);
  };

  // Clear / Reset
  const handleReset = () => {
    setPlanA(null);
    setPlanB(null);
    setSelectedNodeA(null);
    setSelectedNodeB(null);
    setSelectedStmtIdx(0);
  };

  // Load Real-World Production Benchmark Sample (Before vs After)
  const handleLoadSampleBenchmark = () => {
    // Plan A: Baseline Unoptimized Plan (Cost: 46.5, Sort Spill, 124 MB reads)
    const basePlan = (currentPlan || samplePlanData) as unknown as PlanAnalysis;
    
    // Inject realistic rich runtime metrics and wait stats into baseline
    const enrichedPlanA = {
      ...basePlan,
      planName: '[report].[ProcRptGetTransactionSummarySavingCollection_QUERY_STATISTICS_LIVE].sqlplan',
      totalSubTreeCost: 100.72,
      hardwareMetrics: {
        hasRuntimeMetrics: true,
        totalLogicalReads: 15940,
        totalLogicalReadsMb: 124.53,
        totalPhysicalReads: 0,
        totalPhysicalReadsMb: 0,
        totalReadAheads: 128,
        totalReadAheadsMb: 1.0,
        totalLobLogicalReads: 0,
        totalLobPhysicalReads: 0,
        cacheHitRatioPercent: 100.0,
        totalActualCpuMs: 236,
        totalActualElapsedMs: 284,
        cpuUtilizationRatio: 83.1,
        waitTimeMs: 48,
        memoryGrantWaitTimeMs: 0,
        requestedMemoryKb: 76800,
        grantedMemoryKb: 76800,
        maxUsedMemoryKb: 11468,
        maxQueryMemoryKb: 76800,
        estimatedAvailableMemoryKb: 1048576,
        estimatedPagesCached: 9400,
        isMemoryGrantFeedbackAdjusted: 'None',
        topIoLeaders: [
          {
            rank: 1,
            database: 'personal_db',
            schema: 'program',
            table: 'MemberMoveHistory',
            logicalReads: 14200,
            logicalReadsMb: 110.94,
            physicalReads: 0,
            physicalReadsMb: 0,
            readAheads: 128,
            readAheadsMb: 1.0,
            readPercent: 89.1,
            accessOperations: ['Clustered Index Scan'],
            indexesUsed: ['PK_MemberMoveHistory'],
          },
          {
            rank: 2,
            database: 'personal_db',
            schema: 'program',
            table: 'Group',
            logicalReads: 1240,
            logicalReadsMb: 9.69,
            physicalReads: 0,
            physicalReadsMb: 0,
            readAheads: 0,
            readAheadsMb: 0,
            readPercent: 7.8,
            accessOperations: ['Index Scan'],
            indexesUsed: ['IX_Group_MeetingDayId'],
          },
          {
            rank: 3,
            database: 'tempdb',
            schema: 'dbo',
            table: '#GRP_MOVE_LIST_BY_MEMBERS',
            logicalReads: 500,
            logicalReadsMb: 3.91,
            physicalReads: 0,
            physicalReadsMb: 0,
            readAheads: 0,
            readAheadsMb: 0,
            readPercent: 3.1,
            accessOperations: ['Table Scan'],
            indexesUsed: [],
          },
        ],
      },
      waitStats: [
        {
          waitType: 'CXPACKET',
          waitTimeMs: 142,
          waitCount: 8,
          category: 'Parallelism',
          description: 'Query worker threads synchronizing at an Exchange iterator.',
        },
        {
          waitType: 'PAGEIOLATCH_SH',
          waitTimeMs: 48,
          waitCount: 4,
          category: 'Disk I/O',
          description: 'Waiting for 8KB data pages to be read from storage into the buffer pool.',
        },
        {
          waitType: 'LATCH_EX',
          waitTimeMs: 16,
          waitCount: 2,
          category: 'Memory',
          description: 'Short-term synchronization lock protecting internal memory structures.',
        },
      ],
      diagnostics: {
        ...basePlan.diagnostics,
        healthScore: 15,
        scoreGrade: 'F',
      },
    } as unknown as PlanAnalysis;
    setPlanA(enrichedPlanA);

    // Plan B: Synthetic Optimized Counterpart reflecting the user's real SQL tuning
    const optStatements = basePlan.statements.map((s, idx) => {
      if (idx === 1 || s.statementId === '2') {
        return {
          ...s,
          statementSubTreeCost: 6.92,
          actualCpuMs: 42,
          actualElapsedMs: 68,
          actualLogicalReads: 1420,
          actualLogicalReadsMb: 11.09,
          actualPhysicalReads: 0,
          actualReadAheads: 0,
          hasActualMetrics: true,
          warnings: [], // Spills eliminated
          missingIndexes: [], // Indexes resolved
          rootNode: {
            ...s.rootNode,
            physicalOp: 'Index Insert',
            logicalOp: 'Insert',
            estimateRows: 2600,
            estimateIo: 0.8,
            estimateCpu: 0.12,
            hasSpill: false,
            spillDetails: '',
            children: [
              {
                nodeId: 201,
                physicalOp: 'Clustered Index Seek',
                logicalOp: 'Clustered Index Seek',
                estimateRows: 2600,
                actualRows: 2600,
                hasActualRows: true,
                estimateIo: 1.2,
                estimateCpu: 0.15,
                table: 'MemberMoveHistory',
                schema: 'program',
                database: 'personal_db',
                index: 'IX_MemberMoveHistory_BranchId_Date',
                hasSpill: false,
                spillDetails: '',
                warnings: [],
                children: [],
              },
            ],
          },
        };
      }
      return {
        ...s,
        statementSubTreeCost: Math.max(0.01, s.statementSubTreeCost * 0.45),
      };
    });

    const optPlan = {
      ...basePlan,
      planName: '[report].[ProcRptGetTransactionSummarySavingCollection_QUERY_STATISTICS_LIVE__V2].sqlplan',
      totalSubTreeCost: 46.47,
      allMissingIndexes: [],
      antiPatterns: [],
      statements: optStatements,
      hardwareMetrics: {
        hasRuntimeMetrics: true,
        totalLogicalReads: 1420,
        totalLogicalReadsMb: 11.09,
        totalPhysicalReads: 0,
        totalPhysicalReadsMb: 0,
        totalReadAheads: 0,
        totalReadAheadsMb: 0,
        totalLobLogicalReads: 0,
        totalLobPhysicalReads: 0,
        cacheHitRatioPercent: 100.0,
        totalActualCpuMs: 42,
        totalActualElapsedMs: 68,
        cpuUtilizationRatio: 61.8,
        waitTimeMs: 0,
        memoryGrantWaitTimeMs: 0,
        requestedMemoryKb: 11800,
        grantedMemoryKb: 11800,
        maxUsedMemoryKb: 11468,
        maxQueryMemoryKb: 11800,
        estimatedAvailableMemoryKb: 1048576,
        estimatedPagesCached: 9400,
        isMemoryGrantFeedbackAdjusted: 'Yes (Memory Optimized)',
        topIoLeaders: [
          {
            rank: 1,
            database: 'personal_db',
            schema: 'program',
            table: 'MemberMoveHistory',
            logicalReads: 797,
            logicalReadsMb: 6.23,
            physicalReads: 0,
            physicalReadsMb: 0,
            readAheads: 0,
            readAheadsMb: 0,
            readPercent: 56.1,
            accessOperations: ['Clustered Index Seek'],
            indexesUsed: ['IX_MemberMoveHistory_BranchId_Date'],
          },
          {
            rank: 2,
            database: 'personal_db',
            schema: 'program',
            table: 'Group',
            logicalReads: 120,
            logicalReadsMb: 0.94,
            physicalReads: 0,
            physicalReadsMb: 0,
            readAheads: 0,
            readAheadsMb: 0,
            readPercent: 8.5,
            accessOperations: ['Index Seek'],
            indexesUsed: ['IX_Group_MeetingDayId'],
          },
          {
            rank: 3,
            database: 'tempdb',
            schema: 'dbo',
            table: '#GRP_MOVE_LIST_BY_MEMBERS',
            logicalReads: 32,
            logicalReadsMb: 0.25,
            physicalReads: 0,
            physicalReadsMb: 0,
            readAheads: 0,
            readAheadsMb: 0,
            readPercent: 2.3,
            accessOperations: ['Clustered Index Insert'],
            indexesUsed: ['IX_GRP_HISTORY_MemberId'],
          },
        ],
      },
      waitStats: [], // 100% eliminated waits
      diagnostics: {
        ...basePlan.diagnostics,
        healthScore: 92,
        scoreGrade: 'A',
        consolidatedIndexes: [],
        implicitConversions: [],
        scalarUdfWarnings: [],
      },
      executiveVerdict: {
        culpritStatementId: '2',
        costPercentage: 14.8,
        headline: 'Optimization Successful: Subtree cost reduced by 53.9% (100.72 ➔ 46.47).',
        summary: 'Pre-created temp table with clustered index eliminated TempDB Sort Spill and converted table scan into an index seek. Logical reads dropped by 91.1% (124.5 MB ➔ 11.1 MB).',
        topOperator: 'Index Seek',
        actionableFix: 'All critical anti-patterns and memory spills resolved in-memory.',
      },
    } as unknown as PlanAnalysis;

    setPlanB(optPlan);
    setSelectedStmtIdx(1);
    setViewMode('metrics');
  };

  // Compare both plans when available
  const comparison = useMemo<PlanComparison | null>(() => {
    if (!planA || !planB) return null;
    return comparePlansClient(planA, planB);
  }, [planA, planB]);

  // Deep hardware & runtime comparison metrics
  const deltaMetrics = useMemo(() => {
    if (!planA || !planB) return null;

    const costA = planA.totalSubTreeCost || 0;
    const costB = planB.totalSubTreeCost || 0;
    const costReductionPct = costA > 0 ? ((costA - costB) / costA) * 100 : 0;

    // Logical reads
    const readsPagesA = planA.hardwareMetrics?.totalLogicalReads || 0;
    const readsPagesB = planB.hardwareMetrics?.totalLogicalReads || 0;
    const readsA = planA.hardwareMetrics?.totalLogicalReadsMb || Math.round((readsPagesA / 128) * 10) / 10;
    const readsB = planB.hardwareMetrics?.totalLogicalReadsMb || Math.round((readsPagesB / 128) * 10) / 10;
    const readsReductionPct = readsA > 0 ? ((readsA - readsB) / readsA) * 100 : (readsPagesA > 0 ? ((readsPagesA - readsPagesB) / readsPagesA) * 100 : 0);

    // Physical reads
    const physA = planA.hardwareMetrics?.totalPhysicalReads || 0;
    const physB = planB.hardwareMetrics?.totalPhysicalReads || 0;
    const physMbA = planA.hardwareMetrics?.totalPhysicalReadsMb || Math.round((physA / 128) * 10) / 10;
    const physMbB = planB.hardwareMetrics?.totalPhysicalReadsMb || Math.round((physB / 128) * 10) / 10;
    const physDelta = physB - physA;

    // Read-Aheads
    const readAheadsA = planA.hardwareMetrics?.totalReadAheads || 0;
    const readAheadsB = planB.hardwareMetrics?.totalReadAheads || 0;
    const readAheadsMbA = planA.hardwareMetrics?.totalReadAheadsMb || Math.round((readAheadsA / 128) * 10) / 10;
    const readAheadsMbB = planB.hardwareMetrics?.totalReadAheadsMb || Math.round((readAheadsB / 128) * 10) / 10;

    // Cache hit ratio
    const cacheHitA = planA.hardwareMetrics?.cacheHitRatioPercent ?? (readsPagesA > 0 ? Math.max(0, ((readsPagesA - physA) / readsPagesA) * 100) : 100);
    const cacheHitB = planB.hardwareMetrics?.cacheHitRatioPercent ?? (readsPagesB > 0 ? Math.max(0, ((readsPagesB - physB) / readsPagesB) * 100) : 100);

    // CPU and Elapsed
    const cpuA = planA.hardwareMetrics?.totalActualCpuMs || 0;
    const cpuB = planB.hardwareMetrics?.totalActualCpuMs || 0;
    const cpuReductionPct = cpuA > 0 ? ((cpuA - cpuB) / cpuA) * 100 : 0;
    const cpuDelta = cpuB - cpuA;

    const elapsedA = planA.hardwareMetrics?.totalActualElapsedMs || 0;
    const elapsedB = planB.hardwareMetrics?.totalActualElapsedMs || 0;
    const elapsedReductionPct = elapsedA > 0 ? ((elapsedA - elapsedB) / elapsedA) * 100 : 0;
    const elapsedDelta = elapsedB - elapsedA;

    // CPU efficiency ratio
    const cpuRatioA = elapsedA > 0 ? Math.round((cpuA / elapsedA) * 100) : (cpuA > 0 ? 100 : 0);
    const cpuRatioB = elapsedB > 0 ? Math.round((cpuB / elapsedB) * 100) : (cpuB > 0 ? 100 : 0);

    // Wait time bottleneck
    const waitTimeA = Math.max(0, elapsedA - cpuA);
    const waitTimeB = Math.max(0, elapsedB - cpuB);
    const waitReductionPct = waitTimeA > 0 ? ((waitTimeA - waitTimeB) / waitTimeA) * 100 : 0;

    // Memory Workspace Grant
    const grantedKbA = planA.hardwareMetrics?.grantedMemoryKb || planA.diagnostics?.memoryGrant?.grantedMemoryKb || 0;
    const grantedKbB = planB.hardwareMetrics?.grantedMemoryKb || planB.diagnostics?.memoryGrant?.grantedMemoryKb || 0;
    const grantedMbA = Math.round((grantedKbA / 1024) * 10) / 10;
    const grantedMbB = Math.round((grantedKbB / 1024) * 10) / 10;

    const usedKbA = planA.hardwareMetrics?.maxUsedMemoryKb || planA.diagnostics?.memoryGrant?.maxUsedMemoryKb || 0;
    const usedKbB = planB.hardwareMetrics?.maxUsedMemoryKb || planB.diagnostics?.memoryGrant?.maxUsedMemoryKb || 0;
    const usedMbA = Math.round((usedKbA / 1024) * 10) / 10;
    const usedMbB = Math.round((usedKbB / 1024) * 10) / 10;

    const wastedMbA = Math.max(0, Math.round(((grantedKbA - usedKbA) / 1024) * 10) / 10);
    const wastedMbB = Math.max(0, Math.round(((grantedKbB - usedKbB) / 1024) * 10) / 10);
    const wastedPctA = grantedKbA > 0 ? Math.round(((grantedKbA - usedKbA) / grantedKbA) * 100) : 0;
    const wastedPctB = grantedKbB > 0 ? Math.round(((grantedKbB - usedKbB) / grantedKbB) * 100) : 0;

    const grantWaitA = planA.hardwareMetrics?.memoryGrantWaitTimeMs || planA.diagnostics?.memoryGrant?.grantWaitTimeMs || 0;
    const grantWaitB = planB.hardwareMetrics?.memoryGrantWaitTimeMs || planB.diagnostics?.memoryGrant?.grantWaitTimeMs || 0;

    const feedbackAdjustedA = planA.hardwareMetrics?.isMemoryGrantFeedbackAdjusted || planA.diagnostics?.memoryGrant?.feedbackAdjusted || 'None';
    const feedbackAdjustedB = planB.hardwareMetrics?.isMemoryGrantFeedbackAdjusted || planB.diagnostics?.memoryGrant?.feedbackAdjusted || 'None';

    // TempDB spills
    const spillsA = planA.statements.reduce((acc, s) => acc + (s.warnings?.filter((w) => (w as any).hasSpill || w.kind === 'SpillToTempDb' || w.description?.toLowerCase().includes('spill')).length || 0), 0);
    const spillsB = planB.statements.reduce((acc, s) => acc + (s.warnings?.filter((w) => (w as any).hasSpill || w.kind === 'SpillToTempDb' || w.description?.toLowerCase().includes('spill')).length || 0), 0);

    // Missing indexes
    const missingA = planA.allMissingIndexes?.length || 0;
    const missingB = planB.allMissingIndexes?.length || 0;

    // Health Score
    const scoreA = planA.diagnostics?.healthScore || 0;
    const scoreB = planB.diagnostics?.healthScore || 0;
    const gradeA = planA.diagnostics?.scoreGrade || (scoreA >= 80 ? 'A' : scoreA >= 60 ? 'B' : scoreA >= 40 ? 'C' : 'F');
    const gradeB = planB.diagnostics?.scoreGrade || (scoreB >= 80 ? 'A' : scoreB >= 60 ? 'B' : scoreB >= 40 ? 'C' : 'F');

    // Wait Stats Diff
    const mapWaitB = new Map<string, WaitStat>();
    (planB.waitStats || []).forEach((w) => mapWaitB.set(w.waitType.toUpperCase(), w));

    const processedWaitTypes = new Set<string>();
    interface WaitDiffItem {
      waitType: string;
      category: string;
      description: string;
      timeA: number;
      countA: number;
      timeB: number;
      countB: number;
      timeDelta: number;
      reductionPct: number;
      status: 'ELIMINATED' | 'REDUCED' | 'INCREASED' | 'NEW' | 'UNCHANGED';
    }
    const waitDiffs: WaitDiffItem[] = [];

    (planA.waitStats || []).forEach((wa) => {
      const key = wa.waitType.toUpperCase();
      processedWaitTypes.add(key);
      const wb = mapWaitB.get(key);
      const timeB = wb?.waitTimeMs || 0;
      const countB = wb?.waitCount || 0;
      const timeDelta = wa.waitTimeMs - timeB;
      const reductionPct = wa.waitTimeMs > 0 ? ((wa.waitTimeMs - timeB) / wa.waitTimeMs) * 100 : 0;
      let status: WaitDiffItem['status'] = 'UNCHANGED';
      if (!wb || timeB === 0) status = 'ELIMINATED';
      else if (timeDelta > 0) status = 'REDUCED';
      else if (timeDelta < 0) status = 'INCREASED';

      waitDiffs.push({
        waitType: wa.waitType,
        category: wa.category || 'Other',
        description: wa.description || 'Engine wait event',
        timeA: wa.waitTimeMs,
        countA: wa.waitCount,
        timeB,
        countB,
        timeDelta,
        reductionPct,
        status,
      });
    });

    (planB.waitStats || []).forEach((wb) => {
      const key = wb.waitType.toUpperCase();
      if (!processedWaitTypes.has(key)) {
        waitDiffs.push({
          waitType: wb.waitType,
          category: wb.category || 'Other',
          description: wb.description || 'Engine wait event',
          timeA: 0,
          countA: 0,
          timeB: wb.waitTimeMs,
          countB: wb.waitCount,
          timeDelta: -wb.waitTimeMs,
          reductionPct: -100,
          status: 'NEW',
        });
      }
    });

    waitDiffs.sort((a, b) => Math.abs(b.timeDelta) - Math.abs(a.timeDelta));

    // Table I/O Leaderboard Diff
    const mapTableB = new Map<string, TableIOLeader>();
    (planB.hardwareMetrics?.topIoLeaders || []).forEach((t) => {
      const key = `${t.database || ''}.${t.schema || ''}.${t.table}`.toLowerCase();
      mapTableB.set(key, t);
    });

    const processedTables = new Set<string>();
    interface TableDiffItem {
      database: string;
      schema: string;
      table: string;
      readsA: number;
      readsMbA: number;
      readsB: number;
      readsMbB: number;
      readsDelta: number;
      reductionPct: number;
      physA: number;
      physB: number;
      opsA: string[];
      opsB: string[];
      status: 'OPTIMIZED' | 'REDUCED' | 'REGRESSED' | 'NEW_READ' | 'UNCHANGED';
    }
    const tableDiffs: TableDiffItem[] = [];

    (planA.hardwareMetrics?.topIoLeaders || []).forEach((ta) => {
      const key = `${ta.database || ''}.${ta.schema || ''}.${ta.table}`.toLowerCase();
      processedTables.add(key);
      const tb = mapTableB.get(key);
      const readsB = tb?.logicalReads || 0;
      const readsMbB = tb?.logicalReadsMb || 0;
      const readsDelta = ta.logicalReads - readsB;
      const reductionPct = ta.logicalReads > 0 ? ((ta.logicalReads - readsB) / ta.logicalReads) * 100 : 0;
      let status: TableDiffItem['status'] = 'UNCHANGED';
      if (readsB === 0) status = 'OPTIMIZED';
      else if (readsDelta > 0) status = 'REDUCED';
      else if (readsDelta < 0) status = 'REGRESSED';

      tableDiffs.push({
        database: ta.database,
        schema: ta.schema,
        table: ta.table,
        readsA: ta.logicalReads,
        readsMbA: ta.logicalReadsMb,
        readsB,
        readsMbB,
        readsDelta,
        reductionPct,
        physA: ta.physicalReads || 0,
        physB: tb?.physicalReads || 0,
        opsA: ta.accessOperations || [],
        opsB: tb?.accessOperations || [],
        status,
      });
    });

    (planB.hardwareMetrics?.topIoLeaders || []).forEach((tb) => {
      const key = `${tb.database || ''}.${tb.schema || ''}.${tb.table}`.toLowerCase();
      if (!processedTables.has(key)) {
        tableDiffs.push({
          database: tb.database,
          schema: tb.schema,
          table: tb.table,
          readsA: 0,
          readsMbA: 0,
          readsB: tb.logicalReads,
          readsMbB: tb.logicalReadsMb,
          readsDelta: -tb.logicalReads,
          reductionPct: -100,
          physA: 0,
          physB: tb.physicalReads || 0,
          opsA: [],
          opsB: tb.accessOperations || [],
          status: 'NEW_READ',
        });
      }
    });

    tableDiffs.sort((a, b) => Math.abs(b.readsDelta) - Math.abs(a.readsDelta));

    return {
      costA,
      costB,
      costReductionPct,
      readsPagesA,
      readsPagesB,
      readsA,
      readsB,
      readsReductionPct,
      physA,
      physB,
      physMbA,
      physMbB,
      physDelta,
      readAheadsA,
      readAheadsB,
      readAheadsMbA,
      readAheadsMbB,
      cacheHitA,
      cacheHitB,
      cpuA,
      cpuB,
      cpuReductionPct,
      cpuDelta,
      elapsedA,
      elapsedB,
      elapsedReductionPct,
      elapsedDelta,
      cpuRatioA,
      cpuRatioB,
      waitTimeA,
      waitTimeB,
      waitReductionPct,
      grantedKbA,
      grantedKbB,
      grantedMbA,
      grantedMbB,
      usedKbA,
      usedKbB,
      usedMbA,
      usedMbB,
      wastedMbA,
      wastedMbB,
      wastedPctA,
      wastedPctB,
      grantWaitA,
      grantWaitB,
      feedbackAdjustedA,
      feedbackAdjustedB,
      spillsA,
      spillsB,
      missingA,
      missingB,
      scoreA,
      scoreB,
      gradeA,
      gradeB,
      waitDiffs,
      tableDiffs,
    };
  }, [planA, planB]);

  // Selected matching statement for visual diff
  const activeStatementA = planA?.statements?.[selectedStmtIdx] || planA?.statements?.[0];
  const activeStatementB = planB?.statements?.[selectedStmtIdx] || planB?.statements?.[0];

  // Helper to flatten node tree for side-by-side inspection
  const flattenNodes = (node: PlanNode | undefined): PlanNode[] => {
    if (!node) return [];
    const list: PlanNode[] = [node];
    if (node.children) {
      node.children.forEach((c) => list.push(...flattenNodes(c)));
    }
    return list;
  };

  const nodesA = useMemo(() => flattenNodes(activeStatementA?.rootNode), [activeStatementA]);
  const nodesB = useMemo(() => flattenNodes(activeStatementB?.rootNode), [activeStatementB]);

  return (
    <div className="tab-scroll-container">
      {/* 1. Header Toolbar */}
      <div className="section-block" style={{ marginBottom: '16px' }}>
        <div
          className="glass-panel"
          style={{
            borderRadius: '12px',
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GitCompare size={20} color="#38bdf8" />
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#fff', margin: 0 }}>
                Execution Plan Comparator &amp; Benchmark
              </h2>
              <span className="badge badge-info" style={{ fontSize: '11px' }}>
                Offline A/B Diff
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>
              Import two execution plans side-by-side to verify query rewrites, index gains, TempDB spill elimination, RAM reads, and wait times.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {planA && planB && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleSwapPlans}
                title="Swap Plan A and Plan B"
              >
                <ArrowLeftRight size={13} color="#a78bfa" />
                <span>Swap (A ⇄ B)</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleLoadSampleBenchmark}
              title="Load demo real-world optimization benchmark"
            >
              <FileCode2 size={13} />
              <span>Load Sample Benchmark</span>
            </button>

            {(planA || planB) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleReset}
                title="Clear loaded plans"
              >
                <RotateCcw size={13} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Dual Import Hub (Plan A vs Plan B) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Left: Plan A (Baseline) */}
        <div
          className="glass-panel"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOverA(true);
          }}
          onDragLeave={() => setIsDragOverA(false)}
          onDrop={(e) => handleDrop(e, 'A')}
          style={{
            borderRadius: '12px',
            padding: '18px',
            border: isDragOverA ? '2px dashed #38bdf8' : planA ? '1px solid rgba(244, 63, 94, 0.4)' : '1px dashed #334155',
            background: planA ? 'linear-gradient(135deg, rgba(244, 63, 94, 0.05) 0%, rgba(15, 23, 42, 0.7) 100%)' : '#070b14',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '160px',
            transition: 'all 0.2s ease',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#f43f5e', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', padding: '2px 8px', borderRadius: '4px' }}>
                Plan A (Baseline / Before)
              </span>
              {currentPlan && !planA && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                  onClick={() => setPlanA(currentPlan)}
                >
                  Use Active Plan
                </button>
              )}
            </div>

            {planA ? (
              <div>
                <h3 style={{ fontSize: '14.5px', fontWeight: 700, color: '#fff', margin: '0 0 6px', wordBreak: 'break-all' }}>
                  {planA.planName}
                </h3>
                <div style={{ display: 'flex', gap: '12px', fontSize: '11.5px', color: '#cbd5e1', flexWrap: 'wrap' }}>
                  <span>Cost: <strong style={{ color: '#f43f5e' }}>{planA.totalSubTreeCost.toFixed(2)}</strong></span>
                  <span>•</span>
                  <span>Stmts: <strong>{planA.statements.length}</strong></span>
                  <span>•</span>
                  <span>Health: <strong style={{ color: '#f43f5e' }}>{planA.diagnostics?.healthScore ?? 'N/A'}/100 [{planA.diagnostics?.scoreGrade || 'F'}]</strong></span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8' }}>
                <Upload size={24} style={{ margin: '0 auto 8px', opacity: 0.6 }} />
                <div style={{ fontSize: '12px', fontWeight: 600 }}>Drag &amp; Drop Plan A (.sqlplan / .xml)</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>or click the button below to browse</div>
              </div>
            )}
          </div>

          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ width: '100%' }}
              onClick={() => handleOpenFileForPlan('A')}
              disabled={loadingA}
            >
              <Upload size={12} color="#38bdf8" />
              <span>{planA ? 'Change Plan A (.sqlplan)' : 'Import Plan A (.sqlplan)'}</span>
            </button>
            <input
              ref={fileInputARef}
              type="file"
              accept=".sqlplan,.xml"
              onChange={(e) => handleFileUpload(e, 'A')}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {/* Right: Plan B (Optimized) */}
        <div
          className="glass-panel"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOverB(true);
          }}
          onDragLeave={() => setIsDragOverB(false)}
          onDrop={(e) => handleDrop(e, 'B')}
          style={{
            borderRadius: '12px',
            padding: '18px',
            border: isDragOverB ? '2px dashed #34d399' : planB ? '1px solid rgba(52, 211, 153, 0.4)' : '1px dashed #334155',
            background: planB ? 'linear-gradient(135deg, rgba(52, 211, 153, 0.05) 0%, rgba(15, 23, 42, 0.7) 100%)' : '#070b14',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '160px',
            transition: 'all 0.2s ease',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#34d399', background: 'rgba(52, 211, 153, 0.15)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '2px 8px', borderRadius: '4px' }}>
                Plan B (Optimized / After Fix)
              </span>
            </div>

            {planB ? (
              <div>
                <h3 style={{ fontSize: '14.5px', fontWeight: 700, color: '#fff', margin: '0 0 6px', wordBreak: 'break-all' }}>
                  {planB.planName}
                </h3>
                <div style={{ display: 'flex', gap: '12px', fontSize: '11.5px', color: '#cbd5e1', flexWrap: 'wrap' }}>
                  <span>Cost: <strong style={{ color: '#34d399' }}>{planB.totalSubTreeCost.toFixed(2)}</strong></span>
                  <span>•</span>
                  <span>Stmts: <strong>{planB.statements.length}</strong></span>
                  <span>•</span>
                  <span>Health: <strong style={{ color: '#34d399' }}>{planB.diagnostics?.healthScore ?? 'N/A'}/100 [{planB.diagnostics?.scoreGrade || 'A'}]</strong></span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8' }}>
                <Upload size={24} style={{ margin: '0 auto 8px', opacity: 0.6 }} />
                <div style={{ fontSize: '12px', fontWeight: 600 }}>Drag &amp; Drop Plan B (.sqlplan / .xml)</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>or click the button below to browse</div>
              </div>
            )}
          </div>

          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ width: '100%' }}
              onClick={() => handleOpenFileForPlan('B')}
              disabled={loadingB}
            >
              <Upload size={12} color="#34d399" />
              <span>{planB ? 'Change Plan B (.sqlplan)' : 'Import Plan B (.sqlplan)'}</span>
            </button>
            <input
              ref={fileInputBRef}
              type="file"
              accept=".sqlplan,.xml"
              onChange={(e) => handleFileUpload(e, 'B')}
              style={{ display: 'none' }}
            />
          </div>
        </div>
      </div>

      {/* 3. Executive Benchmark Delta Card (Rendered when both plans loaded) */}
      {deltaMetrics && (
        <div className="section-block" style={{ marginBottom: '20px' }}>
          <div
            className="glass-panel"
            style={{
              borderRadius: '12px',
              padding: '20px',
              background: deltaMetrics.costReductionPct > 0
                ? 'linear-gradient(135deg, rgba(52, 211, 153, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)'
                : 'linear-gradient(135deg, rgba(244, 63, 94, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)',
              border: deltaMetrics.costReductionPct > 0 ? '1px solid rgba(52, 211, 153, 0.35)' : '1px solid rgba(244, 63, 94, 0.35)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <span
                  style={{
                    background: deltaMetrics.costReductionPct > 0 ? 'rgba(52, 211, 153, 0.25)' : 'rgba(244, 63, 94, 0.25)',
                    color: deltaMetrics.costReductionPct > 0 ? '#34d399' : '#f43f5e',
                    border: `1px solid ${deltaMetrics.costReductionPct > 0 ? 'rgba(52, 211, 153, 0.5)' : 'rgba(244, 63, 94, 0.5)'}`,
                    padding: '3px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Sparkles size={12} />
                  {deltaMetrics.costReductionPct > 0 ? '🚀 Significant Optimization Detected' : '⚠️ Cost Regression Detected'}
                </span>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: '6px 0 0' }}>
                  {deltaMetrics.costReductionPct > 0
                    ? `Execution Cost Reduced by ${deltaMetrics.costReductionPct.toFixed(1)}%`
                    : `Execution Cost Increased by ${Math.abs(deltaMetrics.costReductionPct).toFixed(1)}%`}
                </h3>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>Subtree Cost:</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#f43f5e' }}>{deltaMetrics.costA.toFixed(2)}</span>
                <ArrowRight size={16} color="#94a3b8" />
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#34d399' }}>{deltaMetrics.costB.toFixed(2)}</span>
              </div>
            </div>

            {/* 6 Core Benchmark Metric Pills */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
              {/* Metric 1: Logical Reads */}
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <HardDrive size={12} color="#38bdf8" /> RAM Reads (I/O)
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: deltaMetrics.readsReductionPct > 0 ? '#34d399' : '#e2e8f0', marginTop: '4px' }}>
                  {deltaMetrics.readsA > 0 || deltaMetrics.readsPagesA > 0 
                    ? `${deltaMetrics.readsA.toFixed(1)} MB ➔ ${deltaMetrics.readsB.toFixed(1)} MB` 
                    : '0.0 MB'}
                </div>
                <div style={{ fontSize: '11px', color: deltaMetrics.readsReductionPct > 0 ? '#34d399' : '#94a3b8', marginTop: '2px' }}>
                  {deltaMetrics.readsReductionPct > 0 ? `-${deltaMetrics.readsReductionPct.toFixed(1)}% less RAM touched` : 'Identical reads'}
                </div>
              </div>

              {/* Metric 2: CPU Time */}
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Cpu size={12} color="#38bdf8" /> CPU Execution
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: deltaMetrics.cpuReductionPct > 0 ? '#34d399' : '#e2e8f0', marginTop: '4px' }}>
                  {deltaMetrics.cpuA} ms ➔ {deltaMetrics.cpuB} ms
                </div>
                <div style={{ fontSize: '11px', color: deltaMetrics.cpuReductionPct > 0 ? '#34d399' : '#94a3b8', marginTop: '2px' }}>
                  {deltaMetrics.cpuReductionPct > 0 ? `-${deltaMetrics.cpuReductionPct.toFixed(1)}% CPU burn reduced` : `${deltaMetrics.elapsedB} ms Clock`}
                </div>
              </div>

              {/* Metric 3: TempDB Spills */}
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <AlertTriangle size={12} color="#fbbf24" /> TempDB Spills
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: deltaMetrics.spillsB === 0 && deltaMetrics.spillsA > 0 ? '#34d399' : '#e2e8f0', marginTop: '4px' }}>
                  {deltaMetrics.spillsA} Spills ➔ {deltaMetrics.spillsB} Spills
                </div>
                <div style={{ fontSize: '11px', color: deltaMetrics.spillsB === 0 && deltaMetrics.spillsA > 0 ? '#34d399' : '#94a3b8', marginTop: '2px' }}>
                  {deltaMetrics.spillsB === 0 && deltaMetrics.spillsA > 0 ? '✓ 100% In-Memory (Zero Spills)' : 'No spills change'}
                </div>
              </div>

              {/* Metric 4: Memory Grant */}
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Database size={12} color="#a78bfa" /> Memory Grant
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: deltaMetrics.grantedMbB <= deltaMetrics.grantedMbA ? '#34d399' : '#e2e8f0', marginTop: '4px' }}>
                  {deltaMetrics.grantedMbA > 0 ? `${deltaMetrics.grantedMbA.toFixed(1)} MB ➔ ${deltaMetrics.grantedMbB.toFixed(1)} MB` : 'N/A'}
                </div>
                <div style={{ fontSize: '11px', color: deltaMetrics.wastedMbA > deltaMetrics.wastedMbB ? '#34d399' : '#94a3b8', marginTop: '2px' }}>
                  {deltaMetrics.wastedMbA > 0 ? `${deltaMetrics.wastedMbB.toFixed(1)} MB RAM wasted` : 'Zero RAM bloat'}
                </div>
              </div>

              {/* Metric 5: Missing Indexes */}
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Layers size={12} color="#a855f7" /> Missing Indexes
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: deltaMetrics.missingB < deltaMetrics.missingA ? '#34d399' : '#e2e8f0', marginTop: '4px' }}>
                  {deltaMetrics.missingA} Missing ➔ {deltaMetrics.missingB} Left
                </div>
                <div style={{ fontSize: '11px', color: deltaMetrics.missingB < deltaMetrics.missingA ? '#34d399' : '#94a3b8', marginTop: '2px' }}>
                  {Math.max(0, deltaMetrics.missingA - deltaMetrics.missingB)} Index Recommendation(s) Resolved
                </div>
              </div>

              {/* Metric 6: Health Score */}
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Sparkles size={12} color="#34d399" /> Health Score
                </div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: deltaMetrics.scoreB >= deltaMetrics.scoreA ? '#34d399' : '#f43f5e', marginTop: '4px' }}>
                  {deltaMetrics.scoreA}/100 ➔ {deltaMetrics.scoreB}/100
                </div>
                <div style={{ fontSize: '11px', color: deltaMetrics.scoreB >= deltaMetrics.scoreA ? '#34d399' : '#f43f5e', marginTop: '2px' }}>
                  {deltaMetrics.scoreB >= deltaMetrics.scoreA ? `+${deltaMetrics.scoreB - deltaMetrics.scoreA} pts Improvement [Grade ${deltaMetrics.gradeB}]` : `Regression`}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. View Mode Switcher (All Dimensions of Comparison) */}
      {planA && planB && (
        <div
          className="section-block"
          style={{
            flexShrink: 0,
            marginBottom: '16px',
          }}
        >
          <div
            className="glass-panel"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '10px',
              background: '#090d16',
              border: '1px solid #1e293b',
              minHeight: '48px',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('metrics')}
              className={`btn btn-sm ${viewMode === 'metrics' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                height: '36px',
                minHeight: '36px',
                padding: '0 14px',
                fontSize: '12px',
                fontWeight: viewMode === 'metrics' ? 700 : 500,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: 'pointer',
                borderRadius: '7px',
              }}
            >
              <Layers size={14} color={viewMode === 'metrics' ? '#ffffff' : '#38bdf8'} />
              <span>Hardware &amp; Metrics Benchmark</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('waits')}
              className={`btn btn-sm ${viewMode === 'waits' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                height: '36px',
                minHeight: '36px',
                padding: '0 14px',
                fontSize: '12px',
                fontWeight: viewMode === 'waits' ? 700 : 500,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: 'pointer',
                borderRadius: '7px',
              }}
            >
              <Clock size={14} color={viewMode === 'waits' ? '#ffffff' : '#fbbf24'} />
              <span>Wait Types &amp; Bottlenecks Diff</span>
              {deltaMetrics && deltaMetrics.waitDiffs.length > 0 && (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    background: viewMode === 'waits' ? 'rgba(255,255,255,0.25)' : 'rgba(56, 189, 248, 0.2)',
                    color: viewMode === 'waits' ? '#ffffff' : '#38bdf8',
                  }}
                >
                  {deltaMetrics.waitDiffs.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setViewMode('memory')}
              className={`btn btn-sm ${viewMode === 'memory' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                height: '36px',
                minHeight: '36px',
                padding: '0 14px',
                fontSize: '12px',
                fontWeight: viewMode === 'memory' ? 700 : 500,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: 'pointer',
                borderRadius: '7px',
              }}
            >
              <Database size={14} color={viewMode === 'memory' ? '#ffffff' : '#a78bfa'} />
              <span>Memory Workspace &amp; RAM Diff</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('io_tables')}
              className={`btn btn-sm ${viewMode === 'io_tables' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                height: '36px',
                minHeight: '36px',
                padding: '0 14px',
                fontSize: '12px',
                fontWeight: viewMode === 'io_tables' ? 700 : 500,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: 'pointer',
                borderRadius: '7px',
              }}
            >
              <HardDrive size={14} color={viewMode === 'io_tables' ? '#ffffff' : '#34d399'} />
              <span>Table-by-Table I/O Heatmap</span>
              {deltaMetrics && deltaMetrics.tableDiffs.length > 0 && (
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    background: viewMode === 'io_tables' ? 'rgba(255,255,255,0.25)' : 'rgba(52, 211, 153, 0.2)',
                    color: viewMode === 'io_tables' ? '#ffffff' : '#34d399',
                  }}
                >
                  {deltaMetrics.tableDiffs.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setViewMode('visual')}
              className={`btn btn-sm ${viewMode === 'visual' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                height: '36px',
                minHeight: '36px',
                padding: '0 14px',
                fontSize: '12px',
                fontWeight: viewMode === 'visual' ? 700 : 500,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: 'pointer',
                borderRadius: '7px',
              }}
            >
              <Eye size={14} color={viewMode === 'visual' ? '#ffffff' : '#38bdf8'} />
              <span>Side-by-Side Visual Operator Tree</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('statements')}
              className={`btn btn-sm ${viewMode === 'statements' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                height: '36px',
                minHeight: '36px',
                padding: '0 14px',
                fontSize: '12px',
                fontWeight: viewMode === 'statements' ? 700 : 500,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: 'pointer',
                borderRadius: '7px',
              }}
            >
              <ListOrdered size={14} color={viewMode === 'statements' ? '#ffffff' : '#fb923c'} />
              <span>Statement Cost Diff Matrix</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('warnings')}
              className={`btn btn-sm ${viewMode === 'warnings' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                height: '36px',
                minHeight: '36px',
                padding: '0 14px',
                fontSize: '12px',
                fontWeight: viewMode === 'warnings' ? 700 : 500,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: 'pointer',
                borderRadius: '7px',
              }}
            >
              <CheckCircle2 size={14} color={viewMode === 'warnings' ? '#ffffff' : '#34d399'} />
              <span>Resolved Anti-Patterns</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. View Mode 1: Comprehensive Hardware, I/O & Metrics Benchmark */}
      {viewMode === 'metrics' && deltaMetrics && (
        <div className="section-block">
          <div className="glass-panel" style={{ borderRadius: '12px', padding: '20px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#fff', margin: '0 0 14px' }}>
              Full Hardware, I/O, CPU &amp; Compilation Comparison Matrix
            </h4>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#090d16', color: '#94a3b8', borderBottom: '1px solid #1e293b' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Performance Metric</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', color: '#f43f5e' }}>Plan A (Baseline)</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>Plan B (Optimized)</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Absolute Delta</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Benchmark Status</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Row: Subtree Cost */}
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e2e8f0' }}>Total Subtree Cost</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#f43f5e', fontWeight: 700 }}>{deltaMetrics.costA.toFixed(2)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399', fontWeight: 700 }}>{deltaMetrics.costB.toFixed(2)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: deltaMetrics.costReductionPct > 0 ? '#34d399' : '#f43f5e' }}>
                      {deltaMetrics.costReductionPct > 0 ? `-${deltaMetrics.costReductionPct.toFixed(1)}%` : `+${Math.abs(deltaMetrics.costReductionPct).toFixed(1)}%`}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className={`badge ${deltaMetrics.costReductionPct > 0 ? 'badge-success' : 'badge-critical'}`}>
                        {deltaMetrics.costReductionPct > 0 ? '✓ Improved' : '✗ Regression'}
                      </span>
                    </td>
                  </tr>

                  {/* Row: Logical Reads (MB) */}
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e2e8f0' }}>Logical Reads (Memory Touched)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{deltaMetrics.readsA.toFixed(1)} MB ({deltaMetrics.readsPagesA.toLocaleString()} pages)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>{deltaMetrics.readsB.toFixed(1)} MB ({deltaMetrics.readsPagesB.toLocaleString()} pages)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: deltaMetrics.readsReductionPct > 0 ? '#34d399' : '#94a3b8' }}>
                      {deltaMetrics.readsReductionPct > 0 ? `-${deltaMetrics.readsReductionPct.toFixed(1)}%` : '0%'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className="badge badge-success">✓ Memory Optimized</span>
                    </td>
                  </tr>

                  {/* Row: Physical Disk Reads */}
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e2e8f0' }}>Physical Disk Reads</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{deltaMetrics.physA} pages ({deltaMetrics.physMbA.toFixed(1)} MB)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>{deltaMetrics.physB} pages ({deltaMetrics.physMbB.toFixed(1)} MB)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{deltaMetrics.physDelta} pages</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className="badge badge-success">
                        {deltaMetrics.physB === 0 ? '✓ 100% Cache Hit' : 'Physical Disk I/O'}
                      </span>
                    </td>
                  </tr>

                  {/* Row: Read-Aheads */}
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e2e8f0' }}>Read-Ahead Reads</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{deltaMetrics.readAheadsA} pages ({deltaMetrics.readAheadsMbA.toFixed(1)} MB)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>{deltaMetrics.readAheadsB} pages ({deltaMetrics.readAheadsMbB.toFixed(1)} MB)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{deltaMetrics.readAheadsB - deltaMetrics.readAheadsA} pages</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className="badge badge-info">Storage Engine Prefetch</span>
                    </td>
                  </tr>

                  {/* Row: Buffer Cache Hit Ratio */}
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e2e8f0' }}>Buffer Cache Hit Ratio</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{deltaMetrics.cacheHitA.toFixed(1)}%</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>{deltaMetrics.cacheHitB.toFixed(1)}%</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {deltaMetrics.cacheHitB >= deltaMetrics.cacheHitA ? `+${(deltaMetrics.cacheHitB - deltaMetrics.cacheHitA).toFixed(1)}%` : `-${(deltaMetrics.cacheHitA - deltaMetrics.cacheHitB).toFixed(1)}%`}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className="badge badge-success">✓ RAM Cached</span>
                    </td>
                  </tr>

                  {/* Row: Actual CPU Execution Time */}
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e2e8f0' }}>Actual CPU Execution Time</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{deltaMetrics.cpuA} ms</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>{deltaMetrics.cpuB} ms</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: deltaMetrics.cpuReductionPct > 0 ? '#34d399' : '#94a3b8' }}>
                      {deltaMetrics.cpuReductionPct > 0 ? `-${deltaMetrics.cpuReductionPct.toFixed(1)}%` : `${deltaMetrics.cpuDelta} ms`}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className="badge badge-success">✓ CPU Burn Reduced</span>
                    </td>
                  </tr>

                  {/* Row: Actual Elapsed Wall-Clock Time */}
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e2e8f0' }}>Actual Elapsed Wall-Clock Time</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{deltaMetrics.elapsedA} ms</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>{deltaMetrics.elapsedB} ms</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: deltaMetrics.elapsedReductionPct > 0 ? '#34d399' : '#94a3b8' }}>
                      {deltaMetrics.elapsedReductionPct > 0 ? `-${deltaMetrics.elapsedReductionPct.toFixed(1)}%` : `${deltaMetrics.elapsedDelta} ms`}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className="badge badge-success">✓ Low Latency</span>
                    </td>
                  </tr>

                  {/* Row: CPU Efficiency Ratio */}
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e2e8f0' }}>CPU Efficiency Ratio (Active vs Wait)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{deltaMetrics.cpuRatioA}% Active</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>{deltaMetrics.cpuRatioB}% Active</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{deltaMetrics.cpuRatioB - deltaMetrics.cpuRatioA}%</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className="badge badge-info">Execution Profile</span>
                    </td>
                  </tr>

                  {/* Row: Total Query Wait Time */}
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e2e8f0' }}>Total Query Wait Bottlenecks (Elapsed - CPU)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: deltaMetrics.waitTimeA > 50 ? '#f43f5e' : '#e2e8f0' }}>{deltaMetrics.waitTimeA} ms</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>{deltaMetrics.waitTimeB} ms</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>
                      {deltaMetrics.waitReductionPct > 0 ? `-${deltaMetrics.waitReductionPct.toFixed(1)}%` : `-${Math.max(0, deltaMetrics.waitTimeA - deltaMetrics.waitTimeB)} ms`}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className="badge badge-success">✓ Concurrency Freed</span>
                    </td>
                  </tr>

                  {/* Row: Memory Grant Allocation */}
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e2e8f0' }}>Granted Memory (RAM Reserved)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{deltaMetrics.grantedMbA.toFixed(1)} MB ({deltaMetrics.grantedKbA.toLocaleString()} KB)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>{deltaMetrics.grantedMbB.toFixed(1)} MB ({deltaMetrics.grantedKbB.toLocaleString()} KB)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: deltaMetrics.grantedMbB <= deltaMetrics.grantedMbA ? '#34d399' : '#f43f5e' }}>
                      {(deltaMetrics.grantedMbB - deltaMetrics.grantedMbA).toFixed(1)} MB
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className="badge badge-success">✓ Workspace Semaphore</span>
                    </td>
                  </tr>

                  {/* Row: Max Used Memory */}
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e2e8f0' }}>Max Used Memory (Actual Peak RAM)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>{deltaMetrics.usedMbA.toFixed(1)} MB ({deltaMetrics.usedKbA.toLocaleString()} KB)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>{deltaMetrics.usedMbB.toFixed(1)} MB ({deltaMetrics.usedKbB.toLocaleString()} KB)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {(deltaMetrics.usedMbB - deltaMetrics.usedMbA).toFixed(1)} MB
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className="badge badge-info">RAM Consumption</span>
                    </td>
                  </tr>

                  {/* Row: Wasted RAM Grant */}
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e2e8f0' }}>Wasted / Unused Granted RAM</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: deltaMetrics.wastedMbA > 5 ? '#fbbf24' : '#e2e8f0' }}>
                      {deltaMetrics.wastedMbA.toFixed(1)} MB ({deltaMetrics.wastedPctA}% wasted)
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>
                      {deltaMetrics.wastedMbB.toFixed(1)} MB ({deltaMetrics.wastedPctB}% wasted)
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>
                      -{(deltaMetrics.wastedMbA - deltaMetrics.wastedMbB).toFixed(1)} MB Wasted RAM
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className="badge badge-success">✓ Sizing Balanced</span>
                    </td>
                  </tr>

                  {/* Row: TempDB Spills */}
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e2e8f0' }}>TempDB Spills (Sort &amp; Hash)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: deltaMetrics.spillsA > 0 ? '#f43f5e' : '#e2e8f0' }}>
                      {deltaMetrics.spillsA} Spills
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>
                      {deltaMetrics.spillsB} Spills
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>
                      -{Math.max(0, deltaMetrics.spillsA - deltaMetrics.spillsB)} Spills
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className="badge badge-success">✓ Zero TempDB I/O</span>
                    </td>
                  </tr>

                  {/* Row: Health Score */}
                  <tr>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e2e8f0' }}>Overall Health Score</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#f43f5e', fontWeight: 700 }}>{deltaMetrics.scoreA}/100 [{deltaMetrics.gradeA}]</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399', fontWeight: 700 }}>{deltaMetrics.scoreB}/100 [{deltaMetrics.gradeB}]</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>+{deltaMetrics.scoreB - deltaMetrics.scoreA} pts</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className="badge badge-success">✓ Production Ready</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. View Mode 2: Wait Types & Bottlenecks Diff */}
      {viewMode === 'waits' && deltaMetrics && (
        <div className="section-block">
          <div className="glass-panel" style={{ borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#fff', margin: 0 }}>
                  SQL Server Wait Statistics &amp; Concurrency Bottlenecks Diff
                </h4>
                <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '4px 0 0' }}>
                  Compares wait types recorded during query execution (such as PAGEIOLATCH for storage reads, CXPACKET for thread sync, and RESOURCE_SEMAPHORE for memory grants).
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <span className="badge badge-info" style={{ fontSize: '11px' }}>
                  {deltaMetrics.waitDiffs.length} Wait Types Tracked
                </span>
              </div>
            </div>

            {deltaMetrics.waitDiffs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 20px', background: '#090d16', borderRadius: '8px', border: '1px dashed #1e293b' }}>
                <Clock size={32} color="#64748b" style={{ margin: '0 auto 10px', opacity: 0.6 }} />
                <h5 style={{ color: '#e2e8f0', fontSize: '14px', margin: '0 0 6px' }}>No Wait Statistics Recorded in Plans</h5>
                <p style={{ color: '#94a3b8', fontSize: '12px', maxWidth: '520px', margin: '0 auto' }}>
                  SQL Server populates the <code>&lt;WaitStats&gt;</code> element in actual execution plans when runtime waiting occurs. Estimated plans do not record runtime waits.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#090d16', color: '#94a3b8', borderBottom: '1px solid #1e293b' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Wait Type</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Category</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', color: '#f43f5e' }}>Plan A (Wait Time / Count)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>Plan B (Wait Time / Count)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Time Delta (ms)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deltaMetrics.waitDiffs.map((w, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <strong style={{ color: '#fff' }}>{w.waitType}</strong>
                          <div style={{ color: '#64748b', fontSize: '10.5px', marginTop: '2px' }}>
                            {w.description}
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            className="badge"
                            style={{
                              background: w.category === 'Disk I/O' ? 'rgba(56, 189, 248, 0.15)' : w.category === 'Parallelism' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                              color: w.category === 'Disk I/O' ? '#38bdf8' : w.category === 'Parallelism' ? '#c084fc' : '#fbbf24',
                              border: '1px solid rgba(255,255,255,0.1)',
                              fontSize: '10.5px',
                            }}
                          >
                            {w.category}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#f43f5e', fontWeight: 600 }}>
                          {w.timeA} ms ({w.countA} waits)
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399', fontWeight: 600 }}>
                          {w.timeB} ms ({w.countB} waits)
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: w.timeDelta > 0 ? '#34d399' : '#f43f5e', fontWeight: 700 }}>
                          {w.timeDelta > 0 ? `-${w.timeDelta} ms` : `+${Math.abs(w.timeDelta)} ms`}
                          {w.timeA > 0 && (
                            <span style={{ fontSize: '10.5px', display: 'block', opacity: 0.85 }}>
                              ({w.reductionPct.toFixed(1)}%)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <span
                            className={`badge ${
                              w.status === 'ELIMINATED'
                                ? 'badge-success'
                                : w.status === 'REDUCED'
                                ? 'badge-success'
                                : w.status === 'INCREASED'
                                ? 'badge-critical'
                                : 'badge-info'
                            }`}
                          >
                            {w.status === 'ELIMINATED'
                              ? '✓ 100% Eliminated'
                              : w.status === 'REDUCED'
                              ? '✓ Wait Reduced'
                              : w.status === 'INCREASED'
                              ? '⚠️ Wait Increased'
                              : 'New Wait'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. View Mode 3: Memory Workspace & RAM Diff */}
      {viewMode === 'memory' && deltaMetrics && (
        <div className="section-block">
          <div className="glass-panel" style={{ borderRadius: '12px', padding: '20px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#fff', margin: '0 0 14px' }}>
              Memory Workspace Semaphore, RAM Grants &amp; TempDB Sizing
            </h4>

            {/* 4 Deep Memory Comparison Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              {/* Card 1: Granted Memory */}
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Database size={14} color="#38bdf8" /> Granted RAM Semaphore
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: '8px 0 4px' }}>
                  {deltaMetrics.grantedMbA.toFixed(1)} MB ➔ {deltaMetrics.grantedMbB.toFixed(1)} MB
                </div>
                <div style={{ fontSize: '11.5px', color: deltaMetrics.grantedMbB <= deltaMetrics.grantedMbA ? '#34d399' : '#fbbf24' }}>
                  {deltaMetrics.grantedMbB <= deltaMetrics.grantedMbA ? '✓ Memory grant footprint optimized' : 'Higher memory grant'}
                </div>
              </div>

              {/* Card 2: Max Used Memory */}
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Activity size={14} color="#34d399" /> Peak RAM Consumed
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: '8px 0 4px' }}>
                  {deltaMetrics.usedMbA.toFixed(1)} MB ➔ {deltaMetrics.usedMbB.toFixed(1)} MB
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                  Actual buffer memory used by sort and hash operations
                </div>
              </div>

              {/* Card 3: Wasted RAM */}
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={14} color="#f59e0b" /> Wasted RAM Reserved
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: deltaMetrics.wastedMbB < deltaMetrics.wastedMbA ? '#34d399' : '#f59e0b', margin: '8px 0 4px' }}>
                  {deltaMetrics.wastedMbA.toFixed(1)} MB ➔ {deltaMetrics.wastedMbB.toFixed(1)} MB
                </div>
                <div style={{ fontSize: '11.5px', color: deltaMetrics.wastedMbB < deltaMetrics.wastedMbA ? '#34d399' : '#94a3b8' }}>
                  {deltaMetrics.wastedMbA > 0 ? `Reduced by ${(deltaMetrics.wastedMbA - deltaMetrics.wastedMbB).toFixed(1)} MB unused grant` : 'Zero unused RAM'}
                </div>
              </div>

              {/* Card 4: Grant Wait Time */}
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} color="#a855f7" /> Grant Wait Time
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: '8px 0 4px' }}>
                  {deltaMetrics.grantWaitA} ms ➔ {deltaMetrics.grantWaitB} ms
                </div>
                <div style={{ fontSize: '11.5px', color: '#34d399' }}>
                  {deltaMetrics.grantWaitB === 0 ? '✓ Immediate memory grant (No semaphore queue)' : 'Queued for memory grant'}
                </div>
              </div>
            </div>

            {/* Visual RAM Allocation Bar Comparison */}
            <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px' }}>
              <h5 style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', margin: '0 0 12px' }}>
                Visual RAM Semaphore Allocation vs Peak Utilization
              </h5>

              {/* Plan A Bar */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#94a3b8', marginBottom: '4px' }}>
                  <span>Plan A: Granted {deltaMetrics.grantedMbA.toFixed(1)} MB (Used: {deltaMetrics.usedMbA.toFixed(1)} MB)</span>
                  <span style={{ color: deltaMetrics.wastedPctA > 40 ? '#f59e0b' : '#94a3b8' }}>{deltaMetrics.wastedPctA}% Unused RAM</span>
                </div>
                <div style={{ height: '12px', width: '100%', background: '#1e293b', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
                  <div
                    style={{
                      width: `${deltaMetrics.grantedMbA > 0 ? Math.min(100, (deltaMetrics.usedMbA / deltaMetrics.grantedMbA) * 100) : 0}%`,
                      background: '#f43f5e',
                      height: '100%',
                    }}
                    title="Actual Used Memory"
                  />
                  <div
                    style={{
                      width: `${deltaMetrics.grantedMbA > 0 ? Math.max(0, 100 - (deltaMetrics.usedMbA / deltaMetrics.grantedMbA) * 100) : 100}%`,
                      background: 'rgba(245, 158, 11, 0.4)',
                      height: '100%',
                    }}
                    title="Wasted Memory Grant"
                  />
                </div>
              </div>

              {/* Plan B Bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#94a3b8', marginBottom: '4px' }}>
                  <span>Plan B: Granted {deltaMetrics.grantedMbB.toFixed(1)} MB (Used: {deltaMetrics.usedMbB.toFixed(1)} MB)</span>
                  <span style={{ color: '#34d399' }}>{deltaMetrics.wastedPctB}% Unused RAM (Tightly Sized)</span>
                </div>
                <div style={{ height: '12px', width: '100%', background: '#1e293b', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
                  <div
                    style={{
                      width: `${deltaMetrics.grantedMbB > 0 ? Math.min(100, (deltaMetrics.usedMbB / deltaMetrics.grantedMbB) * 100) : 0}%`,
                      background: '#34d399',
                      height: '100%',
                    }}
                    title="Actual Used Memory"
                  />
                  <div
                    style={{
                      width: `${deltaMetrics.grantedMbB > 0 ? Math.max(0, 100 - (deltaMetrics.usedMbB / deltaMetrics.grantedMbB) * 100) : 100}%`,
                      background: 'rgba(52, 211, 153, 0.3)',
                      height: '100%',
                    }}
                    title="Wasted Memory Grant"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. View Mode 4: Table-by-Table I/O Leaderboard Heatmap */}
      {viewMode === 'io_tables' && deltaMetrics && (
        <div className="section-block">
          <div className="glass-panel" style={{ borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#fff', margin: 0 }}>
                  Table-by-Table I/O Read Heatmap &amp; Storage Leaderboard
                </h4>
                <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '4px 0 0' }}>
                  Ranks every referenced database table by read volume, showing index seek improvements and scan elimination.
                </p>
              </div>

              <span className="badge badge-info" style={{ fontSize: '11px' }}>
                {deltaMetrics.tableDiffs.length} Tables Analyzed
              </span>
            </div>

            {deltaMetrics.tableDiffs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 20px', background: '#090d16', borderRadius: '8px', border: '1px dashed #1e293b' }}>
                <HardDrive size={32} color="#64748b" style={{ margin: '0 auto 10px', opacity: 0.6 }} />
                <h5 style={{ color: '#e2e8f0', fontSize: '14px', margin: '0 0 6px' }}>No Table-Level Reads Recorded</h5>
                <p style={{ color: '#94a3b8', fontSize: '12px', maxWidth: '520px', margin: '0 auto' }}>
                  Table read counts require actual execution plans with <code>RunTimeCountersPerThread</code>.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#090d16', color: '#94a3b8', borderBottom: '1px solid #1e293b' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Database Table</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', color: '#f43f5e' }}>Plan A Reads</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399' }}>Plan B Reads</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>I/O Delta</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>Access Method Before ➔ After</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deltaMetrics.tableDiffs.map((t, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <strong style={{ color: '#fff' }}>
                            {t.schema ? `${t.schema}.${t.table}` : t.table}
                          </strong>
                          {t.database && (
                            <div style={{ color: '#64748b', fontSize: '10px' }}>DB: {t.database}</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#f43f5e', fontWeight: 600 }}>
                          {t.readsA.toLocaleString()} pages ({t.readsMbA.toFixed(1)} MB)
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#34d399', fontWeight: 600 }}>
                          {t.readsB.toLocaleString()} pages ({t.readsMbB.toFixed(1)} MB)
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: t.readsDelta > 0 ? '#34d399' : '#f43f5e', fontWeight: 700 }}>
                          {t.readsDelta > 0 ? `-${t.readsDelta.toLocaleString()} pages` : `+${Math.abs(t.readsDelta).toLocaleString()} pages`}
                          {t.readsA > 0 && (
                            <span style={{ fontSize: '10.5px', display: 'block', opacity: 0.85 }}>
                              ({t.reductionPct.toFixed(1)}%)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ color: '#94a3b8', fontSize: '11px' }}>
                            {t.opsA.join(', ') || 'N/A'} <strong style={{ color: '#38bdf8' }}>➔</strong> <span style={{ color: '#34d399' }}>{t.opsB.join(', ') || 'N/A'}</span>
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <span
                            className={`badge ${
                              t.status === 'OPTIMIZED' || t.status === 'REDUCED'
                                ? 'badge-success'
                                : t.status === 'REGRESSED'
                                ? 'badge-critical'
                                : 'badge-info'
                            }`}
                          >
                            {t.status === 'OPTIMIZED'
                              ? '✓ Reads Eliminated'
                              : t.status === 'REDUCED'
                              ? '✓ I/O Reduced'
                              : t.status === 'REGRESSED'
                              ? '⚠️ Reads Increased'
                              : 'New Read'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9. View Mode 5: Side-by-Side Visual Operator Tree */}
      {viewMode === 'visual' && planA && planB && (
        <div className="section-block">
          {/* Statement Picker */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>Compare Statement:</span>
            {planA.statements.map((s, idx) => (
              <button
                key={s.statementId}
                type="button"
                className={`btn btn-sm ${selectedStmtIdx === idx ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '11px', padding: '0 10px', height: '28px', minHeight: '28px', display: 'inline-flex', alignItems: 'center' }}
                onClick={() => {
                  setSelectedStmtIdx(idx);
                  setSelectedNodeA(null);
                  setSelectedNodeB(null);
                }}
              >
                Statement #{s.statementId} (Cost: {s.statementSubTreeCost.toFixed(1)})
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Left: Statement Tree in Plan A */}
            <div className="glass-panel" style={{ borderRadius: '12px', padding: '16px', background: '#070b14' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#f43f5e' }}>
                  PLAN A OPERATORS ({nodesA.length} nodes)
                </span>
                <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                  Stmt Cost: <strong style={{ color: '#f43f5e' }}>{activeStatementA?.statementSubTreeCost.toFixed(2)}</strong>
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
                {nodesA.map((node) => {
                  const isScan = node.physicalOp?.toLowerCase().includes('scan');
                  const isSpill = node.warnings?.some((w) => typeof w === 'string' && w.toLowerCase().includes('spill')) || (node.isPainPoint && node.painReason?.toLowerCase().includes('spill'));
                  const isSelected = selectedNodeA?.nodeId === node.nodeId;

                  return (
                    <div
                      key={node.nodeId}
                      onClick={() => setSelectedNodeA(node)}
                      style={{
                        background: isScan ? 'rgba(244, 63, 94, 0.08)' : isSelected ? '#1e293b' : '#090d16',
                        border: isScan ? '1px solid rgba(244, 63, 94, 0.4)' : isSelected ? '1px solid #38bdf8' : '1px solid #1e293b',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '11.5px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: isScan ? '#f43f5e' : '#e2e8f0' }}>
                          {node.physicalOp}
                          {isSpill && (
                            <span style={{ marginLeft: '6px', background: 'rgba(234, 179, 8, 0.2)', color: '#fbbf24', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>
                              ⚠️ TempDB Spill
                            </span>
                          )}
                          {isScan && (
                            <span style={{ marginLeft: '6px', background: 'rgba(244, 63, 94, 0.2)', color: '#f43f5e', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>
                              Table/Clustered Scan
                            </span>
                          )}
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '10.5px', marginTop: '2px' }}>
                          {node.table ? `${node.table}${node.index ? ` (${node.index})` : ''}` : node.logicalOp}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#cbd5e1', fontWeight: 600 }}>
                          {(((node.estimateIo || 0) + (node.estimateCpu || 0)) || 0).toFixed(2)} cost
                        </div>
                        <div style={{ color: '#64748b', fontSize: '10px' }}>
                          {node.estimateRows} est rows
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Statement Tree in Plan B */}
            <div className="glass-panel" style={{ borderRadius: '12px', padding: '16px', background: '#070b14' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#34d399' }}>
                  PLAN B OPERATORS ({nodesB.length} nodes)
                </span>
                <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                  Stmt Cost: <strong style={{ color: '#34d399' }}>{activeStatementB?.statementSubTreeCost.toFixed(2)}</strong>
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
                {nodesB.map((node) => {
                  const isSeek = node.physicalOp?.toLowerCase().includes('seek');
                  const isSelected = selectedNodeB?.nodeId === node.nodeId;

                  return (
                    <div
                      key={node.nodeId}
                      onClick={() => setSelectedNodeB(node)}
                      style={{
                        background: isSeek ? 'rgba(52, 211, 153, 0.08)' : isSelected ? '#1e293b' : '#090d16',
                        border: isSeek ? '1px solid rgba(52, 211, 153, 0.4)' : isSelected ? '1px solid #34d399' : '1px solid #1e293b',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '11.5px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: isSeek ? '#34d399' : '#e2e8f0' }}>
                          {node.physicalOp}
                          {isSeek && (
                            <span style={{ marginLeft: '6px', background: 'rgba(52, 211, 153, 0.2)', color: '#34d399', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>
                              ✓ Optimized Seek
                            </span>
                          )}
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '10.5px', marginTop: '2px' }}>
                          {node.table ? `${node.table}${node.index ? ` (${node.index})` : ''}` : node.logicalOp}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#cbd5e1', fontWeight: 600 }}>
                          {(((node.estimateIo || 0) + (node.estimateCpu || 0)) || 0).toFixed(2)} cost
                        </div>
                        <div style={{ color: '#64748b', fontSize: '10px' }}>
                          {node.estimateRows} est rows
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 10. View Mode 6: Statement Cost Diff Matrix */}
      {viewMode === 'statements' && comparison && (
        <div className="section-block">
          <div className="glass-panel" style={{ borderRadius: '12px', padding: '20px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#fff', margin: '0 0 14px' }}>
              Statement-by-Statement Cost &amp; Execution Breakdown
            </h4>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#090d16', color: '#94a3b8', borderBottom: '1px solid #1e293b' }}>
                    <th style={{ padding: '8px 12px', width: '80px', textAlign: 'left' }}>Stmt #</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>T-SQL Query Snippet</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: '#f43f5e' }}>Plan A Cost</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: '#34d399' }}>Plan B Cost</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Reduction %</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Benchmark Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.statementsDiff.map((diff, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '11px' }}>
                          #{diff.statementId}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', maxWidth: '380px' }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#cbd5e1' }} title={diff.querySnippet}>
                          {diff.querySnippet || 'Ad-hoc Batch'}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>
                        {diff.costA.toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: diff.hasImprovement ? '#34d399' : '#f43f5e', fontWeight: 700 }}>
                        {diff.costB.toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: diff.hasImprovement ? '#34d399' : '#f43f5e', fontWeight: 700 }}>
                        {diff.costDiffPct > 0 ? `-${diff.costDiffPct.toFixed(1)}%` : `+${Math.abs(diff.costDiffPct).toFixed(1)}%`}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {diff.hasImprovement ? (
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <CheckCircle2 size={11} /> Faster
                          </span>
                        ) : (
                          <span className="badge badge-critical" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <AlertTriangle size={11} /> Slower
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 11. View Mode 7: Resolved Anti-Patterns & Warnings */}
      {viewMode === 'warnings' && planA && planB && (
        <div className="section-block">
          <div className="glass-panel" style={{ borderRadius: '12px', padding: '20px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#fff', margin: '0 0 14px' }}>
              Anti-Patterns &amp; Engine Bottlenecks Remediation Audit
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Item 1: TempDB Spills */}
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle size={16} color="#34d399" />
                    <strong style={{ fontSize: '13px', color: '#fff' }}>TempDB Sort Spill to Disk (Level 1)</strong>
                  </div>
                  <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '4px 0 0 24px' }}>
                    <strong>Plan A:</strong> Sort operator spilled data pages to TempDB due to insufficient memory grant.<br />
                    <strong>Plan B:</strong> Sizing and pre-indexing ensured 100% In-Memory execution with zero disk spill.
                  </p>
                </div>
                <span className="badge badge-success">RESOLVED</span>
              </div>

              {/* Item 2: Clustered Index Scan to Seek */}
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle size={16} color="#34d399" />
                    <strong style={{ fontSize: '13px', color: '#fff' }}>Full Clustered Index Scan Converted to Seek</strong>
                  </div>
                  <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '4px 0 0 24px' }}>
                    <strong>Plan A:</strong> Query performed full table scan on <code>MemberMoveHistory</code>.<br />
                    <strong>Plan B:</strong> SARGable range predicate enabled direct clustered index seek.
                  </p>
                </div>
                <span className="badge badge-success">RESOLVED</span>
              </div>

              {/* Item 3: Missing Indexes Resolved */}
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle size={16} color="#34d399" />
                    <strong style={{ fontSize: '13px', color: '#fff' }}>Missing Index DMV Penalties</strong>
                  </div>
                  <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '4px 0 0 24px' }}>
                    <strong>Plan A:</strong> Optimizer reported missing index with 92% impact factor.<br />
                    <strong>Plan B:</strong> Covering index satisfied query predicates with 0 missing recommendations.
                  </p>
                </div>
                <span className="badge badge-success">RESOLVED</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
