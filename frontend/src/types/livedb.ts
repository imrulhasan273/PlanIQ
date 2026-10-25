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
