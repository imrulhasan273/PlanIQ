package sqlplan

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"golang.org/x/text/encoding/unicode"
)

// DecodeToUTF8 detects and converts UTF-16 (LE or BE, with or without BOM) and UTF-8 BOM to clean UTF-8
func DecodeToUTF8(raw []byte) ([]byte, error) {
	if len(raw) >= 3 && raw[0] == 0xEF && raw[1] == 0xBB && raw[2] == 0xBF {
		return raw[3:], nil
	}
	if len(raw) >= 2 {
		if raw[0] == 0xFF && raw[1] == 0xFE {
			// UTF-16 LE with BOM
			return unicode.UTF16(unicode.LittleEndian, unicode.IgnoreBOM).NewDecoder().Bytes(raw[2:])
		}
		if raw[0] == 0xFE && raw[1] == 0xFF {
			// UTF-16 BE with BOM
			return unicode.UTF16(unicode.BigEndian, unicode.IgnoreBOM).NewDecoder().Bytes(raw[2:])
		}
		if raw[0] == '<' && raw[1] == 0 {
			// UTF-16 LE without BOM
			return unicode.UTF16(unicode.LittleEndian, unicode.IgnoreBOM).NewDecoder().Bytes(raw)
		}
		if raw[0] == 0 && raw[1] == '<' {
			// UTF-16 BE without BOM
			return unicode.UTF16(unicode.BigEndian, unicode.IgnoreBOM).NewDecoder().Bytes(raw)
		}
	}
	return raw, nil
}

// ParseFile reads an execution plan file from disk, normalizes encoding, and parses it
func ParseFile(filePath string, planName string) (*PlanAnalysis, error) {
	raw, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}
	if planName == "" {
		planName = filepath.Base(filePath)
	}
	return ParseBytes(raw, planName)
}

// ParseBytes parses ShowPlan XML from raw bytes
func ParseBytes(raw []byte, planName string) (*PlanAnalysis, error) {
	utf8Bytes, err := DecodeToUTF8(raw)
	if err != nil {
		return nil, fmt.Errorf("failed to decode XML content: %w", err)
	}

	reader := bytes.NewReader(utf8Bytes)
	decoder := xml.NewDecoder(reader)
	decoder.CharsetReader = func(charset string, input io.Reader) (io.Reader, error) {
		return input, nil
	}

	return parsePlanWithDecoder(decoder, planName)
}

// ParseXML processes raw SQL Server ShowPlan XML and produces an in-depth PlanAnalysis
func ParseXML(xmlContent string, planName string) (*PlanAnalysis, error) {
	return ParseBytes([]byte(xmlContent), planName)
}

func parsePlanWithDecoder(decoder *xml.Decoder, planName string) (*PlanAnalysis, error) {
	analysis := &PlanAnalysis{
		PlanName:          planName,
		Statements:        make([]*StatementAnalysis, 0),
		WaitStats:         make([]*WaitStat, 0),
		GlobalWarnings:    make([]string, 0),
		AllMissingIndexes: make([]*MissingIndexInfo, 0),
		AntiPatterns:      make([]*AntiPattern, 0),
	}

	// First pass: build lightweight XML tree for reliable navigation
	root, err := parseXMLToNode(decoder)
	if err != nil {
		return nil, fmt.Errorf("failed to parse XML: %w", err)
	}

	// Extract global batch/query plan properties
	if qp := root.findFirst("QueryPlan"); qp != nil {
		if reason := qp.Attr("NonParallelPlanReason"); reason != "" {
			analysis.MaxDOPReason = reason
		}
		if size := qp.Attr("CachedPlanSize"); size != "" {
			analysis.CachedPlanSizeKB, _ = strconv.Atoi(size)
		}
	}
	if optProps := root.findFirst("OptimizerHardwareDependentProperties"); optProps != nil {
		if mem := optProps.Attr("MaxCompileMemory"); mem != "" {
			analysis.MaxCompileMemory, _ = strconv.ParseInt(mem, 10, 64)
		}
	}

	// Extract Wait Statistics (<WaitStats>)
	extractWaitStats(root, analysis)

	// Traverse for statements (StmtSimple, StmtCond, StmtCursor)
	findStatements(root, analysis)

	analysis.TotalStatements = len(analysis.Statements)

	// Calculate total subtree cost
	var totalCost float64
	for _, stmt := range analysis.Statements {
		totalCost += stmt.StatementSubTreeCost
	}
	analysis.TotalSubTreeCost = totalCost

	// Calculate cost percentages and aggregate missing indexes
	for _, stmt := range analysis.Statements {
		if totalCost > 0 {
			stmt.CostPercentage = (stmt.StatementSubTreeCost / totalCost) * 100.0
		}
		for _, mi := range stmt.MissingIndexes {
			analysis.AllMissingIndexes = append(analysis.AllMissingIndexes, mi)
		}
	}

	// Sort statements by SubTree cost descending so DBAs see the worst offenders first
	sort.Slice(analysis.Statements, func(i, j int) bool {
		return analysis.Statements[i].StatementSubTreeCost > analysis.Statements[j].StatementSubTreeCost
	})

	// Detect Anti-Patterns
	detectAntiPatterns(analysis)

	// Generate 10-Second Executive Verdict
	analysis.ExecutiveVerdict = generateExecutiveVerdict(analysis)

	// Generate Advanced Root Cause Diagnostics
	analysis.Diagnostics = generateAdvancedDiagnostics(root, analysis)

	// Extract Server Hardware & I/O Metrics (Total reads, RAM touched, CPU vs Clock, Table I/O Leaderboard)
	analysis.HardwareMetrics = extractHardwareMetrics(root, analysis)

	return analysis, nil
}

// ComparePlans calculates side-by-side metric diffs between Plan A and Plan B
func ComparePlans(planA, planB *PlanAnalysis) *PlanComparison {
	costA := planA.TotalSubTreeCost
	costB := planB.TotalSubTreeCost

	var diffPct float64
	if costA > 0 {
		diffPct = ((costA - costB) / costA) * 100.0
	}

	isImprovement := costB < costA
	resolvedIndexes := len(planA.AllMissingIndexes) - len(planB.AllMissingIndexes)
	if resolvedIndexes < 0 {
		resolvedIndexes = 0
	}

	comp := &PlanComparison{
		PlanAName:            planA.PlanName,
		PlanBName:            planB.PlanName,
		CostBefore:           costA,
		CostAfter:            costB,
		CostReductionPercent: diffPct,
		IsImprovement:        isImprovement,
		MissingIndexesBefore: len(planA.AllMissingIndexes),
		MissingIndexesAfter:  len(planB.AllMissingIndexes),
		ResolvedIndexesCount: resolvedIndexes,
		StatementsDiff:       make([]*StatementDiff, 0),
	}

	// Match statements by ID
	mapB := make(map[string]*StatementAnalysis)
	for _, sb := range planB.Statements {
		mapB[sb.StatementID] = sb
	}

	for _, sa := range planA.Statements {
		diff := &StatementDiff{
			StatementID:  sa.StatementID,
			CostA:        sa.StatementSubTreeCost,
			QuerySnippet: sa.StatementText,
		}
		if sb, exists := mapB[sa.StatementID]; exists {
			diff.CostB = sb.StatementSubTreeCost
			if sa.StatementSubTreeCost > 0 {
				diff.CostDiffPct = ((sa.StatementSubTreeCost - sb.StatementSubTreeCost) / sa.StatementSubTreeCost) * 100.0
			}
			diff.HasImprovement = sb.StatementSubTreeCost < sa.StatementSubTreeCost
		}
		comp.StatementsDiff = append(comp.StatementsDiff, diff)
	}

	if isImprovement {
		comp.SummaryVerdict = fmt.Sprintf("Query execution cost was reduced by %0.1f%% (%0.2f ➔ %0.2f). %d missing index recommendation(s) resolved.", diffPct, costA, costB, resolvedIndexes)
	} else {
		comp.SummaryVerdict = fmt.Sprintf("Plan B has higher execution cost than Plan A (%0.2f ➔ %0.2f). Revisit indexing or query changes.", costA, costB)
	}

	return comp
}

