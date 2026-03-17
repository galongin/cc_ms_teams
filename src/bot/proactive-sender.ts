/**
 * Proactive sender for Teams bot.
 *
 * Sends messages to users asynchronously, outside the normal request/response
 * cycle. Uses stored conversation references to reach users.
 */

import type { ConversationStore, ConversationReference } from './conversation-store.js';
import { retry } from '../utils/retry.js';
import { getLogger } from '../logging/logger.js';

/** An Adaptive Card attachment structure for Teams. */
export interface AdaptiveCardAttachment {
  contentType: 'application/vnd.microsoft.card.adaptive';
  content: Record<string, unknown>;
}

/** Options for sending a proactive message. */
export interface SendOptions {
  /** Timeout in milliseconds before giving up (default: 120000 = 2 min). */
  timeoutMs?: number;
}

/** A function that posts a message to a conversation via the Bot Framework REST API. */
export type MessagePoster = (
  serviceUrl: string,
  conversationId: string,
  botId: string,
  payload: ProactivePayload,
) => Promise<void>;

/** Payload for a proactive message. */
export interface ProactivePayload {
  type: 'message';
  text?: string;
  attachments?: AdaptiveCardAttachment[];
}

/**
 * Proactive sender that can push messages to users outside the request cycle.
 */
export class ProactiveSender {
  private logger = getLogger().child({ component: 'proactive-sender' });

  constructor(
    private conversationStore: ConversationStore,
    private messagePoster: MessagePoster,
  ) {}

  /**
   * Send a text message to a user by their AAD object ID.
   */
  async sendText(userId: string, text: string, options: SendOptions = {}): Promise<void> {
    const ref = this.getRefOrThrow(userId);
    await this.sendWithRetry(ref, { type: 'message', text }, options);
  }

  /**
   * Send an Adaptive Card to a user by their AAD object ID.
   */
  async sendCard(userId: string, card: Record<string, unknown>, options: SendOptions = {}): Promise<void> {
    const ref = this.getRefOrThrow(userId);
    const attachment: AdaptiveCardAttachment = {
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: card,
    };
    await this.sendWithRetry(
      ref,
      { type: 'message', attachments: [attachment] },
      options,
    );
  }

  /**
   * Update (edit-in-place) an existing message sent to a user.
   * For now, sends a new message since message updating requires activity IDs.
   */
  async updateMessage(userId: string, text: string, options: SendOptions = {}): Promise<void> {
    // Message editing requires tracking activity IDs from send responses.
    // For M2, we send a new message. Full edit-in-place comes in M4.
    await this.sendText(userId, text, options);
  }

  // --- Private ---

  private getRefOrThrow(userId: string): ConversationReference {
    const ref = this.conversationStore.get(userId);
    if (!ref) {
      throw new Error(`No conversation reference found for user ${userId}. The user must message the bot first.`);
    }
    return ref;
  }

  private async sendWithRetry(
    ref: ConversationReference,
    payload: ProactivePayload,
    options: SendOptions,
  ): Promise<void> {
    // timeoutMs reserved for future use with AbortController-based timeout
    void options.timeoutMs;

    await retry(
      async () => {
        try {
          await this.messagePoster(ref.serviceUrl, ref.conversationId, ref.botId, payload);
        } catch (err: unknown) {
          // Handle specific HTTP error codes
          if (isHttpError(err)) {
            if (err.statusCode === 403) {
              // Bot was removed from conversation
              this.logger.warn({ userId: ref.userId }, 'Bot removed from conversation (403), removing reference');
              this.conversationStore.delete(ref.userId);
              throw err; // Don't retry
            }
            if (err.statusCode === 429) {
              // Rate limited -- retry will handle backoff
              this.logger.warn({ userId: ref.userId }, 'Rate limited (429), will retry');
              throw err;
            }
          }
          throw err;
        }
      },
      {
        maxAttempts: 5,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffFactor: 2,
        shouldRetry: (err) => {
          // Don't retry on 403 (bot removed) or 404 (conversation gone)
          if (isHttpError(err) && (err.statusCode === 403 || err.statusCode === 404)) {
            return false;
          }
          return true;
        },
        onRetry: (err, attempt, delay) => {
          this.logger.warn(
            { err, attempt, delay, userId: ref.userId },
            'Retrying proactive message send',
          );
        },
      },
    );
  }
}

interface HttpError extends Error {
  statusCode: number;
}

function isHttpError(err: unknown): err is HttpError {
  return err instanceof Error && 'statusCode' in err && typeof (err as HttpError).statusCode === 'number';
}
