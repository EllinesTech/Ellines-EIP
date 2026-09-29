'use client';

/**
 * FreshnessIndicator — Shows how fresh a widget's data is.
 *
 * `computeFreshnessLabel` is a pure, exported function — no side effects.
 * The component polls every 5 s to keep the label current.
 *
 * Labels (Req 5.1):
 *   LIVE              → age ≤ 5 s
 *   Updated N seconds → 5–59 s
 *   Updated N minutes → 1–59 min
 *   Cached — N min    → ≥ 60 min
 *   Snapshot / Historical → override
 *   Unavailable       → errorState set OR source unreachable
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import React, { useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FreshnessLabel =
  | 'LIVE'
  | `Updated ${number} seconds ago`
  | `Updated ${number} minutes ago`
  | `Cached — ${number} minutes old`
  | 'Snapshot'
  | 'Historical'
  | 'Unavailable';

interface FreshnessIndicatorProps {
  lastFetchedAt: Date | null;
  errorState: string | null;
  /** Overrides computed label — for SNAPSHOT or HISTORICAL widget types. */
  labelOverride?: 'Snapshot' | 'Historical';
}

// ─── Pure label computation ───────────────────────────────────────────────────

/**
 * Pure function — no side effects, no randomness.
 * Same inputs always produce the same FreshnessLabel.
 * Exported for independent property testing.
 */
export function computeFreshnessLabel(
  lastFetchedAt: Date | null,
  errorState: string | null,
  now: Date,
  labelOverride?: string,
): FreshnessLabel {
  // Error state always wins
  if (errorState !== null && errorState !== '') {
    return 'Unavailable';
  }

  // Override wins over age computation
  if (labelOverride === 'Snapshot') return 'Snapshot';
  if (labelOverride === 'Historical') return 'Historical';

  if (lastFetchedAt === null) return 'Unavailable';

  const ageMs = now.getTime() - lastFetchedAt.getTime();

  // Req 5.4: never show LIVE if age > 10 s server time
  if (ageMs < 0) return 'Unavailable'; // future timestamp — reject

  const ageSeconds = Math.floor(ageMs / 1000);

  if (ageSeconds <= 5) return 'LIVE';
  if (ageSeconds < 60) return `Updated ${ageSeconds} seconds ago`;

  const ageMinutes = Math.floor(ageSeconds / 60);
  if (ageMinutes < 60) return `Updated ${ageMinutes} minutes ago`;

  return `Cached — ${ageMinutes} minutes old`;
}

// ─── Style variant mapping ────────────────────────────────────────────────────

function labelVariant(label: FreshnessLabel): string {
  if (label === 'LIVE') return 'live';
  if (label.startsWith('Updated')) return 'updated';
  if (label.startsWith('Cached')) return 'cached';
  if (label === 'Unavailable') return 'unavailable';
  return 'neutral';
}

// ─── Component ────────────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<string, React.CSSProperties> = {
  live: { color: '#22C55E', fontWeight: 600 },
  updated: { color: '#F1F5F9' },
  cached: { color: 'rgba(241,245,249,0.60)' },
  unavailable: { color: '#EF4444' },
  neutral: { color: 'rgba(241,245,249,0.60)' },
};

export function FreshnessIndicator({ lastFetchedAt, errorState, labelOverride }: FreshnessIndicatorProps) {
  const [label, setLabel] = useState<FreshnessLabel>(() =>
    computeFreshnessLabel(lastFetchedAt, errorState, new Date(), labelOverride),
  );

  // Re-evaluate every 5 s (cleared on unmount per Req 5.5)
  useEffect(() => {
    const tick = () =>
      setLabel(computeFreshnessLabel(lastFetchedAt, errorState, new Date(), labelOverride));
    tick();
    const id = setInterval(tick, 5_000);
    return () => clearInterval(id);
  }, [lastFetchedAt, errorState, labelOverride]);

  const variant = labelVariant(label);
  const variantStyle = VARIANT_STYLES[variant] ?? VARIANT_STYLES.neutral;

  return (
    <span
      aria-label={label}
      aria-live="polite"
      style={{
        fontSize: 'var(--font-l5-size)',
        fontWeight: 'var(--font-l5-weight)' as React.CSSProperties['fontWeight'],
        ...variantStyle,
      }}
    >
      {label}
    </span>
  );
}
