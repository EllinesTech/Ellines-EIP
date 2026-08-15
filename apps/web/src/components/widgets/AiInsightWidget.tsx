'use client';

import type { WidgetProps, AiInsight } from './widget.types';

const MUTED = '#8b95a8';
const BRAND = '#6F2D8D';

function defaultInsights(): AiInsight[] {
  return [
    {
      id: '1',
      title: 'Revenue at Risk',
      body: 'Collections have slowed 12% over 3 weeks. Ellinea AI recommends an automated AR follow-up campaign for 47 overdue accounts.',
      confidence: 91,
      category: 'Finance',
      actions: ['Run AR Campaign', 'View Accounts'],
      timestamp: '2026-08-01T08:00:00Z',
    },
    {
      id: '2',
      title: 'Workforce Insight',
      body: 'Absenteeism peaked Tuesday–Wednesday. Pattern aligns with a recurring team meeting block. Consider rescheduling.',
      confidence: 76,
      category: 'People',
      actions: ['View Schedule'],
      timestamp: '2026-08-01T07:30:00Z',
    },
  ];
}

function ConfidenceBadge({ score }: { score: number }) {
  const color = score >= 85 ? '#10b981' : score >= 65 ? '#f59e0b' : '#ef4444';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 10,
        fontWeight: 700,
        color,
        background: `${color}1a`,
        border: `1px solid ${color}44`,
        borderRadius: 10,
        padding: '1px 6px',
      }}
      title={`AI confidence: ${score}%`}
      aria-label={`Confidence ${score}%`}
    >
      <svg width={7} height={7} viewBox="0 0 7 7" fill={color} aria-hidden>
        <circle cx={3.5} cy={3.5} r={3.5} />
      </svg>
      {score}%
    </div>
  );
}

/**
 * AI Insight widget — Ellinea AI recommendation cards with confidence badges.
 *
 * Config keys:
 *   insights — [{id, title, body, confidence, category?, actions?, timestamp?}]
 */
export default function AiInsightWidget({ config = {}, onDrillDown, height = 180 }: WidgetProps) {
  const insights =
    Array.isArray(config.insights) && config.insights.length > 0
      ? (config.insights as AiInsight[])
      : defaultInsights();

  return (
    <div style={{ height, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="AI insights">
      {insights.map((insight) => (
        <div
          key={insight.id}
          style={{
            background: 'rgba(111,45,141,0.08)',
            border: '1px solid rgba(111,45,141,0.25)',
            borderLeft: `3px solid ${BRAND}`,
            borderRadius: 8,
            padding: '8px 10px',
            cursor: onDrillDown ? 'pointer' : undefined,
          }}
          onClick={() => onDrillDown?.(insight)}
          role={onDrillDown ? 'button' : undefined}
          tabIndex={onDrillDown ? 0 : undefined}
          onKeyDown={onDrillDown ? (e) => e.key === 'Enter' && onDrillDown(insight) : undefined}
          aria-label={`AI insight: ${insight.title}`}
        >
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f4f7fb', flex: 1 }}>{insight.title}</div>
            <ConfidenceBadge score={insight.confidence} />
            {insight.category ? (
              <span style={{ fontSize: 10, color: MUTED, background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 8 }}>
                {insight.category}
              </span>
            ) : null}
          </div>

          {/* Body */}
          <div style={{ fontSize: 11.5, color: '#c8d0dc', lineHeight: 1.5 }}>{insight.body}</div>

          {/* Actions */}
          {insight.actions && insight.actions.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {insight.actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: BRAND,
                    background: 'rgba(111,45,141,0.15)',
                    border: '1px solid rgba(111,45,141,0.35)',
                    borderRadius: 6,
                    padding: '2px 8px',
                    cursor: 'pointer',
                  }}
                  onClick={(e) => { e.stopPropagation(); onDrillDown?.({ insight, action }); }}
                >
                  {action}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
