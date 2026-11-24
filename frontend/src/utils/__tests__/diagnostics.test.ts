import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findWrappedColumnFunctions,
  buildFindingAntiPatterns,
  extraHealthPenalty,
} from '../extraDiagnostics';
import { comparePlansClient } from '../clientPlanParser';
import {
  PlanAnalysis,
  StatementAnalysis,
  KeyLookupFinding,
  SpoolFinding,
  MissingStatsFinding,
  ParameterSniffingFinding,
  MissingIndexInfo,
  ExecutiveVerdict,
} from '../../types/plan';

test('findWrappedColumnFunctions detects non-sargable function expressions on columns', () => {
  const predicateWithFunctions =
    "YEAR([Orders].[OrderDate]) = 2025 AND ISNULL([Customers].[Status], 0) = 1 AND DATEPART(month, [Orders].[OrderDate]) = 5";
  const wrapped = findWrappedColumnFunctions(predicateWithFunctions);

  assert.ok(wrapped.includes('year'), 'Should identify year() call on column');
  assert.ok(wrapped.includes('isnull'), 'Should identify isnull() call on column');
  assert.ok(wrapped.includes('datepart'), 'Should identify datepart() call on column');

  // Pure column comparison without function wrapper should yield empty list
  assert.deepEqual(findWrappedColumnFunctions('[Orders].[StatusId] = 1 AND [Customers].[AccountId] = 42'), []);
  assert.deepEqual(findWrappedColumnFunctions(''), []);
});

test('extraHealthPenalty computes accurate cumulative penalty scores', () => {
  const sampleDiagnostics = {
    keyLookups: [
      {
        statementId: '1',
        nodeId: 2,
        lookupKind: 'Key Lookup',
        schema: 'dbo',
        table: 'Orders',
        lookupIndex: 'PK_Orders',
        seekIndex: 'IX_Orders_Date',
        estimateRows: 25000,
        lookupCount: 30000,
        hasActualRows: true,
        costPercent: 45,
        fetchedColumns: ['TotalAmount'],
        includeClause: 'INCLUDE (TotalAmount)',
        severity: 'HIGH' as const,
        description: 'Key lookup incurring random I/O',
        recommendation: 'Add missing include columns',
      } as unknown as KeyLookupFinding,
    ],
    spools: [
      {
        statementId: '1',
        nodeId: 4,
        spoolType: 'Table Spool',
        estimateRows: 10000,
        actualRows: 12000,
        hasActualRows: true,
        rebinds: 50,
        rewinds: 100,
        costPercent: 20,
        severity: 'MEDIUM' as const,
        description: 'Heavy table spool usage',
        recommendation: 'Check row goals and indexing',
      } as unknown as SpoolFinding,
    ],
    missingStatistics: [
      {
        statementId: '1',
        schema: 'dbo',
        table: 'Customers',
        columns: ['PostalCode'],
        severity: 'HIGH' as const,
        description: 'Missing statistics',
        remedy: 'CREATE STATISTICS on PostalCode',
      } as unknown as MissingStatsFinding,
    ],
    parameterSniffing: [
      {
        statementId: '1',
        parameter: '@BranchId',
        dataType: 'int',
        compiledValue: '10',
        runtimeValue: '999',
        compiledRows: 5,
        runtimeRows: 50000,
        skewRatio: 10000,
        severity: 'CRITICAL' as const,
        description: 'Severe parameter sniffing skew',
        remedy: 'OPTION (RECOMPILE) or OPTIMIZE FOR',
      } as unknown as ParameterSniffingFinding,
    ],
    nonSargable: [],
    rowGoals: [],
    adaptive: undefined,
  };

  const penalty = extraHealthPenalty(sampleDiagnostics);
  assert.ok(penalty > 0, 'Penalty must be non-zero when severe findings exist');
  assert.ok(penalty <= 75, 'Penalty should not exceed safety cap');

  // Zero penalty when no extra issues exist
  const emptyDiagnostics = {
    keyLookups: [],
    spools: [],
    missingStatistics: [],
    parameterSniffing: [],
    nonSargable: [],
    rowGoals: [],
    adaptive: undefined,
  };
  assert.equal(extraHealthPenalty(emptyDiagnostics), 0);
});