// xmlElement is a lightweight generic node for traversing ShowPlan XML
type xmlElement struct {
	Name     string
	Attrs    map[string]string
	Children []*xmlElement
	Text     string
}

func (e *xmlElement) Attr(name string) string {
	if e.Attrs == nil {
		return ""
	}
	return e.Attrs[name]
}

func (e *xmlElement) findFirst(name string) *xmlElement {
	for _, child := range e.Children {
		if child.Name == name {
			return child
		}
		if found := child.findFirst(name); found != nil {
			return found
		}
	}
	return nil
}

func (e *xmlElement) findAll(name string) []*xmlElement {
	var results []*xmlElement
	e.findAllInto(name, &results)
	return results
}

func (e *xmlElement) findAllInto(name string, results *[]*xmlElement) {
	for _, child := range e.Children {
		if child.Name == name {
			*results = append(*results, child)
		}
		child.findAllInto(name, results)
	}
}

func parseXMLToNode(decoder *xml.Decoder) (*xmlElement, error) {
	var stack []*xmlElement

	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}

		switch t := token.(type) {
		case xml.StartElement:
			elem := &xmlElement{
				Name:     t.Name.Local,
				Attrs:    make(map[string]string, len(t.Attr)),
				Children: make([]*xmlElement, 0, 4),
			}
			for _, a := range t.Attr {
				elem.Attrs[a.Name.Local] = a.Value
			}
			if len(stack) > 0 {
				parent := stack[len(stack)-1]
				parent.Children = append(parent.Children, elem)
			}
			stack = append(stack, elem)

		case xml.EndElement:
			if len(stack) > 1 {
				stack = stack[:len(stack)-1]
			}
		}
	}

	if len(stack) > 0 {
		return stack[0], nil
	}
	return nil, fmt.Errorf("empty XML document")
}

func extractWaitStats(root *xmlElement, analysis *PlanAnalysis) {
	for _, wsElem := range root.findAll("WaitStats") {
		for _, w := range wsElem.findAll("Wait") {
			wType := w.Attr("WaitType")
			wTime, _ := strconv.ParseInt(w.Attr("WaitTimeMs"), 10, 64)
			wCount, _ := strconv.ParseInt(w.Attr("WaitCount"), 10, 64)

			category, desc := categorizeWaitType(wType)
			analysis.WaitStats = append(analysis.WaitStats, &WaitStat{
				WaitType:    wType,
				WaitTimeMs:  wTime,
				WaitCount:   wCount,
				Category:    category,
				Description: desc,
			})
		}
	}

	// Sort waits by wait time descending
	sort.Slice(analysis.WaitStats, func(i, j int) bool {
		return analysis.WaitStats[i].WaitTimeMs > analysis.WaitStats[j].WaitTimeMs
	})
}

func categorizeWaitType(waitType string) (string, string) {
	wt := strings.ToUpper(waitType)
	switch {
	case strings.HasPrefix(wt, "PAGEIOLATCH") || wt == "IO_COMPLETION" || wt == "ASYNC_IO_COMPLETION":
		return "Disk I/O", "Waiting for data pages to be read from physical disk into buffer pool memory."
	case wt == "CXPACKET" || wt == "CXCONSUMER":
		return "Parallelism", "Query threads waiting to exchange rows or synchronize work distribution."
	case wt == "ASYNC_NETWORK_IO":
		return "Network / Client", "SQL Server is waiting for the client application (ORM/UI) to consume result rows."
	case wt == "RESOURCE_SEMAPHORE":
		return "Memory Grant", "Query is throttled waiting in queue to receive its required RAM allocation."
	case strings.HasPrefix(wt, "LCK_"):
		return "Lock Contention", "Query is blocked waiting for an exclusive or shared transaction lock."
	case strings.HasPrefix(wt, "WRITELOG"):
		return "Log Write", "Waiting for transaction log flush to disk (slow transaction log drive)."
	default:
		return "Other Wait", "Internal SQL Server synchronization or worker wait."
	}
}

func findStatements(node *xmlElement, analysis *PlanAnalysis) {
	if strings.HasPrefix(node.Name, "Stmt") {
		stmt := parseStatement(node)
		if stmt != nil {
			analysis.Statements = append(analysis.Statements, stmt)
		}
	}

	for _, child := range node.Children {
		findStatements(child, analysis)
	}
}

func parseStatement(elem *xmlElement) *StatementAnalysis {
	stmtID := elem.Attr("StatementId")
	if stmtID == "" {
		stmtID = elem.Attr("StatementCompId")
	}

	stmtType := elem.Attr("StatementType")
	stmtText := strings.TrimSpace(elem.Attr("StatementText"))
	subTreeCost, _ := strconv.ParseFloat(elem.Attr("StatementSubTreeCost"), 64)
	estRows, _ := strconv.ParseFloat(elem.Attr("StatementEstRows"), 64)
	optLevel := elem.Attr("StatementOptmLevel")

	stmt := &StatementAnalysis{
		StatementID:          stmtID,
		StatementCompID:      elem.Attr("StatementCompId"),
		StatementType:        stmtType,
		StatementText:        stmtText,
		StatementSubTreeCost: subTreeCost,
		StatementEstRows:     estRows,
		OptimizationLevel:    optLevel,
		Warnings:             make([]*PlanWarning, 0),
		MissingIndexes:       make([]*MissingIndexInfo, 0),
	}

	// Check for QueryPlan
	qp := elem.findFirst("QueryPlan")
	if qp != nil {
		stmt.HasQueryPlan = true
		stmt.CompileTimeMS, _ = strconv.Atoi(qp.Attr("CompileTime"))
		stmt.CompileCPUMS, _ = strconv.Atoi(qp.Attr("CompileCPU"))
		stmt.CompileMemoryKB, _ = strconv.Atoi(qp.Attr("CompileMemory"))

		// Find Missing Indexes
		for _, grpElem := range qp.findAll("MissingIndexGroup") {
			impact, _ := strconv.ParseFloat(grpElem.Attr("Impact"), 64)
			for _, miElem := range grpElem.findAll("MissingIndex") {
				mi := parseMissingIndex(miElem, stmtID, impact)
				if mi != nil {
					stmt.MissingIndexes = append(stmt.MissingIndexes, mi)
				}
			}
		}

		// Find RelOp root
		if rootRelOp := qp.findFirst("RelOp"); rootRelOp != nil {
			stmt.RootNode = parseRelOp(rootRelOp, subTreeCost)
		}
	}

	// Find Statement-level Warnings
	for _, wElem := range elem.findAll("Warnings") {
		for _, convert := range wElem.findAll("PlanAffectingConvert") {
			stmt.Warnings = append(stmt.Warnings, &PlanWarning{
				StatementID: stmtID,
				Kind:        "PlanAffectingConvert",
				Issue:       convert.Attr("ConvertIssue"),
				Expression:  convert.Attr("Expression"),
				Description: fmt.Sprintf("Implicit type conversion (%s) on %s may prevent index seeks.", convert.Attr("ConvertIssue"), convert.Attr("Expression")),
			})
		}
		for range wElem.findAll("SpillToTempDb") {
			stmt.Warnings = append(stmt.Warnings, &PlanWarning{
				StatementID: stmtID,
				Kind:        "SpillToTempDb",
				Description: "Operator spilled data to TempDB due to insufficient memory grant.",
			})
		}
	}

	// Aggregate statement hardware metrics and compute execution classification
	aggregateStatementMetrics(stmt)

	return stmt
}

