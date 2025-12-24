import React from 'react';

interface MarkdownRendererProps {
  content: string;
}

// Simple markdown to HTML parser (no external dependencies)
function parseMarkdown(markdown: string): string {
  let html = markdown;

  // Escape HTML entities first
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headers (must be at start of line)
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-3 text-gray-900">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-8 mb-4 text-gray-900">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-0 mb-6 text-gray-900">$1</h1>');

  // Bold and Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-emerald-700 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 mb-1">$1</li>');

  // Wrap consecutive li elements in ul
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => {
    return `<ul class="list-disc list-inside mb-4 space-y-1 text-gray-600">${match}</ul>`;
  });

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>');
  html = html.replace(/(<oli>.*<\/oli>\n?)+/g, (match) => {
    const items = match.replace(/<oli>/g, '<li class="ml-4 mb-1">').replace(/<\/oli>/g, '</li>');
    return `<ol class="list-decimal list-inside mb-4 space-y-1 text-gray-600">${items}</ol>`;
  });

  // Paragraphs (lines that aren't headers, lists, or empty)
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inParagraph = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip if it's already an HTML element
    if (line.startsWith('<h') || line.startsWith('<ul') || line.startsWith('<ol') ||
        line.startsWith('<li') || line.startsWith('</') || line === '') {
      if (inParagraph) {
        processedLines.push('</p>');
        inParagraph = false;
      }
      if (line !== '') {
        processedLines.push(line);
      }
    } else {
      if (!inParagraph) {
        processedLines.push('<p class="mb-4 text-gray-600 leading-relaxed">');
        inParagraph = true;
      }
      processedLines.push(line);
    }
  }

  if (inParagraph) {
    processedLines.push('</p>');
  }

  return processedLines.join('\n');
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const html = React.useMemo(() => parseMarkdown(content), [content]);

  return (
    <div
      className="prose prose-gray max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
