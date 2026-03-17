/**
 * Session manager: maintains a pool of per-user Claude Code sessions.
 *
 * Enforces:
 * - One active session per user
 * - Max concurrent sessions limit
 * - Session lifecycle (create, send, stop, shutdown)
 */

import type { RateLimitConfig, ClaudeConfig } from '../config/schema.js';
import type {
  ISessionManager,
  Session,
  SessionOptions,
  SessionInfo,
  OutputEventCallback,
} from './types.js';
import { SessionState } from './types.js';
import { SessionFactory, type SessionFactoryDeps } from './session-factory.js';
import type { QueryFunction } from './claude-sdk-types.js';
import { getLogger } from '../logging/logger.js';

export interface SessionManagerConfig {
  claudeConfig: ClaudeConfig;
  rateLimitConfig: RateLimitConfig;
  queryFn: QueryFunction;
  onOutput: OutputEventCallback;
  onPermissionRequest?: (
    userId: string,
    requestId: string,
    toolName: string,
    input: Record<string, unknown>,
  ) => void;
}

export class SessionManager implements ISessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly factory: SessionFactory;
  private readonly maxConcurrent: number;
  private readonly logger = getLogger().child({ component: 'session-manager' });

  constructor(config: SessionManagerConfig) {
    const factoryDeps: SessionFactoryDeps = {
      claudeConfig: config.claudeConfig,
      queryFn: config.queryFn,
      onOutput: config.onOutput,
      onPermissionRequest: config.onPermissionRequest,
    };
    this.factory = new SessionFactory(factoryDeps);
    this.maxConcurrent = config.rateLimitConfig.maxConcurrentSessions;
  }

  /**
   * Get or create a session for the given user.
   * If the user already has an active session, return it.
   * If the max concurrent limit is reached, throw an error.
   */
  async getOrCreate(userId: string, options?: SessionOptions): Promise<Session> {
    // Check for existing session
    const existing = this.sessions.get(userId);
    if (existing && existing.state !== SessionState.Stopped) {
      this.logger.debug({ userId, sessionId: existing.id }, 'Returning existing session');
      return existing;
    }

    // Clean up stopped session if any
    if (existing) {
      this.sessions.delete(userId);
    }

    // Check concurrent limit
    const activeCount = this.getActiveSessionCount();
    if (activeCount >= this.maxConcurrent) {
      throw new Error(
        `Maximum concurrent sessions (${this.maxConcurrent}) reached. ` +
        'Stop an existing session first.',
      );
    }

    // Create new session
    const session = this.factory.createSession(userId, options);
    this.sessions.set(userId, session);

    this.logger.info(
      { userId, sessionId: session.id },
      'Session created',
    );

    return session;
  }

  /**
   * Send a message to the user's active session.
   * Creates a session if none exists.
   */
  async send(userId: string, message: string): Promise<void> {
    const session = await this.getOrCreate(userId);

    if (session.state === SessionState.Stopped) {
      throw new Error('Session is stopped. Start a new session with /new.');
    }

    if (session.inputAdapter.isClosed) {
      throw new Error('Session input is closed. Start a new session with /new.');
    }

    session.inputAdapter.push(message);
    session.lastActiveAt = new Date();

    this.logger.info(
      { userId, sessionId: session.id, messageLength: message.length },
      'Message sent to session',
    );
  }

  /**
   * Stop the user's active session.
   */
  async stop(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) {
      this.logger.debug({ userId }, 'No session to stop');
      return;
    }

    this.logger.info({ userId, sessionId: session.id }, 'Stopping session');

    session.state = SessionState.Stopped;
    session.inputAdapter.close();
    session.abortController.abort();

    // Keep in map for status queries; will be replaced on next getOrCreate
  }

  /**
   * List all sessions as serialisable info objects.
   */
  list(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      userId: s.userId,
      state: s.state,
      workingDir: s.workingDir,
      model: s.model,
      permissionMode: s.permissionMode,
      createdAt: s.createdAt.toISOString(),
      lastActiveAt: s.lastActiveAt.toISOString(),
      totalCost: s.totalCost,
      turnCount: s.turnCount,
    }));
  }

  /**
   * Get the session for a specific user (if any).
   */
  getSession(userId: string): Session | undefined {
    return this.sessions.get(userId);
  }

  /**
   * Shut down all sessions gracefully.
   */
  async shutdown(): Promise<void> {
    this.logger.info(
      { sessionCount: this.sessions.size },
      'Shutting down all sessions',
    );

    const stopPromises: Promise<void>[] = [];
    for (const userId of this.sessions.keys()) {
      stopPromises.push(this.stop(userId));
    }
    await Promise.all(stopPromises);
  }

  /**
   * Count active (non-stopped) sessions.
   */
  private getActiveSessionCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.state !== SessionState.Stopped) {
        count++;
      }
    }
    return count;
  }
}
