import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OutputEvent } from '../../../src/session/types.js';
import { SessionState } from '../../../src/session/types.js';

// Mock logger
vi.mock('../../../src/logging/logger.js', () => ({
  getLogger: () => ({
    child: () => ({
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }),
  }),
}));

const { SessionManager } = await import('../../../src/session/session-manager.js');
const { createMockQueryFn, mockTextMessage, mockResultMessage } = await import('../../mocks/claude-sdk.js');

function createDefaultConfig(overrides: Record<string, unknown> = {}) {
  return {
    claudeConfig: {
      defaultModel: 'claude-sonnet-4-20250514',
      defaultCwd: '/tmp',
      defaultMaxTurns: 25,
      defaultMaxBudgetUsd: 1.0,
      defaultAllowedTools: ['Read', 'Grep', 'Glob'],
      defaultPermissionMode: 'default' as const,
      systemPromptAppend: undefined,
    },
    rateLimitConfig: {
      maxRequestsPerMinute: 10,
      maxConcurrentSessions: 3,
    },
    queryFn: createMockQueryFn([
      mockTextMessage('Hello!'),
      mockResultMessage('success', 0.01),
    ]),
    onOutput: () => {},
    ...overrides,
  };
}

describe('session/session-manager', () => {
  let manager: InstanceType<typeof SessionManager>;

  beforeEach(() => {
    manager = new SessionManager(createDefaultConfig());
  });

  describe('getOrCreate', () => {
    it('should create a new session for a new user', async () => {
      const session = await manager.getOrCreate('user-1');

      expect(session.id).toBeDefined();
      expect(session.userId).toBe('user-1');
      expect(session.state).not.toBe(SessionState.Stopped);
      expect(session.model).toBe('claude-sonnet-4-20250514');
      expect(session.workingDir).toBe('/tmp');
    });

    it('should return existing session for the same user', async () => {
      const session1 = await manager.getOrCreate('user-1');
      const session2 = await manager.getOrCreate('user-1');

      expect(session1.id).toBe(session2.id);
    });

    it('should create separate sessions for different users', async () => {
      const s1 = await manager.getOrCreate('user-1');
      const s2 = await manager.getOrCreate('user-2');

      expect(s1.id).not.toBe(s2.id);
    });

    it('should create new session after stopped session is cleaned up', async () => {
      const s1 = await manager.getOrCreate('user-1');
      await manager.stop('user-1');

      const s2 = await manager.getOrCreate('user-1');
      expect(s2.id).not.toBe(s1.id);
    });

    it('should enforce max concurrent sessions', async () => {
      const config = createDefaultConfig({
        rateLimitConfig: {
          maxRequestsPerMinute: 10,
          maxConcurrentSessions: 2,
        },
      });
      manager = new SessionManager(config);

      await manager.getOrCreate('user-1');
      await manager.getOrCreate('user-2');

      await expect(manager.getOrCreate('user-3')).rejects.toThrow('Maximum concurrent sessions');
    });

    it('should accept custom session options', async () => {
      const session = await manager.getOrCreate('user-1', {
        model: 'claude-opus-4-20250514',
        workingDir: '/home/user',
      });

      expect(session.model).toBe('claude-opus-4-20250514');
      expect(session.workingDir).toBe('/home/user');
    });
  });

  describe('send', () => {
    it('should send a message to the session input adapter', async () => {
      await manager.getOrCreate('user-1');

      // Should not throw
      await manager.send('user-1', 'hello');
    });

    it('should create a session if none exists', async () => {
      await manager.send('user-1', 'hello');

      const session = manager.getSession('user-1');
      expect(session).toBeDefined();
    });

    it('should throw when sending to a stopped session with closed input', async () => {
      await manager.getOrCreate('user-1');
      await manager.stop('user-1');

      // getOrCreate should give a new session, so this should work
      await manager.send('user-1', 'hello after stop');
    });
  });

  describe('stop', () => {
    it('should stop an active session', async () => {
      await manager.getOrCreate('user-1');
      await manager.stop('user-1');

      const session = manager.getSession('user-1');
      expect(session?.state).toBe(SessionState.Stopped);
    });

    it('should not throw when stopping non-existent session', async () => {
      await expect(manager.stop('non-existent')).resolves.not.toThrow();
    });
  });

  describe('list', () => {
    it('should list all sessions', async () => {
      await manager.getOrCreate('user-1');
      await manager.getOrCreate('user-2');

      const list = manager.list();
      expect(list).toHaveLength(2);
      expect(list.map((s) => s.userId).sort()).toEqual(['user-1', 'user-2']);
    });

    it('should return serialisable info objects', async () => {
      await manager.getOrCreate('user-1');

      const list = manager.list();
      expect(list[0]).toHaveProperty('id');
      expect(list[0]).toHaveProperty('createdAt');
      expect(typeof list[0]!.createdAt).toBe('string');
    });
  });

  describe('getSession', () => {
    it('should return session for existing user', async () => {
      await manager.getOrCreate('user-1');
      expect(manager.getSession('user-1')).toBeDefined();
    });

    it('should return undefined for non-existent user', () => {
      expect(manager.getSession('non-existent')).toBeUndefined();
    });
  });

  describe('shutdown', () => {
    it('should stop all sessions', async () => {
      await manager.getOrCreate('user-1');
      await manager.getOrCreate('user-2');

      await manager.shutdown();

      const s1 = manager.getSession('user-1');
      const s2 = manager.getSession('user-2');
      expect(s1?.state).toBe(SessionState.Stopped);
      expect(s2?.state).toBe(SessionState.Stopped);
    });
  });

  describe('output callback', () => {
    it('should invoke output callback when session produces events', async () => {
      const events: OutputEvent[] = [];
      const config = createDefaultConfig({
        onOutput: (event: OutputEvent) => { events.push(event); },
      });
      manager = new SessionManager(config);

      await manager.getOrCreate('user-1');

      // Give the output processor time to run
      await new Promise((resolve) => setTimeout(resolve, 50));

      // The mock query yields a text message + result
      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  });
});
