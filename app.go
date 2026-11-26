package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	sysruntime "runtime"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"github.com/imrulhasan273/PlanIQ/pkg/advisor"
	"github.com/imrulhasan273/PlanIQ/pkg/configdb"
	"github.com/imrulhasan273/PlanIQ/pkg/livedb"
	"github.com/imrulhasan273/PlanIQ/pkg/pgbackup"
	"github.com/imrulhasan273/PlanIQ/pkg/sqlplan"
)

// App struct
type App struct {
	ctx          context.Context
	activeEngine string
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		activeEngine: "sqlserver",
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.fitToCurrentDisplay(ctx)
}

func (a *App) domReady(ctx context.Context) {
	a.fitToCurrentDisplay(ctx)
}

func (a *App) fitToCurrentDisplay(ctx context.Context) {
	if ctx == nil {
		return
	}
	if screens, err := runtime.ScreenGetAll(ctx); err == nil && len(screens) > 0 {
		chosen := screens[0]
		foundCurrent := false
		for _, s := range screens {
			if s.IsCurrent {
				chosen = s
				foundCurrent = true
				break
			}
		}
		if !foundCurrent {
			for _, s := range screens {
				if s.IsPrimary {
					chosen = s
					break
				}
			}
		}
		w, h := chosen.Size.Width, chosen.Size.Height
		if w <= 0 || h <= 0 {
			w, h = chosen.Width, chosen.Height
		}
		if w > 0 && h > 0 {
			runtime.WindowSetSize(ctx, w, h)
			runtime.WindowCenter(ctx)
		}
	}
	runtime.WindowMaximise(ctx)
}

// ParsePlan parses a raw XML string containing a SQL Server ShowPlan
func (a *App) ParsePlan(xmlContent string, planName string) (*sqlplan.PlanAnalysis, error) {
	if planName == "" {
		planName = "Execution Plan"
	}
	return sqlplan.ParseXML(xmlContent, planName)
}

// OpenFileAndParse opens a native file dialog, parses the plan directly on disk,
// and returns the parsed PlanAnalysis struct without sending large raw XML across IPC.
func (a *App) OpenFileAndParse() (*sqlplan.PlanAnalysis, error) {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Execution Plan or Deadlock (.sqlplan, .xml, .json, .xdl)",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Execution Plans & Deadlocks (*.sqlplan;*.xml;*.json;*.xdl)",
				Pattern:     "*.sqlplan;*.xml;*.json;*.xdl",
			},
			{
				DisplayName: "PostgreSQL Plans (*.json)",
				Pattern:     "*.json",
			},
			{
				DisplayName: "SQL Server Plans (*.sqlplan;*.xml)",
				Pattern:     "*.sqlplan;*.xml",
			},
			{
				DisplayName: "Deadlock Graphs (*.xdl)",
				Pattern:     "*.xdl",
			},
			{
				DisplayName: "All Files (*.*)",
				Pattern:     "*.*",
			},
		},
	})
	if err != nil {
		return nil, err
	}
	if selection == "" {
		return nil, nil // user cancelled
	}

	return sqlplan.ParseFile(selection, "")
}

// SelectedPlanFile holds the path, name, and decoded content of a chosen file
type SelectedPlanFile struct {
	Path    string `json:"path"`
	Name    string `json:"name"`
	Content string `json:"content"`
}

// SetActiveEngine sets the currently active database engine filter ("sqlserver" or "postgresql")
func (a *App) SetActiveEngine(engine string) error {
	a.activeEngine = strings.ToLower(engine)
	return nil
}

// GetActiveEngine gets the currently active database engine filter
func (a *App) GetActiveEngine() string {
	if a.activeEngine == "" {
		return "sqlserver"
	}
	return a.activeEngine
}

// OpenFilePicker opens a native file dialog for selecting a plan file filtered by active engine
func (a *App) OpenFilePicker() (*SelectedPlanFile, error) {
	return a.OpenFilePickerForEngine(a.GetActiveEngine())
}

// OpenFilePickerForEngine opens a native file dialog filtered specifically for the requested engine
func (a *App) OpenFilePickerForEngine(engine string) (*SelectedPlanFile, error) {
	engine = strings.ToLower(engine)
	var title string
	var filters []runtime.FileFilter

	if engine == "postgresql" {
		title = "Select PostgreSQL Execution Plan (.json)"
		filters = []runtime.FileFilter{
			{
				DisplayName: "PostgreSQL Execution Plans (*.json)",
				Pattern:     "*.json",
			},
			{
				DisplayName: "All Files (*.*)",
				Pattern:     "*.*",
			},
		}
	} else {
		title = "Select SQL Server Execution Plan or Deadlock (.sqlplan, .xml, .xdl)"
		filters = []runtime.FileFilter{
			{
				DisplayName: "SQL Server Execution Plans (*.sqlplan;*.xml)",
				Pattern:     "*.sqlplan;*.xml",
			},
			{
				DisplayName: "SQL Server Deadlock Graphs (*.xdl)",
				Pattern:     "*.xdl",
			},
			{
				DisplayName: "All Files (*.*)",
				Pattern:     "*.*",
			},
		}
	}

	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:   title,
		Filters: filters,
	})
	if err != nil {
		return nil, err
	}
	if selection == "" {
		return nil, nil // user cancelled
	}

	bytes, err := os.ReadFile(selection)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	utf8Bytes, err := sqlplan.DecodeToUTF8(bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to decode file charset: %w", err)
	}

	return &SelectedPlanFile{
		Path:    selection,
		Name:    filepath.Base(selection),
		Content: string(utf8Bytes),
	}, nil
}

// GetAIAdvice requests optimization recommendations from the AI Advisor
func (a *App) GetAIAdvice(req advisor.AIRequest) (*advisor.AIResponse, error) {
	return advisor.GenerateAdvice(a.ctx, &req)
}

