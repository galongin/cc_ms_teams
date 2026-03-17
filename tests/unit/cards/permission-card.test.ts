import { describe, it, expect } from 'vitest';
import { renderPermissionRequest } from '../../../src/cards/templates/permission-card.js';
import type { PermissionRequest } from '../../../src/cards/types.js';

const SCHEMA = 'https://adaptivecards.io/schemas/adaptive-card.json';

describe('cards/templates/permission-card', () => {
  const baseRequest: PermissionRequest = {
    requestId: 'req-abc123',
    toolName: 'Bash',
    input: 'npm install --save-dev vitest',
  };

  it('should produce a valid Adaptive Card structure', () => {
    const card = renderPermissionRequest(baseRequest);
    expect(card.$schema).toBe(SCHEMA);
    expect(card.type).toBe('AdaptiveCard');
    expect(card.version).toBe('1.5');
  });

  it('should have "Permission Required" heading with warning color', () => {
    const card = renderPermissionRequest(baseRequest);
    const heading = card.body.find(
      (e) =>
        e['type'] === 'TextBlock' &&
        e['text'] === 'Permission Required',
    );
    expect(heading).toBeDefined();
    expect(heading!['color']).toBe('warning');
    expect(heading!['style']).toBe('heading');
  });

  it('should show tool name in bold', () => {
    const card = renderPermissionRequest(baseRequest);
    const toolText = card.body.find(
      (e) =>
        e['type'] === 'TextBlock' &&
        typeof e['text'] === 'string' &&
        (e['text'] as string).includes('**Bash**'),
    );
    expect(toolText).toBeDefined();
  });

  it('should include tool input as CodeBlock', () => {
    const card = renderPermissionRequest(baseRequest);
    const codeBlock = card.body.find((e) => e['type'] === 'CodeBlock');
    expect(codeBlock).toBeDefined();
    expect(codeBlock!['codeSnippet']).toBe('npm install --save-dev vitest');
  });

  it('should use Bash language for Bash tool input', () => {
    const card = renderPermissionRequest(baseRequest);
    const codeBlock = card.body.find((e) => e['type'] === 'CodeBlock');
    expect(codeBlock!['language']).toBe('Bash');
  });

  it('should use PlainText language for non-Bash tools', () => {
    const card = renderPermissionRequest({
      ...baseRequest,
      toolName: 'Edit',
    });
    const codeBlock = card.body.find((e) => e['type'] === 'CodeBlock');
    expect(codeBlock!['language']).toBe('PlainText');
  });

  it('should have three action buttons: Approve, Deny, Always Allow', () => {
    const card = renderPermissionRequest(baseRequest);
    expect(card.actions).toBeDefined();
    expect(card.actions).toHaveLength(3);

    const titles = card.actions!.map((a) => a['title']);
    expect(titles).toContain('Approve');
    expect(titles).toContain('Deny');
    expect(titles).toContain('Always Allow (this session)');
  });

  it('should have Approve button with positive style and correct action data', () => {
    const card = renderPermissionRequest(baseRequest);
    const approveBtn = card.actions!.find((a) => a['title'] === 'Approve');
    expect(approveBtn).toBeDefined();
    expect(approveBtn!['style']).toBe('positive');
    expect(approveBtn!['type']).toBe('Action.Submit');

    const data = approveBtn!['data'] as Record<string, unknown>;
    expect(data['action']).toBe('approve_tool');
    expect(data['requestId']).toBe('req-abc123');
    expect(data['toolName']).toBe('Bash');
  });

  it('should have Deny button with destructive style and correct action data', () => {
    const card = renderPermissionRequest(baseRequest);
    const denyBtn = card.actions!.find((a) => a['title'] === 'Deny');
    expect(denyBtn).toBeDefined();
    expect(denyBtn!['style']).toBe('destructive');

    const data = denyBtn!['data'] as Record<string, unknown>;
    expect(data['action']).toBe('deny_tool');
    expect(data['requestId']).toBe('req-abc123');
    expect(data['toolName']).toBe('Bash');
  });

  it('should have Always Allow button with correct action data', () => {
    const card = renderPermissionRequest(baseRequest);
    const alwaysBtn = card.actions!.find(
      (a) => a['title'] === 'Always Allow (this session)',
    );
    expect(alwaysBtn).toBeDefined();
    expect(alwaysBtn!['type']).toBe('Action.Submit');

    const data = alwaysBtn!['data'] as Record<string, unknown>;
    expect(data['action']).toBe('always_allow_tool');
    expect(data['requestId']).toBe('req-abc123');
    expect(data['toolName']).toBe('Bash');
  });

  it('should include risk description text', () => {
    const card = renderPermissionRequest(baseRequest);
    const riskText = card.body.find(
      (e) =>
        e['type'] === 'TextBlock' &&
        typeof e['text'] === 'string' &&
        (e['text'] as string).includes('arbitrary commands'),
    );
    expect(riskText).toBeDefined();
  });

  it('should show appropriate risk for Edit tool', () => {
    const card = renderPermissionRequest({
      ...baseRequest,
      toolName: 'Edit',
    });
    const riskText = card.body.find(
      (e) =>
        e['type'] === 'TextBlock' &&
        typeof e['text'] === 'string' &&
        (e['text'] as string).includes('modify files'),
    );
    expect(riskText).toBeDefined();
  });

  it('should include timeout warning text', () => {
    const card = renderPermissionRequest(baseRequest);
    const timeout = card.body.find(
      (e) =>
        e['type'] === 'TextBlock' &&
        typeof e['text'] === 'string' &&
        (e['text'] as string).includes('expire'),
    );
    expect(timeout).toBeDefined();
  });

  it('should truncate long input to 500 characters', () => {
    const longInput = 'x'.repeat(1000);
    const card = renderPermissionRequest({
      ...baseRequest,
      input: longInput,
    });
    const codeBlock = card.body.find((e) => e['type'] === 'CodeBlock');
    const snippet = codeBlock!['codeSnippet'] as string;
    expect(snippet.length).toBeLessThanOrEqual(503); // 500 + "..."
    expect(snippet).toContain('...');
  });

  it('should respect explicit risk level', () => {
    const card = renderPermissionRequest({
      ...baseRequest,
      toolName: 'Read',
      riskLevel: 'low',
    });
    const riskText = card.body.find(
      (e) =>
        e['type'] === 'TextBlock' &&
        typeof e['text'] === 'string' &&
        (e['text'] as string).includes('read-only'),
    );
    expect(riskText).toBeDefined();
  });
});
