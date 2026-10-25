export interface DeadlockStackFrame {
  procname: string;
  line: number;
  sql: string;
}

export interface DeadlockProcess {
  id: string;
  spid: number;
  ecid: number;
  status: string;
  priority: number;
  waittimeMs: number;
  waitresource: string;
  lockMode: string;
  loginname: string;
  hostname: string;
  clientapp: string;
  isolationlevel: string;
  transactionname: string;
  inputbuf: string;
  isVictim: boolean;
  executionStack: DeadlockStackFrame[];
  // Deep attributes from ShowPlan/Deadlock XML
  logUsedBytes?: number;
  tranCount?: number;
  lastTranStarted?: string;
  lastBatchStarted?: string;
  lastBatchCompleted?: string;
  xactId?: string;
  currentDb?: string;
  kpid?: number;
  lockTimeout?: string;
  isParallelWorker?: boolean;
}

export interface ResourceLockHolder {
  processId: string;
  mode: string;
  requestType?: string;
}

export interface DeadlockResource {
  id: string;
  type: string; // 'keylock' | 'pagelock' | 'objectlock' | 'exchangeEvent' | 'rowlock' etc.
  database: string;
  objectname: string;
  indexname: string;
  mode: string;
  associatedObjectId?: string;
  subresource?: string;
  fileId?: string;
  pageId?: string;
  slotId?: string;
  hobtid?: string;
  lockGranularity: 'Page Lock' | 'Row / Key Lock' | 'Table / Object Lock' | 'Extent Lock' | 'Exchange Event' | 'Metadata Lock';
  owners: ResourceLockHolder[];
  waiters: ResourceLockHolder[];
}

export interface DeadlockCycleStep {
  fromProcessId: string;
  waitsOnResourceId: string;
  toProcessId: string;
  lockRequested: string;
  lockHeld: string;
}

export interface DeadlockTimelineEvent {
  stepNumber: number;
  phase: 'OWN' | 'WAIT' | 'CYCLE' | 'KILL';
  spid: number;
  processId: string;
  isVictim: boolean;
  resourceName: string;
  lockMode: string;
  description: string;
}

export interface DeadlockGraph {
  id: string;
  timestamp?: string;
  victimProcessId: string;
  victimSpid?: number;
  deadlockType:
    | 'Reverse Order Lock Acquisition'
    | 'Bookmark / Conversion Deadlock'
    | 'Parallelism Exchange Deadlock (CXPACKET)'
    | 'Serializable Range Escalation'
    | 'Page Lock Contention on Bulk Insert'
    | 'Circular Lock Contention';
  summary: string;
  remedy: string;
  victimSelectionReason?: string;
  lockConflictDetails?: string;
  hasPageLocks?: boolean;
  hasBulkInsert?: boolean;
  hasNestedTransactions?: boolean;
  timeline: DeadlockTimelineEvent[];
  processes: DeadlockProcess[];
  resources: DeadlockResource[];
  cycle: DeadlockCycleStep[];
  rawXml: string;
}
