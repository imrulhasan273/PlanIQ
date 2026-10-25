package sqlplan

// PlanAnalysis is the top-level report for a full .sqlplan execution plan
type PlanAnalysis struct {
	PlanName          string               `json:"planName"`
	TotalStatements   int                  `json:"totalStatements"`
	TotalSubTreeCost  float64              `json:"totalSubTreeCost"`
	MaxDOPReason      string               `json:"maxDopReason"`
	MaxCompileMemory  int64                `json:"maxCompileMemory"`
	CachedPlanSizeKB  int                  `json:"cachedPlanSizeKB"`
	ExecutiveVerdict  *ExecutiveVerdict    `json:"executiveVerdict,omitempty"`
	WaitStats         []*WaitStat          `json:"waitStats"`
	Statements        []*StatementAnalysis `json:"statements"`
	GlobalWarnings    []string             `json:"globalWarnings"`
	AllMissingIndexes []*MissingIndexInfo  `json:"allMissingIndexes"`
	AntiPatterns      []*AntiPattern       `json:"antiPatterns"`
	Diagnostics       *AdvancedDiagnostics `json:"diagnostics,omitempty"`
	HardwareMetrics   *HardwareMetrics     `json:"hardwareMetrics,omitempty"`
}

// ExecutiveVerdict is the 10-second instant root cause diagnosis
type ExecutiveVerdict struct {
	CulpritStatementID string  `json:"culpritStatementId"`
	CostPercentage     float64 `json:"costPercentage"`
	Headline           string  `json:"headline"`
	Summary            string  `json:"summary"`
	TopOperator        string  `json:"topOperator"`
	ActionableFix      string  `json:"actionableFix"`
}

// WaitStat represents a SQL Server wait statistic event
type WaitStat struct {
	WaitType    string `json:"waitType"`
	WaitTimeMs  int64  `json:"waitTimeMs"`
	WaitCount   int64  `json:"waitCount"`
	Category    string `json:"category"` // "Disk I/O", "Parallelism", "Network", "Memory", "Locking", "Other"
	Description string `json:"description"`
}

// StatementAnalysis represents an individual statement in a batch or stored proc
type StatementAnalysis struct {
	StatementID          string              `json:"statementId"`
	StatementCompID      string              `json:"statementCompId"`
	StatementType        string              `json:"statementType"`
	StatementText        string              `json:"statementText"`
	StatementSubTreeCost float64             `json:"statementSubTreeCost"`
	StatementEstRows     float64             `json:"statementEstRows"`
	CostPercentage       float64             `json:"costPercentage"`
	CompileTimeMS        int                 `json:"compileTimeMs"`
	CompileCPUMS         int                 `json:"compileCpuMs"`
	CompileMemoryKB      int                 `json:"compileMemoryKb"`
	OptimizationLevel    string              `json:"optimizationLevel"`
	HasQueryPlan                  bool                `json:"hasQueryPlan"`
	RootNode                      *PlanNode           `json:"rootNode,omitempty"`
	Warnings                      []*PlanWarning      `json:"warnings"`
	MissingIndexes                []*MissingIndexInfo `json:"missingIndexes"`
	PainPointsCount               int                 `json:"painPointsCount"`
	ActualCPUms                   int64               `json:"actualCpuMs"`
	ActualElapsedms               int64               `json:"actualElapsedMs"`
	ActualLogicalReads            int64               `json:"actualLogicalReads"`
	ActualLogicalReadsMB          float64             `json:"actualLogicalReadsMb"`
	ActualPhysicalReads           int64               `json:"actualPhysicalReads"`
	ActualReadAheads              int64               `json:"actualReadAheads"`
	HasActualMetrics              bool                `json:"hasActualMetrics"`
	ExecutionClassification       string              `json:"executionClassification"`       // "IO_BOUND", "CPU_BOUND", "WAIT_BOUND", "BALANCED"
	ExecutionClassificationReason string              `json:"executionClassificationReason"`
}

