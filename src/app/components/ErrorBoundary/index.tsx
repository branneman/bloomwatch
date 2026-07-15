import { Component, type ReactNode } from "react";
import { ErrorOverlay } from "../ErrorOverlay";
import { Shell } from "../ui/Shell";
import { recoverFromError } from "../../errorRecovery";

export interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: unknown;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error !== null) {
      return (
        <Shell>
          <ErrorOverlay
            error={this.state.error}
            onStartOver={recoverFromError}
          />
        </Shell>
      );
    }
    return this.props.children;
  }
}
