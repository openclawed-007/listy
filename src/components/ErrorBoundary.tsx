import React from "react";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Top-level error:", error, info);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="error-boundary">
        <div className="error-boundary-card">
          <AlertTriangle size={36} strokeWidth={1.5} />
          <h1>Something went wrong</h1>
          <p>
            CartLink hit an unexpected error. Reloading usually fixes it. If
            the problem keeps happening, please email
            {" "}
            <a href="mailto:hello@cartlink.co.uk">hello@cartlink.co.uk</a>.
          </p>
          <button type="button" className="primary-btn" onClick={this.handleReload}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
