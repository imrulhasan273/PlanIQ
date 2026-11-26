import React, { useMemo, useState } from 'react';
import {
  Database,
  FolderTree,
  Table2,
  HardDrive,
  Layers,
  Globe,
  KeyRound,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Zap,
  BookmarkPlus,
  Trash2,
  FileCode2,
  Plus,
} from 'lucide-react';
import {
  BackupCatalog,
  BackupFilterRule,
  BackupFormat,
  CompressionType,
  DiskSpaceInfo,
  LogicalBackupMode,
  LogicalBackupRequest,
  LogicalContentMode,
  PgBackupProfile,
  ToolchainInfo,
} from '../../../../types/pgbackup';
import { PickPgBackupOutputPath } from '../../../../../wailsjs/go/main/App';
import {
  DynamicTableFilter,
  DynamicColumnFilter,
  DynamicFilterColumn,
  applyDynamicFilters,
  createDefaultDynamicFilter,
} from '../../rbac/components/DynamicTableFilter';
import { buildTimestampedChildPath, syncOutputPathForFormat } from '../utils/pathHelpers';

interface LogicalBackupPanelProps {
  req: LogicalBackupRequest;
  onChange: (next: LogicalBackupRequest) => void;
  onDatabaseChange: (db: string) => void;
  catalog: BackupCatalog | null;
  toolchain: ToolchainInfo | null;
  profiles: PgBackupProfile[];
  onSaveProfile: (name: string) => void;
  onLoadProfile: (profile: PgBackupProfile) => void;
  onDeleteProfile: (id: string) => void;
  onOpenScriptModal: () => void;
  diskSpace: DiskSpaceInfo | null;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val >= 10 || idx === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[idx]}`;
}

export const LogicalBackupPanel: React.FC<LogicalBackupPanelProps> = ({
  req,
  onChange,
  onDatabaseChange,
  catalog,
  toolchain,
  profiles,
  onSaveProfile,
  onLoadProfile,
  onDeleteProfile,
  onOpenScriptModal,
  diskSpace,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [tableFilters, setTableFilters] = useState<DynamicColumnFilter[]>(() => [
    createDefaultDynamicFilter('__any__'),
  ]);
  const [simpleSearch, setSimpleSearch] = useState('');

  const patch = (p: Partial<LogicalBackupRequest>) => onChange({ ...req, ...p });

  const isClusterMode = req.mode.startsWith('cluster_');
  const isMultiDbMode = req.mode === 'multi_db';
  const caps = toolchain?.capabilities;

  const modeCards: Array<{
    key: LogicalBackupMode;
    title: string;
    desc: string;
    icon: React.ReactNode;
  }> = [
    { key: 'full_db', title: 'Full Database', desc: 'Single DB via pg_dump', icon: <Database size={13} /> },
    { key: 'schema', title: 'Schema-wise', desc: 'Multi-select schemas (-n)', icon: <FolderTree size={13} /> },
    { key: 'table', title: 'Table / Multi-level', desc: 'Tables, views, partitions (-t)', icon: <Table2 size={13} /> },
    { key: 'tablespace', title: 'Tablespace-wise', desc: 'Objects stored per tablespace', icon: <HardDrive size={13} /> },
    { key: 'multi_db', title: 'Multi-DB Batch', desc: 'Batch pg_dump + manifest', icon: <Layers size={13} /> },
    { key: 'cluster_full', title: 'Cluster Full', desc: 'pg_dumpall entire cluster', icon: <Globe size={13} /> },
    { key: 'cluster_globals', title: 'Globals Only', desc: 'Roles & tablespaces SQL', icon: <KeyRound size={13} /> },
    { key: 'cluster_roles', title: 'Roles Only', desc: 'pg_dumpall --roles-only', icon: <KeyRound size={13} /> },
    { key: 'cluster_tablespaces', title: 'Tablespaces DDL', desc: 'pg_dumpall --tablespaces-only', icon: <HardDrive size={13} /> },
  ];

  const tableFilterCols = useMemo<DynamicFilterColumn[]>(
    () => [
      { id: '__any__', label: 'All Columns', placeholder: 'Filter tables by schema, name, type, tablespace...' },
      { id: 'schema', label: 'Schema', options: catalog?.schemas ?? [] },
      { id: 'name', label: 'Table / Object Name' },
      {
        id: 'objectType',
        label: 'Type',
        options: ['table', 'partitioned_table', 'view', 'matview', 'foreign_table'],
      },
      {
        id: 'tablespace',
        label: 'Tablespace',
        options: (catalog?.tablespaces ?? []).map((t) => t.name),
      },
      { id: 'owner', label: 'Owner' },
    ],
    [catalog?.schemas, catalog?.tablespaces],
  );

  const filteredTables = useMemo(() => {
    const all = catalog?.tables ?? [];
    return applyDynamicFilters(all, tableFilters, tableFilterCols, (t, colId) => {
      if (colId === 'schema') return t.schema;
      if (colId === 'name') return t.name;
      if (colId === 'objectType') return t.objectType;
      if (colId === 'tablespace') return t.tablespace;
      if (colId === 'owner') return t.owner;
      return `${t.schema}.${t.name} ${t.objectType} ${t.tablespace} ${t.owner}`;
    });
  }, [catalog?.tables, tableFilters, tableFilterCols]);

  const tablespaceObjectCounts = useMemo(() => {
    const map = new Map<string, number>();
    (catalog?.tables ?? []).forEach((t) => {
      map.set(t.tablespace, (map.get(t.tablespace) ?? 0) + 1);
    });
    return map;
  }, [catalog?.tables]);

  const browseOutput = async () => {
    const modeFormat =
      req.mode === 'multi_db'
        ? 'multi_db'
        : isClusterMode && (!caps?.supportsNonTextDumpall || req.mode !== 'cluster_full')
          ? 'plain'
          : req.format;
    const baseName = isClusterMode
      ? `${req.mode}.sql`
      : `${req.database || 'postgres'}_${req.mode}`;
    try {
      const picked = await PickPgBackupOutputPath(modeFormat, baseName);
      if (!picked) return;
      if (modeFormat === 'directory' || modeFormat === 'multi_db') {
        patch({ outputPath: buildTimestampedChildPath(picked, baseName) });
      } else {
        patch({ outputPath: picked });
      }
    } catch {}
  };

  const applyTurboPreset = () => {
    const jobs = toolchain?.recommendedJobs || 4;
    const comp: CompressionType = caps?.supportsZstdLz4 === false ? 'gzip' : 'zstd';
    const baseName = `${req.database || 'postgres'}_${req.mode}_turbo`;
    let nextPath = req.outputPath;
    if (!nextPath.trim()) {
      nextPath = buildTimestampedChildPath(toolchain?.hostOs === 'windows' ? 'D:\\Backups' : '/var/backups/postgresql', baseName);
    } else {
      nextPath = syncOutputPathForFormat(nextPath, 'directory', req.mode, req.database);
    }
    patch({
      format: 'directory',
      compression: comp,
      compressionLevel: 3,
      parallelJobs: jobs,
      contentMode: 'full',
      generateChecksum: true,
      outputPath: nextPath,
    });
  };

  const handleSaveTemplate = () => {
    setTemplateName(`${req.database || 'postgres'}_${req.mode}`);
    setShowSaveModal(true);
  };

  const handleConfirmSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) return;
    onSaveProfile(templateName.trim());
    setShowSaveModal(false);
  };

  const toggleInList = (field: 'schemas' | 'tables' | 'tablespaces' | 'databases' | 'sections', val: string) => {
    const cur = req[field];
    const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val];
    patch({ [field]: next });
  };

  const updateFilterRule = (idx: number, p: Partial<BackupFilterRule>) => {
    const next = [...req.filterRules];
    next[idx] = { ...next[idx], ...p };
    patch({ filterRules: next });
  };

  const databases = catalog?.databases ?? [];
  const schemas = catalog?.schemas ?? [];
  const tablespaces = catalog?.tablespaces ?? [];

  const qLower = simpleSearch.trim().toLowerCase();
  const filteredSchemas = qLower
    ? schemas.filter((s) => s.toLowerCase().includes(qLower))
    : schemas;
  const filteredDbs = qLower
    ? databases.filter((d) => d.name.toLowerCase().includes(qLower) || d.owner.toLowerCase().includes(qLower))
    : databases;
  const filteredTs = qLower
    ? tablespaces.filter((t) => t.name.toLowerCase().includes(qLower) || t.location.toLowerCase().includes(qLower))
    : tablespaces;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', gap: 12 }}>
      {/* Sticky Top Templates, Mode & Destination Strip */}
      <div className="rbac-sticky-controls" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Quick Enterprise Toolbar: Turbo Preset, Saved Templates, Automation Script */}
        <div className="rbac-toolbar" style={{ marginBottom: 0 }}>
          {!isClusterMode && (
            <button
              type="button"
              className="rbac-btn"
              style={{
                borderColor: 'var(--accent-amber)',
                color: 'var(--accent-amber)',
                background: 'rgba(245, 158, 11, 0.10)',
              }}
              onClick={applyTurboPreset}
              title="Directory (-Fd) + zstd/gzip + parallel workers (-j) + SHA-256 checksum"
            >
              <Zap size={12} />
              <span>Turbo Parallel ({toolchain?.recommendedJobs || 4} workers)</span>
            </button>
          )}

          <select
            className="rbac-select"
            style={{ maxWidth: 210 }}
            value={selectedProfileId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedProfileId(id);
              const prof = profiles.find((p) => p.id === id);
              if (prof) onLoadProfile(prof);
            }}
          >
            <option value="">Saved Templates ({profiles.length})…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button type="button" className="rbac-btn" onClick={handleSaveTemplate} title="Save current settings as reusable template">
            <BookmarkPlus size={12} />
            <span>Save Template</span>
          </button>

          {selectedProfileId && (
            <button
              type="button"
              className="rbac-icon-btn"
              style={{ color: 'var(--accent-red)' }}
              title="Delete selected template"
              onClick={() => {
                onDeleteProfile(selectedProfileId);
                setSelectedProfileId('');
              }}
            >
              <Trash2 size={12} />
            </button>
          )}

          <div className="rbac-spacer" />

          <button
            type="button"
            className="rbac-btn"
            onClick={onOpenScriptModal}
            title="Generate Windows PowerShell (.ps1) or Linux Bash (.sh) scheduled backup script"
          >
            <FileCode2 size={12} />
            <span>Export Script (.ps1 / .sh)</span>
          </button>
        </div>

        <div className="pgb-mode-grid">
          {modeCards.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`pgb-mode-card ${req.mode === c.key ? 'active' : ''}`}
              onClick={() => {
                setSimpleSearch('');
                const nextPatch: Partial<LogicalBackupRequest> = { mode: c.key };
                const nextFmt: BackupFormat =
                  c.key.startsWith('cluster_') && c.key !== 'cluster_full' ? 'plain' : req.format;
                nextPatch.format = nextFmt;
                if (req.outputPath.trim()) {
                  nextPatch.outputPath = syncOutputPathForFormat(req.outputPath, nextFmt, c.key, req.database);
                }
                patch(nextPatch);
              }}
            >
              <div className="pgb-mode-card-title">
                {c.icon}
                <span>{c.title}</span>
              </div>
              <span className="pgb-mode-card-desc">{c.desc}</span>
            </button>
          ))}
        </div>

        {/* Target DB + Destination Bar */}
        <div className="rbac-card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {!isClusterMode && !isMultiDbMode && (
              <div className="pgb-field" style={{ minWidth: 190 }}>
                <label className="pgb-field-label">Source Database</label>
                <select
                  className="rbac-select"
                  value={req.database}
                  onChange={(e) => onDatabaseChange(e.target.value)}
                >
                  {databases.length === 0 ? (
                    <option value={req.database}>{req.database}</option>
                  ) : (
                    databases.map((d) => (
                      <option key={d.name} value={d.name}>
                        {d.name} ({formatBytes(d.sizeBytes)})
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}

            <div className="pgb-field" style={{ flex: 1, minWidth: 260 }}>
              <label className="pgb-field-label">
                {req.format === 'directory' || isMultiDbMode
                  ? 'Output Directory (created automatically)'
                  : 'Output File Path'}
              </label>
              <div className="pgb-input-row">
                <input
                  className="rbac-input rbac-mono"
                  style={{ flex: 1 }}
                  placeholder={
                    toolchain?.hostOs === 'windows'
                      ? isMultiDbMode || req.format === 'directory'
                        ? 'e.g. D:\\Backups\\oltp_dir'
                        : 'e.g. D:\\Backups\\oltp.dump'
                      : isMultiDbMode || req.format === 'directory'
                        ? 'e.g. /var/backups/postgresql/oltp_dir'
                        : 'e.g. /var/backups/postgresql/oltp.dump'
                  }
                  value={req.outputPath}
                  onChange={(e) => patch({ outputPath: e.target.value })}
                />
                <button type="button" className="rbac-btn" onClick={browseOutput}>
                  <FolderOpen size={12} />
                  <span>Browse…</span>
                </button>
              </div>
            </div>
          </div>

          {diskSpace && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: diskSpace.sufficient ? 'var(--text-muted)' : 'var(--accent-red)' }}>
              <span>
                Volume <code className="rbac-mono">{diskSpace.path}</code> Free:{' '}
                <strong className="rbac-mono" style={{ color: diskSpace.sufficient ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>
                  {formatBytes(diskSpace.freeBytes)}
                </strong>
                {diskSpace.estimatedBytes > 0 && ` · Uncompressed Est: ${formatBytes(diskSpace.estimatedBytes)}`}
              </span>
              {diskSpace.warning && <span style={{ fontWeight: 600 }}>{diskSpace.warning}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Configuration Area */}
      <div className="rbac-scroll-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
        {req.mode === 'schema' && (
          <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span className="rbac-section-title">
                Select Schemas to Dump ({req.schemas.length} selected)
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="rbac-input"
                  style={{ width: 170, padding: '4px 8px', fontSize: 12 }}
                  placeholder="Filter schemas..."
                  value={simpleSearch}
                  onChange={(e) => setSimpleSearch(e.target.value)}
                />
                <button type="button" className="rbac-btn" onClick={() => patch({ schemas: [...schemas] })}>
                  Select All
                </button>
                <button type="button" className="rbac-btn" onClick={() => patch({ schemas: [] })}>
                  Clear
                </button>
              </div>
            </div>
            <div className="pgb-toggle-grid" style={{ maxHeight: 170, overflowY: 'auto' }}>
              {filteredSchemas.map((s) => (
                <label key={s} className="pgb-toggle-item rbac-mono">
                  <input
                    type="checkbox"
                    checked={req.schemas.includes(s)}
                    onChange={() => toggleInList('schemas', s)}
                  />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {req.mode === 'table' && (
          <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span className="rbac-section-title">
                Select Tables / Views / Partitions ({req.tables.length} selected)
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="rbac-btn"
                  onClick={() => {
                    const keys = filteredTables.map((t) => `${t.schema}.${t.name}`);
                    const set = new Set([...req.tables, ...keys]);
                    patch({ tables: Array.from(set) });
                  }}
                >
                  Select Matching ({filteredTables.length})
                </button>
                <button type="button" className="rbac-btn" onClick={() => patch({ tables: [] })}>
                  Clear All
                </button>
              </div>
            </div>

            <DynamicTableFilter
              columns={tableFilterCols}
              filters={tableFilters}
              onChange={setTableFilters}
              totalCount={(catalog?.tables ?? []).length}
              filteredCount={filteredTables.length}
              itemLabel="objects"
              compact
            />

            <div className="rbac-table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
              <table className="rbac-table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }} className="center">Sel</th>
                    <th>Object</th>
                    <th>Type</th>
                    <th>Tablespace</th>
                    <th>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTables.map((t) => {
                    const full = `${t.schema}.${t.name}`;
                    const checked = req.tables.includes(full);
                    return (
                      <tr key={full} onClick={() => toggleInList('tables', full)} style={{ cursor: 'pointer' }}>
                        <td className="center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleInList('tables', full)}
                          />
                        </td>
                        <td className="rbac-mono">
                          <span style={{ color: 'var(--text-dim)' }}>{t.schema}.</span>
                          <strong>{t.name}</strong>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t.objectType}</td>
                        <td className="rbac-mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t.tablespace}</td>
                        <td className="rbac-mono" style={{ fontSize: 11 }}>{formatBytes(t.sizeBytes)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {req.mode === 'tablespace' && (
          <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span className="rbac-section-title">
                Select Tablespaces to Dump Objects From ({req.tablespaces.length} selected)
              </span>
              <input
                className="rbac-input"
                style={{ width: 180, padding: '4px 8px', fontSize: 12 }}
                placeholder="Filter tablespaces..."
                value={simpleSearch}
                onChange={(e) => setSimpleSearch(e.target.value)}
              />
            </div>
            <div className="pgb-toggle-grid">
              {filteredTs.map((ts) => (
                <label key={ts.name} className="pgb-toggle-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                    <input
                      type="checkbox"
                      checked={req.tablespaces.includes(ts.name)}
                      onChange={() => toggleInList('tablespaces', ts.name)}
                    />
                    <strong className="rbac-mono" style={{ fontSize: 12 }}>{ts.name}</strong>
                    <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--accent-cyan)' }}>
                      {tablespaceObjectCounts.get(ts.name) ?? 0} objs
                    </span>
                  </div>
                  <span className="rbac-mono" style={{ fontSize: 10.5, color: 'var(--text-dim)', paddingLeft: 20 }}>
                    {ts.location || '(default cluster data dir)'}
                    {ts.sizeBytes > 0 ? ` · ${formatBytes(ts.sizeBytes)}` : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {isMultiDbMode && (
          <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span className="rbac-section-title">
                Select Databases for Multi-DB Batch ({req.databases.length} selected)
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="rbac-input"
                  style={{ width: 170, padding: '4px 8px', fontSize: 12 }}
                  placeholder="Filter databases..."
                  value={simpleSearch}
                  onChange={(e) => setSimpleSearch(e.target.value)}
                />
                <button type="button" className="rbac-btn" onClick={() => patch({ databases: databases.map((d) => d.name) })}>
                  Select All
                </button>
                <button type="button" className="rbac-btn" onClick={() => patch({ databases: [] })}>
                  Clear
                </button>
              </div>
            </div>
            <div className="pgb-toggle-grid" style={{ maxHeight: 170, overflowY: 'auto' }}>
              {filteredDbs.map((d) => (
                <label key={d.name} className="pgb-toggle-item">
                  <input
                    type="checkbox"
                    checked={req.databases.includes(d.name)}
                    onChange={() => toggleInList('databases', d.name)}
                  />
                  <span className="rbac-mono">{d.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-dim)' }}>
                    {formatBytes(d.sizeBytes)}
                  </span>
                </label>
              ))}
            </div>
            <label className="pgb-toggle-item" style={{ width: 'fit-content' }}>
              <input
                type="checkbox"
                checked={req.includeGlobals}
                onChange={(e) => patch({ includeGlobals: e.target.checked })}
              />
              <span>Also dump cluster Globals (roles &amp; tablespaces via pg_dumpall --globals-only)</span>
            </label>
          </div>
        )}

        {/* Content Mode */}
        <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="rbac-section-title">Backup Content &amp; Structure Level</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(
              [
                { key: 'full', label: 'Full (Schema + Data)' },
                { key: 'schema_only', label: 'Structure Only (--schema-only)' },
                { key: 'data_only', label: 'Data Only (--data-only)' },
                ...(!isClusterMode ? [{ key: 'sections', label: 'Section-wise' }] : []),
                { key: 'statistics_only', label: 'Statistics Only', badge: 'PG 18+' },
              ] as Array<{ key: LogicalContentMode; label: string; badge?: string }>
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`rbac-btn ${req.contentMode === opt.key ? 'rbac-btn-primary' : ''}`}
                onClick={() => patch({ contentMode: opt.key })}
              >
                <span>{opt.label}</span>
                {opt.badge && <span className="pgb-version-pill">{opt.badge}</span>}
              </button>
            ))}
          </div>

          {req.contentMode === 'sections' && !isClusterMode && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Include sections:</span>
              {['pre-data', 'data', 'post-data'].map((sec) => (
                <label key={sec} className="pgb-toggle-item rbac-mono">
                  <input
                    type="checkbox"
                    checked={req.sections.includes(sec)}
                    onChange={() => toggleInList('sections', sec)}
                  />
                  <span>{sec}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Format, Compression & Concurrency */}
        <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="rbac-section-title">Format, Compression &amp; Parallelism</span>
            {req.mode === 'cluster_full' && (
              <span className="pgb-version-pill">PG 18+ supports non-text pg_dumpall</span>
            )}
          </div>

          <div className="pgb-field-grid">
            <div className="pgb-field">
              <label className="pgb-field-label">Archive Format</label>
              <select
                className="rbac-select"
                value={req.format}
                onChange={(e) => {
                  const fmt = e.target.value as BackupFormat;
                  const nextOut = req.outputPath.trim()
                    ? syncOutputPathForFormat(req.outputPath, fmt, req.mode, req.database)
                    : req.outputPath;
                  patch({ format: fmt, outputPath: nextOut });
                }}
              >
                <option value="custom">Custom Archive (-Fc / .dump)</option>
                <option value="directory">Directory (-Fd / Parallel)</option>
                <option value="tar">Tar Archive (-Ft / .tar)</option>
                <option value="plain">Plain SQL Script (-Fp / .sql)</option>
              </select>
            </div>

            {!isClusterMode && (
              <div className="pgb-field">
                <label className="pgb-field-label">Compression</label>
                <select
                  className="rbac-select"
                  value={req.compression}
                  onChange={(e) => patch({ compression: e.target.value as CompressionType })}
                >
                  <option value="none">None</option>
                  <option value="gzip">gzip (Universal)</option>
                  <option value="zstd">zstd (PG 15+ Fastest/Best)</option>
                  <option value="lz4">lz4 (PG 15+ Ultra-Fast)</option>
                </select>
              </div>
            )}

            {!isClusterMode && req.compression !== 'none' && req.format !== 'plain' && (
              <div className="pgb-field">
                <label className="pgb-field-label">Compression Level</label>
                <input
                  type="number"
                  min={1}
                  max={22}
                  className="rbac-input rbac-mono"
                  value={req.compressionLevel}
                  onChange={(e) => patch({ compressionLevel: Number(e.target.value) || 0 })}
                />
              </div>
            )}

            {!isClusterMode && (
              <div className="pgb-field">
                <label className="pgb-field-label">Parallel Workers (-j, Dir format)</label>
                <input
                  type="number"
                  min={1}
                  max={32}
                  disabled={req.format !== 'directory'}
                  className="rbac-input rbac-mono"
                  value={req.parallelJobs}
                  onChange={(e) => patch({ parallelJobs: Math.max(1, Number(e.target.value) || 1) })}
                />
              </div>
            )}
          </div>
        </div>

        {/* Advanced Flags & PG 17+ --filter Builder */}
        <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--text-main)',
            }}
          >
            {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="rbac-section-title">
              Advanced Flags, SHA-256 Sidecar &amp; PG 17+ --filter Rules
            </span>
          </button>

          {showAdvanced && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="pgb-toggle-grid">
                <label className="pgb-toggle-item" style={{ borderColor: req.generateChecksum ? 'var(--accent-emerald)' : undefined }}>
                  <input
                    type="checkbox"
                    checked={req.generateChecksum}
                    onChange={(e) => patch({ generateChecksum: e.target.checked })}
                  />
                  <span>Generate .sha256 Checksum</span>
                </label>
                <label className="pgb-toggle-item">
                  <input type="checkbox" checked={req.clean} onChange={(e) => patch({ clean: e.target.checked })} />
                  <span>DROP objects first (--clean)</span>
                </label>
                <label className="pgb-toggle-item">
                  <input type="checkbox" checked={req.ifExists} onChange={(e) => patch({ ifExists: e.target.checked })} />
                  <span>IF EXISTS (--if-exists)</span>
                </label>
                {!isClusterMode && (
                  <label className="pgb-toggle-item">
                    <input type="checkbox" checked={req.createDb} onChange={(e) => patch({ createDb: e.target.checked })} />
                    <span>CREATE DATABASE (--create)</span>
                  </label>
                )}
                <label className="pgb-toggle-item">
                  <input type="checkbox" checked={req.noOwner} onChange={(e) => patch({ noOwner: e.target.checked })} />
                  <span>No Owner (--no-owner)</span>
                </label>
                <label className="pgb-toggle-item">
                  <input type="checkbox" checked={req.noPrivileges} onChange={(e) => patch({ noPrivileges: e.target.checked })} />
                  <span>No Privileges (--no-acl)</span>
                </label>
                <label className="pgb-toggle-item">
                  <input type="checkbox" checked={req.noTablespaces} onChange={(e) => patch({ noTablespaces: e.target.checked })} />
                  <span>No Tablespaces</span>
                </label>
                {!isClusterMode && (
                  <label className="pgb-toggle-item">
                    <input type="checkbox" checked={req.includeBlobs} onChange={(e) => patch({ includeBlobs: e.target.checked })} />
                    <span>Include Large Objects</span>
                  </label>
                )}
                <label className="pgb-toggle-item">
                  <input type="checkbox" checked={req.inserts} onChange={(e) => patch({ inserts: e.target.checked })} />
                  <span>INSERTs instead of COPY</span>
                </label>
                <label className="pgb-toggle-item">
                  <input type="checkbox" checked={req.columnInserts} onChange={(e) => patch({ columnInserts: e.target.checked })} />
                  <span>Column INSERTs</span>
                </label>
                {!isClusterMode && (
                  <label className="pgb-toggle-item">
                    <input
                      type="checkbox"
                      checked={req.includeStatistics}
                      onChange={(e) => patch({ includeStatistics: e.target.checked, noStatistics: false })}
                    />
                    <span>Include Stats (PG 18+)</span>
                  </label>
                )}
              </div>

              {/* PG 17+ --filter Rule Builder */}
              {!isClusterMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4, borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="pgb-field-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span>Multi-Level --filter Rules</span>
                      <span className="pgb-version-pill">PG 17+</span>
                    </span>
                    <button
                      type="button"
                      className="rbac-btn"
                      onClick={() =>
                        patch({
                          filterRules: [
                            ...req.filterRules,
                            { action: 'exclude', objectType: 'table_data', pattern: '' },
                          ],
                        })
                      }
                    >
                      <Plus size={11} />
                      <span>Add Filter Rule</span>
                    </button>
                  </div>
                  {req.filterRules.map((rule, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select
                        className="rbac-select"
                        value={rule.action}
                        onChange={(e) => updateFilterRule(idx, { action: e.target.value as any })}
                      >
                        <option value="include">include</option>
                        <option value="exclude">exclude</option>
                      </select>
                      <select
                        className="rbac-select"
                        value={rule.objectType}
                        onChange={(e) => updateFilterRule(idx, { objectType: e.target.value as any })}
                      >
                        <option value="table">table</option>
                        <option value="table_data">table_data</option>
                        <option value="schema">schema</option>
                        <option value="extension">extension</option>
                        <option value="foreign_data">foreign_data</option>
                      </select>
                      <input
                        className="rbac-input rbac-mono"
                        style={{ flex: 1 }}
                        placeholder="Pattern e.g. public.audit_*"
                        value={rule.pattern}
                        onChange={(e) => updateFilterRule(idx, { pattern: e.target.value })}
                      />
                      <button
                        type="button"
                        className="rbac-icon-btn"
                        style={{ color: 'var(--accent-red)' }}
                        onClick={() => patch({ filterRules: req.filterRules.filter((_, i) => i !== idx) })}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="pgb-field-grid">
                <div className="pgb-field">
                  <label className="pgb-field-label">Lock Wait Timeout</label>
                  <input
                    className="rbac-input rbac-mono"
                    placeholder="e.g. 5000ms or 10s"
                    value={req.lockWaitTimeout}
                    onChange={(e) => patch({ lockWaitTimeout: e.target.value })}
                  />
                </div>
                {!isClusterMode && (
                  <div className="pgb-field">
                    <label className="pgb-field-label">Encoding</label>
                    <input
                      className="rbac-input rbac-mono"
                      placeholder="e.g. UTF8"
                      value={req.encoding}
                      onChange={(e) => patch({ encoding: e.target.value })}
                    />
                  </div>
                )}
                {isClusterMode && (
                  <div className="pgb-field">
                    <label className="pgb-field-label">Exclude Databases (comma-separated)</label>
                    <input
                      className="rbac-input rbac-mono"
                      placeholder="e.g. template*, dev_tmp"
                      value={req.excludeDatabases.join(', ')}
                      onChange={(e) =>
                        patch({
                          excludeDatabases: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </div>
                )}
                <div className="pgb-field">
                  <label className="pgb-field-label">Extra CLI Flags</label>
                  <input
                    className="rbac-input rbac-mono"
                    placeholder="e.g. --verbose --serializable-deferrable"
                    value={req.extraArgs}
                    onChange={(e) => patch({ extraArgs: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom Save Backup Template Modal */}
      {showSaveModal && (
        <div className="rbac-modal-backdrop" onClick={() => setShowSaveModal(false)}>
          <form
            className="rbac-modal"
            style={{ maxWidth: 460, padding: 20, gap: 14 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleConfirmSaveTemplate}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowSaveModal(false);
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <BookmarkPlus size={18} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-main)' }}>
                Save Backup Configuration Template
              </h3>
            </div>

            <div className="pgb-field">
              <label htmlFor="pgb-template-name" className="pgb-field-label">
                Template Name
              </label>
              <input
                id="pgb-template-name"
                type="text"
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                className="rbac-input rbac-mono"
                placeholder="e.g. prod_daily_zstd"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                required
              />
            </div>

            <div
              className="rbac-card"
              style={{
                padding: '8px 10px',
                fontSize: 11.5,
                color: 'var(--text-muted)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span>Mode: <strong className="rbac-mono">{req.mode}</strong></span>
              <span>· DB: <strong className="rbac-mono">{req.database || 'cluster'}</strong></span>
              <span>· Format: <strong className="rbac-mono">{req.format}</strong></span>
              <span>· Compression: <strong className="rbac-mono">{req.compression}</strong></span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="rbac-btn"
                onClick={() => setShowSaveModal(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rbac-btn rbac-btn-primary"
                disabled={!templateName.trim()}
              >
                <BookmarkPlus size={12} />
                <span>Save Template</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
