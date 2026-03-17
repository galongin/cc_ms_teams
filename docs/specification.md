# cc-ms-teams Technical Specification

## Bidirectional Claude Code <-> Microsoft Teams Chat Plugin

**Date:** 2026-03-17
**Version:** 1.0
**Status:** Specification Complete
**Predecessor Documents:** [Research Report](./research-report.md), [Architecture Design](./architecture-design.md)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Component Specifications](#3-component-specifications)
   - 3.1 [Teams Bot Service](#31-teams-bot-service)
   - 3.2 [Message Bridge](#32-message-bridge)
   - 3.3 [Claude Code Session Manager](#33-claude-code-session-manager)
   - 3.4 [Adaptive Card Renderer](#34-adaptive-card-renderer)
   - 3.5 [Authentication Module](#35-authentication-module)
   - 3.6 [Dev Tunnel Manager](#36-dev-tunnel-manager)
4. [Data Models](#4-data-models)
5. [API Contracts](#5-api-contracts)
6. [Security Specification](#6-security-specification)
7. [Configuration](#7-configuration)
8. [Error Handling](#8-error-handling)
9. [Testing Strategy](#9-testing-strategy)
10. [Non-Functional Requirements](#10-non-functional-requirements)
11. [Developer Experience](#11-developer-experience)

---

## 1. Executive Summary

### 1.1 Project Overview

**cc-ms-teams** is a locally-deployed TypeScript plugin that creates a bidirectional bridge between Microsoft Teams and Claude Code. Developers interact with their local Claude Code sessions through Teams chat using rich Adaptive Cards with syntax-highlighted code, while Claude Code can proactively push results, diffs, and notifications back into Teams conversations.

The plugin runs entirely on the developer's local machine, connecting to Microsoft Teams through Azure Bot Service and a dev tunnel (MS Dev Tunnels or ngrok). There is no cloud-hosted backend; all computation, Claude Code sessions, and file access happen locally.

### 1.2 Goals

1. **Bidirectional chat** -- Send prompts to Claude Code from Teams; receive responses, code snippets, diffs, and tool outputs as Adaptive Cards in Teams.
2. **Persistent sessions** -- Maintain long-lived Claude Code sessions per user. Resume sessions across bot restarts.
3. **Rich code rendering** -- Display code with syntax highlighting (22 languages) using Adaptive Cards `CodeBlock` elements. Show file diffs in side-by-side or unified format.
4. **Human-in-the-loop permissions** -- Surface Claude Code tool permission requests as interactive Adaptive Cards in Teams (approve/deny/always-allow).
5. **Minimal setup** -- One-command interactive setup (`cc-ms-teams setup`). Running in under 5 minutes for a developer with an Azure account.
6. **Security by default** -- Read-only tools enabled by default. User whitelist enforced. Audit logging of all interactions.

### 1.3 Scope

**In scope (v1.0):**
- Teams Bot Service using Teams SDK v2 (`@microsoft/teams.apps`)
- Message Bridge for bidirectional format transformation
- Claude Code Session Manager using Claude Agent SDK streaming input mode
- Adaptive Card Renderer for code blocks, diffs, progress, errors, permissions
- Authentication via Azure AD with interactive setup wizard
- Dev Tunnel Manager (MS Dev Tunnels primary, ngrok fallback)
- MCP server endpoint (Claude Code can call Teams via MCP tools)
- CLI commands: `setup`, `start`, `stop`, `status`
- Slash commands in Teams: `/new`, `/stop`, `/project`, `/model`, `/permission`, `/sessions`, `/handoff`, `/status`, `/help`

**Deferred to future versions:**
- File sharing service (file uploads/attachments between Teams and local filesystem)
- Image processing (inline base64 for Claude vision)
- Webhook-only mode (no Azure Bot Service)
- Team/channel scope (v1.0 is personal chat only)
- A2A protocol integration

### 1.4 Target Users

Developers who use Claude Code on their local machines and want to interact with their coding sessions from Microsoft Teams on any device -- desktop, web, or mobile. Typical use cases:

- Start a code review from Teams while away from the terminal
- Monitor long-running Claude Code tasks via Teams notifications
- Hand off a terminal Claude Code session to Teams for mobile follow-up
- Approve or deny tool permissions from Teams when Claude Code needs write access

### 1.5 Key Differentiators

| Feature | cc-ms-teams | teams-claude-bot (Marvae) | Composio Teams MCP | Claude M365 Connector |
|---------|-------------|--------------------------|--------------------|-----------------------|
| Teams SDK version | v2 (`@microsoft/teams.apps`) | Deprecated botbuilder v4 | N/A (hosted MCP) | N/A (enterprise) |
| MCP server | Yes (bidirectional) | No | Yes (one-way) | No |
| Code syntax highlighting | CodeBlock (22 languages) | Plain text | N/A | N/A |
| Local Claude Code sessions | Yes (Agent SDK) | Yes (Agent SDK) | No (hosted) | No |
| Interactive setup wizard | Yes | Partial | N/A | Admin portal |
| Direction | Bidirectional | Bidirectional | Claude -> Teams only | Read-only |

---

## 2. System Architecture

### 2.1 High-Level Architecture Diagram

```
+=========================================================================+
|                         CLOUD SERVICES                                   |
|                                                                          |
|  +------------------+     +--------------------+     +----------------+  |
|  | Microsoft Teams  |<--->| Azure Bot Service  |<--->| Dev Tunnel     |  |
|  | (Client)         |     | (Message Routing)  |     | (HTTPS Proxy)  |  |
|  +------------------+     +--------------------+     +-------+--------+  |
|                                                              |           |
+=========================================================================+
                                                               |
                                              HTTPS (TLS 1.3)  |
                                                               |
+=========================================================================+
|                  LOCAL MACHINE (Developer Workstation)                    |
|                                                              |          |
|  +-----------------------------------------------------------v-------+  |
|  |                  TEAMS BOT SERVICE (Port 3978)                     |  |
|  |  +------------------+  +------------------+  +-----------------+  |  |
|  |  | Teams SDK v2 App |  | Activity Router  |  | Auth Middleware |  |  |
|  |  | (@ms/teams.apps) |  | (msg/card)       |  | (Azure AD+ACL) |  |  |
|  |  +--------+---------+  +--------+---------+  +-----------------+  |  |
|  |           |                      |                                 |  |
|  |  +--------v---------+  +--------v---------+                       |  |
|  |  | McpPlugin        |  | Proactive Sender |                       |  |
|  |  | (MCP Server)     |  | (app.send())     |                       |  |
|  |  +------------------+  +------------------+                       |  |
|  +---------------------+----------------------------+----------------+  |
|                        |                            |                   |
|  +---------------------v---+   +--------------------v----------------+  |
|  |     MESSAGE BRIDGE       |   |    ADAPTIVE CARD RENDERER          |  |
|  |                          |   |                                     |  |
|  | +---------------------+  |   | +---------------+ +-------------+  |  |
|  | | Teams->Claude XFORM |  |   | | Code Block    | | Diff Card   |  |  |
|  | +---------------------+  |   | | Template      | | Template    |  |  |
|  | | Claude->Teams XFORM |  |   | +---------------+ +-------------+  |  |
|  | +---------------------+  |   | +---------------+ +-------------+  |  |
|  | | Stream Batcher      |  |   | | Progress Card | | Error Card  |  |  |
|  | +---------------------+  |   | | Template      | | Template    |  |  |
|  | | Content Chunker     |  |   | +---------------+ +-------------+  |  |
|  | +---------------------+  |   | +---------------+                  |  |
|  +----------+---------------+   | | Permission    |                  |  |
|             |                   | | Card Template |                  |  |
|  +----------v---------------+   | +---------------+                  |  |
|  | CLAUDE CODE SESSION MGR  |   +------------------------------------+  |
|  |                          |                                           |
|  | +---------------------+  |   +------------------------------------+  |
|  | | Session Pool        |  |   |       DEV TUNNEL MANAGER           |  |
|  | | (per-user sessions) |  |   |                                     |  |
|  | +---------------------+  |   | +---------------+ +-------------+  |  |
|  | | Agent SDK Query     |  |   | | Tunnel Spawn  | | Health      |  |  |
|  | | (streaming input)   |  |   | | & Lifecycle   | | Monitor     |  |  |
|  | +---------------------+  |   | +---------------+ +-------------+  |  |
|  | | Tool Permission Mgr |  |   +------------------------------------+  |
|  | | (canUseTool)        |  |                                           |
|  | +---------------------+  |   +------------------------------------+  |
|  | | Hook Forwarder      |  |   |         AUTH MODULE                |  |
|  | | (lifecycle events)  |  |   | +----------------+ +------------+ |  |
|  | +---------------------+  |   | | Azure AD       | | User ACL   | |  |
|  +----------+---------------+   | | Provider       | | Store      | |  |
|             |                   | +----------------+ +------------+ |  |
|  +----------v---------------+   +------------------------------------+  |
|  |  Claude Code Engine      |                                           |
|  |  (Local filesystem,      |   +------------------------------------+  |
|  |   tools, agents)         |   | CROSS-CUTTING: Audit | Rate Limit |  |
|  +--------------------------+   +------------------------------------+  |
+=========================================================================+
```

### 2.2 Component Inventory

| # | Component | Responsibility | Key Dependencies |
|---|-----------|---------------|------------------|
| 1 | **Teams Bot Service** | Receive/send Teams activities, route messages, host MCP endpoint | `@microsoft/teams.apps`, `@microsoft/teams.mcp` |
| 2 | **Message Bridge** | Bidirectional message format transformation, stream batching, content chunking | Teams Bot Service, Adaptive Card Renderer |
| 3 | **Claude Code Session Manager** | Per-user Claude Agent SDK sessions, tool permissions, hook forwarding | `@anthropic-ai/claude-agent-sdk`, Message Bridge |
| 4 | **Adaptive Card Renderer** | Generate Adaptive Card JSON for code, diffs, progress, errors, permissions | None (pure template engine) |
| 5 | **Auth Module** | Azure AD validation, user ACL, API key management | `@microsoft/teams.apps` (built-in auth) |
| 6 | **Dev Tunnel Manager** | Tunnel lifecycle, health monitoring, URL resolution | `devtunnel` CLI or `ngrok` CLI |

### 2.3 Deployment Topology

The entire application runs as a single Node.js process on the developer's local machine. External dependencies are:

- **Azure Bot Service** (free tier) -- routes messages between Teams and the bot endpoint
- **Microsoft Teams** (any client) -- user interface
- **Dev Tunnel** -- exposes `localhost:3978` to Azure Bot Service via HTTPS
- **Anthropic API** -- used by Claude Agent SDK for model inference

**Persistent State** (stored in `~/.cc-ms-teams/`):

| File | Format | Purpose |
|------|--------|---------|
| `config.json` | JSON | Bot credentials, user ACL, tool permissions, preferences |
| `conversations.json` | JSON | AAD Object ID -> Teams conversation ID mappings |
| `sessions.json` | JSON | AAD Object ID -> Claude session ID + metadata |
| `audit.jsonl` | JSONL | Append-only audit log of all interactions |
| `tunnel.json` | JSON | Tunnel ID and URL for reuse across restarts |

---

## 3. Component Specifications

### 3.1 Teams Bot Service

#### Purpose

The Teams Bot Service is the entry point for all communication with Microsoft Teams. It wraps the Teams SDK v2 `App` class, registers activity handlers, hosts the MCP server endpoint, and provides proactive messaging capabilities for pushing Claude Code outputs back to Teams.

#### Teams SDK v2 App Setup

```typescript
// src/bot/teams-app.ts
import { App } from '@microsoft/teams.apps';
import { McpPlugin } from '@microsoft/teams.mcp';
import { DevtoolsPlugin } from '@microsoft/teams.dev';
import { z } from 'zod';

export function createTeamsApp(config: BotConfig): App {
  const mcpPlugin = new McpPlugin({
    name: 'cc-ms-teams',
    description: 'Claude Code <-> Teams bridge',
  });

  // MCP tool: Claude Code can send messages to Teams
  mcpPlugin.tool(
    'sendToUser',
    'Send a message to the Teams user',
    { message: z.string().describe('Message text or markdown') },
    { readOnlyHint: false },
    async ({ message }) => {
      await proactiveSender.sendToActiveConversation(message);
      return { content: [{ type: 'text', text: 'Sent to Teams' }] };
    }
  );

  // MCP tool: Claude Code can ask the user a question
  mcpPlugin.tool(
    'askUser',
    'Ask the Teams user a question and wait for their response',
    {
      question: z.string().describe('The question to ask'),
      timeout: z.number().optional().describe('Timeout in seconds (default 300)'),
    },
    { readOnlyHint: true },
    async ({ question, timeout }) => {
      const response = await proactiveSender.askAndWait(question, timeout ?? 300);
      return { content: [{ type: 'text', text: response }] };
    }
  );

  const plugins: any[] = [mcpPlugin];
  if (config.devMode) {
    plugins.push(new DevtoolsPlugin());
  }

  const app = new App({ plugins });

  return app;
}
```

#### Activity Handlers

```typescript
// src/bot/activity-handlers.ts
import { App } from '@microsoft/teams.apps';

export function registerActivityHandlers(
  app: App,
  authModule: IAuthModule,
  commandParser: CommandParser,
  messageBridge: IMessageBridge,
  sessionManager: ISessionManager,
  conversationStore: ConversationStore,
): void {

  // Handle incoming messages
  app.on('message', async ({ activity, send }) => {
    // 1. Authenticate
    if (!await authModule.isAuthorized(activity)) {
      await send('You are not authorized to use this bot. Contact the bot admin.');
      return;
    }

    const userId = activity.from.aadObjectId!;
    const conversationId = activity.conversation.id;

    // 2. Store conversation ID for proactive messaging
    conversationStore.set(userId, conversationId);

    // 3. Check for slash commands
    const command = commandParser.parse(activity.text);
    if (command) {
      await handleCommand(command, userId, send, sessionManager);
      return;
    }

    // 4. Send typing indicator
    await send({ type: 'typing' });

    // 5. Transform message and forward to Claude Code session
    const claudeMessage = await messageBridge.teamsToClaudeMessage({
      userId,
      conversationId,
      text: activity.text,
      attachments: [],  // File sharing deferred
      send,
    });

    await sessionManager.sendMessage(userId, claudeMessage);
  });

  // Handle Adaptive Card actions (approve/deny permissions, etc.)
  app.on('card.action', async ({ activity, send }) => {
    if (!await authModule.isAuthorized(activity)) return;

    const userId = activity.from.aadObjectId!;
    const actionData = activity.value as CardActionData;

    switch (actionData.action) {
      case 'approve_tool':
        await sessionManager.resolvePermission(userId, actionData.requestId, 'allow');
        await send('Tool use approved.');
        break;
      case 'deny_tool':
        await sessionManager.resolvePermission(userId, actionData.requestId, 'deny');
        await send('Tool use denied.');
        break;
      case 'always_allow_tool':
        await sessionManager.resolvePermission(userId, actionData.requestId, 'always_allow');
        await send(`Tool "${actionData.toolName}" will be auto-approved for this session.`);
        break;
      case 'resume_session':
        await sessionManager.resumeSession(userId, actionData.sessionId);
        await send('Session resumed.');
        break;
      case 'fork_session':
        await sessionManager.forkSession(userId, actionData.sessionId);
        await send('Session forked. You now have a new session with the same history.');
        break;
    }
  });

  // Capture conversation IDs on bot install
  app.on('install.add', async ({ activity, send }) => {
    if (activity.from.aadObjectId) {
      conversationStore.set(activity.from.aadObjectId, activity.conversation.id);
    }
    await send(
      'Claude Code Teams Bot installed. Use `/help` to see available commands.\n\n' +
      'Start by setting your project directory with `/project /path/to/your/project`.'
    );
  });
}
```

#### Bot App Manifest

The setup wizard generates this manifest and packages it as a `.zip` for sideloading into Teams.

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/teams/v1.17/MicrosoftTeams.schema.json",
  "manifestVersion": "1.17",
  "version": "1.0.0",
  "id": "{{BOT_ID}}",
  "developer": {
    "name": "cc-ms-teams",
    "websiteUrl": "https://github.com/anthropics/cc-ms-teams",
    "privacyUrl": "https://github.com/anthropics/cc-ms-teams/blob/main/PRIVACY.md",
    "termsOfUseUrl": "https://github.com/anthropics/cc-ms-teams/blob/main/TERMS.md"
  },
  "name": {
    "short": "Claude Code",
    "full": "Claude Code Teams Bot"
  },
  "description": {
    "short": "Chat with your local Claude Code sessions from Teams",
    "full": "Bidirectional chat plugin connecting Microsoft Teams to Claude Code running on your local machine. Send prompts, view code with syntax highlighting, approve tool permissions, and monitor long-running tasks."
  },
  "icons": {
    "outline": "icon-outline.png",
    "color": "icon-color.png"
  },
  "accentColor": "#D97706",
  "bots": [
    {
      "botId": "{{BOT_ID}}",
      "scopes": ["personal"],
      "supportsFiles": false,
      "commandLists": [
        {
          "scopes": ["personal"],
          "commands": [
            { "title": "new", "description": "Start a new Claude Code session" },
            { "title": "stop", "description": "Stop the current session" },
            { "title": "project", "description": "Set working directory (e.g., /project /home/user/myapp)" },
            { "title": "model", "description": "Switch Claude model" },
            { "title": "permission", "description": "Change tool permission mode" },
            { "title": "sessions", "description": "List recent sessions" },
            { "title": "handoff", "description": "Accept a handoff from terminal Claude Code" },
            { "title": "status", "description": "Show current session info" },
            { "title": "help", "description": "Show available commands" }
          ]
        }
      ]
    }
  ],
  "validDomains": ["{{TUNNEL_DOMAIN}}"],
  "permissions": ["identity", "messageTeamMembers"]
}
```

#### One-Command Setup

The entire bot registration, manifest generation, and tunnel setup is handled by `cc-ms-teams setup`. See [Section 11 - Developer Experience](#11-developer-experience) for the full wizard flow.

#### Dependencies

| Package | Purpose |
|---------|---------|
| `@microsoft/teams.apps` | Core App class, activity handlers, proactive messaging |
| `@microsoft/teams.api` | Activity types, MessageActivity, Account |
| `@microsoft/teams.mcp` | MCP server plugin for bidirectional Claude Code communication |
| `@microsoft/teams.dev` | DevTools plugin (development only) |
| `zod` | MCP tool parameter schemas |

#### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | `number` | `3978` | HTTP server port |
| `botId` | `string` | (required) | Azure Bot App Registration Client ID |
| `botPassword` | `string` | (required) | Azure Bot App Registration Client Secret |
| `tenantId` | `string` | (required) | Azure AD Tenant ID (single-tenant) |
| `devMode` | `boolean` | `false` | Enable DevTools plugin and relaxed auth |

#### Error Handling

- **Invalid activity format:** Log and return 400. Do not crash the process.
- **Auth failure:** Return 401/403 to Azure Bot Service. Send user-facing "unauthorized" message.
- **Proactive send failure (429):** Queue message, exponential backoff up to 30s, drop after 2 minutes.
- **Proactive send failure (403):** User removed the bot. Remove from conversation store. Log warning.

---

### 3.2 Message Bridge

#### Purpose

The Message Bridge handles bidirectional message format transformation between Teams activity format and Claude Agent SDK message format. It also manages streaming response batching and content chunking for large responses.

#### TypeScript Interfaces

```typescript
// src/bridge/types.ts

export interface IMessageBridge {
  /** Convert a Teams message context into an SDKUserMessage content string */
  teamsToClaudeMessage(ctx: MessageContext): Promise<string>;

  /** Convert a Claude SDK message into one or more Teams-sendable content items */
  claudeToTeamsContent(msg: SDKMessage): Promise<TeamsContent[]>;

  /** Create a stream batcher for a given conversation */
  createStreamBatcher(conversationId: string): StreamBatcher;
}

export interface MessageContext {
  userId: string;
  conversationId: string;
  text: string;
  attachments: never[];  // File sharing deferred
  send: (content: string | object) => Promise<void>;
}

export type TeamsContent =
  | { type: 'text'; text: string }
  | { type: 'card'; card: AdaptiveCard }
  | { type: 'typing' };

export interface StreamBatcher {
  /** Push a partial message token into the buffer */
  push(token: string): void;

  /** Push a tool use event for card rendering */
  pushToolUse(toolName: string, input: Record<string, unknown>): void;

  /** Force flush any buffered content */
  flush(): Promise<TeamsContent[]>;

  /** Stop the batcher and flush remaining content */
  stop(): Promise<TeamsContent[]>;
}
```

#### Teams -> Claude Code Transformation

```typescript
// src/bridge/teams-to-claude.ts

export class TeamsToClaudeTransformer {
  /**
   * Transform Teams activity text into Claude Code prompt.
   *
   * Processing steps:
   * 1. Strip @mention prefix (e.g., "<at>Claude Code</at> fix the bug" -> "fix the bug")
   * 2. Normalize whitespace
   * 3. Return clean prompt string
   */
  transform(text: string): string {
    // Strip Teams @mention XML tags
    let cleaned = text.replace(/<at[^>]*>.*?<\/at>\s*/gi, '');

    // Normalize whitespace
    cleaned = cleaned.trim();

    if (!cleaned) {
      throw new EmptyMessageError('Message was empty after processing');
    }

    return cleaned;
  }
}
```

#### Claude Code -> Teams Transformation

```typescript
// src/bridge/claude-to-teams.ts

import type { SDKMessage, SDKAssistantMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';

export class ClaudeToTeamsTransformer {
  constructor(private cardRenderer: IAdaptiveCardRenderer) {}

  async transform(msg: SDKMessage): Promise<TeamsContent[]> {
    const contents: TeamsContent[] = [];

    switch (msg.type) {
      case 'assistant': {
        const assistantMsg = msg as SDKAssistantMessage;
        for (const block of assistantMsg.message.content) {
          if (block.type === 'text') {
            // Parse markdown for code fences
            const parsed = this.parseMarkdown(block.text);
            for (const segment of parsed) {
              if (segment.type === 'text') {
                contents.push({ type: 'text', text: segment.text });
              } else if (segment.type === 'code') {
                contents.push({
                  type: 'card',
                  card: this.cardRenderer.renderCodeBlock(
                    segment.code,
                    segment.language ?? 'PlainText',
                  ),
                });
              }
            }
          }
          if (block.type === 'tool_use') {
            contents.push({
              type: 'card',
              card: this.renderToolUseCard(block),
            });
          }
        }
        break;
      }

      case 'result': {
        const resultMsg = msg as SDKResultMessage;
        contents.push({
          type: 'card',
          card: this.cardRenderer.renderSessionSummary({
            sessionId: resultMsg.session_id,
            duration: resultMsg.duration_ms,
            cost: resultMsg.total_cost_usd,
            turns: resultMsg.num_turns,
            result: resultMsg.subtype === 'success' ? resultMsg.result : 'Error',
          }),
        });
        break;
      }
    }

    return contents;
  }

  /**
   * Parse markdown text into segments of plain text and code blocks.
   * Code fences (```language\n...\n```) are extracted as code segments.
   */
  private parseMarkdown(text: string): MarkdownSegment[] {
    const segments: MarkdownSegment[] = [];
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let lastIndex = 0;

    for (const match of text.matchAll(codeBlockRegex)) {
      if (match.index! > lastIndex) {
        segments.push({
          type: 'text',
          text: text.slice(lastIndex, match.index!),
        });
      }
      segments.push({
        type: 'code',
        language: match[1] || undefined,
        code: match[2],
      });
      lastIndex = match.index! + match[0].length;
    }

    if (lastIndex < text.length) {
      segments.push({ type: 'text', text: text.slice(lastIndex) });
    }

    return segments;
  }

  private renderToolUseCard(block: { name: string; input: unknown }): AdaptiveCard {
    if (block.name === 'Edit' || block.name === 'Write') {
      const input = block.input as { file_path?: string; old_string?: string; new_string?: string; content?: string };
      if (input.old_string && input.new_string) {
        return this.cardRenderer.renderDiff(
          input.file_path ?? 'unknown',
          input.old_string,
          input.new_string,
          this.cardRenderer.detectLanguage(input.file_path ?? ''),
        );
      }
    }
    // Generic tool use card
    return this.cardRenderer.renderToolUseSummary(block.name, block.input);
  }
}

type MarkdownSegment =
  | { type: 'text'; text: string }
  | { type: 'code'; language?: string; code: string };
```

#### Streaming Response Handling

The `StreamBatcher` accumulates partial assistant message tokens and flushes them to Teams at intelligent boundaries, avoiding the noise of per-token updates while maintaining responsiveness.

```typescript
// src/bridge/stream-batcher.ts

export class StreamBatcherImpl implements StreamBatcher {
  private buffer = '';
  private codeBuffer = '';
  private inCodeBlock = false;
  private codeLang = '';
  private flushTimer: NodeJS.Timeout | null = null;
  private pendingContents: TeamsContent[] = [];

  constructor(
    private conversationId: string,
    private cardRenderer: IAdaptiveCardRenderer,
    private sendFn: (content: TeamsContent) => Promise<void>,
    private options: StreamBatcherOptions = {},
  ) {}

  private get flushInterval(): number {
    return this.options.flushIntervalMs ?? 500;
  }

  private get charThreshold(): number {
    return this.options.charThreshold ?? 200;
  }

  push(token: string): void {
    if (this.inCodeBlock) {
      this.codeBuffer += token;
      // Check for code fence end
      if (this.codeBuffer.includes('```')) {
        const endIdx = this.codeBuffer.indexOf('```');
        const code = this.codeBuffer.slice(0, endIdx);
        this.inCodeBlock = false;
        this.codeBuffer = '';
        this.pendingContents.push({
          type: 'card',
          card: this.cardRenderer.renderCodeBlock(code.trim(), this.codeLang || 'PlainText'),
        });
        // Continue processing any text after the closing fence
        const remainder = this.codeBuffer.slice(endIdx + 3);
        if (remainder.trim()) {
          this.buffer += remainder;
        }
      }
      return;
    }

    this.buffer += token;

    // Check for code fence start
    const fenceMatch = this.buffer.match(/```(\w*)\n/);
    if (fenceMatch) {
      const beforeFence = this.buffer.slice(0, fenceMatch.index!);
      if (beforeFence.trim()) {
        this.pendingContents.push({ type: 'text', text: beforeFence.trim() });
      }
      this.codeLang = fenceMatch[1] || 'PlainText';
      this.inCodeBlock = true;
      this.codeBuffer = this.buffer.slice(fenceMatch.index! + fenceMatch[0].length);
      this.buffer = '';
      return;
    }

    // Auto-flush on threshold
    if (this.buffer.length >= this.charThreshold) {
      this.scheduleFlush(0);
      return;
    }

    // Schedule timer-based flush
    if (!this.flushTimer) {
      this.scheduleFlush(this.flushInterval);
    }
  }

  pushToolUse(toolName: string, input: Record<string, unknown>): void {
    this.pendingContents.push({
      type: 'card',
      card: this.cardRenderer.renderToolUseSummary(toolName, input),
    });
    this.scheduleFlush(0);
  }

  async flush(): Promise<TeamsContent[]> {
    this.clearTimer();

    if (this.buffer.trim()) {
      this.pendingContents.push({ type: 'text', text: this.buffer.trim() });
      this.buffer = '';
    }

    const contents = [...this.pendingContents];
    this.pendingContents = [];

    // Send all pending content
    for (const content of contents) {
      await this.sendFn(content);
    }

    return contents;
  }

  async stop(): Promise<TeamsContent[]> {
    // Flush any remaining code block as plain text
    if (this.inCodeBlock && this.codeBuffer) {
      this.pendingContents.push({
        type: 'card',
        card: this.cardRenderer.renderCodeBlock(this.codeBuffer.trim(), this.codeLang || 'PlainText'),
      });
      this.inCodeBlock = false;
      this.codeBuffer = '';
    }
    return this.flush();
  }

  private scheduleFlush(delayMs: number): void {
    this.clearTimer();
    this.flushTimer = setTimeout(() => this.flush(), delayMs);
  }

  private clearTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

export interface StreamBatcherOptions {
  /** Milliseconds between timer-based flushes (default: 500) */
  flushIntervalMs?: number;
  /** Character count threshold for immediate flush (default: 200) */
  charThreshold?: number;
}
```

#### Message History and Context Management

The Message Bridge does not maintain its own message history. Session history is managed by the Claude Agent SDK via its built-in session persistence. The `SessionManager.resumeSession()` method uses the SDK's `resume` option to reload conversation context.

For Teams-side context, the `ConversationStore` maintains a mapping of user IDs to conversation IDs, enabling proactive messaging to users who have previously interacted with the bot.

#### Content Chunking for Long Responses

```typescript
// src/bridge/content-chunker.ts

const MAX_TEXT_LENGTH = 4000;  // Teams message size limit

export class ContentChunker {
  /**
   * Split a long text response into chunks that fit within Teams limits.
   * Respects paragraph boundaries and avoids splitting mid-sentence.
   */
  chunk(text: string): string[] {
    if (text.length <= MAX_TEXT_LENGTH) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > MAX_TEXT_LENGTH) {
      // Find a good split point: paragraph break, sentence end, or word boundary
      let splitIdx = remaining.lastIndexOf('\n\n', MAX_TEXT_LENGTH);
      if (splitIdx < MAX_TEXT_LENGTH * 0.5) {
        splitIdx = remaining.lastIndexOf('. ', MAX_TEXT_LENGTH);
      }
      if (splitIdx < MAX_TEXT_LENGTH * 0.5) {
        splitIdx = remaining.lastIndexOf(' ', MAX_TEXT_LENGTH);
      }
      if (splitIdx < 0) {
        splitIdx = MAX_TEXT_LENGTH;
      }

      chunks.push(remaining.slice(0, splitIdx + 1).trim());
      remaining = remaining.slice(splitIdx + 1).trim();
    }

    if (remaining) {
      chunks.push(remaining);
    }

    return chunks;
  }
}
```

#### Dependencies

| Module | Depends On |
|--------|-----------|
| `TeamsToClaudeTransformer` | None |
| `ClaudeToTeamsTransformer` | `IAdaptiveCardRenderer` |
| `StreamBatcherImpl` | `IAdaptiveCardRenderer`, send function |
| `ContentChunker` | None |

---

### 3.3 Claude Code Session Manager

#### Purpose

The Session Manager owns the lifecycle of Claude Agent SDK sessions. It creates per-user sessions using streaming input mode, routes Teams messages into the session's async generator, processes Claude Code outputs for forwarding back to Teams, and manages tool permissions via Adaptive Card prompts.

#### TypeScript Interfaces

```typescript
// src/session/types.ts

import type { Query, PermissionMode } from '@anthropic-ai/claude-agent-sdk';

export interface ISessionManager {
  getOrCreateSession(userId: string, options?: SessionOptions): Promise<Session>;
  sendMessage(userId: string, message: string): Promise<void>;
  stopSession(userId: string): Promise<void>;
  resumeSession(userId: string, sessionId: string): Promise<Session>;
  forkSession(userId: string, sessionId: string): Promise<Session>;
  listSessions(userId: string): Promise<SessionInfo[]>;
  setWorkingDirectory(userId: string, cwd: string): Promise<void>;
  setModel(userId: string, model: string): Promise<void>;
  setPermissionMode(userId: string, mode: PermissionMode): Promise<void>;
  resolvePermission(userId: string, requestId: string, decision: PermissionDecision): void;
  shutdown(): Promise<void>;
}

export interface Session {
  sessionId: string;
  userId: string;
  query: Query;
  inputQueue: StreamInputAdapter;
  cwd: string;
  model: string;
  status: 'active' | 'idle' | 'stopped';
  permissionMode: PermissionMode;
  createdAt: Date;
  totalCost: number;
  allowedToolsOverrides: Set<string>;
}

export interface SessionOptions {
  cwd?: string;
  model?: string;
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  maxTurns?: number;
  maxBudgetUsd?: number;
  systemPrompt?: string;
}

export interface SessionInfo {
  sessionId: string;
  cwd: string;
  model: string;
  status: 'active' | 'idle' | 'stopped';
  createdAt: string;
  totalCost: number;
  turnCount: number;
}

export type PermissionDecision = 'allow' | 'deny' | 'always_allow';

export interface StreamInputAdapter {
  push(message: string): void;
  close(): void;
  [Symbol.asyncIterator](): AsyncIterator<{ type: 'user'; message: { role: 'user'; content: string } }>;
}
```

#### Claude Agent SDK Integration

```typescript
// src/session/session-factory.ts

import { query, type Query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';

export class SessionFactory {
  constructor(
    private config: SessionManagerConfig,
    private messageBridge: IMessageBridge,
    private proactiveSender: ProactiveSender,
    private cardRenderer: IAdaptiveCardRenderer,
  ) {}

  async createSession(userId: string, options: SessionOptions): Promise<Session> {
    const inputAdapter = new StreamInputAdapterImpl();

    const sessionQuery = query({
      prompt: inputAdapter,
      options: {
        cwd: options.cwd ?? this.config.defaultCwd,
        model: options.model ?? this.config.defaultModel,
        maxTurns: options.maxTurns ?? this.config.defaultMaxTurns,
        maxBudgetUsd: options.maxBudgetUsd ?? this.config.defaultMaxBudgetUsd,
        allowedTools: options.allowedTools ?? this.config.defaultAllowedTools,
        includePartialMessages: true,
        permissionMode: options.permissionMode ?? 'default',

        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: options.systemPrompt ?? this.config.defaultSystemPromptAppend,
        },

        canUseTool: async (toolName, input, { signal }) => {
          return this.handlePermissionRequest(userId, toolName, input, signal);
        },

        hooks: {
          Notification: [{
            matcher: '*',
            callback: async (hookInput) => {
              await this.proactiveSender.sendToUser(
                userId,
                `**Notification:** ${hookInput.notification}`,
              );
              return {};
            },
          }],
          PostToolUse: [{
            matcher: 'Write|Edit',
            callback: async (hookInput) => {
              const card = this.cardRenderer.renderToolUseSummary(
                hookInput.toolName,
                hookInput.toolInput,
              );
              await this.proactiveSender.sendCardToUser(userId, card);
              return {};
            },
          }],
          SessionEnd: [{
            matcher: '*',
            callback: async (hookInput) => {
              await this.proactiveSender.sendToUser(userId, 'Session ended.');
              return {};
            },
          }],
        },
      },
    });

    const session: Session = {
      sessionId: '', // Will be set from init response
      userId,
      query: sessionQuery,
      inputQueue: inputAdapter,
      cwd: options.cwd ?? this.config.defaultCwd,
      model: options.model ?? this.config.defaultModel,
      status: 'idle',
      permissionMode: options.permissionMode ?? 'default',
      createdAt: new Date(),
      totalCost: 0,
      allowedToolsOverrides: new Set(),
    };

    // Start output processing loop
    this.processOutputLoop(session);

    // Get session ID from initialization
    const initResult = await sessionQuery.initializationResult();
    session.sessionId = initResult.sessionId ?? crypto.randomUUID();

    return session;
  }

  private async processOutputLoop(session: Session): Promise<void> {
    const batcher = this.messageBridge.createStreamBatcher(session.userId);

    try {
      for await (const msg of session.query) {
        session.status = 'active';

        switch (msg.type) {
          case 'assistant':
          case 'result': {
            const contents = await this.messageBridge.claudeToTeamsContent(msg);
            for (const content of contents) {
              await this.proactiveSender.send(session.userId, content);
            }
            if (msg.type === 'result') {
              session.totalCost = (msg as any).total_cost_usd ?? session.totalCost;
              session.status = 'idle';
            }
            break;
          }

          case 'partial': {
            const partial = msg as any;
            if (partial.delta?.text) {
              batcher.push(partial.delta.text);
            }
            break;
          }
        }
      }
    } catch (error) {
      const errorCard = this.cardRenderer.renderError({
        type: 'session_error',
        message: error instanceof Error ? error.message : 'Unknown session error',
        recoverable: true,
      });
      await this.proactiveSender.sendCardToUser(session.userId, errorCard);
    } finally {
      await batcher.stop();
      session.status = 'stopped';
    }
  }

  private async handlePermissionRequest(
    userId: string,
    toolName: string,
    input: unknown,
    signal: AbortSignal,
  ): Promise<{ behavior: 'allow' | 'deny'; message?: string }> {
    // Check if already auto-approved for this session
    const session = this.getSessionByUserId(userId);
    if (session?.allowedToolsOverrides.has(toolName)) {
      return { behavior: 'allow' };
    }

    // Show permission card in Teams
    const requestId = crypto.randomUUID();
    const card = this.cardRenderer.renderPermissionRequest({
      requestId,
      toolName,
      input: JSON.stringify(input, null, 2).slice(0, 500),
    });

    await this.proactiveSender.sendCardToUser(userId, card);

    // Wait for user response (with timeout)
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.permissionCallbacks.delete(requestId);
        resolve({ behavior: 'deny', message: 'Permission request timed out (5 minutes)' });
      }, 5 * 60 * 1000);

      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        this.permissionCallbacks.delete(requestId);
        resolve({ behavior: 'deny', message: 'Session interrupted' });
      });

      this.permissionCallbacks.set(requestId, (decision: PermissionDecision) => {
        clearTimeout(timeout);
        this.permissionCallbacks.delete(requestId);

        if (decision === 'always_allow' && session) {
          session.allowedToolsOverrides.add(toolName);
        }

        resolve({
          behavior: decision === 'deny' ? 'deny' : 'allow',
        });
      });
    });
  }

  private permissionCallbacks = new Map<string, (decision: PermissionDecision) => void>();
  private getSessionByUserId(userId: string): Session | undefined { /* ... */ return undefined; }
}
```

#### StreamInputAdapter Implementation

```typescript
// src/session/stream-input-adapter.ts

import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

type UserMessageYield = {
  type: 'user';
  message: { role: 'user'; content: string };
};

export class StreamInputAdapterImpl implements StreamInputAdapter {
  private queue: string[] = [];
  private resolve: ((value: IteratorResult<UserMessageYield>) => void) | null = null;
  private closed = false;

  push(message: string): void {
    if (this.closed) {
      throw new Error('StreamInputAdapter is closed');
    }

    if (this.resolve) {
      // A consumer is waiting; resolve immediately
      const r = this.resolve;
      this.resolve = null;
      r({
        done: false,
        value: { type: 'user', message: { role: 'user', content: message } },
      });
    } else {
      this.queue.push(message);
    }
  }

  close(): void {
    this.closed = true;
    if (this.resolve) {
      this.resolve({ done: true, value: undefined as any });
      this.resolve = null;
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<UserMessageYield> {
    return {
      next: (): Promise<IteratorResult<UserMessageYield>> => {
        if (this.queue.length > 0) {
          const msg = this.queue.shift()!;
          return Promise.resolve({
            done: false,
            value: { type: 'user', message: { role: 'user', content: msg } },
          });
        }

        if (this.closed) {
          return Promise.resolve({ done: true, value: undefined as any });
        }

        return new Promise((resolve) => {
          this.resolve = resolve;
        });
      },
    };
  }
}
```

#### Session Lifecycle

1. **Create**: User sends first message (or `/new`). `getOrCreateSession()` creates a new `query()` with streaming input mode.
2. **Query**: User messages are pushed into the `StreamInputAdapter`. Claude processes them and yields output messages.
3. **Stream**: Output messages flow through the `processOutputLoop()`, get transformed by Message Bridge, and sent to Teams via ProactiveSender.
4. **Idle**: When Claude finishes processing (yields `SDKResultMessage`), session status becomes `idle`. It remains alive, waiting for the next user message.
5. **Resume**: On bot restart, `resumeSession()` uses `{ resume: sessionId }` to reconnect to a previous session.
6. **Destroy**: User sends `/stop` or session hits budget limit. `query.interrupt()` is called, session is cleaned up.

#### Tool Permissions and allowedTools Configuration

**Default tool tiers:**

| Tier | Tools | Enabled By Default |
|------|-------|--------------------|
| Read-only | `Read`, `Grep`, `Glob` | Yes |
| Write | `Write`, `Edit` | No (requires `/permission acceptEdits`) |
| Full | `Read`, `Grep`, `Glob`, `Write`, `Edit`, `Bash` | No (requires `/permission bypassPermissions`) |

The `canUseTool` callback is always active regardless of tier. It sends an Adaptive Card to Teams for any tool not in the session's `allowedTools` list. The user can:
- **Approve** (one-time): Allow this specific tool invocation
- **Deny**: Block this specific tool invocation
- **Always Allow**: Add the tool to the session's override list for the remainder of the session

#### Per-User Session Isolation

Each user (identified by AAD Object ID) has at most one active session. Sessions are isolated:
- Separate `query()` instances
- Separate working directories
- Separate tool permission overrides
- Separate cost tracking

---

### 3.4 Adaptive Card Renderer

#### Purpose

The Adaptive Card Renderer generates Adaptive Card JSON payloads for all rich content displayed in Teams: syntax-highlighted code blocks, file diffs, progress indicators, error messages, permission request prompts, and session summaries.

#### TypeScript Interfaces

```typescript
// src/cards/types.ts

export interface IAdaptiveCardRenderer {
  renderCodeBlock(code: string, language: string, options?: CodeBlockOptions): AdaptiveCard;
  renderDiff(filePath: string, before: string, after: string, language: string): AdaptiveCard;
  renderUnifiedDiff(filePath: string, unifiedDiff: string): AdaptiveCard;
  renderProgress(status: string, percent?: number, elapsed?: string): AdaptiveCard;
  renderError(error: ErrorInfo): AdaptiveCard;
  renderPermissionRequest(request: PermissionRequest): AdaptiveCard;
  renderSessionSummary(summary: SessionSummary): AdaptiveCard;
  renderToolUseSummary(toolName: string, input: unknown): AdaptiveCard;
  detectLanguage(filePath: string): string;
}

export interface CodeBlockOptions {
  filePath?: string;
  startLine?: number;
  endLine?: number;
  showOpenInVSCode?: boolean;
}

export interface ErrorInfo {
  type: string;
  message: string;
  stack?: string;
  recoverable: boolean;
}

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  input: string;
}

export interface SessionSummary {
  sessionId: string;
  duration: number;
  cost: number;
  turns: number;
  result: string;
}

export interface AdaptiveCard {
  $schema: string;
  type: 'AdaptiveCard';
  version: string;
  body: AdaptiveCardElement[];
  actions?: AdaptiveCardAction[];
}

type AdaptiveCardElement = Record<string, unknown>;
type AdaptiveCardAction = Record<string, unknown>;
```

#### Language Mapping

```typescript
// src/cards/language-mapper.ts

const LANGUAGE_MAP: Record<string, string> = {
  // TypeScript
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript',
  // JavaScript
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  // Python
  py: 'Python', pyw: 'Python',
  // Go
  go: 'Go',
  // Java
  java: 'Java',
  // C
  c: 'C', h: 'C',
  // C++
  cpp: 'C++', hpp: 'C++', cc: 'C++', cxx: 'C++',
  // C#
  cs: 'C#',
  // Bash
  sh: 'Bash', bash: 'Bash', zsh: 'Bash',
  // JSON
  json: 'JSON', jsonc: 'JSON',
  // HTML
  html: 'HTML', htm: 'HTML',
  // CSS
  css: 'CSS', scss: 'CSS', less: 'CSS',
  // SQL
  sql: 'SQL',
  // XML
  xml: 'XML', xsl: 'XML', xsd: 'XML', svg: 'XML',
  // PHP
  php: 'PHP',
  // Perl
  pl: 'Perl', pm: 'Perl',
  // PowerShell
  ps1: 'PowerShell', psm1: 'PowerShell',
  // GraphQL
  graphql: 'GraphQL', gql: 'GraphQL',
  // Verilog/VHDL
  v: 'Verilog', vhd: 'VHDL', vhdl: 'VHDL',
  // Visual Basic
  vb: 'Visual Basic',
  // DOS
  bat: 'DOS', cmd: 'DOS',
};

export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext ? (LANGUAGE_MAP[ext] ?? 'PlainText') : 'PlainText';
}

/**
 * Map a language name (from markdown code fence) to Adaptive Cards CodeBlock language enum.
 * Handles common aliases like "typescript" -> "TypeScript", "python" -> "Python".
 */
export function normalizeLanguage(lang: string): string {
  const lower = lang.toLowerCase();
  const aliases: Record<string, string> = {
    typescript: 'TypeScript', ts: 'TypeScript',
    javascript: 'JavaScript', js: 'JavaScript',
    python: 'Python', py: 'Python',
    golang: 'Go', go: 'Go',
    java: 'Java',
    c: 'C',
    'c++': 'C++', cpp: 'C++',
    'c#': 'C#', csharp: 'C#',
    bash: 'Bash', shell: 'Bash', sh: 'Bash', zsh: 'Bash',
    json: 'JSON', jsonc: 'JSON',
    html: 'HTML',
    css: 'CSS', scss: 'CSS', less: 'CSS',
    sql: 'SQL',
    xml: 'XML',
    php: 'PHP',
    perl: 'Perl',
    powershell: 'PowerShell', ps1: 'PowerShell',
    graphql: 'GraphQL',
    plaintext: 'PlainText', text: 'PlainText', txt: 'PlainText',
  };
  return aliases[lower] ?? 'PlainText';
}
```

#### Card Templates

##### Code Block Card

```typescript
// src/cards/templates/code-block.ts

export function renderCodeBlock(
  code: string,
  language: string,
  options?: CodeBlockOptions,
): AdaptiveCard {
  const body: AdaptiveCardElement[] = [];

  if (options?.filePath) {
    body.push({
      type: 'TextBlock',
      text: options.filePath,
      style: 'heading',
      size: 'small',
      color: 'accent',
    });
  }

  if (options?.startLine && options?.endLine) {
    body.push({
      type: 'TextBlock',
      text: `Lines ${options.startLine} - ${options.endLine}`,
      size: 'small',
      isSubtle: true,
    });
  }

  body.push({
    type: 'CodeBlock',
    codeSnippet: code,
    language: normalizeLanguage(language),
    ...(options?.startLine ? { startLineNumber: options.startLine } : {}),
  });

  const actions: AdaptiveCardAction[] = [];

  if (options?.showOpenInVSCode && options?.filePath) {
    actions.push({
      type: 'Action.OpenUrl',
      title: 'Open in VS Code',
      url: `vscode://file${options.filePath}${options.startLine ? `:${options.startLine}` : ''}`,
    });
  }

  return {
    $schema: 'https://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body,
    ...(actions.length > 0 ? { actions } : {}),
  };
}
```

**Rendered JSON example:**

```json
{
  "$schema": "https://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "src/auth/handler.ts",
      "style": "heading",
      "size": "small",
      "color": "accent"
    },
    {
      "type": "TextBlock",
      "text": "Lines 42 - 58",
      "size": "small",
      "isSubtle": true
    },
    {
      "type": "CodeBlock",
      "codeSnippet": "export async function validateToken(token: string): Promise<boolean> {\n  const decoded = jwt.verify(token, config.secret);\n  if (!decoded) {\n    throw new AuthError('Invalid token');\n  }\n  return true;\n}",
      "language": "TypeScript",
      "startLineNumber": 42
    }
  ],
  "actions": [
    {
      "type": "Action.OpenUrl",
      "title": "Open in VS Code",
      "url": "vscode://file/home/user/project/src/auth/handler.ts:42"
    }
  ]
}
```

##### Diff Card (Side-by-Side)

```typescript
// src/cards/templates/diff-card.ts

export function renderDiff(
  filePath: string,
  before: string,
  after: string,
  language: string,
): AdaptiveCard {
  return {
    $schema: 'https://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      {
        type: 'TextBlock',
        text: `File Changed: ${filePath}`,
        style: 'heading',
        size: 'small',
        color: 'attention',
      },
      {
        type: 'ColumnSet',
        columns: [
          {
            type: 'Column',
            width: 'stretch',
            items: [
              { type: 'TextBlock', text: 'Before', weight: 'bolder', size: 'small' },
              {
                type: 'CodeBlock',
                codeSnippet: before,
                language: normalizeLanguage(language),
              },
            ],
          },
          {
            type: 'Column',
            width: 'stretch',
            items: [
              { type: 'TextBlock', text: 'After', weight: 'bolder', size: 'small' },
              {
                type: 'CodeBlock',
                codeSnippet: after,
                language: normalizeLanguage(language),
              },
            ],
          },
        ],
      },
    ],
  };
}
```

**Rendered JSON example:**

```json
{
  "$schema": "https://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "File Changed: src/config.ts",
      "style": "heading",
      "size": "small",
      "color": "attention"
    },
    {
      "type": "ColumnSet",
      "columns": [
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            { "type": "TextBlock", "text": "Before", "weight": "bolder", "size": "small" },
            {
              "type": "CodeBlock",
              "codeSnippet": "const port = 3000;",
              "language": "TypeScript"
            }
          ]
        },
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            { "type": "TextBlock", "text": "After", "weight": "bolder", "size": "small" },
            {
              "type": "CodeBlock",
              "codeSnippet": "const port = process.env.PORT || 3000;",
              "language": "TypeScript"
            }
          ]
        }
      ]
    }
  ]
}
```

For diffs exceeding 20 lines, the renderer falls back to unified diff format:

```typescript
export function renderUnifiedDiff(filePath: string, unifiedDiff: string): AdaptiveCard {
  return {
    $schema: 'https://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      {
        type: 'TextBlock',
        text: `Diff: ${filePath}`,
        style: 'heading',
        size: 'small',
        color: 'attention',
      },
      {
        type: 'CodeBlock',
        codeSnippet: unifiedDiff,
        language: 'PlainText',
      },
    ],
  };
}
```

##### Progress Indicator Card

```json
{
  "$schema": "https://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "Claude Code is working...",
      "style": "heading",
      "size": "small"
    },
    {
      "type": "TextBlock",
      "text": "Reading files and analyzing code structure",
      "wrap": true,
      "isSubtle": true
    },
    {
      "type": "ColumnSet",
      "columns": [
        {
          "type": "Column",
          "width": "60",
          "style": "accent",
          "items": [{ "type": "TextBlock", "text": " " }]
        },
        {
          "type": "Column",
          "width": "40",
          "items": [{ "type": "TextBlock", "text": " " }]
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "Elapsed: 12s | 60%",
      "size": "small",
      "isSubtle": true,
      "horizontalAlignment": "right"
    }
  ]
}
```

##### Error Message Card

```json
{
  "$schema": "https://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "Container",
      "style": "attention",
      "items": [
        {
          "type": "TextBlock",
          "text": "Session Error",
          "style": "heading",
          "color": "attention",
          "size": "medium"
        },
        {
          "type": "TextBlock",
          "text": "The Claude Code session encountered an error: tool execution timed out after 120 seconds.",
          "wrap": true
        },
        {
          "type": "CodeBlock",
          "codeSnippet": "TimeoutError: Bash tool exceeded 120s limit\n  at ToolRunner.execute (session.ts:142)\n  at SessionManager.processOutputLoop (session-manager.ts:89)",
          "language": "PlainText"
        }
      ]
    }
  ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Retry",
      "data": { "action": "retry_session" }
    },
    {
      "type": "Action.Submit",
      "title": "New Session",
      "data": { "action": "new_session" }
    }
  ]
}
```

##### Permission Request Card

```json
{
  "$schema": "https://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "Permission Required",
      "style": "heading",
      "color": "warning",
      "size": "medium"
    },
    {
      "type": "TextBlock",
      "text": "Claude Code wants to use the **Bash** tool:",
      "wrap": true
    },
    {
      "type": "CodeBlock",
      "codeSnippet": "npm install --save-dev vitest @types/node",
      "language": "Bash"
    },
    {
      "type": "TextBlock",
      "text": "This tool can execute arbitrary commands on your machine.",
      "wrap": true,
      "isSubtle": true,
      "size": "small"
    }
  ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Approve",
      "style": "positive",
      "data": {
        "action": "approve_tool",
        "requestId": "req-abc123",
        "toolName": "Bash"
      }
    },
    {
      "type": "Action.Submit",
      "title": "Deny",
      "style": "destructive",
      "data": {
        "action": "deny_tool",
        "requestId": "req-abc123",
        "toolName": "Bash"
      }
    },
    {
      "type": "Action.Submit",
      "title": "Always Allow (this session)",
      "data": {
        "action": "always_allow_tool",
        "requestId": "req-abc123",
        "toolName": "Bash"
      }
    }
  ]
}
```

##### Session Summary Card

```json
{
  "$schema": "https://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "Session Complete",
      "style": "heading",
      "size": "medium",
      "color": "good"
    },
    {
      "type": "FactSet",
      "facts": [
        { "title": "Duration", "value": "2m 34s" },
        { "title": "Cost", "value": "$0.04" },
        { "title": "Turns", "value": "5" },
        { "title": "Session ID", "value": "sess_abc123" }
      ]
    },
    {
      "type": "TextBlock",
      "text": "Fixed the authentication bug in handler.ts by correcting the JWT verification logic.",
      "wrap": true
    }
  ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Resume Session",
      "data": { "action": "resume_session", "sessionId": "sess_abc123" }
    },
    {
      "type": "Action.Submit",
      "title": "Fork Session",
      "data": { "action": "fork_session", "sessionId": "sess_abc123" }
    }
  ]
}
```

#### Message Size Chunking

Adaptive Cards have a maximum payload size of approximately 28 KB. The renderer handles oversized content by:

1. **Code blocks >100 lines**: Split into multiple cards with "Part 1/N" headers
2. **Diff content >20 lines per side**: Fall back to unified diff format in a single CodeBlock
3. **Card JSON >25 KB**: Strip optional elements (VS Code links, subtitles) and truncate code with "... (truncated, 250 more lines)" suffix

---

### 3.5 Authentication Module

#### Purpose

The Auth Module handles Azure AD app registration validation, user access control, and API key management. It is designed for minimal manual configuration -- the setup wizard handles most of the work.

#### Azure AD App Registration Flow with Setup Wizard

The setup wizard (`cc-ms-teams setup`) guides the developer through Azure AD app registration interactively:

```
$ cc-ms-teams setup

  Claude Code Teams Bot - Setup Wizard
  =====================================

  Step 1: Azure Bot Registration
  ------------------------------
  We need to register a bot with Azure Bot Service.
  This requires a free Azure account.

  ? Do you have an Azure account? (Y/n) Y

  Opening Azure Portal to create a Bot resource...
  https://portal.azure.com/#create/Microsoft.AzureBot

  Instructions:
  1. Set Bot handle to "cc-ms-teams-<your-name>"
  2. Set Type to "Single Tenant"
  3. Set Creation type to "Create new Microsoft App ID"
  4. Click "Review + create"
  5. After creation, go to Configuration and copy the values below

  ? Bot App ID (Client ID): 12345678-abcd-efgh-ijkl-1234567890ab
  ? Bot App Password (Client Secret): ****************************
  ? Tenant ID: 87654321-dcba-hgfe-lkji-ba0987654321

  Step 2: Anthropic API Key
  -------------------------
  ? Claude API key (ANTHROPIC_API_KEY): sk-ant-****

  Step 3: Dev Tunnel
  ------------------
  Checking for devtunnel CLI... found (v1.2.3)
  Creating persistent tunnel... done
  Tunnel URL: https://abc123.devtunnels.ms

  Updating Azure Bot messaging endpoint to:
  https://abc123.devtunnels.ms/api/messages

  Step 4: User Access Control
  ---------------------------
  ? Your AAD Object ID (find in Azure Portal > Users):
    aad-obj-id-12345

  Added you to the allowed users list.
  (You can add more users later in ~/.cc-ms-teams/config.json)

  Step 5: Teams App Manifest
  --------------------------
  Generated manifest at: ~/.cc-ms-teams/manifest.zip

  To install in Teams:
  1. Open Teams
  2. Go to Apps > Manage your apps > Upload a custom app
  3. Select: ~/.cc-ms-teams/manifest.zip

  Setup complete! Run `cc-ms-teams start` to start the bot.
