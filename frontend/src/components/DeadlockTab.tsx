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
  Info
} from 'lucide-react';
import {
  DeadlockGraph,
  DeadlockProcess,
  DeadlockResource,
} from '../types/deadlock';
import { SAMPLE_DEADLOCK_XDL, parseDeadlockXML } from '../utils/deadlockParser';
import { toPng, toSvg } from 'html-to-image';

interface DeadlockTabProps {
  initialDeadlocks?: DeadlockGraph[];
  onOpenXdlFile?: () => void;
}

export const DeadlockTab: React.FC<DeadlockTabProps> = ({
  initialDeadlocks,
  onOpenXdlFile,
}) => {
  const [deadlocks, setDeadlocks] = useState<DeadlockGraph[]>(() => {
    if (initialDeadlocks && initialDeadlocks.length > 0) {
      return initialDeadlocks;
    }
    try {
      return parseDeadlockXML(SAMPLE_DEADLOCK_XDL);
    } catch {
      return [];
    }
  });

  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const graphContainerRef = useRef<HTMLDivElement>(null);

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
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        try {
          const parsed = parseDeadlockXML(content);
          setDeadlocks(parsed);
          setActiveIdx(0);
        } catch (err: any) {
          alert(`Failed to parse deadlock file: ${err.message}`);
        }
      }
    };
    reader.readAsText(file);
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
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <ShieldAlert size={48} color="#f43f5e" style={{ margin: '0 auto 16px' }} />
          <h2>No Deadlock Graph Loaded</h2>
          <p style={{ color: '#94a3b8', margin: '8px 0 24px' }}>
            Load a sample SQL Server deadlock report or open a .xdl file to visualize the lock cycle.
          </p>
          <button className="btn btn-primary" onClick={handleLoadSample}>
            Load Sample Deadlock (.xdl)
          </button>
        </div>
      </div>
    );
  }

  const selectedProcess = activeDeadlock.processes.find((p) => p.id === selectedProcessId);
  const selectedResource = activeDeadlock.resources.find((r) => r.id === selectedResourceId);

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
              <span>Sample .xdl</span>
            </button>

            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
              <Upload size={13} color="#a78bfa" />
              <span>Open .xdl</span>
              <input
                type="file"
                accept=".xdl,.xml"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>

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

      {/* Main Interactive Graph & Inspector Split */}
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
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>Interactive Dependency Graph</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#34d399' }}>
                <span style={{ width: '12px', height: '3px', background: '#34d399', borderRadius: '2px' }} />
                Holds Lock (Owner)
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#f43f5e' }}>
                <span style={{ width: '12px', height: '3px', background: '#f43f5e', borderRadius: '2px', borderBottom: '1px dashed #f43f5e' }} />
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
                  transform={`translate(${pos.x - boxW / 2}, ${pos.y - boxH / 2})`}
                  onClick={() => {
                    setSelectedResourceId(r.id);
                    setSelectedProcessId(null);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    width={boxW}
                    height={boxH}
                    rx="8"
                    fill={isSelected ? '#1e293b' : '#0f172a'}
                    stroke={isSelected ? '#38bdf8' : '#334155'}
                    strokeWidth={isSelected ? '2.5' : '1.5'}
                    filter={isSelected ? 'url(#glow-cycle)' : undefined}
                  />
                  <rect
                    x="0"
                    y="0"
                    width={boxW}
                    height="18"
                    rx="8"
                    fill="rgba(56, 189, 248, 0.12)"
                  />
                  <text
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
                    x={boxW / 2}
                    y="47"
                    fill="#94a3b8"
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
                  transform={`translate(${pos.x - boxW / 2}, ${pos.y - boxH / 2})`}
                  onClick={() => {
                    setSelectedProcessId(p.id);
                    setSelectedResourceId(null);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    width={boxW}
                    height={boxH}
                    rx="10"
                    fill={isVictim ? 'rgba(244, 63, 94, 0.16)' : isSelected ? '#1e293b' : '#0f172a'}
                    stroke={isVictim ? '#f43f5e' : isSelected ? '#38bdf8' : '#475569'}
                    strokeWidth={isSelected || isVictim ? '2.5' : '1.5'}
                    strokeDasharray={isVictim ? 'none' : undefined}
                    filter={isVictim ? 'url(#glow-cycle)' : undefined}
                  />
                  {/* Top Pill / Badge */}
                  <rect
                    x="0"
                    y="0"
                    width={boxW}
                    height="20"
                    rx="10"
                    fill={isVictim ? 'rgba(244, 63, 94, 0.35)' : 'rgba(56, 189, 248, 0.15)'}
                  />
                  <text
                    x={boxW / 2}
                    y="14"
                    fill={isVictim ? '#fda4af' : '#38bdf8'}
                    fontSize="10"
                    fontWeight="800"
                    textAnchor="middle"
                  >
                    {isVictim ? '💀 VICTIM (SPID ' + p.spid + ')' : 'SPID #' + p.spid + ' (' + (p.status || 'Active') + ')'}
                  </text>
                  <text
                    x={boxW / 2}
                    y="36"
                    fill="#fff"
                    fontSize="11.5"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {p.clientapp || p.loginname || 'Process'}
                  </text>
                  <text
                    x={boxW / 2}
                    y="53"
                    fill="#94a3b8"
                    fontSize="9.5"
                    textAnchor="middle"
                  >
                    Host: {p.hostname || 'Unknown'} • Wait: {p.waittimeMs}ms
                  </text>
                </g>
              );
            })}
          </svg>

          <div style={{ marginTop: 'auto', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
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
                  <span style={{ color: '#64748b' }}>Associated Object ID / HoBT:</span>{' '}
                  <code style={{ color: '#94a3b8', fontSize: '11px' }}>{selectedResource.associatedObjectId || 'N/A'}</code>
                </div>
              </div>

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

      {/* Actionable DBA Deadlock Resolution Guide */}
      <div className="section-block">
        <div className="glass-panel" style={{ borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <Zap size={18} color="#34d399" />
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#fff', margin: 0 }}>
              Actionable DBA Deadlock Remediation Playbook
            </h3>
          </div>

          <p style={{ fontSize: '13.5px', color: '#cbd5e1', lineHeight: '1.6', marginBottom: '16px' }}>
            {activeDeadlock.remedy}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            {/* Pattern 1: Retry Logic with Error 1205 */}
            <div
              style={{
                background: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '16px',
              }}
            >
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
              <pre
                style={{
                  background: '#040711',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '11px',
                  color: '#94a3b8',
                  fontFamily: 'Consolas, monospace',
                  maxHeight: '120px',
                  overflowY: 'auto',
                }}
              >
{`IF ERROR_NUMBER() = 1205 -- Deadlock
BEGIN
    SET @RetryCount = @RetryCount + 1;
    WAITFOR DELAY '00:00:00.050';
END`}
              </pre>
            </div>

            {/* Pattern 2: Enforce Sequential Access Order */}
            <div
              style={{
                background: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <strong style={{ fontSize: '13px', color: '#34d399', display: 'block', marginBottom: '8px' }}>
                2. Enforce Strict Access Hierarchy
              </strong>
              <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
                Always lock parent/header entities prior to child/detail entities across all endpoints.
                If Stored Procedure A updates <code style={{ color: '#38bdf8' }}>Orders</code> then <code style={{ color: '#38bdf8' }}>Inventory</code>,
                Stored Procedure B must never update <code style={{ color: '#38bdf8' }}>Inventory</code> then <code style={{ color: '#38bdf8' }}>Orders</code>.
              </p>
            </div>

            {/* Pattern 3: Covering Indexes & Snapshot Isolation */}
            <div
              style={{
                background: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: '16px',
              }}
            >
              <strong style={{ fontSize: '13px', color: '#a78bfa', display: 'block', marginBottom: '8px' }}>
                3. Read Committed Snapshot (RCSI)
              </strong>
              <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
                Enable RCSI (<code style={{ color: '#a78bfa' }}>ALTER DATABASE [SalesDB] SET READ_COMMITTED_SNAPSHOT ON</code>)
                to allow readers to read row-versioned copies in TempDB without acquiring shared locks, completely eliminating reader-writer deadlocks.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
