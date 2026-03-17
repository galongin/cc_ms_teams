import { describe, it, expect } from 'vitest';
import {
  ConfigSchema,
  BotConfigSchema,
  AuthConfigSchema,
  TunnelConfigSchema,
  LoggingConfigSchema,
  AuditConfigSchema,
} from '../../../src/config/schema.js';

describe('config/schema', () => {
  describe('ConfigSchema', () => {
    it('should parse an empty object using defaults', () => {
      const result = ConfigSchema.parse({});
      expect(result.bot.port).toBe(3978);
      expect(result.tunnel.provider).toBe('devtunnel');
      expect(result.logging.level).toBe('info');
      expect(result.auth.devMode).toBe(false);
      expect(result.audit.enabled).toBe(true);
    });

    it('should parse a fully specified config', () => {
      const result = ConfigSchema.parse({
        bot: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          password: 'my-secret',
          tenantId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          port: 4000,
        },
        auth: {
          allowedUsers: ['user-1'],
          devMode: true,
        },
        tunnel: {
          provider: 'ngrok',
          port: 4000,
        },
        logging: {
          level: 'debug',
          pretty: true,
        },
      });

      expect(result.bot.port).toBe(4000);
      expect(result.bot.password).toBe('my-secret');
      expect(result.auth.devMode).toBe(true);
      expect(result.auth.allowedUsers).toEqual(['user-1']);
      expect(result.tunnel.provider).toBe('ngrok');
      expect(result.logging.level).toBe('debug');
    });

    it('should reject an invalid bot port', () => {
      expect(() =>
        ConfigSchema.parse({ bot: { port: 99999 } })
      ).toThrow();
    });

    it('should reject an invalid logging level', () => {
      expect(() =>
        ConfigSchema.parse({ logging: { level: 'verbose' } })
      ).toThrow();
    });

    it('should reject a non-uuid bot id when explicitly set', () => {
      expect(() =>
        BotConfigSchema.parse({ id: 'not-a-uuid', password: 'x', tenantId: '00000000-0000-0000-0000-000000000000' })
      ).toThrow();
    });
  });

  describe('BotConfigSchema', () => {
    it('should apply defaults for missing fields', () => {
      const result = BotConfigSchema.parse({});
      expect(result.port).toBe(3978);
      expect(result.id).toBe('00000000-0000-0000-0000-000000000000');
    });
  });

  describe('AuthConfigSchema', () => {
    it('should default to empty allowed lists and devMode false', () => {
      const result = AuthConfigSchema.parse({});
      expect(result.allowedUsers).toEqual([]);
      expect(result.allowedTenants).toEqual([]);
      expect(result.devMode).toBe(false);
    });
  });

  describe('TunnelConfigSchema', () => {
    it('should default to devtunnel provider', () => {
      const result = TunnelConfigSchema.parse({});
      expect(result.provider).toBe('devtunnel');
      expect(result.persistent).toBe(true);
      expect(result.healthCheckInterval).toBe(30000);
    });

    it('should reject invalid health check interval', () => {
      expect(() =>
        TunnelConfigSchema.parse({ healthCheckInterval: 100 })
      ).toThrow();
    });
  });

  describe('LoggingConfigSchema', () => {
    it('should default to info level', () => {
      const result = LoggingConfigSchema.parse({});
      expect(result.level).toBe('info');
      expect(result.pretty).toBe(false);
    });
  });

  describe('AuditConfigSchema', () => {
    it('should default to enabled', () => {
      const result = AuditConfigSchema.parse({});
      expect(result.enabled).toBe(true);
      expect(result.maxFileSizeMb).toBe(100);
    });
  });
});
