import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { PlanVisualizerTab } from './components/PlanVisualizerTab';
import { MissingIndexesTab } from './components/MissingIndexesTab';
import { AIAdvisorTab } from './components/AIAdvisorTab';
import { PlanComparatorTab } from './components/PlanComparatorTab';
import { BatchFlowTab } from './components/BatchFlowTab';
import { WaitStatsTab } from './components/WaitStatsTab';
import { TuningPlaybookTab } from './components/TuningPlaybookTab';
import { DeadlockTab } from './components/DeadlockTab';
import { LiveRadarTab } from './components/LiveRadarTab';
import { ConnectionsTab } from './components/ConnectionsTab';
import { LiveConnectionModal } from './components/LiveConnectionModal';
import { PasteModal } from './components/PasteModal';
import { AISettingsModal } from './components/AISettingsModal';
import { PgOverviewTab } from './components/pg/PgOverviewTab';
import { PgWaitStatsTab } from './components/pg/PgWaitStatsTab';
import { PgBatchFlowTab } from './components/pg/PgBatchFlowTab';
import { PgIndexAdvisorTab } from './components/pg/PgIndexAdvisorTab';
import { PgAIAdvisorTab } from './components/pg/PgAIAdvisorTab';
import { PgTuningPlaybookTab } from './components/pg/PgTuningPlaybookTab';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PlanAnalysis, StatementAnalysis } from './types/plan';
import { DeadlockGraph } from './types/deadlock';
import { ConnectionStatus, WindowsUserInfo } from './types/livedb';
import { isDeadlockXML, parseDeadlockXML, readFileAsDecodedText } from './utils/deadlockParser';
import {
  OpenFileAndParse,
  OpenFilePicker,
  ParsePlan,
  GetLiveDBStatus,
  GetCurrentWindowsUser,
  GetAppTheme,
  SetAppTheme,
} from '../wailsjs/go/main/App';
import { exportDiagnosticReportHTML } from './utils/reportExporter';
import { buildAnonymizedPlanContent, exportAnonymizedPlanFile, exportRawPlanFile } from './utils/planExports';
import { parseShowPlanXMLClient } from './utils/clientPlanParser';
import { isPgExplainJson, parsePgExplainJson } from './utils/pgPlanParser';
import { sanitizePlan } from './utils/sanitizePlan';
import { Loader2, Database, Upload, FileCode2, ShieldAlert, Zap, Code2 } from 'lucide-react';
import './App.css';

export type TabType =
  | 'overview'
  | 'visualizer'
  | 'batchflow'
  | 'waitstats'
  | 'indexes'
  | 'advisor'
  | 'comparator'
  | 'playbook'
  | 'deadlock'
  | 'liveradar'
  | 'connections';

