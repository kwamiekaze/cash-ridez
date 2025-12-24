import React, { Component } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error?: Error;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep minimal; helps diagnose rare environment-specific crashes.
    console.error("[AppErrorBoundary] Uncaught error", error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Something went wrong</CardTitle>
            <CardDescription>
              A temporary app error occurred. Reloading usually fixes it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {this.state.error?.message ? (
                <span>Details: {this.state.error.message}</span>
              ) : (
                <span>Details: Unknown error</span>
              )}
            </div>
            <div className="flex gap-3">
              <Button onClick={this.handleReload}>Reload</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
