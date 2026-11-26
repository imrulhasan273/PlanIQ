import React, { useState, useEffect } from 'react';
import { Link2, Server, User, Eye, EyeOff, Plus, Trash2, Shield } from 'lucide-react';
import { PgForeignServer, PgForeignDataWrapper, PgUserMapping, PgRole, DDLOperation } from '../../../../types/rbac';
import { GetPgUserMappings } from '../../../../../wailsjs/go/main/App';

interface FdwMappingsProps {
  servers: PgForeignServer[];
  fdws: PgForeignDataWrapper[];
  role: PgRole;
  onAddOp: (op: DDLOperation) => void;
}

function qIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function qLit(val: string): string {
  return `'${val.replace(/'/g, "''")}'`;
}

export const FdwMappings: React.FC<FdwMappingsProps> = ({ servers, fdws, role, onAddOp }) => {
  const [selectedServer, setSelectedServer] = useState<PgForeignServer | null>(servers[0] ?? null);
  const [mappings, setMappings] = useState<PgUserMapping[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  // Create User Mapping form
  const [mapLocalRole, setMapLocalRole] = useState(role.name);
  const [mapRemoteUser, setMapRemoteUser] = useState('');
  const [mapRemotePassword, setMapRemotePassword] = useState('');

  useEffect(() => {
    setMapLocalRole(role.name);
  }, [role.name]);

  useEffect(() => {
    if (!selectedServer) return;
    if (!(window as any)?.go?.main?.App?.GetPgUserMappings) return;
    setLoadingMappings(true);
    GetPgUserMappings(selectedServer.name)
      .then((data) => setMappings(data ?? []))
      .catch(() => {})
      .finally(() => setLoadingMappings(false));
  }, [selectedServer?.name]);

  const handleStageCreateMapping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServer || !mapRemoteUser.trim()) return;
    const forTarget = mapLocalRole.trim().toUpperCase() === 'PUBLIC' || !mapLocalRole.trim()
      ? 'PUBLIC'
      : qIdent(mapLocalRole.trim());

    const opts = [`user ${qLit(mapRemoteUser.trim())}`];
    if (mapRemotePassword) {
      opts.push(`password ${qLit(mapRemotePassword)}`);
    }

    onAddOp({
      type: 'RAW_SQL',
      label: `CREATE USER MAPPING (${selectedServer.name})`,
      sql: `CREATE USER MAPPING IF NOT EXISTS FOR ${forTarget} SERVER ${qIdent(selectedServer.name)} OPTIONS (${opts.join(', ')});`,
    });
    setMapRemoteUser('');
    setMapRemotePassword('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* FDWs */}
      <section className="rbac-section">
        <h3 className="rbac-section-title">
          <Link2 size={12} /> FOREIGN DATA WRAPPERS ({fdws.length})
        </h3>
        {fdws.length === 0 ? (
          <div className="rbac-card" style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No FDWs installed.</div>
        ) : (
          <div className="rbac-table-wrap">
            <table className="rbac-table">
              <thead>
                <tr>
                  <th>FDW Name</th>
                  <th>Handler</th>
                  <th>Owner</th>
                  <th>ACL</th>
                  <th className="center">USAGE for {role.name}</th>
                </tr>
              </thead>
              <tbody>
                {fdws.map((fdw) => (
                  <tr key={fdw.name}>
                    <td className="rbac-mono" style={{ fontWeight: 700 }}>{fdw.name}</td>
                    <td className="rbac-mono" style={{ color: 'var(--text-muted)' }}>{fdw.handler ?? '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{fdw.owner}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{(fdw.acl ?? []).length > 0 ? fdw.acl.join(', ') : 'superuser only'}</td>
                    <td className="center" style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="rbac-btn"
                        style={{ padding: '3px 8px', fontSize: 11, marginRight: 6 }}
                        onClick={() =>
                          onAddOp({
                            type: 'RAW_SQL',
                            label: `GRANT USAGE FDW ${fdw.name}`,
                            sql: `GRANT USAGE ON FOREIGN DATA WRAPPER ${qIdent(fdw.name)} TO ${qIdent(role.name)};`,
                          })
                        }
                      >
                        Grant USAGE
                      </button>
                      <button
                        type="button"
                        className="rbac-btn rbac-btn-danger"
                        style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() =>
                          onAddOp({
                            type: 'RAW_SQL',
                            label: `REVOKE USAGE FDW ${fdw.name}`,
                            sql: `REVOKE USAGE ON FOREIGN DATA WRAPPER ${qIdent(fdw.name)} FROM ${qIdent(role.name)};`,
                          })
                        }
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Foreign Servers */}
      <section className="rbac-section">
        <h3 className="rbac-section-title">
          <Server size={12} /> FOREIGN SERVERS ({servers.length})
        </h3>
        {servers.length === 0 ? (
          <div className="rbac-card" style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No foreign servers defined.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {servers.map((srv) => {
                const active = selectedServer?.oid === srv.oid;
                return (
                  <button
                    key={srv.oid}
                    type="button"
                    onClick={() => setSelectedServer(srv)}
                    className="rbac-btn"
                    style={
                      active
                        ? { borderColor: 'var(--accent-blue)', color: 'var(--accent-cyan)', background: 'rgba(59,130,246,0.14)' }
                        : undefined
                    }
                  >
                    {srv.name}
                    <span style={{ opacity: 0.65 }}>({srv.fdwName})</span>
                  </button>
                );
              })}
            </div>

            {selectedServer && (
              <div className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{selectedServer.name}</span>
                  <button
                    type="button"
                    className="rbac-btn"
                    style={{ fontSize: 11.5 }}
                    onClick={() =>
                      onAddOp({
                        type: 'RAW_SQL',
                        label: `GRANT USAGE SERVER ${selectedServer.name}`,
                        sql: `GRANT USAGE ON FOREIGN SERVER ${qIdent(selectedServer.name)} TO ${qIdent(role.name)};`,
                      })
                    }
                  >
                    <Shield size={11} /> Grant USAGE to {role.name}
                  </button>
                  <button
                    type="button"
                    className="rbac-btn rbac-btn-danger"
                    style={{ fontSize: 11.5 }}
                    onClick={() =>
                      onAddOp({
                        type: 'RAW_SQL',
                        label: `REVOKE USAGE SERVER ${selectedServer.name}`,
                        sql: `REVOKE USAGE ON FOREIGN SERVER ${qIdent(selectedServer.name)} FROM ${qIdent(role.name)};`,
                      })
                    }
                  >
                    Revoke USAGE
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>FDW: </span><span>{selectedServer.fdwName}</span></div>
                  {selectedServer.type && <div><span style={{ color: 'var(--text-muted)' }}>Type: </span><span>{selectedServer.type}</span></div>}
                  {selectedServer.version && <div><span style={{ color: 'var(--text-muted)' }}>Version: </span><span>{selectedServer.version}</span></div>}
                </div>
                {Object.keys(selectedServer.options ?? {}).length > 0 && (
                  <div className="rbac-mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {Object.entries(selectedServer.options).map(([k, v]) => `${k}=${v}`).join(', ')}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* User Mappings */}
      {selectedServer && (
        <section className="rbac-section">
          <h3 className="rbac-section-title">
            <User size={12} /> USER MAPPINGS FOR {selectedServer.name.toUpperCase()}
          </h3>
          {loadingMappings ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Loading mappings…</div>
          ) : mappings.length === 0 ? (
            <div className="rbac-card" style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No user mappings configured.</div>
          ) : (
            <div className="rbac-table-wrap">
              <table className="rbac-table">
                <thead>
                  <tr>
                    <th>Local Role</th>
                    <th>Remote Options</th>
                    <th className="center" style={{ width: 64 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => {
                    const key = `${m.serverName}.${m.localRole}`;
                    const targetIdent = m.localRole === 'PUBLIC' ? 'PUBLIC' : qIdent(m.localRole);
                    return (
                      <tr key={key}>
                        <td className="rbac-mono">{m.localRole}</td>
                        <td className="rbac-mono" style={{ color: 'var(--text-muted)' }}>
                          {Object.entries(m.options ?? {}).map(([k, v]) => (
                            <span key={k} style={{ marginRight: 10 }}>
                              {k}={k === 'password' && !revealedKeys.has(key) ? '●●●●●●●●' : v}
                              {k === 'password' && (
                                <button
                                  type="button"
                                  className="rbac-icon-btn"
                                  style={{ marginLeft: 4 }}
                                  onClick={() =>
                                    setRevealedKeys((prev) => {
                                      const s = new Set(prev);
                                      s.has(key) ? s.delete(key) : s.add(key);
                                      return s;
                                    })
                                  }
                                >
                                  {revealedKeys.has(key) ? <EyeOff size={11} /> : <Eye size={11} />}
                                </button>
                              )}
                            </span>
                          ))}
                        </td>
                        <td className="center">
                          <button
                            type="button"
                            className="rbac-icon-btn"
                            style={{ color: 'var(--accent-red)' }}
                            title="Drop user mapping"
                            onClick={() =>
                              onAddOp({
                                type: 'RAW_SQL',
                                label: `DROP USER MAPPING (${m.localRole})`,
                                sql: `DROP USER MAPPING IF EXISTS FOR ${targetIdent} SERVER ${qIdent(selectedServer.name)};`,
                              })
                            }
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Create User Mapping form */}
          <form onSubmit={handleStageCreateMapping} className="rbac-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="rbac-section-title">+ Create User Mapping on {selectedServer.name}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                value={mapLocalRole}
                onChange={(e) => setMapLocalRole(e.target.value)}
                placeholder="Local role or PUBLIC"
                className="rbac-input rbac-mono"
                style={{ width: 150 }}
              />
              <input
                value={mapRemoteUser}
                onChange={(e) => setMapRemoteUser(e.target.value)}
                placeholder="Remote username *"
                className="rbac-input"
                style={{ flex: 1, minWidth: 140 }}
                required
              />
              <input
                type="password"
                autoComplete="new-password"
                value={mapRemotePassword}
                onChange={(e) => setMapRemotePassword(e.target.value)}
                placeholder="Remote password (optional)"
                className="rbac-input"
                style={{ flex: 1, minWidth: 140 }}
              />
              <button
                type="submit"
                disabled={!mapRemoteUser.trim()}
                className="rbac-btn rbac-btn-primary"
              >
                <Plus size={12} /> Stage Mapping
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
};
