import { sqlplan, advisor } from '../../wailsjs/go/models';

export interface ExecutiveVerdict {
  culpritStatementId: string;
  costPercentage: number;
  headline: string;
  summary: string;
  topOperator: string;
  actionableFix: string;
}

export interface WaitStat {
  waitType: string;
  waitTimeMs: number;
  waitCount: number;
  category: string;
  description: string;
}

export interface PlanComparison {
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
}

export interface StatementDiff {
  statementId: string;
  costA: number;
  costB: number;
  costDiffPct: number;
  hasImprovement: boolean;
  querySnippet: string;
}

export interface MemoryGrantHealth {
  grantedMemoryKb: number;
  maxUsedMemoryKb: number;
  serialRequiredKb: number;
  serialDesiredKb: number;
  requestedMemoryKb?: number;
  grantWaitTimeMs?: number;
  maxQueryMemoryKb?: number;
  feedbackAdjusted?: string;
  estimatedAvailableMemoryKb?: number;
  estimatedPagesCached?: number;
  isBloated: boolean;
  wastedMemoryMb: number;
  wastedPercent: number;
  hasSpills: boolean;
  spillDetails: string;
  remedy: string;
}

export interface TableIOLeader {
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
}

export interface HardwareMetrics {
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
}

export interface ThreadDistribution {
  threadId: number;
  actualRows: number;
  percentage: number;
}

export interface ParallelismSkew {
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
}

export interface ImplicitConversion {
  statementId: string;
  convertIssue: string;
  expression: string;
  description: string;
  remedy: string;
}

export interface ConsolidatedIndex {
  table: string;
  schema: string;
  combinedFromCount: number;
  equalityColumns: string[];
  inequalityColumns: string[];
  includeColumns: string[];
  suggestedDdl: string;
  averageImpact: number;
  storageBenefit: string;
}

export interface ScalarUDFWarning {
  statementId: string;
  functionName: string;
  description: string;
  remedy: string;
}

export interface CardinalityEstimationEngine {
  modelVersion: string;
  isLegacy: boolean;
  description: string;
  remedy: string;
}

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO' | string;

export interface KeyLookupFinding {
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
  severity: FindingSeverity;
  description: string;
  remedy: string;
}

export interface SpoolFinding {
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
  severity: FindingSeverity;
  description: string;
  remedy: string;
}

export interface MissingStatsFinding {
  statementId: string;
  nodeId: number;
  database: string;
  schema: string;
  table: string;
  columns: string[];
  severity: FindingSeverity;
  description: string;
  remedy: string;
  suggestedDdl: string;
}

export interface SniffedParameter {
  name: string;
  dataType: string;
  compiledValue: string;
  runtimeValue: string;
  hasRuntime: boolean;
  mismatch: boolean;
}

export interface ParameterSniffingFinding {
  affectedStatements: string[];
  parameters: SniffedParameter[];
  hasRuntimeValues: boolean;
  hasMismatch: boolean;
  hasEstimateImpact: boolean;
  mitigation: string;
  severity: FindingSeverity;
  description: string;
  remedy: string;
}

export interface NonSargableFinding {
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
  severity: FindingSeverity;
  description: string;
  remedy: string;
}

export interface RowGoalFinding {
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
  severity: FindingSeverity;
  description: string;
  remedy: string;
}

export interface AdaptiveJoinFinding {
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
}

export interface IQPFeature {
  name: string;
  status: 'Active' | 'Eligible' | 'Not Applicable' | 'Unknown' | string;
  detail: string;
}

export interface AdaptiveProcessing {
  adaptiveJoins: AdaptiveJoinFinding[];
  batchModeOperators: number;
  totalOperators: number;
  batchOnRowstore: boolean;
  features: IQPFeature[];
  summary: string;
}

export interface AdvancedDiagnostics {
  memoryGrant?: MemoryGrantHealth;
  parallelismSkew?: ParallelismSkew;
  implicitConversions: ImplicitConversion[];
  consolidatedIndexes: ConsolidatedIndex[];
  scalarUdfWarnings: ScalarUDFWarning[];
  cardinalityEngine?: CardinalityEstimationEngine;
  keyLookups?: KeyLookupFinding[];
  spools?: SpoolFinding[];
  missingStatistics?: MissingStatsFinding[];
  parameterSniffing?: ParameterSniffingFinding[];
  nonSargable?: NonSargableFinding[];
  rowGoals?: RowGoalFinding[];
  adaptive?: AdaptiveProcessing;
  healthScore: number;
  scoreGrade: string;
}

export type PlanAnalysis = sqlplan.PlanAnalysis & {
  executiveVerdict?: ExecutiveVerdict;
  waitStats?: WaitStat[];
  diagnostics?: AdvancedDiagnostics;
  hardwareMetrics?: HardwareMetrics;
};

export type StatementAnalysis = sqlplan.StatementAnalysis & {
  actualCpuMs?: number;
  actualElapsedMs?: number;
  actualLogicalReads?: number;
  actualLogicalReadsMb?: number;
  actualPhysicalReads?: number;
  actualReadAheads?: number;
  hasActualMetrics?: boolean;
  executionClassification?: 'IO_BOUND' | 'CPU_BOUND' | 'WAIT_BOUND' | 'BALANCED' | string;
  executionClassificationReason?: string;
};

export type PlanNode = sqlplan.PlanNode & {
  hasCardinalitySkew?: boolean;
  skewRatio?: number;
  skewReason?: string;
};

export type PlanWarning = sqlplan.PlanWarning;
export type MissingIndexInfo = sqlplan.MissingIndexInfo;
export type AntiPattern = sqlplan.AntiPattern;

export type AIRequest = advisor.AIRequest & {
  sanitizeBeforeAI?: boolean;
};

export type TechnicalSuggestion = advisor.TechnicalSuggestion;
export type RewriteStrategy = advisor.RewriteStrategy;

export interface AIResponse {
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
}

