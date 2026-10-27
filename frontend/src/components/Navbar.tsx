import React, { useState, useRef, useEffect } from 'react';
import {
  Database,
  FileCode2,
  Sparkles,
  Upload,
  GitCompare,
  Download,
  AlertTriangle,
  Layers,
  Activity,
  Settings,
  KeyRound,
  LayoutDashboard,
  GitFork,
  Zap,
  Code2,
  ChevronDown,
  Check,
  Wrench,
  Clock,
  BookOpen,
  TrendingUp,
  ShieldAlert,
  User,
  Server,
  HardDrive,
  Star,
  Plus,
} from 'lucide-react';
import { PlanAnalysis } from '../types/plan';
import { ConnectionStatus, WindowsUserInfo, DBConnectionProfile } from '../types/livedb';
import { GetSavedDBConnections, ConnectLiveDB } from '../../wailsjs/go/main/App';

interface NavbarProps {
  plan: PlanAnalysis | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenFile: () => void;
  onOpenPasteModal: () => void;
  onLoadSample: () => void;
  onOpenSettings: () => void;
  onOpenLiveModal: () => void;
  liveStatus: ConnectionStatus | null;
  windowsUser?: WindowsUserInfo | null;
  onExportReport?: () => void;
  isLoading: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  plan,
  activeTab,
  setActiveTab,
  onOpenFile,
  onOpenPasteModal,
  onLoadSample,
  onOpenSettings,
  onOpenLiveModal,
  liveStatus,
  windowsUser,
  onExportReport,
  isLoading,
}) => {
  const [openMenu, setOpenMenu] = useState<'diagnostics' | 'optimization' | null>(null);
  const [isConnDropdownOpen, setIsConnDropdownOpen] = useState<boolean>(false);
  const [savedProfiles, setSavedProfiles] = useState<DBConnectionProfile[]>([]);
  const timerRef = useRef<any>(null);
  const diagRef = useRef<HTMLDivElement>(null);
  const optRef = useRef<HTMLDivElement>(null);
  const connDropdownRef = useRef<HTMLDivElement>(null);

  const refreshSavedProfiles = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.GetSavedDBConnections) {
        const list = await GetSavedDBConnections();
        if (Array.isArray(list)) {
          setSavedProfiles(list);
        }
      }
    } catch (e) {
      console.warn('Navbar: failed to load saved connections:', e);
    }
  };

  useEffect(() => {
    refreshSavedProfiles();
  }, [liveStatus]);

  const handleQuickConnect = async (p: DBConnectionProfile) => {
    setIsConnDropdownOpen(false);
    try {
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.ConnectLiveDB) {
        await ConnectLiveDB({
          server: p.server,
          port: Number(p.port) || 1433,
          database: p.database,
          authType: p.authType,
          username: p.username,
          password: p.password,
          encrypt: p.encrypt,
          trustServerCertificate: p.trustServerCertificate,
          applicationIntent: p.applicationIntent,
          timeoutSeconds: Number(p.timeoutSeconds) || 4,
        } as any);
        setActiveTab('liveradar');
      }
    } catch (err) {
      console.error('Quick connect failed:', err);
      onOpenLiveModal();
    }
  };

  const isDiagnosticsActive =
    activeTab === 'overview' ||
    activeTab === 'visualizer' ||
    activeTab === 'batchflow' ||
    activeTab === 'waitstats';
  const isOptimizationActive =
    activeTab === 'indexes' ||
    activeTab === 'advisor' ||
    activeTab === 'comparator';
  const isPlaybookActive = activeTab === 'playbook';
  const isDeadlockActive = activeTab === 'deadlock';

  const formatMaxDop = (reason?: string) => {
    if (!reason) return null;
    if (reason === 'MaxDOPSetToOne') return 'MaxDOP = 1 (Serial)';
    if (reason === 'NoParallelismPlans') return 'Serial Plan';
    return reason;
  };

  const verdict = plan?.executiveVerdict;

  const handleMenuEnter = (menu: 'diagnostics' | 'optimization') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpenMenu(menu);
  };

  const handleMenuLeave = () => {
    timerRef.current = setTimeout(() => {
      setOpenMenu(null);
    }, 220);
  };

  const handleSelectTab = (tab: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setActiveTab(tab);
    setOpenMenu(null);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (diagRef.current && diagRef.current.contains(target)) return;
      if (optRef.current && optRef.current.contains(target)) return;
      if (connDropdownRef.current && connDropdownRef.current.contains(target)) return;
      setOpenMenu(null);
      setIsConnDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="navbar-wrapper">
      {/* TIER 1: Main Top Header Bar (50px height) */}
      <div className="navbar-top-tier">
        {/* Left: Brand Identity */}
        <div className="brand-section">
          <div className="logo-badge" title="PlanIQ - High-Performance SQL Server Execution Plan Analyzer">
            <Database size={16} color="#38bdf8" />
          </div>
          <div className="brand-info-wrap">
            <div className="brand-title-row">
              <span className="brand-title">PlanIQ</span>
              <span className="brand-version-pill">v2.0 Desktop</span>
              {windowsUser?.username && (
                <div
                  className="brand-user-pill"
                  title={`Windows User: ${windowsUser.fullAccount || windowsUser.username}${windowsUser.domain ? ` | Domain: ${windowsUser.domain}` : ''}`}
                >
                  <User size={11} className="brand-user-icon" />
                  <span className="brand-username-text">{windowsUser.username}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Action Buttons Group (In Same Top Row, Clean & Uncluttered) */}
        <div className="actions-section">
          <div className="actions-group">
            <button
              type="button"
              className="btn btn-primary btn-sm top-action-btn"
              onClick={onOpenFile}
              disabled={isLoading}
              title="Open .sqlplan or .xml from disk"
            >
              <Upload size={12} />
              <span>Open File</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm top-action-btn"
              onClick={onOpenPasteModal}
              disabled={isLoading}
              title="Paste ShowPlan XML or Deadlock XML"
            >
              <Code2 size={12} />
              <span>Paste XML</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm top-action-btn"
              onClick={onLoadSample}
              disabled={isLoading}
              title="Load demo sample execution plan"
            >
              <FileCode2 size={12} />
              <span>Sample Plan</span>
            </button>
          </div>

          <div className="nav-vertical-divider" />

          <div className="actions-group">
            {plan && onExportReport && (
              <button
                type="button"
                className="btn btn-secondary btn-sm top-action-btn"
                onClick={onExportReport}
                title="Export diagnostic report as standalone HTML"
              >
                <Download size={12} color="#34d399" />
                <span>Export Report</span>
              </button>
            )}

            <div className="live-conn-dropdown-wrap" ref={connDropdownRef}>
              {liveStatus && liveStatus.connected ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm top-action-btn live-conn-btn"
                  onClick={() => {
                    setIsConnDropdownOpen(!isConnDropdownOpen);
                    refreshSavedProfiles();
                  }}
                  title={`Connected to ${liveStatus.serverName} (${liveStatus.databaseName}) - Click to switch saved connection`}
                >
                  <span className="live-status-dot" />
                  <span className="live-server-name">{liveStatus.serverName.split('.')[0]}</span>
                  <span className="live-db-name">({liveStatus.databaseName})</span>
                  <ChevronDown size={11} className={`conn-dropdown-chevron ${isConnDropdownOpen ? 'open' : ''}`} />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm top-action-btn"
                  onClick={() => {
                    setIsConnDropdownOpen(!isConnDropdownOpen);
                    refreshSavedProfiles();
                  }}
                  title="Connect to SQL Server or select saved connection"
                >
                  <Zap size={12} color="#38bdf8" />
                  <span>Connect DB</span>
                  <ChevronDown size={11} className={`conn-dropdown-chevron ${isConnDropdownOpen ? 'open' : ''}`} />
                </button>
              )}

              {isConnDropdownOpen && (
                <div className="nav-conn-flyout glass-panel">
                  <div className="nav-conn-flyout-header">
                    <div className="nav-conn-flyout-title">
                      <HardDrive size={13} color="#34d399" />
                      <span>Saved SQL Connections</span>
                      <span className="nav-conn-count-pill">{savedProfiles.length}</span>
                    </div>
                    <button
                      type="button"
                      className="nav-conn-new-btn"
                      onClick={() => {
                        setIsConnDropdownOpen(false);
                        setActiveTab('connections');
                      }}
                      title="Create new profile in SQLite Studio"
                    >
                      <Plus size={11} />
                      <span>New</span>
                    </button>
                  </div>

                  <div className="nav-conn-flyout-list">
                    {savedProfiles.length === 0 ? (
                      <div className="nav-conn-empty">
                        <span>No saved profiles found.</span>
                        <button
                          type="button"
                          className="btn btn-primary btn-xs"
                          onClick={() => {
                            setIsConnDropdownOpen(false);
                            setActiveTab('connections');
                          }}
                        >
                          Create Connection
                        </button>
                      </div>
                    ) : (
                      savedProfiles.map((p) => {
                        const isActive =
                          liveStatus?.connected &&
                          (liveStatus.serverName.toLowerCase().includes(p.server.toLowerCase()) ||
                            p.server.toLowerCase().includes(liveStatus.serverName.toLowerCase())) &&
                          liveStatus.databaseName.toLowerCase() === p.database.toLowerCase();

                        return (
                          <div
                            key={p.id}
                            className={`nav-conn-flyout-item ${isActive ? 'is-active-item' : ''}`}
                            onClick={() => handleQuickConnect(p)}
                          >
                            <div className="nav-conn-item-left">
                              <div className="nav-conn-item-title-row">
                                <span className="nav-conn-item-name">{p.name}</span>
                                {p.isDefault && <Star size={10} fill="#f59e0b" color="#f59e0b" />}
                                {isActive && <span className="nav-conn-active-badge">ACTIVE</span>}
                              </div>
                              <span className="nav-conn-item-sub">
                                {p.server}:{p.port || 1433} / {p.database}
                              </span>
                            </div>

                            <button
                              type="button"
                              className="btn btn-primary btn-xs nav-conn-quick-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickConnect(p);
                              }}
                            >
                              <Zap size={10} />
                              <span>{isActive ? 'Active' : 'Connect'}</span>
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="nav-conn-flyout-footer">
                    <button
                      type="button"
                      className="nav-conn-footer-link"
                      onClick={() => {
                        setIsConnDropdownOpen(false);
                        setActiveTab('connections');
                      }}
                    >
                      <Server size={12} color="#38bdf8" />
                      <span>Connections Studio...</span>
                    </button>
                    <button
                      type="button"
                      className="nav-conn-footer-link"
                      onClick={() => {
                        setIsConnDropdownOpen(false);
                        onOpenLiveModal();
                      }}
                    >
                      <span>Custom Dialog</span>
                    </button>
                  </div>
                </div>
              )}
            </div>


            <button
              type="button"
              className="btn btn-secondary btn-sm top-action-btn"
              onClick={onOpenSettings}
              title="Configure AI API Key (Gemini, OpenAI, Ollama) and Settings"
            >
              <Settings size={12} color="#38bdf8" />
              <span>AI Settings</span>
            </button>
          </div>
        </div>
      </div>

      {/* TIER 2: Active Plan Telemetry Bar (NEW DEDICATED COMPACT ROW - 28px, shown when plan is loaded!) */}
      {plan && (
        <div className="navbar-plan-context-tier">
          <div className="plan-context-left">
            <span className="plan-meta-pill plan-name-pill" title={`File: ${plan.planName}`}>
              <FileCode2 size={11} color="#38bdf8" />
              <span className="plan-name">{plan.planName}</span>
            </span>
            <span className="plan-meta-pill" title="Total Statements in Plan">
              <Layers size={11} color="#818cf8" />
              <span>{plan.totalStatements} Stmts</span>
            </span>
            <span className="plan-meta-pill" title="Total Accumulated Subtree Cost">
              <Activity size={11} color="#34d399" />
              <span>Cost: {plan.totalSubTreeCost.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
            </span>
            {plan.maxDopReason && (
              <span
                className="plan-meta-pill warning-pill"
                title="Query execution is constrained to a single thread by server or resource governor setting"
              >
                <AlertTriangle size={11} color="#fbbf24" />
                <span>{formatMaxDop(plan.maxDopReason)}</span>
              </span>
            )}
          </div>

          <div className="plan-context-right">
            {verdict && (
              <div
                className="ribbon-verdict-pill"
                onClick={(e) => handleSelectTab('overview', e)}
                title={`Executive Bottleneck: Stmt #${verdict.culpritStatementId} accounts for ${verdict.costPercentage}% of batch cost`}
              >
                <Zap size={11} color="#f43f5e" />
                <span>Culprit: Stmt #{verdict.culpritStatementId} ({verdict.costPercentage}% Cost)</span>
              </div>
            )}
            {plan?.diagnostics && (
              <div
                className={`ribbon-grade-pill grade-${(plan.diagnostics.scoreGrade || 'c').toLowerCase()}`}
                title="Overall execution plan health grade based on XML diagnostics"
              >
                <span>Health: {plan.diagnostics.healthScore}/100</span>
                <strong className="grade-letter">[{plan.diagnostics.scoreGrade || 'C'}]</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TIER 3: Workspace Categorized Navigation Ribbon Bar */}
      <div className="navbar-ribbon-tier">
        {/* Left: Category Dropdown Controls */}
        <div className="ribbon-categories">
          {/* Category Dropdown 1: Diagnostics & Architecture */}
          <div
            ref={diagRef}
            className="nav-dropdown-item-wrap"
            onMouseEnter={() => handleMenuEnter('diagnostics')}
            onMouseLeave={handleMenuLeave}
          >
            <button
              type="button"
              className={`nav-category-btn ${isDiagnosticsActive ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!isDiagnosticsActive) {
                  handleSelectTab('overview', e);
                } else {
                  setOpenMenu(openMenu === 'diagnostics' ? null : 'diagnostics');
                }
              }}
            >
              <LayoutDashboard size={14} color={isDiagnosticsActive ? '#38bdf8' : '#94a3b8'} />
              <span className="category-title">Diagnostics & Architecture</span>
              {isDiagnosticsActive && (
                <span className="category-active-hint">
                  {activeTab === 'overview'
                    ? 'Overview'
                    : activeTab === 'visualizer'
                    ? 'Plan Tree'
                    : activeTab === 'batchflow'
                    ? 'Batch Flow'
                    : 'Wait Stats'}
                </span>
              )}
              <ChevronDown size={13} className={`chevron-icon ${openMenu === 'diagnostics' ? 'open' : ''}`} />
            </button>

            {openMenu === 'diagnostics' && (
              <div
                className="nav-dropdown-flyout glass-panel"
                onMouseEnter={() => {
                  if (timerRef.current) clearTimeout(timerRef.current);
                }}
                onMouseLeave={handleMenuLeave}
              >
                <div className="dropdown-flyout-header">
                  <span className="flyout-section-title">Query Architecture & Health</span>
                </div>

                <button
                  type="button"
                  className={`flyout-item ${activeTab === 'overview' ? 'active' : ''}`}
                  onClick={(e) => handleSelectTab('overview', e)}
                >
                  <div className="flyout-item-icon-box cyan-box">
                    <Activity size={16} color="#38bdf8" />
                  </div>
                  <div className="flyout-item-text">
                    <div className="flyout-item-headline">
                      <span className="flyout-title">Overview & Diagnostics</span>
                      <span className="flyout-badge cyan-badge">13 Detectors</span>
                    </div>
                    <span className="flyout-desc">
                      10-Second root cause verdict, wait statistics, and engine health scorecard
                    </span>
                  </div>
                  {activeTab === 'overview' && <Check size={14} color="#38bdf8" className="flyout-check" />}
                </button>

                <button
                  type="button"
                  className={`flyout-item ${activeTab === 'visualizer' ? 'active' : ''}`}
                  onClick={(e) => handleSelectTab('visualizer', e)}
                >
                  <div className="flyout-item-icon-box indigo-box">
                    <GitFork size={16} color="#818cf8" />
                  </div>
                  <div className="flyout-item-text">
                    <div className="flyout-item-headline">
                      <span className="flyout-title">Plan Tree Visualizer</span>
                      <span className="flyout-badge indigo-badge">{plan ? `${plan.totalStatements} Blocks` : 'Visual'}</span>
                    </div>
                    <span className="flyout-desc">
                      Interactive graphical operator tree with cardinality skews and pipeline cost flows
                    </span>
                  </div>
                  {activeTab === 'visualizer' && <Check size={14} color="#818cf8" className="flyout-check" />}
                </button>

                <button
                  type="button"
                  className={`flyout-item ${activeTab === 'batchflow' ? 'active' : ''}`}
                  onClick={(e) => handleSelectTab('batchflow', e)}
                >
                  <div className="flyout-item-icon-box sky-box">
                    <TrendingUp size={16} color="#38bdf8" />
                  </div>
                  <div className="flyout-item-text">
                    <div className="flyout-item-headline">
                      <span className="flyout-title">Batch Flow & TempDB</span>
                      <span className="flyout-badge sky-badge">Timeline</span>
                    </div>
                    <span className="flyout-desc">
                      Sequential statement execution waterfall, cumulative subtree cost progression, and TempDB physical usage
                    </span>
                  </div>
                  {activeTab === 'batchflow' && <Check size={14} color="#38bdf8" className="flyout-check" />}
                </button>

                <button
                  type="button"
                  className={`flyout-item ${activeTab === 'waitstats' ? 'active' : ''}`}
                  onClick={(e) => handleSelectTab('waitstats', e)}
                >
                  <div className="flyout-item-icon-box amber-box">
                    <Clock size={16} color="#fbbf24" />
                  </div>
                  <div className="flyout-item-text">
                    <div className="flyout-item-headline">
                      <span className="flyout-title">Wait Statistics</span>
                      <span className="flyout-badge amber-badge">
                        {plan && (plan.waitStats || []).length > 0 ? `${(plan.waitStats || []).length} Waits` : 'Deep-Dive'}
                      </span>
                    </div>
                    <span className="flyout-desc">
                      Physical engine wait events (Disk I/O, Parallelism, Memory Grants, Schedulers) and DBA remedies
                    </span>
                  </div>
                  {activeTab === 'waitstats' && <Check size={14} color="#fbbf24" className="flyout-check" />}
                </button>
              </div>
            )}
          </div>

          {/* Category Dropdown 2: Optimization & Tuning */}
          <div
            ref={optRef}
            className="nav-dropdown-item-wrap"
            onMouseEnter={() => handleMenuEnter('optimization')}
            onMouseLeave={handleMenuLeave}
          >
            <button
              type="button"
              className={`nav-category-btn ${isOptimizationActive ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!isOptimizationActive) {
                  handleSelectTab('indexes', e);
                } else {
                  setOpenMenu(openMenu === 'optimization' ? null : 'optimization');
                }
              }}
            >
              <Wrench size={14} color={isOptimizationActive ? '#c084fc' : '#94a3b8'} />
              <span className="category-title">Optimization & Tuning</span>
              {isOptimizationActive && (
                <span className="category-active-hint">
                  {activeTab === 'indexes' ? 'Indexes' : activeTab === 'advisor' ? 'AI Doctor' : 'Comparator'}
                </span>
              )}
              <ChevronDown size={13} className={`chevron-icon ${openMenu === 'optimization' ? 'open' : ''}`} />
            </button>

            {openMenu === 'optimization' && (
              <div
                className="nav-dropdown-flyout glass-panel"
                onMouseEnter={() => {
                  if (timerRef.current) clearTimeout(timerRef.current);
                }}
                onMouseLeave={handleMenuLeave}
              >
                <div className="dropdown-flyout-header">
                  <span className="flyout-section-title">Query & Index Tuning Tools</span>
                </div>

                <button
                  type="button"
                  className={`flyout-item ${activeTab === 'indexes' ? 'active' : ''}`}
                  onClick={(e) => handleSelectTab('indexes', e)}
                >
                  <div className="flyout-item-icon-box emerald-box">
                    <KeyRound size={16} color="#34d399" />
                  </div>
                  <div className="flyout-item-text">
                    <div className="flyout-item-headline">
                      <span className="flyout-title">Missing Indexes</span>
                      <span className="flyout-badge emerald-badge">
                        {plan ? `${(plan.allMissingIndexes || []).length} Suggestions` : 'Suggestions'}
                      </span>
                    </div>
                    <span className="flyout-desc">
                      Smart consolidated composite indexes to eliminate write penalties & raw hints
                    </span>
                  </div>
                  {activeTab === 'indexes' && <Check size={14} color="#34d399" className="flyout-check" />}
                </button>

                <button
                  type="button"
                  className={`flyout-item ${activeTab === 'advisor' ? 'active' : ''}`}
                  onClick={(e) => handleSelectTab('advisor', e)}
                >
                  <div className="flyout-item-icon-box purple-box">
                    <Sparkles size={16} color="#c084fc" />
                  </div>
                  <div className="flyout-item-text">
                    <div className="flyout-item-headline">
                      <span className="flyout-title">AI Performance Doctor</span>
                      <span className="flyout-badge purple-badge">AI Copilot</span>
                    </div>
                    <span className="flyout-desc">
                      Automated T-SQL rewrites, Monaco side-by-side diff editor & hint advisor
                    </span>
                  </div>
                  {activeTab === 'advisor' && <Check size={14} color="#c084fc" className="flyout-check" />}
                </button>

                <button
                  type="button"
                  className={`flyout-item ${activeTab === 'comparator' ? 'active' : ''}`}
                  onClick={(e) => handleSelectTab('comparator', e)}
                >
                  <div className="flyout-item-icon-box sky-box">
                    <GitCompare size={16} color="#38bdf8" />
                  </div>
                  <div className="flyout-item-text">
                    <div className="flyout-item-headline">
                      <span className="flyout-title">Plan Comparator</span>
                      <span className="flyout-badge sky-badge">A / B Benchmark</span>
                    </div>
                    <span className="flyout-desc">
                      Side-by-side Before vs After execution plan differential cost analysis
                    </span>
                  </div>
                  {activeTab === 'comparator' && <Check size={14} color="#38bdf8" className="flyout-check" />}
                </button>
              </div>
            )}
          </div>

          {/* Category: Live Radar (Direct tab button) */}
          <div className="nav-dropdown-item-wrap">
            <button
              type="button"
              className={`nav-category-btn ${activeTab === 'liveradar' ? 'active' : ''}`}
              onClick={(e) => handleSelectTab('liveradar', e)}
              title="Real-Time Active Sessions, Query Store Harvester & Live Deadlocks"
            >
              <Zap size={14} color={activeTab === 'liveradar' ? '#38bdf8' : '#94a3b8'} />
              <span className="category-title">Live Radar</span>
              {liveStatus?.connected ? (
                <span
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'rgba(52, 211, 153, 0.2)',
                    color: '#34d399',
                  }}
                >
                  LIVE
                </span>
              ) : (
                <span className="category-offline-pill" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                  Live
                </span>
              )}
            </button>
          </div>

          {/* Category 3: Tuning Playbook (Direct tab button) */}
          <div className="nav-dropdown-item-wrap">
            <button
              type="button"
              className={`nav-category-btn ${isPlaybookActive ? 'active' : ''}`}
              onClick={(e) => handleSelectTab('playbook', e)}
              title="Comprehensive DBA Anti-Pattern Guide, Relational Join Physics & T-SQL Rewrites"
            >
              <BookOpen size={14} color={isPlaybookActive ? '#c084fc' : '#94a3b8'} />
              <span className="category-title">Tuning Playbook</span>
              {isPlaybookActive && <span className="category-active-hint">Playbook</span>}
            </button>
          </div>

          {/* Category 4: A/B Compare (Direct tab button) */}
          <div className="nav-dropdown-item-wrap">
            <button
              type="button"
              className={`nav-category-btn ${activeTab === 'comparator' ? 'active' : ''}`}
              onClick={(e) => handleSelectTab('comparator', e)}
              title="Side-by-side Before vs After execution plan comparator & benchmark"
            >
              <GitCompare size={14} color={activeTab === 'comparator' ? '#38bdf8' : '#94a3b8'} />
              <span className="category-title">A/B Compare</span>
              <span className="category-offline-pill" style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>Diff</span>
            </button>
          </div>

          {/* Category 5: Deadlocks (.xdl) (Direct tab button in new row!) */}
          <div className="nav-dropdown-item-wrap">
            <button
              type="button"
              className={`nav-category-btn nav-category-deadlock ${isDeadlockActive ? 'active active-deadlock' : ''}`}
              onClick={(e) => handleSelectTab('deadlock', e)}
              title="Interactive Deadlock Graph (.xdl) Cycle Visualizer with Lock Attribution"
            >
              <ShieldAlert size={14} color={isDeadlockActive ? '#f43f5e' : '#94a3b8'} />
              <span className="category-title">Deadlocks (.xdl)</span>
              <span className="category-offline-pill">100% Offline</span>
            </button>
          </div>

          {/* Category 6: DB Connections (SQLite Persisted) */}
          <div className="nav-dropdown-item-wrap">
            <button
              type="button"
              className={`nav-category-btn ${activeTab === 'connections' ? 'active' : ''}`}
              onClick={(e) => handleSelectTab('connections', e)}
              title="Manage saved SQL Server connection profiles in SQLite database"
            >
              <Server size={14} color={activeTab === 'connections' ? '#38bdf8' : '#94a3b8'} />
              <span className="category-title">Connections</span>
              <span
                style={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                }}
              >
                SQLite
              </span>
            </button>
          </div>
        </div>

      </div>
    </header>
  );
};
