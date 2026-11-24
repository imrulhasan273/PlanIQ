import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymizePgPlanJson, anonymizeSqlPlanXml } from '../planExports';

test('anonymizeSqlPlanXml obfuscates object identifiers and parameter literals consistently', () => {
  const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<ShowPlanXML xmlns="http://schemas.microsoft.com/sqlserver/2004/07/showplan" Version="1.6">
  <BatchSequence><Batch><Statements>
    <StmtSimple StatementId="1" StatementType="SELECT" StatementSubTreeCost="1.25" StatementText="SELECT [CustomerEmail], [Balance] FROM [FinanceDB].[sales].[Customers] WHERE [CustomerEmail] = N'alice@example.com' AND [Balance] &gt; 500">
      <QueryPlan>
        <RelOp NodeId="0" PhysicalOp="Index Seek" LogicalOp="Index Seek" EstimateRows="1" EstimatedTotalSubtreeCost="1.25">
          <IndexScan>
            <Object Database="[FinanceDB]" Schema="[sales]" Table="[Customers]" Index="[IX_Customers_Email]" />
            <SeekPredicates>
              <ColumnReference Column="@CustomerEmail" />
              <ColumnReference Database="[FinanceDB]" Schema="[sales]" Table="[Customers]" Column="[CustomerEmail]" />
              <Const ConstValue="N'alice@example.com'" />
            </SeekPredicates>
          </IndexScan>
        </RelOp>
        <ParameterList>
          <ColumnReference Column="@CustomerEmail" ParameterDataType="nvarchar(100)" ParameterCompiledValue="N'alice@example.com'" ParameterRuntimeValue="N'bob@example.com'" />
          <ColumnReference Column="@MinBalance" ParameterDataType="int" ParameterCompiledValue="(500)" ParameterRuntimeValue="(1000)" />
        </ParameterList>
      </QueryPlan>
    </StmtSimple>
  </Statements></Batch></BatchSequence>
</ShowPlanXML>`;

  const anonymized = anonymizeSqlPlanXml(sampleXml);

  assert.ok(!/FinanceDB/.test(anonymized), 'FinanceDB should be masked');
  assert.ok(!/Customers/.test(anonymized), 'Customers should be masked');
  assert.ok(!/IX_Customers_Email/.test(anonymized), 'Index name should be masked');
  assert.ok(!/CustomerEmail/.test(anonymized), 'Column/param name should be masked');
  assert.ok(!/alice@example\.com/.test(anonymized), 'Compiled email literal should be masked');
  assert.ok(!/bob@example\.com/.test(anonymized), 'Runtime email literal should be masked');
  assert.ok(!/MinBalance/.test(anonymized), '@MinBalance param should be masked');
  assert.ok(/\[DB_01\]/.test(anonymized), 'Should map database to [DB_01]');
  assert.ok(/\[Schema_01\]/.test(anonymized), 'Should map schema to [Schema_01]');
  assert.ok(/\[Table_01\]/.test(anonymized), 'Should map table to [Table_01]');
  assert.ok(/\[Ix_01\]/.test(anonymized), 'Should map index to [Ix_01]');
  assert.ok(/@p01/.test(anonymized), 'Should map @param to @p01');
  assert.ok(/ParameterCompiledValue="\(0\)"/.test(anonymized), 'Numeric compiled parameter should be masked to (0)');
});

test('anonymizePgPlanJson obfuscates tables, indexes, schemas, columns, and literals', () => {
  const sampleJson = JSON.stringify([
    {
      Plan: {
        'Node Type': 'Index Scan',
        'Index Name': 'idx_orders_secret_token',
        'Relation Name': 'customer_orders',
        Schema: 'billing',
        Alias: 'co',
        'Total Cost': 42.5,
        'Plan Rows': 10,
        Output: ['co.order_id', 'co.secret_token'],
        'Index Cond': "(co.secret_token = 'tok_live_987654'::text) AND (co.amount_cents > 2500)",
      },
      Query: "SELECT co.order_id, co.secret_token FROM billing.customer_orders co WHERE co.secret_token = 'tok_live_987654' AND co.amount_cents > 2500",
      'Query Identifier': 99887766,
    },
  ]);

  const anonymized = anonymizePgPlanJson(sampleJson);
  const parsed = JSON.parse(anonymized);

  assert.ok(!/customer_orders/.test(anonymized), 'Relation Name should be masked');
  assert.ok(!/billing/.test(anonymized), 'Schema should be masked');
  assert.ok(!/idx_orders_secret_token/.test(anonymized), 'Index Name should be masked');
  assert.ok(!/secret_token/.test(anonymized), 'Column name should be masked');
  assert.ok(!/tok_live_987654/.test(anonymized), 'String literal should be masked');
  assert.ok(!/2500/.test(anonymized), 'Numeric literal should be masked');
  assert.equal(parsed[0].Plan['Relation Name'], 'table_01');
  assert.equal(parsed[0].Plan['Schema'], 'schema_01');
  assert.equal(parsed[0].Plan['Index Name'], 'idx_01');
  assert.equal(parsed[0]['Query Identifier'], 0);
  assert.ok(/schema_01\.table_01/.test(parsed[0].Query), 'Query text should reference schema_01.table_01');
});
