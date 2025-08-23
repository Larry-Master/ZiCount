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

    return this.props.children;
  }
}

export default ErrorBoundary;
