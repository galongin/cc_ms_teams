import type { Config } from './schema.js';

/**
 * Default configuration values. Every field has a sensible default so the
 * application can start with zero configuration (in dev mode).
 */
export const DEFAULT_CONFIG: Config = {
  bot: {
    id: '00000000-0000-0000-0000-000000000000',
    password: '',
    tenantId: '00000000-0000-0000-0000-000000000000',
    port: 3978,
  },
  auth: {
    allowedUsers: [],
    allowedTenants: [],
    devMode: false,
  },
  claude: {
    apiKey: undefined,
    defaultModel: 'claude-sonnet-4-20250514',
    defaultCwd: process.cwd(),
    defaultMaxTurns: 25,
    defaultMaxBudgetUsd: 1.0,
    defaultAllowedTools: ['Read', 'Grep', 'Glob'],
    defaultPermissionMode: 'default',
    systemPromptAppend: undefined,
  },
  tunnel: {
    provider: 'devtunnel',
    port: 3978,
    persistent: true,
    healthCheckInterval: 30000,
    maxReconnectAttempts: 5,
  },
  streaming: {
    flushIntervalMs: 500,
    charThreshold: 200,
  },
  rateLimit: {
    maxRequestsPerMinute: 10,
    maxConcurrentSessions: 3,
  },
  audit: {
    enabled: true,
    logPath: '~/.cc-ms-teams/audit.jsonl',
    maxFileSizeMb: 100,
  },
  logging: {
    level: 'info',
    pretty: false,
  },
};
