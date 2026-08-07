'use client';

import { useState, useCallback } from 'react';
import styles from '../../command.module.css';
import adminStyles from '../../admin/admin.module.css';
import type { DashboardDto, WidgetDto } from '@/lib/api';
import WidgetRenderer from '@/components/dashboard/WidgetRenderer';

interface WidgetPaletteItem {
  type: string;
  label: string;
  icon: string;
  defaultSize: { w: number; h: number };
  description: string;
}

const WIDGET_PALETTE: WidgetPaletteItem[] = [
  {
    type: 'kpi',
    label: 'KPI',
    icon: 'KPI',
    defaultSize: { w: 2, h: 1 },
    description: 'Single value with sparkline',
  },
  {
    type: 'gauge',
    label: 'Gauge',
    icon: '◎',
    defaultSize: { w: 2, h: 2 },
    description: 'Circular progress indicator',
  },
  {
    type: 'line',
    label: 'Line',
    icon: '/',
    defaultSize: { w: 3, h: 2 },
    description: 'Trend line / area chart',
  },
  {
    type: 'bar',
    label: 'Bar',
    icon: '▮',
    defaultSize: { w: 3, h: 2 },
    description: 'Category comparison bars',
  },
  {
    type: 'pie',
    label: 'Pie',
    icon: '◯',
    defaultSize: { w: 2, h: 2 },
    description: 'Distribution donut',
  },
  {
    type: 'heatmap',
    label: 'Heatmap',
    icon: '▦',
    defaultSize: { w: 3, h: 2 },
    description: 'Intensity grid by day',
  },
  {
    type: 'table',
    label: 'Table',
    icon: '▤',
    defaultSize: { w: 4, h: 3 },
    description: 'Tabular data view',
  },
];

const GRID_SIZE = 96; // pixels per grid unit (charts need room to render)
const MIN_SIZE = { w: 1, h: 1 };
const MAX_SIZE = { w: 6, h: 4 };

interface CanvasWidgetProps {
  widget: WidgetDto;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onResize: (id: string, size: { w: number; h: number }) => void;
  onDragStart: (e: React.MouseEvent, id: string) => void;
  onDragEnd: () => void;
}

function CanvasWidget({ widget, isSelected, onSelect, onResize, onDragStart, onDragEnd }: CanvasWidgetProps) {
  const size = (widget.size as { w?: number; h?: number }) || { w: 2, h: 2 };
  const col = typeof widget.position === 'number' ? widget.position % 4 : 0;
  const row = typeof widget.position === 'number' ? Math.floor(widget.position / 4) : 0;
  const left = col * (GRID_SIZE + 12);
  const top = row * (GRID_SIZE + 12);
  const width = (size.w ?? 2) * GRID_SIZE;
  const height = (size.h ?? 2) * GRID_SIZE;

  const handleResizeStart = (corner: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = width;
    const startHeight = height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      let newW = size.w ?? 2;
      let newH = size.h ?? 2;

      if (corner.includes('e')) {
        newW = Math.round((startWidth + deltaX) / GRID_SIZE);
      }
      if (corner.includes('s')) {
        newH = Math.round((startHeight + deltaY) / GRID_SIZE);
      }

      newW = Math.max(MIN_SIZE.w, Math.min(newW, MAX_SIZE.w));
      newH = Math.max(MIN_SIZE.h, Math.min(newH, MAX_SIZE.h));

      if (newW !== (size.w ?? 2) || newH !== (size.h ?? 2)) {
        onResize(widget.id, { w: newW, h: newH });
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      onDragEnd();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        background: isSelected ? 'rgba(37, 99, 235, 0.08)' : '#161b26',
        border: isSelected ? '2px solid #2563EB' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: '0.65rem',
        cursor: 'move',
        display: 'flex',
        flexDirection: 'column',
        transition: isSelected ? 'border-color 0.2s' : 'all 0.2s',
        overflow: 'hidden',
      }}
      onMouseDown={(e) => {
        onSelect(widget.id);
        onDragStart(e, widget.id);
      }}
      onClick={() => onSelect(widget.id)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '0.3rem', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8b95a8' }}>
            {widget.type}
          </div>
          <div style={{ fontWeight: 700, color: '#f4f7fb', marginTop: '0.2rem', fontSize: '0.85rem' }}>{widget.title}</div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, marginTop: 4, pointerEvents: 'none' }}>
        <WidgetRenderer widget={widget} />
      </div>

      {/* Resize handles */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: '20px',
          height: '20px',
          cursor: 'nwse-resize',
          background: 'linear-gradient(135deg, transparent 50%, #3b82f6 50%)',
          borderRadius: '0 0 10px 0',
        }}
        onMouseDown={handleResizeStart('se')}
        title="Drag to resize"
      />
    </div>
  );
}

interface DashboardBuilderProps {
  dashboard: DashboardDto;
  onWidgetAdd: (type: string, title: string, size?: { w: number; h: number }) => Promise<WidgetDto>;
  onWidgetUpdate: (widget: WidgetDto, patch: Partial<WidgetDto>) => void;
  onWidgetDelete: (widgetId: string) => void;
  busy: boolean;
}

