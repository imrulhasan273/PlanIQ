import React, { useState, useEffect } from 'react';
import {
  Server,
  Database,
  Shield,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Lock,
  Cpu,
  Zap,
  Activity,
  HardDrive,
  ExternalLink,
  Plus
} from 'lucide-react';
import { ConnectionConfig, ConnectionStatus, DBConnectionProfile } from '../types/livedb';
import { ConnectLiveDB, DisconnectLiveDB, GetLiveDBStatus, GetSavedDBConnections, SaveDBConnection } from '../../wailsjs/go/main/App';

interface LiveConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: ConnectionStatus | null;
  onStatusChange: (status: ConnectionStatus | null) => void;
  defaultUsername?: string;
  onOpenConnectionsTab?: () => void;
}

export const LiveConnectionModal: React.FC<LiveConnectionModalProps> = ({
  isOpen,
  onClose,
  status,
  onStatusChange,
  defaultUsername,
  onOpenConnectionsTab,
}) => {
  const [savedProfiles, setSavedProfiles] = useState<DBConnectionProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');

  const [config, setConfig] = useState<ConnectionConfig>(() => {
    const saved = localStorage.getItem('planiq_live_conn');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (defaultUsername && (!parsed.username || parsed.username === 'sa')) {
          parsed.username = defaultUsername;
        }
        return parsed;
      } catch {}
    }
    return {
      server: 'localhost',
      port: 1433,
      database: 'master',
      authType: 'sql',
      username: defaultUsername || 'sa',
      password: '',
      encrypt: false,
      trustServerCertificate: true,
      applicationIntent: 'ReadOnly',
      timeoutSeconds: 4,
    };
  });

  // When defaultUsername arrives, update username if it's currently unset or default
  useEffect(() => {
    if (defaultUsername) {
      setConfig((prev) => {
        if (!prev.username || prev.username === 'sa') {
          return { ...prev, username: defaultUsername };
        }
        return prev;
      });
    }
  }, [defaultUsername]);

  // Load saved profiles from SQLite when modal opens
  useEffect(() => {
    if (isOpen) {
      loadSavedProfiles();
    }
  }, [isOpen]);

  const loadSavedProfiles = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.GetSavedDBConnections) {
        const list = await GetSavedDBConnections();
        if (Array.isArray(list)) {
          setSavedProfiles(list);
        }
      }
    } catch (err) {
      console.warn('Failed to load saved DB connections:', err);
    }
  };

  const handleSelectSavedProfile = (id: string) => {
    setSelectedProfileId(id);
    const found = savedProfiles.find((p) => p.id === id);
    if (found) {
      setConfig({
        server: found.server,
        port: found.port || 1433,
        database: found.database,
        authType: found.authType as any,
        username: found.username || '',
        password: found.password || '',
        encrypt: found.encrypt,
        trustServerCertificate: found.trustServerCertificate,
        applicationIntent: found.applicationIntent || 'ReadOnly',
        timeoutSeconds: found.timeoutSeconds || 4,
      });
      setSuccessMsg(`Loaded "${found.name}" profile settings`);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  };

  const handleSaveCurrentToSQLite = async () => {
    try {
      const name = prompt('Enter a profile name for SQLite storage:', `${config.server} (${config.database})`);
      if (!name) return;
      await SaveDBConnection({
        id: '',
        name,
        server: config.server,
        port: config.port,
        database: config.database,
        authType: config.authType,
        username: config.username || '',
        password: config.password || '',
        encrypt: config.encrypt ?? false,
        trustServerCertificate: config.trustServerCertificate ?? true,
        applicationIntent: config.applicationIntent || 'ReadOnly',
        timeoutSeconds: config.timeoutSeconds || 4,
        isDefault: false,
        createdAt: '',
        updatedAt: '',
      } as any);
      setSuccessMsg(`Saved profile "${name}" to SQLite!`);
      loadSavedProfiles();
    } catch (err: any) {
      setErrorMsg(`Save failed: ${err?.message || err}`);
    }
  };

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveConfig = (cfg: ConnectionConfig) => {
    setConfig(cfg);
    localStorage.setItem('planiq_live_conn', JSON.stringify(cfg));
  };

  const handleConnect = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.ConnectLiveDB) {
        const res = await ConnectLiveDB(config as any);
        onStatusChange(res);
        setSuccessMsg(`Successfully connected to ${res.serverName} (${res.databaseName})`);
        handleSaveConfig(config);
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        setErrorMsg('Live database connection requires running PlanIQ as a desktop application.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to connect to SQL Server');
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
                Connect to Microsoft SQL Server
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                Live In-Flight Plans, Query Store Harvesting & Real-Time Deadlocks
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
        <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Active status banner if connected */}
          {status && status.connected ? (
            <div
              style={{
                background: 'rgba(52, 211, 153, 0.1)',
                border: '1px solid rgba(52, 211, 153, 0.3)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={18} color="#34d399" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#34d399' }}>
                    Connected to {status.serverName}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Database: <strong style={{ color: '#cbd5e1' }}>{status.databaseName}</strong> • Latency: {status.latencyMs}ms {status.isDemo ? '(Demo Mode)' : ''}
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

          {/* SQLite Saved Connection Dropdown */}
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
                  Load Saved SQLite Profile
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
                  {savedProfiles.length} Saved
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
                <option value="">-- Choose from Saved SQLite Connections --</option>
                {savedProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.server}:{p.port || 1433} / {p.database}) {p.isDefault ? '★' : ''}
                  </option>
                ))}
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
                placeholder="1433"
                value={config.port}
                onChange={(e) => handleSaveConfig({ ...config, port: parseInt(e.target.value) || 1433 })}
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
              placeholder="e.g. SalesDB, AdventureWorks"
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
                SQL Authentication
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#e2e8f0', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="authType"
                  checked={config.authType === 'windows'}
                  onChange={() => handleSaveConfig({ ...config, authType: 'windows' })}
                />
                Windows / Integrated
              </label>
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
                  placeholder="sa"
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
              <strong style={{ color: '#e2e8f0' }}>DBA Safety Enforcement:</strong> PlanIQ connects with{' '}
              <code style={{ color: '#38bdf8' }}>ApplicationIntent=ReadOnly</code> and runs all DMV queries under{' '}
              <code style={{ color: '#38bdf8' }}>READ UNCOMMITTED</code>. It never creates tables or takes database locks.
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
            <span>Connect to SQL Server</span>
          </button>
        </div>
      </div>
    </div>
  );
};
