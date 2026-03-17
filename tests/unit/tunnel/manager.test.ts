import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TunnelManager } from '../../../src/tunnel/manager.js';
import type { ITunnelProvider, TunnelInfo, TunnelStatus, StatusChangeHandler } from '../../../src/tunnel/types.js';
import type { TunnelConfig } from '../../../src/config/schema.js';

/** Create a mock tunnel provider with configurable behavior. */
function createMockProvider(
  name: string,
  available: boolean,
  startResult?: TunnelInfo,
): ITunnelProvider {
  const handlers: StatusChangeHandler[] = [];
  let status: TunnelStatus = 'stopped';

  return {
    name,
    isAvailable: vi.fn().mockResolvedValue(available),
    start: vi.fn().mockImplementation(async (port: number) => {
      if (!startResult) {
        throw new Error(`${name} start failed`);
      }
      status = 'connected';
      for (const h of handlers) h('connected', startResult);
      return startResult;
    }),
    stop: vi.fn().mockImplementation(async () => {
      status = 'stopped';
      for (const h of handlers) h('stopped');
    }),
    getUrl: vi.fn().mockImplementation(() => startResult?.url ?? null),
    getStatus: vi.fn().mockImplementation(() => status),
    onStatusChange: vi.fn().mockImplementation((handler: StatusChangeHandler) => {
      handlers.push(handler);
    }),
  };
}

const defaultConfig: TunnelConfig = {
  provider: 'devtunnel',
  port: 3978,
  persistent: true,
  healthCheckInterval: 30000,
  maxReconnectAttempts: 5,
};

describe('tunnel/manager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should select the preferred provider when available', async () => {
    const devtunnel = createMockProvider('devtunnel', true, {
      url: 'https://test.devtunnels.ms',
      tunnelId: 'test-123',
      port: 3978,
      provider: 'devtunnel',
    });
    const ngrok = createMockProvider('ngrok', true, {
      url: 'https://test.ngrok.io',
      tunnelId: 'ngrok-3978',
      port: 3978,
      provider: 'ngrok',
    });

    const manager = new TunnelManager(defaultConfig, [devtunnel, ngrok]);
    const info = await manager.start();

    expect(info.provider).toBe('devtunnel');
    expect(info.url).toBe('https://test.devtunnels.ms');
    expect(devtunnel.start).toHaveBeenCalledWith(3978);
    expect(ngrok.start).not.toHaveBeenCalled();
  });

  it('should fall back to ngrok when devtunnel is unavailable', async () => {
    const devtunnel = createMockProvider('devtunnel', false);
    const ngrok = createMockProvider('ngrok', true, {
      url: 'https://test.ngrok.io',
      tunnelId: 'ngrok-3978',
      port: 3978,
      provider: 'ngrok',
    });

    const manager = new TunnelManager(defaultConfig, [devtunnel, ngrok]);
    const info = await manager.start();

    expect(info.provider).toBe('ngrok');
    expect(info.url).toBe('https://test.ngrok.io');
  });

  it('should use ngrok when explicitly configured', async () => {
    const devtunnel = createMockProvider('devtunnel', true, {
      url: 'https://test.devtunnels.ms',
      tunnelId: 'test-123',
      port: 3978,
      provider: 'devtunnel',
    });
    const ngrok = createMockProvider('ngrok', true, {
      url: 'https://test.ngrok.io',
      tunnelId: 'ngrok-3978',
      port: 3978,
      provider: 'ngrok',
    });

    const config = { ...defaultConfig, provider: 'ngrok' as const };
    const manager = new TunnelManager(config, [devtunnel, ngrok]);
    const info = await manager.start();

    expect(info.provider).toBe('ngrok');
  });

  it('should throw when no providers are available', async () => {
    const devtunnel = createMockProvider('devtunnel', false);
    const ngrok = createMockProvider('ngrok', false);

    const manager = new TunnelManager(defaultConfig, [devtunnel, ngrok]);

    await expect(manager.start()).rejects.toThrow('No tunnel provider available');
  });

  it('should forward status changes to registered handlers', async () => {
    const devtunnel = createMockProvider('devtunnel', true, {
      url: 'https://test.devtunnels.ms',
      tunnelId: 'test-123',
      port: 3978,
      provider: 'devtunnel',
    });

    const manager = new TunnelManager(defaultConfig, [devtunnel]);
    const statusChanges: TunnelStatus[] = [];
    manager.onStatusChange((status) => statusChanges.push(status));

    await manager.start();

    expect(statusChanges).toContain('connected');
  });

  it('should stop the active provider', async () => {
    const devtunnel = createMockProvider('devtunnel', true, {
      url: 'https://test.devtunnels.ms',
      tunnelId: 'test-123',
      port: 3978,
      provider: 'devtunnel',
    });

    const manager = new TunnelManager(defaultConfig, [devtunnel]);
    await manager.start();

    expect(manager.getUrl()).toBe('https://test.devtunnels.ms');
    expect(manager.getProviderName()).toBe('devtunnel');

    await manager.stop();

    expect(manager.getUrl()).toBeNull();
    expect(manager.getProviderName()).toBeNull();
    expect(devtunnel.stop).toHaveBeenCalled();
  });

  it('should report stopped status when no provider is active', () => {
    const manager = new TunnelManager(defaultConfig, []);
    expect(manager.getStatus()).toBe('stopped');
    expect(manager.getUrl()).toBeNull();
  });

  it('should use the configured port', async () => {
    const devtunnel = createMockProvider('devtunnel', true, {
      url: 'https://test.devtunnels.ms',
      tunnelId: 'test-123',
      port: 5000,
      provider: 'devtunnel',
    });

    const config = { ...defaultConfig, port: 5000 };
    const manager = new TunnelManager(config, [devtunnel]);
    await manager.start();

    expect(devtunnel.start).toHaveBeenCalledWith(5000);
  });
});
