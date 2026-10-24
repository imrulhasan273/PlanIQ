package sqlplan

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

var severityRankMap = map[string]int{"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "INFO": 1}

func severityRank(s string) int { return severityRankMap[strings.ToUpper(s)] }

// atLeastSeverity raises `cur` to `min` if it is lower
func atLeastSeverity(cur, min string) string {
	if severityRank(cur) < severityRank(min) {
		return min
	}
	return cur
}

func trimBr(s string) string { return strings.Trim(strings.TrimSpace(s), "[]") }

func qn(s string) string { return "[" + trimBr(s) + "]" }

func attrTrue(e *xmlElement, name string) bool {
	if e == nil {
		return false
	}
	v := e.Attr(name)
	return v == "1" || strings.EqualFold(v, "true")
}

func attrFloat(e *xmlElement, name string) float64 {
	if e == nil {
		return 0
	}
	f, _ := strconv.ParseFloat(e.Attr(name), 64)
	return f
}

// stmtContext binds a statement XML element with the data detectors need
type stmtContext struct {
	id       string
	text     string
	stmtType string
	cost     float64
	elem     *xmlElement
}

func collectStatementContexts(node *xmlElement, out *[]*stmtContext) {
	if strings.HasPrefix(node.Name, "Stmt") {
		id := node.Attr("StatementId")
		if id == "" {
			id = node.Attr("StatementCompId")
		}
		cost, _ := strconv.ParseFloat(node.Attr("StatementSubTreeCost"), 64)
		*out = append(*out, &stmtContext{
			id:       id,
			text:     strings.TrimSpace(node.Attr("StatementText")),
			stmtType: node.Attr("StatementType"),
			cost:     cost,
			elem:     node,
		})
	}
	for _, c := range node.Children {
		collectStatementContexts(c, out)
	}
}

// walkStmt visits every element that belongs to a statement (never descending into nested
// statements). `ancestors` holds the chain of enclosing RelOp elements (outermost first).
func walkStmt(e *xmlElement, ancestors []*xmlElement, visit func(el *xmlElement, anc []*xmlElement)) {
	for _, c := range e.Children {
		if strings.HasPrefix(c.Name, "Stmt") {
			continue
		}
		visit(c, ancestors)
		if c.Name == "RelOp" {
			next := make([]*xmlElement, len(ancestors)+1)
			copy(next, ancestors)
			next[len(ancestors)] = c
			walkStmt(c, next, visit)
		} else {
			walkStmt(c, ancestors, visit)
		}
	}
}

// relOpFind locates an element that belongs to this operator itself (depth <= 2, never inside a child RelOp)
func relOpFind(relOp *xmlElement, name string) *xmlElement {
	for _, c := range relOp.Children {
		if c.Name == "RelOp" {
			continue
		}
		if c.Name == name {
			return c
		}
		for _, gc := range c.Children {
			if gc.Name == name {
				return gc
			}
		}
	}
	return nil
}

// childRelOps returns the direct child operators of a RelOp
func childRelOps(relOp *xmlElement) []*xmlElement {
	var out []*xmlElement
	var rec func(e *xmlElement)
	rec = func(e *xmlElement) {
		for _, c := range e.Children {
			if c.Name == "RelOp" {
				out = append(out, c)
			} else {
				rec(c)
			}
		}
	}
	rec(relOp)
	return out
}

// sumCounters sums a RunTimeCountersPerThread attribute across all threads of this operator
func sumCounters(relOp *xmlElement, attr string) (float64, bool) {
	ri := relOpFind(relOp, "RunTimeInformation")
	if ri == nil {
		return 0, false
	}
	var sum float64
	found := false
	for _, c := range ri.Children {
		if c.Name != "RunTimeCountersPerThread" {
			continue
		}
		if v, ok := c.Attrs[attr]; ok {
			f, _ := strconv.ParseFloat(v, 64)
			sum += f
			found = true
		}
	}
	return sum, found
}

// counterAttr returns the first non-empty value of an attribute across threads of this operator
func counterAttr(relOp *xmlElement, attr string) string {
	ri := relOpFind(relOp, "RunTimeInformation")
	if ri == nil {
		return ""
	}
	for _, c := range ri.Children {
		if c.Name == "RunTimeCountersPerThread" && c.Attr(attr) != "" {
			return c.Attr(attr)
		}
	}
	return ""
}

// ownCostPercent is the operator's exclusive cost as a share of the statement cost
func ownCostPercent(relOp *xmlElement, stmtCost float64) float64 {
	if stmtCost <= 0 {
		return 0
	}
	own := attrFloat(relOp, "EstimatedTotalSubtreeCost")
	for _, c := range childRelOps(relOp) {
		own -= attrFloat(c, "EstimatedTotalSubtreeCost")
	}
	if own < 0 {
		own = 0
	}
	return math.Round(own/stmtCost*1000) / 10
}

func findFirstObject(relOp *xmlElement) *xmlElement {
	for _, c := range childRelOps(relOp) {
		if obj := relOpFind(c, "Object"); obj != nil {
			return obj
		}
		if obj := findFirstObject(c); obj != nil {
			return obj
		}
	}
	return nil
}

func lookupKindOf(r *xmlElement) (string, bool) {
	p := strings.ToLower(r.Attr("PhysicalOp"))
	l := strings.ToLower(r.Attr("LogicalOp"))
	if strings.Contains(p, "rid lookup") || strings.Contains(l, "rid lookup") {
		return "RID Lookup", true
	}
	if strings.Contains(p, "key lookup") || strings.Contains(l, "key lookup") {
		return "Key Lookup", true
	}
	if is := relOpFind(r, "IndexScan"); is != nil && attrTrue(is, "Lookup") {
		if obj := relOpFind(r, "Object"); obj != nil && strings.EqualFold(obj.Attr("IndexKind"), "Heap") {
			return "RID Lookup", true
		}
		return "Key Lookup", true
	}
	return "", false
}

func isLookupOp(r *xmlElement) bool {
	_, ok := lookupKindOf(r)
	return ok
}

// findDrivingIndex finds the index (of the same table) used by the outer side of the join feeding a lookup.
// The lookup's own target index is never returned.
func findDrivingIndex(outer *xmlElement, table, excludeIndex string) string {
	if obj := relOpFind(outer, "Object"); obj != nil && !isLookupOp(outer) &&
		strings.EqualFold(trimBr(obj.Attr("Table")), trimBr(table)) &&
		!strings.EqualFold(trimBr(obj.Attr("Index")), trimBr(excludeIndex)) {
		return trimBr(obj.Attr("Index"))
	}
	for _, c := range childRelOps(outer) {
		if idx := findDrivingIndex(c, table, excludeIndex); idx != "" {
			return idx
		}
	}
	return ""
}

func uniqueStrings(in []string) []string {
	seen := make(map[string]bool, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

func sanitizeIdent(s string) string {
	var sb strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			sb.WriteRune(r)
		} else {
			sb.WriteRune('_')
		}
	}
	return sb.String()
}

var internalColumnRe = regexp.MustCompile(`^(Bmk|Expr|Uniq|Chk|IsBaseRow|Union|Segment|Rank|Rowset)\d+$`)

func parseIntSafe(s string) int {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return -1
	}
	return n
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

type paramAggregate struct {
	finding     *ParameterSniffingFinding
	stmtIDs     map[string]bool
	mitigations []string
}

// detectParamMitigation looks for query hints in the statement text that neutralize sniffing
func detectParamMitigation(upperText string) string {
	switch {
	case strings.Contains(upperText, "DISABLE_PARAMETER_SNIFFING"):
		return "USE HINT('DISABLE_PARAMETER_SNIFFING')"
	case strings.Contains(upperText, "OPTIMIZE FOR UNKNOWN"):
		return "OPTIMIZE FOR UNKNOWN"
	case strings.Contains(upperText, "OPTIMIZE FOR"):
		return "OPTIMIZE FOR (@p = value)"
	case strings.Contains(upperText, "RECOMPILE"):
		return "OPTION (RECOMPILE)"
	}
	return ""
}

func populateExtraDiagnostics(root *xmlElement, analysis *PlanAnalysis, diag *AdvancedDiagnostics) {
	diag.KeyLookups = make([]*KeyLookupFinding, 0)
	diag.Spools = make([]*SpoolFinding, 0)
	diag.MissingStatistics = make([]*MissingStatsFinding, 0)
	diag.ParameterSniffing = make([]*ParameterSniffingFinding, 0)
	diag.NonSargable = make([]*NonSargableFinding, 0)
	diag.RowGoals = make([]*RowGoalFinding, 0)

	var contexts []*stmtContext
	collectStatementContexts(root, &contexts)

	adaptive := &AdaptiveProcessing{
		AdaptiveJoins: make([]*AdaptiveJoinFinding, 0),
		Features:      make([]*IQPFeature, 0),
	}
	missingByKey := make(map[string]*MissingStatsFinding)
	paramByKey := make(map[string]*paramAggregate)
	var paramOrder []string

	mgfStatuses := make([]string, 0)
	dopFeedback := make([]string, 0)
	hasInterleaved, hasInlineUDF, hasPSP := false, false, false

	for _, ctx := range contexts {
		stmtSkewed := false
		var stmtSigs []string
		rowGoalSeen := false
		upperText := strings.ToUpper(ctx.text)

		walkStmt(ctx.elem, nil, func(el *xmlElement, anc []*xmlElement) {
			switch el.Name {
			case "QueryPlan":
				if attrTrue(el, "ContainsInterleavedExecutionCandidates") {
					hasInterleaved = true
				}
				if attrTrue(el, "ContainsInlineScalarTsqlUdfs") {
					hasInlineUDF = true
				}
				if v := el.Attr("DOPFeedbackAdjusted"); v != "" {
					dopFeedback = append(dopFeedback, v)
				}
			case "MemoryGrantInfo":
				if v := el.Attr("IsMemoryGrantFeedbackAdjusted"); v != "" {
					mgfStatuses = append(mgfStatuses, v)
				}
			case "Dispatcher", "ParameterSensitivePredicate":
				hasPSP = true
			case "ColumnsWithNoStatistics":
				nodeID := 0
				if len(anc) > 0 {
					nodeID, _ = strconv.Atoi(anc[len(anc)-1].Attr("NodeId"))
				}
				for _, cr := range el.Children {
					if cr.Name != "ColumnReference" {
						continue
					}
					key := ctx.id + "|" + cr.Attr("Database") + "|" + cr.Attr("Schema") + "|" + cr.Attr("Table")
					f := missingByKey[key]
					if f == nil {
						f = &MissingStatsFinding{
							StatementID: ctx.id,
							NodeID:      nodeID,
							Database:    trimBr(cr.Attr("Database")),
							Schema:      trimBr(cr.Attr("Schema")),
							Table:       trimBr(cr.Attr("Table")),
							Columns:     make([]string, 0),
						}
						missingByKey[key] = f
						diag.MissingStatistics = append(diag.MissingStatistics, f)
					}
					if col := trimBr(cr.Attr("Column")); col != "" {
						f.Columns = uniqueStrings(append(f.Columns, col))
					}
				}
			case "ParameterList":
				var params []*SniffedParameter
				var sigParts []string
				anyCompiled := false
				for _, cr := range el.Children {
					if cr.Name != "ColumnReference" {
						continue
					}
					name := cr.Attr("Column")
					if name == "" {
						continue
					}
					compiled, hasCompiled := cr.Attrs["ParameterCompiledValue"]
					runtime, hasRuntime := cr.Attrs["ParameterRuntimeValue"]
					p := &SniffedParameter{
						Name:          name,
						DataType:      cr.Attr("ParameterDataType"),
						CompiledValue: compiled,
						RuntimeValue:  runtime,
						HasRuntime:    hasRuntime,
					}
					if hasCompiled {
						anyCompiled = true
					}
					if hasCompiled && hasRuntime && strings.TrimSpace(compiled) != strings.TrimSpace(runtime) {
						p.Mismatch = true
					}
					params = append(params, p)
					sigParts = append(sigParts, name+"="+compiled+"|"+runtime)
				}
				if len(params) == 0 || !anyCompiled {
					return
				}
				sig := strings.Join(sigParts, ";")
				agg := paramByKey[sig]
				if agg == nil {
					f := &ParameterSniffingFinding{
						AffectedStatements: make([]string, 0),
						Parameters:         params,
					}
					for _, p := range params {
						if p.HasRuntime {
							f.HasRuntimeValues = true
						}
						if p.Mismatch {
							f.HasMismatch = true
						}
					}
					agg = &paramAggregate{finding: f, stmtIDs: make(map[string]bool)}
					paramByKey[sig] = agg
					paramOrder = append(paramOrder, sig)
				}
				if !agg.stmtIDs[ctx.id] {
					agg.stmtIDs[ctx.id] = true
					agg.finding.AffectedStatements = append(agg.finding.AffectedStatements, "Stmt #"+ctx.id)
					if m := detectParamMitigation(upperText); m != "" {
						agg.mitigations = uniqueStrings(append(agg.mitigations, m))
					}
				}
				stmtSigs = append(stmtSigs, sig)
			case "RelOp":
				analyzeRelOp(el, anc, ctx, upperText, diag, adaptive, &stmtSkewed, &rowGoalSeen)
			}
		})

		// Estimate-impact correlation for sniffed parameters
		if stmtSkewed {
			for _, sig := range stmtSigs {
				paramByKey[sig].finding.HasEstimateImpact = true
			}
		}
		// Statement-level FAST N hint without any operator-level row goal
		if !rowGoalSeen && fastNRe.MatchString(ctx.text) {
			diag.RowGoals = append(diag.RowGoals, &RowGoalFinding{
				StatementID: ctx.id,
				PhysicalOp:  "Statement",
				Source:      "FAST N query hint",
				Severity:    "INFO",
				Description: "OPTION (FAST n) forces a row goal: the optimizer favors a plan that returns the first rows quickly (typically Nested Loops) even if it is slower for the complete result set.",
				Remedy:      "Verify the client really consumes only the first rows; otherwise remove FAST n or add OPTION (USE HINT('DISABLE_OPTIMIZER_ROWGOAL')) (SQL Server 2016 SP1+).",
			})
		}
	}

	finalizeMissingStats(diag)
	finalizeParameterSniffing(diag, paramByKey, paramOrder)
	finalizeAdaptive(diag, adaptive, mgfStatuses, dopFeedback, hasInterleaved, hasInlineUDF, hasPSP)

	sort.SliceStable(diag.KeyLookups, func(i, j int) bool {
		a, b := diag.KeyLookups[i], diag.KeyLookups[j]
		if severityRank(a.Severity) != severityRank(b.Severity) {
			return severityRank(a.Severity) > severityRank(b.Severity)
		}
		return a.LookupCount > b.LookupCount
	})
	sort.SliceStable(diag.Spools, func(i, j int) bool {
		return severityRank(diag.Spools[i].Severity) > severityRank(diag.Spools[j].Severity)
	})
	sort.SliceStable(diag.NonSargable, func(i, j int) bool {
		a, b := diag.NonSargable[i], diag.NonSargable[j]
		if severityRank(a.Severity) != severityRank(b.Severity) {
			return severityRank(a.Severity) > severityRank(b.Severity)
		}
		return a.CostPercent > b.CostPercent
	})
	sort.SliceStable(diag.RowGoals, func(i, j int) bool {
		return severityRank(diag.RowGoals[i].Severity) > severityRank(diag.RowGoals[j].Severity)
	})
}

// ---------------------------------------------------------------------------
// Per-operator analysis
// ---------------------------------------------------------------------------

var (
	fastNRe        = regexp.MustCompile(`(?i)\bFAST\s+\d+`)
	topRe          = regexp.MustCompile(`(?i)\bTOP\b|\bSET\s+ROWCOUNT\b`)
	existsInRe     = regexp.MustCompile(`(?i)\bEXISTS\b|\bIN\s*\(`)
	columnRefRe    = regexp.MustCompile(`\[[^\[\]]+\]\.\[[^\[\]]+\]`)
	leadingLikeRe  = regexp.MustCompile(`(?i)\[[^\[\]]+\]\.\[[^\[\]]+\]\s+like\s+N?'%`)
	halloweenOpsRe = regexp.MustCompile(`(?i)insert|update|delete|merge`)
)

func analyzeRelOp(relOp *xmlElement, anc []*xmlElement, ctx *stmtContext, upperText string,
	diag *AdvancedDiagnostics, adaptive *AdaptiveProcessing, stmtSkewed *bool, rowGoalSeen *bool) {

	nodeID, _ := strconv.Atoi(relOp.Attr("NodeId"))
	phys := relOp.Attr("PhysicalOp")
	logical := relOp.Attr("LogicalOp")
	physLower := strings.ToLower(phys)
	estRows := attrFloat(relOp, "EstimateRows")
	actual, hasActual := sumCounters(relOp, "ActualRows")
	execs, hasExecs := sumCounters(relOp, "ActualExecutions")
	perExec := actual
	if hasExecs && execs > 0 {
		perExec = actual / execs
	}
	costPct := ownCostPercent(relOp, ctx.cost)

	adaptive.TotalOperators++

	// --- Execution mode (batch vs row) ---
	mode := counterAttr(relOp, "ActualExecutionMode")
	if mode == "" {
		mode = relOp.Attr("EstimatedExecutionMode")
	}
	if strings.EqualFold(mode, "Batch") {
		adaptive.BatchModeOperators++
		if is := relOpFind(relOp, "IndexScan"); is != nil && strings.EqualFold(is.Attr("Storage"), "RowStore") {
			adaptive.BatchOnRowstore = true
		}
	}

	// --- Cardinality misestimate marker used to correlate parameter sniffing ---
	if hasActual && estRows > 0 {
		ratio := perExec / estRows
		if (ratio > 10 && actual >= 1000) || (perExec > 0 && ratio < 0.1 && estRows >= 100) {
			*stmtSkewed = true
		}
	}

	// --- Key / RID Lookup ---
	if kind, ok := lookupKindOf(relOp); ok {
		analyzeLookup(relOp, anc, ctx, kind, nodeID, estRows, actual, hasActual, costPct, diag)
	}

	// --- Spools ---
	if strings.Contains(physLower, "spool") {
		analyzeSpool(relOp, anc, ctx, nodeID, phys, logical, estRows, actual, hasActual, costPct, diag)
	}

	// --- Non-sargable predicates ---
	if strings.Contains(physLower, "scan") || strings.Contains(physLower, "seek") ||
		strings.Contains(physLower, "lookup") || physLower == "filter" {
		analyzeNonSargable(relOp, ctx, nodeID, phys, costPct, diag)
	}

	// --- Row goals ---
	if v, ok := relOp.Attrs["EstimateRowsWithoutRowGoal"]; ok {
		without, _ := strconv.ParseFloat(v, 64)
		if without > estRows*1.0001 {
			*rowGoalSeen = true
			analyzeRowGoal(ctx, nodeID, phys, estRows, without, perExec, hasActual, diag)
		}
	}

	// --- Adaptive Join ---
	aj := relOpFind(relOp, "AdaptiveJoin")
	if strings.EqualFold(phys, "Adaptive Join") || aj != nil {
		analyzeAdaptiveJoin(relOp, aj, ctx, nodeID, estRows, actual, hasActual, adaptive)
	}
}

func analyzeLookup(relOp *xmlElement, anc []*xmlElement, ctx *stmtContext, kind string, nodeID int,
	estRows, actual float64, hasActual bool, costPct float64, diag *AdvancedDiagnostics) {

	obj := relOpFind(relOp, "Object")
	var schema, table, lookupIdx string
	if obj != nil {
		schema, table, lookupIdx = trimBr(obj.Attr("Schema")), trimBr(obj.Attr("Table")), trimBr(obj.Attr("Index"))
	}

	// Driving (outer) side: sibling under the parent Nested Loops
	seekIdx := ""
	outerRows := 0.0
	if len(anc) > 0 {
		parent := anc[len(anc)-1]
		if strings.Contains(strings.ToLower(parent.Attr("PhysicalOp")), "nested loops") {
			for _, sib := range childRelOps(parent) {
				if sib == relOp {
					continue
				}
				outerRows = attrFloat(sib, "EstimateRows")
				seekIdx = findDrivingIndex(sib, table, lookupIdx)
				break
			}
		}
	}

	var cols []string
	if ol := relOpFind(relOp, "OutputList"); ol != nil {
		for _, cr := range ol.Children {
			if cr.Name != "ColumnReference" {
				continue
			}
			c := cr.Attr("Column")
			if c == "" || internalColumnRe.MatchString(c) {
				continue
			}
			cols = append(cols, trimBr(c))
		}
	}
	cols = uniqueStrings(cols)
	if cols == nil {
		cols = make([]string, 0)
	}

	lookups := estRows
	if outerRows > 0 {
		lookups = outerRows * estRows
	}
	if hasActual {
		lookups = actual
	}

	severity := "INFO"
	switch {
	case lookups >= 10000:
		severity = "CRITICAL"
	case lookups >= 1000:
		severity = "HIGH"
	case lookups >= 100 || costPct >= 10:
		severity = "MEDIUM"
	}
	if costPct >= 25 {
		severity = atLeastSeverity(severity, "HIGH")
	}

	include := ""
	if len(cols) > 0 {
		quoted := make([]string, len(cols))
		for i, c := range cols {
			quoted[i] = qn(c)
		}
		include = "INCLUDE (" + strings.Join(quoted, ", ") + ")"
	}

	target := qn(table)
	if schema != "" {
		target = qn(schema) + "." + target
	}
	desc := fmt.Sprintf("%s on %s is performed ~%s time(s)%s: each row found by the index seek requires an extra random read into the base table to fetch %s.",
		kind, target, formatCount(lookups), map[bool]string{true: "", false: " (estimated)"}[hasActual],
		map[bool]string{true: fmt.Sprintf("%d column(s) the index does not contain", len(cols)), false: "columns the index does not contain (used by a predicate)"}[len(cols) > 0])

	var remedy string
	switch {
	case kind == "RID Lookup" && include != "":
		remedy = fmt.Sprintf("The table is a heap. Create a clustered index (usually on the primary key) so RID lookups become cheaper Key Lookups, or build a covering index with %s.", include)
	case kind == "RID Lookup":
		remedy = "The table is a heap. Create a clustered index (usually on the primary key) so RID lookups become cheaper Key Lookups, or build a covering index."
	case seekIdx != "" && include != "":
		remedy = fmt.Sprintf("Add the fetched columns to the existing index %s: %s.", qn(seekIdx), include)
	case include != "":
		remedy = fmt.Sprintf("Create a covering index on the seek columns with %s.", include)
	default:
		remedy = "Create a covering index so the lookup is no longer needed."
	}
	if lookups >= 1000 {
		remedy += " At this volume the optimizer may soon abandon the index entirely for a full scan (tipping point)."
	}

	diag.KeyLookups = append(diag.KeyLookups, &KeyLookupFinding{
		StatementID:    ctx.id,
		NodeID:         nodeID,
		LookupKind:     kind,
		Schema:         schema,
		Table:          table,
		LookupIndex:    lookupIdx,
		SeekIndex:      seekIdx,
		EstimateRows:   estRows,
		LookupCount:    math.Round(lookups),
		HasActualRows:  hasActual,
		CostPercent:    costPct,
		FetchedColumns: cols,
		IncludeClause:  include,
		Severity:       severity,
		Description:    desc,
		Remedy:         remedy,
	})
}

func formatCount(f float64) string {
	return strconv.FormatInt(int64(math.Round(f)), 10)
}

func analyzeSpool(relOp *xmlElement, anc []*xmlElement, ctx *stmtContext, nodeID int, phys, logical string,
	estRows, actual float64, hasActual bool, costPct float64, diag *AdvancedDiagnostics) {

	physLower := strings.ToLower(phys)
	logLower := strings.ToLower(logical)

	kind := "Spool"
	switch {
	case strings.Contains(logLower, "eager"):
		kind = "Eager"
	case strings.Contains(logLower, "lazy"):
		kind = "Lazy"
	case strings.Contains(physLower, "row count"):
		kind = "Row Count"
	case strings.Contains(physLower, "window"):
		kind = "Window"
	}

	halloween := false
	if kind == "Eager" {
		for _, a := range anc {
			if halloweenOpsRe.MatchString(a.Attr("PhysicalOp")) {
				halloween = true
				break
			}
		}
	}

	rebinds, _ := sumCounters(relOp, "ActualRebinds")
	rewinds, _ := sumCounters(relOp, "ActualRewinds")

	table := ""
	if obj := findFirstObject(relOp); obj != nil {
		table = trimBr(obj.Attr("Table"))
	}

	severity := "INFO"
	var purpose, desc, remedy string
	switch {
	case strings.Contains(physLower, "index spool") && kind == "Eager":
		severity = "HIGH"
		purpose = "Temporary Index Built at Runtime"
		desc = "An Eager Index Spool makes SQL Server build a throw-away index in TempDB on every execution of this branch because no suitable permanent index exists."
		remedy = "Create the permanent index the optimizer wanted (check the Nested Loops inner-side seek predicate / Missing Index recommendations) so the spool disappears."
	case halloween:
		purpose = "Halloween Protection"
		desc = "Eager Spool under a data-modification operator: the engine fully materializes the rows to be changed so the update cannot re-read rows it already modified."
		remedy = "Normally harmless. If expensive, avoid reading and modifying the same index key (e.g. UPDATE ... SET key = key + 1), or modify through a different index/staging table."
	case kind == "Eager":
		severity = "MEDIUM"
		purpose = "Full Materialization (Blocking)"
		desc = "Eager Table Spool blocks the pipeline: it consumes and stores the entire input in TempDB before returning the first row."
		remedy = "Check for self-referencing joins, multiple reads of the same CTE/subquery, or missing indexes. Materializing the subquery in an indexed #temp table is often cheaper."
	case kind == "Lazy":
		purpose = "Cached Rows for Repeated Reads"
		desc = "Lazy Table Spool stores rows on demand so the inner side can be rewound instead of re-executed."
		remedy = "Usually beneficial. If rebinds are high, review the join order, or rewrite correlated subqueries as set-based joins."
		if rebinds >= 1000 || costPct >= 10 {
			severity = "MEDIUM"
		}
	case kind == "Row Count":
		purpose = "Row Count Optimization"
		desc = "Row Count Spool only counts rows (used for NOT IN / anti-semi join existence checks). Cheap, but can indicate a NOT IN against a nullable column."
		remedy = "Prefer NOT EXISTS, or make the compared columns NOT NULL."
	case kind == "Window":
		purpose = "Window Function Frame Buffer"
		desc = "Window Spool buffers rows for a window frame. The default RANGE frame spools to disk in TempDB, a ROWS frame does it in memory."
		remedy = "Specify ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW instead of the default RANGE frame."
	default:
		purpose = "Intermediate Result Cache"
		desc = "A spool operator stores intermediate rows in TempDB."
		remedy = "Review the join/subquery producing the spooled rows."
	}
	if costPct >= 40 {
		severity = atLeastSeverity(severity, "HIGH")
	} else if costPct >= 20 {
		severity = atLeastSeverity(severity, "MEDIUM")
	}
	if costPct >= 30 && strings.Contains(physLower, "index spool") && kind == "Eager" {
		severity = "CRITICAL"
	}

	diag.Spools = append(diag.Spools, &SpoolFinding{
		StatementID:     ctx.id,
		NodeID:          nodeID,
		PhysicalOp:      phys,
		LogicalOp:       logical,
		Kind:            kind,
		Purpose:         purpose,
		Table:           table,
		EstimateRows:    estRows,
		EstimateRebinds: attrFloat(relOp, "EstimateRebinds"),
		EstimateRewinds: attrFloat(relOp, "EstimateRewinds"),
		ActualRows:      actual,
		ActualRebinds:   rebinds,
		ActualRewinds:   rewinds,
		HasActualRows:   hasActual,
		CostPercent:     costPct,
		Severity:        severity,
		Description:     desc,
		Remedy:          remedy,
	})
}

// --- Non-sargable detection ---------------------------------------------------

var nonSargableRemedies = map[string]string{
	"datepart":   "Rewrite date-part filters as a half-open range: WHERE col >= '2024-01-01' AND col < '2025-01-01'.",
	"year":       "Rewrite YEAR(col) = n as a half-open range: col >= 'n-01-01' AND col < '(n+1)-01-01'.",
	"month":      "Rewrite MONTH(col) filters as a date range (or add an indexed computed column).",
	"day":        "Rewrite DAY(col) filters as a date range (or add an indexed computed column).",
	"datename":   "Compare against date ranges instead of formatting the column.",
	"dateadd":    "Move date arithmetic to the other side: col >= DATEADD(day, -7, @d) instead of DATEADD(day, 7, col) >= @d.",
	"datediff":   "Move date arithmetic to the parameter side: col >= DATEADD(day, -@n, GETDATE()).",
	"eomonth":    "Compare against a computed date range instead of wrapping the column.",
	"isnull":     "Replace ISNULL(col, x) = y with (col = y OR col IS NULL) (or ensure the column is NOT NULL).",
	"coalesce":   "Replace COALESCE(col, x) = y with (col = y OR col IS NULL).",
	"upper":      "Drop UPPER/LOWER: the default collation is already case-insensitive. Otherwise add an indexed computed column.",
	"lower":      "Drop UPPER/LOWER: the default collation is already case-insensitive. Otherwise add an indexed computed column.",
	"ltrim":      "Store trimmed values (or add an indexed computed column) instead of trimming the column at query time.",
	"rtrim":      "Store trimmed values (SQL Server ignores trailing spaces in = comparisons anyway).",
	"trim":       "Store trimmed values (or add an indexed computed column).",
	"substring":  "Use col LIKE 'prefix%' for prefix matches, or an indexed computed column for the extracted value.",
	"left":       "Use col LIKE 'prefix%' instead of LEFT(col, n) = 'prefix'.",
	"right":      "Use an indexed computed column over REVERSE/RIGHT, or store the suffix separately.",
	"len":        "Avoid LEN(col) filters; use an indexed computed column.",
	"datalength": "Avoid DATALENGTH(col) filters; use an indexed computed column.",
	"charindex":  "Use LIKE 'x%' (sargable) or full-text search for substring searches.",
	"patindex":   "Use LIKE 'x%' (sargable) or full-text search.",
	"replace":    "Normalize data at write time or use an indexed computed column.",
	"convert":    "Compare in the column's own type: convert the parameter/constant, not the column.",
	"cast":       "Compare in the column's own type: cast the parameter/constant, not the column.",
	"abs":        "Rewrite ABS(col) < n as col > -n AND col < n.",
	"round":      "Rewrite as a range predicate on the raw column.",
	"floor":      "Rewrite as a range predicate on the raw column.",
	"ceiling":    "Rewrite as a range predicate on the raw column.",
	"format":     "FORMAT() on a column cannot use an index; compare against typed ranges instead.",
	"str":        "Compare numbers as numbers; do not stringify the column.",
	"concat":     "Compare each column separately instead of concatenating them.",
	"stuff":      "Use an indexed computed column for the transformed value.",
	"reverse":    "Use an indexed computed column over REVERSE(col) for suffix searches.",
	"isnumeric":  "Validate at write time; avoid ISNUMERIC(col) in WHERE.",
	"isdate":     "Validate at write time; avoid ISDATE(col) in WHERE.",
}

func skipQuoted(s string, i int) int {
	// s[i] == '\''; returns the index just after the closing quote
	i++
	for i < len(s) {
		if s[i] == '\'' {
			if i+1 < len(s) && s[i+1] == '\'' {
				i += 2
				continue
			}
			return i + 1
		}
		i++
	}
	return i
}

func isIdentStart(c byte) bool {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_'
}

func isIdentChar(c byte) bool { return isIdentStart(c) || (c >= '0' && c <= '9') }

func balancedArgs(s string, open int) string {
	depth := 0
	for k := open; k < len(s); k++ {
		switch s[k] {
		case '\'':
			k = skipQuoted(s, k) - 1
		case '[':
			if j := strings.IndexByte(s[k:], ']'); j >= 0 {
				k += j
			}
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				return s[open+1 : k]
			}
		}
	}
	if open+1 <= len(s) {
		return s[open+1:]
	}
	return ""
}

