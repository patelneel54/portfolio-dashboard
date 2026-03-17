import { Component } from 'react';
import { C } from '../styles/theme';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          background: C.card,
          borderRadius: 16,
          border: `1px solid ${C.red}33`,
          padding: 32,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 12, color: C.red }}>&#9888;</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>
            {this.props.fallbackMessage || 'This section encountered an error.'}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              background: C.red + '22',
              border: `1px solid ${C.red}`,
              color: C.red,
              padding: '10px 20px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            Tap to retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function InlineError({ message, onRetry }) {
  return (
    <div style={{
      background: C.card,
      borderRadius: 16,
      border: `1px solid ${C.red}33`,
      padding: 24,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 13, color: C.red, fontWeight: 600, marginBottom: onRetry ? 12 : 0 }}>
        {message}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: C.red + '22',
            border: `1px solid ${C.red}`,
            color: C.red,
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            minHeight: 44,
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
