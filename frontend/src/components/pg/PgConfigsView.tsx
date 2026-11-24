import React, { useState, useMemo } from 'react';
import {
  Settings,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Users,
  Puzzle,
  Search,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  Info,
  FolderOpen,
  SlidersHorizontal,
} from 'lucide-react';
import { PgConfigReport } from '../../types/livedb';

interface PgConfigsViewProps {
  report: PgConfigReport | null;
  isLoading: boolean;
  pollingToggle: React.ReactNode;
  onRefresh: () => void;
}

type ConfigSubTab = 'settings' | 'file' | 'hba' | 'ident' | 'overrides';
type QuickFilter = 'all' | 'modified' | 'restart' | 'memory' | 'wal' | 'autovacuum' | 'connections' | 'aio_planner';

export const PgConfigsView: React.FC<PgConfigsViewProps> = ({
  report,
  isLoading,
  pollingToggle,
  onRefresh,
}) => {
  const [subTab, setSubTab] = useState<ConfigSubTab>('settings');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    }
  };

  const categories = useMemo(() => {
    if (!report?.settings) return [];
    const set = new Set<string>();
    report.settings.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set).sort();
  }, [report?.settings]);

  const filteredSettings = useMemo(() => {
    if (!report?.settings) return [];
    const q = searchTerm.trim().toLowerCase();

    return report.settings.filter((s) => {
      if (selectedCategory !== 'all' && s.category !== selectedCategory) return false;

      if (quickFilter === 'modified' && !s.isModified) return false;
      if (quickFilter === 'restart' && !s.pendingRestart) return false;
      if (quickFilter === 'memory') {
        const text = `${s.name} ${s.category}`.toLowerCase();
        if (!/memory|buffer|work_mem|cache|huge_pages|temp_buffers/.test(text)) return false;
      }
      if (quickFilter === 'wal') {
        const text = `${s.name} ${s.category}`.toLowerCase();
        if (!/wal|checkpoint|archive|replication|synchronous_commit/.test(text)) return false;
      }
      if (quickFilter === 'autovacuum') {
        const text = `${s.name} ${s.category}`.toLowerCase();
        if (!/vacuum|freeze|cost_limit/.test(text)) return false;
      }
      if (quickFilter === 'connections') {
        const text = `${s.name} ${s.category}`.toLowerCase();
        if (!/connection|listen|port|auth|ssl|timeout|password/.test(text)) return false;
      }
      if (quickFilter === 'aio_planner') {
        const text = `${s.name} ${s.category}`.toLowerCase();
        if (!/io_method|io_concurrency|parallel|random_page_cost|seq_page_cost|enable_|jit|geqo/.test(text)) return false;
      }

      if (q) {
        return (
          s.name.toLowerCase().includes(q) ||
          s.formattedValue.toLowerCase().includes(q) ||
          s.setting.toLowerCase().includes(q) ||
          s.shortDesc.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.source.toLowerCase().includes(q) ||
          s.sourceFile.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [report?.settings, searchTerm, selectedCategory, quickFilter]);

  const filteredFileSettings = useMemo(() => {
    if (!report?.fileSettings) return [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return report.fileSettings;
    return report.fileSettings.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.setting.toLowerCase().includes(q) ||
        f.sourceFile.toLowerCase().includes(q)
    );
  }, [report?.fileSettings, searchTerm]);

  const filteredHba = useMemo(() => {
    if (!report?.hbaRules) return [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return report.hbaRules;
    return report.hbaRules.filter(
      (h) =>
        h.type.toLowerCase().includes(q) ||
        h.database.toLowerCase().includes(q) ||
        h.userName.toLowerCase().includes(q) ||
        h.address.toLowerCase().includes(q) ||
        h.authMethod.toLowerCase().includes(q)
    );
  }, [report?.hbaRules, searchTerm]);

  const getContextBadgeStyle = (ctx: string) => {
    switch (ctx) {
      case 'postmaster':
        return { bg: 'rgba(244, 63, 94, 0.14)', color: '#e11d48', border: 'rgba(244, 63, 94, 0.3)', label: 'postmaster (Restart)' };
      case 'sighup':
        return { bg: 'rgba(245, 158, 11, 0.14)', color: '#d97706', border: 'rgba(245, 158, 11, 0.3)', label: 'sighup (Reload)' };
      case 'superuser':
      case 'superuser-backend':
        return { bg: 'rgba(168, 85, 247, 0.14)', color: '#9333ea', border: 'rgba(168, 85, 247, 0.3)', label: ctx };
      case 'user':
        return { bg: 'rgba(16, 185, 129, 0.14)', color: '#059669', border: 'rgba(16, 185, 129, 0.3)', label: 'user (Session)' };
      default:
        return { bg: 'rgba(56, 189, 248, 0.14)', color: '#0284c7', border: 'rgba(56, 189, 248, 0.3)', label: ctx || 'internal' };
    }
  };

  const getAuthMethodBadge = (method: string) => {
    const m = method.toLowerCase();
    if (m === 'trust') {
      return { bg: 'rgba(244, 63, 94, 0.16)', color: '#e11d48', border: 'rgba(244, 63, 94, 0.45)', note: 'Unauthenticated!' };
    }
    if (m === 'md5' || m === 'password') {
      return { bg: 'rgba(245, 158, 11, 0.15)', color: '#d97706', border: 'rgba(245, 158, 11, 0.35)', note: 'Legacy Auth' };
    }
    if (m === 'scram-sha-256' || m === 'cert') {
      return { bg: 'rgba(16, 185, 129, 0.15)', color: '#059669', border: 'rgba(16, 185, 129, 0.35)', note: 'Strong' };
    }
    return { bg: 'rgba(56, 189, 248, 0.14)', color: '#0284c7', border: 'rgba(56, 189, 248, 0.3)', note: '' };
  };

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
              PostgreSQL Server Configurations &amp; Auth Files
            </h3>
            <span className="radar-badge-darling" title="Live PostgreSQL pg_settings, pg_file_settings, pg_hba_file_rules, pg_ident_file_mappings & pg_extension">
              postgresql.conf · pg_hba.conf · pg_settings
            </span>
            {report?.currentUser && (
              <span
                className="badge badge-info"
                style={{ fontSize: '10px', padding: '2px 7px' }}
                title={report.canReadAll ? 'Full config visibility (superuser or pg_read_all_settings)' : 'Standard role visibility'}
              >
                Role: {report.currentUser} {report.isSuperuser ? '(Superuser)' : report.canReadAll ? '(pg_read_all_settings)' : '(Limited)'}
              </span>
            )}
          </div>
          <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: 'var(--text-muted)' }}>
            Inspect all visible runtime parameters, <code>postgresql.conf</code> / <code>postgresql.auto.conf</code> lines,{' '}
            <code>pg_hba.conf</code> access rules, <code>pg_ident.conf</code> mappings, DB/role overrides, and extensions.
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

      {/* Config File Paths Strip */}
      {report && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '8px',
            marginBottom: '12px',
            flexShrink: 0,
          }}
        >
          {[
            { label: 'config_file (postgresql.conf)', val: report.configFile || 'Restricted (requires superuser / pg_read_all_settings)' },
            { label: 'hba_file (pg_hba.conf)', val: report.hbaFile || 'Restricted' },
            { label: 'ident_file (pg_ident.conf)', val: report.identFile || 'Restricted' },
            { label: 'data_directory', val: report.dataDirectory || 'Restricted' },
          ].map((fp) => (
            <div
              key={fp.label}
              className="glass-panel"
              style={{
                padding: '8px 11px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <FolderOpen size={11} color="#0284c7" />
                  <span>{fp.label}</span>
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    fontFamily: 'Consolas, monospace',
                    color: fp.val.startsWith('Restricted') ? '#d97706' : 'var(--text-main)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: '2px',
                  }}
                  title={fp.val}
                >
                  {fp.val}
                </div>
              </div>
              {!fp.val.startsWith('Restricted') && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleCopy(fp.val, `path-${fp.label}`)}
                  style={{ padding: '3px 6px', fontSize: '10px', flexShrink: 0 }}
                  title="Copy path"
                >
                  {copiedKey === `path-${fp.label}` ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Navigation Subtabs + Search Bar */}
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
            { id: 'settings', label: `pg_settings (${report?.totalSettings ?? 0})`, icon: <Settings size={12} /> },
            { id: 'file', label: `postgresql.conf Lines (${report?.fileSettings?.length ?? 0})`, icon: <FileText size={12} /> },
            { id: 'hba', label: `pg_hba.conf Rules (${report?.hbaRules?.length ?? 0})`, icon: <ShieldCheck size={12} /> },
            { id: 'ident', label: `pg_ident.conf (${report?.identMappings?.length ?? 0})`, icon: <Users size={12} /> },
            {
              id: 'overrides',
              label: `Overrides (${report?.dbRoleSettings?.length ?? 0}) & Extensions (${report?.extensions?.length ?? 0})`,
              icon: <Puzzle size={12} />,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`btn btn-sm ${subTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSubTab(tab.id as ConfigSubTab)}
              style={{ fontSize: '11px', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', minWidth: '240px', flex: '0 1 320px' }}>
          <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search parameter, value, file, user, IP..."
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

      {/* Main Content Area */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {!report ? (
          <div className="glass-panel" style={{ padding: '36px', textAlign: 'center', borderRadius: '10px', color: 'var(--text-muted)' }}>
            {isLoading ? 'Loading PostgreSQL configuration files and pg_settings...' : 'Click "Reload Configs" to inspect server configuration parameters.'}
          </div>
        ) : (
          <>
            {/* SUBTAB 1: pg_settings */}
            {subTab === 'settings' && (
              <>
                {/* Quick Filters & Category Dropdown */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {[
                      { id: 'all', label: `All (${report.totalSettings})` },
                      { id: 'modified', label: `Modified (${report.modifiedCount})` },
                      { id: 'restart', label: `Pending Restart (${report.pendingRestartCount})` },
                      { id: 'memory', label: 'Memory & Buffers' },
                      { id: 'wal', label: 'WAL & Replication' },
                      { id: 'autovacuum', label: 'Autovacuum' },
                      { id: 'connections', label: 'Connections & Auth' },
                      { id: 'aio_planner', label: 'Async I/O & Planner' },
                    ].map((qf) => (
                      <button
                        key={qf.id}
                        type="button"
                        onClick={() => setQuickFilter(qf.id as QuickFilter)}
                        style={{
                          padding: '4px 9px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: quickFilter === qf.id ? '1px solid #0284c7' : '1px solid var(--border-subtle)',
                          background: quickFilter === qf.id ? 'rgba(2, 132, 199, 0.14)' : 'var(--bg-canvas)',
                          color:
                            qf.id === 'restart' && report.pendingRestartCount > 0
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
                        maxWidth: '250px',
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

                {/* Settings Scrollable Table */}
                <div className="glass-panel" style={tableScrollStyle}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                    <thead>
                      <tr>
                        <th style={stickyThStyle}>Parameter ({filteredSettings.length})</th>
                        <th style={stickyThStyle}>Current Value</th>
                        <th style={stickyThStyle}>Default (boot_val)</th>
                        <th style={stickyThStyle}>Context</th>
                        <th style={stickyThStyle}>Source &amp; File</th>
                        <th style={stickyThStyle}>Description</th>
                        <th style={{ ...stickyThStyle, textAlign: 'right' }}>SQL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSettings.map((s) => {
                        const ctxBadge = getContextBadgeStyle(s.context);
                        const alterSql = `ALTER SYSTEM SET ${s.name} = '${s.formattedValue.replace(/'/g, "''")}';`;
                        return (
                          <tr
                            key={s.name}
                            style={{
                              borderBottom: '1px solid var(--border-subtle)',
                              background: s.pendingRestart
                                ? 'rgba(244, 63, 94, 0.08)'
                                : s.isModified
                                ? 'rgba(2, 132, 199, 0.05)'
                                : 'transparent',
                            }}
                          >
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', fontWeight: 700, color: '#0284c7' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span>{s.name}</span>
                                {s.isModified && (
                                  <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(2, 132, 199, 0.16)', color: '#0284c7' }}>
                                    Modified
                                  </span>
                                )}
                                {s.pendingRestart && (
                                  <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(244, 63, 94, 0.18)', color: '#e11d48' }}>
                                    Pending Restart
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'inherit', fontWeight: 400 }}>{s.category}</div>
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: '#059669', fontWeight: 700 }}>
                              {s.formattedValue || s.setting || '""'}
                              {s.unit && s.formattedValue === s.setting ? <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>{s.unit}</span> : null}
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: 'var(--text-muted)' }}>{s.bootVal || '—'}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: ctxBadge.bg,
                                  color: ctxBadge.color,
                                  border: `1px solid ${ctxBadge.border}`,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {ctxBadge.label}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: '10.5px', color: 'var(--text-main)' }}>
                              <div>{s.source || 'default'}</div>
                              {s.sourceFile && (
                                <div style={{ fontSize: '10px', fontFamily: 'Consolas, monospace', color: 'var(--text-muted)' }}>
                                  {s.sourceFile}:{s.sourceLine}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)', maxWidth: '300px' }}>{s.shortDesc}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleCopy(alterSql, `set-${s.name}`)}
                                style={{ fontSize: '10px', padding: '3px 7px' }}
                                title={alterSql}
                              >
                                {copiedKey === `set-${s.name}` ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* SUBTAB 2: pg_file_settings (postgresql.conf / postgresql.auto.conf) */}
            {subTab === 'file' && (
              <div className="glass-panel" style={tableScrollStyle}>
                {report.fileSettingsError ? (
                  <div style={{ padding: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px', color: '#d97706', fontSize: '12px' }}>
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong>Cannot read pg_file_settings with role "{report.currentUser}"</strong>
                      <p style={{ margin: '4px 0 8px', color: 'var(--text-main)' }}>{report.fileSettingsError}</p>
                      <code style={{ background: 'var(--bg-canvas)', padding: '5px 8px', borderRadius: '5px', display: 'inline-block', color: '#0284c7' }}>
                        GRANT pg_read_all_settings TO {report.currentUser || 'your_user'};
                      </code>
                    </div>
                  </div>
                ) : filteredFileSettings.length === 0 ? (
                  <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No matching directives found in <code>pg_file_settings</code>.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                    <thead>
                      <tr>
                        <th style={stickyThStyle}>Line</th>
                        <th style={stickyThStyle}>Parameter ({filteredFileSettings.length})</th>
                        <th style={stickyThStyle}>Configured Setting</th>
                        <th style={stickyThStyle}>Status</th>
                        <th style={stickyThStyle}>Config File</th>
                        <th style={stickyThStyle}>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFileSettings.map((f, idx) => (
                        <tr key={`${f.sourceFile}-${f.seqNo}-${idx}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: 'var(--text-muted)' }}>#{f.sourceLine}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: '#0284c7', fontWeight: 700 }}>{f.name}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: '#059669', fontWeight: 600 }}>{f.setting}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: f.applied ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                color: f.applied ? '#059669' : '#d97706',
                                fontWeight: 600,
                              }}
                            >
                              {f.applied ? 'Applied' : 'Overridden / Pending'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', fontSize: '10.5px', color: 'var(--text-main)' }}>{f.sourceFile}</td>
                          <td style={{ padding: '8px 12px', color: f.error ? '#e11d48' : 'var(--text-muted)' }}>{f.error || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* SUBTAB 3: pg_hba.conf */}
            {subTab === 'hba' && (
              <div className="glass-panel" style={tableScrollStyle}>
                {report.hbaError ? (
                  <div style={{ padding: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px', color: '#d97706', fontSize: '12px' }}>
                    <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong>Cannot read pg_hba_file_rules with role "{report.currentUser}"</strong>
                      <p style={{ margin: '4px 0 8px', color: 'var(--text-main)' }}>{report.hbaError}</p>
                      <code style={{ background: 'var(--bg-canvas)', padding: '5px 8px', borderRadius: '5px', display: 'inline-block', color: '#0284c7' }}>
                        GRANT pg_read_all_settings TO {report.currentUser || 'your_user'};
                      </code>
                    </div>
                  </div>
                ) : filteredHba.length === 0 ? (
                  <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No matching authentication rules found in <code>pg_hba_file_rules</code>.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                    <thead>
                      <tr>
                        <th style={stickyThStyle}>Line</th>
                        <th style={stickyThStyle}>Type ({filteredHba.length})</th>
                        <th style={stickyThStyle}>Database</th>
                        <th style={stickyThStyle}>User</th>
                        <th style={stickyThStyle}>Address / Netmask</th>
                        <th style={stickyThStyle}>Auth Method</th>
                        <th style={stickyThStyle}>Options / Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHba.map((h, idx) => {
                        const badge = getAuthMethodBadge(h.authMethod);
                        return (
                          <tr key={`${h.lineNumber}-${idx}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: 'var(--text-muted)' }}>#{h.lineNumber}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: '#0284c7', fontWeight: 700 }}>{h.type}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: 'var(--text-main)' }}>{h.database}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: 'var(--text-main)' }}>{h.userName}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: 'var(--text-muted)' }}>
                              {h.address || 'local socket'}
                              {h.netmask ? ` / ${h.netmask}` : ''}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <span
                                style={{
                                  fontSize: '10.5px',
                                  fontWeight: 700,
                                  padding: '2px 7px',
                                  borderRadius: '4px',
                                  background: badge.bg,
                                  color: badge.color,
                                  border: `1px solid ${badge.border}`,
                                }}
                              >
                                {h.authMethod}
                                {badge.note ? ` · ${badge.note}` : ''}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', color: h.error ? '#e11d48' : 'var(--text-muted)' }}>
                              {h.error || h.options || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* SUBTAB 4: pg_ident.conf */}
            {subTab === 'ident' && (
              <div className="glass-panel" style={tableScrollStyle}>
                {report.identError ? (
                  <div style={{ padding: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    <Info size={18} color="#0284c7" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong style={{ color: 'var(--text-main)' }}>pg_ident.conf (pg_ident_file_mappings) unavailable</strong>
                      <p style={{ margin: '4px 0 0' }}>
                        {report.identError} (Note: <code>pg_ident_file_mappings</code> requires PostgreSQL 15+ and superuser or <code>pg_read_all_settings</code>.)
                      </p>
                    </div>
                  </div>
                ) : report.identMappings.length === 0 ? (
                  <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No OS-to-PostgreSQL user mappings configured in <code>pg_ident.conf</code>.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                    <thead>
                      <tr>
                        <th style={stickyThStyle}>Line</th>
                        <th style={stickyThStyle}>Map Name</th>
                        <th style={stickyThStyle}>OS / System User</th>
                        <th style={stickyThStyle}>PostgreSQL Username</th>
                        <th style={stickyThStyle}>File</th>
                        <th style={stickyThStyle}>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.identMappings.map((m, idx) => (
                        <tr key={`${m.lineNumber}-${idx}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: 'var(--text-muted)' }}>#{m.lineNumber}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: '#0284c7', fontWeight: 700 }}>{m.mapName}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: 'var(--text-main)' }}>{m.sysName}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: '#059669' }}>{m.pgUsername}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: 'var(--text-muted)' }}>{m.fileName}</td>
                          <td style={{ padding: '8px 12px', color: m.error ? '#e11d48' : 'var(--text-muted)' }}>{m.error || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* SUBTAB 5: DB / Role Overrides & Installed Extensions */}
            {subTab === 'overrides' && (
              <div style={{ ...tableScrollStyle, display: 'flex', flexDirection: 'column', gap: '14px', padding: '12px' }}>
                {/* Per-Database & Per-Role Settings */}
                <div className="glass-panel" style={{ borderRadius: '8px', flexShrink: 0, overflowX: 'auto' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                    Database &amp; Role Parameter Overrides (<code>pg_db_role_setting</code>)
                  </div>
                  {report.dbRoleSettings.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                      No per-database or per-role <code>ALTER DATABASE / ALTER ROLE SET</code> overrides configured.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                      <thead>
                        <tr>
                          <th style={{ ...stickyThStyle, position: 'static' }}>Database</th>
                          <th style={{ ...stickyThStyle, position: 'static' }}>Role</th>
                          <th style={{ ...stickyThStyle, position: 'static' }}>Parameter</th>
                          <th style={{ ...stickyThStyle, position: 'static' }}>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.dbRoleSettings.map((d, idx) => (
                          <tr key={`${d.databaseName}-${d.roleName}-${d.name}-${idx}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td style={{ padding: '8px 12px', color: 'var(--text-main)' }}>{d.databaseName}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{d.roleName}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: '#0284c7', fontWeight: 700 }}>{d.name}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: '#059669' }}>{d.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Installed Extensions */}
                <div className="glass-panel" style={{ borderRadius: '8px', flexShrink: 0, overflowX: 'auto' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                    Installed Extensions in Current Database (<code>pg_extension</code>)
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                    <thead>
                      <tr>
                        <th style={{ ...stickyThStyle, position: 'static' }}>Extension</th>
                        <th style={{ ...stickyThStyle, position: 'static' }}>Version</th>
                        <th style={{ ...stickyThStyle, position: 'static' }}>Schema</th>
                        <th style={{ ...stickyThStyle, position: 'static' }}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.extensions.map((ext) => (
                        <tr key={ext.name} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: '#0284c7', fontWeight: 700 }}>{ext.name}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'Consolas, monospace', color: '#059669' }}>{ext.version}</td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-main)' }}>{ext.schema}</td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{ext.description || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
