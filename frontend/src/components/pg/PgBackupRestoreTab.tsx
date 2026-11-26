import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  Database,
  RotateCcw,
  History,
  FolderCog,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ArrowRightLeft,
  Copy,
  Check,
  Save,
} from 'lucide-react';
import { ConnectionStatus, DBConnectionProfile } from '../../types/livedb';
import {
  BackupCatalog,
  BackupCommandPreview,
  BackupLogEvent,
  BackupProgressEvent,
  BackupStatusEvent,
  DirectCloneRequest,
  DiskSpaceInfo,
  LogicalBackupRequest,
  PgBackupJobRecord,
  PgBackupProfile,
  PhysicalBackupRequest,
  RestoreRequest,
  ToolchainInfo,
} from '../../types/pgbackup';
import {
  CancelPgBackupJob,
  CheckPgBackupDiskSpace,
  DeletePgBackupJob,
  DeletePgBackupProfile,
  GeneratePgBackupScript,
  GetPgBackupCatalog,
  GetPgBackupJobs,
  GetPgBackupProfiles,
  GetPgBackupToolchain,
  GetSavedDBConnections,
  OpenBackupFolderInOS,
  PreviewPgDirectClone,
  PreviewPgLogicalBackup,
  PreviewPgPhysicalBackup,
  PreviewPgRestore,
  SavePgBackupProfile,
  SavePgBackupScriptFile,
  SelectPgBackupBinDir,
  StartPgDirectClone,
  StartPgLogicalBackup,
  StartPgPhysicalBackup,
  StartPgRestore,
} from '../../../wailsjs/go/main/App';
import { LogicalBackupPanel } from './backup/subtabs/LogicalBackupPanel';
import { PhysicalBackupPanel } from './backup/subtabs/PhysicalBackupPanel';
import { RestorePanel } from './backup/subtabs/RestorePanel';
import { JobHistoryPanel } from './backup/subtabs/JobHistoryPanel';
import { DirectClonePanel } from './backup/subtabs/DirectClonePanel';
import { LiveCommandConsole } from './backup/components/LiveCommandConsole';
import './rbac/rbac.css';
import './backup/backup.css';

interface PgBackupRestoreTabProps {
  liveStatus: ConnectionStatus | null;
  onOpenConnections?: () => void;
}

type StudioSubTab = 'logical' | 'physical' | 'clone' | 'restore' | 'history';

