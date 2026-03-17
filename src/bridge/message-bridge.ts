/**
 * Message bridge orchestrator.
 *
 * Wires together transformers, stream batcher, and content chunker
 * to handle the full bidirectional message flow between Teams and Claude.
 */

import type {
  IMessageBridge,
  MessageContext,
  StreamState,
  TeamsContent,
  StreamBatcherOptions,
} from './types.js';
import type { OutputEvent } from '../session/types.js';
import type { ProactiveSender } from '../bot/proactive-sender.js';
import { transformTeamsToClaudeMessage } from './teams-to-claude.js';
import { transformClaudeToTeamsContent } from './claude-to-teams.js';
import { StreamBatcherImpl } from './stream-batcher.js';
import { chunkText } from './content-chunker.js';
import { MessageHistory } from './message-history.js';
import { getLogger } from '../logging/logger.js';

/**
 * Dependencies for MessageBridge construction.
 */
export interface MessageBridgeDeps {
  proactiveSender: ProactiveSender;
  streamingOptions?: StreamBatcherOptions;
}

/**
 * MessageBridge orchestrates the transformation and delivery of
 * messages between Teams and Claude Code.
 */
export class MessageBridge implements IMessageBridge {
  private readonly logger = getLogger().child({ component: 'message-bridge' });
  private readonly proactiveSender: ProactiveSender;
  private readonly streamingOptions: StreamBatcherOptions;
  private readonly streamStates = new Map<string, StreamState>();
  private readonly batchers = new Map<string, StreamBatcherImpl>();
  private readonly messageHistory = new MessageHistory();

  constructor(deps: MessageBridgeDeps) {
    this.proactiveSender = deps.proactiveSender;
    this.streamingOptions = deps.streamingOptions ?? {};
  }

  /**
   * Transform a Teams message into a clean Claude prompt string.
   * Records the message in history.
   */
  async handleTeamsMessage(
    context: MessageContext,
    text: string,
  ): Promise<string> {
    const cleaned = transformTeamsToClaudeMessage(text);

    // Track in message history
    if (context.sessionId) {
      this.messageHistory.add(context.sessionId, {
        activityId: context.messageId ?? '',
        role: 'user',
        preview: cleaned.slice(0, 100),
        timestamp: Date.now(),
      });
    }

    this.logger.debug(
      { userId: context.userId, originalLength: text.length, cleanedLength: cleaned.length },
      'Transformed Teams message to Claude prompt',
    );

    return cleaned;
  }

  /**
   * Transform a Claude output event into Teams content and send it.
   * Handles progressive message updates during streaming.
   */
  async handleClaudeOutput(
    context: MessageContext,
    event: OutputEvent,
  ): Promise<void> {
    const sessionId = context.sessionId ?? context.userId;
    const state = this.streamStates.get(sessionId);

    // If streaming and this is a text event, route through batcher
    if (state?.isStreaming && event.type === 'text') {
      const batcher = this.batchers.get(sessionId);
      if (batcher) {
        batcher.push(event.text);
        return;
      }
    }

    // If streaming and this is a tool_use event, notify the batcher
    if (state?.isStreaming && event.type === 'tool_use') {
      const batcher = this.batchers.get(sessionId);
      if (batcher) {
        batcher.pushToolUse(event.toolName, event.input);
      }
    }

    // Transform event to Teams content
    const items = transformClaudeToTeamsContent(event);

    // Send each item, chunking if needed
    for (const item of items) {
      await this.sendContent(context, item, sessionId);
    }

    // Track assistant messages in history
    if (context.sessionId && event.type === 'text') {
      this.messageHistory.add(context.sessionId, {
        activityId: '',
        role: 'assistant',
        preview: event.text.slice(0, 100),
        timestamp: Date.now(),
      });
    }

    // On result event, stop streaming
    if (event.type === 'result') {
      await this.stopStreaming(sessionId);
    }
  }

  /**
   * Start streaming mode for a session.
   * Creates a stream batcher and sets up progressive message updates.
   */
  startStreaming(sessionId: string): void {
    // Initialize stream state
    this.streamStates.set(sessionId, {
      bufferedText: '',
      pendingUpdates: [],
      isStreaming: true,
    });

    // Create a batcher for this session
    const batcher = new StreamBatcherImpl({
      ...this.streamingOptions,
      onFlush: async (items) => {
        await this.handleBatchFlush(sessionId, items);
      },
    });

    this.batchers.set(sessionId, batcher);

    this.logger.debug({ sessionId }, 'Streaming started');
  }

  /**
   * Stop streaming mode for a session.
   * Flushes remaining content and cleans up.
   */
  async stopStreaming(sessionId: string): Promise<void> {
    const batcher = this.batchers.get(sessionId);
    if (batcher) {
      await batcher.stop();
      this.batchers.delete(sessionId);
    }

    const state = this.streamStates.get(sessionId);
    if (state) {
      state.isStreaming = false;
    }
    this.streamStates.delete(sessionId);

    this.logger.debug({ sessionId }, 'Streaming stopped');
  }

  /**
   * Get the message history tracker (for external access).
   */
  getMessageHistory(): MessageHistory {
    return this.messageHistory;
  }

  // ── Private ──────────────────────────────────────────────────────

  /**
   * Handle a batch flush from the stream batcher.
   * Implements progressive message updates.
   */
  private async handleBatchFlush(
    sessionId: string,
    items: TeamsContent[],
  ): Promise<void> {
    const state = this.streamStates.get(sessionId);
    if (!state) return;

    for (const item of items) {
      if (item.type === 'text') {
        // Accumulate text for progressive updates
        state.bufferedText += item.text;

        if (state.currentMessageId) {
          // Update existing message with accumulated text
          try {
            await this.proactiveSender.updateMessage(
              sessionId,
              state.bufferedText,
            );
          } catch {
            // If update fails, send as new message
            await this.proactiveSender.sendText(sessionId, item.text);
          }
        } else {
          // First text batch: send new message
          await this.proactiveSender.sendText(sessionId, state.bufferedText);
          // In a real implementation, we'd capture the activity ID here
          state.currentMessageId = `msg-${Date.now()}`;
        }
      } else {
        // Non-text items: send as separate new messages
        if (item.type === 'card') {
          await this.proactiveSender.sendCard(sessionId, item.card);
        }
      }
    }
  }

  /**
   * Send a TeamsContent item, chunking text if it exceeds limits.
   */
  private async sendContent(
    context: MessageContext,
    item: TeamsContent,
    _sessionId: string,
  ): Promise<void> {
    if (item.type === 'text') {
      const chunks = chunkText(item.text);
      for (const chunk of chunks) {
        await this.proactiveSender.sendText(context.userId, chunk);
      }
    } else if (item.type === 'card') {
      await this.proactiveSender.sendCard(context.userId, item.card);
    }
  }
}