// ComparePlans parses and compares Plan A against Plan B
func (a *App) ComparePlans(xmlA, xmlB, nameA, nameB string) (*sqlplan.PlanComparison, error) {
	if nameA == "" {
		nameA = "Plan A (Baseline)"
	}
	if nameB == "" {
		nameB = "Plan B (Optimized)"
	}
	planA, err := sqlplan.ParseXML(xmlA, nameA)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Plan A: %w", err)
	}
	planB, err := sqlplan.ParseXML(xmlB, nameB)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Plan B: %w", err)
	}
	return sqlplan.ComparePlans(planA, planB), nil
}

// ConnectLiveDB connects to a live SQL Server instance with read-only safety
func (a *App) ConnectLiveDB(cfg livedb.ConnectionConfig) (*livedb.ConnectionStatus, error) {
	client := livedb.GetClient()
	return client.Connect(a.ctx, cfg)
}

// DisconnectLiveDB closes the active live SQL Server connection
func (a *App) DisconnectLiveDB() error {
	client := livedb.GetClient()
	return client.Disconnect()
}

// GetLiveDBStatus returns current connection status
func (a *App) GetLiveDBStatus() livedb.ConnectionStatus {
	client := livedb.GetClient()
	return client.GetStatus()
}

// GetLiveActiveSessions returns currently running user requests from sys.dm_exec_requests
func (a *App) GetLiveActiveSessions(limit int) ([]livedb.ActiveSession, error) {
	client := livedb.GetClient()
	return client.GetActiveSessions(a.ctx, limit)
}

// GetLiveSessionPlan retrieves ShowPlan XML for an in-flight plan handle
func (a *App) GetLiveSessionPlan(planHandleHex string) (string, error) {
	client := livedb.GetClient()
	return client.GetSessionPlan(a.ctx, planHandleHex)
}

// GetLiveQueryPlan captures a live execution plan (PostgreSQL EXPLAIN FORMAT JSON or SQL Server ShowPlan XML) for a SQL query
func (a *App) GetLiveQueryPlan(queryText string) (string, error) {
	client := livedb.GetClient()
	return client.ExplainQuery(a.ctx, queryText)
}

// GetLiveQueryStore pulls top resource-consuming queries from Query Store (default 24h)
func (a *App) GetLiveQueryStore(orderBy string, topN int) ([]livedb.QueryStoreEntry, error) {
	client := livedb.GetClient()
	return client.GetQueryStoreTop(a.ctx, orderBy, topN)
}

// GetLiveQueryStoreWindow pulls top resource-consuming queries within a specific hours window
func (a *App) GetLiveQueryStoreWindow(orderBy string, topN int, hours int) ([]livedb.QueryStoreEntry, error) {
	client := livedb.GetClient()
	return client.GetQueryStoreTopWindow(a.ctx, orderBy, topN, hours)
}

// GetQueryStoreDiagnostic runs lightweight probes to diagnose why Query Store might return no data
func (a *App) GetQueryStoreDiagnostic(hours int) (*livedb.QueryStoreDiagnostic, error) {
	client := livedb.GetClient()
	return client.GetQueryStoreDiagnostic(a.ctx, hours)
}

// GetLiveDPAPerspective returns real server telemetry for SolarWinds DPA perspective tabs
func (a *App) GetLiveDPAPerspective(perspective string) ([]livedb.DPAPerspectiveItem, error) {
	client := livedb.GetClient()
	return client.GetLiveDPAPerspective(a.ctx, perspective)
}

// GetLiveDeadlocks fetches deadlocks from system_health ring buffer
func (a *App) GetLiveDeadlocks(limit int) ([]livedb.LiveDeadlockReport, error) {
	client := livedb.GetClient()
	return client.GetLiveDeadlocks(a.ctx, limit)
}

// GetLiveServerVitals returns CPU, memory, and TempDB pressure metrics
func (a *App) GetLiveServerVitals() (*livedb.ServerVitals, error) {
	client := livedb.GetClient()
	return client.GetServerVitals(a.ctx)
}

// GetLiveWaitStats returns instance-wide cumulative wait statistics
func (a *App) GetLiveWaitStats(limit int) ([]livedb.LiveWaitStat, error) {
	client := livedb.GetClient()
	return client.GetWaitStats(a.ctx, limit)
}

// GetLiveBlockingSessions returns currently active blocking chains and victims
func (a *App) GetLiveBlockingSessions() ([]livedb.LiveBlockingSession, error) {
	client := livedb.GetClient()
	return client.GetBlockingSessions(a.ctx)
}

// GetLiveMissingIndexes returns real-time missing index recommendations
func (a *App) GetLiveMissingIndexes(limit int) ([]livedb.LiveMissingIndex, error) {
	client := livedb.GetClient()
	return client.GetMissingIndexes(a.ctx, limit)
}

// GetLiveTempDBUsage returns TempDB space allocation per SPID
func (a *App) GetLiveTempDBUsage(limit int) ([]livedb.LiveTempDBUsage, error) {
	client := livedb.GetClient()
	return client.GetTempDBUsage(a.ctx, limit)
}

// GetLiveIdleSessions returns sleeping, dormant, and open-transaction sessions
func (a *App) GetLiveIdleSessions(limit int) ([]livedb.IdleSession, error) {
	client := livedb.GetClient()
	return client.GetIdleSessions(a.ctx, limit)
}

// GetLiveAdvisors returns automated AI performance insights and anomaly alerts (SolarWinds DPA Advisors)
func (a *App) GetLiveAdvisors() ([]livedb.PerformanceAdvisor, error) {
	client := livedb.GetClient()
	return client.GetPerformanceAdvisors(a.ctx)
}

// GetLiveWaitHistory returns hourly/daily wait time history and anomalies (SolarWinds DPA Trend Chart)
func (a *App) GetLiveWaitHistory() ([]livedb.WaitTimeHistoryPoint, error) {
	client := livedb.GetClient()
	return client.GetWaitHistory(a.ctx)
}

// SyncSevenDayHistory triggers extraction of 7-day rolling telemetry into local SQLite
func (a *App) SyncSevenDayHistory() (*livedb.SevenDaySyncResult, error) {
	client := livedb.GetClient()
	return client.SyncSevenDayHistory(a.ctx)
}

