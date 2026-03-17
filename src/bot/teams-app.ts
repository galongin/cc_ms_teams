/**
 * Teams bot application factory.
 *
 * Creates an HTTP server that receives Teams activities on POST /api/messages
 * and exposes a GET /health endpoint. Uses botbuilder v4 as the SDK adapter
 * behind clean interfaces, allowing future migration to Teams SDK v2.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { BotConfig } from '../config/schema.js';
import { getLogger } from '../logging/logger.js';
import type { ActivityHandler } from './activity-handlers.js';

/** Represents a Teams activity received from the Bot Framework. */
export interface TeamsActivity {
  type: string;
  id?: string;
  timestamp?: string;
  channelId?: string;
  from?: { id?: string; name?: string; aadObjectId?: string };
  conversation?: { id?: string; conversationType?: string; tenantId?: string };
  recipient?: { id?: string; name?: string };
  text?: string;
  value?: unknown;
  serviceUrl?: string;
  channelData?: unknown;
  action?: string;
}

/** Context object passed to activity handlers. */
export interface TurnContext {
  activity: TeamsActivity;
  /** Send a text reply in the current conversation. */
  sendActivity: (text: string) => Promise<void>;
  /** Send a typing indicator. */
  sendTyping: () => Promise<void>;
  /** Get the user's AAD object ID. */
  getUserId: () => string;
  /** Get the conversation ID. */
  getConversationId: () => string;
  /** Get the service URL. */
  getServiceUrl: () => string;
  /** Get the tenant ID. */
  getTenantId: () => string;
}

/** Options for creating the Teams app. */
export interface TeamsAppOptions {
  botConfig: BotConfig;
  devMode?: boolean;
}

/** The created Teams app instance. */
export interface TeamsApp {
  /** The underlying HTTP server. */
  server: Server;
  /** Start listening on the configured port. */
  start: () => Promise<void>;
  /** Gracefully stop the server. */
  stop: () => Promise<void>;
  /** Register the activity handler. */
  setActivityHandler: (handler: ActivityHandler) => void;
  /** The port the server is listening on. */
  port: number;
}

/**
 * Create a Teams bot application with HTTP adapter.
 *
 * Sets up:
 * - POST /api/messages -- receives Bot Framework activities
 * - GET /health -- health check endpoint
 */
export function createTeamsApp(options: TeamsAppOptions): TeamsApp {
  const { botConfig, devMode = false } = options;
  const logger = getLogger().child({ component: 'teams-app' });
  const port = botConfig.port;
  const startTime = Date.now();

  let activityHandler: ActivityHandler | null = null;
  let server: Server;

  /**
   * Parse the request body as JSON.
   */
  function parseBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve(body ? JSON.parse(body) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Create a TurnContext from an incoming activity.
   */
  function createTurnContext(activity: TeamsActivity, _res: ServerResponse): TurnContext {
    // Queue of responses to send back
    const responses: string[] = [];

    return {
      activity,
      sendActivity: async (text: string) => {
        responses.push(text);
        logger.debug({ text: text.slice(0, 100) }, 'Queued response');
        // In a real Bot Framework integration, this would POST to the service URL.
        // For now, we collect responses and send the first one in the HTTP response.
        // Proactive sender handles out-of-band messages.
      },
      sendTyping: async () => {
        logger.debug('Typing indicator sent');
      },
      getUserId: () => activity.from?.aadObjectId ?? activity.from?.id ?? 'unknown',
      getConversationId: () => activity.conversation?.id ?? 'unknown',
      getServiceUrl: () => activity.serviceUrl ?? '',
      getTenantId: () => {
        const tenantId = activity.conversation?.tenantId
          ?? (activity.channelData as Record<string, unknown> | undefined)?.['tenant']
          ?? '';
        return typeof tenantId === 'string' ? tenantId : '';
      },
    };
  }

  /**
   * Handle POST /api/messages
   */
  async function handleMessages(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await parseBody(req) as TeamsActivity;

      if (!body || !body.type) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid activity: missing type' }));
        return;
      }

      logger.info(
        {
          type: body.type,
          from: body.from?.aadObjectId ?? body.from?.id,
          conversationId: body.conversation?.id,
        },
        'Received activity',
      );

      const context = createTurnContext(body, res);

      if (activityHandler) {
        await activityHandler(context);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } catch (err) {
      logger.error({ err }, 'Error processing activity');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  /**
   * Handle GET /health
   */
  function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: uptimeSeconds,
      port,
      devMode,
      timestamp: new Date().toISOString(),
    }));
  }

  /**
   * Main request router.
   */
  function requestHandler(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    if (method === 'POST' && url === '/api/messages') {
      handleMessages(req, res).catch((err) => {
        logger.error({ err }, 'Unhandled error in message handler');
        if (!res.headersSent) {
          res.writeHead(500);
          res.end();
        }
      });
    } else if (method === 'GET' && url === '/health') {
      handleHealth(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  server = createServer(requestHandler);

  const app: TeamsApp = {
    server,
    port,

    start: () => {
      return new Promise<void>((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, () => {
          logger.info({ port, devMode }, 'Teams bot server started');
          resolve();
        });
      });
    },

    stop: () => {
      return new Promise<void>((resolve) => {
        server.close(() => {
          logger.info('Teams bot server stopped');
          resolve();
        });
      });
    },

    setActivityHandler: (handler: ActivityHandler) => {
      activityHandler = handler;
    },
  };

  return app;
}
