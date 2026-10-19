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
	HasQueryPlan         bool                `json:"hasQueryPlan"`
	RootNode             *PlanNode           `json:"rootNode,omitempty"`
	Warnings             []*PlanWarning      `json:"warnings"`
	MissingIndexes       []*MissingIndexInfo `json:"missingIndexes"`
	PainPointsCount      int                 `json:"painPointsCount"`
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
	GrantedMemoryKB  int64   `json:"grantedMemoryKb"`
	MaxUsedMemoryKB  int64   `json:"maxUsedMemoryKb"`
	SerialRequiredKB int64   `json:"serialRequiredKb"`
	SerialDesiredKB  int64   `json:"serialDesiredKb"`
	IsBloated        bool    `json:"isBloated"`
	WastedMemoryMB   float64 `json:"wastedMemoryMb"`
	WastedPercent    float64 `json:"wastedPercent"`
	HasSpills        bool    `json:"hasSpills"`
	SpillDetails     string  `json:"spillDetails"`
	Remedy           string  `json:"remedy"`
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

// AdvancedDiagnostics bundles all high-level engine root cause diagnostics
type AdvancedDiagnostics struct {
	MemoryGrant         *MemoryGrantHealth           `json:"memoryGrant,omitempty"`
	ParallelismSkew     *ParallelismSkew             `json:"parallelismSkew,omitempty"`
	ImplicitConversions []*ImplicitConversion        `json:"implicitConversions"`
	ConsolidatedIndexes []*ConsolidatedIndex         `json:"consolidatedIndexes"`
	ScalarUDFWarnings   []*ScalarUDFWarning          `json:"scalarUdfWarnings"`
	CardinalityEngine   *CardinalityEstimationEngine `json:"cardinalityEngine,omitempty"`
	HealthScore         int                          `json:"healthScore"`
	ScoreGrade          string                       `json:"scoreGrade"`
}

