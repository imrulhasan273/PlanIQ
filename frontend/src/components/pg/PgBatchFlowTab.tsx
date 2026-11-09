import React, { useState, useMemo } from 'react';
import {
  Layers,
  Database,
  AlertTriangle,
  ArrowRight,
  Zap,
  Clock,
  Cpu,
  Search,
  Filter,
  Flame,
  CheckCircle2,
  HardDrive,
  GitFork,
  Sparkles,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Table,
  Tag,
  Code2
} from 'lucide-react';
import { PlanAnalysis, StatementAnalysis, PlanNode } from '../../types/plan';

interface PgBatchFlowTabProps {
  plan: PlanAnalysis;
  onSelectStatement: (stmt: StatementAnalysis, targetTab: 'visualizer' | 'advisor') => void;
}

interface WorkMemConsumer {
  nodeId: number;
  physicalOp: string;
  relation?: string;
  sortMethod?: string;
  spaceUsedKb?: number;
  spaceType?: string;
  hashBuckets?: number;
  hashBatches?: number;
  isSpill: boolean;
  actualRows: number;
  costPercent: number;
}

export const PgBatchFlowTab: React.FC<PgBatchFlowTabProps> = ({
  plan,
  onSelectStatement,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'spills' | 'scans' | 'parallel'>('all');
  const [expandedNodeId, setExpandedNodeId] = useState<number | null>(null);

  // Extract all nodes flattened in pipeline execution order (post-order traversal: leaves first)
  const pipelineNodes = useMemo(() => {
    const list: PlanNode[] = [];
    const walk = (n?: PlanNode) => {
      if (!n) return;
      if (n.children) {
        n.children.forEach(walk);
      }
      list.push(n);
    };
    plan.statements.forEach((stmt) => walk(stmt.rootNode));
    return list;
  }, [plan]);

  // Extract work_mem consumers (Sort, Hash, Hash Join, Materialize, Aggregate)
  const workMemConsumers: WorkMemConsumer[] = useMemo(() => {
    const results: WorkMemConsumer[] = [];
    pipelineNodes.forEach((n) => {
      const opLower = n.physicalOp.toLowerCase();
      const isSort = opLower.includes('sort');
      const isHash = opLower.includes('hash');
      const isMat = opLower.includes('materialize');
      const isAgg = opLower.includes('aggregate');

      if (isSort || isHash || isMat || isAgg) {
        const spaceUsed = n.pg?.sortSpaceKb || n.pg?.peakMemoryKb;
        const spaceType = n.pg?.sortSpaceType || (isSort ? 'Memory' : undefined);
        const sortMethod = n.pg?.sortMethod;
        const hashBatches = n.pg?.hashBatches || 1;
        const isSpill =
          (spaceType || '').toLowerCase().includes('disk') ||
          (sortMethod || '').toLowerCase().includes('external') ||
          hashBatches > 1 ||
          (n.pg?.buffers?.tempRead || 0) > 0 ||
          (n.pg?.buffers?.tempWritten || 0) > 0;

        results.push({
          nodeId: n.nodeId,
          physicalOp: n.physicalOp,
          relation: n.table,
          sortMethod,
          spaceUsedKb: spaceUsed,
          spaceType,
          hashBuckets: n.pg?.hashBuckets,
          hashBatches,
          isSpill,
          actualRows: n.actualRows,
          costPercent: n.costPercentage,
        });
      }
    });
    return results;
  }, [pipelineNodes]);

  // Filtered pipeline
  const filteredPipeline = useMemo(() => {
    return pipelineNodes.filter((node) => {
      const matchSearch =
        node.physicalOp.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (node.table || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (node.predicate || '').toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchSearch) return false;

      if (filterType === 'spills') {
        return (
          (node.pg?.sortSpaceType || '').toLowerCase().includes('disk') ||
          (node.pg?.hashBatches || 0) > 1 ||
          (node.pg?.buffers?.tempRead || 0) > 0
        );
      }
      if (filterType === 'scans') {
        return node.physicalOp.toLowerCase().includes('scan');
      }
      if (filterType === 'parallel') {
        return (
          node.physicalOp.toLowerCase().includes('gather') ||
          (node.pg?.workersPlanned || 0) > 0
        );
      }
      return true;
    });
  }, [pipelineNodes, searchTerm, filterType]);

  const totalCost = plan.totalSubTreeCost > 0 ? plan.totalSubTreeCost : 1;
  const firstStmt = plan.statements[0];
  const firstStmtPg = firstStmt?.pg;

  return (
    <div className="tab-scroll-container">
      {/* Top Banner: WorkMem & Pipeline Architecture */}
      <div className="verdict-hero-card glass-panel" style={{ borderLeft: '4px solid #38bdf8' }}>
        <div className="verdict-top-row">
          <div className="verdict-title-tag">
            <Layers size={16} color="#38bdf8" />
            <span>PostgreSQL Execution Pipeline & work_mem Lifecycle</span>
          </div>
          <span className="badge badge-info" style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
            {pipelineNodes.length} Execution Operators
          </span>
        </div>

        <h3 style={{ margin: '8px 0 4px 0', fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
          Chronological Execution Waterfall & Memory Allocation
        </h3>
        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
          PostgreSQL processes data from leaf relation scans upward through Hash/Sort memory buffers to the final aggregate. Tracks work_mem usage, disk run-file spills, and buffer accumulation.
        </p>

        {/* Quick Lifecycle Counters */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '10px',
            marginTop: '14px',
          }}
        >
          <div className="diag-sub-item glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>work_mem Consumers</span>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#38bdf8', marginTop: '2px' }}>
              {workMemConsumers.length} Operators
            </div>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
              Sorts, Hashes, Aggregates
            </span>
          </div>

          <div className="diag-sub-item glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Disk Spill Events</span>
            <div style={{ fontSize: '17px', fontWeight: 700, color: workMemConsumers.some((c) => c.isSpill) ? '#f43f5e' : '#34d399', marginTop: '2px' }}>
              {workMemConsumers.filter((c) => c.isSpill).length} Spills
            </div>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
              {workMemConsumers.some((c) => c.isSpill) ? 'Exceeded work_mem' : '100% In-Memory'}
            </span>
          </div>

          <div className="diag-sub-item glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Planning vs Runtime</span>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#34d399', marginTop: '2px' }}>
              {firstStmtPg?.executionMs ? `${firstStmtPg.executionMs.toFixed(1)} ms` : `${firstStmt?.actualElapsedMs || 0} ms`}
            </div>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
              Planning: {firstStmtPg?.planningMs ? `${firstStmtPg.planningMs.toFixed(2)} ms` : 'N/A'}
            </span>
          </div>

          <div className="diag-sub-item glass-panel" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Buffer Cache Ratio</span>
            <div style={{ fontSize: '17px', fontWeight: 700, color: (plan.hardwareMetrics?.cacheHitRatioPercent || 100) >= 95 ? '#34d399' : '#fbbf24', marginTop: '2px' }}>
              {(plan.hardwareMetrics?.cacheHitRatioPercent || 100).toFixed(1)}%
            </div>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
              Shared Hit vs Read
            </span>
          </div>
        </div>
      </div>

      {/* work_mem Consumer & Spill Inspection Section */}
      <div className="section-block" style={{ marginTop: '20px' }}>
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HardDrive size={16} color="#38bdf8" />
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                PostgreSQL work_mem & Sort/Hash Space Analysis
              </h4>
            </div>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Configured work_mem: <code>{firstStmtPg?.settings?.work_mem || '4MB (default)'}</code>
            </span>
          </div>

          {workMemConsumers.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
              {workMemConsumers.map((consumer, idx) => (
                <div
                  key={idx}
                  className="glass-panel"
                  style={{
                    padding: '12px',
                    borderLeft: `4px solid ${consumer.isSpill ? '#f43f5e' : '#34d399'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>
                      Node #{consumer.nodeId}: {consumer.physicalOp}
                    </span>
                    <span className={`badge ${consumer.isSpill ? 'badge-critical' : 'badge-success'}`} style={{ fontSize: '10px' }}>
                      {consumer.isSpill ? 'Spill to Disk' : 'In RAM'}
                    </span>
                  </div>

                  {consumer.sortMethod && (
                    <div style={{ fontSize: '11px', color: '#cbd5e1', marginBottom: '4px' }}>
                      Method: <strong style={{ color: consumer.isSpill ? '#f43f5e' : '#34d399' }}>{consumer.sortMethod}</strong>
                    </div>
                  )}

                  {consumer.spaceUsedKb && (
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                      Space Used: <strong style={{ color: '#38bdf8' }}>{consumer.spaceUsedKb.toLocaleString()} KB</strong> ({consumer.spaceType || 'Memory'})
                    </div>
                  )}

                  {consumer.hashBatches && consumer.hashBatches > 1 && (
                    <div style={{ fontSize: '11px', color: '#f43f5e', marginBottom: '4px' }}>
                      Batches: {consumer.hashBatches} (Multi-batch spill! Requires repeated disk I/O)
                    </div>
                  )}

                  {consumer.isSpill && (
                    <div style={{ marginTop: '8px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '6px 8px', borderRadius: '4px' }}>
                      <span style={{ fontSize: '10px', color: '#fca5a5', fontWeight: 600 }}>PostgreSQL Remedy:</span>
                      <code style={{ display: 'block', fontSize: '11px', color: '#38bdf8', marginTop: '2px' }}>
                        SET work_mem = '64MB';
                      </code>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="diag-clean-state" style={{ padding: '16px' }}>
              <CheckCircle2 size={24} color="#34d399" />
              <p>No Sort or Hash operations requiring significant memory in this execution plan.</p>
            </div>
          )}
        </div>
      </div>

      {/* Execution Pipeline Waterfall */}
      <div className="section-block" style={{ marginTop: '20px' }}>
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={16} color="#38bdf8" />
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                Pipeline Execution Steps (Leaves ➔ Root)
              </h4>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <div className="search-input-wrap" style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '8px', top: '8px', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Filter pipeline nodes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '4px 8px 4px 28px',
                    fontSize: '11px',
                    color: '#f8fafc',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  className={`btn-sm ${filterType === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '10.5px' }}
                  onClick={() => setFilterType('all')}
                >
                  All ({pipelineNodes.length})
                </button>
                <button
                  className={`btn-sm ${filterType === 'spills' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '10.5px' }}
                  onClick={() => setFilterType('spills')}
                >
                  Spills
                </button>
                <button
                  className={`btn-sm ${filterType === 'scans' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '10.5px' }}
                  onClick={() => setFilterType('scans')}
                >
                  Scans
                </button>
                <button
                  className={`btn-sm ${filterType === 'parallel' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '10.5px' }}
                  onClick={() => setFilterType('parallel')}
                >
                  Parallel
                </button>
              </div>
            </div>
          </div>

          {/* Node List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredPipeline.map((node, stepIdx) => {
              const isExpanded = expandedNodeId === node.nodeId;
              const hasBuffers = (node.pg?.buffers?.sharedHit || 0) + (node.pg?.buffers?.sharedRead || 0) > 0;
              const isSpill = (node.pg?.sortSpaceType || '').toLowerCase().includes('disk') || (node.pg?.hashBatches || 0) > 1;

              return (
                <div
                  key={node.nodeId}
                  className="glass-panel"
                  style={{
                    padding: '10px 12px',
                    borderLeft: `3px solid ${isSpill ? '#f43f5e' : node.costPercentage > 35 ? '#fbbf24' : '#38bdf8'}`,
                    cursor: 'pointer',
                  }}
                  onClick={() => setExpandedNodeId(isExpanded ? null : node.nodeId)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '10px', color: '#94a3b8', width: '20px' }}>#{stepIdx + 1}</span>
                      <strong style={{ fontSize: '13px', color: '#f8fafc' }}>
                        {node.physicalOp}
                      </strong>
                      {node.table && (
                        <span style={{ fontSize: '12px', color: '#38bdf8' }}>
                          on {node.schema ? `${node.schema}.` : ''}{node.table}
                        </span>
                      )}
                      {node.pg?.indexName && (
                        <code style={{ fontSize: '10.5px', color: '#c084fc' }}>
                          using {node.pg.indexName}
                        </code>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        Cost: <strong>{node.estimatedTotalSubtreeCost.toFixed(1)}</strong> ({node.costPercentage.toFixed(1)}%)
                      </span>
                      <span style={{ fontSize: '11px', color: node.actualRows > 0 ? '#34d399' : '#94a3b8' }}>
                        Rows: <strong>{node.actualRows ? node.actualRows.toLocaleString() : node.estimateRows.toLocaleString()}</strong>
                      </span>
                      {isSpill && (
                        <span className="badge badge-critical" style={{ fontSize: '9.5px' }}>SPILL</span>
                      )}
                      {isExpanded ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
                    </div>
                  </div>

                  {/* Expanded Inspector Panel */}
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: '10px',
                        paddingTop: '10px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '8px',
                        fontSize: '11px',
                      }}
                    >
                      <div>
                        <span style={{ color: '#94a3b8' }}>Startup Cost:</span> {node.pg?.startupCost?.toFixed(2) || '0.00'}
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8' }}>Total Cost:</span> {node.estimatedTotalSubtreeCost.toFixed(2)}
                      </div>
                      {node.pg?.actualStartupMs !== undefined && (
                        <div>
                          <span style={{ color: '#94a3b8' }}>Runtime:</span> {node.actualElapsedMs ? `${node.actualElapsedMs.toFixed(3)} ms` : 'N/A'}
                        </div>
                      )}
                      {hasBuffers && (
                        <div>
                          <span style={{ color: '#94a3b8' }}>Buffers:</span> Hit: {node.pg?.buffers?.sharedHit.toLocaleString()} | Read: {node.pg?.buffers?.sharedRead.toLocaleString()}
                        </div>
                      )}
                      {node.predicate && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <span style={{ color: '#fbbf24', fontWeight: 600 }}>Filter:</span> <code>{node.predicate}</code>
                          {node.pg?.rowsRemovedByFilter ? (
                            <span style={{ color: '#f43f5e', marginLeft: '6px' }}>
                              ({node.pg.rowsRemovedByFilter.toLocaleString()} rows removed)
                            </span>
                          ) : null}
                        </div>
                      )}
                      {node.pg?.indexCond && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <span style={{ color: '#34d399', fontWeight: 600 }}>Index Condition:</span> <code>{node.pg.indexCond}</code>
                        </div>
                      )}
                      {node.pg?.hashCond && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <span style={{ color: '#38bdf8', fontWeight: 600 }}>Hash Join Condition:</span> <code>{node.pg.hashCond}</code>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