// GetHistoricalWaitHistory returns stored wait history from local SQLite without requiring live server connection
func (a *App) GetHistoricalWaitHistory(server, database string, days int) ([]configdb.StoredWaitPoint, error) {
	store, err := configdb.GetDB()
	if err != nil {
		return nil, err
	}
	return store.GetStoredWaitHistory(server, database, days)
}

// GetLiveBufferPool returns tables and indexes consuming RAM in buffer pool
func (a *App) GetLiveBufferPool(limit int) ([]livedb.BufferPoolConsumer, error) {
	client := livedb.GetClient()
	return client.GetBufferPoolUsage(a.ctx, limit)
}

// GetLiveUnusedIndexes returns indexes with write overhead but 0 seeks/scans
func (a *App) GetLiveUnusedIndexes(limit int) ([]livedb.UnusedIndex, error) {
	client := livedb.GetClient()
	return client.GetUnusedIndexes(a.ctx, limit)
}

// GetLiveDuplicateIndexes returns overlapping or redundant indexes
func (a *App) GetLiveDuplicateIndexes() ([]livedb.DuplicateIndex, error) {
	client := livedb.GetClient()
	return client.GetDuplicateIndexes(a.ctx)
}

// GetLiveEngineInternals analyzes CPU scheduler quantum exhaustion and NUMA memory balancing
func (a *App) GetLiveEngineInternals() (*livedb.EngineInternalsReport, error) {
	client := livedb.GetClient()
	return client.GetEngineInternals(a.ctx)
}

// GetLivePLEReport provides complete server and per-NUMA Page Life Expectancy diagnostics
// (Feature A: Culprit Attribution & Feature C: NUMA-Aware PLE Heatmap)
func (a *App) GetLivePLEReport() (*livedb.PLEReport, error) {
	client := livedb.GetClient()
	return client.GetPLEReport(a.ctx)
}

// GetLivePgConfigReport retrieves all visible PostgreSQL configurations (pg_settings, postgresql.conf, pg_hba.conf, pg_ident.conf, overrides, and extensions)
func (a *App) GetLivePgConfigReport() (*livedb.PgConfigReport, error) {
	client := livedb.GetClient()
	return client.GetPgConfigReport(a.ctx)
}

// GetLiveSqlServerConfigReport retrieves all visible SQL Server configurations (sys.configurations, scoped configs, DB options, Query Store, files, and trace flags)
func (a *App) GetLiveSqlServerConfigReport() (*livedb.SqlServerConfigReport, error) {
	client := livedb.GetClient()
	return client.GetSqlServerConfigReport(a.ctx)
}

// GetRadarPagePollingConfig retrieves per-subtab polling settings from SQLite
func (a *App) GetRadarPagePollingConfig() (map[string]bool, error) {
	store, err := configdb.GetDB()
	if err != nil {
		return nil, err
	}
	return store.GetRadarPagePollingConfig()
}

// SetRadarPagePolling persists polling enable/disable toggle for a Live Radar subtab to SQLite
func (a *App) SetRadarPagePolling(pageID string, enabled bool) error {
	store, err := configdb.GetDB()
	if err != nil {
		return err
	}
	return store.SetRadarPagePolling(pageID, enabled)
}

// GetSavedDBConnections retrieves all saved database connection profiles from SQLite
func (a *App) GetSavedDBConnections() ([]configdb.DBConnectionProfile, error) {
	store, err := configdb.GetDB()
	if err != nil {
		return nil, err
	}
	return store.GetDBConnections()
}

// SaveDBConnection saves or updates a connection profile in SQLite
func (a *App) SaveDBConnection(p configdb.DBConnectionProfile) (*configdb.DBConnectionProfile, error) {
	store, err := configdb.GetDB()
	if err != nil {
		return nil, err
	}
	return store.SaveDBConnection(p)
}

// DeleteDBConnection removes a connection profile from SQLite
func (a *App) DeleteDBConnection(id string) error {
	store, err := configdb.GetDB()
	if err != nil {
		return err
	}
	return store.DeleteDBConnection(id)
}

// SetDefaultDBConnection sets a connection profile as default in SQLite
func (a *App) SetDefaultDBConnection(id string) error {
	store, err := configdb.GetDB()
	if err != nil {
		return err
	}
	return store.SetDefaultDBConnection(id)
}

// GetAppTheme retrieves the persisted theme ('dark' or 'light') from SQLite
func (a *App) GetAppTheme() (string, error) {
	store, err := configdb.GetDB()
	if err != nil {
		return "dark", err
	}
	return store.GetTheme()
}

// SetAppTheme persists the chosen theme ('dark' or 'light') into SQLite
func (a *App) SetAppTheme(theme string) error {
	store, err := configdb.GetDB()
	if err != nil {
		return err
	}
	return store.SetTheme(theme)
}

// TestDBConnection validates connection parameters against SQL Server without mutating current app state
func (a *App) TestDBConnection(cfg livedb.ConnectionConfig) (*livedb.ConnectionStatus, error) {
	client := livedb.GetClient()
	return client.TestConnection(a.ctx, cfg)
}


// WindowsUserInfo contains logged-in Windows user details
type WindowsUserInfo struct {
	Username    string `json:"username"`
	Domain      string `json:"domain"`
	FullAccount string `json:"fullAccount"`
}

// ─────────────────────────────────────────────────────────────────────────────
// PostgreSQL Security & RBAC Studio — IPC Methods
// ─────────────────────────────────────────────────────────────────────────────

// GetPgRbacOverview returns all roles, FDWs, and foreign servers for the RBAC Studio overview.
func (a *App) GetPgRbacOverview() (*livedb.PgRbacOverview, error) {
	client := livedb.GetClient()
	return client.PgGetRbacOverview(a.ctx)
}

// GetPgTablePrivilegesForRole returns table/view-level grants for a role.
func (a *App) GetPgTablePrivilegesForRole(roleName string) ([]livedb.PgObjectPrivilege, error) {
	client := livedb.GetClient()
	return client.PgGetTablePrivilegesForRole(a.ctx, roleName)
}

