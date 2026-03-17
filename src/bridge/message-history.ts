/**
 * Message history tracker for per-session conversation context.
 *
 * Tracks the last N messages per session to maintain multi-turn
 * conversation coherence.
 */

import type { TrackedMessage, IMessageHistory } from './types.js';

const DEFAULT_MAX_MESSAGES = 50;

/**
 * In-memory message history tracker.
 */
export class MessageHistory implements IMessageHistory {
  private readonly history = new Map<string, TrackedMessage[]>();
  private readonly maxMessages: number;

  constructor(maxMessages?: number) {
    this.maxMessages = maxMessages ?? DEFAULT_MAX_MESSAGES;
  }

  /**
   * Add a message to the session history.
   * Evicts the oldest message if the limit is exceeded.
   */
  add(sessionId: string, message: TrackedMessage): void {
    let messages = this.history.get(sessionId);
    if (!messages) {
      messages = [];
      this.history.set(sessionId, messages);
    }

    messages.push(message);

    // Evict oldest when exceeding limit
    while (messages.length > this.maxMessages) {
      messages.shift();
    }
  }

  /**
   * Get all messages for a session.
   */
  get(sessionId: string): TrackedMessage[] {
    return this.history.get(sessionId) ?? [];
  }

  /**
   * Clear history for a session.
   */
  clear(sessionId: string): void {
    this.history.delete(sessionId);
  }

  /**
   * Get the total number of tracked sessions.
   */
  get sessionCount(): number {
    return this.history.size;
  }
}
