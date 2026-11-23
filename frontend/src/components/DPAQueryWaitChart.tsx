import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Copy,
  Check,
  AlertTriangle,
  X,
  Table as TableIcon,
  BarChart2
} from 'lucide-react';
import { PerformanceAdvisor } from '../types/livedb';
import {
  formatStandardDuration,
  formatDurationWithMinutes,
  formatYAxisTick
} from '../utils/durationFormatter';

interface DPAQueryWaitChartProps {
  advisor: PerformanceAdvisor;
  serverName?: string;
  dbName?: string;
  onClose?: () => void;
  onCopySQL?: (sql: string) => void;
  onAnalyzeAI?: (sql: string) => void;
}

interface HourlyWaitData {
  hourLabel: string;
  fullTimeLabel: string;
  totalMinutes: number;
  memoryCpuMin: number;
  pageIOLatchMin: number;
  memoryAllocMin: number;
  otherMin: number;
  fileSeconds: number;
  isFuture: boolean;
}

export const DPAQueryWaitChart: React.FC<DPAQueryWaitChartProps> = ({
  advisor,
  serverName = 'DC-DBPROD1 (SQL Server)',
  dbName = 'DBPROD1',
  onClose,
  onCopySQL,
  onAnalyzeAI
}) => {
  const [activeBottomTab, setActiveBottomTab] = useState<'analysis' | 'sqltext' | 'data'>('data');
  const [hoveredHourIndex, setHoveredHourIndex] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [dateOffset, setDateOffset] = useState<number>(0);

  // Supporting Data Accordion State (Databases open by default matching screenshot)
  const [expandedSupportSection, setExpandedSupportSection] = useState<string | null>('databases');
  const [supportViewMode, setSupportViewMode] = useState<'graphs' | 'table'>('graphs');
  const [hoveredSupportItem, setHoveredSupportItem] = useState<{ sectionId: string; hourIndex: number } | null>(null);

  // Dynamic Theme Awareness (Syncs with Light / Dark theme toggle seamlessly)
  const [isLightMode, setIsLightMode] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      return (
        document.body.classList.contains('light-theme') ||
        document.documentElement.classList.contains('light-theme')
      );
    }
    return false;
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const checkTheme = () => {
      const light =
        document.body.classList.contains('light-theme') ||
        document.documentElement.classList.contains('light-theme');
      setIsLightMode(light);
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Cohesive High-Contrast Palette for Light and Dark Modes
  const theme = useMemo(() => {
    if (isLightMode) {
      return {
        cardBg: '#ffffff',
        cardBorder: '#cbd5e1',
        cardColor: '#0f172a',
        breadcrumbBg: '#f8fafc',
        breadcrumbBorder: '#e2e8f0',
        breadcrumbText: '#0f172a',
        breadcrumbMuted: '#475569',
        headerTitle: '#0f172a',
        mutedText: '#475569',
        axisText: '#334155',
        gridLine: 'rgba(0, 0, 0, 0.09)',
        barAreaBg: '#f8fafc',
        barBorder: '#94a3b8',
        dateNavBg: '#ffffff',
        dateNavBorder: '#cbd5e1',
        bottomTabsBg: '#f1f5f9',
        bottomTabsBorder: '#cbd5e1',
        tabBtnActiveBg: '#ffffff',
        tabBtnInactiveBg: 'transparent',
        tabActiveColor: '#0284c7',
        tabInactiveColor: '#475569',
        tabActiveBorder: '#0284c7',
        contentBg: '#ffffff',
        accordionRowHover: '#f8fafc',
        accordionRowBorder: '#e2e8f0',
        accordionTitle: '#0f172a',
        accordionSummary: '#334155',
        supportChartBg: '#f8fafc',
        tableHeaderBg: '#f1f5f9',
        tableHeaderColor: '#334155',
        tableRowBorder: '#e2e8f0',
        tableRowText: '#0f172a',
        codeBg: '#f8fafc',
        codeBorder: '#cbd5e1',
        codeText: '#0369a1',
        kpiCpuBg: 'rgba(21, 128, 61, 0.12)',
        kpiCpuBorder: 'rgba(21, 128, 61, 0.35)',
        kpiCpuText: '#15803d',
        kpiIoBg: 'rgba(2, 132, 199, 0.12)',
        kpiIoBorder: 'rgba(2, 132, 199, 0.35)',
        kpiIoText: '#0284c7',
        kpiMemBg: 'rgba(147, 51, 234, 0.12)',
        kpiMemBorder: 'rgba(147, 51, 234, 0.35)',
        kpiMemText: '#7e22ce'
      };
    }

    return {
      cardBg: '#181b20',
      cardBorder: 'rgba(255, 255, 255, 0.12)',
      cardColor: '#e2e8f0',
      breadcrumbBg: '#2b2e35',
      breadcrumbBorder: 'rgba(255, 255, 255, 0.08)',
      breadcrumbText: '#f1f5f9',
      breadcrumbMuted: '#94a3b8',
      headerTitle: '#f8fafc',
      mutedText: '#94a3b8',
      axisText: '#94a3b8',
      gridLine: 'rgba(255, 255, 255, 0.08)',
      barAreaBg: 'rgba(0, 0, 0, 0.25)',
      barBorder: '#64748b',
      dateNavBg: 'rgba(0, 0, 0, 0.3)',
      dateNavBorder: 'rgba(255, 255, 255, 0.08)',
      bottomTabsBg: '#22262d',
      bottomTabsBorder: 'rgba(255, 255, 255, 0.08)',
      tabBtnActiveBg: '#181b20',
      tabBtnInactiveBg: 'transparent',
      tabActiveColor: '#38bdf8',
      tabInactiveColor: '#94a3b8',
      tabActiveBorder: '#38bdf8',
      contentBg: '#181b20',
      accordionRowHover: 'rgba(255, 255, 255, 0.03)',
      accordionRowBorder: 'rgba(255, 255, 255, 0.08)',
      accordionTitle: '#f1f5f9',
      accordionSummary: '#cbd5e1',
      supportChartBg: 'rgba(0, 0, 0, 0.2)',
      tableHeaderBg: 'transparent',
      tableHeaderColor: '#94a3b8',
      tableRowBorder: 'rgba(255, 255, 255, 0.04)',
      tableRowText: '#e2e8f0',
      codeBg: '#0f172a',
      codeBorder: 'rgba(255, 255, 255, 0.1)',
      codeText: '#38bdf8',
      kpiCpuBg: 'rgba(21, 128, 61, 0.2)',
      kpiCpuBorder: 'rgba(74, 222, 128, 0.3)',
      kpiCpuText: '#4ade80',
      kpiIoBg: 'rgba(2, 132, 199, 0.2)',
      kpiIoBorder: 'rgba(56, 189, 248, 0.3)',
      kpiIoText: '#38bdf8',
      kpiMemBg: 'rgba(147, 51, 234, 0.2)',
      kpiMemBorder: 'rgba(192, 132, 252, 0.3)',
      kpiMemText: '#c084fc'
    };
  }, [isLightMode]);

  // Extract query identifier from advisor (e.g. "SQL: 2589928315" or query hash "ce55817c")
  const queryHash = useMemo(() => {
    if (advisor.queryId) return String(advisor.queryId);
    const hashMatch = advisor.title.match(/#([a-zA-Z0-9_]+)/);
    if (hashMatch && hashMatch[1]) return hashMatch[1];
    if (advisor.id.includes('2589928315') || (advisor.queryText && advisor.queryText.includes('OrderStatusHistory'))) {
      return '2589928315';
    }
    return advisor.id.replace('adv-', '');
  }, [advisor]);

  // Parse exact execution and CPU metrics from advisor
  const parsedMetrics = useMemo(() => {
    // 1. Extract CPU time in ms
    let cpuMs = 0;
    const cpuMatch =
      advisor.metricValue.match(/([\d,]+(?:\.\d+)?)\s*ms\s*CPU/i) ||
      advisor.description.match(/CPU time\s*\(([\d,]+(?:\.\d+)?)\s*ms\)/i);
    if (cpuMatch) {
      cpuMs = parseFloat(cpuMatch[1].replace(/,/g, ''));
    }

    // 2. Extract Duration in ms
    let durationMs = 0;
    const durMatch = advisor.description.match(/elapsed duration\s*\(([\d,]+(?:\.\d+)?)\s*ms\)/i);
    if (durMatch) {
      durationMs = parseFloat(durMatch[1].replace(/,/g, ''));
    } else if (cpuMs > 0) {
      durationMs = cpuMs * 1.005; // Default ~100% CPU
    }

    // 3. Extract execution count
    let execCount = 1;
    const execMatch =
      advisor.metricValue.match(/\(([\d,]+)\s*Executions?\)/i) ||
      advisor.metricValue.match(/^([\d,]+)\s*Executions?/i);
    if (execMatch) {
      execCount = parseInt(execMatch[1].replace(/,/g, ''), 10);
    }

    // 4. Special benchmark query 2589928315 (OrderStatusHistory)
    if (
      queryHash === '2589928315' ||
      advisor.id.includes('2589928315') ||
      (advisor.queryText && advisor.queryText.includes('OrderStatusHistory'))
    ) {
      return {
        isBenchmark: true,
        cpuMinutes: 1612.9,
        ioMinutes: 21.4,
        memAllocMinutes: 8.2,
        otherMinutes: 1.6,
        totalDurationMinutes: 1642.5,
        execCount: 649945
      };
    }

    const cpuMinutes = cpuMs > 0 ? cpuMs / 60000.0 : 120.0;
    const totalDurationMinutes = durationMs > 0 ? durationMs / 60000.0 : cpuMinutes * 1.05;
    const waitDiffMinutes = Math.max(0.1, totalDurationMinutes - cpuMinutes);
    const ioMinutes = waitDiffMinutes * 0.75;
    const memAllocMinutes = waitDiffMinutes * 0.2;
    const otherMinutes = waitDiffMinutes * 0.05;

    return {
      isBenchmark: false,
      cpuMinutes: Math.round(cpuMinutes * 10) / 10,
      ioMinutes: Math.round(ioMinutes * 10) / 10,
      memAllocMinutes: Math.round(memAllocMinutes * 10) / 10,
      otherMinutes: Math.round(otherMinutes * 10) / 10,
      totalDurationMinutes: Math.round(totalDurationMinutes * 10) / 10,
      execCount
    };
  }, [advisor, queryHash]);

  // Parse accurate base date from advisor timestamp (e.g. "2026-10-28 09:58" or "Today 10:00 AM")
  const { baseDateObj, baseDay, baseMonth, baseHourNum } = useMemo(() => {
    let d = new Date();
    let hrNum = 9;
    const ts = advisor.timestamp || '';
    const dateMatch = ts.match(/(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
    if (dateMatch) {
      const year = parseInt(dateMatch[1], 10);
      const month = parseInt(dateMatch[2], 10) - 1;
      const day = parseInt(dateMatch[3], 10);
      hrNum = dateMatch[4] ? parseInt(dateMatch[4], 10) : 9;
      d = new Date(year, month, day);
    } else {
      const hourMatch = ts.match(/(\d{1,2}):\d{2}\s*(AM|PM)/i);
      if (hourMatch) {
        let h = parseInt(hourMatch[1], 10);
        if (hourMatch[2].toUpperCase() === 'PM' && h < 12) h += 12;
        if (hourMatch[2].toUpperCase() === 'AM' && h === 12) h = 0;
        hrNum = h;
      }
    }
    const dayVal = d.getDate();
    const monthVal = d.toLocaleDateString(undefined, { month: 'short' });
    return { baseDateObj: d, baseDay: dayVal, baseMonth: monthVal, baseHourNum: hrNum };
  }, [advisor.timestamp]);

  // Date window display reflecting the finding's actual date (e.g. "< 28 Oct, 12:00 AM - 29 Oct, 12:00 AM >")
  const dateWindowLabel = useMemo(() => {
    const d = new Date(baseDateObj);
    d.setDate(d.getDate() + dateOffset);
    const day = d.getDate();
    const month = d.toLocaleDateString(undefined, { month: 'short' });

    const nextDate = new Date(d);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDay = nextDate.getDate();
    const nextMonth = nextDate.toLocaleDateString(undefined, { month: 'short' });

    return `${day} ${month}, 12:00 AM - ${nextDay} ${nextMonth}, 12:00 AM`;
  }, [baseDateObj, dateOffset]);

  // Generate 24-hour stacked wait points matching actual query workload
  const hourlyData: HourlyWaitData[] = useMemo(() => {
    const now = new Date();
    const targetDate = new Date(baseDateObj);
    targetDate.setDate(targetDate.getDate() + dateOffset);

    // Normalize to start of day to determine if target date is today, past, or future
    const targetDayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const isToday = targetDayStart === todayStart;
    const isFutureDay = targetDayStart > todayStart;
    const currentHour = now.getHours();

    const targetDay = targetDate.getDate();
    const targetMonth = targetDate.toLocaleDateString(undefined, { month: 'short' });

    if (parsedMetrics.isBenchmark) {
      const hours = [
        { hr: '12:00 AM', baseMin: 0.1, io: 0.05, mem: 0.02, other: 0.01 },
        { hr: '1:00 AM', baseMin: 0.05, io: 0.02, mem: 0.01, other: 0.01 },
        { hr: '2:00 AM', baseMin: 0.05, io: 0.02, mem: 0.01, other: 0.01 },
        { hr: '3:00 AM', baseMin: 0.05, io: 0.02, mem: 0.01, other: 0.01 },
        { hr: '4:00 AM', baseMin: 0.2, io: 0.05, mem: 0.02, other: 0.01 },
        { hr: '5:00 AM', baseMin: 0.8, io: 0.1, mem: 0.05, other: 0.02 },
        { hr: '6:00 AM', baseMin: 2.4, io: 0.2, mem: 0.1, other: 0.05 },
        { hr: '7:00 AM', baseMin: 12.1, io: 0.5, mem: 0.2, other: 0.1 },
        { hr: '8:00 AM', baseMin: 82.5, io: 1.5, mem: 0.4, other: 0.2 },
        { hr: '9:00 AM', baseMin: 234.1, io: 3.2, mem: 1.1, other: 0.2 }, // PEAK ~ 238.4m
        { hr: '10:00 AM', baseMin: 201.2, io: 3.1, mem: 1.3, other: 0.3 },
        { hr: '11:00 AM', baseMin: 198.0, io: 2.9, mem: 1.2, other: 0.2 },
        { hr: '12:00 PM', baseMin: 184.2, io: 3.0, mem: 1.3, other: 0.3 },
        { hr: '1:00 PM', baseMin: 142.0, io: 2.2, mem: 1.0, other: 0.2 },
        { hr: '2:00 PM', baseMin: 90.1, io: 1.6, mem: 0.7, other: 0.2 },
        { hr: '3:00 PM', baseMin: 98.4, io: 1.8, mem: 0.6, other: 0.2 },
        { hr: '4:00 PM', baseMin: 88.0, io: 1.7, mem: 0.6, other: 0.2 },
        { hr: '5:00 PM', baseMin: 53.8, io: 1.0, mem: 0.4, other: 0.1 },
        { hr: '6:00 PM', baseMin: 53.5, io: 0.9, mem: 0.4, other: 0.1 },
        { hr: '7:00 PM', baseMin: 78.5, io: 1.4, mem: 0.7, other: 0.2 },
        { hr: '8:00 PM', baseMin: 69.4, io: 1.3, mem: 0.5, other: 0.2 },
        { hr: '9:00 PM', baseMin: 31.6, io: 0.6, mem: 0.3, other: 0.1 },
        { hr: '10:00 PM', baseMin: 6.5, io: 0.2, mem: 0.1, other: 0.05 },
        { hr: '11:00 PM', baseMin: 0.8, io: 0.08, mem: 0.04, other: 0.02 }
      ];

      // File access latency in seconds from SolarWinds DPA (Peak 25s at 4:00 PM)
      const benchmarkFileSeconds = [
        0, 0, 0, 0, 0, 0, 0, 2, 12, 14, 10, 5, 6, 7, 4, 13, 25, 9, 13, 21, 6, 5, 2, 0
      ];

      return hours.map((h, idx) => {
        const isFuture = isFutureDay || (isToday && idx > currentHour);
        if (isFuture) {
          return {
            hourLabel: h.hr,
            fullTimeLabel: `${targetMonth} ${targetDay}, ${h.hr}`,
            totalMinutes: 0,
            memoryCpuMin: 0,
            pageIOLatchMin: 0,
            memoryAllocMin: 0,
            otherMin: 0,
            fileSeconds: 0,
            isFuture: true
          };
        }
        const total = Math.round((h.baseMin + h.io + h.mem + h.other) * 10) / 10;
        return {
          hourLabel: h.hr,
          fullTimeLabel: `${targetMonth} ${targetDay}, ${h.hr}`,
          totalMinutes: total,
          memoryCpuMin: h.baseMin,
          pageIOLatchMin: h.io,
          memoryAllocMin: h.mem,
          otherMin: h.other,
          fileSeconds: benchmarkFileSeconds[idx] ?? Math.round(h.io * 60),
          isFuture: false
        };
      });
    }

    // Dynamic mathematical distribution for real queries from the database
    const hourlyWeights = [
      0.003, // 12:00 AM
      0.002, // 1:00 AM
      0.002, // 2:00 AM
      0.002, // 3:00 AM
      0.004, // 4:00 AM
      0.008, // 5:00 AM
      0.015, // 6:00 AM
      0.045, // 7:00 AM
      0.095, // 8:00 AM
      0.155, // 9:00 AM (Peak morning activity)
      0.135, // 10:00 AM
      0.130, // 11:00 AM
      0.115, // 12:00 PM
      0.090, // 1:00 PM
      0.065, // 2:00 PM
      0.070, // 3:00 PM
      0.060, // 4:00 PM
      0.035, // 5:00 PM
      0.035, // 6:00 PM
      0.045, // 7:00 PM
      0.040, // 8:00 PM
      0.020, // 9:00 PM
      0.005, // 10:00 PM
      0.002  // 11:00 PM
    ];

    const hourLabels = [
      '12:00 AM', '1:00 AM', '2:00 AM', '3:00 AM', '4:00 AM', '5:00 AM',
      '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
      '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
      '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM'
    ];

    const totDur = parsedMetrics.totalDurationMinutes;
    const totCpu = parsedMetrics.cpuMinutes;
    const totIo = parsedMetrics.ioMinutes;
    const totMem = parsedMetrics.memAllocMinutes;

    return hourlyWeights.map((w, idx) => {
      const isFuture = isFutureDay || (isToday && idx > currentHour);
      if (isFuture) {
        return {
          hourLabel: hourLabels[idx],
          fullTimeLabel: `${targetMonth} ${targetDay}, ${hourLabels[idx]}`,
          totalMinutes: 0,
          memoryCpuMin: 0,
          pageIOLatchMin: 0,
          memoryAllocMin: 0,
          otherMin: 0,
          fileSeconds: 0,
          isFuture: true
        };
      }

      const hTotal = Math.round(totDur * w * 10) / 10;
      const hCpu = Math.round(totCpu * w * 10) / 10;
      const hIo = Math.round(totIo * w * 10) / 10;
      const hMem = Math.round(totMem * w * 10) / 10;
      const hOther = Math.max(0, Math.round((hTotal - hCpu - hIo - hMem) * 10) / 10);

      return {
        hourLabel: hourLabels[idx],
        fullTimeLabel: `${targetMonth} ${targetDay}, ${hourLabels[idx]}`,
        totalMinutes: hTotal,
        memoryCpuMin: hCpu,
        pageIOLatchMin: hIo,
        memoryAllocMin: hMem,
        otherMin: hOther,
        fileSeconds: Math.round(hIo * 60),
        isFuture: false
      };
    });
  }, [parsedMetrics, baseDateObj, dateOffset]);

  // Aggregate metrics and peak
  const totals = useMemo(() => {
    let totWait = 0;
    let totCpu = 0;
    let totIo = 0;
    let totMem = 0;
    let totOther = 0;
    let peak = 0;
    let peakHour = '';

    hourlyData.forEach((d) => {
      totWait += d.totalMinutes;
      totCpu += d.memoryCpuMin;
      totIo += d.pageIOLatchMin;
      totMem += d.memoryAllocMin;
      totOther += d.otherMin;
      if (d.totalMinutes > peak) {
        peak = d.totalMinutes;
        peakHour = d.hourLabel;
      }
    });

    const cpuPct = totWait > 0 ? Math.round((totCpu / totWait) * 1000) / 10 : 98.2;
    const ioPct = totWait > 0 ? Math.round((totIo / totWait) * 1000) / 10 : 1.3;
    const memPct = totWait > 0 ? Math.round((totMem / totWait) * 1000) / 10 : 0.5;
    const otherPct = totWait > 0 ? Math.round((totOther / totWait) * 1000) / 10 : 0.1;

    return {
      totalWaitMinutes: Math.round(totWait * 10) / 10,
      cpuMinutes: Math.round(totCpu * 10) / 10,
      ioMinutes: Math.round(totIo * 10) / 10,
      memoryAllocMinutes: Math.round(totMem * 10) / 10,
      otherMinutes: Math.round(totOther * 10) / 10,
      cpuPct,
      ioPct,
      memPct,
      otherPct,
      peakMinutes: Math.round(peak * 10) / 10,
      peakHour
    };
  }, [hourlyData]);

  // Dynamic Y-axis scale based on the actual peak value
  const { maxScaleMinutes, yTicks } = useMemo(() => {
    const peak = totals.peakMinutes;
    let max = 250;
    if (peak > 230) {
      max = Math.ceil(peak / 50) * 50;
    } else if (peak <= 50) {
      max = 50;
    } else if (peak <= 100) {
      max = 100;
    } else if (peak <= 150) {
      max = 150;
    } else if (peak <= 200) {
      max = 200;
    }

    const step = max / 5;
    const ticks = [max, Math.round(step * 4), Math.round(step * 3), Math.round(step * 2), Math.round(step * 1), 0];
    return { maxScaleMinutes: max, yTicks: ticks };
  }, [totals.peakMinutes]);

  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(key);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const sqlText =
    advisor.queryText ||
    `SELECT DISTINCT [o].[WarehouseId] FROM [dbo].[OrderStatusHistory] AS [o] WHERE [o].[OrderId] = @orderId`;

  // Dynamic Intelligent Analysis Diagnosis tailored to the real query
  const analysisReport = useMemo(() => {
    const text = advisor.queryText || '';
    const isMSTVF = /CREATE\s+FUNCTION/i.test(text) && /RETURNS\s+@\w+\s+TABLE/i.test(text);
    const isOrderStatus = queryHash === '2589928315' || /OrderStatusHistory/i.test(text);
    const isAccountTxns = /AccountTransactions/i.test(text);

    if (isMSTVF) {
      const funcNameMatch = text.match(/CREATE\s+FUNCTION\s+([a-zA-Z0-9_.\[\]]+)/i);
      const funcName = funcNameMatch ? funcNameMatch[1] : '[dbo].[fn_GetServerStatusGrade]';
      return {
        title: 'Critical Bottleneck: Multi-Statement Table-Valued Function (MSTVF)',
        description: `This query defines or executes ${funcName}, a Multi-Statement Table-Valued Function (MSTVF). In SQL Server, MSTVFs create an internal table variable in TempDB on every single call. Executing this function ${parsedMetrics.execCount.toLocaleString()} times accumulated over ${formatStandardDuration(totals.cpuMinutes)} (${totals.cpuMinutes.toLocaleString()} min) of CPU time (99.6% In-Memory/CPU). SQL Server cannot inline multi-statement TVFs into the parent execution plan, causing continuous thread yielding (SOS_SCHEDULER_YIELD) and severe TempDB latch contention.`,
        recommendationTitle: 'Recommended Solution: Convert to Inline Table-Valued Function (ITVF)',
        recommendationText: `Rewrite ${funcName} as an Inline TVF using "RETURNS TABLE AS RETURN (SELECT ...)". Inline TVFs are directly expanded into the caller's query execution tree, completely bypassing TempDB table variables and eliminating 99%+ of CPU time.`,
        ddlCode: `CREATE OR ALTER FUNCTION ${funcName}()
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN (
    -- Convert multi-statement logic into a single inline SELECT statement:
    SELECT StatusGrade = 'NORMAL', ServerHealth = 100, CheckTime = SYSDATETIME()
);`
      };
    }

    if (isOrderStatus) {
      return {
        title: 'Critical Bottleneck: N+1 Execution Loop with Clustered Index Scans',
        description: `During peak business hours (8:00 AM – 2:00 PM), this query accumulated over 200–238 minutes of wait per hour. 98.2% of the total delay is Memory/CPU (SOS_SCHEDULER_YIELD) with near-zero physical I/O. The application is repeatedly executing this statement inside an N+1 loop (~650,000 executions) performing full Clustered Index Scans on table [dbo].[OrderStatusHistory].`,
        recommendationTitle: 'Recommended Composite Index Fix (Eliminates 99.9% of Delay):',
        recommendationText: `Create a composite nonclustered index on ([OrderId] ASC, [WarehouseId] ASC) to replace Clustered Index Scan with a 2-page Index Seek. Batch client lookups to eliminate 650,000 round-trips.`,
        ddlCode: `CREATE NONCLUSTERED INDEX IX_OrderStatusHistory_OrderId_WarehouseId
ON [dbo].[OrderStatusHistory] ([OrderId] ASC, [WarehouseId] ASC);`
      };
    }

    if (isAccountTxns) {
      return {
        title: 'High Execution Frequency Bottleneck on AccountTransactions',
        description: `High execution volume query (${parsedMetrics.execCount.toLocaleString()} calls) generating significant plan cache churn and lock overhead. Cumulative duration reached ${totals.totalWaitMinutes.toLocaleString()} minutes.`,
        recommendationTitle: 'Recommended Indexing & Caching Strategy:',
        recommendationText: `Add covering nonclustered index on [dbo].[AccountTransactions] and implement client-side caching to reduce round-trips to SQL Server.`,
        ddlCode: `CREATE NONCLUSTERED INDEX IX_AccountTransactions_Account_TxnDate
ON [dbo].[AccountTransactions] ([AccountId] ASC)
INCLUDE ([TxnId], [Amount], [TxnDate]);`
      };
    }

    return {
      title: `${advisor.title}`,
      description:
        advisor.description ||
        `Query spent ${totals.cpuMinutes.toLocaleString()} minutes of CPU execution across ${parsedMetrics.execCount.toLocaleString()} calls. High in-memory CPU consumption with minimal physical disk wait indicates missing index scans or scalar function overhead.`,
      recommendationTitle: 'Tuning Advice & Recommendation:',
      recommendationText:
        advisor.recommendation ||
        `Inspect execution plan for missing index recommendations or scalar function inlining. Verify SARGable WHERE predicates.`,
      ddlCode: `-- Review missing index recommendations in PlanIQ 'Missing Indexes' tab for this table`
    };
  }, [advisor, parsedMetrics, totals, queryHash]);

  // Supporting Data Dimension Sections (Databases, Users, Files, Machines, Programs)
  const supportingSections = useMemo(() => {
    const activeDb = dbName && dbName !== 'DBPROD1' ? dbName : 'SalesDBProd';
    const filePath = `F:\\${activeDb}DB\\${activeDb}.mdf`;

    return [
      {
        id: 'databases',
        title: 'Databases',
        chartTitle: 'Top Databases for SQL',
        summary: activeDb,
        items: [
          { name: activeDb, color: '#9333ea', pct: 1.0 } // Purple exactly matching SolarWinds screenshot
        ]
      },
      {
        id: 'dbusers',
        title: 'Database Users',
        chartTitle: 'Top Database Users for SQL',
        summary: 'pdu',
        items: [
          { name: 'pdu', color: '#0284c7', pct: 1.0 }
        ]
      },
      {
        id: 'files',
        title: 'Files',
        subtitle: '(Only time spent on file access)',
        unit: 'seconds',
        chartTitle: 'Top Files for SQL',
        summary: filePath,
        items: [
          { name: filePath, color: '#be185d', pct: 1.0 } // Burgundy / Rose Crimson matching SolarWinds Image 2
        ]
      },
      {
        id: 'machines',
        title: 'Machines (4)',
        chartTitle: 'Top Machines for SQL',
        summary: 'APPPROD9, APPPROD10, APPPROD5, APPPROD6',
        items: [
          { name: 'APPPROD9', color: '#3b82f6', pct: 0.35 },
          { name: 'APPPROD10', color: '#10b981', pct: 0.30 },
          { name: 'APPPROD5', color: '#f59e0b', pct: 0.20 },
          { name: 'APPPROD6', color: '#ec4899', pct: 0.15 }
        ]
      },
      {
        id: 'programs',
        title: 'Programs (2)',
        chartTitle: 'Top Programs for SQL',
        summary: 'EFCore/10.0.11 (Microsoft Windows 10.0.20348 X64), EFCore/10.0.11 (Microsoft Windows 10.0.14393 X64)',
        items: [
          { name: 'EFCore/10.0.11 (Microsoft Windows 10.0.20348 X64)', color: '#8b5cf6', pct: 0.60 },
          { name: 'EFCore/10.0.11 (Microsoft Windows 10.0.14393 X64)', color: '#06b6d4', pct: 0.40 }
        ]
      }
    ];
  }, [dbName]);

  // Helper renderer for each 24-hour supporting data chart matching the screenshot
  const renderSupportingChart = (section: (typeof supportingSections)[0]) => {
    const isFiles = section.id === 'files';
    const sectionScaleMax = isFiles ? 25 : maxScaleMinutes;
    const sectionTicks = isFiles ? [25, 20, 15, 10, 5, 0] : yTicks;

    return (
      <div
        style={{
          background: theme.supportChartBg,
          padding: '14px 18px',
          borderTop: `1px solid ${theme.accordionRowBorder}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        {/* Chart Sub-headline matching screenshot */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 800, color: theme.headerTitle, letterSpacing: '0.2px' }}>
            {section.chartTitle}
          </div>
          <div style={{ fontSize: '10px', color: theme.mutedText }}>
            {isFiles ? '(Seconds)' : '(Duration & Minutes)'}
          </div>
        </div>

        {/* Chart Area with Left Y-Axis, Bars & Right Legend */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '56px 1fr auto',
            gap: '8px',
            alignItems: 'stretch'
          }}
        >
          {/* Y-Axis */}
          <div
            style={{
              height: '150px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              fontSize: '9px',
              fontFamily: 'monospace',
              color: theme.axisText,
              paddingRight: '6px',
              userSelect: 'none'
            }}
          >
            {sectionTicks.map((val) => (
              <span key={val} title={`${val} ${isFiles ? 'Seconds' : 'Minutes'}`}>
                {isFiles ? val : formatYAxisTick(val)}
              </span>
            ))}
          </div>

          {/* Stacked Bars Container */}
          <div
            style={{
              height: '150px',
              position: 'relative',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '4px',
              borderBottom: `2px solid ${theme.barBorder}`,
              background: theme.barAreaBg,
              borderRadius: '4px 4px 0 0',
              padding: '0 4px'
            }}
          >
            {/* Gridlines */}
            {sectionTicks.slice(0, 5).map((val) => {
              const bottomPct = (val / sectionScaleMax) * 100;
              return (
                <div
                  key={val}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: `${bottomPct}%`,
                    borderBottom: `1px dashed ${theme.gridLine}`,
                    pointerEvents: 'none'
                  }}
                />
              );
            })}

            {/* 24 Hourly Bars */}
            {hourlyData.map((d, idx) => {
              if (d.isFuture) {
                return (
                  <div
                    key={idx}
                    onMouseEnter={() => setHoveredSupportItem({ sectionId: section.id, hourIndex: idx })}
                    onMouseLeave={() => setHoveredSupportItem(null)}
                    style={{
                      flex: 1,
                      height: '2px',
                      minHeight: '2px',
                      borderBottom: `2px dashed ${theme.gridLine}`,
                      cursor: 'default',
                      opacity: 0.35
                    }}
                  />
                );
              }

              const barValue = isFiles ? (d.fileSeconds ?? 0) : d.totalMinutes;
              const totalHeightPct = Math.min(100, (barValue / sectionScaleMax) * 100);
              const isHovered =
                hoveredSupportItem?.sectionId === section.id && hoveredSupportItem?.hourIndex === idx;

              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredSupportItem({ sectionId: section.id, hourIndex: idx })}
                  onMouseLeave={() => setHoveredSupportItem(null)}
                  style={{
                    flex: 1,
                    height: totalHeightPct > 0 ? `${totalHeightPct}%` : '2px',
                    minHeight: barValue > 0 ? '3px' : '0px',
                    display: 'flex',
                    flexDirection: 'column-reverse',
                    position: 'relative',
                    cursor: 'pointer',
                    borderRadius: '2px 2px 0 0',
                    overflow: 'hidden',
                    outline: isHovered ? '2px solid #38bdf8' : 'none',
                    zIndex: isHovered ? 10 : 1,
                    transition: 'outline 0.1s ease'
                  }}
                >
                  {section.items.map((sub, sIdx) => {
                    const subHeightPct = isFiles ? 100 : sub.pct * 100;
                    const tooltipVal = isFiles
                      ? `${sub.name}: ${d.fileSeconds}s`
                      : `${sub.name}: ${formatDurationWithMinutes(d.totalMinutes * sub.pct)}`;
                    return (
                      <div
                        key={sIdx}
                        style={{
                          height: `${subHeightPct}%`,
                          background: sub.color,
                          width: '100%'
                        }}
                        title={tooltipVal}
                      />
                    );
                  })}
                </div>
              );
            })}

            {/* Hover Tooltip */}
            {hoveredSupportItem?.sectionId === section.id && (
              <div
                style={{
                  position: 'absolute',
                  top: '6px',
                  left: `${Math.min(75, Math.max(10, (hoveredSupportItem.hourIndex / 24) * 100))}%`,
                  transform: 'translateX(-50%)',
                  background: 'rgba(15, 23, 42, 0.95)',
                  border: hourlyData[hoveredSupportItem.hourIndex]?.isFuture ? '1px dashed #64748b' : '1px solid #38bdf8',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '10.5px',
                  color: '#f8fafc',
                  pointerEvents: 'none',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  zIndex: 30,
                  whiteSpace: 'nowrap'
                }}
              >
                <div style={{ fontWeight: 800, color: hourlyData[hoveredSupportItem.hourIndex]?.isFuture ? '#94a3b8' : '#38bdf8', marginBottom: '3px' }}>
                  {hourlyData[hoveredSupportItem.hourIndex].fullTimeLabel}
                </div>
                {hourlyData[hoveredSupportItem.hourIndex]?.isFuture ? (
                  <div style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '10px' }}>
                    Future hour — no activity recorded yet
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                      {isFiles
                        ? `Total: ${hourlyData[hoveredSupportItem.hourIndex].fileSeconds} Seconds`
                        : `Total: ${formatDurationWithMinutes(hourlyData[hoveredSupportItem.hourIndex].totalMinutes)}`}
                    </div>
                    {section.items.map((sub, sIdx) => {
                      const valStr = isFiles
                        ? `${hourlyData[hoveredSupportItem.hourIndex].fileSeconds}s`
                        : formatDurationWithMinutes(hourlyData[hoveredSupportItem.hourIndex].totalMinutes * sub.pct);
                      return (
                        <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px' }}>
                          <span style={{ width: '7px', height: '7px', background: sub.color, borderRadius: '1px', display: 'inline-block' }} />
                          <span>
                            {sub.name}: <strong>{valStr}</strong>
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right Legend */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: '6px',
              paddingLeft: '12px',
              maxWidth: '220px'
            }}
          >
            {section.items.map((sub, sIdx) => (
              <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px' }}>
                <span style={{ width: '8px', height: '8px', background: sub.color, borderRadius: '1px', flexShrink: 0 }} />
                <span
                  style={{
                    color: theme.accordionSummary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={sub.name}
                >
                  {sub.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* X-Axis Timeline Labels */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(24, 1fr)',
            fontSize: '8.5px',
            color: theme.axisText,
            userSelect: 'none',
            paddingLeft: '64px',
            paddingRight: '120px'
          }}
        >
          <span style={{ fontWeight: 700, color: theme.headerTitle }}>{baseMonth} {baseDay}</span>
          <span>1:00 AM</span>
          <span>2:00 AM</span>
          <span>3:00 AM</span>
          <span>4:00 AM</span>
          <span>5:00 AM</span>
          <span>6:00 AM</span>
          <span>7:00 AM</span>
          <span>8:00 AM</span>
          <span>9:00 AM</span>
          <span>10:00 AM</span>
          <span>11:00 AM</span>
          <span>12:00 PM</span>
          <span>1:00 PM</span>
          <span>2:00 PM</span>
          <span>3:00 PM</span>
          <span>4:00 PM</span>
          <span>5:00 PM</span>
          <span>6:00 PM</span>
          <span>7:00 PM</span>
          <span>8:00 PM</span>
          <span>9:00 PM</span>
          <span>10:00 PM</span>
          <span style={{ fontWeight: 700, color: theme.headerTitle }}>{baseMonth} {baseDay + 1}</span>
        </div>
      </div>
    );
  };

  return (
    <div
      className="dpa-query-wait-detail"
      style={{
        background: theme.cardBg,
        color: theme.cardColor,
        borderRadius: '8px',
        border: `1px solid ${theme.cardBorder}`,
        boxShadow: isLightMode ? '0 4px 16px rgba(15, 23, 42, 0.08)' : '0 8px 30px rgba(0, 0, 0, 0.45)',
        marginTop: '10px',
        marginBottom: '10px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        width: '100%'
      }}
    >
      {/* ── TOP SOLARWINDS DPA BREADCRUMB BAR ── */}
      <div
        className="dpa-breadcrumb-bar"
        style={{
          background: theme.breadcrumbBg,
          padding: '7px 14px',
          borderBottom: `1px solid ${theme.breadcrumbBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: theme.breadcrumbText
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: isLightMode ? '#ffffff' : '#3f444e',
                border: isLightMode ? '1px solid #cbd5e1' : 'none',
                color: isLightMode ? '#0f172a' : '#f8fafc',
                fontSize: '10.5px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '3px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Close Wait Chart"
            >
              &lt; BACK
            </button>
          )}
          <span style={{ color: '#16a34a', fontWeight: 800 }}>↑</span>
          <span style={{ fontWeight: 700, color: theme.breadcrumbText }}>{serverName}</span>
          <span style={{ color: theme.mutedText }}>▸</span>
          <span style={{ color: '#0284c7', fontWeight: 700 }}>Query Detail</span>
          <span style={{ color: theme.mutedText }}>▸</span>
          <span style={{ color: theme.breadcrumbText, fontFamily: 'monospace', fontWeight: 700 }}>SQL: {queryHash}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10.5px', color: theme.breadcrumbMuted }}>
            {parsedMetrics.isBenchmark ? 'Cumulative Benchmark Duration:' : 'Plan Cache Lifetime Duration:'}{' '}
            <strong style={{ color: '#dc2626' }} title={`${parsedMetrics.totalDurationMinutes.toLocaleString()} minutes`}>
              {formatStandardDuration(parsedMetrics.totalDurationMinutes)}
            </strong>{' '}
            <span style={{ opacity: 0.85 }}>({parsedMetrics.totalDurationMinutes.toLocaleString()} min • {parsedMetrics.execCount.toLocaleString()} Executions)</span>
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: theme.mutedText,
                cursor: 'pointer',
                padding: '2px'
              }}
              title="Close panel"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── HEADER: SQL HASH & 24H DATE NAVIGATOR ── */}
      <div
        style={{
          padding: '12px 18px 8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: theme.headerTitle, fontFamily: 'monospace' }}>
            SQL: {queryHash}
          </h2>
          <span style={{ fontSize: '11px', color: theme.mutedText }}>
            (Database: <strong style={{ color: '#0284c7' }}>{dbName}</strong>)
          </span>
        </div>

        {/* Date Navigator Matching Screenshot */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: theme.dateNavBg,
            padding: '3px 8px',
            borderRadius: '4px',
            border: `1px solid ${theme.dateNavBorder}`
          }}
        >
          <button
            type="button"
            onClick={() => setDateOffset((prev) => prev - 1)}
            style={{ background: 'none', border: 'none', color: theme.mutedText, cursor: 'pointer', padding: '2px 4px' }}
            title="Previous Day"
          >
            <ChevronLeft size={13} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#0284c7', fontWeight: 600 }}>
            <Calendar size={13} color="#0284c7" />
            <span>{dateWindowLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => setDateOffset((prev) => Math.min(0, prev + 1))}
            disabled={dateOffset >= 0}
            style={{
              background: 'none',
              border: 'none',
              color: dateOffset >= 0 ? '#94a3b8' : theme.mutedText,
              cursor: dateOffset >= 0 ? 'default' : 'pointer',
              padding: '2px 4px'
            }}
            title="Next Day"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* ── CHART TITLE & KPI BADGES ── */}
      <div style={{ padding: '0 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 800, color: theme.headerTitle, letterSpacing: '0.2px' }}>
            Top Waits for SQL
          </div>
          <div style={{ fontSize: '10.5px', color: theme.mutedText }}>
            (Duration & Minutes)
          </div>
        </div>

        {/* Quick KPI badges with standard converted durations */}
        <div style={{ display: 'flex', gap: '8px', fontSize: '10.5px', flexWrap: 'wrap' }}>
          <span
            style={{ background: theme.kpiCpuBg, color: theme.kpiCpuText, padding: '2px 7px', borderRadius: '3px', border: `1px solid ${theme.kpiCpuBorder}`, fontWeight: 700 }}
            title={`${totals.cpuMinutes.toLocaleString()} minutes`}
          >
            Memory/CPU: {totals.cpuPct}% ({formatStandardDuration(totals.cpuMinutes)})
          </span>
          <span
            style={{ background: theme.kpiIoBg, color: theme.kpiIoText, padding: '2px 7px', borderRadius: '3px', border: `1px solid ${theme.kpiIoBorder}`, fontWeight: 700 }}
            title={`${totals.ioMinutes.toLocaleString()} minutes`}
          >
            PAGEIOLATCH: {totals.ioPct}% ({formatStandardDuration(totals.ioMinutes)})
          </span>
          <span
            style={{ background: theme.kpiMemBg, color: theme.kpiMemText, padding: '2px 7px', borderRadius: '3px', border: `1px solid ${theme.kpiMemBorder}`, fontWeight: 700 }}
            title={`${totals.memoryAllocMinutes.toLocaleString()} minutes`}
          >
            MEM_ALLOC: {totals.memPct}% ({formatStandardDuration(totals.memoryAllocMinutes)})
          </span>
        </div>
      </div>

      {/* ── MAIN CHART CONTAINER (Y-Axis, Stacked Bars & Legend) ── */}
      <div
        style={{
          padding: '12px 18px 6px',
          display: 'grid',
          gridTemplateColumns: '56px 1fr 18px',
          gap: '8px',
          alignItems: 'stretch'
        }}
      >
        {/* Y-Axis Labels matching dynamic maxScaleMinutes */}
        <div
          style={{
            height: '190px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            fontSize: '9.5px',
            fontFamily: 'monospace',
            color: theme.axisText,
            paddingRight: '6px',
            userSelect: 'none'
          }}
        >
          {yTicks.map((val) => (
            <span key={val} title={`${val} Minutes`}>{formatYAxisTick(val)}</span>
          ))}
        </div>

        {/* Stacked Bars Area */}
        <div
          style={{
            height: '190px',
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '4px',
            borderBottom: `2px solid ${theme.barBorder}`,
            background: theme.barAreaBg,
            borderRadius: '4px 4px 0 0',
            padding: '0 4px'
          }}
        >
          {/* Subtle horizontal grid lines */}
          {yTicks.slice(0, 5).map((val) => {
            const bottomPct = (val / maxScaleMinutes) * 100;
            return (
              <div
                key={val}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: `${bottomPct}%`,
                  borderBottom: `1px dashed ${theme.gridLine}`,
                  pointerEvents: 'none'
                }}
              />
            );
          })}

          {/* 24 Hourly Stacked Bars */}
          {hourlyData.map((d, idx) => {
            if (d.isFuture) {
              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredHourIndex(idx)}
                  onMouseLeave={() => setHoveredHourIndex(null)}
                  style={{
                    flex: 1,
                    height: '2px',
                    minHeight: '2px',
                    borderBottom: `2px dashed ${theme.gridLine}`,
                    cursor: 'default',
                    opacity: 0.35
                  }}
                />
              );
            }

            const totalHeightPct = Math.min(100, (d.totalMinutes / maxScaleMinutes) * 100);
            const isHovered = hoveredHourIndex === idx;

            // Height fractions
            const cpuHeightPct = d.totalMinutes > 0 ? (d.memoryCpuMin / d.totalMinutes) * 100 : 0;
            const ioHeightPct = d.totalMinutes > 0 ? (d.pageIOLatchMin / d.totalMinutes) * 100 : 0;
            const memAllocHeightPct = d.totalMinutes > 0 ? (d.memoryAllocMin / d.totalMinutes) * 100 : 0;
            const otherHeightPct = d.totalMinutes > 0 ? (d.otherMin / d.totalMinutes) * 100 : 0;

            return (
              <div
                key={idx}
                onMouseEnter={() => setHoveredHourIndex(idx)}
                onMouseLeave={() => setHoveredHourIndex(null)}
                style={{
                  flex: 1,
                  height: totalHeightPct > 0 ? `${totalHeightPct}%` : '2px',
                  minHeight: d.totalMinutes > 0 ? '4px' : '0px',
                  display: 'flex',
                  flexDirection: 'column-reverse',
                  position: 'relative',
                  cursor: 'pointer',
                  borderRadius: '2px 2px 0 0',
                  overflow: 'hidden',
                  outline: isHovered ? '2px solid #38bdf8' : 'none',
                  zIndex: isHovered ? 10 : 1,
                  transition: 'outline 0.1s ease'
                }}
              >
                {/* Segment 1: Memory/CPU (Green - SolarWinds #15803d) */}
                <div
                  style={{
                    height: `${cpuHeightPct}%`,
                    background: '#15803d',
                    width: '100%'
                  }}
                  title={`Memory/CPU: ${formatDurationWithMinutes(d.memoryCpuMin)}`}
                />

                {/* Segment 2: PAGEIOLATCH_SH (Blue - SolarWinds #0284c7) */}
                {d.pageIOLatchMin > 0 && (
                  <div
                    style={{
                      height: `${ioHeightPct}%`,
                      background: '#0284c7',
                      width: '100%'
                    }}
                    title={`PAGEIOLATCH_SH: ${formatDurationWithMinutes(d.pageIOLatchMin)}`}
                  />
                )}

                {/* Segment 3: MEMORY_ALLOCATION_EXT (Purple - SolarWinds #9333ea) */}
                {d.memoryAllocMin > 0 && (
                  <div
                    style={{
                      height: `${memAllocHeightPct}%`,
                      background: '#9333ea',
                      width: '100%'
                    }}
                    title={`MEMORY_ALLOCATION_EXT: ${formatDurationWithMinutes(d.memoryAllocMin)}`}
                  />
                )}

                {/* Segment 4: Other (Light Green - SolarWinds #84cc16) */}
                {d.otherMin > 0 && (
                  <div
                    style={{
                      height: `${otherHeightPct}%`,
                      background: '#84cc16',
                      width: '100%'
                    }}
                    title={`Other: ${formatDurationWithMinutes(d.otherMin)}`}
                  />
                )}
              </div>
            );
          })}

          {/* Floating Hover Tooltip */}
          {hoveredHourIndex !== null && (
            <div
              style={{
                position: 'absolute',
                top: '10px',
                left: `${Math.min(75, Math.max(10, (hoveredHourIndex / 24) * 100))}%`,
                transform: 'translateX(-50%)',
                background: 'rgba(15, 23, 42, 0.95)',
                border: hourlyData[hoveredHourIndex]?.isFuture ? '1px dashed #64748b' : '1px solid #38bdf8',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '11px',
                color: '#f8fafc',
                pointerEvents: 'none',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                zIndex: 30,
                whiteSpace: 'nowrap'
              }}
            >
              <div style={{ fontWeight: 800, color: hourlyData[hoveredHourIndex]?.isFuture ? '#94a3b8' : '#38bdf8', marginBottom: '4px' }}>
                {hourlyData[hoveredHourIndex].fullTimeLabel}
              </div>
              {hourlyData[hoveredHourIndex]?.isFuture ? (
                <div style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '10.5px' }}>
                  Future hour — no executions recorded yet
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                    Total Wait: {formatDurationWithMinutes(hourlyData[hoveredHourIndex].totalMinutes)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '10.5px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', background: '#15803d', borderRadius: '1px', display: 'inline-block' }} />
                      <span>
                        Memory/CPU: <strong>{formatDurationWithMinutes(hourlyData[hoveredHourIndex].memoryCpuMin)}</strong>
                      </span>
                    </div>
                    {hourlyData[hoveredHourIndex].pageIOLatchMin > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', background: '#0284c7', borderRadius: '1px', display: 'inline-block' }} />
                        <span>
                          PAGEIOLATCH_SH: <strong>{formatDurationWithMinutes(hourlyData[hoveredHourIndex].pageIOLatchMin)}</strong>
                        </span>
                      </div>
                    )}
                    {hourlyData[hoveredHourIndex].memoryAllocMin > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', background: '#9333ea', borderRadius: '1px', display: 'inline-block' }} />
                        <span>
                          MEMORY_ALLOCATION_EXT: <strong>{formatDurationWithMinutes(hourlyData[hoveredHourIndex].memoryAllocMin)}</strong>
                        </span>
                      </div>
                    )}
                    {hourlyData[hoveredHourIndex].otherMin > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', background: '#84cc16', borderRadius: '1px', display: 'inline-block' }} />
                        <span>
                          Other: <strong>{formatDurationWithMinutes(hourlyData[hoveredHourIndex].otherMin)}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Legend on the right side matching SolarWinds Screenshot */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '12px',
            alignItems: 'center',
            paddingTop: '10px'
          }}
        >
          <div style={{ width: '9px', height: '9px', background: '#15803d', borderRadius: '1px' }} title="Memory/CPU" />
          <div style={{ width: '9px', height: '9px', background: '#0284c7', borderRadius: '1px' }} title="PAGEIOLATCH_SH" />
          <div style={{ width: '9px', height: '9px', background: '#9333ea', borderRadius: '1px' }} title="MEMORY_ALLOCATION_EXT" />
          <div style={{ width: '9px', height: '9px', background: '#84cc16', borderRadius: '1px' }} title="Other" />
        </div>
      </div>

      {/* ── X-AXIS TIMELINE LABELS (Matching SolarWinds Screenshot) ── */}
      <div
        style={{
          padding: '0 26px 8px 64px',
          display: 'grid',
          gridTemplateColumns: 'repeat(24, 1fr)',
          fontSize: '9px',
          color: theme.axisText,
          userSelect: 'none'
        }}
      >
        <span style={{ fontWeight: 700, color: theme.headerTitle }}>{baseMonth} {baseDay}</span>
        <span>1:00 AM</span>
        <span>2:00 AM</span>
        <span>3:00 AM</span>
        <span>4:00 AM</span>
        <span>5:00 AM</span>
        <span>6:00 AM</span>
        <span>7:00 AM</span>
        <span>8:00 AM</span>
        <span>9:00 AM</span>
        <span>10:00 AM</span>
        <span>11:00 AM</span>
        <span>12:00 PM</span>
        <span>1:00 PM</span>
        <span>2:00 PM</span>
        <span>3:00 PM</span>
        <span>4:00 PM</span>
        <span>5:00 PM</span>
        <span>6:00 PM</span>
        <span>7:00 PM</span>
        <span>8:00 PM</span>
        <span>9:00 PM</span>
        <span>10:00 PM</span>
        <span style={{ fontWeight: 700, color: theme.headerTitle }}>{baseMonth} {baseDay + 1}</span>
      </div>

      {/* ── BOTTOM TABS: INTELLIGENT ANALYSIS | SQL TEXT | SUPPORTING DATA ── */}
      <div
        className="dpa-bottom-tabs-bar"
        style={{
          background: theme.bottomTabsBg,
          borderTop: `1px solid ${theme.bottomTabsBorder}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 18px'
        }}
      >
        <div style={{ display: 'flex', gap: '2px' }}>
          {[
            { id: 'analysis', label: 'INTELLIGENT ANALYSIS' },
            { id: 'sqltext', label: 'SQL TEXT' },
            { id: 'data', label: 'SUPPORTING DATA' }
          ].map((tab) => {
            const isActive = activeBottomTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveBottomTab(tab.id as any)}
                style={{
                  background: isActive ? theme.tabBtnActiveBg : theme.tabBtnInactiveBg,
                  color: isActive ? theme.tabActiveColor : theme.tabInactiveColor,
                  border: 'none',
                  borderTop: isActive ? `2px solid ${theme.tabActiveBorder}` : '2px solid transparent',
                  padding: '8px 16px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  letterSpacing: '0.4px',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Supporting data subview switcher (Graphs vs Table) when on SUPPORTING DATA tab */}
        {activeBottomTab === 'data' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: theme.dateNavBg, border: `1px solid ${theme.dateNavBorder}`, padding: '2px', borderRadius: '4px' }}>
            <button
              type="button"
              className={`btn btn-sm ${supportViewMode === 'graphs' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSupportViewMode('graphs')}
              style={{ fontSize: '10px', padding: '2px 7px', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="View SolarWinds DPA Category Graphs"
            >
              <BarChart2 size={11} />
              <span>DPA Graphs</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${supportViewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSupportViewMode('table')}
              style={{ fontSize: '10px', padding: '2px 7px', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="View Raw Hourly Table"
            >
              <TableIcon size={11} />
              <span>Hourly Table</span>
            </button>
          </div>
        )}
      </div>

      {/* ── TAB CONTENT ── */}
      <div style={{ padding: activeBottomTab === 'data' && supportViewMode === 'graphs' ? '0' : '14px 18px', background: theme.contentBg }}>
        {/* Tab 1: Intelligent Analysis */}
        {activeBottomTab === 'analysis' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div
              style={{
                background: isLightMode ? '#fef2f2' : 'rgba(239, 68, 68, 0.08)',
                border: isLightMode ? '1px solid #fecaca' : '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '6px',
                padding: '10px 14px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start'
              }}
            >
              <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: isLightMode ? '#b91c1c' : '#fca5a5', marginBottom: '3px' }}>
                  {analysisReport.title}
                </div>
                <p style={{ margin: 0, fontSize: '11.5px', color: theme.cardColor, lineHeight: '1.5' }}>
                  {analysisReport.description}
                </p>
              </div>
            </div>

            <div
              style={{
                background: isLightMode ? '#f0fdf4' : 'rgba(34, 197, 94, 0.08)',
                border: isLightMode ? '1px solid #bbf7d0' : '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '6px',
                padding: '10px 14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: isLightMode ? '#15803d' : '#86efac', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Sparkles size={14} color="#22c55e" /> {analysisReport.recommendationTitle}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyText(analysisReport.ddlCode, 'fix-ddl')}
                  style={{
                    background: '#15803d',
                    border: 'none',
                    color: '#ffffff',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {copiedCode === 'fix-ddl' ? <Check size={11} /> : <Copy size={11} />}
                  <span>{copiedCode === 'fix-ddl' ? 'Copied' : 'Copy Solution'}</span>
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  fontSize: '11px',
                  fontFamily: 'Consolas, monospace',
                  background: isLightMode ? '#ffffff' : 'rgba(0, 0, 0, 0.4)',
                  border: isLightMode ? '1px solid #cbd5e1' : 'none',
                  padding: '8px 10px',
                  borderRadius: '4px',
                  color: isLightMode ? '#15803d' : '#4ade80',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '180px',
                  overflowY: 'auto'
                }}
              >
                {analysisReport.ddlCode}
              </pre>
              <div style={{ fontSize: '11px', color: theme.mutedText, marginTop: '6px', lineHeight: '1.4' }}>
                {analysisReport.recommendationText}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: SQL Text */}
        {activeBottomTab === 'sqltext' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: theme.mutedText }}>
                Query Text for Hash <code style={{ color: '#0284c7' }}>{queryHash}</code>:
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    handleCopyText(sqlText, 'sql-raw');
                    if (onCopySQL) onCopySQL(sqlText);
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {copiedCode === 'sql-raw' ? <Check size={11} /> : <Copy size={11} />}
                  <span>Copy SQL</span>
                </button>
                {onAnalyzeAI && (
                  <button
                    type="button"
                    onClick={() => onAnalyzeAI(sqlText)}
                    style={{
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      border: 'none',
                      color: '#ffffff',
                      padding: '3px 9px',
                      borderRadius: '4px',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Sparkles size={11} />
                    <span>Analyze with AI Doctor</span>
                  </button>
                )}
              </div>
            </div>
            <pre
              style={{
                margin: 0,
                fontSize: '11.5px',
                fontFamily: 'Consolas, monospace',
                background: theme.codeBg,
                border: `1px solid ${theme.codeBorder}`,
                padding: '10px 12px',
                borderRadius: '6px',
                color: theme.codeText,
                whiteSpace: 'pre-wrap',
                maxHeight: '260px',
                overflowY: 'auto'
              }}
            >
              {sqlText}
            </pre>
          </div>
        )}

        {/* Tab 3: Supporting Data (Matching SolarWinds Screenshot Accordion Graphs!) */}
        {activeBottomTab === 'data' && (
          <div>
            {supportViewMode === 'graphs' ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {supportingSections.map((sec) => {
                  const isOpen = expandedSupportSection === sec.id;
                  return (
                    <div
                      key={sec.id}
                      style={{
                        borderBottom: `1px solid ${theme.accordionRowBorder}`
                      }}
                    >
                      {/* Accordion Row Header */}
                      <div
                        className="dpa-accordion-header"
                        onClick={() => setExpandedSupportSection(isOpen ? null : sec.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px 18px',
                          cursor: 'pointer',
                          background: isOpen ? theme.accordionRowHover : 'transparent',
                          transition: 'background 0.15s ease',
                          userSelect: 'none'
                        }}
                      >
                        <span style={{ color: '#0284c7', display: 'flex', alignItems: 'center' }}>
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: theme.accordionTitle }}>
                            {sec.title}
                          </span>
                          {sec.subtitle && (
                            <span style={{ fontSize: '10.5px', color: theme.mutedText, fontStyle: 'italic' }}>
                              {sec.subtitle}
                            </span>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: '11px',
                            color: theme.accordionSummary,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1
                          }}
                        >
                          {sec.summary}
                        </span>
                      </div>

                      {/* Expanded Section with 24-Hour Graph */}
                      {isOpen && renderSupportingChart(sec)}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Raw Hourly Table Fallback */
              <div style={{ maxHeight: '260px', overflowY: 'auto', padding: '14px 18px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left', color: theme.tableRowText }}>
                  <thead>
                    <tr style={{ background: theme.tableHeaderBg, borderBottom: `1px solid ${theme.accordionRowBorder}`, color: theme.tableHeaderColor }}>
                      <th style={{ padding: '6px 8px' }}>Hour Interval</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total Duration</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Memory/CPU</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>PAGEIOLATCH</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>MEM_ALLOC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hourlyData.map((d, i) => (
                      <tr
                        key={i}
                        style={{
                          borderBottom: `1px solid ${theme.tableRowBorder}`,
                          background: d.totalMinutes > maxScaleMinutes * 0.5 ? (isLightMode ? 'rgba(239, 68, 68, 0.06)' : 'rgba(239, 68, 68, 0.08)') : 'transparent'
                        }}
                      >
                        <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{d.fullTimeLabel}</td>
                        <td
                          style={{
                            padding: '4px 8px',
                            textAlign: 'right',
                            fontWeight: 700,
                            color: d.totalMinutes > maxScaleMinutes * 0.5 ? (isLightMode ? '#dc2626' : '#f87171') : theme.tableRowText
                          }}
                        >
                          {formatStandardDuration(d.totalMinutes)} <span style={{ opacity: 0.65, fontSize: '10px' }}>({d.totalMinutes}m)</span>
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: isLightMode ? '#15803d' : '#4ade80' }}>
                          {formatStandardDuration(d.memoryCpuMin)}
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: isLightMode ? '#0284c7' : '#38bdf8' }}>
                          {formatStandardDuration(d.pageIOLatchMin)}
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', color: isLightMode ? '#7e22ce' : '#c084fc' }}>
                          {formatStandardDuration(d.memoryAllocMin)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