// GetPgSchemaPrivilegesForRole returns schema-level ACL entries for a role.
func (a *App) GetPgSchemaPrivilegesForRole(roleName string) ([]livedb.PgSchemaPrivilege, error) {
	client := livedb.GetClient()
	return client.PgGetSchemaPrivilegesForRole(a.ctx, roleName)
}

// GetPgDatabasePrivilegesForRole returns database-level ACL entries for a role.
func (a *App) GetPgDatabasePrivilegesForRole(roleName string) ([]livedb.PgDatabasePrivilege, error) {
	client := livedb.GetClient()
	return client.PgGetDatabasePrivilegesForRole(a.ctx, roleName)
}

// GetPgColumnPrivileges returns column-level grants for a role + optional schema/table filter.
func (a *App) GetPgColumnPrivileges(roleName, schema, table string) ([]livedb.PgColumnPrivilege, error) {
	client := livedb.GetClient()
	return client.PgGetColumnPrivileges(a.ctx, roleName, schema, table)
}

// GetPgTableColumns returns all column names of a table/view in ordinal order.
func (a *App) GetPgTableColumns(schema, table string) ([]string, error) {
	client := livedb.GetClient()
	return client.PgGetTableColumns(a.ctx, schema, table)
}

// GetPgSequencePrivilegesForRole returns sequence-level grants for a role.
func (a *App) GetPgSequencePrivilegesForRole(roleName string) ([]livedb.PgObjectPrivilege, error) {
	client := livedb.GetClient()
	return client.PgGetSequencePrivilegesForRole(a.ctx, roleName)
}

// GetPgFunctionPrivilegesForRole returns function/procedure EXECUTE grants for a role.
func (a *App) GetPgFunctionPrivilegesForRole(roleName string) ([]livedb.PgObjectPrivilege, error) {
	client := livedb.GetClient()
	return client.PgGetFunctionPrivilegesForRole(a.ctx, roleName)
}

// GetPgDefaultPrivileges returns all ALTER DEFAULT PRIVILEGES rules.
func (a *App) GetPgDefaultPrivileges() ([]livedb.PgDefaultPrivilege, error) {
	client := livedb.GetClient()
	return client.PgGetDefaultPrivileges(a.ctx)
}

// GetPgRLSPolicies returns all RLS policies in the connected database.
func (a *App) GetPgRLSPolicies() ([]livedb.PgRLSPolicy, error) {
	client := livedb.GetClient()
	return client.PgGetRLSPolicies(a.ctx)
}

// GetPgRLSTableStatuses returns RLS enabled/force status for all tables.
func (a *App) GetPgRLSTableStatuses() ([]livedb.PgRLSTableStatus, error) {
	client := livedb.GetClient()
	return client.PgGetRLSTableStatuses(a.ctx)
}

// GetPgForeignDataWrappers returns all FDW definitions.
func (a *App) GetPgForeignDataWrappers() ([]livedb.PgForeignDataWrapper, error) {
	client := livedb.GetClient()
	return client.PgGetForeignDataWrappers(a.ctx)
}

// GetPgForeignServers returns all foreign server definitions.
func (a *App) GetPgForeignServers() ([]livedb.PgForeignServer, error) {
	client := livedb.GetClient()
	return client.PgGetForeignServers(a.ctx)
}

// GetPgUserMappings returns user mappings for a foreign server (passwords redacted).
// Pass empty serverName to get all mappings.
func (a *App) GetPgUserMappings(serverName string) ([]livedb.PgUserMapping, error) {
	client := livedb.GetClient()
	return client.PgGetUserMappings(a.ctx, serverName)
}

// GetPgRoleParamSettings returns per-role configuration overrides.
// Pass empty roleName to get all settings.
func (a *App) GetPgRoleParamSettings(roleName string) ([]livedb.PgRoleParamSetting, error) {
	client := livedb.GetClient()
	return client.PgGetRoleParamSettings(a.ctx, roleName)
}

// RunPgSecurityAudit executes all security checks and returns findings.
func (a *App) RunPgSecurityAudit() ([]livedb.SecurityAuditFinding, error) {
	client := livedb.GetClient()
	return client.PgRunSecurityAudit(a.ctx)
}

// ExecutePgRbacScript runs a DDL script in a transaction on the connected database.
func (a *App) ExecutePgRbacScript(ddl string) error {
	client := livedb.GetClient()
	return client.PgExecuteRbacScript(a.ctx, ddl)
}

// RunPgImpersonatedQuery runs a SQL query with SET ROLE applied (sandbox mode).
func (a *App) RunPgImpersonatedQuery(roleName, query string) (*livedb.PgQueryResult, error) {
	client := livedb.GetClient()
	return client.PgRunImpersonatedQuery(a.ctx, roleName, query)
}

// RunPgImpersonatedQueryInDB runs an impersonated SQL query against a specific database.
func (a *App) RunPgImpersonatedQueryInDB(roleName, dbName, query string) (*livedb.PgQueryResult, error) {
	client := livedb.GetClient()
	return client.PgRunImpersonatedQueryInDB(a.ctx, roleName, dbName, query)
}

// ─── PostgreSQL Backup & Restore Studio IPCs ──────────────────────────────────

func (a *App) requirePgBackupContext() (livedb.ConnectionConfig, livedb.ConnectionStatus, string, int, error) {
	client := livedb.GetClient()
	cfg, ok := client.GetActiveConfig()
	status := client.GetStatus()
	if !ok || !status.Connected {
		return cfg, status, "", 0, fmt.Errorf("not connected to a PostgreSQL server")
	}
	if cfg.Engine != "postgresql" && status.ServerType != "postgresql" {
		return cfg, status, "", 0, fmt.Errorf("Backup & Restore Studio is only available for PostgreSQL connections")
	}
	if !cfg.AllowBackupRestore {
		return cfg, status, "", 0, fmt.Errorf("Backup & Restore is not enabled for this connection. Check 'Backup & Restore' in connection settings.")
	}
	customBinDir := ""
	if store, err := configdb.GetDB(); err == nil {
		if dir, dErr := store.GetBackupBinDir(); dErr == nil {
			customBinDir = dir
		}
	}
	return cfg, status, customBinDir, 0, nil
}

