# cc-ms-teams Research Report

## Comprehensive Technical Research for Claude Code <-> Microsoft Teams Bidirectional Chat Plugin

**Date:** 2026-03-17
**Status:** Research Complete

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Microsoft Teams SDK v2 with MCP Support](#2-microsoft-teams-sdk-v2-with-mcp-support)
3. [Claude Agent SDK (TypeScript)](#3-claude-agent-sdk-typescript)
4. [Claude Code Headless Mode and Hooks System](#4-claude-code-headless-mode-and-hooks-system)
5. [Existing teams-claude-bot Project Analysis](#5-existing-teams-claude-bot-project-analysis)
6. [Composio MS Teams MCP Server](#6-composio-ms-teams-mcp-server)
7. [Azure Bot Service and Dev Tunnels](#7-azure-bot-service-and-dev-tunnels)
8. [Teams Adaptive Cards for Code Rendering](#8-teams-adaptive-cards-for-code-rendering)
9. [Proactive Messaging Patterns](#9-proactive-messaging-patterns)
10. [Authentication: Azure AD vs Personal Tokens](#10-authentication-azure-ad-vs-personal-tokens)
11. [Security Considerations](#11-security-considerations)
12. [Key Recommendations](#12-key-recommendations)

---

## 1. Executive Summary

Building a bidirectional Claude Code <-> Microsoft Teams plugin in 2026 benefits from a mature ecosystem. The Microsoft Teams SDK v2 (formerly Teams AI Library) now has native MCP and Agent-to-Agent (A2A) protocol support, while the Claude Agent SDK provides a robust TypeScript API for programmatic session management. An existing open-source project (`teams-claude-bot` by Marvae) demonstrates the feasibility of this integration and provides architectural lessons. The official Claude M365 Connector covers enterprise read-only scenarios but does not provide the developer-focused bidirectional coding assistant experience this project targets. Microsoft Copilot Cowork (launched March 2026) integrates Claude at the platform level but only for Microsoft 365 workflows, not for local Claude Code sessions.

The recommended architecture uses the Teams SDK v2 `App` class with `McpPlugin` for the Teams side, Claude Agent SDK streaming input mode for Claude Code interaction, and Adaptive Cards with `CodeBlock` elements for rich code display. Authentication should support both Azure AD (for org deployments) and a simplified personal token flow (for individual developers).

---

## 2. Microsoft Teams SDK v2 with MCP Support

### Overview

The Microsoft Teams SDK (formerly Teams AI Library) is now the primary SDK for building Teams agents. It is GA for JavaScript/TypeScript and C#, with Python in developer preview. The SDK replaces the deprecated Bot Framework SDK (botbuilder v4) with a cleaner, plugin-based architecture.

**Key packages:**
- `@microsoft/teams.apps` - Core App class and plugin system
- `@microsoft/teams.mcp` - MCP server plugin
- `@microsoft/teams.dev` - DevTools plugin (development only)
- `@microsoft/teams.api` - Activity types and API models
- `@microsoft/teams.common` - Shared utilities and logging

### Bot Architecture: The App Class

The `App` class is the main entry point. It handles server hosting, request routing, authentication, and plugin management.

```typescript
import { App } from '@microsoft/teams.apps';
import { DevtoolsPlugin } from '@microsoft/teams.dev';

const app = new App({
  plugins: [new DevtoolsPlugin()],
});

// Handle incoming messages
app.on('message', async ({ send, activity }) => {
  await send({ type: 'typing' });
  await send(`you said "${activity.text}"`);
});

// Start the app
await app.start();
```

**Core components:**
1. **Plugins** - Front-end (server setup, message handling) and back-end (activity hooks, proactive scenarios)
2. **Events** - Listens to core plugin events, emits to the application
3. **Activity Routing** - Routes activities to appropriate handlers
4. **Auth** - Handles bot-to-Teams authentication and user auth
5. **Utilities** - Convenience functions (replies, proactive messages)

### MCP Server Plugin

The `McpPlugin` converts any Teams `App` into an MCP server, exposing tools, resources, and prompts to MCP clients. This is significant because it means Claude Code could potentially call Teams as an MCP server.

```typescript
import { z } from 'zod';
import { App } from '@microsoft/teams.apps';
import { McpPlugin } from '@microsoft/teams.mcp';

const mcpServerPlugin = new McpPlugin({
  name: 'teams-claude-bridge',
  description: 'Bridge between Claude Code and Teams',
}).tool(
  'sendToUser',
  'Send a message to a Teams user',
  {
    message: z.string().describe('the message to send'),
    userId: z.string().describe('the user AAD object ID'),
  },
  { readOnlyHint: false },
  async ({ message, userId }) => {
    const conversationId = userConversationMap.get(userId);
    if (!conversationId) {
      return { content: [{ type: 'text', text: 'User not found' }] };
    }
    await app.send(conversationId, message);
    return { content: [{ type: 'text', text: 'Message sent' }] };
  }
);

const app = new App({
  plugins: [mcpServerPlugin],
});
```

The MCP server endpoint defaults to `/mcp` and supports the Streamable HTTP transport. The `transport.path` property can customize this.

### Activity Handlers

The SDK provides typed activity handlers:

```typescript
// Message handler
app.on('message', async ({ send, activity }) => { ... });

// Install handler - good for capturing conversation IDs
app.on('install.add', async ({ activity, send }) => {
  conversationStore.set(activity.from.aadObjectId!, activity.conversation.id);
});

// Card action handler
app.on('card.action', async ({ activity, send }) => { ... });
```

### Agent-to-Agent (A2A) Protocol

The SDK also supports A2A, allowing Teams agents to discover and communicate with each other. This could enable a scenario where a Teams bot acts as an A2A server that Claude Code (as an A2A client) can communicate with.

**References:**
- [Teams SDK Documentation](https://learn.microsoft.com/en-us/microsoftteams/platform/teams-sdk/)
- [Teams SDK GitHub](https://github.com/microsoft/teams-sdk)
- [MCP Server Guide](https://learn.microsoft.com/en-us/microsoftteams/platform/teams-sdk/in-depth-guides/ai/mcp/mcp-server)
- [Teams SDK Announcement](https://devblogs.microsoft.com/microsoft365dev/announcing-the-updated-teams-ai-library-and-mcp-support/)

---

## 3. Claude Agent SDK (TypeScript)

### Overview

The Claude Agent SDK gives programmatic access to the same tools, agent loop, and context management that power Claude Code. It was renamed from "Claude Code SDK" in September 2025.

**Installation:**
```bash
npm install @anthropic-ai/claude-agent-sdk
```

### The `query()` Function

The primary API for interacting with Claude Code:

```typescript
function query({
  prompt,
  options
}: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query;
```

- `prompt`: A string for single-shot mode, or an `AsyncIterable<SDKUserMessage>` for streaming input mode
- `options`: Configuration for tools, permissions, session management, MCP servers, etc.

### Key Options

| Option | Type | Description |
|--------|------|-------------|
| `allowedTools` | `string[]` | Tools to auto-approve (e.g., `["Read", "Write", "Edit", "Bash"]`) |
| `disallowedTools` | `string[]` | Tools to always deny (overrides allowedTools) |
| `permissionMode` | `PermissionMode` | `'default'`, `'acceptEdits'`, `'bypassPermissions'`, `'plan'`, `'dontAsk'` |
| `allowDangerouslySkipPermissions` | `boolean` | Required when using `bypassPermissions` |
| `cwd` | `string` | Working directory for Claude Code |
| `maxTurns` | `number` | Max agentic turns (tool-use round trips) |
| `maxBudgetUsd` | `number` | Maximum budget in USD |
| `model` | `string` | Claude model to use |
| `resume` | `string` | Session ID to resume |
| `continue` | `boolean` | Continue most recent session |
| `forkSession` | `boolean` | Fork to new session ID when resuming |
| `includePartialMessages` | `boolean` | Include streaming partial messages |
| `systemPrompt` | `string \| { type: 'preset', preset: 'claude_code', append?: string }` | Custom or preset system prompt |
| `mcpServers` | `Record<string, McpServerConfig>` | MCP server configurations |
| `hooks` | `Record<HookEvent, HookCallbackMatcher[]>` | Hook callbacks for lifecycle events |
| `tools` | `string[] \| { type: 'preset', preset: 'claude_code' }` | Tool configuration |
| `settingSources` | `SettingSource[]` | Which settings files to load (`'user'`, `'project'`, `'local'`) |
| `agents` | `Record<string, AgentDefinition>` | Programmatic subagent definitions |

### Query Object Methods

The `Query` object extends `AsyncGenerator<SDKMessage, void>` with additional methods:

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setModel(model?: string): Promise<void>;
  initializationResult(): Promise<SDKControlInitializeResponse>;
  supportedCommands(): Promise<SlashCommand[]>;
  supportedModels(): Promise<ModelInfo[]>;
  mcpServerStatus(): Promise<McpServerStatus[]>;
  streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>;
  close(): void;
}
```

### Streaming Input Mode (Recommended for Teams Integration)

Streaming input mode enables persistent, interactive sessions - exactly what is needed for a Teams bot where users send messages over time:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

async function* generateMessages() {
  // First message from Teams user
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: "Analyze this codebase for security issues"
    }
  };

  // Wait for next user message from Teams
  const nextMessage = await waitForTeamsMessage();

  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: nextMessage
    }
  };
}

for await (const message of query({
  prompt: generateMessages(),
  options: {
    maxTurns: 10,
    allowedTools: ["Read", "Grep", "Glob", "Write", "Edit", "Bash"],
    includePartialMessages: true,
  }
})) {
  if (message.type === "assistant") {
    // Forward to Teams
    await sendToTeams(message);
  }
  if (message.type === "result") {
    await sendResultToTeams(message);
  }
}
```

### V2 Interface (Preview)

A simplified V2 interface is available that removes the need for async generators:

```typescript
import { unstable_v2_createSession } from "@anthropic-ai/claude-agent-sdk";

const session = unstable_v2_createSession({
  model: "claude-sonnet-4-20250514",
  allowedTools: ["Read", "Write", "Edit"],
});

// Each turn is a separate send()/stream() cycle
const response1 = await session.send("Analyze this codebase");
const response2 = await session.send("Now fix the bugs you found");
```

This V2 API maps more naturally to a Teams bot where each message from the user is a separate turn.

### Session Management

```typescript
import { listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";

// List recent sessions
const sessions = await listSessions({ dir: "/path/to/project", limit: 10 });

// Resume a specific session
const resumed = query({
  prompt: "Continue with the refactoring",
  options: { resume: sessions[0].sessionId }
});

// Fork a session (for handoff scenarios)
const forked = query({
  prompt: "Let's continue this in a new branch",
  options: { resume: sessionId, forkSession: true }
});

// Get session messages for display
const messages = await getSessionMessages(sessionId, {
  dir: "/path/to/project",
  limit: 20
});
```

### Message Types

The SDK yields typed messages through the async generator:

| Type | Description |
|------|-------------|
| `SDKAssistantMessage` | Claude's response with `BetaMessage` content |
| `SDKUserMessage` | User input |
| `SDKResultMessage` | Final result with cost, usage, duration |
| `SDKSystemMessage` | Init message with tools, models, session info |
| `SDKPartialAssistantMessage` | Streaming partial (when `includePartialMessages: true`) |
| `SDKToolUseSummaryMessage` | Tool use summary |
| `SDKStatusMessage` | Status updates |
| `SDKTaskNotificationMessage` | Background task notifications |

### Custom Permission Handling (for Teams UI)

```typescript
const q = query({
  prompt: generateMessages(),
  options: {
    canUseTool: async (toolName, input, { signal, suggestions }) => {
      // Show permission card in Teams and wait for user response
      const approved = await showPermissionCardInTeams(toolName, input);
      if (approved) {
        return { behavior: "allow" };
      }
      return { behavior: "deny", message: "User denied in Teams" };
    }
  }
});
```

### Hook Events

Available hooks for intercepting agent lifecycle:

`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PermissionRequest`, `Setup`, `TeammateIdle`, `TaskCompleted`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`

**References:**
- [Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [TypeScript API Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [V2 Preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview)
- [Session Management](https://platform.claude.com/docs/en/agent-sdk/sessions)
- [Streaming Input Mode](https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)
- [GitHub Repository](https://github.com/anthropics/claude-agent-sdk-typescript)

---

## 4. Claude Code Headless Mode and Hooks System

### Headless Mode (`-p` flag)

Claude Code's headless mode runs non-interactively, making it scriptable:

```bash
# Simple one-shot
claude -p "Explain the auth module" --output-format json

# With specific tools and model
claude -p "Review this PR" --allowedTools Read,Grep --model claude-sonnet-4-20250514

# Stream JSON output
claude -p "Fix the test failures" --output-format stream-json
```

Output formats:
- `text` (default): Plain text to stdout
- `json`: Structured JSON with result, cost, session info
- `stream-json`: Newline-delimited JSON for each message

### Hooks System

Hooks are shell commands or SDK callbacks that execute at specific lifecycle points. The system exposes 17+ distinct lifecycle events.

**Key hooks for Teams integration:**

1. **`Notification`** - Fires when Claude wants to notify the user. Perfect for forwarding notifications to Teams:
   ```json
   {
     "hooks": {
       "Notification": [{
         "command": "curl -X POST http://localhost:3000/teams-notify -d '{\"message\": \"$NOTIFICATION\"}'",
         "matcher": "*"
       }]
     }
   }
   ```

2. **`PostToolUse`** - Fires after tool execution. Can forward tool results (file edits, bash output) to Teams.

3. **`SessionEnd`** - Fires when a session completes. Can send a summary to Teams.

4. **`Stop`** - Fires when Claude stops. Can notify Teams that the session ended.

### Using Hooks with the SDK

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

const q = query({
  prompt: generateMessages(),
  options: {
    hooks: {
      Notification: [{
        matcher: "*",
        callback: async (input) => {
          // Forward notification to Teams
          await sendToTeams(input.notification);
          return {};
        }
      }],
      PostToolUse: [{
        matcher: "Write|Edit",
        callback: async (input) => {
          // Send file change notification to Teams
          await sendFileChangeCard(input.toolName, input.toolInput);
          return {};
        }
      }],
      SessionEnd: [{
        matcher: "*",
        callback: async (input) => {
          await sendSessionSummaryToTeams(input);
          return {};
        }
      }]
    }
  }
});
```

### MCP Tool Matching in Hooks

Hooks can match MCP tool calls using the pattern `mcp__<server>__<tool>`:

```typescript
hooks: {
  PreToolUse: [{
    matcher: "mcp__teams__sendMessage",
    callback: async (input) => {
      // Intercept before sending a Teams message
      return {};
    }
  }]
}
```

**References:**
- [Claude Code Headless Mode](https://code.claude.com/docs/en/headless)
- [Claude Code Hooks Guide 2026](https://serenitiesai.com/articles/claude-code-hooks-guide-2026)
- [Claude Code Security](https://code.claude.com/docs/en/security)

---

## 5. Existing teams-claude-bot Project Analysis

### Architecture

The [teams-claude-bot](https://github.com/Marvae/teams-claude-bot) by Marvae is the most complete existing solution:

```
Teams (any device)
  -> Bot Framework SDK (botbuilder v4)
    -> Express server
      -> Claude Agent SDK (streaming input mode)
        -> Claude Code (local machine)
```

**Tech stack:**
- TypeScript (strict mode, ESM)
- Node.js 22+
- esbuild (single-file output)
- vitest (testing)
- botbuilder v4 (Bot Framework SDK)
- Claude Agent SDK

### Features

| Feature | Implementation |
|---------|---------------|
| Full Claude Code tools | Read, Write, Edit, Bash |
| Real-time streaming | Live text, diffs, todo tracking |
| Media handling | Image & file uploads, drag-and-drop |
| Session management | Long-lived sessions with auto-resume |
| Handoff | Terminal <-> Teams bidirectional switching |
| Permission modes | Dynamic controls via Adaptive Cards |
| Access control | Azure AD whitelist, rate limiting |

### Command System

- `/new` - New session
- `/stop` - Stop current session
- `/project <path>` - Change working directory
- `/model [name]` - Switch model
- `/permission [mode]` - Change permission mode
- `/sessions` - List sessions
- `/handoff` - Bidirectional session transfer
- `/status` - Current session info
- `/help` - Command list

Non-command messages are forwarded to Claude Code as prompts.

### Handoff System

The handoff feature is particularly noteworthy:
1. User runs `/handoff` in any Claude Code terminal session
2. Current session state is sent to Teams
3. A confirmation Adaptive Card appears in Teams
4. User accepts and forks the session
5. Both sides continue independently on the same codebase

### Setup and Management

```bash
teams-bot setup          # Interactive config, generates manifest zip
teams-bot install         # Install as background service
teams-bot start/stop      # Manage the service
teams-bot install-skill   # Install handoff skill
```

### Lessons Learned & Limitations

**What works well:**
- Streaming input mode for long-lived sessions
- Adaptive Cards for permission prompts and diffs
- Session forking for handoff scenarios
- Single esbuild bundle for easy deployment

**Limitations and areas for improvement:**
1. **Uses deprecated botbuilder v4** - Should migrate to Teams SDK v2
2. **No MCP integration** - Could expose Teams as an MCP server for Claude
3. **No A2A support** - Missing agent-to-agent protocol
4. **Requires Node.js 22+** - High minimum version
5. **Azure account required** - No personal token alternative documented
6. **No code syntax highlighting** - Uses plain text instead of CodeBlock Adaptive Cards

**References:**
- [teams-claude-bot GitHub](https://github.com/Marvae/teams-claude-bot)
- [Azure Bot Setup Guide](https://github.com/Marvae/teams-claude-bot/blob/main/docs/azure-bot-setup.md)

---

## 6. Composio MS Teams MCP Server

### Overview

Composio provides a hosted MCP server for Microsoft Teams integration. However, it works in the **reverse direction** from what cc-ms-teams needs: it lets Claude act on Teams (send messages, manage channels), rather than letting Teams users chat with Claude Code.

### Capabilities

- Retrieve, read, and summarize messages from any Teams chat
- Create new teams, add members, get channel details
- Archive and delete teams
- Schedule standalone Microsoft Teams online meetings
- Fetch all chats you're part of

### Limitations

1. **Deprecation notice** - Composio MCP will be deprecated soon
2. **Reverse direction** - Claude controls Teams, not Teams controls Claude
3. **Hosted service** - Runs in Composio's cloud, not locally
4. **Fixed tool set** - Cannot dynamically load custom tools without the Tool Router
5. **No bidirectional chat** - One-way automation only

### Relevance to cc-ms-teams

Composio's approach is not directly usable for cc-ms-teams but provides insight into what Teams MCP tools look like:

```json
{
  "tools": [
    "MSTEAMS_SEND_MESSAGE_IN_CHAT",
    "MSTEAMS_LIST_ALL_CHATS",
    "MSTEAMS_GET_ALL_MESSAGES_OF_A_CHAT",
    "MSTEAMS_CREATE_A_NEW_TEAM",
    "MSTEAMS_ADD_MEMBER_TO_TEAM",
    "MSTEAMS_CREATE_AN_ONLINE_MEETING"
  ]
}
```

A cc-ms-teams plugin could optionally expose similar tools as a local MCP server that Claude Code can call to interact with Teams.

**References:**
- [Composio Teams MCP](https://mcp.composio.dev/microsoft_teams)
- [Composio Teams Toolkit](https://composio.dev/toolkits/microsoft_teams)

---

## 7. Azure Bot Service and Dev Tunnels

### Azure Bot Service Registration

Every Teams bot requires an Azure Bot Service registration, which provides:
- Bot App ID and secret (for authentication)
- Messaging endpoint URL
- Teams channel configuration

**Important deprecation:** Multi-tenant bot creation will be deprecated after July 31, 2025. New bots should use single-tenant or managed identity.

### Registration Steps

1. **Create Azure Bot resource** in Azure Portal or via CLI
2. **Configure messaging endpoint**: `https://<your-domain>/api/messages`
3. **Enable Teams channel** in the bot's Channels settings
4. **Create app manifest** with the bot ID

### Dev Tunnels for Local Development

Microsoft Dev Tunnels provide persistent URLs for local development:

```bash
# Install dev tunnels CLI
winget install Microsoft.devtunnel

# Create a persistent tunnel
devtunnel create --allow-anonymous
devtunnel port create -p 3978

# Start the tunnel
devtunnel host
```

The tunnel URL format: `https://<tunnel-id>.devtunnels.ms`

**Configuration with Teams Toolkit:**
```json
{
  "type": "dev-tunnel",
  "ports": [{
    "portNumber": 3978,
    "protocol": "http",
    "access": "public"
  }],
  "env": {
    "BOT_ENDPOINT": "$TUNNEL_URL",
    "BOT_DOMAIN": "$TUNNEL_DOMAIN"
  }
}
```

### Message Flow Architecture

```
User in Teams
  -> Teams Service (cloud)
    -> Azure Bot Service (cloud)
      -> Dev Tunnel (HTTPS)
        -> Local Express/Teams SDK server (localhost:3978)
          -> Claude Agent SDK
            -> Claude Code (local)
```

### App Manifest Configuration

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/teams/v1.17/MicrosoftTeams.schema.json",
  "version": "1.0.0",
  "id": "<bot-app-id>",
  "name": { "short": "Claude Code", "full": "Claude Code Teams Bot" },
  "description": {
    "short": "Chat with Claude Code from Teams",
    "full": "Bidirectional chat plugin for Claude Code sessions"
  },
  "bots": [{
    "botId": "<bot-app-id>",
    "scopes": ["personal", "team", "groupChat"],
    "supportsFiles": true,
    "commandLists": [{
      "scopes": ["personal"],
      "commands": [
        { "title": "new", "description": "Start a new session" },
        { "title": "project", "description": "Set project directory" },
        { "title": "sessions", "description": "List sessions" },
        { "title": "handoff", "description": "Accept a handoff" }
      ]
    }]
  }],
  "validDomains": ["<tunnel-id>.devtunnels.ms"],
  "permissions": ["identity", "messageTeamMembers"]
}
```

### Teams SDK v2 App Authentication Setup

```typescript
import { App } from '@microsoft/teams.apps';

const app = new App({
  // Authentication is handled automatically by the SDK
  // when environment variables are set:
  // - BOT_ID (or MICROSOFT_APP_ID)
  // - BOT_PASSWORD (or MICROSOFT_APP_PASSWORD)
  // - BOT_TENANT_ID (for single-tenant bots)
});
```

**References:**
- [Azure Bot Service Architecture](https://moimhossain.com/2025/05/22/azure-bot-service-microsoft-teams-architecture-and-message-flow/)
- [Test and Debug Locally](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/debug/locally-with-an-ide)
- [Register Bot with Azure](https://learn.microsoft.com/en-us/azure/bot-service/bot-service-quickstart-registration)
- [Configure Bot Capability](https://learn.microsoft.com/en-us/microsoftteams/platform/toolkit/configure-bot-capability)

---

## 8. Teams Adaptive Cards for Code Rendering

### CodeBlock Element

The `CodeBlock` element is the primary mechanism for rendering code with syntax highlighting in Teams:

```json
{
  "$schema": "https://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "src/auth/handler.ts",
      "style": "heading"
    },
    {
      "type": "TextBlock",
      "text": "Lines 42 - 58"
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
      "url": "vscode://file/path/to/file:42"
    }
  ]
}
```

### Supported Languages

Bash, C, C++, C#, CSS, DOS, Go, GraphQL, HTML, Java, JavaScript, JSON, Perl, PHP, PowerShell, Python, SQL, TypeScript, Visual Basic, Verilog, VHDL, XML, PlainText

### CodeBlock Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `codeSnippet` | String | Yes | The code to display |
| `language` | Enum | Yes | Programming language for highlighting |
| `startLineNumber` | Number | No | Starting line number (defaults to 1) |

### Limitations

- Supported only in Teams web and desktop clients (not mobile)
- Code is read-only (not editable)
- Only first 10 lines visible by default (user must expand)
- Special characters like `\n` must be properly escaped

### Diff Display Pattern

There is no native diff element in Adaptive Cards. Recommended approach for showing diffs:

```json
{
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "File Changed: src/config.ts",
      "style": "heading",
      "color": "attention"
    },
    {
      "type": "ColumnSet",
      "columns": [
        {
          "type": "Column",
          "width": "stretch",
          "items": [{
            "type": "TextBlock",
            "text": "Before",
            "weight": "bolder"
          }, {
            "type": "CodeBlock",
            "codeSnippet": "const port = 3000;",
            "language": "TypeScript",
            "startLineNumber": 5
          }]
        },
        {
          "type": "Column",
          "width": "stretch",
          "items": [{
            "type": "TextBlock",
            "text": "After",
            "weight": "bolder"
          }, {
            "type": "CodeBlock",
            "codeSnippet": "const port = process.env.PORT || 3000;",
            "language": "TypeScript",
            "startLineNumber": 5
          }]
        }
      ]
    },
    {
      "type": "ActionSet",
      "actions": [
        {
          "type": "Action.Submit",
          "title": "Approve",
          "data": { "action": "approve_edit", "fileId": "abc123" }
        },
        {
          "type": "Action.Submit",
          "title": "Reject",
          "data": { "action": "reject_edit", "fileId": "abc123" }
        }
      ]
    }
  ]
}
```

### Unified Diff Alternative

For longer diffs, use a single CodeBlock with unified diff format:

```json
{
  "type": "CodeBlock",
  "codeSnippet": "--- a/src/config.ts\n+++ b/src/config.ts\n@@ -5,3 +5,3 @@\n-const port = 3000;\n+const port = process.env.PORT || 3000;\n const host = 'localhost';",
  "language": "PlainText"
}
```

### File Sharing via Cards

For file upload results, use Adaptive Cards with download actions:

```json
{
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "File Created",
      "style": "heading"
    },
    {
      "type": "FactSet",
      "facts": [
        { "title": "Name", "value": "report.pdf" },
        { "title": "Size", "value": "2.4 MB" },
        { "title": "Path", "value": "/home/user/project/output/report.pdf" }
      ]
    }
  ],
  "actions": [
    {
      "type": "Action.OpenUrl",
      "title": "Open in Explorer",
      "url": "file:///home/user/project/output/"
    }
  ]
}
```

**References:**
- [Format Text in Cards](https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/cards-format)
- [Adaptive Cards Overview](https://learn.microsoft.com/en-us/adaptive-cards/)
- [CodeBlock Discussion](https://github.com/microsoft/AdaptiveCards/discussions/8081)

---

## 9. Proactive Messaging Patterns

### Overview

Proactive messaging is critical for cc-ms-teams because Claude Code outputs (results, file changes, notifications) arrive asynchronously and must be pushed to Teams without the user sending a message first.

### Teams SDK v2 Pattern

```typescript
import { MessageActivity } from '@microsoft/teams.api';
import { App } from '@microsoft/teams.apps';

const app = new App({ plugins: [...] });

// Store conversation IDs from any activity
const conversationStore = new Map<string, string>();

app.on('message', async ({ activity, send }) => {
  // Store conversation ID on every message
  if (activity.from.aadObjectId) {
    conversationStore.set(activity.from.aadObjectId, activity.conversation.id);
  }
  // ... handle message
});

app.on('install.add', async ({ activity }) => {
  // Also capture on install
  conversationStore.set(activity.from.aadObjectId!, activity.conversation.id);
});

// Proactive send function
async function sendToUser(userId: string, content: string | object) {
  const conversationId = conversationStore.get(userId);
  if (!conversationId) return;

  if (typeof content === 'string') {
    await app.send(conversationId, new MessageActivity(content));
  } else {
    // Send Adaptive Card
    await app.send(conversationId, content);
  }
}
```

### Targeted Messages (Preview)

Targeted messages are visible only to a specific user in a group chat:

```typescript
import { MessageActivity, Account } from '@microsoft/teams.api';

async function sendPrivateNotification(
  conversationId: string,
  recipient: Account,
  message: string
) {
  await app.send(
    conversationId,
    new MessageActivity(message).withRecipient(recipient, true)
  );
}
```

### Claude Code Output Forwarding Pattern

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Process Claude Code messages and forward to Teams
for await (const message of claudeQuery) {
  switch (message.type) {
    case "assistant": {
      // Extract text content from assistant message
      const textBlocks = message.message.content
        .filter(b => b.type === "text")
        .map(b => b.text);
      if (textBlocks.length > 0) {
        await sendToUser(userId, textBlocks.join("\n"));
      }

      // Handle tool use blocks (file edits, bash commands)
      const toolUseBlocks = message.message.content
        .filter(b => b.type === "tool_use");
      for (const block of toolUseBlocks) {
        await sendToolUseCard(userId, block);
      }
      break;
    }

    case "result": {
      // Send completion summary
      await sendResultCard(userId, {
        duration: message.duration_ms,
        cost: message.total_cost_usd,
        turns: message.num_turns,
        result: message.subtype === "success" ? message.result : "Error"
      });
      break;
    }

    case "stream_event": {
      // For real-time streaming, batch and send periodically
      streamBuffer.append(message);
      if (shouldFlush(streamBuffer)) {
        await sendToUser(userId, streamBuffer.flush());
      }
      break;
    }
  }
}
```

### Best Practices

1. **Batch streaming updates** - Don't send every partial token; batch into meaningful chunks
2. **Use typing indicators** - Send `{ type: 'typing' }` while Claude is thinking
3. **Rate limit** - Teams has rate limits on bot messages; queue and throttle
4. **Conversation ID persistence** - Store conversation IDs in persistent storage (not just in-memory)
5. **Error handling** - Handle `403` errors when a user has removed the bot

**References:**
- [Proactive Messaging (Teams SDK v2)](https://learn.microsoft.com/en-us/microsoftteams/platform/teams-sdk/essentials/sending-messages/proactive-messaging)
- [Send Proactive Messages (legacy)](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/conversations/send-proactive-messages)

---

## 10. Authentication: Azure AD vs Personal Tokens

### Option 1: Azure AD App Registration (Recommended for Organizations)

This is the standard approach for Teams bots and provides full SSO, managed identity, and enterprise compliance.

#### Setup Steps

1. **Register application in Microsoft Entra ID (Azure AD)**
   - Go to Azure Portal > App registrations > New registration
   - Set redirect URI to `https://token.botframework.com/.auth/web/redirect`
   - Note the Application (client) ID and Directory (tenant) ID

2. **Create client secret**
   - Go to Certificates & secrets > New client secret
   - Store securely (Azure Key Vault recommended)

3. **Configure API permissions**
   - `User.Read` (delegated) for user profile
   - `ChatMessage.Send` (application) if needed
   - `Files.ReadWrite` (delegated) for file uploads

4. **Create Azure Bot resource**
   - Link to the app registration
   - Set messaging endpoint
   - Enable Teams channel

5. **Configure Teams SDK App**
   ```typescript
   // Environment variables
   // BOT_ID=<app-registration-client-id>
   // BOT_PASSWORD=<client-secret>
   // BOT_TENANT_ID=<tenant-id>  (for single-tenant)

   const app = new App({
     // Auth is auto-configured from env vars
   });
   ```

#### SSO Support

The Teams SDK v2 supports SSO setup:
- Register bot in Entra ID with `api://botid-<bot-id>` as Application ID URI
- Expose the `access_as_user` scope
- Pre-authorize Teams client IDs

#### Access Control

```typescript
// Whitelist specific users by AAD Object ID
const ALLOWED_USERS = new Set([
  'aad-object-id-1',
  'aad-object-id-2',
]);

app.on('message', async ({ activity, send }) => {
  if (!ALLOWED_USERS.has(activity.from.aadObjectId!)) {
    await send('You are not authorized to use this bot.');
    return;
  }
  // ... proceed
});
```

### Option 2: Personal Token Approach (Simpler for Individual Developers)

For individual developers who want to avoid the full Azure AD setup, a personal token approach can be implemented alongside the bot registration.

#### Approach: Bot with Shared Secret

Since Teams bots fundamentally require Azure Bot Service registration, the "personal token" approach simplifies the _Claude Code side_ rather than the Teams side:

1. **Minimal Azure setup**: Single-tenant bot registration (free tier)
2. **Local config file**: Store bot credentials locally
   ```json
   {
     "botId": "<bot-app-id>",
     "botPassword": "<bot-secret>",
     "tenantId": "<your-tenant-id>",
     "claudeApiKey": "<anthropic-api-key>",
     "allowedUsers": ["your-aad-object-id"]
   }
   ```

3. **Interactive setup wizard** (like teams-claude-bot):
   ```bash
   cc-ms-teams setup
   # Walks through:
   # 1. Azure Bot registration (with links to portal)
   # 2. Dev tunnel configuration
   # 3. Claude API key
   # 4. Teams app manifest generation
   ```

#### Approach: Webhook-Only (No Azure Bot Service)

For the simplest possible setup, use Teams Incoming/Outgoing Webhooks:

**Outgoing Webhook** (Teams -> Claude Code):
- No Azure registration needed
- Configure in Teams channel settings
- Limited to channels (not personal chat)
- No Adaptive Cards support
- HMAC-SHA256 validation with shared secret

**Incoming Webhook** (Claude Code -> Teams):
- Simple POST to a webhook URL
- Supports Adaptive Cards
- No proactive messaging limitations
- No user context (one-way)

```typescript
// Outgoing webhook handler (receives from Teams)
app.post('/api/webhook', async (req, res) => {
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  hmac.update(JSON.stringify(req.body));
  const expected = hmac.digest('base64');

  if (req.headers['authorization'] !== `HMAC ${expected}`) {
    return res.status(401).send('Unauthorized');
  }

  const userMessage = req.body.text;
  // Forward to Claude Code...
  res.json({ type: 'message', text: 'Processing...' });
});

// Incoming webhook sender (sends to Teams)
async function sendViaWebhook(webhookUrl: string, card: object) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: card
      }]
    })
  });
}
```

**Limitations of webhook-only approach:**
- No personal 1:1 chat (channel only)
- No session management
- No file upload handling
- No rich permission dialogs
- Limited to text responses (outgoing) or cards (incoming)

### Recommendation

Use Azure AD app registration as the primary path. Provide an interactive setup wizard that automates as much as possible. Document the webhook-only approach as a "quick start" alternative for evaluation.

**References:**
- [OAuth 2.0 Bot Authentication](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/authentication/add-authentication)
- [Bot SSO Register AAD](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/authentication/bot-sso-register-aad)
- [SSO Setup (Teams SDK v2)](https://learn.microsoft.com/en-us/microsoftteams/platform/teams-sdk/teams/user-authentication/sso-setup)
- [App Authentication Setup](https://learn.microsoft.com/en-us/microsoftteams/platform/teams-sdk/teams/app-authentication/overview)

---

## 11. Security Considerations

### Threat Model

Exposing Claude Code via Teams creates a remote execution interface on the developer's machine. Key threats:

1. **Unauthorized access** - Anyone with bot access can execute code on the machine
2. **Configuration file attacks** - Malicious `.claude/settings.json` or `.mcp.json` in repositories
3. **API key theft** - Intercepting Anthropic API communications
4. **Prompt injection** - Malicious content in Teams messages triggering unintended tool use
5. **Data exfiltration** - Claude Code reading sensitive files and sending content to Teams

### Known CVEs

- **CVE-2025-59536**: Repository configuration files (`.claude/settings.json`, `.mcp.json`) could execute arbitrary code before the user sees a trust dialog. Hooks in these files execute shell commands on every collaborator's machine.
- Claude Code Remote Control session hijacking: If an attacker compromises your Anthropic account, they can connect to active sessions and execute commands.

### Mitigation Strategies

#### 1. Access Control
```typescript
// Strict user whitelist
const ALLOWED_USERS = new Set(config.allowedUsers);
const ALLOWED_TENANTS = new Set(config.allowedTenants);

app.on('message', async ({ activity, send }) => {
  const userId = activity.from.aadObjectId;
  const tenantId = activity.conversation.tenantId;

  if (!ALLOWED_TENANTS.has(tenantId) || !ALLOWED_USERS.has(userId)) {
    await send('Unauthorized. Contact the bot admin.');
    return;
  }
});
```

#### 2. Tool Restrictions
```typescript
// Limit Claude Code tools based on context
const SAFE_TOOLS = ["Read", "Grep", "Glob"]; // Read-only
const EDIT_TOOLS = ["Read", "Grep", "Glob", "Write", "Edit"]; // Edit
const FULL_TOOLS = ["Read", "Grep", "Glob", "Write", "Edit", "Bash"]; // Full

// Use canUseTool for fine-grained control
options: {
  canUseTool: async (toolName, input) => {
    if (toolName === "Bash" && !isAdminUser(currentUser)) {
      return { behavior: "deny", message: "Bash not allowed for this user" };
    }
    if (toolName === "Write" && isSensitivePath(input.file_path)) {
      return { behavior: "deny", message: "Cannot write to sensitive paths" };
    }
    return { behavior: "allow" };
  }
}
```

#### 3. Sandbox Configuration
```typescript
options: {
  sandbox: {
    enabled: true,
    allowedPaths: ["/home/user/projects/*"],
    deniedPaths: ["~/.ssh", "~/.aws", "~/.claude"],
    networkPolicy: "restricted" // Limit outbound network
  }
}
```

#### 4. Rate Limiting
```typescript
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_MINUTE = 10;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(userId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= MAX_REQUESTS_PER_MINUTE) return false;
  entry.count++;
  return true;
}
```

#### 5. Audit Logging
```typescript
// Log all interactions for audit
function logInteraction(userId: string, action: string, details: object) {
  const entry = {
    timestamp: new Date().toISOString(),
    userId,
    action,
    details,
    sessionId: currentSessionId,
  };
  fs.appendFileSync('audit.jsonl', JSON.stringify(entry) + '\n');
}
```

#### 6. Human-in-the-Loop for Destructive Operations

Always require approval for:
- `Bash` commands (arbitrary code execution)
- `Write` to files outside the project directory
- Any operation touching `.env`, credentials, or SSH keys
- Git push operations

#### 7. Dev Tunnel Security

- Use authenticated dev tunnels (not anonymous)
- Rotate tunnel URLs periodically
- Monitor tunnel access logs
- Consider IP allowlisting if possible

**References:**
- [Claude Code Security](https://code.claude.com/docs/en/security)
- [Claude Code Remote Control Security Risks](https://www.penligent.ai/hackinglabs/claude-code-remote-control-security-risks-when-a-local-session-becomes-a-remote-execution-interface/)
- [Securing Claude Cowork](https://www.harmonic.security/resources/securing-claude-cowork-a-security-practitioners-guide)
- [Claude Code CVEs](https://www.theregister.com/2026/02/26/clade_code_cves/)

---

## 12. Key Recommendations

### Architecture

1. **Use Teams SDK v2** (`@microsoft/teams.apps`), not the deprecated Bot Framework SDK (botbuilder v4). The Teams SDK v2 has native MCP support, cleaner plugin architecture, and better TypeScript types.

2. **Use Claude Agent SDK streaming input mode** for the Claude Code integration. The async generator pattern maps naturally to a Teams bot where messages arrive asynchronously over time.

3. **Consider the V2 session API (preview)** for simpler multi-turn management. The `send()`/`stream()` pattern avoids async generator complexity and is a better fit for request-response Teams interactions.

4. **Expose the bot as an MCP server** using `@microsoft/teams.mcp`. This enables Claude Code to proactively call Teams (send messages, ask questions) via MCP tools, creating a true bidirectional integration.

### Code Display

5. **Use Adaptive Cards with `CodeBlock` elements** for syntax-highlighted code. Support the 22 built-in languages. Fall back to `PlainText` for unsupported languages.

6. **Implement side-by-side diff display** using `ColumnSet` with two `CodeBlock` elements (before/after). For large diffs, use unified diff format in a single `CodeBlock`.

### Session Management

7. **Support session persistence and resumption** using the Claude Agent SDK's `resume` and `continue` options. Store session IDs mapped to Teams conversation IDs.

8. **Implement the handoff pattern** from teams-claude-bot: allow users to transfer sessions between terminal Claude Code and Teams.

### Authentication

9. **Primary: Azure AD app registration** with single-tenant configuration. Provide an interactive setup wizard (`cc-ms-teams setup`) that automates the process.

10. **Secondary: Document webhook-only approach** as a lightweight alternative for evaluation, acknowledging its limitations (channel-only, no personal chat, no file upload).

### Security

11. **Default to restrictive tool permissions** - Start with read-only tools (`Read`, `Grep`, `Glob`) and require explicit opt-in for write operations (`Write`, `Edit`, `Bash`).

12. **Implement user whitelist** by Azure AD Object ID. Do not allow open access by default.

13. **Use `canUseTool` callback** to surface permission requests as Adaptive Cards in Teams, maintaining human-in-the-loop control.

14. **Enable sandbox mode** and restrict file paths to the project directory. Block access to credential files (`.env`, `.ssh`, `.aws`).

15. **Implement audit logging** for all Claude Code interactions initiated from Teams.

### Development Experience

16. **Bundle with esbuild** for single-file deployment (following teams-claude-bot pattern).

17. **Provide CLI commands**: `setup`, `start`, `stop`, `status`, `logs`, `health`.

18. **Use dev tunnels** with persistent URLs for stable local development.

### Package Dependencies

Core packages needed:
```json
{
  "dependencies": {
    "@microsoft/teams.apps": "latest",
    "@microsoft/teams.api": "latest",
    "@microsoft/teams.mcp": "latest",
    "@anthropic-ai/claude-agent-sdk": "latest",
    "zod": "^3.23"
  },
  "devDependencies": {
    "@microsoft/teams.dev": "latest",
    "typescript": "^5.5",
    "esbuild": "^0.21",
    "vitest": "^2.0"
  }
}
```

---

## Appendix: Landscape Summary

| Solution | Direction | Status | Limitations |
|----------|-----------|--------|-------------|
| **cc-ms-teams** (this project) | Bidirectional | Planned | - |
| **teams-claude-bot** (Marvae) | Bidirectional | Active OSS | Uses deprecated botbuilder v4 |
| **Composio Teams MCP** | Claude -> Teams | Deprecating | One-way, hosted, no local sessions |
| **Claude M365 Connector** | Claude -> M365 | GA (Team/Enterprise) | Read-only, no Claude Code sessions |
| **Copilot Cowork** | M365 -> Claude | Preview (March 2026) | M365 workflows only, not Claude Code |
| **Teams SDK v2 MCP** | Any (framework) | GA | Framework, not a complete solution |

---

*Report generated for the cc-ms-teams project. All technical details verified against official documentation and source repositories as of March 2026.*
