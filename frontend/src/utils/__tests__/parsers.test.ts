import test from 'node:test';
import assert from 'node:assert/strict';
import { isPgExplainJson, parsePgExplainJson } from '../pgPlanParser';
import { isDeadlockXML, isPgDeadlockLog, parsePgDeadlockLog } from '../deadlockParser';
import { formatStandardDuration } from '../durationFormatter';
import { escapeHtml } from '../htmlEscape';

test('escapeHtml neutralizes XSS payloads', () => {
  const payload = `<script>alert("xss" & '1')</script>`;
  const escaped = escapeHtml(payload);
  assert.equal(
    escaped,
    '&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;1&#39;)&lt;/script&gt;'
  );
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('PostgreSQL EXPLAIN JSON detection and parsing', () => {
  const pgJson = JSON.stringify([
    {
      Plan: {
        'Node Type': 'Sort',
        'Startup Cost': 120.5,
        'Total Cost': 250.75,
        'Plan Rows': 1000,
        'Plan Width': 32,
        'Actual Startup Time': 5.1,
        'Actual Total Time': 18.4,
        'Actual Rows': 1000,
        'Actual Loops': 1,
        'Sort Key': ['o.order_date'],
        'Sort Method': 'external merge',
        'Sort Space Used': 2048,
        'Sort Space Type': 'Disk',
        'Shared Hit Blocks': 400,
        'Shared Read Blocks': 120,
        Plans: [
          {
            'Node Type': 'Seq Scan',
            'Relation Name': 'orders',
            Schema: 'public',
            Alias: 'o',
            'Startup Cost': 0,
            'Total Cost': 100,
            'Plan Rows': 1000,
            'Plan Width': 32,
            'Actual Startup Time': 0.1,
            'Actual Total Time': 8.2,
            'Actual Rows': 1000,
            'Actual Loops': 1,
            'Shared Hit Blocks': 400,
            'Shared Read Blocks': 120,
          },
        ],
      },
      'Planning Time': 0.8,
      'Execution Time': 19.2,
    },
  ]);

  assert.equal(isPgExplainJson(pgJson), true);
  assert.equal(isPgExplainJson('<ShowPlanXML />'), false);

  const parsed = parsePgExplainJson(pgJson, 'pg-unit-test.json');
  assert.equal(parsed.engine, 'postgresql');
  assert.equal(parsed.totalStatements, 1);
  assert.ok(parsed.statements[0].rootNode);
  assert.equal(parsed.statements[0].rootNode?.physicalOp, 'Sort');
  assert.equal(parsed.statements[0].rootNode?.children.length, 1);
  assert.equal(parsed.statements[0].rootNode?.children[0].physicalOp, 'Seq Scan');
});

test('Deadlock XML and PostgreSQL deadlock log detection & parsing', () => {
  assert.equal(isDeadlockXML('<deadlock><victim-list/></deadlock>'), true);
  assert.equal(isDeadlockXML('<ShowPlanXML />'), false);

  const pgLog = [
    'ERROR:  deadlock detected',
    'DETAIL:  Process 4101 waits for ShareLock on transaction 9001; blocked by process 4102.',
    'Process 4102 waits for ShareLock on transaction 9000; blocked by process 4101.',
    'STATEMENT:  UPDATE accounts SET balance = balance - 10 WHERE id = 1;',
    'STATEMENT:  UPDATE accounts SET balance = balance + 10 WHERE id = 2;',
  ].join('\n');

  assert.equal(isPgDeadlockLog(pgLog), true);
  const graphs = parsePgDeadlockLog(pgLog);
  assert.equal(graphs.length, 1);
  assert.equal(graphs[0].processes.length, 2);

  // Non-deadlock text must return an empty array (no fake mock fallback)
  assert.deepEqual(parsePgDeadlockLog('INFO: checkpoint complete'), []);
});

test('formatStandardDuration handles sub-second, minutes, and days cleanly', () => {
  assert.equal(formatStandardDuration(0), '0s');
  assert.equal(formatStandardDuration(3.5), '3m 30s');
  assert.ok(formatStandardDuration(1670).startsWith('1d 3h 50m'));
});
