import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { ConfigSchema, type Config } from './schema.js';
import { CONFIG_DIR, CONFIG_FILE } from './paths.js';

/**
 * Ensures the config directory exists with owner-only permissions.
 */
export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Reads the raw config JSON from disk if it exists.
 * Returns an empty object if the file does not exist.
 */
function readConfigFile(): Record<string, unknown> {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  const raw = readFileSync(CONFIG_FILE, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * Applies CC_MS_TEAMS_* environment variable overrides to the raw config.
 *
 * Mapping convention:
 *   CC_MS_TEAMS_BOT_PORT       -> bot.port
 *   CC_MS_TEAMS_TUNNEL_PROVIDER -> tunnel.provider
 *   CC_MS_TEAMS_LOGGING_LEVEL   -> logging.level
 *   ANTHROPIC_API_KEY           -> claude.apiKey
 *
 * Nested keys use underscore-separated section_field naming.
 */
function applyEnvOverrides(config: Record<string, unknown>): Record<string, unknown> {
  const envMap: Array<{ env: string; path: [string, string]; transform?: (v: string) => unknown }> = [
    { env: 'CC_MS_TEAMS_BOT_ID', path: ['bot', 'id'] },
    { env: 'CC_MS_TEAMS_BOT_PASSWORD', path: ['bot', 'password'] },
    { env: 'CC_MS_TEAMS_BOT_TENANT_ID', path: ['bot', 'tenantId'] },
    { env: 'CC_MS_TEAMS_BOT_PORT', path: ['bot', 'port'], transform: Number },
    { env: 'CC_MS_TEAMS_AUTH_DEV_MODE', path: ['auth', 'devMode'], transform: (v) => v === 'true' },
    { env: 'CC_MS_TEAMS_TUNNEL_PROVIDER', path: ['tunnel', 'provider'] },
    { env: 'CC_MS_TEAMS_TUNNEL_PORT', path: ['tunnel', 'port'], transform: Number },
    { env: 'CC_MS_TEAMS_LOGGING_LEVEL', path: ['logging', 'level'] },
    { env: 'CC_MS_TEAMS_LOGGING_PRETTY', path: ['logging', 'pretty'], transform: (v) => v === 'true' },
    { env: 'ANTHROPIC_API_KEY', path: ['claude', 'apiKey'] },
  ];

  const result = structuredClone(config);

  for (const { env, path, transform } of envMap) {
    const value = process.env[env];
    if (value !== undefined) {
      const [section, key] = path;
      if (typeof result[section] !== 'object' || result[section] === null) {
        result[section] = {};
      }
      (result[section] as Record<string, unknown>)[key] = transform ? transform(value) : value;
    }
  }

  return result;
}

/**
 * Loads the configuration from disk, merges env var overrides, and validates
 * the result against the Zod schema. Returns a fully typed Config object.
 *
 * If no config file exists, defaults are used (all settings have defaults via Zod).
 */
export function loadConfig(): Config {
  const fileConfig = readConfigFile();
  const merged = applyEnvOverrides(fileConfig);
  return ConfigSchema.parse(merged);
}

/**
 * Saves the configuration to disk with owner-only permissions.
 */
export function saveConfig(config: Config): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', {
    mode: 0o600,
  });
}
