import React, { useState, useEffect, useRef } from 'react';
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
  KeyRound
} from 'lucide-react';
import {
  ActiveSession,
  QueryStoreEntry,
  LiveDeadlockReport,
  ServerVitals,
  ConnectionStatus
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

export const LiveRadarTab: React.FC<LiveRadarTabProps> = ({
  status,
  onOpenConnectModal,
  onLoadPlanXML,
  onLoadDeadlockXML,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'sessions' | 'querystore' | 'deadlocks' | 'vitals'>('sessions');
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [queryStoreEntries, setQueryStoreEntries] = useState<QueryStoreEntry[]>([]);
  const [deadlocks, setDeadlocks] = useState<LiveDeadlockReport[]>([]);
  const [vitals, setVitals] = useState<ServerVitals | null>(null);

  const [qsOrderBy, setQsOrderBy] = useState<'cpu' | 'duration' | 'reads' | 'spills'>('cpu');
  const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [selectedPlanLoading, setSelectedPlanLoading] = useState<string | null>(null);
  const [selectedSpid, setSelectedSpid] = useState<number | null>(null);

  const timerRef = useRef<any>(null);

  const isConnected = status && status.connected;

  // Fetch data
  const fetchData = async () => {
    if (!isConnected) return;
    setIsLoading(true);
    try {
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.GetLiveActiveSessions) {
        if (activeSubTab === 'sessions') {
          const res = await GetLiveActiveSessions();
          setSessions(res || []);
        } else if (activeSubTab === 'querystore') {
          const qs = await GetLiveQueryStore(qsOrderBy, 15);
          setQueryStoreEntries(qs || []);
        } else if (activeSubTab === 'deadlocks') {
          const dls = await GetLiveDeadlocks(10);
          setDeadlocks(dls || []);
        } else if (activeSubTab === 'vitals') {
          const v = await GetLiveServerVitals();
          setVitals(v);
        }
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch live data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Visibility state handling & auto-refresh interval
  useEffect(() => {
    fetchData();

    if (!isAutoRefresh || !isConnected) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const interval = activeSubTab === 'sessions' ? 2500 : 5000;
    timerRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isConnected, isAutoRefresh, activeSubTab, qsOrderBy]);

  // Handle Inspect Live Plan
  const handleInspectPlan = async (session: ActiveSession) => {
    if (!session.planHandle && !session.spid) {
      alert('This query does not have a cached plan handle or active SPID available in memory.');
      return;
    }
    const targetKey = `${session.spid}:${session.planHandle || ''}`;
    setSelectedPlanLoading(session.planHandle || `${session.spid}`);
    try {
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.GetLiveSessionPlan) {
        const xml = await GetLiveSessionPlan(targetKey);
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
            harvest top Query Store bottlenecks, and stream live deadlocks directly from memory.
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

  const blockedCount = sessions.filter((s) => s.blockingSpid > 0).length;

  return (
    <div className="tab-scroll-container">
      {/* Top Live Control Ribbon */}
      <div
        className="glass-panel"
        style={{
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          borderRadius: '10px',
        }}
      >
        {/* Left: Instance info & Sub-tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#f1f5f9' }}>
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
                  fontSize: '10px',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'rgba(244, 63, 94, 0.15)',
                  color: '#f43f5e',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                }}
              >
                Demo
              </span>
            )}
          </div>

          <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.1)' }} />

          {/* Sub Navigation Segmented Control */}
          <div className="radar-subnav-bar">
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

            <button
              type="button"
              className={`radar-subnav-btn ${activeSubTab === 'querystore' ? 'active active-querystore' : ''}`}
              onClick={() => setActiveSubTab('querystore')}
              title="Query Store top CPU/Duration/IO bottlenecks"
            >
              <TrendingUp size={12} className="radar-subnav-icon" />
              <span>Query Store Top Bottlenecks</span>
            </button>

            <button
              type="button"
              className={`radar-subnav-btn ${activeSubTab === 'deadlocks' ? 'active active-deadlocks' : ''}`}
              onClick={() => setActiveSubTab('deadlocks')}
              title="Recent deadlocks captured by system_health XE ring buffer"
            >
              <ShieldAlert size={12} className="radar-subnav-icon" />
              <span>Live Deadlocks</span>
            </button>

            <button
              type="button"
              className={`radar-subnav-btn ${activeSubTab === 'vitals' ? 'active active-vitals' : ''}`}
              onClick={() => setActiveSubTab('vitals')}
              title="CPU, Buffer Cache Hit Ratio, PLE, Compilation Rates"
            >
              <Cpu size={12} className="radar-subnav-icon" />
              <span>Server Vitals</span>
            </button>
          </div>
        </div>

        {/* Right: Auto-Refresh Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            Updated: {lastUpdated.toLocaleTimeString()}
          </span>

          <button
            type="button"
            className="btn btn-secondary btn-sm radar-ctrl-btn"
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            title={isAutoRefresh ? 'Pause polling' : 'Resume 3-second live polling'}
          >
            {isAutoRefresh ? (
              <>
                <Pause size={11} color="#fbbf24" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play size={11} color="#34d399" />
                <span>Auto-Refresh</span>
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
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: Active Sessions */}
      {activeSubTab === 'sessions' && (
        <div className="section-block">
          {sessions.length === 0 ? (
            <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', borderRadius: '10px' }}>
              <CheckCircle2 size={32} color="#34d399" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '15px', color: '#e2e8f0', margin: '0 0 6px' }}>
                Zero User Requests Currently Active
              </h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                The SQL Server engine is currently idle. When client queries or ETL jobs execute, they will appear here in real-time.
              </p>
            </div>
          ) : (
            <div className="glass-panel" style={{ borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>SPID</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Elapsed</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Wait Type</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>CPU / Reads</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Program / Host</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Query Preview</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const isBlocked = s.blockingSpid > 0;
                    return (
                      <tr
                        key={s.spid}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          background: isBlocked ? 'rgba(244, 63, 94, 0.06)' : 'transparent',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        {/* SPID */}
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: isBlocked ? '#f43f5e' : '#38bdf8' }}>
                          #{s.spid}
                        </td>

                        {/* Status */}
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
                            }}
                          >
                            {isBlocked ? `BLOCKED BY #${s.blockingSpid}` : s.status}
                          </span>
                        </td>

                        {/* Elapsed Duration */}
                        <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={11} color="#94a3b8" />
                            {(s.totalElapsedTimeMs / 1000).toFixed(1)}s
                          </span>
                        </td>

                        {/* Wait Type */}
                        <td style={{ padding: '10px 12px' }}>
                          {s.waitType ? (
                            <div>
                              <span style={{ color: '#fbbf24', fontWeight: 600 }}>{s.waitType}</span>
                              <div style={{ fontSize: '10px', color: '#64748b' }}>{(s.waitTimeMs / 1000).toFixed(1)}s wait</div>
                            </div>
                          ) : (
                            <span style={{ color: '#64748b' }}>None (Active CPU)</span>
                          )}
                        </td>

                        {/* CPU / Reads */}
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ color: '#cbd5e1' }}>{(s.cpuTimeMs / 1000).toFixed(1)}s CPU</div>
                          <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                            {s.logicalReads.toLocaleString()} reads • {s.grantedMemoryMb.toFixed(0)}MB
                          </div>
                        </td>

                        {/* Program / Host */}
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ color: '#e2e8f0', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.programName || 'SQL Client'}
                          </div>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>
                            {s.loginName} @ {s.hostName}
                          </div>
                        </td>

                        {/* Query Preview */}
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
                            title={s.queryText}
                          >
                            {s.queryText || 'Query text unavailable'}
                          </div>
                        </td>

                        {/* Action: Inspect Plan */}
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleInspectPlan(s)}
                            disabled={selectedPlanLoading === s.planHandle}
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                            title="Inspect currently executing ShowPlan XML in PlanIQ visualizer"
                          >
                            {selectedPlanLoading === s.planHandle ? (
                              <RefreshCw size={11} className="spin" />
                            ) : (
                              <Eye size={11} color="#38bdf8" />
                            )}
                            <span>Inspect Plan</span>
                          </button>
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

      {/* SUB-TAB 2: Query Store Top Bottlenecks */}
      {activeSubTab === 'querystore' && (
        <div className="section-block">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
              Top Queries Harvested from `sys.query_store_runtime_stats` (Last 24 Hours)
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['cpu', 'duration', 'reads', 'spills'] as const).map((metric) => (
                <button
                  key={metric}
                  type="button"
                  className={`btn btn-sm ${qsOrderBy === metric ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setQsOrderBy(metric)}
                  style={{ textTransform: 'uppercase', fontSize: '10.5px' }}
                >
                  {metric}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-panel" style={{ borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Query / Plan ID</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Executions</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Total CPU</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Avg Duration</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Total Reads</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Spills</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8' }}>Query Text</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#94a3b8' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {queryStoreEntries.map((e) => (
                  <tr key={`${e.queryId}-${e.planId}`} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '10px 12px', color: '#38bdf8', fontWeight: 600 }}>
                      Q#{e.queryId} <span style={{ color: '#64748b' }}>/ P#{e.planId}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                      {e.executionCount.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#f43f5e', fontWeight: 600 }}>
                      {(e.totalCpuMs / 1000).toFixed(1)}s
                    </td>
                    <td style={{ padding: '10px 12px', color: '#fbbf24' }}>
                      {e.avgDurationMs.toFixed(1)}ms
                    </td>
                    <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                      {e.totalLogicalReads.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {e.totalSpillsMb > 0 ? (
                        <span style={{ color: '#f43f5e', fontWeight: 600 }}>{e.totalSpillsMb.toFixed(1)}MB</span>
                      ) : (
                        <span style={{ color: '#64748b' }}>0 MB</span>
                      )}
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
                        }}
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

      {/* SUB-TAB 3: Live Deadlocks */}
      {activeSubTab === 'deadlocks' && (
        <div className="section-block">
          <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
              Recent Deadlocks from `system_health` Extended Events Buffer
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={fetchData} disabled={isLoading}>
              <RefreshCw size={11} className={isLoading ? 'spin' : ''} />
              <span>Poll Buffer</span>
            </button>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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

      {/* SUB-TAB 4: Server Vitals */}
      {activeSubTab === 'vitals' && (
        <div className="section-block">
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
                Runnable tasks waiting for CPU slice. Signal wait: {vitals?.signalWaitPct.toFixed(1) ?? 0}%
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
                {(vitals?.tempDbUserObjectsMb ?? 0).toFixed(0)} MB
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                User #temp tables: {(vitals?.tempDbUserObjectsMb ?? 0).toFixed(0)} MB • Hash/Sort spills: {(vitals?.tempDbInternalMb ?? 0).toFixed(0)} MB
              </p>
            </div>

            {/* Batch Requests */}
            <div className="glass-panel" style={{ padding: '16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#94a3b8', fontSize: '12px' }}>
                <TrendingUp size={16} color="#34d399" />
                <span>Batch Requests / Sec</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#34d399' }}>
                {vitals?.batchRequestsPerSec.toLocaleString() ?? '1,420'}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#64748b' }}>
                SQL Server throughput performance counter.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
