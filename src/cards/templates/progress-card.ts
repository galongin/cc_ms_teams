/**
 * Progress indicator Adaptive Card template.
 *
 * Shows Claude Code's current activity: thinking, tool usage,
 * elapsed time, and optional progress percentage.
 */

import type { AdaptiveCard, AdaptiveCardElement } from '../types.js';
import {
  ADAPTIVE_CARD_SCHEMA,
  ADAPTIVE_CARD_VERSION,
} from '../types.js';

/**
 * Render a progress indicator card.
 *
 * - Spinner emoji + heading "Claude Code is working..."
 * - Status text describing current activity
 * - Optional progress bar via ColumnSet width trick
 * - Elapsed time display
 */
export function renderProgress(
  status: string,
  percent?: number,
  elapsed?: string,
): AdaptiveCard {
  const body: AdaptiveCardElement[] = [
    {
      type: 'TextBlock',
      text: '\u23F3 Claude Code is working...',
      style: 'heading',
      size: 'small',
    },
    {
      type: 'TextBlock',
      text: status,
      wrap: true,
      isSubtle: true,
    },
  ];

  // Progress bar via ColumnSet width trick
  if (percent !== undefined && percent >= 0 && percent <= 100) {
    const filled = Math.round(percent);
    const empty = 100 - filled;
    body.push({
      type: 'ColumnSet',
      columns: [
        {
          type: 'Column',
          width: String(filled || 1),
          style: 'accent',
          items: [{ type: 'TextBlock', text: ' ' }],
        },
        {
          type: 'Column',
          width: String(empty || 1),
          items: [{ type: 'TextBlock', text: ' ' }],
        },
      ],
    });
  }

  // Elapsed time and percentage footer
  const parts: string[] = [];
  if (elapsed) parts.push(`Elapsed: ${elapsed}`);
  if (percent !== undefined) parts.push(`${Math.round(percent)}%`);

  if (parts.length > 0) {
    body.push({
      type: 'TextBlock',
      text: parts.join(' | '),
      size: 'small',
      isSubtle: true,
      horizontalAlignment: 'right',
    });
  }

  return {
    $schema: ADAPTIVE_CARD_SCHEMA,
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body,
  };
}

/**
 * Render a tool usage progress indicator.
 *
 * - Shows tool name with wrench icon
 * - Shows tool status (running/complete/error)
 * - Compact design, minimal height
 */
export function renderToolProgress(
  toolName: string,
  toolStatus: 'running' | 'complete' | 'error' = 'running',
): AdaptiveCard {
  const statusIcon =
    toolStatus === 'running'
      ? '\u{1F527}'
      : toolStatus === 'complete'
        ? '\u2705'
        : '\u274C';

  const statusText =
    toolStatus === 'running'
      ? `Using ${toolName}...`
      : toolStatus === 'complete'
        ? `${toolName} complete`
        : `${toolName} failed`;

  return {
    $schema: ADAPTIVE_CARD_SCHEMA,
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body: [
      {
        type: 'TextBlock',
        text: `${statusIcon} ${statusText}`,
        wrap: true,
        size: 'small',
      },
    ],
  };
}
