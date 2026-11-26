import React, { useState, useEffect } from 'react';
import {
  Server,
  Database,
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  AlertCircle,
  Zap,
  RefreshCw,
  Shield,
  ShieldCheck,
  Lock,
  Star,
  Search,
  Activity,
  HardDrive,
  KeyRound,
} from 'lucide-react';
import { DBConnectionProfile, ConnectionStatus, WindowsUserInfo } from '../types/livedb';
import {
  GetSavedDBConnections,
  SaveDBConnection,
  DeleteDBConnection,
  SetDefaultDBConnection,
  TestDBConnection,
  ConnectLiveDB,
  DisconnectLiveDB
} from '../../wailsjs/go/main/App';

interface ConnectionsTabProps {
  liveStatus: ConnectionStatus | null;
  windowsUser?: WindowsUserInfo | null;
  engine?: 'sqlserver' | 'postgresql';
  onConnectSuccess: (status: ConnectionStatus) => void;
  onNavigateToRadar?: () => void;
  onEngineChange?: (engine: 'sqlserver' | 'postgresql') => void;
}

export const getProfileEngine = (p: DBConnectionProfile): 'sqlserver' | 'postgresql' => {
  if (p.engine === 'postgresql' || p.engine === 'sqlserver') return p.engine;
  return (p.port === 5432 || p.database?.toLowerCase() === 'postgres') ? 'postgresql' : 'sqlserver';
};

const getEmptyProfile = (targetEngine: 'sqlserver' | 'postgresql' = 'sqlserver', count: number = 0, defaultUser?: string): DBConnectionProfile => {
  const isPg = targetEngine === 'postgresql';
  return {
    id: '',
    name: isPg ? `PostgreSQL #${count + 1}` : `SQL Server #${count + 1}`,
    server: 'localhost',
    port: isPg ? 5432 : 1433,
    database: isPg ? 'postgres' : 'master',
    authType: 'sql',
    username: isPg ? 'postgres' : (defaultUser || 'sa'),
    password: '',
    encrypt: false,
    trustServerCertificate: true,
    applicationIntent: 'ReadOnly',
    timeoutSeconds: 4,
    isDefault: false,
    engine: targetEngine,
    allowRbacWrite: false,
    allowBackupRestore: false,
  };
};

