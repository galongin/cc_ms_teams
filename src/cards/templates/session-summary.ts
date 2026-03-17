/**
 * Session summary Adaptive Card template.
 *
 * Renders a session completion card with FactSet stats
 * (duration, cost, turns, session ID) and action buttons.
 */

import type {
  AdaptiveCard,
  AdaptiveCardElement,
  AdaptiveCardAction,
  SessionSummary,
} from '../types.js';
import {
  ADAPTIVE_CARD_SCHEMA,
  ADAPTIVE_CARD_VERSION,
} from '../types.js';

/**
 * Render a session summary card.
 *
 * - "Session Complete" heading with good (green) color
 * - FactSet: Duration, Cost, Turns, Session ID
 * - Result summary text (first 200 chars)
 * - "Resume Session" and "Fork Session" action buttons
 */
export function renderSessionSummary(summary: SessionSummary): AdaptiveCard {
  const durationText = formatDuration(summary.duration);
  const costText = `$${summary.cost.toFixed(2)}`;
  const resultPreview =
    summary.result.length > 200
      ? summary.result.slice(0, 200) + '...'
      : summary.result;

  const body: AdaptiveCardElement[] = [
    {
      type: 'TextBlock',
      text: 'Session Complete',
      style: 'heading',
      size: 'medium',
      color: 'good',
    },
    {
      type: 'FactSet',
      facts: [
        { title: 'Duration', value: durationText },
        { title: 'Cost', value: costText },
        { title: 'Turns', value: String(summary.turns) },
        { title: 'Session ID', value: summary.sessionId },
      ],
    },
  ];

  if (resultPreview) {
    body.push({
      type: 'TextBlock',
      text: resultPreview,
      wrap: true,
    });
  }

  const actions: AdaptiveCardAction[] = [
    {
      type: 'Action.Submit',
      title: 'Resume Session',
      data: { action: 'resume_session', sessionId: summary.sessionId },
    },
    {
      type: 'Action.Submit',
      title: 'Fork Session',
      data: { action: 'fork_session', sessionId: summary.sessionId },
    },
  ];

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
 * Format duration in milliseconds to human-readable "Xm Ys".
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
