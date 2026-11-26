import React, { useState } from 'react';
import {
  HardDrive,
  GitBranch,
  Layers,
  ShieldCheck,
  FolderOpen,
  Plus,
  Trash2,
  Clock,
  Copy,
  Check,
} from 'lucide-react';
import {
  BackupCatalog,
  PhysicalBackupRequest,
  PitrStatus,
  ToolchainInfo,
} from '../../../../types/pgbackup';
import {
  GetPgPitrStatus,
  PickPgBackupOutputPath,
  PickPgRestoreSource,
} from '../../../../../wailsjs/go/main/App';
import { buildTimestampedChildPath } from '../utils/pathHelpers';

interface PhysicalBackupPanelProps {
  req: PhysicalBackupRequest;
  onChange: (next: PhysicalBackupRequest) => void;
  catalog: BackupCatalog | null;
  toolchain: ToolchainInfo | null;
}

export const PhysicalBackupPanel: React.FC<PhysicalBackupPanelProps> = ({
  req,
  onChange,
  catalog,
  toolchain,
}) => {
  const [pitrStatus, setPitrStatus] = useState<PitrStatus | null>(null);
  const [pitrLoading, setPitrLoading] = useState(false);
  const [pitrTargetType, setPitrTargetType] = useState<'time' | 'lsn' | 'immediate'>('time');
  const [pitrTargetVal, setPitrTargetVal] = useState('2026-11-26 12:00:00 UTC');
  const [pitrOs, setPitrOs] = useState<'linux' | 'windows'>(() =>
    toolchain?.hostOs === 'windows' ? 'windows' : 'linux',
  );
  const [copiedPitr, setCopiedPitr] = useState(false);

  const supportsInc = toolchain?.capabilities?.supportsIncremental ?? true;
  const customTablespaces = (catalog?.tablespaces ?? []).filter(
    (t) => t.name !== 'pg_default' && t.name !== 'pg_global' && t.location,
  );

  const patch = (p: Partial<PhysicalBackupRequest>) => onChange({ ...req, ...p });

  const browseDir = async (target: 'outputDir' | 'verifyBackupDir') => {
    try {
      const chosen = await PickPgBackupOutputPath('basebackup', '');
      if (!chosen) return;
      if (target === 'outputDir') {
        patch({ outputDir: buildTimestampedChildPath(chosen, `pg_${req.operation}`) });
      } else {
        patch({ verifyBackupDir: chosen });
      }
    } catch {}
  };

  const browseManifest = async () => {
    try {
      const chosen = await PickPgRestoreSource(false);
      if (chosen) patch({ incrementalManifestPath: chosen });
    } catch {}
  };

  const addCombineDir = async () => {
    try {
      const chosen = await PickPgRestoreSource(true);
      if (chosen && !req.combineSourceDirs.includes(chosen)) {
        patch({ combineSourceDirs: [...req.combineSourceDirs, chosen] });
      }
    } catch {}
  };

  const populateClusterTablespaces = () => {
    const existing = new Map(req.tablespaceMappings.map((m) => [m.oldDir, m.newDir]));
    const next = customTablespaces.map((ts) => ({
      oldDir: ts.location,
      newDir: existing.get(ts.location) || '',
    }));
    patch({ tablespaceMappings: next.length > 0 ? next : [{ oldDir: '', newDir: '' }] });
  };

  const loadPitrStatus = async () => {
    setPitrLoading(true);
    try {
      const st = await GetPgPitrStatus();
      setPitrStatus(st);
    } catch {} finally {
      setPitrLoading(false);
    }
  };

  const pitrSnippet = (() => {
    const restoreCmd =
      pitrOs === 'windows'
        ? `copy "D:\\pg_wal_archive\\%f" "%p"`
        : `cp /var/lib/postgresql/wal_archive/%f %p`;
    const targetLine =
      pitrTargetType === 'time'
        ? `recovery_target_time = '${pitrTargetVal}'`
        : pitrTargetType === 'lsn'
          ? `recovery_target_lsn = '${pitrTargetVal}'`
          : `recovery_target = 'immediate'`;
    const touchSignal =
      pitrOs === 'windows'
        ? `# In target $PGDATA:\nNew-Item -ItemType File -Path "recovery.signal" -Force`
        : `# In target $PGDATA:\ntouch recovery.signal`;
    return `${touchSignal}\n\n# Append to postgresql.auto.conf:\nrestore_command = '${restoreCmd}'\n${targetLine}\nrecovery_target_action = 'promote'`;
  })();

  const copyPitr = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(pitrSnippet);
      setCopiedPitr(true);
      setTimeout(() => setCopiedPitr(false), 1600);
    }
  };

  const opCards: Array<{
    key: PhysicalBackupRequest['operation'];
    title: string;
    desc: string;
    icon: React.ReactNode;
    badge?: string;
  }> = [
    {
      key: 'basebackup',
      title: 'Full Base Backup',
      desc: 'pg_basebackup physical cluster snapshot + WAL',
      icon: <HardDrive size={13} />,
    },
    {
      key: 'incremental',
      title: 'Incremental Backup',
      desc: 'Block-level delta from prior backup_manifest',
      icon: <GitBranch size={13} />,
      badge: 'PG 17+',
    },
    {
      key: 'combine',
      title: 'Combine Incrementals',
      desc: 'pg_combinebackup merges full + incrementals',
      icon: <Layers size={13} />,
      badge: 'PG 17+',
    },
    {
      key: 'verify',
      title: 'Verify Backup',
      desc: 'pg_verifybackup checksum & manifest validation',
      icon: <ShieldCheck size={13} />,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', gap: 12 }}>
      {/* Sticky Operation Selector */}
      <div className="rbac-sticky-controls" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="pgb-mode-grid">
          {opCards.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`pgb-mode-card ${req.operation === c.key ? 'active' : ''}`}
              onClick={() => patch({ operation: c.key })}
            >
              <div className="pgb-mode-card-title" style={{ width: '100%', justifyContent: 'space-between' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {c.icon}
                  <span>{c.title}</span>
                </span>
                {c.badge && <span className="pgb-version-pill">{c.badge}</span>}
              </div>
              <span className="pgb-mode-card-desc">{c.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Configuration */}
      <div className="rbac-scroll-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 4 }}>
        {(req.operation === 'basebackup' || req.operation === 'incremental') && (
          <>
            <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span className="rbac-section-title">Destination &amp; WAL Streaming</span>

              <div className="pgb-field">
                <label className="pgb-field-label">Target Empty Output Directory (-D)</label>
                <div className="pgb-input-row">
                  <input
                    className="rbac-input rbac-mono"
                    style={{ flex: 1 }}
                    placeholder={
                      toolchain?.hostOs === 'windows'
                        ? 'e.g. D:\\Backups\\pg_basebackup_dir'
                        : 'e.g. /var/backups/postgresql/basebackup_dir'
                    }
                    value={req.outputDir}
                    onChange={(e) => patch({ outputDir: e.target.value })}
                  />
                  <button type="button" className="rbac-btn" onClick={() => browseDir('outputDir')}>
                    <FolderOpen size={12} />
                    <span>Browse…</span>
                  </button>
                </div>
              </div>

              {req.operation === 'incremental' && (
                <div className="pgb-field">
                  <label className="pgb-field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Prior Backup Manifest (--incremental)</span>
                    <span className="pgb-version-pill">PG 17+</span>
                    {!supportsInc && (
                      <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>
                        Requires client v17+
                      </span>
                    )}
                  </label>
                  <div className="pgb-input-row">
                    <input
                      className="rbac-input rbac-mono"
                      style={{ flex: 1 }}
                      placeholder="Select previous backup_manifest file"
                      value={req.incrementalManifestPath}
                      onChange={(e) => patch({ incrementalManifestPath: e.target.value })}
                    />
                    <button type="button" className="rbac-btn" onClick={browseManifest}>
                      <FolderOpen size={12} />
                      <span>Pick Manifest…</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="pgb-field-grid">
                <div className="pgb-field">
                  <label className="pgb-field-label">Format (-F)</label>
                  <select
                    className="rbac-select"
                    value={req.format}
                    onChange={(e) => patch({ format: e.target.value as 'plain' | 'tar' })}
                  >
                    <option value="plain">Plain Directory (-Fp)</option>
                    <option value="tar">Tar Archives (-Ft)</option>
                  </select>
                </div>
                <div className="pgb-field">
                  <label className="pgb-field-label">WAL Method (-X)</label>
                  <select
                    className="rbac-select"
                    value={req.walMethod}
                    onChange={(e) => patch({ walMethod: e.target.value as any })}
                  >
                    <option value="stream">Stream WALs (-X stream)</option>
                    <option value="fetch">Fetch WALs (-X fetch)</option>
                    <option value="none">None (-X none)</option>
                  </select>
                </div>
                <div className="pgb-field">
                  <label className="pgb-field-label">Checkpoint (-c)</label>
                  <select
                    className="rbac-select"
                    value={req.checkpoint}
                    onChange={(e) => patch({ checkpoint: e.target.value as 'fast' | 'spread' })}
                  >
                    <option value="fast">Fast Immediate (-c fast)</option>
                    <option value="spread">Spread Out (-c spread)</option>
                  </select>
                </div>
                <div className="pgb-field">
                  <label className="pgb-field-label">Compression</label>
                  <select
                    className="rbac-select"
                    value={req.compression}
                    onChange={(e) => patch({ compression: e.target.value })}
                  >
                    <option value="none">None</option>
                    <option value="server-zstd">Server Zstd (Fast)</option>
                    <option value="zstd">Client Zstd</option>
                    <option value="server-lz4">Server LZ4</option>
                    <option value="lz4">Client LZ4</option>
                    <option value="server-gzip">Server Gzip</option>
                    <option value="gzip">Client Gzip</option>
                  </select>
                </div>
                <div className="pgb-field">
                  <label className="pgb-field-label">Manifest Checksums</label>
                  <select
                    className="rbac-select"
                    value={req.manifestChecksums}
                    onChange={(e) => patch({ manifestChecksums: e.target.value as any })}
                  >
                    <option value="SHA256">SHA256 (Recommended)</option>
                    <option value="CRC32C">CRC32C</option>
                    <option value="NONE">NONE</option>
                  </select>
                </div>
                <div className="pgb-field">
                  <label className="pgb-field-label">Max Transfer Rate</label>
                  <input
                    className="rbac-input rbac-mono"
                    placeholder="e.g. 50M (optional)"
                    value={req.maxRate}
                    onChange={(e) => patch({ maxRate: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Tablespace Mappings */}
            <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span className="rbac-section-title">
                  Tablespace Directory Mapping (-T olddir=newdir)
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {customTablespaces.length > 0 && (
                    <button type="button" className="rbac-btn" onClick={populateClusterTablespaces}>
                      Load Cluster Tablespaces ({customTablespaces.length})
                    </button>
                  )}
                  <button
                    type="button"
                    className="rbac-btn"
                    onClick={() =>
                      patch({ tablespaceMappings: [...req.tablespaceMappings, { oldDir: '', newDir: '' }] })
                    }
                  >
                    <Plus size={11} />
                    <span>Add Mapping</span>
                  </button>
                </div>
              </div>

              {req.tablespaceMappings.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  No custom tablespace path remapping configured. Required on Windows/single-host backups when non-default tablespaces exist.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {req.tablespaceMappings.map((m, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        className="rbac-input rbac-mono"
                        style={{ flex: 1 }}
                        placeholder="Source cluster tablespace dir"
                        value={m.oldDir}
                        onChange={(e) => {
                          const next = [...req.tablespaceMappings];
                          next[idx] = { ...next[idx], oldDir: e.target.value };
                          patch({ tablespaceMappings: next });
                        }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>=</span>
                      <input
                        className="rbac-input rbac-mono"
                        style={{ flex: 1 }}
                        placeholder="Backup destination dir"
                        value={m.newDir}
                        onChange={(e) => {
                          const next = [...req.tablespaceMappings];
                          next[idx] = { ...next[idx], newDir: e.target.value };
                          patch({ tablespaceMappings: next });
                        }}
                      />
                      <button
                        type="button"
                        className="rbac-icon-btn"
                        style={{ color: 'var(--accent-red)' }}
                        onClick={() =>
                          patch({ tablespaceMappings: req.tablespaceMappings.filter((_, i) => i !== idx) })
                        }
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {req.operation === 'combine' && (
          <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="rbac-section-title">
                Synthesize Full Backup with pg_combinebackup <span className="pgb-version-pill">PG 17+</span>
              </span>
              <button type="button" className="rbac-btn" onClick={addCombineDir}>
                <Plus size={11} />
                <span>Add Backup Dir</span>
              </button>
            </div>

            <div className="pgb-field">
              <label className="pgb-field-label">Synthesized Full Output Directory (-o)</label>
              <div className="pgb-input-row">
                <input
                  className="rbac-input rbac-mono"
                  style={{ flex: 1 }}
                  placeholder="e.g. D:\Backups\synthesized_full"
                  value={req.outputDir}
                  onChange={(e) => patch({ outputDir: e.target.value })}
                />
                <button type="button" className="rbac-btn" onClick={() => browseDir('outputDir')}>
                  <FolderOpen size={12} />
                  <span>Browse…</span>
                </button>
              </div>
            </div>

            <div className="pgb-field">
              <label className="pgb-field-label">
                Ordered Chain Directories (Oldest Full Base First → Incremental 1 → Incremental N)
              </label>
              {req.combineSourceDirs.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Click &quot;Add Backup Dir&quot; to add the full backup directory followed by each incremental directory in chronological order.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {req.combineSourceDirs.map((dir, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span className="rbac-badge" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                        {idx === 0 ? 'FULL' : `INC ${idx}`}
                      </span>
                      <input
                        className="rbac-input rbac-mono"
                        style={{ flex: 1 }}
                        value={dir}
                        onChange={(e) => {
                          const next = [...req.combineSourceDirs];
                          next[idx] = e.target.value;
                          patch({ combineSourceDirs: next });
                        }}
                      />
                      <button
                        type="button"
                        className="rbac-icon-btn"
                        style={{ color: 'var(--accent-red)' }}
                        onClick={() =>
                          patch({ combineSourceDirs: req.combineSourceDirs.filter((_, i) => i !== idx) })
                        }
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {req.operation === 'verify' && (
          <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span className="rbac-section-title">Verify Physical Backup Integrity (pg_verifybackup)</span>
            <div className="pgb-field">
              <label className="pgb-field-label">Physical Backup Directory (containing backup_manifest)</label>
              <div className="pgb-input-row">
                <input
                  className="rbac-input rbac-mono"
                  style={{ flex: 1 }}
                  placeholder="e.g. D:\Backups\pg_physical_base"
                  value={req.verifyBackupDir}
                  onChange={(e) => patch({ verifyBackupDir: e.target.value })}
                />
                <button type="button" className="rbac-btn" onClick={() => browseDir('verifyBackupDir')}>
                  <FolderOpen size={12} />
                  <span>Browse…</span>
                </button>
              </div>
            </div>
            <label className="pgb-toggle-item" style={{ width: 'fit-content' }}>
              <input
                type="checkbox"
                checked={req.verifyNoParseWals}
                onChange={(e) => patch({ verifyNoParseWals: e.target.checked })}
              />
              <span>Skip WAL parsing (-n / --no-parse-wal)</span>
            </label>
          </div>
        )}

        {/* PITR Readiness & Recovery Signal Generator */}
        <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span className="rbac-section-title">
              <Clock size={12} />
              <span>PITR Readiness (pg_stat_archiver) &amp; Recovery Config Generator</span>
            </span>
            <button type="button" className="rbac-btn" disabled={pitrLoading} onClick={loadPitrStatus}>
              {pitrLoading ? 'Checking…' : 'Check Archiver Status'}
            </button>
          </div>

          {pitrStatus && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11.5 }}>
              <span className="rbac-stat-pill">wal_level: <strong className="rbac-mono">{pitrStatus.walLevel}</strong></span>
              <span className="rbac-stat-pill">archive_mode: <strong className="rbac-mono">{pitrStatus.archiveMode}</strong></span>
              <span className="rbac-stat-pill">Archived: <strong>{pitrStatus.archivedCount}</strong></span>
              <span className="rbac-stat-pill" style={{ color: pitrStatus.failedCount > 0 ? 'var(--accent-red)' : undefined }}>
                Failed: <strong>{pitrStatus.failedCount}</strong>
              </span>
              {pitrStatus.lastArchivedWal && (
                <span className="rbac-stat-pill rbac-mono">Last WAL: {pitrStatus.lastArchivedWal}</span>
              )}
            </div>
          )}

          <div className="pgb-field-grid">
            <div className="pgb-field">
              <label className="pgb-field-label">Recovery Target</label>
              <select
                className="rbac-select"
                value={pitrTargetType}
                onChange={(e) => setPitrTargetType(e.target.value as any)}
              >
                <option value="time">Point-in-Time (Timestamp)</option>
                <option value="lsn">Exact WAL LSN</option>
                <option value="immediate">Immediate Consistent Point</option>
              </select>
            </div>
            {pitrTargetType !== 'immediate' && (
              <div className="pgb-field">
                <label className="pgb-field-label">Target Value</label>
                <input
                  className="rbac-input rbac-mono"
                  value={pitrTargetVal}
                  onChange={(e) => setPitrTargetVal(e.target.value)}
                />
              </div>
            )}
            <div className="pgb-field">
              <label className="pgb-field-label">Target Server OS</label>
              <select
                className="rbac-select"
                value={pitrOs}
                onChange={(e) => setPitrOs(e.target.value as 'linux' | 'windows')}
              >
                <option value="linux">Ubuntu / AlmaLinux / RHEL</option>
                <option value="windows">Windows Server</option>
              </select>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <pre className="pgb-cli-preview" style={{ maxHeight: 130 }}>{pitrSnippet}</pre>
            <button
              type="button"
              className="rbac-btn"
              style={{ position: 'absolute', top: 6, right: 6, padding: '2px 8px', fontSize: 11 }}
              onClick={copyPitr}
            >
              {copiedPitr ? <Check size={11} /> : <Copy size={11} />}
              <span>{copiedPitr ? 'Copied' : 'Copy PITR'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