func aggregateStatementMetrics(stmt *StatementAnalysis) {
	if stmt.RootNode == nil {
		classifyStatement(stmt)
		return
	}

	var sumLogicalReads, sumPhysicalReads, sumReadAheads int64
	var maxCPU, maxElapsed int64
	hasActual := false

	var walk func(node *PlanNode)
	walk = func(node *PlanNode) {
		if node == nil {
			return
		}
		if node.HasActualRows || node.ActualLogicalReads > 0 || node.ActualPhysicalReads > 0 || node.ActualCPUms > 0 || node.ActualElapsedms > 0 {
			hasActual = true
		}
		sumLogicalReads += node.ActualLogicalReads
		sumPhysicalReads += node.ActualPhysicalReads
		sumReadAheads += node.ActualReadAheads
		if node.ActualCPUms > maxCPU {
			maxCPU = node.ActualCPUms
		}
		if node.ActualElapsedms > maxElapsed {
			maxElapsed = node.ActualElapsedms
		}
		for _, child := range node.Children {
			walk(child)
		}
	}
	walk(stmt.RootNode)

	stmt.ActualLogicalReads = sumLogicalReads
	stmt.ActualLogicalReadsMB = math.Round((float64(sumLogicalReads)/128.0)*10) / 10
	stmt.ActualPhysicalReads = sumPhysicalReads
	stmt.ActualReadAheads = sumReadAheads

	// Root RelOp typically holds total subtree CPU & elapsed time; fallback to max
	if stmt.RootNode.ActualCPUms > 0 {
		stmt.ActualCPUms = stmt.RootNode.ActualCPUms
	} else {
		stmt.ActualCPUms = maxCPU
	}

	if stmt.RootNode.ActualElapsedms > 0 {
		stmt.ActualElapsedms = stmt.RootNode.ActualElapsedms
	} else {
		stmt.ActualElapsedms = maxElapsed
	}

	stmt.HasActualMetrics = hasActual
	classifyStatement(stmt)
}

func classifyStatement(stmt *StatementAnalysis) {
	if stmt.HasActualMetrics {
		if stmt.ActualPhysicalReads > 0 || (stmt.ActualLogicalReads >= 5000 && float64(stmt.ActualElapsedms) > float64(stmt.ActualCPUms)*1.25) {
			stmt.ExecutionClassification = "IO_BOUND"
			stmt.ExecutionClassificationReason = fmt.Sprintf("I/O Bound: High page reads (%d pages / %0.1f MB) and storage engine operations dominated clock time.", stmt.ActualLogicalReads, stmt.ActualLogicalReadsMB)
		} else if stmt.ActualCPUms > 0 && float64(stmt.ActualCPUms) >= float64(stmt.ActualElapsedms)*0.70 {
			stmt.ExecutionClassification = "CPU_BOUND"
			activePct := 0.0
			if stmt.ActualElapsedms > 0 {
				activePct = (float64(stmt.ActualCPUms) / float64(stmt.ActualElapsedms)) * 100.0
			}
			stmt.ExecutionClassificationReason = fmt.Sprintf("CPU Bound: Compute active for %d ms (%0.0f%% of %d ms clock time) processing joins, sorting, or aggregates.", stmt.ActualCPUms, activePct, stmt.ActualElapsedms)
		} else if stmt.ActualElapsedms > stmt.ActualCPUms*2 && stmt.ActualElapsedms > 50 {
			stmt.ExecutionClassification = "WAIT_BOUND"
			stmt.ExecutionClassificationReason = fmt.Sprintf("Wait Bottleneck: Spent %d ms waiting on locks, synchronization, or worker scheduling (%d ms CPU vs %d ms elapsed).", stmt.ActualElapsedms-stmt.ActualCPUms, stmt.ActualCPUms, stmt.ActualElapsedms)
		} else {
			stmt.ExecutionClassification = "BALANCED"
			stmt.ExecutionClassificationReason = fmt.Sprintf("Balanced Execution: Resource utilization well-proportioned (%d ms CPU, %d ms elapsed, %d reads).", stmt.ActualCPUms, stmt.ActualElapsedms, stmt.ActualLogicalReads)
		}
	} else if stmt.RootNode != nil {
		// Estimated plan fallback
		ioCost := stmt.RootNode.EstimateIO
		cpuCost := stmt.RootNode.EstimateCPU
		if ioCost > cpuCost*1.5 && ioCost > 0.5 {
			stmt.ExecutionClassification = "IO_BOUND"
			stmt.ExecutionClassificationReason = fmt.Sprintf("Estimated I/O Bound: Estimated I/O cost (%0.2f) significantly exceeds CPU cost (%0.2f).", ioCost, cpuCost)
		} else if cpuCost > ioCost*1.5 && cpuCost > 0.5 {
			stmt.ExecutionClassification = "CPU_BOUND"
			stmt.ExecutionClassificationReason = fmt.Sprintf("Estimated CPU Bound: Estimated CPU cost (%0.2f) significantly exceeds I/O cost (%0.2f).", cpuCost, ioCost)
		} else {
			stmt.ExecutionClassification = "BALANCED"
			stmt.ExecutionClassificationReason = fmt.Sprintf("Estimated Balanced: Proportional estimated CPU (%0.2f) and I/O (%0.2f).", cpuCost, ioCost)
		}
	} else {
		stmt.ExecutionClassification = "BALANCED"
		stmt.ExecutionClassificationReason = "Control statement or DDL."
	}
}

func parseMissingIndex(elem *xmlElement, stmtID string, impact float64) *MissingIndexInfo {
	db := elem.Attr("Database")
	schema := elem.Attr("Schema")
	table := elem.Attr("Table")

	mi := &MissingIndexInfo{
		StatementID:       stmtID,
		Impact:            impact,
		Database:          db,
		Schema:            schema,
		Table:             table,
		EqualityColumns:   make([]string, 0),
		InequalityColumns: make([]string, 0),
		IncludeColumns:    make([]string, 0),
	}

	for _, cg := range elem.findAll("ColumnGroup") {
		usage := cg.Attr("Usage")
		for _, col := range cg.findAll("Column") {
			colName := col.Attr("Name")
			switch usage {
			case "EQUALITY":
				mi.EqualityColumns = append(mi.EqualityColumns, colName)
			case "INEQUALITY":
				mi.InequalityColumns = append(mi.InequalityColumns, colName)
			case "INCLUDE":
				mi.IncludeColumns = append(mi.IncludeColumns, colName)
			}
		}
	}

	// Generate clean CREATE NONCLUSTERED INDEX DDL
	mi.SuggestedDDL = generateIndexDDL(mi)
	return mi
}

func generateIndexDDL(mi *MissingIndexInfo) string {
	cleanTable := strings.Trim(mi.Table, "[]")
	if cleanTable == "" {
		cleanTable = "Table"
	}
	cleanSchema := strings.Trim(mi.Schema, "[]")
	if cleanSchema == "" {
		cleanSchema = "dbo"
	}

	var keyCols []string
	keyCols = append(keyCols, mi.EqualityColumns...)
	keyCols = append(keyCols, mi.InequalityColumns...)

	if len(keyCols) == 0 {
		return ""
	}

	var colPart []string
	for _, c := range keyCols {
		colPart = append(colPart, strings.Trim(c, "[]"))
	}
	idxName := fmt.Sprintf("IX_%s_%s", cleanTable, strings.Join(colPart, "_"))
	if len(idxName) > 120 {
		idxName = idxName[:120]
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("CREATE NONCLUSTERED INDEX [%s]\n", idxName))
	sb.WriteString(fmt.Sprintf("ON [%s].[%s] (%s)", cleanSchema, cleanTable, strings.Join(keyCols, ", ")))

	if len(mi.IncludeColumns) > 0 {
		sb.WriteString(fmt.Sprintf("\nINCLUDE (%s);", strings.Join(mi.IncludeColumns, ", ")))
	} else {
		sb.WriteString(";")
	}

	return sb.String()
}

