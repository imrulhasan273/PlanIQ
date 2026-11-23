package sqlplan

import (
	"fmt"
	"math"
)

// GetEffectiveExecutionMode returns ActualExecutionMode if available, else ExecutionMode, defaulting to "Row".
func (n *PlanNode) GetEffectiveExecutionMode() string {
	if n.ActualExecutionMode != "" {
		return n.ActualExecutionMode
	}
	if n.ExecutionMode != "" {
		return n.ExecutionMode
	}
	return "Row"
}

// GetOwnCpuMs computes an operator's own (self) CPU time in milliseconds by subtracting
// child contributions in row mode. Batch mode reports own time directly; row mode is cumulative
// from leaves up.
// Ported directly from PerformanceStudio's NodeTimeAttribution.GetOwnCpuMs.
func GetOwnCpuMs(node *PlanNode) int64 {
	if node == nil || node.ActualCPUms <= 0 {
		return 0
	}
	if node.GetEffectiveExecutionMode() == "Batch" {
		return node.ActualCPUms
	}
	childSum := getChildCpuMsSum(node)
	diff := node.ActualCPUms - childSum
	if diff < 0 {
		return 0
	}
	return diff
}

// GetOwnElapsedMs computes an operator's own (self) elapsed time in milliseconds.
// In row mode it subtracts child times; batch mode reports own time directly.
// For exchange operators (Parallelism / Gather Streams), thread 0 is the coordinator
// whose elapsed time is wall clock for the entire parallel branch, so worker thread
// timings are isolated.
// Ported directly from PerformanceStudio's NodeTimeAttribution.GetOwnElapsedMs.
func GetOwnElapsedMs(node *PlanNode) int64 {
	if node == nil || node.ActualElapsedms <= 0 {
		return 0
	}
	if node.GetEffectiveExecutionMode() == "Batch" {
		return node.ActualElapsedms
	}

	// Exchange operators: Thread 0 is the coordinator whose elapsed time is the
	// wall clock for the entire parallel branch — not the operator's own work.
	if IsExchangeOperator(node) {
		// If we have worker thread data, use max of worker threads (ThreadId > 0)
		var workerMax int64
		for _, t := range node.PerThreadStats {
			if t.ThreadID > 0 && t.ActualElapsedMs > workerMax {
				workerMax = t.ActualElapsedMs
			}
		}
		if workerMax > 0 {
			childSum := getChildElapsedMsSum(node)
			diff := workerMax - childSum
			if diff < 0 {
				return 0
			}
			return diff
		}
		// Thread 0 only (coordinator) — exchange does negligible own work
		return 0
	}

	childElapsedSum := getChildElapsedMsSum(node)
	diff := node.ActualElapsedms - childElapsedSum
	if diff < 0 {
		return 0
	}
	return diff
}

// IsExchangeOperator returns true for parallelism exchange operators
// (Gather/Distribute/Repartition Streams), whose coordinator-thread timings
// don't reflect the operator's own work.
func IsExchangeOperator(node *PlanNode) bool {
	if node == nil {
		return false
	}
	if node.PhysicalOp == "Parallelism" {
		return true
	}
	switch node.LogicalOp {
	case "Gather Streams", "Distribute Streams", "Repartition Streams":
		return true
	}
	return false
}

func getChildCpuMsSum(node *PlanNode) int64 {
	var sum int64
	for _, child := range node.Children {
		if child.GetEffectiveExecutionMode() == "Batch" {
			sum += sumBatchSubtreeCpuMs(child) // standalone CPU: the zone adds up
		} else if child.ActualCPUms > 0 {
			sum += child.ActualCPUms
		} else {
			sum += getChildCpuMsSum(child) // skip through transparent operators
		}
	}
	return sum
}

// sumBatchSubtreeCpuMs sums CPU across a contiguous batch-mode zone, stopping at exchange boundaries.
func sumBatchSubtreeCpuMs(node *PlanNode) int64 {
	sum := node.ActualCPUms
	for _, child := range node.Children {
		if child.PhysicalOp == "Parallelism" {
			continue // zone boundary
		}
		if child.GetEffectiveExecutionMode() == "Batch" {
			sum += sumBatchSubtreeCpuMs(child)
		} else if child.ActualCPUms > 0 {
			sum += child.ActualCPUms // row mode: already cumulative
		} else {
			sum += getChildCpuMsSum(child) // pass-through, no stats
		}
	}
	return sum
}

