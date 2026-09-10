import { Component } from 'react';

/**
 * Catches render-time crashes so a bad API payload (or any other thrown error)
 * shows a recoverable message instead of a blank white screen.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="center-screen">
        <div className="glass card stack" style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 className="page-title">Something went wrong</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            The page hit an unexpected error. Reloading usually fixes it.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
