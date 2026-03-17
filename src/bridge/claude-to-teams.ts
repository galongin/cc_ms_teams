/**
 * Claude-to-Teams message transformer.
 *
 * Converts OutputEvent objects (from the session output processor)
 * into TeamsContent items suitable for sending to Microsoft Teams.
 */

import type { OutputEvent } from '../session/types.js';
import type { TeamsContent } from './types.js';

/**
 * Transform a Claude OutputEvent into an array of TeamsContent items.
 *
 * - Text events → Teams markdown text
 * - Tool use events → "Using tool: X" formatted message
 * - Tool result events → tool result summary
 * - Thinking events → "Thinking..." indicator
 * - Error events → error message format
 * - Result events → session summary
 */
export function transformClaudeToTeamsContent(
  event: OutputEvent,
): TeamsContent[] {
  switch (event.type) {
    case 'text':
      return [{ type: 'text', text: event.text }];

    case 'tool_use':
      return [
        {
          type: 'text',
          text: formatToolUse(event.toolName, event.input),
        },
      ];

    case 'tool_result':
      return [
        {
          type: 'text',
          text: formatToolResult(event.toolId, event.content, event.isError),
        },
      ];

    case 'thinking':
      return [{ type: 'text', text: '_Thinking..._' }];

    case 'error':
      return [
        {
          type: 'text',
          text: `**Error:** ${event.message}`,
        },
      ];

    case 'result':
      return [
        {
          type: 'text',
          text: formatResult(event.subtype, event.costUsd, event.durationMs),
        },
      ];

    default:
      return [];
  }
}

/**
 * Parse markdown text into alternating segments of plain text and code blocks.
 */
export function parseMarkdownSegments(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;

  for (const match of text.matchAll(codeBlockRegex)) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      segments.push({
        type: 'text',
        text: text.slice(lastIndex, matchIndex),
      });
    }
    segments.push({
      type: 'code',
      language: match[1] || undefined,
      code: match[2] ?? '',
    });
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return segments;
}

// ── Formatting helpers ───────────────────────────────────────────────

function formatToolUse(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const inputSummary = summarizeInput(input);
  return `**Using tool:** \`${toolName}\`\n${inputSummary}`;
}

function formatToolResult(
  toolId: string,
  content: string,
  isError: boolean,
): string {
  const prefix = isError ? '**Tool error**' : '**Tool result**';
  const truncated =
    content.length > 500 ? content.slice(0, 500) + '...' : content;
  return `${prefix} (\`${toolId}\`):\n${truncated}`;
}

function formatResult(
  subtype: string,
  costUsd: number,
  durationMs: number,
): string {
  const durationSec = (durationMs / 1000).toFixed(1);
  const status =
    subtype === 'success' || subtype === 'end_turn'
      ? 'Completed'
      : subtype === 'max_turns'
        ? 'Reached max turns'
        : 'Error';
  return `**${status}** | Cost: $${costUsd.toFixed(4)} | Duration: ${durationSec}s`;
}

function summarizeInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (entries.length === 0) return '';

  const lines: string[] = [];
  for (const [key, value] of entries) {
    const strVal =
      typeof value === 'string'
        ? value.length > 100
          ? value.slice(0, 100) + '...'
          : value
        : JSON.stringify(value);
    lines.push(`  \`${key}\`: ${strVal}`);
  }
  return lines.join('\n');
}

// ── Types ────────────────────────────────────────────────────────────

export type MarkdownSegment =
  | { type: 'text'; text: string }
  | { type: 'code'; language?: string; code: string };
