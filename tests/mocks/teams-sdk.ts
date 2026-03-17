/**
 * Mock implementations for Teams bot testing.
 *
 * Provides mock TurnContext, TeamsActivity, and other objects
 * needed to test activity handlers without a real Teams connection.
 */

import type { TeamsActivity, TurnContext } from '../../src/bot/teams-app.js';

/** Create a mock Teams activity. */
export function createMockActivity(overrides: Partial<TeamsActivity> = {}): TeamsActivity {
  return {
    type: 'message',
    id: 'activity-1',
    timestamp: new Date().toISOString(),
    channelId: 'msteams',
    from: {
      id: 'user-bot-id-1',
      name: 'Test User',
      aadObjectId: 'aad-user-1',
    },
    conversation: {
      id: 'conv-1',
      conversationType: 'personal',
      tenantId: 'tenant-1',
    },
    recipient: {
      id: 'bot-id-1',
      name: 'Claude Code',
    },
    text: '',
    serviceUrl: 'https://smba.trafficmanager.net/teams/',
    ...overrides,
  };
}

/** Recorded calls made to a mock TurnContext. */
export interface MockTurnContextCalls {
  sendActivity: string[];
  sendTyping: number;
}

/** Create a mock TurnContext for testing activity handlers. */
export function createMockTurnContext(
  activity?: Partial<TeamsActivity>,
): { context: TurnContext; calls: MockTurnContextCalls } {
  const fullActivity = createMockActivity(activity);
  const calls: MockTurnContextCalls = {
    sendActivity: [],
    sendTyping: 0,
  };

  const context: TurnContext = {
    activity: fullActivity,
    sendActivity: async (text: string) => {
      calls.sendActivity.push(text);
    },
    sendTyping: async () => {
      calls.sendTyping++;
    },
    getUserId: () => fullActivity.from?.aadObjectId ?? fullActivity.from?.id ?? 'unknown',
    getConversationId: () => fullActivity.conversation?.id ?? 'unknown',
    getServiceUrl: () => fullActivity.serviceUrl ?? '',
    getTenantId: () => fullActivity.conversation?.tenantId ?? '',
  };

  return { context, calls };
}
