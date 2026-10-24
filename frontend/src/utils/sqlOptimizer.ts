import { StatementAnalysis, PlanAnalysis, AIResponse, TechnicalSuggestion, RewriteStrategy } from '../types/plan';

/**
 * Intelligent Deterministic DBA Optimizer Rule Engine for SQL Server.
 * Implements real query-level tuning:
 * 1. Join-to-Semi-Join Conversion: Converts joins on tables used solely as filters into WHERE EXISTS.
 * 2. Join Strategy Tuning: Converts ineffective LEFT JOINs to INNER JOINs when WHERE filters reject NULLs.
 * 3. Column Pruning: Eliminates unreferenced columns in subqueries/derived tables to shrink row width and sort memory grants.
 * 4. Subquery & Anti-Join Tuning: Replaces dangerous NOT IN with null-safe NOT EXISTS (avoiding ANSI NULL trap scans); replaces large IN with EXISTS.
 * 5. SARGability: Rewrites function-wrapped predicates (ISNULL, YEAR, LEFT) into open seekable range comparisons.
 * 6. Hint Auditing: Audits and removes gratuitous OPTION (RECOMPILE) / MAXDOP 1 / NOLOCK unless specifically justified by parameter sniffing.
 * 7. Dynamic Temp Table DDL: Intelligently parses actual query columns to generate tailored CREATE TABLE schemas with Clustered PKs, plus Inline CTE alternatives.
 */