func parseRelOp(elem *xmlElement, stmtTotalCost float64) *PlanNode {
	nodeID, _ := strconv.Atoi(elem.Attr("NodeId"))
	physOp := elem.Attr("PhysicalOp")
	logicOp := elem.Attr("LogicalOp")
	estRows, _ := strconv.ParseFloat(elem.Attr("EstimateRows"), 64)
	estRowsRead, _ := strconv.ParseFloat(elem.Attr("EstimatedRowsRead"), 64)
	estIO, _ := strconv.ParseFloat(elem.Attr("EstimateIO"), 64)
	estCPU, _ := strconv.ParseFloat(elem.Attr("EstimateCPU"), 64)
	subCost, _ := strconv.ParseFloat(elem.Attr("EstimatedTotalSubtreeCost"), 64)
	tblCard, _ := strconv.ParseFloat(elem.Attr("TableCardinality"), 64)
	parallel := elem.Attr("Parallel") == "1" || elem.Attr("Parallel") == "true"

	node := &PlanNode{
		NodeID:                    nodeID,
		PhysicalOp:                physOp,
		LogicalOp:                 logicOp,
		EstimateRows:              estRows,
		EstimatedRowsRead:         estRowsRead,
		EstimateIO:                estIO,
		EstimateCPU:               estCPU,
		EstimatedTotalSubtreeCost: subCost,
		TableCardinality:          tblCard,
		Parallel:                  parallel,
		OutputColumns:             make([]string, 0),
		Warnings:                  make([]string, 0),
		Children:                  make([]*PlanNode, 0),
	}

	if stmtTotalCost > 0 {
		node.CostPercentage = (subCost / stmtTotalCost) * 100.0
	}

	// Helper to find first matching descendant without crossing into child RelOp elements
	findDirectFirst := func(e *xmlElement, name string) *xmlElement {
		var search func(curr *xmlElement) *xmlElement
		search = func(curr *xmlElement) *xmlElement {
			for _, child := range curr.Children {
				if child.Name == "RelOp" {
					continue // Do not enter child RelOp operators!
				}
				if child.Name == name {
					return child
				}
				if found := search(child); found != nil {
					return found
				}
			}
			return nil
		}
		return search(e)
	}

	// Find Object element (Table, Index, IndexKind) strictly belonging to this RelOp
	if obj := findDirectFirst(elem, "Object"); obj != nil {
		node.Database = obj.Attr("Database")
		node.Schema = obj.Attr("Schema")
		node.Table = obj.Attr("Table")
		node.Index = obj.Attr("Index")
		node.IndexKind = obj.Attr("IndexKind")
	}

	// Check for RunTimeCountersPerThread (Actual rows and hardware metrics) strictly belonging to this RelOp
	var counters []*xmlElement
	var findDirectRuntimeCounters func(curr *xmlElement)
	findDirectRuntimeCounters = func(curr *xmlElement) {
		for _, child := range curr.Children {
			if child.Name == "RelOp" {
				continue // Do not enter child RelOp operators!
			}
			if child.Name == "RunTimeCountersPerThread" {
				counters = append(counters, child)
			} else {
				findDirectRuntimeCounters(child)
			}
		}
	}
	findDirectRuntimeCounters(elem)

	if len(counters) > 0 {
		node.HasActualRows = true
		var totalActRows float64
		var totalLogReads, totalPhysReads, totalReadAheads, totalScans int64
		var totalCPU, maxElapsed int64
		for _, c := range counters {
			if r, err := strconv.ParseFloat(c.Attr("ActualRows"), 64); err == nil {
				totalActRows += r
			}
			if lr, err := strconv.ParseInt(c.Attr("ActualLogicalReads"), 10, 64); err == nil {
				totalLogReads += lr
			}
			if pr, err := strconv.ParseInt(c.Attr("ActualPhysicalReads"), 10, 64); err == nil {
				totalPhysReads += pr
			}
			if ra, err := strconv.ParseInt(c.Attr("ActualReadAheads"), 10, 64); err == nil {
				totalReadAheads += ra
			}
			if sc, err := strconv.ParseInt(c.Attr("ActualScans"), 10, 64); err == nil {
				totalScans += sc
			}
			if cpu, err := strconv.ParseInt(c.Attr("ActualCPUms"), 10, 64); err == nil {
				totalCPU += cpu
			}
			if el, err := strconv.ParseInt(c.Attr("ActualElapsedms"), 10, 64); err == nil {
				if el > maxElapsed {
					maxElapsed = el
				}
			}
		}
		node.ActualRows = totalActRows
		node.ActualLogicalReads = totalLogReads
		node.ActualPhysicalReads = totalPhysReads
		node.ActualReadAheads = totalReadAheads
		node.ActualScans = totalScans
		node.ActualCPUms = totalCPU
		node.ActualElapsedms = maxElapsed

		// Calculate Cardinality Skew
		if node.EstimateRows > 0 {
			skew := node.ActualRows / node.EstimateRows
			node.SkewRatio = skew
			if skew > 10.0 || (node.ActualRows > 0 && skew < 0.1) {
				node.HasCardinalitySkew = true
				node.IsPainPoint = true
				node.SkewReason = fmt.Sprintf("Cardinality Skew: %0.0f actual rows vs %0.0f estimated (%0.1fx error). Check for stale statistics or parameter sniffing.", node.ActualRows, node.EstimateRows, skew)
			}
		}
	}

	// Output List strictly belonging to this RelOp
	if outList := findDirectFirst(elem, "OutputList"); outList != nil {
		for _, col := range outList.findAll("ColumnReference") {
			cName := col.Attr("Column")
			if cName != "" {
				node.OutputColumns = append(node.OutputColumns, cName)
			}
		}
	}

	// Predicates strictly belonging to this RelOp
	if pred := findDirectFirst(elem, "Predicate"); pred != nil {
		if scalar := pred.findFirst("ScalarOperator"); scalar != nil {
			node.Predicate = scalar.Attr("ScalarString")
		}
	}
	if seekPred := findDirectFirst(elem, "SeekPredicates"); seekPred != nil {
		if scalar := seekPred.findFirst("ScalarOperator"); scalar != nil {
			node.SeekPredicates = scalar.Attr("ScalarString")
		}
	}

	// Identify Pain Points
	if node.IndexKind == "Heap" && (node.PhysicalOp == "RID Lookup" || node.PhysicalOp == "Table Scan") {
		node.IsPainPoint = true
		node.PainReason = "Heap Table: Missing Clustered Index causes expensive RID lookups or table scans."
	} else if node.PhysicalOp == "Clustered Index Scan" && node.TableCardinality > 50000 {
		node.IsPainPoint = true
		node.PainReason = fmt.Sprintf("Full Clustered Index Scan on %s (%0.0f rows). Missing selective index seek.", node.Table, node.TableCardinality)
	} else if node.CostPercentage > 30.0 {
		node.IsPainPoint = true
		if node.PainReason == "" {
			node.PainReason = fmt.Sprintf("High operator cost (%0.1f%% of statement cost).", node.CostPercentage)
		}
	}

	// Recursively parse child RelOps
	for _, childElem := range elem.Children {
		collectChildRelOps(childElem, node, stmtTotalCost)
	}

	return node
}

func collectChildRelOps(elem *xmlElement, parentNode *PlanNode, stmtTotalCost float64) {
	if elem.Name == "RelOp" {
		childRelOp := parseRelOp(elem, stmtTotalCost)
		parentNode.Children = append(parentNode.Children, childRelOp)
		return
	}
	for _, child := range elem.Children {
		collectChildRelOps(child, parentNode, stmtTotalCost)
	}
}

