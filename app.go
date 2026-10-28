package main

import (
	"context"
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"sqlplan-advisor/pkg/advisor"
	"sqlplan-advisor/pkg/configdb"
	"sqlplan-advisor/pkg/livedb"
	"sqlplan-advisor/pkg/sqlplan"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// ParsePlan parses a raw XML string containing a SQL Server ShowPlan
func (a *App) ParsePlan(xmlContent string, planName string) (*sqlplan.PlanAnalysis, error) {
	if planName == "" {
		planName = "Execution Plan"
	}
	return sqlplan.ParseXML(xmlContent, planName)
}

// LoadSamplePlan loads the bundled explan.xml sample execution plan
func (a *App) LoadSamplePlan() (*sqlplan.PlanAnalysis, error) {
	bytes, err := os.ReadFile("sample_plans/explan.xml")
	if err != nil {
		// Fallback check in parent or scratch
		bytes, err = os.ReadFile("explan.xml")
		if err != nil {
			return nil, fmt.Errorf("sample plan not found: %w", err)
		}
	}
	return sqlplan.ParseBytes(bytes, "explan.xml (InsertDailyOperationalReport)")
}

// OpenFileAndParse opens a native file dialog, parses the plan directly on disk,
// and returns the parsed PlanAnalysis struct without sending large raw XML across IPC.
func (a *App) OpenFileAndParse() (*sqlplan.PlanAnalysis, error) {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select SQL Server Execution Plan or Deadlock (.sqlplan, .xml, .xdl)",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Execution Plans & Deadlocks (*.sqlplan;*.xml;*.xdl)",
				Pattern:     "*.sqlplan;*.xml;*.xdl",
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

// OpenFilePicker opens a native file dialog for selecting a .sqlplan, .xml, or .xdl file
func (a *App) OpenFilePicker() (*SelectedPlanFile, error) {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select SQL Server Plan or Deadlock (.sqlplan, .xml, .xdl)",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Execution Plans & Deadlocks (*.sqlplan;*.xml;*.xdl)",
				Pattern:     "*.sqlplan;*.xml;*.xdl",
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


