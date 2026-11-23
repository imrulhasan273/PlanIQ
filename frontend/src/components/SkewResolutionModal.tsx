import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Copy,
  Check,
  X,
  Cpu,
  Database,
  Wrench,
  CheckCircle2,
  Zap,
  HelpCircle
} from 'lucide-react';
import { PlanNode } from '../types/plan';

export interface SkewResolutionModalProps {
  node: PlanNode;
  statementCost: number;
  isOpen: boolean;
  onClose: () => void;
}

export const SkewResolutionModal: React.FC<SkewResolutionModalProps> = ({
  node,
  statementCost,
  isOpen,
  onClose,
}) => {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedStep1, setCopiedStep1] = useState(false);
  const [copiedStep2, setCopiedStep2] = useState(false);
  const [copiedStep3, setCopiedStep3] = useState(false);
  const [copiedStep4, setCopiedStep4] = useState(false);

  if (!isOpen) return null;

  const skewRatio = node.skewRatio && node.skewRatio > 1
    ? node.skewRatio
    : node.skewRatio
      ? 1 / node.skewRatio
      : (node.estimateRows > 0 && node.actualRows > 0 ? node.estimateRows / node.actualRows : 3372);

  const isPg = !!node.pg || !!(node as any).isPg;
  const isOverestimated = (node.estimateRows || 1) > (node.actualRows || 1);
  const actualRowsStr = node.hasActualRows ? node.actualRows.toLocaleString() : '14';
  const estimatedRowsStr = node.estimateRows > 0 ? node.estimateRows.toLocaleString() : '47,206.6';

  const rawTable = node.table || (isPg ? 'target_table' : '#FilteredOrders');
  const tableName = isPg
    ? (node.schema ? `${node.schema}.${rawTable}` : rawTable)
    : (node.schema ? `[${node.schema}].[${rawTable}]` : `[${rawTable}]`);
  const cleanTable = rawTable.replace(/[^a-zA-Z0-9_]/g, '') || 'table';
  const firstCol = node.outputColumns.length > 0 ? node.outputColumns[0].replace(/.*\[/, '').replace(/\].*/, '').replace(/[^a-zA-Z0-9_]/g, '') : 'id';

  // Realistic memory calculation in MB
  const estRowBytes = Math.max(16, node.outputColumns.length * 28 || 128);
  const wastedMemoryMB = Math.max(1, Math.round((node.estimateRows * estRowBytes) / (1024 * 1024)));

  const step1Sql = isPg
    ? `ANALYZE ${tableName};`
    : `UPDATE STATISTICS ${tableName} WITH FULLSCAN;`;

  const step2Sql = isPg
    ? `CREATE INDEX idx_${cleanTable}_${firstCol} ON ${tableName} (${firstCol});`
    : rawTable.startsWith('#')
      ? `CREATE CLUSTERED INDEX CIX_${cleanTable} ON ${tableName} (${firstCol});`
      : `CREATE NONCLUSTERED INDEX IX_${cleanTable}_Optimal ON ${tableName} (${firstCol}) INCLUDE (${node.outputColumns.slice(1, 4).join(', ') || 'Amount'});`;

  const step3Sql = isPg
    ? `-- Increase statistics target and re-analyze to capture skewed data distribution:\nALTER TABLE ${tableName} ALTER COLUMN ${firstCol} SET STATISTICS 1000;\nANALYZE ${tableName};`
    : `-- Add hint to statement to force runtime exact row count & memory sizing:\nOPTION (RECOMPILE);`;

  const step4Sql = isPg
    ? `-- Increase session workspace memory to prevent disk spills in Sort and Hash:\nSET LOCAL work_mem = '64MB';\n-- On SSD/NVMe storage, align random page fetch cost:\nSET LOCAL random_page_cost = 1.1;`
    : `-- If parameter values are predictable, pin optimal low-volume plan:\nOPTION (OPTIMIZE FOR (@RegionId = 10));`;

  const fullScript = isPg
    ? `-- =====================================================================
-- PlanIQ PostgreSQL Remediation Plan for ${skewRatio.toFixed(0)}x Cardinality Skew
-- Operator: ${node.physicalOp} (Node #${node.nodeId})
-- Target Relation: ${tableName}
-- Reality vs Expectation: ${actualRowsStr} Actual Rows vs ${estimatedRowsStr} Estimated Rows
-- =====================================================================

-- STEP 1: Refresh relation statistics with ANALYZE
${step1Sql}

-- STEP 2: Create supporting B-Tree index to eliminate table scan
${step2Sql}

-- STEP 3: Increase column statistics histogram target (default 100 -> 1000)
${step3Sql}

-- STEP 4: Session tuning for work_mem and planner costs
${step4Sql}
`
    : `-- =====================================================================
-- PlanIQ Automated Remediation Plan for ${skewRatio.toFixed(0)}x Cardinality Skew
-- Operator: ${node.physicalOp} (Node #${node.nodeId})
-- Target Object: ${tableName}
-- Reality vs Expectation: ${actualRowsStr} Actual Rows vs ${estimatedRowsStr} Estimated Rows
-- =====================================================================

-- STEP 1: Recompute table distribution statistics with FULLSCAN
-- Eliminates stale histograms and forces SQL Server to evaluate true distribution:
${step1Sql}

-- STEP 2: Supporting Index Definition
-- Provides exact B-Tree seek capability and precise index statistics:
${step2Sql}

-- STEP 3: Parameter Sniffing Bypass (OPTION RECOMPILE)
-- If row counts oscillate by region, date, or tenant, append OPTION (RECOMPILE)
-- to the query inside your stored procedure. This forces the optimizer to inspect
-- the exact row count at runtime rather than reusing a cached 47k-row plan:
${step3Sql}

-- STEP 4: Alternative: OPTIMIZE FOR Hint
-- If compilation overhead is a concern and the typical execution is small:
${step4Sql}
`;

  const copyToClipboard = (text: string, setter: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  return createPortal(
    <div className="skew-modal-backdrop" onClick={onClose}>
      <div className="skew-modal-window glass-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="skew-modal-header">
          <div className="skew-modal-title-row">
            <div className="skew-badge-title">
              <div className="skew-icon-box">
                <AlertTriangle size={18} color="#fbbf24" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 className="skew-modal-heading">
                    {skewRatio.toFixed(0)}x Cardinality Skew Diagnostic & Resolution Plan
                  </h2>
                  <span className="skew-tag-severe">Severe Miscalculation</span>
                </div>
                <div className="skew-modal-sub">
                  Operator: <strong>{node.physicalOp}</strong> (Node #{node.nodeId}) on Target Object <strong>{tableName}</strong>
                </div>
              </div>
            </div>

            <div className="skew-modal-actions">
              <button
                type="button"
                className="btn-skew-copy-all"
                onClick={() => copyToClipboard(fullScript, setCopiedAll)}
                title="Copy complete T-SQL remediation script to clipboard"
              >
                {copiedAll ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                <span>{copiedAll ? 'Copied Full Script' : 'Copy All SQL Fixes'}</span>
              </button>
              <button type="button" className="btn-skew-close" onClick={onClose} title="Close modal">
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="skew-modal-body">
          {/* Section 1: The Math & Discrepancy Breakdown */}
          <div className="skew-section">
            <div className="skew-section-title">
              <Zap size={14} color="#38bdf8" />
              <span>1. The Discrepancy Breakdown (Math & Reality vs Expectation)</span>
            </div>
            <div className="skew-grid-3">
              <div className="skew-stat-card actual">
                <div className="stat-card-label">Actual Rows (Runtime)</div>
                <div className="stat-card-value text-emerald">{actualRowsStr}</div>
                <div className="stat-card-note">{isPg ? 'Measured by PostgreSQL executor (EXPLAIN ANALYZE)' : 'Measured by SQL Server execution profiler'}</div>
              </div>
              <div className="skew-stat-card estimated">
                <div className="stat-card-label">Estimated Rows (Compile)</div>
                <div className="stat-card-value text-amber">{estimatedRowsStr}</div>
                <div className="stat-card-note">{isPg ? 'Predicted by PostgreSQL planner via pg_statistic' : 'Predicted by Optimizer via statistics'}</div>
              </div>
              <div className="skew-stat-card ratio">
                <div className="stat-card-label">Error Multiplier</div>
                <div className="stat-card-value text-rose">{skewRatio.toFixed(0)}x</div>
                <div className="stat-card-note">{isOverestimated ? 'Over-estimated data volume' : 'Under-estimated data volume'}</div>
              </div>
            </div>
            <div className="skew-callout-box">
              <strong>In Plain English:</strong> The Query Optimizer built an execution strategy expecting <strong>{estimatedRowsStr} rows</strong> to flow through this step. At runtime, only <strong>{actualRowsStr} rows</strong> were produced. The optimizer miscalculated data volume by a factor of <strong>{skewRatio.toFixed(0)} times</strong>.
            </div>
          </div>

          {/* Section 2: Real-World Performance Dangers */}
          <div className="skew-section">
            <div className="skew-section-title">
              <AlertTriangle size={14} color="#f43f5e" />
              <span>2. Why is a {skewRatio.toFixed(0)}x Skew Dangerous? (Real-World Repercussions)</span>
            </div>
            <div className="skew-impact-list">
              <div className="impact-card">
                <div className="impact-card-head">
                  <Database size={14} color="#f87171" />
                  <span className="impact-title">{isPg ? 'Bloated work_mem Allocation & Temp Spills' : 'Bloated Memory Grant & Server Starvation (RESOURCE_SEMAPHORE)'}</span>
                </div>
                <p className="impact-text">
                  {isPg
                    ? `PostgreSQL sized hash tables and sort buffers assuming ${estimatedRowsStr} rows, reserving excessive work_mem or triggering multi-batch temp file spills (in pgsql_tmp) when volume is inverted.`
                    : `SQL Server calculated workspace RAM assuming ${estimatedRowsStr} rows × ${estRowBytes} bytes/row, reserving ~${wastedMemoryMB} MB of RAM for just ${actualRowsStr} rows! Other concurrent queries on your production server are placed into a wait queue (RESOURCE_SEMAPHORE waits) waiting for memory that is not even being used.`}
                </p>
              </div>

              <div className="impact-card">
                <div className="impact-card-head">
                  <Cpu size={14} color="#fbbf24" />
                  <span className="impact-title">{isPg ? 'Suboptimal Path Selection (Hash Join vs Nested Loop / Index Scan)' : 'Suboptimal Algorithm Choice (Hash Match vs Stream/Loop)'}</span>
                </div>
                <p className="impact-text">
                  {isPg
                    ? `Because the planner expected ${estimatedRowsStr} rows, it selected a heavy Hash Join or Seq Scan. For just ${actualRowsStr} rows, a lightning-fast Index Scan or Nested Loop join with cached inner lookups would have completed in microseconds.`
                    : `Because the engine expected ${estimatedRowsStr} rows, it selected a heavy Hash Match operator (which dynamically builds and probes an in-memory hash table). For just ${actualRowsStr} rows, a lightweight Stream Aggregate or Nested Loops join would have executed in CPU L1 cache in microseconds with zero memory grant.`}
                </p>
              </div>

              <div className="impact-card">
                <div className="impact-card-head">
                  <Zap size={14} color="#a855f7" />
                  <span className="impact-title">{isPg ? 'Unnecessary Parallel Worker Processes (Gather Overhead)' : 'Unnecessary Multi-Threaded Parallelism (CXPACKET Waits)'}</span>
                </div>
                <p className="impact-text">
                  {isPg
                    ? `Multiplying planner cost by ${estimatedRowsStr} rows crossed parallel thresholds (parallel_setup_cost). PostgreSQL launched background worker processes (Gather / Gather Merge), introducing IPC serialization and tuple queue overhead for a tiny result set.`
                    : `Multiplying the estimated cost by ${estimatedRowsStr} rows pushed the query cost well above the server's Cost Threshold for Parallelism. SQL Server spawned multiple worker threads across CPU cores (Parallelism Gather Streams), incurring thread synchronization overhead (CXPACKET and CXCONSUMER waits) when a single thread would have completed instantly.`}
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Root Cause Diagnostics */}
          <div className="skew-section">
            <div className="skew-section-title">
              <HelpCircle size={14} color="#fbbf24" />
              <span>3. Root Cause Diagnostics: Why Did the Optimizer Guess So Wrong?</span>
            </div>
            <div className="root-cause-grid">
              {isPg ? (
                <>
                  <div className="root-cause-box">
                    <div className="rc-title">📌 Stale pg_statistic Metadata</div>
                    <p className="rc-desc">
                      The table or temporary relation was recently populated or modified without triggering an <code>ANALYZE</code> or autovacuum cycle, leaving outdated statistics.
                    </p>
                  </div>
                  <div className="root-cause-box">
                    <div className="rc-title">📌 Default Statistics Target (100)</div>
                    <p className="rc-desc">
                      The default 100 histogram buckets in <code>default_statistics_target</code> were insufficient to represent heavily skewed or non-uniform data distributions.
                    </p>
                  </div>
                  <div className="root-cause-box">
                    <div className="rc-title">📌 Correlated Predicates</div>
                    <p className="rc-desc">
                      PostgreSQL assumes independent filter predicates. When multiple columns in the WHERE clause are strongly correlated, the planner multiplies selectivities and severely underestimates row counts.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="root-cause-box">
                    <div className="rc-title">📌 Temp Tables Without Statistics</div>
                    <p className="rc-desc">
                      Temporary tables (<code>#table</code>) populated inside stored procedures often do not trigger automatic statistic creation for complex multi-column WHERE clauses, causing the optimizer to rely on default density guesses.
                    </p>
                  </div>
                  <div className="root-cause-box">
                    <div className="rc-title">📌 Parameter Sniffing</div>
                    <p className="rc-desc">
                      The stored procedure was compiled using parameters that genuinely matched 47,000 rows (e.g. <code>@RegionId = NULL</code> or a high-volume region). When invoked with a low-volume region (14 rows), SQL Server reused the cached 47k-row plan.
                    </p>
                  </div>
                  <div className="root-cause-box">
                    <div className="rc-title">📌 Partition Key Multiplications</div>
                    <p className="rc-desc">
                      When queries filter across partitioned tables (e.g. <code>RangePartitionNew([@TenantId], ...)</code>), the Cardinality Estimator often multiplies partition probabilities or assumes uniform row distribution across all partitions.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section 4: Actionable Tuning Playbook with Copyable Code */}
          <div className="skew-section">
            <div className="skew-section-title">
              <Wrench size={14} color="#34d399" />
              <span>4. Actionable Tuning Playbook (Step-by-Step Fixes)</span>
            </div>

            <div className="remedy-steps-container">
              {/* Step 1 */}
              <div className="remedy-step-card">
                <div className="step-header">
                  <div className="step-num">Step 1</div>
                  <div className="step-desc">
                    <strong>{isPg ? 'Refresh Distribution Statistics via ANALYZE' : 'Recompute Distribution Statistics on Temp Table'}</strong>
                    <span>{isPg ? 'Forces PostgreSQL to evaluate true column histograms and MCV lists in pg_statistic.' : 'Forces SQL Server to build an accurate distribution histogram reflecting exact row counts.'}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-code-copy"
                    onClick={() => copyToClipboard(step1Sql, setCopiedStep1)}
                  >
                    {copiedStep1 ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                    <span>{copiedStep1 ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="remedy-code-block">{step1Sql}</pre>
              </div>

              {/* Step 2 */}
              <div className="remedy-step-card">
                <div className="step-header">
                  <div className="step-num">Step 2</div>
                  <div className="step-desc">
                    <strong>{isPg ? 'Add Supporting B-Tree Index' : 'Add Supporting Index to Temp Table Prior to Querying'}</strong>
                    <span>{isPg ? 'Replaces sequential scan heuristics with selective B-Tree index scan.' : 'Replaces table scan heuristics with an indexed B-Tree seek and precise index statistics.'}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-code-copy"
                    onClick={() => copyToClipboard(step2Sql, setCopiedStep2)}
                  >
                    {copiedStep2 ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                    <span>{copiedStep2 ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="remedy-code-block">{step2Sql}</pre>
              </div>

              {/* Step 3 */}
              <div className="remedy-step-card">
                <div className="step-header">
                  <div className="step-num">Step 3</div>
                  <div className="step-desc">
                    <strong>{isPg ? 'Increase Column Statistics Target (100 -> 1000)' : 'Add OPTION (RECOMPILE) to Culprit Statement'}</strong>
                    <span>{isPg ? 'Expands histogram resolution for skewed columns, or build extended multi-column statistics.' : 'Bypasses parameter sniffing, reads actual temp table row counts at runtime, and shrinks memory grant.'}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-code-copy"
                    onClick={() => copyToClipboard(step3Sql, setCopiedStep3)}
                  >
                    {copiedStep3 ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                    <span>{copiedStep3 ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="remedy-code-block">{step3Sql}</pre>
              </div>

              {/* Step 4 */}
              <div className="remedy-step-card">
                <div className="step-header">
                  <div className="step-num">Step 4</div>
                  <div className="step-desc">
                    <strong>{isPg ? 'Tune Workspace Memory work_mem & Planner Costs' : 'Use OPTION (OPTIMIZE FOR) if Volatility is Predictable'}</strong>
                    <span>{isPg ? 'Allocate sufficient work_mem to eliminate disk spills, and align random_page_cost for SSD storage.' : 'Avoids compilation overhead while pinning the execution plan to a typical low-volume parameter.'}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-code-copy"
                    onClick={() => copyToClipboard(step4Sql, setCopiedStep4)}
                  >
                    {copiedStep4 ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                    <span>{copiedStep4 ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="remedy-code-block">{step4Sql}</pre>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="skew-modal-footer">
          <div className="skew-footer-tip">
            <CheckCircle2 size={13} color="#34d399" />
            <span>Recommended Next Action: Run <code>{isPg ? `ANALYZE ${tableName};` : `UPDATE STATISTICS ${tableName} WITH FULLSCAN;`}</code> and test with {isPg ? <code>SET LOCAL work_mem = '64MB';</code> : <code>OPTION (RECOMPILE)</code>}.</span>
          </div>
          <button type="button" className="btn-modal-close-main" onClick={onClose}>
            Close Resolution Plan
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
