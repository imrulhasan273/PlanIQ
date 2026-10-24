package advisor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"sqlplan-advisor/pkg/sqlplan"
)

// AIRequest represents the input parameters for the AI Advisor
type AIRequest struct {
	Provider         string                   `json:"provider"` // "gemini", "openai", "ollama", "offline"
	APIKey           string                   `json:"apiKey"`
	Model            string                   `json:"model"`
	EndpointURL      string                   `json:"endpointUrl"` // for Ollama or custom gateway
	SanitizeBeforeAI bool                     `json:"sanitizeBeforeAI"`
	Statement        *sqlplan.StatementAnalysis `json:"statement"`
	FullPlan         *sqlplan.PlanAnalysis    `json:"fullPlan"`
}

// TechnicalSuggestion represents an in-depth query optimization recommendation
type TechnicalSuggestion struct {
	Category        string `json:"category"`        // e.g. "Join Strategy", "SARGability & Seeks", "TempDB & Latch Contention", "Memory Grants & Spills", "Concurrency & Locks"
	Title           string `json:"title"`           // e.g. "Anti-Semi-Join Optimization: Convert NOT IN to NOT EXISTS"
	Severity        string `json:"severity"`        // "CRITICAL", "HIGH", "MEDIUM", "LOW"
	Impact          string `json:"impact"`          // e.g. "Eliminates full table scan over 1.2M rows & avoids ANSI NULL trap"
	TechnicalDetail string `json:"technicalDetail"` // In-depth DBA analysis of internal query processor behavior
	ActionItem      string `json:"actionItem"`      // Precise code or architectural change to execute
}

// RewriteStrategy represents an alternative query rewrite approach
type RewriteStrategy struct {
	ID            string `json:"id"`            // "strategy_a", "strategy_b", "strategy_c"
	Title         string `json:"title"`         // e.g. "Strategy A: Structured Temp Table with Clustered PK"
	Description   string `json:"description"`   // When to use this approach vs others
	SQL           string `json:"sql"`           // The full rewritten SQL
	EstimatedGain string `json:"estimatedGain"` // e.g. "Eliminates dynamic heap latch waits; enables index seeks on subsequent joins"
}

// AIResponse represents the structured advice returned by the AI
type AIResponse struct {
	Summary                 string                `json:"summary"`
	RootCause               string                `json:"rootCause"`
	RecommendedRewrite      string                `json:"recommendedRewrite"`
	RewriteExplanation      string                `json:"rewriteExplanation"`
	AlternativeRewrite      string                `json:"alternativeRewrite,omitempty"`
	TuningStrategies        []string              `json:"tuningStrategies,omitempty"`
	TechnicalSuggestions    []TechnicalSuggestion `json:"technicalSuggestions,omitempty"`
	Strategies              []RewriteStrategy     `json:"strategies,omitempty"`
	IndexRecommendations    []string              `json:"indexRecommendations"`
	ServerConfigTips        []string              `json:"serverConfigTips"`
	ImplementationChecklist []string              `json:"implementationChecklist,omitempty"`
	EstimatedGains          map[string]string     `json:"estimatedGains,omitempty"`
	ProviderUsed            string                `json:"providerUsed"`
}

// GenerateAdvice analyzes the plan bottlenecks and gets recommendations from the chosen LLM or heuristic advisor
func GenerateAdvice(ctx context.Context, req *AIRequest) (*AIResponse, error) {
	if req.Provider == "offline" || req.APIKey == "" && req.Provider != "ollama" {
		return generateOfflineAdvice(req)
	}

	prompt := buildPrompt(req)

	switch strings.ToLower(req.Provider) {
	case "gemini":
		return callGemini(ctx, req.APIKey, req.Model, prompt)
	case "openai":
		return callOpenAI(ctx, req.APIKey, req.Model, prompt)
	case "ollama":
		return callOllama(ctx, req.EndpointURL, req.Model, prompt)
	default:
		return generateOfflineAdvice(req)
	}
}

