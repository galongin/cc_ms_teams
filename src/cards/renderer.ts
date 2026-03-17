/**
 * Adaptive Card Renderer.
 *
 * Main orchestrator that implements IAdaptiveCardRenderer by delegating
 * to individual template functions. Validates card size and truncates
 * if needed.
 */

import type {
  AdaptiveCard,
  CodeBlockOptions,
  ErrorInfo,
  IAdaptiveCardRenderer,
  PermissionRequest,
  SessionSummary,
} from './types.js';
import { MAX_CARD_SIZE_BYTES } from './types.js';
import { detectLanguage, normalizeLanguage } from './language-mapper.js';
import { renderCodeBlock } from './templates/code-block.js';
import { renderDiff, renderUnifiedDiff } from './templates/diff-card.js';
import { renderProgress } from './templates/progress-card.js';
import { renderError } from './templates/error-card.js';
import { renderPermissionRequest } from './templates/permission-card.js';
import { renderSessionSummary } from './templates/session-summary.js';

import {
  ADAPTIVE_CARD_SCHEMA,
  ADAPTIVE_CARD_VERSION,
} from './types.js';

/**
 * Adaptive Card Renderer implementing IAdaptiveCardRenderer.
 *
 * Dispatches rendering to template functions based on content type.
 * Validates final card size does not exceed 28KB.
 */
export class AdaptiveCardRenderer implements IAdaptiveCardRenderer {
  renderCodeBlock(
    code: string,
    language: string,
    options?: CodeBlockOptions,
  ): AdaptiveCard {
    return this.validateSize(renderCodeBlock(code, language, options));
  }

  renderDiff(
    filePath: string,
    before: string,
    after: string,
    language: string,
  ): AdaptiveCard {
    return this.validateSize(renderDiff(filePath, before, after, language));
  }

  renderUnifiedDiff(filePath: string, unifiedDiff: string): AdaptiveCard {
    return this.validateSize(renderUnifiedDiff(filePath, unifiedDiff));
  }

  renderProgress(
    status: string,
    percent?: number,
    elapsed?: string,
  ): AdaptiveCard {
    return this.validateSize(renderProgress(status, percent, elapsed));
  }

  renderError(error: ErrorInfo): AdaptiveCard {
    return this.validateSize(renderError(error));
  }

  renderPermissionRequest(request: PermissionRequest): AdaptiveCard {
    return this.validateSize(renderPermissionRequest(request));
  }

  renderSessionSummary(summary: SessionSummary): AdaptiveCard {
    return this.validateSize(renderSessionSummary(summary));
  }

  renderToolUseSummary(toolName: string, input: unknown): AdaptiveCard {
    const inputStr =
      typeof input === 'string'
        ? input
        : JSON.stringify(input, null, 2);

    const truncated =
      inputStr.length > 500 ? inputStr.slice(0, 500) + '...' : inputStr;

    const card: AdaptiveCard = {
      $schema: ADAPTIVE_CARD_SCHEMA,
      type: 'AdaptiveCard',
      version: ADAPTIVE_CARD_VERSION,
      body: [
        {
          type: 'TextBlock',
          text: `\u{1F527} Using tool: **${toolName}**`,
          wrap: true,
          size: 'small',
        },
        {
          type: 'CodeBlock',
          codeSnippet: truncated,
          language: 'PlainText',
        },
      ],
    };

    return this.validateSize(card);
  }

  detectLanguage(filePath: string): string {
    return detectLanguage(filePath);
  }

  // ── Size validation ─────────────────────────────────────────────

  /**
   * Validate that the card JSON does not exceed 28KB.
   * If it does, strip optional elements and truncate code blocks.
   */
  private validateSize(card: AdaptiveCard): AdaptiveCard {
    const serialized = JSON.stringify(card);
    if (serialized.length <= MAX_CARD_SIZE_BYTES) {
      return card;
    }

    // Attempt to reduce size by truncating CodeBlock elements
    const reduced = this.truncateCardContent(card);
    return reduced;
  }

  /**
   * Truncate code block content in a card to fit within size limits.
   */
  private truncateCardContent(card: AdaptiveCard): AdaptiveCard {
    const clone: AdaptiveCard = JSON.parse(JSON.stringify(card)) as AdaptiveCard;

    // Remove optional actions first
    delete clone.actions;

    if (JSON.stringify(clone).length <= MAX_CARD_SIZE_BYTES) {
      return clone;
    }

    // Truncate CodeBlock elements in the body
    for (const element of clone.body) {
      if (element['type'] === 'CodeBlock' && typeof element['codeSnippet'] === 'string') {
        const code = element['codeSnippet'] as string;
        if (code.length > 1000) {
          element['codeSnippet'] = code.slice(0, 1000) + '\n... (truncated)';
        }
      }
      // Also check Container items
      if (element['type'] === 'Container' && Array.isArray(element['items'])) {
        for (const item of element['items'] as Record<string, unknown>[]) {
          if (item['type'] === 'CodeBlock' && typeof item['codeSnippet'] === 'string') {
            const code = item['codeSnippet'] as string;
            if (code.length > 1000) {
              item['codeSnippet'] = code.slice(0, 1000) + '\n... (truncated)';
            }
          }
        }
      }
      // Check ColumnSet columns
      if (element['type'] === 'ColumnSet' && Array.isArray(element['columns'])) {
        for (const col of element['columns'] as Record<string, unknown>[]) {
          if (Array.isArray(col['items'])) {
            for (const item of col['items'] as Record<string, unknown>[]) {
              if (item['type'] === 'CodeBlock' && typeof item['codeSnippet'] === 'string') {
                const code = item['codeSnippet'] as string;
                if (code.length > 500) {
                  item['codeSnippet'] = code.slice(0, 500) + '\n... (truncated)';
                }
              }
            }
          }
        }
      }
    }

    return clone;
  }
}

// Re-export for convenience
export { detectLanguage, normalizeLanguage };
