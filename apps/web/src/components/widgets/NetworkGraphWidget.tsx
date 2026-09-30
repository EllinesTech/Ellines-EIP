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

/**
 * Network Graph widget — nodes and edges rendered as SVG.
 *
 * Config keys:
 *   nodes — [{id, label, type?, status?}]
 *   edges — [{from, to, label?, weight?}]
 *
 * There are deliberately NO default nodes or edges. Without configured data
 * this used to draw an invented "ERP / CRM / HRMS / Database" topology with
 * invented health statuses, which a tenant would reasonably read as its own
 * connected systems. It now renders an explicit empty state instead.
 */
export default function NetworkGraphWidget({ config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const nodes = Array.isArray(config.nodes) && config.nodes.length > 0 ? (config.nodes as NetworkNode[]) : [];
  const edges = Array.isArray(config.edges) && config.edges.length > 0 ? (config.edges as NetworkEdge[]) : [];

  // No topology configured — say so rather than inventing one.
  if (nodes.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6,
          color: MUTED,
          fontSize: '0.8rem',
          textAlign: 'center',
          padding: '0 1rem',
        }}
      >
        No systems configured. Add nodes and edges to this widget&apos;s configuration to
        display your integration topology here.
      </div>
    );
  }

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