func getChildElapsedMsSum(node *PlanNode) int64 {
	var sum int64
	for _, child := range node.Children {
		if child.PhysicalOp == "Parallelism" && len(child.Children) > 0 {
			// Exchange: take max of children (parallel branches)
			var maxChild int64
			for _, c := range child.Children {
				if c.ActualElapsedms > maxChild {
					maxChild = c.ActualElapsedms
				}
			}
			sum += maxChild
		} else if child.GetEffectiveExecutionMode() == "Batch" {
			// Batch operators report STANDALONE times, so the zone's times add
			// rather than nest. Taking only this child's value would leave the
			// rest of the zone inside the parent's "own" time.
			sum += sumBatchSubtreeElapsedMs(child)
		} else if child.ActualElapsedms > 0 {
			sum += child.ActualElapsedms
		} else {
			sum += getChildElapsedMsSum(child) // skip through transparent operators
		}
	}
	return sum
}

// sumBatchSubtreeElapsedMs sums elapsed across a contiguous batch-mode zone, stopping at exchange boundaries.
func sumBatchSubtreeElapsedMs(node *PlanNode) int64 {
	sum := node.ActualElapsedms
	for _, child := range node.Children {
		if child.PhysicalOp == "Parallelism" {
			continue // zone boundary
		}
		if child.GetEffectiveExecutionMode() == "Batch" {
			sum += sumBatchSubtreeElapsedMs(child)
		} else if child.ActualElapsedms > 0 {
			sum += child.ActualElapsedms
		} else {
			sum += getChildElapsedMsSum(child)
		}
	}
	return sum
}

// ComputeNodeTimeAttribution traverses the plan tree and computes Self CPU, Self Elapsed,
// percentages of total statement time, and normalized heatmap intensities.
func ComputeNodeTimeAttribution(root *PlanNode, totalCpuMs int64, totalElapsedMs int64) {
	if root == nil {
		return
	}

	// 1. Pass 1: Compute SelfCPUMs and SelfElapsedMs for every node
	var maxSelfCpu int64
	var maxSelfElapsed int64

	var computeSelfTimes func(n *PlanNode)
	computeSelfTimes = func(n *PlanNode) {
		if n == nil {
			return
		}
		n.SelfCPUMs = GetOwnCpuMs(n)
		n.SelfElapsedMs = GetOwnElapsedMs(n)

		if n.SelfCPUMs > maxSelfCpu {
			maxSelfCpu = n.SelfCPUMs
		}
		if n.SelfElapsedMs > maxSelfElapsed {
			maxSelfElapsed = n.SelfElapsedMs
		}

		for _, child := range n.Children {
			computeSelfTimes(child)
		}
	}
	computeSelfTimes(root)

	// 2. Pass 2: Compute Percentages and Normalized Heat Intensities
	var assignMetrics func(n *PlanNode)
	assignMetrics = func(n *PlanNode) {
		if n == nil {
			return
		}

		if totalCpuMs > 0 && n.SelfCPUMs > 0 {
			pct := (float64(n.SelfCPUMs) / float64(totalCpuMs)) * 100.0
			n.SelfCPUPercent = math.Round(pct*10) / 10
		}
		if totalElapsedMs > 0 && n.SelfElapsedMs > 0 {
			pct := (float64(n.SelfElapsedMs) / float64(totalElapsedMs)) * 100.0
			n.SelfElapsedPercent = math.Round(pct*10) / 10
		}

		// Heat intensity: relative to the hottest operator in this plan (0.0 to 1.0)
		var intensity float64
		if maxSelfElapsed > 0 && n.SelfElapsedMs > 0 {
			intensity = float64(n.SelfElapsedMs) / float64(maxSelfElapsed)
		} else if maxSelfCpu > 0 && n.SelfCPUMs > 0 {
			intensity = float64(n.SelfCPUMs) / float64(maxSelfCpu)
		}
		if intensity > 1.0 {
			intensity = 1.0
		}
		n.HeatIntensity = math.Round(intensity*100) / 100

		// Highlight pain point if self elapsed >= 1.0s or accounts for >= 25% of query
		if !n.IsPainPoint && (n.SelfElapsedMs >= 1000 || n.SelfElapsedPercent >= 25.0 || n.SelfCPUPercent >= 25.0) {
			n.IsPainPoint = true
			n.PainReason = fmt.Sprintf("Heavy runtime bottleneck: %0.3fs self elapsed (%0.1f%%), %0.3fs self CPU (%0.1f%%).",
				float64(n.SelfElapsedMs)/1000.0, n.SelfElapsedPercent,
				float64(n.SelfCPUMs)/1000.0, n.SelfCPUPercent)
		}

		for _, child := range n.Children {
			assignMetrics(child)
		}
	}
	assignMetrics(root)
}
