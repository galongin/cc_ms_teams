// Configuration
export { ConfigSchema, type Config, type BotConfig, type AuthConfig, type TunnelConfig, type ClaudeConfig, type LoggingConfig, type AuditConfig } from './config/schema.js';
export { loadConfig, saveConfig, ensureConfigDir } from './config/loader.js';
export { DEFAULT_CONFIG } from './config/defaults.js';
export { CONFIG_DIR, CONFIG_FILE, PID_FILE, AUDIT_LOG_FILE, TUNNEL_FILE } from './config/paths.js';

// Logging
export { createLogger, getLogger, setLogger } from './logging/logger.js';
export { AuditLogger, type AuditEntry } from './logging/audit.js';

// Tunnel
export type { ITunnelProvider, TunnelInfo, TunnelStatus, StatusChangeHandler } from './tunnel/types.js';
export { TunnelManager } from './tunnel/manager.js';
export { DevTunnelProvider } from './tunnel/devtunnel-provider.js';
export { NgrokProvider } from './tunnel/ngrok-provider.js';
export { TunnelHealthMonitor, type HealthMonitorOptions } from './tunnel/health.js';

// Bot
export { createTeamsApp, type TeamsApp, type TeamsAppOptions, type TeamsActivity, type TurnContext } from './bot/teams-app.js';
export { createActivityHandler, type ActivityHandler, type ActivityHandlerDeps } from './bot/activity-handlers.js';
export { parseCommand, formatHelpText, isParsedCommand, isUnknownCommand, COMMANDS, type ParsedCommand, type UnknownCommand, type ParseResult } from './bot/command-parser.js';
export { ProactiveSender, type SendOptions, type MessagePoster, type ProactivePayload, type AdaptiveCardAttachment } from './bot/proactive-sender.js';
export { ConversationStore, type ConversationReference } from './bot/conversation-store.js';
export { generateManifest, generateManifestZip, type ManifestOptions, type TeamsManifest } from './bot/manifest-generator.js';

// Utilities
export { AsyncQueue } from './utils/async-queue.js';
export { retry, type RetryOptions } from './utils/retry.js';
export { writePidFile, readPidFile, removePidFile, isProcessAlive, stopProcess } from './utils/pid-file.js';
