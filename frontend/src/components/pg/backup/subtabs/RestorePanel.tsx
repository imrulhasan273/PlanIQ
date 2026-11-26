import React, { useMemo, useState } from 'react';
import { FolderOpen, FileSearch, AlertCircle, Zap } from 'lucide-react';
import {
  BackupCatalog,
  MultiDbManifest,
  RestoreRequest,
  TocEntry,
  ToolchainInfo,
} from '../../../../types/pgbackup';
import {
  InspectPgBackupTOC,
  InspectPgMultiDbManifest,
  PickPgRestoreSource,
} from '../../../../../wailsjs/go/main/App';
import {
  DynamicTableFilter,
  DynamicColumnFilter,
  DynamicFilterColumn,
  applyDynamicFilters,
  createDefaultDynamicFilter,
} from '../../rbac/components/DynamicTableFilter';

interface RestorePanelProps {
  req: RestoreRequest;
  onChange: (next: RestoreRequest) => void;
  catalog: BackupCatalog | null;
  toolchain: ToolchainInfo | null;
}

export const RestorePanel: React.FC<RestorePanelProps> = ({ req, onChange, catalog, toolchain }) => {
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([]);
  const [manifest, setManifest] = useState<MultiDbManifest | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [tocFilters, setTocFilters] = useState<DynamicColumnFilter[]>(() => [
    createDefaultDynamicFilter('__any__'),
  ]);

  const patch = (p: Partial<RestoreRequest>) => onChange({ ...req, ...p });

  const pickFile = async () => {
    try {
      const p = await PickPgRestoreSource(false);
      if (!p) return;
      const lower = p.toLowerCase();
      const nextKind = lower.endsWith('.sql')
        ? 'plain_sql'
        : lower.endsWith('planiq-backup-manifest.json')
          ? 'multi_db_manifest'
          : 'archive';
      patch({ sourcePath: p, sourceKind: nextKind, selectedTocIds: [] });
      setTocEntries([]);
      setManifest(null);
    } catch {}
  };

  const pickDir = async () => {
    try {
      const p = await PickPgRestoreSource(true);
      if (!p) return;
      patch({ sourcePath: p, selectedTocIds: [] });
      setTocEntries([]);
      setManifest(null);
    } catch {}
  };

  const handleInspect = async () => {
    if (!req.sourcePath.trim()) return;
    setInspectLoading(true);
    setInspectError(null);
    try {
      if (req.sourceKind === 'multi_db_manifest') {
        const m = await InspectPgMultiDbManifest(req.sourcePath);
        setManifest(m);
        patch({
          selectedDatabases: (m?.entries ?? []).map((e: any) => e.database),
        });
      } else if (req.sourceKind === 'archive') {
        const entries = await InspectPgBackupTOC(req.sourcePath);
        setTocEntries(entries ?? []);
      }
    } catch (e: any) {
      setInspectError(e?.message || String(e));
    } finally {
      setInspectLoading(false);
    }
  };

  const tocFilterCols = useMemo<DynamicFilterColumn[]>(
    () => [
      { id: '__any__', label: 'All Columns', placeholder: 'Filter TOC objects by schema, name, type...' },
      { id: 'section', label: 'Section', options: ['pre-data', 'data', 'post-data'] },
      { id: 'objectType', label: 'Object Type' },
      { id: 'schema', label: 'Schema' },
      { id: 'name', label: 'Object Name' },
      { id: 'owner', label: 'Owner' },
    ],
    [],
  );

  const filteredToc = useMemo(
    () =>
      applyDynamicFilters(tocEntries, tocFilters, tocFilterCols, (e, colId) => {
        if (colId === 'section') return e.section;
        if (colId === 'objectType') return e.objectType;
        if (colId === 'schema') return e.schema;
        if (colId === 'name') return e.name;
        if (colId === 'owner') return e.owner;
        return `${e.section} ${e.objectType} ${e.schema} ${e.name} ${e.owner}`;
      }),
    [tocEntries, tocFilters, tocFilterCols],
  );

  const selectedTocSet = useMemo(() => new Set(req.selectedTocIds), [req.selectedTocIds]);

  const toggleTocId = (id: number) => {
    const next = new Set(selectedTocSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    patch({ selectedTocIds: Array.from(next) });
  };

  const databases = catalog?.databases ?? [];

  const applyTurboRestore = () => {
    const jobs = toolchain?.recommendedJobs || 4;
    patch({
      parallelJobs: req.sourceKind === 'archive' ? jobs : 1,
      singleTransaction: false,
      boostRestore: true,
      boostMem: '512MB',
      runAnalyzeAfter: true,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', gap: 12 }}>
      {/* Sticky Source Picker & Inspect Bar */}
      <div className="rbac-sticky-controls" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {(
            [
              { key: 'archive', label: 'Archive (.dump / .tar / Dir)' },
              { key: 'plain_sql', label: 'Plain SQL / Cluster Script (.sql)' },
              { key: 'multi_db_manifest', label: 'Multi-DB Manifest Batch' },
            ] as const
          ).map((k) => (
            <button
              key={k.key}
              type="button"
              className={`rbac-btn ${req.sourceKind === k.key ? 'rbac-btn-primary' : ''}`}
              onClick={() => {
                setTocEntries([]);
                setManifest(null);
                setInspectError(null);
                patch({ sourceKind: k.key, selectedTocIds: [], selectedDatabases: [] });
              }}
            >
              {k.label}
            </button>
          ))}
          <div className="rbac-spacer" />
          <button
            type="button"
            className="rbac-btn"
            style={{ borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)', background: 'rgba(245, 158, 11, 0.10)' }}
            onClick={applyTurboRestore}
            title="Enable parallel workers, PGOPTIONS speed boost (synchronous_commit=off + 512MB maintenance_work_mem), and post-restore ANALYZE"
          >
            <Zap size={12} />
            <span>Turbo Parallel Restore (-j {toolchain?.recommendedJobs || 4})</span>
          </button>
        </div>

        <div className="rbac-card" style={{ padding: '10px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="pgb-field" style={{ flex: 1, minWidth: 260 }}>
            <label className="pgb-field-label">Backup Source Path</label>
            <div className="pgb-input-row">
              <input
                className="rbac-input rbac-mono"
                style={{ flex: 1 }}
                placeholder="Select .dump, .tar, .sql file or backup directory..."
                value={req.sourcePath}
                onChange={(e) => patch({ sourcePath: e.target.value })}
              />
              <button type="button" className="rbac-btn" onClick={pickFile}>
                <FolderOpen size={12} />
                <span>File…</span>
              </button>
              <button type="button" className="rbac-btn" onClick={pickDir}>
                <FolderOpen size={12} />
                <span>Folder…</span>
              </button>
              {req.sourceKind !== 'plain_sql' && (
                <button
                  type="button"
                  className="rbac-btn rbac-btn-primary"
                  disabled={!req.sourcePath.trim() || inspectLoading}
                  onClick={handleInspect}
                >
                  <FileSearch size={12} />
                  <span>
                    {inspectLoading
                      ? 'Inspecting…'
                      : req.sourceKind === 'multi_db_manifest'
                        ? 'Load Manifest'
                        : 'Inspect TOC'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Configuration + Selective TOC Table */}
      <div className="rbac-scroll-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
        {inspectError && (
          <div className="rbac-empty-error-box" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={14} />
            <span>{inspectError}</span>
          </div>
        )}

        {/* Selective Archive TOC Inspector */}
        {req.sourceKind === 'archive' && tocEntries.length > 0 && (
          <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span className="rbac-section-title">
                Archive Table of Contents ({req.selectedTocIds.length === 0 ? 'All items will be restored' : `${req.selectedTocIds.length} selective items checked`})
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="rbac-btn"
                  onClick={() => {
                    const next = new Set(req.selectedTocIds);
                    filteredToc.forEach((e) => next.add(e.id));
                    patch({ selectedTocIds: Array.from(next) });
                  }}
                >
                  Select Matching ({filteredToc.length})
                </button>
                <button
                  type="button"
                  className="rbac-btn"
                  onClick={() => patch({ selectedTocIds: [] })}
                >
                  Restore All (Clear Selective)
                </button>
              </div>
            </div>

            <DynamicTableFilter
              columns={tocFilterCols}
              filters={tocFilters}
              onChange={setTocFilters}
              totalCount={tocEntries.length}
              filteredCount={filteredToc.length}
              itemLabel="TOC items"
              compact
            />

            <div className="rbac-table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
              <table className="rbac-table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }} className="center">Sel</th>
                    <th style={{ width: 62 }}>ID</th>
                    <th>Section</th>
                    <th>Type</th>
                    <th>Schema</th>
                    <th>Object</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredToc.map((e) => {
                    const isChecked = selectedTocSet.has(e.id);
                    return (
                      <tr key={e.id} onClick={() => toggleTocId(e.id)} style={{ cursor: 'pointer' }}>
                        <td className="center" onClick={(ev) => ev.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleTocId(e.id)}
                          />
                        </td>
                        <td className="rbac-mono" style={{ fontSize: 11 }}>{e.id}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.section}</td>
                        <td className="rbac-mono" style={{ fontSize: 11 }}>{e.objectType}</td>
                        <td className="rbac-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.schema || '—'}</td>
                        <td className="rbac-mono"><strong>{e.name || '—'}</strong></td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.owner || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Multi-DB Manifest Selector */}
        {req.sourceKind === 'multi_db_manifest' && manifest && (
          <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="rbac-section-title">
              Databases in Manifest ({manifest.entries.length} backups · Format: {manifest.format})
            </span>
            {manifest.globalsFile && (
              <label className="pgb-toggle-item" style={{ width: 'fit-content' }}>
                <input
                  type="checkbox"
                  checked={req.restoreGlobals}
                  onChange={(e) => patch({ restoreGlobals: e.target.checked })}
                />
                <span>Restore cluster globals first ({manifest.globalsFile})</span>
              </label>
            )}
            <div className="pgb-toggle-grid">
              {manifest.entries.map((entry) => (
                <label key={entry.database} className="pgb-toggle-item rbac-mono">
                  <input
                    type="checkbox"
                    checked={req.selectedDatabases.includes(entry.database)}
                    onChange={() => {
                      const next = req.selectedDatabases.includes(entry.database)
                        ? req.selectedDatabases.filter((x) => x !== entry.database)
                        : [...req.selectedDatabases, entry.database];
                      patch({ selectedDatabases: next });
                    }}
                  />
                  <span>{entry.database}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Target & Restore Flags */}
        <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="rbac-section-title">Target Database &amp; Restore Behavior</span>

          <div className="pgb-field-grid">
            {req.sourceKind !== 'multi_db_manifest' && (
              <div className="pgb-field">
                <label className="pgb-field-label">Target Database</label>
                <select
                  className="rbac-select"
                  value={req.targetDatabase}
                  onChange={(e) => patch({ targetDatabase: e.target.value })}
                >
                  {databases.length === 0 ? (
                    <option value={req.targetDatabase}>{req.targetDatabase}</option>
                  ) : (
                    databases.map((d) => (
                      <option key={d.name} value={d.name}>{d.name}</option>
                    ))
                  )}
                </select>
              </div>
            )}

            {req.sourceKind !== 'plain_sql' && (
              <>
                <div className="pgb-field">
                  <label className="pgb-field-label">Content Scope</label>
                  <select
                    className="rbac-select"
                    value={req.contentMode}
                    onChange={(e) => patch({ contentMode: e.target.value as any })}
                  >
                    <option value="full">Full (Schema + Data)</option>
                    <option value="schema_only">Structure Only (--schema-only)</option>
                    <option value="data_only">Data Only (--data-only)</option>
                  </select>
                </div>

                <div className="pgb-field">
                  <label className="pgb-field-label">Parallel Workers (-j)</label>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    className="rbac-input rbac-mono"
                    value={req.parallelJobs}
                    onChange={(e) => patch({ parallelJobs: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </div>
              </>
            )}

            <div className="pgb-field">
              <label className="pgb-field-label">Extra CLI Flags</label>
              <input
                className="rbac-input rbac-mono"
                placeholder="e.g. --verbose"
                value={req.extraArgs}
                onChange={(e) => patch({ extraArgs: e.target.value })}
              />
            </div>
          </div>

          <div className="pgb-toggle-grid">
            {req.sourceKind !== 'plain_sql' && (
              <>
                <label className="pgb-toggle-item">
                  <input type="checkbox" checked={req.createDb} onChange={(e) => patch({ createDb: e.target.checked })} />
                  <span>Create Database (--create)</span>
                </label>
                <label className="pgb-toggle-item" style={{ borderColor: req.clean ? 'var(--accent-red)' : undefined }}>
                  <input type="checkbox" checked={req.clean} onChange={(e) => patch({ clean: e.target.checked })} />
                  <span>Drop Existing (--clean)</span>
                </label>
                <label className="pgb-toggle-item">
                  <input type="checkbox" checked={req.ifExists} onChange={(e) => patch({ ifExists: e.target.checked })} />
                  <span>IF EXISTS (--if-exists)</span>
                </label>
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
                <label className="pgb-toggle-item">
                  <input type="checkbox" checked={req.disableTriggers} onChange={(e) => patch({ disableTriggers: e.target.checked })} />
                  <span>Disable Triggers</span>
                </label>
                <label className="pgb-toggle-item">
                  <input type="checkbox" checked={req.exitOnError} onChange={(e) => patch({ exitOnError: e.target.checked })} />
                  <span>Exit on Error</span>
                </label>
              </>
            )}
            <label className="pgb-toggle-item">
              <input
                type="checkbox"
                checked={req.singleTransaction}
                onChange={(e) => patch({ singleTransaction: e.target.checked })}
              />
              <span>Single Transaction (-1)</span>
            </label>
            <label
              className="pgb-toggle-item"
              style={{ borderColor: req.boostRestore ? 'var(--accent-amber)' : undefined }}
              title="Passes PGOPTIONS=-c synchronous_commit=off -c maintenance_work_mem=... to accelerate index creation & COPY"
            >
              <input
                type="checkbox"
                checked={req.boostRestore}
                onChange={(e) => patch({ boostRestore: e.target.checked })}
              />
              <span>Speed Boost (PGOPTIONS)</span>
            </label>
            <label className="pgb-toggle-item">
              <input
                type="checkbox"
                checked={req.runAnalyzeAfter}
                onChange={(e) => patch({ runAnalyzeAfter: e.target.checked })}
              />
              <span>Post-Restore ANALYZE</span>
            </label>
          </div>

          {req.boostRestore && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span className="pgb-field-label">maintenance_work_mem (PGOPTIONS):</span>
              <select
                className="rbac-select"
                value={req.boostMem}
                onChange={(e) => patch({ boostMem: e.target.value })}
              >
                <option value="256MB">256MB</option>
                <option value="512MB">512MB (Recommended)</option>
                <option value="1GB">1GB</option>
                <option value="2GB">2GB</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
