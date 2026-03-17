import { describe, it, expect } from 'vitest';
import {
  renderDiff,
  renderUnifiedDiff,
} from '../../../src/cards/templates/diff-card.js';

const SCHEMA = 'https://adaptivecards.io/schemas/adaptive-card.json';

describe('cards/templates/diff-card', () => {
  describe('renderDiff (side-by-side)', () => {
    it('should produce a valid Adaptive Card structure', () => {
      const card = renderDiff('src/config.ts', 'const a = 1;', 'const a = 2;', 'typescript');
      expect(card.$schema).toBe(SCHEMA);
      expect(card.type).toBe('AdaptiveCard');
      expect(card.version).toBe('1.5');
    });

    it('should include file path header with attention color', () => {
      const card = renderDiff('src/config.ts', 'old', 'new', 'ts');
      const header = card.body.find(
        (e) =>
          e['type'] === 'TextBlock' &&
          typeof e['text'] === 'string' &&
          (e['text'] as string).includes('src/config.ts'),
      );
      expect(header).toBeDefined();
      expect(header!['color']).toBe('attention');
    });

    it('should render a ColumnSet with Before and After columns', () => {
      const card = renderDiff('file.ts', 'old code', 'new code', 'typescript');
      const columnSet = card.body.find((e) => e['type'] === 'ColumnSet');
      expect(columnSet).toBeDefined();

      const columns = columnSet!['columns'] as Array<Record<string, unknown>>;
      expect(columns).toHaveLength(2);

      // Before column
      const beforeCol = columns[0]!;
      const beforeItems = beforeCol['items'] as Array<Record<string, unknown>>;
      const beforeLabel = beforeItems.find(
        (i) => i['type'] === 'TextBlock' && i['text'] === 'Before',
      );
      expect(beforeLabel).toBeDefined();
      const beforeCode = beforeItems.find((i) => i['type'] === 'CodeBlock');
      expect(beforeCode!['codeSnippet']).toBe('old code');

      // After column
      const afterCol = columns[1]!;
      const afterItems = afterCol['items'] as Array<Record<string, unknown>>;
      const afterLabel = afterItems.find(
        (i) => i['type'] === 'TextBlock' && i['text'] === 'After',
      );
      expect(afterLabel).toBeDefined();
      const afterCode = afterItems.find((i) => i['type'] === 'CodeBlock');
      expect(afterCode!['codeSnippet']).toBe('new code');
    });

    it('should use the correct language for CodeBlock elements', () => {
      const card = renderDiff('file.py', 'old', 'new', 'python');
      const columnSet = card.body.find((e) => e['type'] === 'ColumnSet');
      const columns = columnSet!['columns'] as Array<Record<string, unknown>>;

      for (const col of columns) {
        const items = col['items'] as Array<Record<string, unknown>>;
        const codeBlock = items.find((i) => i['type'] === 'CodeBlock');
        expect(codeBlock!['language']).toBe('Python');
      }
    });

    it('should fall back to unified diff when before exceeds 20 lines', () => {
      const longBefore = Array.from({ length: 25 }, (_, i) => `line ${i}`).join('\n');
      const card = renderDiff('file.ts', longBefore, 'short', 'ts');

      // Should NOT have a ColumnSet (unified format)
      const columnSet = card.body.find((e) => e['type'] === 'ColumnSet');
      expect(columnSet).toBeUndefined();

      // Should have "Diff:" header instead of "File Changed:"
      const header = card.body.find(
        (e) =>
          e['type'] === 'TextBlock' &&
          typeof e['text'] === 'string' &&
          (e['text'] as string).startsWith('Diff:'),
      );
      expect(header).toBeDefined();
    });

    it('should fall back to unified diff when after exceeds 20 lines', () => {
      const longAfter = Array.from({ length: 25 }, (_, i) => `line ${i}`).join('\n');
      const card = renderDiff('file.ts', 'short', longAfter, 'ts');

      const columnSet = card.body.find((e) => e['type'] === 'ColumnSet');
      expect(columnSet).toBeUndefined();
    });

    it('should handle empty before (new file)', () => {
      const card = renderDiff('new-file.ts', '', 'new content', 'ts');
      expect(card.body.length).toBeGreaterThan(0);
    });

    it('should handle empty after (deleted file)', () => {
      const card = renderDiff('deleted.ts', 'old content', '', 'ts');
      expect(card.body.length).toBeGreaterThan(0);
    });
  });

  describe('renderUnifiedDiff', () => {
    it('should produce a valid Adaptive Card structure', () => {
      const card = renderUnifiedDiff('file.ts', '- old\n+ new');
      expect(card.$schema).toBe(SCHEMA);
      expect(card.type).toBe('AdaptiveCard');
      expect(card.version).toBe('1.5');
    });

    it('should include file path header with "Diff:" prefix', () => {
      const card = renderUnifiedDiff('src/main.ts', '- old\n+ new');
      const header = card.body.find(
        (e) =>
          e['type'] === 'TextBlock' &&
          e['text'] === 'Diff: src/main.ts',
      );
      expect(header).toBeDefined();
      expect(header!['color']).toBe('attention');
    });

    it('should render unified diff as PlainText CodeBlock', () => {
      const diff = '- const a = 1;\n+ const a = 2;';
      const card = renderUnifiedDiff('file.ts', diff);
      const codeBlock = card.body.find((e) => e['type'] === 'CodeBlock');
      expect(codeBlock).toBeDefined();
      expect(codeBlock!['codeSnippet']).toBe(diff);
      expect(codeBlock!['language']).toBe('PlainText');
    });
  });
});
