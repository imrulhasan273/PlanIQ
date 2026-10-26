export interface ConnectionConfig {
  server: string;
  port: number;
  database: string;
  authType: 'sql' | 'windows' | 'demo';
  username?: string;
  password?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  applicationIntent?: string;
  timeoutSeconds?: number;
}

export interface ConnectionStatus {
  connected: boolean;
  serverVersion: string;
  serverName: string;
  databaseName: string;
  activeSessions: number;
  latencyMs: number;
  isReadOnly: boolean;
  isDemo: boolean;
  errorMessage?: string;
}

export interface ActiveSession {
  spid: number;
  status: string; // "running", "suspended", "sleeping"
  command: string;
  databaseName: string;
  loginName: string;
  hostName: string;
  programName: string;
  waitType: string;
  waitTimeMs: number;
  lastWaitType: string;
  blockingSpid: number;
  cpuTimeMs: number;
  totalElapsedTimeMs: number;
  logicalReads: number;
  writes: number;
  grantedMemoryMb: number;
  queryText: string;
  hasPlan: boolean;
  planHandle: string;
  sqlHandle: string;
  percentComplete: number;
}

export interface QueryStoreEntry {
  queryId: number;
  planId: number;
  queryText: string;
  executionCount: number;
  totalCpuMs: number;
  avgCpuMs: number;
  totalDurationMs: number;
  avgDurationMs: number;
  totalLogicalReads: number;
  avgLogicalReads: number;
  totalPhysicalReads: number;
  avgPhysicalReads: number;
  totalSpillsMb: number;
  lastExecutionTime: string;
  planXml?: string;
}

export interface LiveDeadlockReport {
  timestamp: string;
  victimSpid: number;
  deadlockGraphXml: string;
  processCount: number;
  lockedResourceCount: number;
  deadlockType: string;
  summary: string;
}

export interface ServerVitals {
  cpuQueueTasks: number;
  signalWaitPct: number;
  memoryGrantsPending: number;
  availableMemoryMb: number;
  tempDbUserObjectsMb: number;
  tempDbInternalMb: number;
  batchRequestsPerSec: number;
}

export interface LiveWaitStat {
  waitType: string;
  waitCategory: string; // "Disk I/O", "Locking", "Parallelism", "CPU Scheduler", "Network", "Memory", "Other"
  waitingTasksCount: number;
  waitTimeMs: number;
  signalWaitTimeMs: number;
  percentage: number;
  description: string;
  recommendation: string;
}

export interface LiveBlockingSession {
  rootBlockerSpid: number;
  rootBlockerStatus: string;
  rootBlockerLogin: string;
  rootBlockerProgram: string;
  rootBlockerQuery: string;
  blockedSpid: number;
  blockedStatus: string;
  blockedLogin: string;
  blockedProgram: string;
  blockedWaitType: string;
  blockedWaitTimeMs: number;
  blockedQuery: string;
  lockResource: string;
  lockMode: string;
}

export interface LiveMissingIndex {
  databaseName: string;
  tableName: string;
  impactScore: number;
  userSeeks: number;
  userScans: number;
  avgTotalUserCost: number;
  avgUserImpact: number;
  equalityColumns: string;
  inequalityColumns: string;
  includedColumns: string;
  createIndexStatement: string;
}

export interface LiveTempDBUsage {
  spid: number;
  databaseName: string;
  loginName: string;
  programName: string;
  userObjectsAllocMb: number;
  userObjectsDeallocMb: number;
  internalObjectsAllocMb: number;
  internalObjectsDeallocMb: number;
  queryText: string;
}

export interface ColumnFilter {
  id: string;
  columnId: string;
  operator: 'contains' | 'equals' | 'gte' | 'lte' | 'gt' | 'lt' | 'neq';
  value: string;
}

export interface IdleSession {
  spid: number;
  status: string; // "sleeping", "dormant"
  loginName: string;
  hostName: string;
  programName: string;
  databaseName: string;
  openTransactions: number;
  lastRequestStartTime: string;
  lastRequestEndTime: string;
  idleSeconds: number;
  totalCpuTimeMs: number;
  totalElapsedTimeMs: number;
  logicalReads: number;
  writes: number;
  memoryUsageKb: number;
  lastQueryText: string;
}

export interface PerformanceAdvisor {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  description: string;
  queryId?: number;
  queryText?: string;
  metricValue: string;
  timestamp: string;
  planXml?: string;
  recommendation: string;
}

export interface WaitTimeHistoryPoint {
  intervalLabel: string;
  totalWaitMs: number;
  cpuWaitMs: number;
  lockWaitMs: number;
  ioWaitMs: number;
  memoryWaitMs: number;
  otherWaitMs: number;
  executionCount: number;
  isAnomaly: boolean;
  anomalyReason?: string;
}

export interface BufferPoolConsumer {
  databaseName: string;
  schemaName: string;
  objectName: string;
  indexName: string;
  indexType: string;
  bufferSizeMb: number;
  cleanPagesMb: number;
  dirtyPagesMb: number;
  percentageOfBuffer: number;
  rowCount: number;
}

export interface UnusedIndex {
  databaseName: string;
  schemaName: string;
  tableName: string;
  indexName: string;
  indexType: string;
  indexSizeMb: number;
  userWrites: number;
  userSeeks: number;
  userScans: number;
  userLookups: number;
  dropStatement: string;
}

export interface DuplicateIndex {
  tableName: string;
  indexName: string;
  duplicateOf: string;
  indexCols: string;
  includedCols: string;
  overlapType: 'Exact Duplicate' | 'Left-Prefix Redundant';
  dropStatement: string;
}
