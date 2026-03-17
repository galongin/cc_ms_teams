/**
 * Session factory: creates Claude SDK query sessions.
 *
 * Configures the query() call with streaming input mode, tool
 * permissions, working directory, model, and budget limits.
 *
 * NOTE: The actual SDK query() function is injected as a dependency
 * so that tests can provide a mock implementation.
 */

import { randomUUID } from 'node:crypto';
import type { ClaudeConfig } from '../config/schema.js';
import type {
  QueryFunction,
  QueryOptions,
  Query,
} from './claude-sdk-types.js';
import type { Session, SessionOptions, OutputEventCallback } from './types.js';
import { SessionState } from './types.js';
import { StreamInputAdapterImpl } from './stream-input-adapter.js';
import { PermissionHandler } from './permission-handler.js';
import { permissionModeToTier, getToolsForTier } from './tool-permissions.js';
import { processOutputLoop } from './output-processor.js';
import { getLogger } from '../logging/logger.js';

export interface SessionFactoryDeps {
  /** The Claude config from the application config. */
  claudeConfig: ClaudeConfig;
  /** The SDK query function (injectable for testing). */
  queryFn: QueryFunction;
  /** Callback for output events (wired to message bridge / Teams sender). */
  onOutput: OutputEventCallback;
  /** Callback when a permission request needs to be sent to the user. */
  onPermissionRequest?: (
    userId: string,
    requestId: string,
    toolName: string,
    input: Record<string, unknown>,
  ) => void;
}

export class SessionFactory {
  private readonly logger = getLogger().child({ component: 'session-factory' });

  constructor(private readonly deps: SessionFactoryDeps) {}

  /**
   * Create a new session for the given user.
   *
   * Sets up the streaming input adapter, permission handler,
   * and starts the query with the output processor loop.
   */
  createSession(userId: string, options: SessionOptions = {}): Session {
    const config = this.deps.claudeConfig;
    const sessionId = randomUUID();

    const permissionMode = options.permissionMode ?? config.defaultPermissionMode;
    const tier = permissionModeToTier(permissionMode);
    const allowedTools = options.allowedTools ?? getToolsForTier(tier);
    const workingDir = options.workingDir ?? config.defaultCwd;
    const model = options.model ?? config.defaultModel;
    const maxTurns = options.maxTurns ?? config.defaultMaxTurns;
    const maxBudgetUsd = options.maxBudgetUsd ?? config.defaultMaxBudgetUsd;

    const inputAdapter = new StreamInputAdapterImpl();
    const abortController = new AbortController();
    const overrides = new Set<string>();

    const permissionHandler = new PermissionHandler({
      tier,
      overrides,
      onPermissionRequest: (requestId, toolName, input) => {
        if (this.deps.onPermissionRequest) {
          this.deps.onPermissionRequest(userId, requestId, toolName, input);
        }
      },
    });

    // Build query options
    const queryOptions: QueryOptions = {
      prompt: inputAdapter,
      options: {
        cwd: workingDir,
        model,
        maxTurns,
        maxBudgetUsd,
        allowedTools,
        includePartialMessages: true,
        permissionMode,
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: options.systemPromptAppend ?? config.systemPromptAppend,
        },
        canUseTool: permissionHandler.createCallback(),
        abortSignal: abortController.signal,
      },
    };

    this.logger.info(
      { sessionId, userId, model, workingDir, tier },
      'Creating session',
    );

    // Create the SDK query
    const query: Query = this.deps.queryFn(queryOptions);

    const session: Session = {
      id: sessionId,
      userId,
      state: SessionState.Idle,
      workingDir,
      model,
      permissionMode,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      totalCost: 0,
      turnCount: 0,
      allowedToolsOverrides: overrides,
      allowedTools,
      inputAdapter,
      query,
      abortController,
    };

    // Start the output processing loop (fire and forget)
    processOutputLoop(session, this.deps.onOutput).catch((err) => {
      this.logger.error(
        { sessionId, err: err instanceof Error ? err.message : String(err) },
        'Output loop crashed',
      );
    });

    return session;
  }
}
