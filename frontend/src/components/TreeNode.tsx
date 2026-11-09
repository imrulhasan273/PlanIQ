import React from 'react';
import {
  AlertTriangle,
  Table,
  Search,
  Filter,
  Layers,
  Database,
  GitCommit,
} from 'lucide-react';
import { PlanNode } from '../types/plan';

export interface TreeNodeProps {
  node: PlanNode;
  selectedNode: PlanNode | null;
  onSelectNode: (node: PlanNode) => void;
  orientation?: 'vertical' | 'horizontal';
  onOpenSkewModal?: (node: PlanNode) => void;
  heatmapMetric?: 'cost' | 'self_elapsed' | 'self_cpu';
}

export function getOperatorIcon(physicalOp: string) {
  const op = (physicalOp || '').toLowerCase();
  if (op.includes('seek') || op.includes('index scan') || op.includes('index only'))
    return <Search size={14} color="#38bdf8" />;
  if (op.includes('scan')) return <Filter size={14} color="#f59e0b" />;
  if (op.includes('lookup')) return <AlertTriangle size={14} color="#f43f5e" />;
  if (op.includes('join') || op.includes('nested loops') || op.includes('hash match') || op.includes('merge join'))
    return <Layers size={14} color="#a855f7" />;
  if (op.includes('insert') || op.includes('update') || op.includes('delete') || op.includes('modify'))
    return <Database size={14} color="#10b981" />;
  if (op.includes('sort') || op.includes('gather') || op.includes('materialize') || op.includes('aggregate') || op.includes('hash'))
    return <Layers size={14} color="#60a5fa" />;
  return <GitCommit size={14} color="#94a3b8" />;
}

