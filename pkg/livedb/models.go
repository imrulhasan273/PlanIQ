package livedb

// ConnectionConfig defines parameters for connecting to SQL Server
type ConnectionConfig struct {
	Server                 string `json:"server"`
	Port                   int    `json:"port"`
	Database               string `json:"database"`
	AuthType               string `json:"authType"` // "sql", "windows", "demo"
	Username               string `json:"username"`
	Password               string `json:"password"`
	Encrypt                bool   `json:"encrypt"`
	TrustServerCertificate bool   `json:"trustServerCertificate"`
	ApplicationIntent      string `json:"applicationIntent"` // "ReadOnly"
	TimeoutSeconds         int    `json:"timeoutSeconds"`
}

// ConnectionStatus reports the health and version of the live connection
type ConnectionStatus struct {
	Connected      bool   `json:"connected"`
	ServerVersion  string `json:"serverVersion"`
	ServerName     string `json:"serverName"`
	DatabaseName   string `json:"databaseName"`
	ActiveSessions int    `json:"activeSessions"`
	LatencyMs      int64  `json:"latencyMs"`
	IsReadOnly     bool   `json:"isReadOnly"`
	IsDemo         bool   `json:"isDemo"`
	ErrorMessage   string `json:"errorMessage,omitempty"`
}

// ActiveSession represents a running or suspended process from sys.dm_exec_requests
type ActiveSession struct {
	SPID               int     `json:"spid"`
	Status             string  `json:"status"` // "running", "suspended", "sleeping"
	Command            string  `json:"command"`
	DatabaseName       string  `json:"databaseName"`
	LoginName          string  `json:"loginName"`
	HostName           string  `json:"hostName"`
	ProgramName        string  `json:"programName"`
	WaitType           string  `json:"waitType"`
	WaitTimeMs         int64   `json:"waitTimeMs"`
	LastWaitType       string  `json:"lastWaitType"`
	BlockingSPID       int     `json:"blockingSpid"`
	CPUTimeMs          int64   `json:"cpuTimeMs"`
	TotalElapsedTimeMs int64   `json:"totalElapsedTimeMs"`
	LogicalReads       int64   `json:"logicalReads"`
	Writes             int64   `json:"writes"`
	GrantedMemoryMB    float64 `json:"grantedMemoryMb"`
	QueryText          string  `json:"queryText"`
	HasPlan            bool    `json:"hasPlan"`
	PlanHandle         string  `json:"planHandle"`
	SQLHandle          string  `json:"sqlHandle"`
	PercentComplete    float32 `json:"percentComplete"`
}

// QueryStoreEntry represents a top-resource query harvested from sys.query_store_runtime_stats
type QueryStoreEntry struct {
	QueryID            int64   `json:"queryId"`
	PlanID             int64   `json:"planId"`
	QueryText          string  `json:"queryText"`
	ExecutionCount     int64   `json:"executionCount"`
	TotalCPUMs         float64 `json:"totalCpuMs"`
	AvgCPUMs           float64 `json:"avgCpuMs"`
	TotalDurationMs    float64 `json:"totalDurationMs"`
	AvgDurationMs      float64 `json:"avgDurationMs"`
	TotalLogicalReads  int64   `json:"totalLogicalReads"`
	AvgLogicalReads    float64 `json:"avgLogicalReads"`
	TotalPhysicalReads int64   `json:"totalPhysicalReads"`
	AvgPhysicalReads   float64 `json:"avgPhysicalReads"`
	TotalSpillsMB      float64 `json:"totalSpillsMb"`
	LastExecutionTime  string  `json:"lastExecutionTime"`
	PlanXML            string  `json:"planXml,omitempty"`
}

// LiveDeadlockReport represents a deadlock event pulled from the system_health XEL ring buffer
type LiveDeadlockReport struct {
	Timestamp            string `json:"timestamp"`
	VictimSPID           int    `json:"victimSpid"`
	DeadlockGraphXML     string `json:"deadlockGraphXml"`
	ProcessCount         int    `json:"processCount"`
	LockedResourceCount  int    `json:"lockedResourceCount"`
	DeadlockType         string `json:"deadlockType"`
	Summary              string `json:"summary"`
}

// ServerVitals represents instant health indicators (CPU queue, memory grants, TempDB)
type ServerVitals struct {
	CPUQueueTasks       int     `json:"cpuQueueTasks"`
	SignalWaitPct       float64 `json:"signalWaitPct"`
	MemoryGrantsPending int     `json:"memoryGrantsPending"`
	AvailableMemoryMB   float64 `json:"availableMemoryMb"`
	TempDBUserObjectsMB float64 `json:"tempDbUserObjectsMb"`
	TempDBInternalMB    float64 `json:"tempDbInternalMb"`
	BatchRequestsPerSec float64 `json:"batchRequestsPerSec"`
}

// IndexSafetyCheck represents a check against existing schema and write-to-read ratio
type IndexSafetyCheck struct {
	TableName              string   `json:"tableName"`
	ExistingIndexColumns   []string `json:"existingIndexColumns"`
	ExistingIncludeColumns []string `json:"existingIncludeColumns"`
	TotalReads             int64    `json:"totalReads"`
	TotalWrites            int64    `json:"totalWrites"`
	WriteToReadRatio       float64  `json:"writeToReadRatio"`
	IsDuplicate            bool     `json:"isDuplicate"`
	OverlapWarning         string   `json:"overlapWarning"`
}
