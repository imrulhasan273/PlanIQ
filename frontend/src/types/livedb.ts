export interface ConnectionConfig {
  server: string;
  port: number;
  database: string;
  authType: 'sql' | 'windows';
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
  serverType?: string;
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
  queryHash?: string;
  planHash?: string;
  moduleName?: string;
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
  totalWrites?: number;
  avgWrites?: number;
  totalMemoryMb?: number;
  avgMemoryMb?: number;
  totalSpillsMb: number;
  lastExecutionTime: string;
  executionType?: string;
  waitProfile?: Record<string, number>;
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

export interface SevenDaySyncResult {
  serverName: string;
  databaseName: string;
  isQueryStoreOn: boolean;
  intervalsSynced: number;
  deadlocksSynced: number;
  message: string;
  syncedAt: string;
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

export interface SchedulerActiveTask {
  schedulerId: number;
  cpuId: number;
  parentNodeId: number;
  sessionId: number;
  requestId: number;
  taskState: 'RUNNING' | 'RUNNABLE' | 'SUSPENDED';
  cpuTimeMs: number;
  totalElapsedTime: number;
  waitType: string;
  waitTimeMs: number;
  command: string;
  databaseName: string;
  queryText: string;
}

export interface CPUSchedulerInfo {
  schedulerId: number;
  cpuId: number;
  status: string;
  isOnline: boolean;
  isIdle: boolean;
  currentTasksCount: number;
  runnableTasksCount: number;
  activeWorkersCount: number;
  workQueueCount: number;
  contextSwitchesCount: number;
  yieldCount: number;
  preemptiveSwitches: number;
  parentNodeId: number;
  quantumHealth: 'Healthy' | 'Warning' | 'Critical';
  yieldsPerSec?: number;
  contextSwitchesPerSec?: number;
}

export interface NUMANodeInfo {
  nodeId: number;
  memoryNodeId: number;
  nodeStateDesc: string;
  onlineSchedulerCount: number;
  idleSchedulerCount: number;
  activeWorkerCount: number;
  avgLoadBalance: number;
  memoryAllocatedMb: number;
  memoryTargetMb: number;
  foreignPageCount: number;
  foreignMemoryMb: number;
  foreignPageRatio: number;
}

export interface EngineInternalsReport {
  maxWorkersCount: number;
  totalActiveWorkers: number;
  threadPoolUtilization: number;
  threadPoolStarvation: boolean;
  totalRunnableTasks: number;
  quantumPressureStatus: string;
  quantumPressureSummary: string;
  numaNodesCount: number;
  numaSkewDetected: boolean;
  numaSkewSummary?: string;
  totalForeignPages: number;
  crossNumaLatencyRisk: string;
  schedulers: CPUSchedulerInfo[];
  activeTasks?: SchedulerActiveTask[];
  numaNodes: NUMANodeInfo[];
}

export interface WindowsUserInfo {
  username: string;
  domain: string;
  fullAccount: string;
}

export interface DBConnectionProfile {
  id: string;
  name: string;
  server: string;
  port: number;
  database: string;
  authType: string;
  username?: string;
  password?: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  applicationIntent: string;
  timeoutSeconds: number;
  isDefault: boolean;
  engine?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DPAPerspectiveItem {
  name: string;
  secondary?: string;
  sessionCount: number;
  waitSec: number;
  cpuSec: number;
  execCount: number;
  logicalReads: number;
  writes: number;
  percentage: number;
}

export interface NUMAPLENode {
  nodeId: number;
  nodeName: string;
  pleSeconds: number;
  targetPle: number;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  foreignPageRatio: number;
  memoryAllocatedMb: number;
}

export interface PLECulpritQuery {
  queryId: number;
  planId: number;
  queryHash: string;
  queryText: string;
  executionCount: number;
  avgPhysicalReadsMb: number;
  totalPhysicalReadsMb: number;
  avgLogicalReadsMb: number;
  avgDurationMs: number;
  avgCpuMs: number;
  impactSeverity: 'CRITICAL' | 'HIGH' | 'ELEVATED' | string;
  bufferPoolFlushRisk: string;
  lastExecutionTime: string;
}

export interface TableEvictionImpact {
  tableName: string;
  schemaName: string;
  databaseName: string;
  indexName: string;
  currentCachedMb: number;
  bufferPoolPercent: number;
  evictionRisk: 'CRITICAL' | 'HIGH' | 'MODERATE' | string;
  pushedOutByQuery: string;
  estimatedEvictedMb?: number;
  displacementReason: string;
}

export interface PLEDoctorInsight {
  category: string;
  severity: 'CRITICAL' | 'WARNING' | 'HEALTHY' | string;
  title: string;
  diagnosis: string;
  actionableRemedy: string;
  suggestedTsql: string;
}

export interface PLEReport {
  overallPle: number;
  targetPle: number;
  totalMemoryGb: number;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  summary: string;
  isNuma: boolean;
  nodeCount: number;
  numaNodes: NUMAPLENode[];
  culpritQueries: PLECulpritQuery[];
  lastEvaluatedAt: string;

  // Deep Memory Pressure Gauges
  lazyWritesPerSec: number;
  freeListStallsPerSec: number;
  pageReadsPerSec: number;
  pageWritesPerSec: number;
  pageReadsMbPerSec: number;
  bufferCacheHitRatio: number;

  // PLE Burn Velocity & Alerting
  pleBurnRateSecondsPerMin: number;
  pleBurnVerdict: string;

  // Server Memory Limits
  maxServerMemoryMb: number;
  targetServerMemoryMb: number;
  totalServerMemoryMb: number;
  memoryGrantsPendingCount: number;

  // Table Evictions & AI Doctor Insights
  tableEvictionImpacts: TableEvictionImpact[];
  doctorInsights: PLEDoctorInsight[];
}



