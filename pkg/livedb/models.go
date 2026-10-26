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

// LiveWaitStat represents real-time wait statistics from sys.dm_os_wait_stats
type LiveWaitStat struct {
	WaitType          string  `json:"waitType"`
	WaitCategory      string  `json:"waitCategory"`
	WaitingTasksCount int64   `json:"waitingTasksCount"`
	WaitTimeMs        int64   `json:"waitTimeMs"`
	SignalWaitTimeMs  int64   `json:"signalWaitTimeMs"`
	Percentage        float64 `json:"percentage"`
	Description       string  `json:"description"`
	Recommendation    string  `json:"recommendation"`
}

// LiveBlockingSession represents root-blocker and victim relationship from sys.dm_os_waiting_tasks
type LiveBlockingSession struct {
	RootBlockerSPID    int    `json:"rootBlockerSpid"`
	RootBlockerStatus  string `json:"rootBlockerStatus"`
	RootBlockerLogin   string `json:"rootBlockerLogin"`
	RootBlockerProgram string `json:"rootBlockerProgram"`
	RootBlockerQuery   string `json:"rootBlockerQuery"`
	BlockedSPID        int    `json:"blockedSpid"`
	BlockedStatus      string `json:"blockedStatus"`
	BlockedLogin       string `json:"blockedLogin"`
	BlockedProgram     string `json:"blockedProgram"`
	BlockedWaitType    string `json:"blockedWaitType"`
	BlockedWaitTimeMs  int64  `json:"blockedWaitTimeMs"`
	BlockedQuery       string `json:"blockedQuery"`
	LockResource       string `json:"lockResource"`
	LockMode           string `json:"lockMode"`
}

// LiveMissingIndex represents real-time missing index advice harvested from DMVs
type LiveMissingIndex struct {
	DatabaseName         string  `json:"databaseName"`
	TableName            string  `json:"tableName"`
	ImpactScore          float64 `json:"impactScore"`
	UserSeeks            int64   `json:"userSeeks"`
	UserScans            int64   `json:"userScans"`
	AvgTotalUserCost     float64 `json:"avgTotalUserCost"`
	AvgUserImpact        float64 `json:"avgUserImpact"`
	EqualityColumns      string  `json:"equalityColumns"`
	InequalityColumns    string  `json:"inequalityColumns"`
	IncludedColumns      string  `json:"includedColumns"`
	CreateIndexStatement string  `json:"createIndexStatement"`
}

// LiveTempDBUsage represents tempdb consumption per active SPID
type LiveTempDBUsage struct {
	SPID                   int     `json:"spid"`
	DatabaseName           string  `json:"databaseName"`
	LoginName              string  `json:"loginName"`
	ProgramName            string  `json:"programName"`
	UserObjectsAllocMB     float64 `json:"userObjectsAllocMb"`
	UserObjectsDeallocMB   float64 `json:"userObjectsDeallocMb"`
	InternalObjectsAllocMB float64 `json:"internalObjectsAllocMb"`
	InternalObjectsDeallocMB float64 `json:"internalObjectsDeallocMb"`
	QueryText              string  `json:"queryText"`
}

