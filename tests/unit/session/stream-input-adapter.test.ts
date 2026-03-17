import { describe, it, expect } from 'vitest';
import { StreamInputAdapterImpl } from '../../../src/session/stream-input-adapter.js';
import type { SDKUserMessage } from '../../../src/session/claude-sdk-types.js';

describe('session/stream-input-adapter', () => {
  it('should convert string messages to SDKUserMessage format', async () => {
    const adapter = new StreamInputAdapterImpl();

    adapter.push('hello world');
    adapter.close();

    const results: SDKUserMessage[] = [];
    for await (const msg of adapter) {
      results.push(msg);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      type: 'user',
      message: {
        role: 'user',
        content: 'hello world',
      },
    });
  });

  it('should preserve message order when pushing multiple messages', async () => {
    const adapter = new StreamInputAdapterImpl();

    adapter.push('first');
    adapter.push('second');
    adapter.push('third');
    adapter.close();

    const contents: string[] = [];
    for await (const msg of adapter) {
      contents.push(msg.message.content);
    }

    expect(contents).toEqual(['first', 'second', 'third']);
  });

  it('should deliver messages immediately to waiting consumers', async () => {
    const adapter = new StreamInputAdapterImpl();

    const promise = (async () => {
      const items: string[] = [];
      for await (const msg of adapter) {
        items.push(msg.message.content);
        if (items.length === 2) break;
      }
      return items;
    })();

    adapter.push('alpha');
    adapter.push('beta');

    const result = await promise;
    expect(result).toEqual(['alpha', 'beta']);
  });

  it('should throw when pushing after close', () => {
    const adapter = new StreamInputAdapterImpl();
    adapter.close();

    expect(() => adapter.push('late')).toThrow();
  });

  it('should report isClosed correctly', () => {
    const adapter = new StreamInputAdapterImpl();
    expect(adapter.isClosed).toBe(false);

    adapter.close();
    expect(adapter.isClosed).toBe(true);
  });

  it('should complete iteration when closed with no messages', async () => {
    const adapter = new StreamInputAdapterImpl();
    adapter.close();

    const results: SDKUserMessage[] = [];
    for await (const msg of adapter) {
      results.push(msg);
    }

    expect(results).toHaveLength(0);
  });

  it('should handle mixed push/consume pattern', async () => {
    const adapter = new StreamInputAdapterImpl();

    // Push one, consume it, push another
    adapter.push('first');

    const iter = adapter[Symbol.asyncIterator]();
    const r1 = await iter.next();
    expect(r1.done).toBe(false);
    expect(r1.value.message.content).toBe('first');

    adapter.push('second');
    const r2 = await iter.next();
    expect(r2.done).toBe(false);
    expect(r2.value.message.content).toBe('second');

    adapter.close();
    const r3 = await iter.next();
    expect(r3.done).toBe(true);
  });
});
