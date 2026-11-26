import React from 'react';
import { ArrowRightLeft, Zap, Server } from 'lucide-react';
import { BackupCatalog, DirectCloneRequest } from '../../../../types/pgbackup';
import { DBConnectionProfile } from '../../../../types/livedb';

interface DirectClonePanelProps {
  req: DirectCloneRequest;
  onChange: (next: DirectCloneRequest) => void;
  catalog: BackupCatalog | null;
  savedPgProfiles: DBConnectionProfile[];
}

export const DirectClonePanel: React.FC<DirectClonePanelProps> = ({
  req,
  onChange,
  catalog,
  savedPgProfiles,
}) => {
  const patch = (p: Partial<DirectCloneRequest>) => onChange({ ...req, ...p });
  const databases = catalog?.databases ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', gap: 12 }}>
      <div className="rbac-sticky-controls">
        <div
          className="rbac-card"
          style={{
            padding: '10px 12px',
            borderColor: 'var(--accent-blue)',
            background: 'rgba(59, 130, 246, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Zap size={16} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
          <div style={{ fontSize: 12, color: 'var(--text-main)' }}>
            <strong>Zero-Disk Streaming DB-to-DB Clone</strong> — Streams <code className="rbac-mono">pg_dump</code> directly through an OS pipe into <code className="rbac-mono">pg_restore</code> with no temporary dump file written to disk. Works across Windows, Ubuntu, AlmaLinux, and remote servers.
          </div>
        </div>
      </div>

      <div className="rbac-scroll-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
        <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="rbac-section-title">Source → Target Pipeline</span>

          <div className="pgb-field-grid">
            <div className="pgb-field">
              <label className="pgb-field-label">Source Database (Current Server)</label>
              <select
                className="rbac-select"
                value={req.sourceDatabase}
                onChange={(e) => {
                  const src = e.target.value;
                  patch({
                    sourceDatabase: src,
                    targetDatabase: req.targetDatabase || `${src}_clone`,
                  });
                }}
              >
                {databases.length === 0 ? (
                  <option value={req.sourceDatabase}>{req.sourceDatabase}</option>
                ) : (
                  databases.map((d) => (
                    <option key={d.name} value={d.name}>{d.name}</option>
                  ))
                )}
              </select>
            </div>

            <div className="pgb-field">
              <label className="pgb-field-label">
                <Server size={10} style={{ display: 'inline', marginRight: 4 }} />
                Destination Server Profile
              </label>
              <select
                className="rbac-select"
                value={req.targetProfileId}
                onChange={(e) => patch({ targetProfileId: e.target.value })}
              >
                <option value="">Same Connected PostgreSQL Server</option>
                {savedPgProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.server}:{p.port})
                  </option>
                ))}
              </select>
            </div>

            <div className="pgb-field">
              <label className="pgb-field-label">Target Database Name</label>
              <input
                className="rbac-input rbac-mono"
                placeholder="e.g. oltp_staging"
                value={req.targetDatabase}
                onChange={(e) => patch({ targetDatabase: e.target.value })}
              />
            </div>

            <div className="pgb-field">
              <label className="pgb-field-label">Clone Content</label>
              <select
                className="rbac-select"
                value={req.contentMode}
                onChange={(e) => patch({ contentMode: e.target.value as any })}
              >
                <option value="full">Full (Structure + Data)</option>
                <option value="schema_only">Structure Only (--schema-only)</option>
                <option value="data_only">Data Only (--data-only)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--accent-cyan)', fontWeight: 600 }}>
            <ArrowRightLeft size={14} />
            <span>
              Pipeline: <code className="rbac-mono">{req.sourceDatabase || 'source'}</code> →{' '}
              <code className="rbac-mono">{req.targetDatabase || `${req.sourceDatabase}_clone`}</code>
            </span>
          </div>
        </div>

        <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="rbac-section-title">Clone Options &amp; Scoping</span>

          <div className="pgb-field-grid">
            <div className="pgb-field">
              <label className="pgb-field-label">Filter Schemas (comma-separated, opt)</label>
              <input
                className="rbac-input rbac-mono"
                placeholder="e.g. public, billing"
                value={req.schemas.join(', ')}
                onChange={(e) =>
                  patch({
                    schemas: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
            <div className="pgb-field">
              <label className="pgb-field-label">Filter Tables (comma-separated, opt)</label>
              <input
                className="rbac-input rbac-mono"
                placeholder="e.g. public.orders, public.users"
                value={req.tables.join(', ')}
                onChange={(e) =>
                  patch({
                    tables: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          </div>

          <div className="pgb-toggle-grid">
            <label className="pgb-toggle-item">
              <input type="checkbox" checked={req.createTargetDb} onChange={(e) => patch({ createTargetDb: e.target.checked })} />
              <span>Create Target DB (--create)</span>
            </label>
            <label className="pgb-toggle-item" style={{ borderColor: req.clean ? 'var(--accent-red)' : undefined }}>
              <input type="checkbox" checked={req.clean} onChange={(e) => patch({ clean: e.target.checked })} />
              <span>Drop Existing (--clean --if-exists)</span>
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
              <input type="checkbox" checked={req.runAnalyzeAfter} onChange={(e) => patch({ runAnalyzeAfter: e.target.checked })} />
              <span>Run ANALYZE after clone</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
