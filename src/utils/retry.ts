export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3). */
  maxAttempts: number;
  /** Initial delay in ms before the first retry (default: 1000). */
  initialDelayMs: number;
  /** Maximum delay in ms (default: 30000). */
  maxDelayMs: number;
  /** Backoff multiplier (default: 2). */
  backoffFactor: number;
  /** Optional predicate: return false to stop retrying on certain errors. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Optional callback invoked before each retry attempt. */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
};

/**
 * Execute an async function with exponential backoff retry.
 *
 * Throws the last error after all attempts are exhausted.
 */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err: unknown) {
      lastError = err;

      if (attempt === opts.maxAttempts) break;

      if (opts.shouldRetry && !opts.shouldRetry(err, attempt)) break;

      // Add jitter: +/- 25%
      const jitter = delay * 0.25 * (Math.random() * 2 - 1);
      const effectiveDelay = Math.min(delay + jitter, opts.maxDelayMs);

      opts.onRetry?.(err, attempt, effectiveDelay);

      await sleep(effectiveDelay);
      delay = Math.min(delay * opts.backoffFactor, opts.maxDelayMs);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
