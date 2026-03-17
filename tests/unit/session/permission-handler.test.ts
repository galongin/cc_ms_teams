import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../../../src/logging/logger.js', () => ({
  getLogger: () => ({
    child: () => ({
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }),
  }),
}));

const { PermissionHandler } = await import('../../../src/session/permission-handler.js');

describe('session/permission-handler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should auto-approve tools in the allowed tier', async () => {
    const handler = new PermissionHandler({
      tier: 'readonly',
      overrides: new Set(),
    });

    const result = await handler.handleToolRequest('Read', { file_path: '/tmp/test.ts' });
    expect(result).toEqual({ behavior: 'allow' });
  });

  it('should auto-approve tools in overrides', async () => {
    const overrides = new Set(['CustomTool']);
    const handler = new PermissionHandler({
      tier: 'readonly',
      overrides,
    });

    const result = await handler.handleToolRequest('CustomTool', {});
    expect(result).toEqual({ behavior: 'allow' });
  });

  it('should deny tools not in tier and not in overrides when no user responds', async () => {
    const handler = new PermissionHandler({
      tier: 'readonly',
      overrides: new Set(),
      timeoutMs: 100,
    });

    const resultPromise = handler.handleToolRequest('Write', { file_path: '/tmp/out.ts' });

    // Advance past timeout
    await vi.advanceTimersByTimeAsync(200);

    const result = await resultPromise;
    expect(result.behavior).toBe('deny');
  });

  it('should resolve permission when user approves', async () => {
    const onRequest = vi.fn();
    const handler = new PermissionHandler({
      tier: 'readonly',
      overrides: new Set(),
      timeoutMs: 60000,
      onPermissionRequest: onRequest,
    });

    const resultPromise = handler.handleToolRequest('Write', { file_path: '/tmp/out.ts' });

    // Get the request ID from the callback
    expect(onRequest).toHaveBeenCalledOnce();
    const requestId = onRequest.mock.calls[0]![0] as string;

    handler.resolvePermission(requestId, 'allow');

    const result = await resultPromise;
    expect(result).toEqual({ behavior: 'allow' });
  });

  it('should resolve permission when user denies', async () => {
    const onRequest = vi.fn();
    const handler = new PermissionHandler({
      tier: 'readonly',
      overrides: new Set(),
      timeoutMs: 60000,
      onPermissionRequest: onRequest,
    });

    const resultPromise = handler.handleToolRequest('Bash', { command: 'rm -rf /' });

    const requestId = onRequest.mock.calls[0]![0] as string;
    handler.resolvePermission(requestId, 'deny');

    const result = await resultPromise;
    expect(result.behavior).toBe('deny');
  });

  it('should add tool to overrides on always_allow', async () => {
    const overrides = new Set<string>();
    const onRequest = vi.fn();
    const handler = new PermissionHandler({
      tier: 'readonly',
      overrides,
      timeoutMs: 60000,
      onPermissionRequest: onRequest,
    });

    const resultPromise = handler.handleToolRequest('Write', { file_path: '/tmp/out.ts' });

    const requestId = onRequest.mock.calls[0]![0] as string;
    handler.resolvePermission(requestId, 'always_allow');

    const result = await resultPromise;
    expect(result).toEqual({ behavior: 'allow' });
    expect(overrides.has('Write')).toBe(true);

    // Subsequent requests should auto-approve
    const result2 = await handler.handleToolRequest('Write', { file_path: '/tmp/other.ts' });
    expect(result2).toEqual({ behavior: 'allow' });
  });

  it('should deny blocked paths even for allowed tools', async () => {
    const handler = new PermissionHandler({
      tier: 'full',
      overrides: new Set(),
    });

    const result = await handler.handleToolRequest('Read', {
      file_path: `${process.env['HOME']}/.ssh/id_rsa`,
    });
    expect(result.behavior).toBe('deny');
  });

  it('should deny .env file access', async () => {
    const handler = new PermissionHandler({
      tier: 'full',
      overrides: new Set(),
    });

    const result = await handler.handleToolRequest('Read', {
      file_path: '/project/.env',
    });
    expect(result.behavior).toBe('deny');
  });

  it('should allow Bash ls in readonly tier', async () => {
    const handler = new PermissionHandler({
      tier: 'readonly',
      overrides: new Set(),
    });

    const result = await handler.handleToolRequest('Bash', { command: 'ls -la' });
    expect(result).toEqual({ behavior: 'allow' });
  });

  it('should not allow general Bash in readonly tier', async () => {
    const handler = new PermissionHandler({
      tier: 'readonly',
      overrides: new Set(),
      timeoutMs: 100,
    });

    const resultPromise = handler.handleToolRequest('Bash', { command: 'cat /etc/passwd' });
    await vi.advanceTimersByTimeAsync(200);

    const result = await resultPromise;
    expect(result.behavior).toBe('deny');
  });

  it('should return false when resolving non-existent request', () => {
    const handler = new PermissionHandler({
      tier: 'readonly',
      overrides: new Set(),
    });

    const resolved = handler.resolvePermission('non-existent-id', 'allow');
    expect(resolved).toBe(false);
  });

  it('should cancel all pending requests', async () => {
    const onRequest = vi.fn();
    const handler = new PermissionHandler({
      tier: 'readonly',
      overrides: new Set(),
      timeoutMs: 60000,
      onPermissionRequest: onRequest,
    });

    const p1 = handler.handleToolRequest('Write', {});
    const p2 = handler.handleToolRequest('Edit', {});

    handler.cancelAll();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.behavior).toBe('deny');
    expect(r2.behavior).toBe('deny');
    expect(handler.getPendingRequests()).toHaveLength(0);
  });

  it('should track pending requests', () => {
    const handler = new PermissionHandler({
      tier: 'readonly',
      overrides: new Set(),
      timeoutMs: 60000,
    });

    // Start two requests (they'll be pending)
    void handler.handleToolRequest('Write', {});
    void handler.handleToolRequest('Edit', {});

    const pending = handler.getPendingRequests();
    expect(pending).toHaveLength(2);
    expect(pending.map((p) => p.toolName)).toEqual(['Write', 'Edit']);

    // Clean up
    handler.cancelAll();
  });
});
