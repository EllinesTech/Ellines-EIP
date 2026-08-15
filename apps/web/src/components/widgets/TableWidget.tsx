'use client';

import { useState } from 'react';
import type { WidgetProps } from './widget.types';

const MUTED = '#8b95a8';

interface Column {
  key: string;
  label: string;
  width?: string;
}

function syntheticRows() {
  return [
    { label: 'Revenue', value: '94,200', change: '+12%' },
    { label: 'Users', value: '3,841', change: '+5%' },
    { label: 'Errors', value: '17', change: '−3%' },
    { label: 'Uptime', value: '99.97%', change: '+0.1%' },
    { label: 'Latency', value: '84ms', change: '−8%' },
  ];
}

/**
 * Table widget — sortable HTML table.
 *
 * Config keys:
 *   columns — [{key, label, width?}]
 *   rows    — [{[key]: value}]
 */
export default function TableWidget({ config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const hasExplicitCols = Array.isArray(config.columns) && config.columns.length > 0;
  const hasExplicitRows = Array.isArray(config.rows) && config.rows.length > 0;

  const columns: Column[] = hasExplicitCols
    ? (config.columns as Column[])
    : [
        { key: 'label', label: 'Label' },
        { key: 'value', label: 'Value' },
        { key: 'change', label: 'Change' },
      ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are generic config-level records
  const rawRows: Record<string, any>[] = hasExplicitRows
    ? (config.rows as Record<string, unknown>[]).map(r => r as Record<string, unknown>)
    : syntheticRows();

  const sortedRows = sortKey
    ? [...rawRows].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
        return sortAsc ? cmp : -cmp;
      })
    : rawRows;

  function toggleSort(key: string) {
    if (sortKey === key) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(true); }
  }

  return (
    <div style={{ height, overflow: 'auto' }} aria-label="Data table">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '4px 6px',
                  fontWeight: 600,
                  color: MUTED,
                  textAlign: 'left',
                  width: col.width,
                  cursor: 'pointer',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                  position: 'sticky',
                  top: 0,
                  background: '#0f172a',
                }}
                onClick={() => toggleSort(col.key)}
                aria-sort={sortKey === col.key ? (sortAsc ? 'ascending' : 'descending') : 'none'}
              >
                {col.label}
                {sortKey === col.key ? (sortAsc ? ' ▲' : ' ▼') : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, ri) => (
            <tr
              key={ri}
              style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                cursor: onDrillDown ? 'pointer' : undefined,
              }}
              onClick={() => onDrillDown?.(row)}
            >
              {columns.map((col) => (
                <td key={col.key} style={{ padding: '5px 6px', color: col.key === columns[0].key ? '#c8d0dc' : '#f4f7fb', fontWeight: col.key !== columns[0].key ? 600 : undefined }}>
                  {String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
