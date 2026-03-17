/**
 * Mock Claude Agent SDK for testing.
 *
 * Provides a mock query() function that returns an async iterator
 * of configurable output messages.
 */

import type {
  QueryFunction,
  QueryOptions,
  Query,
  SDKOutputMessage,
  SDKAssistantMessage,
  SDKResultMessage,
} from '../../src/session/claude-sdk-types.js';

/**
 * Create a mock query function that yields the provided messages.
 *
 * The mock consumes input messages from the prompt iterator and
 * yields the configured output messages in response.
 */
export function createMockQueryFn(
  outputMessages: SDKOutputMessage[] = [],
): QueryFunction {
  return (_opts: QueryOptions): Query => {
    let aborted = false;

    const query: Query = {
      abort() {
        aborted = true;
      },

      [Symbol.asyncIterator](): AsyncIterator<SDKOutputMessage> {
        let index = 0;
        return {
          async next(): Promise<IteratorResult<SDKOutputMessage>> {
            if (aborted || index >= outputMessages.length) {
              return { value: undefined as unknown as SDKOutputMessage, done: true };
            }
            const value = outputMessages[index]!;
            index++;
            return { value, done: false };
          },
        };
      },
    };

    return query;
  };
}

/**
 * Create a mock query function that waits for input messages before yielding output.
 *
 * For each input message received, yields the next output message.
 * Useful for testing interactive sessions.
 */
export function createInteractiveMockQueryFn(
  responseMap: Map<string, SDKOutputMessage[]>,
): QueryFunction {
  return (opts: QueryOptions): Query => {
    let aborted = false;
    const outputQueue: SDKOutputMessage[] = [];
    let resolveWait: (() => void) | null = null;

    // Start consuming input in the background
    const consumeInput = async () => {
      for await (const msg of opts.prompt) {
        if (aborted) break;
        const content = msg.message.content;
        const responses = responseMap.get(content);
        if (responses) {
          outputQueue.push(...responses);
        }
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      }
      // Signal done when input is closed
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };

    // Fire and forget -- we don't await this
    void consumeInput();

    const query: Query = {
      abort() {
        aborted = true;
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      },

      [Symbol.asyncIterator](): AsyncIterator<SDKOutputMessage> {
        return {
          async next(): Promise<IteratorResult<SDKOutputMessage>> {
            while (!aborted) {
              const item = outputQueue.shift();
              if (item) {
                return { value: item, done: false };
              }
              // Wait for more items
              await new Promise<void>((resolve) => {
                resolveWait = resolve;
                // Also resolve if there are already items
                if (outputQueue.length > 0 || aborted) {
                  resolve();
                }
              });

              if (aborted) break;
              // Check again after waking up
              if (outputQueue.length === 0) {
                // Input stream ended with no more output
                return { value: undefined as unknown as SDKOutputMessage, done: true };
              }
            }
            return { value: undefined as unknown as SDKOutputMessage, done: true };
          },
        };
      },
    };

    return query;
  };
}

// ── Helpers to build mock messages ────────────────────────────────────

export function mockTextMessage(text: string): SDKAssistantMessage {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
  };
}

export function mockToolUseMessage(name: string, input: Record<string, unknown> = {}): SDKAssistantMessage {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{
        type: 'tool_use',
        id: `tool-${Date.now()}`,
        name,
        input,
      }],
    },
  };
}

export function mockResultMessage(
  subtype: SDKResultMessage['subtype'] = 'success',
  costUsd = 0.01,
): SDKResultMessage {
  return {
    type: 'result',
    subtype,
    cost_usd: costUsd,
    duration_ms: 1000,
    is_done: subtype === 'success' || subtype === 'end_turn',
  };
}

export function mockThinkingMessage(text: string): SDKAssistantMessage {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'thinking', thinking: text }],
    },
  };
}
