/**
 * Stream input adapter for the Claude Agent SDK.
 *
 * Wraps an AsyncQueue to produce an AsyncIterable<SDKUserMessage>.
 * The activity handler calls push(text) for each Teams message;
 * the SDK query() consumes messages via for-await-of.
 */

import { AsyncQueue } from '../utils/async-queue.js';
import type { SDKUserMessage } from './claude-sdk-types.js';

/** Adapter interface for pushing user messages into a session. */
export interface StreamInputAdapter {
  /** Push a new user message into the stream. */
  push(message: string): void;
  /** Signal that no more messages will be sent. */
  close(): void;
  /** Whether the adapter has been closed. */
  readonly isClosed: boolean;
  /** Async iterator protocol (consumed by the SDK). */
  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage>;
}

/**
 * Concrete implementation backed by AsyncQueue<SDKUserMessage>.
 */
export class StreamInputAdapterImpl implements StreamInputAdapter {
  private readonly queue = new AsyncQueue<SDKUserMessage>();

  /**
   * Push a plain text message, converting it to the SDK's expected format.
   */
  push(message: string): void {
    this.queue.push({
      type: 'user',
      message: {
        role: 'user',
        content: message,
      },
    });
  }

  /** Signal end of input. */
  close(): void {
    this.queue.close();
  }

  /** Whether the adapter has been closed. */
  get isClosed(): boolean {
    return this.queue.isClosed;
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return this.queue[Symbol.asyncIterator]();
  }
}