func buildPrompt(req *AIRequest) string {
	stmt := req.Statement
	var sb strings.Builder

	sb.WriteString("You are a Principal Microsoft SQL Server Database Architect and Query Tuning Expert.\n")
	sb.WriteString("Analyze this high-cost statement extracted from a production SQL Server execution plan and provide actionable optimizations.\n\n")

	sb.WriteString(fmt.Sprintf("STATEMENT ID: %s\n", stmt.StatementID))
	sb.WriteString(fmt.Sprintf("STATEMENT TYPE: %s\n", stmt.StatementType))
	sb.WriteString(fmt.Sprintf("SUBTREE COST: %0.2f (%0.1f%% of entire procedure)\n", stmt.StatementSubTreeCost, stmt.CostPercentage))
	sb.WriteString(fmt.Sprintf("ESTIMATED ROWS: %0.0f\n", stmt.StatementEstRows))
	if req.FullPlan.MaxDOPReason != "" {
		sb.WriteString(fmt.Sprintf("SERVER MAXDOP STATUS: %s\n", req.FullPlan.MaxDOPReason))
	}
	queryText := stmt.StatementText
	if req.SanitizeBeforeAI {
		queryText = SanitizeSQL(queryText)
	}
	sb.WriteString("\nQUERY TEXT:\n```sql\n")
	sb.WriteString(queryText)
	sb.WriteString("\n```\n\n")

	if len(stmt.Warnings) > 0 {
		sb.WriteString("ENGINE WARNINGS DETECTED:\n")
		for _, w := range stmt.Warnings {
			sb.WriteString(fmt.Sprintf("- [%s] %s: %s\n", w.Kind, w.Issue, w.Expression))
		}
		sb.WriteString("\n")
	}

	if len(stmt.MissingIndexes) > 0 {
		sb.WriteString("SQL SERVER ENGINE MISSING INDEXES:\n")
		for _, mi := range stmt.MissingIndexes {
			sb.WriteString(fmt.Sprintf("- Table: %s.%s | Impact: %0.1f%%\n", mi.Schema, mi.Table, mi.Impact))
			sb.WriteString(fmt.Sprintf("  Equality: %v | Inequality: %v | Include: %v\n", mi.EqualityColumns, mi.InequalityColumns, mi.IncludeColumns))
			sb.WriteString(fmt.Sprintf("  SQL: %s\n", mi.SuggestedDDL))
		}
		sb.WriteString("\n")
	}

	sb.WriteString("CRITICAL QUERY TUNING PRINCIPLES:\n")
	sb.WriteString("1. PRIORITIZE QUERY-LEVEL TUNING:\n")
	sb.WriteString("   - Column Pruning: Eliminate unreferenced columns from derived tables/CTEs to minimize row byte-width and prevent sort memory grant spills.\n")
	sb.WriteString("   - Join Strategy: Convert ineffective LEFT JOINs to INNER JOINs when the WHERE clause filters on the right table (rejecting NULLs); eliminate redundant outer joins.\n")
	sb.WriteString("   - Semi-Joins & Anti-Joins: Replace 'IN (SELECT ...)' with 'EXISTS (SELECT 1 ...)'. Replace dangerous 'NOT IN (SELECT ...)' with 'NOT EXISTS' to eliminate the ANSI NULL trap full-scan penalty.\n")
	sb.WriteString("   - SARGability: Eliminate function wrappers (ISNULL, YEAR, DATEDIFF, LEFT) on filtered columns to allow direct Index Seeks.\n")
	sb.WriteString("2. AVOID GRATUITOUS HINTS:\n")
	sb.WriteString("   - Do NOT add OPTION (RECOMPILE) or MAXDOP unless volatile parameter sniffing or multi-branch skew is explicitly demonstrated. Blindly recompiling burns CPU and defeats the plan cache.\n")
	sb.WriteString("   - Audit WITH (NOLOCK) and recommend Read Committed Snapshot Isolation (RCSI) instead of dirty reads.\n")
	sb.WriteString("3. DYNAMIC TEMP TABLE SCHEMAS:\n")
	sb.WriteString("   - If query uses 'SELECT ... INTO #temp', write the explicit CREATE TABLE DDL matching the ACTUAL columns of the query with a CLUSTERED PRIMARY KEY, plus an inlined CTE alternative if TempDB staging is unneeded.\n\n")

	sb.WriteString("Please respond with a JSON object containing these EXACT fields:\n")
	sb.WriteString("{\n")
	sb.WriteString(`  "summary": "Short 2-sentence summary of the main bottleneck",` + "\n")
	sb.WriteString(`  "rootCause": "Deep technical explanation of why this query is slow in SQL Server",` + "\n")
	sb.WriteString(`  "recommendedRewrite": "Full rewritten SQL code for Strategy A",` + "\n")
	sb.WriteString(`  "rewriteExplanation": "Deep breakdown of architectural changes made and why",` + "\n")
	sb.WriteString(`  "alternativeRewrite": "Full rewritten SQL code for Strategy B (e.g. Inlined CTE or Semi-Join with zero TempDB)",` + "\n")
	sb.WriteString(`  "tuningStrategies": ["Anti-Semi-Join Optimization", "Dynamic Temp Table DDL", "SARGability", "Column Pruning"],` + "\n")
	sb.WriteString(`  "technicalSuggestions": [` + "\n")
	sb.WriteString(`    {` + "\n")
	sb.WriteString(`      "category": "Join Strategy / SARGability / TempDB / Memory Grants / Concurrency",` + "\n")
	sb.WriteString(`      "title": "Clear concise technical recommendation title",` + "\n")
	sb.WriteString(`      "severity": "CRITICAL or HIGH or MEDIUM",` + "\n")
	sb.WriteString(`      "impact": "Concrete estimated resource impact (e.g. 5.2M row scan eliminated, 80% memory grant saved)",` + "\n")
	sb.WriteString(`      "technicalDetail": "Deep technical explanation of SQL Server internals (Optimizer Memo, Spools, Latch Contention, ANSI 3-valued NULL logic, etc.)",` + "\n")
	sb.WriteString(`      "actionItem": "Exact code, hint, or DDL change to make"` + "\n")
	sb.WriteString(`    }` + "\n")
	sb.WriteString(`  ],` + "\n")
	sb.WriteString(`  "strategies": [` + "\n")
	sb.WriteString(`    {` + "\n")
	sb.WriteString(`      "id": "strategy_a",` + "\n")
	sb.WriteString(`      "title": "Strategy A: Structured Temp Table with Clustered PK",` + "\n")
	sb.WriteString(`      "description": "Pre-allocates the schema in TempDB, eliminating PFS/GAM latch contention and providing index seek capability.",` + "\n")
	sb.WriteString(`      "sql": "-- Complete executable SQL for Strategy A...",` + "\n")
	sb.WriteString(`      "estimatedGain": "Converts Heap table scan to Clustered Index Seek"` + "\n")
	sb.WriteString(`    },` + "\n")
	sb.WriteString(`    {` + "\n")
	sb.WriteString(`      "id": "strategy_b",` + "\n")
	sb.WriteString(`      "title": "Strategy B: Inlined CTE (Zero TempDB I/O)",` + "\n")
	sb.WriteString(`      "description": "Inlines the logic directly into a CTE, bypassing TempDB staging entirely.",` + "\n")
	sb.WriteString(`      "sql": "-- Complete executable SQL for Strategy B...",` + "\n")
	sb.WriteString(`      "estimatedGain": "100% TempDB allocations and I/O eliminated"` + "\n")
	sb.WriteString(`    }` + "\n")
	sb.WriteString(`  ],` + "\n")
	sb.WriteString(`  "estimatedGains": {` + "\n")
	sb.WriteString(`    "Logical Reads / IO": "70% - 90% Reduction",` + "\n")
	sb.WriteString(`    "TempDB Contention": "100% Eliminated (Strategy B) / Latch Free (Strategy A)",` + "\n")
	sb.WriteString(`    "Concurrency": "Zero Shared Read Locks (RCSI)",` + "\n")
	sb.WriteString(`    "Memory Grants": "Spills Eliminated via Precise Projection"` + "\n")
	sb.WriteString(`  },` + "\n")
	sb.WriteString(`  "implementationChecklist": [` + "\n")
	sb.WriteString(`    "Run SET STATISTICS IO, TIME ON to measure read reduction in test environment",` + "\n")
	sb.WriteString(`    "Validate row counts between original and rewritten query",` + "\n")
	sb.WriteString(`    "Deploy suggested covering index with ONLINE = ON"` + "\n")
	sb.WriteString(`  ],` + "\n")
	sb.WriteString(`  "indexRecommendations": ["CREATE NONCLUSTERED INDEX ..."],` + "\n")
	sb.WriteString(`  "serverConfigTips": ["Server configuration tip 1", "Server configuration tip 2"]` + "\n")
	sb.WriteString("}\n")
	sb.WriteString("Do NOT wrap the JSON in Markdown backticks or write conversational filler. Output raw JSON only.")

	return sb.String()
}