```

#### TypeScript Interfaces

```typescript
// src/auth/types.ts

export interface IAuthModule {
  initialize(config: AuthConfig): Promise<void>;
  isAuthorized(activity: Activity): Promise<boolean>;
  getUserId(activity: Activity): string;
  getAuthMode(): 'azure-ad' | 'dev';
}

export interface AuthConfig {
  botId: string;
  botPassword: string;
  tenantId: string;
  allowedUsers: string[];
  allowedTenants: string[];
  devMode?: boolean;
}
```

#### User ACL Implementation

```typescript
// src/auth/user-acl.ts

export class UserACLStore {
  private allowedUsers: Set<string>;
  private allowedTenants: Set<string>;

  constructor(config: AuthConfig) {
    this.allowedUsers = new Set(config.allowedUsers);
    this.allowedTenants = new Set(
      config.allowedTenants.length > 0
        ? config.allowedTenants
        : [config.tenantId],  // Default: own tenant only
    );
  }

  isAuthorized(aadObjectId: string, tenantId: string): boolean {
    if (!this.allowedTenants.has(tenantId)) return false;
    if (this.allowedUsers.size === 0) return true;  // No user filter = all tenant users
    return this.allowedUsers.has(aadObjectId);
  }

  addUser(aadObjectId: string): void {
    this.allowedUsers.add(aadObjectId);
    this.persist();
  }

