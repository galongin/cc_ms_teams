import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ConversationReference } from '../../../src/bot/conversation-store.js';

// Create unique test directory
const TEST_DIR = join(tmpdir(), `cc-ms-teams-convstore-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const TEST_CONV_FILE = join(TEST_DIR, 'conversations.json');

// Mock the paths and logger before importing
vi.mock('../../../src/config/paths.js', () => ({
  CONFIG_DIR: TEST_DIR,
  CONFIG_FILE: join(TEST_DIR, 'config.json'),
  PID_FILE: join(TEST_DIR, 'bot.pid'),
  AUDIT_LOG_FILE: join(TEST_DIR, 'audit.jsonl'),
  TUNNEL_FILE: join(TEST_DIR, 'tunnel.json'),
  CONVERSATIONS_FILE: TEST_CONV_FILE,
  SESSIONS_FILE: join(TEST_DIR, 'sessions.json'),
}));

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

const { ConversationStore } = await import('../../../src/bot/conversation-store.js');

function createRef(userId: string, conversationId: string): ConversationReference {
  return {
    conversationId,
    userId,
    serviceUrl: 'https://smba.trafficmanager.net/teams/',
    botId: 'bot-1',
    tenantId: 'tenant-1',
    lastActivity: new Date().toISOString(),
  };
}

describe('bot/conversation-store', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it('should start empty when no file exists', () => {
    const store = new ConversationStore(TEST_CONV_FILE);
    expect(store.size).toBe(0);
  });

  it('should store and retrieve a conversation reference', () => {
    const store = new ConversationStore(TEST_CONV_FILE);
    const ref = createRef('user-1', 'conv-1');
    store.set('user-1', ref);

    const retrieved = store.get('user-1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.conversationId).toBe('conv-1');
    expect(retrieved?.userId).toBe('user-1');
  });

  it('should persist to disk', () => {
    const store = new ConversationStore(TEST_CONV_FILE);
    store.set('user-1', createRef('user-1', 'conv-1'));

    expect(existsSync(TEST_CONV_FILE)).toBe(true);
    const content = JSON.parse(readFileSync(TEST_CONV_FILE, 'utf-8')) as Record<string, ConversationReference>;
    expect(content['user-1']).toBeDefined();
    expect(content['user-1']?.conversationId).toBe('conv-1');
  });

  it('should load from disk on creation', () => {
    // Write data first
    const store1 = new ConversationStore(TEST_CONV_FILE);
    store1.set('user-1', createRef('user-1', 'conv-1'));
    store1.set('user-2', createRef('user-2', 'conv-2'));

    // Create new store instance from same file
    const store2 = new ConversationStore(TEST_CONV_FILE);
    expect(store2.size).toBe(2);
    expect(store2.get('user-1')?.conversationId).toBe('conv-1');
    expect(store2.get('user-2')?.conversationId).toBe('conv-2');
  });

  it('should delete a conversation reference', () => {
    const store = new ConversationStore(TEST_CONV_FILE);
    store.set('user-1', createRef('user-1', 'conv-1'));
    expect(store.has('user-1')).toBe(true);

    const deleted = store.delete('user-1');
    expect(deleted).toBe(true);
    expect(store.has('user-1')).toBe(false);
    expect(store.size).toBe(0);
  });

  it('should return false when deleting non-existent user', () => {
    const store = new ConversationStore(TEST_CONV_FILE);
    const deleted = store.delete('nonexistent');
    expect(deleted).toBe(false);
  });

  it('should list all references', () => {
    const store = new ConversationStore(TEST_CONV_FILE);
    store.set('user-1', createRef('user-1', 'conv-1'));
    store.set('user-2', createRef('user-2', 'conv-2'));

    const all = store.list();
    expect(all.size).toBe(2);
    expect(all.get('user-1')?.conversationId).toBe('conv-1');
    expect(all.get('user-2')?.conversationId).toBe('conv-2');
  });

  it('should update an existing reference', () => {
    const store = new ConversationStore(TEST_CONV_FILE);
    store.set('user-1', createRef('user-1', 'conv-1'));
    store.set('user-1', createRef('user-1', 'conv-2'));

    expect(store.size).toBe(1);
    expect(store.get('user-1')?.conversationId).toBe('conv-2');
  });

  it('should handle has() correctly', () => {
    const store = new ConversationStore(TEST_CONV_FILE);
    expect(store.has('user-1')).toBe(false);
    store.set('user-1', createRef('user-1', 'conv-1'));
    expect(store.has('user-1')).toBe(true);
  });

  it('should handle corrupted file gracefully', async () => {
    const { writeFileSync: writeSync } = await import('node:fs');
    writeSync(TEST_CONV_FILE, 'invalid json content');

    // Should not throw, just start empty
    const store = new ConversationStore(TEST_CONV_FILE);
    expect(store.size).toBe(0);
  });
});
