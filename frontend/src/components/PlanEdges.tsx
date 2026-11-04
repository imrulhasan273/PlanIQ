import React, { useLayoutEffect, useRef, useState } from 'react';
import { PlanNode } from '../types/plan';

interface EdgeGeom {
  key: string;
  d: string;
  width: number;
  color: string;
  title: string;
}

interface Props {
  root: PlanNode;
  orientation: 'vertical' | 'horizontal';
  zoom: number;
  children: React.ReactNode;
  selectedNodeId?: number;
}

/**
 * Wraps a rendered plan tree and overlays SVG connectors that physically join each
 * child operator to its parent (arrow points in the direction of data flow, and the
 * line width scales with the row count, like SSMS / PerformanceStudio).
 */
export const PlanEdges: React.FC<Props> = ({ root, orientation, zoom, children, selectedNodeId }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<EdgeGeom[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const compute = () => {
      const wr = wrap.getBoundingClientRect();
      const z = zoom || 1;
      const boxes = new Map<number, DOMRect>();
      wrap.querySelectorAll<HTMLElement>('[data-node-id]').forEach((el) => {
        boxes.set(Number(el.dataset.nodeId), el.getBoundingClientRect());
      });
      const out: EdgeGeom[] = [];
      const walk = (n: PlanNode) => {
        const pr = boxes.get(n.nodeId);
        (n.children || []).forEach((c) => {
          const cr = boxes.get(c.nodeId);
          if (pr && cr) {
            const rows = c.hasActualRows ? c.actualRows : c.estimateRows;
            const width = Math.max(2, Math.min(14, 2 + Math.log10(Math.max(rows, 1)) * 1.8));
            const color = c.costPercentage > 40 ? '#f43f5e' : c.costPercentage > 15 ? '#f59e0b' : '#64748b';
            let d: string;
            if (orientation === 'horizontal') {
              const px = (pr.right - wr.left) / z;
              const py = (pr.top + pr.height / 2 - wr.top) / z;
              const cx = (cr.left - wr.left) / z;
              const cy = (cr.top + cr.height / 2 - wr.top) / z;
              const mx = (cx + px) / 2;
              d = `M ${cx} ${cy} C ${mx} ${cy}, ${mx} ${py}, ${px + 4} ${py}`;
            } else {
              const px = (pr.left + pr.width / 2 - wr.left) / z;
              const py = (pr.bottom - wr.top) / z;
              const cx = (cr.left + cr.width / 2 - wr.left) / z;
              const cy = (cr.top - wr.top) / z;
              const my = (cy + py) / 2;
              d = `M ${cx} ${cy} C ${cx} ${my}, ${px} ${my}, ${px} ${py + 4}`;
            }
            out.push({
              key: `${n.nodeId}-${c.nodeId}`,
              d,
              width,
              color,
              title: `${Math.round(rows).toLocaleString()} rows${c.hasActualRows ? ' (actual)' : ' (estimated)'}: Node ${c.nodeId} \u2192 Node ${n.nodeId}`,
            });
          }
          walk(c);
        });
      };
      walk(root);
      setEdges(out);
      setSize({ w: wrap.scrollWidth, h: wrap.scrollHeight });
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(wrap);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [root, orientation, zoom, selectedNodeId]);

  return (
    <div
      ref={wrapRef}
      className={`tree-wrapper ${orientation === 'horizontal' ? 'tree-layout-horizontal' : ''}`}
      style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', position: 'relative' }}
    >
      {children}
      <svg
        className="plan-edges-svg"
        width={size.w}
        height={size.h}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 0 }}
      >
        {edges.map((e) => (
          <g key={e.key} style={{ pointerEvents: 'stroke' }}>
            <title>{e.title}</title>
            <path d={e.d} fill="none" stroke={e.color} strokeWidth={e.width} strokeOpacity={0.75} strokeLinecap="butt" />
          </g>
        ))}
        {edges.map((e) => {
          // arrowhead at the parent end, drawn separately so its size is independent of line width
          const m = e.d.match(/(-?[\d.]+) (-?[\d.]+)$/);
          if (!m) return null;
          const x = parseFloat(m[1]);
          const y = parseFloat(m[2]);
          const s = Math.max(5, e.width * 0.9 + 3);
          const pts =
            orientation === 'horizontal'
              ? `${x},${y} ${x + s * 1.6},${y - s} ${x + s * 1.6},${y + s}`
              : `${x},${y} ${x - s},${y + s * 1.6} ${x + s},${y + s * 1.6}`;
          return <polygon key={`a${e.key}`} points={pts} fill={e.color} fillOpacity={0.9} />;
        })}
      </svg>
    </div>
  );
};