export const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  selectedNode,
  onSelectNode,
  orientation = 'vertical',
  onOpenSkewModal,
  heatmapMetric = 'cost',
}) => {
  const isSelected = selectedNode?.nodeId === node.nodeId;
  const hasSkew = node.hasCardinalitySkew;

  const ownElapsedSec = (node.selfElapsedMs ?? 0) / 1000.0;
  const ownCpuSec = (node.selfCpuMs ?? 0) / 1000.0;
  const hasTiming = (node.actualElapsedMs ?? 0) > 0 || (node.actualCpuMs ?? 0) > 0;

  // Heatmap determination
  const isHeatHot =
    heatmapMetric === 'self_elapsed'
      ? ownElapsedSec >= 1.0 || (node.selfElapsedPercent ?? 0) >= 25
      : heatmapMetric === 'self_cpu'
      ? ownCpuSec >= 1.0 || (node.selfCpuPercent ?? 0) >= 25
      : node.costPercentage > 35;

  const isHeatWarm =
    heatmapMetric === 'self_elapsed'
      ? ownElapsedSec >= 0.1 || (node.selfElapsedPercent ?? 0) >= 10
      : heatmapMetric === 'self_cpu'
      ? ownCpuSec >= 0.1 || (node.selfCpuPercent ?? 0) >= 10
      : node.costPercentage > 15;

  const isCritical = isHeatHot || hasSkew;
  const hasIssue =
    isCritical ||
    isHeatWarm ||
    node.isPainPoint ||
    Boolean((node as any).operatorWarnings && (node as any).operatorWarnings.length > 0);
  const isHorizontal = orientation === 'horizontal';

  // Elapsed / CPU timing colors matching PerformanceStudio
  const elapsedColor = ownElapsedSec >= 1.0 ? '#f43f5e' : ownElapsedSec >= 0.1 ? '#f59e0b' : '#38bdf8';
  const cpuColor = ownCpuSec >= 1.0 ? '#f43f5e' : ownCpuSec >= 0.1 ? '#f59e0b' : '#fbbf24';

  const heatIntensity =
    node.heatIntensity ??
    (heatmapMetric === 'self_elapsed' && (node.selfElapsedPercent ?? 0) > 0
      ? node.selfElapsedPercent! / 100
      : heatmapMetric === 'self_cpu' && (node.selfCpuPercent ?? 0) > 0
      ? node.selfCpuPercent! / 100
      : node.costPercentage / 100);

  return (
    <div className={`tree-node-wrapper ${isHorizontal ? 'tree-node-wrapper-horizontal' : ''}`}>
      <div
        data-node-id={node.nodeId}
        className={`plan-node-box glass-panel ${isSelected ? 'node-selected' : ''} ${
          isCritical ? 'node-critical-issue node-heatmap-hot' : hasIssue ? 'node-has-issue node-heatmap-warm' : ''
        }`}
        onClick={() => onSelectNode(node)}
      >
        {/* Heatmap Top Bar */}
        {heatIntensity > 0.05 && (
          <div
            className="node-heatmap-bar"
            style={{
              background:
                heatmapMetric === 'self_cpu'
                  ? `linear-gradient(90deg, #fbbf24 ${Math.min(100, Math.round(heatIntensity * 100))}%, rgba(251, 191, 36, 0.08) ${Math.min(100, Math.round(heatIntensity * 100))}%)`
                  : `linear-gradient(90deg, #f43f5e ${Math.min(100, Math.round(heatIntensity * 100))}%, rgba(244, 63, 94, 0.08) ${Math.min(100, Math.round(heatIntensity * 100))}%)`,
            }}
            title={`Heatmap Intensity: ${(heatIntensity * 100).toFixed(0)}% (relative to highest operator)`}
          />
        )}

        <div className="node-top">
          <div className="node-icon-title">
            <span className="node-icon">{getOperatorIcon(node.physicalOp)}</span>
            <div className="node-title-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="node-physical-title">{node.physicalOp}</span>
                {hasIssue && (
                  <span
                    className="node-header-warning-badge"
                    title={node.skewReason || node.painReason || 'High-cost bottleneck operator'}
                  >
                    <AlertTriangle size={12} color={isCritical ? '#f43f5e' : '#f59e0b'} />
                  </span>
                )}
              </div>
              {node.logicalOp && node.logicalOp !== node.physicalOp && (
                <span className="node-logical-sub">{node.logicalOp}</span>
              )}
            </div>
          </div>
          {heatmapMetric === 'self_elapsed' ? (
            <span
              className={`node-cost-badge ${
                isHeatHot ? 'cost-critical' : isHeatWarm ? 'cost-warning' : 'cost-normal'
              }`}
              title={`Self Elapsed: ${ownElapsedSec.toFixed(3)}s (${(node.selfElapsedPercent || 0).toFixed(1)}% of query duration)`}
            >
              {ownElapsedSec >= 0.001 ? `${ownElapsedSec.toFixed(3)}s` : `${(node.selfElapsedPercent || 0).toFixed(0)}%`}
            </span>
          ) : heatmapMetric === 'self_cpu' ? (
            <span
              className={`node-cost-badge ${
                isHeatHot ? 'cost-critical' : isHeatWarm ? 'cost-warning' : 'cost-normal'
              }`}
              title={`Self CPU: ${ownCpuSec.toFixed(3)}s (${(node.selfCpuPercent || 0).toFixed(1)}% of query CPU)`}
            >
              {ownCpuSec >= 0.001 ? `${ownCpuSec.toFixed(3)}s` : `${(node.selfCpuPercent || 0).toFixed(0)}%`}
            </span>
          ) : (
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
          )}
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
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={`${node.skewReason || 'Cardinality Skew'} — Click to open resolution plan`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(node);
                if (onOpenSkewModal) {
                  onOpenSkewModal(node);
                }
              }}
            >
              {node.skewRatio && node.skewRatio > 1
                ? `${node.skewRatio.toFixed(0)}x`
                : node.skewRatio
                ? `${(1 / node.skewRatio).toFixed(0)}x`
                : ''}{' '}
              Skew ↗
            </span>
          )}
          {node.isPainPoint && !node.hasCardinalitySkew && (
            <span className="node-warning-flag" title={node.painReason}>
              <AlertTriangle size={12} color="#f43f5e" />
            </span>
          )}
          {node.pgBadges && node.pgBadges.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '2px' }}>
              {node.pgBadges.map((b, bi) => (
                <span
                  key={bi}
                  className={`badge ${b.tone === 'bad' ? 'badge-critical' : b.tone === 'warn' ? 'badge-high' : 'badge-info'}`}
                  style={{ fontSize: '9px', padding: '1px 5px', lineHeight: 1.2 }}
                  title={b.title || b.label}
                >
                  {b.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actual Timings line (PerformanceStudio NodeTimeAttribution) */}
        {hasTiming && (
          <div
            className="node-timing-stats"
            title={`Self Elapsed: ${ownElapsedSec.toFixed(3)}s (Cum: ${((node.actualElapsedMs || 0) / 1000).toFixed(3)}s) | Self CPU: ${ownCpuSec.toFixed(3)}s (Cum: ${((node.actualCpuMs || 0) / 1000).toFixed(3)}s)`}
          >
            <span style={{ color: elapsedColor, fontWeight: ownElapsedSec >= 0.1 ? 600 : 400 }}>
              ⏱️ {ownElapsedSec.toFixed(3)}s
            </span>
            <span style={{ color: cpuColor, fontWeight: ownCpuSec >= 0.1 ? 600 : 400 }}>
              🔥 {ownCpuSec.toFixed(3)}s
            </span>
          </div>
        )}
      </div>

      {/* Children Nodes */}
      {node.children && node.children.length > 0 && (
        <div className={`node-children-container ${isHorizontal ? 'node-children-container-horizontal' : ''}`}>
          {node.children.map((child) => (
            <div key={child.nodeId} className={`child-branch ${isHorizontal ? 'child-branch-horizontal' : ''}`}>
              {!isHorizontal && (() => {
                const rows = child.hasActualRows ? child.actualRows : child.estimateRows;
                const thickness = Math.max(2, Math.min(14, 2 + Math.log10(Math.max(rows, 1)) * 1.8));
                const color = child.costPercentage > 40 ? '#f43f5e' : child.costPercentage > 15 ? '#f59e0b' : '#64748b';
                return (
                  <div
                    className="branch-line-v"
                    style={{ width: thickness, background: color }}
                    title={`${Math.round(rows).toLocaleString()} rows${child.hasActualRows ? ' (actual)' : ' (estimated)'}`}
                  >
                    <span className="branch-arrow-v" />
                  </div>
                );
              })()}
              <TreeNode
                node={child}
                selectedNode={selectedNode}
                onSelectNode={onSelectNode}
                orientation={orientation}
                heatmapMetric={heatmapMetric}
                onOpenSkewModal={onOpenSkewModal}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
