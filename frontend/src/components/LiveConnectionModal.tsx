import React, { useState, useEffect } from 'react';
import {
  Server,
  Database,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  HardDrive,
  ExternalLink,
  Plus,
  Zap,
} from 'lucide-react';
import { ConnectionConfig, ConnectionStatus, DBConnectionProfile } from '../types/livedb';
import { ConnectLiveDB, DisconnectLiveDB, GetSavedDBConnections, SaveDBConnection } from '../../wailsjs/go/main/App';

interface LiveConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: ConnectionStatus | null;
  engine?: 'sqlserver' | 'postgresql';
  onEngineChange?: (engine: 'sqlserver' | 'postgresql') => void;
  onStatusChange: (status: ConnectionStatus | null) => void;
  defaultUsername?: string;
  onOpenConnectionsTab?: () => void;
}

const inferEngine = (
  p: { engine?: string; port?: number; database?: string },
  fallback: 'sqlserver' | 'postgresql'
): 'sqlserver' | 'postgresql' => {
  if (p.engine === 'postgresql' || p.engine === 'sqlserver') return p.engine;
  if (p.port === 5432 || p.database?.toLowerCase() === 'postgres') return 'postgresql';
  if (p.port === 1433) return 'sqlserver';
  return fallback;
};

const getDefaultConfig = (targetEngine: 'sqlserver' | 'postgresql', defaultUsername?: string): ConnectionConfig => {
  const pg = targetEngine === 'postgresql';
  const saved = localStorage.getItem(pg ? 'planiq_live_conn_pg' : 'planiq_live_conn');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      parsed.password = '';
      parsed.engine = targetEngine;
      if (defaultUsername && (!parsed.username || parsed.username === 'sa')) {
        parsed.username = pg ? 'postgres' : defaultUsername;
      }
      return parsed;
    } catch {}
  }
  return {
    engine: targetEngine,
    server: 'localhost',
    port: pg ? 5432 : 1433,
    database: pg ? 'postgres' : 'master',
    authType: 'sql',
    username: pg ? 'postgres' : (defaultUsername || 'sa'),
    password: '',
    encrypt: false,
    trustServerCertificate: true,
    applicationIntent: 'ReadOnly',
    timeoutSeconds: 4,
  };
};

