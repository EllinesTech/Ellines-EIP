'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
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
        <h1 style={{ color: '#ff6b6b', marginBottom: '0.5rem' }}>Something went wrong</h1>
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.95rem' }}>
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={reset}
          style={{
            padding: '0.5rem 1.5rem',
            background: '#6f2d8d',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.95rem',
          }}
        >
          Try again
        </button>
      </div>
    </main>
  );
}
