import { describe, it, expect } from 'vitest';
import { AsyncQueue } from '../../../src/utils/async-queue.js';

describe('utils/async-queue', () => {
  it('should buffer items pushed before consumption', async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.push(3);

    expect(queue.size).toBe(3);

    const results: number[] = [];
    queue.close();

    for await (const item of queue) {
      results.push(item);
    }

    expect(results).toEqual([1, 2, 3]);
  });

  it('should deliver items immediately to waiting consumers', async () => {
    const queue = new AsyncQueue<string>();

    // Start consuming before pushing
    const promise = (async () => {
      const items: string[] = [];
      for await (const item of queue) {
        items.push(item);
        if (items.length === 2) break;
      }
      return items;
    })();

    // Push items after a small delay
    queue.push('hello');
    queue.push('world');

    const result = await promise;
    expect(result).toEqual(['hello', 'world']);
  });

  it('should complete iteration when closed', async () => {
    const queue = new AsyncQueue<number>();

    const promise = (async () => {
      const items: number[] = [];
      for await (const item of queue) {
        items.push(item);
      }
      return items;
    })();

    queue.push(42);
    queue.close();

    const result = await promise;
    expect(result).toEqual([42]);
  });

  it('should throw when pushing to a closed queue', () => {
    const queue = new AsyncQueue<number>();
    queue.close();

    expect(() => queue.push(1)).toThrow('Cannot push to a closed queue');
  });

  it('should report isClosed correctly', () => {
    const queue = new AsyncQueue<number>();
    expect(queue.isClosed).toBe(false);

    queue.close();
    expect(queue.isClosed).toBe(true);
  });

  it('should report size correctly', () => {
    const queue = new AsyncQueue<number>();
    expect(queue.size).toBe(0);

    queue.push(1);
    expect(queue.size).toBe(1);

    queue.push(2);
    expect(queue.size).toBe(2);
  });

  it('should handle abort', async () => {
    const queue = new AsyncQueue<number>();
    queue.abort(new Error('test abort'));

    expect(queue.isClosed).toBe(true);

    // Iterating should complete immediately (error causes done: true for pending resolvers,
    // but subsequent next() calls reject)
    const iterator = queue[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow('test abort');
  });

  it('should handle mixed push and consume patterns', async () => {
    const queue = new AsyncQueue<number>();

    // Push some initial items
    queue.push(1);
    queue.push(2);

    const items: number[] = [];

    // Consume first two
    const iter = queue[Symbol.asyncIterator]();
    const r1 = await iter.next();
    if (!r1.done) items.push(r1.value);
    const r2 = await iter.next();
    if (!r2.done) items.push(r2.value);

    // Push more
    queue.push(3);
    const r3 = await iter.next();
    if (!r3.done) items.push(r3.value);

    queue.close();
    const r4 = await iter.next();
    expect(r4.done).toBe(true);

    expect(items).toEqual([1, 2, 3]);
  });
});