// findWrappedColumnFunctions returns the (lower-case) names of non-sargable functions whose
// arguments contain a real table column reference
func findWrappedColumnFunctions(pred string) []string {
	var found []string
	n := len(pred)
	i := 0
	for i < n {
		c := pred[i]
		switch {
		case c == '\'':
			i = skipQuoted(pred, i)
		case c == '[':
			j := strings.IndexByte(pred[i:], ']')
			if j < 0 {
				i = n
			} else {
				i += j + 1
			}
		case isIdentStart(c):
			j := i
			for j < n && isIdentChar(pred[j]) {
				j++
			}
			name := strings.ToLower(pred[i:j])
			if j < n && pred[j] == '(' {
				if _, ok := nonSargableRemedies[name]; ok {
					if columnRefRe.MatchString(balancedArgs(pred, j)) {
						found = append(found, name)
					}
				}
			}
			i = j
		default:
			i++
		}
	}
	return uniqueStrings(found)
}

func analyzeNonSargable(relOp *xmlElement, ctx *stmtContext, nodeID int, phys string, costPct float64, diag *AdvancedDiagnostics) {
	pred := relOpFind(relOp, "Predicate")
	if pred == nil {
		return
	}
	scalar := pred.findFirst("ScalarOperator")
	if scalar == nil {
		return
	}
	text := scalar.Attr("ScalarString")
	if text == "" {
		return
	}
	funcs := findWrappedColumnFunctions(text)
	wildcard := leadingLikeRe.MatchString(text)
	if len(funcs) == 0 && !wildcard {
		return
	}

	var table, index string
	if obj := relOpFind(relOp, "Object"); obj != nil {
		table, index = trimBr(obj.Attr("Table")), trimBr(obj.Attr("Index"))
	}
	tableCard := attrFloat(relOp, "TableCardinality")
	isScan := strings.Contains(strings.ToLower(phys), "scan")

	severity := "MEDIUM"
	switch {
	case isScan && (tableCard >= 100000 || costPct >= 20):
		severity = "HIGH"
	case isScan && tableCard > 0 && tableCard < 1000 && costPct < 10:
		severity = "INFO"
	}
	if isScan && costPct >= 40 {
		severity = "CRITICAL"
	}

	var what []string
	var remedies []string
	for _, f := range funcs {
		what = append(what, strings.ToUpper(f)+"()")
		remedies = append(remedies, nonSargableRemedies[f])
	}
	if wildcard {
		what = append(what, "LIKE '%…' (leading wildcard)")
		remedies = append(remedies, "A leading wildcard cannot use B-tree order: use Full-Text Search, a reversed/computed column, or avoid the leading '%'.")
	}
	remedies = uniqueStrings(remedies)

	desc := fmt.Sprintf("Predicate applies %s to an indexed column. This hides the column from index seeks (non-sargable): the expression is evaluated row by row%s.",
		strings.Join(what, ", "), map[bool]string{true: " during a scan", false: ""}[isScan])
	if table != "" {
		desc += " Table: " + table + "."
	}

	diag.NonSargable = append(diag.NonSargable, &NonSargableFinding{
		StatementID:      ctx.id,
		NodeID:           nodeID,
		PhysicalOp:       phys,
		Table:            table,
		Index:            index,
		Functions:        append(make([]string, 0, len(funcs)), upperAll(funcs)...),
		LeadingWildcard:  wildcard,
		Predicate:        text,
		TableCardinality: tableCard,
		CostPercent:      costPct,
		Severity:         severity,
		Description:      desc,
		Remedy:           strings.Join(remedies, " "),
	})
}

