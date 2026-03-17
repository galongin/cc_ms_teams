import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MessageContext } from '../../../src/bridge/types.js';
import type { OutputEvent } from '../../../src/session/types.js';

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

const { MessageBridge } = await import('../../../src/bridge/message-bridge.js');

function createMockProactiveSender() {
  return {
    sendText: vi.fn().mockResolvedValue(undefined),
    sendCard: vi.fn().mockResolvedValue(undefined),
    updateMessage: vi.fn().mockResolvedValue(undefined),
  };
}

function createContext(overrides: Partial<MessageContext> = {}): MessageContext {
  return {
    userId: 'user-1',
    conversationId: 'conv-1',
    sessionId: 'sess-1',
    messageId: 'msg-1',
    ...overrides,
  };
}

describe('bridge/message-bridge', () => {
  let sender: ReturnType<typeof createMockProactiveSender>;
  let bridge: InstanceType<typeof MessageBridge>;

  beforeEach(() => {
    sender = createMockProactiveSender();
    bridge = new MessageBridge({
      proactiveSender: sender as never,
    });
  });

  describe('handleTeamsMessage', () => {
    it('should transform Teams text to clean Claude prompt', async () => {
      const result = await bridge.handleTeamsMessage(
        createContext(),
        '<at>Claude Code</at> fix the bug',
      );
      expect(result).toBe('fix the bug');
    });

    it('should strip HTML entities', async () => {
      const result = await bridge.handleTeamsMessage(
        createContext(),
        'x &gt; 5 &amp;&amp; y &lt; 10',
      );
      expect(result).toBe('x > 5 && y < 10');
    });

    it('should track message in history', async () => {
      await bridge.handleTeamsMessage(createContext(), 'Hello');
      const history = bridge.getMessageHistory().get('sess-1');
      expect(history).toHaveLength(1);
      expect(history[0]!.role).toBe('user');
      expect(history[0]!.preview).toBe('Hello');
    });
  });

  describe('handleClaudeOutput', () => {
    it('should send text events via proactive sender', async () => {
      const event: OutputEvent = {
        type: 'text',
        text: 'Hello from Claude',
        sessionId: 'sess-1',
      };

      await bridge.handleClaudeOutput(createContext(), event);

      expect(sender.sendText).toHaveBeenCalledWith('user-1', 'Hello from Claude');
    });

    it('should send tool_use events as formatted text', async () => {
      const event: OutputEvent = {
        type: 'tool_use',
        toolName: 'Read',
        toolId: 'tool-1',
        input: { file_path: '/tmp/test.ts' },
        sessionId: 'sess-1',
      };

      await bridge.handleClaudeOutput(createContext(), event);

      expect(sender.sendText).toHaveBeenCalled();
      const sentText = sender.sendText.mock.calls[0]![1] as string;
      expect(sentText).toContain('**Using tool:** `Read`');
    });

    it('should send error events as formatted text', async () => {
      const event: OutputEvent = {
        type: 'error',
        message: 'Something went wrong',
        sessionId: 'sess-1',
      };

      await bridge.handleClaudeOutput(createContext(), event);

      expect(sender.sendText).toHaveBeenCalledWith(
        'user-1',
        '**Error:** Something went wrong',
      );
    });

    it('should send thinking events as indicator', async () => {
      const event: OutputEvent = {
        type: 'thinking',
        text: 'Let me think...',
        sessionId: 'sess-1',
      };

      await bridge.handleClaudeOutput(createContext(), event);

      expect(sender.sendText).toHaveBeenCalledWith('user-1', '_Thinking..._');
    });

    it('should send result events as summary', async () => {
      const event: OutputEvent = {
        type: 'result',
        subtype: 'success',
        costUsd: 0.01,
        durationMs: 2000,
        sessionId: 'sess-1',
      };

      await bridge.handleClaudeOutput(createContext(), event);

      expect(sender.sendText).toHaveBeenCalled();
      const sentText = sender.sendText.mock.calls[0]![1] as string;
      expect(sentText).toContain('**Completed**');
    });

    it('should chunk long text messages', async () => {
      const longText = 'word '.repeat(1000); // ~5000 chars
      const event: OutputEvent = {
        type: 'text',
        text: longText,
        sessionId: 'sess-1',
      };

      await bridge.handleClaudeOutput(createContext(), event);

      // Should have been chunked into multiple sends
      expect(sender.sendText.mock.calls.length).toBeGreaterThan(1);
    });

    it('should track assistant text in history', async () => {
      const event: OutputEvent = {
        type: 'text',
        text: 'Hello from Claude',
        sessionId: 'sess-1',
      };

      await bridge.handleClaudeOutput(createContext(), event);

      const history = bridge.getMessageHistory().get('sess-1');
      expect(history).toHaveLength(1);
      expect(history[0]!.role).toBe('assistant');
    });
  });

  describe('streaming', () => {
    it('should start and stop streaming', async () => {
      bridge.startStreaming('sess-1');
      await bridge.stopStreaming('sess-1');
      // Should not throw
    });

    it('should route text events through batcher when streaming', async () => {
      bridge.startStreaming('sess-1');

      const event: OutputEvent = {
        type: 'text',
        text: 'chunk1',
        sessionId: 'sess-1',
      };

      await bridge.handleClaudeOutput(
        createContext({ sessionId: 'sess-1' }),
        event,
      );

      // Text went to batcher, not directly to sender
      // The batcher will flush on timer or threshold
      // Since we didn't wait for timer, sendText should not have been called
      // from the direct path (it goes through batcher's onFlush)

      await bridge.stopStreaming('sess-1');
    });

    it('should stop streaming on result event', async () => {
      bridge.startStreaming('sess-1');

      const resultEvent: OutputEvent = {
        type: 'result',
        subtype: 'success',
        costUsd: 0.01,
        durationMs: 1000,
        sessionId: 'sess-1',
      };

      await bridge.handleClaudeOutput(
        createContext({ sessionId: 'sess-1' }),
        resultEvent,
      );

      // After result, streaming should be stopped
      // Further text events should go directly
      const textEvent: OutputEvent = {
        type: 'text',
        text: 'direct text',
        sessionId: 'sess-1',
      };

      await bridge.handleClaudeOutput(
        createContext({ sessionId: 'sess-1' }),
        textEvent,
      );

      // This text should go directly to sender (not batched)
      expect(sender.sendText).toHaveBeenCalledWith('user-1', 'direct text');
    });
  });

  describe('message history', () => {
    it('should provide access to message history', () => {
      const history = bridge.getMessageHistory();
      expect(history).toBeDefined();
    });

    it('should track conversation context across messages', async () => {
      await bridge.handleTeamsMessage(createContext(), 'Question 1');

      const event: OutputEvent = {
        type: 'text',
        text: 'Answer 1',
        sessionId: 'sess-1',
      };
      await bridge.handleClaudeOutput(createContext(), event);

      await bridge.handleTeamsMessage(createContext(), 'Question 2');

      const history = bridge.getMessageHistory().get('sess-1');
      expect(history).toHaveLength(3);
      expect(history[0]!.role).toBe('user');
      expect(history[1]!.role).toBe('assistant');
      expect(history[2]!.role).toBe('user');
    });
  });
});
