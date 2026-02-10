/**
 * Text utility functions for parsing and rendering highlighted text
 */

import React from 'react';

/**
 * Parse text with **highlighted** markdown syntax and convert to React elements
 * @param text - Text containing **text** patterns to highlight
 * @returns Array of React nodes with highlighted spans
 */
export function parseHighlightedText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    // Add highlighted text
    parts.push(
      React.createElement(
        'span',
        {
          key: `highlight-${key++}`,
          className: 'bg-yellow-200/80 font-bold px-1 rounded-sm box-decoration-clone'
        },
        match[1]
      )
    );
    
    lastIndex = regex.lastIndex;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : [text];
}