export function App() {
  const [plan, setPlan] = useState<PlanAnalysis | null>(null);
  const [rawPlanContent, setRawPlanContent] = useState<string>('');
  const [selectedStatement, setSelectedStatement] = useState<StatementAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const [isPasteOpen, setIsPasteOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isLiveConnOpen, setIsLiveConnOpen] = useState<boolean>(false);
  const [liveStatus, setLiveStatus] = useState<ConnectionStatus | null>(null);
  const [deadlockGraphs, setDeadlockGraphs] = useState<DeadlockGraph[]>([]);
  const [windowsUser, setWindowsUser] = useState<WindowsUserInfo | null>(null);
  const [selectedEngine, setSelectedEngine] = useState<'sqlserver' | 'postgresql'>(() => {
    const saved = localStorage.getItem('planiq_engine');
    return saved === 'postgresql' ? 'postgresql' : 'sqlserver';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const rt = (window as any).runtime;
      const w = window.screen?.availWidth || window.screen?.width;
      const h = window.screen?.availHeight || window.screen?.height;
      if (w > 0 && h > 0) {
        rt?.WindowSetSize?.(w, h);
      }
      rt?.WindowMaximise?.();
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).go?.main?.App?.SetActiveEngine) {
      (window as any).go.main.App.SetActiveEngine(selectedEngine).catch(() => {});
    }
  }, [selectedEngine]);

  useEffect(() => {
    const isPg = selectedEngine === 'postgresql' || plan?.engine === 'postgresql';
    const title = isPg
      ? 'PlanIQ — PostgreSQL Execution Plan Visualizer & AI Advisor'
      : 'PlanIQ — SQL Server Execution Plan Visualizer & AI Advisor';
    document.title = title;
    if (typeof window !== 'undefined' && (window as any).runtime?.WindowSetTitle) {
      (window as any).runtime.WindowSetTitle(title);
    }
  }, [selectedEngine, plan?.engine]);

  const handleResetPlan = () => {
    setPlan(null);
    setRawPlanContent('');
    setSelectedStatement(null);
    setActiveTab('overview');
  };

  const handleSelectEngine = (engine: 'sqlserver' | 'postgresql') => {
    setSelectedEngine(engine);
    localStorage.setItem('planiq_engine', engine);
    if (typeof window !== 'undefined' && (window as any).go?.main?.App?.SetActiveEngine) {
      (window as any).go.main.App.SetActiveEngine(engine).catch(() => {});
    }
    // Cleanly reset current plan to return to initial screen
    if (plan) {
      handleResetPlan();
    }
  };

  // Theme: default dark, persist to SQLite and localStorage
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('planiq_theme');
    return saved !== null ? saved === 'dark' : true;
  });

  // Load authoritative theme preference from SQLite DB on startup
  useEffect(() => {
    GetAppTheme()
      .then((theme) => {
        if (theme === 'light') {
          setIsDark(false);
          localStorage.setItem('planiq_theme', 'light');
        } else if (theme === 'dark') {
          setIsDark(true);
          localStorage.setItem('planiq_theme', 'dark');
        }
      })
      .catch((err) => {
        console.warn('Failed to load theme from SQLite config DB:', err);
      });
  }, []);

  const handleToggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      const themeStr = next ? 'dark' : 'light';
      localStorage.setItem('planiq_theme', themeStr);
      // Persist to SQLite DB so reopening the app preserves the theme
      SetAppTheme(themeStr).catch((err) => {
        console.warn('Failed to save theme to SQLite config DB:', err);
      });
      return next;
    });
  };

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove('light-theme');
      document.body.classList.remove('light-theme');
    } else {
      document.documentElement.classList.add('light-theme');
      document.body.classList.add('light-theme');
    }
  }, [isDark]);

  const [aiConfig, setAiConfig] = useState<{
    provider: 'offline' | 'gemini' | 'openai' | 'ollama';
    apiKey: string;
    model: string;
    endpointUrl: string;
  }>(() => {
    const saved = localStorage.getItem('planiq_ai_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.provider === 'gemini' && (!parsed.model || parsed.model.includes('2.8'))) {
          parsed.model = 'gemini-2.0-flash';
        }
        return parsed;
      } catch {
        // ignore
      }
    }
    return {
      provider: 'offline',
      apiKey: '',
      model: 'gemini-2.0-flash',
      endpointUrl: 'http://localhost:11434',
    };
  });

  const handleSaveConfig = (newConfig: any) => {
    // Sanitize gemini model name
    if (newConfig.provider === 'gemini' && (!newConfig.model || newConfig.model.includes('2.8'))) {
      newConfig = { ...newConfig, model: 'gemini-2.0-flash' };
    }
    setAiConfig(newConfig);
    localStorage.setItem('planiq_ai_config', JSON.stringify(newConfig));
  };

  // Check live connection status and get windows user on launch (NO auto-loading mock data)
  useEffect(() => {
    // Fetch logged in Windows user
    if (typeof window !== 'undefined' && (window as any).go?.main?.App?.GetCurrentWindowsUser) {
      GetCurrentWindowsUser().then((u) => {
        if (u && u.username) {
          setWindowsUser(u);
        }
      }).catch((err) => {
        console.warn('Failed to get Windows user:', err);
      });
    }

    if (typeof window !== 'undefined' && (window as any).go?.main?.App?.GetLiveDBStatus) {
      GetLiveDBStatus().then((st) => {
        if (st && st.connected) {
          setLiveStatus(st);
          // Auto-route to Live Radar if connected to live SQL Server
          setActiveTab('liveradar');
        }
      }).catch(() => {});
    }
  }, []);

  const parsePlanSafely = async (content: string, planName: string): Promise<PlanAnalysis> => {
    const isJson = planName.toLowerCase().endsWith('.json') || isPgExplainJson(content);
    if (isJson || selectedEngine === 'postgresql') {
      try {
        return parsePgExplainJson(content, planName);
      } catch (err) {
        if (isJson || selectedEngine === 'postgresql') {
          throw err;
        }
      }
    }
    if (typeof window !== 'undefined' && (window as any).go?.main?.App?.ParsePlan) {
      return await ParsePlan(content, planName);
    }
    return parseShowPlanXMLClient(content, planName);
  };

  const handleOpenFile = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.OpenFilePicker) {
        const res = await OpenFilePicker();
        if (res && res.content) {
          await handleParseManual(res.content, res.name || res.path || 'Execution Plan');
        }
      } else if (typeof window !== 'undefined' && (window as any).go?.main?.App?.OpenFileAndParse) {
        const rawData = await OpenFileAndParse();
        if (rawData) {
          const data = sanitizePlan(rawData);
          setPlan(data);
          if (data.engine) {
            setSelectedEngine(data.engine);
            localStorage.setItem('planiq_engine', data.engine);
            if (typeof window !== 'undefined' && (window as any).go?.main?.App?.SetActiveEngine) {
              (window as any).go.main.App.SetActiveEngine(data.engine).catch(() => {});
            }
          }
          if (data.statements && data.statements.length > 0) {
            setSelectedStatement(data.statements[0]);
          }
          setActiveTab('overview');
        }
      } else {
        // Fallback for standard browser tab
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.sqlplan,.xml,.xdl,.json';
        input.onchange = async (e: any) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const content = await readFileAsDecodedText(file);
            await handleParseManual(content, file.name);
          } catch (err: any) {
            setErrorMessage(`Failed to read file: ${err?.message || err}`);
          }
        };
        input.click();
      }
    } catch (err: any) {
      console.error('Failed to open file:', err);
      setErrorMessage(err?.message || 'Failed to open file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    try {
      const content = await readFileAsDecodedText(file);
      await handleParseManual(content, file.name);
    } catch (err: any) {
      setErrorMessage(`Failed to read file: ${err?.message || err}`);
    }
  };

  const handleParseManual = async (xmlContent: string, planName: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // Check if this is a SQL Server Deadlock Graph (.xdl or deadlock XML)
      if (isDeadlockXML(xmlContent, planName)) {
        const deadlocks = parseDeadlockXML(xmlContent);
        setDeadlockGraphs(deadlocks);
        setActiveTab('deadlock');
        return;
      }

      const rawData = await parsePlanSafely(xmlContent, planName);
      const data = sanitizePlan(rawData);
      setPlan(data);
      setRawPlanContent(xmlContent);
      if (data.engine) {
        setSelectedEngine(data.engine);
        localStorage.setItem('planiq_engine', data.engine);
        if (typeof window !== 'undefined' && (window as any).go?.main?.App?.SetActiveEngine) {
          (window as any).go.main.App.SetActiveEngine(data.engine).catch(() => {});
        }
      }
      if (data.statements && data.statements.length > 0) {
        setSelectedStatement(data.statements[0]);
      }
      setActiveTab('overview');
    } catch (err: any) {
      console.error('Failed to parse XML:', err);
      setErrorMessage(err?.message || 'Failed to parse execution plan or deadlock XML');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectStatementFromOverview = (
    stmt: StatementAnalysis,
    targetTab: 'visualizer' | 'advisor'
  ) => {
    setSelectedStatement(stmt);
    setActiveTab(targetTab);
  };

  return (
    <div
      id="app-root"
      className={`app-container${isDark ? '' : ' light-theme'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="drag-drop-overlay">
          <Upload size={54} color={selectedEngine === 'postgresql' ? '#38bdf8' : '#818cf8'} />
          <span style={{ fontSize: '18px', fontWeight: 600, marginTop: '14px', color: '#f8fafc' }}>
            {selectedEngine === 'postgresql'
              ? 'Drop PostgreSQL .json file to analyze'
              : 'Drop .sqlplan or .xml file to analyze'}
          </span>
          <span style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>
            Instant parsing, visual tree, and root cause diagnostics
          </span>
        </div>
      )}

      <Navbar
        plan={plan}
        activeTab={activeTab}
        setActiveTab={(t: string) => setActiveTab(t as any)}
        selectedEngine={selectedEngine}
        onSelectEngine={handleSelectEngine}
        onResetPlan={handleResetPlan}
        onOpenFile={handleOpenFile}
        onOpenPasteModal={() => setIsPasteOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenLiveModal={() => setIsLiveConnOpen(true)}
        liveStatus={liveStatus}
        windowsUser={windowsUser}
        onExportReport={() => plan && exportDiagnosticReportHTML(plan)}
        onExportRawPlan={() => plan && exportRawPlanFile(plan, rawPlanContent)}
        onExportAnonymizedPlan={() => plan && exportAnonymizedPlanFile(plan, rawPlanContent)}
        onAnonymizeInPlace={() => {
          if (!plan) return;
          const anon = buildAnonymizedPlanContent(plan, rawPlanContent);
          handleParseManual(anon, `${plan.planName.replace(/\s*\(Anonymized\)$/i, '')} (Anonymized)`);
        }}
        isLoading={isLoading}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
      />

      {/* Main Content Area */}
      <main className="main-content">
        {isLoading && (
          <div className="loading-overlay">
            <Loader2 size={36} className="spin text-cyan-400" color="#38bdf8" />
            <span style={{ marginTop: '12px', fontWeight: 500, color: '#e2e8f0' }}>
              Parsing Execution Plan & Calculating Metrics...
            </span>
          </div>
        )}

        {errorMessage && (
          <div className="error-banner-top">
            <span>{errorMessage}</span>
            <button className="btn-close-error" onClick={() => setErrorMessage(null)}>
              ✕
            </button>
          </div>
        )}

        {activeTab === 'connections' ? (
          <ErrorBoundary onReset={() => setActiveTab('overview')}>
            <ConnectionsTab
              liveStatus={liveStatus}
              windowsUser={windowsUser}
              engine={selectedEngine}
              onEngineChange={(eng) => handleSelectEngine(eng)}
              onConnectSuccess={(status) => {
                setLiveStatus(status);
                setActiveTab('liveradar');
              }}
              onNavigateToRadar={() => setActiveTab('liveradar')}
            />
          </ErrorBoundary>
        ) : activeTab === 'liveradar' ? (
          <ErrorBoundary onReset={() => setActiveTab('overview')}>
            <LiveRadarTab
              status={liveStatus}
              engine={selectedEngine}
              onOpenConnectModal={() => setIsLiveConnOpen(true)}
              onLoadPlanXML={(xml, name) => handleParseManual(xml, name)}
              onLoadDeadlockXML={(xml) => {
                const parsed = parseDeadlockXML(xml);
                setDeadlockGraphs(parsed);
                setActiveTab('deadlock');
              }}
            />
          </ErrorBoundary>

        ) : activeTab === 'deadlock' ? (
          <ErrorBoundary onReset={() => setActiveTab('overview')}>
            <DeadlockTab
              initialDeadlocks={deadlockGraphs}
              engine={selectedEngine}
              onOpenXdlFile={handleOpenFile}
              onNavigateToLiveRadar={() => setActiveTab('liveradar')}
            />
          </ErrorBoundary>
        ) : activeTab === 'playbook' ? (
          <ErrorBoundary onReset={() => setActiveTab('overview')}>
            {selectedEngine === 'postgresql' || plan?.engine === 'postgresql' ? (
              <PgTuningPlaybookTab
                plan={plan}
                onNavigateToStatement={(stmt) => {
                  setSelectedStatement(stmt);
                  setActiveTab('visualizer');
                }}
              />
            ) : (
              <TuningPlaybookTab
                plan={plan}
                onNavigateToStatement={(stmt) => {
                  setSelectedStatement(stmt);
                  setActiveTab('visualizer');
                }}
              />
            )}
          </ErrorBoundary>
        ) : plan ? (
          <ErrorBoundary onReset={() => setActiveTab('overview')}>
            {activeTab === 'overview' && (
              plan.engine === 'postgresql' ? (
                <PgOverviewTab
                  plan={plan}
                  onSelectStatement={handleSelectStatementFromOverview}
                  onNavigateTab={(t: any) => setActiveTab(t)}
                />
              ) : (
                <OverviewTab
                  plan={plan}
                  onSelectStatement={handleSelectStatementFromOverview}
                  onNavigateTab={(t: any) => setActiveTab(t)}
                />
              )
            )}

            {activeTab === 'visualizer' && (
              <PlanVisualizerTab
                plan={plan}
                selectedStatement={selectedStatement || plan.statements[0]}
                onSelectStatement={(s) => setSelectedStatement(s)}
                onExportRawPlan={() => exportRawPlanFile(plan, rawPlanContent)}
                onExportAnonymizedPlan={() => exportAnonymizedPlanFile(plan, rawPlanContent)}
                onAnonymizeInPlace={() => {
                  const anon = buildAnonymizedPlanContent(plan, rawPlanContent);
                  handleParseManual(anon, `${plan.planName.replace(/\s*\(Anonymized\)$/i, '')} (Anonymized)`);
                }}
              />
            )}

            {activeTab === 'batchflow' && (
              plan.engine === 'postgresql' ? (
                <PgBatchFlowTab
                  plan={plan}
                  onSelectStatement={(s, targetTab) => {
                    setSelectedStatement(s);
                    setActiveTab(targetTab);
                  }}
                />
              ) : (
                <BatchFlowTab
                  plan={plan}
                  onSelectStatement={(s, targetTab) => {
                    setSelectedStatement(s);
                    setActiveTab(targetTab);
                  }}
                />
              )
            )}

            {activeTab === 'waitstats' && (
              plan.engine === 'postgresql' ? (
                <PgWaitStatsTab
                  plan={plan}
                  onNavigateTab={(t: any) => setActiveTab(t)}
                />
              ) : (
                <WaitStatsTab
                  plan={plan}
                  onNavigateTab={(t: any) => setActiveTab(t)}
                />
              )
            )}

            {activeTab === 'indexes' && (
              plan.engine === 'postgresql' ? (
                <PgIndexAdvisorTab plan={plan} />
              ) : (
                <MissingIndexesTab plan={plan} />
              )
            )}

            {activeTab === 'advisor' && (
              plan.engine === 'postgresql' ? (
                <PgAIAdvisorTab
                  plan={plan}
                  selectedStatement={selectedStatement || plan.statements[0]}
                  onSelectStatement={(s) => setSelectedStatement(s)}
                  aiConfig={aiConfig}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
              ) : (
                <AIAdvisorTab
                  plan={plan}
                  selectedStatement={selectedStatement || plan.statements[0]}
                  onSelectStatement={(s) => setSelectedStatement(s)}
                  aiConfig={aiConfig}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
              )
            )}

            {activeTab === 'comparator' && (
              <PlanComparatorTab currentPlan={plan} engine={selectedEngine} />
            )}
          </ErrorBoundary>
        ) : (
          /* Compact, Balanced Welcome Card when no plan is loaded */
          <div className="welcome-state-container">
            <div className={`welcome-box glass-panel ${selectedEngine === 'postgresql' ? 'welcome-pg' : 'welcome-mssql'}`}>
              {/* Top Row: Compact Brand + Inline Engine Switcher */}
              <div className="welcome-header-row">
                <div className="welcome-brand-left">
                  <div className="welcome-icon">
                    <Database size={20} color={selectedEngine === 'postgresql' ? '#38bdf8' : '#818cf8'} />
                  </div>
                  <div className="welcome-title-stack">
                    <h1 className="welcome-title">
                      {selectedEngine === 'postgresql'
                        ? 'PostgreSQL Execution Plan Analyzer'
                        : 'SQL Server Execution Plan Analyzer'}
                    </h1>
                    <p className="welcome-desc">
                      {selectedEngine === 'postgresql'
                        ? 'EXPLAIN (JSON) tree diagnostics, shared_buffers impact & AI tuning'
                        : 'ShowPlan XML tree diagnostics, PLE risk rating & AI query tuning'}
                    </p>
                  </div>
                </div>

                <div className="engine-switch-pills">
                  <button
                    type="button"
                    className={`engine-pill-btn ${selectedEngine === 'sqlserver' ? 'active' : ''}`}
                    onClick={() => handleSelectEngine('sqlserver')}
                  >
                    <Database size={12} color={selectedEngine === 'sqlserver' ? '#818cf8' : '#64748b'} />
                    <span>SQL Server</span>
                  </button>
                  <button
                    type="button"
                    className={`engine-pill-btn ${selectedEngine === 'postgresql' ? 'active' : ''}`}
                    onClick={() => handleSelectEngine('postgresql')}
                  >
                    <Database size={12} color={selectedEngine === 'postgresql' ? '#38bdf8' : '#64748b'} />
                    <span>PostgreSQL</span>
                  </button>
                </div>
              </div>

              {/* Compact Capability Strip */}
              <div className="welcome-feature-chips">
                <span className="welcome-chip">5-Pillar 100pt Grading</span>
                <span className="welcome-chip">Interactive Plan Tree</span>
                <span className="welcome-chip">Live DB Radar</span>
                <span className="welcome-chip">Anonymized Export</span>
              </div>

              {/* Balanced 2x2 Action Grid */}
              <div className="welcome-actions-grid">
                <button
                  type="button"
                  className="welcome-action-tile is-primary"
                  onClick={handleOpenFile}
                >
                  <div className="welcome-action-icon primary-icon">
                    <Upload size={16} color="#ffffff" />
                  </div>
                  <div className="welcome-action-text">
                    <span className="welcome-action-title">
                      {selectedEngine === 'postgresql' ? 'Open Plan (.json)' : 'Open .sqlplan File'}
                    </span>
                    <span className="welcome-action-sub">
                      {selectedEngine === 'postgresql' ? 'EXPLAIN (FORMAT JSON)' : 'ShowPlan XML / .xml'}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  className="welcome-action-tile"
                  onClick={() => setIsPasteOpen(true)}
                >
                  <div className="welcome-action-icon">
                    {selectedEngine === 'postgresql' ? (
                      <Code2 size={16} color="#38bdf8" />
                    ) : (
                      <FileCode2 size={16} color="#818cf8" />
                    )}
                  </div>
                  <div className="welcome-action-text">
                    <span className="welcome-action-title">
                      {selectedEngine === 'postgresql' ? 'Paste EXPLAIN (JSON)' : 'Paste ShowPlan XML'}
                    </span>
                    <span className="welcome-action-sub">Instant clipboard parse</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="welcome-action-tile"
                  onClick={() => setIsLiveConnOpen(true)}
                >
                  <div className="welcome-action-icon">
                    <Zap size={16} color="#38bdf8" />
                  </div>
                  <div className="welcome-action-text">
                    <span className="welcome-action-title">
                      {selectedEngine === 'postgresql' ? 'Connect to PostgreSQL' : 'Connect to SQL Server'}
                    </span>
                    <span className="welcome-action-sub">Live Radar &amp; query capture</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="welcome-action-tile"
                  onClick={() => setActiveTab('deadlock')}
                >
                  <div className="welcome-action-icon">
                    <ShieldAlert size={16} color="#f43f5e" />
                  </div>
                  <div className="welcome-action-text">
                    <span className="welcome-action-title">
                      {selectedEngine === 'postgresql' ? 'PG Deadlock Viewer' : 'Deadlock Viewer (.xdl)'}
                    </span>
                    <span className="welcome-action-sub">100% offline lock graph</span>
                  </div>
                </button>
              </div>

              {/* Compact Drag & Drop Hint */}
              <div className="welcome-drop-hint">
                <Upload size={12} color="#64748b" />
                <span>
                  Tip: Drag &amp; drop <code>{selectedEngine === 'postgresql' ? '.json' : '.sqlplan / .xml / .xdl'}</code> anywhere on this window
                </span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <PasteModal
        isOpen={isPasteOpen}
        onClose={() => setIsPasteOpen(false)}
        onParse={handleParseManual}
        engine={selectedEngine}
      />

      <AISettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={aiConfig}
        onChangeConfig={handleSaveConfig}
      />

      <LiveConnectionModal
        isOpen={isLiveConnOpen}
        onClose={() => setIsLiveConnOpen(false)}
        status={liveStatus}
        engine={selectedEngine}
        onEngineChange={(eng) => handleSelectEngine(eng)}
        onStatusChange={(st) => setLiveStatus(st)}
        defaultUsername={windowsUser?.username}
        onOpenConnectionsTab={() => setActiveTab('connections')}
      />
    </div>
  );
}


export default App;