// PlanNode represents an individual operator in the relational tree
type PlanNode struct {
	NodeID                    int         `json:"nodeId"`
	PhysicalOp                string      `json:"physicalOp"`
	LogicalOp                 string      `json:"logicalOp"`
	EstimateRows              float64     `json:"estimateRows"`
	EstimatedRowsRead         float64     `json:"estimatedRowsRead"`
	ActualRows                float64     `json:"actualRows"`
	HasActualRows             bool        `json:"hasActualRows"`
	HasCardinalitySkew        bool        `json:"hasCardinalitySkew"`
	SkewRatio                 float64     `json:"skewRatio"`
	SkewReason                string      `json:"skewReason"`
	EstimateIO                float64     `json:"estimateIo"`
	EstimateCPU               float64     `json:"estimateCpu"`
	EstimatedTotalSubtreeCost float64     `json:"estimatedTotalSubtreeCost"`
	CostPercentage            float64     `json:"costPercentage"`
	TableCardinality          float64     `json:"tableCardinality"`
	Parallel                  bool        `json:"parallel"`
	ActualCPUms               int64       `json:"actualCpuMs"`
	ActualElapsedms           int64       `json:"actualElapsedMs"`
	ActualLogicalReads        int64       `json:"actualLogicalReads"`
	ActualPhysicalReads       int64       `json:"actualPhysicalReads"`
	ActualReadAheads          int64       `json:"actualReadAheads"`
	ActualScans               int64       `json:"actualScans"`
	Database                  string      `json:"database"`
	Schema                    string      `json:"schema"`
	Table                     string      `json:"table"`
	Index                     string      `json:"index"`
	IndexKind                 string      `json:"indexKind"` // Clustered, NonClustered, Heap
	SeekPredicates            string      `json:"seekPredicates"`
	Predicate                 string      `json:"predicate"`
	OutputColumns             []string    `json:"outputColumns"`
	Warnings                  []string    `json:"warnings"`
	IsPainPoint               bool        `json:"isPainPoint"`
	PainReason                string      `json:"painReason"`
	Children                  []*PlanNode `json:"children"`
}

// PlanWarning represents an engine warning
type PlanWarning struct {
	StatementID string `json:"statementId"`
	Kind        string `json:"kind"` // PlanAffectingConvert, SpillToTempDb, ColumnsWithNoStatistics
	Issue       string `json:"issue"`
	Expression  string `json:"expression"`
	NodeID      int    `json:"nodeId"`
	Description string `json:"description"`
}

// MissingIndexInfo details SQL Server's missing index recommendations
type MissingIndexInfo struct {
	StatementID       string   `json:"statementId"`
	Impact            float64  `json:"impact"`
	Database          string   `json:"database"`
	Schema            string   `json:"schema"`
	Table             string   `json:"table"`
	EqualityColumns   []string `json:"equalityColumns"`
	InequalityColumns []string `json:"inequalityColumns"`
	IncludeColumns    []string `json:"includeColumns"`
	SuggestedDDL      string   `json:"suggestedDdl"`
}

// AntiPattern represents a high-level detected performance issue
type AntiPattern struct {
	Type               string   `json:"type"`
	Severity           string   `json:"severity"` // CRITICAL, HIGH, MEDIUM, INFO
	Title              string   `json:"title"`
	Description        string   `json:"description"`
	AffectedStatements []string `json:"affectedStatements"`
	Recommendation     string   `json:"recommendation"`
}

// PlanComparison represents a side-by-side comparison between two plans
type PlanComparison struct {
	PlanAName             string           `json:"planAName"`
	PlanBName             string           `json:"planBName"`
	CostBefore            float64          `json:"costBefore"`
	CostAfter             float64          `json:"costAfter"`
	CostReductionPercent  float64          `json:"costReductionPercent"`
	IsImprovement         bool             `json:"isImprovement"`
	MissingIndexesBefore  int              `json:"missingIndexesBefore"`
	MissingIndexesAfter   int              `json:"missingIndexesAfter"`
	ResolvedIndexesCount  int              `json:"resolvedIndexesCount"`
	StatementsDiff        []*StatementDiff `json:"statementsDiff"`
	SummaryVerdict        string           `json:"summaryVerdict"`
}

