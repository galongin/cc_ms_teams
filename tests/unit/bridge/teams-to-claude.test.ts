import { describe, it, expect } from 'vitest';
import {
  transformTeamsToClaudeMessage,
  EmptyMessageError,
} from '../../../src/bridge/teams-to-claude.js';

describe('bridge/teams-to-claude', () => {
  it('should return clean text for a simple message', () => {
    expect(transformTeamsToClaudeMessage('Hello world')).toBe('Hello world');
  });

  it('should strip @mention XML tags', () => {
    const input = '<at>Claude Code</at> fix the bug';
    expect(transformTeamsToClaudeMessage(input)).toBe('fix the bug');
  });

  it('should strip @mention tags with attributes', () => {
    const input = '<at id="12345">Claude Code</at> help me';
    expect(transformTeamsToClaudeMessage(input)).toBe('help me');
  });

  it('should handle multiple @mention tags', () => {
    const input = '<at>Claude Code</at> <at>Other Bot</at> do something';
    expect(transformTeamsToClaudeMessage(input)).toBe('do something');
  });

  it('should decode HTML entities', () => {
    const input = 'x &gt; 5 &amp;&amp; y &lt; 10';
    expect(transformTeamsToClaudeMessage(input)).toBe('x > 5 && y < 10');
  });

  it('should decode &quot; and &#39; entities', () => {
    const input = 'He said &quot;hello&quot; and &#39;goodbye&#39;';
    expect(transformTeamsToClaudeMessage(input)).toBe(
      'He said "hello" and \'goodbye\'',
    );
  });

  it('should decode &nbsp; entities', () => {
    const input = 'word1&nbsp;word2';
    expect(transformTeamsToClaudeMessage(input)).toBe('word1 word2');
  });

  it('should normalize excessive whitespace', () => {
    const input = '  too   many    spaces  ';
    expect(transformTeamsToClaudeMessage(input)).toBe('too many spaces');
  });

  it('should preserve newlines for markdown', () => {
    const input = 'line1\nline2\nline3';
    expect(transformTeamsToClaudeMessage(input)).toBe('line1\nline2\nline3');
  });

  it('should preserve code blocks', () => {
    const input = 'Here is code:\n```typescript\nconst x = 1;\n```';
    expect(transformTeamsToClaudeMessage(input)).toBe(
      'Here is code:\n```typescript\nconst x = 1;\n```',
    );
  });

  it('should throw EmptyMessageError for empty string', () => {
    expect(() => transformTeamsToClaudeMessage('')).toThrow(EmptyMessageError);
  });

  it('should throw EmptyMessageError when only @mention remains', () => {
    expect(() =>
      transformTeamsToClaudeMessage('<at>Claude Code</at> '),
    ).toThrow(EmptyMessageError);
  });

  it('should throw EmptyMessageError for whitespace-only input', () => {
    expect(() => transformTeamsToClaudeMessage('   \n  \t  ')).toThrow(
      EmptyMessageError,
    );
  });

  it('should handle combined @mention + HTML entities', () => {
    const input = '<at>Claude Code</at> show files &gt; 1MB';
    expect(transformTeamsToClaudeMessage(input)).toBe('show files > 1MB');
  });
});
