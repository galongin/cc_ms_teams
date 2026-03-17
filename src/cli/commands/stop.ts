import type { Command } from 'commander';
import { readPidFile, stopProcess, isProcessAlive } from '../../utils/pid-file.js';

/**
 * Register the `stop` subcommand.
 *
 * Reads the PID file and sends SIGTERM to the running bot process.
 * If the process doesn't stop within 10 seconds, sends SIGKILL.
 */
export function registerStopCommand(program: Command): void {
  program
    .command('stop')
    .description('Stop the running Teams bot server')
    .action(async () => {
      const pid = readPidFile();

      if (pid === null) {
        console.log('cc-ms-teams is not running (no PID file found).');
        return;
      }

      if (!isProcessAlive(pid)) {
        console.log(`cc-ms-teams is not running (stale PID file for process ${pid}).`);
        // Clean up stale PID file
        const { removePidFile } = await import('../../utils/pid-file.js');
        removePidFile();
        return;
      }

      console.log(`Stopping cc-ms-teams (PID ${pid})...`);
      const stopped = await stopProcess(10000);

      if (stopped) {
        console.log('cc-ms-teams stopped.');
      } else {
        console.log('cc-ms-teams was not running.');
      }
    });
}
