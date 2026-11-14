import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error de interfaz:', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="main">
          <div className="state-error" role="alert">
            <span className="state-error-ico">⚠️</span>
            <p>Algo salió mal al mostrar esta pantalla.</p>
            <a className="btn-retry" href={import.meta.env.BASE_URL}>
              ← Volver al inicio
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
