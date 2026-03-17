# cc-ms-teams Architecture Design

## Bidirectional Claude Code <-> Microsoft Teams Chat Plugin

**Date:** 2026-03-17
**Version:** 1.0
**Status:** Design Complete

---

## Table of Contents

1. [High-Level System Architecture](#1-high-level-system-architecture)
2. [Component Inventory](#2-component-inventory)
3. [Data Flow Diagrams](#3-data-flow-diagrams)
4. [Technology Stack](#4-technology-stack)
5. [Deployment Topology](#5-deployment-topology)
6. [Error Handling and Reconnection](#6-error-handling-and-reconnection)
7. [Component Interaction Diagram](#7-component-interaction-diagram)
8. [Security Architecture](#8-security-architecture)
9. [Configuration and Environment](#9-configuration-and-environment)

---

## 1. High-Level System Architecture

```
+===========================================================================+
|                         CLOUD SERVICES                                    |
|                                                                           |
|  +------------------+     +--------------------+     +----------------+   |
|  | Microsoft Teams  |<--->| Azure Bot Service  |<--->| Dev Tunnel     |   |
|  | (Client)         |     | (Message Routing)  |     | (HTTPS Proxy)  |   |
|  +------------------+     +--------------------+     +-------+--------+   |
|                                                              |            |
+===========================================================================+
                                                               |
                                              HTTPS (TLS 1.3)  |
                                                               |
+===========================================================================+
|                     LOCAL MACHINE (Developer Workstation)                  |
|                                                               |           |
|  +------------------------------------------------------------v--------+ |
|  |                    TEAMS BOT SERVICE (Port 3978)                     | |
|  |  +------------------+  +------------------+  +-------------------+  | |
|  |  | Teams SDK v2 App |  | Activity Router  |  | Auth Middleware    |  | |
|  |  | (@ms/teams.apps) |  | (msg/card/file)  |  | (Azure AD + ACL)  |  | |
|  |  +--------+---------+  +--------+---------+  +-------------------+  | |
|  |           |                      |                                   | |
|  |  +--------v---------+  +--------v---------+                         | |
|  |  | McpPlugin        |  | Proactive Sender |                         | |
|  |  | (MCP Server)     |  | (app.send())     |                         | |
|  |  +------------------+  +------------------+                         | |
|  +---------------------+----------------------------+------------------+ |
|                         |                            |                    |
|  +----------------------v---+    +-------------------v-----------------+ |
|  |     MESSAGE BRIDGE       |    |    ADAPTIVE CARD RENDERER          | |
|  |                          |    |                                     | |
|  | +---------------------+  |    | +---------------+ +-------------+  | |
|  | | Teams->Claude XFORM |  |    | | Code Block    | | Diff Card   |  | |
|  | +---------------------+  |    | | Template      | | Template    |  | |
|  | | Claude->Teams XFORM |  |    | +---------------+ +-------------+  | |
|  | +---------------------+  |    | +---------------+ +-------------+  | |
|  | | Stream Batcher      |  |    | | Progress Card | | Error Card  |  | |
|  | +---------------------+  |    | | Template      | | Template    |  | |
|  | | Content Chunker     |  |    | +---------------+ +-------------+  | |
|  | +---------------------+  |    | +---------------+ +-------------+  | |
|  +----------+---------------+    | | File Tree     | | Permission  |  | |
|             |                    | | Template      | | Card Tmpl   |  | |
|  +----------v---------------+    | +---------------+ +-------------+  | |
|  | CLAUDE CODE SESSION MGR  |    +-------------------------------------+ |
|  |                          |                                            |
|  | +---------------------+  |    +-------------------------------------+ |
|  | | Session Pool        |  |    |       FILE SHARING SERVICE          | |
|  | | (per-user sessions) |  |    |                                     | |
|  | +---------------------+  |    | +---------------+ +-------------+  | |
|  | | Agent SDK Query     |  |    | | Upload Handler| | Snippet     |  | |
|  | | (streaming input)   |  |    | | (Teams->Local)| | Extractor   |  | |
|  | +---------------------+  |    | +---------------+ +-------------+  | |
|  | | Tool Permission Mgr |  |    | +---------------+                  | |
|  | | (canUseTool)        |  |    | | Attachment    |                  | |
|  | +---------------------+  |    | | Processor     |                  | |
|  | | Hook Forwarder      |  |    | +---------------+                  | |
|  | | (lifecycle events)  |  |    +-------------------------------------+ |
|  | +---------------------+  |                                            |
|  +----------+---------------+    +-------------------------------------+ |
|             |                    |       DEV TUNNEL MANAGER            | |
|  +----------v---------------+    |                                     | |
|  |  Claude Code Engine      |    | +---------------+ +-------------+  | |
|  |  (Local filesystem,      |    | | Tunnel Spawn  | | Health      |  | |
|  |   tools, agents)         |    | | & Lifecycle   | | Monitor     |  | |
|  +--------------------------+    | +---------------+ +-------------+  | |
|                                  +-------------------------------------+ |
|                                                                          |
|  +--------------------------------------------------------------------+  |
|  |                     AUTH MODULE                                     |  |
|  |  +-------------------+  +-------------------+  +----------------+  |  |
|  |  | Azure AD Provider |  | Token Validator   |  | User ACL Store |  |  |
|  |  +-------------------+  +-------------------+  +----------------+  |  |
|  +--------------------------------------------------------------------+  |
|                                                                          |
|  +--------------------------------------------------------------------+  |
|  |                CROSS-CUTTING: Audit Log | Rate Limiter | Config    |  |
|  +--------------------------------------------------------------------+  |
+===========================================================================+
```

---

## 2. Component Inventory

### 2.1 Teams Bot Service

**Responsibility:** Receive activities from Microsoft Teams, route them to appropriate handlers, and send responses back (including proactive messages).

**Internal Modules:**

| Module | Responsibility |
|--------|---------------|
| `TeamsApp` | Wraps `@microsoft/teams.apps` `App` class. Registers plugins, starts HTTP server on port 3978. |
| `ActivityRouter` | Routes incoming activities by type: `message` -> MessageBridge, `card.action` -> CardActionHandler, `fileConsent` -> FileSharingService, `install.add` -> ConversationStore. |
| `McpPlugin` | Exposes MCP tools (`sendToUser`, `askUser`, `getConversationHistory`) so Claude Code can proactively call Teams. Runs on `/mcp` endpoint using Streamable HTTP transport. |
| `ProactiveSender` | Wraps `app.send(conversationId, content)` with retry logic, rate limiting, and typing indicators. Queues messages when rate limits are hit. |
| `ConversationStore` | Persists user AAD Object ID -> conversation ID mappings to a local JSON file. Populated on `install.add` and `message` events. |
| `CommandParser` | Extracts slash commands (`/new`, `/stop`, `/project`, `/model`, `/permission`, `/sessions`, `/handoff`, `/status`, `/help`) from message text before forwarding to MessageBridge. |

**Key Interfaces:**

```typescript
interface ITeamsBotService {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendToUser(userId: string, content: string | AdaptiveCard): Promise<void>;
  sendTypingIndicator(conversationId: string): Promise<void>;
  onMessage(handler: (ctx: MessageContext) => Promise<void>): void;
  onCardAction(handler: (ctx: CardActionContext) => Promise<void>): void;
}

interface MessageContext {
  userId: string;          // AAD Object ID
  conversationId: string;
  text: string;
  attachments: Attachment[];
  send: (content: string | object) => Promise<void>;
}
```

### 2.2 Message Bridge

**Responsibility:** Bidirectional message transformation between Teams activity format and Claude Agent SDK message format. Handles streaming output batching.

**Internal Modules:**

| Module | Responsibility |
|--------|---------------|
| `TeamsToClaudeTransformer` | Converts Teams activity text + attachments into `SDKUserMessage` objects. Extracts uploaded file content, inlines images as base64, strips @mentions. |
| `ClaudeToTeamsTransformer` | Converts `SDKAssistantMessage`, `SDKResultMessage`, `SDKToolUseSummaryMessage` into Teams-sendable content (text, Adaptive Cards). Delegates to AdaptiveCardRenderer for rich content. |
| `StreamBatcher` | Accumulates `SDKPartialAssistantMessage` tokens into batches. Flushes on: (a) 500ms timeout, (b) 200-char threshold, (c) newline boundary, (d) code block boundary. Sends batched text with typing indicator between flushes. |
| `ContentChunker` | Splits large Claude responses (>4000 chars) into multiple Teams messages. Respects code block boundaries to avoid splitting mid-block. |
| `MarkdownAdapter` | Translates Claude markdown to Teams-compatible markdown subset. Teams supports bold, italic, links, lists, but not all GFM features. Code fences are extracted and routed to AdaptiveCardRenderer. |

**Key Interfaces:**

```typescript
interface IMessageBridge {
  teamsToClaudeMessage(ctx: MessageContext): Promise<SDKUserMessage>;
  claudeToTeamsContent(msg: SDKMessage): Promise<TeamsContent[]>;
  createStreamBatcher(conversationId: string): StreamBatcher;
}

type TeamsContent =
  | { type: 'text'; text: string }
  | { type: 'card'; card: AdaptiveCard }
  | { type: 'typing' };
```

### 2.3 Claude Code Session Manager

**Responsibility:** Manage Claude Agent SDK sessions per-user. Create, query, stream, resume, fork, and destroy sessions. Enforce tool permissions and budget limits.

**Internal Modules:**

| Module | Responsibility |
|--------|---------------|
| `SessionPool` | Maps `userId -> Session`. Maintains at most one active session per user. Stores session metadata (sessionId, cwd, model, startTime, cost) in local JSON. |
| `SessionFactory` | Creates new `query()` calls with appropriate options. Uses streaming input mode (async generator) for persistent sessions. Falls back to single-shot mode for one-off queries. |
| `StreamInputAdapter` | Implements `AsyncIterable<SDKUserMessage>` backed by a queue. Teams messages are pushed into the queue; the Claude SDK pulls from it. Handles backpressure. |
| `ToolPermissionManager` | Implements `canUseTool` callback. Routes permission requests to Teams as Adaptive Cards. Waits for user approval/denial with configurable timeout (default: 5 minutes). Maintains per-session allow/deny lists for "always allow" choices. |
| `HookForwarder` | Registers SDK hooks for `Notification`, `PostToolUse`, `SessionEnd`, `Stop`. Forwards events to Teams via ProactiveSender. `PostToolUse` for `Write`/`Edit` triggers diff card rendering. |
| `BudgetTracker` | Tracks per-user and per-session cost from `SDKResultMessage.total_cost_usd`. Enforces `maxBudgetUsd` limits. Sends warning cards at 80% threshold. |

**Key Interfaces:**

```typescript
interface ISessionManager {
  getOrCreateSession(userId: string, options?: SessionOptions): Promise<Session>;
  sendMessage(userId: string, message: string): Promise<void>;
  stopSession(userId: string): Promise<void>;
  resumeSession(userId: string, sessionId: string): Promise<Session>;
  forkSession(userId: string, sessionId: string): Promise<Session>;
  listSessions(userId: string): Promise<SessionInfo[]>;
  setWorkingDirectory(userId: string, cwd: string): Promise<void>;
  setModel(userId: string, model: string): Promise<void>;
  setPermissionMode(userId: string, mode: PermissionMode): Promise<void>;
}

interface Session {
  sessionId: string;
  userId: string;
  query: Query;
  inputQueue: StreamInputAdapter;
  cwd: string;
  model: string;
  status: 'active' | 'idle' | 'stopped';
  createdAt: Date;
  totalCost: number;
}

interface SessionOptions {
  cwd?: string;
  model?: string;
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  maxTurns?: number;
  maxBudgetUsd?: number;
  systemPrompt?: string;
}
```

### 2.4 Adaptive Card Renderer

**Responsibility:** Generate Adaptive Card JSON for all rich content scenarios: code blocks, diffs, file trees, progress indicators, errors, permission prompts, and session summaries.

**Internal Modules:**

| Module | Responsibility |
|--------|---------------|
| `CodeBlockRenderer` | Generates Adaptive Card with `CodeBlock` element. Maps file extensions to the 22 supported languages. Falls back to `PlainText`. Splits code >50 lines into expandable sections. |
| `DiffRenderer` | Generates side-by-side diff cards using `ColumnSet` with before/after `CodeBlock` elements. For diffs >20 lines, falls back to unified diff format in a single `CodeBlock` with `PlainText` language. |
| `FileTreeRenderer` | Generates a collapsible file tree card using nested `Container` elements with `TextBlock` items. Used for displaying project structure or changed file lists. |
| `ProgressRenderer` | Generates a progress card with status text, optional progress bar (using `ColumnSet` with colored columns), and elapsed time. Updated via card replacement (`activity.id` targeting). |
| `ErrorRenderer` | Generates error cards with red accent, error type heading, message body, and optional stack trace in `CodeBlock`. Includes retry action button. |
| `PermissionRenderer` | Generates permission request cards with tool name, input preview (truncated), approve/deny/always-allow action buttons. Card data includes `requestId` for correlation. |
| `SessionSummaryRenderer` | Generates session summary card with `FactSet` showing duration, cost, turns, files changed. Includes resume/fork action buttons. |
| `LanguageMapper` | Maps file extensions and language identifiers to Adaptive Cards `CodeBlock` language enum values. Covers: `.ts`->TypeScript, `.py`->Python, `.go`->Go, `.rs`->PlainText (no Rust support), etc. |

**Language Mapping Table:**

| CodeBlock Language | File Extensions |
|-------------------|-----------------|
| TypeScript | `.ts`, `.tsx` |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` |
| Python | `.py`, `.pyw` |
| Go | `.go` |
| Java | `.java` |
| C | `.c`, `.h` |
| C++ | `.cpp`, `.hpp`, `.cc`, `.cxx` |
| C# | `.cs` |
| Bash | `.sh`, `.bash`, `.zsh` |
| JSON | `.json`, `.jsonc` |
| HTML | `.html`, `.htm` |
| CSS | `.css`, `.scss`, `.less` |
| SQL | `.sql` |
| XML | `.xml`, `.xsl`, `.xsd`, `.svg` |
| PHP | `.php` |
| Perl | `.pl`, `.pm` |
| PowerShell | `.ps1`, `.psm1` |
| GraphQL | `.graphql`, `.gql` |
| PlainText | (all others) |

**Key Interfaces:**

```typescript
interface IAdaptiveCardRenderer {
  renderCodeBlock(code: string, language: string, options?: CodeBlockOptions): AdaptiveCard;
  renderDiff(filePath: string, before: string, after: string, language: string): AdaptiveCard;
  renderUnifiedDiff(filePath: string, unifiedDiff: string): AdaptiveCard;
  renderFileTree(files: FileTreeNode[]): AdaptiveCard;
  renderProgress(status: string, percent?: number, elapsed?: string): AdaptiveCard;
  renderError(error: ErrorInfo): AdaptiveCard;
  renderPermissionRequest(request: PermissionRequest): AdaptiveCard;
  renderSessionSummary(session: SessionSummary): AdaptiveCard;
}

interface CodeBlockOptions {
  filePath?: string;
  startLine?: number;
  endLine?: number;
  showOpenInVSCode?: boolean;
}
```

### 2.5 File Sharing Service

**Responsibility:** Handle file transfers in both directions -- Teams uploads to local filesystem, and local file content sent as Adaptive Cards to Teams.

**Internal Modules:**

| Module | Responsibility |
|--------|---------------|
| `UploadHandler` | Processes Teams file attachments. Downloads file content from the Teams-provided `contentUrl` using bot credentials. Writes to a configurable upload directory (`<cwd>/.cc-ms-teams/uploads/`). Validates file size (max 25MB) and type (configurable allowlist). |
| `SnippetExtractor` | Extracts code snippets from Claude Code tool outputs (`Read`, `Write`, `Edit` tool results). Parses file paths, line ranges, and content for rendering as CodeBlock cards. |
| `AttachmentProcessor` | Processes incoming Teams attachments by type: images (inline as base64 for Claude vision), text files (extract content for prompt injection), binary files (save to disk, provide path to Claude). |
| `FileMetadataService` | Resolves file metadata (size, MIME type, line count, language) for display in file cards. Uses file extension mapping from LanguageMapper. |

**Key Interfaces:**

```typescript
interface IFileSharingService {
  processUpload(attachment: Attachment, cwd: string): Promise<UploadResult>;
  processImage(attachment: Attachment): Promise<ImageContent>;
  createFileCard(filePath: string, content?: string): Promise<AdaptiveCard>;
  createSnippetCard(snippet: CodeSnippet): AdaptiveCard;
}

interface UploadResult {
  localPath: string;
  originalName: string;
  size: number;
  mimeType: string;
}

interface CodeSnippet {
  filePath: string;
  content: string;
  language: string;
  startLine?: number;
  endLine?: number;
}
```

### 2.6 Auth Module

**Responsibility:** Authenticate incoming requests from Azure Bot Service, validate user identity, and enforce access control lists.

**Internal Modules:**

| Module | Responsibility |
|--------|---------------|
| `AzureADProvider` | Configures the Teams SDK `App` with Azure AD credentials from environment variables (`BOT_ID`, `BOT_PASSWORD`, `BOT_TENANT_ID`). Supports single-tenant mode (required for new bots post-July 2025). |
| `TokenValidator` | Validates the Bearer token on incoming `/api/messages` requests against Azure Bot Service's OpenID metadata. The Teams SDK handles this internally, but this module wraps it for webhook-mode fallback. |
| `UserACLStore` | Maintains a persistent allow-list of Azure AD Object IDs. Loaded from config file. Provides `isAuthorized(aadObjectId)` check called on every activity. Supports wildcard `"*"` for dev/test mode (disabled by default). |
| `WebhookAuthProvider` | Alternative auth for webhook-only mode. Validates HMAC-SHA256 signature using a shared secret configured in Teams channel settings. |
| `ClaudeAPIKeyManager` | Manages the Anthropic API key used by the Claude Agent SDK. Reads from `ANTHROPIC_API_KEY` env var or config file. Does not store in code or logs. |

**Auth Flow Decision Tree:**

```
Incoming Request
    |
    v
[Has Bearer Token?] --yes--> [Teams SDK validates JWT against Azure AD]
    |                                  |
    no                          [Valid?] --no--> 401 Unauthorized
    |                                  |
    v                                 yes
[Has HMAC Header?] --yes-->           |
    |              [Validate HMAC]     v
    no                  |        [Extract AAD Object ID from activity]
    |              [Valid?]            |
    v                  |              v
401 Unauthorized      yes       [User in ACL?] --no--> 403 Forbidden
                       |              |
                       v             yes
                  [Webhook Mode]      |
                                      v
                                 [Process Activity]
```

**Key Interfaces:**

```typescript
interface IAuthModule {
  initialize(config: AuthConfig): Promise<void>;
  isAuthorized(activity: Activity): Promise<boolean>;
  getUserId(activity: Activity): string;
  getAuthMode(): 'azure-ad' | 'webhook' | 'dev';
}

interface AuthConfig {
  botId: string;
  botPassword: string;
  tenantId: string;
  allowedUsers: string[];
  allowedTenants: string[];
  webhookSecret?: string;  // For webhook-only mode
  devMode?: boolean;       // Bypass auth (local dev only)
}
```

### 2.7 Dev Tunnel Manager

**Responsibility:** Manage the lifecycle of the dev tunnel that exposes the local bot server to the internet for Azure Bot Service to reach.

**Internal Modules:**

| Module | Responsibility |
|--------|---------------|
| `TunnelSpawner` | Spawns and manages `devtunnel host` process (or `ngrok http 3978` as fallback). Parses tunnel URL from stdout. Stores URL for bot endpoint registration. |
| `HealthMonitor` | Periodically pings the tunnel URL to verify it is accessible. Detects tunnel disconnection and triggers automatic reconnection. Emits health status events. |
| `URLResolver` | Resolves the current tunnel URL. Used by the setup wizard to update the Azure Bot messaging endpoint. Persists last-known URL to config file. |
| `TunnelConfig` | Manages tunnel configuration: port (default 3978), protocol (https), access level (public for Azure Bot Service), persistence (reuse tunnel ID across restarts). |

**Key Interfaces:**

```typescript
interface IDevTunnelManager {
  start(): Promise<TunnelInfo>;
  stop(): Promise<void>;
  getUrl(): string | null;
  onStatusChange(handler: (status: TunnelStatus) => void): void;
  isHealthy(): Promise<boolean>;
}

interface TunnelInfo {
  url: string;
  tunnelId: string;
  port: number;
}

type TunnelStatus = 'starting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
```

---

## 3. Data Flow Diagrams

### 3.1 User Sends Message in Teams -> Claude Code Processes -> Response to Teams

```
 Teams Client          Azure Bot Svc       Local Bot Server         Claude SDK
 ==========          =============       ================         ==========

 User types
 "Fix the bug
  in auth.ts"
     |
     |---(HTTPS)--->|
     |              |---(HTTPS/tunnel)--->|
     |              |                     |
     |              |                     | 1. AuthModule.isAuthorized()
     |              |                     | 2. CommandParser: not a command
     |              |                     | 3. MessageBridge.teamsToClaudeMessage()
     |              |                     |    - Strip @mention prefix
     |              |                     |    - Extract attachment content
     |              |                     |    - Build SDKUserMessage
     |              |                     |
     |              |                     | 4. SessionManager.getOrCreateSession()
     |              |                     |    - Lookup existing session for userId
     |              |                     |    - If none: create new query() with
     |              |                     |      streaming input AsyncGenerator
     |              |                     |
     |              |                     | 5. Push message to StreamInputAdapter
     |              |                     |         |
     |              |                     |         |----push---->|
     |              |                     |         |             |
     |              |                     |         |             | Claude processes:
     |              |                     |         |             | - Reads auth.ts
     |              |                     |         |             | - Identifies bug
     |              |                     |         |             | - Edits file
     |              |                     |         |             |
     |              |                     |    SDKPartialMessages |
     |              |                     |<---stream-------------|
     |              |                     |                       |
     |              |                     | 6. StreamBatcher collects tokens
     |              |                     | 7. Every 500ms or 200 chars:
     |              |                     |    - Send typing indicator
     |              |                     |    - MessageBridge.claudeToTeamsContent()
     |              |                     |    - ProactiveSender.send()
     |              |                     |
     |              |<---(proactive)------|
     |<-------------|                     |
     |              |                     |
     | "Looking at  |                     | 8. On tool_use (Edit):
     |  auth.ts..." |                     |    - HookForwarder.PostToolUse fires
     |              |                     |    - DiffRenderer.renderDiff()
     |              |                     |    - ProactiveSender.send(diffCard)
     |              |                     |
     |              |<---(proactive)------|
     |<-------------|                     |
     |              |                     |
     | [Diff Card:  |                     |
     |  before/     |                     |
     |  after]      |                     |
     |              |                     | 9. On SDKResultMessage:
     |              |                     |    - SessionSummaryRenderer.render()
     |              |                     |    - ProactiveSender.send(summaryCard)
     |              |                     |
     |              |<---(proactive)------|
     |<-------------|                     |
     |              |                     |
     | [Summary:    |                     |
     |  3 turns,    |                     |
     |  $0.04,      |                     |
     |  1 file      |                     |
     |  changed]    |                     |
```

### 3.2 Claude Code Streaming Outputs -> Adaptive Cards -> Teams

```
 Claude SDK             StreamBatcher        CardRenderer        Teams
 ==========             =============        ============        =====

 yield SDKPartial
 "I'll look"
     |---push--->|
     |           | buffer: "I'll look"
     |           | timer: start 500ms
 yield SDKPartial
 " at the code"
     |---push--->|
     |           | buffer: "I'll look at the code"
     |           | timer: still running
     |           |
     |           | [500ms elapsed]
     |           | flush()
     |           |---text("I'll look at the code")--->|
     |           |                                     |--send-->|
     |           |                                     |         | "I'll look
     |           |                                     |         |  at the code"
 yield SDKPartial
 "```typescript\n"
     |---push--->|
     |           | detect: code fence start
     |           | switch to: code accumulation mode
     |           |
 yield SDKPartial
 "const x = 1;\n"
     |---push--->|
     |           | code buffer += "const x = 1;\n"
     |           |
 yield SDKPartial
 "```"
     |---push--->|
     |           | detect: code fence end
     |           | flush code block
     |           |---codeSnippet("const x = 1;", "typescript")-->|
     |           |                                                |
     |           |                    renderCodeBlock()           |
     |           |                    returns AdaptiveCard        |
     |           |                                    |--send card-->|
     |           |                                                   |
     |           |                                                   | [CodeBlock
     |           |                                                   |  with syntax
     |           |                                                   |  highlight]
 yield SDKAssistant
 (tool_use: Edit)
     |---push--->|
     |           | detect: tool use block
     |           |---toolUse(Edit, {file, old, new})------------->|
     |           |                                                |
     |           |                    renderDiff()                |
     |           |                    returns ColumnSet card      |
     |           |                                    |--send card-->|
     |           |                                                   |
     |           |                                                   | [Side-by-side
     |           |                                                   |  diff card]
```

### 3.3 File/Code Snippet from Claude Code -> Adaptive Card -> Teams

```
 Claude Code            SnippetExtractor     CodeBlockRenderer    Teams
 ===========            ================     =================    =====

 Tool result:
 Read("src/auth.ts",
      lines 42-58)
     |
     | SDKToolUseSummary
     | { tool: "Read",
     |   input: {path, lines},
     |   output: "export async..." }
     |
     |---extract--->|
     |              | Parse:
     |              |   filePath = "src/auth.ts"
     |              |   startLine = 42
     |              |   content = "export async..."
     |              |   language = LanguageMapper("auth.ts")
     |              |            = "TypeScript"
     |              |
     |              |---render(snippet)--->|
     |              |                      |
     |              |                      | Build AdaptiveCard:
     |              |                      | {
     |              |                      |   body: [
     |              |                      |     TextBlock("src/auth.ts", heading),
     |              |                      |     TextBlock("Lines 42-58"),
     |              |                      |     CodeBlock {
     |              |                      |       codeSnippet: "export async...",
     |              |                      |       language: "TypeScript",
     |              |                      |       startLineNumber: 42
     |              |                      |     }
     |              |                      |   ],
     |              |                      |   actions: [
     |              |                      |     OpenUrl("vscode://file/.../auth.ts:42")
     |              |                      |   ]
     |              |                      | }
     |              |                      |
     |              |                      |---send card--->|
     |              |                      |                |
     |              |                      |                | [Rendered card with
     |              |                      |                |  syntax-highlighted
     |              |                      |                |  TypeScript code,
     |              |                      |                |  line numbers 42-58,
     |              |                      |                |  "Open in VS Code"
     |              |                      |                |  button]
```

### 3.4 User Uploads File in Teams -> Available to Claude Code Session

```
 Teams Client           Bot Server           FileSharingService   Claude Session
 ============           ==========           ==================   ==============

 User drags
 "config.yaml"
 into chat
     |
     |---(activity with
     |    attachment:
     |    contentUrl,
     |    contentType,
     |    name)--->|
     |             |
     |             | 1. AuthModule.isAuthorized()
     |             |
     |             |---processUpload()--->|
     |             |                      |
     |             |                      | 2. Validate:
     |             |                      |    - Size < 25MB
     |             |                      |    - Type in allowlist
     |             |                      |
     |             |                      | 3. Download file content
     |             |                      |    from attachment.contentUrl
     |             |                      |    using bot bearer token
     |             |                      |
     |             |                      | 4. Write to local filesystem:
     |             |                      |    <cwd>/.cc-ms-teams/uploads/
     |             |                      |    config.yaml
     |             |                      |
     |             |                      | 5. Return UploadResult {
     |             |                      |      localPath: "/home/.../config.yaml",
     |             |                      |      originalName: "config.yaml",
     |             |                      |      size: 1234,
     |             |                      |      mimeType: "text/yaml"
     |             |                      |    }
     |             |                      |
     |             |<--UploadResult-------|
     |             |
     |             | 6. Build SDKUserMessage:
     |             |    "User uploaded config.yaml
     |             |     (1.2KB, saved to /home/.../config.yaml).
     |             |     The user's message was: 'please review
     |             |     this config'"
     |             |
     |             | 7. For images: inline as base64
     |             |    { type: "image", source: { data: "..." } }
     |             |
     |             |---push to StreamInputAdapter---------->|
     |             |                                        |
     |             |                                        | Claude reads the
     |             |                                        | uploaded file using
     |             |                                        | the Read tool at
     |             |                                        | the local path
     |             |
     |             | 8. Send confirmation card:
     |             |    "File received: config.yaml (1.2KB)"
     |<------------|
     |             |
     | [File       |
     |  received   |
     |  card]      |
```

---

## 4. Technology Stack

### 4.1 Core Dependencies

| Package | Version | Justification |
|---------|---------|---------------|
| `@microsoft/teams.apps` | latest (GA) | Teams SDK v2 core. Replaces deprecated `botbuilder` v4. Native plugin architecture, typed activity handlers, built-in auth. |
| `@microsoft/teams.api` | latest (GA) | Activity types, `MessageActivity`, `Account`, and API models. Required companion to `teams.apps`. |
| `@microsoft/teams.mcp` | latest (GA) | MCP server plugin. Exposes Claude-callable tools on the Teams bot. Enables bidirectional communication without polling. |
| `@anthropic-ai/claude-agent-sdk` | latest | Programmatic Claude Code access. Streaming input mode for persistent sessions. Hook callbacks for lifecycle events. |
| `zod` | ^3.23 | Schema validation for MCP tool parameters, config validation, and Teams card action data parsing. Required by `@microsoft/teams.mcp`. |

### 4.2 Development Dependencies

| Package | Version | Justification |
|---------|---------|---------------|
| `@microsoft/teams.dev` | latest | DevTools plugin for local development. Provides debug UI and activity inspector. |
| `typescript` | ^5.5 | Type safety across the entire codebase. Teams SDK v2 provides full TypeScript definitions. |
| `esbuild` | ^0.24 | Single-file bundle for deployment. Fast builds (~100ms). Following the pattern from `teams-claude-bot`. |
| `vitest` | ^2.0 | Unit and integration testing. Fast execution, native TypeScript support, compatible with Node.js ESM. |
| `@types/node` | ^22 | Node.js type definitions. Minimum Node.js version: 22 (required by Teams SDK v2). |

### 4.3 Runtime

| Component | Choice | Justification |
|-----------|--------|---------------|
| Runtime | Node.js 22+ | Required by Teams SDK v2. LTS release with native ESM, `fetch()`, and stable `AsyncGenerator` support. |
| Module system | ESM (`"type": "module"`) | Teams SDK v2 is ESM-only. Claude Agent SDK uses ESM. Industry standard for new projects. |
| Build output | Single `.mjs` file via esbuild | Simplifies deployment. No `node_modules` needed at runtime. Copy one file + config. |
| Process manager | systemd (Linux) / launchd (macOS) | OS-native service management for running the bot as a background service. Installed via `cc-ms-teams install`. |

### 4.4 Tunnel Provider

| Provider | Priority | Notes |
|----------|----------|-------|
| Microsoft Dev Tunnels (`devtunnel`) | Primary | Persistent URLs, free, integrates with Azure AD. Microsoft-supported for Teams development. |
| ngrok | Fallback | Widely available, simple setup. Free tier has rotating URLs (paid tier for persistent). |

---

## 5. Deployment Topology

```
+=================================================================+
|                    MICROSOFT CLOUD                               |
|                                                                  |
|  +-------------------+          +----------------------------+   |
|  | Microsoft Teams   |          | Azure Bot Service          |   |
|  | Service           |          | (Free Tier)                |   |
|  |                   |          |                            |   |
|  | - Message routing |<-------->| - App Registration         |   |
|  | - Adaptive Card   |          | - JWT Token Issuance       |   |
|  |   rendering       |          | - Message Endpoint:        |   |
|  | - File hosting    |          |   https://<tunnel>.        |   |
|  |                   |          |   devtunnels.ms/           |   |
|  +-------------------+          |   api/messages             |   |
|                                 +-------------+--------------+   |
|                                               |                  |
+=================================================================+
                                                |
                             HTTPS (TLS 1.3)    |
                             Port 443           |
                                                |
+=================================================================+
|                    DEV TUNNEL EDGE                                |
|                                                                  |
|  +-----------------------------------------------------------+  |
|  | devtunnel (or ngrok)                                       |  |
|  |                                                            |  |
|  | External: https://<tunnel-id>.devtunnels.ms                |  |
|  | Internal: http://localhost:3978                             |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
+=================================================================+
                                                |
                             localhost:3978      |
                                                |
+=================================================================+
|                    DEVELOPER MACHINE                              |
|                                                                  |
|  +-----------------------------------------------------------+  |
|  | cc-ms-teams Process (Node.js 22+)                          |  |
|  |                                                            |  |
|  | HTTP Server (:3978)                                        |  |
|  |   /api/messages    <- Teams activities                     |  |
|  |   /mcp             <- MCP Streamable HTTP (for Claude)     |  |
|  |   /health          <- Health check endpoint                |  |
|  |                                                            |  |
|  | Internal Bus:                                              |  |
|  |   TeamsBot -> MessageBridge -> SessionManager -> Agent SDK |  |
|  |   Agent SDK -> HookForwarder -> CardRenderer -> TeamsBot   |  |
|  +-----------------------------------------------------------+  |
|                          |                                       |
|                          | spawns / communicates via stdio        |
|                          |                                       |
|  +-----------------------------------------------------------+  |
|  | Claude Code Engine (subprocess)                            |  |
|  |                                                            |  |
|  | Working directory: /home/<user>/projects/<project>         |  |
|  | Tools: Read, Write, Edit, Bash, Grep, Glob                |  |
|  | Access: Local filesystem, git, installed CLI tools         |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
|  +-----------------------------------------------------------+  |
|  | Persistent State (local files)                             |  |
|  |                                                            |  |
|  | ~/.cc-ms-teams/                                            |  |
|  |   config.json        <- Bot credentials, user ACL, prefs  |  |
|  |   conversations.json <- userId -> conversationId map       |  |
|  |   sessions.json      <- userId -> sessionId map            |  |
|  |   audit.jsonl        <- Interaction audit log              |  |
|  |   tunnel.json        <- Last-known tunnel URL/ID           |  |
|  +-----------------------------------------------------------+  |
|                                                                  |
+=================================================================+
```

### 5.1 Port Assignments

| Port | Service | Access |
|------|---------|--------|
| 3978 | Teams Bot HTTP server | Tunnel -> localhost |
| (dynamic) | MCP endpoint (`/mcp` on same server) | Internal (Claude Code -> localhost:3978/mcp) |

### 5.2 Persistent State Files

| File | Format | Contents |
|------|--------|----------|
| `~/.cc-ms-teams/config.json` | JSON | Bot ID, password, tenant ID, allowed users, tool permissions, budget limits |
| `~/.cc-ms-teams/conversations.json` | JSON | Map of AAD Object ID -> Teams conversation ID |
| `~/.cc-ms-teams/sessions.json` | JSON | Map of AAD Object ID -> Claude session ID + metadata |
| `~/.cc-ms-teams/audit.jsonl` | JSONL | Append-only audit log of all interactions |
| `~/.cc-ms-teams/tunnel.json` | JSON | Tunnel ID, URL, port for reuse across restarts |

---

## 6. Error Handling and Reconnection

### 6.1 Error Categories and Strategies

| Error Category | Examples | Strategy |
|----------------|----------|----------|
| **Tunnel disconnection** | `devtunnel` process exits, network interruption | HealthMonitor detects within 30s. TunnelSpawner auto-restarts with same tunnel ID. Queue outbound messages during reconnection (up to 60s). Drop queued messages after timeout. |
| **Claude session crash** | Agent SDK throws, OOM, tool timeout | Catch exception in session loop. Send error card to Teams. Auto-resume session using `resume: sessionId` on next user message. If resume fails, create new session and notify user. |
| **Teams API rate limit** | HTTP 429 from proactive send | ProactiveSender implements exponential backoff: 1s, 2s, 4s, 8s, max 30s. Queue messages during backoff. Drop messages older than 2 minutes in queue. |
| **Auth failure** | Expired bot secret, revoked user access | Return 401/403 to Azure Bot Service. Log the failure. For expired secrets, send admin notification via audit log. |
| **File upload failure** | File too large, download timeout, disk full | Send error card to user with specific reason. Do not inject failed upload into Claude session. |
| **Budget exceeded** | `maxBudgetUsd` reached | Claude SDK stops automatically. Send budget-exceeded card with cost summary. Require explicit `/new` command to start fresh session. |
| **Tool permission timeout** | User does not respond to permission card within 5 min | Deny the tool use. Send timeout notification to Teams. Claude SDK receives deny and adjusts its approach. |

### 6.2 Reconnection State Machine

```
                    +----------+
                    |  HEALTHY |<-----------------------------+
                    +----+-----+                              |
                         |                                    |
                   [error detected]                     [success]
                         |                                    |
                    +----v--------+     +------------------+  |
                    | DEGRADED    |---->| RECONNECTING     |--+
                    | (queuing    |     | (restart tunnel/ |
                    |  messages)  |     |  resume session) |
                    +----+--------+     +--------+---------+
                         |                       |
                   [timeout 60s]           [max retries 5]
                         |                       |
                    +----v--------+              |
                    |  FAILED     |<-------------+
                    | (drop queue,|
                    |  notify)    |
                    +-------------+
```

### 6.3 Graceful Shutdown Sequence

```
1. SIGTERM/SIGINT received
2. Stop accepting new messages (close HTTP server)
3. Send "Bot shutting down" card to all active conversations
4. For each active session:
   a. Call query.interrupt()
   b. Wait up to 5s for clean stop
   c. Record session ID for resume on restart
5. Persist all state (conversations, sessions) to disk
6. Stop dev tunnel
7. Exit process
```

---

## 7. Component Interaction Diagram

### 7.1 Runtime Object Graph

```
+------------------------------------------------------------------+
|                        Application                                |
|                                                                   |
|  app: TeamsApp -------> plugins: [McpPlugin, DevtoolsPlugin]      |
|       |                                                           |
|       |--- activityRouter ------+                                 |
|       |                         |                                 |
|       |--- proactiveSender -----|--- rateLimiter                  |
|       |                         |                                 |
|       |--- conversationStore    |                                 |
|       |                         |                                 |
|       |--- commandParser        |                                 |
|       |                         |                                 |
|  authModule ---------+          |                                 |
|       |              |          |                                 |
|       +-- azureAD    |          |                                 |
|       +-- userACL <--+          |                                 |
|                                 |                                 |
|  messageBridge <----------------+                                 |
|       |                                                           |
|       |--- teamsToClaudeXform                                     |
|       |--- claudeToTeamsXform -----> cardRenderer                 |
|       |--- streamBatcher                  |                       |
|       |--- contentChunker                 |--- codeBlockRenderer  |
|       |--- markdownAdapter                |--- diffRenderer       |
|                                           |--- fileTreeRenderer   |
|  sessionManager <--- messageBridge        |--- progressRenderer   |
|       |                                   |--- errorRenderer      |
|       |--- sessionPool                    |--- permissionRenderer |
|       |--- sessionFactory                 |--- summaryRenderer    |
|       |--- streamInputAdapter                                     |
|       |--- toolPermissionMgr ----> cardRenderer.permission        |
|       |--- hookForwarder ---------> proactiveSender               |
|       |--- budgetTracker                                          |
|                                                                   |
|  fileSharingService <--- activityRouter                           |
|       |                                                           |
|       |--- uploadHandler                                          |
|       |--- snippetExtractor ----> cardRenderer.codeBlock          |
|       |--- attachmentProcessor                                    |
|       |--- fileMetadataService                                    |
|                                                                   |
|  devTunnelManager                                                 |
|       |                                                           |
|       |--- tunnelSpawner                                          |
|       |--- healthMonitor                                          |
|       |--- urlResolver                                            |
|                                                                   |
|  auditLogger <--- authModule, sessionManager, messageBridge       |
+------------------------------------------------------------------+
```

### 7.2 Message Processing Pipeline

```
Inbound (Teams -> Claude):

  Activity
    |
    v
  [1] AuthModule.isAuthorized()
    |
    v
  [2] CommandParser.parse()
    |
    +--- command found ---> CommandHandler.execute()
    |                           |
    |                           +--- /new    -> SessionManager.stopSession() + getOrCreateSession()
    |                           +--- /stop   -> SessionManager.stopSession()
    |                           +--- /project -> SessionManager.setWorkingDirectory()
    |                           +--- /model  -> SessionManager.setModel()
    |                           +--- /sessions -> SessionManager.listSessions() -> render card
    |                           +--- /handoff -> SessionManager.forkSession()
    |                           +--- /status -> render status card
    |
    +--- not a command
    |
    v
  [3] FileSharingService.processAttachments()
    |
    v
  [4] MessageBridge.teamsToClaudeMessage()
    |
    v
  [5] SessionManager.sendMessage()
    |
    v
  [6] StreamInputAdapter.push(SDKUserMessage)


Outbound (Claude -> Teams):

  SDKMessage (from AsyncGenerator)
    |
    v
  [1] MessageBridge.claudeToTeamsContent()
    |
    +--- SDKPartialAssistantMessage -> StreamBatcher.push()
    |                                      |
    |                                   [flush]
    |                                      |
    |                                      v
    |                                 ProactiveSender.send(text)
    |
    +--- SDKAssistantMessage
    |       |
    |       +--- text blocks -> ContentChunker -> ProactiveSender.send(text)
    |       +--- tool_use blocks -> CardRenderer -> ProactiveSender.send(card)
    |
    +--- SDKToolUseSummaryMessage -> SnippetExtractor -> CardRenderer -> send
    |
    +--- SDKResultMessage -> SessionSummaryRenderer -> ProactiveSender.send(card)
    |
    +--- SDKStatusMessage -> ProactiveSender.send(text)
```

### 7.3 MCP Bidirectional Flow

```
Claude Code can call Teams through MCP tools exposed by McpPlugin:

  Claude Code Session
    |
    | (MCP tool call via stdio -> HTTP)
    v
  McpPlugin on /mcp endpoint
    |
    +--- tool: "sendToUser"
    |       params: { message, userId }
    |       -> ProactiveSender.sendToUser(userId, message)
    |       <- { success: true }
    |
    +--- tool: "askUser"
    |       params: { question, userId, timeout? }
    |       -> Send question card to Teams with input field
    |       -> Wait for card.action response (with timeout)
    |       <- { answer: "user's response" }
    |
    +--- tool: "getConversationHistory"
            params: { userId, limit? }
            -> Read from conversation message cache
            <- { messages: [...] }
```

---

## 8. Security Architecture

### 8.1 Defense in Depth Layers

```
Layer 1: Network
  +-- Dev tunnel with authentication (not anonymous)
  +-- HTTPS only (TLS 1.3)
  +-- Azure Bot Service validates channel identity

Layer 2: Authentication
  +-- Azure AD JWT validation (automatic via Teams SDK)
  +-- Bot-to-service auth (BOT_ID + BOT_PASSWORD)
  +-- Single-tenant restriction (no multi-tenant)

Layer 3: Authorization
  +-- User ACL whitelist (AAD Object IDs)
  +-- Tenant ID restriction
  +-- Per-user tool permission levels (read-only, edit, full)

Layer 4: Claude Code Sandboxing
  +-- allowedTools: restrict available tools per user
  +-- canUseTool: human-in-the-loop for destructive operations
  +-- disallowedTools: hard block on dangerous tools
  +-- cwd restriction: confine to project directory
  +-- Blocked paths: ~/.ssh, ~/.aws, ~/.env, credentials

Layer 5: Operational Controls
  +-- Rate limiting: 10 messages/user/minute (configurable)
  +-- Budget limits: maxBudgetUsd per session and per user
  +-- Audit logging: all interactions logged to audit.jsonl
  +-- Session timeout: idle sessions closed after 30 minutes
```

### 8.2 Default Tool Permission Tiers

| Tier | Tools | When Used |
|------|-------|-----------|
| `readonly` (default) | `Read`, `Grep`, `Glob` | New users, untrusted contexts |
| `edit` | `Read`, `Grep`, `Glob`, `Write`, `Edit` | Trusted users, code review/editing |
| `full` | `Read`, `Grep`, `Glob`, `Write`, `Edit`, `Bash` | Admin users, full development |
| `custom` | User-specified list | Advanced configuration |

### 8.3 Sensitive Path Blocklist

The `canUseTool` callback denies access to these paths regardless of permission tier:

```
~/.ssh/*
~/.aws/*
~/.azure/*
~/.config/gcloud/*
~/.gnupg/*
**/.env
**/.env.*
**/credentials.json
**/secrets.*
**/*.pem
**/*.key
~/.cc-ms-teams/config.json  (bot credentials)
```

---

## 9. Configuration and Environment

### 9.1 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_ID` | Yes | Azure AD App Registration Client ID |
| `BOT_PASSWORD` | Yes | Azure AD Client Secret |
| `BOT_TENANT_ID` | Yes | Azure AD Tenant ID (single-tenant) |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for Agent SDK |
| `CC_MS_TEAMS_PORT` | No | HTTP server port (default: 3978) |
| `CC_MS_TEAMS_CWD` | No | Default working directory for Claude sessions |
| `CC_MS_TEAMS_LOG_LEVEL` | No | Log level: debug, info, warn, error (default: info) |
| `CC_MS_TEAMS_CONFIG_DIR` | No | Config directory (default: ~/.cc-ms-teams) |
| `CC_MS_TEAMS_TUNNEL` | No | Tunnel provider: devtunnel, ngrok, none (default: devtunnel) |

### 9.2 Config File Schema (`~/.cc-ms-teams/config.json`)

```typescript
interface Config {
  // Bot registration
  botId: string;
  botPassword: string;
  tenantId: string;

  // Access control
  allowedUsers: string[];       // AAD Object IDs
  allowedTenants: string[];     // Tenant IDs

  // Claude session defaults
  defaults: {
    cwd: string;                // Default working directory
    model: string;              // Default model (e.g., "claude-sonnet-4-20250514")
    permissionMode: string;     // "default" | "acceptEdits" | "plan"
    allowedTools: string[];     // Default tool set
    maxTurns: number;           // Default max turns (default: 25)
    maxBudgetUsd: number;       // Default budget per session (default: 1.00)
    systemPrompt?: string;      // Optional custom system prompt append
  };

  // Security
  security: {
    toolTier: string;           // "readonly" | "edit" | "full" | "custom"
    blockedPaths: string[];     // Additional blocked path patterns
    requireApprovalFor: string[]; // Tools requiring explicit approval
    sessionTimeoutMinutes: number; // Idle session timeout (default: 30)
    rateLimitPerMinute: number; // Messages per user per minute (default: 10)
  };

  // Tunnel
  tunnel: {
    provider: string;           // "devtunnel" | "ngrok" | "none"
    persistentId?: string;      // Reuse tunnel ID across restarts
    authRequired: boolean;      // Require tunnel authentication (default: true)
  };

  // File sharing
  fileSharing: {
    uploadDir: string;          // Relative to cwd (default: ".cc-ms-teams/uploads")
    maxFileSizeMb: number;      // Max upload size (default: 25)
    allowedMimeTypes: string[]; // Allowed upload types (default: ["*/*"])
  };
}
```

### 9.3 CLI Commands

| Command | Description |
|---------|-------------|
| `cc-ms-teams setup` | Interactive setup wizard: Azure Bot registration, API keys, user ACL, manifest generation |
| `cc-ms-teams start` | Start the bot server and dev tunnel |
| `cc-ms-teams stop` | Stop the bot server and tunnel |
| `cc-ms-teams status` | Show server status, tunnel URL, active sessions |
| `cc-ms-teams logs` | Tail the audit log |
| `cc-ms-teams health` | Run health checks (tunnel reachable, Azure Bot endpoint valid, Claude API key valid) |
| `cc-ms-teams install` | Install as a system service (systemd/launchd) |
| `cc-ms-teams manifest` | Generate/regenerate Teams app manifest ZIP |

---

## Appendix A: Adaptive Card Template Examples

### A.1 Code Block Card

```json
{
  "$schema": "https://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "${filePath}",
      "style": "heading",
      "size": "medium"
    },
    {
      "type": "TextBlock",
      "text": "Lines ${startLine} - ${endLine}",
      "isSubtle": true,
      "size": "small"
    },
    {
      "type": "CodeBlock",
      "codeSnippet": "${code}",
      "language": "${language}",
      "startLineNumber": "${startLine}"
    }
  ],
  "actions": [
    {
      "type": "Action.OpenUrl",
      "title": "Open in VS Code",
      "url": "vscode://file/${absolutePath}:${startLine}"
    }
  ]
}
```

### A.2 Side-by-Side Diff Card

```json
{
  "$schema": "https://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "File Changed: ${filePath}",
      "style": "heading",
      "color": "attention"
    },
    {
      "type": "ColumnSet",
      "columns": [
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            { "type": "TextBlock", "text": "Before", "weight": "bolder", "color": "attention" },
            {
              "type": "CodeBlock",
              "codeSnippet": "${oldCode}",
              "language": "${language}",
              "startLineNumber": "${startLine}"
            }
          ]
        },
        {
          "type": "Column",
          "width": "stretch",
          "items": [
            { "type": "TextBlock", "text": "After", "weight": "bolder", "color": "good" },
            {
              "type": "CodeBlock",
              "codeSnippet": "${newCode}",
              "language": "${language}",
              "startLineNumber": "${startLine}"
            }
          ]
        }
      ]
    }
  ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Approve",
      "style": "positive",
      "data": { "action": "approve_edit", "requestId": "${requestId}" }
    },
    {
      "type": "Action.Submit",
      "title": "Reject",
      "style": "destructive",
      "data": { "action": "reject_edit", "requestId": "${requestId}" }
    }
  ]
}
```

### A.3 Permission Request Card

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
      "color": "warning"
    },
    {
      "type": "FactSet",
      "facts": [
        { "title": "Tool", "value": "${toolName}" },
        { "title": "Action", "value": "${actionSummary}" }
      ]
    },
    {
      "type": "CodeBlock",
      "codeSnippet": "${inputPreview}",
      "language": "JSON"
    }
  ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Allow",
      "style": "positive",
      "data": { "action": "allow_tool", "requestId": "${requestId}" }
    },
    {
      "type": "Action.Submit",
      "title": "Always Allow",
      "data": { "action": "always_allow_tool", "requestId": "${requestId}", "toolName": "${toolName}" }
    },
    {
      "type": "Action.Submit",
      "title": "Deny",
      "style": "destructive",
      "data": { "action": "deny_tool", "requestId": "${requestId}" }
    }
  ]
}
```

### A.4 Session Summary Card

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
      "color": "good"
    },
    {
      "type": "FactSet",
      "facts": [
        { "title": "Duration", "value": "${duration}" },
        { "title": "Turns", "value": "${numTurns}" },
        { "title": "Cost", "value": "$${cost}" },
        { "title": "Files Changed", "value": "${filesChanged}" },
        { "title": "Session ID", "value": "${sessionId}" }
      ]
    }
  ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Resume Session",
      "data": { "action": "resume_session", "sessionId": "${sessionId}" }
    },
    {
      "type": "Action.Submit",
      "title": "Fork Session",
      "data": { "action": "fork_session", "sessionId": "${sessionId}" }
    }
  ]
}
```

### A.5 Progress Card

```json
{
  "$schema": "https://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "Claude is working...",
      "style": "heading"
    },
    {
      "type": "TextBlock",
      "text": "${statusText}",
      "wrap": true
    },
    {
      "type": "ColumnSet",
      "columns": [
        {
          "type": "Column",
          "width": "${percentComplete}",
          "items": [{ "type": "TextBlock", "text": " " }],
          "style": "good"
        },
        {
          "type": "Column",
          "width": "${percentRemaining}",
          "items": [{ "type": "TextBlock", "text": " " }],
          "style": "default"
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "Elapsed: ${elapsed} | Turns: ${turns}/${maxTurns}",
      "isSubtle": true,
      "size": "small"
    }
  ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Stop",
      "style": "destructive",
      "data": { "action": "stop_session" }
    }
  ]
}
```

### A.6 Error Card

```json
{
  "$schema": "https://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    {
      "type": "TextBlock",
      "text": "Error",
      "style": "heading",
      "color": "attention"
    },
    {
      "type": "TextBlock",
      "text": "${errorMessage}",
      "wrap": true,
      "color": "attention"
    },
    {
      "type": "CodeBlock",
      "codeSnippet": "${stackTrace}",
      "language": "PlainText"
    }
  ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Retry",
      "data": { "action": "retry", "originalMessage": "${originalMessage}" }
    },
    {
      "type": "Action.Submit",
      "title": "New Session",
      "data": { "action": "new_session" }
    }
  ]
}
```

---

*Architecture design document for the cc-ms-teams project. Based on research report findings dated 2026-03-17.*
