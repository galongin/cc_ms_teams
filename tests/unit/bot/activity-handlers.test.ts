import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockTurnContext, createMockActivity } from '../../mocks/teams-sdk.js';

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

// Mock conversation store (in-memory, no file I/O)
vi.mock('../../../src/bot/conversation-store.js', async () => {
  return {
    ConversationStore: class {
      private data = new Map();
      get(id: string) { return this.data.get(id); }
      set(id: string, ref: unknown) { this.data.set(id, ref); }
      delete(id: string) { return this.data.delete(id); }
      has(id: string) { return this.data.has(id); }
      get size() { return this.data.size; }
      list() { return this.data; }
    },
  };
});

const { createActivityHandler } = await import('../../../src/bot/activity-handlers.js');
const { ConversationStore } = await import('../../../src/bot/conversation-store.js');

describe('bot/activity-handlers', () => {
  let conversationStore: InstanceType<typeof ConversationStore>;

  beforeEach(() => {
    conversationStore = new ConversationStore();
  });

  describe('message handling', () => {
    it('should echo regular messages by default', async () => {
      const handler = createActivityHandler({ conversationStore });
      const { context, calls } = createMockTurnContext({ text: 'hello world' });

      await handler(context);

      expect(calls.sendTyping).toBe(1);
      expect(calls.sendActivity).toContain('Echo: hello world');
    });

    it('should call custom onMessage handler when provided', async () => {
      const onMessage = vi.fn();
      const handler = createActivityHandler({ conversationStore, onMessage });
      const { context } = createMockTurnContext({ text: 'hello world' });

      await handler(context);

      expect(onMessage).toHaveBeenCalledWith(context, 'hello world');
    });

    it('should route slash commands to onCommand handler', async () => {
      const onCommand = vi.fn();
      const handler = createActivityHandler({ conversationStore, onCommand });
      const { context } = createMockTurnContext({ text: '/help' });

      await handler(context);

      expect(onCommand).toHaveBeenCalledWith(context, 'help', '', []);
    });

    it('should handle /help command with default handler', async () => {
      const handler = createActivityHandler({ conversationStore });
      const { context, calls } = createMockTurnContext({ text: '/help' });

      await handler(context);

      expect(calls.sendActivity.length).toBe(1);
      expect(calls.sendActivity[0]).toContain('Available Commands');
    });

    it('should handle unknown commands', async () => {
      const handler = createActivityHandler({ conversationStore });
      const { context, calls } = createMockTurnContext({ text: '/unknown_cmd' });

      await handler(context);

      expect(calls.sendActivity.length).toBe(1);
      expect(calls.sendActivity[0]).toContain('Unknown command');
    });

    it('should handle empty messages', async () => {
      const handler = createActivityHandler({ conversationStore });
      const { context, calls } = createMockTurnContext({ text: '' });

      await handler(context);

      expect(calls.sendActivity[0]).toContain('empty message');
    });

    it('should store conversation reference on message', async () => {
      const handler = createActivityHandler({ conversationStore });
      const { context } = createMockTurnContext({ text: 'hello' });

      await handler(context);

      expect(conversationStore.has('aad-user-1')).toBe(true);
    });
  });

  describe('installationUpdate handling', () => {
    it('should send welcome message on bot install', async () => {
      const handler = createActivityHandler({ conversationStore });
      const { context, calls } = createMockTurnContext({
        type: 'installationUpdate',
        action: 'add',
      });

      await handler(context);

      expect(calls.sendActivity.length).toBe(1);
      expect(calls.sendActivity[0]).toContain('Welcome');
    });

    it('should remove conversation reference on bot uninstall', async () => {
      const handler = createActivityHandler({ conversationStore });

      // First install
      const { context: installCtx } = createMockTurnContext({
        type: 'installationUpdate',
        action: 'add',
      });
      await handler(installCtx);
      expect(conversationStore.has('aad-user-1')).toBe(true);

      // Then uninstall
      const { context: uninstallCtx } = createMockTurnContext({
        type: 'installationUpdate',
        action: 'remove',
      });
      await handler(uninstallCtx);
      expect(conversationStore.has('aad-user-1')).toBe(false);
    });
  });

  describe('invoke handling', () => {
    it('should handle card action invokes', async () => {
      const handler = createActivityHandler({ conversationStore });
      const { context, calls } = createMockTurnContext({
        type: 'invoke',
        value: { action: 'approve' },
      });

      await handler(context);

      expect(calls.sendActivity.length).toBe(1);
      expect(calls.sendActivity[0]).toContain('Card action');
    });
  });

  describe('unhandled activity types', () => {
    it('should silently ignore unknown activity types', async () => {
      const handler = createActivityHandler({ conversationStore });
      const { context, calls } = createMockTurnContext({
        type: 'conversationUpdate',
      });

      await handler(context);

      expect(calls.sendActivity.length).toBe(0);
    });
  });
});