func detectAntiPatterns(analysis *PlanAnalysis) {
	var convertStmts []string
	var unindexedTempStmts []string
	var heapStmts []string

	for _, stmt := range analysis.Statements {
		// Detect CONVERT_IMPLICIT
		for _, w := range stmt.Warnings {
			if w.Kind == "PlanAffectingConvert" {
				convertStmts = append(convertStmts, fmt.Sprintf("Stmt #%s", stmt.StatementID))
				break
			}
		}

		// Detect temp table missing indexes
		for _, mi := range stmt.MissingIndexes {
			if strings.HasPrefix(mi.Table, "[#") {
				unindexedTempStmts = append(unindexedTempStmts, fmt.Sprintf("Stmt #%s (%s)", stmt.StatementID, mi.Table))
			}
		}

		// Detect Heap RID Lookups
		if stmt.RootNode != nil && checkHasHeap(stmt.RootNode) {
			heapStmts = append(heapStmts, fmt.Sprintf("Stmt #%s", stmt.StatementID))
		}
	}

	// 1. Implicit Conversion
	if len(convertStmts) > 0 {
		analysis.AntiPatterns = append(analysis.AntiPatterns, &AntiPattern{
			Type:               "CONVERT_IMPLICIT",
			Severity:           "CRITICAL",
			Title:              "Implicit Data Type Conversions",
			Description:        "SQL Server is performing CONVERT_IMPLICIT on column expressions, invalidating index seeks and distorting cardinality estimations.",
			AffectedStatements: removeDuplicates(convertStmts),
			Recommendation:     "Align parameter and variable data types with the underlying column data types (e.g. check INT vs SMALLINT/TINYINT or VARCHAR vs NVARCHAR).",
		})
	}

	// 2. Unindexed Temp Tables
	if len(unindexedTempStmts) > 0 {
		analysis.AntiPatterns = append(analysis.AntiPatterns, &AntiPattern{
			Type:               "UNINDEXED_TEMP_TABLE",
			Severity:           "HIGH",
			Title:              "Temp Tables Created Without Indexes",
			Description:        "The procedure creates temporary tables (#) via SELECT ... INTO, which leaves them as heaps with no indexes, forcing sequential scans and joins.",
			AffectedStatements: removeDuplicates(unindexedTempStmts),
			Recommendation:     "Replace SELECT INTO #temp with explicit CREATE TABLE #temp (...) with a PRIMARY KEY / CLUSTERED INDEX, then use INSERT INTO.",
		})
	}

	// 3. Heap Tables
	if len(heapStmts) > 0 {
		analysis.AntiPatterns = append(analysis.AntiPatterns, &AntiPattern{
			Type:               "HEAP_TABLE",
			Severity:           "HIGH",
			Title:              "Heap Table RID Lookups",
			Description:        "Target tables have no Clustered Index (Heap), forcing costly RID lookups on every row retrieved.",
			AffectedStatements: removeDuplicates(heapStmts),
			Recommendation:     "Define a Clustered Index on the primary key or high-frequency lookup columns of the table.",
		})
	}

	// 4. MaxDOP 1
	if analysis.MaxDOPReason == "MaxDOPSetToOne" {
		analysis.AntiPatterns = append(analysis.AntiPatterns, &AntiPattern{
			Type:               "MAXDOP_1",
			Severity:           "MEDIUM",
			Title:              "Single Threaded Execution (MaxDOP = 1)",
			Description:        "The query plan is forced to run on a single CPU core because MaxDOP is set to 1 at the server, database, or resource governor level.",
			AffectedStatements: []string{"Entire Plan"},
			Recommendation:     "Consider setting Cost Threshold for Parallelism (e.g. 50) and MAXDOP based on NUMA core architecture rather than forcing MAXDOP 1 globally.",
		})
	}
}

func generateExecutiveVerdict(analysis *PlanAnalysis) *ExecutiveVerdict {
	if len(analysis.Statements) == 0 {
		return nil
	}

	culprit := analysis.Statements[0]
	var topOpName string
	if culprit.RootNode != nil {
		topOpName = culprit.RootNode.PhysicalOp
	} else {
		topOpName = culprit.StatementType
	}

	headline := fmt.Sprintf("Statement #%s dominates %0.1f%% of total execution cost (%0.2f subtree cost).", culprit.StatementID, culprit.CostPercentage, culprit.StatementSubTreeCost)

	var summary strings.Builder
	var fix strings.Builder

	if strings.Contains(strings.ToUpper(culprit.StatementText), "INTO #") {
		summary.WriteString(fmt.Sprintf("Primary Bottleneck: Statement #%s creates temporary tables via SELECT ... INTO as unindexed heaps, triggering repeated nested loops and missing index penalties in downstream statements.", culprit.StatementID))
		fix.WriteString("Pre-create temporary tables using explicit CREATE TABLE #temp (...) with a CLUSTERED PRIMARY KEY on join keys before inserting data.")
	} else if len(culprit.Warnings) > 0 {
		summary.WriteString(fmt.Sprintf("Primary Bottleneck: Statement #%s suffers from %d engine warnings, including implicit type conversion (CONVERT_IMPLICIT) which invalidates index seeks.", culprit.StatementID, len(culprit.Warnings)))
		fix.WriteString("Match query parameter types with underlying column definitions and add composite covering indexes.")
	} else {
		summary.WriteString(fmt.Sprintf("Primary Bottleneck: High-cost operator (%s) with heavy table scanning and lack of selective composite covering indexes.", topOpName))
		fix.WriteString(fmt.Sprintf("Add targeted covering indexes to convert %s to an Index Seek.", topOpName))
	}

	if analysis.MaxDOPReason == "MaxDOPSetToOne" {
		summary.WriteString(" Additionally, query execution is constrained to a single CPU core (MaxDOP = 1).")
	}

	return &ExecutiveVerdict{
		CulpritStatementID: culprit.StatementID,
		CostPercentage:     math.Round(culprit.CostPercentage*10) / 10,
		Headline:           headline,
		Summary:            summary.String(),
		TopOperator:        topOpName,
		ActionableFix:      fix.String(),
	}
}

func checkHasHeap(node *PlanNode) bool {
	if node.IndexKind == "Heap" {
		return true
	}
	for _, c := range node.Children {
		if checkHasHeap(c) {
			return true
		}
	}
	return false
}

func removeDuplicates(items []string) []string {
	seen := make(map[string]bool)
	var result []string
	for _, item := range items {
		if !seen[item] {
			seen[item] = true
			result = append(result, item)
		}
	}
	return result
}

func generateAdvancedDiagnostics(root *xmlElement, analysis *PlanAnalysis) *AdvancedDiagnostics {
	diag := &AdvancedDiagnostics{
		ImplicitConversions: make([]*ImplicitConversion, 0),
		ConsolidatedIndexes: make([]*ConsolidatedIndex, 0),
		ScalarUDFWarnings:   make([]*ScalarUDFWarning, 0),
	}

	diag.MemoryGrant = extractMemoryGrant(root, analysis)
	diag.ParallelismSkew = extractParallelismSkew(root)
	diag.ImplicitConversions = extractImplicitConversions(root, analysis)
	diag.ConsolidatedIndexes = consolidateMissingIndexes(analysis.AllMissingIndexes)
	diag.ScalarUDFWarnings = extractScalarUDFWarnings(root, analysis)
	diag.CardinalityEngine = extractCardinalityEngine(root)

	// Extended detectors: key lookups, spools, missing stats, parameter sniffing,
	// non-sargable predicates, row goals, adaptive joins / IQP
	populateExtraDiagnostics(root, analysis, diag)

	if diag.ImplicitConversions == nil {
		diag.ImplicitConversions = make([]*ImplicitConversion, 0)
	}
	if diag.ConsolidatedIndexes == nil {
		diag.ConsolidatedIndexes = make([]*ConsolidatedIndex, 0)
	}
	if diag.ScalarUDFWarnings == nil {
		diag.ScalarUDFWarnings = make([]*ScalarUDFWarning, 0)
	}

	diag.HealthScore, diag.ScoreGrade = calculateHealthScore(diag, analysis)

	appendFindingAntiPatterns(analysis, diag)
	return diag
}

