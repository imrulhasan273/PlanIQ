package sqlplan

import _ "embed"

// DefaultSamplePlanXML is a clean, synthetic SQL Server ShowPlan XML bundled for offline demos and tests.
//
//go:embed sample_plan.sqlplan
var DefaultSamplePlanXML []byte

// DefaultSamplePlanName is the display name for the bundled sample SQL Server execution plan.
const DefaultSamplePlanName = "sample_ecommerce.sqlplan (OrderAnalyticsReport)"
