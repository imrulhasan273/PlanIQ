import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('PlanIQ React ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="tab-scroll-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div className="glass-panel" style={{ maxWidth: '640px', width: '100%', padding: '32px', textAlign: 'center', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
            <div style={{ display: 'inline-flex', padding: '14px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', marginBottom: '16px' }}>
              <AlertTriangle size={36} color="#ef4444" />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}>
              {this.props.fallbackTitle || 'Unable to render this view'}
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
              An unexpected error occurred while rendering the components for this tab.
            </p>
            {this.state.error?.message && (
              <pre
                style={{
                  background: '#090d16',
                  color: '#f87171',
                  padding: '12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  textAlign: 'left',
                  overflowX: 'auto',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  marginBottom: '20px',
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={this.handleReset}>
                <LayoutDashboard size={14} />
                <span>Return to Overview</span>
              </button>
              <button className="btn btn-secondary" onClick={() => window.location.reload()}>
                <RefreshCw size={14} />
                <span>Reload Application</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