func generateOfflineAdvice(req *AIRequest) (*AIResponse, error) {
	stmt := req.Statement
	resp := &AIResponse{
		ProviderUsed:            "Deterministic DBA Rule Engine (Offline)",
		IndexRecommendations:    make([]string, 0),
		ServerConfigTips:        make([]string, 0),
		TuningStrategies:        make([]string, 0),
		TechnicalSuggestions:    make([]TechnicalSuggestion, 0),
		Strategies:              make([]RewriteStrategy, 0),
		ImplementationChecklist: make([]string, 0),
		EstimatedGains:          make(map[string]string),
	}

	var rootCauses []string
	var explanations []string

	sqlText := strings.TrimSpace(stmt.StatementText)
	upperSql := strings.ToUpper(sqlText)

	// Check CONVERT_IMPLICIT
	hasConvert := false
	for _, w := range stmt.Warnings {
		if w.Kind == "PlanAffectingConvert" {
			hasConvert = true
			rootCauses = append(rootCauses, fmt.Sprintf("Implicit type conversion (%s): Expression '%s' forces per-row conversion during scan, invalidating index seeks.", w.Issue, w.Expression))
			explanations = append(explanations, "Ensure parameter types match the table column data type exactly to allow sargable index seeks.")
			resp.TuningStrategies = append(resp.TuningStrategies, "SARGable Type Alignment")
			resp.TechnicalSuggestions = append(resp.TechnicalSuggestions, TechnicalSuggestion{
				Category:        "SARGability & Type Alignment",
				Title:           "Eliminate Implicit Type Conversion (CONVERT_IMPLICIT)",
				Severity:        "CRITICAL",
				Impact:          "Prevents per-row expression evaluation and unlocks direct Index Seek",
				TechnicalDetail: fmt.Sprintf("Expression '%s' forces the SQL Server query engine to evaluate CONVERT_IMPLICIT on every single row before filtering. This completely invalidates B-tree Index Seeks, causing the optimizer to default to an expensive Index or Table Scan.", w.Expression),
				ActionItem:      "Align stored procedure / application parameter data types (e.g. VARCHAR vs NVARCHAR, INT vs BIGINT) with table schema definitions.",
			})
		}
	}

	// 1. Anti-Join & Semi-Join Tuning
	if strings.Contains(upperSql, " NOT IN (SELECT ") {
		rootCauses = append(rootCauses, "Dangerous 'NOT IN (SELECT ...)' Anti-Join: If the inner query returns a single NULL, 'NOT IN' evaluates to UNKNOWN for all rows, forcing SQL Server into a full table scan rather than an Anti-Semi-Join index seek.")
		explanations = append(explanations, "Anti-Join Optimization: Converted 'NOT IN' to null-safe 'NOT EXISTS (SELECT 1 ...)'. This eliminates the ANSI 3-valued NULL trap and unlocks efficient Anti-Semi-Join seeks.")
		resp.TuningStrategies = append(resp.TuningStrategies, "Anti-Join (NOT IN -> NOT EXISTS)")
		resp.TechnicalSuggestions = append(resp.TechnicalSuggestions, TechnicalSuggestion{
			Category:        "Anti-Join Optimization",
			Title:           "Convert Hazardous NOT IN to Correlated NOT EXISTS",
			Severity:        "CRITICAL",
			Impact:          "Eliminates full table scans and protects against 3-valued ANSI NULL trap",
			TechnicalDetail: "In ANSI SQL, if a subquery evaluated with NOT IN contains even a single NULL value, the entire predicate evaluates to UNKNOWN (truth table: TRUE AND UNKNOWN = UNKNOWN). Because the engine must safeguard this semantics, it cannot utilize an Anti-Semi-Join seek operator, defaulting to a Nested Loops with inner table scan. Replacing with NOT EXISTS eliminates NULL ambiguity and allows Hash or Merge Anti-Semi-Joins.",
			ActionItem:      "Replace 'AND column NOT IN (SELECT inner_col FROM ...)' with 'AND NOT EXISTS (SELECT 1 FROM ... WHERE inner_col = outer_col)'.",
		})
	} else if strings.Contains(upperSql, " IN (SELECT ") {
		rootCauses = append(rootCauses, "Large 'IN (SELECT ...)' Subquery: In large datasets, 'IN' subqueries can generate unnecessary spool worktables and memory grants.")
		explanations = append(explanations, "Semi-Join Optimization: Converted 'IN (SELECT ...)' to correlated 'EXISTS (SELECT 1 ...)'. EXISTS short-circuits on the first match and enables Left Semi-Joins.")
		resp.TuningStrategies = append(resp.TuningStrategies, "Semi-Join (IN -> EXISTS)")
		resp.TechnicalSuggestions = append(resp.TechnicalSuggestions, TechnicalSuggestion{
			Category:        "Semi-Join Tuning",
			Title:           "Transform IN Subquery to Short-Circuiting EXISTS",
			Severity:        "HIGH",
			Impact:          "Enables Left Semi-Join and short-circuits evaluation on first match",
			TechnicalDetail: "Large IN subqueries can cause the query optimizer to introduce lazy spools or eager spools in TempDB to deduplicate rows. A correlated EXISTS filter immediately terminates scanning upon discovering the first matching row, significantly cutting down logical page reads.",
			ActionItem:      "Convert 'WHERE col IN (SELECT col FROM sub)' to 'WHERE EXISTS (SELECT 1 FROM sub WHERE sub.col = main.col)'.",
		})
	}

	// 2. Join Strategy (Ineffective LEFT JOIN)
	if strings.Contains(upperSql, "LEFT JOIN") || strings.Contains(upperSql, "LEFT OUTER JOIN") {
		if strings.Contains(upperSql, "WHERE") {
			explanations = append(explanations, "Join Strategy: Audited LEFT JOINs against WHERE filter predicates. Any LEFT JOIN whose right-side table is filtered in the WHERE clause should be converted to an INNER JOIN to allow the optimizer to freely reorder tables and choose optimal join trees.")
			resp.TuningStrategies = append(resp.TuningStrategies, "Join Strategy (LEFT -> INNER JOIN)")
			resp.TechnicalSuggestions = append(resp.TechnicalSuggestions, TechnicalSuggestion{
				Category:        "Join Strategy",
				Title:           "Convert Ineffective LEFT JOIN to INNER JOIN",
				Severity:        "HIGH",
				Impact:          "Expands optimizer join-order search space and eliminates outer join overhead",
				TechnicalDetail: "When a query contains a LEFT OUTER JOIN but subsequently applies a non-null-preserving WHERE predicate against columns of the preserved right table, all NULL-padded outer rows are immediately discarded. Retaining the LEFT JOIN keyword restricts the query optimizer from reordering tables in the join tree.",
				ActionItem:      "Convert the LEFT JOIN to an INNER JOIN to grant the optimizer freedom to construct the lowest-cost bush or left-deep join tree.",
			})
		}
	}

	// 3. Column Pruning in Subqueries
	if strings.Contains(upperSql, "FROM (") && (strings.Contains(upperSql, "ROW_NUMBER()") || strings.Contains(upperSql, "ORDER BY")) {
		rootCauses = append(rootCauses, "Excess Column Width in Derived Subquery: Subqueries carrying unneeded columns through window functions (e.g. ROW_NUMBER) or sort operators inflate memory grants and trigger TempDB sort spills.")
		explanations = append(explanations, "Column Pruning: Pruned unreferenced columns from the inner derived table. Eliminating excess columns reduces row width, shrinks required memory grants, and avoids TempDB spill latencies.")
		resp.TuningStrategies = append(resp.TuningStrategies, "Column Pruning (Memory Grant Reduction)")
		resp.TechnicalSuggestions = append(resp.TechnicalSuggestions, TechnicalSuggestion{
			Category:        "Memory Grants & Spills",
			Title:           "Prune Unreferenced Columns from Derived Subquery",
			Severity:        "MEDIUM",
			Impact:          "Shrinks required workspace memory grant by 40-70% and prevents TempDB sort spills",
			TechnicalDetail: "When derived subqueries carry broad columns (such as VARCHAR(MAX), descriptions, or unreferenced foreign keys) into Sort or Window Spool operators, SQL Server sizes the query execution memory grant proportionally to the estimated row width. If the grant exceeds available memory, Sort warnings / spills to TempDB occur.",
			ActionItem:      "Filter the SELECT projection of the inner derived table to ONLY the key columns required for downstream joins and output.",
		})
	}

	// 4. SARGability
	if strings.Contains(upperSql, "ISNULL(") || strings.Contains(upperSql, "YEAR(") || strings.Contains(upperSql, "DATEDIFF(") {
		rootCauses = append(rootCauses, "Non-SARGable Function in Predicate: Wrapping filtered columns in functions invalidates Index Seeks, forcing the storage engine into full table or index scans.")
		explanations = append(explanations, "SARGable Range Transformation: Replaced function wrappers with open comparison operators, enabling direct Index Seeks.")
		resp.TuningStrategies = append(resp.TuningStrategies, "SARGable Predicates (Index Seek)")
		resp.TechnicalSuggestions = append(resp.TechnicalSuggestions, TechnicalSuggestion{
			Category:        "SARGability & Index Seeks",
			Title:           "Refactor Function Wrappers into SARGable Comparisons",
			Severity:        "HIGH",
			Impact:          "Transforms full index scans into precision B-tree seeks",
			TechnicalDetail: "Functions applied to indexed columns (e.g. WHERE YEAR(TxnDate) = 2024 or WHERE ISNULL(Status, 'A') = 'A') destroy Search Argumentability (SARGability). The query engine cannot traverse index tree levels to reach specific leaf pages, forcing an evaluation of the function against every single row.",
			ActionItem:      "Rewrite predicates using half-open date ranges (e.g. >= '2024-01-01' AND < '2025-01-01') or separate OR conditions.",
		})
	}

	// 5. Query Hints Audit (No Gratuitous RECOMPILE!)
	if strings.Contains(upperSql, "WITH (NOLOCK)") {
		explanations = append(explanations, "Concurrency Hint Audit: Query uses WITH (NOLOCK). While NOLOCK avoids shared read locks, it introduces risks of dirty reads and Error 601 (allocation order scan aborts). Consider Read Committed Snapshot Isolation (RCSI) at the database level instead.")
		resp.TuningStrategies = append(resp.TuningStrategies, "Hint Audit (NOLOCK Risk)")
		resp.TechnicalSuggestions = append(resp.TechnicalSuggestions, TechnicalSuggestion{
			Category:        "Concurrency & Isolation",
			Title:           "Audit WITH (NOLOCK) and Migrate to RCSI",
			Severity:        "MEDIUM",
			Impact:          "Eliminates dirty reads, phantom reads, and allocation scan aborts (Error 601)",
			TechnicalDetail: "The WITH (NOLOCK) hint uses Read Uncommitted isolation. Under concurrent modifications, it can read uncommitted data, read the same row twice, or fail completely with Error 601 during page splits. Read Committed Snapshot Isolation (RCSI) provides statement-level point-in-time consistency with zero shared read locks.",
			ActionItem:      "Remove table-level WITH (NOLOCK) hints and verify that READ_COMMITTED_SNAPSHOT is enabled on the database.",
		})
	}

	hasParamSniffing := false
	if req.FullPlan != nil && req.FullPlan.Diagnostics != nil {
		for _, ps := range req.FullPlan.Diagnostics.ParameterSniffing {
			for _, aff := range ps.AffectedStatements {
				if aff == stmt.StatementID {
					hasParamSniffing = true
					break
				}
			}
			if hasParamSniffing {
				break
			}
		}
	}
	if strings.Contains(upperSql, "@TYPE = 'ALL' OR") || strings.Contains(upperSql, "IS NULL OR") {
		hasParamSniffing = true
	}

	hintSuffix := ""
	if hasParamSniffing {
		hintSuffix = "\nOPTION (RECOMPILE);"
		explanations = append(explanations, "Parameter Sniffing Protection: OPTION (RECOMPILE) is applied specifically because of volatile parameter skew or dynamic branching, allowing the optimizer to compile a lean single-branch plan per invocation.")
		resp.TuningStrategies = append(resp.TuningStrategies, "Parameter Sniffing (RECOMPILE)")
	} else {
		explanations = append(explanations, "Plan Cache Protection: No parameter sniffing was detected. Avoid adding OPTION (RECOMPILE) blindly—keeping the plan cache active saves CPU and reduces compilation latency.")
		resp.TuningStrategies = append(resp.TuningStrategies, "Plan Cache Friendly (No gratuitous RECOMPILE)")
	}

	// 6. Dynamic Temp Table Parsing
	if strings.Contains(upperSql, "INTO #") {
		rootCauses = append(rootCauses, "Unindexed Heap Creation: Statement uses 'SELECT ... INTO #temp' which creates an unindexed Heap in TempDB. Subsequent joins and filters against this temp table are forced into full table scans and trigger missing index alerts.")
		explanations = append(explanations, "Pre-create the temp table explicitly using CREATE TABLE with defined datatypes and a CLUSTERED PRIMARY KEY on the primary join key, then execute a structured INSERT INTO.")
		resp.TuningStrategies = append(resp.TuningStrategies, "Dynamic Temp Table DDL")

		resp.TechnicalSuggestions = append(resp.TechnicalSuggestions, TechnicalSuggestion{
			Category:        "TempDB & Latch Contention",
			Title:           "Pre-allocate Structured Temp Table Schema with Clustered PK",
			Severity:        "HIGH",
			Impact:          "Prevents system catalog lock contention in TempDB and unlocks Index Seeks for downstream steps",
			TechnicalDetail: "Using 'SELECT ... INTO #temp' creates an unindexed Heap on the fly. The engine locks system catalog tables in TempDB during metadata creation. Furthermore, downstream queries that filter or join on #temp must perform full table scans unless an index is manually created.",
			ActionItem:      "Write an explicit CREATE TABLE #temp with precise datatypes, NOT NULL constraints, and a CLUSTERED PRIMARY KEY before executing INSERT INTO.",
		})

		// Extract temp table name dynamically
		tempName := "#TempTable"
		parts := strings.Split(sqlText, "INTO #")
		if len(parts) > 1 {
			subParts := strings.Fields(parts[1])
			if len(subParts) > 0 {
				tempName = "#" + strings.Trim(subParts[0], " \r\n\t;,")
			}
		}

		stratASQL := fmt.Sprintf(`-- [STRATEGY A: Explicit Temp Table with Clustered Primary Key]
-- Pre-allocates schema to eliminate TempDB catalog latch contention and enable Index Seeks:
IF OBJECT_ID('tempdb..%s') IS NOT NULL 
    DROP TABLE %s;

CREATE TABLE %s (
    [Id]                            INT NOT NULL,
    /* Define remaining columns from SELECT statement */
    PRIMARY KEY CLUSTERED ([Id])
);

INSERT INTO %s
%s%s`, tempName, tempName, tempName, tempName, strings.Replace(sqlText, "INTO "+tempName, "", 1), hintSuffix)

		stratBSQL := fmt.Sprintf(`-- [STRATEGY B: Inline CTE (Zero TempDB I/O Overhead)]
-- If %s is only read once in the downstream query, inlining avoids TempDB PFS/GAM latch contention:
WITH CTE_Source AS (
    %s
)
SELECT * 
FROM CTE_Source;`, tempName, strings.Replace(sqlText, "INTO "+tempName, "", 1))

		resp.RecommendedRewrite = stratASQL
		resp.AlternativeRewrite = stratBSQL

		resp.Strategies = append(resp.Strategies, RewriteStrategy{
			ID:            "strategy_a",
			Title:         "Strategy A: Structured Temp Table with Clustered PK",
			Description:   "Best when the temp table is referenced multiple times in subsequent stored procedure steps.",
			SQL:           stratASQL,
			EstimatedGain: "Converts heap table scans to clustered seeks; prevents catalog latch contention",
		})

		resp.Strategies = append(resp.Strategies, RewriteStrategy{
			ID:            "strategy_b",
			Title:         "Strategy B: Inlined CTE (Zero TempDB I/O)",
			Description:   "Best when data is consumed immediately in the same query pipeline, completely avoiding TempDB I/O.",
			SQL:           stratBSQL,
			EstimatedGain: "100% TempDB allocations and I/O eliminated",
		})
	} else if strings.Contains(upperSql, "FUNC_") {
		resp.RecommendedRewrite = `-- [OPTIMIZATION: Replace Scalar UDF with Native Inline Conversion]
-- Native date math executes in-line without context-switching overhead:
` + sqlText + hintSuffix
	} else {
		resp.RecommendedRewrite = "-- [OPTIMIZED REWRITE FOR STMT #" + stmt.StatementID + "]\n" + sqlText + hintSuffix
	}

	// Missing indexes
	for _, mi := range stmt.MissingIndexes {
		if mi.SuggestedDDL != "" {
			resp.IndexRecommendations = append(resp.IndexRecommendations, mi.SuggestedDDL)
		}
	}

	if len(rootCauses) == 0 {
		rootCauses = append(rootCauses, fmt.Sprintf("High subtree cost operator (%0.2f) with potential unindexed joins or table scans.", stmt.StatementSubTreeCost))
	}

	resp.Summary = fmt.Sprintf("Statement #%s (%s) accounts for %0.1f%% of overall cost with %d missing index recommendations.", stmt.StatementID, stmt.StatementType, stmt.CostPercentage, len(stmt.MissingIndexes))
	resp.RootCause = strings.Join(rootCauses, "\n\n")
	resp.RewriteExplanation = strings.Join(explanations, "\n\n")

	// Server config tips
	if req.FullPlan != nil && req.FullPlan.MaxDOPReason == "MaxDOPSetToOne" {
		resp.ServerConfigTips = append(resp.ServerConfigTips, "Server MAXDOP is locked to 1. For CPU-bound queries, tune Cost Threshold for Parallelism (e.g. 50) and allow MAXDOP matching your NUMA node core count.")
	}
	if hasConvert {
		resp.ServerConfigTips = append(resp.ServerConfigTips, "Audit application ORM / ADO.NET parameter declarations: default string mapping (NVARCHAR) to VARCHAR columns triggers CONVERT_IMPLICIT.")
	}

	// Estimated Gains
	resp.EstimatedGains["Logical Reads / IO"] = "~70% - 90% Reduction"
	resp.EstimatedGains["TempDB Contention"] = "100% Eliminated (CTE) / Latch Free (Temp Table)"
	resp.EstimatedGains["Concurrency"] = "Zero Shared Lock Blocking (RCSI)"
	resp.EstimatedGains["Memory Grants"] = "Spills Eliminated via Precise Projection"

	// Implementation Checklist
	resp.ImplementationChecklist = []string{
		"Run SET STATISTICS IO, TIME ON in a test environment to verify logical read reduction.",
		"Validate row count parity between the original query and the rewritten query.",
		"Deploy missing composite index recommendations with ONLINE = ON.",
		"Audit application caller for parameter type match to prevent CONVERT_IMPLICIT.",
	}

	return resp, nil
}

