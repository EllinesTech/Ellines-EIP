'use client';

/**
 * PlannedPage — Honest "this feature is planned" placeholder.
 * Never shows fake data. Used for all reserved routes.
 */

import Link from 'next/link';

interface PlannedPageProps {
  section: string;
  title: string;
  description: string;
  note?: string;
  backHref?: string;
  backLabel?: string;
}

export function PlannedPage({ section, title, description, note, backHref = '/app', backLabel = '← Back' }: PlannedPageProps) {
  return (
    <div
      style={{
        maxWidth: 640,
        margin: '3rem auto',
        padding: '0 1.5rem',
        fontFamily: "'Exo 2', system-ui, sans-serif",
        color: '#f4f7fb',
      }}
    >
      <p style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8b5cf6', marginBottom: '0.5rem' }}>{section}</p>
      <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.6rem', fontWeight: 800 }}>{title}</h1>
      <p style={{ margin: '0 0 1.5rem', color: '#8b95a8', lineHeight: 1.55 }}>{description}</p>

      <div style={{ background: '#161b26', border: '1px dashed rgba(139,92,246,0.35)', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
        <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>🔖</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#f4f7fb', marginBottom: 4 }}>Planned feature</div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#8b95a8', lineHeight: 1.5 }}>
            {note ?? 'This capability is on the product roadmap. Connect a relevant system via the Integrations panel to unlock data for this module.'}
          </p>
        </div>
      </div>

      <Link
        href={backHref}
        style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.84rem', color: '#8b5cf6', textDecoration: 'none', fontWeight: 600 }}
      >
        {backLabel}
      </Link>
    </div>
  );
}
