import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

function removeTypicalRecordIds(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const resultLines: string[] = [];
  let tableColToRemove = -1;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
      const rawCells = trimmed.slice(1, -1).split('|');

      if (!inTable) {
        inTable = true;
        tableColToRemove = rawCells.findIndex(c =>
          /typical\s*(record\s*)?ids?/i.test(c) ||
          /typical\s*records?/i.test(c) ||
          /sample\s*(record\s*)?ids?/i.test(c) ||
          /(typical|sample)\s*ids?/i.test(c)
        );
      }

      if (tableColToRemove !== -1 && rawCells.length > tableColToRemove) {
        rawCells.splice(tableColToRemove, 1);
        resultLines.push('|' + rawCells.join('|') + '|');
      } else {
        resultLines.push(line);
      }
    } else {
      inTable = false;
      tableColToRemove = -1;

      // Filter standalone bullets or lines for typical record ids
      if (/^[\s*#-]*\*{0,2}typical\s+(record\s+)?ids?[:\s*]/i.test(trimmed)) {
        continue;
      }
      resultLines.push(line);
    }
  }
  return resultLines.join('\n');
}

function stripRepetitiveIntro(text: string): string {
  if (!text) return '';
  if (/^(\*\*Hello!|\*\*Hi!|Hello!|Hi!)\s+I am Fintech AI/i.test(text.trim())) {
    return text;
  }
  let cleaned = text;
  cleaned = cleaned.replace(/^\s*(?:\*\*)?Fintech\s+AI\s+(?:is\s+)?here[!.:]*(?:\*\*)?\s*/i, '');
  cleaned = cleaned.replace(/\n*\s*(?:In short,\s*)?(?:if you [^\n]+,\s*)?Fintech\s+AI\s+is\s+here(?:\s+for you|\s+to help)?[.!]*\s*$/i, '');
  return cleaned.trim();
}

function stripSimpleWordsPhrases(text: string): string {
  if (!text) return '';
  return text
    .replace(/[^\S\r\n]*(?:in\s+simple\s+(?:everyday\s+)?words|in\s+simple(?:,\s+clear)?\s+terms|in\s+simple(?:,\s+easy-to-understand)?\s+words)[^\S\r\n]*/gi, ' ')
    .replace(/,[^\S\r\n]*,/g, ',')
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// LLMs occasionally return Markdown list items inline, for example:
// "- Check the error - Verify your details - Try again".
// Markdown needs each item on its own line to render a real list.
function normalizeMarkdownStructure(text: string): string {
  if (!text) return '';

  return text
    .replace(/\s+-\s+(?=(?:\*{0,2}|\d+[.)]\s+)?[A-Z])/g, '\n- ')
    .replace(/\s+•\s+/g, '\n- ')
    .replace(/([^\n])\s+(\d+[.)])\s+(?=\*{0,2}[A-Z])/g, '$1\n$2 ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function MarkdownMessage({
  content,
  className = '',
}: MarkdownMessageProps) {
  const cleanContent = React.useMemo(() => {
    const withoutTypical = removeTypicalRecordIds(content);
    const withoutIntro = stripRepetitiveIntro(withoutTypical);
    return normalizeMarkdownStructure(stripSimpleWordsPhrases(withoutIntro));
  }, [content]);

  return (
    <div
      className={`prose prose-invert max-w-none text-sm text-slate-200 leading-relaxed ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-base font-bold text-white border-b border-white/10 pb-1.5 mb-2 mt-2 flex items-center gap-1.5">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-bold text-cyan-300 mb-2 mt-2.5">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-blue-300 mb-2 mt-2.5 flex items-center gap-1.5">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs font-semibold text-slate-200 mb-1.5 mt-2 flex items-center gap-1">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="mb-2.5 last:mb-0 text-slate-200 leading-relaxed">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="space-y-1 mb-2.5 list-none pl-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="space-y-1 mb-2.5 list-decimal pl-4 text-slate-300">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="flex items-start gap-2 text-slate-200">
              <span className="text-cyan-400 font-bold text-xs mt-0.5">•</span>
              <span className="flex-1">{children}</span>
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-white">
              {children}
            </strong>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code className="font-mono text-xs text-cyan-300 bg-white/10 px-1.5 py-0.5 rounded border border-white/10">
                {children}
              </code>
            ) : (
              <code className="block font-mono text-xs text-slate-300 bg-black/60 p-2.5 rounded-lg border border-white/10 overflow-x-auto my-2">
                {children}
              </code>
            );
          },
          hr: () => <hr className="border-white/10 my-3" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-cyan-400 pl-3 py-1 bg-cyan-950/20 rounded-r text-xs text-cyan-200 my-2">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-xl border border-white/10 bg-slate-950/50 shadow-inner">
              <table className="min-w-full text-left text-xs border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-800/80 border-b border-white/10 text-cyan-300 font-semibold uppercase tracking-wider text-[11px]">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-white/5 text-slate-200">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-cyan-500/[0.03] transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2.5 font-semibold text-slate-200">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2.5 leading-relaxed align-top">
              {children}
            </td>
          ),
        }}
      >
        {cleanContent}
      </ReactMarkdown>
    </div>
  );
}
