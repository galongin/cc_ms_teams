/**
 * Bridge types for bidirectional message transformation
 * between Microsoft Teams and Claude Code.
 */

import type { OutputEvent } from '../session/types.js';

// ── Message context ──────────────────────────────────────────────────

/** Context for a message flowing through the bridge. */
export interface MessageContext {
  /** Teams user AAD object ID. */
  userId: string;
  /** Teams conversation ID. */
  conversationId: string;
  /** Session ID (if an active session exists). */
  sessionId?: string;
  /** Activity/message ID (for reply threading). */
  messageId?: string;
}

// ── Teams content ────────────────────────────────────────────────────

/** Content item that can be sent to Teams. */
export type TeamsContent =
  | TeamsTextContent
  | TeamsCardContent
  | TeamsUpdateContent;

export interface TeamsTextContent {
  type: 'text';
  text: string;
}

export interface TeamsCardContent {
  type: 'card';
  card: Record<string, unknown>;
}

export interface TeamsUpdateContent {
  type: 'update';
  text: string;
  replyToId: string;
}

// ── Claude content ───────────────────────────────────────────────────

/** Content item received from Claude. */
export interface ClaudeContent {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'error';
  content: string;
  metadata?: Record<string, unknown>;
}

// ── Stream state ─────────────────────────────────────────────────────

/** State tracked for progressive streaming updates. */
export interface StreamState {
  /** Accumulated text buffered so far. */
  bufferedText: string;
  /** Pending TeamsContent items not yet sent. */
  pendingUpdates: TeamsContent[];
  /** The activity ID of the current message being updated. */
  currentMessageId?: string;
  /** Whether streaming is active. */
  isStreaming: boolean;
}

// ── Stream batcher ───────────────────────────────────────────────────

/** Callback invoked when a batch of content is ready to send. */
export type BatchFlushCallback = (content: TeamsContent[]) => Promise<void>;

/** Stream batcher that accumulates text and flushes in batches. */
export interface StreamBatcher {
  /** Push a text token into the buffer. */
  push(token: string): void;
  /** Push a tool use event (triggers immediate flush of text). */
  pushToolUse(toolName: string, input: Record<string, unknown>): void;
  /** Force flush any buffered content. */
  flush(): Promise<TeamsContent[]>;
  /** Stop the batcher and flush remaining content. */
  stop(): Promise<TeamsContent[]>;
}

// ── Stream batcher options ───────────────────────────────────────────

export interface StreamBatcherOptions {
  /** Flush interval in milliseconds (default: 500). */
  flushIntervalMs?: number;
  /** Character threshold to trigger flush (default: 200). */
  charThreshold?: number;
  /** Callback invoked on each flush. */
  onFlush?: BatchFlushCallback;
}

// ── Message bridge interface ─────────────────────────────────────────

/** The bridge that wires Teams <-> Claude message transformation. */
export interface IMessageBridge {
  /** Transform a Teams message and push it to the Claude session. */
  handleTeamsMessage(context: MessageContext, text: string): Promise<string>;
  /** Transform a Claude output event into Teams content and send it. */
  handleClaudeOutput(
    context: MessageContext,
    event: OutputEvent,
  ): Promise<void>;
  /** Start streaming mode for a session. */
  startStreaming(sessionId: string): void;
  /** Stop streaming mode for a session. */
  stopStreaming(sessionId: string): Promise<void>;
}

// ── Message history ──────────────────────────────────────────────────

/** A tracked message in conversation history. */
export interface TrackedMessage {
  /** The activity ID of the message. */
  activityId: string;
  /** Role: user or assistant. */
  role: 'user' | 'assistant';
  /** Truncated text preview. */
  preview: string;
  /** Timestamp. */
  timestamp: number;
}

/** Per-session message history tracker. */
export interface IMessageHistory {
  /** Add a message to the history. */
  add(sessionId: string, message: TrackedMessage): void;
  /** Get messages for a session. */
  get(sessionId: string): TrackedMessage[];
  /** Clear history for a session. */
  clear(sessionId: string): void;
}