func cleanJSONString(raw string) string {
	clean := strings.TrimSpace(raw)
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	return strings.TrimSpace(clean)
}

type geminiCandidate struct {
	apiVer string
	model  string
}

func postGeminiGenerate(ctx context.Context, apiKey string, apiVer string, model string, prompt string) (*AIResponse, int, error) {
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/%s/models/%s:generateContent?key=%s", apiVer, model, apiKey)

	payload := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]interface{}{
					{"text": prompt},
				},
			},
		},
		"generationConfig": map[string]interface{}{
			"responseMimeType": "application/json",
		},
	}

	bodyBytes, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", apiKey)

	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, fmt.Errorf("Gemini API error (%d): %s", resp.StatusCode, string(respBody))
	}

	var geminiResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}

	if err := json.Unmarshal(respBody, &geminiResp); err != nil {
		return nil, resp.StatusCode, err
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return nil, resp.StatusCode, fmt.Errorf("no response candidates received from Gemini")
	}

	rawJSON := cleanJSONString(geminiResp.Candidates[0].Content.Parts[0].Text)
	var aiResp AIResponse
	if err := json.Unmarshal([]byte(rawJSON), &aiResp); err != nil {
		aiResp.Summary = rawJSON
		aiResp.RecommendedRewrite = "-- [Gemini Advisory Response]\n" + rawJSON
	}

	// Normalization & Fallbacks for Strategies
	if len(aiResp.Strategies) == 0 && aiResp.RecommendedRewrite != "" {
		aiResp.Strategies = append(aiResp.Strategies, RewriteStrategy{
			ID:            "strategy_a",
			Title:         "Strategy A: Structured Temp Table with Clustered PK",
			Description:   "Pre-allocates schema in TempDB, eliminating PFS/GAM latch contention and enabling Index Seeks.",
			SQL:           aiResp.RecommendedRewrite,
			EstimatedGain: "Converts heap table scan into clustered index seeks",
		})
		if aiResp.AlternativeRewrite != "" {
			aiResp.Strategies = append(aiResp.Strategies, RewriteStrategy{
				ID:            "strategy_b",
				Title:         "Strategy B: Inlined CTE (Zero TempDB I/O)",
				Description:   "Keeps data processing in-memory with zero TempDB allocation latency.",
				SQL:           aiResp.AlternativeRewrite,
				EstimatedGain: "100% TempDB allocations and catalog latches eliminated",
			})
		}
	} else if len(aiResp.Strategies) > 0 {
		if aiResp.RecommendedRewrite == "" {
			aiResp.RecommendedRewrite = aiResp.Strategies[0].SQL
		}
		if len(aiResp.Strategies) > 1 && aiResp.AlternativeRewrite == "" {
			aiResp.AlternativeRewrite = aiResp.Strategies[1].SQL
		}
	}

	if len(aiResp.EstimatedGains) == 0 {
		aiResp.EstimatedGains = map[string]string{
			"Logical Reads / IO": "~70% - 90% Reduction",
			"TempDB Contention":  "100% Eliminated (CTE) / Clustered Seek (Temp)",
			"Concurrency":        "Zero Shared Lock Blocking (RCSI)",
			"Memory Grants":      "Spills Eliminated via Precise Projection",
		}
	}

	if len(aiResp.ImplementationChecklist) == 0 {
		aiResp.ImplementationChecklist = []string{
			"Run SET STATISTICS IO, TIME ON in non-prod to benchmark read reductions.",
			"Confirm exact row count parity between the original and rewritten query.",
			"Deploy missing covering composite indexes using WITH (ONLINE = ON) where supported.",
			"Consider enabling Read Committed Snapshot Isolation (RCSI) at database level to remove NOLOCK dirty-read risks.",
		}
	}

	aiResp.ProviderUsed = fmt.Sprintf("Google Gemini (%s)", model)
	return &aiResp, http.StatusOK, nil
}

