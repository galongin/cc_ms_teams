/**
 * Activity handlers for the Teams bot.
 *
 * Registers handlers for:
 * - message: Text messages from users
 * - installationUpdate: Bot install/uninstall lifecycle
 * - Card action submits (invoke activities)
 *
 * In M3, regular messages are routed to the session manager,
 * and /new, /stop, /status commands are wired up.
 */

import type { TurnContext } from './teams-app.js';
import { parseCommand, formatHelpText, isParsedCommand, isUnknownCommand } from './command-parser.js';
import type { ConversationStore, ConversationReference } from './conversation-store.js';
import type { ISessionManager } from '../session/types.js';
import { SessionState } from '../session/types.js';
import { getLogger } from '../logging/logger.js';

/** Function signature for an activity handler. */
export type ActivityHandler = (context: TurnContext) => Promise<void>;

/** Dependencies injected into the activity handler. */
export interface ActivityHandlerDeps {
  conversationStore: ConversationStore;
  /** Session manager for routing messages to Claude Code. */
  sessionManager?: ISessionManager;
  /** Handler for non-command chat messages. Default: echo. */
  onMessage?: (context: TurnContext, text: string) => Promise<void>;
  /** Handler for parsed slash commands. */
  onCommand?: (context: TurnContext, command: string, args: string, argv: string[]) => Promise<void>;
}

/**
 * Create the main activity handler that dispatches to sub-handlers
 * based on activity type.
 */
export function createActivityHandler(deps: ActivityHandlerDeps): ActivityHandler {
  const logger = getLogger().child({ component: 'activity-handler' });

  return async (context: TurnContext): Promise<void> => {
    const { activity } = context;

    switch (activity.type) {
      case 'message':
        await handleMessage(context, deps, logger);
        break;

      case 'installationUpdate':
        await handleInstallationUpdate(context, deps, logger);
        break;

      case 'invoke':
        await handleInvoke(context, logger);
        break;

      default:
        logger.debug({ type: activity.type }, 'Unhandled activity type');
        break;
    }
  };
}

/**
 * Handle incoming text messages.
 * - Stores/updates conversation reference
 * - Sends typing indicator
 * - Checks for slash commands
 * - Routes to command handler or message handler
 */
async function handleMessage(
  context: TurnContext,
  deps: ActivityHandlerDeps,
  logger: ReturnType<typeof getLogger>,
): Promise<void> {
  const text = context.activity.text?.trim() ?? '';
  const userId = context.getUserId();

  logger.info(
    { userId, textLength: text.length },
    'Message received',
  );

  // Store/update conversation reference
  storeConversationReference(context, deps.conversationStore);

  // Send typing indicator
  await context.sendTyping();

  if (!text) {
    await context.sendActivity('I received an empty message. Send /help to see available commands.');
    return;
  }

  // Check for slash commands
  const parsed = parseCommand(text);

  if (isParsedCommand(parsed)) {
    logger.info({ command: parsed.command, userId }, 'Command received');

    if (deps.onCommand) {
      await deps.onCommand(context, parsed.command, parsed.args, parsed.argv);
    } else {
      // Default command handling (with session manager if available)
      await handleDefaultCommand(context, parsed.command, parsed.args, deps);
    }
    return;
  }

  if (isUnknownCommand(parsed)) {
    await context.sendActivity(
      `Unknown command \`/${parsed.original}\`.\n\n${parsed.helpText}`,
    );
    return;
  }

  // Regular chat message
  if (deps.onMessage) {
    await deps.onMessage(context, text);
  } else if (deps.sessionManager) {
    // Route to session manager (M3 integration)
    await routeToSession(context, text, deps.sessionManager);
  } else {
    // Default: echo (M2 basic test)
    await context.sendActivity(`Echo: ${text}`);
  }
}

/**
 * Route a regular message to the session manager.
 */
