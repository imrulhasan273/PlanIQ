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
  isBloated: boolean;
  wastedMemoryMb: number;
  wastedPercent: number;
  hasSpills: boolean;
  spillDetails: string;
  remedy: string;
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

export interface AdvancedDiagnostics {
  memoryGrant?: MemoryGrantHealth;
  parallelismSkew?: ParallelismSkew;
  implicitConversions: ImplicitConversion[];
  consolidatedIndexes: ConsolidatedIndex[];
  scalarUdfWarnings: ScalarUDFWarning[];
  cardinalityEngine?: CardinalityEstimationEngine;
  healthScore: number;
  scoreGrade: string;
}

export type PlanAnalysis = sqlplan.PlanAnalysis & {
  executiveVerdict?: ExecutiveVerdict;
  waitStats?: WaitStat[];
  diagnostics?: AdvancedDiagnostics;
};

export type StatementAnalysis = sqlplan.StatementAnalysis;

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

export type AIResponse = advisor.AIResponse;

