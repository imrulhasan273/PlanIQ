package configdb

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// Store handles persistent SQLite storage for user preferences and page polling toggles
type Store struct {
	mu        sync.RWMutex
	db        *sql.DB
	secretKey []byte
}

var (
	defaultStore *Store
	once         sync.Once
)

// DefaultPages defines all Live Radar subtabs that can have polling enabled/disabled
var DefaultPages = []string{
	"advisors",
	"sessions",
	"sleeping",
	"waithistory",
	"blocking",
	"waits",
	"querystore",
	"bufferpool",
	"indexes",
	"deadlocks",
	"tempdb",
	"vitals",
}

// GetDB returns the singleton Store instance
func GetDB() (*Store, error) {
	var initErr error
	once.Do(func() {
		// Determine safe configuration path in AppData or home
		baseDir, err := os.UserConfigDir()
		if err != nil || baseDir == "" {
			baseDir = "."
		}
		dir := filepath.Join(baseDir, "PlanIQ")
		if err := os.MkdirAll(dir, 0700); err != nil {
			dir = "."
		} else {
			_ = os.Chmod(dir, 0700)
		}

		dbPath := filepath.Join(dir, "planiq_config.db")
		db, err := sql.Open("sqlite", dbPath)
		if err != nil {
			initErr = fmt.Errorf("failed to open sqlite config db: %w", err)
			return
		}

		// Ensure connection is valid & configure PRAGMAs
		if err := db.Ping(); err != nil {
			initErr = fmt.Errorf("failed to ping sqlite config db: %w", err)
			return
		}
		_ = os.Chmod(dbPath, 0600)

		_, _ = db.Exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;`)

		// Create tables
		createSQL := `
		CREATE TABLE IF NOT EXISTS radar_page_config (
			page_id TEXT PRIMARY KEY,
			polling_enabled INTEGER NOT NULL DEFAULT 1,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS db_connections (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			server TEXT NOT NULL,
			port INTEGER NOT NULL DEFAULT 1433,
			database_name TEXT NOT NULL,
			auth_type TEXT NOT NULL DEFAULT 'sql',
			username TEXT DEFAULT '',
			password TEXT DEFAULT '',
			encrypt INTEGER NOT NULL DEFAULT 0,
			trust_server_certificate INTEGER NOT NULL DEFAULT 1,
			application_intent TEXT NOT NULL DEFAULT 'ReadOnly',
			timeout_seconds INTEGER NOT NULL DEFAULT 4,
			is_default INTEGER NOT NULL DEFAULT 0,
			engine TEXT NOT NULL DEFAULT 'sqlserver',
			allow_rbac_write INTEGER NOT NULL DEFAULT 0,
			allow_backup_restore INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS app_user_settings (
			setting_key TEXT PRIMARY KEY,
			setting_value TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS query_store_wait_history (
			server_name TEXT NOT NULL,
			database_name TEXT NOT NULL,
			interval_label TEXT NOT NULL,
			total_wait_ms REAL NOT NULL,
			cpu_wait_ms REAL NOT NULL,
			lock_wait_ms REAL NOT NULL,
			io_wait_ms REAL NOT NULL,
			memory_wait_ms REAL NOT NULL,
			other_wait_ms REAL NOT NULL,
			exec_count INTEGER NOT NULL,
			is_anomaly INTEGER NOT NULL DEFAULT 0,
			anomaly_reason TEXT DEFAULT '',
			synced_at TEXT NOT NULL,
			PRIMARY KEY (server_name, database_name, interval_label)
		);

		CREATE TABLE IF NOT EXISTS live_deadlock_history (
			server_name TEXT NOT NULL,
			timestamp TEXT NOT NULL,
			victim_spid INTEGER NOT NULL,
			deadlock_graph_xml TEXT NOT NULL,
			process_count INTEGER NOT NULL,
			locked_resource_count INTEGER NOT NULL,
			deadlock_type TEXT DEFAULT '',
			summary TEXT DEFAULT '',
			synced_at TEXT NOT NULL,
			PRIMARY KEY (server_name, timestamp, victim_spid)
		);
		CREATE TABLE IF NOT EXISTS pg_backup_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS pg_backup_jobs (
			id TEXT PRIMARY KEY,
			started_at TEXT NOT NULL,
			finished_at TEXT DEFAULT '',
			duration_ms INTEGER NOT NULL DEFAULT 0,
			engine TEXT NOT NULL DEFAULT 'postgresql',
			server TEXT DEFAULT '',
			database_name TEXT DEFAULT '',
			operation TEXT NOT NULL,
			mode TEXT DEFAULT '',
			format TEXT DEFAULT '',
			output_path TEXT DEFAULT '',
			size_bytes INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL,
			exit_code INTEGER NOT NULL DEFAULT 0,
			command_preview TEXT DEFAULT '',
			error_message TEXT DEFAULT ''
		);

		CREATE TABLE IF NOT EXISTS pg_backup_profiles (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			kind TEXT NOT NULL,
			payload_json TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		`
		if _, err := db.Exec(createSQL); err != nil {
			initErr = fmt.Errorf("failed to init config db tables: %w", err)
			return
		}

		// Run migrations for existing SQLite databases
		_, _ = db.Exec(`ALTER TABLE db_connections ADD COLUMN engine TEXT NOT NULL DEFAULT 'sqlserver';`)
		_, _ = db.Exec(`ALTER TABLE db_connections ADD COLUMN allow_rbac_write INTEGER NOT NULL DEFAULT 0;`)
		_, _ = db.Exec(`ALTER TABLE db_connections ADD COLUMN allow_backup_restore INTEGER NOT NULL DEFAULT 0;`)

		// Purge any legacy demo mock connection from SQLite
		_, _ = db.Exec(`DELETE FROM db_connections WHERE id = 'conn_demo_prod' OR auth_type = 'demo' OR server = 'demo';`)

		// Seed initial connections if empty
		var count int
		_ = db.QueryRow(`SELECT COUNT(*) FROM db_connections;`).Scan(&count)
		if count == 0 {
			now := time.Now().UTC().Format(time.RFC3339)
			seedSQL := `
			INSERT INTO db_connections (
				id, name, server, port, database_name, auth_type, username, password,
				encrypt, trust_server_certificate, application_intent, timeout_seconds,
				is_default, created_at, updated_at
			) VALUES 
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
			`
			_, _ = db.Exec(seedSQL,
				// Localhost template
				"conn_local_sql", "Local SQL Server (localhost)", "localhost", 1433, "master", "sql", "sa", "",
				0, 1, "ReadOnly", 4, 1, now, now,
			)
		}

		secretKey, keyErr := loadOrCreateKey(dir)
		if keyErr != nil {
			initErr = keyErr
			return
		}

		defaultStore = &Store{db: db, secretKey: secretKey}
	})

	if initErr != nil {
		return nil, initErr
	}
	return defaultStore, nil
}

// GetRadarPagePollingConfig retrieves all per-page polling preferences
func (s *Store) GetRadarPagePollingConfig() (map[string]bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Default all known pages to true
	result := make(map[string]bool)
	for _, page := range DefaultPages {
		result[page] = true
	}

	rows, err := s.db.Query(`SELECT page_id, polling_enabled FROM radar_page_config;`)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	for rows.Next() {
		var pageID string
		var enabledInt int
		if err := rows.Scan(&pageID, &enabledInt); err == nil {
			result[pageID] = (enabledInt == 1)
		}
	}

	return result, nil
}

// SetRadarPagePolling persists an enable/disable state for a given Live Radar subtab
func (s *Store) SetRadarPagePolling(pageID string, enabled bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	enabledInt := 0
	if enabled {
		enabledInt = 1
	}

	now := time.Now().UTC().Format(time.RFC3339)

	stmt := `
	INSERT INTO radar_page_config (page_id, polling_enabled, updated_at)
	VALUES (?, ?, ?)
	ON CONFLICT(page_id) DO UPDATE SET
		polling_enabled = excluded.polling_enabled,
		updated_at = excluded.updated_at;
	`
	_, err := s.db.Exec(stmt, pageID, enabledInt, now)
	return err
}

// DBConnectionProfile represents a saved database connection profile in SQLite
type DBConnectionProfile struct {
	ID                     string `json:"id"`
	Name                   string `json:"name"`
	Server                 string `json:"server"`
	Port                   int    `json:"port"`
	Database               string `json:"database"`
	AuthType               string `json:"authType"`
	Username               string `json:"username"`
	Password               string `json:"password"`
	Encrypt                bool   `json:"encrypt"`
	TrustServerCertificate bool   `json:"trustServerCertificate"`
	ApplicationIntent      string `json:"applicationIntent"`
	TimeoutSeconds         int    `json:"timeoutSeconds"`
	IsDefault              bool   `json:"isDefault"`
	Engine                 string `json:"engine"`
	AllowRbacWrite         bool   `json:"allowRbacWrite"`
	AllowBackupRestore     bool   `json:"allowBackupRestore"`
	CreatedAt              string `json:"createdAt"`
	UpdatedAt              string `json:"updatedAt"`
}

// GetDBConnections returns all saved connection profiles ordered by is_default DESC, updated_at DESC
func (s *Store) GetDBConnections() ([]DBConnectionProfile, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(`
		SELECT id, name, server, port, database_name, auth_type, username, password,
		       encrypt, trust_server_certificate, application_intent, timeout_seconds,
		       is_default, COALESCE(engine, 'sqlserver'), COALESCE(allow_rbac_write, 0), COALESCE(allow_backup_restore, 0), created_at, updated_at
		FROM db_connections
		ORDER BY is_default DESC, updated_at DESC;
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []DBConnectionProfile
	for rows.Next() {
		var p DBConnectionProfile
		var encInt, trustInt, defInt, allowRbacInt, allowBackupInt int
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Server, &p.Port, &p.Database, &p.AuthType,
			&p.Username, &p.Password, &encInt, &trustInt, &p.ApplicationIntent,
			&p.TimeoutSeconds, &defInt, &p.Engine, &allowRbacInt, &allowBackupInt, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			continue
		}
		p.Encrypt = (encInt == 1)
		p.TrustServerCertificate = (trustInt == 1)
		p.IsDefault = (defInt == 1)
		p.AllowRbacWrite = (allowRbacInt == 1)
		p.AllowBackupRestore = (allowBackupInt == 1)
		if decrypted, decErr := decryptSecret(s.secretKey, p.Password); decErr == nil {
			p.Password = decrypted
		}
		list = append(list, p)
	}

	return list, nil
}

// SaveDBConnection inserts or updates a connection profile in SQLite
func (s *Store) SaveDBConnection(p DBConnectionProfile) (*DBConnectionProfile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC().Format(time.RFC3339)
	if p.ID == "" {
		p.ID = fmt.Sprintf("conn_%d", time.Now().UnixNano())
		p.CreatedAt = now
	} else if p.CreatedAt == "" {
		p.CreatedAt = now
	}
	p.UpdatedAt = now

	if p.Engine == "" {
		if p.Port == 5432 || strings.ToLower(p.Database) == "postgres" {
			p.Engine = "postgresql"
		} else {
			p.Engine = "sqlserver"
		}
	}

	if p.Port == 0 {
		if p.Engine == "postgresql" {
			p.Port = 5432
		} else {
			p.Port = 1433
		}
	}
	if p.TimeoutSeconds == 0 {
		p.TimeoutSeconds = 4
	}
	if p.ApplicationIntent == "" {
		p.ApplicationIntent = "ReadOnly"
	}
	if p.AuthType == "" {
		p.AuthType = "sql"
	}
	if p.Name == "" {
		p.Name = fmt.Sprintf("%s (%s)", p.Server, p.Database)
	}

	encInt := 0
	if p.Encrypt {
		encInt = 1
	}
	trustInt := 0
	if p.TrustServerCertificate {
		trustInt = 1
	}
	defInt := 0
	if p.IsDefault {
		defInt = 1
		// If setting as default, clear other defaults
		_, _ = s.db.Exec(`UPDATE db_connections SET is_default = 0;`)
	}
	allowRbacInt := 0
	if p.AllowRbacWrite {
		allowRbacInt = 1
	}
	allowBackupInt := 0
	if p.AllowBackupRestore {
		allowBackupInt = 1
	}

	encPassword, err := encryptSecret(s.secretKey, p.Password)
	if err != nil {
		return nil, fmt.Errorf("failed to encrypt connection password: %w", err)
	}

	stmt := `
	INSERT INTO db_connections (
		id, name, server, port, database_name, auth_type, username, password,
		encrypt, trust_server_certificate, application_intent, timeout_seconds,
		is_default, engine, allow_rbac_write, allow_backup_restore, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(id) DO UPDATE SET
		name = excluded.name,
		server = excluded.server,
		port = excluded.port,
		database_name = excluded.database_name,
		auth_type = excluded.auth_type,
		username = excluded.username,
		password = excluded.password,
		encrypt = excluded.encrypt,
		trust_server_certificate = excluded.trust_server_certificate,
		application_intent = excluded.application_intent,
		timeout_seconds = excluded.timeout_seconds,
		is_default = excluded.is_default,
		engine = excluded.engine,
		allow_rbac_write = excluded.allow_rbac_write,
		allow_backup_restore = excluded.allow_backup_restore,
		updated_at = excluded.updated_at;
	`
	_, err = s.db.Exec(stmt,
		p.ID, p.Name, p.Server, p.Port, p.Database, p.AuthType,
		p.Username, encPassword, encInt, trustInt, p.ApplicationIntent,
		p.TimeoutSeconds, defInt, p.Engine, allowRbacInt, allowBackupInt, p.CreatedAt, p.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to save connection profile: %w", err)
	}

	return &p, nil
}

// DeleteDBConnection deletes a connection profile from SQLite
func (s *Store) DeleteDBConnection(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM db_connections WHERE id = ?;`, id)
	return err
}

// SetDefaultDBConnection marks a specific connection profile as default
func (s *Store) SetDefaultDBConnection(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, _ = s.db.Exec(`UPDATE db_connections SET is_default = 0;`)
	_, err := s.db.Exec(`UPDATE db_connections SET is_default = 1 WHERE id = ?;`, id)
	return err
}

// GetAppSetting retrieves a user setting by key from SQLite, returning defaultValue if not found
func (s *Store) GetAppSetting(key string, defaultValue string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var val string
	err := s.db.QueryRow(`SELECT setting_value FROM app_user_settings WHERE setting_key = ?;`, key).Scan(&val)
	if err != nil {
		if err == sql.ErrNoRows {
			return defaultValue, nil
		}
		return defaultValue, err
	}
	return val, nil
}

// SetAppSetting saves or updates a key-value setting in SQLite
func (s *Store) SetAppSetting(key string, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC().Format(time.RFC3339)
	stmt := `
	INSERT INTO app_user_settings (setting_key, setting_value, updated_at)
	VALUES (?, ?, ?)
	ON CONFLICT(setting_key) DO UPDATE SET
		setting_value = excluded.setting_value,
		updated_at = excluded.updated_at;
	`
	_, err := s.db.Exec(stmt, key, value, now)
	return err
}

// GetTheme returns the saved theme from SQLite ('dark' or 'light', default 'dark')
func (s *Store) GetTheme() (string, error) {
	return s.GetAppSetting("theme", "dark")
}

// SetTheme saves the theme to SQLite ('dark' or 'light')
func (s *Store) SetTheme(theme string) error {
	if theme != "light" && theme != "dark" {
		theme = "dark"
	}
	return s.SetAppSetting("theme", theme)
}

// StoredWaitPoint represents a rolling hourly wait snapshot saved in local SQLite
type StoredWaitPoint struct {
	ServerName     string  `json:"serverName"`
	DatabaseName   string  `json:"databaseName"`
	IntervalLabel  string  `json:"intervalLabel"`
	TotalWaitMs    float64 `json:"totalWaitMs"`
	CPUWaitMs      float64 `json:"cpuWaitMs"`
	LockWaitMs     float64 `json:"lockWaitMs"`
	IOWaitMs       float64 `json:"ioWaitMs"`
	MemoryWaitMs   float64 `json:"memoryWaitMs"`
	OtherWaitMs    float64 `json:"otherWaitMs"`
	ExecutionCount int64   `json:"executionCount"`
	IsAnomaly      bool    `json:"isAnomaly"`
	AnomalyReason  string  `json:"anomalyReason"`
	SyncedAt       string  `json:"syncedAt"`
}

// StoredDeadlock represents a deadlock event pulled from system_health and saved in local SQLite
type StoredDeadlock struct {
	ServerName          string `json:"serverName"`
	Timestamp           string `json:"timestamp"`
	VictimSPID          int    `json:"victimSpid"`
	DeadlockGraphXML    string `json:"deadlockGraphXml"`
	ProcessCount        int    `json:"processCount"`
	LockedResourceCount int    `json:"lockedResourceCount"`
	DeadlockType        string `json:"deadlockType"`
	Summary             string `json:"summary"`
	SyncedAt            string `json:"syncedAt"`
}

// SaveWaitHistorySnapshots writes hourly Query Store wait intervals into local SQLite
func (s *Store) SaveWaitHistorySnapshots(serverName, dbName string, points []StoredWaitPoint) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO query_store_wait_history (
			server_name, database_name, interval_label,
			total_wait_ms, cpu_wait_ms, lock_wait_ms, io_wait_ms, memory_wait_ms, other_wait_ms,
			exec_count, is_anomaly, anomaly_reason, synced_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(server_name, database_name, interval_label) DO UPDATE SET
			total_wait_ms = excluded.total_wait_ms,
			cpu_wait_ms = excluded.cpu_wait_ms,
			lock_wait_ms = excluded.lock_wait_ms,
			io_wait_ms = excluded.io_wait_ms,
			memory_wait_ms = excluded.memory_wait_ms,
			other_wait_ms = excluded.other_wait_ms,
			exec_count = excluded.exec_count,
			is_anomaly = excluded.is_anomaly,
			anomaly_reason = excluded.anomaly_reason,
			synced_at = excluded.synced_at;
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	now := time.Now().UTC().Format(time.RFC3339)
	for _, p := range points {
		if p.IntervalLabel == "" || p.IntervalLabel == "NoQueryStore" {
			continue
		}
		anomalyInt := 0
		if p.IsAnomaly {
			anomalyInt = 1
		}
		srv := p.ServerName
		if srv == "" {
			srv = serverName
		}
		dbn := p.DatabaseName
		if dbn == "" {
			dbn = dbName
		}
		synced := p.SyncedAt
		if synced == "" {
			synced = now
		}

		if _, err := stmt.Exec(
			srv, dbn, p.IntervalLabel,
			p.TotalWaitMs, p.CPUWaitMs, p.LockWaitMs, p.IOWaitMs, p.MemoryWaitMs, p.OtherWaitMs,
			p.ExecutionCount, anomalyInt, p.AnomalyReason, synced,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// GetStoredWaitHistory retrieves up to N days of wait points from local SQLite
func (s *Store) GetStoredWaitHistory(serverName, dbName string, days int) ([]StoredWaitPoint, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `
		SELECT server_name, database_name, interval_label,
		       total_wait_ms, cpu_wait_ms, lock_wait_ms, io_wait_ms, memory_wait_ms, other_wait_ms,
		       exec_count, is_anomaly, anomaly_reason, synced_at
		FROM query_store_wait_history
		WHERE (? = '' OR server_name = ?)
		  AND (? = '' OR database_name = ?)
		ORDER BY interval_label ASC;
	`
	rows, err := s.db.Query(query, serverName, serverName, dbName, dbName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []StoredWaitPoint
	for rows.Next() {
		var p StoredWaitPoint
		var anomalyInt int
		if err := rows.Scan(
			&p.ServerName, &p.DatabaseName, &p.IntervalLabel,
			&p.TotalWaitMs, &p.CPUWaitMs, &p.LockWaitMs, &p.IOWaitMs, &p.MemoryWaitMs, &p.OtherWaitMs,
			&p.ExecutionCount, &anomalyInt, &p.AnomalyReason, &p.SyncedAt,
		); err != nil {
			continue
		}
		p.IsAnomaly = (anomalyInt == 1)
		points = append(points, p)
	}

	return points, nil
}

// PurgeOldWaitHistory retains only the last N days of data in SQLite
func (s *Store) PurgeOldWaitHistory(retentionDays int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if retentionDays <= 0 {
		retentionDays = 7
	}
	cutoff := time.Now().UTC().AddDate(0, 0, -retentionDays).Format("2006-01-02 15:04")

	_, err := s.db.Exec(`DELETE FROM query_store_wait_history WHERE interval_label < ?;`, cutoff)
	return err
}

// SaveDeadlockSnapshots writes deadlocks pulled from system_health into local SQLite
func (s *Store) SaveDeadlockSnapshots(serverName string, deadlocks []StoredDeadlock) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO live_deadlock_history (
			server_name, timestamp, victim_spid, deadlock_graph_xml,
			process_count, locked_resource_count, deadlock_type, summary, synced_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(server_name, timestamp, victim_spid) DO UPDATE SET
			deadlock_graph_xml = excluded.deadlock_graph_xml,
			process_count = excluded.process_count,
			locked_resource_count = excluded.locked_resource_count,
			summary = excluded.summary,
			synced_at = excluded.synced_at;
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	now := time.Now().UTC().Format(time.RFC3339)
	for _, d := range deadlocks {
		srv := d.ServerName
		if srv == "" {
			srv = serverName
		}
		synced := d.SyncedAt
		if synced == "" {
			synced = now
		}
		if _, err := stmt.Exec(
			srv, d.Timestamp, d.VictimSPID, d.DeadlockGraphXML,
			d.ProcessCount, d.LockedResourceCount, d.DeadlockType, d.Summary, synced,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// GetStoredDeadlocks returns deadlocks cached in local SQLite
func (s *Store) GetStoredDeadlocks(serverName string, days int) ([]StoredDeadlock, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `
		SELECT server_name, timestamp, victim_spid, deadlock_graph_xml,
		       process_count, locked_resource_count, deadlock_type, summary, synced_at
		FROM live_deadlock_history
		WHERE (? = '' OR server_name = ?)
		ORDER BY timestamp DESC;
	`
	rows, err := s.db.Query(query, serverName, serverName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deadlocks []StoredDeadlock
	for rows.Next() {
		var d StoredDeadlock
		if err := rows.Scan(
			&d.ServerName, &d.Timestamp, &d.VictimSPID, &d.DeadlockGraphXML,
			&d.ProcessCount, &d.LockedResourceCount, &d.DeadlockType, &d.Summary, &d.SyncedAt,
		); err != nil {
			continue
		}
		deadlocks = append(deadlocks, d)
	}

	return deadlocks, nil
}

// PgBackupJobRecord stores the history of PostgreSQL backup and restore jobs in SQLite.
type PgBackupJobRecord struct {
	ID             string `json:"id"`
	StartedAt      string `json:"startedAt"`
	FinishedAt     string `json:"finishedAt"`
	DurationMs     int64  `json:"durationMs"`
	Engine         string `json:"engine"`
	Server         string `json:"server"`
	DatabaseName   string `json:"databaseName"`
	Operation      string `json:"operation"`
	Mode           string `json:"mode"`
	Format         string `json:"format"`
	OutputPath     string `json:"outputPath"`
	SizeBytes      int64  `json:"sizeBytes"`
	Status         string `json:"status"`
	ExitCode       int    `json:"exitCode"`
	CommandPreview string `json:"commandPreview"`
	ErrorMessage   string `json:"errorMessage"`
}

// GetBackupBinDir returns the custom PostgreSQL bin/ folder path stored in SQLite, if any.
func (s *Store) GetBackupBinDir() (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var val string
	err := s.db.QueryRow(`SELECT value FROM pg_backup_settings WHERE key = 'pg_bin_dir';`).Scan(&val)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	return val, nil
}

// SetBackupBinDir saves or clears the custom PostgreSQL bin/ folder path in SQLite.
func (s *Store) SetBackupBinDir(dir string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	stmt := `
		INSERT INTO pg_backup_settings (key, value)
		VALUES ('pg_bin_dir', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value;
	`
	_, err := s.db.Exec(stmt, strings.TrimSpace(dir))
	return err
}

// SaveBackupJob inserts or updates a PostgreSQL backup/restore job record in SQLite.
func (s *Store) SaveBackupJob(job PgBackupJobRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if job.Engine == "" {
		job.Engine = "postgresql"
	}
	stmt := `
		INSERT INTO pg_backup_jobs (
			id, started_at, finished_at, duration_ms, engine, server, database_name,
			operation, mode, format, output_path, size_bytes, status, exit_code,
			command_preview, error_message
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			finished_at = excluded.finished_at,
			duration_ms = excluded.duration_ms,
			output_path = excluded.output_path,
			size_bytes = excluded.size_bytes,
			status = excluded.status,
			exit_code = excluded.exit_code,
			command_preview = excluded.command_preview,
			error_message = excluded.error_message;
	`
	_, err := s.db.Exec(stmt,
		job.ID, job.StartedAt, job.FinishedAt, job.DurationMs, job.Engine, job.Server, job.DatabaseName,
		job.Operation, job.Mode, job.Format, job.OutputPath, job.SizeBytes, job.Status, job.ExitCode,
		job.CommandPreview, job.ErrorMessage,
	)
	return err
}

// GetBackupJobs returns recent PostgreSQL backup and restore job records ordered newest first.
func (s *Store) GetBackupJobs(limit int) ([]PgBackupJobRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 {
		limit = 200
	}
	rows, err := s.db.Query(`
		SELECT id, started_at, COALESCE(finished_at, ''), duration_ms, COALESCE(engine, 'postgresql'),
		       COALESCE(server, ''), COALESCE(database_name, ''), operation, COALESCE(mode, ''),
		       COALESCE(format, ''), COALESCE(output_path, ''), size_bytes, status, exit_code,
		       COALESCE(command_preview, ''), COALESCE(error_message, '')
		FROM pg_backup_jobs
		ORDER BY started_at DESC
		LIMIT ?;
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []PgBackupJobRecord
	for rows.Next() {
		var j PgBackupJobRecord
		if err := rows.Scan(
			&j.ID, &j.StartedAt, &j.FinishedAt, &j.DurationMs, &j.Engine,
			&j.Server, &j.DatabaseName, &j.Operation, &j.Mode,
			&j.Format, &j.OutputPath, &j.SizeBytes, &j.Status, &j.ExitCode,
			&j.CommandPreview, &j.ErrorMessage,
		); err != nil {
			continue
		}
		jobs = append(jobs, j)
	}
	return jobs, nil
}

// DeleteBackupJob removes a backup/restore history record from SQLite.
func (s *Store) DeleteBackupJob(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM pg_backup_jobs WHERE id = ?;`, id)
	return err
}

// PgBackupProfile stores a reusable PostgreSQL backup template in SQLite.
type PgBackupProfile struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Kind        string `json:"kind"` // "logical" | "physical"
	PayloadJSON string `json:"payloadJson"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// SaveBackupProfile inserts or updates a reusable backup template in SQLite.
func (s *Store) SaveBackupProfile(p PgBackupProfile) (*PgBackupProfile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC().Format(time.RFC3339)
	if p.ID == "" {
		p.ID = fmt.Sprintf("pgprof_%d", time.Now().UnixNano())
		p.CreatedAt = now
	} else if p.CreatedAt == "" {
		p.CreatedAt = now
	}
	p.UpdatedAt = now
	if p.Kind == "" {
		p.Kind = "logical"
	}

	stmt := `
		INSERT INTO pg_backup_profiles (id, name, kind, payload_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			kind = excluded.kind,
			payload_json = excluded.payload_json,
			updated_at = excluded.updated_at;
	`
	if _, err := s.db.Exec(stmt, p.ID, p.Name, p.Kind, p.PayloadJSON, p.CreatedAt, p.UpdatedAt); err != nil {
		return nil, err
	}
	return &p, nil
}

// GetBackupProfiles returns all saved PostgreSQL backup templates ordered newest updated first.
func (s *Store) GetBackupProfiles() ([]PgBackupProfile, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(`
		SELECT id, name, kind, payload_json, created_at, updated_at
		FROM pg_backup_profiles
		ORDER BY updated_at DESC, name ASC;
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []PgBackupProfile
	for rows.Next() {
		var p PgBackupProfile
		if err := rows.Scan(&p.ID, &p.Name, &p.Kind, &p.PayloadJSON, &p.CreatedAt, &p.UpdatedAt); err != nil {
			continue
		}
		list = append(list, p)
	}
	return list, nil
}

// DeleteBackupProfile deletes a saved backup template by ID.
func (s *Store) DeleteBackupProfile(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM pg_backup_profiles WHERE id = ?;`, id)
	return err
}




