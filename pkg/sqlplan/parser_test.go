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

	if analysis.TotalStatements != 24 {
		t.Errorf("expected 24 statements, got %d", analysis.TotalStatements)
	}

	topStmt := analysis.Statements[0]
	t.Logf("Top Stmt ID: %s, Cost: %0.2f (%0.1f%%)", topStmt.StatementID, topStmt.StatementSubTreeCost, topStmt.CostPercentage)
	if topStmt.StatementID != "4" {
		t.Errorf("expected top statement to be #4, got %s", topStmt.StatementID)
	}

	// Export sample JSON for browser preview mode
	jsonBytes, err := json.MarshalIndent(analysis, "", "  ")
	if err == nil {
		_ = os.WriteFile("../../frontend/src/sample_plan.json", jsonBytes, 0644)
	}
}
