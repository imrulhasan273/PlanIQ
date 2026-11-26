import React, { useMemo, useState } from 'react';
import { FolderOpen, Trash2, ShieldCheck, RotateCcw, RefreshCw, FileCheck2 } from 'lucide-react';
import { ChecksumVerifyResult, PgBackupJobRecord } from '../../../../types/pgbackup';
import { VerifyPgBackupChecksum } from '../../../../../wailsjs/go/main/App';
import {
  DynamicTableFilter,
  DynamicColumnFilter,
  DynamicFilterColumn,
  applyDynamicFilters,
  createDefaultDynamicFilter,
} from '../../rbac/components/DynamicTableFilter';

interface JobHistoryPanelProps {
  jobs: PgBackupJobRecord[];
  onRefresh: () => void;
  onDelete: (id: string) => void;
  onOpenFolder: (path: string) => void;
  onRestoreFromPath: (path: string, format: string, mode: string) => void;
  onVerifyPhysicalDir: (dir: string) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val >= 10 || idx === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[idx]}`;
}

export const JobHistoryPanel: React.FC<JobHistoryPanelProps> = ({
  jobs,
  onRefresh,
  onDelete,
  onOpenFolder,
  onRestoreFromPath,
  onVerifyPhysicalDir,
}) => {
  const [filters, setFilters] = useState<DynamicColumnFilter[]>(() => [
    createDefaultDynamicFilter('__any__'),
  ]);
  const [verifyMsg, setVerifyMsg] = useState<ChecksumVerifyResult | null>(null);

  const handleVerifySha256 = async (path: string) => {
    try {
      const res = await VerifyPgBackupChecksum(path);
      setVerifyMsg(res);
    } catch { }
  };

  const filterColumns = useMemo<DynamicFilterColumn[]>(
    () => [
      { id: '__any__', label: 'All Columns', placeholder: 'Search jobs, databases, paths...' },
      { id: 'operation', label: 'Operation', options: ['backup', 'restore', 'verify', 'combine'] },
      { id: 'mode', label: 'Mode' },
      { id: 'databaseName', label: 'Database' },
      { id: 'format', label: 'Format', options: ['custom', 'directory', 'tar', 'plain'] },
      { id: 'status', label: 'Status', options: ['succeeded', 'failed', 'running', 'cancelled'] },
      { id: 'outputPath', label: 'Output Path' },
    ],
    [],
  );

  const filteredJobs = useMemo(
    () =>
      applyDynamicFilters(jobs, filters, filterColumns, (j, colId) => {
        if (colId === 'operation') return j.operation;
        if (colId === 'mode') return j.mode;
        if (colId === 'databaseName') return j.databaseName;
        if (colId === 'format') return j.format;
        if (colId === 'status') return j.status;
        if (colId === 'outputPath') return j.outputPath;
        return `${j.operation} ${j.mode} ${j.databaseName} ${j.status} ${j.outputPath}`;
      }),
    [jobs, filters, filterColumns],
  );

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case 'succeeded':
        return 'var(--accent-emerald)';
      case 'running':
        return 'var(--accent-cyan)';
      case 'cancelled':
        return 'var(--accent-amber)';
      default:
        return 'var(--accent-red)';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', gap: 10 }}>
      <div className="rbac-sticky-controls" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="rbac-toolbar" style={{ marginBottom: 0 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-main)' }}>
            Backup &amp; Restore Execution History
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            ({jobs.length} stored in SQLite)
          </span>
          <div className="rbac-spacer" />
          <button type="button" className="rbac-btn" onClick={onRefresh}>
            <RefreshCw size={12} />
            <span>Refresh</span>
          </button>
        </div>

        <DynamicTableFilter
          columns={filterColumns}
          filters={filters}
          onChange={setFilters}
          totalCount={jobs.length}
          filteredCount={filteredJobs.length}
          itemLabel="jobs"
          compact
        />

        {verifyMsg && (
          <div
            className="rbac-card"
            style={{
              padding: '8px 12px',
              borderColor: verifyMsg.matched ? 'var(--accent-emerald)' : 'var(--accent-red)',
              color: verifyMsg.matched ? 'var(--accent-emerald)' : 'var(--accent-red)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{verifyMsg.message}</span>
            <button type="button" className="rbac-btn" onClick={() => setVerifyMsg(null)}>Dismiss</button>
          </div>
        )}
      </div>

      {filteredJobs.length === 0 ? (
        <div className="rbac-card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 12.5 }}>
          {jobs.length === 0
            ? 'No backup or restore jobs recorded yet.'
            : 'No jobs match your active multi-column filters.'}
        </div>
      ) : (
        <div className="rbac-table-wrap rbac-scroll-body">
          <table className="rbac-table">
            <thead>
              <tr>
                <th className="sticky-col">Started (UTC)</th>
                <th>Op / Mode</th>
                <th>Target DB</th>
                <th>Format</th>
                <th>Size</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Path</th>
                <th className="center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((j) => {
                const isPhysicalVerifyable =
                  j.operation === 'backup' &&
                  (j.mode === 'basebackup' || j.mode === 'incremental' || j.mode === 'combine') &&
                  j.status === 'succeeded' &&
                  j.outputPath;
                const isRestorable =
                  j.operation === 'backup' &&
                  j.status === 'succeeded' &&
                  j.outputPath &&
                  j.mode !== 'basebackup' &&
                  j.mode !== 'incremental';

                return (
                  <tr key={j.id}>
                    <td className="sticky-col rbac-mono" style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
                      {j.startedAt.replace('T', ' ').slice(0, 19)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <strong style={{ fontSize: 11.5 }}>{j.operation}</strong>
                      {j.mode && (
                        <span style={{ color: 'var(--text-muted)', marginLeft: 5, fontSize: 11 }}>
                          {j.mode}
                        </span>
                      )}
                    </td>
                    <td className="rbac-mono" style={{ whiteSpace: 'nowrap' }}>
                      {j.databaseName || '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{j.format || '—'}</td>
                    <td className="rbac-mono" style={{ whiteSpace: 'nowrap' }}>
                      {formatBytes(j.sizeBytes)}
                    </td>
                    <td className="rbac-mono" style={{ whiteSpace: 'nowrap' }}>
                      {j.durationMs > 0 ? `${(j.durationMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span
                        className="rbac-badge"
                        style={{
                          border: `1px solid ${statusBadgeColor(j.status)}`,
                          color: statusBadgeColor(j.status),
                          textTransform: 'uppercase',
                        }}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td
                      className="rbac-mono"
                      style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={j.outputPath}
                    >
                      {j.outputPath || '—'}
                    </td>
                    <td className="center" style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        {j.outputPath && (
                          <button
                            type="button"
                            className="rbac-icon-btn"
                            title="Open Folder"
                            onClick={() => onOpenFolder(j.outputPath)}
                          >
                            <FolderOpen size={13} />
                          </button>
                        )}
                        {isPhysicalVerifyable && (
                          <button
                            type="button"
                            className="rbac-icon-btn"
                            style={{ color: 'var(--accent-cyan)' }}
                            title="Verify physical backup manifest"
                            onClick={() => onVerifyPhysicalDir(j.outputPath)}
                          >
                            <ShieldCheck size={13} />
                          </button>
                        )}
                        {isRestorable && (
                          <>
                            <button
                              type="button"
                              className="rbac-icon-btn"
                              style={{ color: 'var(--accent-blue)' }}
                              title="Verify .sha256 integrity checksum"
                              onClick={() => handleVerifySha256(j.outputPath)}
                            >
                              <FileCheck2 size={13} />
                            </button>
                            <button
                              type="button"
                              className="rbac-icon-btn"
                              style={{ color: 'var(--accent-emerald)' }}
                              title="Load into Restore Inspector"
                              onClick={() => onRestoreFromPath(j.outputPath, j.format, j.mode)}
                            >
                              <RotateCcw size={13} />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="rbac-icon-btn"
                          style={{ color: 'var(--accent-red)' }}
                          title="Delete history entry"
                          onClick={() => onDelete(j.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
