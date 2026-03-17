import { describe, it, expect } from 'vitest';
import { chunkText, isCardOversized } from '../../../src/bridge/content-chunker.js';

describe('bridge/content-chunker', () => {
  describe('chunkText', () => {
    it('should return short text as a single chunk', () => {
      const result = chunkText('Hello world');
      expect(result).toEqual(['Hello world']);
    });

    it('should return empty array for empty string', () => {
      const result = chunkText('');
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace-only string', () => {
      const result = chunkText('   \n  \n  ');
      expect(result).toEqual([]);
    });

    it('should split long text at paragraph boundaries', () => {
      const para1 = 'A'.repeat(100);
      const para2 = 'B'.repeat(100);
      const text = para1 + '\n\n' + para2;

      const result = chunkText(text, { maxTextChars: 150 });
      expect(result).toHaveLength(2);
      expect(result[0]).toBe(para1);
      expect(result[1]).toBe(para2);
    });

    it('should split at line boundaries when no paragraph break', () => {
      const line1 = 'A'.repeat(80);
      const line2 = 'B'.repeat(80);
      const text = line1 + '\n' + line2;

      const result = chunkText(text, { maxTextChars: 100 });
      expect(result).toHaveLength(2);
      expect(result[0]).toBe(line1);
      expect(result[1]).toBe(line2);
    });

    it('should split at word boundaries when no line break', () => {
      const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');

      const result = chunkText(words, { maxTextChars: 80 });
      expect(result.length).toBeGreaterThan(1);
      for (const chunk of result) {
        expect(chunk.length).toBeLessThanOrEqual(80);
      }
    });

    it('should hard split when no boundaries found', () => {
      const longWord = 'x'.repeat(200);
      const result = chunkText(longWord, { maxTextChars: 50 });
      expect(result.length).toBeGreaterThan(1);
      expect(result[0]!.length).toBeLessThanOrEqual(50);
    });

    it('should preserve code blocks when possible', () => {
      const codeBlock = '```typescript\nconst x = 1;\nconst y = 2;\n```';
      const text = 'A'.repeat(30) + '\n' + codeBlock;

      const result = chunkText(text, { maxTextChars: 200 });
      // Should keep it as one chunk since total is under limit
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('```typescript');
    });

    it('should separate code blocks from text when exceeding limit', () => {
      const before = 'A'.repeat(50);
      const codeBlock = '```js\n' + 'B'.repeat(50) + '\n```';
      const text = before + '\n' + codeBlock;

      const result = chunkText(text, { maxTextChars: 60 });
      expect(result.length).toBeGreaterThan(1);
    });

    it('should trim each chunk', () => {
      const text = '  hello  \n\n  world  ';
      const result = chunkText(text, { maxTextChars: 10 });
      for (const chunk of result) {
        expect(chunk).toBe(chunk.trim());
      }
    });

    it('should filter out empty chunks', () => {
      const text = '\n\n\nsome text\n\n\n';
      const result = chunkText(text, { maxTextChars: 5000 });
      for (const chunk of result) {
        expect(chunk.trim().length).toBeGreaterThan(0);
      }
    });

    it('should handle text exactly at the limit', () => {
      const text = 'x'.repeat(100);
      const result = chunkText(text, { maxTextChars: 100 });
      expect(result).toEqual([text]);
    });
  });

  describe('isCardOversized', () => {
    it('should return false for small cards', () => {
      const card = { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'Hello' }] };
      expect(isCardOversized(card)).toBe(false);
    });

    it('should return true for oversized cards', () => {
      const card = {
        type: 'AdaptiveCard',
        body: [{ type: 'TextBlock', text: 'x'.repeat(30000) }],
      };
      expect(isCardOversized(card)).toBe(true);
    });

    it('should use custom maxCardBytes', () => {
      const card = { data: 'x'.repeat(100) };
      expect(isCardOversized(card, { maxCardBytes: 50 })).toBe(true);
      expect(isCardOversized(card, { maxCardBytes: 500 })).toBe(false);
    });
  });
});