export default function DashboardBuilder({
  dashboard,
  onWidgetAdd,
  onWidgetUpdate,
  onWidgetDelete,
  busy,
}: DashboardBuilderProps) {
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [draggingWidget, setDraggingWidget] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showPalette, setShowPalette] = useState(false);
  const [addingWidget, setAddingWidget] = useState<WidgetPaletteItem | null>(null);
  const [newWidgetTitle, setNewWidgetTitle] = useState('');

  const canvasHeight = 720;
  const canvasWidth = 1200;

  const handleDragStart = useCallback((e: React.MouseEvent, widgetId: string) => {
    setDraggingWidget(widgetId);
    setDragOffset({
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingWidget(null);
  }, []);

  const handleAddWidget = useCallback(
    async (item: WidgetPaletteItem) => {
      setAddingWidget(item);
      setNewWidgetTitle(`${item.label} - New`);
    },
    []
  );

  const handleConfirmAdd = useCallback(
    async (item: WidgetPaletteItem) => {
      if (!newWidgetTitle.trim()) return;
      try {
        await onWidgetAdd(item.type, newWidgetTitle, item.defaultSize);
        setAddingWidget(null);
        setNewWidgetTitle('');
      } catch (err) {
        console.error('Failed to add widget:', err);
      }
    },
    [newWidgetTitle, onWidgetAdd]
  );

  const selectedWidgetData = dashboard.widgets?.find((w) => w.id === selectedWidget);

  return (
    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.65rem' }}>
      {/* Canvas */}
      <div style={{ flex: 1 }}>
        <div className={styles.panelLabel}>Canvas</div>
        <div
          style={{
            background: '#0a0d12',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            position: 'relative',
            height: `${canvasHeight}px`,
            width: '100%',
            overflow: 'auto',
            cursor: showPalette ? 'default' : 'grab',
          }}
        >
          {(dashboard.widgets || []).map((w) => (
            <CanvasWidget
              key={w.id}
              widget={w}
              isSelected={w.id === selectedWidget}
              onSelect={setSelectedWidget}
              onResize={(id, size) => onWidgetUpdate(w, { size })}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          ))}
          {!dashboard.widgets?.length && (
            <div style={{ textAlign: 'center', padding: '1rem', color: '#8b95a8' }}>
              <p className={styles.lede}>Drag widgets from the palette to begin building.</p>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar: Widget Palette + Properties */}
      <div style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Widget Palette */}
        <div className={styles.brief}>
          <div className={styles.panelLabel}>Add widget</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {WIDGET_PALETTE.map((item) => (
              <button
                key={item.type}
                type="button"
                className={adminStyles.ghost}
                disabled={busy}
                onClick={() => handleAddWidget(item)}
                title={item.description}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.5rem',
                  fontSize: '0.85rem',
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Selected Widget Properties */}
        {selectedWidgetData ? (
          <div className={styles.brief}>
            <div className={styles.panelLabel}>Properties</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#8b95a8', textTransform: 'uppercase' }}>Type</label>
                <div style={{ color: '#f4f7fb', textTransform: 'capitalize', fontWeight: 600 }}>
                  {selectedWidgetData.type}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#8b95a8', textTransform: 'uppercase' }}>Title</label>
                <input
                  type="text"
                  value={selectedWidgetData.title}
                  onChange={(e) => onWidgetUpdate(selectedWidgetData, { title: e.target.value })}
                  style={{
                    background: '#161b26',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#f4f7fb',
                    padding: '0.35rem 0.5rem',
                    borderRadius: 6,
                    fontSize: '0.85rem',
                    width: '100%',
                    marginTop: '0.2rem',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#8b95a8', textTransform: 'uppercase' }}>Size</label>
                <div
                  style={{
                    color: '#f4f7fb',
                    fontSize: '0.8rem',
                    marginTop: '0.2rem',
                  }}
                >
                  {(selectedWidgetData.size as any)?.w ?? 2}×{(selectedWidgetData.size as any)?.h ?? 2}
                </div>
              </div>
              <button
                type="button"
                className={adminStyles.ghost}
                disabled={busy}
                onClick={() => onWidgetDelete(selectedWidgetData.id)}
                style={{ marginTop: '0.5rem' }}
              >
                Delete widget
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.brief} style={{ color: '#8b95a8', textAlign: 'center', padding: '1rem' }}>
            <p className={styles.lede}>Select a widget to edit properties</p>
          </div>
        )}
      </div>

      {/* Add Widget Modal */}
      {addingWidget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setAddingWidget(null)}
        >
          <div
            className={styles.brief}
            style={{ width: '100%', maxWidth: '400px', margin: '1rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.panelLabel}>
              Add {addingWidget.label}
            </div>
            <form
              className={adminStyles.form}
              onSubmit={(e) => {
                e.preventDefault();
                handleConfirmAdd(addingWidget);
              }}
            >
              <label>
                Widget title
                <input
                  type="text"
                  value={newWidgetTitle}
                  onChange={(e) => setNewWidgetTitle(e.target.value)}
                  required
                  minLength={2}
                  autoFocus
                />
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className={adminStyles.primary} disabled={busy}>
                  {busy ? 'Adding…' : 'Add widget'}
                </button>
                <button
                  type="button"
                  className={adminStyles.ghost}
                  disabled={busy}
                  onClick={() => setAddingWidget(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