func upperAll(in []string) []string {
	out := make([]string, len(in))
	for i, s := range in {
		out[i] = strings.ToUpper(s)
	}
	return out
}

// --- Row goals ------------------------------------------------------------------

func analyzeRowGoal(ctx *stmtContext, nodeID int, phys string, estRows, without, perExec float64, hasActual bool, diag *AdvancedDiagnostics) {
	source := "Optimizer row goal"
	switch {
	case fastNRe.MatchString(ctx.text):
		source = "FAST N query hint"
	case topRe.MatchString(ctx.text):
		source = "TOP"
	case existsInRe.MatchString(ctx.text):
		source = "EXISTS / IN semi-join"
	}

	reduction := 0.0
	if estRows > 0 {
		reduction = math.Round(without/estRows*10) / 10
	}
	misfired := hasActual && estRows > 0 && perExec/estRows > 10

	severity := "INFO"
	switch {
	case misfired && perExec/estRows >= 100:
		severity = "CRITICAL"
	case misfired:
		severity = "HIGH"
	case reduction >= 10:
		severity = "MEDIUM"
	}

	desc := fmt.Sprintf("%s set a row goal on %s: the optimizer reduced its row estimate from %s to %s (%.1fx) assuming matching rows are spread evenly and the scan can stop early.",
		source, phys, formatCount(without), formatCount(estRows), reduction)
	if misfired {
		desc += fmt.Sprintf(" The row goal MISFIRED: the operator actually produced ~%s rows per execution, far more than the %s estimated (matching rows were rarer or clustered at the end of the scan).",
			formatCount(perExec), formatCount(estRows))
	} else if !hasActual && reduction >= 10 {
		desc += " Run the Actual plan to verify the goal was met; if matching rows are rare the plan can degrade into a very long scan."
	}

	remedy := "If the plan is slower than expected, test OPTION (USE HINT('DISABLE_OPTIMIZER_ROWGOAL')) (SQL Server 2016 SP1+) or QUERYTRACEON 4138, and add an index supporting both the filter and the ORDER BY so the goal can be met cheaply."
	if source == "TOP" {
		remedy = "Make sure TOP has a deterministic ORDER BY backed by an index. " + remedy
	}

	diag.RowGoals = append(diag.RowGoals, &RowGoalFinding{
		StatementID:             ctx.id,
		NodeID:                  nodeID,
		PhysicalOp:              phys,
		Source:                  source,
		EstimateRows:            estRows,
		EstimateRowsWithoutGoal: without,
		ActualRows:              math.Round(perExec),
		HasActualRows:           hasActual,
		ReductionFactor:         reduction,
		Misfired:                misfired,
		Severity:                severity,
		Description:             desc,
		Remedy:                  remedy,
	})
}

