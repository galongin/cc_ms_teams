import { describe, it, expect, vi } from 'vitest';
import type { SDKOutputMessage } from '../../../src/session/claude-sdk-types.js';
import type { Session, OutputEvent } from '../../../src/session/types.js';
import { SessionState } from '../../../src/session/types.js';
import { StreamInputAdapterImpl } from '../../../src/session/stream-input-adapter.js';

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

const { processOutputLoop } = await import('../../../src/session/output-processor.js');

function createMockSession(messages: SDKOutputMessage[]): Session {
  let index = 0;
  const query = {
    abort() { /* no-op */ },
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<SDKOutputMessage>> {
          if (index >= messages.length) {
            return { value: undefined as unknown as SDKOutputMessage, done: true };
          }
          const value = messages[index]!;
          index++;
          return { value, done: false };
        },
      };
    },
  };

  return {
    id: 'test-session',
    userId: 'test-user',
    state: SessionState.Idle,
    workingDir: '/tmp',
    model: 'claude-sonnet-4-20250514',
    permissionMode: 'default',
    createdAt: new Date(),
    lastActiveAt: new Date(),
    totalCost: 0,
    turnCount: 0,
    allowedToolsOverrides: new Set(),
    allowedTools: ['Read', 'Grep', 'Glob'],
    inputAdapter: new StreamInputAdapterImpl(),
    query,
    abortController: new AbortController(),
  };
}

describe('session/output-processor', () => {
  it('should process text messages', async () => {
    const messages: SDKOutputMessage[] = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello from Claude!' }],
        },
      },
      {
        type: 'result',
        subtype: 'success',
        cost_usd: 0.01,
        duration_ms: 500,
        is_done: true,
      },
    ];

    const session = createMockSession(messages);
    const events: OutputEvent[] = [];

    await processOutputLoop(session, (event) => { events.push(event); });

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'text',
      text: 'Hello from Claude!',
      sessionId: 'test-session',
    });
    expect(events[1]).toEqual({
      type: 'result',
      subtype: 'success',
      costUsd: 0.01,
      durationMs: 500,
      sessionId: 'test-session',
    });
  });

  it('should process tool_use and tool_result events', async () => {
    const messages: SDKOutputMessage[] = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Read',
              input: { file_path: '/tmp/test.ts' },
            },
            {
              type: 'tool_result',
              tool_use_id: 'tool-1',
              content: 'file contents here',
              is_error: false,
            },
          ],
        },
      },
    ];

    const session = createMockSession(messages);
    const events: OutputEvent[] = [];

    await processOutputLoop(session, (event) => { events.push(event); });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: 'tool_use',
      toolName: 'Read',
      toolId: 'tool-1',
    });
    expect(events[1]).toMatchObject({
      type: 'tool_result',
      toolId: 'tool-1',
      isError: false,
    });
  });

  it('should process thinking events', async () => {
    const messages: SDKOutputMessage[] = [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'Let me think about this...' }],
        },
      },
    ];

    const session = createMockSession(messages);
    const events: OutputEvent[] = [];

    await processOutputLoop(session, (event) => { events.push(event); });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'thinking',
      text: 'Let me think about this...',
      sessionId: 'test-session',
    });
  });

  it('should update session cost and turn count from result messages', async () => {
    const messages: SDKOutputMessage[] = [
      {
        type: 'result',
        subtype: 'success',
        cost_usd: 0.05,
        duration_ms: 2000,
        is_done: true,
      },
    ];

    const session = createMockSession(messages);
    await processOutputLoop(session, () => {});

    expect(session.totalCost).toBe(0.05);
    expect(session.turnCount).toBe(1);
    expect(session.state).toBe(SessionState.Idle);
  });

  it('should set state to idle on error result', async () => {
    const messages: SDKOutputMessage[] = [
      {
        type: 'result',
        subtype: 'error',
        cost_usd: 0.001,
        duration_ms: 100,
      },
    ];

    const session = createMockSession(messages);
    await processOutputLoop(session, () => {});

    expect(session.state).toBe(SessionState.Idle);
  });

  it('should emit error event when query has no query object', async () => {
    const session = createMockSession([]);
    session.query = null;

    const events: OutputEvent[] = [];
    await processOutputLoop(session, (event) => { events.push(event); });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('error');
  });

  it('should handle errors in the output stream', async () => {
    const query = {
      abort() { /* no-op */ },
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<SDKOutputMessage>> {
            throw new Error('Stream error');
          },
        };
      },
    };

    const session = createMockSession([]);
    session.query = query;

    const events: OutputEvent[] = [];
    await processOutputLoop(session, (event) => { events.push(event); });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('error');
    expect((events[0] as { message: string }).message).toContain('Stream error');
    expect(session.state).toBe(SessionState.Idle);
  });

  it('should stop processing when session is stopped', async () => {
    let callCount = 0;
    const query = {
      abort() { /* no-op */ },
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<SDKOutputMessage>> {
            callCount++;
            if (callCount === 1) {
              return {
                value: {
                  type: 'assistant' as const,
                  message: {
                    role: 'assistant' as const,
                    content: [{ type: 'text' as const, text: 'first' }],
                  },
                },
                done: false,
              };
            }
            // On second call, session should be stopped
            return { value: undefined as unknown as SDKOutputMessage, done: true };
          },
        };
      },
    };

    const session = createMockSession([]);
    session.query = query;

    const events: OutputEvent[] = [];
    await processOutputLoop(session, (event) => {
      events.push(event);
      // Stop the session after first event
      session.state = SessionState.Stopped;
    });

    expect(events).toHaveLength(1);
  });
});