  removeUser(aadObjectId: string): void {
    this.allowedUsers.delete(aadObjectId);
    this.persist();
  }

  private persist(): void {
    // Write to ~/.cc-ms-teams/config.json
  }
}
```

#### Token Storage and Refresh

Bot credentials (`botId`, `botPassword`) are stored in `~/.cc-ms-teams/config.json` with file permissions set to `0600` (owner read/write only). The Teams SDK v2 handles token refresh internally using the bot credentials -- no manual token management is required.

The Anthropic API key is stored in the same config file or read from the `ANTHROPIC_API_KEY` environment variable (env var takes precedence).

#### Sensible Defaults

| Setting | Default | Rationale |
|---------|---------|-----------|
| Auth mode | `azure-ad` | Required for Teams bot functionality |
| Tenant scope | Single-tenant (own tenant) | Most restrictive; prevents cross-tenant access |
| User ACL | Setup user only | Only the person who ran setup has access |
| Token source | Config file, env var override | Config file for persistence, env var for CI/secrets managers |
| Dev mode | Disabled | Bypasses auth; only for local testing |

#### Appendix: Personal Token Alternative

For developers who want to avoid the Azure AD app registration entirely, a webhook-only mode is available as a lightweight alternative. This approach uses Teams Outgoing Webhooks (configured per-channel) with HMAC-SHA256 shared secret validation. However, it has significant limitations:

- Channel-only (no personal 1:1 chat)
- No Adaptive Cards in responses
- No proactive messaging
- No session management
- No permission prompts

This mode is documented but not recommended for regular use. It is suitable for quick evaluation only.

---

### 3.6 Dev Tunnel Manager

#### Purpose

The Dev Tunnel Manager handles the lifecycle of the HTTPS tunnel that exposes the local bot server to Azure Bot Service. It supports MS Dev Tunnels as the primary provider with ngrok as a fallback. The goal is zero-config automatic management.

#### TypeScript Interfaces

```typescript
// src/tunnel/types.ts

