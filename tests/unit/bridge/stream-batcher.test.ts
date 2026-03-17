import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamBatcherImpl } from '../../../src/bridge/stream-batcher.js';
import type { TeamsContent } from '../../../src/bridge/types.js';

describe('bridge/stream-batcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should buffer text and flush on explicit flush()', async () => {
    const batcher = new StreamBatcherImpl();
    batcher.push('Hello ');
    batcher.push('World');

    const result = await batcher.flush();
    expect(result).toEqual([{ type: 'text', text: 'Hello World' }]);
  });

  it('should return empty array when flushing with no content', async () => {
    const batcher = new StreamBatcherImpl();
    const result = await batcher.flush();
    expect(result).toEqual([]);
  });

  it('should flush on timer expiration', async () => {
    const flushed: TeamsContent[][] = [];
    const batcher = new StreamBatcherImpl({
      flushIntervalMs: 500,
      onFlush: async (items) => {
        flushed.push(items);
      },
    });

    batcher.push('Hello');

    // Advance past the flush interval
    await vi.advanceTimersByTimeAsync(500);

    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toEqual([{ type: 'text', text: 'Hello' }]);
  });

  it('should flush when character threshold is reached', async () => {
    const flushed: TeamsContent[][] = [];
    const batcher = new StreamBatcherImpl({
      charThreshold: 10,
      onFlush: async (items) => {
        flushed.push(items);
      },
    });

    batcher.push('1234567890'); // exactly 10 chars

    // The flush should happen synchronously via the threshold check
    // Wait for any microtasks
    await vi.advanceTimersByTimeAsync(0);

    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toEqual([{ type: 'text', text: '1234567890' }]);
  });

  it('should use configurable flush interval', async () => {
    const flushed: TeamsContent[][] = [];
    const batcher = new StreamBatcherImpl({
      flushIntervalMs: 200,
      onFlush: async (items) => {
        flushed.push(items);
      },
    });

    batcher.push('test');

    // Not flushed at 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(flushed).toHaveLength(0);

    // Flushed at 200ms
    await vi.advanceTimersByTimeAsync(100);
    expect(flushed).toHaveLength(1);
  });

  it('should use configurable character threshold', async () => {
    const flushed: TeamsContent[][] = [];
    const batcher = new StreamBatcherImpl({
      charThreshold: 5,
      onFlush: async (items) => {
        flushed.push(items);
      },
    });

    batcher.push('abc');
    await vi.advanceTimersByTimeAsync(0);
    expect(flushed).toHaveLength(0);

    batcher.push('de'); // now 5 chars
    await vi.advanceTimersByTimeAsync(0);
    expect(flushed).toHaveLength(1);
  });

  it('should flush remaining content on stop()', async () => {
    const batcher = new StreamBatcherImpl();
    batcher.push('remaining');

    const result = await batcher.stop();
    expect(result).toEqual([{ type: 'text', text: 'remaining' }]);
  });

  it('should not accept new tokens after stop()', async () => {
    const batcher = new StreamBatcherImpl();
    await batcher.stop();

    batcher.push('ignored');
    const result = await batcher.flush();
    expect(result).toEqual([]);
  });

  it('should flush text before emitting tool use', async () => {
    const flushed: TeamsContent[][] = [];
    const batcher = new StreamBatcherImpl({
      onFlush: async (items) => {
        flushed.push(items);
      },
    });

    batcher.push('some text');
    batcher.pushToolUse('Read', { file_path: '/tmp/test.ts' });

    // Advance timers to process any pending operations
    await vi.advanceTimersByTimeAsync(0);

    // Should have flushed text first, then tool use
    expect(flushed.length).toBeGreaterThanOrEqual(2);
    expect(flushed[0]).toEqual([{ type: 'text', text: 'some text' }]);
    expect((flushed[1]![0] as { type: 'text'; text: string }).text).toContain(
      '**Using tool:** `Read`',
    );
  });

  it('should accumulate multiple pushes before flush', async () => {
    const batcher = new StreamBatcherImpl({ flushIntervalMs: 1000 });

    batcher.push('a');
    batcher.push('b');
    batcher.push('c');

    const result = await batcher.flush();
    expect(result).toEqual([{ type: 'text', text: 'abc' }]);
  });

  it('should clear timer on flush', async () => {
    const flushed: TeamsContent[][] = [];
    const batcher = new StreamBatcherImpl({
      flushIntervalMs: 500,
      onFlush: async (items) => {
        flushed.push(items);
      },
    });

    batcher.push('hello');
    await batcher.flush(); // should clear the timer

    // Advancing past the interval should not cause another flush
    await vi.advanceTimersByTimeAsync(600);
    expect(flushed).toHaveLength(1);
  });
});
