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
  Moon,
  Sun,
  RotateCcw,
  EyeOff,
} from 'lucide-react';
import { PlanAnalysis } from '../types/plan';
import { ConnectionStatus, WindowsUserInfo, DBConnectionProfile } from '../types/livedb';
import { GetSavedDBConnections, ConnectLiveDB } from '../../wailsjs/go/main/App';

interface NavbarProps {
  plan: PlanAnalysis | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedEngine: 'sqlserver' | 'postgresql';
  onSelectEngine: (engine: 'sqlserver' | 'postgresql') => void;
  onResetPlan: () => void;
  onOpenFile: () => void;
  onOpenPasteModal: () => void;
  onOpenSettings: () => void;
  onOpenLiveModal: () => void;
  liveStatus: ConnectionStatus | null;
  windowsUser?: WindowsUserInfo | null;
  onExportReport?: () => void;
  onExportRawPlan?: () => void;
  onExportAnonymizedPlan?: () => void;
  onAnonymizeInPlace?: () => void;
  isLoading: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  plan,
  activeTab,
  setActiveTab,
  selectedEngine,
  onSelectEngine,
  onResetPlan,
  onOpenFile,
  onOpenPasteModal,
  onOpenSettings,
  onOpenLiveModal,
  liveStatus,
  windowsUser,
  onExportReport,
  onExportRawPlan,
  onExportAnonymizedPlan,
  onAnonymizeInPlace,
  isLoading,
  isDark,
  onToggleTheme,
}) => {
  const [openMenu, setOpenMenu] = useState<'diagnostics' | 'optimization' | null>(null);
  const [isConnDropdownOpen, setIsConnDropdownOpen] = useState<boolean>(false);
  const [isEngineDropdownOpen, setIsEngineDropdownOpen] = useState<boolean>(false);
  const [isTopEngineDropdownOpen, setIsTopEngineDropdownOpen] = useState<boolean>(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState<boolean>(false);
  const [savedProfiles, setSavedProfiles] = useState<DBConnectionProfile[]>([]);
  const timerRef = useRef<any>(null);
  const diagRef = useRef<HTMLDivElement>(null);
  const optRef = useRef<HTMLDivElement>(null);
  const connDropdownRef = useRef<HTMLDivElement>(null);
  const engineDropdownRef = useRef<HTMLDivElement>(null);
  const topEngineDropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

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
      const profEngine =
        p.engine === 'postgresql' || p.port === 5432 || p.database?.toLowerCase() === 'postgres'
          ? 'postgresql'
          : 'sqlserver';
      if (onSelectEngine) {
        onSelectEngine(profEngine);
      }
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.ConnectLiveDB) {
        await ConnectLiveDB({
          engine: profEngine,
          server: p.server,
          port: Number(p.port) || (profEngine === 'postgresql' ? 5432 : 1433),
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
  const isPg = selectedEngine === 'postgresql' || plan?.engine === 'postgresql';

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
      if (engineDropdownRef.current && engineDropdownRef.current.contains(target)) return;
      if (topEngineDropdownRef.current && topEngineDropdownRef.current.contains(target)) return;
      if (exportDropdownRef.current && exportDropdownRef.current.contains(target)) return;
      setOpenMenu(null);
      setIsConnDropdownOpen(false);
      setIsEngineDropdownOpen(false);
      setIsTopEngineDropdownOpen(false);
      setIsExportDropdownOpen(false);
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
          <div
            className="logo-badge"
            title={
              selectedEngine === 'postgresql'
                ? 'PlanIQ - High-Performance PostgreSQL Execution Plan Analyzer'
                : 'PlanIQ - High-Performance SQL Server Execution Plan Analyzer'
            }
          >
            <Database size={16} color="#38bdf8" />
          </div>
          <div className="brand-info-wrap">
            <div className="brand-title-row">
              <span className="brand-title">PlanIQ</span>
              <span className="brand-version-pill">v2.0 Desktop</span>

              <div className="nav-engine-dropdown-wrap" ref={topEngineDropdownRef}>
                <button
                  type="button"
                  className={`btn-engine-switch-badge ${selectedEngine === 'postgresql' ? 'engine-pg' : 'engine-mssql'}`}
                  onClick={() => setIsTopEngineDropdownOpen(!isTopEngineDropdownOpen)}
                  title="Switch Target Database Engine"
                >
                  <Database size={10} color={selectedEngine === 'postgresql' ? '#38bdf8' : '#818cf8'} />
                  <span>{selectedEngine === 'postgresql' ? 'POSTGRESQL' : 'SQL SERVER'}</span>
                  <ChevronDown size={10} className={`conn-dropdown-chevron ${isTopEngineDropdownOpen ? 'open' : ''}`} />
                </button>

                {isTopEngineDropdownOpen && (
                  <div className="nav-conn-flyout glass-panel nav-engine-flyout">
                    <div className="nav-conn-flyout-header">
                      <div className="nav-conn-flyout-title">
                        <Database size={13} color="#38bdf8" />
                        <span>Database Engine</span>
                      </div>
                      <span className="nav-conn-count-pill" style={{ textTransform: 'capitalize' }}>
                        {selectedEngine === 'postgresql' ? 'PostgreSQL' : 'SQL Server'}
                      </span>
                    </div>

                    <div className="nav-conn-flyout-list">
                      <div
                        className={`nav-conn-flyout-item ${selectedEngine === 'sqlserver' ? 'is-active-item' : ''}`}
                        onClick={() => {
                          setIsTopEngineDropdownOpen(false);
                          onSelectEngine('sqlserver');
                        }}
                      >
                        <div className="nav-conn-item-main">
                          <div className="nav-conn-item-server" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Database size={13} color="#818cf8" />
                            <span>Microsoft SQL Server</span>
                            {selectedEngine === 'sqlserver' && <Check size={13} color="#34d399" />}
                          </div>
                          <div className="nav-conn-item-sub">.sqlplan, .xml • ShowPlan XML & Deadlocks</div>
                        </div>
                      </div>

                      <div
                        className={`nav-conn-flyout-item ${selectedEngine === 'postgresql' ? 'is-active-item' : ''}`}
                        onClick={() => {
                          setIsTopEngineDropdownOpen(false);
                          onSelectEngine('postgresql');
                        }}
                      >
                        <div className="nav-conn-item-main">
                          <div className="nav-conn-item-server" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Database size={13} color="#38bdf8" />
                            <span>PostgreSQL</span>
                            {selectedEngine === 'postgresql' && <Check size={13} color="#34d399" />}
                          </div>
                          <div className="nav-conn-item-sub">.json • EXPLAIN (ANALYZE, BUFFERS, JSON)</div>
                        </div>
                      </div>
                    </div>

                    {plan && (
                      <div className="nav-engine-flyout-actions">
                        <button
                          type="button"
                          className="nav-engine-action-btn btn-reset-view"
                          onClick={() => {
                            setIsTopEngineDropdownOpen(false);
                            onResetPlan();
                          }}
                        >
                          <RotateCcw size={12} color="#f59e0b" />
                          <span>Reset to First (Start Screen)</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
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
              title={selectedEngine === 'postgresql' ? 'Open PostgreSQL execution plan (.json)' : 'Open .sqlplan or .xml from disk'}
            >
              <Upload size={12} />
              <span>Open File</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm top-action-btn"
              onClick={onOpenPasteModal}
              disabled={isLoading}
              title={selectedEngine === 'postgresql' ? 'Paste PostgreSQL EXPLAIN (JSON) plan' : 'Paste ShowPlan XML or Deadlock XML'}
            >
              <Code2 size={12} />
              <span>{selectedEngine === 'postgresql' ? 'Paste JSON' : 'Paste XML'}</span>
            </button>
          </div>

          <div className="nav-vertical-divider" />

          <div className="actions-group">
            {plan && (onExportReport || onExportRawPlan || onExportAnonymizedPlan) && (
              <div className="live-conn-dropdown-wrap" ref={exportDropdownRef}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm top-action-btn"
                  onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                  title="Export raw execution plan, anonymized/masked plan, or HTML report"
                >
                  <Download size={12} color="#34d399" />
                  <span>Export</span>
                  <ChevronDown size={11} className={`conn-dropdown-chevron ${isExportDropdownOpen ? 'open' : ''}`} />
                </button>

                {isExportDropdownOpen && (
                  <div className="nav-conn-flyout glass-panel" style={{ minWidth: '285px' }}>
                    <div className="nav-conn-flyout-header">
                      <div className="nav-conn-flyout-title">
                        <Download size={13} color="#34d399" />
                        <span>Export Plan &amp; Diagnostics</span>
                      </div>
                      <span className="nav-conn-count-pill">{isPg ? '.json' : '.sqlplan'}</span>
                    </div>

                    <div className="nav-conn-flyout-list">
                      {onExportRawPlan && (
                        <div
                          className="nav-conn-flyout-item"
                          onClick={() => {
                            setIsExportDropdownOpen(false);
                            onExportRawPlan();
                          }}
                        >
                          <div className="nav-conn-item-main">
                            <div className="nav-conn-item-server" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <FileCode2 size={13} color="#38bdf8" />
                              <span>Export Execution Plan ({isPg ? '.json' : '.sqlplan'})</span>
                            </div>
                            <div className="nav-conn-item-sub">Download full unmasked {isPg ? 'EXPLAIN JSON' : 'ShowPlan XML'} file</div>
                          </div>
                        </div>
                      )}

                      {onExportAnonymizedPlan && (
                        <div
                          className="nav-conn-flyout-item"
                          onClick={() => {
                            setIsExportDropdownOpen(false);
                            onExportAnonymizedPlan();
                          }}
                        >
                          <div className="nav-conn-item-main">
                            <div className="nav-conn-item-server" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <EyeOff size={13} color="#f59e0b" />
                              <span>Export Anonymized Plan ({isPg ? '.anonymized.json' : '.anonymized.sqlplan'})</span>
                            </div>
                            <div className="nav-conn-item-sub">Obfuscates table/column/index names &amp; masks literals</div>
                          </div>
                        </div>
                      )}

                      {onAnonymizeInPlace && (
                        <div
                          className="nav-conn-flyout-item"
                          onClick={() => {
                            setIsExportDropdownOpen(false);
                            onAnonymizeInPlace();
                          }}
                        >
                          <div className="nav-conn-item-main">
                            <div className="nav-conn-item-server" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <ShieldAlert size={13} color="#a78bfa" />
                              <span>Mask &amp; Preview Anonymized in App</span>
                            </div>
                            <div className="nav-conn-item-sub">Reload current view with deterministic obfuscated IDs</div>
                          </div>
                        </div>
                      )}

                      {onExportReport && (
                        <div
                          className="nav-conn-flyout-item"
                          onClick={() => {
                            setIsExportDropdownOpen(false);
                            onExportReport();
                          }}
                        >
                          <div className="nav-conn-item-main">
                            <div className="nav-conn-item-server" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Download size={13} color="#34d399" />
                              <span>Export HTML Diagnostic Report</span>
                            </div>
                            <div className="nav-conn-item-sub">Standalone offline report with findings &amp; index DDL</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
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
                  title={
                    selectedEngine === 'postgresql'
                      ? 'Connect to PostgreSQL or select saved connection'
                      : 'Connect to SQL Server or select saved connection'
                  }
                >
                  <Zap size={12} color="#38bdf8" />
                  <span>Connect DB</span>
                  <ChevronDown size={11} className={`conn-dropdown-chevron ${isConnDropdownOpen ? 'open' : ''}`} />
                </button>
              )}

              {isConnDropdownOpen && (() => {
                const filteredSavedProfiles = savedProfiles.filter((p) => {
                  const profEngine =
                    p.engine === 'postgresql' || p.port === 5432 || p.database?.toLowerCase() === 'postgres'
                      ? 'postgresql'
                      : 'sqlserver';
                  return profEngine === selectedEngine;
                });

                return (
                <div className="nav-conn-flyout glass-panel">
                  <div className="nav-conn-flyout-header">
                    <div className="nav-conn-flyout-title">
                      <HardDrive size={13} color="#34d399" />
                      <span>{selectedEngine === 'postgresql' ? 'Saved PostgreSQL Connections' : 'Saved SQL Server Connections'}</span>
                      <span className="nav-conn-count-pill">{filteredSavedProfiles.length}</span>
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
                    {filteredSavedProfiles.length === 0 ? (
                      <div className="nav-conn-empty">
                        <span>No saved {selectedEngine === 'postgresql' ? 'PostgreSQL' : 'SQL Server'} profiles found.</span>
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
                      filteredSavedProfiles.map((p) => {
                        const profEngine =
                          p.engine === 'postgresql' || p.port === 5432 || p.database?.toLowerCase() === 'postgres'
                            ? 'postgresql'
                            : 'sqlserver';
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
                                <span
                                  style={{
                                    fontSize: '9.5px',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    background:
                                      profEngine === 'postgresql'
                                        ? 'rgba(56, 189, 248, 0.15)'
                                        : 'rgba(129, 140, 248, 0.15)',
                                    color: profEngine === 'postgresql' ? '#38bdf8' : '#818cf8',
                                    fontWeight: 700,
                                  }}
                                >
                                  {profEngine === 'postgresql' ? '🐘 PG' : '🗄️ SQL'}
                                </span>
                                {p.isDefault && <Star size={10} fill="#f59e0b" color="#f59e0b" />}
                                {isActive && <span className="nav-conn-active-badge">ACTIVE</span>}
                              </div>
                              <span className="nav-conn-item-sub">
                                {p.server}:{p.port || (profEngine === 'postgresql' ? 5432 : 1433)} / {p.database}
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
                );
              })()}
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

            {/* Theme Toggle */}
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={onToggleTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              <Moon size={15} className="toggle-icon icon-moon" />
              <Sun size={15} className="toggle-icon icon-sun" />
            </button>
          </div>
        </div>
      </div>

      {/* TIER 2: Active Plan Telemetry Bar (NEW DEDICATED COMPACT ROW - 28px, shown when plan is loaded!) */}
      {plan && (
        <div className="navbar-plan-context-tier">
          <div className="plan-context-left">
            {/* Red Mark Area: Interactive Engine Switcher Dropdown */}
            <div className="nav-engine-dropdown-wrap" ref={engineDropdownRef}>
              <button
                type="button"
                className={`btn-engine-switch-badge ${plan.engine === 'postgresql' ? 'engine-pg' : 'engine-mssql'}`}
                onClick={() => setIsEngineDropdownOpen(!isEngineDropdownOpen)}
                title="Click to switch database engine or reset view"
              >
                <Database size={10} color={plan.engine === 'postgresql' ? '#38bdf8' : '#818cf8'} />
                <span>{plan.engine === 'postgresql' ? 'POSTGRESQL' : 'SQL SERVER'}</span>
                <ChevronDown size={10} className={`conn-dropdown-chevron ${isEngineDropdownOpen ? 'open' : ''}`} />
              </button>

              {isEngineDropdownOpen && (
                <div className="nav-conn-flyout glass-panel nav-engine-flyout">
                  <div className="nav-conn-flyout-header">
                    <div className="nav-conn-flyout-title">
                      <Database size={13} color="#38bdf8" />
                      <span>Database Engine</span>
                    </div>
                    <span className="nav-conn-count-pill">
                      Active: {plan.engine === 'postgresql' ? 'PostgreSQL' : 'SQL Server'}
                    </span>
                  </div>

                  <div className="nav-conn-flyout-list">
                    {/* Switch to SQL Server */}
                    <div
                      className={`nav-conn-flyout-item ${plan.engine !== 'postgresql' ? 'is-active-item' : ''}`}
                      onClick={() => {
                        setIsEngineDropdownOpen(false);
                        onSelectEngine('sqlserver');
                      }}
                      title="Switch active engine to SQL Server and reset to first screen"
                    >
                      <div className="nav-conn-item-main">
                        <div className="nav-conn-item-server" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Database size={13} color="#818cf8" />
                          <span>Microsoft SQL Server</span>
                          {plan.engine !== 'postgresql' && <Check size={13} color="#34d399" />}
                        </div>
                        <div className="nav-conn-item-sub">.sqlplan, .xml • ShowPlan XML & Deadlocks</div>
                      </div>
                    </div>

                    {/* Switch to PostgreSQL */}
                    <div
                      className={`nav-conn-flyout-item ${plan.engine === 'postgresql' ? 'is-active-item' : ''}`}
                      onClick={() => {
                        setIsEngineDropdownOpen(false);
                        onSelectEngine('postgresql');
                      }}
                      title="Switch active engine to PostgreSQL and reset to first screen"
                    >
                      <div className="nav-conn-item-main">
                        <div className="nav-conn-item-server" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Database size={13} color="#38bdf8" />
                          <span>PostgreSQL</span>
                          {plan.engine === 'postgresql' && <Check size={13} color="#34d399" />}
                        </div>
                        <div className="nav-conn-item-sub">.json • EXPLAIN (ANALYZE, BUFFERS, JSON)</div>
                      </div>
                    </div>
                  </div>

                  <div className="nav-engine-flyout-actions">
                    <button
                      type="button"
                      className="nav-engine-action-btn btn-reset-view"
                      onClick={() => {
                        setIsEngineDropdownOpen(false);
                        onResetPlan();
                      }}
                      title="Close current plan and return to initial first screen"
                    >
                      <RotateCcw size={12} color="#f59e0b" />
                      <span>Reset to First (Start Screen)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Reset Pill Button right beside it */}
            <button
              type="button"
              className="plan-meta-pill reset-plan-pill"
              onClick={onResetPlan}
              title="Reset and close current plan (return to initial screen)"
            >
              <RotateCcw size={10} color="#94a3b8" />
              <span>Reset</span>
            </button>
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
                    ? (isPg ? 'Pipeline' : 'Batch Flow')
                    : (isPg ? 'Wait Events' : 'Wait Stats')}
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
                      <span className="flyout-badge cyan-badge">{isPg ? '10 Detectors' : '13 Detectors'}</span>
                    </div>
                    <span className="flyout-desc">
                      {isPg
                        ? 'PostgreSQL root cause verdict, shared_buffers analysis, and engine health scorecard'
                        : '10-Second root cause verdict, wait statistics, and engine health scorecard'}
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
                      <span className="flyout-title">{isPg ? 'Pipeline & work_mem' : 'Batch Flow & TempDB'}</span>
                      <span className="flyout-badge sky-badge">{isPg ? 'Memory & Spills' : 'Timeline'}</span>
                    </div>
                    <span className="flyout-desc">
                      {isPg
                        ? 'PostgreSQL execution pipeline waterfall, work_mem allocation, disk spills & worker distribution'
                        : 'Sequential statement execution waterfall, cumulative subtree cost progression, and TempDB physical usage'}
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
                      <span className="flyout-title">{isPg ? 'Wait Events & Latency' : 'Wait Statistics'}</span>
                      <span className="flyout-badge amber-badge">
                        {isPg ? 'Deep-Dive' : plan && (plan.waitStats || []).length > 0 ? `${(plan.waitStats || []).length} Waits` : 'Deep-Dive'}
                      </span>
                    </div>
                    <span className="flyout-desc">
                      {isPg
                        ? 'PostgreSQL physical wait events (IO:DataFileRead, Lock, LWLock, IPC), JIT & planning latency'
                        : 'Physical engine wait events (Disk I/O, Parallelism, Memory Grants, Schedulers) and DBA remedies'}
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
                  {activeTab === 'indexes' ? 'Indexes' : activeTab === 'advisor' ? (isPg ? 'PG Doctor' : 'AI Doctor') : 'Comparator'}
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
                      <span className="flyout-title">{isPg ? 'PostgreSQL Index Advisor' : 'Missing Indexes'}</span>
                      <span className="flyout-badge emerald-badge">
                        {plan ? `${(plan.allMissingIndexes || []).length} Suggestions` : 'Suggestions'}
                      </span>
                    </div>
                    <span className="flyout-desc">
                      {isPg
                        ? 'PostgreSQL CREATE INDEX CONCURRENTLY, partial & covering index suggestions'
                        : 'Smart consolidated composite indexes to eliminate write penalties & raw hints'}
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
                      <span className="flyout-title">{isPg ? 'PostgreSQL AI Advisor' : 'AI Performance Doctor'}</span>
                      <span className="flyout-badge purple-badge">AI Copilot</span>
                    </div>
                    <span className="flyout-desc">
                      {isPg
                        ? 'Automated PostgreSQL query rewrites, work_mem tuning & Monaco side-by-side diff'
                        : 'Automated T-SQL rewrites, Monaco side-by-side diff editor & hint advisor'}
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
              title={isPg ? 'PostgreSQL Performance Playbook, work_mem & Indexing Anti-Patterns' : 'Comprehensive DBA Anti-Pattern Guide, Relational Join Physics & T-SQL Rewrites'}
            >
              <BookOpen size={14} color={isPlaybookActive ? '#c084fc' : '#94a3b8'} />
              <span className="category-title">{isPg ? 'PG Playbook' : 'Tuning Playbook'}</span>
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

          {/* Category 5: Deadlocks */}
          <div className="nav-dropdown-item-wrap">
            <button
              type="button"
              className={`nav-category-btn nav-category-deadlock ${isDeadlockActive ? 'active active-deadlock' : ''}`}
              onClick={(e) => handleSelectTab('deadlock', e)}
              title={isPg ? 'PostgreSQL Deadlock & Lock Conflict Analyzer with pg_locks attribution' : 'Interactive Deadlock Graph (.xdl) Cycle Visualizer with Lock Attribution'}
            >
              <ShieldAlert size={14} color={isDeadlockActive ? (isPg ? '#38bdf8' : '#f43f5e') : '#94a3b8'} />
              <span className="category-title">{isPg ? 'PG Deadlocks' : 'Deadlocks (.xdl)'}</span>
              <span
                className="category-offline-pill"
                style={isPg ? { background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' } : undefined}
              >
                {isPg ? 'pg_locks' : '100% Offline'}
              </span>
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
