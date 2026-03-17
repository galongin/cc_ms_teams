/**
 * Code block Adaptive Card template.
 *
 * Renders syntax-highlighted code using the CodeBlock element
 * with language detection, optional file path header, and line numbers.
 */

import type {
  AdaptiveCard,
  AdaptiveCardElement,
  AdaptiveCardAction,
  CodeBlockOptions,
} from '../types.js';
import {
  ADAPTIVE_CARD_SCHEMA,
  ADAPTIVE_CARD_VERSION,
  MAX_CARD_SIZE_BYTES,
} from '../types.js';
import { normalizeLanguage } from '../language-mapper.js';

/**
 * Render a code block as an Adaptive Card.
 *
 * - Optional file path header with accent color
 * - Optional line range display
 * - CodeBlock element with language and startLineNumber
 * - Optional "Open in VS Code" action
 * - Truncates code to fit within 28KB card size limit
 */
export function renderCodeBlock(
  code: string,
  language: string,
  options?: CodeBlockOptions,
): AdaptiveCard {
  const body: AdaptiveCardElement[] = [];
  const resolvedLang = normalizeLanguage(language);

  // File path header
  if (options?.filePath) {
    body.push({
      type: 'TextBlock',
      text: options.filePath,
      style: 'heading',
      size: 'small',
      color: 'accent',
    });
  }

  // Line range indicator
  if (options?.startLine && options?.endLine) {
    body.push({
      type: 'TextBlock',
      text: `Lines ${options.startLine} - ${options.endLine}`,
      size: 'small',
      isSubtle: true,
    });
  }

  // Truncate code if needed to stay within card size limit
  const { code: truncatedCode, wasTruncated } = truncateForCardSize(
    code,
    body,
    resolvedLang,
    options,
  );

  // Line count header
  const lineCount = truncatedCode.split('\n').length;
  const truncatedSuffix = wasTruncated ? ' (truncated)' : '';
  body.push({
    type: 'TextBlock',
    text: `${resolvedLang} | ${lineCount} lines${truncatedSuffix}`,
    size: 'small',
    isSubtle: true,
  });

  // CodeBlock element
  body.push({
    type: 'CodeBlock',
    codeSnippet: truncatedCode,
    language: resolvedLang,
    ...(options?.startLine ? { startLineNumber: options.startLine } : {}),
  });

  // Actions
  const actions: AdaptiveCardAction[] = [];
  if (options?.showOpenInVSCode && options?.filePath) {
    const lineRef = options.startLine ? `:${options.startLine}` : '';
    actions.push({
      type: 'Action.OpenUrl',
      title: 'Open in VS Code',
      url: `vscode://file${options.filePath}${lineRef}`,
    });
  }

  return {
    $schema: ADAPTIVE_CARD_SCHEMA,
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body,
    ...(actions.length > 0 ? { actions } : {}),
  };
}

// ── Truncation helper ───────────────────────────────────────────────

/**
 * Truncate code content to fit within the 28KB card size limit.
 * Returns the (possibly truncated) code and whether truncation occurred.
 */
function truncateForCardSize(
  code: string,
  existingBody: AdaptiveCardElement[],
  language: string,
  options?: CodeBlockOptions,
): { code: string; wasTruncated: boolean } {
  // Build a test card to measure size
  const testCard: AdaptiveCard = {
    $schema: ADAPTIVE_CARD_SCHEMA,
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body: [
      ...existingBody,
      { type: 'TextBlock', text: `${language} | 999 lines (truncated)`, size: 'small', isSubtle: true },
      {
        type: 'CodeBlock',
        codeSnippet: code,
        language,
        ...(options?.startLine ? { startLineNumber: options.startLine } : {}),
      },
    ],
  };

  const serialized = JSON.stringify(testCard);
  if (serialized.length <= MAX_CARD_SIZE_BYTES) {
    return { code, wasTruncated: false };
  }

  // Need to truncate: calculate how much code we can keep
  const overhead = serialized.length - code.length;
  const maxCodeLength = MAX_CARD_SIZE_BYTES - overhead - 100; // 100 bytes safety margin
  const lines = code.split('\n');
  let truncated = '';
  const kept: string[] = [];

  for (const line of lines) {
    if (truncated.length + line.length + 1 > maxCodeLength) break;
    kept.push(line);
    truncated = kept.join('\n');
  }

  const remaining = lines.length - kept.length;
  truncated += `\n... (truncated, ${remaining} more lines)`;

  return { code: truncated, wasTruncated: true };
}
