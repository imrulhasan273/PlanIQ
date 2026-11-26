package pgbackup

// ToolBinaryInfo describes one discovered PostgreSQL CLI tool binary.
type ToolBinaryInfo struct {
	Name         string `json:"name"`
	Path         string `json:"path"`
	Available    bool   `json:"available"`
	MajorVersion int    `json:"majorVersion"`
	VersionRaw   string `json:"versionRaw"`
}

// ToolchainCapabilities captures version-gated PostgreSQL client features through PG 19+.
type ToolchainCapabilities struct {
	SupportsZstdLz4         bool `json:"supportsZstdLz4"`         // PG 15+
	SupportsIncremental     bool `json:"supportsIncremental"`     // PG 17+ (pg_basebackup --incremental & pg_combinebackup)
	SupportsFilterFile      bool `json:"supportsFilterFile"`      // PG 17+ (pg_dump --filter)
	SupportsNonTextDumpall  bool `json:"supportsNonTextDumpall"`  // PG 18+ (pg_dumpall --format=custom|directory|tar)
	SupportsStatisticsFlags bool `json:"supportsStatisticsFlags"` // PG 18+ (--statistics / --statistics-only / --no-statistics)
	ForwardCompatiblePG19   bool `json:"forwardCompatiblePg19"`   // PG 19+
}

// ToolchainInfo summarizes detected PostgreSQL client utilities vs the live server version.
type ToolchainInfo struct {
	BinDir               string                    `json:"binDir"`
	CustomBinDir         string                    `json:"customBinDir"`
	Source               string                    `json:"source"` // "custom" | "path" | "auto" | "missing"
	ClientMajorVersion   int                       `json:"clientMajorVersion"`
	ClientVersionRaw     string                    `json:"clientVersionRaw"`
	ServerMajorVersion   int                       `json:"serverMajorVersion"`
	ServerVersionRaw     string                    `json:"serverVersionRaw"`
	Compatible           bool                      `json:"compatible"`
	CompatibilityWarning string                    `json:"compatibilityWarning,omitempty"`
	HostOS               string                    `json:"hostOs"`
	CPUCount             int                       `json:"cpuCount"`
	RecommendedJobs      int                       `json:"recommendedJobs"`
	Tools                map[string]ToolBinaryInfo `json:"tools"`
	Capabilities         ToolchainCapabilities     `json:"capabilities"`
}

// BackupFilterRule represents one line in a PG 17+ `--filter` file.
type BackupFilterRule struct {
	Action     string `json:"action"`     // "include" | "exclude"
	ObjectType string `json:"objectType"` // "table" | "table_data" | "schema" | "extension" | "foreign_data"
	Pattern    string `json:"pattern"`
}

// DiskSpaceInfo checks free capacity on the destination volume/mount before starting a job.
type DiskSpaceInfo struct {
	Path           string `json:"path"`
	FreeBytes      int64  `json:"freeBytes"`
	TotalBytes     int64  `json:"totalBytes"`
	EstimatedBytes int64  `json:"estimatedBytes"`
	Sufficient     bool   `json:"sufficient"`
	Warning        string `json:"warning,omitempty"`
}

// ChecksumVerifyResult holds SHA-256 verification status for a logical backup sidecar.
type ChecksumVerifyResult struct {
	TargetPath  string `json:"targetPath"`
	SidecarPath string `json:"sidecarPath"`
	Expected    string `json:"expected"`
	Actual      string `json:"actual"`
	Matched     bool   `json:"matched"`
	Message     string `json:"message"`
}

// PitrStatus reports PostgreSQL WAL archiving health for PITR readiness.
type PitrStatus struct {
	WalLevel         string `json:"walLevel"`
	ArchiveMode      string `json:"archiveMode"`
	ArchiveCommand   string `json:"archiveCommand"`
	ArchivedCount    int64  `json:"archivedCount"`
	FailedCount      int64  `json:"failedCount"`
	LastArchivedWal  string `json:"lastArchivedWal"`
	LastArchivedTime string `json:"lastArchivedTime"`
	LastFailedWal    string `json:"lastFailedWal"`
	LastFailedTime   string `json:"lastFailedTime"`
}

