'use strict';

/* Apple-inspired Tailwind theme extension.
   Load BEFORE https://cdn.tailwindcss.com */
if (typeof window !== 'undefined') {
  window.tailwind = window.tailwind || {};
  window.tailwind.config = {
    theme: {
      extend: {
        colors: {
          'action':          '#0066cc',
          'action-focus':    '#0071e3',
          'action-on-dark':  '#2997ff',
          'ink':             '#1d1d1f',
          'ink-soft':        '#333333',
          'ink-muted':       '#7a7a7a',
          'parchment':       '#f5f5f7',
          'pearl':           '#fafafc',
          'tile-1':          '#272729',
          'tile-2':          '#2a2a2c',
          'tile-3':          '#252527',
          'hairline':        '#e0e0e0',
          'divider':         '#f0f0f0',
          'correct':         '#1d8f4e',
          'correct-hover':   '#15703d',
          'wrong':           '#d70015',
          'wrong-hover':     '#a50010'
        },
        fontFamily: {
          'display': ['"SF Pro Display"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
          'text':    ['"SF Pro Text"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif']
        },
        borderRadius: {
          'apple-sm': '8px',
          'apple-md': '11px',
          'apple-lg': '18px'
        },
        letterSpacing: {
          'apple-hero':    '-0.28px',
          'apple-body':    '-0.374px',
          'apple-caption': '-0.224px'
        }
      }
    }
  };
}
