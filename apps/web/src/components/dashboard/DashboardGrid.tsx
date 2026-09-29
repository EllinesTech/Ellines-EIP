'use client';

/**
 * DashboardGrid — Task 18.1
 *
 * Drag-and-drop grid layout for the dashboard builder.
 * Uses react-grid-layout when available; falls back to a CSS grid stub
 * at build time if the package is not yet installed (static export compat).
 *
 * Requirements 20.1: Drag-and-drop widget layout
 */

import { useEffect, useState, type ReactNode } from 'react';

// ─── Layout types (mirrors react-grid-layout Layout) ──────────────────────────

export interface GridItem {
  i: string;   // widget id
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  static?: boolean;
}

export interface DashboardGridProps {
  items: GridItem[];
  cols?: number;
  rowHeight?: number;
  onLayoutChange?: (layout: GridItem[]) => void;
  children: ReactNode[];
  readOnly?: boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function DashboardGrid({
  items,
  cols = 12,
  rowHeight = 80,
  onLayoutChange,
  children,
  readOnly = false,
}: DashboardGridProps) {
  const [RGL, setRGL] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  // Dynamically import react-grid-layout (client-only, may not be installed yet)
  useEffect(() => {
    setMounted(true);
    import('react-grid-layout')
      .then((mod) => {
        // v1.5 ships as default + named; handle both shapes
        setRGL(() => mod.default ?? mod.Responsive ?? mod);
      })
      .catch(() => {
        // react-grid-layout not installed — use CSS grid fallback
        setRGL(null);
      });
  }, []);

  // ── SSR / loading ──────────────────────────────────────────────────────────
  if (!mounted) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: '0.65rem',
        }}
        aria-label="Dashboard grid (loading)"
      >
        {children}
      </div>
    );
  }

  // ── react-grid-layout not available — CSS grid fallback ───────────────────
  if (!RGL) {
    return (
      <CssGridFallback cols={cols} items={items} rowHeight={rowHeight}>
        {children}
      </CssGridFallback>
    );
  }

  // ── react-grid-layout drag-and-drop grid ──────────────────────────────────
  const layout: any[] = items.map((item) => ({
    ...item,
    isDraggable: !readOnly && !item.static,
    isResizable: !readOnly && !item.static,
  }));

  function handleLayoutChange(newLayout: any[]) {
    if (!onLayoutChange) return;
    onLayoutChange(
      newLayout.map((l) => ({
        i: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        minW: l.minW,
        minH: l.minH,
        static: l.static,
      })),
    );
  }

  return (
    <div className="eip-dashboard-grid" style={{ width: '100%' }}>
      <RGL
        layout={layout}
        cols={cols}
        rowHeight={rowHeight}
        width={undefined}   // auto — controlled by parent width
        margin={[12, 12]}
        containerPadding={[0, 0]}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".widget-drag-handle"
        useCSSTransforms
        style={{ width: '100%' }}
      >
        {children}
      </RGL>
    </div>
  );
}

// ─── CSS grid fallback (no react-grid-layout installed) ───────────────────────

function CssGridFallback({
  cols,
  items,
  rowHeight,
  children,
}: {
  cols: number;
  items: GridItem[];
  rowHeight: number;
  children: ReactNode[];
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridAutoRows: `${rowHeight}px`,
        gap: '0.65rem',
      }}
      aria-label="Dashboard widget grid"
    >
      {(children as ReactNode[]).map((child, idx) => {
        const item = items[idx];
        if (!item) return child;
        return (
          <div
            key={item.i}
            style={{
              gridColumn: `span ${Math.min(item.w, cols)}`,
              gridRow: `span ${item.h}`,
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