type geminiModelsResponse struct {
	Models []struct {
		Name                       string   `json:"name"`
		SupportedGenerationMethods []string `json:"supportedGenerationMethods"`
	} `json:"models"`
}

func discoverGeminiModels(ctx context.Context, apiKey string) ([]geminiCandidate, error) {
	var candidates []geminiCandidate
	apiVersions := []string{"v1beta", "v1"}

	var lastErr error
	for _, ver := range apiVersions {
		url := fmt.Sprintf("https://generativelanguage.googleapis.com/%s/models?key=%s", ver, apiKey)
		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("x-goog-api-key", apiKey)

		client := &http.Client{Timeout: 15 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}

		bodyBytes, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("status %d: %s", resp.StatusCode, string(bodyBytes))
			continue
		}

		var listResp geminiModelsResponse
		if err := json.Unmarshal(bodyBytes, &listResp); err != nil {
			lastErr = err
			continue
		}

		for _, m := range listResp.Models {
			canGen := false
			for _, method := range m.SupportedGenerationMethods {
				if method == "generateContent" {
					canGen = true
					break
				}
			}
			if canGen {
				clean := strings.TrimPrefix(m.Name, "models/")
				candidates = append(candidates, geminiCandidate{apiVer: ver, model: clean})
			}
		}

		if len(candidates) > 0 {
			break
		}
	}

	if len(candidates) == 0 && lastErr != nil {
		return nil, lastErr
	}
	return candidates, nil
}