export const PgBackupRestoreTab: React.FC<PgBackupRestoreTabProps> = ({
  liveStatus,
  onOpenConnections,
}) => {
  const [subTab, setSubTab] = useState<StudioSubTab>('logical');
  const [toolchain, setToolchain] = useState<ToolchainInfo | null>(null);
  const [catalog, setCatalog] = useState<BackupCatalog | null>(null);
  const [jobs, setJobs] = useState<PgBackupJobRecord[]>([]);
  const [profiles, setProfiles] = useState<PgBackupProfile[]>([]);
  const [savedPgProfiles, setSavedPgProfiles] = useState<DBConnectionProfile[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const [logicalReq, setLogicalReq] = useState<LogicalBackupRequest>(() => ({
    mode: 'full_db',
    database: liveStatus?.databaseName || 'postgres',
    databases: [],
    includeGlobals: true,
    schemas: [],
    excludeSchemas: [],
    tables: [],
    excludeTables: [],
    excludeTableData: [],
    tablespaces: [],
    contentMode: 'full',
    sections: ['pre-data', 'data', 'post-data'],
    format: 'custom',
    compression: 'zstd',
    compressionLevel: 3,
    parallelJobs: 2,
    outputPath: '',
    clean: false,
    ifExists: false,
    createDb: false,
    noOwner: false,
    noPrivileges: false,
    noTablespaces: false,
    includeBlobs: true,
    inserts: false,
    columnInserts: false,
    rowsPerInsert: 0,
    lockWaitTimeout: '',
    encoding: 'UTF8',
    includeStatistics: false,
    noStatistics: false,
    excludeDatabases: [],
    filterRules: [],
    generateChecksum: true,
    extraArgs: '',
  }));

  const [physicalReq, setPhysicalReq] = useState<PhysicalBackupRequest>({
    operation: 'basebackup',
    outputDir: '',
    format: 'plain',
    walMethod: 'stream',
    checkpoint: 'fast',
    compression: 'server-zstd',
    compressionLevel: 0,
    maxRate: '',
    manifestChecksums: 'SHA256',
    tablespaceMappings: [],
    incrementalManifestPath: '',
    combineSourceDirs: [],
    verifyBackupDir: '',
    verifyNoParseWals: false,
  });

  const [directCloneReq, setDirectCloneReq] = useState<DirectCloneRequest>({
    sourceDatabase: liveStatus?.databaseName || 'postgres',
    targetProfileId: '',
    targetDatabase: `${liveStatus?.databaseName || 'postgres'}_clone`,
    createTargetDb: true,
    clean: false,
    noOwner: true,
    noPrivileges: false,
    contentMode: 'full',
    schemas: [],
    tables: [],
    runAnalyzeAfter: true,
  });

  const [restoreReq, setRestoreReq] = useState<RestoreRequest>({
    sourcePath: '',
    sourceKind: 'archive',
    targetDatabase: liveStatus?.databaseName || 'postgres',
    createDb: false,
    clean: false,
    ifExists: true,
    singleTransaction: true,
    exitOnError: true,
    parallelJobs: 1,
    noOwner: false,
    noPrivileges: false,
    noTablespaces: false,
    contentMode: 'full',
    sections: [],
    schemas: [],
    tables: [],
    disableTriggers: false,
    includeStatistics: false,
    noStatistics: false,
    selectedTocIds: [],
    selectedDatabases: [],
    restoreGlobals: false,
    boostRestore: true,
    boostMem: '512MB',
    runAnalyzeAfter: true,
    extraArgs: '',
  });

  const [preview, setPreview] = useState<BackupCommandPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [logs, setLogs] = useState<BackupLogEvent[]>([]);
  const [jobStatus, setJobStatus] = useState<BackupStatusEvent | null>(null);
  const [progress, setProgress] = useState<BackupProgressEvent | null>(null);
  const [diskSpace, setDiskSpace] = useState<DiskSpaceInfo | null>(null);
  const [confirmRestoreModal, setConfirmRestoreModal] = useState(false);

  // Automation Script Export Modal
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [scriptOS, setScriptOS] = useState<'windows_ps1' | 'linux_bash'>('windows_ps1');
  const [scriptRetention, setScriptRetention] = useState(7);
  const [scriptSha, setScriptSha] = useState(true);
  const [scriptContent, setScriptContent] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);

  const loadJobsAndProfiles = useCallback(async () => {
    const app = (window as any)?.go?.main?.App;
    try {
      const [jList, pList, connList] = await Promise.all([
        app?.GetPgBackupJobs ? GetPgBackupJobs().catch(() => []) : Promise.resolve([]),
        app?.GetPgBackupProfiles ? GetPgBackupProfiles().catch(() => []) : Promise.resolve([]),
        app?.GetSavedDBConnections ? GetSavedDBConnections().catch(() => []) : Promise.resolve([]),
      ]);
      setJobs(Array.isArray(jList) ? jList : []);
      setProfiles(Array.isArray(pList) ? pList : []);
      setSavedPgProfiles(
        (Array.isArray(connList) ? connList : []).filter(
          (c: DBConnectionProfile) => c.engine === 'postgresql' || c.port === 5432,
        ),
      );
    } catch {}
  }, []);

  const loadStudioMetadata = useCallback(
    async (dbOverride?: string) => {
      const targetDB = dbOverride ?? logicalReq.database;
      setLoadingCatalog(true);
      const app = (window as any)?.go?.main?.App;
      try {
        const [tc, cat] = await Promise.all([
          app?.GetPgBackupToolchain ? GetPgBackupToolchain().catch(() => null) : Promise.resolve(null),
          app?.GetPgBackupCatalog ? GetPgBackupCatalog(targetDB).catch(() => null) : Promise.resolve(null),
        ]);
        if (tc) {
          setToolchain(tc);
          if (tc.hostOs && tc.hostOs !== 'windows') {
            setScriptOS('linux_bash');
          }
        }
        if (cat) {
          setCatalog(cat);
          setLogicalReq((prev) => ({
            ...prev,
            database: prev.database || cat.activeDatabase || 'postgres',
          }));
        }
      } finally {
        setLoadingCatalog(false);
      }
      loadJobsAndProfiles();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadJobsAndProfiles],
  );

  useEffect(() => {
    loadStudioMetadata(liveStatus?.databaseName || '');
  }, [liveStatus?.connected, liveStatus?.databaseName, loadStudioMetadata]);

  // Subscribe to Wails live streaming logs, progress & job status updates
  useEffect(() => {
    const rt = (window as any)?.runtime;
    if (!rt?.EventsOn) return;

    const offLog = rt.EventsOn('pg-backup:log', (ev: BackupLogEvent) => {
      if (!ev) return;
      setLogs((prev) => [...prev.slice(-1500), ev]);
    });
    const offStatus = rt.EventsOn('pg-backup:status', (ev: BackupStatusEvent) => {
      if (!ev) return;
      setJobStatus(ev);
      if (ev.status !== 'running') {
        loadJobsAndProfiles();
      }
    });
    const offProg = rt.EventsOn('pg-backup:progress', (ev: BackupProgressEvent) => {
      if (ev) setProgress(ev);
    });

    return () => {
      if (typeof offLog === 'function') offLog();
      else rt.EventsOff?.('pg-backup:log');
      if (typeof offStatus === 'function') offStatus();
      else rt.EventsOff?.('pg-backup:status');
      if (typeof offProg === 'function') offProg();
      else rt.EventsOff?.('pg-backup:progress');
    };
  }, [loadJobsAndProfiles]);

  // Check free disk space whenever outputPath changes
  useEffect(() => {
    const targetPath = subTab === 'logical' ? logicalReq.outputPath : physicalReq.outputDir;
    if (!targetPath.trim()) {
      setDiskSpace(null);
      return;
    }
    const dbSize =
      catalog?.databases.find((d) => d.name === logicalReq.database)?.sizeBytes ?? 0;
    const t = setTimeout(async () => {
      try {
        if ((window as any)?.go?.main?.App?.CheckPgBackupDiskSpace) {
          const info = await CheckPgBackupDiskSpace(targetPath, dbSize);
          setDiskSpace(info);
        }
      } catch {
        setDiskSpace(null);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [subTab, logicalReq.outputPath, logicalReq.database, physicalReq.outputDir, catalog?.databases]);

  const refreshPreview = useCallback(async () => {
    if (subTab === 'history') return;
    setPreviewError(null);
    const app = (window as any)?.go?.main?.App;
    try {
      let res: BackupCommandPreview | null = null;
      if (subTab === 'logical' && app?.PreviewPgLogicalBackup) {
        res = await PreviewPgLogicalBackup(logicalReq as any);
      } else if (subTab === 'physical' && app?.PreviewPgPhysicalBackup) {
        res = await PreviewPgPhysicalBackup(physicalReq as any);
      } else if (subTab === 'clone' && app?.PreviewPgDirectClone) {
        res = await PreviewPgDirectClone(directCloneReq);
      } else if (subTab === 'restore' && app?.PreviewPgRestore) {
        res = await PreviewPgRestore(restoreReq);
      }
      setPreview(res);
    } catch (e: any) {
      setPreviewError(e?.message || String(e));
    }
  }, [subTab, logicalReq, physicalReq, directCloneReq, restoreReq]);

  useEffect(() => {
    const t = setTimeout(() => {
      refreshPreview();
    }, 180);
    return () => clearTimeout(t);
  }, [refreshPreview]);

  // Update automation script modal whenever its controls change
  useEffect(() => {
    if (!showScriptModal) return;
    GeneratePgBackupScript({
      targetOs: scriptOS,
      retentionDays: scriptRetention,
      includeSha256: scriptSha,
      outputPath: logicalReq.outputPath,
      database: logicalReq.database,
      mode: logicalReq.mode,
      format: logicalReq.format,
    })
      .then((s) => setScriptContent(s))
      .catch(() => {});
  }, [showScriptModal, scriptOS, scriptRetention, scriptSha, logicalReq.outputPath, logicalReq.database, logicalReq.mode, logicalReq.format]);

  const handleConfigureBinDir = async () => {
    try {
      const tc = await SelectPgBackupBinDir();
      if (tc) setToolchain(tc);
    } catch (e: any) {
      setPreviewError(e?.message || String(e));
    }
  };

  const isRunning = jobStatus?.status === 'running';

  const executeActiveJob = async () => {
    setPreviewError(null);
    setLogs([]);
    setProgress(null);
    try {
      if (subTab === 'logical') {
        await StartPgLogicalBackup(logicalReq as any);
      } else if (subTab === 'physical') {
        await StartPgPhysicalBackup(physicalReq as any);
      } else if (subTab === 'clone') {
        await StartPgDirectClone(directCloneReq);
      } else if (subTab === 'restore') {
        await StartPgRestore(restoreReq);
      }
    } catch (e: any) {
      setPreviewError(e?.message || String(e));
    }
  };

  const handleRunClick = () => {
    if (subTab === 'restore' || subTab === 'clone') {
      const isDestructive =
        subTab === 'clone'
          ? directCloneReq.clean
          : restoreReq.clean ||
            restoreReq.sourceKind === 'plain_sql' ||
            restoreReq.targetDatabase === 'postgres';
      if (isDestructive) {
        setConfirmRestoreModal(true);
        return;
      }
    }
    executeActiveJob();
  };

  const handleCancel = async () => {
    try {
      await CancelPgBackupJob();
    } catch {}
  };

  const actionLabel =
    subTab === 'logical'
      ? 'Start Backup'
      : subTab === 'physical'
        ? physicalReq.operation === 'verify'
          ? 'Verify Backup'
          : physicalReq.operation === 'combine'
            ? 'Combine Backups'
            : 'Start Base Backup'
        : subTab === 'clone'
          ? 'Start Direct Clone'
          : subTab === 'restore'
            ? 'Start Restore'
            : 'Run';

  const actionDisabled =
    isRunning ||
    subTab === 'history' ||
    (subTab === 'logical' && !logicalReq.outputPath.trim()) ||
    (subTab === 'physical' &&
      physicalReq.operation === 'verify' &&
      !physicalReq.verifyBackupDir.trim()) ||
    (subTab === 'physical' &&
      physicalReq.operation !== 'verify' &&
      !physicalReq.outputDir.trim()) ||
    (subTab === 'clone' && (!directCloneReq.sourceDatabase.trim() || !directCloneReq.targetDatabase.trim())) ||
    (subTab === 'restore' && !restoreReq.sourcePath.trim());

  const folderForConsole =
    subTab === 'logical'
      ? logicalReq.outputPath
      : subTab === 'physical'
        ? physicalReq.operation === 'verify'
          ? physicalReq.verifyBackupDir
          : physicalReq.outputDir
        : subTab === 'restore'
          ? restoreReq.sourcePath
          : '';

  if (!liveStatus?.connected || !liveStatus?.allowBackupRestore) {
    return (
      <div className="rbac-empty-container">
        <div className="rbac-empty-card">
          <HardDrive size={42} style={{ color: 'var(--accent-blue)', margin: '0 auto' }} />
          <h2>PostgreSQL Backup &amp; Restore Studio</h2>
          <p>
            Connect to a PostgreSQL instance with <strong>Backup &amp; Restore</strong> enabled in connection settings.
          </p>
          {onOpenConnections && (
            <button type="button" className="rbac-btn rbac-btn-primary" onClick={onOpenConnections}>
              Open Connections
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pgb-studio-shell">
      {/* Studio Top Bar */}
      <div className="rbac-header">
        <div className="rbac-header-left">
          <HardDrive size={18} style={{ color: 'var(--accent-cyan)' }} />
          <h1 className="rbac-title">Backup &amp; Restore Studio</h1>

          {catalog?.serverVersion && (
            <span className="rbac-stat-pill">Server: PostgreSQL {catalog.serverVersion}</span>
          )}

          {toolchain && (
            <span
              className="rbac-stat-pill"
              style={{
                color: toolchain.compatible ? 'var(--accent-emerald)' : 'var(--accent-amber)',
                borderColor: toolchain.compatible ? 'var(--accent-emerald)' : 'var(--accent-amber)',
              }}
              title={toolchain.compatibilityWarning || toolchain.binDir}
            >
              {toolchain.compatible ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
              <span>
                {toolchain.clientMajorVersion > 0
                  ? `Client Tools v${toolchain.clientMajorVersion}`
                  : 'Client Tools Missing'}
              </span>
            </span>
          )}

          {toolchain?.cpuCount && (
            <span className="rbac-stat-pill">
              {toolchain.hostOs} · {toolchain.cpuCount} CPUs
            </span>
          )}
        </div>

        <div className="rbac-header-actions">
          <button
            type="button"
            className="rbac-btn"
            onClick={handleConfigureBinDir}
            title="Select PostgreSQL bin/ directory containing pg_dump, pg_restore, pg_basebackup"
          >
            <FolderCog size={12} />
            <span>Configure bin/</span>
          </button>
          <button
            type="button"
            className="rbac-btn"
            disabled={loadingCatalog}
            onClick={() => loadStudioMetadata()}
          >
            <RefreshCw size={12} />
            <span>{loadingCatalog ? 'Loading…' : 'Refresh Catalog'}</span>
          </button>
        </div>
      </div>

      {/* Compatibility Notice Banner */}
      {toolchain && !toolchain.compatible && toolchain.compatibilityWarning && (
        <div
          style={{
            padding: '7px 16px',
            background: 'rgba(245, 158, 11, 0.12)',
            borderBottom: '1px solid var(--accent-amber)',
            color: 'var(--accent-amber)',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>{toolchain.compatibilityWarning}</span>
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="pgb-body">
        <div className="pgb-left-pane">
          {/* Subtabs */}
          <div className="rbac-subtab-bar">
            {(
              [
                { key: 'logical', label: 'Logical & Cluster Backup', icon: <Database size={13} /> },
                { key: 'physical', label: 'Physical, Incremental & PITR', icon: <HardDrive size={13} /> },
                { key: 'clone', label: 'Direct Clone (Zero-Disk)', icon: <ArrowRightLeft size={13} /> },
                { key: 'restore', label: 'Restore & TOC Inspector', icon: <RotateCcw size={13} /> },
                {
                  key: 'history',
                  label: 'Job History',
                  icon: <History size={13} />,
                  badge: jobs.length > 0 ? jobs.length : undefined,
                },
              ] as Array<{ key: StudioSubTab; label: string; icon: React.ReactNode; badge?: number }>
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                className={`rbac-subtab-btn ${subTab === t.key ? 'active' : ''}`}
                onClick={() => setSubTab(t.key)}
              >
                {t.icon}
                <span>{t.label}</span>
                {t.badge !== undefined && (
                  <span className="rbac-subtab-badge" style={{ background: 'var(--accent-blue)' }}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Active Subtab Content */}
          <div className="rbac-subtab-content rbac-subtab-flex">
            {subTab === 'logical' && (
              <LogicalBackupPanel
                req={logicalReq}
                onChange={setLogicalReq}
                onDatabaseChange={(db) => {
                  setLogicalReq((prev) => ({
                    ...prev,
                    database: db,
                    schemas: [],
                    tables: [],
                    tablespaces: [],
                  }));
                  loadStudioMetadata(db);
                }}
                catalog={catalog}
                toolchain={toolchain}
                profiles={profiles}
                onSaveProfile={async (name) => {
                  await SavePgBackupProfile({
                    id: '',
                    name,
                    kind: 'logical',
                    payloadJson: JSON.stringify(logicalReq),
                    createdAt: '',
                    updatedAt: '',
                  });
                  loadJobsAndProfiles();
                }}
                onLoadProfile={(prof) => {
                  try {
                    const parsed = JSON.parse(prof.payloadJson);
                    setLogicalReq((prev) => ({ ...prev, ...parsed }));
                  } catch {}
                }}
                onDeleteProfile={async (id) => {
                  await DeletePgBackupProfile(id);
                  loadJobsAndProfiles();
                }}
                onOpenScriptModal={() => setShowScriptModal(true)}
                diskSpace={diskSpace}
              />
            )}

            {subTab === 'physical' && (
              <PhysicalBackupPanel
                req={physicalReq}
                onChange={setPhysicalReq}
                catalog={catalog}
                toolchain={toolchain}
              />
            )}

            {subTab === 'clone' && (
              <DirectClonePanel
                req={directCloneReq}
                onChange={setDirectCloneReq}
                catalog={catalog}
                savedPgProfiles={savedPgProfiles}
              />
            )}

            {subTab === 'restore' && (
              <RestorePanel
                req={restoreReq}
                onChange={setRestoreReq}
                catalog={catalog}
                toolchain={toolchain}
              />
            )}

            {subTab === 'history' && (
              <JobHistoryPanel
                jobs={jobs}
                onRefresh={loadJobsAndProfiles}
                onDelete={async (id) => {
                  await DeletePgBackupJob(id);
                  loadJobsAndProfiles();
                }}
                onOpenFolder={(p) => OpenBackupFolderInOS(p).catch(() => {})}
                onRestoreFromPath={(path, format, mode) => {
                  const kind =
                    mode === 'multi_db'
                      ? 'multi_db_manifest'
                      : format === 'plain' || mode.startsWith('cluster_')
                        ? 'plain_sql'
                        : 'archive';
                  setRestoreReq((prev) => ({ ...prev, sourcePath: path, sourceKind: kind }));
                  setSubTab('restore');
                }}
                onVerifyPhysicalDir={(dir) => {
                  setPhysicalReq((prev) => ({ ...prev, operation: 'verify', verifyBackupDir: dir }));
                  setSubTab('physical');
                }}
              />
            )}
          </div>
        </div>

        {/* Always-Visible CLI Preview & Streaming Console */}
        <LiveCommandConsole
          preview={preview}
          previewError={previewError}
          actionLabel={actionLabel}
          actionDisabled={actionDisabled}
          isRunning={isRunning}
          jobStatus={jobStatus}
          progress={progress}
          logs={logs}
          outputPathForFolder={folderForConsole}
          onRun={handleRunClick}
          onCancel={handleCancel}
          onClearLogs={() => setLogs([])}
          onRefreshPreview={refreshPreview}
          onOpenFolder={(p) => OpenBackupFolderInOS(p).catch(() => {})}
        />
      </div>

      {/* Automation Script Export Modal (.ps1 / .sh) */}
      {showScriptModal && (
        <div className="rbac-modal-backdrop" onClick={() => setShowScriptModal(false)}>
          <div
            className="rbac-modal"
            style={{ maxWidth: 680, padding: 20, gap: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                Export Scheduled Backup Script (Windows / Ubuntu / AlmaLinux)
              </h3>
              <button type="button" className="rbac-btn" onClick={() => setShowScriptModal(false)}>Close</button>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="rbac-select"
                value={scriptOS}
                onChange={(e) => setScriptOS(e.target.value as any)}
              >
                <option value="windows_ps1">Windows PowerShell (.ps1 + Task Scheduler)</option>
                <option value="linux_bash">Ubuntu / AlmaLinux / RHEL Bash (.sh + Cron)</option>
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span>Retention (days):</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  className="rbac-input rbac-mono"
                  style={{ width: 70, padding: '4px 8px' }}
                  value={scriptRetention}
                  onChange={(e) => setScriptRetention(Math.max(1, Number(e.target.value) || 7))}
                />
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={scriptSha}
                  onChange={(e) => setScriptSha(e.target.checked)}
                />
                <span>Include SHA-256 Checksum</span>
              </label>
            </div>

            <pre className="pgb-cli-preview" style={{ maxHeight: 320 }}>{scriptContent}</pre>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="rbac-btn"
                onClick={() => {
                  navigator?.clipboard?.writeText?.(scriptContent);
                  setCopiedScript(true);
                  setTimeout(() => setCopiedScript(false), 1600);
                }}
              >
                {copiedScript ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedScript ? 'Copied' : 'Copy Script'}</span>
              </button>
              <button
                type="button"
                className="rbac-btn rbac-btn-primary"
                onClick={async () => {
                  const ext = scriptOS === 'linux_bash' ? 'sh' : 'ps1';
                  await SavePgBackupScriptFile(`backup_${logicalReq.database || 'pg'}.${ext}`, scriptContent);
                }}
              >
                <Save size={12} />
                <span>Save File…</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore / Clone Safety Confirmation Modal */}
      {confirmRestoreModal && (
        <div className="rbac-modal-backdrop" onClick={() => setConfirmRestoreModal(false)}>
          <div
            className="rbac-modal"
            style={{ maxWidth: 520, padding: 20, gap: 14 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldAlert size={20} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                Confirm PostgreSQL {subTab === 'clone' ? 'Direct Clone' : 'Restore'} Execution
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              This operation targets database{' '}
              <code className="rbac-mono">
                {subTab === 'clone' ? directCloneReq.targetDatabase : restoreReq.targetDatabase || 'postgres'}
              </code>{' '}
              with <code className="rbac-mono">--clean</code> enabled. Please review the command below:
            </p>
            <pre className="pgb-cli-preview" style={{ maxHeight: 120 }}>
              {preview?.displayCommand}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="rbac-btn"
                onClick={() => setConfirmRestoreModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rbac-btn rbac-btn-danger"
                onClick={() => {
                  setConfirmRestoreModal(false);
                  executeActiveJob();
                }}
              >
                Confirm &amp; Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
