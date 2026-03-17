/**
 * Output processor for Claude Agent SDK query results.
 *
 * Consumes the async iterator of SDK output messages, categorises
 * each into typed OutputEvent objects, and invokes a callback for
 * each event (to be wired to the message bridge in M4).
 */

import type { SDKOutputMessage, SDKContentBlock } from './claude-sdk-types.js';
import type {
  Session,
  OutputEvent,
  OutputEventCallback,
} from './types.js';
import { SessionState } from './types.js';
import { getLogger } from '../logging/logger.js';

/**
 * Process the output stream from a Claude SDK query.
 *
 * This function runs until the query completes, errors, or the session
 * is stopped. It updates session state as it goes.
 *
 * @param session - The active session whose query output to consume.
 * @param callback - Invoked for each output event.
 */
export async function processOutputLoop(
  session: Session,
  callback: OutputEventCallback,
): Promise<void> {
  const logger = getLogger().child({
    component: 'output-processor',
    sessionId: session.id,
  });

  if (!session.query) {
    logger.error('No query attached to session');
    await callback({
      type: 'error',
      message: 'No active query for this session.',
      sessionId: session.id,
    });
    return;
  }

  session.state = SessionState.Processing;

  try {
    for await (const message of session.query) {
      // Check if session was stopped externally
      if ((session.state as SessionState) === SessionState.Stopped) {
        logger.info('Session stopped during processing, exiting loop');
        break;
      }

      session.lastActiveAt = new Date();

      const events = convertMessageToEvents(message, session.id);
      for (const event of events) {
        await callback(event);
      }

      // Update session metadata from result messages
      if (message.type === 'result') {
        session.totalCost += message.cost_usd ?? 0;
        session.turnCount += 1;

        if (message.is_done || message.subtype === 'success' || message.subtype === 'end_turn') {
          session.state = SessionState.Idle;
        } else if (message.subtype === 'error') {
          session.state = SessionState.Idle;
        } else if (message.subtype === 'max_turns') {
          session.state = SessionState.Idle;
        }
      }
    }

    // Query completed naturally
    if (session.state === SessionState.Processing) {
      session.state = SessionState.Idle;
    }

    logger.info(
      { totalCost: session.totalCost, turnCount: session.turnCount },
      'Output loop completed',
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err: errorMessage }, 'Error in output loop');

    session.state = SessionState.Idle;

    await callback({
      type: 'error',
      message: `Session error: ${errorMessage}`,
      sessionId: session.id,
    });
  }
}

/**
 * Convert an SDK output message into one or more typed OutputEvents.
 */
function convertMessageToEvents(
  message: SDKOutputMessage,
  sessionId: string,
): OutputEvent[] {
  const events: OutputEvent[] = [];

  switch (message.type) {
    case 'assistant': {
      for (const block of message.message.content) {
        const event = convertContentBlock(block, sessionId);
        if (event) {
          events.push(event);
        }
      }
      break;
    }

    case 'result': {
      events.push({
        type: 'result',
        subtype: message.subtype,
        costUsd: message.cost_usd ?? 0,
        durationMs: message.duration_ms ?? 0,
        sessionId,
      });
      break;
    }
  }

  return events;
}

/**
 * Convert a single SDK content block to an OutputEvent.
 */
function convertContentBlock(
  block: SDKContentBlock,
  sessionId: string,
): OutputEvent | null {
  switch (block.type) {
    case 'text':
      return {
        type: 'text',
        text: block.text,
        sessionId,
      };

    case 'tool_use':
      return {
        type: 'tool_use',
        toolName: block.name,
        toolId: block.id,
        input: block.input,
        sessionId,
      };

    case 'tool_result':
      return {
        type: 'tool_result',
        toolId: block.tool_use_id,
        content: block.content,
        isError: block.is_error ?? false,
        sessionId,
      };

    case 'thinking':
      return {
        type: 'thinking',
        text: block.thinking,
        sessionId,
      };

    default:
      return null;
  }
}
