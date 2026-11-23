package sqlplan

import (
	"testing"
)

func TestNodeTimeAttribution_BatchStandalone(t *testing.T) {
	// Batch mode operators report standalone self time
	node := &PlanNode{
		NodeID:              1,
		PhysicalOp:          "Hash Match",
		LogicalOp:           "Inner Join",
		ExecutionMode:       "Batch",
		ActualExecutionMode: "Batch",
		ActualCPUms:         900,
		ActualElapsedms:     950,
		Children: []*PlanNode{
			{
				NodeID:              2,
				PhysicalOp:          "Index Scan",
				ExecutionMode:       "Batch",
				ActualExecutionMode: "Batch",
				ActualCPUms:         200,
				ActualElapsedms:     220,
			},
		},
	}

	ownCpu := GetOwnCpuMs(node)
	if ownCpu != 900 {
		t.Fatalf("Expected batch mode own CPU to be 900, got %d", ownCpu)
	}

	ownElapsed := GetOwnElapsedMs(node)
	if ownElapsed != 950 {
		t.Fatalf("Expected batch mode own elapsed to be 950, got %d", ownElapsed)
	}
}

func TestNodeTimeAttribution_RowCumulativeSubtraction(t *testing.T) {
	// Row mode parent (Nested Loops) cumulative: 1000ms elapsed, 300ms CPU
	// Child 1 (Clustered Index Scan): 700ms elapsed, 200ms CPU
	// Child 2 (Index Seek): 200ms elapsed, 50ms CPU
	// NL self time: 1000 - (700 + 200) = 100ms elapsed; 300 - (200 + 50) = 50ms CPU
	child1 := &PlanNode{
		NodeID:          2,
		PhysicalOp:      "Clustered Index Scan",
		ExecutionMode:   "Row",
		ActualCPUms:     200,
		ActualElapsedms: 700,
	}
	child2 := &PlanNode{
		NodeID:          3,
		PhysicalOp:      "Index Seek",
		ExecutionMode:   "Row",
		ActualCPUms:     50,
		ActualElapsedms: 200,
	}
	parent := &PlanNode{
		NodeID:          1,
		PhysicalOp:      "Nested Loops",
		LogicalOp:       "Inner Join",
		ExecutionMode:   "Row",
		ActualCPUms:     300,
		ActualElapsedms: 1000,
		Children:        []*PlanNode{child1, child2},
	}

	ownCpu := GetOwnCpuMs(parent)
	if ownCpu != 50 {
		t.Fatalf("Expected row mode parent own CPU to be 50, got %d", ownCpu)
	}

	ownElapsed := GetOwnElapsedMs(parent)
	if ownElapsed != 100 {
		t.Fatalf("Expected row mode parent own elapsed to be 100, got %d", ownElapsed)
	}
}

func TestNodeTimeAttribution_ExchangeCoordinatorIgnored(t *testing.T) {
	// Parallelism (Gather Streams): Thread 0 reports 1000ms wall clock with 0 rows
	// Worker Thread 1 reports 120ms
	// Worker Thread 2 reports 150ms
	// Child below reports 130ms
	exchange := &PlanNode{
		NodeID:          1,
		PhysicalOp:      "Parallelism",
		LogicalOp:       "Gather Streams",
		ExecutionMode:   "Row",
		ActualCPUms:     20,
		ActualElapsedms: 1000, // Coordinator wall clock
		PerThreadStats: []*NodeThreadStat{
			{ThreadID: 0, ActualRows: 0, ActualElapsedMs: 1000},
			{ThreadID: 1, ActualRows: 500, ActualElapsedMs: 120},
			{ThreadID: 2, ActualRows: 500, ActualElapsedMs: 150},
		},
		Children: []*PlanNode{
			{
				NodeID:          2,
				PhysicalOp:      "Hash Match",
				ExecutionMode:   "Row",
				ActualElapsedms: 130,
			},
		},
	}

	// Coordinator thread 0 is ignored; workerMax = 150ms.
	// 150 - 130 (child sum) = 20ms own elapsed
	ownElapsed := GetOwnElapsedMs(exchange)
	if ownElapsed != 20 {
		t.Fatalf("Expected exchange operator own elapsed to isolate worker threads (20ms), got %d", ownElapsed)
	}
}

func TestNodeTimeAttribution_FullTreeHeatmapIntensity(t *testing.T) {
	child := &PlanNode{
		NodeID:          2,
		PhysicalOp:      "Clustered Index Scan",
		ActualCPUms:     400,
		ActualElapsedms: 800,
	}
	root := &PlanNode{
		NodeID:          1,
		PhysicalOp:      "Nested Loops",
		ActualCPUms:     500,
		ActualElapsedms: 1000,
		Children:        []*PlanNode{child},
	}

	ComputeNodeTimeAttribution(root, 500, 1000)

	// Child self time: 800ms elapsed, 400ms CPU (hottest operator)
	// Root self time: 1000 - 800 = 200ms elapsed, 500 - 400 = 100ms CPU
	if child.SelfElapsedMs != 800 {
		t.Errorf("Child self elapsed expected 800, got %d", child.SelfElapsedMs)
	}
	if child.HeatIntensity != 1.0 {
		t.Errorf("Child heat intensity expected 1.0 (hottest), got %0.2f", child.HeatIntensity)
	}
	if root.SelfElapsedMs != 200 {
		t.Errorf("Root self elapsed expected 200, got %d", root.SelfElapsedMs)
	}
	if root.HeatIntensity != 0.25 {
		t.Errorf("Root heat intensity expected 0.25 (200/800), got %0.2f", root.HeatIntensity)
	}
}
