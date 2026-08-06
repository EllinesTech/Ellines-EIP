export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <html lang="en">
      <body style={{ background: '#0b0e14', color: '#8b95a8', fontFamily: 'system-ui', margin: 0, padding: 0 }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ color: '#fff', margin: '0 0 0.5rem' }}>404</h1>
            <p>Page not found</p>
          </div>
        </div>
      </body>
    </html>
  );
}
