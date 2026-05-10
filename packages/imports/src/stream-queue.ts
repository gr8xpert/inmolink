/**
 * Promise-based async queue used by SAX-driven connectors to bridge the
 * push-style parser events into a pull-style AsyncIterable (PLAN §11.5).
 *
 * The parser produces listings as SAX events fire; the worker pulls one at
 * a time. Backpressure: when buffer exceeds `highWaterMark`, callers should
 * pause the underlying parser and resume on `pull()` events.
 */
export class AsyncQueue<T> {
  private buffer: T[] = [];
  private resolvers: Array<{
    resolve: (v: IteratorResult<T>) => void;
    reject: (e: unknown) => void;
  }> = [];
  private done = false;
  private err: unknown = null;
  private pullListener: (() => void) | null = null;

  constructor(private highWaterMark = 50) {}

  push(value: T): void {
    if (this.done) return;
    const r = this.resolvers.shift();
    if (r) {
      r.resolve({ value, done: false });
    } else {
      this.buffer.push(value);
    }
  }

  /** Listen for consumer pulls — used to resume a paused parser. */
  onPull(fn: () => void): void {
    this.pullListener = fn;
  }

  bufferSize(): number {
    return this.buffer.length;
  }

  highWater(): boolean {
    return this.buffer.length >= this.highWaterMark;
  }

  end(err?: unknown): void {
    if (this.done) return;
    this.done = true;
    this.err = err ?? null;
    while (this.resolvers.length > 0) {
      const r = this.resolvers.shift();
      if (!r) continue;
      if (err) r.reject(err);
      else r.resolve({ value: undefined as unknown as T, done: true });
    }
  }

  next(): Promise<IteratorResult<T>> {
    if (this.buffer.length > 0) {
      const value = this.buffer.shift() as T;
      this.pullListener?.();
      return Promise.resolve({ value, done: false });
    }
    if (this.err) return Promise.reject(this.err);
    if (this.done) return Promise.resolve({ value: undefined as unknown as T, done: true });
    return new Promise((resolve, reject) => {
      this.resolvers.push({ resolve, reject });
      this.pullListener?.();
    });
  }
}
