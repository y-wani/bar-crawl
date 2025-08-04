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
          background: 'linear-gradient(135deg, #0a0a0f, #1a1a2e)',
          color: '#ffffff',
          minHeight: '100vh'
        }}>
          <h2 style={{ color: '#ff6b6b', marginBottom: '20px' }}>
            ⚠️ Something went wrong
          </h2>
          <p style={{ marginBottom: '30px', color: 'rgba(255, 255, 255, 0.7)' }}>
            We encountered an unexpected error. Please try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #ff00ff, #00ffff)',
              border: 'none',
              borderRadius: '8px',
              color: '#ffffff',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}