// StatementDiff compares matching statements between Plan A and Plan B
type StatementDiff struct {
	StatementID    string  `json:"statementId"`
	CostA          float64 `json:"costA"`
	CostB          float64 `json:"costB"`
	CostDiffPct    float64 `json:"costDiffPct"`
	HasImprovement bool    `json:"hasImprovement"`
	QuerySnippet   string  `json:"querySnippet"`
}

// MemoryGrantHealth represents RAM allocation vs consumption and TempDB spills
type MemoryGrantHealth struct {
	GrantedMemoryKB            int64   `json:"grantedMemoryKb"`
	MaxUsedMemoryKB            int64   `json:"maxUsedMemoryKb"`
	SerialRequiredKB           int64   `json:"serialRequiredKb"`
	SerialDesiredKB            int64   `json:"serialDesiredKb"`
	RequestedMemoryKB          int64   `json:"requestedMemoryKb"`
	GrantWaitTimeMS            int64   `json:"grantWaitTimeMs"`
	MaxQueryMemoryKB           int64   `json:"maxQueryMemoryKb"`
	FeedbackAdjusted           string  `json:"feedbackAdjusted"`
	EstimatedAvailableMemoryKB int64   `json:"estimatedAvailableMemoryKb"`
	EstimatedPagesCached       int64   `json:"estimatedPagesCached"`
	IsBloated                  bool    `json:"isBloated"`
	WastedMemoryMB             float64 `json:"wastedMemoryMb"`
	WastedPercent              float64 `json:"wastedPercent"`
	HasSpills                  bool    `json:"hasSpills"`
	SpillDetails               string  `json:"spillDetails"`
	Remedy                     string  `json:"remedy"`
}

// TableIOLeader represents an individual table's I/O consumption breakdown
type TableIOLeader struct {
	Rank             int      `json:"rank"`
	Database         string   `json:"database"`
	Schema           string   `json:"schema"`
	Table            string   `json:"table"`
	LogicalReads     int64    `json:"logicalReads"`
	LogicalReadsMB   float64  `json:"logicalReadsMb"`
	PhysicalReads    int64    `json:"physicalReads"`
	PhysicalReadsMB  float64  `json:"physicalReadsMb"`
	ReadAheads       int64    `json:"readAheads"`
	ReadAheadsMB     float64  `json:"readAheadsMb"`
	ReadPercent      float64  `json:"readPercent"`
	AccessOperations []string `json:"accessOperations"`
	IndexesUsed      []string `json:"indexesUsed"`
}

// HardwareMetrics represents actual server hardware resources consumed
type HardwareMetrics struct {
	HasRuntimeMetrics             bool             `json:"hasRuntimeMetrics"`
	TotalLogicalReads             int64            `json:"totalLogicalReads"`
	TotalLogicalReadsMB           float64          `json:"totalLogicalReadsMb"`
	TotalPhysicalReads            int64            `json:"totalPhysicalReads"`
	TotalPhysicalReadsMB          float64          `json:"totalPhysicalReadsMb"`
	TotalReadAheads               int64            `json:"totalReadAheads"`
	TotalReadAheadsMB             float64          `json:"totalReadAheadsMb"`
	TotalLobLogicalReads          int64            `json:"totalLobLogicalReads"`
	TotalLobPhysicalReads         int64            `json:"totalLobPhysicalReads"`
	CacheHitRatioPercent          float64          `json:"cacheHitRatioPercent"`
	TotalActualCPUms              int64            `json:"totalActualCpuMs"`
	TotalActualElapsedms          int64            `json:"totalActualElapsedMs"`
	CpuUtilizationRatio           float64          `json:"cpuUtilizationRatio"`
	WaitTimeMS                    int64            `json:"waitTimeMs"`
	MemoryGrantWaitTimeMS         int64            `json:"memoryGrantWaitTimeMs"`
	RequestedMemoryKB             int64            `json:"requestedMemoryKb"`
	GrantedMemoryKB               int64            `json:"grantedMemoryKb"`
	MaxUsedMemoryKB               int64            `json:"maxUsedMemoryKb"`
	MaxQueryMemoryKB              int64            `json:"maxQueryMemoryKb"`
	EstimatedAvailableMemoryKB    int64            `json:"estimatedAvailableMemoryKb"`
	EstimatedPagesCached          int64            `json:"estimatedPagesCached"`
	IsMemoryGrantFeedbackAdjusted string           `json:"isMemoryGrantFeedbackAdjusted"`
	TopIOLeaders                  []*TableIOLeader `json:"topIoLeaders"`
}