export const ConnectionsTab: React.FC<ConnectionsTabProps> = ({
  liveStatus,
  windowsUser,
  engine = 'sqlserver',
  onConnectSuccess,
  onNavigateToRadar,
  onEngineChange,
}) => {
  const activeEngine: 'postgresql' | 'sqlserver' = engine === 'postgresql' ? 'postgresql' : 'sqlserver';

  const [profiles, setProfiles] = useState<DBConnectionProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [formData, setFormData] = useState<DBConnectionProfile>(() =>
    getEmptyProfile(activeEngine, 0, windowsUser?.username)
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [passwordResetRequired, setPasswordResetRequired] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  const [testResult, setTestResult] = useState<{
    success: boolean;
    status?: ConnectionStatus;
    error?: string;
  } | null>(null);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Synchronize active editor profile whenever top-bar engine changes
  useEffect(() => {
    if (profiles.length > 0) {
      const defaultForEngine = profiles.find((p) => p.isDefault && getProfileEngine(p) === activeEngine);
      const firstForEngine = profiles.find((p) => getProfileEngine(p) === activeEngine);
      const chosen = defaultForEngine || firstForEngine;
      if (chosen) {
        setSelectedId(chosen.id);
        setFormData({
          ...chosen,
          engine: activeEngine,
          allowRbacWrite: Boolean(chosen.allowRbacWrite),
          allowBackupRestore: Boolean(chosen.allowBackupRestore),
        });
        setPasswordResetRequired(false);
        setTestResult(null);
      } else {
        setSelectedId('');
        setFormData(getEmptyProfile(activeEngine, 0, windowsUser?.username));
        setPasswordResetRequired(false);
        setTestResult(null);
      }
    } else {
      setSelectedId('');
      setFormData(getEmptyProfile(activeEngine, 0, windowsUser?.username));
      setPasswordResetRequired(false);
    }
  }, [activeEngine, profiles]);

  // Load all profiles from SQLite on mount
  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async (selectIdAfterLoad?: string) => {
    setIsLoading(true);
    try {
      let safeList: DBConnectionProfile[] = [];
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.GetSavedDBConnections) {
        const list = await GetSavedDBConnections();
        safeList = Array.isArray(list) ? list : [];
      } else {
        const saved = localStorage.getItem('planiq_saved_conns');
        if (saved) {
          try {
            safeList = JSON.parse(saved);
          } catch {}
        }
      }

      setProfiles(safeList);

      if (safeList.length > 0) {
        let target: DBConnectionProfile | undefined;
        if (selectIdAfterLoad) {
          target = safeList.find((p) => p.id === selectIdAfterLoad);
        }
        if (!target) {
          const defaultForEngine = safeList.find(
            (p) => p.isDefault && getProfileEngine(p) === activeEngine
          );
          const firstForEngine = safeList.find(
            (p) => getProfileEngine(p) === activeEngine
          );
          target = defaultForEngine || firstForEngine;
        }
        if (target) {
          setSelectedId(target.id);
          setFormData({
            ...target,
            engine: getProfileEngine(target),
            allowRbacWrite: Boolean(target.allowRbacWrite),
            allowBackupRestore: Boolean(target.allowBackupRestore),
          });
          setPasswordResetRequired(false);
        } else {
          handleNewProfile();
        }
      } else {
        handleNewProfile();
      }
    } catch (err: any) {
      console.error('Failed to load connections from SQLite:', err);
      showBanner('error', `Failed to load profiles from SQLite: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const showBanner = (type: 'success' | 'error', text: string) => {
    setBannerMsg({ type, text });
    setTimeout(() => setBannerMsg(null), 5000);
  };

  const updateSettingField = (patch: Partial<DBConnectionProfile>) => {
    const modifyingSaved = Boolean(formData.id) && !passwordResetRequired;
    if (modifyingSaved) {
      setPasswordResetRequired(true);
      setFormData((prev) => ({ ...prev, ...patch, password: '' }));
    } else {
      setFormData((prev) => ({ ...prev, ...patch }));
    }
  };

  const handleSelectProfile = (p: DBConnectionProfile) => {
    setSelectedId(p.id);
    setFormData({
      ...p,
      engine: getProfileEngine(p),
      allowRbacWrite: Boolean(p.allowRbacWrite),
      allowBackupRestore: Boolean(p.allowBackupRestore),
    });
    setPasswordResetRequired(false);
    setTestResult(null);
  };

  const handleNewProfile = () => {
    const sameEngineCount = profiles.filter((p) => getProfileEngine(p) === activeEngine).length;
    const def = getEmptyProfile(activeEngine, sameEngineCount, windowsUser?.username);
    setSelectedId('');
    setFormData(def);
    setPasswordResetRequired(false);
    setTestResult(null);
  };

  const handleDuplicate = (p: DBConnectionProfile) => {
    const clone: DBConnectionProfile = {
      ...p,
      id: '',
      name: `${p.name} (Copy)`,
      password: '',
      isDefault: false,
      engine: getProfileEngine(p),
      allowRbacWrite: Boolean(p.allowRbacWrite),
      allowBackupRestore: Boolean(p.allowBackupRestore),
    };
    setSelectedId('');
    setFormData(clone);
    setPasswordResetRequired(false);
    setTestResult(null);
    showBanner('success', `Duplicated "${p.name}". Click Save to persist to SQLite.`);
  };

  const handleSave = async (andConnect: boolean = false) => {
    if (!formData.name.trim()) {
      showBanner('error', 'Profile Name cannot be empty.');
      return;
    }
    if (!formData.server.trim()) {
      showBanner('error', 'Server address is required.');
      return;
    }
    if (!formData.database.trim()) {
      showBanner('error', 'Database name is required.');
      return;
    }
    if (formData.authType === 'sql' && passwordResetRequired && !formData.password?.trim()) {
      showBanner('error', 'Connection settings were modified — please re-enter the password before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const payload: DBConnectionProfile = {
        ...formData,
        engine: activeEngine,
        allowRbacWrite: Boolean(formData.allowRbacWrite),
        allowBackupRestore: Boolean(formData.allowBackupRestore),
      };

      let saved: DBConnectionProfile;
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.SaveDBConnection) {
        saved = await SaveDBConnection(payload as any);
      } else {
        saved = {
          ...payload,
          id: payload.id || `conn_${Date.now()}`,
          updatedAt: new Date().toISOString(),
        };
        const updated = [...profiles.filter((p) => p.id !== saved.id), saved];
        localStorage.setItem('planiq_saved_conns', JSON.stringify(updated.map((p) => ({ ...p, password: '' }))));
      }

      setPasswordResetRequired(false);
      showBanner('success', `Saved connection "${saved.name}".`);
      await loadProfiles(saved.id);

      if (andConnect) {
        await handleConnect(saved);
      }
    } catch (err: any) {
      console.error('Failed to save connection:', err);
      showBanner('error', `Save failed: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}" from SQLite?`)) {
      return;
    }

    try {
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.DeleteDBConnection) {
        await DeleteDBConnection(id);
      } else {
        const updated = profiles.filter((p) => p.id !== id);
        localStorage.setItem('planiq_saved_conns', JSON.stringify(updated.map((p) => ({ ...p, password: '' }))));
      }
      showBanner('success', `Deleted profile "${name}".`);
      await loadProfiles();
    } catch (err: any) {
      console.error('Failed to delete connection profile:', err);
      showBanner('error', `Delete failed: ${err?.message || err}`);
    }
  };

  const handleSetDefault = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.SetDefaultDBConnection) {
        await SetDefaultDBConnection(id);
      } else {
        const updated = profiles.map((p) => ({ ...p, isDefault: p.id === id }));
        localStorage.setItem('planiq_saved_conns', JSON.stringify(updated.map((p) => ({ ...p, password: '' }))));
      }
      showBanner('success', 'Default connection updated.');
      await loadProfiles(id);
    } catch (err: any) {
      console.error('Failed to set default connection:', err);
      showBanner('error', `Failed to update default: ${err?.message || err}`);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const profEngine = activeEngine;
      const connPayload = {
        engine: profEngine,
        server: formData.server,
        port: Number(formData.port) || (profEngine === 'postgresql' ? 5432 : 1433),
        database: formData.database,
        authType: formData.authType,
        username: formData.username,
        password: formData.password,
        encrypt: formData.encrypt,
        trustServerCertificate: formData.trustServerCertificate,
        applicationIntent: formData.applicationIntent,
        timeoutSeconds: Number(formData.timeoutSeconds) || 4,
        allowRbacWrite: Boolean(formData.allowRbacWrite),
        allowBackupRestore: Boolean(formData.allowBackupRestore),
      };

      let res: ConnectionStatus;
      if (typeof window !== 'undefined' && (window as any).go?.main?.App?.TestDBConnection) {
        res = await TestDBConnection(connPayload as any);
      } else if (typeof window !== 'undefined' && (window as any).go?.main?.App?.ConnectLiveDB) {
        res = await ConnectLiveDB(connPayload as any);
      } else {
        throw new Error('Connection API unavailable');
      }

      if (res && res.connected) {
        setTestResult({ success: true, status: res });
      } else {
        setTestResult({
          success: false,
          error: res?.errorMessage || 'Connection failed: Please verify server IP, port, credentials, and firewall.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err?.message || String(err),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleConnect = async (profileToConnect?: DBConnectionProfile) => {
    const p = profileToConnect || formData;
    const profEngine = getProfileEngine(p);
    setIsConnecting(true);
    try {
      if (onEngineChange) {
        onEngineChange(profEngine);
      }
      const status = await ConnectLiveDB({
        engine: profEngine,
        server: p.server,
        port: Number(p.port) || (profEngine === 'postgresql' ? 5432 : 1433),
        database: p.database,
        authType: p.authType,
        username: p.username,
        password: p.password,
        encrypt: p.encrypt,
        trustServerCertificate: p.trustServerCertificate,
        applicationIntent: p.applicationIntent,
        timeoutSeconds: Number(p.timeoutSeconds) || 4,
        allowRbacWrite: Boolean(p.allowRbacWrite),
        allowBackupRestore: Boolean(p.allowBackupRestore),
      } as any);

      if (status && status.connected) {
        onConnectSuccess(status);
        showBanner('success', `Connected to ${status.serverName} (${status.databaseName})!`);
      } else {
        showBanner('error', status?.errorMessage || 'Failed to establish live database connection.');
      }
    } catch (err: any) {
      showBanner('error', `Connection error: ${err?.message || err}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await DisconnectLiveDB();
      showBanner('success', 'Disconnected from database.');
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (err: any) {
      showBanner('error', `Disconnect failed: ${err?.message || err}`);
    }
  };

  const engineProfiles = profiles.filter((p) => getProfileEngine(p) === activeEngine);
  const filteredProfiles = engineProfiles.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.server.toLowerCase().includes(q) ||
      p.database.toLowerCase().includes(q)
    );
  });

  const isPg = activeEngine === 'postgresql';
  const headerTitle = isPg ? 'PostgreSQL Connection Studio' : 'SQL Server Connection Studio';
  const headerSubtitle = isPg
    ? 'Encrypted PostgreSQL profiles & 1-click live session switching.'
    : 'Encrypted SQL Server profiles, TLS options & 1-click live switching.';

  return (
    <div className="conn-page-wrapper">
      {/* Compact Studio Header */}
      <div className="conn-page-header glass-panel">
        <div className="conn-header-left">
          <div className="conn-header-icon-box">
            <Database size={18} color="#0284c7" />
          </div>
          <div className="conn-header-title-block">
            <div className="conn-title-row">
              <h1 className="conn-page-title">{headerTitle}</h1>
              <span className="conn-sqlite-pill">
                <HardDrive size={10} />
                <span>AES-256 SQLite</span>
              </span>
              <span className="conn-count-pill">
                {engineProfiles.length} {isPg ? 'PostgreSQL' : 'SQL Server'}
              </span>
            </div>
            <p className="conn-page-subtitle">{headerSubtitle}</p>
          </div>
        </div>

        <div className="conn-header-actions">
          {liveStatus?.connected ? (
            <div className="conn-active-badge">
              <span className="conn-pulse-dot" />
              <div className="conn-active-details">
                <span className="conn-active-label">ACTIVE</span>
                <span className="conn-active-server">
                  {liveStatus.serverName.split('.')[0]} ({liveStatus.databaseName})
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleDisconnect}
                title="Disconnect active live session"
              >
                Disconnect
              </button>
              {onNavigateToRadar && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onNavigateToRadar}
                  title="Go to Live Radar telemetry"
                >
                  <Zap size={12} />
                  <span>Live Radar</span>
                </button>
              )}
            </div>
          ) : (
            <div className="conn-offline-badge">
              <span className="conn-offline-dot" />
              <span>Offline</span>
            </div>
          )}

          <button type="button" className="btn btn-primary btn-sm" onClick={handleNewProfile}>
            <Plus size={14} />
            <span>New Profile</span>
          </button>
        </div>
      </div>

      {bannerMsg && (
        <div className={`conn-banner ${bannerMsg.type}`}>
          {bannerMsg.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          <span>{bannerMsg.text}</span>
          <button type="button" className="conn-banner-close" onClick={() => setBannerMsg(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Main Dual-Pane Studio */}
      <div className="conn-studio-grid">
        {/* LEFT COLUMN: Engine-Scoped Saved Profiles */}
        <div className="conn-list-column glass-panel">
          <div className="conn-list-header">
            <span className="conn-list-header-title">
              {isPg ? '🐘 Saved PostgreSQL Profiles' : '🗄️ Saved SQL Server Profiles'}
            </span>
            <span className="conn-list-header-count">{filteredProfiles.length}</span>
          </div>

          <div className="conn-list-toolbar">
            <div className="conn-search-box">
              <Search size={13} className="conn-search-icon" />
              <input
                type="text"
                placeholder={`Search ${isPg ? 'PostgreSQL' : 'SQL Server'} profiles...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="conn-search-input"
              />
              {searchQuery && (
                <button type="button" className="conn-clear-btn" onClick={() => setSearchQuery('')}>
                  ✕
                </button>
              )}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm btn-icon"
              onClick={() => loadProfiles()}
              title="Refresh saved profiles from SQLite"
            >
              <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
            </button>
          </div>

          <div className="conn-card-list">
            {filteredProfiles.length === 0 ? (
              <div className="conn-empty-state">
                <Database size={28} color="#64748b" />
                <p>No saved {isPg ? 'PostgreSQL' : 'SQL Server'} profiles yet</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleNewProfile}>
                  Create Profile
                </button>
              </div>
            ) : (
              filteredProfiles.map((p) => {
                const isSelected = p.id === selectedId;
                const isLive =
                  liveStatus?.connected &&
                  (liveStatus.serverName.toLowerCase().includes(p.server.toLowerCase()) ||
                    p.server.toLowerCase().includes(liveStatus.serverName.toLowerCase())) &&
                  liveStatus.databaseName.toLowerCase() === p.database.toLowerCase();

                return (
                  <div
                    key={p.id || 'temp'}
                    className={`conn-card ${isSelected ? 'selected' : ''} ${isLive ? 'is-active-conn' : ''}`}
                    onClick={() => handleSelectProfile(p)}
                  >
                    {/* Row 1: Title + Status Tags + Primary Connect Action */}
                    <div className="conn-card-top">
                      <div className="conn-card-title-wrap">
                        <span className="conn-card-name" title={p.name}>{p.name}</span>
                        {p.isDefault && (
                          <span className="conn-default-tag" title="Default startup connection">
                            <Star size={9} fill="currentColor" />
                          </span>
                        )}
                        {isLive && (
                          <span className="conn-live-tag" title="Currently connected">
                            <span className="conn-live-dot" />
                            <span>LIVE</span>
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary btn-xs conn-connect-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConnect(p);
                        }}
                        disabled={isConnecting}
                      >
                        <Zap size={10} />
                        <span>{isLive ? 'Reconnect' : 'Connect'}</span>
                      </button>
                    </div>

                    {/* Row 2: Compact Endpoint + DB + Quick Row Actions */}
                    <div className="conn-card-meta-row">
                      <div className="conn-card-details">
                        <span className="conn-detail-pill">
                          <Server size={10} />
                          <span>{p.server}:{p.port || (isPg ? 5432 : 1433)}</span>
                        </span>
                        <span className="conn-detail-pill">
                          <Database size={10} />
                          <span>{p.database}</span>
                        </span>
                        <span className={`conn-auth-badge auth-${p.authType}`}>
                          {p.authType === 'windows' ? (isPg ? 'Peer' : 'Win') : 'SQL'}
                        </span>
                      </div>

                      <div className="conn-card-quick-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="conn-card-action-btn"
                          title="Set as Default"
                          onClick={(e) => handleSetDefault(p.id, e)}
                        >
                          <Star
                            size={12}
                            color={p.isDefault ? '#f59e0b' : undefined}
                            fill={p.isDefault ? '#f59e0b' : 'transparent'}
                          />
                        </button>
                        <button
                          type="button"
                          className="conn-card-action-btn"
                          title="Clone profile"
                          onClick={() => handleDuplicate(p)}
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          type="button"
                          className="conn-card-action-btn delete-btn"
                          title="Delete profile"
                          onClick={() => handleDelete(p.id, p.name)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Compact Zero-Scroll Editor Studio */}
        <div className="conn-editor-column glass-panel">
          <div className="conn-editor-header">
            <div className="conn-editor-title-box">
              <div className="conn-editor-heading-row">
                <h2 className="conn-editor-heading">
                  {formData.id ? 'Edit Connection Profile' : 'New Connection Profile'}
                </h2>
                <span className={`conn-engine-badge ${isPg ? 'pg-badge' : 'mssql-badge'}`}>
                  {isPg ? '🐘 PostgreSQL · Port 5432' : '🗄️ SQL Server · Port 1433'}
                </span>
              </div>
              <span className="conn-editor-sub">
                {formData.id ? `Profile ID: ${formData.id}` : 'Unsaved draft — click Save to persist in encrypted SQLite'}
              </span>
            </div>

            <div className="conn-editor-top-actions">
              <label className="conn-default-toggle" title="Auto-select this profile on startup">
                <input
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => updateSettingField({ isDefault: e.target.checked })}
                />
                <Star
                  size={13}
                  color={formData.isDefault ? '#f59e0b' : 'currentColor'}
                  fill={formData.isDefault ? '#f59e0b' : 'transparent'}
                />
                <span>Default</span>
              </label>

              {formData.id && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleDuplicate(formData)}
                  title="Clone to new profile"
                >
                  <Copy size={12} />
                  <span>Clone</span>
                </button>
              )}
            </div>
          </div>

          <div className="conn-form-scrollable">
            {/* SECTION 1: Server & Instance Target */}
            <div className="conn-form-section">
              <div className="conn-section-header">
                <Server size={14} color="#0284c7" />
                <span>1. Server &amp; Instance Target</span>
                <div className="conn-shortcuts-inline">
                  <span className="conn-shortcuts-label">Quick Host:</span>
                  <button
                    type="button"
                    className="conn-chip"
                    onClick={() => updateSettingField({ server: 'localhost' })}
                  >
                    localhost
                  </button>
                  <button
                    type="button"
                    className="conn-chip"
                    onClick={() => updateSettingField({ server: '127.0.0.1' })}
                  >
                    127.0.0.1
                  </button>
                  {isPg ? (
                    <button
                      type="button"
                      className="conn-chip"
                      onClick={() =>
                        updateSettingField({
                          server: 'localhost',
                          port: 5432,
                          database: 'postgres',
                          username: 'postgres',
                        })
                      }
                    >
                      postgres-local
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="conn-chip"
                      onClick={() => updateSettingField({ server: '.\\SQLEXPRESS' })}
                    >
                      .\SQLEXPRESS
                    </button>
                  )}
                </div>
              </div>

              <div className="conn-form-row">
                <div className="conn-input-group flex-2">
                  <label>Profile Friendly Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateSettingField({ name: e.target.value })}
                    placeholder={isPg ? 'e.g., PostgreSQL Production (pg-prod-01)' : 'e.g., Production SQL Server (sql-prod-01)'}
                    className="conn-input"
                  />
                </div>

                <div className="conn-input-group flex-2">
                  <label>Server Host / IP Address</label>
                  <input
                    type="text"
                    value={formData.server}
                    onChange={(e) => updateSettingField({ server: e.target.value })}
                    placeholder={isPg ? 'localhost, 127.0.0.1, or db.example.com' : 'localhost, sql.example.com, or .\\SQLEXPRESS'}
                    className="conn-input"
                  />
                </div>

                <div className="conn-input-group conn-port-group">
                  <label>Port</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => updateSettingField({ port: Number(e.target.value) || (isPg ? 5432 : 1433) })}
                    placeholder={isPg ? '5432' : '1433'}
                    className="conn-input"
                  />
                </div>
              </div>

              <div className="conn-form-row">
                <div className="conn-input-group flex-2">
                  <label>Database Name</label>
                  <input
                    type="text"
                    value={formData.database}
                    onChange={(e) => updateSettingField({ database: e.target.value })}
                    placeholder={isPg ? 'postgres, production_db' : 'master, AppDB'}
                    className="conn-input"
                  />
                </div>

                <div className="conn-input-group flex-1">
                  <label>Application Intent</label>
                  <select
                    value={formData.applicationIntent}
                    onChange={(e) => updateSettingField({ applicationIntent: e.target.value })}
                    className="conn-select"
                  >
                    <option value="ReadOnly">ReadOnly (Recommended)</option>
                    <option value="ReadWrite">ReadWrite</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SECTIONS 2 & 3 SIDE-BY-SIDE */}
            <div className="conn-dual-sections-grid">
              {/* SECTION 2: Authentication & Credentials */}
              <div className="conn-form-section">
                <div className="conn-section-header">
                  <KeyRound size={14} color="#7c3aed" />
                  <span>2. Authentication &amp; Credentials</span>
                </div>

                <div className="conn-auth-segmented">
                  <button
                    type="button"
                    className={`conn-auth-pill ${formData.authType === 'sql' ? 'active' : ''}`}
                    onClick={() => updateSettingField({ authType: 'sql' })}
                  >
                    <Lock size={13} />
                    <span>{isPg ? 'Password Auth' : 'SQL Server Auth'}</span>
                  </button>

                  <button
                    type="button"
                    className={`conn-auth-pill ${formData.authType === 'windows' ? 'active' : ''}`}
                    onClick={() =>
                      updateSettingField({
                        authType: 'windows',
                        username: windowsUser?.username || formData.username,
                      })
                    }
                  >
                    <ShieldCheck size={13} />
                    <span>{isPg ? 'OS Peer Security' : 'Windows Integrated'}</span>
                  </button>
                </div>

                <div className="conn-form-row">
                  <div className="conn-input-group flex-1">
                    <div className="conn-label-row">
                      <label>Login Username</label>
                      {windowsUser?.username && (
                        <button
                          type="button"
                          className="conn-helper-btn"
                          onClick={() => updateSettingField({ username: windowsUser.username })}
                          title={`Fill Windows user: ${windowsUser.fullAccount || windowsUser.username}`}
                        >
                          Use {windowsUser.username}
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={formData.username || ''}
                      onChange={(e) => updateSettingField({ username: e.target.value })}
                      placeholder={formData.authType === 'windows' ? 'DOMAIN\\username' : (isPg ? 'postgres' : 'sa')}
                      className="conn-input"
                    />
                  </div>

                  {formData.authType === 'sql' && (
                    <div className="conn-input-group flex-1">
                      <label>Password</label>
                      <div className="conn-password-wrap">
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={formData.password || ''}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          placeholder={passwordResetRequired ? 'Re-enter password to save changes' : '••••••••'}
                          className="conn-input"
                        />
                      </div>
                      {passwordResetRequired && (
                        <span style={{ fontSize: '11px', color: '#f59e0b', marginTop: '4px', display: 'block' }}>
                          Settings modified — re-enter password before saving.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 3: TLS & Network Options */}
              <div className="conn-form-section">
                <div className="conn-section-header">
                  <Shield size={14} color="#059669" />
                  <span>3. TLS &amp; Network Options</span>
                </div>

                <div className="conn-tls-stack">
                  <label className="conn-checkbox-card">
                    <input
                      type="checkbox"
                      checked={formData.trustServerCertificate}
                      onChange={(e) => updateSettingField({ trustServerCertificate: e.target.checked })}
                    />
                    <div>
                      <span className="conn-check-title">
                        {isPg ? 'Trust Server Certificate (no-verify)' : 'Trust Server Certificate'}
                      </span>
                      <span className="conn-check-desc">Accept self-signed certs without CA chain check</span>
                    </div>
                  </label>

                  <label className="conn-checkbox-card">
                    <input
                      type="checkbox"
                      checked={formData.encrypt}
                      onChange={(e) => updateSettingField({ encrypt: e.target.checked })}
                    />
                    <div>
                      <span className="conn-check-title">
                        {isPg ? 'Require SSL (sslmode=require)' : 'Encrypt Connection (TLS)'}
                      </span>
                      <span className="conn-check-desc">Enforce encrypted payload channel in transit</span>
                    </div>
                  </label>

                  {isPg && (
                    <>
                      <label className="conn-checkbox-card">
                        <input
                          type="checkbox"
                          checked={Boolean(formData.allowRbacWrite)}
                          onChange={(e) => updateSettingField({ allowRbacWrite: e.target.checked })}
                        />
                        <div>
                          <span className="conn-check-title">
                            Write for RBAC (Security &amp; RBAC Studio only)
                          </span>
                          <span className="conn-check-desc">
                            Allow executing GRANT/REVOKE/ALTER ROLE DDL in Security &amp; RBAC. Live Radar remains strictly Read-Only.
                          </span>
                        </div>
                      </label>
                      <label className="conn-checkbox-card">
                        <input
                          type="checkbox"
                          checked={Boolean(formData.allowBackupRestore)}
                          onChange={(e) => updateSettingField({ allowBackupRestore: e.target.checked })}
                        />
                        <div>
                          <span className="conn-check-title">
                            Enable Backup &amp; Restore Studio
                          </span>
                          <span className="conn-check-desc">
                            Unlock the Backup &amp; Restore page in the top navbar for logical, physical, incremental, and restore workflows.
                          </span>
                        </div>
                      </label>
                    </>
                  )}

                  <div className="conn-network-bottom-row">
                    <div className="conn-timeout-inline">
                      <label>Timeout (sec)</label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={formData.timeoutSeconds}
                        onChange={(e) =>
                          updateSettingField({ timeoutSeconds: Number(e.target.value) || 4 })
                        }
                        className="conn-input conn-input-sm"
                      />
                    </div>
                    <span
                      className="conn-dba-safe-pill"
                      title={
                        isPg && (formData.allowRbacWrite || formData.allowBackupRestore)
                          ? 'Live Radar remains strictly Read-Only; enabled studios run user-confirmed operations'
                          : 'PlanIQ runs read-only diagnostics without acquiring write locks'
                      }
                    >
                      <ShieldCheck size={12} />
                      <span>
                        {isPg && (formData.allowRbacWrite || formData.allowBackupRestore)
                          ? [
                              'Live Radar Read-Only',
                              formData.allowRbacWrite ? 'RBAC Write' : '',
                              formData.allowBackupRestore ? 'Backup/Restore' : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')
                          : 'Read-Only · Zero Locks'}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 4: Interactive Test Diagnostics Box */}
            {testResult && (
              <div className={`conn-test-box ${testResult.success ? 'success' : 'failed'}`}>
                {testResult.success ? (
                  <>
                    <div className="conn-test-header">
                      <CheckCircle2 size={17} />
                      <div>
                        <strong>Connection Test Succeeded</strong>
                        <span>Handshake latency: {testResult.status?.latencyMs}ms</span>
                      </div>
                    </div>
                    <div className="conn-test-metrics">
                      <div className="conn-test-metric">
                        <span className="metric-label">Server Version</span>
                        <span className="metric-value">{testResult.status?.serverVersion}</span>
                      </div>
                      <div className="conn-test-metric">
                        <span className="metric-label">Server Host</span>
                        <span className="metric-value">{testResult.status?.serverName}</span>
                      </div>
                      <div className="conn-test-metric">
                        <span className="metric-label">Target DB</span>
                        <span className="metric-value">{testResult.status?.databaseName}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="conn-test-header">
                    <AlertCircle size={17} />
                    <div>
                      <strong>Connection Test Failed</strong>
                      <span className="conn-test-error-text">{testResult.error}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BOTTOM ACTIONS BAR */}
          <div className="conn-editor-footer">
            <div className="conn-footer-left">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleTest}
                disabled={isTesting}
              >
                <Activity size={13} className={isTesting ? 'spin' : ''} />
                <span>{isTesting ? 'Testing...' : 'Test Handshake'}</span>
              </button>

              {formData.id && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(formData.id, formData.name)}
                >
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
              )}
            </div>

            <div className="conn-footer-right">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleSave(false)}
                disabled={isSaving}
              >
                <HardDrive size={13} />
                <span>{isSaving ? 'Saving...' : 'Save to SQLite'}</span>
              </button>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handleSave(true)}
                disabled={isSaving || isConnecting}
              >
                <Zap size={13} />
                <span>{isConnecting ? 'Connecting...' : 'Save & Connect'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
