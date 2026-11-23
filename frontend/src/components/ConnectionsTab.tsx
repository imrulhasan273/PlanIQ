import React, { useState, useEffect } from 'react';
import {
  Server,
  Database,
  Plus,
  Trash2,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Zap,
  RefreshCw,
  Shield,
  ShieldCheck,
  Lock,
  Star,
  Search,
  ArrowRight,
  Eye,
  EyeOff,
  Activity,
  HardDrive,
  KeyRound,
  ExternalLink,
  Info
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
  // Engine filter in sidebar: 'all' | 'postgresql' | 'sqlserver'
  const [engineFilter, setEngineFilter] = useState<'all' | 'postgresql' | 'sqlserver'>(() => {
    return engine === 'postgresql' ? 'postgresql' : 'sqlserver';
  });

  const [profiles, setProfiles] = useState<DBConnectionProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [formData, setFormData] = useState<DBConnectionProfile>(() =>
    getEmptyProfile(engine, 0, windowsUser?.username)
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

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

  // Synchronize engine filter with app engine change (e.g. from top bar)
  useEffect(() => {
    if (engine) {
      setEngineFilter(engine);
    }
  }, [engine]);

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
        let target = safeList[0];
        if (selectIdAfterLoad) {
          const found = safeList.find((p) => p.id === selectIdAfterLoad);
          if (found) target = found;
        } else {
          // Find matching default or first profile for current engine filter
          const defaultForEngine = safeList.find(
            (p) => p.isDefault && (engineFilter === 'all' || getProfileEngine(p) === engineFilter)
          );
          const firstForEngine = safeList.find(
            (p) => engineFilter === 'all' || getProfileEngine(p) === engineFilter
          );
          target = defaultForEngine || firstForEngine || safeList[0];
        }
        setSelectedId(target.id);
        setFormData({ ...target, engine: getProfileEngine(target) });
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

  const handleSelectProfile = (p: DBConnectionProfile) => {
    setSelectedId(p.id);
    setFormData({ ...p, engine: getProfileEngine(p) });
    setTestResult(null);
  };

  const handleNewProfile = () => {
    const targetEngine: 'sqlserver' | 'postgresql' =
      engineFilter === 'all' ? (engine || 'sqlserver') : engineFilter;
    const sameEngineCount = profiles.filter((p) => getProfileEngine(p) === targetEngine).length;
    const def = getEmptyProfile(targetEngine, sameEngineCount, windowsUser?.username);
    setSelectedId('');
    setFormData(def);
    setTestResult(null);
  };

  const handleSwitchFormEngine = (newEngine: 'sqlserver' | 'postgresql') => {
    const currentEngine = getProfileEngine(formData);
    if (currentEngine === newEngine && formData.engine === newEngine) return;

    const isTargetPg = newEngine === 'postgresql';

    let newPort = formData.port;
    if (!isTargetPg && formData.port === 5432) newPort = 1433;
    if (isTargetPg && formData.port === 1433) newPort = 5432;

    let newDb = formData.database;
    if (!isTargetPg && formData.database === 'postgres') newDb = 'master';
    if (isTargetPg && formData.database === 'master') newDb = 'postgres';

    let newUsername = formData.username;
    if (!isTargetPg && formData.username === 'postgres') newUsername = windowsUser?.username || 'sa';
    if (isTargetPg && (formData.username === 'sa' || formData.username === windowsUser?.username)) newUsername = 'postgres';

    let newName = formData.name;
    if (!newName.trim() || /^(PostgreSQL|SQL Server) #\d+$/i.test(newName.trim())) {
      const sameEngineCount = profiles.filter((p) => getProfileEngine(p) === newEngine).length;
      newName = isTargetPg ? `PostgreSQL #${sameEngineCount + 1}` : `SQL Server #${sameEngineCount + 1}`;
    }

    setFormData({
      ...formData,
      engine: newEngine,
      port: newPort,
      database: newDb,
      username: newUsername,
      name: newName,
      authType: isTargetPg && formData.authType === 'windows' ? 'sql' : formData.authType,
    });
    setTestResult(null);
  };

  const handleDuplicate = (p: DBConnectionProfile) => {
    const clone: DBConnectionProfile = {
      ...p,
      id: '',
      name: `${p.name} (Copy)`,
      isDefault: false,
      engine: getProfileEngine(p),
    };
    setSelectedId('');
    setFormData(clone);
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

    setIsSaving(true);
    try {
      const payload: DBConnectionProfile = {
        ...formData,
        engine: getProfileEngine(formData),
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
      const profEngine = getProfileEngine(formData);
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

  const pgCount = profiles.filter((p) => getProfileEngine(p) === 'postgresql').length;
  const sqlCount = profiles.filter((p) => getProfileEngine(p) === 'sqlserver').length;
  const allCount = profiles.length;

  const filteredProfiles = profiles.filter((p) => {
    const profEngine = getProfileEngine(p);
    if (engineFilter !== 'all' && profEngine !== engineFilter) {
      return false;
    }
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.server.toLowerCase().includes(q) ||
      p.database.toLowerCase().includes(q)
    );
  });

  const formEngine = getProfileEngine(formData);
  const isPg = formEngine === 'postgresql';

  const headerTitle =
    engineFilter === 'postgresql'
      ? 'PostgreSQL Connection Studio'
      : engineFilter === 'sqlserver'
      ? 'SQL Server Connection Studio'
      : 'Database Connection Studio';

  const headerSubtitle =
    engineFilter === 'postgresql'
      ? 'Manage saved PostgreSQL cluster profiles, SCRAM/MD5 credentials, and 1-click active session switches.'
      : engineFilter === 'sqlserver'
      ? 'Manage saved Microsoft SQL Server credentials, TLS parameters, and 1-click active session switches.'
      : 'Manage saved PostgreSQL & SQL Server credentials, TLS parameters, and 1-click active session switches.';

  return (
    <div className="conn-page-wrapper">
      {/* Page Header */}
      <div className="conn-page-header glass-panel">
        <div className="conn-header-left">
          <div className="conn-header-icon-box">
            <Database size={24} color="#38bdf8" />
          </div>
          <div>
            <div className="conn-title-row">
              <h1 className="conn-page-title">{headerTitle}</h1>
              <span className="conn-sqlite-pill">
                <HardDrive size={11} color="#34d399" />
                <span>SQLite DB Storage</span>
              </span>
              <span className="conn-count-pill">
                {filteredProfiles.length} of {profiles.length} Profiles
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
                <span className="conn-active-label">ACTIVE DATABASE</span>
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
                  <Zap size={13} />
                  <span>Live Radar</span>
                </button>
              )}
            </div>
          ) : (
            <div className="conn-offline-badge">
              <span className="conn-offline-dot" />
              <span>Offline / Disconnected</span>
            </div>
          )}

          <button type="button" className="btn btn-primary" onClick={handleNewProfile}>
            <Plus size={15} />
            <span>New Connection</span>
          </button>
        </div>
      </div>

      {bannerMsg && (
        <div className={`conn-banner ${bannerMsg.type}`}>
          {bannerMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{bannerMsg.text}</span>
          <button type="button" className="conn-banner-close" onClick={() => setBannerMsg(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Main Dual-Pane Studio */}
      <div className="conn-studio-grid">
        {/* LEFT COLUMN: Saved Profiles Directory */}
        <div className="conn-list-column glass-panel">
          <div className="conn-list-toolbar">
            <div className="conn-search-box">
              <Search size={14} className="conn-search-icon" />
              <input
                type="text"
                placeholder="Filter saved connections..."
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
              title="Refresh from SQLite database"
            >
              <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
            </button>
          </div>

          {/* Engine Filter Tabs */}
          <div className="conn-filter-tabs">
            <button
              type="button"
              className={`conn-filter-tab ${engineFilter === 'postgresql' ? 'active pg-filter' : ''}`}
              onClick={() => {
                setEngineFilter('postgresql');
                if (onEngineChange) onEngineChange('postgresql');
              }}
            >
              <span>🐘 PostgreSQL</span>
              <span className="conn-filter-count">{pgCount}</span>
            </button>
            <button
              type="button"
              className={`conn-filter-tab ${engineFilter === 'sqlserver' ? 'active mssql-filter' : ''}`}
              onClick={() => {
                setEngineFilter('sqlserver');
                if (onEngineChange) onEngineChange('sqlserver');
              }}
            >
              <span>🗄️ SQL Server</span>
              <span className="conn-filter-count">{sqlCount}</span>
            </button>
            <button
              type="button"
              className={`conn-filter-tab ${engineFilter === 'all' ? 'active' : ''}`}
              onClick={() => setEngineFilter('all')}
            >
              <span>All</span>
              <span className="conn-filter-count">{allCount}</span>
            </button>
          </div>

          <div className="conn-card-list">
            {filteredProfiles.length === 0 ? (
              <div className="conn-empty-state">
                <Database size={32} color="#64748b" />
                <p>No {engineFilter !== 'all' ? (engineFilter === 'postgresql' ? 'PostgreSQL' : 'SQL Server') : ''} connections found</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleNewProfile}>
                  Create First Connection
                </button>
              </div>
            ) : (
              filteredProfiles.map((p) => {
                const isSelected = p.id === selectedId;
                const cardEngine = getProfileEngine(p);
                const isCardPg = cardEngine === 'postgresql';
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
                    <div className="conn-card-top">
                      <div className="conn-card-title-wrap">
                        <span className="conn-card-name">{p.name}</span>
                        <span className={`conn-engine-tag ${isCardPg ? 'pg-tag' : 'mssql-tag'}`}>
                          {isCardPg ? '🐘 PostgreSQL' : '🗄️ SQL Server'}
                        </span>
                        {p.isDefault && (
                          <span className="conn-default-tag" title="Default startup connection">
                            <Star size={10} fill="#f59e0b" color="#f59e0b" />
                            <span>Default</span>
                          </span>
                        )}
                        {isLive && (
                          <span className="conn-live-tag" title="Currently connected">
                            <span className="conn-live-dot" />
                            <span>ACTIVE</span>
                          </span>
                        )}
                      </div>

                      <div className="conn-card-quick-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="conn-card-action-btn"
                          title="Set as Default Connection"
                          onClick={(e) => handleSetDefault(p.id, e)}
                        >
                          <Star
                            size={13}
                            color={p.isDefault ? '#f59e0b' : '#64748b'}
                            fill={p.isDefault ? '#f59e0b' : 'transparent'}
                          />
                        </button>
                        <button
                          type="button"
                          className="conn-card-action-btn"
                          title="Duplicate connection"
                          onClick={() => handleDuplicate(p)}
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          type="button"
                          className="conn-card-action-btn delete-btn"
                          title="Delete from SQLite"
                          onClick={() => handleDelete(p.id, p.name)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="conn-card-details">
                      <div className="conn-detail-pill">
                        <Server size={11} color="#38bdf8" />
                        <span>
                          {p.server}:{p.port || (isCardPg ? 5432 : 1433)}
                        </span>
                      </div>
                      <div className="conn-detail-pill">
                        <Database size={11} color="#818cf8" />
                        <span>{p.database}</span>
                      </div>
                      <span className={`conn-auth-badge auth-${p.authType}`}>
                        {p.authType === 'windows' ? (isCardPg ? 'Peer' : 'Windows') : 'Password'}
                      </span>
                    </div>

                    <div className="conn-card-footer">
                      <button
                        type="button"
                        className="btn btn-primary btn-xs conn-connect-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConnect(p);
                        }}
                        disabled={isConnecting}
                      >
                        <Zap size={11} />
                        <span>{isLive ? 'Reconnect' : 'Connect'}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Connection Configuration Studio */}
        <div className="conn-editor-column glass-panel">
          <div className="conn-editor-header">
            <div className="conn-editor-title-box">
              <h2 className="conn-editor-heading">
                {formData.id ? 'Edit Connection Profile' : 'Configure New Connection'}
              </h2>
              <span className="conn-editor-sub">
                {formData.id ? `ID: ${formData.id}` : 'Unsaved Profile (Will be saved to SQLite)'}
              </span>
            </div>

            <div className="conn-editor-top-actions">
              <label className="conn-default-toggle" title="Auto-connect or prefer this profile">
                <input
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                />
                <Star
                  size={14}
                  color={formData.isDefault ? '#f59e0b' : '#64748b'}
                  fill={formData.isDefault ? '#f59e0b' : 'transparent'}
                />
                <span>Set as Default</span>
              </label>

              {formData.id && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleDuplicate(formData)}
                  title="Clone to new profile"
                >
                  <Copy size={13} />
                  <span>Clone</span>
                </button>
              )}
            </div>
          </div>

          <div className="conn-form-scrollable">
            {/* SECTION 0: Target Database Engine */}
            <div className="conn-form-section conn-engine-section">
              <div className="conn-section-header">
                <Database size={15} color="#38bdf8" />
                <span>Target Database Engine</span>
              </div>
              <div className="conn-engine-toggle-grid">
                <div
                  className={`conn-engine-card ${isPg ? 'selected pg-selected' : ''}`}
                  onClick={() => handleSwitchFormEngine('postgresql')}
                  role="button"
                  tabIndex={0}
                >
                  <div className="conn-engine-icon">🐘</div>
                  <div className="conn-engine-info">
                    <div className="conn-engine-title">PostgreSQL</div>
                    <div className="conn-engine-desc">Port 5432 · db 'postgres' · pg_stat_activity</div>
                  </div>
                  {isPg && (
                    <span className="conn-engine-active-indicator">
                      <Check size={14} /> Active
                    </span>
                  )}
                </div>

                <div
                  className={`conn-engine-card ${!isPg ? 'selected mssql-selected' : ''}`}
                  onClick={() => handleSwitchFormEngine('sqlserver')}
                  role="button"
                  tabIndex={0}
                >
                  <div className="conn-engine-icon">🗄️</div>
                  <div className="conn-engine-info">
                    <div className="conn-engine-title">Microsoft SQL Server</div>
                    <div className="conn-engine-desc">Port 1433 · db 'master' · sys.dm_exec_requests</div>
                  </div>
                  {!isPg && (
                    <span className="conn-engine-active-indicator">
                      <Check size={14} /> Active
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 1: Identity & Server Target */}
            <div className="conn-form-section">
              <div className="conn-section-header">
                <Server size={15} color="#38bdf8" />
                <span>1. Server Identity & Instance Target</span>
              </div>

              <div className="conn-form-row">
                <div className="conn-input-group flex-2">
                  <label>Profile Friendly Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={isPg ? "e.g., PostgreSQL Production (pg-prod-01)" : "e.g., Production SQL Server (sql-prod-01)"}
                    className="conn-input"
                  />
                </div>

                <div className="conn-input-group flex-1">
                  <label>Application Intent</label>
                  <select
                    value={formData.applicationIntent}
                    onChange={(e) => setFormData({ ...formData, applicationIntent: e.target.value })}
                    className="conn-select"
                  >
                    <option value="ReadOnly">ReadOnly (Recommended)</option>
                    <option value="ReadWrite">ReadWrite</option>
                  </select>
                </div>
              </div>

              <div className="conn-form-row">
                <div className="conn-input-group flex-3">
                  <label>Server Host / IP Address</label>
                  <input
                    type="text"
                    value={formData.server}
                    onChange={(e) => setFormData({ ...formData, server: e.target.value })}
                    placeholder={isPg ? "localhost, 127.0.0.1, or db.example.com" : "localhost, sql.example.com, or .\\SQLEXPRESS"}
                    className="conn-input"
                  />
                  <div className="conn-shortcuts-row">
                    <span className="conn-shortcuts-label">Presets:</span>
                    <button
                      type="button"
                      className="conn-chip"
                      onClick={() => setFormData({ ...formData, server: 'localhost' })}
                    >
                      localhost
                    </button>
                    <button
                      type="button"
                      className="conn-chip"
                      onClick={() => setFormData({ ...formData, server: '127.0.0.1' })}
                    >
                      127.0.0.1
                    </button>
                    {isPg ? (
                      <button
                        type="button"
                        className="conn-chip"
                        onClick={() =>
                          setFormData({
                            ...formData,
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
                        onClick={() => setFormData({ ...formData, server: '.\\SQLEXPRESS' })}
                      >
                        .\\SQLEXPRESS
                      </button>
                    )}
                  </div>
                </div>

                <div className="conn-input-group flex-1">
                  <label>TCP Port</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: Number(e.target.value) || (isPg ? 5432 : 1433) })}
                    placeholder={isPg ? "5432" : "1433"}
                    className="conn-input"
                  />
                </div>

                <div className="conn-input-group flex-2">
                  <label>Database Name</label>
                  <input
                    type="text"
                    value={formData.database}
                    onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                    placeholder={isPg ? "postgres, production_db, etc." : "master, SalesDB, etc."}
                    className="conn-input"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: Authentication & Credentials */}
            <div className="conn-form-section">
              <div className="conn-section-header">
                <KeyRound size={15} color="#c084fc" />
                <span>2. Authentication & Credentials</span>
              </div>

              <div className="conn-auth-selector">
                <div
                  className={`conn-auth-tab ${formData.authType === 'sql' ? 'active' : ''}`}
                  onClick={() => setFormData({ ...formData, authType: 'sql' })}
                >
                  <Lock size={14} />
                  <div>
                    <span className="conn-auth-title">
                      {isPg ? 'Standard Password Auth' : 'SQL Server Authentication'}
                    </span>
                    <span className="conn-auth-desc">Login with username and password</span>
                  </div>
                </div>

                <div
                  className={`conn-auth-tab ${formData.authType === 'windows' ? 'active' : ''}`}
                  onClick={() =>
                    setFormData({
                      ...formData,
                      authType: 'windows',
                      username: windowsUser?.username || formData.username,
                    })
                  }
                >
                  <ShieldCheck size={14} />
                  <div>
                    <span className="conn-auth-title">
                      {isPg ? 'Local / OS Peer Security' : 'Windows Authentication'}
                    </span>
                      <span className="conn-auth-desc">
                        Integrated security ({windowsUser?.username || 'Current User'})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="conn-form-row" style={{ marginTop: '14px' }}>
                  <div className="conn-input-group flex-1">
                    <div className="conn-label-row">
                      <label>Login Username</label>
                      {windowsUser?.username && (
                        <button
                          type="button"
                          className="conn-helper-btn"
                          onClick={() => setFormData({ ...formData, username: windowsUser.username })}
                          title={`Click to fill Windows user: ${windowsUser.fullAccount || windowsUser.username}`}
                        >
                          Use Windows User ({windowsUser.username})
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={formData.username || ''}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder={formData.authType === 'windows' ? 'DOMAIN\\username or local' : (isPg ? 'postgres' : 'sa')}
                      className="conn-input"
                    />
                  </div>

                  {formData.authType === 'sql' && (
                    <div className="conn-input-group flex-1">
                      <label>Password</label>
                      <div className="conn-password-wrap">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={formData.password || ''}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          placeholder="••••••••"
                          className="conn-input"
                        />
                        <button
                          type="button"
                          className="conn-toggle-eye"
                          onClick={() => setShowPassword(!showPassword)}
                          title={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            {/* SECTION 3: TLS & Network Configuration */}
            <div className="conn-form-section">
              <div className="conn-section-header">
                <Shield size={15} color="#34d399" />
                <span>3. TLS Encryption & Network Diagnostics</span>
              </div>

              <div className="conn-toggles-grid">
                <label className="conn-checkbox-card">
                  <input
                    type="checkbox"
                    checked={formData.trustServerCertificate}
                    onChange={(e) => setFormData({ ...formData, trustServerCertificate: e.target.checked })}
                  />
                  <div>
                    <span className="conn-check-title">
                      {isPg ? 'Trust Server Certificate (sslmode=no-verify)' : 'Trust Server Certificate'}
                    </span>
                    <span className="conn-check-desc">Allow self-signed certificates without chain validation</span>
                  </div>
                </label>

                <label className="conn-checkbox-card">
                  <input
                    type="checkbox"
                    checked={formData.encrypt}
                    onChange={(e) => setFormData({ ...formData, encrypt: e.target.checked })}
                  />
                  <div>
                    <span className="conn-check-title">
                      {isPg ? 'Enable SSL (sslmode=require)' : 'Encrypt Data in Transit'}
                    </span>
                    <span className="conn-check-desc">Force SSL/TLS payload encryption for secure networks</span>
                  </div>
                </label>

                <div className="conn-timeout-card">
                  <label>Handshake Timeout (Seconds)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={formData.timeoutSeconds}
                    onChange={(e) =>
                      setFormData({ ...formData, timeoutSeconds: Number(e.target.value) || 4 })
                    }
                    className="conn-input conn-input-sm"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 4: Interactive Test Diagnostics Box */}
            {testResult && (
              <div className={`conn-test-box ${testResult.success ? 'success' : 'failed'}`}>
                {testResult.success ? (
                  <>
                    <div className="conn-test-header">
                      <CheckCircle2 size={18} color="#34d399" />
                      <div>
                        <strong>Connection Test Succeeded!</strong>
                        <span>Round-trip handshake latency: {testResult.status?.latencyMs}ms</span>
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
                    <AlertCircle size={18} color="#f43f5e" />
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
                className="btn btn-secondary"
                onClick={handleTest}
                disabled={isTesting}
              >
                <Activity size={14} className={isTesting ? 'spin' : ''} />
                <span>{isTesting ? 'Testing Handshake...' : 'Test Handshake'}</span>
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
                className="btn btn-secondary"
                onClick={() => handleSave(false)}
                disabled={isSaving}
              >
                <HardDrive size={14} />
                <span>{isSaving ? 'Saving...' : 'Save to SQLite'}</span>
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleSave(true)}
                disabled={isSaving || isConnecting}
              >
                <Zap size={14} />
                <span>{isConnecting ? 'Connecting...' : 'Save & Connect'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