// ThreadDistribution represents worker thread work breakdown in parallel queries
type ThreadDistribution struct {
	ThreadID   int     `json:"threadId"`
	ActualRows float64 `json:"actualRows"`
	Percentage float64 `json:"percentage"`
}

// ParallelismSkew represents uneven row processing across worker threads
type ParallelismSkew struct {
	HasSkew          bool                  `json:"hasSkew"`
	NodeID           int                   `json:"nodeId"`
	PhysicalOp       string                `json:"physicalOp"`
	ThreadsCount     int                   `json:"threadsCount"`
	TotalRows        float64               `json:"totalRows"`
	MaxThreadRows    float64               `json:"maxThreadRows"`
	MinThreadRows    float64               `json:"minThreadRows"`
	SkewRatio        float64               `json:"skewRatio"`
	Threads          []*ThreadDistribution `json:"threads"`
	RootCauseSummary string                `json:"rootCauseSummary"`
	Remedy           string                `json:"remedy"`
}

// ImplicitConversion represents non-sargable type conversion on indexed columns
type ImplicitConversion struct {
	StatementID  string `json:"statementId"`
	ConvertIssue string `json:"convertIssue"`
	Expression   string `json:"expression"`
	Description  string `json:"description"`
	Remedy       string `json:"remedy"`
}

// ConsolidatedIndex represents an intelligently merged index recommendation
type ConsolidatedIndex struct {
	Table             string   `json:"table"`
	Schema            string   `json:"schema"`
	CombinedFromCount int      `json:"combinedFromCount"`
	EqualityColumns   []string `json:"equalityColumns"`
	InequalityColumns []string `json:"inequalityColumns"`
	IncludeColumns    []string `json:"includeColumns"`
	SuggestedDDL      string   `json:"suggestedDdl"`
	AverageImpact     float64  `json:"averageImpact"`
	StorageBenefit    string   `json:"storageBenefit"`
}

// ScalarUDFWarning represents RBAR performance penalties from scalar UDFs
type ScalarUDFWarning struct {
	StatementID  string `json:"statementId"`
	FunctionName string `json:"functionName"`
	Description  string `json:"description"`
	Remedy       string `json:"remedy"`
}

// CardinalityEstimationEngine represents the CE version used to compile
type CardinalityEstimationEngine struct {
	ModelVersion string `json:"modelVersion"`
	IsLegacy     bool   `json:"isLegacy"`
	Description  string `json:"description"`
	Remedy       string `json:"remedy"`
}

