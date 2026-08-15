'use client';

import type { WidgetProps, NetworkNode, NetworkEdge } from './widget.types';

const BLUE = '#3b82f6';
const GREEN = '#10b981';
const AMBER = '#f59e0b';
const RED = '#ef4444';
const MUTED = '#8b95a8';

function nodeColor(status?: NetworkNode['status']): string {
  if (status === 'ok') return GREEN;
  if (status === 'warn') return AMBER;
  if (status === 'error') return RED;
  return BLUE;
}

function defaultNodes(): NetworkNode[] {
  return [
    { id: 'erp', label: 'ERP', status: 'ok' },
    { id: 'crm', label: 'CRM', status: 'ok' },
    { id: 'hrms', label: 'HRMS', status: 'warn' },
    { id: 'eip', label: 'EIP', type: 'hub' },
    { id: 'ai', label: 'Ellinea AI', status: 'ok' },
    { id: 'db', label: 'Database', status: 'ok' },
  ];
}

function defaultEdges(): NetworkEdge[] {
  return [
    { from: 'erp', to: 'eip' },
    { from: 'crm', to: 'eip' },
    { from: 'hrms', to: 'eip' },
    { from: 'eip', to: 'ai' },
    { from: 'eip', to: 'db' },
  ];
}

/**
 * Network Graph widget — nodes and edges rendered as SVG.
 *
 * Config keys:
 *   nodes — [{id, label, type?, status?}]
 *   edges — [{from, to, label?, weight?}]
 */
export default function NetworkGraphWidget({ config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const nodes =
    Array.isArray(config.nodes) && config.nodes.length > 0
      ? (config.nodes as NetworkNode[])
      : defaultNodes();

  const edges =
    Array.isArray(config.edges) && config.edges.length > 0
      ? (config.edges as NetworkEdge[])
      : defaultEdges();

  // Simple force-directed layout approximation using circular positioning
  const cx = 140;
  const cy = height / 2;
  const radius = Math.min(cx, cy) * 0.72;
  const angleStep = (2 * Math.PI) / nodes.length;

  const nodePositions = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => {
    const angle = i * angleStep - Math.PI / 2;
    nodePositions.set(n.id, {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  });

  const svgWidth = cx * 2;

  return (
    <div style={{ height, overflow: 'hidden' }} aria-label="Network graph">
      <svg width={svgWidth} height={height} viewBox={`0 0 ${svgWidth} ${height}`} style={{ width: '100%', height: '100%' }}>
        {/* Edges */}
        {edges.map((edge, i) => {
          const from = nodePositions.get(edge.from);
          const to = nodePositions.get(edge.to);
          if (!from || !to) return null;
          return (
            <line
              key={`edge-${i}`}
              x1={from.x} y1={from.y}
              x2={to.x} y2={to.y}
              stroke={MUTED}
              strokeWidth={1.5}
              strokeOpacity={0.4}
              strokeDasharray={edge.weight !== undefined && edge.weight < 0.5 ? '4 3' : undefined}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = nodePositions.get(node.id);
          if (!pos) return null;
          const color = nodeColor(node.status);
          const isHub = node.type === 'hub';
          const r = isHub ? 18 : 14;

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x},${pos.y})`}
              onClick={() => onDrillDown?.(node)}
              style={{ cursor: onDrillDown ? 'pointer' : undefined }}
              role={onDrillDown ? 'button' : undefined}
              tabIndex={onDrillDown ? 0 : undefined}
              aria-label={`Node: ${node.label}`}
            >
              <circle r={r} fill={`${color}22`} stroke={color} strokeWidth={isHub ? 2.5 : 1.5} />
              <text
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#f4f7fb"
                fontSize={isHub ? 9 : 8}
                fontWeight={600}
              >
                {node.label.length > 6 ? node.label.slice(0, 5) + '…' : node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
