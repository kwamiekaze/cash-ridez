import React from 'react';

interface SafeBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface SafeBoundaryState {
  hasError: boolean;
  error?: any;
}

export class SafeBoundary extends React.Component<SafeBoundaryProps, SafeBoundaryState> {
  constructor(props: SafeBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any): SafeBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    console.error('TripMapView error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}
