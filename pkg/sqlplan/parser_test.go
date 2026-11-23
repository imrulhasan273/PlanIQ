package sqlplan_test

import (
	"bytes"
	"encoding/binary"
	"testing"
	"unicode/utf16"

	"github.com/imrulhasan273/PlanIQ/pkg/sqlplan"
)

const testMinimalShowPlanXML = `<?xml version="1.0" encoding="utf-8"?>
<ShowPlanXML xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan" Version="1.5" Build="15.0.2000.5">
  <BatchSequence>
    <Batch>
      <Statements>
        <StmtSimple StatementId="1" StatementCompId="1" StatementText="SELECT o.OrderID FROM dbo.Orders o WHERE o.CustomerID = @CustomerID" StatementType="SELECT" StatementSubTreeCost="12.5" StatementEstRows="500" StatementOptmLevel="FULL" CardinalityEstimationModelVersion="150">
          <QueryPlan CachedPlanSize="64" CompileTime="12" CompileCPU="10" CompileMemory="1024">
            <MissingIndexes>
              <MissingIndexGroup Impact="72.5">
                <MissingIndex Database="[AppDB]" Schema="[dbo]" Table="[Orders]">
                  <ColumnGroup Usage="EQUALITY">
                    <Column Name="[CustomerID]" ColumnId="2" />
                  </ColumnGroup>
                </MissingIndex>
              </MissingIndexGroup>
            </MissingIndexes>
            <WaitStats>
              <Wait WaitType="PAGEIOLATCH_SH" WaitTimeMs="120" WaitCount="15" />
            </WaitStats>
            <RelOp NodeId="0" PhysicalOp="Clustered Index Scan" LogicalOp="Clustered Index Scan" EstimateRows="500" EstimatedRowsRead="50000" EstimateIO="10.0" EstimateCPU="2.5" EstimatedTotalSubtreeCost="12.5" TableCardinality="50000" ExecutionMode="Row">
              <IndexScan Ordered="0">
                <Object Database="[AppDB]" Schema="[dbo]" Table="[Orders]" Index="[PK_Orders]" IndexKind="Clustered" />
              </IndexScan>
            </RelOp>
            <ParameterList>
              <ColumnReference Column="@CustomerID" ParameterDataType="int" ParameterCompiledValue="(10)" ParameterRuntimeValue="(99999)" />
            </ParameterList>
          </QueryPlan>
        </StmtSimple>
      </Statements>
    </Batch>
  </BatchSequence>
</ShowPlanXML>`

func TestParseShowPlanXML(t *testing.T) {
	analysis, err := sqlplan.ParseXML(testMinimalShowPlanXML, "test-plan")
	if err != nil {
		t.Fatalf("ParseXML failed: %v", err)
	}

	if analysis.TotalStatements != 1 {
		t.Fatalf("expected 1 statement, got %d", analysis.TotalStatements)
	}
	if len(analysis.AllMissingIndexes) != 1 {
		t.Errorf("expected 1 missing index, got %d", len(analysis.AllMissingIndexes))
	}
	if len(analysis.WaitStats) == 0 {
		t.Errorf("expected wait stats to be parsed")
	}
	if analysis.Diagnostics == nil || len(analysis.Diagnostics.ParameterSniffing) == 0 {
		t.Errorf("expected parameter sniffing finding for divergent compiled/runtime values")
	}
}

func TestParseShowPlanUTF16LE(t *testing.T) {
	u16 := utf16.Encode([]rune(testMinimalShowPlanXML))
	var buf bytes.Buffer
	buf.Write([]byte{0xFF, 0xFE}) // UTF-16LE BOM
	for _, r := range u16 {
		_ = binary.Write(&buf, binary.LittleEndian, r)
	}

	analysis, err := sqlplan.ParseBytes(buf.Bytes(), "utf16-plan")
	if err != nil {
		t.Fatalf("ParseBytes failed for UTF-16LE plan: %v", err)
	}
	if analysis.TotalStatements != 1 {
		t.Fatalf("expected 1 statement in UTF-16LE plan, got %d", analysis.TotalStatements)
	}
}
