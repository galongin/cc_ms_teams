/**
 * Error Adaptive Card template.
 *
 * Renders user-friendly error messages with attention styling,
 * optional stack traces, and retry/new-session action buttons.
 */

import type {
  AdaptiveCard,
  AdaptiveCardElement,
  AdaptiveCardAction,
  ErrorInfo,
} from '../types.js';
import {
  ADAPTIVE_CARD_SCHEMA,
  ADAPTIVE_CARD_VERSION,
} from '../types.js';

/** Maximum stack trace lines to display. */
const MAX_STACK_LINES = 10;

/**
 * Render an error card.
 *
 * - Container with attention style
 * - Error type as heading (e.g., "Session Error", "API Error")
 * - Error message as wrapped TextBlock
 * - Optional stack trace in CodeBlock (PlainText), truncated to 10 lines
 * - "Retry" button for recoverable errors
 * - "New Session" button always present
 */
export function renderError(error: ErrorInfo): AdaptiveCard {
  const containerItems: AdaptiveCardElement[] = [
    {
      type: 'TextBlock',
      text: error.type,
      style: 'heading',
      color: 'attention',
      size: 'medium',
    },
    {
      type: 'TextBlock',
      text: error.message,
      wrap: true,
    },
  ];

  // Optional truncated stack trace
  if (error.stack) {
    const truncatedStack = truncateStack(error.stack);
    containerItems.push({
      type: 'CodeBlock',
      codeSnippet: truncatedStack,
      language: 'PlainText',
    });
  }

  const body: AdaptiveCardElement[] = [
    {
      type: 'Container',
      style: 'attention',
      items: containerItems,
    },
  ];

  // Action buttons
  const actions: AdaptiveCardAction[] = [];

  if (error.recoverable) {
    actions.push({
      type: 'Action.Submit',
      title: 'Retry',
      data: { action: 'retry_session' },
    });
  }

  actions.push({
    type: 'Action.Submit',
    title: 'New Session',
    data: { action: 'new_session' },
  });

  return {
    $schema: ADAPTIVE_CARD_SCHEMA,
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body,
    actions,
  };
}

// ── Helper ──────────────────────────────────────────────────────────

/**
 * Truncate a stack trace to MAX_STACK_LINES, appending
 * a "... N more lines" suffix if truncated.
 */
function truncateStack(stack: string): string {
  const lines = stack.split('\n');
  if (lines.length <= MAX_STACK_LINES) {
    return stack;
  }
  const kept = lines.slice(0, MAX_STACK_LINES);
  const remaining = lines.length - MAX_STACK_LINES;
  kept.push(`... ${remaining} more lines`);
  return kept.join('\n');
}