func extractMemoryGrant(root *xmlElement, analysis *PlanAnalysis) *MemoryGrantHealth {
	hasSpills := false
	for _, stmt := range analysis.Statements {
		for _, w := range stmt.Warnings {
			if w.Kind == "SpillToTempDb" {
				hasSpills = true
				break
			}
		}
	}
	if len(root.findAll("SpillToTempDb")) > 0 {
		hasSpills = true
	}

	var maxGranted, maxUsed, maxReq, maxDes, maxRequested, maxQueryMem, maxWaitTime int64
	var feedback string
	for _, elem := range root.findAll("MemoryGrantInfo") {
		g, _ := strconv.ParseInt(elem.Attr("GrantedMemory"), 10, 64)
		u, _ := strconv.ParseInt(elem.Attr("MaxUsedMemory"), 10, 64)
		r, _ := strconv.ParseInt(elem.Attr("SerialRequiredMemory"), 10, 64)
		d, _ := strconv.ParseInt(elem.Attr("SerialDesiredMemory"), 10, 64)
		req, _ := strconv.ParseInt(elem.Attr("RequestedMemory"), 10, 64)
		qm, _ := strconv.ParseInt(elem.Attr("MaxQueryMemory"), 10, 64)
		wt, _ := strconv.ParseInt(elem.Attr("GrantWaitTime"), 10, 64)
		fb := elem.Attr("IsMemoryGrantFeedbackAdjusted")

		if g > maxGranted {
			maxGranted = g
		}
		if u > maxUsed {
			maxUsed = u
		}
		if r > maxReq {
			maxReq = r
		}
		if d > maxDes {
			maxDes = d
		}
		if req > maxRequested {
			maxRequested = req
		}
		if qm > maxQueryMem {
			maxQueryMem = qm
		}
		if wt > maxWaitTime {
			maxWaitTime = wt
		}
		if fb != "" && feedback == "" {
			feedback = fb
		}
	}

	var estAvailMem, estPagesCached int64
	if optProps := root.findFirst("OptimizerHardwareDependentProperties"); optProps != nil {
		estAvailMem, _ = strconv.ParseInt(optProps.Attr("EstimatedAvailableMemoryGrant"), 10, 64)
		estPagesCached, _ = strconv.ParseInt(optProps.Attr("EstimatedPagesCached"), 10, 64)
	}

	if maxGranted == 0 && maxDes == 0 && !hasSpills {
		return nil
	}

	mg := &MemoryGrantHealth{
		GrantedMemoryKB:            maxGranted,
		MaxUsedMemoryKB:            maxUsed,
		SerialRequiredKB:           maxReq,
		SerialDesiredKB:            maxDes,
		RequestedMemoryKB:          maxRequested,
		GrantWaitTimeMS:            maxWaitTime,
		MaxQueryMemoryKB:           maxQueryMem,
		FeedbackAdjusted:           feedback,
		EstimatedAvailableMemoryKB: estAvailMem,
		EstimatedPagesCached:       estPagesCached,
		HasSpills:                  hasSpills,
	}

	if maxGranted > 0 {
		wastedKB := maxGranted - maxUsed
		if wastedKB > 0 {
			mg.WastedMemoryMB = math.Round((float64(wastedKB)/1024.0)*10) / 10
			mg.WastedPercent = math.Round((float64(wastedKB)/float64(maxGranted))*1000) / 10
			if mg.WastedPercent > 50 && maxGranted > 5120 {
				mg.IsBloated = true
			}
		}
	}

	if hasSpills {
		mg.SpillDetails = "Operator spilled memory pages to TempDB due to insufficient memory grant."
		mg.Remedy = "Increase query memory grant percentage or optimize sort/hash operators and statistics."
	} else if mg.IsBloated {
		mg.Remedy = "Optimizer over-reserved RAM due to cardinality overestimates. Update column statistics to size grants accurately."
	} else if maxGranted > 0 {
		mg.Remedy = "RAM allocation and usage are balanced."
	} else if maxDes > 0 {
		mg.Remedy = fmt.Sprintf("Query requests estimated %d KB serial workspace for Sort/Hash operations.", maxDes)
	}

	return mg
}

