'use client';

/**
 * DashboardWidgetShell — Task 18.1
 *
 * Card chrome shared by all dashboard widgets.
 * Exposes a `.widget-drag-handle` so react-grid-layout can detect drags.
 */

import type { ReactNode } from 'react';

export interface DashboardWidgetShellProps {
  title?: string;
  children: ReactNode;
  /** Extra inline style for the outer card element */
  style?: React.CSSProperties;
  className?: string;
}

export function DashboardWidgetShell({
  title,
  children,
  style,
  className,
}: DashboardWidgetShellProps) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--theme-surface, var(--eip-panel, #161b26))',
        border: '1px solid var(--theme-border, rgba(255,255,255,0.1))',
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        ...style,
      }}
    >
      {/* Drag handle — react-grid-layout uses `.widget-drag-handle` */}
      <div
        className="widget-drag-handle"
        style={{
          padding: '0.4rem 0.75rem',
          fontSize: '0.78rem',
          fontWeight: 600,
          color: 'var(--theme-text, var(--eip-soft, #b8c0d0))',
          background: 'rgba(255,255,255,0.04)',
          borderBottom: '1px solid var(--theme-border, rgba(255,255,255,0.08))',
          cursor: 'grab',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        aria-label={title ? `Drag widget: ${title}` : 'Drag widget'}
      >
        {title ?? 'Widget'}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', padding: '0.5rem' }}>
        {children}
      </div>
    </div>
  );
}
