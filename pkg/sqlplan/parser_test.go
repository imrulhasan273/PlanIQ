package sqlplan_test

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"sqlplan-advisor/pkg/sqlplan"
)

func TestParseExplanXML(t *testing.T) {
	bytes, err := os.ReadFile("../../sample_plans/explan.xml")
	if err != nil {
		t.Fatalf("failed to read sample explan.xml: %v", err)
	}

	start := time.Now()
	analysis, err := sqlplan.ParseXML(string(bytes), "explan.xml (InsertDailyOperationalReport)")
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("ParseXML failed: %v", err)
	}

	t.Logf("SUCCESS: Parsed 2.5MB plan in %v", elapsed)
	t.Logf("Total Statements: %d", analysis.TotalStatements)
	t.Logf("Total SubTree Cost: %0.2f", analysis.TotalSubTreeCost)
	t.Logf("MaxDOP: %s", analysis.MaxDOPReason)
	t.Logf("Missing Indexes: %d", len(analysis.AllMissingIndexes))
	t.Logf("Anti-patterns detected: %d", len(analysis.AntiPatterns))

	if analysis.TotalStatements == 0 {
		t.Errorf("expected statements, got 0")
	}

	topStmt := analysis.Statements[0]
	t.Logf("Top Stmt ID: %s, Cost: %0.2f (%0.1f%%)", topStmt.StatementID, topStmt.StatementSubTreeCost, topStmt.CostPercentage)

	// Export sample JSON for browser preview mode
	jsonBytes, err := json.MarshalIndent(analysis, "", "  ")
	if err == nil {
		_ = os.WriteFile("../../frontend/src/sample_plan.json", jsonBytes, 0644)
	}
}

func TestParseKycSqlplan(t *testing.T) {
	start := time.Now()
	analysis, err := sqlplan.ParseFile("../../sample_plans/kyc.sqlplan", "kyc.sqlplan")
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("ParseFile for kyc.sqlplan failed: %v", err)
	}

	t.Logf("SUCCESS: Parsed 24.7MB UTF-16 kyc.sqlplan in %v", elapsed)
	t.Logf("Total Statements: %d", analysis.TotalStatements)
	t.Logf("Total SubTree Cost: %0.2f", analysis.TotalSubTreeCost)
	t.Logf("Missing Indexes: %d", len(analysis.AllMissingIndexes))

	if analysis.Diagnostics != nil {
		t.Logf("Health Score: %d (Grade %s)", analysis.Diagnostics.HealthScore, analysis.Diagnostics.ScoreGrade)
		if analysis.Diagnostics.CardinalityEngine != nil {
			t.Logf("CE Version: %s (Legacy: %v)", analysis.Diagnostics.CardinalityEngine.ModelVersion, analysis.Diagnostics.CardinalityEngine.IsLegacy)
		}
		t.Logf("Implicit Conversions: %d", len(analysis.Diagnostics.ImplicitConversions))
		t.Logf("Scalar UDF Warnings: %d", len(analysis.Diagnostics.ScalarUDFWarnings))
		t.Logf("Consolidated Indexes: %d", len(analysis.Diagnostics.ConsolidatedIndexes))
		if analysis.Diagnostics.MemoryGrant != nil {
			t.Logf("Memory Grant Spills: %v, Granted: %d KB", analysis.Diagnostics.MemoryGrant.HasSpills, analysis.Diagnostics.MemoryGrant.GrantedMemoryKB)
		}
	}

	if analysis.ExecutiveVerdict != nil {
		t.Logf("Executive Verdict Culprit: Stmt #%s (%0.1f%% cost)", analysis.ExecutiveVerdict.CulpritStatementID, analysis.ExecutiveVerdict.CostPercentage)
		t.Logf("Headline: %s", analysis.ExecutiveVerdict.Headline)
		t.Logf("Summary: %s", analysis.ExecutiveVerdict.Summary)
		t.Logf("Actionable Fix: %s", analysis.ExecutiveVerdict.ActionableFix)
	}

	for i := 0; i < len(analysis.Statements) && i < 5; i++ {
		s := analysis.Statements[i]
		snippet := s.StatementText
		if len(snippet) > 80 {
			snippet = snippet[:80] + "..."
		}
		t.Logf("Stmt #%s: Cost %0.2f (%0.1f%%) - %s: %s", s.StatementID, s.StatementSubTreeCost, s.CostPercentage, s.StatementType, snippet)
	}

	for i, mi := range analysis.AllMissingIndexes {
		t.Logf("Missing Index [%d] Table: %s.%s.%s, Impact: %0.1f%%, Equality: %v, Inequality: %v, Include: %v",
			i+1, mi.Database, mi.Schema, mi.Table, mi.Impact, mi.EqualityColumns, mi.InequalityColumns, mi.IncludeColumns)
	}

	for _, ap := range analysis.AntiPatterns {
		t.Logf("AntiPattern: [%s] %s - %s", ap.Severity, ap.Title, ap.Description)
	}
}
