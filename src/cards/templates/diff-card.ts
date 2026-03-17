/**
 * Diff Adaptive Card template.
 *
 * Renders file diffs in two modes:
 * - Side-by-side using ColumnSet with Before/After CodeBlock columns
 * - Unified diff fallback for large diffs (>20 lines per side)
 */

import type {
  AdaptiveCard,
  AdaptiveCardElement,
} from '../types.js';
import {
  ADAPTIVE_CARD_SCHEMA,
  ADAPTIVE_CARD_VERSION,
} from '../types.js';
import { normalizeLanguage } from '../language-mapper.js';

/** Line threshold per side; above this, fall back to unified diff. */
const SIDE_BY_SIDE_MAX_LINES = 20;

/**
 * Render a side-by-side diff card.
 *
 * - File path header with attention color
 * - ColumnSet with Before (left) and After (right) CodeBlock columns
 * - Falls back to unified format if either side exceeds 20 lines
 */
export function renderDiff(
  filePath: string,
  before: string,
  after: string,
  language: string,
): AdaptiveCard {
  const beforeLines = before.split('\n').length;
  const afterLines = after.split('\n').length;

  // Fall back to unified if either side is too large
  if (beforeLines > SIDE_BY_SIDE_MAX_LINES || afterLines > SIDE_BY_SIDE_MAX_LINES) {
    const unified = buildUnifiedFromParts(before, after);
    return renderUnifiedDiff(filePath, unified);
  }

  const resolvedLang = normalizeLanguage(language);

  const body: AdaptiveCardElement[] = [
    {
      type: 'TextBlock',
      text: `File Changed: ${filePath}`,
      style: 'heading',
      size: 'small',
      color: 'attention',
    },
    {
      type: 'ColumnSet',
      columns: [
        {
          type: 'Column',
          width: 'stretch',
          items: [
            { type: 'TextBlock', text: 'Before', weight: 'bolder', size: 'small' },
            {
              type: 'CodeBlock',
              codeSnippet: before,
              language: resolvedLang,
            },
          ],
        },
        {
          type: 'Column',
          width: 'stretch',
          items: [
            { type: 'TextBlock', text: 'After', weight: 'bolder', size: 'small' },
            {
              type: 'CodeBlock',
              codeSnippet: after,
              language: resolvedLang,
            },
          ],
        },
      ],
    },
  ];

  return {
    $schema: ADAPTIVE_CARD_SCHEMA,
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body,
  };
}

/**
 * Render a unified diff as an Adaptive Card.
 *
 * - File path header with attention color
 * - Single CodeBlock with PlainText language (unified diff format)
 */
export function renderUnifiedDiff(
  filePath: string,
  unifiedDiff: string,
): AdaptiveCard {
  return {
    $schema: ADAPTIVE_CARD_SCHEMA,
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body: [
      {
        type: 'TextBlock',
        text: `Diff: ${filePath}`,
        style: 'heading',
        size: 'small',
        color: 'attention',
      },
      {
        type: 'CodeBlock',
        codeSnippet: unifiedDiff,
        language: 'PlainText',
      },
    ],
  };
}

// ── Helper ──────────────────────────────────────────────────────────

/**
 * Build a simple unified-style diff string from before/after content.
 * Prefixes removed lines with "-" and added lines with "+".
 */
function buildUnifiedFromParts(before: string, after: string): string {
  const lines: string[] = [];

  if (before) {
    for (const line of before.split('\n')) {
      lines.push(`- ${line}`);
    }
  }
  if (after) {
    for (const line of after.split('\n')) {
      lines.push(`+ ${line}`);
    }
  }

  return lines.join('\n');
}
