// src/components/ErrorBoundary.tsx

import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          background: 'var(--bg-base)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
          minHeight: '100vh'
        }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: '20px', fontFamily: 'var(--font-display)' }}>
            ⚠️ Something went wrong
          </h2>
          <p style={{ marginBottom: '30px', color: 'var(--text-secondary)' }}>
            We encountered an unexpected error. Please try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="btn btn--primary"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}