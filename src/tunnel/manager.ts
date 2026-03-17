import { getLogger } from '../logging/logger.js';
import type { TunnelConfig } from '../config/schema.js';
import { DevTunnelProvider } from './devtunnel-provider.js';
import { NgrokProvider } from './ngrok-provider.js';
import type {
  ITunnelProvider,
  TunnelInfo,
  TunnelStatus,
  StatusChangeHandler,
} from './types.js';

/**
 * Orchestrates tunnel providers. Auto-selects the best available provider
 * based on configuration preference and CLI availability.
 *
 * Priority:
 * 1. User-configured provider (if specified and available)
 * 2. devtunnel (primary)
 * 3. ngrok (fallback)
 */
export class TunnelManager {
  private provider: ITunnelProvider | null = null;
  private tunnelInfo: TunnelInfo | null = null;
  private statusHandlers: StatusChangeHandler[] = [];
  private logger = getLogger().child({ component: 'tunnel-manager' });
  private providers: ITunnelProvider[];

  constructor(
    private config: TunnelConfig,
    providers?: ITunnelProvider[],
  ) {
    this.providers = providers ?? [new DevTunnelProvider(), new NgrokProvider()];
  }

  /**
   * Select the best available provider and start the tunnel.
   */
  async start(): Promise<TunnelInfo> {
    this.provider = await this.selectProvider();

    // Forward status changes
    this.provider.onStatusChange((status, info) => {
      for (const handler of this.statusHandlers) {
        handler(status, info);
      }
    });

    this.logger.info({ provider: this.provider.name }, 'Starting tunnel');
    this.tunnelInfo = await this.provider.start(this.config.port);
    this.logger.info(
      { url: this.tunnelInfo.url, provider: this.provider.name },
      'Tunnel connected',
    );

    return this.tunnelInfo;
  }

  /**
   * Stop the active tunnel.
   */
  async stop(): Promise<void> {
    if (this.provider) {
      this.logger.info({ provider: this.provider.name }, 'Stopping tunnel');
      await this.provider.stop();
      this.provider = null;
      this.tunnelInfo = null;
    }
  }

  /**
   * Get the current public tunnel URL, or null if not connected.
   */
  getUrl(): string | null {
    return this.provider?.getUrl() ?? null;
  }

  /**
   * Get the current tunnel status.
   */
  getStatus(): TunnelStatus {
    return this.provider?.getStatus() ?? 'stopped';
  }

  /**
   * Get the name of the active provider, or null if none.
   */
  getProviderName(): string | null {
    return this.provider?.name ?? null;
  }

  /**
   * Register a handler for status changes.
   */
  onStatusChange(handler: StatusChangeHandler): void {
    this.statusHandlers.push(handler);
  }

  // --- Private methods ---

  private async selectProvider(): Promise<ITunnelProvider> {
    // If user specified a preference, try that first
    const preferred = this.providers.find((p) => p.name === this.config.provider);
    if (preferred && (await preferred.isAvailable())) {
      this.logger.info({ provider: preferred.name }, 'Using preferred tunnel provider');
      return preferred;
    }

    if (preferred && !(await preferred.isAvailable())) {
      this.logger.warn(
        { provider: this.config.provider },
        'Preferred tunnel provider is not available, trying alternatives',
      );
    }

    // Try each provider in order
    for (const provider of this.providers) {
      if (await provider.isAvailable()) {
        this.logger.info({ provider: provider.name }, 'Auto-selected tunnel provider');
        return provider;
      }
    }

    throw new Error(
      'No tunnel provider available. Install one of the following:\n' +
      '  - Microsoft Dev Tunnels: https://aka.ms/devtunnels/install\n' +
      '  - ngrok: https://ngrok.com/download\n',
    );
  }
}
