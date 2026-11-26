export type LogicalBackupMode =
  | 'full_db'
  | 'schema'
  | 'table'
  | 'tablespace'
  | 'multi_db'
  | 'cluster_full'
  | 'cluster_globals'
  | 'cluster_roles'
  | 'cluster_tablespaces';

export type LogicalContentMode =
  | 'full'
  | 'schema_only'
  | 'data_only'
  | 'sections'
  | 'statistics_only';

export type BackupFormat = 'custom' | 'directory' | 'tar' | 'plain';
export type CompressionType = 'none' | 'gzip' | 'lz4' | 'zstd';

export interface ToolBinaryInfo {
  name: string;
  path: string;
  available: boolean;
  majorVersion: number;
  versionRaw: string;
}

export interface ToolchainCapabilities {
  supportsZstdLz4: boolean;
  supportsIncremental: boolean;
  supportsFilterFile: boolean;
  supportsNonTextDumpall: boolean;
  supportsStatisticsFlags: boolean;
  forwardCompatiblePg19: boolean;
}

export interface ToolchainInfo {
  binDir: string;
  customBinDir: string;
  source: string;
  clientMajorVersion: number;
  clientVersionRaw: string;
  serverMajorVersion: number;
  serverVersionRaw: string;
  compatible: boolean;
  compatibilityWarning?: string;
  hostOs?: string;
  cpuCount?: number;
  recommendedJobs?: number;
  tools: Record<string, ToolBinaryInfo>;
  capabilities: ToolchainCapabilities;
}

export interface BackupFilterRule {
  action: 'include' | 'exclude';
  objectType: 'table' | 'table_data' | 'schema' | 'extension' | 'foreign_data';
  pattern: string;
}

export interface DiskSpaceInfo {
  path: string;
  freeBytes: number;
  totalBytes: number;
  estimatedBytes: number;
  sufficient: boolean;
  warning?: string;
}

export interface ChecksumVerifyResult {
  targetPath: string;
  sidecarPath: string;
  expected: string;
  actual: string;
  matched: boolean;
  message: string;
}

export interface PitrStatus {
  walLevel: string;
  archiveMode: string;
  archiveCommand: string;
  archivedCount: number;
  failedCount: number;
  lastArchivedWal: string;
  lastArchivedTime: string;
  lastFailedWal: string;
  lastFailedTime: string;
}

export interface ScriptExportRequest {
  targetOs: 'windows_ps1' | 'linux_bash';
  retentionDays: number;
  includeSha256: boolean;
  outputPath: string;
  database: string;
  mode: string;
  format: string;
}

export interface DirectCloneRequest {
  sourceDatabase: string;
  targetProfileId: string;
  targetDatabase: string;
  createTargetDb: boolean;
  clean: boolean;
  noOwner: boolean;
  noPrivileges: boolean;
  contentMode: 'full' | 'schema_only' | 'data_only';
  schemas: string[];
  tables: string[];
  runAnalyzeAfter: boolean;
}