// KeyLookupFinding describes a Key Lookup / RID Lookup (bookmark lookup) operator
type KeyLookupFinding struct {
	StatementID    string   `json:"statementId"`
	NodeID         int      `json:"nodeId"`
	LookupKind     string   `json:"lookupKind"` // "Key Lookup" or "RID Lookup"
	Schema         string   `json:"schema"`
	Table          string   `json:"table"`
	LookupIndex    string   `json:"lookupIndex"` // clustered index (or empty for heap) being probed
	SeekIndex      string   `json:"seekIndex"`   // non-clustered index driving the lookup
	EstimateRows   float64  `json:"estimateRows"`
	LookupCount    float64  `json:"lookupCount"` // total lookups (actual if available, otherwise estimated)
	HasActualRows  bool     `json:"hasActualRows"`
	CostPercent    float64  `json:"costPercent"`
	FetchedColumns []string `json:"fetchedColumns"`
	IncludeClause  string   `json:"includeClause"`
	Severity       string   `json:"severity"`
	Description    string   `json:"description"`
	Remedy         string   `json:"remedy"`
}

// SpoolFinding describes a Table/Index/Row Count/Window Spool operator
type SpoolFinding struct {
	StatementID     string  `json:"statementId"`
	NodeID          int     `json:"nodeId"`
	PhysicalOp      string  `json:"physicalOp"`
	LogicalOp       string  `json:"logicalOp"`
	Kind            string  `json:"kind"`    // Eager, Lazy, Row Count, Window
	Purpose         string  `json:"purpose"` // Halloween Protection, Temporary Index, ...
	Table           string  `json:"table"`
	EstimateRows    float64 `json:"estimateRows"`
	EstimateRebinds float64 `json:"estimateRebinds"`
	EstimateRewinds float64 `json:"estimateRewinds"`
	ActualRows      float64 `json:"actualRows"`
	ActualRebinds   float64 `json:"actualRebinds"`
	ActualRewinds   float64 `json:"actualRewinds"`
	HasActualRows   bool    `json:"hasActualRows"`
	CostPercent     float64 `json:"costPercent"`
	Severity        string  `json:"severity"`
	Description     string  `json:"description"`
	Remedy          string  `json:"remedy"`
}

// MissingStatsFinding represents <ColumnsWithNoStatistics> optimizer warnings
type MissingStatsFinding struct {
	StatementID  string   `json:"statementId"`
	NodeID       int      `json:"nodeId"`
	Database     string   `json:"database"`
	Schema       string   `json:"schema"`
	Table        string   `json:"table"`
	Columns      []string `json:"columns"`
	Severity     string   `json:"severity"`
	Description  string   `json:"description"`
	Remedy       string   `json:"remedy"`
	SuggestedDDL string   `json:"suggestedDdl"`
}

// SniffedParameter is one entry of a plan's <ParameterList>
type SniffedParameter struct {
	Name          string `json:"name"`
	DataType      string `json:"dataType"`
	CompiledValue string `json:"compiledValue"`
	RuntimeValue  string `json:"runtimeValue"`
	HasRuntime    bool   `json:"hasRuntime"`
	Mismatch      bool   `json:"mismatch"`
}

// ParameterSniffingFinding reports compile-time (sniffed) vs runtime parameter values
type ParameterSniffingFinding struct {
	AffectedStatements []string            `json:"affectedStatements"`
	Parameters         []*SniffedParameter `json:"parameters"`
	HasRuntimeValues   bool                `json:"hasRuntimeValues"`
	HasMismatch        bool                `json:"hasMismatch"`
	HasEstimateImpact  bool                `json:"hasEstimateImpact"`
	Mitigation         string              `json:"mitigation"`
	Severity           string              `json:"severity"`
	Description        string              `json:"description"`
	Remedy             string              `json:"remedy"`
}

// NonSargableFinding describes predicates that prevent an index seek
type NonSargableFinding struct {
	StatementID      string   `json:"statementId"`
	NodeID           int      `json:"nodeId"`
	PhysicalOp       string   `json:"physicalOp"`
	Table            string   `json:"table"`
	Index            string   `json:"index"`
	Functions        []string `json:"functions"`
	LeadingWildcard  bool     `json:"leadingWildcard"`
	Predicate        string   `json:"predicate"`
	TableCardinality float64  `json:"tableCardinality"`
	CostPercent      float64  `json:"costPercent"`
	Severity         string   `json:"severity"`
	Description      string   `json:"description"`
	Remedy           string   `json:"remedy"`
}

