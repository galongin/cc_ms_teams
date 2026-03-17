import { describe, it, expect } from 'vitest';
import { AdaptiveCardRenderer } from '../../../src/cards/renderer.js';

const SCHEMA = 'https://adaptivecards.io/schemas/adaptive-card.json';

describe('cards/renderer', () => {
  const renderer = new AdaptiveCardRenderer();

  describe('dispatch logic', () => {
    it('should render code blocks via renderCodeBlock', () => {
      const card = renderer.renderCodeBlock('const x = 1;', 'typescript');
      expect(card.$schema).toBe(SCHEMA);
      expect(card.type).toBe('AdaptiveCard');
      const codeBlock = card.body.find((e) => e['type'] === 'CodeBlock');
      expect(codeBlock).toBeDefined();
      expect(codeBlock!['language']).toBe('TypeScript');
    });

    it('should render diffs via renderDiff', () => {
      const card = renderer.renderDiff('file.ts', 'old', 'new', 'typescript');
      expect(card.type).toBe('AdaptiveCard');
      const columnSet = card.body.find((e) => e['type'] === 'ColumnSet');
      expect(columnSet).toBeDefined();
    });

    it('should render unified diffs via renderUnifiedDiff', () => {
      const card = renderer.renderUnifiedDiff('file.ts', '- old\n+ new');
      const codeBlock = card.body.find((e) => e['type'] === 'CodeBlock');
      expect(codeBlock!['language']).toBe('PlainText');
    });

    it('should render progress via renderProgress', () => {
      const card = renderer.renderProgress('Reading files...', 50, '5s');
      expect(card.type).toBe('AdaptiveCard');
      const heading = card.body.find(
        (e) =>
          e['type'] === 'TextBlock' &&
          typeof e['text'] === 'string' &&
          (e['text'] as string).includes('working'),
      );
      expect(heading).toBeDefined();
    });

    it('should render errors via renderError', () => {
      const card = renderer.renderError({
        type: 'Session Error',
        message: 'Something went wrong',
        recoverable: true,
      });
      expect(card.actions).toBeDefined();
      const retryBtn = card.actions!.find((a) => a['title'] === 'Retry');
      expect(retryBtn).toBeDefined();
    });

    it('should render permission requests via renderPermissionRequest', () => {
      const card = renderer.renderPermissionRequest({
        requestId: 'req-1',
        toolName: 'Bash',
        input: 'ls -la',
      });
      expect(card.actions).toHaveLength(3);
    });

    it('should render session summaries via renderSessionSummary', () => {
      const card = renderer.renderSessionSummary({
        sessionId: 'sess-1',
        duration: 154000,
        cost: 0.04,
        turns: 5,
        result: 'Fixed the bug',
      });
      const factSet = card.body.find((e) => e['type'] === 'FactSet');
      expect(factSet).toBeDefined();
    });

    it('should render tool use summaries via renderToolUseSummary', () => {
      const card = renderer.renderToolUseSummary('Read', { file_path: '/test.ts' });
      expect(card.type).toBe('AdaptiveCard');
      const text = card.body.find(
        (e) =>
          e['type'] === 'TextBlock' &&
          typeof e['text'] === 'string' &&
          (e['text'] as string).includes('Read'),
      );
      expect(text).toBeDefined();
    });
  });

  describe('detectLanguage', () => {
    it('should detect TypeScript from .ts extension', () => {
      expect(renderer.detectLanguage('src/index.ts')).toBe('TypeScript');
    });

    it('should detect Python from .py extension', () => {
      expect(renderer.detectLanguage('script.py')).toBe('Python');
    });

    it('should return PlainText for unknown extensions', () => {
      expect(renderer.detectLanguage('file.xyz')).toBe('PlainText');
    });
  });

  describe('size validation', () => {
    it('should return cards within 28KB without modification', () => {
      const card = renderer.renderCodeBlock('small code', 'ts');
      expect(JSON.stringify(card).length).toBeLessThan(28 * 1024);
    });

    it('should truncate oversized cards to fit within 28KB', () => {
      // Generate very large code
      const hugeCode = Array.from(
        { length: 3000 },
        (_, i) => `// line ${i}: ${'x'.repeat(20)}`,
      ).join('\n');

      const card = renderer.renderCodeBlock(hugeCode, 'ts');
      const serialized = JSON.stringify(card);
      expect(serialized.length).toBeLessThanOrEqual(28 * 1024);
    });

    it('should truncate oversized error cards', () => {
      const hugeStack = Array.from(
        { length: 100 },
        (_, i) => `  at function${i} (file${i}.ts:${i})`,
      ).join('\n');

      const card = renderer.renderError({
        type: 'Session Error',
        message: 'Something failed',
        stack: hugeStack,
        recoverable: true,
      });
      expect(card.type).toBe('AdaptiveCard');
      // Stack should be truncated to 10 lines by the error card template
      const container = card.body.find((e) => e['type'] === 'Container') as Record<string, unknown>;
      const items = container['items'] as Array<Record<string, unknown>>;
      const codeBlock = items.find((i) => i['type'] === 'CodeBlock');
      expect(codeBlock).toBeDefined();
      const lines = (codeBlock!['codeSnippet'] as string).split('\n');
      // 10 lines + "... N more lines" = 11 lines
      expect(lines.length).toBe(11);
    });
  });
});