func extractHardwareMetrics(root *xmlElement, analysis *PlanAnalysis) *HardwareMetrics {
	hm := &HardwareMetrics{
		TopIOLeaders: make([]*TableIOLeader, 0),
	}

	var totalLogReads, totalPhysReads, totalReadAheads int64
	var totalLobLogReads, totalLobPhysReads int64
	var totalCPU, totalElapsed int64
	hasRuntime := false

	// Aggregate from statements
	for _, stmt := range analysis.Statements {
		if stmt.HasActualMetrics {
			hasRuntime = true
		}
		totalLogReads += stmt.ActualLogicalReads
		totalPhysReads += stmt.ActualPhysicalReads
		totalReadAheads += stmt.ActualReadAheads
		totalCPU += stmt.ActualCPUms
		totalElapsed += stmt.ActualElapsedms
	}

	hm.HasRuntimeMetrics = hasRuntime
	hm.TotalLogicalReads = totalLogReads
	hm.TotalLogicalReadsMB = math.Round((float64(totalLogReads)/128.0)*10) / 10
	hm.TotalPhysicalReads = totalPhysReads
	hm.TotalPhysicalReadsMB = math.Round((float64(totalPhysReads)/128.0)*10) / 10
	hm.TotalReadAheads = totalReadAheads
	hm.TotalReadAheadsMB = math.Round((float64(totalReadAheads)/128.0)*10) / 10
	hm.TotalLobLogicalReads = totalLobLogReads
	hm.TotalLobPhysicalReads = totalLobPhysReads
	hm.TotalActualCPUms = totalCPU
	hm.TotalActualElapsedms = totalElapsed

	if totalElapsed > 0 {
		hm.CpuUtilizationRatio = math.Round((float64(totalCPU)/float64(totalElapsed))*1000) / 10
		if totalElapsed > totalCPU {
			hm.WaitTimeMS = totalElapsed - totalCPU
		}
	}

	if totalLogReads > 0 {
		if totalPhysReads == 0 {
			hm.CacheHitRatioPercent = 100.0
		} else {
			hit := float64(totalLogReads-totalPhysReads) / float64(totalLogReads) * 100.0
			hm.CacheHitRatioPercent = math.Max(0, math.Min(100.0, math.Round(hit*10)/10))
		}
	} else {
		hm.CacheHitRatioPercent = 100.0
	}

	// Memory Grant info from root
	for _, elem := range root.findAll("MemoryGrantInfo") {
		if g, err := strconv.ParseInt(elem.Attr("GrantedMemory"), 10, 64); err == nil && g > hm.GrantedMemoryKB {
			hm.GrantedMemoryKB = g
		}
		if u, err := strconv.ParseInt(elem.Attr("MaxUsedMemory"), 10, 64); err == nil && u > hm.MaxUsedMemoryKB {
			hm.MaxUsedMemoryKB = u
		}
		if r, err := strconv.ParseInt(elem.Attr("RequestedMemory"), 10, 64); err == nil && r > hm.RequestedMemoryKB {
			hm.RequestedMemoryKB = r
		}
		if qm, err := strconv.ParseInt(elem.Attr("MaxQueryMemory"), 10, 64); err == nil && qm > hm.MaxQueryMemoryKB {
			hm.MaxQueryMemoryKB = qm
		}
		if wt, err := strconv.ParseInt(elem.Attr("GrantWaitTime"), 10, 64); err == nil && wt > hm.MemoryGrantWaitTimeMS {
			hm.MemoryGrantWaitTimeMS = wt
		}
		if fb := elem.Attr("IsMemoryGrantFeedbackAdjusted"); fb != "" && hm.IsMemoryGrantFeedbackAdjusted == "" {
			hm.IsMemoryGrantFeedbackAdjusted = fb
		}
	}

	if optProps := root.findFirst("OptimizerHardwareDependentProperties"); optProps != nil {
		if em, err := strconv.ParseInt(optProps.Attr("EstimatedAvailableMemoryGrant"), 10, 64); err == nil {
			hm.EstimatedAvailableMemoryKB = em
		}
		if ep, err := strconv.ParseInt(optProps.Attr("EstimatedPagesCached"), 10, 64); err == nil {
			hm.EstimatedPagesCached = ep
		}
	}

	// Build Table-by-Table I/O Leaderboard
	type tableStats struct {
		db           string
		schema       string
		table        string
		logicalReads int64
		physReads    int64
		readAheads   int64
		estimateIO   float64
		ops          map[string]bool
		indexes      map[string]bool
	}
	tableMap := make(map[string]*tableStats)

	var collectTableIO func(node *PlanNode)
	collectTableIO = func(node *PlanNode) {
		if node == nil {
			return
		}
		if node.Table != "" {
			key := fmt.Sprintf("%s.%s.%s", node.Database, node.Schema, node.Table)
			ts, exists := tableMap[key]
			if !exists {
				ts = &tableStats{
					db:      node.Database,
					schema:  node.Schema,
					table:   node.Table,
					ops:     make(map[string]bool),
					indexes: make(map[string]bool),
				}
				tableMap[key] = ts
			}
			ts.logicalReads += node.ActualLogicalReads
			ts.physReads += node.ActualPhysicalReads
			ts.readAheads += node.ActualReadAheads
			ts.estimateIO += node.EstimateIO
			if node.PhysicalOp != "" {
				ts.ops[node.PhysicalOp] = true
			}
			if node.Index != "" {
				ts.indexes[node.Index] = true
			}
		}
		for _, child := range node.Children {
			collectTableIO(child)
		}
	}

	for _, stmt := range analysis.Statements {
		collectTableIO(stmt.RootNode)
	}

	// Convert to slice and sort
	var tableList []*tableStats
	for _, ts := range tableMap {
		tableList = append(tableList, ts)
	}

	sort.Slice(tableList, func(i, j int) bool {
		if hasRuntime && (tableList[i].logicalReads > 0 || tableList[j].logicalReads > 0) {
			return tableList[i].logicalReads > tableList[j].logicalReads
		}
		return tableList[i].estimateIO > tableList[j].estimateIO
	})

	for i, ts := range tableList {
		if i >= 15 && ts.logicalReads == 0 && ts.estimateIO < 0.01 {
			break
		}
		opsSlice := make([]string, 0, len(ts.ops))
		for op := range ts.ops {
			opsSlice = append(opsSlice, op)
		}
		idxSlice := make([]string, 0, len(ts.indexes))
		for idx := range ts.indexes {
			idxSlice = append(idxSlice, idx)
		}

		readPct := 0.0
		if totalLogReads > 0 {
			readPct = math.Round((float64(ts.logicalReads)/float64(totalLogReads))*1000) / 10
		}

		leader := &TableIOLeader{
			Rank:             i + 1,
			Database:         ts.db,
			Schema:           ts.schema,
			Table:            ts.table,
			LogicalReads:     ts.logicalReads,
			LogicalReadsMB:   math.Round((float64(ts.logicalReads)/128.0)*10) / 10,
			PhysicalReads:    ts.physReads,
			PhysicalReadsMB:  math.Round((float64(ts.physReads)/128.0)*10) / 10,
			ReadAheads:       ts.readAheads,
			ReadAheadsMB:     math.Round((float64(ts.readAheads)/128.0)*10) / 10,
			ReadPercent:      readPct,
			AccessOperations: opsSlice,
			IndexesUsed:      idxSlice,
		}
		hm.TopIOLeaders = append(hm.TopIOLeaders, leader)
	}

	return hm
}

func extractParallelismSkew(root *xmlElement) *ParallelismSkew {
	var worstSkew *ParallelismSkew
	var highestRatio float64 = 1.0

	for _, relOp := range root.findAll("RelOp") {
		runtime := relOp.findFirst("RunTimeInformation")
		if runtime == nil {
			continue
		}

		counters := runtime.findAll("RunTimeCountersPerThread")
		if len(counters) <= 1 {
			continue
		}

		var threads []*ThreadDistribution
		var totalRows float64
		var maxThreadRows float64
		var minThreadRows float64 = math.MaxFloat64

		for _, c := range counters {
			tID, _ := strconv.Atoi(c.Attr("Thread"))
			actualRows, _ := strconv.ParseFloat(c.Attr("ActualRows"), 64)
			threads = append(threads, &ThreadDistribution{
				ThreadID:   tID,
				ActualRows: actualRows,
			})
			totalRows += actualRows
			if actualRows > maxThreadRows {
				maxThreadRows = actualRows
			}
			if actualRows < minThreadRows {
				minThreadRows = actualRows
			}
		}

		if totalRows > 0 {
			for _, t := range threads {
				t.Percentage = math.Round((t.ActualRows/totalRows)*1000) / 10
			}
		}

		avgRows := totalRows / float64(len(threads))
		var ratio float64
		if avgRows > 0 {
			ratio = maxThreadRows / avgRows
		}

		if ratio > 2.0 && totalRows > 100 && ratio > highestRatio {
			highestRatio = ratio
			nodeID, _ := strconv.Atoi(relOp.Attr("NodeId"))
			worstSkew = &ParallelismSkew{
				HasSkew:          true,
				NodeID:           nodeID,
				PhysicalOp:       relOp.Attr("PhysicalOp"),
				ThreadsCount:     len(threads),
				TotalRows:        totalRows,
				MaxThreadRows:    maxThreadRows,
				MinThreadRows:    minThreadRows,
				SkewRatio:        math.Round(ratio*10) / 10,
				Threads:          threads,
				RootCauseSummary: fmt.Sprintf("Parallel worker thread imbalance: one thread processed %0.1f%% of all rows.", (maxThreadRows/math.Max(1, totalRows))*100),
				Remedy:           "Check for skewed join/grouping keys, update statistics on distribution columns, or adjust MAXDOP.",
			}
		}
	}

	return worstSkew
}

func extractImplicitConversions(root *xmlElement, analysis *PlanAnalysis) []*ImplicitConversion {
	list := make([]*ImplicitConversion, 0)
	seen := make(map[string]bool)

	for _, stmt := range analysis.Statements {
		for _, w := range stmt.Warnings {
			if w.Kind == "PlanAffectingConvert" {
				key := stmt.StatementID + ":" + w.Expression
				if !seen[key] {
					seen[key] = true
					list = append(list, &ImplicitConversion{
						StatementID:  stmt.StatementID,
						ConvertIssue: w.Issue,
						Expression:   w.Expression,
						Description:  fmt.Sprintf("CONVERT_IMPLICIT on %s forces per-row conversion, disabling Sargable index seeks.", w.Expression),
						Remedy:       "Match application parameter/variable datatype exactly with underlying column definition.",
					})
				}
			}
		}
	}

	for _, sc := range root.findAll("ScalarOperator") {
		str := sc.Attr("ScalarString")
		if strings.Contains(str, "CONVERT_IMPLICIT") {
			if !seen[str] {
				seen[str] = true
				list = append(list, &ImplicitConversion{
					StatementID:  "Batch",
					ConvertIssue: "Type Conversion",
					Expression:   str,
					Description:  "Internal implicit datatype casting detected in query execution predicate.",
					Remedy:       "Ensure variables and column schemas share identical datatypes and collations.",
				})
			}
		}
	}

	return list
}