test('buildFindingAntiPatterns maps diagnostic findings into structured antipattern items', () => {
  const sampleDiagnostics = {
    keyLookups: [
      {
        statementId: '1',
        nodeId: 2,
        lookupKind: 'Key Lookup',
        schema: 'dbo',
        table: 'Invoices',
        lookupIndex: 'PK_Invoices',
        seekIndex: 'IX_Invoices_Date',
        estimateRows: 5000,
        lookupCount: 5000,
        hasActualRows: true,
        costPercent: 40,
        fetchedColumns: ['Status'],
        includeClause: 'INCLUDE (Status)',
        severity: 'HIGH' as const,
        description: 'Key lookup on Invoices',
        recommendation: 'Add include columns to IX_Invoices_Date',
      } as unknown as KeyLookupFinding,
    ],
    spools: [],
    missingStatistics: [],
    parameterSniffing: [],
    nonSargable: [],
    rowGoals: [],
    adaptive: undefined,
  };

  const antiPatterns = buildFindingAntiPatterns(sampleDiagnostics);
  assert.equal(antiPatterns.length, 1);
  assert.equal(antiPatterns[0].type, 'KEY_LOOKUP');
  assert.equal(antiPatterns[0].severity, 'HIGH');
  assert.equal(antiPatterns[0].title, 'Heavy Key / RID Lookups');
  assert.ok(antiPatterns[0].affectedStatements.some((s) => s.includes('Invoices')));
  assert.ok(antiPatterns[0].recommendation.includes('INCLUDE'));
});

test('comparePlansClient computes cost savings and resolved indexes between two plan revisions', () => {
  const planA = {
    planName: 'Baseline Plan',
    engine: 'sqlserver',
    totalSubTreeCost: 150.0,
    totalStatements: 1,
    statements: [
      {
        statementId: '1',
        statementText: 'SELECT * FROM Orders WHERE Status = 1',
        statementSubTreeCost: 150.0,
        costPercent: 100,
        rootNode: null,
        missingIndexes: [],
        warnings: [],
        antiPatterns: [],
        waitStats: [],
      } as unknown as StatementAnalysis,
    ],
    allMissingIndexes: [
      {
        statementId: '1',
        impact: 85,
        database: 'SalesDB',
        schema: 'dbo',
        table: 'Orders',
        equalityColumns: ['Status'],
        inequalityColumns: [],
        includeColumns: ['TotalAmount', 'OrderDate'],
        suggestedDdl: 'CREATE NONCLUSTERED INDEX IX_Orders_Status ON dbo.Orders(Status) INCLUDE (TotalAmount, OrderDate)',
      } as MissingIndexInfo,
    ],
    waitStats: [],
    globalWarnings: [],
    antiPatterns: [],
    executiveVerdict: {
      culpritStatementId: '1',
      costPercentage: 100,
      headline: 'Table Scan Bottleneck',
      summary: 'High cost query needing index',
      topOperator: 'Table Scan',
      actionableFix: 'Create covering index',
    } as ExecutiveVerdict,
  } as unknown as PlanAnalysis;

  const planB = {
    planName: 'Tuned Plan',
    engine: 'sqlserver',
    totalSubTreeCost: 15.0, // 90% reduction
    totalStatements: 1,
    statements: [
      {
        statementId: '1',
        statementText: 'SELECT * FROM Orders WHERE Status = 1',
        statementSubTreeCost: 15.0,
        costPercent: 100,
        rootNode: null,
        missingIndexes: [],
        warnings: [],
        antiPatterns: [],
        waitStats: [],
      } as unknown as StatementAnalysis,
    ],
    allMissingIndexes: [], // missing index resolved
    waitStats: [],
    globalWarnings: [],
    antiPatterns: [],
    executiveVerdict: {
      culpritStatementId: '1',
      costPercentage: 100,
      headline: 'Optimal Execution',
      summary: 'Optimal seek execution',
      topOperator: 'Index Seek',
      actionableFix: 'None required',
    } as ExecutiveVerdict,
  } as unknown as PlanAnalysis;

  const diff = comparePlansClient(planA, planB);
  assert.equal(diff.costBefore, 150.0);
  assert.equal(diff.costAfter, 15.0);
  assert.equal(diff.costReductionPercent, 90.0);
  assert.equal(diff.isImprovement, true);
  assert.equal(diff.resolvedIndexesCount, 1);
  assert.equal(diff.statementsDiff.length, 1);
  assert.equal(diff.statementsDiff[0].costDiffPct, 90.0);
});
