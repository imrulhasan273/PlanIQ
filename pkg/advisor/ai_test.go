package advisor

import (
	"context"
	"strings"
	"testing"

	"sqlplan-advisor/pkg/sqlplan"
)

func TestGenerateAdvice_OfflineDeterministicEngine(t *testing.T) {
	stmt := &sqlplan.StatementAnalysis{
		StatementID:          "1",
		StatementType:        "SELECT",
		StatementSubTreeCost: 42.5,
		CostPercentage:       85.0,
		StatementText: `SELECT o.OrderID, o.CustomerID
INTO #StagingOrders
FROM dbo.Orders o
WHERE YEAR(o.OrderDate) = 2026
  AND o.CustomerID NOT IN (SELECT b.CustomerID FROM dbo.BlockedCustomers b);`,
		Warnings: []*sqlplan.PlanWarning{
			{
				StatementID: "1",
				Kind:        "PlanAffectingConvert",
				Issue:       "Seek Plan",
				Expression:  "CONVERT_IMPLICIT(nvarchar(20),[o].[RegionCode],0)",
			},
		},
		MissingIndexes: []*sqlplan.MissingIndexInfo{
			{
				StatementID:  "1",
				Impact:       72.5,
				Schema:       "[dbo]",
				Table:        "[Orders]",
				SuggestedDDL: "CREATE NONCLUSTERED INDEX [IX_Orders_OrderDate] ON [dbo].[Orders] ([OrderDate]);",
			},
		},
	}

	req := &AIRequest{
		Provider:  "offline",
		Statement: stmt,
		FullPlan: &sqlplan.PlanAnalysis{
			MaxDOPReason: "MaxDOPSetToOne",
		},
	}

	resp, err := GenerateAdvice(context.Background(), req)
	if err != nil {
		t.Fatalf("GenerateAdvice offline failed: %v", err)
	}

	if !strings.Contains(resp.ProviderUsed, "Offline") {
		t.Errorf("expected offline provider label, got %q", resp.ProviderUsed)
	}
	if len(resp.TechnicalSuggestions) < 3 {
		t.Errorf("expected at least 3 deterministic technical suggestions, got %d", len(resp.TechnicalSuggestions))
	}
	if len(resp.Strategies) < 2 {
		t.Errorf("expected multi-strategy temp table + CTE rewrites, got %d", len(resp.Strategies))
	}
	if !strings.Contains(resp.RecommendedRewrite, "CREATE TABLE #StagingOrders") {
		t.Errorf("expected Strategy A to pre-create #StagingOrders, got:\n%s", resp.RecommendedRewrite)
	}
	if len(resp.IndexRecommendations) != 1 {
		t.Errorf("expected 1 missing index recommendation, got %d", len(resp.IndexRecommendations))
	}
	if len(resp.ServerConfigTips) == 0 {
		t.Errorf("expected server configuration tips for MaxDOP=1 and CONVERT_IMPLICIT")
	}
}

func TestSanitizeSQL_MasksLiteralsAndGUIDs(t *testing.T) {
	raw := "SELECT * FROM dbo.Customers WHERE Email = 'alice@example.com' AND AccountNo = 987654321 AND TraceId = 123e4567-e89b-12d3-a456-426614174000;"
	sanitized := SanitizeSQL(raw)

	if strings.Contains(sanitized, "alice@example.com") {
		t.Errorf("expected string literal to be masked, got: %s", sanitized)
	}
	if strings.Contains(sanitized, "987654321") {
		t.Errorf("expected large numeric literal to be masked, got: %s", sanitized)
	}
	if strings.Contains(sanitized, "123e4567-e89b-12d3-a456-426614174000") {
		t.Errorf("expected GUID to be masked, got: %s", sanitized)
	}
	if !strings.Contains(sanitized, "[MASKED_STRING]") || !strings.Contains(sanitized, "AccountNo = 0000") {
		t.Errorf("expected mask tokens in output, got: %s", sanitized)
	}
}