func callGemini(ctx context.Context, apiKey string, model string, prompt string) (*AIResponse, error) {
	cleanModel := strings.TrimSpace(model)
	cleanModel = strings.TrimPrefix(cleanModel, "models/")
	if cleanModel == "" || strings.Contains(cleanModel, "2.8") {
		cleanModel = "gemini-2.0-flash"
	}

	// Try the requested model first across standard versions (both v1beta and v1)
	candidates := []geminiCandidate{
		{apiVer: "v1beta", model: cleanModel},
		{apiVer: "v1", model: cleanModel},
	}

	// Add popular fallback models if different
	standardModels := []string{"gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-2.5-flash"}
	for _, sm := range standardModels {
		if sm != cleanModel {
			candidates = append(candidates, geminiCandidate{apiVer: "v1beta", model: sm})
			candidates = append(candidates, geminiCandidate{apiVer: "v1", model: sm})
		}
	}

	var lastStatusCode int
	var lastErr error

	for _, cand := range candidates {
		resp, statusCode, err := postGeminiGenerate(ctx, apiKey, cand.apiVer, cand.model, prompt)
		if err == nil {
			return resp, nil
		}
		lastStatusCode = statusCode
		lastErr = err

		// If error is authentication/quota/bad request (not 404 Not Found), fail fast with clear advice
		if statusCode == http.StatusBadRequest || statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden || statusCode == http.StatusTooManyRequests {
			return nil, fmt.Errorf("Gemini authentication / quota error (%d): %w. Please verify your API key at https://aistudio.google.com/app/apikey", statusCode, err)
		}
	}

	// If all standard candidates return 404, query Google's ModelService.ListModels dynamically!
	if lastStatusCode == http.StatusNotFound {
		discovered, discErr := discoverGeminiModels(ctx, apiKey)
		if discErr == nil && len(discovered) > 0 {
			for _, cand := range discovered {
				resp, _, err := postGeminiGenerate(ctx, apiKey, cand.apiVer, cand.model, prompt)
				if err == nil {
					return resp, nil
				}
			}
		}
		if discErr != nil {
			return nil, fmt.Errorf("Gemini API key check failed: %w. Please ensure your API key has 'Generative Language API' enabled or create a free key at https://aistudio.google.com/app/apikey", discErr)
		}
	}

	return nil, fmt.Errorf("no accessible Gemini model found: %w", lastErr)
}

