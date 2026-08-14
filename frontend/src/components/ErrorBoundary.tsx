import { Component, ErrorInfo, ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Catches render/lifecycle crashes so the shell stays usable.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("FaultTrace UI crash:", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  private hardReset = () => {
    try {
      sessionStorage.clear();
      localStorage.removeItem("faulttrace-session");
    } catch {
      /* ignore storage failures */
    }
    window.location.assign("/");
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const message = this.state.error.message || "Unexpected display error";

    return (
      <div className="shell login-shell" role="alert">
        <header className="brand-hero">
          <h1>FaultTrace</h1>
          <p className="lede">Something went wrong while rendering the screen.</p>
        </header>
        <div className="panel stack">
          <h2>Recovery</h2>
          <p className="field-error">{message}</p>
          <p className="lede">
            Your data is safe on the server. Try again, or reload to return to sign in.
          </p>
          <div className="btn-row">
            <button type="button" className="primary" onClick={this.reset}>
              Try again
            </button>
            <button type="button" className="ghost" onClick={this.hardReset}>
              Reload app
            </button>
          </div>
        </div>
        <footer className="brand-foot">
          <strong>Cardinal Precision</strong>
          <span>Find the fix that worked</span>
        </footer>
      </div>
    );
  }
}
