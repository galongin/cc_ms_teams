import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerSetupCommand } from './commands/setup.js';
import { registerStartCommand } from './commands/start.js';
import { registerStopCommand } from './commands/stop.js';
import { registerStatusCommand } from './commands/status.js';

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // Walk up to find package.json (works from both src/ and dist/)
    for (const base of [__dirname, join(__dirname, '..'), join(__dirname, '..', '..')]) {
      try {
        const pkg = JSON.parse(readFileSync(join(base, 'package.json'), 'utf-8')) as { version: string };
        return pkg.version;
      } catch {
        // Try next path
      }
    }
  } catch {
    // Fallback
  }
  return '1.0.0';
}

const program = new Command();

program
  .name('cc-ms-teams')
  .description('Bidirectional Claude Code <-> Microsoft Teams chat plugin')
  .version(getVersion());

registerSetupCommand(program);
registerStartCommand(program);
registerStopCommand(program);
registerStatusCommand(program);

program.parse();
