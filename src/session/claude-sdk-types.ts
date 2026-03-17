/**
 * Type definitions for the Claude Agent SDK.
 *
 * These interfaces model the expected API of @anthropic-ai/claude-agent-sdk.
 * When the real SDK is published, this file can be replaced with:
 *   import type { ... } from '@anthropic-ai/claude-agent-sdk';
 */

// ── Prompt / Input types ──────────────────────────────────────────────

/** A user message pushed into the streaming input adapter. */
export interface SDKUserMessage {
  type: 'user';
  message: {
    role: 'user';
    content: string;
  };
}

// ── Output message types ──────────────────────────────────────────────

export interface SDKTextBlock {
  type: 'text';
  text: string;
}

export interface SDKToolUseSummary {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface SDKToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface SDKThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export type SDKContentBlock = SDKTextBlock | SDKToolUseSummary | SDKToolResultBlock | SDKThinkingBlock;

/** An assistant message from the query output iterator. */
export interface SDKAssistantMessage {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: SDKContentBlock[];
    model?: string;
    stop_reason?: string;
  };
}

/** A result message signalling the query has completed or paused. */
export interface SDKResultMessage {
  type: 'result';
  subtype: 'success' | 'error' | 'end_turn' | 'max_turns';
  cost_usd?: number;
  duration_ms?: number;
  session_id?: string;
  is_done?: boolean;
}

export type SDKOutputMessage = SDKAssistantMessage | SDKResultMessage;

// ── Permission callback types ─────────────────────────────────────────

export interface PermissionAllowResponse {
  behavior: 'allow';
}

export interface PermissionDenyResponse {
  behavior: 'deny';
  message?: string;
}

export type PermissionResponse = PermissionAllowResponse | PermissionDenyResponse;

export type CanUseToolCallback = (
  toolName: string,
  input: Record<string, unknown>,
) => Promise<PermissionResponse>;

// ── Permission mode (matches SDK enum) ────────────────────────────────

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';

// ── System prompt types ───────────────────────────────────────────────

export interface PresetSystemPrompt {
  type: 'preset';
  preset: 'claude_code';
  append?: string;
}

export type SystemPromptConfig = PresetSystemPrompt | string;

// ── Query options ─────────────────────────────────────────────────────

export interface QueryOptions {
  prompt: AsyncIterable<SDKUserMessage>;
  options: {
    cwd: string;
    model: string;
    maxTurns: number;
    maxBudgetUsd: number;
    allowedTools: string[];
    includePartialMessages?: boolean;
    permissionMode: PermissionMode;
    systemPrompt: SystemPromptConfig;
    canUseTool?: CanUseToolCallback;
    abortSignal?: AbortSignal;
  };
}

/** The Query object returned by query(). Its async iterator yields output messages. */
export interface Query extends AsyncIterable<SDKOutputMessage> {
  abort(): void;
}

/**
 * Placeholder for the SDK query() function.
 *
 * In production, this would be:
 *   import { query } from '@anthropic-ai/claude-agent-sdk';
 *
 * The mock implementation is in tests/mocks/claude-sdk.ts.
 */
export type QueryFunction = (opts: QueryOptions) => Query;