// RowGoalFinding describes TOP / FAST N / EXISTS row-goal optimizations and their pitfalls
type RowGoalFinding struct {
	StatementID               string  `json:"statementId"`
	NodeID                    int     `json:"nodeId"`
	PhysicalOp                string  `json:"physicalOp"`
	Source                    string  `json:"source"` // TOP, FAST N hint, EXISTS / IN semi-join, Optimizer row goal
	EstimateRows              float64 `json:"estimateRows"`
	EstimateRowsWithoutGoal   float64 `json:"estimateRowsWithoutGoal"`
	ActualRows                float64 `json:"actualRows"` // per-execution average
	HasActualRows             bool    `json:"hasActualRows"`
	ReductionFactor           float64 `json:"reductionFactor"`
	Misfired                  bool    `json:"misfired"`
	Severity                  string  `json:"severity"`
	Description               string  `json:"description"`
	Remedy                    string  `json:"remedy"`
}

// AdaptiveJoinFinding describes a batch-mode Adaptive Join operator (SQL Server 2017+)
type AdaptiveJoinFinding struct {
	StatementID       string  `json:"statementId"`
	NodeID            int     `json:"nodeId"`
	ThresholdRows     float64 `json:"thresholdRows"`
	HasThreshold      bool    `json:"hasThreshold"`
	EstimatedJoinType string  `json:"estimatedJoinType"`
	ActualJoinType    string  `json:"actualJoinType"`
	EstimateRows      float64 `json:"estimateRows"`
	ActualRows        float64 `json:"actualRows"`
	HasActualRows     bool    `json:"hasActualRows"`
	Description       string  `json:"description"`
}

// IQPFeature is the state of one Intelligent Query Processing feature in this plan
type IQPFeature struct {
	Name   string `json:"name"`
	Status string `json:"status"` // Active, Eligible, Not Applicable, Unknown
	Detail string `json:"detail"`
}

// AdaptiveProcessing bundles Adaptive Joins, batch mode usage and IQP feature states
type AdaptiveProcessing struct {
	AdaptiveJoins      []*AdaptiveJoinFinding `json:"adaptiveJoins"`
	BatchModeOperators int                    `json:"batchModeOperators"`
	TotalOperators     int                    `json:"totalOperators"`
	BatchOnRowstore    bool                   `json:"batchOnRowstore"`
	Features           []*IQPFeature          `json:"features"`
	Summary            string                 `json:"summary"`
}

// AdvancedDiagnostics bundles all high-level engine root cause diagnostics
type AdvancedDiagnostics struct {
	MemoryGrant         *MemoryGrantHealth           `json:"memoryGrant,omitempty"`
	ParallelismSkew     *ParallelismSkew             `json:"parallelismSkew,omitempty"`
	ImplicitConversions []*ImplicitConversion        `json:"implicitConversions"`
	ConsolidatedIndexes []*ConsolidatedIndex         `json:"consolidatedIndexes"`
	ScalarUDFWarnings   []*ScalarUDFWarning          `json:"scalarUdfWarnings"`
	CardinalityEngine   *CardinalityEstimationEngine `json:"cardinalityEngine,omitempty"`
	KeyLookups          []*KeyLookupFinding          `json:"keyLookups"`
	Spools              []*SpoolFinding              `json:"spools"`
	MissingStatistics   []*MissingStatsFinding       `json:"missingStatistics"`
	ParameterSniffing   []*ParameterSniffingFinding  `json:"parameterSniffing"`
	NonSargable         []*NonSargableFinding        `json:"nonSargable"`
	RowGoals            []*RowGoalFinding            `json:"rowGoals"`
	Adaptive            *AdaptiveProcessing          `json:"adaptive,omitempty"`
	HealthScore         int                          `json:"healthScore"`
	ScoreGrade          string                       `json:"scoreGrade"`
}

