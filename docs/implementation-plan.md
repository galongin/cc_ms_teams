# cc-ms-teams Implementation Plan

## Bidirectional Claude Code <-> Microsoft Teams Chat Plugin

**Date:** 2026-03-17
**Version:** 1.0
**Status:** Plan Approved
**Predecessor Documents:** [Research Report](./research-report.md), [Architecture Design](./architecture-design.md), [Specification](./specification.md)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Milestone Dependency Graph](#2-milestone-dependency-graph)
3. [Project Directory Structure](#3-project-directory-structure)
4. [Package Dependencies](#4-package-dependencies)
5. [Milestone 1: Project Bootstrap & Core Infrastructure](#5-milestone-1-project-bootstrap--core-infrastructure)
6. [Milestone 2: Teams Bot Foundation](#6-milestone-2-teams-bot-foundation)
7. [Milestone 3: Claude Code Integration](#7-milestone-3-claude-code-integration)
8. [Milestone 4: Message Bridge & Streaming](#8-milestone-4-message-bridge--streaming)
9. [Milestone 5: Adaptive Cards & Rich Output](#9-milestone-5-adaptive-cards--rich-output)
10. [Milestone 6: Authentication & Security](#10-milestone-6-authentication--security)
11. [Milestone 7: Polish, Testing & Documentation](#11-milestone-7-polish-testing--documentation)
12. [Critical Path Analysis](#12-critical-path-analysis)
13. [Risk Register](#13-risk-register)
14. [Definition of Done](#14-definition-of-done)

---

## 1. Executive Summary

This plan decomposes the cc-ms-teams v1.0 plugin into 7 milestones containing 62 tasks total. The scope is personal chat only (no channel/team scope) and file sharing is deferred to a future version. The critical path runs M1 -> M2 -> M3 -> M4 -> M7, as these milestones form the backbone of the bidirectional message flow. Milestones 5 and 6 can proceed in parallel once their dependencies are met.

**Key constraints:**
- Node.js 22+ (ESM-only), TypeScript 5.5+ strict mode
- Teams SDK v2 (`@microsoft/teams.apps`) -- not the deprecated botbuilder v4
- Claude Agent SDK streaming input mode -- not CLI subprocess spawning
- Personal chat scope only (v1.0)
- File sharing service dropped from v1.0
- Developer experience is a top priority (5-minute setup target)

---

## 2. Milestone Dependency Graph

```
                    +---------------------------+
                    |  M1: Project Bootstrap    |
                    |  & Core Infrastructure    |
                    |  (9 tasks)                |
                    +-----------+---------------+
                                |
                    +-----------v---------------+
                    |  M2: Teams Bot            |
                    |  Foundation               |
                    |  (9 tasks)                |
                    +-----------+---------------+
                                |
                +---------------+---------------+
                |                               |
    +-----------v---------------+   +-----------v---------------+
    |  M3: Claude Code          |   |  M6: Authentication       |
    |  Integration              |   |  & Security               |
    |  (10 tasks)               |   |  (9 tasks)                |
    +-----------+---------------+   +-----------+---------------+
                |                               |
    +-----------v---------------+               |
    |  M4: Message Bridge       |               |
    |  & Streaming              |               |
    |  (10 tasks)               |               |
    +-----------+---------------+               |
                |                               |
    +-----------v---------------+               |
    |  M5: Adaptive Cards       |               |
    |  & Rich Output            |               |
    |  (8 tasks)                |               |
    +-----------+---------------+               |
                |                               |
                +---------------+---------------+
                                |
                    +-----------v---------------+
                    |  M7: Polish, Testing      |
                    |  & Documentation          |
                    |  (7 tasks)                |
                    +---------------------------+
```

**Dependency edges:**
- M2 depends on M1 (config system, logging, CLI, tunnel manager)
- M3 depends on M2 (Teams App instance needed for proactive sender reference)
- M4 depends on M3 (session manager output drives message bridge)
- M5 depends on M4 (card renderers are consumed by the Claude-to-Teams transformer)
- M6 depends on M2 (auth middleware plugs into Teams activity pipeline)
- M7 depends on M4, M5, M6 (integration tests require all components)

**Parallelism opportunities:**
- M3 and M6 can run in parallel after M2 completes
- M5 card templates can start once M4 interfaces are defined (partial overlap)

---

## 3. Project Directory Structure

```
cc-ms-teams/
├── src/
│   ├── index.ts                    # ESM entry point (re-exports)
│   ├── cli/
│   │   ├── main.ts                 # CLI entry point (cc-ms-teams command)
│   │   ├── commands/
│   │   │   ├── setup.ts            # Interactive setup wizard
│   │   │   ├── start.ts            # Start the bot server
│   │   │   ├── stop.ts             # Stop running bot (via PID file)
│   │   │   └── status.ts           # Show bot/tunnel/session status
│   │   └── prompts.ts              # Interactive prompt helpers (readline)
│   ├── config/
│   │   ├── schema.ts               # Zod schemas for all config files
│   │   ├── loader.ts               # Load/merge config from file + env + defaults
│   │   ├── defaults.ts             # Default configuration values
│   │   └── paths.ts                # ~/.cc-ms-teams/ path constants
│   ├── logging/
│   │   ├── logger.ts               # Structured JSON logger (pino-based)
│   │   └── audit.ts                # Append-only audit log writer
│   ├── tunnel/
│   │   ├── types.ts                # IDevTunnelManager, TunnelInfo, TunnelStatus
│   │   ├── manager.ts              # Tunnel lifecycle orchestrator
│   │   ├── devtunnel-provider.ts   # MS Dev Tunnels CLI wrapper
│   │   ├── ngrok-provider.ts       # ngrok CLI wrapper (fallback)
│   │   └── health.ts               # Tunnel health check (periodic HTTP ping)
│   ├── bot/
│   │   ├── teams-app.ts            # Teams SDK v2 App factory + MCP plugin
│   │   ├── activity-handlers.ts    # message, card.action, install handlers
│   │   ├── command-parser.ts       # Slash command parsing (/new, /stop, etc.)
│   │   ├── proactive-sender.ts     # Proactive messaging helper (app.send())
│   │   ├── conversation-store.ts   # userId -> conversationId mapping (JSON file)
│   │   └── manifest-generator.ts   # Generate + zip Teams app manifest
│   ├── session/
│   │   ├── types.ts                # ISessionManager, Session, SessionOptions
│   │   ├── session-manager.ts      # SessionPool, getOrCreate, resume, stop
│   │   ├── session-factory.ts      # Create query() with streaming input mode
│   │   ├── stream-input-adapter.ts # AsyncIterable push queue
│   │   ├── output-processor.ts     # Process output loop (SDK messages -> bridge)
│   │   └── permission-handler.ts   # canUseTool callback + pending request map
│   ├── bridge/
│   │   ├── types.ts                # IMessageBridge, MessageContext, TeamsContent
│   │   ├── message-bridge.ts       # Bridge orchestrator (wires transformers)
│   │   ├── teams-to-claude.ts      # TeamsToClaudeTransformer
│   │   ├── claude-to-teams.ts      # ClaudeToTeamsTransformer
│   │   ├── stream-batcher.ts       # StreamBatcherImpl (500ms/200char batching)
│   │   └── content-chunker.ts      # ContentChunker (4KB text / 28KB card limits)
│   ├── cards/
│   │   ├── types.ts                # IAdaptiveCardRenderer, AdaptiveCard types
│   │   ├── renderer.ts             # Main renderer (dispatches to templates)
│   │   ├── language-mapper.ts      # File extension / fence label -> CodeBlock lang
│   │   └── templates/
│   │       ├── code-block.ts       # CodeBlockRenderer
│   │       ├── diff-card.ts        # DiffRenderer (side-by-side + unified fallback)
│   │       ├── progress-card.ts    # ProgressRenderer (thinking/tool indicators)
│   │       ├── error-card.ts       # ErrorRenderer
│   │       ├── permission-card.ts  # PermissionRenderer (approve/deny/always)
│   │       └── session-summary.ts  # Session summary card (FactSet)
│   ├── auth/
│   │   ├── types.ts                # IAuthModule, AuthConfig
│   │   ├── auth-module.ts          # Auth orchestrator (token validation + ACL)
│   │   ├── user-acl.ts             # UserACLStore (whitelist by AAD Object ID)
│   │   └── rate-limiter.ts         # Per-user rate limiter (sliding window)
│   └── utils/
│       ├── async-queue.ts          # Generic typed async queue (used by adapter)
│       ├── retry.ts                # Exponential backoff retry helper
│       └── pid-file.ts             # PID file management for start/stop
├── tests/
│   ├── unit/
│   │   ├── config/
│   │   ├── tunnel/
│   │   ├── bot/
│   │   ├── session/
│   │   ├── bridge/
│   │   ├── cards/
│   │   └── auth/
│   ├── integration/
│   │   ├── bot-message-flow.test.ts
│   │   ├── session-lifecycle.test.ts
│   │   ├── stream-end-to-end.test.ts
│   │   └── permission-flow.test.ts
│   └── mocks/
│       ├── teams-sdk.ts            # Mock Teams App, activities, send
│       ├── claude-sdk.ts           # Mock query(), SDKMessage generator
│       └── tunnel.ts               # Mock tunnel provider
├── assets/
│   ├── icon-color.png              # Teams app icon (192x192)
│   └── icon-outline.png            # Teams app icon outline (32x32)
├── docs/
│   ├── research-report.md
│   ├── architecture-design.md
│   ├── specification.md
│   └── implementation-plan.md      # This document
├── package.json
├── tsconfig.json
├── esbuild.config.ts               # Build configuration
├── vitest.config.ts                 # Test configuration
├── .eslintrc.cjs                    # ESLint config
└── .gitignore
```

---

## 4. Package Dependencies

```jsonc
// package.json
{
  "name": "cc-ms-teams",
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=22.0.0" },
  "bin": {
    "cc-ms-teams": "./dist/cli/main.js"
  },
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "esbuild src/cli/main.ts --bundle --platform=node --format=esm --outdir=dist --packages=external",
    "dev": "tsx src/cli/main.ts",
    "start": "node dist/cli/main.js start",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/ tests/",
    "typecheck": "tsc --noEmit"
  },

  "dependencies": {
    // Teams SDK v2
    "@microsoft/teams.apps": "^2.0.0",
    "@microsoft/teams.api": "^2.0.0",
    "@microsoft/teams.mcp": "^2.0.0",

    // Claude Agent SDK
    "@anthropic-ai/claude-agent-sdk": "^1.0.0",

    // Validation
    "zod": "^3.24.0",

    // Logging
    "pino": "^9.6.0",
    "pino-pretty": "^13.0.0",

    // CLI
    "commander": "^13.1.0",

    // Utilities
    "archiver": "^7.0.0"          // ZIP manifest generation
  },

  "devDependencies": {
    // TypeScript
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",

    // Build
    "esbuild": "^0.25.0",
    "tsx": "^4.19.0",

    // Testing
    "vitest": "^3.0.0",
    "@vitest/coverage-v8": "^3.0.0",

    // Linting
    "eslint": "^9.19.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",

    // Type stubs
    "@types/archiver": "^6.0.0"
  }
}
```

**Dependency rationale:**

| Package | Why This One | Alternatives Considered |
|---------|-------------|------------------------|
| `@microsoft/teams.apps` v2 | Official Teams SDK v2, replaces deprecated botbuilder v4. Required for `App` class, MCP plugin support. | `botbuilder` v4 (deprecated, no MCP) |
| `@anthropic-ai/claude-agent-sdk` | Official SDK for Claude Code sessions with streaming input mode, `canUseTool`, hooks. | Claude CLI subprocess (brittle, no streaming input) |
| `zod` | Runtime schema validation for config, MCP tool params. Already required by `@microsoft/teams.mcp`. | `joi` (heavier), `ajv` (more verbose) |
| `pino` | Fast structured JSON logging. Low overhead, native Node.js stream support. | `winston` (slower), `bunyan` (unmaintained) |
| `commander` | Lightweight CLI framework. Good TypeScript support, well-maintained. | `yargs` (heavier), `meow` (less featured) |
| `esbuild` | Fast TypeScript bundling. ESM output, tree-shaking, external packages mode. | `tsup` (esbuild wrapper), `rollup` (slower) |
| `vitest` | Fast test runner, native ESM and TypeScript support, compatible with Jest API. | `jest` (ESM issues), `node:test` (less featured) |

---

## 5. Milestone 1: Project Bootstrap & Core Infrastructure

**Goal:** Establish the TypeScript project skeleton, configuration system, logging, CLI entry point, and dev tunnel manager. After this milestone, a developer can run `cc-ms-teams status` and see a tunnel URL.

**Task count:** 9
**Estimated complexity:** Mixed (3S, 4M, 2L)
**Dependencies:** None (starting milestone)

### Tasks

#### M1-T1: Initialize TypeScript project with ESM configuration [S]

**What:** Create `package.json` (type: module), `tsconfig.json` (strict, ESM, Node22), `.gitignore`, `.eslintrc.cjs`. Set up esbuild config for bundling.

**Files:**
- `package.json`
- `tsconfig.json`
- `esbuild.config.ts`
- `.eslintrc.cjs`
- `.gitignore`

**Acceptance criteria:**
- `npm install` succeeds with no peer dependency warnings
- `npx tsc --noEmit` passes on empty src/index.ts
- `npm run build` produces ESM output in `dist/`
- `.gitignore` excludes `node_modules/`, `dist/`, `.env`, `*.tgz`

---

#### M1-T2: Create vitest test infrastructure [S]

**What:** Configure vitest with TypeScript support, coverage reporting, path aliases. Create a trivial test to validate the runner works.

**Files:**
- `vitest.config.ts`
- `tests/unit/smoke.test.ts`

**Acceptance criteria:**
- `npm test` runs and passes the smoke test
- `npm run test:coverage` generates a coverage report
- Test files use `.test.ts` extension and ESM imports

---

#### M1-T3: Configuration system with zod schemas [M]

**What:** Implement the configuration loader that reads from `~/.cc-ms-teams/config.json`, merges environment variable overrides, and validates against zod schemas. Create the schema definitions for all config sections (bot, auth, tunnel, session, logging).

**Files:**
- `src/config/schema.ts` -- All zod schemas
- `src/config/defaults.ts` -- Default values for every setting
- `src/config/loader.ts` -- Load, merge, validate logic
- `src/config/paths.ts` -- `~/.cc-ms-teams/` path constants

**Acceptance criteria:**
- Config loads from file when present, uses defaults when absent
- Environment variables override file values (e.g., `ANTHROPIC_API_KEY`, `CC_MS_TEAMS_PORT`)
- Zod validation rejects invalid config with descriptive error messages
- `~/.cc-ms-teams/` directory is created on first access with `0700` permissions
- Config file is written with `0600` permissions (owner read/write only)

---

#### M1-T4: Structured JSON logging framework [M]

**What:** Create a pino-based logger with structured JSON output. Support log levels, child loggers per component, and pretty-print mode for development. Create the audit log writer (JSONL append-only).

**Files:**
- `src/logging/logger.ts`
- `src/logging/audit.ts`

**Acceptance criteria:**
- Logger produces JSON lines to stderr by default
- `--verbose` flag enables debug-level logging
- Pretty-print mode activates when `NODE_ENV=development` or `--dev` flag
- Each log entry includes timestamp, level, component name, and message
- Audit logger appends to `~/.cc-ms-teams/audit.jsonl` with entries containing: timestamp, userId, action, details
- Audit file grows append-only (no truncation on restart)

---

#### M1-T5: CLI entry point with commander [M]

**What:** Create the `cc-ms-teams` CLI command with subcommands: `setup`, `start`, `stop`, `status`. Wire up the argument parser, load config, initialize logging. Implement `status` first (other commands are stubs).

**Files:**
- `src/cli/main.ts` -- Commander program definition
- `src/cli/commands/setup.ts` -- Stub
- `src/cli/commands/start.ts` -- Stub
- `src/cli/commands/stop.ts` -- Stub
- `src/cli/commands/status.ts` -- Show config, tunnel status, session info

**Acceptance criteria:**
- `cc-ms-teams --help` displays all commands with descriptions
- `cc-ms-teams --version` shows package version
- `cc-ms-teams status` reports config file location, tunnel state (not running), and session count (0)
- Unknown commands print help text
- `cc-ms-teams start --port 4000 --dev` accepts flag overrides

---

#### M1-T6: PID file management for start/stop [S]

**What:** Implement PID file creation/checking/cleanup for the `start` and `stop` commands. The PID file prevents multiple instances from running simultaneously.

**Files:**
- `src/utils/pid-file.ts`

**Acceptance criteria:**
- `start` writes PID file to `~/.cc-ms-teams/bot.pid`
- `start` fails with a clear message if PID file exists and process is alive
- `start` cleans stale PID files (process no longer running)
- `stop` reads PID file, sends SIGTERM, waits up to 10s, then SIGKILL
- `stop` reports "not running" if no PID file or stale PID

---

#### M1-T7: Dev tunnel manager -- provider abstraction [L]

**What:** Create the `IDevTunnelManager` interface and the `DevTunnelProvider` that wraps the MS Dev Tunnels CLI. Implement tunnel creation, URL resolution, and graceful shutdown. Persist tunnel ID for reuse across restarts.

**Files:**
- `src/tunnel/types.ts`
- `src/tunnel/manager.ts`
- `src/tunnel/devtunnel-provider.ts`

**Acceptance criteria:**
- `TunnelManager.start()` spawns `devtunnel host` and resolves with a HTTPS URL
- Tunnel ID is persisted to `~/.cc-ms-teams/tunnel.json` for reuse
- `TunnelManager.stop()` kills the tunnel process gracefully
- If `devtunnel` CLI is not installed, throws a descriptive error with install instructions
- Status change events fire for: starting, connected, disconnected, error
- Tunnel process stdout/stderr is captured into the logger

---

#### M1-T8: Dev tunnel manager -- ngrok fallback [M]

**What:** Implement the `NgrokProvider` as a fallback when MS Dev Tunnels is unavailable. Same interface, wraps `ngrok http` CLI command.

**Files:**
- `src/tunnel/ngrok-provider.ts`

**Acceptance criteria:**
- `NgrokProvider` implements the same provider interface as `DevTunnelProvider`
- `TunnelManager` auto-selects ngrok when devtunnel CLI is not found
- User can force a provider via `--tunnel-provider ngrok` flag or config
- ngrok auth token is read from config or `NGROK_AUTH_TOKEN` env var
- If neither tunnel CLI is available, error message lists both installation options

---

#### M1-T9: Dev tunnel health monitoring [M]

**What:** Implement periodic health checks for the tunnel. Ping the tunnel URL endpoint every 30 seconds. Emit status change events on failure. Attempt automatic reconnection.

**Files:**
- `src/tunnel/health.ts`

**Acceptance criteria:**
- Health check pings the tunnel URL at `/health` every 30 seconds
- Three consecutive failures trigger a `disconnected` status event
- On disconnect, the manager attempts to restart the tunnel process
- After successful reconnection, logs the new URL (if changed)
- Health check stops cleanly on `TunnelManager.stop()`
- Configurable check interval (default 30s) and failure threshold (default 3)

---

### Milestone 1 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MS Dev Tunnels CLI has breaking changes | Medium | Medium | Pin to known-good version in setup docs; ngrok fallback available |
| Teams SDK v2 npm package not yet published | Low | High | Check npm registry before starting; fall back to GitHub package registry |
| devtunnel CLI requires Azure login, adding setup friction | Medium | Low | Document in setup wizard; offer ngrok as simpler alternative |

---

## 6. Milestone 2: Teams Bot Foundation

**Goal:** Establish a working Teams bot that can receive messages, echo them back, and respond to slash commands. After this milestone, a developer can send a message in Teams and see it echoed back.

**Task count:** 9
**Estimated complexity:** Mixed (2S, 4M, 3L)
**Dependencies:** M1 (config, logging, CLI, tunnel)

### Tasks

#### M2-T1: Azure Bot registration helper [L]

**What:** Implement the `cc-ms-teams setup` interactive wizard. Guides the user through Azure Bot creation, collects credentials, validates them, stores in config. Opens the Azure portal URL, provides step-by-step instructions, and prompts for the resulting values.

**Files:**
- `src/cli/commands/setup.ts`
- `src/cli/prompts.ts` -- readline-based interactive prompts

**Acceptance criteria:**
- Wizard runs as `cc-ms-teams setup` with colored terminal output
- Validates Bot App ID format (UUID), API key format (sk-ant-*)
- Stores credentials in `~/.cc-ms-teams/config.json` with `0600` permissions
- Can be re-run to update credentials (prompts show current values)
- Creates the `~/.cc-ms-teams/` directory if it doesn't exist
- Tests the Bot App ID/Password by attempting token acquisition from Azure AD
- Exits with clear error if Azure token acquisition fails (bad credentials)

---

#### M2-T2: App manifest generation and packaging [M]

**What:** Generate the Teams app manifest JSON from config values, bundle it with icons into a `.zip` file for sideloading. Part of the setup wizard flow.

**Files:**
- `src/bot/manifest-generator.ts`
- `assets/icon-color.png`
- `assets/icon-outline.png`

**Acceptance criteria:**
- Generates `manifest.json` with bot ID, tunnel domain, command list
- Packages `manifest.json` + icons into `~/.cc-ms-teams/manifest.zip`
- Manifest validates against Teams schema v1.17
- Scopes are `["personal"]` only (no team/channel in v1.0)
- Setup wizard prints clear sideloading instructions after generating manifest
- Re-running setup regenerates the manifest with updated tunnel URL

---

#### M2-T3: Teams SDK v2 App class initialization [L]

**What:** Create the `createTeamsApp()` factory function that initializes the Teams SDK v2 `App` class with the MCP plugin, DevTools plugin (dev mode), and configured port. Wire it into the `start` command.

**Files:**
- `src/bot/teams-app.ts`

**Acceptance criteria:**
- `App` instance starts an HTTP server on the configured port (default 3978)
- MCP plugin registers `sendToUser` and `askUser` tools (stub implementations initially)
- DevTools plugin loads only when `--dev` flag is set
- Server responds to `POST /api/messages` (Azure Bot Service activity endpoint)
- Server responds to `GET /health` with 200 OK and JSON status body
- Graceful shutdown on SIGTERM/SIGINT (close server, cleanup resources)

---

#### M2-T4: Conversation store for proactive messaging [S]

**What:** Implement the `ConversationStore` that persists user-to-conversation ID mappings for proactive messaging. JSON file backed, loaded on startup.

**Files:**
- `src/bot/conversation-store.ts`

**Acceptance criteria:**
- Maps AAD Object ID to Teams conversation ID
- Persists to `~/.cc-ms-teams/conversations.json` on every write
- Loaded into memory on startup
- Handles concurrent writes safely (write-after-read with temp file rename)
- `set()`, `get()`, `delete()`, `getAll()` methods

---

#### M2-T5: Activity handlers -- message and install [L]

**What:** Register the `message` and `install.add` activity handlers on the Teams App. The message handler authenticates (stub), stores conversation ID, checks for slash commands, and for now echoes the message back. The install handler stores conversation ID and sends a welcome message.

**Files:**
- `src/bot/activity-handlers.ts`

**Acceptance criteria:**
- Incoming message is logged (structured, including userId and text length)
- Conversation ID is stored in ConversationStore on every message
- Messages starting with `/` are routed to the command parser
- Non-command messages are echoed back with "Echo: {text}" (temporary until M3)
- Bot install sends welcome message with `/help` suggestion
- Typing indicator is sent before processing

---

#### M2-T6: Slash command parser [M]

**What:** Parse incoming messages for slash commands: `/new`, `/stop`, `/project`, `/model`, `/permission`, `/sessions`, `/handoff`, `/status`, `/help`. Return structured command objects.

**Files:**
- `src/bot/command-parser.ts`

**Acceptance criteria:**
- Parses `/command arg1 arg2` format
- Handles commands case-insensitively (`/New` = `/new`)
- Returns `null` for non-command messages
- Returns `{ command, args }` for valid commands
- Unknown commands return a helpful error message listing valid commands
- `/help` generates a formatted help text with all commands and descriptions

---

#### M2-T7: Proactive sender implementation [M]

**What:** Implement the `ProactiveSender` that can push messages back to users outside the normal request/response cycle using `app.send()`. Handles throttling (429 responses) with exponential backoff.

**Files:**
- `src/bot/proactive-sender.ts`
- `src/utils/retry.ts` -- exponential backoff helper

**Acceptance criteria:**
- `sendToUser(userId, text)` resolves the conversation ID from store and sends
- `sendCardToUser(userId, card)` sends an Adaptive Card attachment
- `askAndWait(question, timeout)` sends a message and returns a Promise that resolves with the user's next message (with configurable timeout)
- On 429 (rate limited), retries with exponential backoff (1s, 2s, 4s, max 30s)
- On 403 (bot removed), removes conversation from store and logs warning
- Messages dropped after 2 minutes of failed retries (logged as error)

---

#### M2-T8: Health check endpoint [S]

**What:** Add a `GET /health` endpoint to the bot HTTP server. Returns JSON with bot status, tunnel status, uptime, and session count.

**Files:**
- Modified: `src/bot/teams-app.ts`

**Acceptance criteria:**
- `GET /health` returns 200 with `{ status: "ok", uptime: <seconds>, tunnel: "connected"|"disconnected", sessions: <count> }`
- Returns 503 if bot is shutting down
- No authentication required (health checks come from tunnel provider)

---

#### M2-T9: Local testing workflow with start command [M]

**What:** Wire everything together in the `start` command: load config, start tunnel, start Teams App, register handlers, write PID file. Implement the `stop` command that reads PID and sends SIGTERM.

**Files:**
- `src/cli/commands/start.ts`
- `src/cli/commands/stop.ts`

**Acceptance criteria:**
- `cc-ms-teams start` boots the full stack: tunnel -> HTTP server -> handlers
- Startup log shows: tunnel URL, server port, bot ID (masked), health check URL
- `cc-ms-teams start --dev` enables dev mode (DevTools, relaxed auth)
- `cc-ms-teams stop` gracefully shuts down (tunnel, server, sessions)
- `SIGINT` (Ctrl+C) triggers graceful shutdown in same order
- Startup fails fast if config is missing required fields (bot ID, bot password)

---

### Milestone 2 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Teams SDK v2 `App` class API differs from docs/preview | Medium | High | Build against published types; wrap in thin adapter layer for easy swapping |
| Azure Bot Service free tier throttling during development | Low | Medium | Rate-limit proactive messages; batch updates |
| Sideloading custom apps may be disabled in target Teams tenant | Medium | Medium | Document tenant admin requirements; test with Teams Developer Portal |

---

## 7. Milestone 3: Claude Code Integration

**Goal:** Establish working Claude Agent SDK sessions with streaming input mode. After this milestone, a Teams message produces a Claude Code response (plain text, no rich cards yet).

**Task count:** 10
**Estimated complexity:** Mixed (2S, 4M, 4L)
**Dependencies:** M2 (Teams App, proactive sender, activity handlers)

### Tasks

#### M3-T1: StreamInputAdapter implementation [M]

**What:** Implement the `StreamInputAdapterImpl` -- an async iterable push queue that bridges imperative `push(message)` calls from the Teams message handler to the Claude Agent SDK's async generator input.

**Files:**
- `src/session/stream-input-adapter.ts`
- `src/utils/async-queue.ts` -- generic typed async queue

**Acceptance criteria:**
- `push(message)` enqueues a user message
- If a consumer is already waiting (blocked on `next()`), it resolves immediately
- `close()` signals end-of-stream to the consumer
- Pushing after `close()` throws an error
- Implements `Symbol.asyncIterator` protocol
- Unit test: push 3 messages, consume them async, verify order preserved

---

#### M3-T2: SessionFactory -- create query with streaming input [L]

**What:** Implement `SessionFactory.createSession()` that calls `query()` from the Claude Agent SDK with the `StreamInputAdapter` as the prompt source. Configure `cwd`, `model`, `maxTurns`, `allowedTools`, `systemPrompt`, and `includePartialMessages`.

**Files:**
- `src/session/session-factory.ts`

**Acceptance criteria:**
- Creates a `query()` with `prompt: inputAdapter` (streaming input mode)
- Default model is `claude-sonnet-4-20250514` (configurable)
- Default allowed tools: `["Read", "Grep", "Glob"]` (read-only tier)
- System prompt uses `{ type: 'preset', preset: 'claude_code' }` with optional append
- `maxTurns` defaults to 50 (configurable)
- `maxBudgetUsd` defaults to 1.00 (configurable)
- Session object is returned with all fields populated including generated session ID

---

#### M3-T3: SessionManager -- pool and lifecycle [L]

**What:** Implement `SessionManager` that maintains a Map of userId -> Session. Supports `getOrCreateSession`, `stopSession`, `listSessions`, `shutdown`. Enforces one active session per user.

**Files:**
- `src/session/session-manager.ts`
- `src/session/types.ts`

**Acceptance criteria:**
- `getOrCreateSession(userId)` returns existing active session or creates new one
- `stopSession(userId)` interrupts the query and marks session as stopped
- `listSessions(userId)` returns session info (ID, cwd, model, status, cost, turns)
- `shutdown()` stops all active sessions gracefully
- Session metadata persists to `~/.cc-ms-teams/sessions.json` for resume-on-restart
- Attempting to create a second active session for a user stops the first one

---

#### M3-T4: Output processor loop [L]

**What:** Implement the `processOutputLoop()` that iterates over `query()` output messages and forwards them to Teams via the proactive sender. Handle `assistant`, `result`, and `partial` message types.

**Files:**
- `src/session/output-processor.ts`

**Acceptance criteria:**
- `assistant` messages are sent as plain text to Teams (rich cards come in M4/M5)
- `result` messages update session cost/status and send a summary
- `partial` messages are buffered (stub for now; proper batching in M4)
- Errors in the output loop are caught, logged, and sent as error messages to Teams
- Loop exits cleanly when session is stopped or query completes
- Session status transitions: idle -> active (on output) -> idle (on result) -> stopped (on error/stop)

---

#### M3-T5: Send message flow (Teams -> Claude) [M]

**What:** Wire the activity handler to push messages into the session's StreamInputAdapter. Replace the echo handler from M2-T5 with actual Claude Code query routing.

**Files:**
- Modified: `src/bot/activity-handlers.ts`
- Modified: `src/session/session-manager.ts`

**Acceptance criteria:**
- User message in Teams creates a session (if none exists) and pushes the message
- Session output appears back in Teams as plain text messages
- Typing indicator is shown while Claude is processing
- If session creation fails (e.g., missing API key), user receives an error message
- Second message to an active session is queued and processed in order

---

#### M3-T6: Tool permission configuration -- canUseTool callback [L]

**What:** Implement the `canUseTool` callback that intercepts Claude Code tool use requests. For tools not in the session's allowed list, send a permission request message to Teams and wait for user response.

**Files:**
- `src/session/permission-handler.ts`

**Acceptance criteria:**
- Tools in the session's `allowedTools` are auto-approved (no prompt)
- Tools in the session's `allowedToolsOverrides` set are auto-approved
- All other tools trigger a permission prompt message to Teams
- User can respond with "approve", "deny", or "always allow" (plain text for now; cards in M5)
- "Always allow" adds the tool to the session's override set
- Permission requests timeout after 5 minutes (configurable), defaulting to deny
- AbortSignal cancellation resolves the permission request as deny
- Concurrent permission requests for different tools are handled independently

---

#### M3-T7: Working directory management [S]

**What:** Implement the `/project` command that sets the working directory for the user's session. Validate the path exists and is a directory.

**Files:**
- Modified: `src/bot/activity-handlers.ts`
- Modified: `src/session/session-manager.ts`

**Acceptance criteria:**
- `/project /path/to/dir` sets the session's cwd
- Path is validated (exists, is a directory)
- If a session is active, it is stopped and a new one created with the new cwd
- `/project` with no argument shows the current working directory
- Default cwd is the user's home directory (or cwd of the bot process)

---

#### M3-T8: Session resume on restart [M]

**What:** Implement session resume: on bot startup, read `sessions.json` and offer to resume active sessions. Implement `/sessions` and `/handoff` commands.

**Files:**
- Modified: `src/session/session-manager.ts`

**Acceptance criteria:**
- On startup, previously-active sessions are listed as "resumable"
- User can send `/sessions` to see list and `/handoff <sessionId>` to resume
- Resume uses the SDK's `{ resume: sessionId }` option
- If resume fails (session expired), user is informed and a new session is created
- Session metadata (cwd, model, cost) is preserved across resume

---

#### M3-T9: Model selection command [S]

**What:** Implement the `/model` command to switch the Claude model for the user's session.

**Files:**
- Modified: `src/bot/activity-handlers.ts`
- Modified: `src/session/session-manager.ts`

**Acceptance criteria:**
- `/model claude-sonnet-4-20250514` sets the model for the next session
- `/model` with no argument shows the current model
- Validates model name against a known list (claude-sonnet-4-20250514, claude-opus-4-20250514)
- Model change takes effect on the next session (does not restart current session)

---

#### M3-T10: Permission mode commands [M]

**What:** Implement the `/permission` command to change the tool permission tier.

**Files:**
- Modified: `src/bot/activity-handlers.ts`
- Modified: `src/session/session-manager.ts`

**Acceptance criteria:**
- `/permission` shows current tier and available tiers
- `/permission readonly` sets allowed tools to Read, Grep, Glob
- `/permission acceptEdits` adds Write, Edit to allowed tools
- `/permission bypassPermissions` sets permission mode to bypass (all tools allowed)
- Permission change takes effect on the current session (updates allowedTools)
- Warning message shown when escalating to bypassPermissions

---

### Milestone 3 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Claude Agent SDK streaming input API changes before stable release | Medium | High | Pin SDK version; wrap in thin adapter; monitor SDK changelog |
| Session resume (`{ resume: sessionId }`) may not work across process restarts | Medium | Medium | Test early; implement fallback "new session with context summary" |
| `canUseTool` callback blocks the entire query pipeline | Low | Medium | Run permission handler in separate async context; timeout prevents deadlock |
| Anthropic API rate limits during development | Medium | Low | Use mock SDK for unit tests; limit integration test frequency |

---

## 8. Milestone 4: Message Bridge & Streaming

**Goal:** Implement bidirectional message format transformation with streaming support. After this milestone, Claude Code responses are properly formatted, streamed with batching, and chunked for Teams size limits.

**Task count:** 10
**Estimated complexity:** Mixed (2S, 5M, 3L)
**Dependencies:** M3 (session manager, output processor)

### Tasks

#### M4-T1: TeamsToClaudeTransformer [S]

**What:** Implement the transformer that strips @mention tags, normalizes whitespace, and converts Teams message text into a clean prompt string for the Claude Agent SDK.

**Files:**
- `src/bridge/teams-to-claude.ts`

**Acceptance criteria:**
- Strips `<at>Claude Code</at>` prefix and variants
- Normalizes excessive whitespace
- Returns clean prompt string
- Throws `EmptyMessageError` for empty-after-processing messages
- Handles HTML entities from Teams (`&amp;`, `&lt;`, etc.)

---

#### M4-T2: ClaudeToTeamsTransformer -- text and tool_use blocks [L]

**What:** Implement the transformer that converts Claude SDK `SDKAssistantMessage` content blocks into `TeamsContent` items. Parse markdown for code fences, route `tool_use` blocks to appropriate renderers.

**Files:**
- `src/bridge/claude-to-teams.ts`

**Acceptance criteria:**
- Text blocks are returned as `TeamsContent` text items
- Code fences (` ```lang ... ``` `) are extracted and returned as card items (using card renderer)
- `tool_use` blocks for Edit/Write tools generate diff card items
- `tool_use` blocks for other tools generate tool summary card items
- `result` messages generate session summary card items
- Mixed content (text + code + text) preserves ordering

---

#### M4-T3: ClaudeToTeamsTransformer -- markdown parser [M]

**What:** Implement the markdown segment parser that splits Claude response text into alternating text and code block segments.

**Files:**
- Modified: `src/bridge/claude-to-teams.ts`

**Acceptance criteria:**
- Correctly extracts ` ```language\n...\n``` ` blocks with language labels
- Handles nested backticks (e.g., inline `` `code` `` is not confused with fences)
- Handles fences without language labels (default to PlainText)
- Preserves text between code blocks
- Handles adjacent code blocks with no text between them
- Handles code blocks at the start or end of the text

---

#### M4-T4: StreamBatcher implementation [L]

**What:** Implement `StreamBatcherImpl` that accumulates partial message tokens and flushes them to Teams at intelligent boundaries (500ms timer or 200 character threshold).

**Files:**
- `src/bridge/stream-batcher.ts`

**Acceptance criteria:**
- Tokens are buffered until flush conditions are met
- Timer-based flush every 500ms (configurable)
- Threshold-based flush at 200 characters (configurable)
- Code fence detection: tokens within a code fence are buffered until the fence closes
- Code fences are flushed as card items (not text)
- `pushToolUse()` triggers an immediate flush
- `flush()` sends all pending content via the send function
- `stop()` flushes remaining content (including incomplete code blocks)

---

#### M4-T5: ContentChunker for long responses [M]

**What:** Implement the `ContentChunker` that splits text exceeding Teams limits (4KB per message) at paragraph/sentence/word boundaries.

**Files:**
- `src/bridge/content-chunker.ts`

**Acceptance criteria:**
- Text under 4000 chars is returned as-is (single chunk)
- Long text is split at paragraph boundaries (double newline) when possible
- Falls back to sentence boundaries (period + space) when paragraphs are too long
- Falls back to word boundaries when sentences are too long
- Hard split at 4000 chars when no word boundary is found
- Each chunk is trimmed of leading/trailing whitespace
- Empty chunks are filtered out

---

#### M4-T6: Card payload size enforcement (28KB limit) [M]

**What:** Add card payload size checking to the card renderer. When a card exceeds 25KB of JSON, truncate code blocks and strip optional elements.

**Files:**
- Modified: `src/cards/renderer.ts`
- `src/bridge/content-chunker.ts` -- add card-level chunking

**Acceptance criteria:**
- Cards exceeding 25KB are detected before sending
- First pass: strip optional elements (VS Code links, subtitle text blocks)
- Second pass: truncate code with "... (truncated, N more lines)" suffix
- Third pass: split into multiple cards with "Part 1/N" headers
- Final card JSON is always under 28KB
- Truncation is logged as a warning

---

#### M4-T7: Progressive message updates (edit-in-place) [L]

**What:** Implement edit-in-place for streaming responses. Send an initial message, then update it as more content arrives, rather than sending many small messages. Use the Teams SDK's message update capability.

**Files:**
- Modified: `src/bot/proactive-sender.ts`
- Modified: `src/bridge/stream-batcher.ts`

**Acceptance criteria:**
- First flush creates a new message and stores its activity ID
- Subsequent flushes update the same message (edit-in-place)
- When content transitions from text to card, a new message is created (cards cannot be edited into text messages)
- Maximum 1 update per second per message (throttled)
- If update fails, fall back to sending a new message
- Final flush marks the message as "complete" (no more updates)

---

#### M4-T8: Message Bridge orchestrator [M]

**What:** Create the `MessageBridge` class that wires together the transformers, batcher, and chunker. Implements `IMessageBridge` interface.

**Files:**
- `src/bridge/message-bridge.ts`
- `src/bridge/types.ts`

**Acceptance criteria:**
- `teamsToClaudeMessage()` calls TeamsToClaudeTransformer and returns clean prompt
- `claudeToTeamsContent()` calls ClaudeToTeamsTransformer and returns content items
- `createStreamBatcher()` returns a configured StreamBatcher for a conversation
- All content passes through ContentChunker before sending
- Bridge is injectable (constructor takes transformer instances)

---

#### M4-T9: Wire message bridge into output processor [M]

**What:** Replace the plain text output from M3-T4 with the message bridge. Output processor now uses `claudeToTeamsContent()` for complete messages and `StreamBatcher` for partial messages.

**Files:**
- Modified: `src/session/output-processor.ts`

**Acceptance criteria:**
- `assistant` messages pass through ClaudeToTeamsTransformer
- `partial` messages pass through StreamBatcher
- `result` messages produce session summary cards
- Streaming tokens appear in Teams with edit-in-place updates
- Code blocks in streaming responses are properly detected and rendered as cards

---

#### M4-T10: Message history tracking [S]

**What:** Track sent message activity IDs for edit-in-place and conversation context. Store the last N message IDs per conversation for reference.

**Files:**
- Modified: `src/bot/proactive-sender.ts`

**Acceptance criteria:**
- Each sent message's activity ID is stored (last 50 per conversation)
- Activity IDs are available for message updates
- Old IDs are evicted when the buffer is full
- IDs are not persisted to disk (in-memory only, lost on restart)

---

### Milestone 4 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Teams message update API has rate limits or latency | Medium | Medium | Throttle to 1 update/sec; fall back to new messages if update fails |
| StreamBatcher code fence detection fails on malformed markdown | Medium | Low | Flush incomplete code blocks as plain text on timeout; comprehensive test cases |
| 28KB card limit is exceeded by large diffs from Claude | Medium | Medium | ContentChunker multi-card split; truncation with line count indicator |

---

## 9. Milestone 5: Adaptive Cards & Rich Output

**Goal:** Implement all Adaptive Card templates for rich code rendering, diffs, progress indicators, errors, and permission prompts. After this milestone, all Claude Code outputs are beautifully rendered in Teams.

**Task count:** 8
**Estimated complexity:** Mixed (1S, 5M, 2L)
**Dependencies:** M4 (ClaudeToTeamsTransformer consumes card renderer)

### Tasks

#### M5-T1: CodeBlockRenderer with syntax highlighting [M]

**What:** Implement the code block Adaptive Card template using the `CodeBlock` element with language detection and optional file path headers.

**Files:**
- `src/cards/templates/code-block.ts`
- `src/cards/language-mapper.ts`

**Acceptance criteria:**
- Generates Adaptive Card JSON with `CodeBlock` element
- Language is mapped from code fence label or file extension (22 languages supported)
- Optional file path header (TextBlock with accent color)
- Optional line number range display
- Optional "Open in VS Code" action (generates `vscode://file` URL)
- Code blocks >100 lines are split into multiple cards with Part headers
- `startLineNumber` is set when line range is provided

---

#### M5-T2: DiffRenderer with side-by-side and unified modes [L]

**What:** Implement the diff card template using `ColumnSet` with before/after `CodeBlock` elements. Fall back to unified diff format for large diffs (>20 lines per side).

**Files:**
- `src/cards/templates/diff-card.ts`

**Acceptance criteria:**
- Side-by-side rendering with "Before" / "After" column headers
- Both columns use `CodeBlock` with correct language
- File path header with attention color
- Diffs >20 lines per side fall back to unified diff in a single CodeBlock
- Unified diff uses PlainText language (no syntax highlighting)
- Handles empty "before" (new file) and empty "after" (deleted file)

---

#### M5-T3: ProgressRenderer for thinking/tool-use indicators [M]

**What:** Implement the progress card that shows Claude Code's current activity (thinking, reading files, writing code, running commands). Uses a simulated progress bar via ColumnSet.

**Files:**
- `src/cards/templates/progress-card.ts`

**Acceptance criteria:**
- Shows status text ("Reading files and analyzing code structure")
- Shows elapsed time
- Optional percentage via ColumnSet width trick (accent column vs empty column)
- Card is updated in-place as progress changes (uses message update)
- Shows tool name when a tool is being executed

---

#### M5-T4: ErrorRenderer for user-friendly error cards [M]

**What:** Implement the error card with attention styling, error message, optional stack trace, and retry/new-session action buttons.

**Files:**
- `src/cards/templates/error-card.ts`

**Acceptance criteria:**
- Container with attention style
- Error type as heading (e.g., "Session Error", "API Error", "Timeout")
- Error message as wrapped TextBlock
- Optional stack trace in CodeBlock (PlainText)
- "Retry" and "New Session" action buttons (Action.Submit)
- Recoverable errors show retry; non-recoverable show new session only
- Stack trace is truncated to 10 lines with "... N more lines" suffix

---

#### M5-T5: PermissionRenderer for approve/deny/always-allow cards [L]

**What:** Implement the permission request card that shows the tool name, input preview, risk description, and three action buttons (Approve, Deny, Always Allow).

**Files:**
- `src/cards/templates/permission-card.ts`

**Acceptance criteria:**
- Warning-colored heading "Permission Required"
- Shows tool name in bold
- Shows tool input as CodeBlock (truncated to 500 chars)
- Shows risk description based on tool type (e.g., "can execute arbitrary commands" for Bash)
- Three Action.Submit buttons: Approve (positive style), Deny (destructive style), Always Allow
- Action data includes `requestId` and `toolName` for handler routing
- For Edit/Write tools, shows the file path and a preview of the changes

---

#### M5-T6: Session summary card [M]

**What:** Implement the session summary card shown when a Claude Code query completes. Uses FactSet for stats and action buttons for resume/fork.

**Files:**
- `src/cards/templates/session-summary.ts`

**Acceptance criteria:**
- "Session Complete" heading with good (green) color
- FactSet with: Duration, Cost ($X.XX), Turns, Session ID
- Result summary text (first 200 chars of Claude's final response)
- "Resume Session" and "Fork Session" action buttons
- Action data includes session ID
- Cost formatted as USD with 2 decimal places
- Duration formatted as human-readable (Xm Ys)

---

#### M5-T7: Card action handlers [M]

**What:** Wire up the `card.action` activity handler to process Adaptive Card button clicks. Route approve/deny/always-allow to the permission handler. Route resume/fork to the session manager.

**Files:**
- Modified: `src/bot/activity-handlers.ts`

**Acceptance criteria:**
- `approve_tool` resolves the pending permission request as allow
- `deny_tool` resolves as deny
- `always_allow_tool` resolves as always_allow and adds to session overrides
- `resume_session` resumes the specified session
- `fork_session` creates a new session with the same history
- Unknown actions logged as warnings
- Action buttons are disabled after click (card update removes buttons or shows "Approved")

---

#### M5-T8: Adaptive Card Renderer orchestrator [S]

**What:** Create the main `AdaptiveCardRenderer` class that implements `IAdaptiveCardRenderer` by delegating to template functions. Includes `detectLanguage()` utility.

**Files:**
- `src/cards/renderer.ts`
- `src/cards/types.ts`

**Acceptance criteria:**
- Implements all methods of `IAdaptiveCardRenderer`
- Delegates to individual template functions
- `detectLanguage(filePath)` maps file extensions to CodeBlock language names
- All cards use schema `https://adaptivecards.io/schemas/adaptive-card.json` and version `1.5`

---

### Milestone 5 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CodeBlock element not available in all Teams clients (mobile/web) | Low | Medium | Test on all three clients; fall back to plain text monospace for clients that don't support CodeBlock |
| ColumnSet side-by-side rendering looks bad on mobile | Medium | Low | Detect narrow viewports where possible; prefer unified diff on mobile |
| Card action buttons cannot be disabled after click in all clients | Medium | Low | Update card body to show "Action taken" text; log duplicate clicks |

---

## 10. Milestone 6: Authentication & Security

**Goal:** Implement production-grade authentication, authorization, rate limiting, and audit logging. After this milestone, the bot is secure for real-world use.

**Task count:** 9
**Estimated complexity:** Mixed (2S, 5M, 2L)
**Dependencies:** M2 (Teams App, activity pipeline)

### Tasks

#### M6-T1: Azure AD token validation [L]

**What:** Implement the Azure AD token validation middleware. Validate the bearer token in incoming bot activities against the Azure AD tenant. Uses the Teams SDK v2 built-in auth where possible.

**Files:**
- `src/auth/auth-module.ts`
- `src/auth/types.ts`

**Acceptance criteria:**
- Validates `activity.from.aadObjectId` is present
- Validates the activity came through Azure Bot Service (service URL validation)
- Single-tenant mode: rejects activities from other tenants
- Dev mode: bypasses all validation (logged as warning)
- Auth errors return 401/403 and send user-facing "unauthorized" message
- Auth result is cached per conversation for 5 minutes (avoid re-validation on every message)

---

#### M6-T2: User ACL store [M]

**What:** Implement the user whitelist (ACL) that restricts bot access to specific Azure AD users.

**Files:**
- `src/auth/user-acl.ts`

**Acceptance criteria:**
- ACL loaded from `config.allowedUsers` (array of AAD Object IDs)
- Empty ACL means all tenant users are allowed
- `isAuthorized(aadObjectId, tenantId)` checks both tenant and user ACL
- `addUser()` and `removeUser()` persist changes to config file
- ACL changes take effect immediately (no restart required)
- Setup wizard adds the setup user to the ACL automatically

---

#### M6-T3: Rate limiting per user [M]

**What:** Implement per-user sliding window rate limiting. Prevents abuse and protects against runaway Claude API costs.

**Files:**
- `src/auth/rate-limiter.ts`

**Acceptance criteria:**
- Default: 30 messages per minute per user (configurable)
- Sliding window algorithm (not fixed window) for smooth enforcement
- Rate-limited requests receive a friendly error message with retry-after time
- Rate limit state is in-memory (reset on restart)
- Admin users can be exempt from rate limiting (configurable)
- Rate limit events are logged with user ID and current count

---

#### M6-T4: Tool permission tiers enforcement [M]

**What:** Enforce the three permission tiers (readonly, acceptEdits, bypassPermissions) in the canUseTool callback. Ensure the tier is checked before prompting the user.

**Files:**
- Modified: `src/session/permission-handler.ts`

**Acceptance criteria:**
- `readonly` tier: Read, Grep, Glob auto-approved; all others prompt user
- `acceptEdits` tier: Read, Grep, Glob, Write, Edit auto-approved; Bash prompts
- `bypassPermissions` tier: all tools auto-approved (no prompts)
- Tier changes via `/permission` take effect on the current session
- `canUseTool` callback checks tier before checking session overrides
- Audit log records all permission decisions (auto-approved and user-decided)

---

#### M6-T5: Audit logging implementation [M]

**What:** Implement comprehensive audit logging for all security-relevant events. Append to the JSONL audit file.

**Files:**
- Modified: `src/logging/audit.ts`

**Acceptance criteria:**
- Logged events: message received, message sent, session created, session stopped, permission requested, permission decided, auth success, auth failure, rate limit hit
- Each entry: `{ timestamp, userId, action, details, sessionId? }`
- Append-only JSONL format (one JSON object per line)
- File rotation: new file daily or at 10MB (configurable)
- Audit log path: `~/.cc-ms-teams/audit.jsonl`

---

#### M6-T6: Sensitive path blocklist [S]

**What:** Implement a blocklist of filesystem paths that Claude Code should never read or modify. Injected into the system prompt and enforced in `canUseTool`.

**Files:**
- Modified: `src/session/permission-handler.ts`
- Modified: `src/session/session-factory.ts`

**Acceptance criteria:**
- Default blocklist: `~/.ssh/`, `~/.gnupg/`, `~/.aws/credentials`, `~/.cc-ms-teams/config.json`, `**/node_modules/.cache/`, `**/.env`
- Blocklist is configurable in config file
- `canUseTool` denies tool use if input references a blocked path (auto-deny, no prompt)
- Blocked path access is logged as a security event in audit log
- System prompt includes instruction to avoid blocked paths

---

#### M6-T7: Config file permissions hardening [S]

**What:** Ensure all config files are created with appropriate filesystem permissions. Validate permissions on load and warn if too permissive.

**Files:**
- Modified: `src/config/loader.ts`

**Acceptance criteria:**
- `config.json` created with `0600` (owner read/write)
- `~/.cc-ms-teams/` directory created with `0700` (owner only)
- On load, warn if config file permissions are more permissive than `0600`
- On load, warn if directory permissions are more permissive than `0700`
- Warnings include the chmod command to fix permissions

---

#### M6-T8: Wire auth module into activity pipeline [M]

**What:** Integrate the auth module, user ACL, and rate limiter into the message activity handler. All messages pass through auth -> ACL -> rate limit before processing.

**Files:**
- Modified: `src/bot/activity-handlers.ts`

**Acceptance criteria:**
- Auth check runs first; failure returns 401/403
- ACL check runs second; failure sends "unauthorized" message
- Rate limit check runs third; failure sends "rate limited" message with retry-after
- All checks are logged with their result
- Dev mode skips auth and ACL (rate limiting still applies)

---

#### M6-T9: Security test suite [M]

**What:** Create security-focused unit tests validating auth, ACL, rate limiting, and path blocklist behavior.

**Files:**
- `tests/unit/auth/auth-module.test.ts`
- `tests/unit/auth/user-acl.test.ts`
- `tests/unit/auth/rate-limiter.test.ts`

**Acceptance criteria:**
- Tests cover: valid auth, invalid tenant, unauthorized user, rate limit exceeded, rate limit reset
- Tests cover: blocked path detection, edge cases (symlinks, relative paths)
- Tests cover: dev mode bypass behavior
- All tests use mock activities (no real Azure AD calls)
- 100% branch coverage on auth module

---

### Milestone 6 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Azure AD token validation complexity varies by tenant config | Medium | Medium | Rely on Teams SDK v2 built-in auth; only add ACL on top |
| Rate limiting doesn't account for cost (expensive queries vs cheap ones) | Medium | Low | Add budget-based limiting in future version; document per-session maxBudgetUsd |
| Path blocklist bypass via symlinks or relative paths | Medium | High | Resolve all paths to absolute before checking; use `fs.realpath()` |

---

## 11. Milestone 7: Polish, Testing & Documentation

**Goal:** Harden error handling, implement reconnection logic, achieve test coverage targets, and produce user documentation. After this milestone, the project is ready for npm publish.

**Task count:** 7
**Estimated complexity:** Mixed (0S, 4M, 3L)
**Dependencies:** M4 (all bridge components), M5 (all card renderers), M6 (all security)

### Tasks

#### M7-T1: Error handling refinement across all components [L]

**What:** Audit all error paths. Ensure every thrown error has a clear user-facing message and a logged developer-facing message. Replace generic catch blocks with typed error handling.

**Files:**
- All source files (audit pass)
- `src/utils/errors.ts` -- custom error types

**Acceptance criteria:**
- Custom error hierarchy: `CCTeamsError > ConfigError | TunnelError | SessionError | BridgeError | AuthError`
- Every catch block logs the error with full context (component, operation, userId if applicable)
- User-facing errors are friendly (no stack traces) and actionable (suggest what to do)
- API errors include retry guidance
- Unhandled rejections and uncaught exceptions are logged and trigger graceful shutdown

---

#### M7-T2: Reconnection logic for tunnel drops [M]

**What:** Implement automatic reconnection when the dev tunnel drops. The tunnel health monitor (M1-T9) triggers reconnection, which updates the Azure Bot endpoint URL if it changed.

**Files:**
- Modified: `src/tunnel/manager.ts`
- Modified: `src/tunnel/health.ts`

**Acceptance criteria:**
- Tunnel disconnect triggers automatic restart attempt
- Up to 5 restart attempts with exponential backoff (5s, 10s, 20s, 40s, 60s)
- If tunnel URL changes after reconnect, log a warning (Azure Bot endpoint needs manual update)
- If tunnel URL is stable (reused tunnel ID), reconnection is seamless
- After 5 failed attempts, log error and send notification to all active conversations
- Active sessions are paused during reconnection (messages queued)

---

#### M7-T3: Reconnection logic for Bot Service issues [M]

**What:** Handle Azure Bot Service transient failures (429, 502, 503) in the proactive sender with automatic retry and message queueing.

**Files:**
- Modified: `src/bot/proactive-sender.ts`
- Modified: `src/utils/retry.ts`

**Acceptance criteria:**
- 429 responses trigger exponential backoff (1s, 2s, 4s, ... max 30s)
- 502/503 responses trigger retry with 5s delay (up to 3 attempts)
- Messages that fail after all retries are logged and dropped (no silent loss)
- Failed messages trigger a local notification (logger warning)
- Retry state is per-conversation (one conversation's failures don't block others)

---

#### M7-T4: Unit test suite -- all components [L]

**What:** Write comprehensive unit tests for every component. Target 80%+ line coverage overall, 100% on critical paths (auth, permissions, bridge).

**Files:**
- `tests/unit/config/*.test.ts`
- `tests/unit/tunnel/*.test.ts`
- `tests/unit/bot/*.test.ts`
- `tests/unit/session/*.test.ts`
- `tests/unit/bridge/*.test.ts`
- `tests/unit/cards/*.test.ts`
- `tests/mocks/*.ts`

**Acceptance criteria:**
- All components have at least one test file
- Config: schema validation, defaults, env var override, file loading
- Tunnel: provider selection, health check, reconnection
- Bot: command parsing, proactive sender retry, conversation store CRUD
- Session: stream input adapter async iteration, session lifecycle, permission handler
- Bridge: Teams->Claude transform, Claude->Teams transform, stream batcher, content chunker
- Cards: every template produces valid Adaptive Card JSON
- Coverage: 80%+ lines overall, 100% on auth/* and session/permission-handler.ts
- All tests pass in CI (no flaky tests)

---

#### M7-T5: Integration tests with mock endpoints [L]

**What:** Write end-to-end integration tests that simulate the full message flow: Teams message in -> Claude response out -> Adaptive Card in Teams.

**Files:**
- `tests/integration/bot-message-flow.test.ts`
- `tests/integration/session-lifecycle.test.ts`
- `tests/integration/stream-end-to-end.test.ts`
- `tests/integration/permission-flow.test.ts`
- `tests/mocks/teams-sdk.ts`
- `tests/mocks/claude-sdk.ts`

**Acceptance criteria:**
- Mock Teams SDK that captures sent messages and simulates incoming activities
- Mock Claude SDK that yields predefined message sequences
- Test: user sends message -> session created -> Claude responds -> Adaptive Card sent to Teams
- Test: streaming response -> batcher flushes -> progressive updates sent
- Test: Claude requests tool -> permission card sent -> user approves -> tool executes
- Test: session stop -> summary card sent -> session removed from pool
- Test: bot restart -> session resume offered -> user resumes -> conversation continues

---

#### M7-T6: User documentation [M]

**What:** Write the README, setup guide, and troubleshooting guide. Clear, practical documentation that gets a developer running in 5 minutes.

**Files:**
- `README.md`
- `docs/setup-guide.md`
- `docs/troubleshooting.md`

**Acceptance criteria:**
- README: project description, features, quick start (5 steps), architecture diagram, license
- Setup guide: prerequisites, Azure setup walkthrough (with screenshots descriptions), `cc-ms-teams setup` output, sideloading instructions, verification steps
- Troubleshooting: common errors with solutions (tunnel fails, auth errors, no messages, rate limiting)
- All commands documented with examples
- All slash commands documented with usage examples
- Configuration reference (all config.json fields)

---

#### M7-T7: npm package configuration for publishing [M]

**What:** Finalize `package.json` for npm publishing. Set up the `bin` entry, `files` whitelist, `prepublishOnly` script, and verify the package installs and runs correctly from npm.

**Files:**
- Modified: `package.json`
- `.npmignore`

**Acceptance criteria:**
- `npm pack` produces a clean tarball (no test files, docs, or dev artifacts)
- `npx cc-ms-teams --version` works after global install
- `npx cc-ms-teams --help` shows all commands
- Package size under 2MB (bundled with esbuild)
- `prepublishOnly` runs typecheck + lint + test
- `engines.node` set to `>=22.0.0`
- `bin.cc-ms-teams` points to `dist/cli/main.js`
- ESM entry point at `exports["."]`
- License field set (MIT or Apache-2.0)

---

### Milestone 7 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Integration tests are flaky due to async timing | Medium | Medium | Use deterministic mock sequences; avoid real timers in tests (use vi.useFakeTimers) |
| Documentation becomes stale during active development | Medium | Low | Write docs last; automate CLI help text from commander definitions |
| npm package binary doesn't work on all platforms | Low | Medium | Test on macOS, Linux, Windows (WSL); use proper shebang line |

---

## 12. Critical Path Analysis

The critical path is the longest sequence of dependent milestones/tasks that determines the minimum project duration:

```
M1 (9 tasks) -> M2 (9 tasks) -> M3 (10 tasks) -> M4 (10 tasks) -> M7 (7 tasks)
     9              9               10               10              7
                                                                    = 45 tasks on critical path
```

**Critical path duration: 45 tasks** (of 62 total)

**Parallel work opportunities:**
- M6 (9 tasks) runs in parallel with M3+M4 -- starts after M2, merges at M7
- M5 (8 tasks) can partially overlap with M4 -- card templates can start once M4 interfaces are defined

**Optimized schedule with 2 developers:**

```
Developer A (critical path):  M1 -> M2 -> M3 -> M4 ---------> M7
Developer B (parallel):              M1* -> M6 -> M5 -------->|
                                     (assists)

* Developer B assists with M1 tasks M1-T7, M1-T8, M1-T9 (tunnel)
```

**Key bottleneck:** M3 (Claude Code Integration) has 4 Large tasks and blocks M4. Start M3 as early as possible. The StreamInputAdapter (M3-T1) and SessionFactory (M3-T2) are on the critical path.

---

## 13. Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|------|-----------|--------|------------|-------|
| R1 | Teams SDK v2 is in preview; API may change before stable | Medium | High | Pin version, wrap in thin adapter, monitor release notes | M2 lead |
| R2 | Claude Agent SDK streaming input mode has undocumented behaviors | Medium | High | Test extensively, file SDK issues early, have fallback to CLI subprocess | M3 lead |
| R3 | Dev tunnel reliability (drops, URL changes) | High | Medium | Health monitoring, auto-reconnect, ngrok fallback | M1 lead |
| R4 | Adaptive Cards CodeBlock not supported on all Teams clients | Low | Medium | Feature detection, plain text fallback | M5 lead |
| R5 | Azure Bot Service free tier rate limits | Medium | Medium | Message batching, exponential backoff, queue overflow protection | M2 lead |
| R6 | Session resume fails across process restarts | Medium | Medium | Test early, implement "new session with context summary" fallback | M3 lead |
| R7 | 28KB card payload limit too small for large code blocks/diffs | Medium | Medium | Multi-card splitting, truncation with line counts | M4 lead |
| R8 | Permission prompt timeout blocks Claude session indefinitely | Low | High | 5-minute timeout with auto-deny, AbortSignal support | M3 lead |
| R9 | Teams tenant admin blocks sideloading custom apps | Medium | High | Document requirements, provide Teams Developer Portal alternative | M2 lead |
| R10 | Path blocklist bypass via symlinks | Medium | High | `fs.realpath()` resolution before blocklist check | M6 lead |

---

## 14. Definition of Done

The cc-ms-teams v1.0 project is complete when ALL of the following are true:

### Functional Requirements
- [ ] Developer can run `cc-ms-teams setup` and complete the setup wizard in under 5 minutes
- [ ] Developer can run `cc-ms-teams start` and the bot connects to Teams via a dev tunnel
- [ ] User can send a message in Teams personal chat and receive a Claude Code response
- [ ] Claude Code responses render with syntax-highlighted code blocks (Adaptive Cards)
- [ ] File diffs render in side-by-side or unified format
- [ ] Claude Code tool permission requests appear as interactive cards (approve/deny/always-allow)
- [ ] Streaming responses use progressive message updates (edit-in-place)
- [ ] `/new`, `/stop`, `/project`, `/model`, `/permission`, `/sessions`, `/handoff`, `/status`, `/help` commands work
- [ ] Sessions persist across bot restarts (resume capability)
- [ ] MCP tools (`sendToUser`, `askUser`) allow Claude Code to initiate communication

### Security Requirements
- [ ] Azure AD single-tenant authentication is enforced
- [ ] User ACL restricts access to whitelisted AAD Object IDs
- [ ] Rate limiting prevents abuse (30 msg/min/user default)
- [ ] Sensitive paths are blocked from tool access
- [ ] Config files have restrictive permissions (0600)
- [ ] All security events are audit logged

### Quality Requirements
- [ ] Unit test coverage: 80%+ overall, 100% on auth and permissions
- [ ] Integration tests pass for all major flows (message, streaming, permissions, session lifecycle)
- [ ] No TypeScript errors (`tsc --noEmit` passes)
- [ ] No ESLint errors
- [ ] Zero known critical or high-severity bugs

### Documentation Requirements
- [ ] README with quick start guide
- [ ] Setup guide with Azure walkthrough
- [ ] Troubleshooting guide with common issues
- [ ] All CLI commands documented
- [ ] All Teams slash commands documented
- [ ] Configuration reference

### Distribution Requirements
- [ ] `npm pack` produces a clean package under 2MB
- [ ] `npx cc-ms-teams --help` works after global install
- [ ] Package runs on Node.js 22+ on macOS, Linux, and Windows (WSL)

---

*End of Implementation Plan*
