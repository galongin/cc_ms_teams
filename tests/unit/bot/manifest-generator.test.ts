import { describe, it, expect } from 'vitest';
import { generateManifest, type ManifestOptions } from '../../../src/bot/manifest-generator.js';

const DEFAULT_OPTIONS: ManifestOptions = {
  botId: '12345678-1234-1234-1234-123456789abc',
};

describe('bot/manifest-generator', () => {
  describe('generateManifest', () => {
    it('should generate a valid manifest with required fields', () => {
      const manifest = generateManifest(DEFAULT_OPTIONS);

      expect(manifest.$schema).toContain('MicrosoftTeams.schema.json');
      expect(manifest.manifestVersion).toBe('1.17');
      expect(manifest.id).toBe(DEFAULT_OPTIONS.botId);
    });

    it('should set scopes to personal only', () => {
      const manifest = generateManifest(DEFAULT_OPTIONS);

      expect(manifest.bots).toHaveLength(1);
      expect(manifest.bots[0]?.scopes).toEqual(['personal']);
    });

    it('should set supportsFiles to false', () => {
      const manifest = generateManifest(DEFAULT_OPTIONS);

      expect(manifest.bots[0]?.supportsFiles).toBe(false);
    });

    it('should include bot ID in the bots array', () => {
      const manifest = generateManifest(DEFAULT_OPTIONS);

      expect(manifest.bots[0]?.botId).toBe(DEFAULT_OPTIONS.botId);
    });

    it('should include command list', () => {
      const manifest = generateManifest(DEFAULT_OPTIONS);

      const commands = manifest.bots[0]?.commandLists[0]?.commands;
      expect(commands).toBeDefined();
      expect(commands!.length).toBeGreaterThan(0);

      const commandTitles = commands!.map(c => c.title);
      expect(commandTitles).toContain('new');
      expect(commandTitles).toContain('stop');
      expect(commandTitles).toContain('status');
      expect(commandTitles).toContain('help');
    });

    it('should use default values when optional fields are not provided', () => {
      const manifest = generateManifest(DEFAULT_OPTIONS);

      expect(manifest.name.short).toBe('Claude Code');
      expect(manifest.developer.name).toBe('cc-ms-teams');
      expect(manifest.version).toBe('1.0.0');
    });

    it('should use custom values when provided', () => {
      const manifest = generateManifest({
        ...DEFAULT_OPTIONS,
        botName: 'My Custom Bot',
        developerName: 'Custom Dev',
        version: '2.0.0',
        shortDescription: 'A custom bot',
      });

      expect(manifest.name.short).toBe('My Custom Bot');
      expect(manifest.developer.name).toBe('Custom Dev');
      expect(manifest.version).toBe('2.0.0');
      expect(manifest.description.short).toBe('A custom bot');
    });

    it('should include proper icon references', () => {
      const manifest = generateManifest(DEFAULT_OPTIONS);

      expect(manifest.icons.color).toBe('icon-color.png');
      expect(manifest.icons.outline).toBe('icon-outline.png');
    });

    it('should include permissions', () => {
      const manifest = generateManifest(DEFAULT_OPTIONS);

      expect(manifest.permissions).toContain('identity');
      expect(manifest.permissions).toContain('messageTeamMembers');
    });

    it('should set accent color', () => {
      const manifest = generateManifest(DEFAULT_OPTIONS);
      expect(manifest.accentColor).toBe('#6B4FBB');
    });

    it('should set command scopes to personal', () => {
      const manifest = generateManifest(DEFAULT_OPTIONS);
      const commandList = manifest.bots[0]?.commandLists[0];
      expect(commandList?.scopes).toEqual(['personal']);
    });
  });
});
