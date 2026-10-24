import {
  PlanAnalysis,
  StatementAnalysis,
  PlanNode,
  MissingIndexInfo,
  PlanWarning,
  WaitStat,
  ExecutiveVerdict,
  AdvancedDiagnostics,
  MemoryGrantHealth,
  ParallelismSkew,
  ImplicitConversion,
  ConsolidatedIndex,
  ScalarUDFWarning,
  CardinalityEstimationEngine,
} from '../types/plan';
import {
  computeExtraDiagnostics,
  buildFindingAntiPatterns,
  extraHealthPenalty,
} from './extraDiagnostics';

export function parseShowPlanXMLClient(xmlString: string, planName: string = 'Execution Plan'): PlanAnalysis {
  // Normalize XML declaration to avoid browser DOMParser rejection when string specifies utf-16
  const cleanXml = xmlString.replace(/<\?xml([^>]+)encoding=["']utf-16["']([^>]*)>/i, '<?xml$1encoding="utf-8"$2>');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(cleanXml, 'text/xml');

  // Check for XML parse errors
  const parseError = xmlDoc.getElementsByTagName('parsererror');
  if (parseError.length > 0) {
    throw new Error(`Failed to parse XML: ${parseError[0].textContent?.slice(0, 200)}`);
  }

  const statements: StatementAnalysis[] = [];
  const waitStats: WaitStat[] = [];
  const allMissingIndexes: MissingIndexInfo[] = [];

  // Extract Wait Stats
  const waitElements = xmlDoc.querySelectorAll('WaitStat, Wait');
  waitElements.forEach((w) => {
    const waitType = w.getAttribute('WaitType') || '';
    const waitTimeMs = parseInt(w.getAttribute('WaitTimeMs') || '0', 10);
    const waitCount = parseInt(w.getAttribute('WaitCount') || '0', 10);
    const { category, description } = categorizeWaitType(waitType);
    if (waitType) {
      waitStats.push({
        waitType,
        waitTimeMs,
        waitCount,
        category,
        description,
      });
    }
  });
  waitStats.sort((a, b) => b.waitTimeMs - a.waitTimeMs);

  // Extract Statements (StmtSimple, StmtCond, StmtCursor)
  const stmtNodes = xmlDoc.querySelectorAll('StmtSimple, StmtCond, StmtCursor');
  stmtNodes.forEach((stmtElem, idx) => {
    const stmtId = stmtElem.getAttribute('StatementId') || stmtElem.getAttribute('StatementCompId') || `${idx + 1}`;
    const stmtCompId = stmtElem.getAttribute('StatementCompId') || '';
    const stmtType = stmtElem.getAttribute('StatementType') || 'SELECT';
    const stmtText = (stmtElem.getAttribute('StatementText') || '').trim();
    const statementSubTreeCost = parseFloat(stmtElem.getAttribute('StatementSubTreeCost') || '0') || 0;
    const statementEstRows = parseFloat(stmtElem.getAttribute('StatementEstRows') || '0') || 0;
    const optimizationLevel = stmtElem.getAttribute('StatementOptmLevel') || 'FULL';

    const qp = stmtElem.querySelector('QueryPlan');
    const hasQueryPlan = !!qp;
    const compileTimeMs = qp ? parseInt(qp.getAttribute('CompileTime') || '0', 10) : 0;
    const compileCpuMs = qp ? parseInt(qp.getAttribute('CompileCPU') || '0', 10) : 0;
    const compileMemoryKb = qp ? parseInt(qp.getAttribute('CompileMemory') || '0', 10) : 0;

    // Missing indexes in this statement
    const stmtMissingIndexes: MissingIndexInfo[] = [];
    if (qp) {
      const miNodes = qp.querySelectorAll('MissingIndex');
      miNodes.forEach((miElem) => {
        const db = miElem.getAttribute('Database') || '';
        const schema = miElem.getAttribute('Schema') || '';
        const table = miElem.getAttribute('Table') || '';
        const grp = miElem.closest('MissingIndexGroup');
        const impact = grp ? parseFloat(grp.getAttribute('Impact') || '0') : 0;

        const equalityCols: string[] = [];
        const inequalityCols: string[] = [];
        const includeCols: string[] = [];

        miElem.querySelectorAll('ColumnGroup').forEach((cg) => {
          const usage = cg.getAttribute('Usage');
          cg.querySelectorAll('Column').forEach((col) => {
            const colName = col.getAttribute('Name') || '';
            if (usage === 'EQUALITY') equalityCols.push(colName);
            else if (usage === 'INEQUALITY') inequalityCols.push(colName);
            else if (usage === 'INCLUDE') includeCols.push(colName);
          });
        });

        const suggestedDdl = generateIndexDDL(table, schema, equalityCols, inequalityCols, includeCols);
        const miInfo: MissingIndexInfo = {
          statementId: stmtId,
          impact,
          database: db,
          schema,
          table,
          equalityColumns: equalityCols,
          inequalityColumns: inequalityCols,
          includeColumns: includeCols,
          suggestedDdl,
        };
        stmtMissingIndexes.push(miInfo);
        allMissingIndexes.push(miInfo);
      });
    }

    // Warnings in this statement
    const warnings: PlanWarning[] = [];
    stmtElem.querySelectorAll('PlanAffectingConvert').forEach((pac) => {
      warnings.push({
        statementId: stmtId,
        kind: 'PlanAffectingConvert',
        issue: pac.getAttribute('ConvertIssue') || '',
        expression: pac.getAttribute('Expression') || '',
        nodeId: 0,
        description: `Implicit type conversion on ${pac.getAttribute('Expression')} may prevent index seek.`,
      });
    });
    stmtElem.querySelectorAll('SpillToTempDb').forEach(() => {
      warnings.push({
        statementId: stmtId,
        kind: 'SpillToTempDb',
        issue: 'Spill',
        expression: '',
        nodeId: 0,
        description: 'Operator spilled memory pages to TempDB.',
      });
    });

    // Root RelOp
    let rootNode: PlanNode | undefined = undefined;
    if (qp) {
      const relOpElem = qp.querySelector('RelOp');
      if (relOpElem) {
        rootNode = parseRelOp(relOpElem, statementSubTreeCost);
      }
    }

    const stmtAnalysis = {
      statementId: stmtId,
      statementCompId: stmtCompId,
      statementType: stmtType,
      statementText: stmtText,
      statementSubTreeCost,
      statementEstRows,
      costPercentage: 0,
      compileTimeMs,
      compileCpuMs,
      compileMemoryKb,
      optimizationLevel,
      hasQueryPlan,
      rootNode,
      warnings,
      missingIndexes: stmtMissingIndexes,
      painPointsCount: 0,
    } as unknown as StatementAnalysis;

    statements.push(stmtAnalysis);
  });

  // Calculate total costs & percentages
  const totalSubTreeCost = statements.reduce((acc, s) => acc + s.statementSubTreeCost, 0);
  statements.forEach((s) => {
    if (totalSubTreeCost > 0) {
      s.costPercentage = (s.statementSubTreeCost / totalSubTreeCost) * 100;
    }
  });

  // Sort statements by SubTreeCost descending
  statements.sort((a, b) => b.statementSubTreeCost - a.statementSubTreeCost);

  // Global properties
  const qpGlobal = xmlDoc.querySelector('QueryPlan');
  const maxDopReason = qpGlobal?.getAttribute('NonParallelPlanReason') || '';

  // Detect anti-patterns
  const antiPatterns = detectAntiPatterns(statements);

  // Executive Verdict
  const executiveVerdict = generateExecutiveVerdict(statements, totalSubTreeCost);

  // Advanced Root Cause Diagnostics
  const diagnostics = generateAdvancedDiagnosticsClient(xmlDoc, statements, allMissingIndexes, maxDopReason, antiPatterns);

  // Append findings from 7 detectors to high-level anti-patterns
  const extraAnti = buildFindingAntiPatterns(diagnostics);
  extraAnti.forEach((ea) => {
    antiPatterns.push({
      type: ea.type,
      severity: ea.severity.toLowerCase(),
      title: ea.title,
      description: ea.description,
      affectedStatements: ea.affectedStatements,
      recommendation: ea.recommendation,
    } as any);
  });

  return {
    planName,
    totalStatements: statements.length,
    totalSubTreeCost,
    maxDopReason,
    statements,
    waitStats,
    allMissingIndexes,
    antiPatterns,
    executiveVerdict,
    diagnostics,
    cachedPlanSizeKb: 0,
    maxCompileMemory: 0,
    globalWarnings: [],
  } as unknown as PlanAnalysis;
}

function parseRelOp(elem: Element, statementCost: number): PlanNode {
  const nodeId = parseInt(elem.getAttribute('NodeId') || '0', 10);
  const physicalOp = elem.getAttribute('PhysicalOp') || 'Operator';
  const logicalOp = elem.getAttribute('LogicalOp') || physicalOp;
  const estimateRows = parseFloat(elem.getAttribute('EstimateRows') || '0') || 0;
  const estimatedRowsRead = parseFloat(elem.getAttribute('EstimatedRowsRead') || '0') || 0;
  const estimateCpu = parseFloat(elem.getAttribute('EstimateCPU') || '0') || 0;
  const estimateIo = parseFloat(elem.getAttribute('EstimateIO') || '0') || 0;
  const estimatedTotalSubtreeCost = parseFloat(elem.getAttribute('EstimatedTotalSubtreeCost') || '0') || 0;
  const tableCardinality = parseFloat(elem.getAttribute('TableCardinality') || '0') || 0;
  const parallel = elem.getAttribute('Parallel') === '1' || elem.getAttribute('Parallel') === 'true';

  let costPercentage = 0;
  if (statementCost > 0) {
    costPercentage = (estimatedTotalSubtreeCost / statementCost) * 100;
  }

  // Target object (Table, Index)
  let database = '';
  let schema = '';
  let table = '';
  let index = '';
  let indexKind = '';

  const obj = elem.querySelector('Object');
  if (obj) {
    database = obj.getAttribute('Database') || '';
    schema = obj.getAttribute('Schema') || '';
    table = obj.getAttribute('Table') || '';
    index = obj.getAttribute('Index') || '';
    indexKind = obj.getAttribute('IndexKind') || '';
  }

  // Actual Rows
  let hasActualRows = false;
  let actualRows = 0;
  let hasCardinalitySkew = false;
  let skewRatio = 1;
  let skewReason = '';
  let isPainPoint = false;
  let painReason = '';

  const runtime = elem.querySelector('RunTimeCountersPerThread');
  if (runtime) {
    hasActualRows = true;
    actualRows = parseFloat(runtime.getAttribute('ActualRows') || '0') || 0;
    if (estimateRows > 0) {
      skewRatio = actualRows / estimateRows;
      if (skewRatio > 10.0 || (actualRows > 0 && skewRatio < 0.1)) {
        hasCardinalitySkew = true;
        isPainPoint = true;
        skewReason = `Cardinality Skew: ${actualRows.toLocaleString()} actual rows vs ${estimateRows.toLocaleString()} estimated (${skewRatio.toFixed(1)}x error).`;
      }
    }
  }

  // Pain point checks
  const opLower = physicalOp.toLowerCase();
  if (opLower.includes('scan') && !table.startsWith('[#')) {
    isPainPoint = true;
    painReason = `Full ${physicalOp} on ${table || 'table'}. Consider creating a covering index.`;
  } else if (opLower.includes('lookup')) {
    isPainPoint = true;
    painReason = `Key/RID Lookup on ${table}. Index seek followed by point lookups for unindexed columns.`;
  } else if (costPercentage > 40) {
    isPainPoint = true;
    painReason = `High operator cost (${costPercentage.toFixed(1)}% of statement cost).`;
  }

  // Output Columns
  const outputColumns: string[] = [];
  const outList = elem.querySelector('OutputList');
  if (outList) {
    outList.querySelectorAll('ColumnReference').forEach((col) => {
      const colName = col.getAttribute('Column');
      if (colName) outputColumns.push(colName);
    });
  }

  // Predicate
  let predicate = '';
  const pred = elem.querySelector('Predicate ScalarOperator');
  if (pred) {
    predicate = pred.getAttribute('ScalarString') || '';
  }

  // Seek Predicate
  let seekPredicates = '';
  const seek = elem.querySelector('SeekPredicates ScalarOperator');
  if (seek) {
    seekPredicates = seek.getAttribute('ScalarString') || '';
  }

  // Recursive Children: immediate child RelOps inside this operator
  const children: PlanNode[] = [];
  Array.from(elem.children).forEach((childElem) => {
    // Traverse direct child or nested operator element (like NestedLoops, HashMatch, etc.)
    if (childElem.tagName === 'RelOp') {
      children.push(parseRelOp(childElem, statementCost));
    } else {
      childElem.querySelectorAll(':scope > RelOp').forEach((nestedRelOp) => {
        children.push(parseRelOp(nestedRelOp, statementCost));
      });
    }
  });

  return {
    nodeId,
    physicalOp,
    logicalOp,
    estimateRows,
    estimatedRowsRead,
    estimateCpu,
    estimateIo,
    estimatedTotalSubtreeCost,
    tableCardinality,
    parallel,
    costPercentage,
    database,
    schema,
    table,
    index,
    indexKind,
    hasActualRows,
    actualRows,
    hasCardinalitySkew,
    skewRatio,
    skewReason,
    isPainPoint,
    painReason,
    outputColumns,
    warnings: [],
    predicate,
    seekPredicates,
    children,
  } as unknown as PlanNode;
}

function generateIndexDDL(table: string, schema: string, eq: string[], ineq: string[], inc: string[]): string {
  const cleanTable = table.replace(/[[\]]/g, '');
  const cleanSchema = schema.replace(/[[\]]/g, '') || 'dbo';
  const keyCols = [...eq, ...ineq];
  const indexName = `IX_${cleanTable}_${keyCols.map(c => c.replace(/[[\]]/g, '')).join('_')}`.slice(0, 128);

  let ddl = `CREATE NONCLUSTERED INDEX [${indexName}]\nON [${cleanSchema}].[${cleanTable}] (${keyCols.join(', ')})`;
  if (inc.length > 0) {
    ddl += `\nINCLUDE (${inc.join(', ')})`;
  }
  ddl += `\nWITH (ONLINE = ON, FILLFACTOR = 90);`;
  return ddl;
}

function categorizeWaitType(waitType: string) {
  const wt = waitType.toUpperCase();
  if (wt.startsWith('PAGEIOLATCH') || wt.includes('IO_COMPLETION')) {
    return { category: 'Disk I/O', description: 'Waiting for data pages to be read from physical storage into RAM.' };
  }
  if (wt === 'CXPACKET' || wt === 'CXCONSUMER') {
    return { category: 'Parallelism', description: 'Query worker threads synchronizing or exchanging row packets.' };
  }
  if (wt === 'ASYNC_NETWORK_IO') {
    return { category: 'Network / Client', description: 'SQL Server waiting for client application to fetch result rows.' };
  }
  if (wt === 'RESOURCE_SEMAPHORE') {
    return { category: 'Memory Grant', description: 'Query queued waiting for RAM allocation to begin execution.' };
  }
  if (wt.startsWith('LCK_')) {
    return { category: 'Lock Contention', description: 'Query blocked waiting for an exclusive or shared transaction lock.' };
  }
  return { category: 'Other', description: 'Engine synchronization or background wait.' };
}

function detectAntiPatterns(statements: StatementAnalysis[]) {
  const antiPatterns = [];
  const topStmt = statements[0];

  if (topStmt && topStmt.costPercentage > 40) {
    antiPatterns.push({
      type: 'SingleQueryDominance',
      severity: 'critical',
      title: 'Dominant Culprit Statement',
      description: `Statement #${topStmt.statementId} accounts for ${topStmt.costPercentage.toFixed(1)}% of total batch subtree cost (${topStmt.statementSubTreeCost.toFixed(2)}).`,
      affectedStatements: [`Stmt #${topStmt.statementId}`],
      recommendation: 'Optimize this single statement first to achieve the largest performance improvement.',
    });
  }

  // Table Scan / Heap scan checks
  const scanStmts: string[] = [];
  statements.forEach((s) => {
    if (s.rootNode && hasTableScan(s.rootNode)) {
      scanStmts.push(`Stmt #${s.statementId}`);
    }
  });

  if (scanStmts.length > 0) {
    antiPatterns.push({
      type: 'TableScanOnHeap',
      severity: 'high',
      title: 'Table Scan on Heap / Unindexed Table',
      description: `Full table scans detected in ${scanStmts.join(', ')}. Scans read every row sequentially without an index seek path.`,
      affectedStatements: scanStmts,
      recommendation: 'Add clustered primary keys or non-clustered covering indexes on frequently filtered columns.',
    });
  }

  return antiPatterns;
}

function hasTableScan(node: PlanNode): boolean {
  if (node.physicalOp.toLowerCase().includes('table scan')) return true;
  return (node.children || []).some(hasTableScan);
}

function generateExecutiveVerdict(statements: StatementAnalysis[], totalCost: number): ExecutiveVerdict | undefined {
  if (statements.length === 0) return undefined;
  const culprit = statements[0];

  return {
    culpritStatementId: culprit.statementId,
    costPercentage: Math.round(culprit.costPercentage),
    headline: `Statement #${culprit.statementId} accounts for ${culprit.costPercentage.toFixed(1)}% of total batch execution cost (${culprit.statementSubTreeCost.toFixed(2)})`,
    summary: `The SQL Server query optimizer allocated ${culprit.costPercentage.toFixed(1)}% of execution cost to Query #${culprit.statementId}. Remediating this query will produce the greatest reduction in runtime, CPU, and I/O pressure.`,
    topOperator: culprit.rootNode?.physicalOp || 'Operator',
    actionableFix: `Review query #${culprit.statementId} in the visualizer and AI Advisor to add recommended indexes or optimize joins and partition pruning.`,
  };
}

export function comparePlansClient(planA: PlanAnalysis, planB: PlanAnalysis) {
  const costA = planA.totalSubTreeCost;
  const costB = planB.totalSubTreeCost;
  let diffPct = 0;
  if (costA > 0) {
    diffPct = ((costA - costB) / costA) * 100;
  }
  const isImprovement = costB < costA;
  const resolvedIndexes = Math.max(0, planA.allMissingIndexes.length - planB.allMissingIndexes.length);

  const mapB = new Map<string, StatementAnalysis>();
  planB.statements.forEach((s) => mapB.set(s.statementId, s));

  const statementsDiff = planA.statements.map((sa) => {
    const sb = mapB.get(sa.statementId);
    const costBVal = sb ? sb.statementSubTreeCost : 0;
    let costDiffPct = 0;
    if (sa.statementSubTreeCost > 0 && sb) {
      costDiffPct = ((sa.statementSubTreeCost - costBVal) / sa.statementSubTreeCost) * 100;
    }
    return {
      statementId: sa.statementId,
      costA: sa.statementSubTreeCost,
      costB: costBVal,
      costDiffPct,
      hasImprovement: sb ? sb.statementSubTreeCost < sa.statementSubTreeCost : false,
      querySnippet: sa.statementText,
    };
  });

  const summaryVerdict = isImprovement
    ? `Query execution cost was reduced by ${diffPct.toFixed(1)}% (${costA.toFixed(2)} ➔ ${costB.toFixed(2)}). ${resolvedIndexes} missing index recommendation(s) resolved.`
    : `Plan B has higher execution cost than Plan A (${costA.toFixed(2)} ➔ ${costB.toFixed(2)}). Revisit indexing or query changes.`;

  return {
    planAName: planA.planName,
    planBName: planB.planName,
    costBefore: costA,
    costAfter: costB,
    costReductionPercent: diffPct,
    isImprovement,
    missingIndexesBefore: planA.allMissingIndexes.length,
    missingIndexesAfter: planB.allMissingIndexes.length,
    resolvedIndexesCount: resolvedIndexes,
    statementsDiff,
    summaryVerdict,
  };
}

function generateAdvancedDiagnosticsClient(
  xmlDoc: Document,
  statements: StatementAnalysis[],
  allMissingIndexes: MissingIndexInfo[],
  maxDopReason: string,
  antiPatterns: any[]
): AdvancedDiagnostics {
  const memoryGrant = extractMemoryGrantClient(xmlDoc, statements);
  const parallelismSkew = extractParallelismSkewClient(xmlDoc);
  const implicitConversions = extractImplicitConversionsClient(xmlDoc, statements);
  const consolidatedIndexes = consolidateMissingIndexesClient(allMissingIndexes);
  const scalarUdfWarnings = extractScalarUDFWarningsClient(statements);
  const cardinalityEngine = extractCardinalityEngineClient(xmlDoc);

  // 7 Extended Root Cause Detectors
  const extra = computeExtraDiagnostics(xmlDoc, cardinalityEngine?.modelVersion, scalarUdfWarnings.length);

  const { healthScore, scoreGrade } = calculateHealthScoreClient(
    memoryGrant,
    parallelismSkew,
    implicitConversions,
    scalarUdfWarnings,
    cardinalityEngine,
    allMissingIndexes,
    maxDopReason,
    antiPatterns,
    extra
  );

  return {
    memoryGrant,
    parallelismSkew,
    implicitConversions,
    consolidatedIndexes,
    scalarUdfWarnings,
    cardinalityEngine,
    keyLookups: extra.keyLookups,
    spools: extra.spools,
    missingStatistics: extra.missingStatistics,
    parameterSniffing: extra.parameterSniffing,
    nonSargable: extra.nonSargable,
    rowGoals: extra.rowGoals,
    adaptive: extra.adaptive,
    healthScore,
    scoreGrade,
  };
}

function extractMemoryGrantClient(xmlDoc: Document, statements: StatementAnalysis[]): MemoryGrantHealth | undefined {
  let hasSpills = xmlDoc.querySelectorAll('SpillToTempDb').length > 0;
  statements.forEach((s) => {
    if (s.warnings?.some((w) => w.kind === 'SpillToTempDb')) {
      hasSpills = true;
    }
  });

  let maxGranted = 0;
  let maxUsed = 0;
  let maxReq = 0;
  let maxDes = 0;

  xmlDoc.querySelectorAll('MemoryGrantInfo').forEach((elem) => {
    const g = parseInt(elem.getAttribute('GrantedMemory') || '0', 10);
    const u = parseInt(elem.getAttribute('MaxUsedMemory') || '0', 10);
    const r = parseInt(elem.getAttribute('SerialRequiredMemory') || '0', 10);
    const d = parseInt(elem.getAttribute('SerialDesiredMemory') || '0', 10);
    if (g > maxGranted) maxGranted = g;
    if (u > maxUsed) maxUsed = u;
    if (r > maxReq) maxReq = r;
    if (d > maxDes) maxDes = d;
  });

  if (maxGranted === 0 && maxDes === 0 && !hasSpills) {
    return undefined;
  }

  let wastedMemoryMb = 0;
  let wastedPercent = 0;
  let isBloated = false;

  if (maxGranted > 0) {
    const wastedKb = maxGranted - maxUsed;
    if (wastedKb > 0) {
      wastedMemoryMb = Math.round((wastedKb / 1024) * 10) / 10;
      wastedPercent = Math.round((wastedKb / maxGranted) * 1000) / 10;
      if (wastedPercent > 50 && maxGranted > 5120) {
        isBloated = true;
      }
    }
  }

  let spillDetails = '';
  let remedy = 'RAM allocation and workspace usage are balanced.';

  if (hasSpills) {
    spillDetails = 'Operator spilled memory pages to TempDB due to insufficient memory grant.';
    remedy = 'Increase query memory grant percentage (MIN_GRANT_PERCENT) or optimize sort/hash operators and statistics.';
  } else if (isBloated) {
    remedy = 'Optimizer over-reserved RAM due to cardinality overestimates. Update column statistics to size grants accurately.';
  } else if (maxDes > 0 && maxGranted === 0) {
    remedy = `Query requests estimated ${maxDes.toLocaleString()} KB serial workspace for Sort/Hash operations.`;
  }

  return {
    grantedMemoryKb: maxGranted,
    maxUsedMemoryKb: maxUsed,
    serialRequiredKb: maxReq,
    serialDesiredKb: maxDes,
    isBloated,
    wastedMemoryMb,
    wastedPercent,
    hasSpills,
    spillDetails,
    remedy,
  };
}

function extractParallelismSkewClient(xmlDoc: Document): ParallelismSkew | undefined {
  let worstSkew: ParallelismSkew | undefined = undefined;
  let highestRatio = 1.0;

  xmlDoc.querySelectorAll('RelOp').forEach((relOp) => {
    const runtime = relOp.querySelector('RunTimeInformation');
    if (!runtime) return;

    const counters = runtime.querySelectorAll('RunTimeCountersPerThread');
    if (counters.length <= 1) return;

    const threads: { threadId: number; actualRows: number; percentage: number }[] = [];
    let totalRows = 0;
    let maxThreadRows = 0;
    let minThreadRows = Number.MAX_SAFE_INTEGER;

    counters.forEach((c) => {
      const tId = parseInt(c.getAttribute('Thread') || '0', 10);
      const actualRows = parseFloat(c.getAttribute('ActualRows') || '0') || 0;
      threads.push({ threadId: tId, actualRows, percentage: 0 });
      totalRows += actualRows;
      if (actualRows > maxThreadRows) maxThreadRows = actualRows;
      if (actualRows < minThreadRows) minThreadRows = actualRows;
    });

    if (totalRows > 0) {
      threads.forEach((t) => {
        t.percentage = Math.round((t.actualRows / totalRows) * 1000) / 10;
      });
    }

    const avgRows = totalRows / threads.length;
    const ratio = avgRows > 0 ? maxThreadRows / avgRows : 1;

    if (ratio > 2.0 && totalRows > 100 && ratio > highestRatio) {
      highestRatio = ratio;
      const nodeId = parseInt(relOp.getAttribute('NodeId') || '0', 10);
      worstSkew = {
        hasSkew: true,
        nodeId,
        physicalOp: relOp.getAttribute('PhysicalOp') || 'Parallel Operator',
        threadsCount: threads.length,
        totalRows,
        maxThreadRows,
        minThreadRows,
        skewRatio: Math.round(ratio * 10) / 10,
        threads,
        rootCauseSummary: `Parallel worker thread imbalance: one thread processed ${((maxThreadRows / Math.max(1, totalRows)) * 100).toFixed(1)}% of all rows.`,
        remedy: 'Check for skewed join/grouping keys, update statistics on distribution columns, or adjust MAXDOP.',
      };
    }
  });

  return worstSkew;
}

function extractImplicitConversionsClient(xmlDoc: Document, statements: StatementAnalysis[]): ImplicitConversion[] {
  const list: ImplicitConversion[] = [];
  const seen = new Set<string>();

  statements.forEach((stmt) => {
    (stmt.warnings || []).forEach((w) => {
      if (w.kind === 'PlanAffectingConvert') {
        const key = `${stmt.statementId}:${w.expression}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            statementId: stmt.statementId,
            convertIssue: w.issue,
            expression: w.expression,
            description: `CONVERT_IMPLICIT on ${w.expression} forces per-row conversion, disabling Sargable index seeks.`,
            remedy: 'Match application parameter/variable datatype exactly with underlying column definition.',
          });
        }
      }
    });
  });

  xmlDoc.querySelectorAll('ScalarOperator').forEach((sc) => {
    const str = sc.getAttribute('ScalarString') || '';
    if (str.includes('CONVERT_IMPLICIT') && !seen.has(str)) {
      seen.add(str);
      list.push({
        statementId: 'Batch',
        convertIssue: 'Type Conversion',
        expression: str,
        description: 'Internal implicit datatype casting detected in query execution predicate.',
        remedy: 'Ensure variables and column schemas share identical datatypes and collations.',
      });
    }
  });

  return list;
}

function consolidateMissingIndexesClient(indexes: MissingIndexInfo[]): ConsolidatedIndex[] {
  if (indexes.length === 0) return [];

  const groups = new Map<string, { db: string; schema: string; table: string; items: MissingIndexInfo[]; totalImpact: number }>();

  indexes.forEach((idx) => {
    const key = `${idx.schema}.${idx.table}`;
    if (!groups.has(key)) {
      groups.set(key, {
        db: idx.database,
        schema: idx.schema,
        table: idx.table,
        items: [],
        totalImpact: 0,
      });
    }
    const grp = groups.get(key)!;
    grp.items.push(idx);
    grp.totalImpact += idx.impact;
  });

  const results: ConsolidatedIndex[] = [];

  groups.forEach((grp) => {
    const count = grp.items.length;
    const avgImpact = grp.totalImpact / count;

    const eqCols: string[] = [];
    const ineqCols: string[] = [];
    const incCols: string[] = [];

    const eqSet = new Set<string>();
    const ineqSet = new Set<string>();
    const incSet = new Set<string>();

    grp.items.forEach((mi) => {
      (mi.equalityColumns || []).forEach((c) => {
        if (!eqSet.has(c)) {
          eqSet.add(c);
          eqCols.push(c);
        }
      });
      (mi.inequalityColumns || []).forEach((c) => {
        if (!eqSet.has(c) && !ineqSet.has(c)) {
          ineqSet.add(c);
          ineqCols.push(c);
        }
      });
      (mi.includeColumns || []).forEach((c) => {
        if (!eqSet.has(c) && !ineqSet.has(c) && !incSet.has(c)) {
          incSet.add(c);
          incCols.push(c);
        }
      });
    });

    const cleanTable = grp.table.replace(/[[\]]/g, '') || 'Table';
    const cleanSchema = grp.schema.replace(/[[\]]/g, '') || 'dbo';
    const allKeys = [...eqCols, ...ineqCols];
    const keyParts = allKeys.map((c) => c.replace(/[[\]]/g, ''));
    const indexName = `IX_${cleanTable}_${keyParts.join('_')}`.slice(0, 120);

    let ddl = `CREATE NONCLUSTERED INDEX [${indexName}]\nON [${cleanSchema}].[${cleanTable}] (${allKeys.join(', ')})`;
    if (incCols.length > 0) {
      ddl += `\nINCLUDE (${incCols.join(', ')})`;
    }
    ddl += `\nWITH (ONLINE = ON, FILLFACTOR = 90);`;

    const benefit = count > 1
      ? `Replaces ${count} redundant individual index recommendations with 1 optimal composite index, saving storage and index write overhead.`
      : 'High-impact covering index recommendation.';

    results.push({
      table: grp.table,
      schema: grp.schema,
      combinedFromCount: count,
      equalityColumns: eqCols,
      inequalityColumns: ineqCols,
      includeColumns: incCols,
      suggestedDdl: ddl,
      averageImpact: Math.round(avgImpact * 10) / 10,
      storageBenefit: benefit,
    });
  });

  results.sort((a, b) => b.averageImpact - a.averageImpact);
  return results;
}

function extractScalarUDFWarningsClient(statements: StatementAnalysis[]): ScalarUDFWarning[] {
  const warnings: ScalarUDFWarning[] = [];
  const seen = new Set<string>();

  statements.forEach((stmt) => {
    const txt = stmt.statementText || '';
    const words = txt.split(/[\s(),;\r\n]+/);
    words.forEach((w) => {
      const lower = w.toLowerCase();
      if (
        (lower.includes('func_') || lower.includes('ufn_') || lower.startsWith('fn_')) &&
        !lower.includes('dateadd') &&
        !lower.includes('eomonth')
      ) {
        const fnName = w.replace(/[[\](),]/g, '').trim();
        if (fnName && !seen.has(fnName)) {
          seen.add(fnName);
          warnings.push({
            statementId: stmt.statementId,
            functionName: fnName,
            description: `Scalar User-Defined Function '${fnName}' triggers RBAR (Row-By-Agonizing-Row) execution and inhibits query parallelism.`,
            remedy: 'Convert scalar UDF to an Inline Table-Valued Function (iTVF) or leverage SQL Server 2019+ Scalar UDF Inlining.',
          });
        }
      }
    });
  });

  return warnings;
}

function extractCardinalityEngineClient(xmlDoc: Document): CardinalityEstimationEngine | undefined {
  const elem = xmlDoc.querySelector('StmtSimple[CardinalityEstimationModelVersion], StmtCond[CardinalityEstimationModelVersion]');
  const version = elem?.getAttribute('CardinalityEstimationModelVersion');
  if (!version) return undefined;

  const isLegacy = version === '70' || parseInt(version, 10) < 120;
  const desc = isLegacy
    ? `Query compiled under Legacy Cardinality Estimator (Model Version ${version}). Legacy CE assumes filter predicate independence and can severely skew row estimates.`
    : `Query compiled under Modern Cardinality Estimator (Model Version ${version}).`;
  const remedy = isLegacy
    ? "Evaluate running under modern CE with OPTION (USE HINT('FORCE_DEFAULT_CARDINALITY_ESTIMATION')) or database compatibility level 130+."
    : 'Ensure table statistics have adequate sample rates for multi-column join correlation.';

  return {
    modelVersion: version,
    isLegacy,
    description: desc,
    remedy,
  };
}

function calculateHealthScoreClient(
  memoryGrant: MemoryGrantHealth | undefined,
  skew: ParallelismSkew | undefined,
  implicitConversions: ImplicitConversion[],
  udfs: ScalarUDFWarning[],
  ce: CardinalityEstimationEngine | undefined,
  missingIndexes: MissingIndexInfo[],
  maxDopReason: string,
  antiPatterns: any[],
  extra?: any
): { healthScore: number; scoreGrade: string } {
  let score = 100;

  if (memoryGrant?.hasSpills) score -= 25;
  else if (memoryGrant?.isBloated) score -= 15;

  if (skew?.hasSkew) score -= 15;
  if (implicitConversions.length > 0) score -= 15;
  if (udfs.length > 0) score -= 15;
  if (ce?.isLegacy) score -= 10;
  if (missingIndexes.length > 3) score -= 10;
  else if (missingIndexes.length > 0) score -= 5;
  if (maxDopReason === 'MaxDOPSetToOne') score -= 5;

  if (antiPatterns.some((ap) => ap.type === 'HEAP_TABLE' || ap.type === 'TableScanOnHeap')) {
    score -= 10;
  }

  if (extra) {
    score -= extraHealthPenalty(extra);
  }

  if (score < 15) score = 15;
  if (score > 98) score = 98;

  let scoreGrade = 'A';
  if (score >= 90) scoreGrade = 'A';
  else if (score >= 75) scoreGrade = 'B';
  else if (score >= 60) scoreGrade = 'C';
  else if (score >= 45) scoreGrade = 'D';
  else scoreGrade = 'F';

  return { healthScore: score, scoreGrade };
}

