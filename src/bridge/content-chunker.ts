/**
 * Content chunker for splitting long messages.
 *
 * Splits content exceeding Teams limits at intelligent boundaries
 * (paragraph, line, word) while preserving code blocks.
 */

/** Maximum text message size in characters (Teams limit ~4KB). */
const MAX_TEXT_CHARS = 4000;

/** Maximum Adaptive Card payload size in bytes. */
const MAX_CARD_BYTES = 28000;

export interface ChunkerOptions {
  /** Max characters per text chunk (default: 4000). */
  maxTextChars?: number;
  /** Max bytes per card payload (default: 28000). */
  maxCardBytes?: number;
}

/**
 * Split text content into chunks that fit within Teams message limits.
 *
 * Splitting priority:
 * 1. Paragraph boundaries (double newline)
 * 2. Line boundaries (single newline)
 * 3. Word boundaries (space)
 * 4. Hard split at max chars
 *
 * Code blocks are preserved intact when possible.
 */
export function chunkText(
  text: string,
  options: ChunkerOptions = {},
): string[] {
  const maxChars = options.maxTextChars ?? MAX_TEXT_CHARS;

  if (text.length <= maxChars) {
    const trimmed = text.trim();
    return trimmed ? [trimmed] : [];
  }

  // First, try to extract code blocks and treat them specially
  const segments = splitPreservingCodeBlocks(text);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const segment of segments) {
    if (segment.isCodeBlock) {
      // Code blocks: if adding would exceed limit, flush current chunk first
      if (currentChunk.length + segment.text.length > maxChars) {
        if (currentChunk.trim()) {
          chunks.push(...splitPlainText(currentChunk.trim(), maxChars));
        }
        currentChunk = '';

        // If the code block itself exceeds the limit, it gets its own chunk
        if (segment.text.length > maxChars) {
          chunks.push(segment.text.slice(0, maxChars));
        } else {
          chunks.push(segment.text);
        }
      } else {
        currentChunk += segment.text;
      }
    } else {
      currentChunk += segment.text;

      // Flush if exceeding limit
      if (currentChunk.length > maxChars) {
        chunks.push(...splitPlainText(currentChunk.trim(), maxChars));
        currentChunk = '';
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(...splitPlainText(currentChunk.trim(), maxChars));
  }

  return chunks.filter((c) => c.trim().length > 0);
}

/**
 * Check if a card payload exceeds the Teams size limit.
 */
export function isCardOversized(
  card: Record<string, unknown>,
  options: ChunkerOptions = {},
): boolean {
  const maxBytes = options.maxCardBytes ?? MAX_CARD_BYTES;
  const json = JSON.stringify(card);
  return new TextEncoder().encode(json).byteLength > maxBytes;
}

// ── Internal helpers ─────────────────────────────────────────────────

interface TextSegment {
  text: string;
  isCodeBlock: boolean;
}

/**
 * Split text into segments, marking code blocks to avoid splitting them.
 */
function splitPreservingCodeBlocks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const codeBlockRegex = /```[\s\S]*?```/g;
  let lastIndex = 0;

  for (const match of text.matchAll(codeBlockRegex)) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, matchIndex),
        isCodeBlock: false,
      });
    }
    segments.push({
      text: match[0],
      isCodeBlock: true,
    });
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      isCodeBlock: false,
    });
  }

  return segments;
}

/**
 * Split plain text at paragraph, line, or word boundaries.
 */
function splitPlainText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) {
    return text.trim() ? [text.trim()] : [];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    const splitIndex = findSplitIndex(remaining, maxChars);
    const chunk = remaining.slice(0, splitIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining.trim()) {
    chunks.push(remaining.trim());
  }

  return chunks;
}

/**
 * Find the best split index within maxChars.
 * Priority: paragraph > line > word > hard split.
 */
function findSplitIndex(text: string, maxChars: number): number {
  const searchRange = text.slice(0, maxChars);

  // Try paragraph boundary (double newline)
  const paraIndex = searchRange.lastIndexOf('\n\n');
  if (paraIndex > maxChars * 0.3) {
    return paraIndex + 2; // Include the double newline
  }

  // Try line boundary
  const lineIndex = searchRange.lastIndexOf('\n');
  if (lineIndex > maxChars * 0.3) {
    return lineIndex + 1;
  }

  // Try word boundary
  const wordIndex = searchRange.lastIndexOf(' ');
  if (wordIndex > maxChars * 0.3) {
    return wordIndex + 1;
  }

  // Hard split
  return maxChars;
}