// ScriptExportRequest configures standalone .ps1 / .sh scheduled backup script generation.
type ScriptExportRequest struct {
	TargetOS      string `json:"targetOs"` // "windows_ps1" | "linux_bash"
	RetentionDays int    `json:"retentionDays"`
	IncludeSha256 bool   `json:"includeSha256"`
	OutputPath    string `json:"outputPath"`
	Database      string `json:"database"`
	Mode          string `json:"mode"`
	Format        string `json:"format"`
}

// DirectCloneRequest streams pg_dump directly into pg_restore/psql with zero intermediate disk file.
type DirectCloneRequest struct {
	SourceDatabase  string   `json:"sourceDatabase"`
	TargetProfileID string   `json:"targetProfileId"` // empty = current connected server
	TargetDatabase  string   `json:"targetDatabase"`
	CreateTargetDB  bool     `json:"createTargetDb"`
	Clean           bool     `json:"clean"`
	NoOwner         bool     `json:"noOwner"`
	NoPrivileges    bool     `json:"noPrivileges"`
	ContentMode     string   `json:"contentMode"` // "full" | "schema_only" | "data_only"
	Schemas         []string `json:"schemas"`
	Tables          []string `json:"tables"`
	RunAnalyzeAfter bool     `json:"runAnalyzeAfter"`
}

// BackupProgressEvent streams live written bytes, estimated %, and throughput (MB/s).
type BackupProgressEvent struct {
	JobID          string  `json:"jobId"`
	BytesWritten   int64   `json:"bytesWritten"`
	EstimatedBytes int64   `json:"estimatedBytes"`
	Percent        float64 `json:"percent"`
	MBPerSec       float64 `json:"mbPerSec"`
	ElapsedMs      int64   `json:"elapsedMs"`
}

// PgDatabaseMeta describes a PostgreSQL database in the cluster.
type PgDatabaseMeta struct {
	Name       string `json:"name"`
	Owner      string `json:"owner"`
	Encoding   string `json:"encoding"`
	Tablespace string `json:"tablespace"`
	SizeBytes  int64  `json:"sizeBytes"`
}

// PgTablespaceMeta describes a PostgreSQL tablespace on the cluster.
type PgTablespaceMeta struct {
	Name      string `json:"name"`
	Owner     string `json:"owner"`
	Location  string `json:"location"`
	SizeBytes int64  `json:"sizeBytes"`
}

// PgTableMeta describes a user table, view, materialized view, or partitioned table.
type PgTableMeta struct {
	Schema     string `json:"schema"`
	Name       string `json:"name"`
	ObjectType string `json:"objectType"` // "table" | "partitioned_table" | "view" | "matview" | "foreign_table"
	Tablespace string `json:"tablespace"`
	Owner      string `json:"owner"`
	SizeBytes  int64  `json:"sizeBytes"`
}

// BackupCatalog contains cluster and database metadata needed to configure backups cleanly.
type BackupCatalog struct {
	Databases        []PgDatabaseMeta   `json:"databases"`
	Tablespaces      []PgTablespaceMeta `json:"tablespaces"`
	Schemas          []string           `json:"schemas"`
	Tables           []PgTableMeta      `json:"tables"`
	Extensions       []string           `json:"extensions"`
	ActiveDatabase   string             `json:"activeDatabase"`
	ServerVersionNum int                `json:"serverVersionNum"`
	ServerVersion    string             `json:"serverVersion"`
}

