import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getLogger } from '../logging/logger.js';
import { ensureConfigDir } from '../config/loader.js';
import { TUNNEL_FILE } from '../config/paths.js';
import type {
  ITunnelProvider,
  TunnelInfo,
  TunnelStatus,
  StatusChangeHandler,
} from './types.js';

/**
 * Tunnel provider that wraps the Microsoft Dev Tunnels CLI (`devtunnel`).
 *
 * Lifecycle:
 * 1. Check for persisted tunnel ID (for reuse across restarts).
 * 2. If none, create a new tunnel via `devtunnel create`.
 * 3. Add a port mapping via `devtunnel port create`.
 * 4. Host the tunnel via `devtunnel host` (long-running child process).
 * 5. Parse the public URL from stdout.
 * 6. Persist the tunnel ID + URL.
 */
export class DevTunnelProvider implements ITunnelProvider {
  readonly name = 'devtunnel';

  private process: ChildProcess | null = null;
  private tunnelInfo: TunnelInfo | null = null;
  private status: TunnelStatus = 'stopped';
  private statusHandlers: StatusChangeHandler[] = [];
  private logger = getLogger().child({ component: 'devtunnel-provider' });

  async isAvailable(): Promise<boolean> {
    try {
      execSync('devtunnel --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async start(port: number): Promise<TunnelInfo> {
    this.setStatus('starting');

    // Try to reuse a persisted tunnel
    const saved = this.loadSavedTunnel();
    if (saved && saved.port === port) {
      this.logger.info({ tunnelId: saved.tunnelId }, 'Reusing persisted tunnel');
      try {
        const info = await this.hostTunnel(saved.tunnelId, port);
        return info;
      } catch (err) {
        this.logger.warn({ err }, 'Failed to reuse persisted tunnel, creating new one');
      }
    }

    // Create a new tunnel
    const tunnelId = this.createTunnel();
    this.addPort(tunnelId, port);
    const info = await this.hostTunnel(tunnelId, port);
    return info;
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      // Wait briefly for graceful exit
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

  private createTunnel(): string {
    this.logger.info('Creating new dev tunnel');
    const output = execSync('devtunnel create --allow-anonymous', {
      encoding: 'utf-8',
    });
    const tunnelId = this.parseTunnelId(output);
    this.logger.info({ tunnelId }, 'Tunnel created');
    return tunnelId;
  }

  private addPort(tunnelId: string, port: number): void {
    this.logger.info({ tunnelId, port }, 'Adding port to tunnel');
    execSync(`devtunnel port create ${tunnelId} -p ${port}`, {
      encoding: 'utf-8',
    });
  }

  private hostTunnel(tunnelId: string, port: number): Promise<TunnelInfo> {
    return new Promise<TunnelInfo>((resolve, reject) => {
      const proc = spawn('devtunnel', ['host', tunnelId], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.process = proc;

      let stdoutBuffer = '';
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Timed out waiting for dev tunnel URL (30s)'));
          proc.kill('SIGTERM');
        }
      }, 30000);

      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdoutBuffer += text;
        this.logger.debug({ output: text.trim() }, 'devtunnel stdout');

        // Look for the tunnel URL in the output
        const urlMatch = stdoutBuffer.match(/https:\/\/[^\s]+\.devtunnels\.ms[^\s]*/);
        if (urlMatch && !resolved) {
          resolved = true;
          clearTimeout(timeout);

          const info: TunnelInfo = {
            url: urlMatch[0].replace(/\/$/, ''), // strip trailing slash
            tunnelId,
            port,
            provider: 'devtunnel',
          };
          this.tunnelInfo = info;
          this.saveTunnel(info);
          this.setStatus('connected', info);
          resolve(info);
        }
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        this.logger.warn({ output: chunk.toString().trim() }, 'devtunnel stderr');
      });

      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.setStatus('error');
          reject(new Error(`Failed to start devtunnel: ${err.message}`));
        }
      });

      proc.on('exit', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.setStatus('error');
          reject(new Error(`devtunnel exited with code ${code ?? 'unknown'}`));
        } else if (this.status === 'connected') {
          this.setStatus('disconnected');
        }
      });
    });
  }

  private parseTunnelId(output: string): string {
    // devtunnel create output includes a tunnel ID like "abc123xyz"
    const match = output.match(/Tunnel ID\s*:\s*(\S+)/i)
      ?? output.match(/([a-z0-9-]+\.devtunnels\.ms)/i)
      ?? output.match(/([a-zA-Z0-9_-]{6,})/);
    if (!match?.[1]) {
      throw new Error(`Could not parse tunnel ID from devtunnel output:\n${output}`);
    }
    return match[1];
  }

  private saveTunnel(info: TunnelInfo): void {
    try {
      ensureConfigDir();
      writeFileSync(TUNNEL_FILE, JSON.stringify(info, null, 2), { mode: 0o600 });
    } catch (err) {
      this.logger.warn({ err }, 'Failed to persist tunnel info');
    }
  }

  private loadSavedTunnel(): TunnelInfo | null {
    if (!existsSync(TUNNEL_FILE)) return null;
    try {
      const raw = readFileSync(TUNNEL_FILE, 'utf-8');
      return JSON.parse(raw) as TunnelInfo;
    } catch {
      return null;
    }
  }

  private setStatus(status: TunnelStatus, info?: TunnelInfo): void {
    this.status = status;
    for (const handler of this.statusHandlers) {
      handler(status, info);
    }
  }
}
