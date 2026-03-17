import type { Command } from 'commander';
import { writePidFile, removePidFile } from '../../utils/pid-file.js';
import { loadConfig } from '../../config/loader.js';
import { createLogger } from '../../logging/logger.js';
import { createTeamsApp, type TeamsApp } from '../../bot/teams-app.js';
import { createActivityHandler } from '../../bot/activity-handlers.js';
import { ConversationStore } from '../../bot/conversation-store.js';
import { TunnelManager } from '../../tunnel/manager.js';

interface StartOptions {
  port?: string;
  dev?: boolean;
  tunnelProvider?: string;
  skipTunnel?: boolean;
}

/**
 * Register the `start` subcommand.
 *
 * Boots the full stack: config -> tunnel -> HTTP server -> activity handlers.
 */
export function registerStartCommand(program: Command): void {
  program
    .command('start')
    .description('Start the Teams bot server and dev tunnel')
    .option('-p, --port <port>', 'HTTP server port (overrides config)')
    .option('--dev', 'Enable development mode (pretty logging, relaxed auth)')
    .option('--tunnel-provider <provider>', 'Force tunnel provider: devtunnel or ngrok')
    .option('--skip-tunnel', 'Skip tunnel creation (for local testing)')
    .action(async (options: StartOptions) => {
      const config = loadConfig();

      // Apply CLI overrides
      if (options.port) {
        config.bot.port = parseInt(options.port, 10);
      }
      if (options.dev) {
        config.auth.devMode = true;
        config.logging.pretty = true;
      }
      if (options.tunnelProvider) {
        config.tunnel.provider = options.tunnelProvider as 'devtunnel' | 'ngrok';
      }

      const logger = createLogger(config.logging);
      let teamsApp: TeamsApp | null = null;
      let tunnelManager: TunnelManager | null = null;

      // Graceful shutdown handler
      const shutdown = async (signal: string): Promise<void> => {
        logger.info({ signal }, 'Shutting down...');

        if (teamsApp) {
          await teamsApp.stop();
        }

        if (tunnelManager) {
          await tunnelManager.stop();
        }

        removePidFile();
        logger.info('Shutdown complete');
        process.exit(0);
      };

      process.on('SIGINT', () => { shutdown('SIGINT').catch(() => process.exit(1)); });
      process.on('SIGTERM', () => { shutdown('SIGTERM').catch(() => process.exit(1)); });

      try {
        writePidFile();
        logger.info({ port: config.bot.port }, 'Starting cc-ms-teams');

        // Validate minimal configuration
        const botId = config.bot.id;
        if (botId === '00000000-0000-0000-0000-000000000000' && !config.auth.devMode) {
          logger.warn('Bot ID is not configured. Run "cc-ms-teams setup" first, or use --dev for local testing.');
        }

        // Start tunnel (unless skipped)
        if (!options.skipTunnel) {
          tunnelManager = new TunnelManager(config.tunnel);
          try {
            const tunnelInfo = await tunnelManager.start();
            logger.info(
              { url: tunnelInfo.url, provider: tunnelInfo.provider },
              'Tunnel connected',
            );
          } catch (err) {
            logger.warn({ err }, 'Failed to start tunnel. Bot will only be reachable locally.');
            tunnelManager = null;
          }
        } else {
          logger.info('Tunnel skipped (--skip-tunnel)');
        }

        // Initialize conversation store
        const conversationStore = new ConversationStore();

        // Create Teams app
        teamsApp = createTeamsApp({
          botConfig: config.bot,
          devMode: config.auth.devMode,
        });

        // Register activity handlers with echo (M2 basic test)
        const handler = createActivityHandler({
          conversationStore,
          // Default echo handler for M2 -- will be replaced by Claude integration in M3
        });
        teamsApp.setActivityHandler(handler);

        // Start the HTTP server
        await teamsApp.start();

        // Log startup info
        const maskedBotId = botId !== '00000000-0000-0000-0000-000000000000'
          ? `${botId.slice(0, 8)}...${botId.slice(-4)}`
          : 'not configured';

        logger.info({
          port: config.bot.port,
          botId: maskedBotId,
          devMode: config.auth.devMode,
          tunnelUrl: tunnelManager?.getUrl() ?? 'none',
          healthUrl: `http://localhost:${config.bot.port}/health`,
          messagesUrl: `http://localhost:${config.bot.port}/api/messages`,
        }, 'cc-ms-teams is running');

        console.log('');
        console.log(`cc-ms-teams is running on port ${config.bot.port}`);
        console.log(`  Bot ID:     ${maskedBotId}`);
        console.log(`  Health:     http://localhost:${config.bot.port}/health`);
        console.log(`  Messages:   http://localhost:${config.bot.port}/api/messages`);
        if (tunnelManager?.getUrl()) {
          console.log(`  Tunnel:     ${tunnelManager.getUrl()}`);
        }
        console.log('');
        console.log('Press Ctrl+C to stop.');

      } catch (err) {
        logger.error({ err }, 'Failed to start cc-ms-teams');
        removePidFile();
        process.exitCode = 1;
      }
    });
}
