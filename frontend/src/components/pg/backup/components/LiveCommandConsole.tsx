import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Square,
  Copy,
  Check,
  Terminal,
  Trash2,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  BackupCommandPreview,
  BackupLogEvent,
  BackupProgressEvent,
  BackupStatusEvent,
} from '../../../../types/pgbackup';

interface LiveCommandConsoleProps {
  preview: BackupCommandPreview | null;
  previewError: string | null;
  actionLabel: string;
  actionDisabled: boolean;
  isRunning: boolean;
  jobStatus: BackupStatusEvent | null;
  progress: BackupProgressEvent | null;
  logs: BackupLogEvent[];
  outputPathForFolder?: string;
  onRun: () => void;
  onCancel: () => void;
  onClearLogs: () => void;
  onRefreshPreview: () => void;
  onOpenFolder: (path: string) => void;
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

export const LiveCommandConsole: React.FC<LiveCommandConsoleProps> = ({
  preview,
  previewError,
  actionLabel,
  actionDisabled,
  isRunning,
  jobStatus,
  progress,
  logs,
  outputPathForFolder,
  onRun,
  onCancel,
  onClearLogs,
  onRefreshPreview,
  onOpenFolder,
}) => {
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleCopy = () => {
    if (!preview?.displayCommand) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(preview.displayCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  const folderTarget = jobStatus?.outputPath || outputPathForFolder || '';

  return (
    <aside className="pgb-right-pane">
      {/* Top CTA Header */}
      <div className="rbac-ddl-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Terminal size={14} style={{ color: 'var(--accent-cyan)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>Command &amp; Live Console</span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {isRunning ? (
            <button
              type="button"
              className="rbac-btn rbac-btn-danger"
              onClick={onCancel}
              title="Terminate active job"
            >
              <Square size={11} />
              <span>Cancel</span>
            </button>
          ) : (
            <button
              type="button"
              className="rbac-btn rbac-btn-primary"
              disabled={actionDisabled}
              onClick={onRun}
            >
              <Play size={12} />
              <span>{actionLabel}</span>
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 12,
          overflow: 'hidden',
        }}
      >
        {/* Job Status Banner */}
        {jobStatus && (
          <div className={`pgb-status-banner ${jobStatus.status}`}>
            {jobStatus.status === 'running' ? (
              <Loader2 size={14} className="spin" />
            ) : jobStatus.status === 'succeeded' ? (
              <CheckCircle2 size={14} />
            ) : (
              <AlertTriangle size={14} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ textTransform: 'uppercase', fontSize: 11 }}>
                {jobStatus.operation} {jobStatus.status}
                {jobStatus.status === 'succeeded' && jobStatus.durationMs > 0
                  ? ` · ${(jobStatus.durationMs / 1000).toFixed(1)}s`
                  : ''}
                {jobStatus.status === 'succeeded' && jobStatus.sizeBytes > 0
                  ? ` · ${formatBytes(jobStatus.sizeBytes)}`
                  : ''}
              </div>
              {jobStatus.errorMessage && (
                <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, wordBreak: 'break-word' }}>
                  {jobStatus.errorMessage}
                </div>
              )}
            </div>
            {folderTarget && (
              <button
                type="button"
                className="rbac-btn"
                style={{ padding: '3px 8px', fontSize: 11 }}
                onClick={() => onOpenFolder(folderTarget)}
                title="Open destination folder in file manager"
              >
                <FolderOpen size={11} />
                <span>Folder</span>
              </button>
            )}
          </div>
        )}

        {/* Live Progress Bar & Throughput */}
        {isRunning && progress && (
          <div className="rbac-card" style={{ padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>
                Written: <strong className="rbac-mono" style={{ color: 'var(--accent-cyan)' }}>{formatBytes(progress.bytesWritten)}</strong>
                {progress.estimatedBytes > 0 && ` / ~${formatBytes(progress.estimatedBytes)}`}
              </span>
              <span className="rbac-mono">
                {progress.mbPerSec > 0 ? `${progress.mbPerSec.toFixed(1)} MB/s` : ''}
                {progress.percent >= 0 ? ` · ${progress.percent.toFixed(0)}%` : ''}
              </span>
            </div>
            <div style={{ width: '100%', height: 6, borderRadius: 999, background: 'var(--bg-card)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progress.percent >= 0 ? Math.min(100, Math.max(4, progress.percent)) : 100}%`,
                  height: '100%',
                  background: progress.percent >= 0 ? 'var(--accent-cyan)' : 'var(--accent-blue)',
                  transition: 'width 0.3s ease',
                  opacity: progress.percent >= 0 ? 1 : 0.65,
                }}
              />
            </div>
          </div>
        )}

        {/* Warnings */}
        {previewError && (
          <div className="rbac-empty-error-box" style={{ fontSize: 11.5, padding: '8px 10px' }}>
            {previewError}
          </div>
        )}

        {(preview?.warnings ?? []).length > 0 && (
          <div
            className="rbac-card"
            style={{
              padding: '8px 10px',
              borderColor: 'var(--accent-amber)',
              background: 'rgba(245, 158, 11, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              flexShrink: 0,
            }}
          >
            {preview!.warnings.map((w, i) => (
              <div
                key={i}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: 'var(--accent-amber)' }}
              >
                <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* CLI Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="rbac-section-title">CLI Command Preview (PGPASSWORD via env)</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                className="rbac-icon-btn"
                onClick={onRefreshPreview}
                title="Refresh command preview"
              >
                <RefreshCw size={12} />
              </button>
              <button
                type="button"
                className="rbac-btn"
                style={{ padding: '2px 8px', fontSize: 11 }}
                disabled={!preview?.displayCommand}
                onClick={handleCopy}
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <pre className="pgb-cli-preview">
            {preview?.displayCommand || '# Configure options on the left to preview the PostgreSQL CLI command…'}
          </pre>
        </div>

        {/* Live Console Output */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span className="rbac-section-title">
              Execution Output ({logs.length} line{logs.length === 1 ? '' : 's'})
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                />
                <span>Auto-scroll</span>
              </label>
              <button
                type="button"
                className="rbac-btn"
                style={{ padding: '2px 7px', fontSize: 11 }}
                disabled={logs.length === 0}
                onClick={onClearLogs}
              >
                <Trash2 size={11} />
                <span>Clear</span>
              </button>
            </div>
          </div>

          <div className="pgb-console-box">
            {logs.length === 0 ? (
              <span style={{ color: '#64748b' }}>
                Ready. Logs from pg_dump, pg_dumpall, pg_basebackup, pg_combinebackup, pg_verifybackup, pg_restore, or psql stream here in real time.
              </span>
            ) : (
              logs.map((entry, idx) => (
                <div key={idx} className={`pgb-log-line ${entry.stream}`}>
                  {entry.line}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </aside>
  );
};