func (a *App) detectPgToolchainWithCatalog(database string) (livedb.ConnectionConfig, pgbackup.ToolchainInfo, *pgbackup.BackupCatalog, error) {
	cfg, status, customBinDir, _, err := a.requirePgBackupContext()
	if err != nil {
		return cfg, pgbackup.ToolchainInfo{}, nil, err
	}
	catalog, catErr := pgbackup.FetchBackupCatalog(a.ctx, cfg, database)
	verNum := 0
	verRaw := status.ServerVersion
	if catErr == nil && catalog != nil {
		verNum = catalog.ServerVersionNum
		if catalog.ServerVersion != "" {
			verRaw = catalog.ServerVersion
		}
	}
	tools := pgbackup.DetectToolchain(customBinDir, verNum, verRaw)
	return cfg, tools, catalog, nil
}

// GetPgBackupToolchain returns detected PostgreSQL CLI tools and version compatibility metadata.
func (a *App) GetPgBackupToolchain() (*pgbackup.ToolchainInfo, error) {
	_, tools, _, err := a.detectPgToolchainWithCatalog("")
	if err != nil {
		return nil, err
	}
	return &tools, nil
}

// SelectPgBackupBinDir opens a native folder picker for a custom PostgreSQL bin/ directory and persists it.
func (a *App) SelectPgBackupBinDir() (*pgbackup.ToolchainInfo, error) {
	_, status, currentDir, _, err := a.requirePgBackupContext()
	if err != nil {
		return nil, err
	}
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Select PostgreSQL bin/ folder (containing pg_dump, pg_restore, pg_basebackup)",
		DefaultDirectory: currentDir,
	})
	if err != nil {
		return nil, err
	}
	if dir == "" {
		tools := pgbackup.DetectToolchain(currentDir, 0, status.ServerVersion)
		return &tools, nil
	}
	if store, sErr := configdb.GetDB(); sErr == nil {
		_ = store.SetBackupBinDir(dir)
	}
	tools := pgbackup.DetectToolchain(dir, 0, status.ServerVersion)
	return &tools, nil
}

// GetPgBackupCatalog returns databases, tablespaces, schemas, tables, and extensions for Backup & Restore Studio.
func (a *App) GetPgBackupCatalog(database string) (*pgbackup.BackupCatalog, error) {
	cfg, _, _, _, err := a.requirePgBackupContext()
	if err != nil {
		return nil, err
	}
	return pgbackup.FetchBackupCatalog(a.ctx, cfg, database)
}

// PickPgBackupOutputPath opens a save-file or directory dialog for the chosen backup format.
func (a *App) PickPgBackupOutputPath(format string, defaultName string) (string, error) {
	f := strings.ToLower(strings.TrimSpace(format))
	if f == "directory" || f == "multi_db" || f == "basebackup" || f == "incremental" || f == "combine" || f == "dir" {
		return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
			Title: "Select Output Directory for Backup",
		})
	}
	ext := ".dump"
	display := "PostgreSQL Custom Archive (*.dump)"
	switch f {
	case "tar":
		ext = ".tar"
		display = "PostgreSQL Tar Archive (*.tar)"
	case "plain", "sql":
		ext = ".sql"
		display = "Plain SQL Script (*.sql)"
	}
	if defaultName == "" {
		defaultName = "backup" + ext
	}
	return runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Select Backup Output File",
		DefaultFilename: defaultName,
		Filters: []runtime.FileFilter{
			{DisplayName: display, Pattern: "*" + ext},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	})
}

// PickPgRestoreSource opens a file or directory dialog for selecting a backup to inspect or restore.
func (a *App) PickPgRestoreSource(isDir bool) (string, error) {
	if isDir {
		return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
			Title: "Select PostgreSQL Directory Backup, Physical Backup, or Multi-DB Folder",
		})
	}
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select PostgreSQL Backup File (.dump, .tar, .sql, manifest, backup_manifest)",
		Filters: []runtime.FileFilter{
			{DisplayName: "PostgreSQL Backups (*.dump;*.backup;*.tar;*.sql;*.json)", Pattern: "*.dump;*.backup;*.tar;*.sql;*.json"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	})
}

func (a *App) emitBackupEvents() (func(pgbackup.BackupLogEvent), func(pgbackup.BackupStatusEvent), func(pgbackup.BackupProgressEvent)) {
	onLog := func(ev pgbackup.BackupLogEvent) {
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "pg-backup:log", ev)
		}
	}
	onStatus := func(ev pgbackup.BackupStatusEvent) {
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "pg-backup:status", ev)
		}
	}
	onProgress := func(ev pgbackup.BackupProgressEvent) {
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "pg-backup:progress", ev)
		}
	}
	return onLog, onStatus, onProgress
}

func estimateLogicalBackupBytes(catalog *pgbackup.BackupCatalog, req pgbackup.LogicalBackupRequest) int64 {
	if catalog == nil {
		return 0
	}
	switch req.Mode {
	case "multi_db":
		set := make(map[string]bool)
		for _, d := range req.Databases {
			set[d] = true
		}
		var sum int64
		for _, d := range catalog.Databases {
			if set[d.Name] {
				sum += d.SizeBytes
			}
		}
		return sum
	case "table":
		set := make(map[string]bool)
		for _, t := range req.Tables {
			set[t] = true
		}
		var sum int64
		for _, t := range catalog.Tables {
			if set[t.Schema+"."+t.Name] {
				sum += t.SizeBytes
			}
		}
		return sum
	case "cluster_full":
		var sum int64
		for _, d := range catalog.Databases {
			sum += d.SizeBytes
		}
		return sum
	default:
		for _, d := range catalog.Databases {
			if d.Name == req.Database {
				return d.SizeBytes
			}
		}
		return 0
	}
}