export interface PgBackupProfile {
  id: string;
  name: string;
  kind: string;
  payloadJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupProgressEvent {
  jobId: string;
  bytesWritten: number;
  estimatedBytes: number;
  percent: number;
  mbPerSec: number;
  elapsedMs: number;
}

export interface PgDatabaseMeta {
  name: string;
  owner: string;
  encoding: string;
  tablespace: string;
  sizeBytes: number;
}

export interface PgTablespaceMeta {
  name: string;
  owner: string;
  location: string;
  sizeBytes: number;
}

export interface PgTableMeta {
  schema: string;
  name: string;
  objectType: string;
  tablespace: string;
  owner: string;
  sizeBytes: number;
}

export interface BackupCatalog {
  databases: PgDatabaseMeta[];
  tablespaces: PgTablespaceMeta[];
  schemas: string[];
  tables: PgTableMeta[];
  extensions: string[];
  activeDatabase: string;
  serverVersionNum: number;
  serverVersion: string;
}

export interface LogicalBackupRequest {
  mode: LogicalBackupMode;
  database: string;
  databases: string[];
  includeGlobals: boolean;
  schemas: string[];
  excludeSchemas: string[];
  tables: string[];
  excludeTables: string[];
  excludeTableData: string[];
  tablespaces: string[];
  contentMode: LogicalContentMode;
  sections: string[];
  format: BackupFormat;
  compression: CompressionType;
  compressionLevel: number;
  parallelJobs: number;
  outputPath: string;
  clean: boolean;
  ifExists: boolean;
  createDb: boolean;
  noOwner: boolean;
  noPrivileges: boolean;
  noTablespaces: boolean;
  includeBlobs: boolean;
  inserts: boolean;
  columnInserts: boolean;
  rowsPerInsert: number;
  lockWaitTimeout: string;
  encoding: string;
  includeStatistics: boolean;
  noStatistics: boolean;
  excludeDatabases: string[];
  filterRules: BackupFilterRule[];
  generateChecksum: boolean;
  extraArgs: string;
}

export interface TablespaceMapping {
  oldDir: string;
  newDir: string;
}

export interface PhysicalBackupRequest {
  operation: 'basebackup' | 'incremental' | 'combine' | 'verify';
  outputDir: string;
  format: 'plain' | 'tar';
  walMethod: 'stream' | 'fetch' | 'none';
  checkpoint: 'fast' | 'spread';
  compression: string;
  compressionLevel: number;
  maxRate: string;
  manifestChecksums: 'SHA256' | 'CRC32C' | 'NONE';
  tablespaceMappings: TablespaceMapping[];
  incrementalManifestPath: string;
  combineSourceDirs: string[];
  verifyBackupDir: string;
  verifyNoParseWals: boolean;
}

export interface TocEntry {
  id: number;
  section: string;
  objectType: string;
  schema: string;
  name: string;
  owner: string;
  rawLine: string;
}

export interface RestoreRequest {
  sourcePath: string;
  sourceKind: 'archive' | 'plain_sql' | 'multi_db_manifest';
  targetDatabase: string;
  createDb: boolean;
  clean: boolean;
  ifExists: boolean;
  singleTransaction: boolean;
  exitOnError: boolean;
  parallelJobs: number;
  noOwner: boolean;
  noPrivileges: boolean;
  noTablespaces: boolean;
  contentMode: 'full' | 'schema_only' | 'data_only';
  sections: string[];
  schemas: string[];
  tables: string[];
  disableTriggers: boolean;
  includeStatistics: boolean;
  noStatistics: boolean;
  selectedTocIds: number[];
  selectedDatabases: string[];
  restoreGlobals: boolean;
  boostRestore: boolean;
  boostMem: string;
  runAnalyzeAfter: boolean;
  extraArgs: string;
}

export interface BackupCommandPreview {
  command: string;
  args: string[];
  displayCommand: string;
  warnings: string[];
}

export interface MultiDbManifestEntry {
  database: string;
  format: string;
  outputPath: string;
}

export interface MultiDbManifest {
  createdAt: string;
  server: string;
  globalsFile?: string;
  format: string;
  entries: MultiDbManifestEntry[];
}

export interface BackupLogEvent {
  jobId: string;
  stream: 'stdout' | 'stderr' | 'info';
  line: string;
  timestamp: string;
}

export interface BackupStatusEvent {
  jobId: string;
  operation: string;
  mode: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  exitCode: number;
  durationMs: number;
  outputPath: string;
  sizeBytes: number;
  errorMessage?: string;
}

export interface PgBackupJobRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  engine: string;
  server: string;
  databaseName: string;
  operation: string;
  mode: string;
  format: string;
  outputPath: string;
  sizeBytes: number;
  status: string;
  exitCode: number;
  commandPreview: string;
  errorMessage: string;
}
