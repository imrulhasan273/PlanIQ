import React from 'react';
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
  Clock,
  BookOpen,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';
import { PlanAnalysis } from '../types/plan';

interface NavbarProps {
  plan: PlanAnalysis | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenFile: () => void;
  onOpenPasteModal: () => void;
  onLoadSample: () => void;
  onOpenSettings: () => void;
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
  onExportReport,
  isLoading,
}) => {
  const formatMaxDop = (reason?: string) => {
    if (!reason) return null;
    if (reason === 'MaxDOPSetToOne') return 'MaxDOP=1';
    if (reason === 'NoParallelismPlans') return 'Serial';
    return reason;
  };

  return (
    <header className="navbar-compact-row">
      {/* LEFT: Brand & Active Plan Info */}
      <div className="nav-left-section">
        <div className="logo-badge" title="PlanIQ - SQL Server Execution Plan & Deadlock Analyzer">
          <Database size={16} color="#38bdf8" />
        </div>
        <div className="brand-title-wrap">
          <span className="brand-title">PlanIQ</span>
          <span className="brand-version-pill">v2.0</span>
        </div>

        {/* Compact Plan Meta Pills (Single Row) */}
        {plan && (
          <div className="plan-meta-compact-row">
            <span className="compact-meta-pill plan-name-pill" title={`File: ${plan.planName}`}>
              <FileCode2 size={11} color="#38bdf8" />
              <span className="compact-plan-name">{plan.planName}</span>
            </span>
            <span className="compact-meta-pill" title="Total Statements">
              <Layers size={11} color="#818cf8" />
              <span>{plan.totalStatements} Stmts</span>
            </span>
            <span className="compact-meta-pill" title="Subtree Cost">
              <Activity size={11} color="#34d399" />
              <span>Cost: {plan.totalSubTreeCost.toFixed(1)}</span>
            </span>
            {plan.maxDopReason && (
              <span className="compact-meta-pill warning-pill" title={plan.maxDopReason}>
                <AlertTriangle size={11} color="#fbbf24" />
                <span>{formatMaxDop(plan.maxDopReason)}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* CENTER: Workspace Navigation Tabs (Same Row) */}
      <nav className="nav-tabs-strip">
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
          title="Root Cause Verdict, Diagnostic Detectors & Scorecard"
        >
          <LayoutDashboard size={13} color={activeTab === 'overview' ? '#38bdf8' : '#94a3b8'} />
          <span>Overview</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'visualizer' ? 'active' : ''}`}
          onClick={() => setActiveTab('visualizer')}
          title="Interactive Graphical Plan Tree with Cardinality Skews"
        >
          <GitFork size={13} color={activeTab === 'visualizer' ? '#818cf8' : '#94a3b8'} />
          <span>Plan Tree</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'batchflow' ? 'active' : ''}`}
          onClick={() => setActiveTab('batchflow')}
          title="Sequential Statement Waterfall & TempDB Lifecycle"
        >
          <TrendingUp size={13} color={activeTab === 'batchflow' ? '#38bdf8' : '#94a3b8'} />
          <span>Batch Flow</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'waitstats' ? 'active' : ''}`}
          onClick={() => setActiveTab('waitstats')}
          title="Engine Wait Statistics & Bottlenecks"
        >
          <Clock size={13} color={activeTab === 'waitstats' ? '#fbbf24' : '#94a3b8'} />
          <span>Wait Stats</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'indexes' ? 'active' : ''}`}
          onClick={() => setActiveTab('indexes')}
          title="Consolidated Composite Covering Indexes"
        >
          <KeyRound size={13} color={activeTab === 'indexes' ? '#34d399' : '#94a3b8'} />
          <span>Indexes</span>
          {plan && plan.allMissingIndexes.length > 0 && (
            <span className="nav-tab-badge">{plan.allMissingIndexes.length}</span>
          )}
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'advisor' ? 'active' : ''}`}
          onClick={() => setActiveTab('advisor')}
          title="AI & Deterministic DBA Query Rewriter"
        >
          <Sparkles size={13} color={activeTab === 'advisor' ? '#c084fc' : '#94a3b8'} />
          <span>AI Doctor</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'comparator' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparator')}
          title="Before vs After Plan A/B Differential Benchmark"
        >
          <GitCompare size={13} color={activeTab === 'comparator' ? '#38bdf8' : '#94a3b8'} />
          <span>Compare</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'playbook' ? 'active' : ''}`}
          onClick={() => setActiveTab('playbook')}
          title="DBA Anti-Pattern Guide & Relational Join Physics"
        >
          <BookOpen size={13} color={activeTab === 'playbook' ? '#c084fc' : '#94a3b8'} />
          <span>Playbook</span>
        </button>

        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'deadlock' ? 'active active-deadlock' : ''}`}
          onClick={() => setActiveTab('deadlock')}
          title="Interactive Deadlock Graph (.xdl) Cycle Visualizer"
        >
          <ShieldAlert size={13} color={activeTab === 'deadlock' ? '#f43f5e' : '#94a3b8'} />
          <span>Deadlocks (.xdl)</span>
        </button>
      </nav>

      {/* RIGHT: Action Buttons (Same Row) */}
      <div className="nav-right-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm nav-action-btn"
          onClick={onOpenFile}
          disabled={isLoading}
          title="Open .sqlplan, .xml, or .xdl from disk"
        >
          <Upload size={13} />
          <span>Open File</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm nav-action-btn"
          onClick={onOpenPasteModal}
          disabled={isLoading}
          title="Paste ShowPlan XML or Deadlock XML"
        >
          <Code2 size={13} />
          <span>Paste XML</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm nav-action-btn"
          onClick={onLoadSample}
          disabled={isLoading}
          title="Load demo sample execution plan"
        >
          <FileCode2 size={13} />
          <span>Sample Plan</span>
        </button>

        {plan && onExportReport && (
          <button
            type="button"
            className="btn btn-secondary btn-sm nav-action-btn"
            onClick={onExportReport}
            title="Export diagnostic report to standalone HTML"
          >
            <Download size={13} />
            <span>Export</span>
          </button>
        )}

        <button
          type="button"
          className="btn btn-secondary btn-sm nav-action-btn"
          onClick={onOpenSettings}
          title="Configure AI API Key & Models"
          style={{ padding: '0 8px' }}
        >
          <Settings size={13} color="#38bdf8" />
          <span>Settings</span>
        </button>
      </div>
    </header>
  );
};
