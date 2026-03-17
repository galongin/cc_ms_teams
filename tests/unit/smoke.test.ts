import { describe, it, expect } from 'vitest';

describe('smoke test', () => {
  it('should pass a trivial assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should import from the main index', async () => {
    const mod = await import('../../src/index.js');
    expect(mod.ConfigSchema).toBeDefined();
    expect(mod.AsyncQueue).toBeDefined();
    expect(mod.TunnelManager).toBeDefined();
  });
});
