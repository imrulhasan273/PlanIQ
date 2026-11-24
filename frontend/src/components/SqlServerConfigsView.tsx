import React, { useState, useMemo } from 'react';
import {
  Settings,
  Database,
  HardDrive,
  Flag,
  Search,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  Info,
  SlidersHorizontal,
  Cpu,
  Layers,
  Sparkles,
} from 'lucide-react';
import { SqlServerConfigReport } from '../types/livedb';

interface SqlServerConfigsViewProps {
  report: SqlServerConfigReport | null;
  isLoading: boolean;
  pollingToggle: React.ReactNode;
  onRefresh: () => void;
}

type SqlConfigSubTab = 'instance' | 'scoped' | 'dboptions' | 'files' | 'traceflags';
type InstQuickFilter = 'all' | 'modified' | 'pending' | 'warnings' | 'memory' | 'parallel' | 'versions' | 'security';

export const SqlServerConfigsView: React.FC<SqlServerConfigsViewProps> = ({
  report,
  isLoading,
  pollingToggle,
  onRefresh,
}) => {
  const [subTab, setSubTab] = useState<SqlConfigSubTab>('instance');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<InstQuickFilter>('all');
  const [scopedFilter, setScopedFilter] = useState<'all' | 'modified' | 'versions' | 'unsupported'>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    }
  };

  const categories = useMemo(() => {
    if (!report?.instanceConfigs) return [];
    const set = new Set<string>();
    report.instanceConfigs.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return Array.from(set).sort();
  }, [report?.instanceConfigs]);

  const filteredInstanceConfigs = useMemo(() => {
    if (!report?.instanceConfigs) return [];
    const q = searchTerm.trim().toLowerCase();
    return report.instanceConfigs.filter((c) => {
      if (selectedCategory !== 'all' && c.category !== selectedCategory) return false;
      if (quickFilter === 'modified' && !c.isModified) return false;
      if (quickFilter === 'pending' && !c.pendingAction) return false;
      if (quickFilter === 'warnings' && !c.bestPracticeNote) return false;
      if (quickFilter === 'memory' && c.category !== 'Memory') return false;
      if (quickFilter === 'parallel' && c.category !== 'Parallelism & CPU') return false;
      if (quickFilter === 'security' && c.category !== 'Security & Surface Area') return false;
      if (quickFilter === 'versions' && !c.minVersion && !c.isUnsupported) return false;
      if (q) {
        return (
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          c.value.toLowerCase().includes(q) ||
          (c.bestPracticeNote || '').toLowerCase().includes(q) ||
          (c.versionComment || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [report?.instanceConfigs, searchTerm, selectedCategory, quickFilter]);

  const filteredScopedConfigs = useMemo(() => {
    if (!report?.scopedConfigs) return [];
    const q = searchTerm.trim().toLowerCase();
    return report.scopedConfigs.filter((sc) => {
      if (scopedFilter === 'modified' && (sc.isDefault || sc.isUnsupported)) return false;
      if (scopedFilter === 'versions' && !sc.minVersion) return false;
      if (scopedFilter === 'unsupported' && !sc.isUnsupported) return false;
      if (q) {
        return (
          sc.name.toLowerCase().includes(q) ||
          sc.value.toLowerCase().includes(q) ||
          sc.description.toLowerCase().includes(q) ||
          (sc.versionComment || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [report?.scopedConfigs, searchTerm, scopedFilter]);

  const filteredDbOptions = useMemo(() => {
    if (!report?.databaseOptions) return [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return report.databaseOptions;
    return report.databaseOptions.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.value.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        (d.versionComment || '').toLowerCase().includes(q)
    );
  }, [report?.databaseOptions, searchTerm]);

  const filteredFiles = useMemo(() => {
    if (!report?.databaseFiles) return [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return report.databaseFiles;
    return report.databaseFiles.filter(
      (f) =>
        f.databaseName.toLowerCase().includes(q) ||
        f.logicalName.toLowerCase().includes(q) ||
        f.physicalPath.toLowerCase().includes(q)
    );
  }, [report?.databaseFiles, searchTerm]);

  const unsupportedScopedCount = useMemo(
    () => (report?.scopedConfigs || []).filter((s) => s.isUnsupported).length,
    [report?.scopedConfigs]
  );

  const tableScrollStyle: React.CSSProperties = {
    flex: 1,
    minHeight: '260px',
    maxHeight: 'calc(100vh - 340px)',
    overflowY: 'auto',
    overflowX: 'auto',
    borderRadius: '10px',
    border: '1px solid var(--border-subtle)',
    position: 'relative',
  };

  const stickyThStyle: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 5,
    background: 'var(--bg-card-hover)',
    color: 'var(--text-muted)',
    textAlign: 'left',
    padding: '9px 12px',
    borderBottom: '1px solid var(--border-medium)',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };

  const getVersionBadge = (minVersion?: string, isUnsupported?: boolean) => {
    if (!minVersion) return null;
    if (isUnsupported) {
      return (
        <span
          style={{
            fontSize: '9.5px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'rgba(245, 158, 11, 0.16)',
            color: '#d97706',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {minVersion} Only
        </span>
      );
    }
    return (
      <span
        style={{
          fontSize: '9.5px',
          padding: '2px 6px',
          borderRadius: '4px',
          background: 'rgba(139, 92, 246, 0.15)',
          color: '#7c3aed',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        {minVersion}+
      </span>
    );
  };

  return (
    <div className="section-block radar-subtab-section" style={{ minHeight: 0 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          flexWrap: 'wrap',
          gap: '10px',
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
              SQL Server Configurations &amp; Version Compatibility Matrix
            </h3>
            <span className="radar-badge-darling" title="sys.configurations, sys.database_scoped_configurations, sys.databases, Query Store, Files & Trace Flags">
              sys.configurations · Scoped Configs · SQL 2022 / 2025
            </span>
            {report?.majorYearLabel && (
              <span className="badge badge-info" style={{ fontSize: '10px', padding: '2px 7px' }}>
                Detected: {report.majorYearLabel} ({report.productVersion} {report.productLevel})
              </span>
            )}
          </div>
          <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: 'var(--text-muted)' }}>
            Inspect all instance <code>sp_configure</code> settings, database-scoped IQP configs, DB &amp; Query Store options, TempDB files, and trace flags—with automatic comments for SQL Server 2022 &amp; 2025 features unavailable on older builds.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {pollingToggle}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onRefresh}
            disabled={isLoading}
            style={{ fontSize: '11px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <RefreshCw size={12} className={isLoading ? 'spin' : ''} />
            <span>Reload Configs</span>
          </button>
        </div>
      </div>

      {/* Hardware & Edition Summary Cards */}
      {report && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
            gap: '8px',
            marginBottom: '12px',
            flexShrink: 0,
          }}
        >
          <div className="glass-panel" style={{ padding: '8px 12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>SQL Server Edition</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={report.edition}>
              {report.edition || report.majorYearLabel}
            </div>
          </div>
          <div className="glass-panel" style={{ padding: '8px 12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>Database &amp; Compatibility</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: report.compatibilityLevel < report.majorVersion * 10 ? '#d97706' : '#059669', marginTop: '2px' }}>
              {report.databaseName} (Compat {report.compatibilityLevel})
            </div>
          </div>
          <div className="glass-panel" style={{ padding: '8px 12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>Host CPU &amp; Physical RAM</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>
              {report.cpuCount} vCPU · {(report.physicalMemoryMb / 1024).toFixed(1)} GB RAM
            </div>
          </div>
          <div className="glass-panel" style={{ padding: '8px 12px', borderRadius: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>Instance Collation</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, fontFamily: 'Consolas, monospace', color: 'var(--text-main)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={report.collation}>
              {report.collation || 'Default'}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Subtabs + Search */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          marginBottom: '10px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '5px',
            flexWrap: 'wrap',
            background: 'var(--bg-canvas)',
            padding: '4px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {[
            { id: 'instance', label: `sys.configurations (${report?.totalInstanceConfigs ?? 0})`, icon: <Settings size={12} /> },
            { id: 'scoped', label: `Scoped Configs (${report?.scopedConfigs?.length ?? 0})`, icon: <Sparkles size={12} /> },
            { id: 'dboptions', label: `DB & Query Store (${report?.databaseOptions?.length ?? 0})`, icon: <Database size={12} /> },
            { id: 'files', label: `DB & TempDB Files (${report?.databaseFiles?.length ?? 0})`, icon: <HardDrive size={12} /> },
            { id: 'traceflags', label: `Trace Flags (${report?.traceFlags?.length ?? 0})`, icon: <Flag size={12} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`btn btn-sm ${subTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSubTab(tab.id as SqlConfigSubTab)}
              style={{ fontSize: '11px', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', minWidth: '240px', flex: '0 1 320px' }}>
          <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search config, value, SQL 2025, warning..."
            style={{
              width: '100%',
              padding: '6px 10px 6px 30px',
              borderRadius: '6px',
              border: '1px solid var(--border-medium)',
              background: 'var(--bg-canvas)',
              color: 'var(--text-main)',
              fontSize: '11.5px',
            }}
          />
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {!report ? (
          <div className="glass-panel" style={{ padding: '36px', textAlign: 'center', borderRadius: '10px', color: 'var(--text-muted)' }}>
            {isLoading ? 'Loading SQL Server configurations, scoped options, files, and trace flags...' : 'Click "Reload Configs" to inspect server configuration.'}
          </div>
        ) : (
          <>
            {/* SUBTAB 1: sys.configurations */}
            {subTab === 'instance' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {[
                      { id: 'all', label: `All (${report.totalInstanceConfigs})` },
                      { id: 'modified', label: `Modified (${report.modifiedInstanceCount})` },
                      { id: 'pending', label: `Pending Reconfigure (${report.pendingReconfigureCount})` },
                      { id: 'warnings', label: 'DBA Recommendations' },
                      { id: 'versions', label: 'SQL 2022 / 2025 Features' },
                      { id: 'memory', label: 'Memory' },
                      { id: 'parallel', label: 'Parallelism' },
                      { id: 'security', label: 'Security' },
                    ].map((qf) => (
                      <button
                        key={qf.id}
                        type="button"
                        onClick={() => setQuickFilter(qf.id as InstQuickFilter)}
                        style={{
                          padding: '4px 9px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: quickFilter === qf.id ? '1px solid #0284c7' : '1px solid var(--border-subtle)',
                          background: quickFilter === qf.id ? 'rgba(2, 132, 199, 0.14)' : 'var(--bg-canvas)',
                          color:
                            qf.id === 'pending' && report.pendingReconfigureCount > 0
                              ? '#e11d48'
                              : quickFilter === qf.id
                              ? '#0284c7'
                              : 'var(--text-main)',
                        }}
                      >
                        {qf.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <SlidersHorizontal size={12} color="var(--text-muted)" />
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      style={{
                        background: 'var(--bg-canvas)',
                        color: 'var(--text-main)',
                        border: '1px solid var(--border-medium)',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '11px',
                      }}
                    >
                      <option value="all">All Categories ({categories.length})</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="glass-panel" style={tableScrollStyle}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                    <thead>
                      <tr>
                        <th style={stickyThStyle}>Configuration Name ({filteredInstanceConfigs.length})</th>
                        <th style={stickyThStyle}>Value In Use</th>
                        <th style={stickyThStyle}>Configured</th>
                        <th style={stickyThStyle}>Range (Min – Max)</th>
                        <th style={stickyThStyle}>Scope</th>
                        <th style={stickyThStyle}>Notes &amp; Version Compatibility</th>
                        <th style={{ ...stickyThStyle, textAlign: 'right' }}>T-SQL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInstanceConfigs.map((c) => {
                        const spSql = `EXEC sp_configure 'show advanced options', 1; RECONFIGURE;\nEXEC sp_configure '${c.name}', ${c.value};\nRECONFIGURE;`;
                        return (
                          <tr
                            key={c.name}
                            style={{
                              borderBottom: '1px solid var(--border-subtle)',
                              background: c.isUnsupported
                                ? 'rgba(245, 158, 11, 0.05)'
                                : c.pendingAction
                                ? 'rgba(244, 63, 94, 0.07)'
                                : c.bestPracticeNote
                                ? 'rgba(245, 158, 11, 0.04)'
                                : 'transparent',
                            }}
                          >
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', fontWeight: 700, color: c.isUnsupported ? '#d97706' : '#0284c7' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span>{c.name}</span>
                                {c.isModified && (
                                  <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(2, 132, 199, 0.16)', color: '#0284c7' }}>
                                    Modified
                                  </span>
                                )}
                                {c.pendingAction && (
                                  <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(244, 63, 94, 0.18)', color: '#e11d48' }}>
                                    {c.pendingAction}
                                  </span>
                                )}
                                {getVersionBadge(c.minVersion, c.isUnsupported)}
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'inherit', fontWeight: 400 }}>{c.category}</div>
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', fontWeight: 700, color: c.isUnsupported ? '#d97706' : '#059669' }}>
                              {c.valueInUse}
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: 'var(--text-main)' }}>{c.value}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                              {c.minimum} .. {c.maximum}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                <span
                                  style={{
                                    fontSize: '9.5px',
                                    padding: '2px 5px',
                                    borderRadius: '4px',
                                    background: c.isDynamic ? 'rgba(16, 185, 129, 0.14)' : 'rgba(244, 63, 94, 0.14)',
                                    color: c.isDynamic ? '#059669' : '#e11d48',
                                  }}
                                >
                                  {c.isDynamic ? 'Dynamic' : 'Restart'}
                                </span>
                                {c.isAdvanced && (
                                  <span style={{ fontSize: '9.5px', padding: '2px 5px', borderRadius: '4px', background: 'rgba(100, 116, 139, 0.15)', color: 'var(--text-muted)' }}>
                                    Advanced
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '8px 12px', maxWidth: '340px' }}>
                              <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{c.description}</div>
                              {c.bestPracticeNote && (
                                <div style={{ marginTop: '4px', fontSize: '10.5px', color: '#d97706', fontWeight: 600 }}>
                                  ⚠ {c.bestPracticeNote}
                                </div>
                              )}
                              {c.versionComment && (
                                <div style={{ marginTop: '4px', fontSize: '10.5px', color: c.isUnsupported ? '#d97706' : '#7c3aed', fontWeight: 600 }}>
                                  💬 {c.versionComment}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              {!c.isUnsupported && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleCopy(spSql, `sp-${c.name}`)}
                                  style={{ fontSize: '10px', padding: '3px 7px' }}
                                  title={spSql}
                                >
                                  {copiedKey === `sp-${c.name}` ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* SUBTAB 2: Database-Scoped Configurations */}
            {subTab === 'scoped' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {[
                      { id: 'all', label: `All Scoped Configs (${report.scopedConfigs.length})` },
                      { id: 'modified', label: 'Non-Default Only' },
                      { id: 'versions', label: 'SQL 2019 / 2022 / 2025 Features' },
                      { id: 'unsupported', label: `Newer Version Only (${unsupportedScopedCount})` },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setScopedFilter(f.id as any)}
                        style={{
                          padding: '4px 9px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: scopedFilter === f.id ? '1px solid #0284c7' : '1px solid var(--border-subtle)',
                          background: scopedFilter === f.id ? 'rgba(2, 132, 199, 0.14)' : 'var(--bg-canvas)',
                          color: scopedFilter === f.id ? '#0284c7' : 'var(--text-main)',
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="glass-panel" style={tableScrollStyle}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                    <thead>
                      <tr>
                        <th style={stickyThStyle}>Scoped Configuration ({filteredScopedConfigs.length})</th>
                        <th style={stickyThStyle}>Primary Value</th>
                        <th style={stickyThStyle}>Secondary Value</th>
                        <th style={stickyThStyle}>Version Compatibility &amp; Description</th>
                        <th style={{ ...stickyThStyle, textAlign: 'right' }}>T-SQL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredScopedConfigs.map((sc) => {
                        const alterSql = `ALTER DATABASE SCOPED CONFIGURATION SET ${sc.name} = ${sc.value || 'ON'};`;
                        return (
                          <tr
                            key={sc.name}
                            style={{
                              borderBottom: '1px solid var(--border-subtle)',
                              background: sc.isUnsupported
                                ? 'rgba(245, 158, 11, 0.06)'
                                : !sc.isDefault
                                ? 'rgba(2, 132, 199, 0.05)'
                                : 'transparent',
                            }}
                          >
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', fontWeight: 700, color: sc.isUnsupported ? '#d97706' : '#0284c7' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span>{sc.name}</span>
                                {!sc.isDefault && !sc.isUnsupported && (
                                  <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(2, 132, 199, 0.16)', color: '#0284c7' }}>
                                    Modified
                                  </span>
                                )}
                                {getVersionBadge(sc.minVersion, sc.isUnsupported)}
                              </div>
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', fontWeight: 700, color: sc.isUnsupported ? '#d97706' : '#059669' }}>
                              {sc.value || 'NULL'}
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: 'var(--text-muted)' }}>
                              {sc.valueForSecondary || '—'}
                            </td>
                            <td style={{ padding: '8px 12px', maxWidth: '440px' }}>
                              {sc.description && <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{sc.description}</div>}
                              {sc.versionComment && (
                                <div style={{ marginTop: '3px', fontSize: '10.5px', fontWeight: 600, color: sc.isUnsupported ? '#d97706' : '#7c3aed' }}>
                                  💬 {sc.versionComment}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              {!sc.isUnsupported && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleCopy(alterSql, `sc-${sc.name}`)}
                                  style={{ fontSize: '10px', padding: '3px 7px' }}
                                  title={alterSql}
                                >
                                  {copiedKey === `sc-${sc.name}` ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* SUBTAB 3: Database & Query Store Options */}
            {subTab === 'dboptions' && (
              <div className="glass-panel" style={tableScrollStyle}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                  <thead>
                    <tr>
                      <th style={stickyThStyle}>Database Option ({filteredDbOptions.length})</th>
                      <th style={stickyThStyle}>Current Setting</th>
                      <th style={stickyThStyle}>Health</th>
                      <th style={stickyThStyle}>Description &amp; Version Notes</th>
                      <th style={{ ...stickyThStyle, textAlign: 'right' }}>T-SQL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDbOptions.map((d) => (
                      <tr
                        key={d.name}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          background:
                            d.status === 'WARNING'
                              ? 'rgba(244, 63, 94, 0.05)'
                              : d.status === 'UNSUPPORTED'
                              ? 'rgba(245, 158, 11, 0.06)'
                              : 'transparent',
                        }}
                      >
                        <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', fontWeight: 700, color: d.status === 'UNSUPPORTED' ? '#d97706' : '#0284c7' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span>{d.name}</span>
                            {getVersionBadge(d.minVersion, d.status === 'UNSUPPORTED')}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'inherit', fontWeight: 400 }}>{d.category}</div>
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', fontWeight: 700, color: 'var(--text-main)' }}>{d.value}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background:
                                d.status === 'OPTIMAL'
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : d.status === 'WARNING'
                                  ? 'rgba(244, 63, 94, 0.16)'
                                  : d.status === 'UNSUPPORTED'
                                  ? 'rgba(245, 158, 11, 0.16)'
                                  : 'rgba(56, 189, 248, 0.14)',
                              color:
                                d.status === 'OPTIMAL'
                                  ? '#059669'
                                  : d.status === 'WARNING'
                                  ? '#e11d48'
                                  : d.status === 'UNSUPPORTED'
                                  ? '#d97706'
                                  : '#0284c7',
                            }}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', maxWidth: '420px' }}>
                          <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{d.description}</div>
                          {d.versionComment && (
                            <div style={{ marginTop: '3px', fontSize: '10.5px', fontWeight: 600, color: d.status === 'UNSUPPORTED' ? '#d97706' : '#7c3aed' }}>
                              💬 {d.versionComment}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          {d.alterTsql && d.status !== 'UNSUPPORTED' && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleCopy(d.alterTsql!, `db-${d.name}`)}
                              style={{ fontSize: '10px', padding: '3px 7px' }}
                              title={d.alterTsql}
                            >
                              {copiedKey === `db-${d.name}` ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* SUBTAB 4: Database & TempDB Physical Files */}
            {subTab === 'files' && (
              <div className="glass-panel" style={tableScrollStyle}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                  <thead>
                    <tr>
                      <th style={stickyThStyle}>Database</th>
                      <th style={stickyThStyle}>Logical Name</th>
                      <th style={stickyThStyle}>Type</th>
                      <th style={stickyThStyle}>Size (MB)</th>
                      <th style={stickyThStyle}>AutoGrowth / Max</th>
                      <th style={stickyThStyle}>Physical File Path</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFiles.map((f) => (
                      <tr key={`${f.databaseName}-${f.fileId}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: f.databaseName === 'tempdb' ? '#d97706' : '#0284c7' }}>{f.databaseName}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: 'var(--text-main)' }}>{f.logicalName}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{f.fileType}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', fontWeight: 700, color: '#059669' }}>
                          {f.sizeMb.toLocaleString(undefined, { maximumFractionDigits: 1 })} MB
                        </td>
                        <td style={{ padding: '8px 12px', color: f.growthDesc.includes('%') ? '#d97706' : 'var(--text-main)' }}>
                          {f.growthDesc} (Max: {f.maxSizeDesc})
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', fontSize: '10.5px', color: 'var(--text-muted)' }}>{f.physicalPath}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* SUBTAB 5: Active Trace Flags */}
            {subTab === 'traceflags' && (
              <div className="glass-panel" style={tableScrollStyle}>
                {report.traceFlagsError ? (
                  <div style={{ padding: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px', color: '#d97706', fontSize: '12px' }}>
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong>DBCC TRACESTATUS(-1) requires sysadmin permissions</strong>
                      <p style={{ margin: '4px 0 0', color: 'var(--text-main)' }}>{report.traceFlagsError}</p>
                    </div>
                  </div>
                ) : report.traceFlags.length === 0 ? (
                  <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                    <Info size={20} color="#0284c7" style={{ margin: '0 auto 8px', display: 'block' }} />
                    No global or session trace flags are currently active on this SQL Server instance.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                    <thead>
                      <tr>
                        <th style={stickyThStyle}>Trace Flag</th>
                        <th style={stickyThStyle}>Global</th>
                        <th style={stickyThStyle}>Session</th>
                        <th style={stickyThStyle}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.traceFlags.map((tf) => (
                        <tr key={tf.traceFlag} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', fontWeight: 700, color: tf.traceFlag === 9481 ? '#e11d48' : '#0284c7' }}>
                            TF {tf.traceFlag}
                          </td>
                          <td style={{ padding: '8px 12px', color: tf.global === 1 ? '#059669' : 'var(--text-muted)' }}>{tf.global === 1 ? 'ON' : 'OFF'}</td>
                          <td style={{ padding: '8px 12px', color: tf.session === 1 ? '#059669' : 'var(--text-muted)' }}>{tf.session === 1 ? 'ON' : 'OFF'}</td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{tf.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