// PreviewPgLogicalBackup builds the CLI preview for logical backups without running anything.
func (a *App) PreviewPgLogicalBackup(req pgbackup.LogicalBackupRequest) (*pgbackup.BackupCommandPreview, error) {
	cfg, tools, catalog, err := a.detectPgToolchainWithCatalog(req.Database)
	if err != nil {
		return nil, err
	}
	_, _, preview, bErr := pgbackup.BuildLogicalBackupPlan(cfg, tools, catalog, req)
	if bErr != nil {
		return &preview, bErr
	}
	return &preview, nil
}

// StartPgLogicalBackup starts a background pg_dump / pg_dumpall / multi-DB backup job.
func (a *App) StartPgLogicalBackup(req pgbackup.LogicalBackupRequest) (string, error) {
	if strings.TrimSpace(req.OutputPath) == "" {
		return "", fmt.Errorf("please choose an output path before starting the backup")
	}
	cfg, tools, catalog, err := a.detectPgToolchainWithCatalog(req.Database)
	if err != nil {
		return "", err
	}
	var tempFiles []string
	filterPath := ""
	if len(req.FilterRules) > 0 {
		fp, fErr := pgbackup.WriteFilterFile(req.FilterRules)
		if fErr != nil {
			return "", fmt.Errorf("failed to write filter file: %w", fErr)
		}
		if fp != "" {
			filterPath = fp
			tempFiles = append(tempFiles, fp)
		}
	}
	cmds, manifest, preview, bErr := pgbackup.BuildLogicalBackupPlan(cfg, tools, catalog, req, filterPath)
	if bErr != nil {
		for _, tf := range tempFiles {
			_ = os.Remove(tf)
		}
		return "", bErr
	}
	dbLabel := req.Database
	if req.Mode == "multi_db" {
		dbLabel = fmt.Sprintf("%d databases", len(req.Databases))
	} else if strings.HasPrefix(req.Mode, "cluster_") {
		dbLabel = "cluster"
	}
	jobMeta := configdb.PgBackupJobRecord{
		Engine:         "postgresql",
		Server:         cfg.Server,
		DatabaseName:   dbLabel,
		Operation:      "backup",
		Mode:           req.Mode,
		Format:         req.Format,
		OutputPath:     req.OutputPath,
		CommandPreview: preview.DisplayCommand,
	}
	onLog, onStatus, onProgress := a.emitBackupEvents()
	manifestDir := ""
	if manifest != nil {
		manifestDir = req.OutputPath
	}
	estBytes := estimateLogicalBackupBytes(catalog, req)
	return pgbackup.GetRunner().StartWithProgress(
		a.ctx, jobMeta, cmds, pgbackup.BuildChildEnv(cfg), manifest, manifestDir, tempFiles,
		estBytes, req.GenerateChecksum, onLog, onStatus, onProgress,
	)
}

// PreviewPgPhysicalBackup builds the CLI preview for pg_basebackup / pg_combinebackup / pg_verifybackup.
func (a *App) PreviewPgPhysicalBackup(req pgbackup.PhysicalBackupRequest) (*pgbackup.BackupCommandPreview, error) {
	cfg, tools, _, err := a.detectPgToolchainWithCatalog("")
	if err != nil {
		return nil, err
	}
	_, preview, bErr := pgbackup.BuildPhysicalBackupPlan(cfg, tools, req)
	if bErr != nil {
		return &preview, bErr
	}
	return &preview, nil
}

// StartPgPhysicalBackup starts a background physical backup, incremental, combine, or verify job.
func (a *App) StartPgPhysicalBackup(req pgbackup.PhysicalBackupRequest) (string, error) {
	targetOut := req.OutputDir
	if req.Operation == "verify" {
		targetOut = req.VerifyBackupDir
	}
	if strings.TrimSpace(targetOut) == "" {
		return "", fmt.Errorf("please select a target directory before starting")
	}
	cfg, tools, catalog, err := a.detectPgToolchainWithCatalog("")
	if err != nil {
		return "", err
	}
	cmds, preview, bErr := pgbackup.BuildPhysicalBackupPlan(cfg, tools, req)
	if bErr != nil {
		return "", bErr
	}
	op := "backup"
	if req.Operation == "verify" {
		op = "verify"
	} else if req.Operation == "combine" {
		op = "combine"
	}
	var estCluster int64
	if catalog != nil && req.Operation == "basebackup" {
		for _, d := range catalog.Databases {
			estCluster += d.SizeBytes
		}
	}
	jobMeta := configdb.PgBackupJobRecord{
		Engine:         "postgresql",
		Server:         cfg.Server,
		DatabaseName:   "cluster",
		Operation:      op,
		Mode:           req.Operation,
		Format:         req.Format,
		OutputPath:     targetOut,
		CommandPreview: preview.DisplayCommand,
	}
	onLog, onStatus, onProgress := a.emitBackupEvents()
	return pgbackup.GetRunner().StartWithProgress(
		a.ctx, jobMeta, cmds, pgbackup.BuildChildEnv(cfg), nil, "", nil,
		estCluster, false, onLog, onStatus, onProgress,
	)
}

// InspectPgBackupTOC inspects an archive backup file or directory via `pg_restore --list`.
func (a *App) InspectPgBackupTOC(sourcePath string) ([]pgbackup.TocEntry, error) {
	_, tools, _, err := a.detectPgToolchainWithCatalog("")
	if err != nil {
		return nil, err
	}
	return pgbackup.InspectArchiveTOC(a.ctx, tools, sourcePath)
}

// InspectPgMultiDbManifest parses planiq-backup-manifest.json from a multi-DB backup directory.
func (a *App) InspectPgMultiDbManifest(sourcePath string) (*pgbackup.MultiDbManifest, error) {
	if _, _, _, _, err := a.requirePgBackupContext(); err != nil {
		return nil, err
	}
	manifest, _, err := pgbackup.ParseMultiDbManifest(sourcePath)
	return manifest, err
}

// PreviewPgRestore builds the CLI preview for pg_restore, psql, or multi-DB restore.
func (a *App) PreviewPgRestore(req pgbackup.RestoreRequest) (*pgbackup.BackupCommandPreview, error) {
	cfg, tools, _, err := a.detectPgToolchainWithCatalog("")
	if err != nil {
		return nil, err
	}
	_, preview, bErr := pgbackup.BuildRestorePlan(cfg, tools, req, "")
	if bErr != nil {
		return &preview, bErr
	}
	return &preview, nil
}

