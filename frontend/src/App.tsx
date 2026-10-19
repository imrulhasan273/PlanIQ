import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { PlanVisualizerTab } from './components/PlanVisualizerTab';
import { MissingIndexesTab } from './components/MissingIndexesTab';
import { AIAdvisorTab } from './components/AIAdvisorTab';
import { PlanComparatorTab } from './components/PlanComparatorTab';
import { PasteModal } from './components/PasteModal';
import { AISettingsModal } from './components/AISettingsModal';
import { PlanAnalysis, StatementAnalysis } from './types/plan';
import { LoadSamplePlan, OpenFilePicker, ParsePlan } from '../wailsjs/go/main/App';
import { exportDiagnosticReportHTML } from './utils/reportExporter';
import { parseShowPlanXMLClient } from './utils/clientPlanParser';
import { Loader2, Database, Upload, FileCode2 } from 'lucide-react';
import './App.css';

import samplePlanData from './sample_plan.json';

export function App() {
  const [plan, setPlan] = useState<PlanAnalysis | null>(null);
  const [selectedStatement, setSelectedStatement] = useState<StatementAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'visualizer' | 'indexes' | 'advisor' | 'comparator'>('overview');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isPasteOpen, setIsPasteOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const [aiConfig, setAiConfig] = useState<{
    provider: 'offline' | 'gemini' | 'openai' | 'ollama';
    apiKey: string;
    model: string;
    endpointUrl: string;
  }>(() => {
    const saved = localStorage.getItem('planiq_ai_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return {
      provider: 'offline',
      apiKey: '',
      model: '',
      endpointUrl: 'http://localhost:11434',
    };
  });

  const handleSaveConfig = (newConfig: any) => {
    setAiConfig(newConfig);
    localStorage.setItem('planiq_ai_config', JSON.stringify(newConfig));
  };

  // Auto-load explan.xml on first launch
  useEffect(() => {
    handleLoadSample();
  }, []);

  const handleLoadSample = async () => {
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
      setPlan(data);
      if (data.statements.length > 0) {
        setSelectedStatement(data.statements[0]); // top cost statement
      }
      setActiveTab('overview');
    } catch (err: any) {
      console.warn('Wails backend LoadSamplePlan not reached, using bundled fallback:', err);
      const fallbackData = samplePlanData as unknown as PlanAnalysis;
      setPlan(fallbackData);
      if (fallbackData.statements.length > 0) {
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
        if (res && res[1]) {
          const filePath = res[0] || 'Selected Plan';
          const fileName = filePath.split(/[/\\]/).pop() || 'Execution Plan';
          await handleParseManual(res[1], fileName);
        }
      } else {
        // Fallback for standard browser tab
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.sqlplan,.xml';
        input.onchange = (e: any) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async (evt) => {
            const content = evt.target?.result as string;
            if (content) {
              await handleParseManual(content, file.name);
            }
          };
          reader.readAsText(file);
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

  const handleParseManual = async (xmlContent: string, planName: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await parsePlanSafely(xmlContent, planName);
      setPlan(data);
      if (data.statements.length > 0) {
        setSelectedStatement(data.statements[0]);
      }
      setActiveTab('overview');
    } catch (err: any) {
      console.error('Failed to parse XML:', err);
      setErrorMessage(err?.message || 'Failed to parse execution plan XML');
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
    <div className="app-container">
      <Navbar
        plan={plan}
        activeTab={activeTab}
        setActiveTab={(t: string) => setActiveTab(t as any)}
        onOpenFile={handleOpenFile}
        onOpenPasteModal={() => setIsPasteOpen(true)}
        onLoadSample={handleLoadSample}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onExportReport={() => plan && exportDiagnosticReportHTML(plan)}
        isLoading={isLoading}
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

        {plan ? (
          <>
            {activeTab === 'overview' && (
              <OverviewTab
                plan={plan}
                onSelectStatement={handleSelectStatementFromOverview}
                onNavigateTab={(t) => setActiveTab(t)}
              />
            )}

            {activeTab === 'visualizer' && selectedStatement && (
              <PlanVisualizerTab
                plan={plan}
                selectedStatement={selectedStatement}
                onSelectStatement={(s) => setSelectedStatement(s)}
              />
            )}

            {activeTab === 'indexes' && <MissingIndexesTab plan={plan} />}

            {activeTab === 'advisor' && selectedStatement && (
              <AIAdvisorTab
                plan={plan}
                selectedStatement={selectedStatement}
                onSelectStatement={(s) => setSelectedStatement(s)}
                aiConfig={aiConfig}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />
            )}

            {activeTab === 'comparator' && <PlanComparatorTab />}
          </>
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
                <button className="btn btn-primary btn-lg" onClick={handleLoadSample}>
                  <FileCode2 size={18} />
                  <span>Load explan.xml Sample (Stored Proc)</span>
                </button>

                <button className="btn btn-secondary btn-lg" onClick={handleOpenFile}>
                  <Upload size={18} />
                  <span>Open .sqlplan File</span>
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
    </div>
  );
}

export default App;
