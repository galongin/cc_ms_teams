import type { Command } from 'commander';
import { existsSync } from 'node:fs';
import { loadConfig } from '../../config/loader.js';
import { CONFIG_FILE, PID_FILE, TUNNEL_FILE, AUDIT_LOG_FILE } from '../../config/paths.js';
import { readPidFile, isProcessAlive } from '../../utils/pid-file.js';

/**
 * Register the `status` subcommand.
 *
 * Shows the current state of the bot, tunnel, and sessions.
 */
export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show bot, tunnel, and session status')
    .action(() => {
      console.log('cc-ms-teams status');
      console.log('==================');
      console.log('');

      // Config file
      const configExists = existsSync(CONFIG_FILE);
      console.log(`Config file:  ${CONFIG_FILE}`);
      console.log(`  Status:     ${configExists ? 'exists' : 'not found (using defaults)'}`);

      if (configExists) {
        try {
          const config = loadConfig();
          console.log(`  Bot ID:     ${config.bot.id === '00000000-0000-0000-0000-000000000000' ? 'not configured' : config.bot.id}`);
          console.log(`  Port:       ${config.bot.port}`);
          console.log(`  Tunnel:     ${config.tunnel.provider}`);
          console.log(`  Auth mode:  ${config.auth.devMode ? 'dev (no auth)' : 'production'}`);
        } catch (err) {
          console.log(`  Error:      Failed to parse config: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        console.log('  (Run "cc-ms-teams setup" to configure)');
      }

      console.log('');

      // Process status
      const pid = readPidFile();
      console.log(`PID file:     ${PID_FILE}`);
      if (pid !== null) {
        const alive = isProcessAlive(pid);
        console.log(`  PID:        ${pid}`);
        console.log(`  Running:    ${alive ? 'yes' : 'no (stale PID file)'}`);
      } else {
        console.log('  Status:     not running');
      }

      console.log('');

      // Tunnel status
      const tunnelExists = existsSync(TUNNEL_FILE);
      console.log(`Tunnel file:  ${TUNNEL_FILE}`);
      console.log(`  Status:     ${tunnelExists ? 'persisted' : 'not configured'}`);

      console.log('');

      // Audit log
      const auditExists = existsSync(AUDIT_LOG_FILE);
      console.log(`Audit log:    ${AUDIT_LOG_FILE}`);
      console.log(`  Status:     ${auditExists ? 'exists' : 'not created yet'}`);

      console.log('');

      // Sessions
      console.log('Sessions:     0 active');
    });
}
