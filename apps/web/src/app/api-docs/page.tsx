'use client';

import { useEffect } from 'react';

/**
 * API Documentation Page (B.3.3)
 * 
 * Redirects to the Swagger UI hosted by the Identity service.
 * In production, this would be served via the same origin.
 */
export default function ApiDocsPage() {
  useEffect(() => {
    // Redirect to Swagger UI
    const identityUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    window.location.href = `${identityUrl}/api/docs`;
  }, []);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: '#0f172a',
      color: '#cbd5e1',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Redirecting to API Documentation...</h1>
        <p style={{ color: '#64748b' }}>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/docs`}
            style={{ color: '#6F2D8D', textDecoration: 'underline' }}
          >
            Click here if not redirected automatically
          </a>
        </p>
      </div>
    </div>
  );
}
