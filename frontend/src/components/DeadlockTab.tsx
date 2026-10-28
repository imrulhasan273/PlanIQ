import React, { useState, useRef } from 'react';
import {
  ShieldAlert,
  Skull,
  Lock,
  ArrowRight,
  Database,
  Server,
  User,
  Clock,
  Layers,
  Copy,
  Check,
  FileCode2,
  Upload,
  Download,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Zap,
  Info,
  Scale,
  ListOrdered,
  Columns,
  HelpCircle,
  FileSpreadsheet,
  Code2,
  CheckCircle2,
  GitCommit,
  HardDrive
} from 'lucide-react';
import {
  DeadlockGraph,
  DeadlockProcess,
  DeadlockResource,
} from '../types/deadlock';
import { SAMPLE_DEADLOCK_XDL, parseDeadlockXML, readFileAsDecodedText } from '../utils/deadlockParser';
import { OpenFilePicker } from '../../wailsjs/go/main/App';
import { toPng, toSvg } from 'html-to-image';

interface DeadlockTabProps {
  initialDeadlocks?: DeadlockGraph[];
  onOpenXdlFile?: () => void;
  onLoadSample?: () => void;
}

export const DeadlockTab: React.FC<DeadlockTabProps> = ({
  initialDeadlocks,
  onOpenXdlFile,
  onLoadSample,
}) => {
  const [deadlocks, setDeadlocks] = useState<DeadlockGraph[]>(() => {
    if (initialDeadlocks && initialDeadlocks.length > 0) {
      return initialDeadlocks;
    }
    return [];
  });

  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'graph' | 'timeline' | 'diff' | 'matrix'>('graph');
  const [remedyTab, setRemedyTab] = useState<'efcore' | 'tsql' | 'architecture'>('efcore');
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const graphContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync with initialDeadlocks if props update (e.g. from App.tsx open file or drop)
  React.useEffect(() => {
    if (initialDeadlocks && initialDeadlocks.length > 0) {
      setDeadlocks(initialDeadlocks);
      setActiveIdx(0);
    }
  }, [initialDeadlocks]);

  const activeDeadlock = deadlocks[activeIdx] || deadlocks[0];

  // Auto-select victim process or first process on load
  React.useEffect(() => {
    if (activeDeadlock) {
      if (activeDeadlock.victimProcessId) {
        setSelectedProcessId(activeDeadlock.victimProcessId);
        setSelectedResourceId(null);
      } else if (activeDeadlock.processes.length > 0) {
        setSelectedProcessId(activeDeadlock.processes[0].id);
        setSelectedResourceId(null);
      }
    }
  }, [activeDeadlock]);

  const handleCopy = (text: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const handleLoadSample = () => {
    try {
      const parsed = parseDeadlockXML(SAMPLE_DEADLOCK_XDL);
      setDeadlocks(parsed);
      setActiveIdx(0);
      if (onLoadSample) {
        onLoadSample();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenXdlFile = async () => {
    if (onOpenXdlFile) {
      onOpenXdlFile();
      return;
    }
    if (typeof window !== 'undefined' && (window as any).go?.main?.App?.OpenFilePicker) {
      try {
        const res = await OpenFilePicker();
        if (res && res.content) {
          const parsed = parseDeadlockXML(res.content);
          setDeadlocks(parsed);
          setActiveIdx(0);
          return;
        }
      } catch (err: any) {
        console.error('Failed to open deadlock via OpenFilePicker:', err);
        alert(`Failed to open deadlock file: ${err?.message || err}`);
        return;
      }
    }
    // Fallback: trigger file input dialog
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await readFileAsDecodedText(file);
      const parsed = parseDeadlockXML(content);
      setDeadlocks(parsed);
      setActiveIdx(0);
    } catch (err: any) {
      alert(`Failed to parse deadlock file: ${err?.message || err}`);
    } finally {
      e.target.value = '';
    }
  };

  const handleExportPng = async () => {
    if (!graphContainerRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(graphContainerRef.current, {
        backgroundColor: '#090d16',
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `PlanIQ_Deadlock_Graph_${activeDeadlock?.id || 'export'}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export deadlock PNG:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSvg = async () => {
    if (!graphContainerRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = await toSvg(graphContainerRef.current, {
        backgroundColor: '#090d16',
      });
      const link = document.createElement('a');
      link.download = `PlanIQ_Deadlock_Graph_${activeDeadlock?.id || 'export'}.svg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export deadlock SVG:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (!activeDeadlock) {
    return (
      <div className="tab-scroll-container">
        <div
          className="glass-panel"
          style={{
            maxWidth: '680px',
            margin: '40px auto',
            padding: '48px 36px',
            textAlign: 'center',
            borderRadius: '16px',
            border: '1px solid rgba(244, 63, 94, 0.25)',
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '20px',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <ShieldAlert size={36} color="#f43f5e" />
          </div>

          <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
            SQL Server Deadlock Analyzer
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6', maxWidth: '520px', margin: '0 auto 28px' }}>
            Visualize circular lock dependencies, identify victim processes rolled back by the engine, inspect lock resources, and generate automated EF Core &amp; T-SQL resolution scripts.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '32px' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleLoadSample}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 22px', fontSize: '13px', fontWeight: 600 }}
            >
              <FileCode2 size={16} />
              <span>Sample Plan (.xdl)</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleOpenXdlFile}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 22px', fontSize: '13px', fontWeight: 600 }}
            >
              <Upload size={16} color="#38bdf8" />
              <span>Open .xdl File</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xdl,.xml"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />

          {/* Quick Capability Highlights */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
              textAlign: 'left',
              marginTop: '10px',
              paddingTop: '24px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Skull size={18} color="#f43f5e" />
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#e2e8f0' }}>Victim Detection</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Identifies rolled-back SPID</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Lock size={18} color="#fbbf24" />
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#e2e8f0' }}>Lock Modes &amp; Graph</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Key, page &amp; object locks</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Clock size={18} color="#38bdf8" />
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#e2e8f0' }}>Lock Timeline</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Chronological sequence</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sparkles size={18} color="#34d399" />
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#e2e8f0' }}>Automated Fixes</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>EF Core &amp; T-SQL remedies</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const selectedProcess = activeDeadlock.processes.find((p) => p.id === selectedProcessId);
  const selectedResource = activeDeadlock.resources.find((r) => r.id === selectedResourceId);
  const victimProcess = activeDeadlock.processes.find((p) => p.isVictim) || activeDeadlock.processes[0];
  const survivorProcess = activeDeadlock.processes.find((p) => !p.isVictim) || activeDeadlock.processes[1];

  // Compute node positions for SVG graph layout
  const procs = activeDeadlock.processes;
  const res = activeDeadlock.resources;

  // Layout: Process columns on left and right, resources in center (for 2-node classic), or circle
  const svgWidth = 860;
  const svgHeight = 440;

  type NodePos = { x: number; y: number; id: string; type: 'process' | 'resource' };
  const positions: Record<string, NodePos> = {};

  if (procs.length === 2 && res.length >= 2) {
    // Elegant bipartite layout for the most common 2-process deadlock
    positions[procs[0].id] = { x: 160, y: 140, id: procs[0].id, type: 'process' };
    positions[procs[1].id] = { x: 700, y: 300, id: procs[1].id, type: 'process' };

    positions[res[0].id] = { x: 430, y: 110, id: res[0].id, type: 'resource' };
    positions[res[1].id] = { x: 430, y: 330, id: res[1].id, type: 'resource' };
  } else {
    // Circular layout for N-way deadlocks
    const allNodes = [
      ...procs.map((p) => ({ id: p.id, type: 'process' as const })),
      ...res.map((r) => ({ id: r.id, type: 'resource' as const })),
    ];
    const centerX = svgWidth / 2;
    const centerY = svgHeight / 2;
    const radius = Math.min(centerX, centerY) - 80;

    allNodes.forEach((node, idx) => {
      const angle = (idx / allNodes.length) * 2 * Math.PI - Math.PI / 2;
      positions[node.id] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        id: node.id,
        type: node.type,
      };
    });
  }

  return (
    <div className="tab-scroll-container">
      {/* Sleek, Compact Deadlock Control & Victim Banner */}
      <div className="section-block" style={{ marginBottom: '16px' }}>
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%)',
            border: '1px solid rgba(244, 63, 94, 0.35)',
            borderRadius: '10px',
            padding: '12px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          {/* Left: Victim Badge, Title & Summary */}
          <div style={{ maxWidth: '620px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  background: 'rgba(244, 63, 94, 0.25)',
                  color: '#f43f5e',
                  border: '1px solid rgba(244, 63, 94, 0.5)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Skull size={12} />
                Victim SPID #{activeDeadlock.victimSpid || 'N/A'} Rolled Back
              </span>
              <span
                style={{
                  background: 'rgba(56, 189, 248, 0.18)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                {activeDeadlock.deadlockType}
              </span>
              <span
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: '#94a3b8',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 600,
                }}
              >
                100% Offline
              </span>
            </div>
            <p style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: '1.45', margin: 0 }}>
              {activeDeadlock.summary}
            </p>
          </div>

          {/* Right: Actions & Metrics Toolbar (Compact Single Row) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Mini Metrics */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(10, 15, 29, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '11.5px',
                marginRight: '4px',
              }}
            >
              <span>Procs: <strong style={{ color: '#38bdf8' }}>{activeDeadlock.processes.length}</strong></span>
              <span style={{ color: '#475569' }}>•</span>
              <span>Locks: <strong style={{ color: '#fbbf24' }}>{activeDeadlock.resources.length}</strong></span>
              <span style={{ color: '#475569' }}>•</span>
              <span>Cycle: <strong style={{ color: '#f43f5e' }}>{activeDeadlock.cycle.length}</strong></span>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleLoadSample}
              title="Load demo classic 2-process deadlock"
            >
              <FileCode2 size={13} color="#38bdf8" />
              <span>Sample Plan</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleOpenXdlFile}
              title="Open .xdl or deadlock .xml file"
            >
              <Upload size={13} color="#a78bfa" />
              <span>Open .xdl</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xdl,.xml"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExportPng}
              disabled={isExporting}
              title="Export high-res PNG image"
            >
              <Download size={13} />
              <span>PNG</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExportSvg}
              disabled={isExporting}
              title="Export vector SVG file"
            >
              <Download size={13} />
              <span>SVG</span>
            </button>
          </div>
        </div>

        {/* Multi-deadlock selector if report has >1 */}
        {deadlocks.length > 1 && (
          <div style={{ marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Detected Deadlocks:</span>
            {deadlocks.map((dl, i) => (
              <button
                key={dl.id}
                type="button"
                className={`btn btn-sm ${i === activeIdx ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '2px 8px', fontSize: '11px' }}
                onClick={() => setActiveIdx(i)}
              >
                Deadlock #{i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Root Cause & Victim Selection Diagnostics */}
      {activeDeadlock.victimSelectionReason && (
        <div
          style={{
            marginBottom: '16px',
            background: 'linear-gradient(90deg, rgba(244, 63, 94, 0.08) 0%, rgba(30, 41, 59, 0.4) 100%)',
            border: '1px solid rgba(244, 63, 94, 0.25)',
            borderLeft: '4px solid #f43f5e',
            borderRadius: '8px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 500px' }}>
            <Scale size={18} color="#f43f5e" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#f43f5e', letterSpacing: '0.05em' }}>
                Victim Selection Rationale (Rollback Cost Analysis)
              </div>
              <div style={{ fontSize: '12px', color: '#e2e8f0', marginTop: '2px', lineHeight: '1.4' }}>
                {activeDeadlock.victimSelectionReason}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {activeDeadlock.hasBulkInsert && (
              <span style={{ fontSize: '10.5px', background: 'rgba(234, 179, 8, 0.15)', color: '#fbbf24', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                📦 Bulk Insert Operation
              </span>
            )}
            {activeDeadlock.hasPageLocks && (
              <span style={{ fontSize: '10.5px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                📄 8 KB Page Contention (PAGELOCK)
              </span>
            )}
            {activeDeadlock.hasNestedTransactions && (
              <span style={{ fontSize: '10.5px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                🔄 Nested Transactions (@@TRANCOUNT &gt; 1)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Visualizer Mode Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #1e293b', paddingBottom: '10px' }}>
        <button
          type="button"
          onClick={() => setViewMode('graph')}
          className={`btn btn-sm ${viewMode === 'graph' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Layers size={13} />
          <span>Interactive Graph</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('timeline')}
          className={`btn btn-sm ${viewMode === 'timeline' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <ListOrdered size={13} />
          <span>Step Timeline</span>
          {activeDeadlock.timeline && activeDeadlock.timeline.length > 0 && (
            <span style={{ background: 'rgba(255,255,255,0.15)', padding: '1px 6px', borderRadius: '10px', fontSize: '10px' }}>
              {activeDeadlock.timeline.length + 1}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setViewMode('diff')}
          className={`btn btn-sm ${viewMode === 'diff' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Columns size={13} />
          <span>Side-by-Side Session Diff</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('matrix')}
          className={`btn btn-sm ${viewMode === 'matrix' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Lock size={13} />
          <span>Page Lock &amp; Granularity Matrix</span>
        </button>
      </div>

      {/* Main Interactive Graph & Inspector Split */}
      {viewMode === 'graph' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1.3fr) minmax(360px, 1fr)', gap: '20px', marginBottom: '24px' }}>
          {/* Left: SVG Graph Canvas */}
          <div
            ref={graphContainerRef}
            className="glass-panel"
            style={{
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              overflow: 'hidden',
              background: '#070b14',
              border: '1px solid #1e293b',
            }}
          >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={14} color="#38bdf8" />
              <span className="deadlock-graph-section-title" style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>Interactive Dependency Graph</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11px' }}>
              <span className="deadlock-legend-owner" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#34d399' }}>
                <span style={{ width: '12px', height: '3px', background: 'currentColor', borderRadius: '2px' }} />
                Holds Lock (Owner)
              </span>
              <span className="deadlock-legend-waiter" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#f43f5e' }}>
                <span style={{ width: '12px', height: '3px', background: 'currentColor', borderRadius: '2px', borderBottom: '1px dashed currentColor' }} />
                Waiting (Blocked)
              </span>
            </div>
          </div>

          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ width: '100%', height: 'auto', maxHeight: '480px', userSelect: 'none' }}
          >
            <defs>
              {/* Arrow markers */}
              <marker id="arrow-owner" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#34d399" />
              </marker>
              <marker id="arrow-waiter" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
              </marker>

              {/* Glow filter for deadlock cycle */}
              <filter id="glow-cycle" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* 1. Draw Edges: Owners (Solid Green) & Waiters (Pulsing Red) */}
            {res.map((r) => {
              const rPos = positions[r.id];
              if (!rPos) return null;

              return (
                <g key={`edges_${r.id}`}>
                  {/* Owners: Process owns Resource */}
                  {r.owners.map((owner) => {
                    const pPos = positions[owner.processId];
                    if (!pPos) return null;
                    return (
                      <g key={`owner_${owner.processId}_${r.id}`}>
                        <line
                          x1={pPos.x}
                          y1={pPos.y}
                          x2={rPos.x}
                          y2={rPos.y}
                          stroke="#34d399"
                          strokeWidth="2.5"
                          markerEnd="url(#arrow-owner)"
                          strokeOpacity="0.8"
                        />
                        <rect
                          x={(pPos.x + rPos.x) / 2 - 28}
                          y={(pPos.y + rPos.y) / 2 - 10}
                          width="56"
                          height="20"
                          rx="4"
                          fill="#090d16"
                          stroke="#34d399"
                          strokeWidth="1"
                          strokeOpacity="0.5"
                        />
                        <text
                          x={(pPos.x + rPos.x) / 2}
                          y={(pPos.y + rPos.y) / 2 + 3}
                          fill="#34d399"
                          fontSize="9.5"
                          fontWeight="700"
                          textAnchor="middle"
                        >
                          OWN ({owner.mode})
                        </text>
                      </g>
                    );
                  })}

                  {/* Waiters: Process waits on Resource */}
                  {r.waiters.map((waiter) => {
                    const pPos = positions[waiter.processId];
                    if (!pPos) return null;
                    return (
                      <g key={`waiter_${waiter.processId}_${r.id}`}>
                        <line
                          x1={pPos.x}
                          y1={pPos.y}
                          x2={rPos.x}
                          y2={rPos.y}
                          stroke="#f43f5e"
                          strokeWidth="2.5"
                          strokeDasharray="5,4"
                          markerEnd="url(#arrow-waiter)"
                          filter="url(#glow-cycle)"
                        />
                        <rect
                          x={(pPos.x + rPos.x) / 2 - 32}
                          y={(pPos.y + rPos.y) / 2 - 10}
                          width="64"
                          height="20"
                          rx="4"
                          fill="#090d16"
                          stroke="#f43f5e"
                          strokeWidth="1"
                          strokeOpacity="0.7"
                        />
                        <text
                          x={(pPos.x + rPos.x) / 2}
                          y={(pPos.y + rPos.y) / 2 + 3}
                          fill="#f43f5e"
                          fontSize="9.5"
                          fontWeight="800"
                          textAnchor="middle"
                        >
                          WAIT ({waiter.mode})
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* 2. Draw Resource Nodes */}
            {res.map((r) => {
              const pos = positions[r.id];
              if (!pos) return null;
              const isSelected = selectedResourceId === r.id;
              const boxW = 160;
              const boxH = 58;

              return (
                <g
                  key={r.id}
                  className={`deadlock-res-node ${isSelected ? 'is-selected' : ''}`}
                  transform={`translate(${pos.x - boxW / 2}, ${pos.y - boxH / 2})`}
                  onClick={() => {
                    setSelectedResourceId(r.id);
                    setSelectedProcessId(null);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    className="deadlock-res-box"
                    width={boxW}
                    height={boxH}
                    rx="8"
                    fill={isSelected ? '#1e293b' : '#0f172a'}
                    stroke={isSelected ? '#38bdf8' : '#334155'}
                    strokeWidth={isSelected ? '2.5' : '1.5'}
                    filter={isSelected ? 'url(#glow-cycle)' : undefined}
                  />
                  <rect
                    className="deadlock-res-pill"
                    x="0"
                    y="0"
                    width={boxW}
                    height="18"
                    rx="8"
                    fill="rgba(56, 189, 248, 0.15)"
                  />
                  <text
                    className="deadlock-res-pill-text"
                    x={boxW / 2}
                    y="13"
                    fill="#38bdf8"
                    fontSize="9.5"
                    fontWeight="800"
                    textAnchor="middle"
                    letterSpacing="0.04em"
                  >
                    🔒 {r.type.toUpperCase()} ({r.mode || 'X'})
                  </text>
                  <text
                    className="deadlock-res-title"
                    x={boxW / 2}
                    y="32"
                    fill="#f8fafc"
                    fontSize="11"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {r.objectname ? r.objectname.split('.').pop() : 'Resource'}
                  </text>
                  <text
                    className="deadlock-res-sub"
                    x={boxW / 2}
                    y="47"
                    fill="#cbd5e1"
                    fontSize="9"
                    textAnchor="middle"
                  >
                    {r.indexname ? `Idx: ${r.indexname}` : `ID: ${r.id.slice(0, 14)}`}
                  </text>
                </g>
              );
            })}

            {/* 3. Draw Process Nodes */}
            {procs.map((p) => {
              const pos = positions[p.id];
              if (!pos) return null;
              const isSelected = selectedProcessId === p.id;
              const isVictim = p.isVictim;
              const boxW = 180;
              const boxH = 68;

              return (
                <g
                  key={p.id}
                  className={`deadlock-proc-node ${isVictim ? 'is-victim' : ''} ${isSelected ? 'is-selected' : ''}`}
                  transform={`translate(${pos.x - boxW / 2}, ${pos.y - boxH / 2})`}
                  onClick={() => {
                    setSelectedProcessId(p.id);
                    setSelectedResourceId(null);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    className="deadlock-proc-box"
                    width={boxW}
                    height={boxH}
                    rx="10"
                    fill={isVictim ? (isSelected ? '#5c081e' : '#450a14') : isSelected ? '#1e293b' : '#0f172a'}
                    stroke={isVictim ? (isSelected ? '#ff4d6d' : '#f43f5e') : isSelected ? '#38bdf8' : '#475569'}
                    strokeWidth={isSelected || isVictim ? '2.5' : '1.5'}
                    strokeDasharray={isVictim ? 'none' : undefined}
                    filter={isVictim ? 'url(#glow-cycle)' : undefined}
                  />
                  {/* Top Pill / Badge */}
                  <rect
                    className="deadlock-proc-pill"
                    x="0"
                    y="0"
                    width={boxW}
                    height="20"
                    rx="10"
                    fill={isVictim ? '#881337' : 'rgba(56, 189, 248, 0.15)'}
                  />
                  <text
                    className="deadlock-proc-pill-text"
                    x={boxW / 2}
                    y="14"
                    fill={isVictim ? '#ffffff' : '#38bdf8'}
                    fontSize="10"
                    fontWeight="800"
                    textAnchor="middle"
                  >
                    {isVictim ? '💀 VICTIM (SPID ' + p.spid + ')' : 'SPID #' + p.spid + ' (' + (p.status || 'Active') + ')'}
                  </text>
                  <text
                    className="deadlock-proc-title"
                    x={boxW / 2}
                    y="36"
                    fill="#ffffff"
                    fontSize="11.5"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {p.clientapp || p.loginname || 'Process'}
                  </text>
                  <text
                    className="deadlock-proc-sub"
                    x={boxW / 2}
                    y="53"
                    fill={isVictim ? '#fecdd3' : '#cbd5e1'}
                    fontSize="9.5"
                    textAnchor="middle"
                  >
                    Host: {p.hostname || 'Unknown'} • Wait: {p.waittimeMs}ms
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="deadlock-graph-footer-hint" style={{ marginTop: 'auto', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
            <span>Click any Process or Lock node to inspect full metadata & query text</span>
            <span>Cycle Detection: Directed Graph BFS/DFS</span>
          </div>
        </div>

        {/* Right: Selected Node Detail Inspector */}
        <div className="glass-panel" style={{ borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
          {selectedProcess ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Server size={18} color={selectedProcess.isVictim ? '#f43f5e' : '#38bdf8'} />
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#fff', margin: 0 }}>
                    Process Details: SPID #{selectedProcess.spid}
                  </h3>
                </div>
                {selectedProcess.isVictim && (
                  <span
                    className="deadlock-victim-badge"
                    style={{
                      background: 'rgba(244, 63, 94, 0.2)',
                      color: '#f43f5e',
                      border: '1px solid rgba(244, 63, 94, 0.4)',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Skull size={12} /> Deadlock Victim
                  </span>
                )}
              </div>

              {/* Meta Grid */}
              <div
                className="deadlock-meta-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                  fontSize: '12px',
                }}
              >
                <div>
                  <span style={{ color: '#64748b' }}>Login Name:</span>{' '}
                  <strong style={{ color: '#e2e8f0' }}>{selectedProcess.loginname || 'dbo'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Client App:</span>{' '}
                  <strong style={{ color: '#e2e8f0' }}>{selectedProcess.clientapp || 'SQL Client'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Host Name:</span>{' '}
                  <strong style={{ color: '#e2e8f0' }}>{selectedProcess.hostname || 'Local'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Isolation Level:</span>{' '}
                  <strong style={{ color: '#a78bfa' }}>{selectedProcess.isolationlevel || 'Read Committed'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Wait Time:</span>{' '}
                  <strong style={{ color: '#fbbf24' }}>{selectedProcess.waittimeMs} ms</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Lock Mode:</span>{' '}
                  <strong style={{ color: '#f43f5e' }}>{selectedProcess.lockMode || 'X'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Rollback Cost (Log):</span>{' '}
                  <strong style={{ color: selectedProcess.isVictim ? '#f43f5e' : '#34d399' }}>
                    {selectedProcess.logUsedBytes !== undefined
                      ? `${(selectedProcess.logUsedBytes / 1024).toFixed(1)} KB (${selectedProcess.logUsedBytes.toLocaleString()} B)`
                      : 'N/A'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Open Trans (trancount):</span>{' '}
                  <strong style={{ color: (selectedProcess.tranCount || 0) > 1 ? '#f59e0b' : '#38bdf8' }}>
                    {selectedProcess.tranCount ?? 1}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Transaction ID:</span>{' '}
                  <code style={{ color: '#94a3b8', fontSize: '11px' }}>{selectedProcess.xactId || 'N/A'}</code>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>KPID (OS Thread):</span>{' '}
                  <code style={{ color: '#cbd5e1', fontSize: '11px' }}>{selectedProcess.kpid || 'N/A'}</code>
                </div>
              </div>

              {/* T-SQL Input Buffer / Query */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <FileCode2 size={13} /> Active T-SQL Batch (inputbuf)
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 8px', fontSize: '11px' }}
                    onClick={() => handleCopy(selectedProcess.inputbuf, 'inputbuf')}
                  >
                    {copiedKey === 'inputbuf' ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                    <span>{copiedKey === 'inputbuf' ? 'Copied' : 'Copy SQL'}</span>
                  </button>
                </div>
                <pre
                  style={{
                    background: '#040711',
                    border: '1px solid #1e293b',
                    borderRadius: '6px',
                    padding: '12px',
                    fontSize: '11.5px',
                    color: '#e2e8f0',
                    fontFamily: "'JetBrains Mono', Consolas, monospace",
                    maxHeight: '140px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {selectedProcess.inputbuf || 'No inputbuf recorded.'}
                </pre>
              </div>

              {/* Execution Stack Frames */}
              {selectedProcess.executionStack.length > 0 && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px' }}>
                    Execution Call Stack ({selectedProcess.executionStack.length} Frames)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                    {selectedProcess.executionStack.map((frame, fIdx) => (
                      <div
                        key={fIdx}
                        style={{
                          background: '#090d16',
                          border: '1px solid #1e293b',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          fontSize: '11.5px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', marginBottom: '4px' }}>
                          <strong style={{ color: '#38bdf8' }}>{frame.procname || 'Ad-Hoc Batch'}</strong>
                          <span>Line {frame.line}</span>
                        </div>
                        <code style={{ color: '#cbd5e1', fontSize: '11px', display: 'block', whiteSpace: 'pre-wrap' }}>
                          {frame.sql}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : selectedResource ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <Lock size={18} color="#38bdf8" />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#fff', margin: 0 }}>
                  Locked Resource: {selectedResource.type.toUpperCase()}
                </h3>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr',
                  gap: '8px',
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                  fontSize: '12px',
                }}
              >
                <div>
                  <span style={{ color: '#64748b' }}>Table / Object:</span>{' '}
                  <strong style={{ color: '#38bdf8' }}>{selectedResource.objectname || 'Unspecified'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Index:</span>{' '}
                  <strong style={{ color: '#cbd5e1' }}>{selectedResource.indexname || 'Heap / Clustered'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Lock Mode:</span>{' '}
                  <strong style={{ color: '#f43f5e' }}>{selectedResource.mode || 'Exclusive (X)'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Lock Granularity:</span>{' '}
                  <span
                    style={{
                      background: selectedResource.lockGranularity === 'Page Lock' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                      color: selectedResource.lockGranularity === 'Page Lock' ? '#fbbf24' : '#38bdf8',
                      border: `1px solid ${selectedResource.lockGranularity === 'Page Lock' ? 'rgba(234, 179, 8, 0.4)' : 'rgba(56, 189, 248, 0.4)'}`,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                  >
                    {selectedResource.lockGranularity}
                  </span>
                </div>
                {selectedResource.subresource && (
                  <div>
                    <span style={{ color: '#64748b' }}>Subresource / Page:</span>{' '}
                    <code style={{ color: '#fbbf24', fontSize: '11px' }}>{selectedResource.subresource}</code>
                  </div>
                )}
                <div>
                  <span style={{ color: '#64748b' }}>Associated Object ID / HoBT:</span>{' '}
                  <code style={{ color: '#94a3b8', fontSize: '11px' }}>{selectedResource.associatedObjectId || selectedResource.hobtid || 'N/A'}</code>
                </div>
              </div>

              {selectedResource.lockGranularity === 'Page Lock' && (
                <div
                  style={{
                    background: 'rgba(234, 179, 8, 0.08)',
                    border: '1px solid rgba(234, 179, 8, 0.25)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    marginBottom: '14px',
                    fontSize: '11px',
                    color: '#fef08a',
                    lineHeight: '1.4',
                  }}
                >
                  💡 <strong>Page Lock Contention:</strong> An 8 KB data page holds multiple rows. Even when two sessions insert different rows, they will collide if both touch the same page. Disabling page locks forces row-level KEYLOCK granularity.
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#34d399', marginBottom: '6px' }}>
                  Current Owner Processes ({selectedResource.owners.length})
                </div>
                {selectedResource.owners.map((o, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(52, 211, 153, 0.08)',
                      border: '1px solid rgba(52, 211, 153, 0.3)',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '11.5px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                    }}
                  >
                    <span>Process ID: <strong style={{ color: '#34d399' }}>{o.processId}</strong></span>
                    <span>Held Mode: <strong>{o.mode}</strong></span>
                  </div>
                ))}
              </div>

              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#f43f5e', marginBottom: '6px' }}>
                  Waiting Blocked Processes ({selectedResource.waiters.length})
                </div>
                {selectedResource.waiters.map((w, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(244, 63, 94, 0.08)',
                      border: '1px solid rgba(244, 63, 94, 0.3)',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '11.5px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                    }}
                  >
                    <span>Process ID: <strong style={{ color: '#f43f5e' }}>{w.processId}</strong></span>
                    <span>Requested Mode: <strong>{w.mode} ({w.requestType})</strong></span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
              <Info size={32} style={{ margin: '0 auto 10px', opacity: 0.6 }} />
              <p>Select any process or resource in the graph to inspect detailed locking states.</p>
            </div>
          )}
        </div>
      </div>
      )}

      {/* 2. Chronological Timeline View */}
      {viewMode === 'timeline' && (
        <div className="glass-panel" style={{ borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ListOrdered size={20} color="#38bdf8" />
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#fff', margin: 0 }}>
                  Chronological Deadlock Step Timeline
                </h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                  Reconstructed sequence of lock acquisition, wait-for blocking, cycle detection, and victim rollback.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', fontSize: '11px', flexWrap: 'wrap' }}>
              <span style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '2px 8px', borderRadius: '4px' }}>
                ● OWN = Lock Acquired
              </span>
              <span style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', border: '1px solid rgba(244, 63, 94, 0.3)', padding: '2px 8px', borderRadius: '4px' }}>
                ● WAIT = Blocked Request
              </span>
              <span style={{ background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.3)', padding: '2px 8px', borderRadius: '4px' }}>
                ● CYCLE = Deadlock Detected
              </span>
            </div>
          </div>

          {/* Timeline Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeDeadlock.timeline.map((evt, idx) => {
              const isOwn = evt.phase === 'OWN';
              const isWait = evt.phase === 'WAIT';
              const isCycle = evt.phase === 'CYCLE';
              const isKill = evt.phase === 'KILL';

              const borderColor = isOwn ? 'rgba(52, 211, 153, 0.4)' : isWait ? 'rgba(244, 63, 94, 0.4)' : isCycle ? 'rgba(251, 191, 36, 0.5)' : '#f43f5e';
              const bgColor = isOwn ? 'rgba(52, 211, 153, 0.05)' : isWait ? 'rgba(244, 63, 94, 0.06)' : isCycle ? 'rgba(251, 191, 36, 0.08)' : 'rgba(244, 63, 94, 0.15)';
              const badgeColor = isOwn ? '#34d399' : isWait ? '#f43f5e' : isCycle ? '#fbbf24' : '#f43f5e';

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    gap: '16px',
                    background: bgColor,
                    border: `1px solid ${borderColor}`,
                    borderRadius: '10px',
                    padding: '14px 18px',
                    alignItems: 'flex-start',
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: isKill ? '#f43f5e' : 'rgba(15, 23, 42, 0.8)',
                      border: `2px solid ${badgeColor}`,
                      color: isKill ? '#fff' : badgeColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '12px',
                      flexShrink: 0,
                    }}
                  >
                    {isKill ? <Skull size={15} /> : isCycle ? <AlertTriangle size={15} /> : evt.stepNumber}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          background: `${badgeColor}22`,
                          color: badgeColor,
                          border: `1px solid ${badgeColor}44`,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '10.5px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                        }}
                      >
                        {evt.phase}
                      </span>

                      {evt.spid > 0 && (
                        <span style={{ fontSize: '12px', fontWeight: 700, color: evt.isVictim ? '#f43f5e' : '#38bdf8' }}>
                          SPID #{evt.spid} {evt.isVictim && '(Victim)'}
                        </span>
                      )}

                      {evt.lockMode && (
                        <span style={{ fontSize: '11px', color: '#cbd5e1', background: 'rgba(255, 255, 255, 0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                          Mode: <strong style={{ color: '#fff' }}>{evt.lockMode}</strong>
                        </span>
                      )}

                      {evt.resourceName && (
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          Resource: <code style={{ color: '#38bdf8' }}>{evt.resourceName}</code>
                        </span>
                      )}
                    </div>

                    <p style={{ fontSize: '12.5px', color: '#e2e8f0', margin: 0, lineHeight: '1.5' }}>
                      {evt.description}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* Final Victim Rollback event */}
            {activeDeadlock.victimSpid && (
              <div
                className="deadlock-resolution-card"
                style={{
                  display: 'flex',
                  gap: '16px',
                  background: 'rgba(244, 63, 94, 0.12)',
                  border: '1px solid rgba(244, 63, 94, 0.4)',
                  borderRadius: '10px',
                  padding: '14px 18px',
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: '#f43f5e',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '12px',
                    flexShrink: 0,
                  }}
                >
                  <Skull size={16} />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        background: 'rgba(244, 63, 94, 0.25)',
                        color: '#f43f5e',
                        border: '1px solid rgba(244, 63, 94, 0.5)',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10.5px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                      }}
                    >
                      RESOLUTION (VICTIM ROLLED BACK)
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#f43f5e' }}>
                      SPID #{activeDeadlock.victimSpid} Terminated
                    </span>
                  </div>

                  <p style={{ fontSize: '12.5px', color: '#fecdd3', margin: 0, lineHeight: '1.5' }}>
                    SQL Server Deadlock Monitor chose SPID #{activeDeadlock.victimSpid} as the victim. Error 1205 was returned to the client, rolling back its transaction. The surviving session was unblocked and completed successfully.
                  </p>
                  {activeDeadlock.victimSelectionReason && (
                    <div style={{ marginTop: '8px', fontSize: '11.5px', color: '#fda4af' }}>
                      <strong>Selection Factor:</strong> {activeDeadlock.victimSelectionReason}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Side-by-Side Session Diff */}
      {viewMode === 'diff' && (
        <div className="glass-panel" style={{ borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Columns size={20} color="#38bdf8" />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#fff', margin: 0 }}>
                Side-by-Side Session Comparison (Victim vs. Survivor)
              </h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                Deep architectural comparison of transaction attributes, rollback costs, client apps, and SQL batches.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Victim Column */}
            <div
              style={{
                background: 'rgba(244, 63, 94, 0.05)',
                border: '1px solid rgba(244, 63, 94, 0.35)',
                borderRadius: '10px',
                padding: '16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Skull size={18} color="#f43f5e" />
                  <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#f43f5e', margin: 0 }}>
                    SPID #{victimProcess?.spid || 'N/A'} (Deadlock Victim)
                  </h4>
                </div>
                <span style={{ background: '#f43f5e', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>
                  ROLLED BACK
                </span>
              </div>

              {victimProcess && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px' }}>
                  <div className="deadlock-session-meta" style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div><span style={{ color: '#64748b' }}>Rollback Cost:</span> <strong style={{ color: '#f43f5e' }}>{victimProcess.logUsedBytes !== undefined ? `${(victimProcess.logUsedBytes / 1024).toFixed(1)} KB` : 'N/A'}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Deadlock Priority:</span> <strong style={{ color: '#e2e8f0' }}>{victimProcess.priority}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Status:</span> <strong style={{ color: '#e2e8f0' }}>{victimProcess.status}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Lock Mode:</span> <strong style={{ color: '#f43f5e' }}>{victimProcess.lockMode}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Wait Time:</span> <strong style={{ color: '#fbbf24' }}>{victimProcess.waittimeMs} ms</strong></div>
                    <div><span style={{ color: '#64748b' }}>Open Trans:</span> <strong style={{ color: '#38bdf8' }}>{victimProcess.tranCount ?? 1}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Client App:</span> <strong style={{ color: '#cbd5e1' }}>{victimProcess.clientapp || 'N/A'}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Host Name:</span> <strong style={{ color: '#cbd5e1' }}>{victimProcess.hostname || 'N/A'}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Isolation Level:</span> <strong style={{ color: '#a78bfa' }}>{victimProcess.isolationlevel || 'Read Committed'}</strong></div>
                    <div><span style={{ color: '#64748b' }}>KPID (Thread):</span> <strong style={{ color: '#cbd5e1' }}>{victimProcess.kpid || 'N/A'}</strong></div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, color: '#f43f5e' }}>Active SQL Statement</span>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '2px 8px', fontSize: '11px' }}
                        onClick={() => handleCopy(victimProcess.inputbuf, 'victim_sql')}
                      >
                        {copiedKey === 'victim_sql' ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                        <span>{copiedKey === 'victim_sql' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="deadlock-sql-box" style={{ background: '#040711', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px', fontSize: '11px', color: '#e2e8f0', maxHeight: '160px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                      {victimProcess.inputbuf || 'No statement captured'}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Survivor Column */}
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.05)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '10px',
                padding: '16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Server size={18} color="#38bdf8" />
                  <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#38bdf8', margin: 0 }}>
                    SPID #{survivorProcess?.spid || 'N/A'} (Deadlock Survivor)
                  </h4>
                </div>
                <span style={{ background: '#0284c7', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>
                  COMMITTED
                </span>
              </div>

              {survivorProcess && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px' }}>
                  <div className="deadlock-session-meta" style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div><span style={{ color: '#64748b' }}>Rollback Cost:</span> <strong style={{ color: '#34d399' }}>{survivorProcess.logUsedBytes !== undefined ? `${(survivorProcess.logUsedBytes / 1024).toFixed(1)} KB` : 'N/A'}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Deadlock Priority:</span> <strong style={{ color: '#e2e8f0' }}>{survivorProcess.priority}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Status:</span> <strong style={{ color: '#e2e8f0' }}>{survivorProcess.status}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Lock Mode:</span> <strong style={{ color: '#38bdf8' }}>{survivorProcess.lockMode}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Wait Time:</span> <strong style={{ color: '#fbbf24' }}>{survivorProcess.waittimeMs} ms</strong></div>
                    <div><span style={{ color: '#64748b' }}>Open Trans:</span> <strong style={{ color: '#38bdf8' }}>{survivorProcess.tranCount ?? 1}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Client App:</span> <strong style={{ color: '#cbd5e1' }}>{survivorProcess.clientapp || 'N/A'}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Host Name:</span> <strong style={{ color: '#cbd5e1' }}>{survivorProcess.hostname || 'N/A'}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Isolation Level:</span> <strong style={{ color: '#a78bfa' }}>{survivorProcess.isolationlevel || 'Read Committed'}</strong></div>
                    <div><span style={{ color: '#64748b' }}>KPID (Thread):</span> <strong style={{ color: '#cbd5e1' }}>{survivorProcess.kpid || 'N/A'}</strong></div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, color: '#38bdf8' }}>Active SQL Statement</span>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '2px 8px', fontSize: '11px' }}
                        onClick={() => handleCopy(survivorProcess.inputbuf, 'survivor_sql')}
                      >
                        {copiedKey === 'survivor_sql' ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                        <span>{copiedKey === 'survivor_sql' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="deadlock-sql-box" style={{ background: '#040711', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px', fontSize: '11px', color: '#e2e8f0', maxHeight: '160px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                      {survivorProcess.inputbuf || 'No statement captured'}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Lock Compatibility & Granularity Matrix */}
      {viewMode === 'matrix' && (
        <div className="glass-panel" style={{ borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Lock size={20} color="#fbbf24" />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#fff', margin: 0 }}>
                Lock Granularity &amp; Compatibility Deep Dive
              </h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                Understanding why 8 KB Page Locks conflict during concurrent bulk inserts, and how to eliminate them.
              </p>
            </div>
          </div>

          {/* Explainer Banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.08) 0%, rgba(15, 23, 42, 0.8) 100%)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '8px',
              padding: '14px 18px',
              marginBottom: '20px',
              fontSize: '12.5px',
              color: '#cbd5e1',
              lineHeight: '1.6',
            }}
          >
            <strong style={{ color: '#fbbf24' }}>Why did EF Core Bulk Inserts deadlock on PAGELOCK?</strong>
            <p style={{ margin: '6px 0 0' }}>
              In SQL Server, tables are stored in <strong>8 KB data pages</strong>. When EF Core batches inserts, SQL Server acquires Intent-Exclusive (<code style={{ color: '#fbbf24' }}>IX</code>) or Exclusive (<code style={{ color: '#f43f5e' }}>X</code>) page locks during space allocation.
              Even if two sessions insert completely different rows with different primary keys, if both sessions allocate space on the same 8 KB page or allocate multiple pages in opposite order, an <strong>Exclusive (X)</strong> lock conflicts with an <strong>Intent-Exclusive (IX)</strong> lock, triggering a deadlock!
            </p>
          </div>

          {/* Lock Compatibility Table */}
          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', marginBottom: '10px' }}>
              SQL Server Lock Compatibility Matrix (Existing Lock vs. Requested Lock)
            </h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: '#090d16', color: '#94a3b8' }}>
                    <th style={{ padding: '8px', border: '1px solid #1e293b', textAlign: 'left' }}>Requested \ Existing</th>
                    <th style={{ padding: '8px', border: '1px solid #1e293b' }}>IS (Intent Shared)</th>
                    <th style={{ padding: '8px', border: '1px solid #1e293b' }}>S (Shared)</th>
                    <th style={{ padding: '8px', border: '1px solid #1e293b' }}>U (Update)</th>
                    <th style={{ padding: '8px', border: '1px solid #1e293b', background: 'rgba(234, 179, 8, 0.15)', color: '#fbbf24' }}>IX (Intent Excl)</th>
                    <th style={{ padding: '8px', border: '1px solid #1e293b', background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e' }}>X (Exclusive)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', fontWeight: 700, textAlign: 'left', color: '#94a3b8' }}>IS</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#34d399' }}>✓ Yes</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#34d399' }}>✓ Yes</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#34d399' }}>✓ Yes</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#34d399' }}>✓ Yes</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#f43f5e' }}>✗ No</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', fontWeight: 700, textAlign: 'left', color: '#94a3b8' }}>S</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#34d399' }}>✓ Yes</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#34d399' }}>✓ Yes</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#34d399' }}>✓ Yes</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#f43f5e' }}>✗ No</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#f43f5e' }}>✗ No</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', fontWeight: 700, textAlign: 'left', color: '#94a3b8' }}>U</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#34d399' }}>✓ Yes</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#34d399' }}>✓ Yes</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#f43f5e' }}>✗ No</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#f43f5e' }}>✗ No</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#f43f5e' }}>✗ No</td>
                  </tr>
                  <tr style={{ background: 'rgba(234, 179, 8, 0.05)' }}>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', fontWeight: 700, textAlign: 'left', color: '#fbbf24' }}>IX</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#34d399' }}>✓ Yes</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#f43f5e' }}>✗ No</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#f43f5e' }}>✗ No</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#34d399' }}>✓ Yes</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#f43f5e', fontWeight: 800, background: 'rgba(244, 63, 94, 0.25)' }}>
                      ✗ CONFLICT (Deadlock!)
                    </td>
                  </tr>
                  <tr style={{ background: 'rgba(244, 63, 94, 0.05)' }}>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', fontWeight: 700, textAlign: 'left', color: '#f43f5e' }}>X</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#f43f5e' }}>✗ No</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#f43f5e' }}>✗ No</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#f43f5e' }}>✗ No</td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#f43f5e', fontWeight: 800, background: 'rgba(244, 63, 94, 0.25)' }}>
                      ✗ CONFLICT (Deadlock!)
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #1e293b', color: '#f43f5e', fontWeight: 800 }}>
                      ✗ CONFLICT
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick DDL Fix to Disable Page Locks */}
          <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <strong style={{ fontSize: '13px', color: '#34d399' }}>
                Instant DDL Solution: Disable Page Locks (Force Row-Level KEYLOCK)
              </strong>
              <button
                className="btn btn-secondary btn-sm"
                style={{ padding: '2px 8px', fontSize: '11px' }}
                onClick={() =>
                  handleCopy(
                    `-- Disable Page Locks on the contested tables:
ALTER INDEX ALL ON [program].[LoanAccountSchedule] SET (ALLOW_PAGE_LOCKS = OFF);
ALTER INDEX ALL ON [program].[LoanTransaction] SET (ALLOW_PAGE_LOCKS = OFF);

-- Verification Query:
SELECT name, type_desc, allow_page_locks, allow_row_locks
FROM sys.indexes
WHERE object_id IN (
    OBJECT_ID('[program].[LoanAccountSchedule]'),
    OBJECT_ID('[program].[LoanTransaction]')
);`,
                    'disable_page_locks_sql'
                  )
                }
              >
                {copiedKey === 'disable_page_locks_sql' ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                <span>{copiedKey === 'disable_page_locks_sql' ? 'Copied DDL' : 'Copy DDL'}</span>
              </button>
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 8px' }}>
              By setting <code style={{ color: '#34d399' }}>ALLOW_PAGE_LOCKS = OFF</code>, SQL Server is forced to use row-level locks (<code style={{ color: '#38bdf8' }}>KEYLOCK</code>) instead of page locks. Sessions inserting different records will never block each other, even when inserting onto the same 8 KB page!
            </p>
            <pre style={{ background: '#040711', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px', fontSize: '11px', color: '#34d399', fontFamily: 'Consolas, monospace', margin: 0 }}>
{`ALTER INDEX ALL ON [program].[LoanAccountSchedule] SET (ALLOW_PAGE_LOCKS = OFF);
ALTER INDEX ALL ON [program].[LoanTransaction] SET (ALLOW_PAGE_LOCKS = OFF);`}
            </pre>
          </div>
        </div>
      )}

      {/* Actionable DBA Deadlock Resolution Guide with Tabs */}
      <div className="section-block">
        <div className="glass-panel" style={{ borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Zap size={18} color="#34d399" />
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#fff', margin: 0 }}>
                Actionable DBA Deadlock Remediation Playbook
              </h3>
            </div>

            {/* Playbook Tabs */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className={`btn btn-sm ${remedyTab === 'efcore' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '2px 10px', fontSize: '11px' }}
                onClick={() => setRemedyTab('efcore')}
              >
                EF Core / .NET (C#)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${remedyTab === 'tsql' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '2px 10px', fontSize: '11px' }}
                onClick={() => setRemedyTab('tsql')}
              >
                T-SQL &amp; DDL
              </button>
              <button
                type="button"
                className={`btn btn-sm ${remedyTab === 'architecture' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '2px 10px', fontSize: '11px' }}
                onClick={() => setRemedyTab('architecture')}
              >
                Architecture &amp; RCSI
              </button>
            </div>
          </div>

          <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6', marginBottom: '16px' }}>
            {activeDeadlock.remedy}
          </p>

          {/* EF Core Tab */}
          {remedyTab === 'efcore' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '13px', color: '#38bdf8' }}>1. EnableRetryOnFailure with Error 1205</strong>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 8px', fontSize: '11px' }}
                    onClick={() =>
                      handleCopy(
                        `builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(connectionString, sqlOptions =>
    {
        sqlOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(30),
            errorNumbersToAdd: new[] { 1205 }); // Error 1205 = Deadlock victim
    }));`,
                        'efcore_retry'
                      )
                    }
                  >
                    {copiedKey === 'efcore_retry' ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                    <span>Copy</span>
                  </button>
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 8px' }}>
                  Configures Entity Framework Core connection resiliency to automatically replay transactions when SQL Server kills a session as a deadlock victim.
                </p>
                <pre className="deadlock-sql-box" style={{ background: '#040711', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px', fontSize: '11px', color: '#38bdf8', fontFamily: 'Consolas, monospace', maxHeight: '140px', overflowY: 'auto' }}>
{`sqlOptions.EnableRetryOnFailure(
    maxRetryCount: 5,
    maxRetryDelay: TimeSpan.FromSeconds(30),
    errorNumbersToAdd: new[] { 1205 }); // 1205 = Deadlock`}
                </pre>
              </div>

              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
                <strong style={{ fontSize: '13px', color: '#34d399', display: 'block', marginBottom: '8px' }}>
                  2. Enforce Deterministic Save Order in EF Core
                </strong>
                <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
                  EF Core batches entities during <code style={{ color: '#38bdf8' }}>SaveChangesAsync()</code> by topological dependency graph. If multiple transactions insert into both <code style={{ color: '#38bdf8' }}>LoanAccountSchedule</code> and <code style={{ color: '#38bdf8' }}>LoanTransaction</code>, ensure the code always creates and adds parent records first, or sort batch items by primary key before bulk saving.
                </p>
              </div>
            </div>
          )}

          {/* T-SQL & DDL Tab */}
          {remedyTab === 'tsql' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '13px', color: '#38bdf8' }}>1. T-SQL Deadlock Retry Pattern</strong>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 8px', fontSize: '11px' }}
                    onClick={() =>
                      handleCopy(
                        `DECLARE @RetryCount INT = 0;
DECLARE @MaxRetries INT = 3;
WHILE @RetryCount < @MaxRetries
BEGIN
    BEGIN TRY
        BEGIN TRANSACTION;
        -- Your business logic here
        COMMIT TRANSACTION;
        BREAK; -- Success
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() = 1205 -- Deadlock error code
        BEGIN
            SET @RetryCount = @RetryCount + 1;
            WAITFOR DELAY '00:00:00.050'; -- Jitter delay
        END
        ELSE
            THROW;
    END CATCH
END;`,
                        'retry_tsql'
                      )
                    }
                  >
                    {copiedKey === 'retry_tsql' ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                    <span>Copy</span>
                  </button>
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 8px' }}>
                  Wrap high-concurrency transactions with error 1205 retry handlers so transient deadlocks resolve seamlessly.
                </p>
                <pre className="deadlock-sql-box" style={{ background: '#040711', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px', fontSize: '11px', color: '#94a3b8', fontFamily: 'Consolas, monospace', maxHeight: '120px', overflowY: 'auto' }}>
{`IF ERROR_NUMBER() = 1205 -- Deadlock
BEGIN
    SET @RetryCount = @RetryCount + 1;
    WAITFOR DELAY '00:00:00.050';
END`}
                </pre>
              </div>

              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
                <strong style={{ fontSize: '13px', color: '#fbbf24', display: 'block', marginBottom: '8px' }}>
                  2. Control Victim Selection with DEADLOCK_PRIORITY
                </strong>
                <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
                  Assign <code style={{ color: '#fbbf24' }}>SET DEADLOCK_PRIORITY HIGH;</code> to user-facing or critical payments, and <code style={{ color: '#94a3b8' }}>SET DEADLOCK_PRIORITY LOW;</code> to background batch or report processing jobs. SQL Server will always terminate the LOW priority session.
                </p>
              </div>
            </div>
          )}

          {/* Architecture & RCSI Tab */}
          {remedyTab === 'architecture' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
                <strong style={{ fontSize: '13px', color: '#a78bfa', display: 'block', marginBottom: '8px' }}>
                  1. Read Committed Snapshot (RCSI)
                </strong>
                <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', margin: '0 0 8px' }}>
                  Enable RCSI (<code style={{ color: '#a78bfa' }}>ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON</code>)
                  to allow readers to read row-versioned copies in TempDB without acquiring shared locks, completely eliminating reader-writer deadlocks.
                </p>
              </div>

              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '8px', padding: '16px' }}>
                <strong style={{ fontSize: '13px', color: '#38bdf8', display: 'block', marginBottom: '8px' }}>
                  2. Chunk Bulk Insert Operations
                </strong>
                <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
                  Avoid running 50,000+ row inserts inside a single open transaction. Chunk records into batches of 1,000 to 5,000 rows. This minimizes the duration lock resources are held and prevents lock escalation to table level.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