// --- Adaptive join ----------------------------------------------------------------

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func analyzeAdaptiveJoin(relOp, aj *xmlElement, ctx *stmtContext, nodeID int, estRows, actual float64, hasActual bool, adaptive *AdaptiveProcessing) {
	attrOf := func(name string) string {
		v := relOp.Attr(name)
		if v == "" && aj != nil {
			v = aj.Attr(name)
		}
		if v == "" {
			v = counterAttr(relOp, name)
		}
		return v
	}

	f := &AdaptiveJoinFinding{
		StatementID:       ctx.id,
		NodeID:            nodeID,
		EstimatedJoinType: attrOf("EstimatedJoinType"),
		ActualJoinType:    firstNonEmpty(counterAttr(relOp, "ActualJoinType"), relOp.Attr("ActualJoinType"), func() string {
			if aj != nil {
				return aj.Attr("ActualJoinType")
			}
			return ""
		}()),
		EstimateRows:  estRows,
		ActualRows:    actual,
		HasActualRows: hasActual,
	}
	if t := attrOf("AdaptiveThresholdRows"); t != "" {
		f.ThresholdRows, _ = strconv.ParseFloat(t, 64)
		f.HasThreshold = true
	}

	switch {
	case f.ActualJoinType != "" && f.HasThreshold:
		f.Description = fmt.Sprintf("Adaptive Join resolved to %s at runtime (threshold %s rows, estimated join type %s). The join algorithm was chosen from the real build-side row count instead of the compile-time estimate.",
			f.ActualJoinType, formatCount(f.ThresholdRows), firstNonEmpty(f.EstimatedJoinType, "n/a"))
	case f.ActualJoinType != "":
		f.Description = fmt.Sprintf("Adaptive Join resolved to %s at runtime.", f.ActualJoinType)
	case f.HasThreshold:
		f.Description = fmt.Sprintf("Adaptive Join switches from Nested Loops to Hash Match when the build input exceeds %s rows. This is an Estimated plan, so the runtime choice is not available.",
			formatCount(f.ThresholdRows))
	default:
		f.Description = "Adaptive Join defers the Hash vs Nested Loops decision until the build input has been read at runtime, protecting against cardinality misestimates."
	}
	adaptive.AdaptiveJoins = append(adaptive.AdaptiveJoins, f)
}