// LogicalBackupRequest defines options for pg_dump, multi-DB batch, and pg_dumpall cluster backups.
type LogicalBackupRequest struct {
	// Mode: "full_db" | "schema" | "table" | "tablespace" | "multi_db" |
	//       "cluster_full" | "cluster_globals" | "cluster_roles" | "cluster_tablespaces"
	Mode             string   `json:"mode"`
	Database         string   `json:"database"`
	Databases        []string `json:"databases"`
	IncludeGlobals   bool     `json:"includeGlobals"`
	Schemas          []string `json:"schemas"`
	ExcludeSchemas   []string `json:"excludeSchemas"`
	Tables           []string `json:"tables"`
	ExcludeTables    []string `json:"excludeTables"`
	ExcludeTableData []string `json:"excludeTableData"`
	Tablespaces      []string `json:"tablespaces"`
	// ContentMode: "full" | "schema_only" | "data_only" | "sections" | "statistics_only"
	ContentMode       string   `json:"contentMode"`
	Sections          []string `json:"sections"` // pre-data, data, post-data
	Format            string   `json:"format"`   // custom, directory, tar, plain
	Compression       string   `json:"compression"` // none, gzip, lz4, zstd
	CompressionLevel  int      `json:"compressionLevel"`
	ParallelJobs      int      `json:"parallelJobs"`
	OutputPath        string   `json:"outputPath"`
	Clean             bool     `json:"clean"`
	IfExists          bool     `json:"ifExists"`
	CreateDB          bool     `json:"createDb"`
	NoOwner           bool     `json:"noOwner"`
	NoPrivileges      bool     `json:"noPrivileges"`
	NoTablespaces     bool     `json:"noTablespaces"`
	IncludeBlobs      bool     `json:"includeBlobs"`
	Inserts           bool     `json:"inserts"`
	ColumnInserts     bool     `json:"columnInserts"`
	RowsPerInsert     int      `json:"rowsPerInsert"`
	LockWaitTimeout   string   `json:"lockWaitTimeout"`
	Encoding          string   `json:"encoding"`
	IncludeStatistics bool               `json:"includeStatistics"`
	NoStatistics      bool               `json:"noStatistics"`
	ExcludeDatabases  []string           `json:"excludeDatabases"`
	FilterRules       []BackupFilterRule `json:"filterRules"`
	GenerateChecksum  bool               `json:"generateChecksum"`
	ExtraArgs         string             `json:"extraArgs"`
}

// TablespaceMapping maps a source tablespace directory to a target directory (-T old=new).
type TablespaceMapping struct {
	OldDir string `json:"oldDir"`
	NewDir string `json:"newDir"`
}

// PhysicalBackupRequest defines options for pg_basebackup, PG 17+ pg_combinebackup, and pg_verifybackup.
type PhysicalBackupRequest struct {
	// Operation: "basebackup" | "incremental" | "combine" | "verify"
	Operation               string              `json:"operation"`
	OutputDir               string              `json:"outputDir"`
	Format                  string              `json:"format"`    // "plain" | "tar"
	WalMethod               string              `json:"walMethod"` // "stream" | "fetch" | "none"
	Checkpoint              string              `json:"checkpoint"` // "fast" | "spread"
	Compression             string              `json:"compression"` // "none" | "gzip" | "lz4" | "zstd" | "server-zstd" | "server-lz4" | "server-gzip"
	CompressionLevel        int                 `json:"compressionLevel"`
	MaxRate                 string              `json:"maxRate"`
	ManifestChecksums       string              `json:"manifestChecksums"` // "SHA256" | "CRC32C" | "NONE"
	TablespaceMappings      []TablespaceMapping `json:"tablespaceMappings"`
	IncrementalManifestPath string              `json:"incrementalManifestPath"`
	CombineSourceDirs       []string            `json:"combineSourceDirs"`
	VerifyBackupDir         string              `json:"verifyBackupDir"`
	VerifyNoParseWals       bool                `json:"verifyNoParseWals"`
}

// TocEntry represents one entry listed by `pg_restore --list`.
type TocEntry struct {
	ID         int    `json:"id"`
	Section    string `json:"section"`
	ObjectType string `json:"objectType"`
	Schema     string `json:"schema"`
	Name       string `json:"name"`
	Owner      string `json:"owner"`
	RawLine    string `json:"rawLine"`
}

