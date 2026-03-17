import { z } from 'zod';

export const BotConfigSchema = z.object({
  id: z.string().uuid().describe('Azure Bot App Registration Client ID').default('00000000-0000-0000-0000-000000000000'),
  password: z.string().describe('Azure Bot App Registration Client Secret').default(''),
  tenantId: z.string().uuid().describe('Azure AD Tenant ID').default('00000000-0000-0000-0000-000000000000'),
  port: z.number().int().min(1).max(65535).default(3978),
});

export const AuthConfigSchema = z.object({
  allowedUsers: z.array(z.string()).default([])
    .describe('AAD Object IDs of allowed users. Empty = all tenant users.'),
  allowedTenants: z.array(z.string()).default([])
    .describe('Allowed tenant IDs. Empty = bot tenant only.'),
  devMode: z.boolean().default(false)
    .describe('Bypass authentication (local development only)'),
});

export const ClaudeConfigSchema = z.object({
  apiKey: z.string().optional()
    .describe('Anthropic API key. Env var ANTHROPIC_API_KEY takes precedence.'),
  defaultModel: z.string().default('claude-sonnet-4-20250514'),
  defaultCwd: z.string().default(process.cwd()),
  defaultMaxTurns: z.number().int().min(1).default(25),
  defaultMaxBudgetUsd: z.number().min(0).default(1.0),
  defaultAllowedTools: z.array(z.string()).default(['Read', 'Grep', 'Glob']),
  defaultPermissionMode: z.enum([
    'default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk',
  ]).default('default'),
  systemPromptAppend: z.string().optional()
    .describe('Text appended to the Claude Code system prompt'),
});

export const TunnelConfigSchema = z.object({
  provider: z.enum(['devtunnel', 'ngrok']).default('devtunnel'),
  port: z.number().int().min(1).max(65535).default(3978),
  persistent: z.boolean().default(true),
  healthCheckInterval: z.number().int().min(1000).default(30000),
  maxReconnectAttempts: z.number().int().min(0).default(5),
});

export const StreamingConfigSchema = z.object({
  flushIntervalMs: z.number().int().min(100).default(500),
  charThreshold: z.number().int().min(50).default(200),
});

export const RateLimitConfigSchema = z.object({
  maxRequestsPerMinute: z.number().int().min(1).default(10),
  maxConcurrentSessions: z.number().int().min(1).default(3),
});

export const AuditConfigSchema = z.object({
  enabled: z.boolean().default(true),
  logPath: z.string().default('~/.cc-ms-teams/audit.jsonl'),
  maxFileSizeMb: z.number().min(1).default(100),
});

export const LoggingConfigSchema = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  pretty: z.boolean().default(false),
});

export const ConfigSchema = z.object({
  bot: BotConfigSchema.default({}),
  auth: AuthConfigSchema.default({}),
  claude: ClaudeConfigSchema.default({}),
  tunnel: TunnelConfigSchema.default({}),
  streaming: StreamingConfigSchema.default({}),
  rateLimit: RateLimitConfigSchema.default({}),
  audit: AuditConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type BotConfig = z.infer<typeof BotConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type ClaudeConfig = z.infer<typeof ClaudeConfigSchema>;
export type TunnelConfig = z.infer<typeof TunnelConfigSchema>;
export type StreamingConfig = z.infer<typeof StreamingConfigSchema>;
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
export type AuditConfig = z.infer<typeof AuditConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
