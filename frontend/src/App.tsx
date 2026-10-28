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
import { ErrorBoundary } from './components/ErrorBoundary';
import { PlanAnalysis, StatementAnalysis } from './types/plan';
import { DeadlockGraph } from './types/deadlock';
import { ConnectionStatus, WindowsUserInfo } from './types/livedb';
import { SAMPLE_DEADLOCK_XDL, isDeadlockXML, parseDeadlockXML, readFileAsDecodedText } from './utils/deadlockParser';
import {
  LoadSamplePlan,
  OpenFileAndParse,
  OpenFilePicker,
  ParsePlan,
  GetLiveDBStatus,
  GetCurrentWindowsUser,
  GetAppTheme,
  SetAppTheme,
} from '../wailsjs/go/main/App';
import { exportDiagnosticReportHTML } from './utils/reportExporter';
import { parseShowPlanXMLClient } from './utils/clientPlanParser';
import { sanitizePlan } from './utils/sanitizePlan';
import { Loader2, Database, Upload, FileCode2, ShieldAlert } from 'lucide-react';
import './App.css';

import samplePlanData from './sample_plan.json';

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

  // Auto-load explan.xml on first launch, get windows user, and check live connection status
  useEffect(() => {
    handleLoadSample();

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
        if (st && st.connected) setLiveStatus(st);
      }).catch(() => {});
    }
  }, []);

  const handleLoadSample = async () => {
    if (activeTab === 'deadlock') {
      try {
        const deadlocks = parseDeadlockXML(SAMPLE_DEADLOCK_XDL);
        setDeadlockGraphs(deadlocks);
      } catch (err: any) {
        console.error('Failed to parse sample deadlock:', err);
      }
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      let data: PlanAnalysis;
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.LoadSamplePlan) {
        data = await LoadSamplePlan();
      } else {
        // Running in web browser without Wails runtime -> fetch and parse sample_explan.xml
        try {
          const resp = await fetch('/sample_explan.xml');
          if (resp.ok) {
            const xml = await resp.text();
            data = parseShowPlanXMLClient(xml, 'explan.xml (InsertDailyOperationalReport)');
          } else {
            data = samplePlanData as unknown as PlanAnalysis;
          }
        } catch {
          data = samplePlanData as unknown as PlanAnalysis;
        }
      }
      const sanitized = sanitizePlan(data);
      setPlan(sanitized);
      if (sanitized.statements && sanitized.statements.length > 0) {
        setSelectedStatement(sanitized.statements[0]); // top cost statement
      }
      setActiveTab('overview');
    } catch (err: any) {
      console.warn('Wails backend LoadSamplePlan not reached, using bundled fallback:', err);
      const fallbackData = sanitizePlan(samplePlanData as unknown as PlanAnalysis);
      setPlan(fallbackData);
      if (fallbackData.statements && fallbackData.statements.length > 0) {
        setSelectedStatement(fallbackData.statements[0]);
      }
      setActiveTab('overview');
    } finally {
      setIsLoading(false);
    }
  };

  const parsePlanSafely = async (xmlContent: string, planName: string): Promise<PlanAnalysis> => {
    if (typeof window !== 'undefined' && (window as any).go?.main?.App?.ParsePlan) {
      return await ParsePlan(xmlContent, planName);
    }
    return parseShowPlanXMLClient(xmlContent, planName);
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
          if (data.statements && data.statements.length > 0) {
            setSelectedStatement(data.statements[0]);
          }
          setActiveTab('overview');
        }
      } else {
        // Fallback for standard browser tab
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.sqlplan,.xml,.xdl';
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
          <Upload size={54} color="#38bdf8" />
          <span style={{ fontSize: '18px', fontWeight: 600, marginTop: '14px', color: '#f8fafc' }}>
            Drop .sqlplan or .xml file to analyze
          </span>
          <span style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>
            Instant parsing and health diagnostics
          </span>
        </div>
      )}

      <Navbar
        plan={plan}
        activeTab={activeTab}
        setActiveTab={(t: string) => setActiveTab(t as any)}
        onOpenFile={handleOpenFile}
        onOpenPasteModal={() => setIsPasteOpen(true)}
        onLoadSample={handleLoadSample}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenLiveModal={() => setIsLiveConnOpen(true)}
        liveStatus={liveStatus}
        windowsUser={windowsUser}
        onExportReport={() => plan && exportDiagnosticReportHTML(plan)}
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
              onOpenXdlFile={handleOpenFile}
              onLoadSample={() => {
                const parsed = parseDeadlockXML(SAMPLE_DEADLOCK_XDL);
                setDeadlockGraphs(parsed);
              }}
            />
          </ErrorBoundary>
        ) : activeTab === 'playbook' ? (
          <ErrorBoundary onReset={() => setActiveTab('overview')}>
            <TuningPlaybookTab
              plan={plan}
              onNavigateToStatement={(stmt) => {
                setSelectedStatement(stmt);
                setActiveTab('visualizer');
              }}
            />
          </ErrorBoundary>
        ) : plan ? (
          <ErrorBoundary onReset={() => setActiveTab('overview')}>
            {activeTab === 'overview' && (
              <OverviewTab
                plan={plan}
                onSelectStatement={handleSelectStatementFromOverview}
                onNavigateTab={(t: any) => setActiveTab(t)}
              />
            )}

            {activeTab === 'visualizer' && (
              <PlanVisualizerTab
                plan={plan}
                selectedStatement={selectedStatement || plan.statements[0]}
                onSelectStatement={(s) => setSelectedStatement(s)}
              />
            )}

            {activeTab === 'batchflow' && (
              <BatchFlowTab
                plan={plan}
                onSelectStatement={(s, targetTab) => {
                  setSelectedStatement(s);
                  setActiveTab(targetTab);
                }}
              />
            )}

            {activeTab === 'waitstats' && (
              <WaitStatsTab
                plan={plan}
                onNavigateTab={(t: any) => setActiveTab(t)}
              />
            )}

            {activeTab === 'indexes' && <MissingIndexesTab plan={plan} />}

            {activeTab === 'advisor' && (
              <AIAdvisorTab
                plan={plan}
                selectedStatement={selectedStatement || plan.statements[0]}
                onSelectStatement={(s) => setSelectedStatement(s)}
                aiConfig={aiConfig}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />
            )}

            {activeTab === 'comparator' && <PlanComparatorTab currentPlan={plan} />}
          </ErrorBoundary>
        ) : (
          /* Blank state when no plan is loaded */
          <div className="welcome-state-container">
            <div className="welcome-box glass-panel">
              <div className="welcome-icon">
                <Database size={48} color="#38bdf8" />
              </div>
              <h1 className="welcome-title">SQL Server Execution Plan Visualizer & AI Advisor</h1>
              <p className="welcome-desc">
                High-performance ShowPlan XML analyzer built with Go & React. Instant bottleneck detection,
                missing index DDL generation, and AI-powered query rewrites.
              </p>

              <div className="welcome-buttons-row">
                <button className="btn btn-primary btn-lg" onClick={handleOpenFile}>
                  <Upload size={18} />
                  <span>Open .sqlplan File</span>
                </button>

                <button className="btn btn-secondary btn-lg" onClick={handleLoadSample}>
                  <FileCode2 size={18} />
                  <span>Load Demo Sample Plan</span>
                </button>

                <button
                  className="btn btn-secondary btn-lg"
                  onClick={() => setActiveTab('deadlock')}
                  style={{ borderColor: 'rgba(244, 63, 94, 0.4)' }}
                >
                  <ShieldAlert size={18} color="#f43f5e" />
                  <span>Deadlock Graph Viewer (.xdl)</span>
                </button>
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
        onStatusChange={(st) => setLiveStatus(st)}
        defaultUsername={windowsUser?.username}
        onOpenConnectionsTab={() => setActiveTab('connections')}
      />
    </div>
  );
}


export default App;
