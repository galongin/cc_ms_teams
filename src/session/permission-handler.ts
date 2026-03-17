/**
 * Permission handler for Claude Code tool use requests.
 *
 * Implements the canUseTool callback pattern:
 * - Auto-approves tools in the session's allowed list
 * - Sends permission request for other tools
 * - Supports "always allow" persistent overrides
 * - Handles timeouts (default 5 minutes)
 */

import type { PermissionResponse, CanUseToolCallback } from './claude-sdk-types.js';
import { isToolAllowed, isBlockedPath, type ToolTier } from './tool-permissions.js';
import { getLogger } from '../logging/logger.js';

/** Pending permission request awaiting user response. */
interface PendingRequest {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  resolve: (response: PermissionResponse) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

/** Decision from the user for a pending permission request. */
export type PermissionDecision = 'allow' | 'deny' | 'always_allow';

export interface PermissionHandlerOptions {
  /** Tool tier for auto-approval. */
  tier: ToolTier;
  /** User overrides (tools marked "always allow"). */
  overrides: Set<string>;
  /** Timeout in ms for permission requests (default: 5 minutes). */
  timeoutMs?: number;
  /** Callback invoked when a permission request is sent to the user. */
  onPermissionRequest?: (requestId: string, toolName: string, input: Record<string, unknown>) => void;
}

export class PermissionHandler {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly logger = getLogger().child({ component: 'permission-handler' });
  private readonly tier: ToolTier;
  private readonly overrides: Set<string>;
  private readonly timeoutMs: number;
  private readonly onPermissionRequest?: (requestId: string, toolName: string, input: Record<string, unknown>) => void;
  private requestCounter = 0;

  constructor(options: PermissionHandlerOptions) {
    this.tier = options.tier;
    this.overrides = options.overrides;
    this.timeoutMs = options.timeoutMs ?? 5 * 60 * 1000; // 5 minutes
    this.onPermissionRequest = options.onPermissionRequest;
  }

  /**
   * Create the canUseTool callback for the SDK.
   */
  createCallback(): CanUseToolCallback {
    return async (toolName: string, input: Record<string, unknown>): Promise<PermissionResponse> => {
      return this.handleToolRequest(toolName, input);
    };
  }

  /**
   * Handle a tool use request.
   * Returns immediately for allowed tools, or waits for user response.
   */
  async handleToolRequest(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<PermissionResponse> {
    // Check blocked paths first
    const filePath = this.extractFilePath(toolName, input);
    if (filePath && isBlockedPath(filePath)) {
      this.logger.warn({ toolName, filePath }, 'Blocked path access attempt');
      return { behavior: 'deny', message: `Access to ${filePath} is blocked for security.` };
    }

    // Auto-approve if tool is in the tier's allowed list or user overrides
    if (isToolAllowed(toolName, this.tier, this.overrides)) {
      return { behavior: 'allow' };
    }

    // Special case: Bash tool with "ls" command in readonly/standard tier
    if (toolName === 'Bash' && this.isBashLsOnly(input)) {
      return { behavior: 'allow' };
    }

    // Need user permission
    return this.requestPermission(toolName, input);
  }

  /**
   * Create a pending permission request and wait for user response.
   */
  requestPermission(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<PermissionResponse> {
    const requestId = `perm-${++this.requestCounter}-${Date.now()}`;

    this.logger.info({ requestId, toolName }, 'Requesting permission from user');

    return new Promise<PermissionResponse>((resolve) => {
      const timeoutId = setTimeout(() => {
        this.logger.info({ requestId, toolName }, 'Permission request timed out, denying');
        this.pending.delete(requestId);
        resolve({ behavior: 'deny', message: 'Permission request timed out.' });
      }, this.timeoutMs);

      const request: PendingRequest = {
        requestId,
        toolName,
        input,
        resolve,
        timeoutId,
      };

      this.pending.set(requestId, request);

      // Notify caller (e.g., to send an Adaptive Card to Teams)
      if (this.onPermissionRequest) {
        this.onPermissionRequest(requestId, toolName, input);
      }
    });
  }

  /**
   * Resolve a pending permission request with the user's decision.
   */
  resolvePermission(
    requestId: string,
    decision: PermissionDecision,
  ): boolean {
    const request = this.pending.get(requestId);
    if (!request) {
      this.logger.warn({ requestId }, 'No pending permission request found');
      return false;
    }

    clearTimeout(request.timeoutId);
    this.pending.delete(requestId);

    this.logger.info(
      { requestId, toolName: request.toolName, decision },
      'Permission resolved',
    );

    switch (decision) {
      case 'allow':
        request.resolve({ behavior: 'allow' });
        break;
      case 'deny':
        request.resolve({ behavior: 'deny', message: 'User denied tool access.' });
        break;
      case 'always_allow':
        this.overrides.add(request.toolName);
        request.resolve({ behavior: 'allow' });
        break;
    }

    return true;
  }

  /**
   * Get all pending permission request IDs.
   */
  getPendingRequests(): Array<{ requestId: string; toolName: string }> {
    return Array.from(this.pending.values()).map((r) => ({
      requestId: r.requestId,
      toolName: r.toolName,
    }));
  }

  /**
   * Cancel all pending requests (e.g., on session stop).
   */
  cancelAll(): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timeoutId);
      request.resolve({ behavior: 'deny', message: 'Session stopped.' });
    }
    this.pending.clear();
  }

  /**
   * Extract file path from tool input for blocked-path checks.
   */
  private extractFilePath(
    toolName: string,
    input: Record<string, unknown>,
  ): string | null {
    if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') {
      const path = input['file_path'] ?? input['path'];
      return typeof path === 'string' ? path : null;
    }
    if (toolName === 'Grep' || toolName === 'Glob') {
      const path = input['path'];
      return typeof path === 'string' ? path : null;
    }
    return null;
  }

  /**
   * Check if a Bash tool invocation is just "ls" (allowed in readonly tier).
   */
  private isBashLsOnly(input: Record<string, unknown>): boolean {
    const command = input['command'];
    if (typeof command !== 'string') return false;
    const trimmed = command.trim();
    return trimmed === 'ls' || trimmed.startsWith('ls ') || trimmed.startsWith('ls\t');
  }
}
