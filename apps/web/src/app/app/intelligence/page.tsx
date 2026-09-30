'use client';
import Link from 'next/link';
export default function IntelligencePage() {
  const modules = [
    { href: '/app/intelligence/ellinea', label: 'Ellinea AI', desc: 'AI-powered enterprise assistant.', available: true },
    { href: '/app/intelligence/insights', label: 'Insights', desc: 'AI-generated insights from connected data.', available: false },
    { href: '/app/intelligence/recommendations', label: 'Recommendations', desc: 'AI recommendations for your team.', available: false },
  ];
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem', fontFamily: "'Exo 2', system-ui, sans-serif", color: '#f4f7fb' }}>
      <p style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8b5cf6', margin: '0 0 0.4rem' }}>Intelligence</p>
      <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.6rem', fontWeight: 800 }}>Intelligence</h1>
      <p style={{ margin: '0 0 1.5rem', color: '#8b95a8' }}>Ellinea AI and enterprise intelligence modules.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
        {modules.map((m) => (
          <div key={m.href} style={{ background: '#161b26', border: `1px solid ${m.available ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 12, padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: 6, opacity: m.available ? 1 : 0.6 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f4f7fb', display: 'flex', alignItems: 'center', gap: 8 }}>
              {m.label}
              {!m.available && <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.07)', color: '#8b95a8', fontWeight: 600 }}>Planned</span>}
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#8b95a8', lineHeight: 1.4 }}>{m.desc}</p>
            {m.available && <Link href={m.href} style={{ marginTop: 4, fontSize: '0.78rem', color: '#8b5cf6', fontWeight: 600, textDecoration: 'none' }}>Open →</Link>}
          </div>
        ))}
      </div>
    </div>
  );
}