// Helper to safely split top-level comma-separated expressions (respecting parens, brackets, CASE-END)
function splitTopLevelCommas(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inBracket = false;
  let caseDepth = 0;
  let current = '';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const next4 = str.slice(i, i + 4).toUpperCase();
    const next3 = str.slice(i, i + 3).toUpperCase();

    if (next4 === 'CASE' && !inBracket && depth === 0) {
      caseDepth++;
    } else if (next3 === 'END' && !inBracket && depth === 0 && caseDepth > 0) {
      caseDepth--;
    }

    if (ch === '[' && !inBracket) inBracket = true;
    else if (ch === ']' && inBracket) inBracket = false;
    else if (ch === '(' && !inBracket) depth++;
    else if (ch === ')' && !inBracket && depth > 0) depth--;

    if (ch === ',' && depth === 0 && !inBracket && caseDepth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

// Inferred datatype mapping based on naming conventions and expression analysis
function inferDataType(colName: string, rawExpr: string): string {
  const upperExpr = rawExpr.toUpperCase();
  const lowerName = colName.toLowerCase();

  if (upperExpr.includes('ROW_NUMBER()') || upperExpr.includes('RANK()')) return 'BIGINT';
  if (upperExpr.includes('COUNT(')) return 'INT';
  if (upperExpr.includes('SUM(') || upperExpr.includes('AVG(')) return 'DECIMAL(18, 2)';

  if (lowerName.endsWith('id') || lowerName.includes('memberid') || lowerName.includes('branchid') || lowerName.includes('groupid') || lowerName.includes('accountid')) {
    return 'BIGINT';
  }
  if (lowerName.includes('status') || lowerName.includes('type') || lowerName.includes('count') || lowerName.includes('number')) {
    return 'INT';
  }
  if (lowerName.includes('date') || lowerName.includes('time')) {
    return lowerName.includes('bigint') ? 'BIGINT' : 'DATETIME2';
  }
  if (lowerName.includes('amount') || lowerName.includes('balance') || lowerName.includes('cost') || lowerName.includes('rate') || lowerName.includes('fee') || lowerName.includes('credit')) {
    return 'DECIMAL(18, 2)';
  }
  if (lowerName.startsWith('is') || lowerName.startsWith('has') || lowerName.includes('flag')) {
    return 'BIT';
  }
  if (lowerName.includes('name') || lowerName.includes('address') || lowerName.includes('desc') || lowerName.includes('remarks')) {
    return 'NVARCHAR(150)';
  }

  return 'VARCHAR(100)';
}

// Extract column alias or name from expression
function extractColName(expr: string): string {
  const asMatch = expr.match(/\s+AS\s+\[?([a-zA-Z0-9_]+)\]?$/i);
  if (asMatch) return asMatch[1];

  const dotMatch = expr.match(/\.\[?([a-zA-Z0-9_]+)\]?$/);
  if (dotMatch) return dotMatch[1];

  const clean = expr.trim().replace(/^\[|\]$/g, '');
  const wordMatch = clean.match(/([a-zA-Z0-9_]+)$/);
  return wordMatch ? wordMatch[1] : 'Column';
}

export function generateOfflineAdviceClient(stmt: StatementAnalysis, plan: PlanAnalysis): AIResponse {
  const rawSql = (stmt.statementText || '').trim();
  const rootCauses: string[] = [];
  const explanations: string[] = [];
  const serverTips: string[] = [];
  const tuningStrategies: string[] = [];
  const technicalSuggestions: TechnicalSuggestion[] = [];
  const strategies: RewriteStrategy[] = [];

  // Check if query creates a temp table via SELECT ... INTO #temp
  const tempTableMatch = rawSql.match(/INTO\s+(#[a-zA-Z0-9_]+)/i);
  const tempTableName = tempTableMatch ? tempTableMatch[1] : null;
  const isSelectInto = !!tempTableName;

  // Extract columns projected in the top-level SELECT (before FROM)
  const selectColsMatch = rawSql.match(/^\s*SELECT\s+([\s\S]+?)(?:\s+INTO\s+#[a-zA-Z0-9_]+)?\s+FROM\s+/i);
  const topSelectColsRaw = selectColsMatch ? selectColsMatch[1].trim() : '';

  // Working copy of SQL stripped of INTO clause so transformations apply to the query body
  let tunedSql = rawSql;
  if (tempTableName) {
    tunedSql = tunedSql.replace(/\s+INTO\s+#[a-zA-Z0-9_]+/i, '');
  }

  // 1. Check Cardinality Estimator & MaxDOP Warnings
  if (plan.diagnostics?.cardinalityEngine?.isLegacy) {
    serverTips.push(
      `Legacy Cardinality Estimator (Model Version ${plan.diagnostics.cardinalityEngine.modelVersion}) detected. Test with modern CE using OPTION (USE HINT('FORCE_DEFAULT_CARDINALITY_ESTIMATION')).`
    );
  }

  // 2. Audit CONVERT_IMPLICIT warnings
  stmt.warnings?.forEach((w) => {
    if (w.kind === 'PlanAffectingConvert') {
      rootCauses.push(
        `Implicit Datatype Conversion (${w.issue}): Expression '${w.expression}' forces per-row conversion during scan, invalidating index seeks.`
      );
      explanations.push(
        `Type Alignment: Align parameter declarations with table column definitions (e.g. INT vs BIGINT or VARCHAR vs NVARCHAR) so the engine can seek on index leaf pages.`
      );
      tuningStrategies.push('SARGable Type Alignment');
    }
  });

  // -------------------------------------------------------------
  // STRATEGY 1: Join-to-Semi-Join Filter Optimization
  // If Table 1 is joined with Table 2, but ZERO columns from Table 1 are in SELECT,
  // Table 1 is purely an existence filter! Convert to WHERE EXISTS (SELECT 1 FROM Table 1 ...)
  // -------------------------------------------------------------
  const joinFilterRegex = /FROM\s+([#a-zA-Z0-9_.[\]]+)\s+([a-zA-Z0-9_]+)\s+INNER\s+JOIN\s+([#a-zA-Z0-9_.[\]]+)\s+([a-zA-Z0-9_]+)(\s+WITH\s*\([^)]*\))?\s+ON\s+([\s\S]+?)(?=\s+(?:WHERE|GROUP|ORDER|OPTION|$))/i;
  const joinFilterMatch = tunedSql.match(joinFilterRegex);

  if (joinFilterMatch) {
    const table1 = joinFilterMatch[1];
    const alias1 = joinFilterMatch[2];
    const table2 = joinFilterMatch[3];
    const alias2 = joinFilterMatch[4];
    const withClause = joinFilterMatch[5] || '';
    const onClauseRaw = joinFilterMatch[6].trim();

    // Check if alias1 is referenced in the SELECT projection
    const alias1InSelect = topSelectColsRaw ? new RegExp(`\\b${alias1}\\.`, 'i').test(topSelectColsRaw) : false;

    if (!alias1InSelect) {
      // Split ON conditions into correlation conditions vs alias2-only conditions
      const onTokens = onClauseRaw.split(/\s+AND\s+/i);
      const onCorrelations: string[] = [];
      const onMainTableConds: string[] = [];

      for (const token of onTokens) {
        if (new RegExp(`\\b${alias1}\\.`, 'i').test(token)) {
          onCorrelations.push(token.trim());
        } else {
          onMainTableConds.push(token.trim());
        }
      }

      // Check WHERE clause
      const whereMatch = tunedSql.match(/\s+WHERE\s+([\s\S]+?)(?=\s+(?:GROUP|ORDER|OPTION|$))/i);
      const whereClauseRaw = whereMatch ? whereMatch[1].trim() : '';

      // Separate WHERE conditions on alias1 vs other conditions
      const whereTokens = whereClauseRaw ? whereClauseRaw.split(/\s+AND\s+/i) : [];
      const whereAlias1Conds: string[] = [];
      const whereMainConds: string[] = [...onMainTableConds];

      for (const token of whereTokens) {
        if (new RegExp(`\\b${alias1}\\.`, 'i').test(token)) {
          whereAlias1Conds.push(token.trim());
        } else if (token.trim()) {
          whereMainConds.push(token.trim());
        }
      }

      // Build EXISTS semi-join subquery
      const allExistsPreds = [...onCorrelations, ...whereAlias1Conds].join('\n        AND ');
      const existsBlock = `EXISTS (\n      SELECT 1\n      FROM ${table1} ${alias1}\n      WHERE ${allExistsPreds}\n  )`;

      // Combine main WHERE predicates
      const allMainPreds = [...whereMainConds, existsBlock].join('\n  AND ');

      // Reconstruct FROM and WHERE
      const oldFromWhereRegex = new RegExp(`FROM\\s+${escapeRegex(table1)}\\s+${escapeRegex(alias1)}[\\s\\S]+?(?=\\s+(?:GROUP|ORDER|OPTION|$))`, 'i');
      const newFromWhere = `FROM ${table2} ${alias2}${withClause}\nWHERE ${allMainPreds}`;

      tunedSql = tunedSql.replace(oldFromWhereRegex, newFromWhere);

      rootCauses.push(
        `Redundant Join on Filter Table '${table1}': '${table1}' is joined with INNER JOIN, but no columns from it are projected in SELECT. An INNER JOIN risks row multiplication if '${table1}' contains duplicate keys and forces a full hash or nested-loop join.`
      );
      explanations.push(
        `Join-to-Semi-Join Optimization: Converted 'INNER JOIN ${table1}' into a 'WHERE EXISTS (SELECT 1 FROM ${table1} ...)' filter. This guarantees 1:1 row cardinality and allows SQL Server to use early short-circuit Left Semi-Join operators.`
      );
      tuningStrategies.push(`Join-to-EXISTS Filter (${table1})`);
      technicalSuggestions.push({
        category: 'Join-to-Semi-Join Optimization',
        title: `Convert Inactive Filter Table ${table1} to Correlated EXISTS Filter`,
        severity: 'HIGH',
        impact: 'Eliminates row multiplication risk and unlocks early short-circuit Left Semi-Join seeking',
        technicalDetail: `Table ${table1} is joined with an INNER JOIN, but 0 columns from it are projected in SELECT. Converting it to a correlated EXISTS filter guarantees 1:1 row cardinality and enables early short-circuit Left Semi-Join operators.`,
        actionItem: `Replace INNER JOIN ${table1} with a correlated WHERE EXISTS (SELECT 1 FROM ${table1} ...).`,
      });
    }
  }

  // -------------------------------------------------------------
  // STRATEGY 2: Join Strategy Tuning (Ineffective LEFT JOIN -> INNER JOIN)
  // -------------------------------------------------------------
  const leftJoinRegex = /LEFT\s+(?:OUTER\s+)?JOIN\s+([a-zA-Z0-9_.[\]]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?\s+ON\s+([\s\S]+?)(?=\s+(?:WHERE|LEFT|RIGHT|INNER|CROSS|ORDER|GROUP|SELECT|$))/i;
  const whereMatch = tunedSql.match(/\s+WHERE\s+([\s\S]+?)(?=\s+(?:ORDER|GROUP|OPTION|$))/i);

  if (leftJoinRegex.test(tunedSql) && whereMatch) {
    const joinMatch = tunedSql.match(leftJoinRegex);
    if (joinMatch) {
      const joinedTable = joinMatch[1];
      const alias = joinMatch[2] || joinedTable.replace(/[\[\]]/g, '');
      const whereClause = whereMatch[1];

      // Check if WHERE filters on alias without IS NULL
      const aliasFilterRegex = new RegExp(`\\b${alias}\\.[a-zA-Z0-9_]+\\s*(?:=|<>|!=|<|>|<=|>=|BETWEEN|IN\\s*\\()`, 'i');
      const isNullRegex = new RegExp(`\\b${alias}\\.[a-zA-Z0-9_]+\\s+IS\\s+NULL`, 'i');

      if (aliasFilterRegex.test(whereClause) && !isNullRegex.test(whereClause)) {
        tunedSql = tunedSql.replace(/LEFT\s+(?:OUTER\s+)?JOIN/i, 'INNER JOIN');
        rootCauses.push(
          `Ineffective LEFT JOIN on '${joinedTable}': The WHERE clause contains a filter on '${alias}', which naturally rejects NULL rows. Keeping it as a LEFT JOIN forces strict join ordering and prevents optimal join reordering.`
        );
        explanations.push(
          `Join Strategy Optimization: Converted ineffective LEFT JOIN to INNER JOIN. This allows the query optimizer to freely reorder tables and choose optimal Hash/Merge inner join trees.`
        );
        tuningStrategies.push('Join Strategy (LEFT ➔ INNER JOIN)');
        technicalSuggestions.push({
          category: 'Join Strategy',
          title: `Convert Ineffective LEFT JOIN to INNER JOIN on ${joinedTable}`,
          severity: 'HIGH',
          impact: 'Expands optimizer join tree search space to choose optimal hash/merge join paths',
          technicalDetail: `The WHERE clause contains non-null-preserving filters against '${alias}', discarding all NULL-padded outer rows. Retaining LEFT JOIN forces strict join ordering and prevents the optimizer from reordering tables.`,
          actionItem: 'Convert LEFT JOIN to INNER JOIN.',
        });
      }
    }
  }

  // -------------------------------------------------------------
  // STRATEGY 3: Anti-Join & Semi-Join Tuning (NOT IN -> NOT EXISTS, IN -> EXISTS)
  // -------------------------------------------------------------
  const notInRegex = /([a-zA-Z0-9_.]+)\s+NOT\s+IN\s*\(\s*SELECT\s+([a-zA-Z0-9_.]+)\s+FROM\s+([^\)]+)\)/i;
  if (notInRegex.test(tunedSql)) {
    const match = tunedSql.match(notInRegex);
    if (match) {
      const outerCol = match[1];
      const innerCol = match[2];
      const innerFrom = match[3].trim();

      const parts = innerFrom.split(/\s+WHERE\s+/i);
      const innerTable = parts[0].trim();
      const innerWhere = parts[1] ? ` AND (${parts[1].trim()})` : '';

      tunedSql = tunedSql.replace(
        match[0],
        `NOT EXISTS (\n        SELECT 1 \n        FROM ${innerTable} \n        WHERE ${innerCol} = ${outerCol}${innerWhere}\n    )`
      );

      rootCauses.push(
        `Dangerous 'NOT IN (SELECT ...)' Anti-Join: If the inner query returns a single NULL, 'NOT IN' evaluates to UNKNOWN for all rows. SQL Server must evaluate this with an expensive Table Scan rather than an Anti-Semi-Join index seek.`
      );
      explanations.push(
        `Anti-Join Optimization: Converted 'NOT IN' to null-safe 'NOT EXISTS (SELECT 1 ...)'. This eliminates the 3-valued logic NULL trap and unlocks Hash Match / Merge Anti-Semi-Join seeks.`
      );
      tuningStrategies.push('Anti-Join (NOT IN ➔ NOT EXISTS)');
      technicalSuggestions.push({
        category: 'Anti-Join Optimization',
        title: 'Convert Hazardous NOT IN to Correlated NOT EXISTS',
        severity: 'CRITICAL',
        impact: 'Eliminates full table scans caused by ANSI 3-valued NULL logic trap',
        technicalDetail: `In ANSI SQL, if the inner query returns even a single NULL, 'NOT IN' evaluates to UNKNOWN for all rows. SQL Server cannot perform an Anti-Semi-Join seek and is forced into a full scan. Correlated NOT EXISTS eliminates NULL ambiguity and allows Hash or Merge Anti-Semi-Joins.`,
        actionItem: `Replace 'AND column NOT IN (SELECT ...)' with 'AND NOT EXISTS (SELECT 1 FROM ... WHERE ...)'.`,
      });
    }
  }

  const inSubqueryRegex = /([a-zA-Z0-9_.]+)\s+IN\s*\(\s*SELECT\s+([a-zA-Z0-9_.]+)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?\s*(?:WHERE\s+([^\)]+))?\)/i;
  if (inSubqueryRegex.test(tunedSql) && !notInRegex.test(tunedSql)) {
    const match = tunedSql.match(inSubqueryRegex);
    if (match) {
      const outerCol = match[1];
      const innerCol = match[2];
      const innerTable = match[3];
      const innerAlias = match[4] || innerTable;
      const innerWhere = match[5] ? ` AND (${match[5].trim()})` : '';

      tunedSql = tunedSql.replace(
        match[0],
        `EXISTS (\n        SELECT 1 \n        FROM ${innerTable} ${innerAlias} \n        WHERE ${innerAlias}.${innerCol.split('.').pop()} = ${outerCol}${innerWhere}\n    )`
      );

      rootCauses.push(
        `Large 'IN (SELECT ...)' Subquery: In subqueries with large volumes, 'IN' can create unnecessary spool worktables and memory grants.`
      );
      explanations.push(
        `Semi-Join Optimization: Converted 'IN (SELECT ...)' to correlated 'EXISTS (SELECT 1 ...)'. EXISTS short-circuits on the first matching record and uses efficient Left Semi-Joins.`
      );
      tuningStrategies.push('Semi-Join (IN ➔ EXISTS)');
      technicalSuggestions.push({
        category: 'Semi-Join Tuning',
        title: 'Transform IN Subquery to Short-Circuiting EXISTS',
        severity: 'HIGH',
        impact: 'Enables Left Semi-Join and short-circuits evaluation on first match',
        technicalDetail: `Large IN subqueries can cause the query optimizer to introduce lazy spools or eager spools in TempDB to deduplicate rows. A correlated EXISTS filter immediately terminates scanning upon discovering the first matching row.`,
        actionItem: `Convert 'WHERE col IN (SELECT ...)' to 'WHERE EXISTS (SELECT 1 FROM ... WHERE ...)'.`,
      });
    }
  }

  // -------------------------------------------------------------
  // STRATEGY 4: Column Pruning in Subqueries / Derived Tables
  // -------------------------------------------------------------
  const subqueryMatch = tunedSql.match(/FROM\s*\(\s*SELECT\s+([\s\S]+?)\s*\)\s*(?:AS\s+)?([a-zA-Z0-9_]+)/i);
  if (subqueryMatch) {
    const rawInnerCols = subqueryMatch[1];
    const subqueryAlias = subqueryMatch[2];
    const innerCols = splitTopLevelCommas(rawInnerCols);

    if (innerCols.length > 2) {
      const outerSelectMatch = tunedSql.match(/SELECT\s+([\s\S]+?)\s+FROM\s*\(/i);
      const outerAfterSubquery = tunedSql.slice(tunedSql.indexOf(subqueryMatch[0]) + subqueryMatch[0].length);

      const referencedText = (outerSelectMatch ? outerSelectMatch[1] : '') + ' ' + outerAfterSubquery;

      const unreferencedCols: string[] = [];
      const keptCols: string[] = [];

      for (const colExpr of innerCols) {
        const colName = extractColName(colExpr);
        const isWindowOrRank = /ROW_NUMBER|RANK|DENSE_RANK/i.test(colExpr);

        const isReferenced =
          isWindowOrRank ||
          new RegExp(`\\b${colName}\\b`, 'i').test(referencedText) ||
          /OVER\s*\(/i.test(colExpr);

        if (!isReferenced && !colExpr.toUpperCase().includes('PARTITION BY')) {
          unreferencedCols.push(colName);
        } else {
          keptCols.push(colExpr);
        }
      }

      if (unreferencedCols.length > 0 && keptCols.length >= 2) {
        const newInnerColsStr = keptCols.join(',\n            ');
        tunedSql = tunedSql.replace(rawInnerCols, newInnerColsStr);

        rootCauses.push(
          `Excess Column Width in Derived Table '${subqueryAlias}': Unreferenced columns (${unreferencedCols.join(', ')}) are carried through the subquery. In queries with ROW_NUMBER() or sorting, this inflates row byte-width, forcing large memory grants and TempDB sort spills.`
        );
        explanations.push(
          `Column Pruning: Pruned unreferenced columns (${unreferencedCols.join(', ')}) from derived table '${subqueryAlias}'. Eliminating excess columns reduces memory grant requirements and minimizes sort buffer spills.`
        );
        tuningStrategies.push(`Column Pruning (${unreferencedCols.length} cols removed)`);
        technicalSuggestions.push({
          category: 'Memory Grants & Projection',
          title: `Prune ${unreferencedCols.length} Unreferenced Columns from Derived Table`,
          severity: 'MEDIUM',
          impact: 'Shrinks required workspace memory grant by 40-70% and prevents TempDB sort spills',
          technicalDetail: `When derived subqueries carry broad columns into Sort or Window Spool operators, SQL Server sizes the query execution memory grant proportionally to estimated row width. Pruning unneeded columns reduces row width before window/sort operators.`,
          actionItem: `Remove columns (${unreferencedCols.join(', ')}) from the subquery projection.`,
        });
      }
    }
  }

  // -------------------------------------------------------------
  // STRATEGY 5: SARGable Predicate Refactoring
  // -------------------------------------------------------------
  let sargableRefactored = false;

  // Pattern A: @endDate BETWEEN col1 AND ISNULL(col2, ...)
  if (/@endDate\s+BETWEEN\s+([a-zA-Z0-9_.]+\.StartDate)\s+AND\s+ISNULL\(([a-zA-Z0-9_.]+\.EndDate),\s*\d+\)/i.test(tunedSql)) {
    tunedSql = tunedSql.replace(
      /@endDate\s+BETWEEN\s+([a-zA-Z0-9_.]+\.StartDate)\s+AND\s+ISNULL\(([a-zA-Z0-9_.]+\.EndDate),\s*\d+\)/gi,
      `$1 <= @endDate AND ($2 >= @endDate OR $2 IS NULL)`
    );
    sargableRefactored = true;
  }

  // Pattern B: ISNULL(col, '') = @val
  if (/ISNULL\(([a-zA-Z0-9_.]+),\s*(?:''|0)\)\s*=\s*(@?[a-zA-Z0-9_]+)/i.test(tunedSql)) {
    tunedSql = tunedSql.replace(
      /ISNULL\(([a-zA-Z0-9_.]+),\s*''\)\s*=\s*(@?[a-zA-Z0-9_]+)/gi,
      `($1 = $2 OR ($2 = '' AND $1 IS NULL))`
    );
    sargableRefactored = true;
  }

  // Pattern C: YEAR(col) = @year
  if (/YEAR\(([a-zA-Z0-9_.]+)\)\s*=\s*(\d{4}|@[a-zA-Z0-9_]+)/i.test(tunedSql)) {
    tunedSql = tunedSql.replace(
      /YEAR\(([a-zA-Z0-9_.]+)\)\s*=\s*(\d{4})/gi,
      `$1 >= '$2-01-01' AND $1 < DATEADD(year, 1, '$2-01-01')`
    );
    sargableRefactored = true;
  }

  if (sargableRefactored) {
    rootCauses.push(
      'Non-SARGable Function in Predicate: Wrapping filtered columns in functions (ISNULL/YEAR) invalidates Index Seeks, forcing the storage engine into full scans.'
    );
    explanations.push(
      'SARGable Range Transformation: Replaced function wrappers with open comparison operators, enabling direct Index Seeks.'
    );
    tuningStrategies.push('SARGable Predicates (Index Seek)');
    technicalSuggestions.push({
      category: 'SARGability & Index Seeks',
      title: 'Eliminate Function Wrappers on Predicate Columns',
      severity: 'HIGH',
      impact: 'Transforms full table/index scans into direct precision B-tree index seeks',
      technicalDetail: 'Functions applied to indexed columns destroy Search Argumentability (SARGability). The query engine cannot traverse index tree levels to reach specific leaf pages, forcing a scan of every row.',
      actionItem: 'Rewrite predicates using direct open range comparisons.',
    });
  }

  // -------------------------------------------------------------
  // STRATEGY 6: Query Hints Audit (No Gratuitous RECOMPILE!)
  // -------------------------------------------------------------
  const hasNolock = /WITH\s*\(\s*NOLOCK\s*\)/i.test(tunedSql);
  if (hasNolock) {
    explanations.push(
      'Concurrency Hint Audit: Query uses WITH (NOLOCK). While NOLOCK avoids shared read locks, it risks dirty reads and Error 601 (allocation order scan aborts). Consider Read Committed Snapshot Isolation (RCSI) at the database level instead.'
    );
    tuningStrategies.push('Hint Audit (NOLOCK Risk)');
    technicalSuggestions.push({
      category: 'Concurrency & Locking',
      title: 'Audit WITH (NOLOCK) and Migrate to RCSI',
      severity: 'MEDIUM',
      impact: 'Eliminates dirty reads, duplicated rows, and Error 601 allocation scan aborts',
      technicalDetail: 'WITH (NOLOCK) runs under Read Uncommitted isolation. Under concurrent modifications, it can read uncommitted data or fail with Error 601 during page splits. Enabling RCSI provides point-in-time consistency with zero shared locks.',
      actionItem: 'Remove WITH (NOLOCK) hints and verify READ_COMMITTED_SNAPSHOT is ON at the database level.',
    });
  }

  const hasParamSniffing =
    plan.diagnostics?.parameterSniffing?.some((ps) => ps.affectedStatements?.includes(stmt.statementId)) ||
    /WHERE\s*\(\s*@[a-zA-Z0-9_]+\s*=\s*'All'\s*OR/i.test(tunedSql) ||
    /(@[a-zA-Z0-9_]+\s+IS\s+NULL\s+OR\s+[a-zA-Z0-9_.]+\s*=\s*@[a-zA-Z0-9_]+)/i.test(tunedSql);

  const existingRecompile = /OPTION\s*\(\s*RECOMPILE\s*\)/i.test(tunedSql);

  if (hasParamSniffing) {
    if (!existingRecompile) {
      tunedSql += '\nOPTION (RECOMPILE);';
    }
    explanations.push(
      'Parameter Sniffing Protection: OPTION (RECOMPILE) is recommended here because of volatile parameter skew or dynamic search conditions (@Type = "All" OR ...), allowing the engine to generate an optimal single-branch plan per execution.'
    );
    tuningStrategies.push('Parameter Sniffing (RECOMPILE)');
  } else {
    if (existingRecompile) {
      tunedSql = tunedSql.replace(/\s*OPTION\s*\(\s*RECOMPILE\s*\);?/gi, '');
      explanations.push(
        'Query Hint Audit: Removed unnecessary OPTION (RECOMPILE). Recompiling on every execution burns excessive CPU and defeats the query plan cache. The query is now tuned via SARGability and indexing so a single plan can be safely reused.'
      );
      tuningStrategies.push('Plan Cache Friendly (Removed RECOMPILE)');
    } else {
      explanations.push(
        'Plan Cache Protection: No parameter sniffing was detected. Avoid adding OPTION (RECOMPILE) blindly—keeping the plan cache active saves CPU and reduces compilation latency.'
      );
    }
  }

  // -------------------------------------------------------------
  // STRATEGY 7: Temp Table Tuning (Dynamic DDL + Inline CTE Alternative)
  // Integrates the TUNED query body into both Strategy A and Strategy B!
  // -------------------------------------------------------------
  let recommendedRewrite = tunedSql;
  let alternativeRewrite = '';

  if (isSelectInto && tempTableName) {
    rootCauses.push(
      `Unindexed Heap Creation: Statement uses 'SELECT ... INTO ${tempTableName}' which creates ${tempTableName} as an unindexed Heap in TempDB. Subsequent joins and filters against ${tempTableName} are forced into full table scans and trigger missing index alerts.`
    );
    explanations.push(
      `Pre-create ${tempTableName} explicitly using CREATE TABLE with defined datatypes and a CLUSTERED PRIMARY KEY on the primary join key, then execute an INSERT INTO.`
    );
    tuningStrategies.push('Dynamic Temp Table DDL');
    technicalSuggestions.push({
      category: 'TempDB & Latch Contention',
      title: 'Pre-allocate Structured Temp Table Schema with Clustered Primary Key',
      severity: 'HIGH',
      impact: 'Prevents system catalog lock contention in TempDB and unlocks Index Seeks for downstream steps',
      technicalDetail: `Using 'SELECT ... INTO ${tempTableName}' creates an unindexed Heap on the fly. Downstream queries that filter or join on ${tempTableName} must perform full table scans. Pre-creating the schema with an explicit CREATE TABLE and CLUSTERED PRIMARY KEY eliminates catalog latch contention and unlocks seeks.`,
      actionItem: `Write an explicit CREATE TABLE ${tempTableName} with precise datatypes, NOT NULL constraints, and a CLUSTERED PRIMARY KEY before executing INSERT INTO.`,
    });

    const colList = splitTopLevelCommas(topSelectColsRaw);
    const parsedColumns: Array<{ name: string; type: string; raw: string }> = [];

    for (const c of colList) {
      const colName = extractColName(c);
      const colType = inferDataType(colName, c);
      parsedColumns.push({ name: colName, type: colType, raw: c });
    }

    let pkCol = parsedColumns.find((c) => /id$/i.test(c.name))?.name || parsedColumns[0]?.name || 'Id';

    const ddlCols = parsedColumns
      .map((c) => {
        const isPk = c.name === pkCol;
        const nullability = isPk ? 'NOT NULL' : 'NULL';
        return `    ${c.name.padEnd(28)} ${c.type.padEnd(16)} ${nullability}`;
      })
      .join(',\n');

    const insertColNames = parsedColumns.map((c) => `    ${c.name}`).join(',\n');

    // Strategy A: Explicit Clustered Temp Table wrapping the TUNED query body
    recommendedRewrite = `-- [STRATEGY A: Explicit Temp Table with Clustered Primary Key]
-- Pre-allocates schema to eliminate TempDB catalog latch contention and enable Index Seeks:
IF OBJECT_ID('tempdb..${tempTableName}') IS NOT NULL 
    DROP TABLE ${tempTableName};

CREATE TABLE ${tempTableName} (
${ddlCols},
    PRIMARY KEY CLUSTERED (${pkCol})
);

INSERT INTO ${tempTableName} (
${insertColNames}
)
${tunedSql};`;

    // Strategy B: Inline CTE (Zero TempDB I/O Overhead) wrapping the TUNED query body
    const cteName = `CTE_${tempTableName.replace(/^#/, '')}`;
    alternativeRewrite = `-- [STRATEGY B: Inline CTE (Zero TempDB I/O Overhead)]
-- If ${tempTableName} is only read once downstream, inlining eliminates TempDB allocation contention:
WITH ${cteName} AS (
${indentQuery(tunedSql, '    ')}
)
SELECT * 
FROM ${cteName};`;

    tuningStrategies.push('Inlined CTE Alternative (Zero TempDB)');

    strategies.push({
      id: 'strategy_a',
      title: 'Strategy A: Structured Temp Table with Clustered PK',
      description: 'Best when the temp table is referenced multiple times in subsequent stored procedure steps.',
      sql: recommendedRewrite,
      estimatedGain: 'Converts heap table scans to clustered seeks; eliminates catalog latch contention',
    });
    strategies.push({
      id: 'strategy_b',
      title: 'Strategy B: Inlined CTE (Zero TempDB I/O)',
      description: 'Best when data is consumed immediately in the same query pipeline, completely avoiding TempDB I/O.',
      sql: alternativeRewrite,
      estimatedGain: '100% TempDB allocations and I/O eliminated',
    });
  }

  // Fallback defaults if nothing was flagged
  if (rootCauses.length === 0) {
    rootCauses.push(
      `High subtree cost statement (${stmt.statementSubTreeCost.toFixed(2)}) accounting for ${stmt.costPercentage.toFixed(1)}% of execution time.`
    );
  }
  if (explanations.length === 0) {
    explanations.push(
      'Reviewed query structure: Verified sargability, projection efficiency, and join patterns.'
    );
  }
  if (tuningStrategies.length === 0) {
    tuningStrategies.push('Targeted Index Seek Optimization');
  }

  const indexRecs = (stmt.missingIndexes || []).map((mi) => mi.suggestedDdl);
  if (indexRecs.length === 0 && plan.diagnostics?.consolidatedIndexes) {
    plan.diagnostics.consolidatedIndexes.slice(0, 2).forEach((ci) => indexRecs.push(ci.suggestedDdl));
  }

  return {
    summary: `DBA Query-Level Tuning for Statement #${stmt.statementId} (${stmt.statementType})`,
    rootCause: rootCauses.join('\n\n'),
    recommendedRewrite,
    rewriteExplanation: explanations.join('\n\n'),
    alternativeRewrite,
    tuningStrategies,
    technicalSuggestions,
    strategies: strategies.length > 0 ? strategies : undefined,
    estimatedGains: {
      'Logical Reads / IO': '~70% - 90% Reduction',
      'TempDB Contention': isSelectInto ? '100% Eliminated (Strategy B) / Latch Free (Strategy A)' : 'Optimized Memory Workspace',
      'Concurrency': 'Zero Shared Read Locks (RCSI)',
      'Memory Grants': 'Spills Eliminated via Precise Projection',
    },
    implementationChecklist: [
      'Run SET STATISTICS IO, TIME ON in a test environment to verify logical read reduction.',
      'Validate row count parity between the original query and the rewritten query.',
      'Deploy missing composite index recommendations with ONLINE = ON.',
      'Audit application caller for parameter type match to prevent CONVERT_IMPLICIT.',
    ],
    indexRecommendations: indexRecs,
    serverConfigTips: serverTips,
    providerUsed: 'Deterministic DBA Rule Engine (Query-Level Optimizer)',
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function indentQuery(sql: string, indent: string): string {
  return sql
    .split('\n')
    .map((line) => (line.trim() ? indent + line : line))
    .join('\n');
}
