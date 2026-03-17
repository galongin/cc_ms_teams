import { describe, it, expect } from 'vitest';
import { renderCodeBlock } from '../../../src/cards/templates/code-block.js';

const SCHEMA = 'https://adaptivecards.io/schemas/adaptive-card.json';

describe('cards/templates/code-block', () => {
  it('should produce a valid Adaptive Card structure', () => {
    const card = renderCodeBlock('const x = 1;', 'typescript');
    expect(card.$schema).toBe(SCHEMA);
    expect(card.type).toBe('AdaptiveCard');
    expect(card.version).toBe('1.5');
    expect(card.body).toBeDefined();
    expect(Array.isArray(card.body)).toBe(true);
  });

  it('should include a CodeBlock element with correct language', () => {
    const card = renderCodeBlock('print("hello")', 'python');
    const codeBlock = card.body.find((e) => e['type'] === 'CodeBlock');
    expect(codeBlock).toBeDefined();
    expect(codeBlock!['codeSnippet']).toBe('print("hello")');
    expect(codeBlock!['language']).toBe('Python');
  });

  it('should include language label and line count header', () => {
    const code = 'line1\nline2\nline3';
    const card = renderCodeBlock(code, 'javascript');
    const header = card.body.find(
      (e) =>
        e['type'] === 'TextBlock' &&
        typeof e['text'] === 'string' &&
        (e['text'] as string).includes('JavaScript'),
    );
    expect(header).toBeDefined();
    expect((header!['text'] as string)).toContain('3 lines');
  });

  it('should add file path header when filePath option is set', () => {
    const card = renderCodeBlock('code', 'ts', {
      filePath: '/src/index.ts',
    });
    const header = card.body.find(
      (e) =>
        e['type'] === 'TextBlock' && e['text'] === '/src/index.ts',
    );
    expect(header).toBeDefined();
    expect(header!['color']).toBe('accent');
    expect(header!['style']).toBe('heading');
  });

  it('should add line range text when startLine and endLine are set', () => {
    const card = renderCodeBlock('code', 'ts', {
      startLine: 10,
      endLine: 20,
    });
    const rangeText = card.body.find(
      (e) =>
        e['type'] === 'TextBlock' &&
        typeof e['text'] === 'string' &&
        (e['text'] as string).includes('Lines 10 - 20'),
    );
    expect(rangeText).toBeDefined();
  });

  it('should set startLineNumber on CodeBlock when startLine is set', () => {
    const card = renderCodeBlock('code', 'ts', { startLine: 42 });
    const codeBlock = card.body.find((e) => e['type'] === 'CodeBlock');
    expect(codeBlock!['startLineNumber']).toBe(42);
  });

  it('should not set startLineNumber when startLine is not provided', () => {
    const card = renderCodeBlock('code', 'ts');
    const codeBlock = card.body.find((e) => e['type'] === 'CodeBlock');
    expect(codeBlock!['startLineNumber']).toBeUndefined();
  });

  it('should add Open in VS Code action when enabled', () => {
    const card = renderCodeBlock('code', 'ts', {
      filePath: '/src/index.ts',
      showOpenInVSCode: true,
    });
    expect(card.actions).toBeDefined();
    expect(card.actions).toHaveLength(1);
    expect(card.actions![0]!['type']).toBe('Action.OpenUrl');
    expect(card.actions![0]!['title']).toBe('Open in VS Code');
    expect(card.actions![0]!['url']).toBe('vscode://file/src/index.ts');
  });

  it('should include line number in VS Code URL when startLine is set', () => {
    const card = renderCodeBlock('code', 'ts', {
      filePath: '/src/index.ts',
      showOpenInVSCode: true,
      startLine: 42,
    });
    expect(card.actions![0]!['url']).toBe('vscode://file/src/index.ts:42');
  });

  it('should not include actions when showOpenInVSCode is false', () => {
    const card = renderCodeBlock('code', 'ts', {
      filePath: '/src/index.ts',
    });
    expect(card.actions).toBeUndefined();
  });

  it('should truncate code exceeding card size limit and add indicator', () => {
    // Generate code that exceeds 28KB
    const longCode = Array.from({ length: 2000 }, (_, i) => `// line ${i}: ${'x'.repeat(20)}`).join('\n');
    const card = renderCodeBlock(longCode, 'ts');

    const serialized = JSON.stringify(card);
    expect(serialized.length).toBeLessThanOrEqual(28 * 1024);

    // Should have truncated indicator in the header
    const header = card.body.find(
      (e) =>
        e['type'] === 'TextBlock' &&
        typeof e['text'] === 'string' &&
        (e['text'] as string).includes('truncated'),
    );
    expect(header).toBeDefined();

    // Code block should end with truncated indicator
    const codeBlock = card.body.find((e) => e['type'] === 'CodeBlock');
    expect((codeBlock!['codeSnippet'] as string)).toContain('truncated');
  });

  it('should normalize language labels', () => {
    const card = renderCodeBlock('code', 'golang');
    const codeBlock = card.body.find((e) => e['type'] === 'CodeBlock');
    expect(codeBlock!['language']).toBe('Go');
  });
});
