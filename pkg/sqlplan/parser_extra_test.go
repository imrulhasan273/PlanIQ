package sqlplan

import (
	"strings"
	"testing"
)

const extraDetectorsPlan = `<?xml version="1.0" encoding="utf-8"?>
<ShowPlanXML xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan" Version="1.5" Build="15.0.2000.5">
 <BatchSequence><Batch><Statements>
  <StmtSimple StatementId="1" StatementText="SELECT TOP 10 * FROM dbo.Orders o WHERE YEAR(o.OrderDate) = 2020 AND o.Name LIKE '%abc' AND o.CustomerID = @p1" StatementType="SELECT" StatementSubTreeCost="10" StatementEstRows="10" StatementOptmLevel="FULL" CardinalityEstimationModelVersion="150">
   <QueryPlan CachedPlanSize="32" ContainsInterleavedExecutionCandidates="false">
    <Warnings>
     <ColumnsWithNoStatistics>
      <ColumnReference Database="[db]" Schema="[dbo]" Table="[Orders]" Column="Region" />
     </ColumnsWithNoStatistics>
    </Warnings>
    <MemoryGrantInfo SerialRequiredMemory="512" SerialDesiredMemory="1024" GrantedMemory="1024" MaxUsedMemory="900" IsMemoryGrantFeedbackAdjusted="YesStable" />
    <RelOp NodeId="0" PhysicalOp="Nested Loops" LogicalOp="Inner Join" EstimateRows="10" EstimatedTotalSubtreeCost="10">
     <RunTimeInformation><RunTimeCountersPerThread Thread="0" ActualRows="50000" ActualExecutions="1" /></RunTimeInformation>
     <NestedLoops>
      <RelOp NodeId="1" PhysicalOp="Index Seek" LogicalOp="Index Seek" EstimateRows="10" EstimateRowsWithoutRowGoal="1000" EstimatedTotalSubtreeCost="1" TableCardinality="500000">
       <RunTimeInformation><RunTimeCountersPerThread Thread="0" ActualRows="5000" ActualExecutions="1" /></RunTimeInformation>
       <IndexScan>
        <Object Database="[db]" Schema="[dbo]" Table="[Orders]" Index="[IX_Orders_Customer]" IndexKind="NonClustered" />
        <Predicate><ScalarOperator ScalarString="datepart(year,[o].[OrderDate])=(2020) AND [o].[Name] like N'%abc'" /></Predicate>
       </IndexScan>
      </RelOp>
      <RelOp NodeId="2" PhysicalOp="Clustered Index Seek" LogicalOp="Clustered Index Seek" EstimateRows="1" EstimatedTotalSubtreeCost="8">
       <OutputList><ColumnReference Column="Name" /><ColumnReference Column="Bmk1000" /><ColumnReference Column="Region" /></OutputList>
       <RunTimeInformation><RunTimeCountersPerThread Thread="0" ActualRows="5000" ActualExecutions="5000" /></RunTimeInformation>
       <IndexScan Lookup="1">
        <Object Database="[db]" Schema="[dbo]" Table="[Orders]" Index="[PK_Orders]" IndexKind="Clustered" />
       </IndexScan>
      </RelOp>
     </NestedLoops>
    </RelOp>
    <ParameterList>
     <ColumnReference Column="@p1" ParameterDataType="int" ParameterCompiledValue="(1)" ParameterRuntimeValue="(99)" />
    </ParameterList>
   </QueryPlan>
  </StmtSimple>
  <StmtSimple StatementId="2" StatementText="UPDATE dbo.Orders SET Qty = Qty + 1" StatementType="UPDATE" StatementSubTreeCost="5" StatementEstRows="100" StatementOptmLevel="FULL">
   <QueryPlan CachedPlanSize="16">
    <RelOp NodeId="0" PhysicalOp="Clustered Index Update" LogicalOp="Update" EstimateRows="0" EstimatedTotalSubtreeCost="5">
     <Update>
      <RelOp NodeId="1" PhysicalOp="Table Spool" LogicalOp="Eager Spool" EstimateRows="100" EstimateRebinds="0" EstimateRewinds="0" EstimatedTotalSubtreeCost="3">
       <Spool>
        <RelOp NodeId="2" PhysicalOp="Index Spool" LogicalOp="Eager Spool" EstimateRows="100" EstimatedTotalSubtreeCost="2">
         <Spool>
          <RelOp NodeId="3" PhysicalOp="Adaptive Join" LogicalOp="Inner Join" EstimateRows="100" EstimatedTotalSubtreeCost="1" EstimatedExecutionMode="Batch">
           <AdaptiveJoin AdaptiveThresholdRows="250" EstimatedJoinType="HashMatch" />
           <RunTimeInformation><RunTimeCountersPerThread Thread="0" ActualRows="80" ActualJoinType="NestedLoops" ActualExecutionMode="Batch" /></RunTimeInformation>
          </RelOp>
         </Spool>
        </RelOp>
       </Spool>
      </RelOp>
     </Update>
    </RelOp>
   </QueryPlan>
  </StmtSimple>
 </Statements></Batch></BatchSequence>
</ShowPlanXML>`

