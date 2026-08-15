'use client';

import type { WidgetProps, SankeyNode, SankeyLink } from './widget.types';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
const MUTED = '#8b95a8';

function defaultNodes(): SankeyNode[] {
  return [
    { id: 'erp', label: 'ERP' },
    { id: 'crm', label: 'CRM' },
    { id: 'eip', label: 'EIP Hub' },
    { id: 'reports', label: 'Reports' },
    { id: 'dashboard', label: 'Dashboard' },
  ];
}

function defaultLinks(): SankeyLink[] {
  return [
    { from: 'erp', to: 'eip', value: 300 },
    { from: 'crm', to: 'eip', value: 200 },
    { from: 'eip', to: 'reports', value: 250 },
    { from: 'eip', to: 'dashboard', value: 250 },
  ];
}

interface LayoutNode {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  height: number;
}

/**
 * Sankey widget — flow diagram showing source → target data flows.
 *
 * Config keys:
 *   sankeyNodes — [{id, label, color?}]
 *   sankeyLinks — [{from, to, value}]
 */
export default function SankeyWidget({ config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const nodes =
    Array.isArray(config.sankeyNodes) && config.sankeyNodes.length > 0
      ? (config.sankeyNodes as SankeyNode[])
      : defaultNodes();

  const links =
    Array.isArray(config.sankeyLinks) && config.sankeyLinks.length > 0
      ? (config.sankeyLinks as SankeyLink[])
      : defaultLinks();

  const svgWidth = 280;
  const svgHeight = height;
  const nodeWidth = 18;
  const pad = 14;

  // Identify source nodes (no incoming) and sink nodes (no outgoing)
  const hasIncoming = new Set(links.map((l) => l.to));
  const hasOutgoing = new Set(links.map((l) => l.from));

  const sourceNodes = nodes.filter((n) => !hasIncoming.has(n.id));
  const sinkNodes = nodes.filter((n) => !hasOutgoing.has(n.id));
  const midNodes = nodes.filter((n) => hasIncoming.has(n.id) && hasOutgoing.has(n.id));

  // Compute total flow per node
  const totalFlow = new Map<string, number>();
  links.forEach((l) => {
    totalFlow.set(l.from, (totalFlow.get(l.from) ?? 0) + l.value);
    totalFlow.set(l.to, (totalFlow.get(l.to) ?? 0) + l.value);
  });

  const maxFlow = Math.max(...Array.from(totalFlow.values()), 1);
  const availH = svgHeight - pad * 2;

  function layoutColumn(ns: SankeyNode[], xPos: number): LayoutNode[] {
    const total = ns.reduce((s, n) => s + (totalFlow.get(n.id) ?? 1), 0);
    let yOff = pad;
    return ns.map((n, i) => {
      const flow = totalFlow.get(n.id) ?? 1;
      const h = Math.max(10, (flow / total) * availH - 4);
      const node: LayoutNode = {
        id: n.id,
        label: n.label,
        color: n.color ?? COLORS[i % COLORS.length],
        x: xPos,
        y: yOff,
        height: h,
      };
      yOff += h + 4;
      return node;
    });
  }

  const colSpacing = (svgWidth - nodeWidth * 3 - pad * 2) / 2;
  const x0 = pad;
  const x1 = x0 + colSpacing + nodeWidth;
  const x2 = x1 + colSpacing + nodeWidth;

  const allLayout: LayoutNode[] = [
    ...layoutColumn(sourceNodes, x0),
    ...(midNodes.length > 0 ? layoutColumn(midNodes, x1) : []),
    ...layoutColumn(sinkNodes, midNodes.length > 0 ? x2 : x1),
  ];

  const layoutMap = new Map(allLayout.map((n) => [n.id, n]));

  // Track y-offsets for stacking flows on each node
  const fromYOffset = new Map<string, number>();
  const toYOffset = new Map<string, number>();

  return (
    <div style={{ height, overflow: 'hidden' }} aria-label="Sankey flow diagram">
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', height: '100%' }}>
        {/* Links */}
        {links.map((link, i) => {
          const fromNode = layoutMap.get(link.from);
          const toNode = layoutMap.get(link.to);
          if (!fromNode || !toNode) return null;

          const fromTotal = totalFlow.get(link.from) ?? 1;
          const toTotal = totalFlow.get(link.to) ?? 1;
          const flowH_from = (link.value / fromTotal) * fromNode.height;
          const flowH_to = (link.value / toTotal) * toNode.height;

          const yf = fromNode.y + (fromYOffset.get(link.from) ?? 0);
          const yt = toNode.y + (toYOffset.get(link.to) ?? 0);

          fromYOffset.set(link.from, (fromYOffset.get(link.from) ?? 0) + flowH_from);
          toYOffset.set(link.to, (toYOffset.get(link.to) ?? 0) + flowH_to);

          const x1 = fromNode.x + nodeWidth;
          const x2 = toNode.x;
          const cpx = (x1 + x2) / 2;

          const path = `M${x1},${yf} C${cpx},${yf} ${cpx},${yt} ${x2},${yt} L${x2},${yt + flowH_to} C${cpx},${yt + flowH_to} ${cpx},${yf + flowH_from} ${x1},${yf + flowH_from} Z`;

          return (
            <path
              key={`link-${i}`}
              d={path}
              fill={fromNode.color}
              fillOpacity={0.25}
              stroke={fromNode.color}
              strokeWidth={0.5}
              strokeOpacity={0.5}
              onClick={() => onDrillDown?.(link)}
              style={{ cursor: onDrillDown ? 'pointer' : undefined }}
            />
          );
        })}

        {/* Nodes */}
        {allLayout.map((node) => (
          <g
            key={node.id}
            onClick={() => onDrillDown?.(node)}
            style={{ cursor: onDrillDown ? 'pointer' : undefined }}
            role={onDrillDown ? 'button' : undefined}
            tabIndex={onDrillDown ? 0 : undefined}
            aria-label={`Flow node: ${node.label}`}
          >
            <rect
              x={node.x}
              y={node.y}
              width={nodeWidth}
              height={node.height}
              fill={node.color}
              rx={3}
            />
            {node.height > 20 ? (
              <text
                x={node.x + nodeWidth + 5}
                y={node.y + node.height / 2}
                dominantBaseline="middle"
                fill={MUTED}
                fontSize={9}
                fontWeight={600}
              >
                {node.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}
