import { describe, it, expect, afterEach, vi } from 'vitest';
import type { AddressInfo } from 'node:net';

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

const { createTeamsApp } = await import('../../../src/bot/teams-app.js');

describe('bot/teams-app', () => {
  let app: ReturnType<typeof createTeamsApp> | null = null;

  afterEach(async () => {
    if (app) {
      await app.stop();
      app = null;
    }
  });

  it('should create a TeamsApp with correct port', () => {
    app = createTeamsApp({
      botConfig: { id: 'test-id', password: 'test', tenantId: 'tenant', port: 0 },
    });
    expect(app).toBeDefined();
    expect(app.port).toBe(0);
  });

  it('should start and respond to health checks', async () => {
    app = createTeamsApp({
      botConfig: { id: 'test-id', password: 'test', tenantId: 'tenant', port: 0 },
    });
    await app.start();

    const address = app.server.address() as AddressInfo;
    const port = address.port;

    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body['status']).toBe('ok');
    expect(typeof body['uptime']).toBe('number');
  });

  it('should return 404 for unknown routes', async () => {
    app = createTeamsApp({
      botConfig: { id: 'test-id', password: 'test', tenantId: 'tenant', port: 0 },
    });
    await app.start();

    const address = app.server.address() as AddressInfo;
    const res = await fetch(`http://localhost:${address.port}/unknown`);
    expect(res.status).toBe(404);
  });

  it('should handle POST /api/messages with activity handler', async () => {
    app = createTeamsApp({
      botConfig: { id: 'test-id', password: 'test', tenantId: 'tenant', port: 0 },
    });

    const receivedActivities: unknown[] = [];
    app.setActivityHandler(async (context) => {
      receivedActivities.push(context.activity);
      await context.sendActivity('test response');
    });

    await app.start();
    const address = app.server.address() as AddressInfo;

    const res = await fetch(`http://localhost:${address.port}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        text: 'hello',
        from: { id: 'user-1', aadObjectId: 'aad-1' },
        conversation: { id: 'conv-1' },
        serviceUrl: 'https://smba.trafficmanager.net/teams/',
      }),
    });

    expect(res.status).toBe(200);
    expect(receivedActivities).toHaveLength(1);
  });

  it('should return 400 for invalid activity (missing type)', async () => {
    app = createTeamsApp({
      botConfig: { id: 'test-id', password: 'test', tenantId: 'tenant', port: 0 },
    });
    await app.start();
    const address = app.server.address() as AddressInfo;

    const res = await fetch(`http://localhost:${address.port}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'no type field' }),
    });

    expect(res.status).toBe(400);
  });

  it('should handle stop gracefully', async () => {
    app = createTeamsApp({
      botConfig: { id: 'test-id', password: 'test', tenantId: 'tenant', port: 0 },
    });
    await app.start();
    await app.stop();
    app = null; // Prevent double-stop in afterEach
  });
});