func TestExtraDetectors(t *testing.T) {
	plan, err := ParseXML(extraDetectorsPlan, "extra.sqlplan")
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	d := plan.Diagnostics
	if d == nil {
		t.Fatal("expected diagnostics")
	}

	// 1. Key lookup
	if len(d.KeyLookups) != 1 {
		t.Fatalf("expected 1 key lookup, got %d", len(d.KeyLookups))
	}
	kl := d.KeyLookups[0]
	if kl.LookupKind != "Key Lookup" || kl.SeekIndex != "IX_Orders_Customer" || kl.LookupCount != 5000 || kl.Severity != "HIGH" {
		t.Errorf("unexpected key lookup: %+v", kl)
	}
	if len(kl.FetchedColumns) != 2 || kl.FetchedColumns[0] != "Name" || kl.FetchedColumns[1] != "Region" {
		t.Errorf("unexpected fetched columns: %v", kl.FetchedColumns)
	}

	// 2. Spools
	if len(d.Spools) != 2 {
		t.Fatalf("expected 2 spools, got %d", len(d.Spools))
	}
	var sawIndexSpool, sawHalloween bool
	for _, s := range d.Spools {
		if s.PhysicalOp == "Index Spool" && s.Severity == "HIGH" {
			sawIndexSpool = true
		}
		if s.PhysicalOp == "Table Spool" && s.Purpose == "Halloween Protection" {
			sawHalloween = true
		}
	}
	if !sawIndexSpool || !sawHalloween {
		t.Errorf("spool classification wrong: %+v %+v", d.Spools[0], d.Spools[1])
	}

	// 3. Missing statistics
	if len(d.MissingStatistics) != 1 || d.MissingStatistics[0].Table != "Orders" || d.MissingStatistics[0].Columns[0] != "Region" {
		t.Errorf("unexpected missing stats: %+v", d.MissingStatistics)
	}
	if !strings.Contains(d.MissingStatistics[0].SuggestedDDL, "CREATE STATISTICS") {
		t.Errorf("expected CREATE STATISTICS ddl, got %q", d.MissingStatistics[0].SuggestedDDL)
	}

	// 4. Parameter sniffing
	if len(d.ParameterSniffing) != 1 {
		t.Fatalf("expected 1 sniffing finding, got %d", len(d.ParameterSniffing))
	}
	ps := d.ParameterSniffing[0]
	if !ps.HasMismatch || !ps.HasEstimateImpact || ps.Severity != "HIGH" {
		t.Errorf("unexpected sniffing finding: %+v", ps)
	}

	// 5. Non-sargable
	if len(d.NonSargable) != 1 {
		t.Fatalf("expected 1 non-sargable finding, got %d", len(d.NonSargable))
	}
	ns := d.NonSargable[0]
	if len(ns.Functions) != 1 || ns.Functions[0] != "DATEPART" || !ns.LeadingWildcard {
		t.Errorf("unexpected non-sargable finding: %+v", ns)
	}

	// 6. Row goals
	if len(d.RowGoals) != 1 {
		t.Fatalf("expected 1 row goal, got %d", len(d.RowGoals))
	}
	rg := d.RowGoals[0]
	if rg.Source != "TOP" || !rg.Misfired || rg.ReductionFactor != 100 {
		t.Errorf("unexpected row goal: %+v", rg)
	}

	// 7. Adaptive / IQP
	if d.Adaptive == nil || len(d.Adaptive.AdaptiveJoins) != 1 {
		t.Fatalf("expected 1 adaptive join: %+v", d.Adaptive)
	}
	aj := d.Adaptive.AdaptiveJoins[0]
	if aj.ActualJoinType != "NestedLoops" || !aj.HasThreshold || aj.ThresholdRows != 250 {
		t.Errorf("unexpected adaptive join: %+v", aj)
	}
	if d.Adaptive.BatchModeOperators != 1 || d.Adaptive.TotalOperators != 7 {
		t.Errorf("unexpected batch counters: %d/%d", d.Adaptive.BatchModeOperators, d.Adaptive.TotalOperators)
	}
	if d.HealthScore >= 60 {
		t.Errorf("health score should be heavily penalized, got %d", d.HealthScore)
	}
}

func TestNonSargableScanner(t *testing.T) {
	cases := []struct {
		pred string
		want int
	}{
		{"[t].[Col]=(5)", 0},
		{"[t].[Col]=CONVERT_IMPLICIT(int,[@p1],0)", 0},
		{"[t].[Col]=dateadd(day,(-1),getdate())", 0},
		{"isnull([t].[Col],(0))=(5)", 1},
		{"upper(ltrim([t].[Col]))='X'", 2},
		{"[t].[Col]='abs([t].[Other])'", 0},
	}
	for _, c := range cases {
		got := findWrappedColumnFunctions(c.pred)
		if len(got) != c.want {
			t.Errorf("%q: expected %d, got %v", c.pred, c.want, got)
		}
	}
}

