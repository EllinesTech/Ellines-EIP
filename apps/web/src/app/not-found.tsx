export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: '#fff', margin: '0 0 0.5rem' }}>404</h1>
        <p>Page not found</p>
      </div>
    </div>
  );
}