export interface IDevTunnelManager {
  start(): Promise<TunnelInfo>;
  stop(): Promise<void>;
  getUrl(): string | null;
  onStatusChange(handler: (status: TunnelStatus) => void): void;
  isHealthy(): Promise<boolean>;
}

export interface TunnelInfo {
  url: string;
  tunnelId: string;
  port: number;
  provider: 'devtunnel' | 'ngrok';
}

export type TunnelStatus =
  | 'starting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

export interface TunnelConfig {
  /** Port to tunnel (default: 3978) */
  port: number;
  /** Preferred provider: 'devtunnel' or 'ngrok' (default: 'devtunnel') */
  provider: 'devtunnel' | 'ngrok';
  /** Reuse persistent tunnel ID across restarts (default: true) */
  persistent: boolean;
  /** Health check interval in ms (default: 30000) */
  healthCheckInterval: number;
  /** Max reconnection attempts (default: 5) */
  maxReconnectAttempts: number;
}
```

#### Implementation

```typescript
// src/tunnel/dev-tunnel-manager.ts

import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export class DevTunnelManager implements IDevTunnelManager {
  private process: ChildProcess | null = null;
  private tunnelInfo: TunnelInfo | null = null;
  private status: TunnelStatus = 'starting';
  private statusHandlers: ((status: TunnelStatus) => void)[] = [];
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;

  constructor(private config: TunnelConfig) {}

  async start(): Promise<TunnelInfo> {
    // Try to reuse persistent tunnel
    if (this.config.persistent) {
      const saved = this.loadSavedTunnel();
      if (saved) {
        try {
          return await this.startWithTunnelId(saved.tunnelId);
        } catch {
          // Fall through to create new tunnel
        }
      }
    }

    // Detect available provider
    const provider = await this.detectProvider();

    if (provider === 'devtunnel') {
      return this.startDevTunnel();
    } else {
      return this.startNgrok();
    }
  }

  private async detectProvider(): Promise<'devtunnel' | 'ngrok'> {
    try {
      await this.exec('devtunnel --version');
      return 'devtunnel';
    } catch {
      try {
        await this.exec('ngrok version');
        return 'ngrok';
      } catch {
        throw new TunnelProviderNotFoundError(
          'Neither devtunnel nor ngrok found.\n\n' +
          'Install one of:\n' +
          '  MS Dev Tunnels: https://aka.ms/devtunnel/install\n' +
          '  ngrok: https://ngrok.com/download\n\n' +
          'Then run `cc-ms-teams setup` again.'
        );
      }
    }
  }

  private async startDevTunnel(): Promise<TunnelInfo> {
    this.setStatus('starting');

    // Create tunnel
    const createOutput = await this.exec(
      `devtunnel create --allow-anonymous --expiration 30d`,
    );
    const tunnelId = this.parseTunnelId(createOutput);

    // Add port
    await this.exec(`devtunnel port create ${tunnelId} -p ${this.config.port}`);

    return this.startWithTunnelId(tunnelId);
  }

  private async startWithTunnelId(tunnelId: string): Promise<TunnelInfo> {
    return new Promise((resolve, reject) => {
      this.process = spawn('devtunnel', ['host', tunnelId], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';

      this.process.stdout?.on('data', (data) => {
        output += data.toString();

        // Parse URL from output
        const urlMatch = output.match(/Connect via browser:\s+(https:\/\/[^\s]+)/);
        if (urlMatch) {
          this.tunnelInfo = {
            url: urlMatch[1].replace(/\/$/, ''),
            tunnelId,
            port: this.config.port,
            provider: 'devtunnel',
          };
          this.saveTunnel(this.tunnelInfo);
          this.setStatus('connected');
          this.startHealthCheck();
          resolve(this.tunnelInfo);
        }
      });

      this.process.on('exit', (code) => {
        if (this.status === 'connected') {
          this.setStatus('disconnected');
          this.attemptReconnect();
        }
      });

      this.process.on('error', reject);

      // Timeout
      setTimeout(() => {
        if (!this.tunnelInfo) {
          reject(new Error('Tunnel failed to start within 30 seconds'));
        }
      }, 30000);
    });
  }

  private async startNgrok(): Promise<TunnelInfo> {
    this.setStatus('starting');

    return new Promise((resolve, reject) => {
      this.process = spawn('ngrok', ['http', String(this.config.port), '--log=stdout'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';

      this.process.stdout?.on('data', (data) => {
        output += data.toString();
        const urlMatch = output.match(/url=(https:\/\/[^\s]+)/);
        if (urlMatch) {
          this.tunnelInfo = {
            url: urlMatch[1],
            tunnelId: 'ngrok-session',
            port: this.config.port,
            provider: 'ngrok',
          };
          this.setStatus('connected');
          this.startHealthCheck();
          resolve(this.tunnelInfo);
        }
      });

      this.process.on('error', reject);

      setTimeout(() => {
        if (!this.tunnelInfo) reject(new Error('ngrok failed to start within 30s'));
      }, 30000);
    });
  }

  async stop(): Promise<void> {
    this.stopHealthCheck();
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.tunnelInfo = null;
    this.setStatus('disconnected');
  }

  getUrl(): string | null {
    return this.tunnelInfo?.url ?? null;
  }

  onStatusChange(handler: (status: TunnelStatus) => void): void {
    this.statusHandlers.push(handler);
  }

  async isHealthy(): Promise<boolean> {
    if (!this.tunnelInfo) return false;
    try {
      const resp = await fetch(`${this.tunnelInfo.url}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      if (!await this.isHealthy()) {
        this.setStatus('disconnected');
        this.attemptReconnect();
      }
    }, this.config.healthCheckInterval);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.setStatus('error');
      return;
    }

    this.setStatus('reconnecting');
    this.reconnectAttempts++;

    try {
      await this.stop();
      await this.start();
      this.reconnectAttempts = 0;
    } catch {
      // Will retry on next health check
    }
  }

  private setStatus(status: TunnelStatus): void {
    this.status = status;
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }

  private saveTunnel(info: TunnelInfo): void {
    const path = `${process.env.HOME}/.cc-ms-teams/tunnel.json`;
    writeFileSync(path, JSON.stringify(info, null, 2));
  }

  private loadSavedTunnel(): TunnelInfo | null {
    const path = `${process.env.HOME}/.cc-ms-teams/tunnel.json`;
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return null;
    }
  }

  private parseTunnelId(output: string): string {
    const match = output.match(/Tunnel ID:\s+(\S+)/);
    if (!match) throw new Error('Could not parse tunnel ID from devtunnel output');
    return match[1];
  }

  private exec(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', cmd], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      child.stdout?.on('data', (d) => { stdout += d.toString(); });
      child.on('exit', (code) => code === 0 ? resolve(stdout) : reject(new Error(`Command failed: ${cmd}`)));
      child.on('error', reject);
    });
  }
}
```

#### Automatic Lifecycle

1. **On `cc-ms-teams start`**: Dev Tunnel Manager starts first, obtaining the HTTPS URL. The bot server then starts on the configured port.
2. **On tunnel drop**: Health monitor detects disconnection within 30 seconds. Messages are queued. Tunnel is automatically restarted. If the tunnel ID is persistent, the same URL is reused.
3. **On `cc-ms-teams stop`**: Graceful shutdown -- bot sends "shutting down" messages, tunnel is stopped.
4. **On process crash**: The tunnel process is a child of the Node.js process, so it dies with it. On restart, the saved tunnel ID is reused.

---

## 4. Data Models

### 4.1 Configuration Schema

```typescript
// src/config/schema.ts

import { z } from 'zod';

export const ConfigSchema = z.object({
  bot: z.object({
    id: z.string().uuid().describe('Azure Bot App Registration Client ID'),
    password: z.string().min(1).describe('Azure Bot App Registration Client Secret'),
    tenantId: z.string().uuid().describe('Azure AD Tenant ID'),
    port: z.number().int().min(1).max(65535).default(3978),
  }),

  auth: z.object({
    allowedUsers: z.array(z.string()).default([])
      .describe('AAD Object IDs of allowed users. Empty = all tenant users.'),
    allowedTenants: z.array(z.string()).default([])
      .describe('Allowed tenant IDs. Empty = bot tenant only.'),
    devMode: z.boolean().default(false)
      .describe('Bypass authentication (local development only)'),
  }),

  claude: z.object({
    apiKey: z.string().optional()
      .describe('Anthropic API key. Env var ANTHROPIC_API_KEY takes precedence.'),
    defaultModel: z.string().default('claude-sonnet-4-20250514'),
    defaultCwd: z.string().default(process.cwd()),
    defaultMaxTurns: z.number().int().min(1).default(25),
    defaultMaxBudgetUsd: z.number().min(0).default(1.0),
    defaultAllowedTools: z.array(z.string()).default(['Read', 'Grep', 'Glob']),
    defaultPermissionMode: z.enum([
      'default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk',
    ]).default('default'),
    systemPromptAppend: z.string().optional()
      .describe('Text appended to the Claude Code system prompt'),
  }),

  tunnel: z.object({
    provider: z.enum(['devtunnel', 'ngrok']).default('devtunnel'),
    port: z.number().int().default(3978),
    persistent: z.boolean().default(true),
    healthCheckInterval: z.number().int().default(30000),
    maxReconnectAttempts: z.number().int().default(5),
  }),

  streaming: z.object({
    flushIntervalMs: z.number().int().default(500),
    charThreshold: z.number().int().default(200),
  }),

  rateLimit: z.object({
    maxRequestsPerMinute: z.number().int().default(10),
    maxConcurrentSessions: z.number().int().default(3),
  }),

  audit: z.object({
    enabled: z.boolean().default(true),
    logPath: z.string().default('~/.cc-ms-teams/audit.jsonl'),
    maxFileSizeMb: z.number().default(100),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;
```

### 4.2 Message Formats

```typescript
// src/types/messages.ts

/** Incoming Teams activity (subset relevant to the bridge) */
export interface IncomingTeamsActivity {
  type: 'message' | 'invoke';
  text: string;
  from: {
    aadObjectId: string;
    name: string;
  };
  conversation: {
    id: string;
    tenantId: string;
  };
  value?: CardActionData;
}

/** Card action payloads */
export type CardActionData =
  | { action: 'approve_tool'; requestId: string; toolName: string }
  | { action: 'deny_tool'; requestId: string; toolName: string }
  | { action: 'always_allow_tool'; requestId: string; toolName: string }
  | { action: 'resume_session'; sessionId: string }
  | { action: 'fork_session'; sessionId: string }
  | { action: 'retry_session' }
  | { action: 'new_session' };

/** Slash commands parsed from Teams messages */
export interface ParsedCommand {
  name: 'new' | 'stop' | 'project' | 'model' | 'permission' | 'sessions' | 'handoff' | 'status' | 'help';
  args: string;
}

/** Conversation store entry */
export interface ConversationEntry {
  userId: string;
  conversationId: string;
  userName: string;
  lastActivity: string;
}

/** Session persistence entry */
export interface SessionEntry {
  sessionId: string;
  userId: string;
  cwd: string;
  model: string;
  status: 'active' | 'idle' | 'stopped';
  createdAt: string;
  lastActivity: string;
  totalCost: number;
  turnCount: number;
  permissionMode: string;
}

/** Audit log entry */
export interface AuditEntry {
  timestamp: string;
  userId: string;
  action: 'message_received' | 'message_sent' | 'session_created' | 'session_stopped'
    | 'tool_approved' | 'tool_denied' | 'command_executed' | 'error';
  details: Record<string, unknown>;
  sessionId?: string;
}
```

### 4.3 Conversation Store

```typescript
// src/store/conversation-store.ts

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const STORE_PATH = `${process.env.HOME}/.cc-ms-teams/conversations.json`;

export class ConversationStore {
  private data: Map<string, ConversationEntry> = new Map();

  constructor() {
    this.load();
  }

  set(userId: string, conversationId: string, userName?: string): void {
    this.data.set(userId, {
      userId,
      conversationId,
      userName: userName ?? '',
      lastActivity: new Date().toISOString(),
    });
    this.save();
  }

  get(userId: string): string | undefined {
    return this.data.get(userId)?.conversationId;
  }

  remove(userId: string): void {
    this.data.delete(userId);
    this.save();
  }

  all(): ConversationEntry[] {
    return Array.from(this.data.values());
  }

  private load(): void {
    if (existsSync(STORE_PATH)) {
      try {
        const raw = JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
        this.data = new Map(Object.entries(raw));
      } catch { /* start fresh */ }
    }
  }

  private save(): void {
    const obj = Object.fromEntries(this.data);
    writeFileSync(STORE_PATH, JSON.stringify(obj, null, 2));
  }
}
```

---

## 5. API Contracts

### 5.1 Teams Webhook Endpoint

**`POST /api/messages`**

This is the primary endpoint that Azure Bot Service calls with Teams activities. It is managed entirely by the Teams SDK v2 `App` class.

| Aspect | Detail |
|--------|--------|
| Method | POST |
| Path | `/api/messages` |
| Auth | Bearer token issued by Azure Bot Service, validated by Teams SDK |
| Content-Type | `application/json` |
| Request Body | Bot Framework Activity JSON |
| Response | 200 OK (empty body) or 201 Created (with response activity) |

The Teams SDK handles all HTTP-level concerns (JWT validation, activity deserialization, response formatting). The application code only interacts with typed activity handlers registered on the `App` instance.

### 5.2 MCP Endpoint

**`POST /mcp`** (Streamable HTTP Transport)

Exposed by the `McpPlugin`. Claude Code connects to this endpoint as an MCP client when the bot is configured as an MCP server in the Claude Code session.

| Aspect | Detail |
|--------|--------|
| Method | POST (SSE stream) |
| Path | `/mcp` |
| Auth | Local only (not exposed through tunnel by default) |
| Protocol | MCP Streamable HTTP |
| Content-Type | `application/json` (requests), `text/event-stream` (responses) |

**Exposed MCP Tools:**

| Tool | Description | Parameters |
|------|-------------|------------|
| `sendToUser` | Send a message to the active Teams conversation | `message: string` |
| `askUser` | Ask a question and wait for response | `question: string, timeout?: number` |
| `getConversationHistory` | Get recent messages from the Teams conversation | `limit?: number` |

### 5.3 Health Check Endpoint

**`GET /health`**

Used by the Dev Tunnel Manager's health monitor to verify the bot is reachable through the tunnel.

| Aspect | Detail |
|--------|--------|
| Method | GET |
| Path | `/health` |
| Auth | None |
| Response (200) | `{ "status": "ok", "tunnel": "connected", "sessions": 1, "uptime": 3600 }` |
| Response (503) | `{ "status": "degraded", "tunnel": "disconnected", "error": "..." }` |

```typescript
// src/health.ts

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  tunnel: TunnelStatus;
  activeSessions: number;
  uptime: number;
  version: string;
}
```

### 5.4 Internal Component APIs

Components communicate via TypeScript interfaces (see individual component specifications). There are no internal HTTP APIs; all inter-component communication is in-process function calls.

**Dependency graph:**

```
TeamsApp
  -> AuthModule.isAuthorized()
  -> CommandParser.parse()
  -> MessageBridge.teamsToClaudeMessage()
  -> SessionManager.sendMessage()
  -> SessionManager.resolvePermission()

SessionManager
  -> MessageBridge.claudeToTeamsContent()
  -> MessageBridge.createStreamBatcher()
  -> AdaptiveCardRenderer.render*()
  -> ProactiveSender.send()

ProactiveSender
  -> TeamsApp.send()
```

---

## 6. Security Specification

### 6.1 Authentication Model

All incoming requests pass through a two-layer authentication:

1. **Transport Layer**: Azure Bot Service validates the JWT token on every activity. The Teams SDK v2 handles this automatically using the configured bot credentials.
2. **Application Layer**: The `UserACLStore` checks the sender's AAD Object ID against the allowed users list.

```
Request -> [Teams SDK JWT Validation] -> [UserACLStore.isAuthorized()] -> Handler
```

### 6.2 Rate Limiting

```typescript
// src/middleware/rate-limiter.ts

export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private maxPerMinute: number = 10) {}

  check(userId: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const bucket = this.buckets.get(userId);

    if (!bucket || now > bucket.resetAt) {
      this.buckets.set(userId, { count: 1, resetAt: now + 60_000 });
      return { allowed: true };
    }

    if (bucket.count >= this.maxPerMinute) {
      return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
    }

    bucket.count++;
    return { allowed: true };
  }
}
```

- Default: 10 messages per minute per user
- Exceeding the limit returns a user-friendly message: "Rate limit reached. Please wait N seconds."
- Rate limit state is in-memory (resets on bot restart)

### 6.3 Data Privacy

- **No data leaves the local machine** except through the Teams channel (which goes through Azure Bot Service) and the Anthropic API (for Claude inference).
- **Audit log** records all interactions locally in `~/.cc-ms-teams/audit.jsonl`.
- **Bot credentials** are stored with `0600` file permissions.
- **Claude API key** is never logged or included in error messages.
- **Message content** is not persisted by the bot (Teams and Claude SDK handle their own persistence).

### 6.4 Tool Permission Tiers

| Tier | Tools | Risk Level | How to Enable |
|------|-------|-----------|---------------|
| **Read-only** (default) | `Read`, `Grep`, `Glob` | Low | Default |
| **Edit** | + `Write`, `Edit` | Medium | `/permission acceptEdits` |
| **Full** | + `Bash` | High | `/permission bypassPermissions` |
| **Plan** | None (reasoning only) | None | `/permission plan` |

### 6.5 canUseTool Permission Flow

When Claude Code wants to use a tool not in the session's `allowedTools`:

```
1. Claude SDK calls canUseTool(toolName, input)
2. SessionManager checks session's allowedToolsOverrides
   -> If tool is in overrides: return { behavior: 'allow' }
3. SessionManager renders PermissionRequest Adaptive Card
4. Card sent to Teams with Approve/Deny/Always Allow buttons
5. User taps a button -> card.action event fires
6. SessionManager resolves the permission callback:
   - Approve: return { behavior: 'allow' }
   - Deny: return { behavior: 'deny' }
   - Always Allow: add to overrides, return { behavior: 'allow' }
7. If no response in 5 minutes: return { behavior: 'deny' }
```

### 6.6 Sensitive Path Protection

The following paths are always blocked from tool access, regardless of permission mode:

```typescript
const BLOCKED_PATHS = [
  '~/.ssh',
  '~/.aws',
  '~/.azure',
  '~/.claude',
  '~/.cc-ms-teams/config.json',  // Contains bot credentials
  '**/.env',
  '**/.env.*',
  '**/credentials.json',
  '**/secrets.json',
];
```

This is enforced via the `canUseTool` callback by checking file path arguments for `Read`, `Write`, and `Edit` tools.

---

## 7. Configuration

### 7.1 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BOT_ID` | Yes* | (from config) | Azure Bot App Registration Client ID |
| `BOT_PASSWORD` | Yes* | (from config) | Azure Bot App Registration Client Secret |
| `BOT_TENANT_ID` | Yes* | (from config) | Azure AD Tenant ID |
| `ANTHROPIC_API_KEY` | Yes* | (from config) | Anthropic API key for Claude |
| `CC_MS_TEAMS_PORT` | No | `3978` | HTTP server port |
| `CC_MS_TEAMS_DEV_MODE` | No | `false` | Enable dev mode (relaxed auth) |
| `CC_MS_TEAMS_CONFIG_DIR` | No | `~/.cc-ms-teams` | Config directory path |
| `CC_MS_TEAMS_LOG_LEVEL` | No | `info` | Log level (debug, info, warn, error) |

*Required either as env var or in config file. Env vars take precedence.

### 7.2 Config File Schema

Location: `~/.cc-ms-teams/config.json`

```json
{
  "bot": {
    "id": "12345678-abcd-efgh-ijkl-1234567890ab",
    "password": "your-bot-secret",
    "tenantId": "87654321-dcba-hgfe-lkji-ba0987654321",
    "port": 3978
  },
  "auth": {
    "allowedUsers": ["aad-object-id-1"],
    "allowedTenants": [],
    "devMode": false
  },
  "claude": {
    "defaultModel": "claude-sonnet-4-20250514",
    "defaultCwd": "/home/user/projects",
    "defaultMaxTurns": 25,
    "defaultMaxBudgetUsd": 1.0,
    "defaultAllowedTools": ["Read", "Grep", "Glob"],
    "defaultPermissionMode": "default",
    "systemPromptAppend": ""
  },
  "tunnel": {
    "provider": "devtunnel",
    "port": 3978,
    "persistent": true,
    "healthCheckInterval": 30000,
    "maxReconnectAttempts": 5
  },
  "streaming": {
    "flushIntervalMs": 500,
    "charThreshold": 200
  },
  "rateLimit": {
    "maxRequestsPerMinute": 10,
    "maxConcurrentSessions": 3
  },
  "audit": {
    "enabled": true,
    "logPath": "~/.cc-ms-teams/audit.jsonl",
    "maxFileSizeMb": 100
  }
}
```

### 7.3 Sensible Defaults

Every configuration option has a default value. A minimal config file only needs:

```json
{
  "bot": {
    "id": "...",
    "password": "...",
    "tenantId": "..."
  },
  "auth": {
    "allowedUsers": ["your-aad-object-id"]
  }
}
```

Everything else uses defaults that prioritize security and developer experience:
- Read-only tools by default
- Single-tenant access by default
- Persistent tunnel with auto-reconnect
- 500ms streaming batch interval (responsive but not noisy)
- $1.00 budget limit per session
- Audit logging enabled

---

## 8. Error Handling

### 8.1 Error Categories

| Category | Examples | User-Facing Message | Strategy |
|----------|----------|-------------------|----------|
| **Auth Errors** | Invalid token, unauthorized user, expired credentials | "You are not authorized to use this bot. Contact the bot admin." | Return 401/403. Log. Do not retry. |
| **Tunnel Errors** | Tunnel disconnected, tunnel process crashed, URL changed | "The bot is temporarily offline. Reconnecting..." | Auto-reconnect up to 5 times. Queue messages during reconnection (60s max). |
| **Session Errors** | Claude SDK crash, OOM, model error, API timeout | "Session error: [message]. Use `/new` to start a fresh session or try again." | Send error card. Auto-resume on next message. If resume fails, create new session. |
| **Rate Limit** | Teams 429, per-user rate limit exceeded | "Rate limit reached. Please wait [N] seconds before sending another message." | Exponential backoff for Teams 429. User-facing message for per-user limit. |
| **Budget Exceeded** | Session cost > maxBudgetUsd | "Session budget of $[X] reached (spent $[Y]). Use `/new` to start a new session." | Stop session. Require explicit `/new` to continue. |
| **Permission Timeout** | User did not respond to permission card in 5 min | "Permission request for [tool] timed out. The tool was not used." | Deny the tool. Notify user. Claude adjusts approach. |
| **Config Errors** | Missing bot credentials, invalid config file | "Configuration error: [detail]. Run `cc-ms-teams setup` to fix." | Fail startup with actionable error message. |

### 8.2 Reconnection Logic

```
Tunnel Drop Detected (health check fails)
  |
  v
Queue outbound messages (in-memory, max 100 messages, max 60s age)
  |
  v
Attempt reconnect #1 (immediate)
  |-- success --> Flush queued messages, resume normal operation
  |-- failure --> Wait 2s
  |
Attempt reconnect #2
  |-- success --> Flush queued messages
  |-- failure --> Wait 4s
  |
Attempt reconnect #3
  |-- success --> Flush queued messages
  |-- failure --> Wait 8s
  |
Attempt reconnect #4
  |-- success --> Flush queued messages
  |-- failure --> Wait 16s
  |
Attempt reconnect #5 (final)
  |-- success --> Flush queued messages
  |-- failure --> Drop queued messages, set status to 'error'
                  Log: "Tunnel reconnection failed after 5 attempts"
                  (Bot will retry on next incoming request)
```

### 8.3 User-Facing Error Messages

All error messages follow this format:
1. **What happened** (brief, non-technical)
2. **What to do** (actionable next step)
3. **Error detail** (optional, in small text or code block for debugging)

Example error card:

```
Session Error
─────────────
Claude Code encountered an error while processing your request.

What to do: Send your message again or use /new to start a fresh session.

Error: Tool execution timed out after 120 seconds
```

---

## 9. Testing Strategy

### 9.1 Unit Tests (vitest)

Each component has unit tests covering:

| Component | Test Focus | Mock Strategy |
|-----------|-----------|---------------|
| `TeamsToClaudeTransformer` | @mention stripping, whitespace normalization, empty message handling | None (pure function) |
| `ClaudeToTeamsTransformer` | Markdown parsing, code fence extraction, tool use card generation | Mock `IAdaptiveCardRenderer` |
| `StreamBatcherImpl` | Timer-based flushing, char threshold, code block detection, code fence boundaries | Mock send function, fake timers |
| `ContentChunker` | Paragraph splitting, sentence boundaries, max length enforcement | None (pure function) |
| `SessionFactory` | Session creation, streaming input flow, permission handling | Mock `query()`, mock `ProactiveSender` |
| `StreamInputAdapterImpl` | Push/pull synchronization, close behavior, backpressure | None (async iterator testing) |
| `AdaptiveCardRenderer` | Card JSON structure, language mapping, truncation logic | None (JSON output validation) |
| `UserACLStore` | Allow/deny logic, tenant checking, persistence | Temp file for persistence |
| `RateLimiter` | Rate enforcement, reset timing, per-user isolation | Fake timers |
| `DevTunnelManager` | Provider detection, URL parsing, reconnection state machine | Mock child_process.spawn |
| `CommandParser` | All slash commands, arg extraction, non-command passthrough | None (pure function) |

**Test configuration:**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
});
```

### 9.2 Integration Testing

Integration tests verify component interactions end-to-end:

| Scenario | Components Tested | Approach |
|----------|------------------|----------|
| Message round-trip | Bot -> Bridge -> Session -> Bridge -> Bot | Mock Teams SDK `App`, mock Claude Agent SDK `query()` |
| Permission flow | Session -> CardRenderer -> Bot -> Session | Mock `App.send()`, simulate card action callback |
| Streaming output | Session -> Batcher -> Bot | Mock `query()` yielding partial messages, verify batched output |
| Session lifecycle | Create -> Query -> Idle -> Resume -> Stop | Full SessionManager with mocked Agent SDK |
| Tunnel reconnect | TunnelManager state machine | Mock child_process, simulate tunnel crash |

### 9.3 Mock Teams Endpoint Strategy

For integration tests without a real Teams environment:

```typescript
// test/mocks/mock-teams-app.ts

export class MockTeamsApp {
  private messageHandler: ((ctx: any) => Promise<void>) | null = null;
  private cardActionHandler: ((ctx: any) => Promise<void>) | null = null;
  public sentMessages: { conversationId: string; content: any }[] = [];

  on(event: string, handler: (ctx: any) => Promise<void>): void {
    if (event === 'message') this.messageHandler = handler;
    if (event === 'card.action') this.cardActionHandler = handler;
  }

  async simulateMessage(userId: string, text: string): Promise<void> {
    const sent: any[] = [];
    await this.messageHandler?.({
      activity: {
        type: 'message',
        text,
        from: { aadObjectId: userId, name: 'Test User' },
        conversation: { id: `conv-${userId}`, tenantId: 'test-tenant' },
      },
      send: async (content: any) => { sent.push(content); },
    });
    this.sentMessages.push(...sent.map(c => ({ conversationId: `conv-${userId}`, content: c })));
  }

  async simulateCardAction(userId: string, data: CardActionData): Promise<void> {
    await this.cardActionHandler?.({
      activity: {
        type: 'invoke',
        from: { aadObjectId: userId, name: 'Test User' },
        conversation: { id: `conv-${userId}`, tenantId: 'test-tenant' },
        value: data,
      },
      send: async () => {},
    });
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}
```

For mock Claude Agent SDK sessions:

```typescript
// test/mocks/mock-agent-sdk.ts

export function createMockQuery(responses: SDKMessage[]): Query {
  let index = 0;
  const generator = {
    async next(): Promise<IteratorResult<SDKMessage>> {
      if (index >= responses.length) return { done: true, value: undefined };
      return { done: false, value: responses[index++] };
    },
    [Symbol.asyncIterator]() { return this; },
    async interrupt() {},
    async initializationResult() {
      return { sessionId: 'mock-session-id' };
    },
    // ... other Query methods
  } as any;
  return generator;
}
```

---

## 10. Non-Functional Requirements

### 10.1 Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Message latency** (Teams -> Claude prompt delivered) | < 500ms | Time from activity received to `StreamInputAdapter.push()` |
| **First token latency** (Claude response -> Teams message sent) | < 2s | Time from first `SDKPartialAssistantMessage` to `app.send()` |
| **Streaming batch interval** | 500ms (configurable) | Timer-based flush period |
| **Card render time** | < 50ms | Time to generate Adaptive Card JSON |
| **Startup time** | < 5s (excluding tunnel) | Time from `cc-ms-teams start` to HTTP server listening |
| **Tunnel startup** | < 15s | Time from tunnel spawn to URL available |
| **Shutdown time** | < 10s | Time from SIGTERM to process exit |

### 10.2 Resource Usage

| Resource | Expected Usage | Limit |
|----------|---------------|-------|
| **Memory** | 50-100 MB baseline, +20 MB per active session | 512 MB total |
| **CPU** | < 5% idle, spikes during message processing | N/A (local machine) |
| **Disk** (config + state) | < 10 MB | N/A |
| **Disk** (audit log) | ~1 KB per interaction, configurable max size | 100 MB default |
| **Network** (tunnel) | Minimal (tunnels HTTP traffic only when active) | N/A |
| **Open file descriptors** | ~20 baseline + 2 per session | 256 |

### 10.3 Reliability and Recovery

| Scenario | Recovery |
|----------|----------|
| Bot process crash | systemd/launchd auto-restarts the service. Sessions are resumed from saved state on first user message. |
| Tunnel disconnect | Auto-reconnect within 30s. Messages queued during downtime. Same tunnel URL reused if persistent. |
| Claude API outage | Session yields error. Error card sent to Teams. User can retry or start new session. |
| Teams service outage | Proactive sends fail with retry. Messages queued for up to 2 minutes. Graceful degradation. |
| Machine reboot | Service auto-starts (if installed). Tunnel re-established with same ID. Sessions available for resume. |
| Config file corruption | Startup fails with actionable error: "Config file is invalid. Run `cc-ms-teams setup` to regenerate." |

### 10.4 Scalability

cc-ms-teams is designed for individual developer use, not team-wide deployment. Expected limits:

- **Concurrent users**: 1-5 (limited by local machine resources)
- **Concurrent sessions**: 3 (configurable, default)
- **Message throughput**: 10 per minute per user (rate limited)

For team-wide deployment, each developer runs their own instance.

---

## 11. Developer Experience

### 11.1 `cc-ms-teams setup` Interactive Wizard

The setup wizard is the primary entry point for new users. It aims to get a developer from zero to working bot in under 5 minutes.

**Wizard Flow:**

```
Step 1: Prerequisites Check
  - Node.js >= 22? (if not: "Install Node.js 22+: https://nodejs.org")
  - devtunnel or ngrok? (if not: "Install devtunnel: https://aka.ms/devtunnel/install")
  - Azure account? (if not: "Create free: https://azure.microsoft.com/free")
  - Claude API key set? (if not: prompt for it)

Step 2: Azure Bot Registration
  - Open browser to Azure Portal bot creation page
  - Display step-by-step instructions alongside prompts
  - Collect: Bot App ID, Password, Tenant ID
  - Validate credentials by making a test token request

Step 3: Dev Tunnel Setup
  - Auto-detect provider (devtunnel > ngrok)
  - Create persistent tunnel
  - Display tunnel URL
  - Update Azure Bot messaging endpoint (via Azure CLI if available, otherwise display instructions)

Step 4: User Access Control
  - Prompt for current user's AAD Object ID
  - (Provide link to find it: Azure Portal > Users > your profile)
  - Add to allowed users list

Step 5: Teams App Manifest
  - Generate manifest.json with bot ID and tunnel domain
  - Package as manifest.zip with icons
  - Display sideload instructions for Teams

Step 6: Verification
  - Start bot temporarily
  - Verify tunnel is reachable
  - Display: "Setup complete! Run `cc-ms-teams start` to begin."

Output: ~/.cc-ms-teams/config.json, ~/.cc-ms-teams/manifest.zip
```

### 11.2 CLI Commands

```
cc-ms-teams setup     Interactive setup wizard
cc-ms-teams start     Start the bot (foreground)
cc-ms-teams start -d  Start the bot (background daemon)
cc-ms-teams stop      Stop the background daemon
cc-ms-teams status    Show bot status, tunnel URL, active sessions
cc-ms-teams logs      Tail the bot logs (when running as daemon)
cc-ms-teams health    Check health of all components
cc-ms-teams config    Print current configuration (secrets redacted)
cc-ms-teams manifest  Regenerate Teams app manifest zip
```

**`cc-ms-teams status` output example:**

```
cc-ms-teams v1.0.0
Status:     Running (PID 12345)
Uptime:     2h 15m
Tunnel:     https://abc123.devtunnels.ms (connected)
Bot Port:   3978
Sessions:   1 active, 3 total
  - user@company.com: active (session sess_abc, cwd /home/user/myapp, $0.12 spent)
```

### 11.3 Quick Start Guide

```
# Install
npm install -g cc-ms-teams

# Setup (interactive, ~5 minutes)
cc-ms-teams setup

# Start
cc-ms-teams start

# In Teams: find "Claude Code" in your apps and start chatting!
```

### 11.4 Error Messages with Fix Suggestions

Every error message includes a concrete next step:

| Error | Message |
|-------|---------|
| Missing Node.js | "Node.js 22+ is required but not found. Install it from https://nodejs.org" |
| Missing tunnel CLI | "Neither devtunnel nor ngrok found. Install devtunnel: `winget install Microsoft.devtunnel` or `brew install devtunnel`" |
| Invalid bot credentials | "Azure Bot credentials are invalid (got 401 from login.microsoftonline.com). Check your Bot App ID and Password in ~/.cc-ms-teams/config.json" |
| Tunnel won't start | "Tunnel failed to start. Check that port 3978 is not in use: `lsof -i :3978`. If using devtunnel, try `devtunnel login` first." |
| Claude API key invalid | "Anthropic API key is invalid (got 401). Set a valid key: `export ANTHROPIC_API_KEY=sk-ant-...` or update ~/.cc-ms-teams/config.json" |
| No allowed users configured | "No users are authorized. Add your AAD Object ID to allowedUsers in ~/.cc-ms-teams/config.json" |
| Port in use | "Port 3978 is already in use. Either stop the other process or set a different port: `CC_MS_TEAMS_PORT=3979 cc-ms-teams start`" |
| Config file missing | "Config file not found at ~/.cc-ms-teams/config.json. Run `cc-ms-teams setup` to create it." |

---

*Specification generated for the cc-ms-teams project. All technical details are derived from the [Research Report](./research-report.md) and [Architecture Design](./architecture-design.md) documents, verified against Teams SDK v2 and Claude Agent SDK documentation as of March 2026.*
