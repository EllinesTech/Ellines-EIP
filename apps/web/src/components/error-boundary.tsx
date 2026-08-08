'use client';

/**
 * Global error boundary (Q.3 — Error tracking)
 *
 * Catches React render errors, displays a branded fallback UI,
 * and logs structured error events to the console (and optionally
 * forwards to a server-side error capture endpoint).
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorId: string;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorId: '', message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    const errorId = Math.random().toString(36).slice(2, 10);
    return { hasError: true, errorId, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const errorId = this.state.errorId;
    // Structured console log — picked up by Cloudflare Pages log tail
    console.error(JSON.stringify({
      type: 'react_error_boundary',
      errorId,
      message: error.message,
      stack: error.stack?.slice(0, 500),
      componentStack: info.componentStack?.slice(0, 500),
      timestamp: new Date().toISOString(),
    }));

    // Fire-and-forget to error capture endpoint (logs on server side)
    if (typeof window !== 'undefined') {
      fetch('/api/v1/error-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorId,
          source: 'react_boundary',
          message: error.message,
          url: window.location.pathname,
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => { /* non-critical */ });
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0f172a', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif', padding: '2rem',
        }}>
          <div style={{ maxWidth: 480, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem', color: '#f4f7fb' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              An unexpected error occurred. If this keeps happening, please contact support.
            </p>
            <p style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#475569', marginBottom: '1.5rem' }}>
              Error ID: {this.state.errorId}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '0.5rem 1.5rem', borderRadius: 8, fontWeight: 700,
                background: 'rgba(111,45,141,0.8)', border: '1px solid rgba(111,45,141,0.6)',
                color: '#f4f7fb', cursor: 'pointer', fontSize: '0.88rem',
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
