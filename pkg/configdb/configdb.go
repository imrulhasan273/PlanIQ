package configdb

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// Store handles persistent SQLite storage for user preferences and page polling toggles
type Store struct {
	mu sync.RWMutex
	db *sql.DB
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
		if err := os.MkdirAll(dir, 0755); err != nil {
			dir = "."
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
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS app_user_settings (
			setting_key TEXT PRIMARY KEY,
			setting_value TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		`
		if _, err := db.Exec(createSQL); err != nil {
			initErr = fmt.Errorf("failed to init config db tables: %w", err)
			return
		}

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
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
			`
			_, _ = db.Exec(seedSQL,
				// Demo instance
				"conn_demo_prod", "DC-DBPROD1 (AmmisOnlineProd)", "demo", 1433, "AmmisOnlineProd", "demo", "sa", "",
				0, 1, "ReadOnly", 4, 1, now, now,
				// Localhost template
				"conn_local_sql", "Local SQL Server (localhost)", "localhost", 1433, "master", "sql", "sa", "",
				0, 1, "ReadOnly", 4, 0, now, now,
			)
		}

		defaultStore = &Store{db: db}
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

// DBConnectionProfile represents a saved SQL Server connection profile in SQLite
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
		       is_default, created_at, updated_at
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
		var encInt, trustInt, defInt int
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Server, &p.Port, &p.Database, &p.AuthType,
			&p.Username, &p.Password, &encInt, &trustInt, &p.ApplicationIntent,
			&p.TimeoutSeconds, &defInt, &p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			continue
		}
		p.Encrypt = (encInt == 1)
		p.TrustServerCertificate = (trustInt == 1)
		p.IsDefault = (defInt == 1)
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

	if p.Port == 0 {
		p.Port = 1433
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

	stmt := `
	INSERT INTO db_connections (
		id, name, server, port, database_name, auth_type, username, password,
		encrypt, trust_server_certificate, application_intent, timeout_seconds,
		is_default, created_at, updated_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
		updated_at = excluded.updated_at;
	`
	_, err := s.db.Exec(stmt,
		p.ID, p.Name, p.Server, p.Port, p.Database, p.AuthType,
		p.Username, p.Password, encInt, trustInt, p.ApplicationIntent,
		p.TimeoutSeconds, defInt, p.CreatedAt, p.UpdatedAt,
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

