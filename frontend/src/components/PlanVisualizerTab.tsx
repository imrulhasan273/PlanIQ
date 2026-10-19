import React, { useState } from 'react';
import {
  GitCommit,
  AlertTriangle,
  Layers,
  Database,
  Search,
  Filter,
  CheckCircle2,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Table,
  ListOrdered,
  LayoutGrid,
  ArrowDownUp,
  ArrowLeftRight
} from 'lucide-react';
import { PlanAnalysis, StatementAnalysis, PlanNode } from '../types/plan';

interface PlanVisualizerTabProps {
  plan: PlanAnalysis;
  selectedStatement: StatementAnalysis;
  onSelectStatement: (stmt: StatementAnalysis) => void;
}

export const PlanVisualizerTab: React.FC<PlanVisualizerTabProps> = ({
  plan,
  selectedStatement,
  onSelectStatement,
}) => {
  const [selectedNode, setSelectedNode] = useState<PlanNode | null>(
    selectedStatement.rootNode || null
  );
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [copiedSQL, setCopiedSQL] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [filterOnlyTrees, setFilterOnlyTrees] = useState<boolean>(true);

  const handleCopySQL = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSQL(true);
    setTimeout(() => setCopiedSQL(false), 2000);
  };

  const statementsToDisplay = filterOnlyTrees
    ? plan.statements.filter((s) => s.hasQueryPlan || s.rootNode)
    : plan.statements;

  return (
    <div className="visualizer-container">
      {/* Visualizer Top Bar */}
      <div className="vis-topbar glass-panel">
        {/* Left: View Mode Toggle */}
        <div className="vis-mode-toggle-group">
          <div className="segmented-control">
            <button
              className={`segmented-btn ${viewMode === 'all' ? 'active' : ''}`}
              onClick={() => setViewMode('all')}
              title="View all statements in the batch at once (SSMS Mode)"
            >
              <ListOrdered size={14} />
              <span>All Statements at Once ({statementsToDisplay.length})</span>
            </button>
            <button
              className={`segmented-btn ${viewMode === 'single' ? 'active' : ''}`}
              onClick={() => setViewMode('single')}
              title="Focus on a single statement"
            >
              <LayoutGrid size={14} />
              <span>Single Statement</span>
            </button>
          </div>

          {viewMode === 'all' && (
            <label className="checkbox-label" style={{ fontSize: '12px', marginLeft: '8px' }}>
              <input
                type="checkbox"
                checked={filterOnlyTrees}
                onChange={(e) => setFilterOnlyTrees(e.target.checked)}
              />
              <span>Hide empty non-query stmts</span>
            </label>
          )}

          {viewMode === 'single' && (
            <div className="vis-stmt-selector" style={{ marginLeft: '10px' }}>
              <select
                className="stmt-dropdown"
                value={selectedStatement.statementId}
                onChange={(e) => {
                  const found = plan.statements.find((s) => s.statementId === e.target.value);
                  if (found) {
                    onSelectStatement(found);
                    setSelectedNode(found.rootNode || null);
                  }
                }}
              >
                {plan.statements.map((s) => (
                  <option key={s.statementId} value={s.statementId}>
                    #{s.statementId} [{s.statementType}] - Cost: {s.statementSubTreeCost.toFixed(2)} ({s.costPercentage.toFixed(1)}%)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Middle: Metrics for Single Mode or Batch Summary for All Mode */}
        <div className="vis-compile-metrics">
          {viewMode === 'single' ? (
            <>
              <span className="badge badge-info">Cost: {selectedStatement.statementSubTreeCost.toFixed(2)}</span>
              {selectedStatement.compileTimeMs > 0 && (
                <span className="meta-item">Compile: {selectedStatement.compileTimeMs}ms</span>
              )}
              {selectedStatement.warnings.length > 0 && (
                <span className="badge badge-critical">
                  <AlertTriangle size={12} /> {selectedStatement.warnings.length} Warnings
                </span>
              )}
            </>
          ) : (
            <span className="meta-item" style={{ color: '#94a3b8' }}>
              Showing {statementsToDisplay.length} of {plan.totalStatements} statements • Total Cost: {plan.totalSubTreeCost.toFixed(2)}
            </span>
          )}
        </div>

        {/* Right: Orientation & Zoom Controls */}
        <div className="vis-right-controls">
          {/* Orientation Toggle */}
          <div className="segmented-control" title="Change layout orientation">
            <button
              className={`segmented-btn ${orientation === 'vertical' ? 'active' : ''}`}
              onClick={() => setOrientation('vertical')}
              title="Vertical Tree Layout (Top to Bottom)"
            >
              <ArrowDownUp size={13} />
              <span>Vertical</span>
            </button>
            <button
              className={`segmented-btn ${orientation === 'horizontal' ? 'active' : ''}`}
              onClick={() => setOrientation('horizontal')}
              title="Horizontal Pipeline (SSMS Style)"
            >
              <ArrowLeftRight size={13} />
              <span>Horizontal (SSMS)</span>
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="zoom-controls">
            <button
              className="btn-icon"
              onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.1))}
              title="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>
            <span className="zoom-label">{(zoomLevel * 100).toFixed(0)}%</span>
            <button
              className="btn-icon"
              onClick={() => setZoomLevel((z) => Math.min(1.5, z + 0.1))}
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
            <button
              className="btn-icon"
              onClick={() => setZoomLevel(1)}
              title="Reset Zoom"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* SQL Snippet Bar (Single Statement Mode) */}
      {viewMode === 'single' && (
        <div className="stmt-sql-bar glass-panel">
          <div className="sql-snippet-preview">
            <code>{selectedStatement.statementText}</code>
          </div>
          <button className="btn-copy-sm" onClick={() => handleCopySQL(selectedStatement.statementText)}>
            {copiedSQL ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
            <span>{copiedSQL ? 'Copied' : 'Copy SQL'}</span>
          </button>
        </div>
      )}

      {/* Main Canvas Area */}
      <div className="vis-main-layout">
        {/* Tree Canvas */}
        <div className="vis-canvas-scroll">
          {viewMode === 'single' ? (
            /* Single Statement Focused View */
            selectedStatement.rootNode ? (
              <div
                className={`tree-wrapper ${orientation === 'horizontal' ? 'tree-layout-horizontal' : ''}`}
                style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}
              >
                <TreeNode
                  node={selectedStatement.rootNode}
                  selectedNode={selectedNode}
                  onSelectNode={setSelectedNode}
                  orientation={orientation}
                />
              </div>
            ) : (
              <div className="empty-tree-state">
                <Layers size={40} color="#64748b" />
                <h3>No Relational Operators Found</h3>
                <p className="text-muted">
                  This statement may be a variable assignment or metadata check without an execution tree.
                </p>
              </div>
            )
          ) : (
            /* All Statements Continuous SSMS Mode */
            <div className="all-statements-scroll-container">
              {statementsToDisplay.map((stmt) => (
                <div
                  key={stmt.statementId}
                  className="statement-batch-block glass-panel"
                  id={`stmt-block-${stmt.statementId}`}
                >
                  {/* Statement Header */}
                  <div className="stmt-batch-header">
                    <div className="stmt-batch-left">
                      <span className="badge badge-info" style={{ fontWeight: 700 }}>
                        Query #{stmt.statementId}
                      </span>
                      <span className="stmt-type-tag">{stmt.statementType}</span>
                      <span
                        className="stmt-cost-tag"
                        style={{
                          fontWeight: 700,
                          color: stmt.costPercentage > 20 ? '#f43f5e' : stmt.costPercentage > 5 ? '#fbbf24' : '#38bdf8'
                        }}
                      >
                        Cost: {stmt.statementSubTreeCost.toFixed(2)} ({stmt.costPercentage.toFixed(1)}% of batch)
                      </span>

                      {/* Mini cost bar */}
                      <div className="batch-progress-mini">
                        <div
                          className={`batch-progress-fill ${stmt.costPercentage > 20 ? 'fill-heavy' : 'fill-normal'}`}
                          style={{ width: `${Math.min(100, Math.max(4, stmt.costPercentage))}%` }}
                        />
                      </div>

                      {stmt.warnings.length > 0 && (
                        <span className="badge badge-critical" style={{ fontSize: '10px' }}>
                          <AlertTriangle size={11} /> {stmt.warnings.length} Warnings
                        </span>
                      )}
                    </div>

                    <div className="stmt-batch-actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleCopySQL(stmt.statementText)}
                        title="Copy query SQL text"
                      >
                        <Copy size={12} />
                        <span>Copy SQL</span>
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          onSelectStatement(stmt);
                          setSelectedNode(stmt.rootNode || null);
                          setViewMode('single');
                        }}
                        title="Focus only on this single statement"
                      >
                        <Maximize2 size={12} />
                        <span>Focus</span>
                      </button>
                    </div>
                  </div>

                  {/* SQL Preview Snippet */}
                  <div className="stmt-batch-query-preview">
                    <code>{stmt.statementText.trim()}</code>
                  </div>

                  {/* Statement Tree */}
                  <div className="stmt-batch-tree-area">
                    {stmt.rootNode ? (
                      <div
                        className={`tree-wrapper ${orientation === 'horizontal' ? 'tree-layout-horizontal' : ''}`}
                        style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}
                      >
                        <TreeNode
                          node={stmt.rootNode}
                          selectedNode={selectedNode}
                          onSelectNode={setSelectedNode}
                          orientation={orientation}
                        />
                      </div>
                    ) : (
                      <div className="empty-tree-state-sm">
                        <Layers size={16} color="#64748b" />
                        <span>(Non-query statement — Assignment / Control Flow without relational tree)</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Node Inspector Drawer */}
        {selectedNode && (
          <aside className="node-inspector glass-panel">
            <div className="inspector-header">
              <div className="inspector-title-row">
                <div className="operator-icon-badge">
                  {getOperatorIcon(selectedNode.physicalOp)}
                </div>
                <div>
                  <h3 className="inspector-title">{selectedNode.physicalOp}</h3>
                  <div className="inspector-sub">{selectedNode.logicalOp}</div>
                </div>
              </div>
              <span className={`badge ${selectedNode.isPainPoint ? 'badge-critical' : 'badge-info'}`}>
                Node #{selectedNode.nodeId}
              </span>
            </div>

            <div className="inspector-body">
              {/* Cardinality Skew Alert */}
              {selectedNode.hasCardinalitySkew && (
                <div className="inspector-alert border-skew">
                  <AlertTriangle size={16} color="#fbbf24" />
                  <div>
                    <strong style={{ color: '#fde68a' }}>Severe Cardinality Skew:</strong> {selectedNode.skewReason}
                    <div style={{ marginTop: '4px', fontSize: '11px', color: '#fef3c7' }}>
                      <strong>Remedy:</strong> Update table statistics (<code>UPDATE STATISTICS [{selectedNode.schema}].[{selectedNode.table}] WITH FULLSCAN</code>) or add <code>OPTION (RECOMPILE)</code>.
                    </div>
                  </div>
                </div>
              )}

              {/* Pain Point Banner */}
              {selectedNode.isPainPoint && !selectedNode.hasCardinalitySkew && (
                <div className="inspector-alert">
                  <AlertTriangle size={15} color="#f43f5e" />
                  <div>
                    <strong>Bottleneck Flag:</strong> {selectedNode.painReason}
                  </div>
                </div>
              )}

              {/* Target Object / Table */}
              {selectedNode.table && (
                <div className="inspector-section">
                  <div className="inspector-label">Target Object</div>
                  <div className="object-details-box">
                    <div className="object-name">
                      <Table size={13} color="#38bdf8" />
                      <span>{selectedNode.schema ? `${selectedNode.schema}.${selectedNode.table}` : selectedNode.table}</span>
                    </div>
                    {selectedNode.index && (
                      <div className="object-index">
                        Index: <strong>{selectedNode.index}</strong> ({selectedNode.indexKind || 'Index'})
                      </div>
                    )}
                    {selectedNode.tableCardinality > 0 && (
                      <div className="text-muted" style={{ fontSize: '11px', marginTop: '2px' }}>
                        Table Cardinality: {selectedNode.tableCardinality.toLocaleString()} rows
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Cost & Cardinality Grid */}
              <div className="inspector-section">
                <div className="inspector-label">Operator Estimates</div>
                <div className="inspector-stats-grid">
                  <div className="stat-pill">
                    <span className="stat-name">Subtree Cost</span>
                    <span className="stat-val">{selectedNode.estimatedTotalSubtreeCost.toFixed(4)}</span>
                  </div>
                  <div className="stat-pill">
                    <span className="stat-name">Est. Rows</span>
                    <span className="stat-val">{selectedNode.estimateRows.toLocaleString()}</span>
                  </div>
                  <div className="stat-pill">
                    <span className="stat-name">Est. CPU</span>
                    <span className="stat-val">{selectedNode.estimateCpu.toFixed(4)}</span>
                  </div>
                  <div className="stat-pill">
                    <span className="stat-name">Est. I/O</span>
                    <span className="stat-val">{selectedNode.estimateIo.toFixed(4)}</span>
                  </div>
                </div>
              </div>

              {/* Seek Predicates */}
              {selectedNode.seekPredicates && (
                <div className="inspector-section">
                  <div className="inspector-label">Seek Predicates</div>
                  <pre className="predicate-code-box">{selectedNode.seekPredicates}</pre>
                </div>
              )}

              {/* Predicate */}
              {selectedNode.predicate && (
                <div className="inspector-section">
                  <div className="inspector-label">Filter Predicate</div>
                  <pre className="predicate-code-box">{selectedNode.predicate}</pre>
                </div>
              )}

              {/* Output Columns */}
              {selectedNode.outputColumns.length > 0 && (
                <div className="inspector-section">
                  <div className="inspector-label">Output Columns ({selectedNode.outputColumns.length})</div>
                  <div className="output-cols-wrap">
                    {selectedNode.outputColumns.map((col, idx) => (
                      <span key={idx} className="col-badge">{col}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

interface TreeNodeProps {
  node: PlanNode;
  selectedNode: PlanNode | null;
  onSelectNode: (node: PlanNode) => void;
  orientation?: 'vertical' | 'horizontal';
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, selectedNode, onSelectNode, orientation = 'vertical' }) => {
  const isSelected = selectedNode?.nodeId === node.nodeId;
  const isHot = node.costPercentage > 30 || node.isPainPoint;
  const isHorizontal = orientation === 'horizontal';

  return (
    <div className={`tree-node-wrapper ${isHorizontal ? 'tree-node-wrapper-horizontal' : ''}`}>
      <div
        className={`plan-node-box glass-panel ${isSelected ? 'node-selected' : ''} ${
          isHot ? 'node-hot' : ''
        }`}
        onClick={() => onSelectNode(node)}
      >
        <div className="node-top">
          <div className="node-icon-title">
            <span className="node-icon">{getOperatorIcon(node.physicalOp)}</span>
            <div className="node-title-group">
              <span className="node-physical-title">{node.physicalOp}</span>
              {node.logicalOp && node.logicalOp !== node.physicalOp && (
                <span className="node-logical-sub">{node.logicalOp}</span>
              )}
            </div>
          </div>
          <span
            className={`node-cost-badge ${
              node.costPercentage > 40
                ? 'cost-critical'
                : node.costPercentage > 15
                ? 'cost-warning'
                : 'cost-normal'
            }`}
          >
            {node.costPercentage.toFixed(1)}%
          </span>
        </div>

        {/* Target Table info */}
        {node.table && (
          <div className="node-table-row" title={`${node.schema}.${node.table}`}>
            <Table size={12} color="#38bdf8" />
            <span className="node-table-name">
              {node.schema ? `${node.schema}.${node.table}` : node.table}
            </span>
          </div>
        )}

        {/* Rows Estimate */}
        <div className="node-bottom-meta">
          <span className="text-dim">Rows:</span>
          <span className="text-main">
            {node.hasActualRows
              ? `${node.actualRows.toLocaleString()} (Act)`
              : node.estimateRows > 0
              ? node.estimateRows.toLocaleString()
              : '1'}
          </span>
          {node.hasCardinalitySkew && (
            <span
              className="badge badge-high"
              style={{ fontSize: '9px', padding: '1px 4px' }}
              title={node.skewReason}
            >
              {node.skewRatio && node.skewRatio > 1
                ? `${node.skewRatio.toFixed(0)}x`
                : node.skewRatio
                ? `${(1 / node.skewRatio).toFixed(0)}x`
                : ''}{' '}
              Skew
            </span>
          )}
          {node.isPainPoint && !node.hasCardinalitySkew && (
            <span className="node-warning-flag" title={node.painReason}>
              <AlertTriangle size={12} color="#f43f5e" />
            </span>
          )}
        </div>
      </div>

      {/* Children Nodes */}
      {node.children && node.children.length > 0 && (
        <div className={`node-children-container ${isHorizontal ? 'node-children-container-horizontal' : ''}`}>
          {node.children.map((child) => (
            <div key={child.nodeId} className={`child-branch ${isHorizontal ? 'child-branch-horizontal' : ''}`}>
              <div className={isHorizontal ? 'branch-line-h' : 'branch-line-v'} />
              <TreeNode
                node={child}
                selectedNode={selectedNode}
                onSelectNode={onSelectNode}
                orientation={orientation}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function getOperatorIcon(physicalOp: string) {
  const op = physicalOp.toLowerCase();
  if (op.includes('seek')) return <Search size={14} color="#38bdf8" />;
  if (op.includes('scan')) return <Filter size={14} color="#f59e0b" />;
  if (op.includes('lookup')) return <AlertTriangle size={14} color="#f43f5e" />;
  if (op.includes('join') || op.includes('nested loops') || op.includes('hash match'))
    return <Layers size={14} color="#a855f7" />;
  if (op.includes('insert') || op.includes('update') || op.includes('delete'))
    return <Database size={14} color="#10b981" />;
  return <GitCommit size={14} color="#94a3b8" />;
}
