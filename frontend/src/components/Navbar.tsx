import React from 'react';
import { Database, FileCode2, Sparkles, FolderOpen, Upload, Cpu, GitCompare, Download } from 'lucide-react';
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
  return (
    <header className="navbar-container">
      {/* Brand & Stats */}
      <div className="brand-section">
        <div className="logo-badge">
          <Database className="w-5 h-5 text-cyan-400" size={20} color="#38bdf8" />
        </div>
        <div>
          <div className="brand-title-row">
            <span className="brand-title">PlanIQ</span>
            <span className="brand-subtitle">SQL Server Plan Visualizer</span>
            <span className="badge badge-info">Wails v2 ⚡</span>
          </div>
          {plan && (
            <div className="plan-meta-row">
              <span className="plan-name" title={plan.planName}>{plan.planName}</span>
              <span className="meta-separator">•</span>
              <span className="meta-item">{plan.totalStatements} Stmts</span>
              <span className="meta-separator">•</span>
              <span className="meta-item">Cost: {plan.totalSubTreeCost.toFixed(2)}</span>
              {plan.maxDopReason && (
                <>
                  <span className="meta-separator">•</span>
                  <span className="badge badge-high" style={{ fontSize: '10px' }}>{plan.maxDopReason}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Nav Tabs */}
      {plan && (
        <nav className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview & Stats
          </button>
          <button
            className={`nav-tab ${activeTab === 'visualizer' ? 'active' : ''}`}
            onClick={() => setActiveTab('visualizer')}
          >
            Plan Tree Visualizer
          </button>
          <button
            className={`nav-tab ${activeTab === 'indexes' ? 'active' : ''}`}
            onClick={() => setActiveTab('indexes')}
          >
            Missing Indexes ({plan.allMissingIndexes.length})
          </button>
          <button
            className={`nav-tab ${activeTab === 'advisor' ? 'active' : ''}`}
            onClick={() => setActiveTab('advisor')}
          >
            <Sparkles size={14} color="#c084fc" />
            AI Advisor
          </button>
          <button
            className={`nav-tab ${activeTab === 'comparator' ? 'active' : ''}`}
            onClick={() => setActiveTab('comparator')}
          >
            <GitCompare size={14} color="#38bdf8" />
            Plan Comparator
          </button>
        </nav>
      )}

      {/* Action Buttons */}
      <div className="actions-section">
        <button
          className="btn btn-secondary"
          onClick={onOpenFile}
          disabled={isLoading}
          title="Open .sqlplan or .xml from disk"
        >
          <FolderOpen size={15} />
          <span>Open File</span>
        </button>

        <button
          className="btn btn-secondary"
          onClick={onOpenPasteModal}
          disabled={isLoading}
          title="Paste raw XML ShowPlan"
        >
          <Upload size={15} />
          <span>Paste XML</span>
        </button>

        <button
          className="btn btn-primary"
          onClick={onLoadSample}
          disabled={isLoading}
          title="Load bundled 2.5MB stored procedure plan"
        >
          <FileCode2 size={15} />
          <span>Load explan.xml</span>
        </button>

        {plan && onExportReport && (
          <button
            className="btn btn-secondary"
            onClick={onExportReport}
            title="Export diagnostic report as standalone HTML"
          >
            <Download size={15} color="#34d399" />
            <span>Export Report</span>
          </button>
        )}

        <button
          className="btn btn-ghost"
          onClick={onOpenSettings}
          title="Configure AI API keys & models"
        >
          <Cpu size={16} />
        </button>
      </div>
    </header>
  );
};
