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
    | 'Circular Lock Contention';
  summary: string;
  remedy: string;
  processes: DeadlockProcess[];
  resources: DeadlockResource[];
  cycle: DeadlockCycleStep[];
  rawXml: string;
}
