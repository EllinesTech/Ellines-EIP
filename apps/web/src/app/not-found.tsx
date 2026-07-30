export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#0b0e14',
        color: '#8b95a8',
        fontFamily: "'Exo 2', system-ui, sans-serif",
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div>
        <h1 style={{ color: '#fff', marginBottom: '0.5rem' }}>Page not found</h1>
        <p style={{ margin: '0 0 1.25rem' }}>That route is not part of Ellines EIP.</p>
        <a href="/app/" style={{ color: '#a78bfa', fontWeight: 700 }}>
          Back to Overview →
        </a>
      </div>
    </main>
  );
}
