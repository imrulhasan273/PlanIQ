package sqlplan_test

import (
	"os"
	"testing"
	"time"

	"sqlplan-advisor/pkg/sqlplan"
)

func TestParseDefaultSamplePlan(t *testing.T) {
	analysis, err := sqlplan.ParseBytes(sqlplan.DefaultSamplePlanXML, sqlplan.DefaultSamplePlanName)
	if err != nil {
		t.Fatalf("ParseBytes failed for embedded default sample plan: %v", err)
	}

	if analysis.TotalStatements != 3 {
		t.Fatalf("expected 3 statements in sample plan, got %d", analysis.TotalStatements)
	}
	if len(analysis.AllMissingIndexes) < 2 {
		t.Errorf("expected at least 2 missing indexes, got %d", len(analysis.AllMissingIndexes))
	}
	if len(analysis.WaitStats) == 0 {
		t.Errorf("expected wait stats in sample plan")
	}
	if analysis.Diagnostics == nil {
		t.Fatalf("expected diagnostics to be populated")
	}
	if len(analysis.Diagnostics.ParameterSniffing) == 0 {
		t.Errorf("expected parameter sniffing finding in sample plan")
	}
	if len(analysis.Diagnostics.KeyLookups) == 0 {
		t.Errorf("expected key lookup finding in sample plan")
	}
	if len(analysis.Diagnostics.Spools) == 0 {
		t.Errorf("expected spool finding in sample plan")
	}
	if analysis.Diagnostics.Adaptive == nil || len(analysis.Diagnostics.Adaptive.AdaptiveJoins) == 0 {
		t.Errorf("expected adaptive join finding in sample plan")
	}
}

func TestParseExplanXML(t *testing.T) {
	const path = "../../sample_plans/explan.xml"
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skip("optional local sample file not present")
	}

	bytes, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read sample explan.xml: %v", err)
	}

	start := time.Now()
	analysis, err := sqlplan.ParseXML(string(bytes), "explan.xml (local)")
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("ParseXML failed: %v", err)
	}

	t.Logf("SUCCESS: Parsed plan in %v (Statements: %d, Cost: %0.2f)", elapsed, analysis.TotalStatements, analysis.TotalSubTreeCost)
	if analysis.TotalStatements == 0 {
		t.Errorf("expected statements, got 0")
	}
}

func TestParseKycSqlplan(t *testing.T) {
	const path = "../../sample_plans/kyc.sqlplan"
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skip("optional local sample file not present")
	}

	start := time.Now()
	analysis, err := sqlplan.ParseFile(path, "kyc.sqlplan")
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("ParseFile for kyc.sqlplan failed: %v", err)
	}

	t.Logf("SUCCESS: Parsed UTF-16 plan in %v (Statements: %d, Cost: %0.2f)", elapsed, analysis.TotalStatements, analysis.TotalSubTreeCost)
	if analysis.TotalStatements == 0 {
		t.Errorf("expected statements, got 0")
	}
}
