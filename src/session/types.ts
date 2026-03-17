/**
 * Session management types.
 *
 * Defines the interfaces for session lifecycle, state machine,
 * output events, and the session manager contract.
 */

import type {
  Query,
  PermissionMode,
} from './claude-sdk-types.js';
import type { StreamInputAdapter } from './stream-input-adapter.js';

// ── Session state machine ─────────────────────────────────────────────

export enum SessionState {
  /** Session is created but not actively processing. */
  Idle = 'idle',
  /** Claude is processing a turn. */
  Processing = 'processing',
  /** Waiting for user to approve a tool permission. */
  WaitingPermission = 'waiting_permission',
  /** Session has been stopped. */
  Stopped = 'stopped',
}

// ── Session ───────────────────────────────────────────────────────────

export interface Session {
  /** Unique session identifier. */
  id: string;
  /** The userId that owns this session. */
  userId: string;
  /** Current session state. */
  state: SessionState;
  /** Working directory for Claude Code. */
  workingDir: string;
  /** Claude model in use. */
  model: string;
  /** Permission mode for this session. */
  permissionMode: PermissionMode;
  /** When the session was created. */
  createdAt: Date;
  /** Last activity timestamp. */
  lastActiveAt: Date;
  /** Cumulative cost in USD. */
  totalCost: number;
  /** Number of turns processed. */
  turnCount: number;
  /** Tools explicitly overridden to "always allow". */
  allowedToolsOverrides: Set<string>;
  /** The configured allowed tools list. */
  allowedTools: string[];
  /** The query stream input adapter. */
  inputAdapter: StreamInputAdapter;
  /** The SDK query object (async iterator of output messages). */
  query: Query | null;
  /** Abort controller for the session. */
  abortController: AbortController;
}

// ── Session options ───────────────────────────────────────────────────

export interface SessionOptions {
  /** Allowed tools list (defaults to config default). */
  allowedTools?: string[];
  /** Permission mode (defaults to config default). */
  permissionMode?: PermissionMode;
  /** Working directory (defaults to config default). */
  workingDir?: string;
  /** Max turns per query. */
  maxTurns?: number;
  /** Max spend per query in USD. */
  maxBudgetUsd?: number;
  /** Claude model to use. */
  model?: string;
  /** Optional system prompt append text. */
  systemPromptAppend?: string;
}

// ── Session info (serialisable subset) ────────────────────────────────

export interface SessionInfo {
  id: string;
  userId: string;
  state: SessionState;
  workingDir: string;
  model: string;
  permissionMode: PermissionMode;
  createdAt: string;
  lastActiveAt: string;
  totalCost: number;
  turnCount: number;
}

// ── Output events ─────────────────────────────────────────────────────

export interface TextOutputEvent {
  type: 'text';
  text: string;
  sessionId: string;
}

export interface ToolUseOutputEvent {
  type: 'tool_use';
  toolName: string;
  toolId: string;
  input: Record<string, unknown>;
  sessionId: string;
}

export interface ToolResultOutputEvent {
  type: 'tool_result';
  toolId: string;
  content: string;
  isError: boolean;
  sessionId: string;
}

export interface ErrorOutputEvent {
  type: 'error';
  message: string;
  sessionId: string;
}

export interface ThinkingOutputEvent {
  type: 'thinking';
  text: string;
  sessionId: string;
}

export interface ResultOutputEvent {
  type: 'result';
  subtype: 'success' | 'error' | 'end_turn' | 'max_turns';
  costUsd: number;
  durationMs: number;
  sessionId: string;
}

export type OutputEvent =
  | TextOutputEvent
  | ToolUseOutputEvent
  | ToolResultOutputEvent
  | ErrorOutputEvent
  | ThinkingOutputEvent
  | ResultOutputEvent;

/** Callback invoked for each output event. */
export type OutputEventCallback = (event: OutputEvent) => void | Promise<void>;

// ── Session manager interface ─────────────────────────────────────────

export interface ISessionManager {
  /** Get or create a session for the given user. */
  getOrCreate(userId: string, options?: SessionOptions): Promise<Session>;
  /** Send a message to the user's active session. */
  send(userId: string, message: string): Promise<void>;
  /** Stop the user's active session. */
  stop(userId: string): Promise<void>;
  /** List all active sessions. */
  list(): SessionInfo[];
  /** Get the session for a specific user (if any). */
  getSession(userId: string): Session | undefined;
  /** Shut down all sessions. */
  shutdown(): Promise<void>;
}