// ---------------------------------------------------------------------------
// Finalizers
// ---------------------------------------------------------------------------

func finalizeMissingStats(diag *AdvancedDiagnostics) {
	for _, f := range diag.MissingStatistics {
		sort.Strings(f.Columns)
		target := qn(f.Table)
		if f.Schema != "" {
			target = qn(f.Schema) + "." + target
		}
		quoted := make([]string, len(f.Columns))
		for i, c := range f.Columns {
			quoted[i] = qn(c)
		}
		f.Severity = "HIGH"
		if strings.HasPrefix(f.Table, "#") {
			f.Severity = "MEDIUM"
		}
		f.Description = fmt.Sprintf("The optimizer had NO statistics on %s of %s, so it guessed selectivity (fixed 10%%/30%% heuristics). Row estimates, join order and memory grants are unreliable.",
			strings.Join(quoted, ", "), target)
		f.Remedy = "Ensure AUTO_CREATE_STATISTICS is ON (and the DB is not read-only), then create/refresh the statistics. Auto-creation is skipped for read-only databases, some column types, and when disabled."
		stat := sanitizeIdent("ST_" + trimBr(f.Table) + "_" + strings.Join(f.Columns, "_"))
		if len(stat) > 120 {
			stat = stat[:120]
		}
		f.SuggestedDDL = fmt.Sprintf("CREATE STATISTICS [%s]\nON %s (%s)\nWITH FULLSCAN;", stat, target, strings.Join(quoted, ", "))
	}
	sort.SliceStable(diag.MissingStatistics, func(i, j int) bool {
		return severityRank(diag.MissingStatistics[i].Severity) > severityRank(diag.MissingStatistics[j].Severity)
	})
}

