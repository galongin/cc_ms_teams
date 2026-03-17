/**
 * A typed async iterable push queue. Producers push items into the queue,
 * and consumers iterate over them asynchronously.
 *
 * Used by the stream input adapter to feed messages to Claude Agent SDK.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private resolvers: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;
  private error: Error | null = null;

  /**
   * Push an item into the queue. If a consumer is waiting, it receives the
   * item immediately. Otherwise, the item is buffered.
   */
  push(item: T): void {
    if (this.closed) {
      throw new Error('Cannot push to a closed queue');
    }
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver({ value: item, done: false });
    } else {
      this.queue.push(item);
    }
  }

  /**
   * Close the queue. Any pending consumers will receive done.
   * No more items can be pushed after closing.
   */
  close(): void {
    this.closed = true;
    for (const resolver of this.resolvers) {
      resolver({ value: undefined as unknown as T, done: true });
    }
    this.resolvers = [];
  }

  /**
   * Close the queue with an error. Pending consumers will reject.
   */
  abort(err: Error): void {
    this.error = err;
    this.closed = true;
    for (const resolver of this.resolvers) {
      resolver({ value: undefined as unknown as T, done: true });
    }
    this.resolvers = [];
  }

  /** Whether the queue has been closed or aborted. */
  get isClosed(): boolean {
    return this.closed;
  }

  /** Number of buffered items not yet consumed. */
  get size(): number {
    return this.queue.length;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.error) {
          return Promise.reject(this.error);
        }
        const item = this.queue.shift();
        if (item !== undefined) {
          return Promise.resolve({ value: item, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolvers.push(resolve);
        });
      },
    };
  }
}
