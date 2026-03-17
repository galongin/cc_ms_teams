/**
 * Stream batcher for progressive message updates.
 *
 * Accumulates text chunks from Claude streaming output and flushes
 * them in batches based on time interval or character threshold.
 */

import type {
  StreamBatcher,
  StreamBatcherOptions,
  TeamsContent,
  BatchFlushCallback,
} from './types.js';

const DEFAULT_FLUSH_INTERVAL_MS = 500;
const DEFAULT_CHAR_THRESHOLD = 200;

/**
 * Stream batcher implementation that buffers text tokens
 * and flushes on timer or size threshold.
 */
export class StreamBatcherImpl implements StreamBatcher {
  private buffer = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushIntervalMs: number;
  private readonly charThreshold: number;
  private readonly onFlush: BatchFlushCallback | undefined;
  private stopped = false;

  constructor(options: StreamBatcherOptions = {}) {
    this.flushIntervalMs =
      options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.charThreshold = options.charThreshold ?? DEFAULT_CHAR_THRESHOLD;
    this.onFlush = options.onFlush;
  }

  /**
   * Push a text token into the buffer.
   * May trigger a flush if the character threshold is exceeded.
   */
  push(token: string): void {
    if (this.stopped) return;

    this.buffer += token;

    // Start timer if not already running
    if (!this.timer) {
      this.startTimer();
    }

    // Flush if character threshold exceeded
    if (this.buffer.length >= this.charThreshold) {
      void this.flushInternal();
    }
  }

  /**
   * Push a tool use event, which triggers an immediate flush of
   * any buffered text, then emits the tool use as a separate item.
   */
  pushToolUse(toolName: string, input: Record<string, unknown>): void {
    if (this.stopped) return;

    // Flush any pending text first
    void this.flushInternal();

    // Emit the tool use as a separate text message
    const inputSummary = Object.entries(input)
      .map(([k, v]) => `  \`${k}\`: ${typeof v === 'string' ? v.slice(0, 80) : JSON.stringify(v)}`)
      .join('\n');

    const content: TeamsContent = {
      type: 'text',
      text: `**Using tool:** \`${toolName}\`\n${inputSummary}`,
    };

    if (this.onFlush) {
      void this.onFlush([content]);
    }
  }

  /**
   * Force flush any buffered content.
   * Returns the flushed content items.
   */
  async flush(): Promise<TeamsContent[]> {
    return this.flushInternal();
  }

  /**
   * Stop the batcher and flush all remaining content.
   */
  async stop(): Promise<TeamsContent[]> {
    this.stopped = true;
    this.clearTimer();
    return this.flushInternal();
  }

  // ── Private ──────────────────────────────────────────────────────

  private async flushInternal(): Promise<TeamsContent[]> {
    this.clearTimer();

    if (!this.buffer) {
      return [];
    }

    const text = this.buffer;
    this.buffer = '';

    const items: TeamsContent[] = [{ type: 'text', text }];

    if (this.onFlush) {
      await this.onFlush(items);
    }

    return items;
  }

  private startTimer(): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flushInternal();
    }, this.flushIntervalMs);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
