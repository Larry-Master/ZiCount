import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong.</h2>
          <div className="error-details">
            <details style={{ whiteSpace: 'pre-wrap', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px', margin: '1rem 0' }}>
              <summary>Error details (click to expand)</summary>
              <p><strong>Error:</strong> {this.state.error && this.state.error.toString()}</p>
              <p><strong>Stack trace:</strong></p>
              <pre>{this.state.errorInfo.componentStack}</pre>
            </details>
          </div>
          <button 
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            className="btn btn-primary"
          >
            Try again
          </button>
          <button 
            onClick={() => window.location.reload()}
            className="btn btn-secondary"
            style={{ marginLeft: '1rem' }}
          >
            Reload page
          </button>
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-6">
          <div className="text-center max-w-lg">
            <div className="text-4xl">⚠️</div>
            <h2 className="mt-4 text-xl font-semibold">Something went wrong</h2>
            <p className="mt-2 text-sm text-gray-600">An unexpected error occurred. You can retry or reload the page.</p>

            <details className="mt-4 p-3 bg-gray-50 rounded" style={{ whiteSpace: 'pre-wrap' }}>
              <summary className="cursor-pointer text-sm font-medium">Error details (expand)</summary>
              <div className="mt-2 text-xs text-gray-700">
                <p><strong>Error:</strong> {this.state.error && this.state.error.toString()}</p>
                <pre className="mt-2 text-xs">{this.state.errorInfo?.componentStack}</pre>
              </div>
            </details>

            <div className="mt-4 flex gap-3 justify-center">
              <button 
                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                className="btn-primary btn-sm"
              >
                Try again
              </button>
              <button 
                onClick={() => window.location.reload()}
                className="btn-secondary btn-sm"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
