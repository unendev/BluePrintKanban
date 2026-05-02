import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownViewProps {
  content: string;
  className?: string;
  variant?: 'default' | 'goc' | 'light';
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({
  content,
  className,
}) => {
  return (
    <div className={cn('markdown-view prose prose-invert max-w-none', className)}>
      <style>{`
        .markdown-view h1 { font-size: 1.5em; font-weight: bold; margin-bottom: 0.5em; margin-top: 1em; }
        .markdown-view h2 { font-size: 1.25em; font-weight: bold; margin-bottom: 0.5em; margin-top: 1em; }
        .markdown-view h3 { font-size: 1.1em; font-weight: bold; margin-bottom: 0.5em; margin-top: 1em; }
        .markdown-view p { margin-bottom: 0.75em; line-height: 1.6; }
        .markdown-view ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 0.75em; }
        .markdown-view ol { list-style-type: decimal; padding-left: 1.5em; margin-bottom: 0.75em; }
        .markdown-view li { margin-bottom: 0.25em; }
        .markdown-view code { background-color: rgba(255,255,255,0.1); padding: 0.2em 0.4em; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
        .markdown-view pre { background-color: rgba(0,0,0,0.3); padding: 1em; border-radius: 8px; overflow-x: auto; margin-bottom: 1em; }
        .markdown-view pre code { background-color: transparent; padding: 0; font-size: 0.85em; color: #e5e7eb; }
        .markdown-view blockquote { border-left: 4px solid #4b5563; padding-left: 1em; margin-bottom: 1em; color: #9ca3af; font-style: italic; }
        .markdown-view a { color: #3b82f6; text-decoration: underline; }
        .markdown-view table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
        .markdown-view th, .markdown-view td { border: 1px solid #4b5563; padding: 0.5em; text-align: left; }
        .markdown-view th { background-color: rgba(255,255,255,0.05); }
        .markdown-view hr { border: 0; border-top: 1px solid #4b5563; margin: 1.5em 0; }
      `}</style>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
};
