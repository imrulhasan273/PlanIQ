export namespace advisor {
	
	export class AIRequest {
	    provider: string;
	    apiKey: string;
	    model: string;
	    endpointUrl: string;
	    sanitizeBeforeAI: boolean;
	    statement?: sqlplan.StatementAnalysis;
	    fullPlan?: sqlplan.PlanAnalysis;
	
	    static createFrom(source: any = {}) {
	        return new AIRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.apiKey = source["apiKey"];
	        this.model = source["model"];
	        this.endpointUrl = source["endpointUrl"];
	        this.sanitizeBeforeAI = source["sanitizeBeforeAI"];
	        this.statement = this.convertValues(source["statement"], sqlplan.StatementAnalysis);
	        this.fullPlan = this.convertValues(source["fullPlan"], sqlplan.PlanAnalysis);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RewriteStrategy {
	    id: string;
	    title: string;
	    description: string;
	    sql: string;
	    estimatedGain: string;
	
	    static createFrom(source: any = {}) {
	        return new RewriteStrategy(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.sql = source["sql"];
	        this.estimatedGain = source["estimatedGain"];
	    }
	}
	export class TechnicalSuggestion {
	    category: string;
	    title: string;
	    severity: string;
	    impact: string;
	    technicalDetail: string;
	    actionItem: string;
	
	    static createFrom(source: any = {}) {
	        return new TechnicalSuggestion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.category = source["category"];
	        this.title = source["title"];
	        this.severity = source["severity"];
	        this.impact = source["impact"];
	        this.technicalDetail = source["technicalDetail"];
	        this.actionItem = source["actionItem"];
	    }
	}
	export class AIResponse {
	    summary: string;
	    rootCause: string;
	    recommendedRewrite: string;
	    rewriteExplanation: string;
	    alternativeRewrite?: string;
	    tuningStrategies?: string[];
	    technicalSuggestions?: TechnicalSuggestion[];
	    strategies?: RewriteStrategy[];
	    indexRecommendations: string[];
	    serverConfigTips: string[];
	    implementationChecklist?: string[];
	    estimatedGains?: Record<string, string>;
	    providerUsed: string;
	
	    static createFrom(source: any = {}) {
	        return new AIResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.summary = source["summary"];
	        this.rootCause = source["rootCause"];
	        this.recommendedRewrite = source["recommendedRewrite"];
	        this.rewriteExplanation = source["rewriteExplanation"];
	        this.alternativeRewrite = source["alternativeRewrite"];
	        this.tuningStrategies = source["tuningStrategies"];
	        this.technicalSuggestions = this.convertValues(source["technicalSuggestions"], TechnicalSuggestion);
	        this.strategies = this.convertValues(source["strategies"], RewriteStrategy);
	        this.indexRecommendations = source["indexRecommendations"];
	        this.serverConfigTips = source["serverConfigTips"];
	        this.implementationChecklist = source["implementationChecklist"];
	        this.estimatedGains = source["estimatedGains"];
	        this.providerUsed = source["providerUsed"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

export namespace configdb {
	
	export class DBConnectionProfile {
	    id: string;
	    name: string;
	    server: string;
	    port: number;
	    database: string;
	    authType: string;
	    username: string;
	    password: string;
	    encrypt: boolean;
	    trustServerCertificate: boolean;
	    applicationIntent: string;
	    timeoutSeconds: number;
	    isDefault: boolean;
	    engine: string;
	    allowRbacWrite: boolean;
	    allowBackupRestore: boolean;
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new DBConnectionProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.server = source["server"];
	        this.port = source["port"];
	        this.database = source["database"];
	        this.authType = source["authType"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.encrypt = source["encrypt"];
	        this.trustServerCertificate = source["trustServerCertificate"];
	        this.applicationIntent = source["applicationIntent"];
	        this.timeoutSeconds = source["timeoutSeconds"];
	        this.isDefault = source["isDefault"];
	        this.engine = source["engine"];
	        this.allowRbacWrite = source["allowRbacWrite"];
	        this.allowBackupRestore = source["allowBackupRestore"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class PgBackupJobRecord {
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
	
	    static createFrom(source: any = {}) {
	        return new PgBackupJobRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.startedAt = source["startedAt"];
	        this.finishedAt = source["finishedAt"];
	        this.durationMs = source["durationMs"];
	        this.engine = source["engine"];
	        this.server = source["server"];
	        this.databaseName = source["databaseName"];
	        this.operation = source["operation"];
	        this.mode = source["mode"];
	        this.format = source["format"];
	        this.outputPath = source["outputPath"];
	        this.sizeBytes = source["sizeBytes"];
	        this.status = source["status"];
	        this.exitCode = source["exitCode"];
	        this.commandPreview = source["commandPreview"];
	        this.errorMessage = source["errorMessage"];
	    }
	}
	export class PgBackupProfile {
	    id: string;
	    name: string;
	    kind: string;
	    payloadJson: string;
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new PgBackupProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.payloadJson = source["payloadJson"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class StoredWaitPoint {
	    serverName: string;
	    databaseName: string;
	    intervalLabel: string;
	    totalWaitMs: number;
	    cpuWaitMs: number;
	    lockWaitMs: number;
	    ioWaitMs: number;
	    memoryWaitMs: number;
	    otherWaitMs: number;
	    executionCount: number;
	    isAnomaly: boolean;
	    anomalyReason: string;
	    syncedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new StoredWaitPoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverName = source["serverName"];
	        this.databaseName = source["databaseName"];
	        this.intervalLabel = source["intervalLabel"];
	        this.totalWaitMs = source["totalWaitMs"];
	        this.cpuWaitMs = source["cpuWaitMs"];
	        this.lockWaitMs = source["lockWaitMs"];
	        this.ioWaitMs = source["ioWaitMs"];
	        this.memoryWaitMs = source["memoryWaitMs"];
	        this.otherWaitMs = source["otherWaitMs"];
	        this.executionCount = source["executionCount"];
	        this.isAnomaly = source["isAnomaly"];
	        this.anomalyReason = source["anomalyReason"];
	        this.syncedAt = source["syncedAt"];
	    }
	}

}

export namespace livedb {
	
	export class ActiveSession {
	    spid: number;
	    status: string;
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
	
	    static createFrom(source: any = {}) {
	        return new ActiveSession(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.spid = source["spid"];
	        this.status = source["status"];
	        this.command = source["command"];
	        this.databaseName = source["databaseName"];
	        this.loginName = source["loginName"];
	        this.hostName = source["hostName"];
	        this.programName = source["programName"];
	        this.waitType = source["waitType"];
	        this.waitTimeMs = source["waitTimeMs"];
	        this.lastWaitType = source["lastWaitType"];
	        this.blockingSpid = source["blockingSpid"];
	        this.cpuTimeMs = source["cpuTimeMs"];
	        this.totalElapsedTimeMs = source["totalElapsedTimeMs"];
	        this.logicalReads = source["logicalReads"];
	        this.writes = source["writes"];
	        this.grantedMemoryMb = source["grantedMemoryMb"];
	        this.queryText = source["queryText"];
	        this.hasPlan = source["hasPlan"];
	        this.planHandle = source["planHandle"];
	        this.sqlHandle = source["sqlHandle"];
	        this.percentComplete = source["percentComplete"];
	    }
	}
	export class BufferPoolConsumer {
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
	
	    static createFrom(source: any = {}) {
	        return new BufferPoolConsumer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.databaseName = source["databaseName"];
	        this.schemaName = source["schemaName"];
	        this.objectName = source["objectName"];
	        this.indexName = source["indexName"];
	        this.indexType = source["indexType"];
	        this.bufferSizeMb = source["bufferSizeMb"];
	        this.cleanPagesMb = source["cleanPagesMb"];
	        this.dirtyPagesMb = source["dirtyPagesMb"];
	        this.percentageOfBuffer = source["percentageOfBuffer"];
	        this.rowCount = source["rowCount"];
	    }
	}
	export class CPUSchedulerInfo {
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
	    quantumHealth: string;
	    yieldsPerSec: number;
	    contextSwitchesPerSec: number;
	
	    static createFrom(source: any = {}) {
	        return new CPUSchedulerInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schedulerId = source["schedulerId"];
	        this.cpuId = source["cpuId"];
	        this.status = source["status"];
	        this.isOnline = source["isOnline"];
	        this.isIdle = source["isIdle"];
	        this.currentTasksCount = source["currentTasksCount"];
	        this.runnableTasksCount = source["runnableTasksCount"];
	        this.activeWorkersCount = source["activeWorkersCount"];
	        this.workQueueCount = source["workQueueCount"];
	        this.contextSwitchesCount = source["contextSwitchesCount"];
	        this.yieldCount = source["yieldCount"];
	        this.preemptiveSwitches = source["preemptiveSwitches"];
	        this.parentNodeId = source["parentNodeId"];
	        this.quantumHealth = source["quantumHealth"];
	        this.yieldsPerSec = source["yieldsPerSec"];
	        this.contextSwitchesPerSec = source["contextSwitchesPerSec"];
	    }
	}
	export class ConnectionConfig {
	    engine?: string;
	    server: string;
	    port: number;
	    database: string;
	    authType: string;
	    username: string;
	    password: string;
	    encrypt: boolean;
	    trustServerCertificate: boolean;
	    applicationIntent: string;
	    timeoutSeconds: number;
	    allowRbacWrite?: boolean;
	    allowBackupRestore?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.engine = source["engine"];
	        this.server = source["server"];
	        this.port = source["port"];
	        this.database = source["database"];
	        this.authType = source["authType"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.encrypt = source["encrypt"];
	        this.trustServerCertificate = source["trustServerCertificate"];
	        this.applicationIntent = source["applicationIntent"];
	        this.timeoutSeconds = source["timeoutSeconds"];
	        this.allowRbacWrite = source["allowRbacWrite"];
	        this.allowBackupRestore = source["allowBackupRestore"];
	    }
	}
	export class ConnectionStatus {
	    connected: boolean;
	    serverVersion: string;
	    serverName: string;
	    databaseName: string;
	    activeSessions: number;
	    latencyMs: number;
	    isReadOnly: boolean;
	    allowRbacWrite?: boolean;
	    allowBackupRestore?: boolean;
	    isDemo: boolean;
	    errorMessage?: string;
	    serverType?: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connected = source["connected"];
	        this.serverVersion = source["serverVersion"];
	        this.serverName = source["serverName"];
	        this.databaseName = source["databaseName"];
	        this.activeSessions = source["activeSessions"];
	        this.latencyMs = source["latencyMs"];
	        this.isReadOnly = source["isReadOnly"];
	        this.allowRbacWrite = source["allowRbacWrite"];
	        this.allowBackupRestore = source["allowBackupRestore"];
	        this.isDemo = source["isDemo"];
	        this.errorMessage = source["errorMessage"];
	        this.serverType = source["serverType"];
	    }
	}
	export class DPAPerspectiveItem {
	    name: string;
	    secondary: string;
	    sessionCount: number;
	    waitSec: number;
	    cpuSec: number;
	    execCount: number;
	    logicalReads: number;
	    writes: number;
	    percentage: number;
	
	    static createFrom(source: any = {}) {
	        return new DPAPerspectiveItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.secondary = source["secondary"];
	        this.sessionCount = source["sessionCount"];
	        this.waitSec = source["waitSec"];
	        this.cpuSec = source["cpuSec"];
	        this.execCount = source["execCount"];
	        this.logicalReads = source["logicalReads"];
	        this.writes = source["writes"];
	        this.percentage = source["percentage"];
	    }
	}
	export class DuplicateIndex {
	    tableName: string;
	    indexName: string;
	    duplicateOf: string;
	    indexCols: string;
	    includedCols: string;
	    overlapType: string;
	    dropStatement: string;
	
	    static createFrom(source: any = {}) {
	        return new DuplicateIndex(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tableName = source["tableName"];
	        this.indexName = source["indexName"];
	        this.duplicateOf = source["duplicateOf"];
	        this.indexCols = source["indexCols"];
	        this.includedCols = source["includedCols"];
	        this.overlapType = source["overlapType"];
	        this.dropStatement = source["dropStatement"];
	    }
	}
	export class NUMANodeInfo {
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
	
	    static createFrom(source: any = {}) {
	        return new NUMANodeInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nodeId = source["nodeId"];
	        this.memoryNodeId = source["memoryNodeId"];
	        this.nodeStateDesc = source["nodeStateDesc"];
	        this.onlineSchedulerCount = source["onlineSchedulerCount"];
	        this.idleSchedulerCount = source["idleSchedulerCount"];
	        this.activeWorkerCount = source["activeWorkerCount"];
	        this.avgLoadBalance = source["avgLoadBalance"];
	        this.memoryAllocatedMb = source["memoryAllocatedMb"];
	        this.memoryTargetMb = source["memoryTargetMb"];
	        this.foreignPageCount = source["foreignPageCount"];
	        this.foreignMemoryMb = source["foreignMemoryMb"];
	        this.foreignPageRatio = source["foreignPageRatio"];
	    }
	}
	export class SchedulerActiveTask {
	    schedulerId: number;
	    cpuId: number;
	    parentNodeId: number;
	    sessionId: number;
	    requestId: number;
	    taskState: string;
	    cpuTimeMs: number;
	    totalElapsedTime: number;
	    waitType: string;
	    waitTimeMs: number;
	    command: string;
	    databaseName: string;
	    queryText: string;
	
	    static createFrom(source: any = {}) {
	        return new SchedulerActiveTask(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schedulerId = source["schedulerId"];
	        this.cpuId = source["cpuId"];
	        this.parentNodeId = source["parentNodeId"];
	        this.sessionId = source["sessionId"];
	        this.requestId = source["requestId"];
	        this.taskState = source["taskState"];
	        this.cpuTimeMs = source["cpuTimeMs"];
	        this.totalElapsedTime = source["totalElapsedTime"];
	        this.waitType = source["waitType"];
	        this.waitTimeMs = source["waitTimeMs"];
	        this.command = source["command"];
	        this.databaseName = source["databaseName"];
	        this.queryText = source["queryText"];
	    }
	}
	export class EngineInternalsReport {
	    maxWorkersCount: number;
	    totalActiveWorkers: number;
	    threadPoolUtilization: number;
	    threadPoolStarvation: boolean;
	    totalRunnableTasks: number;
	    quantumPressureStatus: string;
	    quantumPressureSummary: string;
	    numaNodesCount: number;
	    numaSkewDetected: boolean;
	    numaSkewSummary: string;
	    totalForeignPages: number;
	    crossNumaLatencyRisk: string;
	    schedulers: CPUSchedulerInfo[];
	    activeTasks: SchedulerActiveTask[];
	    numaNodes: NUMANodeInfo[];
	
	    static createFrom(source: any = {}) {
	        return new EngineInternalsReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.maxWorkersCount = source["maxWorkersCount"];
	        this.totalActiveWorkers = source["totalActiveWorkers"];
	        this.threadPoolUtilization = source["threadPoolUtilization"];
	        this.threadPoolStarvation = source["threadPoolStarvation"];
	        this.totalRunnableTasks = source["totalRunnableTasks"];
	        this.quantumPressureStatus = source["quantumPressureStatus"];
	        this.quantumPressureSummary = source["quantumPressureSummary"];
	        this.numaNodesCount = source["numaNodesCount"];
	        this.numaSkewDetected = source["numaSkewDetected"];
	        this.numaSkewSummary = source["numaSkewSummary"];
	        this.totalForeignPages = source["totalForeignPages"];
	        this.crossNumaLatencyRisk = source["crossNumaLatencyRisk"];
	        this.schedulers = this.convertValues(source["schedulers"], CPUSchedulerInfo);
	        this.activeTasks = this.convertValues(source["activeTasks"], SchedulerActiveTask);
	        this.numaNodes = this.convertValues(source["numaNodes"], NUMANodeInfo);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class IdleSession {
	    spid: number;
	    status: string;
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
	
	    static createFrom(source: any = {}) {
	        return new IdleSession(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.spid = source["spid"];
	        this.status = source["status"];
	        this.loginName = source["loginName"];
	        this.hostName = source["hostName"];
	        this.programName = source["programName"];
	        this.databaseName = source["databaseName"];
	        this.openTransactions = source["openTransactions"];
	        this.lastRequestStartTime = source["lastRequestStartTime"];
	        this.lastRequestEndTime = source["lastRequestEndTime"];
	        this.idleSeconds = source["idleSeconds"];
	        this.totalCpuTimeMs = source["totalCpuTimeMs"];
	        this.totalElapsedTimeMs = source["totalElapsedTimeMs"];
	        this.logicalReads = source["logicalReads"];
	        this.writes = source["writes"];
	        this.memoryUsageKb = source["memoryUsageKb"];
	        this.lastQueryText = source["lastQueryText"];
	    }
	}
	export class LiveBlockingSession {
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
	
	    static createFrom(source: any = {}) {
	        return new LiveBlockingSession(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rootBlockerSpid = source["rootBlockerSpid"];
	        this.rootBlockerStatus = source["rootBlockerStatus"];
	        this.rootBlockerLogin = source["rootBlockerLogin"];
	        this.rootBlockerProgram = source["rootBlockerProgram"];
	        this.rootBlockerQuery = source["rootBlockerQuery"];
	        this.blockedSpid = source["blockedSpid"];
	        this.blockedStatus = source["blockedStatus"];
	        this.blockedLogin = source["blockedLogin"];
	        this.blockedProgram = source["blockedProgram"];
	        this.blockedWaitType = source["blockedWaitType"];
	        this.blockedWaitTimeMs = source["blockedWaitTimeMs"];
	        this.blockedQuery = source["blockedQuery"];
	        this.lockResource = source["lockResource"];
	        this.lockMode = source["lockMode"];
	    }
	}
	export class LiveDeadlockReport {
	    timestamp: string;
	    victimSpid: number;
	    deadlockGraphXml: string;
	    processCount: number;
	    lockedResourceCount: number;
	    deadlockType: string;
	    summary: string;
	
	    static createFrom(source: any = {}) {
	        return new LiveDeadlockReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.victimSpid = source["victimSpid"];
	        this.deadlockGraphXml = source["deadlockGraphXml"];
	        this.processCount = source["processCount"];
	        this.lockedResourceCount = source["lockedResourceCount"];
	        this.deadlockType = source["deadlockType"];
	        this.summary = source["summary"];
	    }
	}
	export class LiveMissingIndex {
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
	
	    static createFrom(source: any = {}) {
	        return new LiveMissingIndex(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.databaseName = source["databaseName"];
	        this.tableName = source["tableName"];
	        this.impactScore = source["impactScore"];
	        this.userSeeks = source["userSeeks"];
	        this.userScans = source["userScans"];
	        this.avgTotalUserCost = source["avgTotalUserCost"];
	        this.avgUserImpact = source["avgUserImpact"];
	        this.equalityColumns = source["equalityColumns"];
	        this.inequalityColumns = source["inequalityColumns"];
	        this.includedColumns = source["includedColumns"];
	        this.createIndexStatement = source["createIndexStatement"];
	    }
	}
	export class LiveTempDBUsage {
	    spid: number;
	    databaseName: string;
	    loginName: string;
	    programName: string;
	    userObjectsAllocMb: number;
	    userObjectsDeallocMb: number;
	    internalObjectsAllocMb: number;
	    internalObjectsDeallocMb: number;
	    queryText: string;
	
	    static createFrom(source: any = {}) {
	        return new LiveTempDBUsage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.spid = source["spid"];
	        this.databaseName = source["databaseName"];
	        this.loginName = source["loginName"];
	        this.programName = source["programName"];
	        this.userObjectsAllocMb = source["userObjectsAllocMb"];
	        this.userObjectsDeallocMb = source["userObjectsDeallocMb"];
	        this.internalObjectsAllocMb = source["internalObjectsAllocMb"];
	        this.internalObjectsDeallocMb = source["internalObjectsDeallocMb"];
	        this.queryText = source["queryText"];
	    }
	}
	export class LiveWaitStat {
	    waitType: string;
	    waitCategory: string;
	    waitingTasksCount: number;
	    waitTimeMs: number;
	    signalWaitTimeMs: number;
	    percentage: number;
	    description: string;
	    recommendation: string;
	
	    static createFrom(source: any = {}) {
	        return new LiveWaitStat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.waitType = source["waitType"];
	        this.waitCategory = source["waitCategory"];
	        this.waitingTasksCount = source["waitingTasksCount"];
	        this.waitTimeMs = source["waitTimeMs"];
	        this.signalWaitTimeMs = source["signalWaitTimeMs"];
	        this.percentage = source["percentage"];
	        this.description = source["description"];
	        this.recommendation = source["recommendation"];
	    }
	}
	
	export class NUMAPLENode {
	    nodeId: number;
	    nodeName: string;
	    pleSeconds: number;
	    targetPle: number;
	    status: string;
	    foreignPageRatio: number;
	    memoryAllocatedMb: number;
	
	    static createFrom(source: any = {}) {
	        return new NUMAPLENode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nodeId = source["nodeId"];
	        this.nodeName = source["nodeName"];
	        this.pleSeconds = source["pleSeconds"];
	        this.targetPle = source["targetPle"];
	        this.status = source["status"];
	        this.foreignPageRatio = source["foreignPageRatio"];
	        this.memoryAllocatedMb = source["memoryAllocatedMb"];
	    }
	}
	export class PLECulpritQuery {
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
	    impactSeverity: string;
	    bufferPoolFlushRisk: string;
	    lastExecutionTime: string;
	
	    static createFrom(source: any = {}) {
	        return new PLECulpritQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.queryId = source["queryId"];
	        this.planId = source["planId"];
	        this.queryHash = source["queryHash"];
	        this.queryText = source["queryText"];
	        this.executionCount = source["executionCount"];
	        this.avgPhysicalReadsMb = source["avgPhysicalReadsMb"];
	        this.totalPhysicalReadsMb = source["totalPhysicalReadsMb"];
	        this.avgLogicalReadsMb = source["avgLogicalReadsMb"];
	        this.avgDurationMs = source["avgDurationMs"];
	        this.avgCpuMs = source["avgCpuMs"];
	        this.impactSeverity = source["impactSeverity"];
	        this.bufferPoolFlushRisk = source["bufferPoolFlushRisk"];
	        this.lastExecutionTime = source["lastExecutionTime"];
	    }
	}
	export class PLEDoctorInsight {
	    category: string;
	    severity: string;
	    title: string;
	    diagnosis: string;
	    actionableRemedy: string;
	    suggestedTsql: string;
	
	    static createFrom(source: any = {}) {
	        return new PLEDoctorInsight(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.category = source["category"];
	        this.severity = source["severity"];
	        this.title = source["title"];
	        this.diagnosis = source["diagnosis"];
	        this.actionableRemedy = source["actionableRemedy"];
	        this.suggestedTsql = source["suggestedTsql"];
	    }
	}
	export class TableEvictionImpact {
	    tableName: string;
	    schemaName: string;
	    databaseName: string;
	    indexName: string;
	    currentCachedMb: number;
	    bufferPoolPercent: number;
	    evictionRisk: string;
	    pushedOutByQuery: string;
	    estimatedEvictedMb: number;
	    displacementReason: string;
	
	    static createFrom(source: any = {}) {
	        return new TableEvictionImpact(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tableName = source["tableName"];
	        this.schemaName = source["schemaName"];
	        this.databaseName = source["databaseName"];
	        this.indexName = source["indexName"];
	        this.currentCachedMb = source["currentCachedMb"];
	        this.bufferPoolPercent = source["bufferPoolPercent"];
	        this.evictionRisk = source["evictionRisk"];
	        this.pushedOutByQuery = source["pushedOutByQuery"];
	        this.estimatedEvictedMb = source["estimatedEvictedMb"];
	        this.displacementReason = source["displacementReason"];
	    }
	}
	export class PLEReport {
	    overallPle: number;
	    targetPle: number;
	    totalMemoryGb: number;
	    status: string;
	    summary: string;
	    isNuma: boolean;
	    nodeCount: number;
	    numaNodes: NUMAPLENode[];
	    culpritQueries: PLECulpritQuery[];
	    lastEvaluatedAt: string;
	    lazyWritesPerSec: number;
	    freeListStallsPerSec: number;
	    pageReadsPerSec: number;
	    pageWritesPerSec: number;
	    pageReadsMbPerSec: number;
	    bufferCacheHitRatio: number;
	    pleBurnRateSecondsPerMin: number;
	    pleBurnVerdict: string;
	    maxServerMemoryMb: number;
	    targetServerMemoryMb: number;
	    totalServerMemoryMb: number;
	    memoryGrantsPendingCount: number;
	    tableEvictionImpacts: TableEvictionImpact[];
	    doctorInsights: PLEDoctorInsight[];
	
	    static createFrom(source: any = {}) {
	        return new PLEReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.overallPle = source["overallPle"];
	        this.targetPle = source["targetPle"];
	        this.totalMemoryGb = source["totalMemoryGb"];
	        this.status = source["status"];
	        this.summary = source["summary"];
	        this.isNuma = source["isNuma"];
	        this.nodeCount = source["nodeCount"];
	        this.numaNodes = this.convertValues(source["numaNodes"], NUMAPLENode);
	        this.culpritQueries = this.convertValues(source["culpritQueries"], PLECulpritQuery);
	        this.lastEvaluatedAt = source["lastEvaluatedAt"];
	        this.lazyWritesPerSec = source["lazyWritesPerSec"];
	        this.freeListStallsPerSec = source["freeListStallsPerSec"];
	        this.pageReadsPerSec = source["pageReadsPerSec"];
	        this.pageWritesPerSec = source["pageWritesPerSec"];
	        this.pageReadsMbPerSec = source["pageReadsMbPerSec"];
	        this.bufferCacheHitRatio = source["bufferCacheHitRatio"];
	        this.pleBurnRateSecondsPerMin = source["pleBurnRateSecondsPerMin"];
	        this.pleBurnVerdict = source["pleBurnVerdict"];
	        this.maxServerMemoryMb = source["maxServerMemoryMb"];
	        this.targetServerMemoryMb = source["targetServerMemoryMb"];
	        this.totalServerMemoryMb = source["totalServerMemoryMb"];
	        this.memoryGrantsPendingCount = source["memoryGrantsPendingCount"];
	        this.tableEvictionImpacts = this.convertValues(source["tableEvictionImpacts"], TableEvictionImpact);
	        this.doctorInsights = this.convertValues(source["doctorInsights"], PLEDoctorInsight);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PerformanceAdvisor {
	    id: string;
	    severity: string;
	    category: string;
	    title: string;
	    description: string;
	    queryId?: number;
	    queryText?: string;
	    metricValue: string;
	    timestamp: string;
	    planXml?: string;
	    recommendation: string;
	
	    static createFrom(source: any = {}) {
	        return new PerformanceAdvisor(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.severity = source["severity"];
	        this.category = source["category"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.queryId = source["queryId"];
	        this.queryText = source["queryText"];
	        this.metricValue = source["metricValue"];
	        this.timestamp = source["timestamp"];
	        this.planXml = source["planXml"];
	        this.recommendation = source["recommendation"];
	    }
	}
	export class PgColumnPrivilege {
	    tableSchema: string;
	    tableName: string;
	    columnName: string;
	    grantee: string;
	    privilegeType: string;
	    isGrantable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PgColumnPrivilege(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tableSchema = source["tableSchema"];
	        this.tableName = source["tableName"];
	        this.columnName = source["columnName"];
	        this.grantee = source["grantee"];
	        this.privilegeType = source["privilegeType"];
	        this.isGrantable = source["isGrantable"];
	    }
	}
	export class PgExtensionEntry {
	    name: string;
	    version: string;
	    schema: string;
	    relocatable: boolean;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new PgExtensionEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.version = source["version"];
	        this.schema = source["schema"];
	        this.relocatable = source["relocatable"];
	        this.description = source["description"];
	    }
	}
	export class PgDbRoleSettingEntry {
	    databaseName: string;
	    roleName: string;
	    name: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new PgDbRoleSettingEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.databaseName = source["databaseName"];
	        this.roleName = source["roleName"];
	        this.name = source["name"];
	        this.value = source["value"];
	    }
	}
	export class PgIdentMappingEntry {
	    mapNumber: number;
	    fileName: string;
	    lineNumber: number;
	    mapName: string;
	    sysName: string;
	    pgUsername: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new PgIdentMappingEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mapNumber = source["mapNumber"];
	        this.fileName = source["fileName"];
	        this.lineNumber = source["lineNumber"];
	        this.mapName = source["mapName"];
	        this.sysName = source["sysName"];
	        this.pgUsername = source["pgUsername"];
	        this.error = source["error"];
	    }
	}
	export class PgHbaRuleEntry {
	    lineNumber: number;
	    type: string;
	    database: string;
	    userName: string;
	    address: string;
	    netmask: string;
	    authMethod: string;
	    options: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new PgHbaRuleEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lineNumber = source["lineNumber"];
	        this.type = source["type"];
	        this.database = source["database"];
	        this.userName = source["userName"];
	        this.address = source["address"];
	        this.netmask = source["netmask"];
	        this.authMethod = source["authMethod"];
	        this.options = source["options"];
	        this.error = source["error"];
	    }
	}
	export class PgFileSettingEntry {
	    sourceFile: string;
	    seqNo: number;
	    sourceLine: number;
	    name: string;
	    setting: string;
	    applied: boolean;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new PgFileSettingEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourceFile = source["sourceFile"];
	        this.seqNo = source["seqNo"];
	        this.sourceLine = source["sourceLine"];
	        this.name = source["name"];
	        this.setting = source["setting"];
	        this.applied = source["applied"];
	        this.error = source["error"];
	    }
	}
	export class PgSettingEntry {
	    name: string;
	    setting: string;
	    formattedValue: string;
	    unit: string;
	    category: string;
	    shortDesc: string;
	    context: string;
	    varType: string;
	    source: string;
	    sourceFile: string;
	    sourceLine: number;
	    bootVal: string;
	    resetVal: string;
	    pendingRestart: boolean;
	    isModified: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PgSettingEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.setting = source["setting"];
	        this.formattedValue = source["formattedValue"];
	        this.unit = source["unit"];
	        this.category = source["category"];
	        this.shortDesc = source["shortDesc"];
	        this.context = source["context"];
	        this.varType = source["varType"];
	        this.source = source["source"];
	        this.sourceFile = source["sourceFile"];
	        this.sourceLine = source["sourceLine"];
	        this.bootVal = source["bootVal"];
	        this.resetVal = source["resetVal"];
	        this.pendingRestart = source["pendingRestart"];
	        this.isModified = source["isModified"];
	    }
	}
	export class PgConfigReport {
	    currentUser: string;
	    isSuperuser: boolean;
	    canReadAll: boolean;
	    serverVersion: string;
	    configFile: string;
	    hbaFile: string;
	    identFile: string;
	    dataDirectory: string;
	    totalSettings: number;
	    modifiedCount: number;
	    pendingRestartCount: number;
	    settings: PgSettingEntry[];
	    fileSettings: PgFileSettingEntry[];
	    fileSettingsError?: string;
	    hbaRules: PgHbaRuleEntry[];
	    hbaError?: string;
	    identMappings: PgIdentMappingEntry[];
	    identError?: string;
	    dbRoleSettings: PgDbRoleSettingEntry[];
	    extensions: PgExtensionEntry[];
	    fetchedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new PgConfigReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentUser = source["currentUser"];
	        this.isSuperuser = source["isSuperuser"];
	        this.canReadAll = source["canReadAll"];
	        this.serverVersion = source["serverVersion"];
	        this.configFile = source["configFile"];
	        this.hbaFile = source["hbaFile"];
	        this.identFile = source["identFile"];
	        this.dataDirectory = source["dataDirectory"];
	        this.totalSettings = source["totalSettings"];
	        this.modifiedCount = source["modifiedCount"];
	        this.pendingRestartCount = source["pendingRestartCount"];
	        this.settings = this.convertValues(source["settings"], PgSettingEntry);
	        this.fileSettings = this.convertValues(source["fileSettings"], PgFileSettingEntry);
	        this.fileSettingsError = source["fileSettingsError"];
	        this.hbaRules = this.convertValues(source["hbaRules"], PgHbaRuleEntry);
	        this.hbaError = source["hbaError"];
	        this.identMappings = this.convertValues(source["identMappings"], PgIdentMappingEntry);
	        this.identError = source["identError"];
	        this.dbRoleSettings = this.convertValues(source["dbRoleSettings"], PgDbRoleSettingEntry);
	        this.extensions = this.convertValues(source["extensions"], PgExtensionEntry);
	        this.fetchedAt = source["fetchedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PgDatabasePrivilege {
	    databaseName: string;
	    grantee: string;
	    grantor: string;
	    privilegeType: string;
	    isGrantable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PgDatabasePrivilege(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.databaseName = source["databaseName"];
	        this.grantee = source["grantee"];
	        this.grantor = source["grantor"];
	        this.privilegeType = source["privilegeType"];
	        this.isGrantable = source["isGrantable"];
	    }
	}
	
	export class PgDefaultPrivilege {
	    forRole: string;
	    inSchema?: string;
	    objectType: string;
	    grantee: string;
	    privilege: string;
	    isGrantable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PgDefaultPrivilege(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.forRole = source["forRole"];
	        this.inSchema = source["inSchema"];
	        this.objectType = source["objectType"];
	        this.grantee = source["grantee"];
	        this.privilege = source["privilege"];
	        this.isGrantable = source["isGrantable"];
	    }
	}
	
	
	export class PgForeignDataWrapper {
	    name: string;
	    owner: string;
	    handler?: string;
	    validator?: string;
	    acl: string[];
	
	    static createFrom(source: any = {}) {
	        return new PgForeignDataWrapper(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.owner = source["owner"];
	        this.handler = source["handler"];
	        this.validator = source["validator"];
	        this.acl = source["acl"];
	    }
	}
	export class PgForeignServer {
	    oid: number;
	    name: string;
	    fdwName: string;
	    type?: string;
	    version?: string;
	    options: Record<string, string>;
	    acl: string[];
	
	    static createFrom(source: any = {}) {
	        return new PgForeignServer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.oid = source["oid"];
	        this.name = source["name"];
	        this.fdwName = source["fdwName"];
	        this.type = source["type"];
	        this.version = source["version"];
	        this.options = source["options"];
	        this.acl = source["acl"];
	    }
	}
	
	
	export class PgObjectPrivilege {
	    objectSchema: string;
	    objectName: string;
	    objectType: string;
	    grantee: string;
	    grantor: string;
	    privilegeType: string;
	    isGrantable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PgObjectPrivilege(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.objectSchema = source["objectSchema"];
	        this.objectName = source["objectName"];
	        this.objectType = source["objectType"];
	        this.grantee = source["grantee"];
	        this.grantor = source["grantor"];
	        this.privilegeType = source["privilegeType"];
	        this.isGrantable = source["isGrantable"];
	    }
	}
	export class PgQueryResult {
	    columns: string[];
	    rows: any[][];
	    rowsAffected: number;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new PgQueryResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.columns = source["columns"];
	        this.rows = source["rows"];
	        this.rowsAffected = source["rowsAffected"];
	        this.error = source["error"];
	    }
	}
	export class PgRLSPolicy {
	    policyName: string;
	    tableSchema: string;
	    tableName: string;
	    command: string;
	    permissive: boolean;
	    roles: string[];
	    usingExpr?: string;
	    checkExpr?: string;
	
	    static createFrom(source: any = {}) {
	        return new PgRLSPolicy(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.policyName = source["policyName"];
	        this.tableSchema = source["tableSchema"];
	        this.tableName = source["tableName"];
	        this.command = source["command"];
	        this.permissive = source["permissive"];
	        this.roles = source["roles"];
	        this.usingExpr = source["usingExpr"];
	        this.checkExpr = source["checkExpr"];
	    }
	}
	export class PgRLSTableStatus {
	    tableSchema: string;
	    tableName: string;
	    rlsEnabled: boolean;
	    forceRLS: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PgRLSTableStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tableSchema = source["tableSchema"];
	        this.tableName = source["tableName"];
	        this.rlsEnabled = source["rlsEnabled"];
	        this.forceRLS = source["forceRLS"];
	    }
	}
	export class PgSecurableObject {
	    schema: string;
	    name: string;
	    objectType: string;
	    owner: string;
	
	    static createFrom(source: any = {}) {
	        return new PgSecurableObject(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schema = source["schema"];
	        this.name = source["name"];
	        this.objectType = source["objectType"];
	        this.owner = source["owner"];
	    }
	}
	export class PgSecurableCatalog {
	    databases: string[];
	    schemas: string[];
	    tables: PgSecurableObject[];
	    sequences: PgSecurableObject[];
	    functions: PgSecurableObject[];
	
	    static createFrom(source: any = {}) {
	        return new PgSecurableCatalog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.databases = source["databases"];
	        this.schemas = source["schemas"];
	        this.tables = this.convertValues(source["tables"], PgSecurableObject);
	        this.sequences = this.convertValues(source["sequences"], PgSecurableObject);
	        this.functions = this.convertValues(source["functions"], PgSecurableObject);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PgRole {
	    name: string;
	    oid: number;
	    isSuperuser: boolean;
	    inheritPrivs: boolean;
	    canCreateRole: boolean;
	    canCreateDB: boolean;
	    canLogin: boolean;
	    isReplication: boolean;
	    bypassRLS: boolean;
	    connLimit: number;
	    validUntil?: string;
	    memberOf: string[];
	    members: string[];
	    isPredefined: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PgRole(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.oid = source["oid"];
	        this.isSuperuser = source["isSuperuser"];
	        this.inheritPrivs = source["inheritPrivs"];
	        this.canCreateRole = source["canCreateRole"];
	        this.canCreateDB = source["canCreateDB"];
	        this.canLogin = source["canLogin"];
	        this.isReplication = source["isReplication"];
	        this.bypassRLS = source["bypassRLS"];
	        this.connLimit = source["connLimit"];
	        this.validUntil = source["validUntil"];
	        this.memberOf = source["memberOf"];
	        this.members = source["members"];
	        this.isPredefined = source["isPredefined"];
	    }
	}
	export class PgRbacOverview {
	    roles: PgRole[];
	    fdws: PgForeignDataWrapper[];
	    servers: PgForeignServer[];
	    catalog?: PgSecurableCatalog;
	
	    static createFrom(source: any = {}) {
	        return new PgRbacOverview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.roles = this.convertValues(source["roles"], PgRole);
	        this.fdws = this.convertValues(source["fdws"], PgForeignDataWrapper);
	        this.servers = this.convertValues(source["servers"], PgForeignServer);
	        this.catalog = this.convertValues(source["catalog"], PgSecurableCatalog);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class PgRoleParamSetting {
	    roleName: string;
	    database?: string;
	    paramName: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new PgRoleParamSetting(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.roleName = source["roleName"];
	        this.database = source["database"];
	        this.paramName = source["paramName"];
	        this.value = source["value"];
	    }
	}
	export class PgSchemaPrivilege {
	    schemaName: string;
	    grantee: string;
	    grantor: string;
	    privilegeType: string;
	    isGrantable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PgSchemaPrivilege(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schemaName = source["schemaName"];
	        this.grantee = source["grantee"];
	        this.grantor = source["grantor"];
	        this.privilegeType = source["privilegeType"];
	        this.isGrantable = source["isGrantable"];
	    }
	}
	
	
	
	export class PgUserMapping {
	    serverName: string;
	    localRole: string;
	    options: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new PgUserMapping(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverName = source["serverName"];
	        this.localRole = source["localRole"];
	        this.options = source["options"];
	    }
	}
	export class QueryStoreDiagnostic {
	    currentDb: string;
	    isQueryStoreOn: boolean;
	    qsDesiredState: string;
	    qsActualState: string;
	    qsRuntimeStatsRows: number;
	    qsWindowRows: number;
	    dmvPlanCacheRows: number;
	    dmvWindowRows: number;
	    qsError?: string;
	    dmvError?: string;
	    sqlServerVersion: string;
	
	    static createFrom(source: any = {}) {
	        return new QueryStoreDiagnostic(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentDb = source["currentDb"];
	        this.isQueryStoreOn = source["isQueryStoreOn"];
	        this.qsDesiredState = source["qsDesiredState"];
	        this.qsActualState = source["qsActualState"];
	        this.qsRuntimeStatsRows = source["qsRuntimeStatsRows"];
	        this.qsWindowRows = source["qsWindowRows"];
	        this.dmvPlanCacheRows = source["dmvPlanCacheRows"];
	        this.dmvWindowRows = source["dmvWindowRows"];
	        this.qsError = source["qsError"];
	        this.dmvError = source["dmvError"];
	        this.sqlServerVersion = source["sqlServerVersion"];
	    }
	}
	export class QueryStoreEntry {
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
	
	    static createFrom(source: any = {}) {
	        return new QueryStoreEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.queryId = source["queryId"];
	        this.planId = source["planId"];
	        this.queryHash = source["queryHash"];
	        this.planHash = source["planHash"];
	        this.moduleName = source["moduleName"];
	        this.queryText = source["queryText"];
	        this.executionCount = source["executionCount"];
	        this.totalCpuMs = source["totalCpuMs"];
	        this.avgCpuMs = source["avgCpuMs"];
	        this.totalDurationMs = source["totalDurationMs"];
	        this.avgDurationMs = source["avgDurationMs"];
	        this.totalLogicalReads = source["totalLogicalReads"];
	        this.avgLogicalReads = source["avgLogicalReads"];
	        this.totalPhysicalReads = source["totalPhysicalReads"];
	        this.avgPhysicalReads = source["avgPhysicalReads"];
	        this.totalWrites = source["totalWrites"];
	        this.avgWrites = source["avgWrites"];
	        this.totalMemoryMb = source["totalMemoryMb"];
	        this.avgMemoryMb = source["avgMemoryMb"];
	        this.totalSpillsMb = source["totalSpillsMb"];
	        this.lastExecutionTime = source["lastExecutionTime"];
	        this.executionType = source["executionType"];
	        this.waitProfile = source["waitProfile"];
	        this.planXml = source["planXml"];
	    }
	}
	
	export class SecurityAuditFinding {
	    checkName: string;
	    severity: string;
	    title: string;
	    description: string;
	    affectedItems: string[];
	    fixDDL: string;
	
	    static createFrom(source: any = {}) {
	        return new SecurityAuditFinding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.checkName = source["checkName"];
	        this.severity = source["severity"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.affectedItems = source["affectedItems"];
	        this.fixDDL = source["fixDDL"];
	    }
	}
	export class ServerVitals {
	    cpuQueueTasks: number;
	    signalWaitPct: number;
	    memoryGrantsPending: number;
	    availableMemoryMb: number;
	    tempDbUserObjectsMb: number;
	    tempDbInternalMb: number;
	    batchRequestsPerSec: number;
	
	    static createFrom(source: any = {}) {
	        return new ServerVitals(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cpuQueueTasks = source["cpuQueueTasks"];
	        this.signalWaitPct = source["signalWaitPct"];
	        this.memoryGrantsPending = source["memoryGrantsPending"];
	        this.availableMemoryMb = source["availableMemoryMb"];
	        this.tempDbUserObjectsMb = source["tempDbUserObjectsMb"];
	        this.tempDbInternalMb = source["tempDbInternalMb"];
	        this.batchRequestsPerSec = source["batchRequestsPerSec"];
	    }
	}
	export class SevenDaySyncResult {
	    serverName: string;
	    databaseName: string;
	    isQueryStoreOn: boolean;
	    intervalsSynced: number;
	    deadlocksSynced: number;
	    message: string;
	    syncedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new SevenDaySyncResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverName = source["serverName"];
	        this.databaseName = source["databaseName"];
	        this.isQueryStoreOn = source["isQueryStoreOn"];
	        this.intervalsSynced = source["intervalsSynced"];
	        this.deadlocksSynced = source["deadlocksSynced"];
	        this.message = source["message"];
	        this.syncedAt = source["syncedAt"];
	    }
	}
	export class SqlDatabaseFileEntry {
	    databaseName: string;
	    fileId: number;
	    logicalName: string;
	    fileType: string;
	    physicalPath: string;
	    sizeMb: number;
	    growthDesc: string;
	    maxSizeDesc: string;
	    stateDesc: string;
	
	    static createFrom(source: any = {}) {
	        return new SqlDatabaseFileEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.databaseName = source["databaseName"];
	        this.fileId = source["fileId"];
	        this.logicalName = source["logicalName"];
	        this.fileType = source["fileType"];
	        this.physicalPath = source["physicalPath"];
	        this.sizeMb = source["sizeMb"];
	        this.growthDesc = source["growthDesc"];
	        this.maxSizeDesc = source["maxSizeDesc"];
	        this.stateDesc = source["stateDesc"];
	    }
	}
	export class SqlDatabaseOptionEntry {
	    name: string;
	    value: string;
	    category: string;
	    status: string;
	    description: string;
	    minVersion?: string;
	    versionComment?: string;
	    alterTsql?: string;
	
	    static createFrom(source: any = {}) {
	        return new SqlDatabaseOptionEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.value = source["value"];
	        this.category = source["category"];
	        this.status = source["status"];
	        this.description = source["description"];
	        this.minVersion = source["minVersion"];
	        this.versionComment = source["versionComment"];
	        this.alterTsql = source["alterTsql"];
	    }
	}
	export class SqlScopedConfigEntry {
	    configId: number;
	    name: string;
	    value: string;
	    valueForSecondary: string;
	    isDefault: boolean;
	    description: string;
	    minVersion?: string;
	    versionComment?: string;
	    isUnsupported: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SqlScopedConfigEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.configId = source["configId"];
	        this.name = source["name"];
	        this.value = source["value"];
	        this.valueForSecondary = source["valueForSecondary"];
	        this.isDefault = source["isDefault"];
	        this.description = source["description"];
	        this.minVersion = source["minVersion"];
	        this.versionComment = source["versionComment"];
	        this.isUnsupported = source["isUnsupported"];
	    }
	}
	export class SqlServerConfigEntry {
	    configId: number;
	    name: string;
	    value: string;
	    valueInUse: string;
	    minimum: string;
	    maximum: string;
	    description: string;
	    isDynamic: boolean;
	    isAdvanced: boolean;
	    isModified: boolean;
	    pendingAction: string;
	    category: string;
	    bestPracticeNote?: string;
	    minVersion?: string;
	    versionComment?: string;
	    isUnsupported: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SqlServerConfigEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.configId = source["configId"];
	        this.name = source["name"];
	        this.value = source["value"];
	        this.valueInUse = source["valueInUse"];
	        this.minimum = source["minimum"];
	        this.maximum = source["maximum"];
	        this.description = source["description"];
	        this.isDynamic = source["isDynamic"];
	        this.isAdvanced = source["isAdvanced"];
	        this.isModified = source["isModified"];
	        this.pendingAction = source["pendingAction"];
	        this.category = source["category"];
	        this.bestPracticeNote = source["bestPracticeNote"];
	        this.minVersion = source["minVersion"];
	        this.versionComment = source["versionComment"];
	        this.isUnsupported = source["isUnsupported"];
	    }
	}
	export class SqlTraceFlagEntry {
	    traceFlag: number;
	    status: number;
	    global: number;
	    session: number;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new SqlTraceFlagEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.traceFlag = source["traceFlag"];
	        this.status = source["status"];
	        this.global = source["global"];
	        this.session = source["session"];
	        this.description = source["description"];
	    }
	}
	export class SqlServerConfigReport {
	    serverName: string;
	    databaseName: string;
	    productVersion: string;
	    productLevel: string;
	    edition: string;
	    majorVersion: number;
	    majorYearLabel: string;
	    compatibilityLevel: number;
	    cpuCount: number;
	    physicalMemoryMb: number;
	    collation: string;
	    totalInstanceConfigs: number;
	    modifiedInstanceCount: number;
	    pendingReconfigureCount: number;
	    instanceConfigs: SqlServerConfigEntry[];
	    scopedConfigs: SqlScopedConfigEntry[];
	    databaseOptions: SqlDatabaseOptionEntry[];
	    databaseFiles: SqlDatabaseFileEntry[];
	    traceFlags: SqlTraceFlagEntry[];
	    traceFlagsError?: string;
	    fetchedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new SqlServerConfigReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverName = source["serverName"];
	        this.databaseName = source["databaseName"];
	        this.productVersion = source["productVersion"];
	        this.productLevel = source["productLevel"];
	        this.edition = source["edition"];
	        this.majorVersion = source["majorVersion"];
	        this.majorYearLabel = source["majorYearLabel"];
	        this.compatibilityLevel = source["compatibilityLevel"];
	        this.cpuCount = source["cpuCount"];
	        this.physicalMemoryMb = source["physicalMemoryMb"];
	        this.collation = source["collation"];
	        this.totalInstanceConfigs = source["totalInstanceConfigs"];
	        this.modifiedInstanceCount = source["modifiedInstanceCount"];
	        this.pendingReconfigureCount = source["pendingReconfigureCount"];
	        this.instanceConfigs = this.convertValues(source["instanceConfigs"], SqlServerConfigEntry);
	        this.scopedConfigs = this.convertValues(source["scopedConfigs"], SqlScopedConfigEntry);
	        this.databaseOptions = this.convertValues(source["databaseOptions"], SqlDatabaseOptionEntry);
	        this.databaseFiles = this.convertValues(source["databaseFiles"], SqlDatabaseFileEntry);
	        this.traceFlags = this.convertValues(source["traceFlags"], SqlTraceFlagEntry);
	        this.traceFlagsError = source["traceFlagsError"];
	        this.fetchedAt = source["fetchedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class UnusedIndex {
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
	
	    static createFrom(source: any = {}) {
	        return new UnusedIndex(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.databaseName = source["databaseName"];
	        this.schemaName = source["schemaName"];
	        this.tableName = source["tableName"];
	        this.indexName = source["indexName"];
	        this.indexType = source["indexType"];
	        this.indexSizeMb = source["indexSizeMb"];
	        this.userWrites = source["userWrites"];
	        this.userSeeks = source["userSeeks"];
	        this.userScans = source["userScans"];
	        this.userLookups = source["userLookups"];
	        this.dropStatement = source["dropStatement"];
	    }
	}
	export class WaitTimeHistoryPoint {
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
	
	    static createFrom(source: any = {}) {
	        return new WaitTimeHistoryPoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.intervalLabel = source["intervalLabel"];
	        this.totalWaitMs = source["totalWaitMs"];
	        this.cpuWaitMs = source["cpuWaitMs"];
	        this.lockWaitMs = source["lockWaitMs"];
	        this.ioWaitMs = source["ioWaitMs"];
	        this.memoryWaitMs = source["memoryWaitMs"];
	        this.otherWaitMs = source["otherWaitMs"];
	        this.executionCount = source["executionCount"];
	        this.isAnomaly = source["isAnomaly"];
	        this.anomalyReason = source["anomalyReason"];
	    }
	}

}

export namespace main {
	
	export class SelectedPlanFile {
	    path: string;
	    name: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new SelectedPlanFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.content = source["content"];
	    }
	}
	export class WindowsUserInfo {
	    username: string;
	    domain: string;
	    fullAccount: string;
	
	    static createFrom(source: any = {}) {
	        return new WindowsUserInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.username = source["username"];
	        this.domain = source["domain"];
	        this.fullAccount = source["fullAccount"];
	    }
	}

}

export namespace pgbackup {
	
	export class PgTableMeta {
	    schema: string;
	    name: string;
	    objectType: string;
	    tablespace: string;
	    owner: string;
	    sizeBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new PgTableMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schema = source["schema"];
	        this.name = source["name"];
	        this.objectType = source["objectType"];
	        this.tablespace = source["tablespace"];
	        this.owner = source["owner"];
	        this.sizeBytes = source["sizeBytes"];
	    }
	}
	export class PgTablespaceMeta {
	    name: string;
	    owner: string;
	    location: string;
	    sizeBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new PgTablespaceMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.owner = source["owner"];
	        this.location = source["location"];
	        this.sizeBytes = source["sizeBytes"];
	    }
	}
	export class PgDatabaseMeta {
	    name: string;
	    owner: string;
	    encoding: string;
	    tablespace: string;
	    sizeBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new PgDatabaseMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.owner = source["owner"];
	        this.encoding = source["encoding"];
	        this.tablespace = source["tablespace"];
	        this.sizeBytes = source["sizeBytes"];
	    }
	}
	export class BackupCatalog {
	    databases: PgDatabaseMeta[];
	    tablespaces: PgTablespaceMeta[];
	    schemas: string[];
	    tables: PgTableMeta[];
	    extensions: string[];
	    activeDatabase: string;
	    serverVersionNum: number;
	    serverVersion: string;
	
	    static createFrom(source: any = {}) {
	        return new BackupCatalog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.databases = this.convertValues(source["databases"], PgDatabaseMeta);
	        this.tablespaces = this.convertValues(source["tablespaces"], PgTablespaceMeta);
	        this.schemas = source["schemas"];
	        this.tables = this.convertValues(source["tables"], PgTableMeta);
	        this.extensions = source["extensions"];
	        this.activeDatabase = source["activeDatabase"];
	        this.serverVersionNum = source["serverVersionNum"];
	        this.serverVersion = source["serverVersion"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BackupCommandPreview {
	    command: string;
	    args: string[];
	    displayCommand: string;
	    warnings: string[];
	
	    static createFrom(source: any = {}) {
	        return new BackupCommandPreview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.command = source["command"];
	        this.args = source["args"];
	        this.displayCommand = source["displayCommand"];
	        this.warnings = source["warnings"];
	    }
	}
	export class BackupFilterRule {
	    action: string;
	    objectType: string;
	    pattern: string;
	
	    static createFrom(source: any = {}) {
	        return new BackupFilterRule(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.action = source["action"];
	        this.objectType = source["objectType"];
	        this.pattern = source["pattern"];
	    }
	}
	export class ChecksumVerifyResult {
	    targetPath: string;
	    sidecarPath: string;
	    expected: string;
	    actual: string;
	    matched: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new ChecksumVerifyResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.targetPath = source["targetPath"];
	        this.sidecarPath = source["sidecarPath"];
	        this.expected = source["expected"];
	        this.actual = source["actual"];
	        this.matched = source["matched"];
	        this.message = source["message"];
	    }
	}
	export class DirectCloneRequest {
	    sourceDatabase: string;
	    targetProfileId: string;
	    targetDatabase: string;
	    createTargetDb: boolean;
	    clean: boolean;
	    noOwner: boolean;
	    noPrivileges: boolean;
	    contentMode: string;
	    schemas: string[];
	    tables: string[];
	    runAnalyzeAfter: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DirectCloneRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourceDatabase = source["sourceDatabase"];
	        this.targetProfileId = source["targetProfileId"];
	        this.targetDatabase = source["targetDatabase"];
	        this.createTargetDb = source["createTargetDb"];
	        this.clean = source["clean"];
	        this.noOwner = source["noOwner"];
	        this.noPrivileges = source["noPrivileges"];
	        this.contentMode = source["contentMode"];
	        this.schemas = source["schemas"];
	        this.tables = source["tables"];
	        this.runAnalyzeAfter = source["runAnalyzeAfter"];
	    }
	}
	export class DiskSpaceInfo {
	    path: string;
	    freeBytes: number;
	    totalBytes: number;
	    estimatedBytes: number;
	    sufficient: boolean;
	    warning?: string;
	
	    static createFrom(source: any = {}) {
	        return new DiskSpaceInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.freeBytes = source["freeBytes"];
	        this.totalBytes = source["totalBytes"];
	        this.estimatedBytes = source["estimatedBytes"];
	        this.sufficient = source["sufficient"];
	        this.warning = source["warning"];
	    }
	}
	export class LogicalBackupRequest {
	    mode: string;
	    database: string;
	    databases: string[];
	    includeGlobals: boolean;
	    schemas: string[];
	    excludeSchemas: string[];
	    tables: string[];
	    excludeTables: string[];
	    excludeTableData: string[];
	    tablespaces: string[];
	    contentMode: string;
	    sections: string[];
	    format: string;
	    compression: string;
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
	
	    static createFrom(source: any = {}) {
	        return new LogicalBackupRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.database = source["database"];
	        this.databases = source["databases"];
	        this.includeGlobals = source["includeGlobals"];
	        this.schemas = source["schemas"];
	        this.excludeSchemas = source["excludeSchemas"];
	        this.tables = source["tables"];
	        this.excludeTables = source["excludeTables"];
	        this.excludeTableData = source["excludeTableData"];
	        this.tablespaces = source["tablespaces"];
	        this.contentMode = source["contentMode"];
	        this.sections = source["sections"];
	        this.format = source["format"];
	        this.compression = source["compression"];
	        this.compressionLevel = source["compressionLevel"];
	        this.parallelJobs = source["parallelJobs"];
	        this.outputPath = source["outputPath"];
	        this.clean = source["clean"];
	        this.ifExists = source["ifExists"];
	        this.createDb = source["createDb"];
	        this.noOwner = source["noOwner"];
	        this.noPrivileges = source["noPrivileges"];
	        this.noTablespaces = source["noTablespaces"];
	        this.includeBlobs = source["includeBlobs"];
	        this.inserts = source["inserts"];
	        this.columnInserts = source["columnInserts"];
	        this.rowsPerInsert = source["rowsPerInsert"];
	        this.lockWaitTimeout = source["lockWaitTimeout"];
	        this.encoding = source["encoding"];
	        this.includeStatistics = source["includeStatistics"];
	        this.noStatistics = source["noStatistics"];
	        this.excludeDatabases = source["excludeDatabases"];
	        this.filterRules = this.convertValues(source["filterRules"], BackupFilterRule);
	        this.generateChecksum = source["generateChecksum"];
	        this.extraArgs = source["extraArgs"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MultiDbManifestEntry {
	    database: string;
	    format: string;
	    outputPath: string;
	
	    static createFrom(source: any = {}) {
	        return new MultiDbManifestEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.database = source["database"];
	        this.format = source["format"];
	        this.outputPath = source["outputPath"];
	    }
	}
	export class MultiDbManifest {
	    createdAt: string;
	    server: string;
	    globalsFile?: string;
	    format: string;
	    entries: MultiDbManifestEntry[];
	
	    static createFrom(source: any = {}) {
	        return new MultiDbManifest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.createdAt = source["createdAt"];
	        this.server = source["server"];
	        this.globalsFile = source["globalsFile"];
	        this.format = source["format"];
	        this.entries = this.convertValues(source["entries"], MultiDbManifestEntry);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	export class TablespaceMapping {
	    oldDir: string;
	    newDir: string;
	
	    static createFrom(source: any = {}) {
	        return new TablespaceMapping(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.oldDir = source["oldDir"];
	        this.newDir = source["newDir"];
	    }
	}
	export class PhysicalBackupRequest {
	    operation: string;
	    outputDir: string;
	    format: string;
	    walMethod: string;
	    checkpoint: string;
	    compression: string;
	    compressionLevel: number;
	    maxRate: string;
	    manifestChecksums: string;
	    tablespaceMappings: TablespaceMapping[];
	    incrementalManifestPath: string;
	    combineSourceDirs: string[];
	    verifyBackupDir: string;
	    verifyNoParseWals: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PhysicalBackupRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.operation = source["operation"];
	        this.outputDir = source["outputDir"];
	        this.format = source["format"];
	        this.walMethod = source["walMethod"];
	        this.checkpoint = source["checkpoint"];
	        this.compression = source["compression"];
	        this.compressionLevel = source["compressionLevel"];
	        this.maxRate = source["maxRate"];
	        this.manifestChecksums = source["manifestChecksums"];
	        this.tablespaceMappings = this.convertValues(source["tablespaceMappings"], TablespaceMapping);
	        this.incrementalManifestPath = source["incrementalManifestPath"];
	        this.combineSourceDirs = source["combineSourceDirs"];
	        this.verifyBackupDir = source["verifyBackupDir"];
	        this.verifyNoParseWals = source["verifyNoParseWals"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PitrStatus {
	    walLevel: string;
	    archiveMode: string;
	    archiveCommand: string;
	    archivedCount: number;
	    failedCount: number;
	    lastArchivedWal: string;
	    lastArchivedTime: string;
	    lastFailedWal: string;
	    lastFailedTime: string;
	
	    static createFrom(source: any = {}) {
	        return new PitrStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.walLevel = source["walLevel"];
	        this.archiveMode = source["archiveMode"];
	        this.archiveCommand = source["archiveCommand"];
	        this.archivedCount = source["archivedCount"];
	        this.failedCount = source["failedCount"];
	        this.lastArchivedWal = source["lastArchivedWal"];
	        this.lastArchivedTime = source["lastArchivedTime"];
	        this.lastFailedWal = source["lastFailedWal"];
	        this.lastFailedTime = source["lastFailedTime"];
	    }
	}
	export class RestoreRequest {
	    sourcePath: string;
	    sourceKind: string;
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
	    contentMode: string;
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
	
	    static createFrom(source: any = {}) {
	        return new RestoreRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourcePath = source["sourcePath"];
	        this.sourceKind = source["sourceKind"];
	        this.targetDatabase = source["targetDatabase"];
	        this.createDb = source["createDb"];
	        this.clean = source["clean"];
	        this.ifExists = source["ifExists"];
	        this.singleTransaction = source["singleTransaction"];
	        this.exitOnError = source["exitOnError"];
	        this.parallelJobs = source["parallelJobs"];
	        this.noOwner = source["noOwner"];
	        this.noPrivileges = source["noPrivileges"];
	        this.noTablespaces = source["noTablespaces"];
	        this.contentMode = source["contentMode"];
	        this.sections = source["sections"];
	        this.schemas = source["schemas"];
	        this.tables = source["tables"];
	        this.disableTriggers = source["disableTriggers"];
	        this.includeStatistics = source["includeStatistics"];
	        this.noStatistics = source["noStatistics"];
	        this.selectedTocIds = source["selectedTocIds"];
	        this.selectedDatabases = source["selectedDatabases"];
	        this.restoreGlobals = source["restoreGlobals"];
	        this.boostRestore = source["boostRestore"];
	        this.boostMem = source["boostMem"];
	        this.runAnalyzeAfter = source["runAnalyzeAfter"];
	        this.extraArgs = source["extraArgs"];
	    }
	}
	export class ScriptExportRequest {
	    targetOs: string;
	    retentionDays: number;
	    includeSha256: boolean;
	    outputPath: string;
	    database: string;
	    mode: string;
	    format: string;
	
	    static createFrom(source: any = {}) {
	        return new ScriptExportRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.targetOs = source["targetOs"];
	        this.retentionDays = source["retentionDays"];
	        this.includeSha256 = source["includeSha256"];
	        this.outputPath = source["outputPath"];
	        this.database = source["database"];
	        this.mode = source["mode"];
	        this.format = source["format"];
	    }
	}
	
	export class TocEntry {
	    id: number;
	    section: string;
	    objectType: string;
	    schema: string;
	    name: string;
	    owner: string;
	    rawLine: string;
	
	    static createFrom(source: any = {}) {
	        return new TocEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.section = source["section"];
	        this.objectType = source["objectType"];
	        this.schema = source["schema"];
	        this.name = source["name"];
	        this.owner = source["owner"];
	        this.rawLine = source["rawLine"];
	    }
	}
	export class ToolBinaryInfo {
	    name: string;
	    path: string;
	    available: boolean;
	    majorVersion: number;
	    versionRaw: string;
	
	    static createFrom(source: any = {}) {
	        return new ToolBinaryInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.available = source["available"];
	        this.majorVersion = source["majorVersion"];
	        this.versionRaw = source["versionRaw"];
	    }
	}
	export class ToolchainCapabilities {
	    supportsZstdLz4: boolean;
	    supportsIncremental: boolean;
	    supportsFilterFile: boolean;
	    supportsNonTextDumpall: boolean;
	    supportsStatisticsFlags: boolean;
	    forwardCompatiblePg19: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ToolchainCapabilities(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.supportsZstdLz4 = source["supportsZstdLz4"];
	        this.supportsIncremental = source["supportsIncremental"];
	        this.supportsFilterFile = source["supportsFilterFile"];
	        this.supportsNonTextDumpall = source["supportsNonTextDumpall"];
	        this.supportsStatisticsFlags = source["supportsStatisticsFlags"];
	        this.forwardCompatiblePg19 = source["forwardCompatiblePg19"];
	    }
	}
	export class ToolchainInfo {
	    binDir: string;
	    customBinDir: string;
	    source: string;
	    clientMajorVersion: number;
	    clientVersionRaw: string;
	    serverMajorVersion: number;
	    serverVersionRaw: string;
	    compatible: boolean;
	    compatibilityWarning?: string;
	    hostOs: string;
	    cpuCount: number;
	    recommendedJobs: number;
	    tools: Record<string, ToolBinaryInfo>;
	    capabilities: ToolchainCapabilities;
	
	    static createFrom(source: any = {}) {
	        return new ToolchainInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.binDir = source["binDir"];
	        this.customBinDir = source["customBinDir"];
	        this.source = source["source"];
	        this.clientMajorVersion = source["clientMajorVersion"];
	        this.clientVersionRaw = source["clientVersionRaw"];
	        this.serverMajorVersion = source["serverMajorVersion"];
	        this.serverVersionRaw = source["serverVersionRaw"];
	        this.compatible = source["compatible"];
	        this.compatibilityWarning = source["compatibilityWarning"];
	        this.hostOs = source["hostOs"];
	        this.cpuCount = source["cpuCount"];
	        this.recommendedJobs = source["recommendedJobs"];
	        this.tools = this.convertValues(source["tools"], ToolBinaryInfo, true);
	        this.capabilities = this.convertValues(source["capabilities"], ToolchainCapabilities);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace sqlplan {
	
	export class AdaptiveJoinFinding {
	    statementId: string;
	    nodeId: number;
	    thresholdRows: number;
	    hasThreshold: boolean;
	    estimatedJoinType: string;
	    actualJoinType: string;
	    estimateRows: number;
	    actualRows: number;
	    hasActualRows: boolean;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new AdaptiveJoinFinding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statementId = source["statementId"];
	        this.nodeId = source["nodeId"];
	        this.thresholdRows = source["thresholdRows"];
	        this.hasThreshold = source["hasThreshold"];
	        this.estimatedJoinType = source["estimatedJoinType"];
	        this.actualJoinType = source["actualJoinType"];
	        this.estimateRows = source["estimateRows"];
	        this.actualRows = source["actualRows"];
	        this.hasActualRows = source["hasActualRows"];
	        this.description = source["description"];
	    }
	}
	export class IQPFeature {
	    name: string;
	    status: string;
	    detail: string;
	
	    static createFrom(source: any = {}) {
	        return new IQPFeature(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.status = source["status"];
	        this.detail = source["detail"];
	    }
	}
	export class AdaptiveProcessing {
	    adaptiveJoins: AdaptiveJoinFinding[];
	    batchModeOperators: number;
	    totalOperators: number;
	    batchOnRowstore: boolean;
	    features: IQPFeature[];
	    summary: string;
	
	    static createFrom(source: any = {}) {
	        return new AdaptiveProcessing(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.adaptiveJoins = this.convertValues(source["adaptiveJoins"], AdaptiveJoinFinding);
	        this.batchModeOperators = source["batchModeOperators"];
	        this.totalOperators = source["totalOperators"];
	        this.batchOnRowstore = source["batchOnRowstore"];
	        this.features = this.convertValues(source["features"], IQPFeature);
	        this.summary = source["summary"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class HealthScorePillar {
	    id: string;
	    name: string;
	    score: number;
	    maxScore: number;
	    weightPct: number;
	    summary: string;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new HealthScorePillar(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.score = source["score"];
	        this.maxScore = source["maxScore"];
	        this.weightPct = source["weightPct"];
	        this.summary = source["summary"];
	        this.status = source["status"];
	    }
	}
	export class RowGoalFinding {
	    statementId: string;
	    nodeId: number;
	    physicalOp: string;
	    source: string;
	    estimateRows: number;
	    estimateRowsWithoutGoal: number;
	    actualRows: number;
	    hasActualRows: boolean;
	    reductionFactor: number;
	    misfired: boolean;
	    severity: string;
	    description: string;
	    remedy: string;
	
	    static createFrom(source: any = {}) {
	        return new RowGoalFinding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statementId = source["statementId"];
	        this.nodeId = source["nodeId"];
	        this.physicalOp = source["physicalOp"];
	        this.source = source["source"];
	        this.estimateRows = source["estimateRows"];
	        this.estimateRowsWithoutGoal = source["estimateRowsWithoutGoal"];
	        this.actualRows = source["actualRows"];
	        this.hasActualRows = source["hasActualRows"];
	        this.reductionFactor = source["reductionFactor"];
	        this.misfired = source["misfired"];
	        this.severity = source["severity"];
	        this.description = source["description"];
	        this.remedy = source["remedy"];
	    }
	}
	export class NonSargableFinding {
	    statementId: string;
	    nodeId: number;
	    physicalOp: string;
	    table: string;
	    index: string;
	    functions: string[];
	    leadingWildcard: boolean;
	    predicate: string;
	    tableCardinality: number;
	    costPercent: number;
	    severity: string;
	    description: string;
	    remedy: string;
	
	    static createFrom(source: any = {}) {
	        return new NonSargableFinding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statementId = source["statementId"];
	        this.nodeId = source["nodeId"];
	        this.physicalOp = source["physicalOp"];
	        this.table = source["table"];
	        this.index = source["index"];
	        this.functions = source["functions"];
	        this.leadingWildcard = source["leadingWildcard"];
	        this.predicate = source["predicate"];
	        this.tableCardinality = source["tableCardinality"];
	        this.costPercent = source["costPercent"];
	        this.severity = source["severity"];
	        this.description = source["description"];
	        this.remedy = source["remedy"];
	    }
	}
	export class SniffedParameter {
	    name: string;
	    dataType: string;
	    compiledValue: string;
	    runtimeValue: string;
	    hasRuntime: boolean;
	    mismatch: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SniffedParameter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.dataType = source["dataType"];
	        this.compiledValue = source["compiledValue"];
	        this.runtimeValue = source["runtimeValue"];
	        this.hasRuntime = source["hasRuntime"];
	        this.mismatch = source["mismatch"];
	    }
	}
	export class ParameterSniffingFinding {
	    affectedStatements: string[];
	    parameters: SniffedParameter[];
	    hasRuntimeValues: boolean;
	    hasMismatch: boolean;
	    hasEstimateImpact: boolean;
	    mitigation: string;
	    severity: string;
	    description: string;
	    remedy: string;
	
	    static createFrom(source: any = {}) {
	        return new ParameterSniffingFinding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.affectedStatements = source["affectedStatements"];
	        this.parameters = this.convertValues(source["parameters"], SniffedParameter);
	        this.hasRuntimeValues = source["hasRuntimeValues"];
	        this.hasMismatch = source["hasMismatch"];
	        this.hasEstimateImpact = source["hasEstimateImpact"];
	        this.mitigation = source["mitigation"];
	        this.severity = source["severity"];
	        this.description = source["description"];
	        this.remedy = source["remedy"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MissingStatsFinding {
	    statementId: string;
	    nodeId: number;
	    database: string;
	    schema: string;
	    table: string;
	    columns: string[];
	    severity: string;
	    description: string;
	    remedy: string;
	    suggestedDdl: string;
	
	    static createFrom(source: any = {}) {
	        return new MissingStatsFinding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statementId = source["statementId"];
	        this.nodeId = source["nodeId"];
	        this.database = source["database"];
	        this.schema = source["schema"];
	        this.table = source["table"];
	        this.columns = source["columns"];
	        this.severity = source["severity"];
	        this.description = source["description"];
	        this.remedy = source["remedy"];
	        this.suggestedDdl = source["suggestedDdl"];
	    }
	}
	export class SpoolFinding {
	    statementId: string;
	    nodeId: number;
	    physicalOp: string;
	    logicalOp: string;
	    kind: string;
	    purpose: string;
	    table: string;
	    estimateRows: number;
	    estimateRebinds: number;
	    estimateRewinds: number;
	    actualRows: number;
	    actualRebinds: number;
	    actualRewinds: number;
	    hasActualRows: boolean;
	    costPercent: number;
	    severity: string;
	    description: string;
	    remedy: string;
	
	    static createFrom(source: any = {}) {
	        return new SpoolFinding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statementId = source["statementId"];
	        this.nodeId = source["nodeId"];
	        this.physicalOp = source["physicalOp"];
	        this.logicalOp = source["logicalOp"];
	        this.kind = source["kind"];
	        this.purpose = source["purpose"];
	        this.table = source["table"];
	        this.estimateRows = source["estimateRows"];
	        this.estimateRebinds = source["estimateRebinds"];
	        this.estimateRewinds = source["estimateRewinds"];
	        this.actualRows = source["actualRows"];
	        this.actualRebinds = source["actualRebinds"];
	        this.actualRewinds = source["actualRewinds"];
	        this.hasActualRows = source["hasActualRows"];
	        this.costPercent = source["costPercent"];
	        this.severity = source["severity"];
	        this.description = source["description"];
	        this.remedy = source["remedy"];
	    }
	}
	export class KeyLookupFinding {
	    statementId: string;
	    nodeId: number;
	    lookupKind: string;
	    schema: string;
	    table: string;
	    lookupIndex: string;
	    seekIndex: string;
	    estimateRows: number;
	    lookupCount: number;
	    hasActualRows: boolean;
	    costPercent: number;
	    fetchedColumns: string[];
	    includeClause: string;
	    severity: string;
	    description: string;
	    remedy: string;
	
	    static createFrom(source: any = {}) {
	        return new KeyLookupFinding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statementId = source["statementId"];
	        this.nodeId = source["nodeId"];
	        this.lookupKind = source["lookupKind"];
	        this.schema = source["schema"];
	        this.table = source["table"];
	        this.lookupIndex = source["lookupIndex"];
	        this.seekIndex = source["seekIndex"];
	        this.estimateRows = source["estimateRows"];
	        this.lookupCount = source["lookupCount"];
	        this.hasActualRows = source["hasActualRows"];
	        this.costPercent = source["costPercent"];
	        this.fetchedColumns = source["fetchedColumns"];
	        this.includeClause = source["includeClause"];
	        this.severity = source["severity"];
	        this.description = source["description"];
	        this.remedy = source["remedy"];
	    }
	}
	export class CardinalityEstimationEngine {
	    modelVersion: string;
	    isLegacy: boolean;
	    description: string;
	    remedy: string;
	
	    static createFrom(source: any = {}) {
	        return new CardinalityEstimationEngine(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.modelVersion = source["modelVersion"];
	        this.isLegacy = source["isLegacy"];
	        this.description = source["description"];
	        this.remedy = source["remedy"];
	    }
	}
	export class ScalarUDFWarning {
	    statementId: string;
	    functionName: string;
	    description: string;
	    remedy: string;
	
	    static createFrom(source: any = {}) {
	        return new ScalarUDFWarning(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statementId = source["statementId"];
	        this.functionName = source["functionName"];
	        this.description = source["description"];
	        this.remedy = source["remedy"];
	    }
	}
	export class ConsolidatedIndex {
	    table: string;
	    schema: string;
	    combinedFromCount: number;
	    equalityColumns: string[];
	    inequalityColumns: string[];
	    includeColumns: string[];
	    suggestedDdl: string;
	    averageImpact: number;
	    storageBenefit: string;
	
	    static createFrom(source: any = {}) {
	        return new ConsolidatedIndex(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.table = source["table"];
	        this.schema = source["schema"];
	        this.combinedFromCount = source["combinedFromCount"];
	        this.equalityColumns = source["equalityColumns"];
	        this.inequalityColumns = source["inequalityColumns"];
	        this.includeColumns = source["includeColumns"];
	        this.suggestedDdl = source["suggestedDdl"];
	        this.averageImpact = source["averageImpact"];
	        this.storageBenefit = source["storageBenefit"];
	    }
	}
	export class ImplicitConversion {
	    statementId: string;
	    convertIssue: string;
	    expression: string;
	    description: string;
	    remedy: string;
	
	    static createFrom(source: any = {}) {
	        return new ImplicitConversion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statementId = source["statementId"];
	        this.convertIssue = source["convertIssue"];
	        this.expression = source["expression"];
	        this.description = source["description"];
	        this.remedy = source["remedy"];
	    }
	}
	export class ThreadDistribution {
	    threadId: number;
	    actualRows: number;
	    percentage: number;
	
	    static createFrom(source: any = {}) {
	        return new ThreadDistribution(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.threadId = source["threadId"];
	        this.actualRows = source["actualRows"];
	        this.percentage = source["percentage"];
	    }
	}
	export class ParallelismSkew {
	    hasSkew: boolean;
	    nodeId: number;
	    physicalOp: string;
	    threadsCount: number;
	    totalRows: number;
	    maxThreadRows: number;
	    minThreadRows: number;
	    skewRatio: number;
	    threads: ThreadDistribution[];
	    rootCauseSummary: string;
	    remedy: string;
	
	    static createFrom(source: any = {}) {
	        return new ParallelismSkew(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hasSkew = source["hasSkew"];
	        this.nodeId = source["nodeId"];
	        this.physicalOp = source["physicalOp"];
	        this.threadsCount = source["threadsCount"];
	        this.totalRows = source["totalRows"];
	        this.maxThreadRows = source["maxThreadRows"];
	        this.minThreadRows = source["minThreadRows"];
	        this.skewRatio = source["skewRatio"];
	        this.threads = this.convertValues(source["threads"], ThreadDistribution);
	        this.rootCauseSummary = source["rootCauseSummary"];
	        this.remedy = source["remedy"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MemoryGrantHealth {
	    grantedMemoryKb: number;
	    maxUsedMemoryKb: number;
	    serialRequiredKb: number;
	    serialDesiredKb: number;
	    requestedMemoryKb: number;
	    grantWaitTimeMs: number;
	    maxQueryMemoryKb: number;
	    feedbackAdjusted: string;
	    estimatedAvailableMemoryKb: number;
	    estimatedPagesCached: number;
	    isBloated: boolean;
	    wastedMemoryMb: number;
	    wastedPercent: number;
	    hasSpills: boolean;
	    spillDetails: string;
	    remedy: string;
	
	    static createFrom(source: any = {}) {
	        return new MemoryGrantHealth(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.grantedMemoryKb = source["grantedMemoryKb"];
	        this.maxUsedMemoryKb = source["maxUsedMemoryKb"];
	        this.serialRequiredKb = source["serialRequiredKb"];
	        this.serialDesiredKb = source["serialDesiredKb"];
	        this.requestedMemoryKb = source["requestedMemoryKb"];
	        this.grantWaitTimeMs = source["grantWaitTimeMs"];
	        this.maxQueryMemoryKb = source["maxQueryMemoryKb"];
	        this.feedbackAdjusted = source["feedbackAdjusted"];
	        this.estimatedAvailableMemoryKb = source["estimatedAvailableMemoryKb"];
	        this.estimatedPagesCached = source["estimatedPagesCached"];
	        this.isBloated = source["isBloated"];
	        this.wastedMemoryMb = source["wastedMemoryMb"];
	        this.wastedPercent = source["wastedPercent"];
	        this.hasSpills = source["hasSpills"];
	        this.spillDetails = source["spillDetails"];
	        this.remedy = source["remedy"];
	    }
	}
	export class AdvancedDiagnostics {
	    memoryGrant?: MemoryGrantHealth;
	    parallelismSkew?: ParallelismSkew;
	    implicitConversions: ImplicitConversion[];
	    consolidatedIndexes: ConsolidatedIndex[];
	    scalarUdfWarnings: ScalarUDFWarning[];
	    cardinalityEngine?: CardinalityEstimationEngine;
	    keyLookups: KeyLookupFinding[];
	    spools: SpoolFinding[];
	    missingStatistics: MissingStatsFinding[];
	    parameterSniffing: ParameterSniffingFinding[];
	    nonSargable: NonSargableFinding[];
	    rowGoals: RowGoalFinding[];
	    adaptive?: AdaptiveProcessing;
	    healthScore: number;
	    scoreGrade: string;
	    healthBreakdown?: HealthScorePillar[];
	
	    static createFrom(source: any = {}) {
	        return new AdvancedDiagnostics(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.memoryGrant = this.convertValues(source["memoryGrant"], MemoryGrantHealth);
	        this.parallelismSkew = this.convertValues(source["parallelismSkew"], ParallelismSkew);
	        this.implicitConversions = this.convertValues(source["implicitConversions"], ImplicitConversion);
	        this.consolidatedIndexes = this.convertValues(source["consolidatedIndexes"], ConsolidatedIndex);
	        this.scalarUdfWarnings = this.convertValues(source["scalarUdfWarnings"], ScalarUDFWarning);
	        this.cardinalityEngine = this.convertValues(source["cardinalityEngine"], CardinalityEstimationEngine);
	        this.keyLookups = this.convertValues(source["keyLookups"], KeyLookupFinding);
	        this.spools = this.convertValues(source["spools"], SpoolFinding);
	        this.missingStatistics = this.convertValues(source["missingStatistics"], MissingStatsFinding);
	        this.parameterSniffing = this.convertValues(source["parameterSniffing"], ParameterSniffingFinding);
	        this.nonSargable = this.convertValues(source["nonSargable"], NonSargableFinding);
	        this.rowGoals = this.convertValues(source["rowGoals"], RowGoalFinding);
	        this.adaptive = this.convertValues(source["adaptive"], AdaptiveProcessing);
	        this.healthScore = source["healthScore"];
	        this.scoreGrade = source["scoreGrade"];
	        this.healthBreakdown = this.convertValues(source["healthBreakdown"], HealthScorePillar);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AntiPattern {
	    type: string;
	    severity: string;
	    title: string;
	    description: string;
	    affectedStatements: string[];
	    recommendation: string;
	
	    static createFrom(source: any = {}) {
	        return new AntiPattern(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.severity = source["severity"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.affectedStatements = source["affectedStatements"];
	        this.recommendation = source["recommendation"];
	    }
	}
	
	
	export class ExecutiveVerdict {
	    culpritStatementId: string;
	    costPercentage: number;
	    headline: string;
	    summary: string;
	    topOperator: string;
	    actionableFix: string;
	
	    static createFrom(source: any = {}) {
	        return new ExecutiveVerdict(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.culpritStatementId = source["culpritStatementId"];
	        this.costPercentage = source["costPercentage"];
	        this.headline = source["headline"];
	        this.summary = source["summary"];
	        this.topOperator = source["topOperator"];
	        this.actionableFix = source["actionableFix"];
	    }
	}
	export class TableIOLeader {
	    rank: number;
	    database: string;
	    schema: string;
	    table: string;
	    logicalReads: number;
	    logicalReadsMb: number;
	    physicalReads: number;
	    physicalReadsMb: number;
	    readAheads: number;
	    readAheadsMb: number;
	    readPercent: number;
	    accessOperations: string[];
	    indexesUsed: string[];
	
	    static createFrom(source: any = {}) {
	        return new TableIOLeader(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rank = source["rank"];
	        this.database = source["database"];
	        this.schema = source["schema"];
	        this.table = source["table"];
	        this.logicalReads = source["logicalReads"];
	        this.logicalReadsMb = source["logicalReadsMb"];
	        this.physicalReads = source["physicalReads"];
	        this.physicalReadsMb = source["physicalReadsMb"];
	        this.readAheads = source["readAheads"];
	        this.readAheadsMb = source["readAheadsMb"];
	        this.readPercent = source["readPercent"];
	        this.accessOperations = source["accessOperations"];
	        this.indexesUsed = source["indexesUsed"];
	    }
	}
	export class HardwareMetrics {
	    hasRuntimeMetrics: boolean;
	    totalLogicalReads: number;
	    totalLogicalReadsMb: number;
	    totalPhysicalReads: number;
	    totalPhysicalReadsMb: number;
	    totalReadAheads: number;
	    totalReadAheadsMb: number;
	    totalLobLogicalReads: number;
	    totalLobPhysicalReads: number;
	    cacheHitRatioPercent: number;
	    totalActualCpuMs: number;
	    totalActualElapsedMs: number;
	    cpuUtilizationRatio: number;
	    waitTimeMs: number;
	    memoryGrantWaitTimeMs: number;
	    requestedMemoryKb: number;
	    grantedMemoryKb: number;
	    maxUsedMemoryKb: number;
	    maxQueryMemoryKb: number;
	    estimatedAvailableMemoryKb: number;
	    estimatedPagesCached: number;
	    isMemoryGrantFeedbackAdjusted: string;
	    topIoLeaders: TableIOLeader[];
	
	    static createFrom(source: any = {}) {
	        return new HardwareMetrics(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hasRuntimeMetrics = source["hasRuntimeMetrics"];
	        this.totalLogicalReads = source["totalLogicalReads"];
	        this.totalLogicalReadsMb = source["totalLogicalReadsMb"];
	        this.totalPhysicalReads = source["totalPhysicalReads"];
	        this.totalPhysicalReadsMb = source["totalPhysicalReadsMb"];
	        this.totalReadAheads = source["totalReadAheads"];
	        this.totalReadAheadsMb = source["totalReadAheadsMb"];
	        this.totalLobLogicalReads = source["totalLobLogicalReads"];
	        this.totalLobPhysicalReads = source["totalLobPhysicalReads"];
	        this.cacheHitRatioPercent = source["cacheHitRatioPercent"];
	        this.totalActualCpuMs = source["totalActualCpuMs"];
	        this.totalActualElapsedMs = source["totalActualElapsedMs"];
	        this.cpuUtilizationRatio = source["cpuUtilizationRatio"];
	        this.waitTimeMs = source["waitTimeMs"];
	        this.memoryGrantWaitTimeMs = source["memoryGrantWaitTimeMs"];
	        this.requestedMemoryKb = source["requestedMemoryKb"];
	        this.grantedMemoryKb = source["grantedMemoryKb"];
	        this.maxUsedMemoryKb = source["maxUsedMemoryKb"];
	        this.maxQueryMemoryKb = source["maxQueryMemoryKb"];
	        this.estimatedAvailableMemoryKb = source["estimatedAvailableMemoryKb"];
	        this.estimatedPagesCached = source["estimatedPagesCached"];
	        this.isMemoryGrantFeedbackAdjusted = source["isMemoryGrantFeedbackAdjusted"];
	        this.topIoLeaders = this.convertValues(source["topIoLeaders"], TableIOLeader);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	
	export class MissingIndexInfo {
	    statementId: string;
	    impact: number;
	    database: string;
	    schema: string;
	    table: string;
	    equalityColumns: string[];
	    inequalityColumns: string[];
	    includeColumns: string[];
	    suggestedDdl: string;
	
	    static createFrom(source: any = {}) {
	        return new MissingIndexInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statementId = source["statementId"];
	        this.impact = source["impact"];
	        this.database = source["database"];
	        this.schema = source["schema"];
	        this.table = source["table"];
	        this.equalityColumns = source["equalityColumns"];
	        this.inequalityColumns = source["inequalityColumns"];
	        this.includeColumns = source["includeColumns"];
	        this.suggestedDdl = source["suggestedDdl"];
	    }
	}
	
	export class NodeThreadStat {
	    threadId: number;
	    actualRows: number;
	    actualExecutions: number;
	    actualCpuMs: number;
	    actualElapsedMs: number;
	    actualLogicalReads: number;
	    actualPhysicalReads: number;
	    actualReadAheads: number;
	    actualScans: number;
	
	    static createFrom(source: any = {}) {
	        return new NodeThreadStat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.threadId = source["threadId"];
	        this.actualRows = source["actualRows"];
	        this.actualExecutions = source["actualExecutions"];
	        this.actualCpuMs = source["actualCpuMs"];
	        this.actualElapsedMs = source["actualElapsedMs"];
	        this.actualLogicalReads = source["actualLogicalReads"];
	        this.actualPhysicalReads = source["actualPhysicalReads"];
	        this.actualReadAheads = source["actualReadAheads"];
	        this.actualScans = source["actualScans"];
	    }
	}
	
	export class OperatorWarning {
	    kind: string;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new OperatorWarning(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.description = source["description"];
	    }
	}
	export class PLERiskAssessment {
	    riskLevel: string;
	    score: number;
	    headline: string;
	    summary: string;
	    estimatedScanVolumeMb: number;
	    bufferPoolEvictionRisk: string;
	    culpritOperators: string[];
	    mitigationAction: string;
	
	    static createFrom(source: any = {}) {
	        return new PLERiskAssessment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.riskLevel = source["riskLevel"];
	        this.score = source["score"];
	        this.headline = source["headline"];
	        this.summary = source["summary"];
	        this.estimatedScanVolumeMb = source["estimatedScanVolumeMb"];
	        this.bufferPoolEvictionRisk = source["bufferPoolEvictionRisk"];
	        this.culpritOperators = source["culpritOperators"];
	        this.mitigationAction = source["mitigationAction"];
	    }
	}
	
	
	export class StatementParameter {
	    column: string;
	    parameterType: string;
	    compiledValue: string;
	    runtimeValue: string;
	    hasRuntime: boolean;
	    mismatch: boolean;
	
	    static createFrom(source: any = {}) {
	        return new StatementParameter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.column = source["column"];
	        this.parameterType = source["parameterType"];
	        this.compiledValue = source["compiledValue"];
	        this.runtimeValue = source["runtimeValue"];
	        this.hasRuntime = source["hasRuntime"];
	        this.mismatch = source["mismatch"];
	    }
	}
	export class QueryTimeStats {
	    cpuTimeMs: number;
	    elapsedTimeMs: number;
	
	    static createFrom(source: any = {}) {
	        return new QueryTimeStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cpuTimeMs = source["cpuTimeMs"];
	        this.elapsedTimeMs = source["elapsedTimeMs"];
	    }
	}
	export class TraceFlagInfo {
	    value: number;
	    scope: string;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new TraceFlagInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.value = source["value"];
	        this.scope = source["scope"];
	        this.status = source["status"];
	    }
	}
	export class PlanWarning {
	    statementId: string;
	    kind: string;
	    issue: string;
	    expression: string;
	    nodeId: number;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new PlanWarning(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statementId = source["statementId"];
	        this.kind = source["kind"];
	        this.issue = source["issue"];
	        this.expression = source["expression"];
	        this.nodeId = source["nodeId"];
	        this.description = source["description"];
	    }
	}
	export class PlanNode {
	    nodeId: number;
	    physicalOp: string;
	    logicalOp: string;
	    estimateRows: number;
	    estimatedRowsRead: number;
	    actualRows: number;
	    hasActualRows: boolean;
	    hasCardinalitySkew: boolean;
	    skewRatio: number;
	    skewReason: string;
	    estimateIo: number;
	    estimateCpu: number;
	    estimatedTotalSubtreeCost: number;
	    costPercentage: number;
	    tableCardinality: number;
	    parallel: boolean;
	    actualCpuMs: number;
	    actualElapsedMs: number;
	    actualLogicalReads: number;
	    actualPhysicalReads: number;
	    actualReadAheads: number;
	    actualScans: number;
	    database: string;
	    schema: string;
	    table: string;
	    index: string;
	    indexKind: string;
	    seekPredicates: string;
	    predicate: string;
	    outputColumns: string[];
	    warnings: string[];
	    isPainPoint: boolean;
	    painReason: string;
	    children: PlanNode[];
	    operatorWarnings: OperatorWarning[];
	    estimateRebinds: number;
	    estimateRewinds: number;
	    executionMode: string;
	    actualExecutionMode: string;
	    selfCpuMs: number;
	    selfElapsedMs: number;
	    selfCpuPercent: number;
	    selfElapsedPercent: number;
	    heatIntensity: number;
	    perThreadStats: NodeThreadStat[];
	
	    static createFrom(source: any = {}) {
	        return new PlanNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nodeId = source["nodeId"];
	        this.physicalOp = source["physicalOp"];
	        this.logicalOp = source["logicalOp"];
	        this.estimateRows = source["estimateRows"];
	        this.estimatedRowsRead = source["estimatedRowsRead"];
	        this.actualRows = source["actualRows"];
	        this.hasActualRows = source["hasActualRows"];
	        this.hasCardinalitySkew = source["hasCardinalitySkew"];
	        this.skewRatio = source["skewRatio"];
	        this.skewReason = source["skewReason"];
	        this.estimateIo = source["estimateIo"];
	        this.estimateCpu = source["estimateCpu"];
	        this.estimatedTotalSubtreeCost = source["estimatedTotalSubtreeCost"];
	        this.costPercentage = source["costPercentage"];
	        this.tableCardinality = source["tableCardinality"];
	        this.parallel = source["parallel"];
	        this.actualCpuMs = source["actualCpuMs"];
	        this.actualElapsedMs = source["actualElapsedMs"];
	        this.actualLogicalReads = source["actualLogicalReads"];
	        this.actualPhysicalReads = source["actualPhysicalReads"];
	        this.actualReadAheads = source["actualReadAheads"];
	        this.actualScans = source["actualScans"];
	        this.database = source["database"];
	        this.schema = source["schema"];
	        this.table = source["table"];
	        this.index = source["index"];
	        this.indexKind = source["indexKind"];
	        this.seekPredicates = source["seekPredicates"];
	        this.predicate = source["predicate"];
	        this.outputColumns = source["outputColumns"];
	        this.warnings = source["warnings"];
	        this.isPainPoint = source["isPainPoint"];
	        this.painReason = source["painReason"];
	        this.children = this.convertValues(source["children"], PlanNode);
	        this.operatorWarnings = this.convertValues(source["operatorWarnings"], OperatorWarning);
	        this.estimateRebinds = source["estimateRebinds"];
	        this.estimateRewinds = source["estimateRewinds"];
	        this.executionMode = source["executionMode"];
	        this.actualExecutionMode = source["actualExecutionMode"];
	        this.selfCpuMs = source["selfCpuMs"];
	        this.selfElapsedMs = source["selfElapsedMs"];
	        this.selfCpuPercent = source["selfCpuPercent"];
	        this.selfElapsedPercent = source["selfElapsedPercent"];
	        this.heatIntensity = source["heatIntensity"];
	        this.perThreadStats = this.convertValues(source["perThreadStats"], NodeThreadStat);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StatementAnalysis {
	    statementId: string;
	    statementCompId: string;
	    statementType: string;
	    statementText: string;
	    statementSubTreeCost: number;
	    statementEstRows: number;
	    costPercentage: number;
	    compileTimeMs: number;
	    compileCpuMs: number;
	    compileMemoryKb: number;
	    optimizationLevel: string;
	    hasQueryPlan: boolean;
	    rootNode?: PlanNode;
	    warnings: PlanWarning[];
	    missingIndexes: MissingIndexInfo[];
	    painPointsCount: number;
	    actualCpuMs: number;
	    actualElapsedMs: number;
	    actualLogicalReads: number;
	    actualLogicalReadsMb: number;
	    actualPhysicalReads: number;
	    actualReadAheads: number;
	    hasActualMetrics: boolean;
	    executionClassification: string;
	    executionClassificationReason: string;
	    traceFlags: TraceFlagInfo[];
	    queryTimeStats?: QueryTimeStats;
	    parameters: StatementParameter[];
	    nodeWaitStats: WaitStat[];
	
	    static createFrom(source: any = {}) {
	        return new StatementAnalysis(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statementId = source["statementId"];
	        this.statementCompId = source["statementCompId"];
	        this.statementType = source["statementType"];
	        this.statementText = source["statementText"];
	        this.statementSubTreeCost = source["statementSubTreeCost"];
	        this.statementEstRows = source["statementEstRows"];
	        this.costPercentage = source["costPercentage"];
	        this.compileTimeMs = source["compileTimeMs"];
	        this.compileCpuMs = source["compileCpuMs"];
	        this.compileMemoryKb = source["compileMemoryKb"];
	        this.optimizationLevel = source["optimizationLevel"];
	        this.hasQueryPlan = source["hasQueryPlan"];
	        this.rootNode = this.convertValues(source["rootNode"], PlanNode);
	        this.warnings = this.convertValues(source["warnings"], PlanWarning);
	        this.missingIndexes = this.convertValues(source["missingIndexes"], MissingIndexInfo);
	        this.painPointsCount = source["painPointsCount"];
	        this.actualCpuMs = source["actualCpuMs"];
	        this.actualElapsedMs = source["actualElapsedMs"];
	        this.actualLogicalReads = source["actualLogicalReads"];
	        this.actualLogicalReadsMb = source["actualLogicalReadsMb"];
	        this.actualPhysicalReads = source["actualPhysicalReads"];
	        this.actualReadAheads = source["actualReadAheads"];
	        this.hasActualMetrics = source["hasActualMetrics"];
	        this.executionClassification = source["executionClassification"];
	        this.executionClassificationReason = source["executionClassificationReason"];
	        this.traceFlags = this.convertValues(source["traceFlags"], TraceFlagInfo);
	        this.queryTimeStats = this.convertValues(source["queryTimeStats"], QueryTimeStats);
	        this.parameters = this.convertValues(source["parameters"], StatementParameter);
	        this.nodeWaitStats = this.convertValues(source["nodeWaitStats"], WaitStat);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class WaitStat {
	    waitType: string;
	    waitTimeMs: number;
	    waitCount: number;
	    category: string;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new WaitStat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.waitType = source["waitType"];
	        this.waitTimeMs = source["waitTimeMs"];
	        this.waitCount = source["waitCount"];
	        this.category = source["category"];
	        this.description = source["description"];
	    }
	}
	export class PlanAnalysis {
	    planName: string;
	    totalStatements: number;
	    totalSubTreeCost: number;
	    maxDopReason: string;
	    maxCompileMemory: number;
	    cachedPlanSizeKB: number;
	    executiveVerdict?: ExecutiveVerdict;
	    waitStats: WaitStat[];
	    statements: StatementAnalysis[];
	    globalWarnings: string[];
	    allMissingIndexes: MissingIndexInfo[];
	    antiPatterns: AntiPattern[];
	    diagnostics?: AdvancedDiagnostics;
	    hardwareMetrics?: HardwareMetrics;
	    pleRiskReport?: PLERiskAssessment;
	
	    static createFrom(source: any = {}) {
	        return new PlanAnalysis(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.planName = source["planName"];
	        this.totalStatements = source["totalStatements"];
	        this.totalSubTreeCost = source["totalSubTreeCost"];
	        this.maxDopReason = source["maxDopReason"];
	        this.maxCompileMemory = source["maxCompileMemory"];
	        this.cachedPlanSizeKB = source["cachedPlanSizeKB"];
	        this.executiveVerdict = this.convertValues(source["executiveVerdict"], ExecutiveVerdict);
	        this.waitStats = this.convertValues(source["waitStats"], WaitStat);
	        this.statements = this.convertValues(source["statements"], StatementAnalysis);
	        this.globalWarnings = source["globalWarnings"];
	        this.allMissingIndexes = this.convertValues(source["allMissingIndexes"], MissingIndexInfo);
	        this.antiPatterns = this.convertValues(source["antiPatterns"], AntiPattern);
	        this.diagnostics = this.convertValues(source["diagnostics"], AdvancedDiagnostics);
	        this.hardwareMetrics = this.convertValues(source["hardwareMetrics"], HardwareMetrics);
	        this.pleRiskReport = this.convertValues(source["pleRiskReport"], PLERiskAssessment);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StatementDiff {
	    statementId: string;
	    costA: number;
	    costB: number;
	    costDiffPct: number;
	    hasImprovement: boolean;
	    querySnippet: string;
	
	    static createFrom(source: any = {}) {
	        return new StatementDiff(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statementId = source["statementId"];
	        this.costA = source["costA"];
	        this.costB = source["costB"];
	        this.costDiffPct = source["costDiffPct"];
	        this.hasImprovement = source["hasImprovement"];
	        this.querySnippet = source["querySnippet"];
	    }
	}
	export class PlanComparison {
	    planAName: string;
	    planBName: string;
	    costBefore: number;
	    costAfter: number;
	    costReductionPercent: number;
	    isImprovement: boolean;
	    missingIndexesBefore: number;
	    missingIndexesAfter: number;
	    resolvedIndexesCount: number;
	    statementsDiff: StatementDiff[];
	    summaryVerdict: string;
	
	    static createFrom(source: any = {}) {
	        return new PlanComparison(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.planAName = source["planAName"];
	        this.planBName = source["planBName"];
	        this.costBefore = source["costBefore"];
	        this.costAfter = source["costAfter"];
	        this.costReductionPercent = source["costReductionPercent"];
	        this.isImprovement = source["isImprovement"];
	        this.missingIndexesBefore = source["missingIndexesBefore"];
	        this.missingIndexesAfter = source["missingIndexesAfter"];
	        this.resolvedIndexesCount = source["resolvedIndexesCount"];
	        this.statementsDiff = this.convertValues(source["statementsDiff"], StatementDiff);
	        this.summaryVerdict = source["summaryVerdict"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	
	
	
	
	
	
	
	
	

}

