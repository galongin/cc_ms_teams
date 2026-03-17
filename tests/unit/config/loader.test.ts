import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We need to mock the config paths before importing the loader
const TEST_DIR = join(tmpdir(), `cc-ms-teams-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const TEST_CONFIG_FILE = join(TEST_DIR, 'config.json');

vi.mock('../../../src/config/paths.js', () => ({
  CONFIG_DIR: TEST_DIR,
  CONFIG_FILE: TEST_CONFIG_FILE,
  PID_FILE: join(TEST_DIR, 'bot.pid'),
  AUDIT_LOG_FILE: join(TEST_DIR, 'audit.jsonl'),
  TUNNEL_FILE: join(TEST_DIR, 'tunnel.json'),
  CONVERSATIONS_FILE: join(TEST_DIR, 'conversations.json'),
  SESSIONS_FILE: join(TEST_DIR, 'sessions.json'),
}));

// Import after mocking
const { loadConfig, saveConfig, ensureConfigDir } = await import('../../../src/config/loader.js');

describe('config/loader', () => {
  beforeEach(() => {
    // Ensure clean test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    // Restore env vars
    delete process.env['CC_MS_TEAMS_BOT_PORT'];
    delete process.env['CC_MS_TEAMS_LOGGING_LEVEL'];
    delete process.env['CC_MS_TEAMS_TUNNEL_PROVIDER'];
    delete process.env['ANTHROPIC_API_KEY'];
  });

  describe('ensureConfigDir', () => {
    it('should create the config directory if it does not exist', () => {
      expect(existsSync(TEST_DIR)).toBe(false);
      ensureConfigDir();
      expect(existsSync(TEST_DIR)).toBe(true);
    });

    it('should not throw if the directory already exists', () => {
      mkdirSync(TEST_DIR, { recursive: true });
      expect(() => ensureConfigDir()).not.toThrow();
    });
  });

  describe('loadConfig', () => {
    it('should return defaults when no config file exists', () => {
      const config = loadConfig();
      expect(config.bot.port).toBe(3978);
      expect(config.tunnel.provider).toBe('devtunnel');
      expect(config.logging.level).toBe('info');
    });

    it('should load and merge from a config file', () => {
      mkdirSync(TEST_DIR, { recursive: true });
      writeFileSync(TEST_CONFIG_FILE, JSON.stringify({
        bot: { port: 5000 },
        logging: { level: 'debug' },
      }));

      const config = loadConfig();
      expect(config.bot.port).toBe(5000);
      expect(config.logging.level).toBe('debug');
      // Other defaults still apply
      expect(config.tunnel.provider).toBe('devtunnel');
    });

    it('should apply environment variable overrides', () => {
      process.env['CC_MS_TEAMS_BOT_PORT'] = '6000';
      process.env['CC_MS_TEAMS_LOGGING_LEVEL'] = 'warn';
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test123';

      const config = loadConfig();
      expect(config.bot.port).toBe(6000);
      expect(config.logging.level).toBe('warn');
      expect(config.claude.apiKey).toBe('sk-ant-test123');
    });

    it('should prioritize env vars over file values', () => {
      mkdirSync(TEST_DIR, { recursive: true });
      writeFileSync(TEST_CONFIG_FILE, JSON.stringify({
        bot: { port: 5000 },
      }));

      process.env['CC_MS_TEAMS_BOT_PORT'] = '7000';

      const config = loadConfig();
      expect(config.bot.port).toBe(7000);
    });

    it('should throw on invalid config values', () => {
      mkdirSync(TEST_DIR, { recursive: true });
      writeFileSync(TEST_CONFIG_FILE, JSON.stringify({
        bot: { port: 99999 },
      }));

      expect(() => loadConfig()).toThrow();
    });
  });

  describe('saveConfig', () => {
    it('should write config to disk', () => {
      const config = loadConfig(); // Get defaults
      config.bot.port = 4444;

      saveConfig(config);

      expect(existsSync(TEST_CONFIG_FILE)).toBe(true);

      // Reload and verify
      const reloaded = loadConfig();
      expect(reloaded.bot.port).toBe(4444);
    });

    it('should create the config directory if needed', () => {
      expect(existsSync(TEST_DIR)).toBe(false);

      const config = loadConfig();
      saveConfig(config);

      expect(existsSync(TEST_DIR)).toBe(true);
      expect(existsSync(TEST_CONFIG_FILE)).toBe(true);
    });
  });
});