func TestHardwareMetricsAndClassification(t *testing.T) {
	xmlPlan := `<?xml version="1.0" encoding="utf-8"?>
<ShowPlanXML xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan" Version="1.5" Build="15.0.2000.5">
 <BatchSequence><Batch><Statements>
  <StmtSimple StatementId="1" StatementText="SELECT * FROM dbo.HeavyTable" StatementType="SELECT" StatementSubTreeCost="50" StatementEstRows="100000">
   <QueryPlan CachedPlanSize="32">
    <MemoryGrantInfo SerialRequiredMemory="1024" SerialDesiredMemory="8192" RequestedMemory="8192" GrantedMemory="8192" MaxUsedMemory="4096" GrantWaitTime="15" IsMemoryGrantFeedbackAdjusted="Yes: Adjusting" />
    <RelOp NodeId="0" PhysicalOp="Nested Loops" LogicalOp="Inner Join" EstimateRows="100000" EstimatedTotalSubtreeCost="50">
     <RunTimeInformation>
      <RunTimeCountersPerThread Thread="0" ActualRows="100000" ActualCPUms="350" ActualElapsedms="400" ActualLogicalReads="12800" ActualPhysicalReads="0" ActualReadAheads="128" />
     </RunTimeInformation>
     <NestedLoops>
      <RelOp NodeId="1" PhysicalOp="Clustered Index Scan" LogicalOp="Clustered Index Scan" EstimateRows="100000" EstimatedTotalSubtreeCost="30">
       <RunTimeInformation>
        <RunTimeCountersPerThread Thread="0" ActualRows="100000" ActualCPUms="200" ActualElapsedms="220" ActualLogicalReads="10240" ActualPhysicalReads="0" ActualReadAheads="64" />
       </RunTimeInformation>
       <IndexScan>
        <Object Database="[AmmsDB]" Schema="[dbo]" Table="[HeavyTable]" Index="[PK_HeavyTable]" />
       </IndexScan>
      </RelOp>
      <RelOp NodeId="2" PhysicalOp="Index Seek" LogicalOp="Index Seek" EstimateRows="1" EstimatedTotalSubtreeCost="20">
       <RunTimeInformation>
        <RunTimeCountersPerThread Thread="0" ActualRows="100000" ActualCPUms="150" ActualElapsedms="180" ActualLogicalReads="2560" ActualPhysicalReads="0" ActualReadAheads="64" />
       </RunTimeInformation>
       <IndexScan>
        <Object Database="[AmmsDB]" Schema="[dbo]" Table="[LookupTable]" Index="[IX_Lookup_Key]" />
       </IndexScan>
      </RelOp>
     </NestedLoops>
    </RelOp>
   </QueryPlan>
  </StmtSimple>
 </Statements></Batch></BatchSequence>
</ShowPlanXML>`

	plan, err := ParseXML(xmlPlan, "TestHardwareMetricsPlan")
	if err != nil {
		t.Fatalf("ParseXML failed: %v", err)
	}

	if plan.HardwareMetrics == nil {
		t.Fatalf("expected HardwareMetrics to be populated, got nil")
	}

	hm := plan.HardwareMetrics
	if !hm.HasRuntimeMetrics {
		t.Errorf("expected HasRuntimeMetrics = true")
	}

	if hm.TotalLogicalReads != 12800+10240+2560 {
		t.Errorf("expected total logical reads = 25600, got %d", hm.TotalLogicalReads)
	}

	if hm.TotalLogicalReadsMB != 200.0 {
		t.Errorf("expected TotalLogicalReadsMB = 200.0 MB, got %0.1f", hm.TotalLogicalReadsMB)
	}

	if hm.CacheHitRatioPercent != 100.0 {
		t.Errorf("expected 100%% cache hit, got %0.1f%%", hm.CacheHitRatioPercent)
	}

	if hm.MemoryGrantWaitTimeMS != 15 {
		t.Errorf("expected MemoryGrantWaitTimeMS = 15, got %d", hm.MemoryGrantWaitTimeMS)
	}

	if hm.GrantedMemoryKB != 8192 || hm.MaxUsedMemoryKB != 4096 {
		t.Errorf("unexpected memory grants: granted %d, used %d", hm.GrantedMemoryKB, hm.MaxUsedMemoryKB)
	}

	if len(hm.TopIOLeaders) < 2 {
		t.Fatalf("expected at least 2 table I/O leaders, got %d", len(hm.TopIOLeaders))
	}

	topTable := hm.TopIOLeaders[0]
	if topTable.Table != "[HeavyTable]" {
		t.Errorf("expected top table to be [HeavyTable], got %s", topTable.Table)
	}
	if topTable.LogicalReads != 10240 {
		t.Errorf("expected [HeavyTable] reads = 10240, got %d", topTable.LogicalReads)
	}
	if topTable.LogicalReadsMB != 80.0 {
		t.Errorf("expected [HeavyTable] reads MB = 80.0, got %0.1f", topTable.LogicalReadsMB)
	}

	stmt := plan.Statements[0]
	if stmt.ExecutionClassification == "" {
		t.Errorf("expected statement to have ExecutionClassification")
	}
	t.Logf("Statement #1 Classification: %s (%s)", stmt.ExecutionClassification, stmt.ExecutionClassificationReason)
}