// StartPgRestore runs a pg_restore, psql, or multi-DB batch restore asynchronously.
func (a *App) StartPgRestore(req pgbackup.RestoreRequest) (string, error) {
	if strings.TrimSpace(req.SourcePath) == "" {
		return "", fmt.Errorf("please select a backup source before restoring")
	}
	cfg, tools, _, err := a.detectPgToolchainWithCatalog("")
	if err != nil {
		return "", err
	}
	var tempFiles []string
	listFile := ""
	if req.SourceKind == "archive" && len(req.SelectedTocIDs) > 0 {
		entries, tErr := pgbackup.InspectArchiveTOC(a.ctx, tools, req.SourcePath)
		if tErr != nil {
			return "", fmt.Errorf("failed to inspect archive TOC for selective restore: %w", tErr)
		}
		lf, wErr := pgbackup.WriteFilteredTocList(entries, req.SelectedTocIDs)
		if wErr != nil {
			return "", fmt.Errorf("failed to write filtered TOC list: %w", wErr)
		}
		listFile = lf
		tempFiles = append(tempFiles, lf)
	}
	cmds, preview, bErr := pgbackup.BuildRestorePlan(cfg, tools, req, listFile)
	if bErr != nil {
		for _, f := range tempFiles {
			_ = os.Remove(f)
		}
		return "", bErr
	}
	targetDB := req.TargetDatabase
	if req.SourceKind == "multi_db_manifest" {
		targetDB = fmt.Sprintf("%d databases", len(req.SelectedDatabases))
	}
	jobMeta := configdb.PgBackupJobRecord{
		Engine:         "postgresql",
		Server:         cfg.Server,
		DatabaseName:   targetDB,
		Operation:      "restore",
		Mode:           req.SourceKind,
		Format:         req.SourceKind,
		OutputPath:     req.SourcePath,
		CommandPreview: preview.DisplayCommand,
	}
	onLog, onStatus, onProgress := a.emitBackupEvents()
	restoreEnv := pgbackup.BuildRestoreChildEnv(cfg, req.BoostRestore, req.BoostMem)
	return pgbackup.GetRunner().StartWithProgress(
		a.ctx, jobMeta, cmds, restoreEnv, nil, "", tempFiles, 0, false, onLog, onStatus, onProgress,
	)
}

// CheckPgBackupDiskSpace checks free capacity on the destination volume/mount on Windows, Linux, and macOS.
func (a *App) CheckPgBackupDiskSpace(targetPath string, estimatedBytes int64) (*pgbackup.DiskSpaceInfo, error) {
	info, err := pgbackup.GetFreeDiskSpace(targetPath, estimatedBytes)
	if err != nil {
		return nil, err
	}
	return &info, nil
}

// VerifyPgBackupChecksum validates the .sha256 sidecar file for a logical backup file or folder.
func (a *App) VerifyPgBackupChecksum(targetPath string) (*pgbackup.ChecksumVerifyResult, error) {
	res, err := pgbackup.VerifySha256Sidecar(targetPath)
	if err != nil {
		return nil, err
	}
	return &res, nil
}

// GetPgPitrStatus queries wal_level, archive_mode, archive_command, and pg_stat_archiver for PITR readiness.
func (a *App) GetPgPitrStatus() (*pgbackup.PitrStatus, error) {
	cfg, _, _, _, err := a.requirePgBackupContext()
	if err != nil {
		return nil, err
	}
	return pgbackup.FetchPitrStatus(a.ctx, cfg)
}

// GeneratePgBackupScript builds a standalone Windows PowerShell (.ps1) or Linux Bash (.sh) backup script.
func (a *App) GeneratePgBackupScript(req pgbackup.ScriptExportRequest) (string, error) {
	cfg, _, _, _, err := a.requirePgBackupContext()
	if err != nil {
		return "", err
	}
	return pgbackup.GenerateAutomationScript(cfg, req), nil
}

// SavePgBackupScriptFile opens a native save dialog and writes a generated .ps1 or .sh automation script.
func (a *App) SavePgBackupScriptFile(defaultName string, content string) (string, error) {
	extFilter := runtime.FileFilter{DisplayName: "All Files (*.*)", Pattern: "*.*"}
	if strings.HasSuffix(strings.ToLower(defaultName), ".ps1") {
		extFilter = runtime.FileFilter{DisplayName: "PowerShell Script (*.ps1)", Pattern: "*.ps1"}
	} else if strings.HasSuffix(strings.ToLower(defaultName), ".sh") {
		extFilter = runtime.FileFilter{DisplayName: "Shell Script (*.sh)", Pattern: "*.sh"}
	}
	p, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Save Automation Backup Script",
		DefaultFilename: defaultName,
		Filters:         []runtime.FileFilter{extFilter, {DisplayName: "All Files (*.*)", Pattern: "*.*"}},
	})
	if err != nil || p == "" {
		return p, err
	}
	if wErr := os.WriteFile(p, []byte(content), 0o755); wErr != nil {
		return "", wErr
	}
	return p, nil
}

// GetPgBackupProfiles loads saved reusable backup templates from SQLite.
func (a *App) GetPgBackupProfiles() ([]configdb.PgBackupProfile, error) {
	store, err := configdb.GetDB()
	if err != nil {
		return nil, err
	}
	return store.GetBackupProfiles()
}

// SavePgBackupProfile saves or updates a reusable backup template in SQLite.
func (a *App) SavePgBackupProfile(p configdb.PgBackupProfile) (*configdb.PgBackupProfile, error) {
	store, err := configdb.GetDB()
	if err != nil {
		return nil, err
	}
	return store.SaveBackupProfile(p)
}

// DeletePgBackupProfile deletes a saved backup template from SQLite.
func (a *App) DeletePgBackupProfile(id string) error {
	store, err := configdb.GetDB()
	if err != nil {
		return err
	}
	return store.DeleteBackupProfile(id)
}