// RestoreRequest defines options for pg_restore, psql plain SQL restore, and multi-DB manifest restore.
type RestoreRequest struct {
	SourcePath        string   `json:"sourcePath"`
	SourceKind        string   `json:"sourceKind"` // "archive" | "plain_sql" | "multi_db_manifest"
	TargetDatabase    string   `json:"targetDatabase"`
	CreateDB          bool     `json:"createDb"`
	Clean             bool     `json:"clean"`
	IfExists          bool     `json:"ifExists"`
	SingleTransaction bool     `json:"singleTransaction"`
	ExitOnError       bool     `json:"exitOnError"`
	ParallelJobs      int      `json:"parallelJobs"`
	NoOwner           bool     `json:"noOwner"`
	NoPrivileges      bool     `json:"noPrivileges"`
	NoTablespaces     bool     `json:"noTablespaces"`
	ContentMode       string   `json:"contentMode"` // "full" | "schema_only" | "data_only"
	Sections          []string `json:"sections"`
	Schemas           []string `json:"schemas"`
	Tables            []string `json:"tables"`
	DisableTriggers   bool     `json:"disableTriggers"`
	IncludeStatistics bool     `json:"includeStatistics"`
	NoStatistics      bool     `json:"noStatistics"`
	SelectedTocIDs    []int    `json:"selectedTocIds"`
	SelectedDatabases []string `json:"selectedDatabases"`
	RestoreGlobals    bool     `json:"restoreGlobals"`
	BoostRestore      bool     `json:"boostRestore"`
	BoostMem          string   `json:"boostMem"`
	RunAnalyzeAfter   bool     `json:"runAnalyzeAfter"`
	ExtraArgs         string   `json:"extraArgs"`
}

// BackupCommandPreview returns the rendered CLI command(s) for UI inspection without secrets.
type BackupCommandPreview struct {
	Command        string   `json:"command"`
	Args           []string `json:"args"`
	DisplayCommand string   `json:"displayCommand"`
	Warnings       []string `json:"warnings"`
}

// PlannedCommand represents a single executable step in a multi-step backup/restore plan.
type PlannedCommand struct {
	StepLabel string
	Binary    string
	Args      []string
	Output    string
}

// MultiDbManifestEntry records one dumped DB inside a PlanIQ multi-DB backup directory.
type MultiDbManifestEntry struct {
	Database   string `json:"database"`
	Format     string `json:"format"`
	OutputPath string `json:"outputPath"`
}

// MultiDbManifest is written as planiq-backup-manifest.json for one-click multi-DB restore.
type MultiDbManifest struct {
	CreatedAt   string                 `json:"createdAt"`
	Server      string                 `json:"server"`
	GlobalsFile string                 `json:"globalsFile,omitempty"`
	Format      string                 `json:"format"`
	Entries     []MultiDbManifestEntry `json:"entries"`
}

// BackupLogEvent is emitted over Wails runtime events while a job runs.
type BackupLogEvent struct {
	JobID     string `json:"jobId"`
	Stream    string `json:"stream"` // "stdout" | "stderr" | "info"
	Line      string `json:"line"`
	Timestamp string `json:"timestamp"`
}

// BackupStatusEvent notifies the UI when a job starts, updates progress, or completes.
type BackupStatusEvent struct {
	JobID        string `json:"jobId"`
	Operation    string `json:"operation"`
	Mode         string `json:"mode"`
	Status       string `json:"status"` // "running" | "succeeded" | "failed" | "cancelled"
	ExitCode     int    `json:"exitCode"`
	DurationMs   int64  `json:"durationMs"`
	OutputPath   string `json:"outputPath"`
	SizeBytes    int64  `json:"sizeBytes"`
	ErrorMessage string `json:"errorMessage,omitempty"`
}