// IdleSession represents a sleeping or dormant session from sys.dm_exec_sessions
type IdleSession struct {
	SPID                 int     `json:"spid"`
	Status               string  `json:"status"` // "sleeping", "dormant", "running"
	LoginName            string  `json:"loginName"`
	HostName             string  `json:"hostName"`
	ProgramName          string  `json:"programName"`
	DatabaseName         string  `json:"databaseName"`
	OpenTransactions     int     `json:"openTransactions"`
	LastRequestStartTime string  `json:"lastRequestStartTime"`
	LastRequestEndTime   string  `json:"lastRequestEndTime"`
	IdleSeconds          int64   `json:"idleSeconds"`
	TotalCPUTimeMs       int64   `json:"totalCpuTimeMs"`
	TotalElapsedTimeMs   int64   `json:"totalElapsedTimeMs"`
	LogicalReads         int64   `json:"logicalReads"`
	Writes               int64   `json:"writes"`
	MemoryUsageKB        int     `json:"memoryUsageKb"`
	LastQueryText        string  `json:"lastQueryText"`
}// PerformanceAdvisor represents an automated insight or anomaly rule (SolarWinds DPA Advisors)
type PerformanceAdvisor struct {
	ID             string  `json:"id"`
	Severity       string  `json:"severity"` // "critical", "warning", "info"
	Category       string  `json:"category"` // "CPU/Memory", "Executions", "Plan Regression", "TempDB Spill", "Tuning Advice", "Blocking"
	Title          string  `json:"title"`
	Description    string  `json:"description"`
	QueryID        int64   `json:"queryId,omitempty"`
	QueryText      string  `json:"queryText,omitempty"`
	MetricValue    string  `json:"metricValue"`
	Timestamp      string  `json:"timestamp"`
	PlanXML        string  `json:"planXml,omitempty"`
	Recommendation string  `json:"recommendation"`
}

// WaitTimeHistoryPoint represents an hourly/daily wait time aggregation (SolarWinds DPA Wait Trend Chart)
type WaitTimeHistoryPoint struct {
	IntervalLabel  string  `json:"intervalLabel"` // e.g. "Oct 26 09:00" or "Sep 28"
	TotalWaitMs    float64 `json:"totalWaitMs"`
	CPUWaitMs      float64 `json:"cpuWaitMs"`
	LockWaitMs     float64 `json:"lockWaitMs"`
	IOWaitMs       float64 `json:"ioWaitMs"`
	MemoryWaitMs   float64 `json:"memoryWaitMs"`
	OtherWaitMs    float64 `json:"otherWaitMs"`
	ExecutionCount int64   `json:"executionCount"`
	IsAnomaly      bool    `json:"isAnomaly"` // true if deviation exceeds baseline
	AnomalyReason  string  `json:"anomalyReason,omitempty"`
}

// BufferPoolConsumer represents tables and indexes caching data pages in SQL Server RAM (sys.dm_os_buffer_descriptors)
type BufferPoolConsumer struct {
	DatabaseName       string  `json:"databaseName"`
	SchemaName         string  `json:"schemaName"`
	ObjectName         string  `json:"objectName"`
	IndexName          string  `json:"indexName"`
	IndexType          string  `json:"indexType"`
	BufferSizeMB       float64 `json:"bufferSizeMb"`
	CleanPagesMB       float64 `json:"cleanPagesMb"`
	DirtyPagesMB       float64 `json:"dirtyPagesMb"`
	PercentageOfBuffer float64 `json:"percentageOfBuffer"`
	RowCount           int64   `json:"rowCount"`
}

// UnusedIndex represents indexes suffering write updates but zero seeks/scans (sys.dm_db_index_usage_stats)
type UnusedIndex struct {
	DatabaseName  string  `json:"databaseName"`
	SchemaName    string  `json:"schemaName"`
	TableName     string  `json:"tableName"`
	IndexName     string  `json:"indexName"`
	IndexType     string  `json:"indexType"`
	IndexSizeMB   float64 `json:"indexSizeMb"`
	UserWrites    int64   `json:"userWrites"`
	UserSeeks     int64   `json:"userSeeks"`
	UserScans     int64   `json:"userScans"`
	UserLookups   int64   `json:"userLookups"`
	DropStatement string  `json:"dropStatement"`
}

// DuplicateIndex represents overlapping or redundant non-clustered indexes on the same table
type DuplicateIndex struct {
	TableName     string `json:"tableName"`
	IndexName     string `json:"indexName"`
	DuplicateOf   string `json:"duplicateOf"`
	IndexCols     string `json:"indexCols"`
	IncludedCols  string `json:"includedCols"`
	OverlapType   string `json:"overlapType"` // "Exact Duplicate" or "Left-Prefix Redundant"
	DropStatement string `json:"dropStatement"`
}