func finalizeParameterSniffing(diag *AdvancedDiagnostics, byKey map[string]*paramAggregate, order []string) {
	for _, key := range order {
		f := byKey[key].finding
		f.Mitigation = strings.Join(byKey[key].mitigations, ", ")

		var mismatches []string
		for _, p := range f.Parameters {
			if p.Mismatch {
				mismatches = append(mismatches, fmt.Sprintf("%s compiled for %s, ran with %s", p.Name, p.CompiledValue, p.RuntimeValue))
			}
		}

		switch {
		case f.HasMismatch && f.HasEstimateImpact:
			f.Severity = "HIGH"
			f.Description = "Classic parameter sniffing: the cached plan was built for different values than this execution (" + strings.Join(mismatches, "; ") +
				") and the cardinality estimates are visibly wrong for the runtime values."
		case f.HasMismatch:
			f.Severity = "MEDIUM"
			f.Description = "Compile-time and runtime parameter values differ (" + strings.Join(mismatches, "; ") +
				"). The plan is optimized for the sniffed values and may be a poor fit for this execution."
		case f.HasRuntimeValues:
			f.Severity = "INFO"
			f.Description = "Compile-time and runtime parameter values match for this execution, but the plan will be reused for other values and could be unsuitable for skewed data."
		default:
			f.Severity = "INFO"
			f.Description = "This plan was compiled by sniffing the parameter values listed below and will be reused for every future execution. Capture the Actual plan to compare against runtime values."
		}
		f.Remedy = "Options: OPTION (RECOMPILE) for volatile/skewed predicates; OPTION (OPTIMIZE FOR UNKNOWN) or OPTIMIZE FOR (@p = typical) for a stable generic plan; split skewed branches into separate procedures; SQL Server 2022 Parameter Sensitive Plan optimization; or force a good plan via Query Store."
		diag.ParameterSniffing = append(diag.ParameterSniffing, f)
	}
	sort.SliceStable(diag.ParameterSniffing, func(i, j int) bool {
		return severityRank(diag.ParameterSniffing[i].Severity) > severityRank(diag.ParameterSniffing[j].Severity)
	})
}

