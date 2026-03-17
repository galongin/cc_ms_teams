import { getLogger } from '../logging/logger.js';
import type { TunnelStatus, StatusChangeHandler } from './types.js';

export interface HealthMonitorOptions {
  /** Interval between health checks in ms (default: 30000). */
  checkIntervalMs: number;
  /** Number of consecutive failures before marking as disconnected (default: 3). */
  failureThreshold: number;
  /** Timeout for each health check HTTP request in ms (default: 5000). */
  requestTimeoutMs: number;
}

const DEFAULT_OPTIONS: HealthMonitorOptions = {
  checkIntervalMs: 30000,
  failureThreshold: 3,
  requestTimeoutMs: 5000,
};

/**
 * Periodic health monitor for tunnel URLs. Sends HTTP GET requests to the
 * tunnel endpoint and emits status events on failure/recovery.
 */
export class TunnelHealthMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private consecutiveFailures = 0;
  private status: TunnelStatus = 'connected';
  private statusHandlers: StatusChangeHandler[] = [];
  private running = false;
  private logger = getLogger().child({ component: 'tunnel-health' });
  private readonly options: HealthMonitorOptions;

  constructor(
    private tunnelUrl: string,
    options: Partial<HealthMonitorOptions> = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Start periodic health checks.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.consecutiveFailures = 0;
    this.status = 'connected';

    this.timer = setInterval(() => {
      void this.check();
    }, this.options.checkIntervalMs);

    this.logger.info(
      { url: this.tunnelUrl, intervalMs: this.options.checkIntervalMs },
      'Health monitoring started',
    );
  }

  /**
   * Stop health monitoring.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    this.logger.info('Health monitoring stopped');
  }

  /**
   * Register a handler for status change events.
   */
  onStatusChange(handler: StatusChangeHandler): void {
    this.statusHandlers.push(handler);
  }

  /**
   * Get the current health status.
   */
  getStatus(): TunnelStatus {
    return this.status;
  }

  /**
   * Get the number of consecutive failures.
   */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /**
   * Perform a single health check (exposed for testing).
   */
  async check(): Promise<boolean> {
    const healthUrl = `${this.tunnelUrl}/health`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.options.requestTimeoutMs,
      );

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        if (this.consecutiveFailures > 0) {
          this.logger.info('Tunnel health restored');
        }
        this.consecutiveFailures = 0;
        if (this.status !== 'connected') {
          this.setStatus('connected');
        }
        return true;
      }

      this.logger.warn(
        { statusCode: response.status },
        'Tunnel health check returned non-OK status',
      );
      return this.recordFailure();
    } catch (err) {
      this.logger.warn({ err }, 'Tunnel health check failed');
      return this.recordFailure();
    }
  }

  // --- Private methods ---

  private recordFailure(): boolean {
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= this.options.failureThreshold) {
      if (this.status !== 'disconnected') {
        this.logger.error(
          { failures: this.consecutiveFailures, threshold: this.options.failureThreshold },
          'Tunnel health check threshold exceeded, marking disconnected',
        );
        this.setStatus('disconnected');
      }
    }

    return false;
  }

  private setStatus(status: TunnelStatus): void {
    this.status = status;
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }
}
