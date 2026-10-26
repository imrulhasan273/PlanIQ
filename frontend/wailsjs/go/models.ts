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
	export class ConnectionConfig {
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
	
	    static createFrom(source: any = {}) {
	        return new ConnectionConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
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
	    isDemo: boolean;
	    errorMessage?: string;
	
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
	        this.isDemo = source["isDemo"];
	        this.errorMessage = source["errorMessage"];
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
	export class QueryStoreEntry {
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
	
	    static createFrom(source: any = {}) {
	        return new QueryStoreEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.queryId = source["queryId"];
	        this.planId = source["planId"];
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
	        this.totalSpillsMb = source["totalSpillsMb"];
	        this.lastExecutionTime = source["lastExecutionTime"];
	        this.planXml = source["planXml"];
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