func finalizeAdaptive(diag *AdvancedDiagnostics, ap *AdaptiveProcessing, mgf, dop []string,
	interleaved, inlineUDF, psp bool) {

	ceVersion := -1
	if diag.CardinalityEngine != nil {
		ceVersion = parseIntSafe(diag.CardinalityEngine.ModelVersion)
	}
	eligible := func(minVersion int, detail string) (string, string) {
		if ceVersion < 0 {
			return "Unknown", "Compatibility level could not be determined from this plan. " + detail
		}
		if ceVersion >= minVersion {
			return "Eligible", detail
		}
		return "Not Applicable", fmt.Sprintf("Requires database compatibility level %d+ (this plan was compiled under level %d). %s", minVersion, ceVersion, detail)
	}
	add := func(name, status, detail string) {
		ap.Features = append(ap.Features, &IQPFeature{Name: name, Status: status, Detail: detail})
	}

	// Adaptive joins
	if len(ap.AdaptiveJoins) > 0 {
		add("Adaptive Joins", "Active", fmt.Sprintf("%d Adaptive Join operator(s) found in this plan.", len(ap.AdaptiveJoins)))
	} else {
		s, d := eligible(140, "Requires batch mode and an Enterprise-class edition; chosen only when the optimizer sees a join with a wide estimate gap.")
		add("Adaptive Joins", s, d)
	}

	// Batch mode
	if ap.BatchModeOperators > 0 {
		d := fmt.Sprintf("%d of %d operators run in batch mode.", ap.BatchModeOperators, ap.TotalOperators)
		if ap.BatchOnRowstore {
			d += " Batch mode on rowstore is in use (no columnstore index needed)."
		}
		add("Batch Mode Execution", "Active", d)
	} else {
		s, d := eligible(150, "Batch mode on rowstore helps analytic queries (large scans/aggregations); this plan chose row mode.")
		add("Batch Mode Execution", s, d)
	}

	// Memory grant feedback
	if len(mgf) > 0 {
		add("Memory Grant Feedback", "Active", "Status reported by the engine: "+strings.Join(uniqueStrings(mgf), ", ")+".")
	} else {
		s, d := eligible(140, "Adjusts memory grants between executions (batch mode from 140, row mode from 150) to fix spills and over-grants.")
		add("Memory Grant Feedback", s, d)
	}

	// Interleaved execution
	if interleaved {
		add("Interleaved Execution", "Active", "Plan contains multi-statement TVF candidates whose cardinality is materialized before optimization.")
	} else {
		s, d := eligible(140, "Only applies to multi-statement table-valued functions (MSTVF).")
		add("Interleaved Execution", s, d)
	}

	// Scalar UDF inlining
	switch {
	case inlineUDF:
		add("Scalar UDF Inlining", "Active", "Scalar T-SQL UDFs were inlined into the query plan.")
	case len(diag.ScalarUDFWarnings) > 0:
		s, d := eligible(150, "")
		if s == "Eligible" {
			d = "Scalar UDF(s) are present but were NOT inlined: inlining is blocked by constructs like loops, table variables, GETDATE-style nondeterminism, or side-effecting calls."
		}
		add("Scalar UDF Inlining", s, strings.TrimSpace(d))
	default:
		s, d := eligible(150, "Rewrites eligible scalar UDFs as relational expressions (no scalar UDFs seen in this plan).")
		add("Scalar UDF Inlining", s, d)
	}

	// Parameter sensitive plan
	if psp {
		add("Parameter Sensitive Plan (PSP)", "Active", "A dispatcher plan with multiple query variants is in use for skewed parameters.")
	} else {
		s, d := eligible(160, "Creates multiple plans for skewed parameter values automatically (SQL Server 2022).")
		add("Parameter Sensitive Plan (PSP)", s, d)
	}

	// DOP feedback
	if len(dop) > 0 {
		add("Degree of Parallelism Feedback", "Active", "Status reported by the engine: "+strings.Join(uniqueStrings(dop), ", ")+".")
	} else {
		s, d := eligible(160, "Automatically lowers MAXDOP for queries with inefficient parallelism (SQL Server 2022).")
		add("Degree of Parallelism Feedback", s, d)
	}

	active := 0
	for _, f := range ap.Features {
		if f.Status == "Active" {
			active++
		}
	}
	switch {
	case ceVersion < 0:
		ap.Summary = fmt.Sprintf("%d IQP feature(s) active. Compatibility level could not be detected.", active)
	case ceVersion < 140:
		ap.Summary = fmt.Sprintf("Compiled under compatibility level %d: most Intelligent Query Processing features (140+) are unavailable. Raising the level (after regression testing) unlocks adaptive joins, memory grant feedback and more.", ceVersion)
	default:
		ap.Summary = fmt.Sprintf("Compiled under compatibility level %d: %d of %d IQP features are active in this plan.", ceVersion, active, len(ap.Features))
	}

	diag.Adaptive = ap
}

