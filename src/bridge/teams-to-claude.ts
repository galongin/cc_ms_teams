/**
 * Teams-to-Claude message transformer.
 *
 * Converts incoming Teams activity text into a clean prompt string
 * suitable for the Claude Agent SDK.
 */

/**
 * Error thrown when a message is empty after processing.
 */
export class EmptyMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmptyMessageError';
  }
}

/**
 * Transform Teams message text into a clean Claude prompt string.
 *
 * Processing steps:
 * 1. Strip @mention XML tags (e.g., `<at>Claude Code</at>`)
 * 2. Decode HTML entities (&amp; &lt; &gt; &quot; etc.)
 * 3. Normalize excessive whitespace
 * 4. Preserve code blocks and markdown formatting
 */
export function transformTeamsToClaudeMessage(text: string): string {
  // Strip Teams @mention XML tags and the trailing space
  let cleaned = text.replace(/<at[^>]*>.*?<\/at>\s*/gi, '');

  // Decode common HTML entities that Teams may inject
  cleaned = decodeHtmlEntities(cleaned);

  // Normalize excessive whitespace (but preserve newlines for markdown)
  cleaned = cleaned
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n');

  // Trim leading/trailing whitespace
  cleaned = cleaned.trim();

  if (!cleaned) {
    throw new EmptyMessageError('Message was empty after processing');
  }

  return cleaned;
}

/**
 * Decode common HTML entities found in Teams messages.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