export const LiveConnectionModal: React.FC<LiveConnectionModalProps> = ({
  isOpen,
  onClose,
  status,
  engine = 'sqlserver',
  onEngineChange,
  onStatusChange,
  defaultUsername,
  onOpenConnectionsTab,
}) => {
  const [modalEngine, setModalEngine] = useState<'sqlserver' | 'postgresql'>(engine);
  const [savedProfiles, setSavedProfiles] = useState<DBConnectionProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [config, setConfig] = useState<ConnectionConfig>(() => getDefaultConfig(engine, defaultUsername));
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isPg = modalEngine === 'postgresql';
  const engineProfiles = savedProfiles.filter((p) => inferEngine(p, 'sqlserver') === modalEngine);

  // Keep modalEngine synced with active app engine when opening, then load saved SQLite profiles
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setModalEngine(engine);
    loadSavedProfiles(engine);
  }, [isOpen, engine]);

  const applyProfileToForm = (found: DBConnectionProfile, silent: boolean = false) => {
    const profEngine = inferEngine(found, modalEngine);
    setModalEngine(profEngine);
    setSelectedProfileId(found.id);
    setConfig({
      engine: profEngine,
      server: found.server,
      port: Number(found.port) || (profEngine === 'postgresql' ? 5432 : 1433),
      database: found.database,
      authType: (profEngine === 'postgresql' && found.authType === 'windows' ? 'sql' : found.authType) as any,
      username: found.username || '',
      password: found.password || '',
      encrypt: !!found.encrypt,
      trustServerCertificate: found.trustServerCertificate ?? true,
      applicationIntent: found.applicationIntent || 'ReadOnly',
      timeoutSeconds: Number(found.timeoutSeconds) || 4,
    });
    if (!silent) {
      setErrorMsg(null);
      setSuccessMsg(`Loaded "${found.name}" (${profEngine === 'postgresql' ? 'PostgreSQL' : 'SQL Server'})`);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  };

  const loadSavedProfiles = async (targetEngine: 'sqlserver' | 'postgresql' = modalEngine) => {
    try {
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.GetSavedDBConnections) {
        const list = await GetSavedDBConnections();
        if (Array.isArray(list)) {
          setSavedProfiles(list);
          // Auto-select default or first profile matching the active engine so its encrypted password & port are loaded immediately
          if (list.length > 0) {
            const matchDefault = list.find((p) => p.isDefault && inferEngine(p, 'sqlserver') === targetEngine);
            const matchFirst = list.find((p) => inferEngine(p, 'sqlserver') === targetEngine);
            const chosen = matchDefault || matchFirst;
            if (chosen) {
              applyProfileToForm(chosen, true);
              return;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load saved DB connections:', err);
    }
    setSelectedProfileId('');
    setConfig(getDefaultConfig(targetEngine, defaultUsername));
  };

  const handleSelectSavedProfile = (id: string) => {
    setSelectedProfileId(id);
    if (!id) return;
    const found = savedProfiles.find((p) => p.id === id);
    if (found) {
      applyProfileToForm(found, false);
    }
  };

  const handleSaveCurrentToSQLite = async () => {
    try {
      const name = prompt('Enter a profile name for SQLite storage:', `${config.server} (${config.database})`);
      if (!name) return;
      const targetEngine = inferEngine(config, modalEngine);
      await SaveDBConnection({
        id: '',
        name,
        server: config.server,
        port: Number(config.port) || (targetEngine === 'postgresql' ? 5432 : 1433),
        database: config.database,
        authType: config.authType,
        username: config.username || '',
        password: config.password || '',
        encrypt: config.encrypt ?? false,
        trustServerCertificate: config.trustServerCertificate ?? true,
        applicationIntent: config.applicationIntent || 'ReadOnly',
        timeoutSeconds: Number(config.timeoutSeconds) || 4,
        isDefault: false,
        engine: targetEngine,
        createdAt: '',
        updatedAt: '',
      } as any);
      setSuccessMsg(`Saved profile "${name}" to SQLite!`);
      loadSavedProfiles(targetEngine);
    } catch (err: any) {
      setErrorMsg(`Save failed: ${err?.message || err}`);
    }
  };

  if (!isOpen) return null;

  const handleSaveConfig = (cfg: ConnectionConfig) => {
    setConfig(cfg);
    const targetEngine = inferEngine(cfg, modalEngine);
    const key = targetEngine === 'postgresql' ? 'planiq_live_conn_pg' : 'planiq_live_conn';
    localStorage.setItem(key, JSON.stringify({ ...cfg, engine: targetEngine, password: '' }));
  };

  const handleConnect = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const targetEngine = inferEngine(config, modalEngine);
    const payload: ConnectionConfig = {
      ...config,
      engine: targetEngine,
      port: Number(config.port) || (targetEngine === 'postgresql' ? 5432 : 1433),
      timeoutSeconds: Number(config.timeoutSeconds) || 4,
    };

    try {
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.ConnectLiveDB) {
        const res = await ConnectLiveDB(payload as any);
        if (res && res.connected) {
          if (onEngineChange && targetEngine !== engine) {
            onEngineChange(targetEngine);
          }
          onStatusChange(res);
          setSuccessMsg(`Successfully connected to ${res.serverName} (${res.databaseName})`);
          handleSaveConfig(payload);
          setTimeout(() => {
            onClose();
          }, 700);
        } else {
          setErrorMsg(res?.errorMessage || (targetEngine === 'postgresql' ? 'Failed to connect to PostgreSQL' : 'Failed to connect to SQL Server'));
        }
      } else {
        setErrorMsg('Live database connection requires running PlanIQ as a desktop application.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (targetEngine === 'postgresql' ? 'Failed to connect to PostgreSQL' : 'Failed to connect to SQL Server'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.DisconnectLiveDB) {
        await DisconnectLiveDB();
      }
      onStatusChange(null);
      setSuccessMsg('Disconnected');
    } catch (e: any) {
      setErrorMsg(e?.message || 'Error disconnecting');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container glass-panel"
        style={{ maxWidth: '580px', width: '92%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(129, 140, 248, 0.2))',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Zap size={20} color="#38bdf8" />
            </div>
            <div>
              <h2 style={{ fontSize: '17px', margin: 0, fontWeight: 700, color: '#f8fafc' }}>
                {isPg ? 'Connect to PostgreSQL' : 'Connect to Microsoft SQL Server'}
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                {isPg
                  ? 'Live pg_stat_activity, pg_stat_statements, pg_locks & PG Configs'
                  : 'Live In-Flight Plans, Query Store Harvesting, Deadlocks & Configs'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Active status banner if connected */}
          {status && status.connected ? (
            <div
              style={{
                background: 'rgba(52, 211, 153, 0.1)',
                border: '1px solid rgba(52, 211, 153, 0.3)',
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={18} color="#34d399" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#34d399' }}>
                    Connected to {status.serverName} ({status.serverType === 'postgresql' ? 'PostgreSQL' : 'SQL Server'})
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Database: <strong style={{ color: '#cbd5e1' }}>{status.databaseName}</strong> • Latency: {status.latencyMs}ms
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleDisconnect}
                disabled={isLoading}
                style={{ borderColor: 'rgba(244, 63, 94, 0.4)', color: '#f43f5e', flexShrink: 0 }}
              >
                Disconnect
              </button>
            </div>
          ) : null}

          {/* SQLite Saved Connection Dropdown (Filtered to Selected Engine) */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HardDrive size={13} color="#34d399" />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
                  Load Saved {isPg ? 'PostgreSQL' : 'SQL Server'} Profile
                </span>
                <span
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'rgba(52, 211, 153, 0.15)',
                    color: '#34d399',
                  }}
                >
                  {engineProfiles.length} Saved
                </span>
              </div>
              {onOpenConnectionsTab && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenConnectionsTab();
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#38bdf8',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>Open Studio</span>
                  <ExternalLink size={10} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
              <select
                value={selectedProfileId}
                onChange={(e) => handleSelectSavedProfile(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'rgba(2, 6, 23, 0.8)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  padding: '7px 10px',
                  fontSize: '12px',
                  outline: 'none',
                  cursor: 'pointer',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                }}
              >
                <option value="">
                  {engineProfiles.length === 0
                    ? `-- No saved ${isPg ? 'PostgreSQL' : 'SQL Server'} profiles --`
                    : `-- Select a saved ${isPg ? 'PostgreSQL' : 'SQL Server'} profile --`}
                </option>
                {engineProfiles.map((p) => {
                  const profEngine = inferEngine(p, modalEngine);
                  return (
                    <option key={p.id} value={p.id}>
                      {profEngine === 'postgresql' ? '🐘 ' : '🗄️ '} {p.name} ({p.server}:{p.port || (profEngine === 'postgresql' ? 5432 : 1433)} / {p.database}) {p.isDefault ? '★' : ''}
                    </option>
                  );
                })}
              </select>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleSaveCurrentToSQLite}
                title="Save current parameters to SQLite database"
                style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                <Plus size={11} />
                <span>Save Current</span>
              </button>
            </div>
          </div>

          {/* Connection Form */}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px', display: 'block' }}>
                Server Host / Instance
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="localhost, server.domain.com"
                value={config.server}
                onChange={(e) => handleSaveConfig({ ...config, server: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px', display: 'block' }}>
                Port
              </label>
              <input
                type="number"
                className="form-input"
                placeholder={isPg ? '5432' : '1433'}
                value={config.port}
                onChange={(e) => {
                  const nextPort = parseInt(e.target.value, 10) || (isPg ? 5432 : 1433);
                  handleSaveConfig({ ...config, port: nextPort });
                }}
              />
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px', display: 'block' }}>
              Database Name
            </label>
            <input
              type="text"
              className="form-input"
              placeholder={isPg ? 'postgres, production_db' : 'e.g. SalesDB, master'}
              value={config.database}
              onChange={(e) => handleSaveConfig({ ...config, database: e.target.value })}
            />
          </div>

          {/* Auth Type */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '11.5px', color: '#cbd5e1', marginBottom: '6px', display: 'block' }}>
              Authentication
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#e2e8f0', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="authType"
                  checked={config.authType === 'sql'}
                  onChange={() => handleSaveConfig({ ...config, authType: 'sql' })}
                />
                {isPg ? 'Password (MD5 / SCRAM-SHA-256)' : 'SQL Authentication'}
              </label>
              {!isPg && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#e2e8f0', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="authType"
                    checked={config.authType === 'windows'}
                    onChange={() => handleSaveConfig({ ...config, authType: 'windows' })}
                  />
                  Windows / Integrated
                </label>
              )}
            </div>
          </div>

          {config.authType === 'sql' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px', display: 'block' }}>
                  Login Username
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={isPg ? 'postgres' : 'sa'}
                  value={config.username || ''}
                  onChange={(e) => handleSaveConfig({ ...config, username: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11.5px', color: '#cbd5e1', marginBottom: '4px', display: 'block' }}>
                  Password
                </label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={config.password || ''}
                  onChange={(e) => handleSaveConfig({ ...config, password: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* SSL / Encryption toggle so local & TLS servers both connect cleanly */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#cbd5e1', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!config.encrypt}
                onChange={(e) => handleSaveConfig({ ...config, encrypt: e.target.checked })}
              />
              <span>{isPg ? 'Require SSL/TLS' : 'Encrypt Connection (TLS)'}</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#cbd5e1', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.trustServerCertificate ?? true}
                onChange={(e) => handleSaveConfig({ ...config, trustServerCertificate: e.target.checked })}
              />
              <span>Trust Server Certificate</span>
            </label>
          </div>

          {/* Strict Read-Only & Zero-Lock Enforcement Note */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              padding: '10px 12px',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
            }}
          >
            <ShieldCheck size={16} color="#34d399" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: '1.4' }}>
              <strong style={{ color: '#e2e8f0' }}>DBA Safety Enforcement:</strong>{' '}
              {isPg ? (
                <>
                  PlanIQ queries PostgreSQL system catalogs with{' '}
                  <code style={{ color: '#38bdf8' }}>READ ONLY</code> transactions and non-blocking metadata lookups.
                  It never creates objects or takes restrictive table locks.
                </>
              ) : (
                <>
                  PlanIQ connects with <code style={{ color: '#38bdf8' }}>ApplicationIntent=ReadOnly</code> and runs all
                  DMV queries under <code style={{ color: '#38bdf8' }}>READ UNCOMMITTED</code>. It never creates tables or takes database locks.
                </>
              )}
            </div>
          </div>

          {errorMsg && (
            <div
              style={{
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.4)',
                borderRadius: '6px',
                padding: '8px 12px',
                color: '#fecdd3',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                background: 'rgba(52, 211, 153, 0.15)',
                border: '1px solid rgba(52, 211, 153, 0.4)',
                borderRadius: '6px',
                padding: '8px 12px',
                color: '#a7f3d0',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle2 size={15} />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleConnect()}
            disabled={isLoading || !config.server || !config.database}
          >
            {isLoading ? <RefreshCw size={14} className="spin" /> : <Zap size={14} />}
            <span>{isPg ? 'Connect to PostgreSQL' : 'Connect to SQL Server'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