func (a *App) resolveCloneConfigs(req pgbackup.DirectCloneRequest) (livedb.ConnectionConfig, livedb.ConnectionConfig, error) {
	srcCfg, _, _, _, err := a.requirePgBackupContext()
	if err != nil {
		return srcCfg, srcCfg, err
	}
	dstCfg := srcCfg
	if strings.TrimSpace(req.TargetProfileID) != "" {
		store, sErr := configdb.GetDB()
		if sErr != nil {
			return srcCfg, dstCfg, sErr
		}
		profiles, lErr := store.GetDBConnections()
		if lErr != nil {
			return srcCfg, dstCfg, lErr
		}
		found := false
		for _, p := range profiles {
			if p.ID == req.TargetProfileID {
				dstCfg = livedb.ConnectionConfig{
					Engine:                 p.Engine,
					Server:                 p.Server,
					Port:                   p.Port,
					Database:               p.Database,
					AuthType:               p.AuthType,
					Username:               p.Username,
					Password:               p.Password,
					Encrypt:                p.Encrypt,
					TrustServerCertificate: p.TrustServerCertificate,
					TimeoutSeconds:         p.TimeoutSeconds,
				}
				found = true
				break
			}
		}
		if !found {
			return srcCfg, dstCfg, fmt.Errorf("selected target connection profile not found")
		}
	}
	return srcCfg, dstCfg, nil
}

// PreviewPgDirectClone returns the streaming pg_dump | pg_restore preview for zero-disk DB cloning.
func (a *App) PreviewPgDirectClone(req pgbackup.DirectCloneRequest) (*pgbackup.BackupCommandPreview, error) {
	srcCfg, dstCfg, err := a.resolveCloneConfigs(req)
	if err != nil {
		return nil, err
	}
	_, tools, _, tErr := a.detectPgToolchainWithCatalog(req.SourceDatabase)
	if tErr != nil {
		return nil, tErr
	}
	_, _, _, preview, bErr := pgbackup.BuildDirectClonePlan(srcCfg, dstCfg, tools, req)
	if bErr != nil {
		return &preview, bErr
	}
	return &preview, nil
}

// StartPgDirectClone executes a zero-disk streaming pg_dump | pg_restore clone between DBs or servers.
func (a *App) StartPgDirectClone(req pgbackup.DirectCloneRequest) (string, error) {
	srcCfg, dstCfg, err := a.resolveCloneConfigs(req)
	if err != nil {
		return "", err
	}
	_, tools, _, tErr := a.detectPgToolchainWithCatalog(req.SourceDatabase)
	if tErr != nil {
		return "", tErr
	}
	dumpCmd, restoreCmd, analyzeCmd, preview, bErr := pgbackup.BuildDirectClonePlan(srcCfg, dstCfg, tools, req)
	if bErr != nil {
		return "", bErr
	}
	targetLabel := dstCfg.Server + "/" + strings.TrimSpace(req.TargetDatabase)
	jobMeta := configdb.PgBackupJobRecord{
		Engine:         "postgresql",
		Server:         srcCfg.Server,
		DatabaseName:   req.SourceDatabase + " -> " + req.TargetDatabase,
		Operation:      "clone",
		Mode:           "direct_pipe",
		Format:         "stream",
		OutputPath:     targetLabel,
		CommandPreview: preview.DisplayCommand,
	}
	onLog, onStatus, _ := a.emitBackupEvents()
	return pgbackup.GetRunner().StartPipeClone(
		a.ctx, jobMeta, dumpCmd, pgbackup.BuildChildEnv(srcCfg), restoreCmd,
		pgbackup.BuildRestoreChildEnv(dstCfg, true, "512MB"), analyzeCmd, onLog, onStatus,
	)
}

// CancelPgBackupJob cancels the active backup or restore process if one is running.
func (a *App) CancelPgBackupJob() error {
	return pgbackup.GetRunner().CancelActive()
}

// GetPgBackupJobs returns recorded PostgreSQL backup & restore job history from SQLite.
func (a *App) GetPgBackupJobs() ([]configdb.PgBackupJobRecord, error) {
	store, err := configdb.GetDB()
	if err != nil {
		return nil, err
	}
	return store.GetBackupJobs(200)
}

// DeletePgBackupJob deletes a backup job entry from SQLite history.
func (a *App) DeletePgBackupJob(id string) error {
	store, err := configdb.GetDB()
	if err != nil {
		return err
	}
	return store.DeleteBackupJob(id)
}

// OpenBackupFolderInOS opens the OS file manager on the backup file's folder or backup directory.
func (a *App) OpenBackupFolderInOS(targetPath string) error {
	p := strings.TrimSpace(targetPath)
	if p == "" {
		return fmt.Errorf("no path specified")
	}
	dir := p
	if st, err := os.Stat(p); err == nil {
		if !st.IsDir() {
			dir = filepath.Dir(p)
		}
	} else {
		dir = filepath.Dir(p)
	}
	switch sysruntime.GOOS {
	case "windows":
		return exec.Command("explorer", dir).Start()
	case "darwin":
		return exec.Command("open", dir).Start()
	default:
		return exec.Command("xdg-open", dir).Start()
	}
}

// ─────────────────────────────────────────────────────────────────────────────

// GetCurrentWindowsUser returns the logged-in Windows OS user and domain
func (a *App) GetCurrentWindowsUser() WindowsUserInfo {
	domain := os.Getenv("USERDOMAIN")
	username := os.Getenv("USERNAME")
	full := username

	u, err := user.Current()
	if err == nil && u.Username != "" {
		full = u.Username
		parts := strings.Split(u.Username, "\\")
		if len(parts) > 1 {
			domain = parts[0]
			username = parts[1]
		} else {
			username = u.Username
		}
	}
	if username == "" {
		username = os.Getenv("USER")
	}
	if username == "" {
		username = "User"
	}
	if domain != "" && !strings.Contains(full, "\\") {
		full = fmt.Sprintf("%s\\%s", domain, username)
	}
	return WindowsUserInfo{
		Username:    username,
		Domain:      domain,
		FullAccount: full,
	}
}


