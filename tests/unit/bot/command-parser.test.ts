import { describe, it, expect } from 'vitest';
import {
  parseCommand,
  formatHelpText,
  isParsedCommand,
  isUnknownCommand,
  COMMANDS,
  type ParsedCommand,
  type UnknownCommand,
} from '../../../src/bot/command-parser.js';

describe('bot/command-parser', () => {
  describe('parseCommand', () => {
    it('should return null for regular chat messages', () => {
      expect(parseCommand('hello world')).toBeNull();
      expect(parseCommand('this is not a command')).toBeNull();
      expect(parseCommand('')).toBeNull();
      expect(parseCommand('  some text  ')).toBeNull();
    });

    it('should parse known commands without arguments', () => {
      const result = parseCommand('/help') as ParsedCommand;
      expect(result).not.toBeNull();
      expect(result.command).toBe('help');
      expect(result.args).toBe('');
      expect(result.argv).toEqual([]);
    });

    it('should parse known commands with arguments', () => {
      const result = parseCommand('/project /home/user/code') as ParsedCommand;
      expect(result).not.toBeNull();
      expect(result.command).toBe('project');
      expect(result.args).toBe('/home/user/code');
      expect(result.argv).toEqual(['/home/user/code']);
    });

    it('should parse commands with multiple arguments', () => {
      const result = parseCommand('/model claude-sonnet-4-20250514 --verbose') as ParsedCommand;
      expect(result).not.toBeNull();
      expect(result.command).toBe('model');
      expect(result.args).toBe('claude-sonnet-4-20250514 --verbose');
      expect(result.argv).toEqual(['claude-sonnet-4-20250514', '--verbose']);
    });

    it('should handle commands case-insensitively', () => {
      const result1 = parseCommand('/Help') as ParsedCommand;
      expect(result1.command).toBe('help');

      const result2 = parseCommand('/NEW') as ParsedCommand;
      expect(result2.command).toBe('new');

      const result3 = parseCommand('/Status') as ParsedCommand;
      expect(result3.command).toBe('status');
    });

    it('should return UnknownCommand for unrecognized commands', () => {
      const result = parseCommand('/foobar') as UnknownCommand;
      expect(result).not.toBeNull();
      expect(result.command).toBe('unknown');
      expect(result.original).toBe('foobar');
      expect(result.helpText).toContain('Available Commands');
    });

    it('should handle leading/trailing whitespace', () => {
      const result = parseCommand('  /help  ') as ParsedCommand;
      expect(result.command).toBe('help');
    });

    it('should parse all known commands', () => {
      for (const [cmd] of COMMANDS) {
        const result = parseCommand(`/${cmd}`);
        expect(result).not.toBeNull();
        expect(isParsedCommand(result)).toBe(true);
        if (isParsedCommand(result)) {
          expect(result.command).toBe(cmd);
        }
      }
    });

    it('should handle command with extra spaces in arguments', () => {
      const result = parseCommand('/project   /some/path   ') as ParsedCommand;
      expect(result.command).toBe('project');
      expect(result.args).toBe('/some/path');
    });
  });

  describe('formatHelpText', () => {
    it('should include all commands', () => {
      const text = formatHelpText();
      for (const [cmd, desc] of COMMANDS) {
        expect(text).toContain(`/${cmd}`);
        expect(text).toContain(desc);
      }
    });

    it('should include header', () => {
      const text = formatHelpText();
      expect(text).toContain('Available Commands');
    });
  });

  describe('type guards', () => {
    it('isParsedCommand returns true for valid commands', () => {
      const result = parseCommand('/help');
      expect(isParsedCommand(result)).toBe(true);
    });

    it('isParsedCommand returns false for null', () => {
      expect(isParsedCommand(null)).toBe(false);
    });

    it('isParsedCommand returns false for unknown commands', () => {
      const result = parseCommand('/doesnotexist');
      expect(isParsedCommand(result)).toBe(false);
    });

    it('isUnknownCommand returns true for unknown commands', () => {
      const result = parseCommand('/doesnotexist');
      expect(isUnknownCommand(result)).toBe(true);
    });

    it('isUnknownCommand returns false for known commands', () => {
      const result = parseCommand('/help');
      expect(isUnknownCommand(result)).toBe(false);
    });

    it('isUnknownCommand returns false for null', () => {
      expect(isUnknownCommand(null)).toBe(false);
    });
  });
});