async function routeToSession(
  context: TurnContext,
  text: string,
  sessionManager: ISessionManager,
): Promise<void> {
  const userId = context.getUserId();

  try {
    await sessionManager.send(userId, text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await context.sendActivity(`Failed to send message to Claude Code: ${message}`);
  }
}

/**
 * Default handler for known slash commands.
 * When a session manager is available, /new, /stop, /status are live.
 */
async function handleDefaultCommand(
  context: TurnContext,
  command: string,
  _args: string,
  deps: ActivityHandlerDeps,
): Promise<void> {
  const userId = context.getUserId();
  const sm = deps.sessionManager;

  switch (command) {
    case 'help':
      await context.sendActivity(formatHelpText());
      break;

    case 'status':
      if (sm) {
        const session = sm.getSession(userId);
        if (session) {
          const stateLabel = session.state === SessionState.Processing
            ? 'processing'
            : session.state === SessionState.WaitingPermission
              ? 'waiting for permission'
              : session.state === SessionState.Stopped
                ? 'stopped'
                : 'idle';
          await context.sendActivity(
            `**Session:** ${session.id}\n` +
            `**Status:** ${stateLabel}\n` +
            `**Model:** ${session.model}\n` +
            `**Working Dir:** ${session.workingDir}\n` +
            `**Cost:** $${session.totalCost.toFixed(4)}\n` +
            `**Turns:** ${session.turnCount}`,
          );
        } else {
          await context.sendActivity('No active session. Send a message to start chatting with Claude Code.');
        }
      } else {
        await context.sendActivity('No active session. Send a message to start chatting with Claude Code.');
      }
      break;

    case 'new':
      if (sm) {
        try {
          // Stop existing session if any
          await sm.stop(userId);
          const session = await sm.getOrCreate(userId);
          await context.sendActivity(
            `New session started.\n` +
            `**Session ID:** ${session.id}\n` +
            `**Model:** ${session.model}\n` +
            `**Working Dir:** ${session.workingDir}`,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await context.sendActivity(`Failed to create session: ${message}`);
        }
      } else {
        await context.sendActivity('Starting a new session... (not yet implemented, coming in Milestone 3)');
      }
      break;

    case 'stop':
      if (sm) {
        const session = sm.getSession(userId);
        if (session && session.state !== SessionState.Stopped) {
          await sm.stop(userId);
          await context.sendActivity(
            `Session **${session.id}** stopped.\n` +
            `**Cost:** $${session.totalCost.toFixed(4)} | **Turns:** ${session.turnCount}`,
          );
        } else {
          await context.sendActivity('No active session to stop.');
        }
      } else {
        await context.sendActivity('No active session to stop.');
      }
      break;

    default:
      await context.sendActivity(`Command \`/${command}\` is recognized but not yet implemented.`);
      break;
  }
}

/**
 * Handle bot installation/uninstallation events.
 */
async function handleInstallationUpdate(
  context: TurnContext,
  deps: ActivityHandlerDeps,
  logger: ReturnType<typeof getLogger>,
): Promise<void> {
  const action = context.activity.action;
  const userId = context.getUserId();

  if (action === 'add') {
    logger.info({ userId }, 'Bot installed by user');
    storeConversationReference(context, deps.conversationStore);
    await context.sendActivity(
      'Welcome to **Claude Code for Teams**! I can help you interact with Claude Code directly from Teams.\n\n' +
      'Send `/help` to see available commands, or just type a message to start a conversation.',
    );
  } else if (action === 'remove') {
    logger.info({ userId }, 'Bot uninstalled by user');
    deps.conversationStore.delete(userId);
  }
}

/**
 * Handle invoke activities (Adaptive Card actions).
 */
async function handleInvoke(
  context: TurnContext,
  logger: ReturnType<typeof getLogger>,
): Promise<void> {
  const value = context.activity.value as Record<string, unknown> | undefined;
  logger.info(
    { action: value?.['action'], userId: context.getUserId() },
    'Card action received',
  );
  // Card action handling will be implemented in M5
  await context.sendActivity('Card action received. Rich card interactions coming in a future update.');
}

/**
 * Extract and store a conversation reference from the current context.
 */
function storeConversationReference(
  context: TurnContext,
  store: ConversationStore,
): void {
  const userId = context.getUserId();
  const ref: ConversationReference = {
    conversationId: context.getConversationId(),
    userId,
    serviceUrl: context.getServiceUrl(),
    botId: context.activity.recipient?.id ?? '',
    tenantId: context.getTenantId(),
    lastActivity: new Date().toISOString(),
  };
  store.set(userId, ref);
}
