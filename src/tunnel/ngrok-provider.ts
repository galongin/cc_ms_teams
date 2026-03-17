import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { getLogger } from '../logging/logger.js';
import type {
  ITunnelProvider,
  TunnelInfo,
  TunnelStatus,
  StatusChangeHandler,
} from './types.js';

/**
 * Tunnel provider that wraps the ngrok CLI as a fallback when MS Dev Tunnels
 * is not available.
 *
 * Lifecycle:
 * 1. Start `ngrok http <port>` as a child process.
 * 2. Poll the ngrok local API (http://127.0.0.1:4040/api/tunnels) for the public URL.
 * 3. Return the HTTPS URL.
 */
export class NgrokProvider implements ITunnelProvider {
  readonly name = 'ngrok';

  private process: ChildProcess | null = null;
  private tunnelInfo: TunnelInfo | null = null;
  private status: TunnelStatus = 'stopped';
  private statusHandlers: StatusChangeHandler[] = [];
  private logger = getLogger().child({ component: 'ngrok-provider' });

  async isAvailable(): Promise<boolean> {
    try {
      execSync('ngrok version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async start(port: number): Promise<TunnelInfo> {
    this.setStatus('starting');

    // Check for auth token
    const authToken = process.env['NGROK_AUTH_TOKEN'];
    const args = ['http', String(port)];
    if (authToken) {
      args.push('--authtoken', authToken);
    }

    return new Promise<TunnelInfo>((resolve, reject) => {
      const proc = spawn('ngrok', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.process = proc;

      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Timed out waiting for ngrok tunnel URL (30s)'));
          proc.kill('SIGTERM');
        }
      }, 30000);

      // ngrok exposes a local API; poll it for the tunnel URL
      const pollInterval = setInterval(async () => {
        if (resolved) {
          clearInterval(pollInterval);
          return;
        }
        try {
          const url = await this.fetchNgrokUrl();
          if (url && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            clearInterval(pollInterval);

            const info: TunnelInfo = {
              url,
              tunnelId: `ngrok-${port}`,
              port,
              provider: 'ngrok',
            };
            this.tunnelInfo = info;
            this.setStatus('connected', info);
            resolve(info);
          }
        } catch {
          // ngrok API not ready yet, keep polling
        }
      }, 500);

      proc.stderr?.on('data', (chunk: Buffer) => {
        this.logger.warn({ output: chunk.toString().trim() }, 'ngrok stderr');
      });

      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          clearInterval(pollInterval);
          this.setStatus('error');
          reject(new Error(`Failed to start ngrok: ${err.message}`));
        }
      });

      proc.on('exit', (code) => {
        clearInterval(pollInterval);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.setStatus('error');
          reject(new Error(`ngrok exited with code ${code ?? 'unknown'}`));
        } else if (this.status === 'connected') {
          this.setStatus('disconnected');
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (this.process) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);
        this.process?.on('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      this.process = null;
    }
    this.setStatus('stopped');
    this.tunnelInfo = null;
  }

  getUrl(): string | null {
    return this.tunnelInfo?.url ?? null;
  }

  getStatus(): TunnelStatus {
    return this.status;
  }

  onStatusChange(handler: StatusChangeHandler): void {
    this.statusHandlers.push(handler);
  }

  // --- Private methods ---

  private async fetchNgrokUrl(): Promise<string | null> {
    const resp = await fetch('http://127.0.0.1:4040/api/tunnels');
    const data = (await resp.json()) as {
      tunnels: Array<{ public_url: string; proto: string }>;
    };
    const httpsTunnel = data.tunnels.find((t) => t.proto === 'https');
    return httpsTunnel?.public_url ?? null;
  }

  private setStatus(status: TunnelStatus, info?: TunnelInfo): void {
    this.status = status;
    for (const handler of this.statusHandlers) {
      handler(status, info);
    }
  }
}