// ---------------------------------------------------------------------------
// Anti-pattern promotion + health score
// ---------------------------------------------------------------------------

func appendFindingAntiPatterns(analysis *PlanAnalysis, diag *AdvancedDiagnostics) {
	add := func(typ, severity, title, desc, rec string, affected []string) {
		if len(affected) == 0 {
			return
		}
		analysis.AntiPatterns = append(analysis.AntiPatterns, &AntiPattern{
			Type:               typ,
			Severity:           severity,
			Title:              title,
			Description:        desc,
			AffectedStatements: uniqueStrings(affected),
			Recommendation:     rec,
		})
	}

	// Key lookups (HIGH+)
	var klAffected []string
	klSeverity := "INFO"
	for _, k := range diag.KeyLookups {
		if severityRank(k.Severity) >= severityRank("HIGH") {
			klAffected = append(klAffected, fmt.Sprintf("Stmt #%s (%s)", k.StatementID, k.Table))
			klSeverity = atLeastSeverity(klSeverity, k.Severity)
		}
	}
	add("KEY_LOOKUP", klSeverity, "Heavy Key / RID Lookups",
		"Index seeks are followed by thousands of per-row lookups into the base table to fetch columns the index does not contain.",
		"Add the fetched columns to the driving index with INCLUDE, or create a covering index.", klAffected)

	// Spools
	var spAffected []string
	spSeverity := "INFO"
	for _, s := range diag.Spools {
		if severityRank(s.Severity) >= severityRank("HIGH") {
			spAffected = append(spAffected, fmt.Sprintf("Stmt #%s (Node %d %s)", s.StatementID, s.NodeID, s.PhysicalOp))
			spSeverity = atLeastSeverity(spSeverity, s.Severity)
		}
	}
	add("SPOOL", spSeverity, "Expensive Spool Operators",
		"Spool operators materialize intermediate rows in TempDB (an Eager Index Spool builds a temporary index on every execution).",
		"Create the permanent index the optimizer wanted, or materialize the subquery into an indexed temp table.", spAffected)

	// Missing statistics
	var msAffected []string
	for _, m := range diag.MissingStatistics {
		msAffected = append(msAffected, fmt.Sprintf("Stmt #%s (%s)", m.StatementID, m.Table))
	}
	add("MISSING_STATISTICS", "HIGH", "Columns With No Statistics",
		"The optimizer compiled this plan without statistics on filtered/joined columns and used guessed selectivity.",
		"Enable AUTO_CREATE_STATISTICS and create the listed statistics (CREATE STATISTICS ... WITH FULLSCAN).", msAffected)

	// Parameter sniffing
	var psAffected []string
	psSeverity := "INFO"
	for _, p := range diag.ParameterSniffing {
		if severityRank(p.Severity) >= severityRank("MEDIUM") {
			psAffected = append(psAffected, p.AffectedStatements...)
			psSeverity = atLeastSeverity(psSeverity, p.Severity)
		}
	}
	add("PARAMETER_SNIFFING", psSeverity, "Parameter Sniffing Mismatch",
		"The plan was compiled for parameter values that differ from the runtime values.",
		"Use OPTION (RECOMPILE), OPTIMIZE FOR UNKNOWN, split skewed paths, or SQL Server 2022 PSP optimization.", psAffected)

	// Non-sargable
	var nsAffected []string
	nsSeverity := "INFO"
	for _, n := range diag.NonSargable {
		if severityRank(n.Severity) >= severityRank("MEDIUM") {
			nsAffected = append(nsAffected, fmt.Sprintf("Stmt #%s (%s)", n.StatementID, n.Table))
			nsSeverity = atLeastSeverity(nsSeverity, n.Severity)
		}
	}
	add("NON_SARGABLE", nsSeverity, "Non-Sargable Predicates",
		"Functions wrapped around indexed columns (or leading-wildcard LIKE) block index seeks and force row-by-row evaluation.",
		"Rewrite predicates so the bare column is compared to a computed constant/range, or add an indexed computed column.", nsAffected)

	// Row goal misfire
	var rgAffected []string
	rgSeverity := "INFO"
	for _, r := range diag.RowGoals {
		if r.Misfired {
			rgAffected = append(rgAffected, fmt.Sprintf("Stmt #%s (Node %d)", r.StatementID, r.NodeID))
			rgSeverity = atLeastSeverity(rgSeverity, r.Severity)
		}
	}
	add("ROW_GOAL_MISFIRE", rgSeverity, "Row Goal Misfire (TOP / FAST N / EXISTS)",
		"The optimizer assumed matching rows would be found quickly, but far more rows were processed than estimated.",
		"Test OPTION (USE HINT('DISABLE_OPTIMIZER_ROWGOAL')) and add an index supporting the filter and sort order.", rgAffected)
}

func worstSeverity(severities []string) string {
	worst := ""
	for _, s := range severities {
		if severityRank(s) > severityRank(worst) {
			worst = s
		}
	}
	return worst
}

// extraHealthPenalty returns the score deduction produced by the 7 extended detectors
func extraHealthPenalty(diag *AdvancedDiagnostics) int {
	penalty := 0

	collect := func(n int, get func(i int) string) string {
		list := make([]string, n)
		for i := 0; i < n; i++ {
			list[i] = get(i)
		}
		return worstSeverity(list)
	}

	if w := collect(len(diag.KeyLookups), func(i int) string { return diag.KeyLookups[i].Severity }); severityRank(w) >= 3 {
		penalty += 10
	} else if severityRank(w) == 2 {
		penalty += 5
	}

	if w := collect(len(diag.Spools), func(i int) string { return diag.Spools[i].Severity }); severityRank(w) >= 3 {
		penalty += 10
	} else if severityRank(w) == 2 {
		penalty += 5
	}

	if len(diag.MissingStatistics) > 0 {
		penalty += 12
	}

	hasImpact, hasMismatch := false, false
	for _, p := range diag.ParameterSniffing {
		if p.HasMismatch && p.HasEstimateImpact {
			hasImpact = true
		}
		if p.HasMismatch {
			hasMismatch = true
		}
	}
	if hasImpact {
		penalty += 10
	} else if hasMismatch {
		penalty += 5
	}

	if w := collect(len(diag.NonSargable), func(i int) string { return diag.NonSargable[i].Severity }); severityRank(w) >= 3 {
		penalty += 12
	} else if severityRank(w) == 2 {
		penalty += 6
	}

	for _, r := range diag.RowGoals {
		if r.Misfired {
			penalty += 8
			break
		}
	}

	return penalty
}