func consolidateMissingIndexes(indexes []*MissingIndexInfo) []*ConsolidatedIndex {
	if len(indexes) == 0 {
		return []*ConsolidatedIndex{}
	}

	type group struct {
		db          string
		schema      string
		table       string
		items       []*MissingIndexInfo
		totalImpact float64
	}

	groups := make(map[string]*group)
	var groupOrder []string

	for _, idx := range indexes {
		key := fmt.Sprintf("%s.%s", idx.Schema, idx.Table)
		if groups[key] == nil {
			groups[key] = &group{
				db:     idx.Database,
				schema: idx.Schema,
				table:  idx.Table,
				items:  make([]*MissingIndexInfo, 0),
			}
			groupOrder = append(groupOrder, key)
		}
		groups[key].items = append(groups[key].items, idx)
		groups[key].totalImpact += idx.Impact
	}

	results := make([]*ConsolidatedIndex, 0)
	for _, key := range groupOrder {
		grp := groups[key]
		count := len(grp.items)
		avgImpact := grp.totalImpact / float64(count)

		combinedEq := make([]string, 0)
		combinedIneq := make([]string, 0)
		combinedInc := make([]string, 0)
		eqMap := make(map[string]bool)
		ineqMap := make(map[string]bool)
		incMap := make(map[string]bool)

		for _, mi := range grp.items {
			for _, col := range mi.EqualityColumns {
				if !eqMap[col] {
					eqMap[col] = true
					combinedEq = append(combinedEq, col)
				}
			}
			for _, col := range mi.InequalityColumns {
				if !eqMap[col] && !ineqMap[col] {
					ineqMap[col] = true
					combinedIneq = append(combinedIneq, col)
				}
			}
			for _, col := range mi.IncludeColumns {
				if !eqMap[col] && !ineqMap[col] && !incMap[col] {
					incMap[col] = true
					combinedInc = append(combinedInc, col)
				}
			}
		}

		cleanTable := strings.Trim(grp.table, "[]")
		cleanSchema := strings.Trim(grp.schema, "[]")
		if cleanSchema == "" {
			cleanSchema = "dbo"
		}

		allKeys := append(combinedEq, combinedIneq...)
		var keyNameParts []string
		for _, k := range allKeys {
			keyNameParts = append(keyNameParts, strings.Trim(k, "[]"))
		}
		idxName := fmt.Sprintf("IX_%s_%s", cleanTable, strings.Join(keyNameParts, "_"))
		if len(idxName) > 120 {
			idxName = idxName[:120]
		}

		var ddl strings.Builder
		ddl.WriteString(fmt.Sprintf("CREATE NONCLUSTERED INDEX [%s]\nON [%s].[%s] (%s)", idxName, cleanSchema, cleanTable, strings.Join(allKeys, ", ")))
		if len(combinedInc) > 0 {
			ddl.WriteString(fmt.Sprintf("\nINCLUDE (%s)", strings.Join(combinedInc, ", ")))
		}
		ddl.WriteString("\nWITH (ONLINE = ON, FILLFACTOR = 90);")

		var benefit string
		if count > 1 {
			benefit = fmt.Sprintf("Replaces %d redundant individual index recommendations with 1 optimal composite index, saving storage and index write overhead.", count)
		} else {
			benefit = "High-impact covering index recommendation."
		}

		results = append(results, &ConsolidatedIndex{
			Table:             grp.table,
			Schema:            grp.schema,
			CombinedFromCount: count,
			EqualityColumns:   combinedEq,
			InequalityColumns: combinedIneq,
			IncludeColumns:    combinedInc,
			SuggestedDDL:      ddl.String(),
			AverageImpact:     math.Round(avgImpact*10) / 10,
			StorageBenefit:    benefit,
		})
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].AverageImpact > results[j].AverageImpact
	})

	return results
}

func extractScalarUDFWarnings(root *xmlElement, analysis *PlanAnalysis) []*ScalarUDFWarning {
	warnings := make([]*ScalarUDFWarning, 0)
	seen := make(map[string]bool)

	for _, stmt := range analysis.Statements {
		txt := stmt.StatementText
		words := strings.FieldsFunc(txt, func(r rune) bool {
			return r == ' ' || r == '(' || r == ')' || r == ',' || r == ';' || r == '\n' || r == '\r' || r == '\t'
		})
		for _, w := range words {
			lower := strings.ToLower(w)
			if (strings.Contains(lower, "func_") || strings.Contains(lower, "ufn_") || strings.HasPrefix(lower, "fn_")) && !strings.Contains(lower, "dateadd") && !strings.Contains(lower, "eomonth") {
				fnName := strings.Trim(w, "[],()")
				if fnName != "" && !seen[fnName] {
					seen[fnName] = true
					warnings = append(warnings, &ScalarUDFWarning{
						StatementID:  stmt.StatementID,
						FunctionName: fnName,
						Description:  fmt.Sprintf("Scalar User-Defined Function '%s' triggers RBAR (Row-By-Agonizing-Row) execution and inhibits query parallelism.", fnName),
						Remedy:       "Convert scalar UDF to an Inline Table-Valued Function (iTVF) or leverage SQL Server 2019+ Scalar UDF Inlining.",
					})
				}
			}
		}
	}

	return warnings
}

func extractCardinalityEngine(root *xmlElement) *CardinalityEstimationEngine {
	for _, stmt := range root.findAll("StmtSimple") {
		v := stmt.Attr("CardinalityEstimationModelVersion")
		if v != "" {
			return createCEInfo(v)
		}
	}
	for _, stmt := range root.findAll("StmtCond") {
		v := stmt.Attr("CardinalityEstimationModelVersion")
		if v != "" {
			return createCEInfo(v)
		}
	}
	return nil
}

func createCEInfo(version string) *CardinalityEstimationEngine {
	isLegacy := version == "70" || version < "120"
	var desc, remedy string
	if isLegacy {
		desc = fmt.Sprintf("Query compiled under Legacy Cardinality Estimator (Model Version %s). Legacy CE assumes filter predicate independence and can severely skew row estimates.", version)
		remedy = "Evaluate running under modern CE with OPTION (USE HINT('FORCE_DEFAULT_CARDINALITY_ESTIMATION')) or database compatibility level 130+."
	} else {
		desc = fmt.Sprintf("Query compiled under Modern Cardinality Estimator (Model Version %s).", version)
		remedy = "Ensure table statistics have adequate sample rates for multi-column join correlation."
	}

	return &CardinalityEstimationEngine{
		ModelVersion: version,
		IsLegacy:     isLegacy,
		Description:  desc,
		Remedy:       remedy,
	}
}

func calculateHealthScore(diag *AdvancedDiagnostics, analysis *PlanAnalysis) (int, string) {
	score := 100

	if diag.MemoryGrant != nil {
		if diag.MemoryGrant.HasSpills {
			score -= 25
		} else if diag.MemoryGrant.IsBloated {
			score -= 15
		}
	}

	if diag.ParallelismSkew != nil && diag.ParallelismSkew.HasSkew {
		score -= 15
	}

	if len(diag.ImplicitConversions) > 0 {
		score -= 15
	}

	if len(diag.ScalarUDFWarnings) > 0 {
		score -= 15
	}

	if diag.CardinalityEngine != nil && diag.CardinalityEngine.IsLegacy {
		score -= 10
	}

	if len(analysis.AllMissingIndexes) > 3 {
		score -= 10
	} else if len(analysis.AllMissingIndexes) > 0 {
		score -= 5
	}

	if analysis.MaxDOPReason == "MaxDOPSetToOne" {
		score -= 5
	}

	for _, ap := range analysis.AntiPatterns {
		if ap.Type == "HEAP_TABLE" || ap.Type == "TableScanOnHeap" {
			score -= 10
			break
		}
	}

	score -= extraHealthPenalty(diag)

	if score < 15 {
		score = 15
	} else if score > 98 {
		score = 98
	}

	var grade string
	switch {
	case score >= 90:
		grade = "A"
	case score >= 75:
		grade = "B"
	case score >= 60:
		grade = "C"
	case score >= 45:
		grade = "D"
	default:
		grade = "F"
	}

	return score, grade
}
