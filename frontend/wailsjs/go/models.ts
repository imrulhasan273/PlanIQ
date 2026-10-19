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
	export class AIResponse {
	    summary: string;
	    rootCause: string;
	    recommendedRewrite: string;
	    rewriteExplanation: string;
	    indexRecommendations: string[];
	    serverConfigTips: string[];
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
	        this.indexRecommendations = source["indexRecommendations"];
	        this.serverConfigTips = source["serverConfigTips"];
	        this.providerUsed = source["providerUsed"];
	    }
	}

}

export namespace sqlplan {
	
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

