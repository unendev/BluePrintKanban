import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-4 bg-zinc-900 text-red-400 h-full flex flex-col items-center justify-center text-center">
          <h2 className="text-lg font-bold mb-2">出错了</h2>
          <p className="text-xs text-zinc-500 mb-4">应用遇到一个未处理的错误。</p>
          <pre className="bg-zinc-800 p-2 rounded text-[10px] w-full overflow-auto max-h-40 text-left">
            {this.state.error?.message}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-sm text-zinc-300"
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
