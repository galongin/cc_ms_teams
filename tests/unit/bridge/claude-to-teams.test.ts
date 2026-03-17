import { describe, it, expect } from 'vitest';
import {
  transformClaudeToTeamsContent,
  parseMarkdownSegments,
} from '../../../src/bridge/claude-to-teams.js';
import type { OutputEvent } from '../../../src/session/types.js';

describe('bridge/claude-to-teams', () => {
  describe('transformClaudeToTeamsContent', () => {
    it('should convert text events to Teams text', () => {
      const event: OutputEvent = {
        type: 'text',
        text: 'Hello from Claude!',
        sessionId: 'sess-1',
      };
      const result = transformClaudeToTeamsContent(event);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'text', text: 'Hello from Claude!' });
    });

    it('should convert tool_use events to formatted text', () => {
      const event: OutputEvent = {
        type: 'tool_use',
        toolName: 'Read',
        toolId: 'tool-1',
        input: { file_path: '/tmp/test.ts' },
        sessionId: 'sess-1',
      };
      const result = transformClaudeToTeamsContent(event);
      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe('text');
      const text = (result[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('**Using tool:** `Read`');
      expect(text).toContain('file_path');
    });

    it('should convert tool_result events to formatted text', () => {
      const event: OutputEvent = {
        type: 'tool_result',
        toolId: 'tool-1',
        content: 'file contents here',
        isError: false,
        sessionId: 'sess-1',
      };
      const result = transformClaudeToTeamsContent(event);
      expect(result).toHaveLength(1);
      const text = (result[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('**Tool result**');
      expect(text).toContain('tool-1');
    });

    it('should format error tool results differently', () => {
      const event: OutputEvent = {
        type: 'tool_result',
        toolId: 'tool-1',
        content: 'Permission denied',
        isError: true,
        sessionId: 'sess-1',
      };
      const result = transformClaudeToTeamsContent(event);
      const text = (result[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('**Tool error**');
    });

    it('should convert thinking events to italic indicator', () => {
      const event: OutputEvent = {
        type: 'thinking',
        text: 'Let me analyze this...',
        sessionId: 'sess-1',
      };
      const result = transformClaudeToTeamsContent(event);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'text', text: '_Thinking..._' });
    });

    it('should convert error events to bold error message', () => {
      const event: OutputEvent = {
        type: 'error',
        message: 'Something went wrong',
        sessionId: 'sess-1',
      };
      const result = transformClaudeToTeamsContent(event);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'text',
        text: '**Error:** Something went wrong',
      });
    });

    it('should convert result events to summary text', () => {
      const event: OutputEvent = {
        type: 'result',
        subtype: 'success',
        costUsd: 0.0123,
        durationMs: 5500,
        sessionId: 'sess-1',
      };
      const result = transformClaudeToTeamsContent(event);
      expect(result).toHaveLength(1);
      const text = (result[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('**Completed**');
      expect(text).toContain('$0.0123');
      expect(text).toContain('5.5s');
    });

    it('should handle max_turns result subtype', () => {
      const event: OutputEvent = {
        type: 'result',
        subtype: 'max_turns',
        costUsd: 0.05,
        durationMs: 10000,
        sessionId: 'sess-1',
      };
      const result = transformClaudeToTeamsContent(event);
      const text = (result[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Reached max turns');
    });

    it('should handle error result subtype', () => {
      const event: OutputEvent = {
        type: 'result',
        subtype: 'error',
        costUsd: 0.001,
        durationMs: 100,
        sessionId: 'sess-1',
      };
      const result = transformClaudeToTeamsContent(event);
      const text = (result[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Error');
    });

    it('should truncate long tool result content', () => {
      const longContent = 'x'.repeat(600);
      const event: OutputEvent = {
        type: 'tool_result',
        toolId: 'tool-1',
        content: longContent,
        isError: false,
        sessionId: 'sess-1',
      };
      const result = transformClaudeToTeamsContent(event);
      const text = (result[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('...');
      expect(text.length).toBeLessThan(700);
    });
  });

  describe('parseMarkdownSegments', () => {
    it('should return a single text segment for plain text', () => {
      const segments = parseMarkdownSegments('Hello world');
      expect(segments).toEqual([{ type: 'text', text: 'Hello world' }]);
    });

    it('should extract a code block', () => {
      const input = 'Before\n```typescript\nconst x = 1;\n```\nAfter';
      const segments = parseMarkdownSegments(input);
      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ type: 'text', text: 'Before\n' });
      expect(segments[1]).toEqual({
        type: 'code',
        language: 'typescript',
        code: 'const x = 1;\n',
      });
      expect(segments[2]).toEqual({ type: 'text', text: '\nAfter' });
    });

    it('should handle code blocks without language', () => {
      const input = '```\nplain code\n```';
      const segments = parseMarkdownSegments(input);
      expect(segments).toHaveLength(1);
      expect(segments[0]).toEqual({
        type: 'code',
        language: undefined,
        code: 'plain code\n',
      });
    });

    it('should handle multiple code blocks', () => {
      const input = '```js\na\n```\ntext\n```py\nb\n```';
      const segments = parseMarkdownSegments(input);
      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ type: 'code', language: 'js', code: 'a\n' });
      expect(segments[1]).toEqual({ type: 'text', text: '\ntext\n' });
      expect(segments[2]).toEqual({ type: 'code', language: 'py', code: 'b\n' });
    });

    it('should handle code block at the start', () => {
      const input = '```js\nfoo\n```\nafter';
      const segments = parseMarkdownSegments(input);
      expect(segments).toHaveLength(2);
      expect(segments[0]!.type).toBe('code');
      expect(segments[1]!.type).toBe('text');
    });

    it('should handle code block at the end', () => {
      const input = 'before\n```js\nfoo\n```';
      const segments = parseMarkdownSegments(input);
      expect(segments).toHaveLength(2);
      expect(segments[0]!.type).toBe('text');
      expect(segments[1]!.type).toBe('code');
    });

    it('should handle text with no code blocks', () => {
      const input = 'Just plain text with `inline code` markers';
      const segments = parseMarkdownSegments(input);
      expect(segments).toHaveLength(1);
      expect(segments[0]!.type).toBe('text');
    });

    it('should handle adjacent code blocks', () => {
      const input = '```js\na\n```\n```py\nb\n```';
      const segments = parseMarkdownSegments(input);
      expect(segments).toHaveLength(3);
      expect(segments[0]!.type).toBe('code');
      expect(segments[1]).toEqual({ type: 'text', text: '\n' });
      expect(segments[2]!.type).toBe('code');
    });
  });
});