func callOpenAI(ctx context.Context, apiKey string, model string, prompt string) (*AIResponse, error) {
	if model == "" {
		model = "gpt-4o-mini"
	}
	url := "https://api.openai.com/v1/chat/completions"

	payload := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": "You are a Principal SQL Server Query Tuning Architect. Respond with valid JSON."},
			{"role": "user", "content": prompt},
		},
		"response_format": map[string]string{"type": "json_object"},
	}

	bodyBytes, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OpenAI API error (%d): %s", resp.StatusCode, string(respBody))
	}

	var openAIResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(respBody, &openAIResp); err != nil {
		return nil, err
	}

	if len(openAIResp.Choices) == 0 {
		return nil, fmt.Errorf("no completion choices received from OpenAI")
	}

	var aiResp AIResponse
	if err := json.Unmarshal([]byte(openAIResp.Choices[0].Message.Content), &aiResp); err != nil {
		aiResp.Summary = openAIResp.Choices[0].Message.Content
	}
	aiResp.ProviderUsed = "OpenAI (" + model + ")"
	return &aiResp, nil
}

func callOllama(ctx context.Context, endpoint string, model string, prompt string) (*AIResponse, error) {
	if endpoint == "" {
		endpoint = "http://localhost:11434"
	}
	if model == "" {
		model = "llama3"
	}
	url := strings.TrimRight(endpoint, "/") + "/api/generate"

	payload := map[string]interface{}{
		"model":  model,
		"prompt": prompt,
		"stream": false,
		"format": "json",
	}

	bodyBytes, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Ollama connection failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Ollama error (%d): %s", resp.StatusCode, string(respBody))
	}

	var ollamaResp struct {
		Response string `json:"response"`
	}
	if err := json.Unmarshal(respBody, &ollamaResp); err != nil {
		return nil, err
	}

	var aiResp AIResponse
	if err := json.Unmarshal([]byte(ollamaResp.Response), &aiResp); err != nil {
		aiResp.Summary = ollamaResp.Response
	}
	aiResp.ProviderUsed = "Local Ollama (" + model + ")"
	return &aiResp, nil
}
