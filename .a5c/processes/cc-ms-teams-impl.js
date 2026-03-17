/**
 * @process cc-ms-teams-impl
 * @description Implement the cc-ms-teams plugin following the 7-milestone implementation plan.
 *              Each milestone is executed by an agent with quality verification, followed by a breakpoint for review.
 * @inputs { projectName: string, specDir: string }
 * @outputs { success: boolean, milestones: array, artifacts: array }
 *
 * @skill mcp-sdk-typescript-bootstrapper specializations/cli-mcp-development/skills/mcp-sdk-typescript-bootstrapper/SKILL.md
 * @agent mcp-protocol-expert specializations/cli-mcp-development/agents/mcp-protocol-expert/AGENT.md
 * @agent cli-ux-architect specializations/cli-mcp-development/agents/cli-ux-architect/AGENT.md
 * @agent cli-testing-architect specializations/cli-mcp-development/agents/cli-testing-architect/AGENT.md
 * @agent plugin-system-architect specializations/cli-mcp-development/agents/plugin-system-architect/AGENT.md
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export async function process(inputs, ctx) {
  const {
    projectName = 'cc-ms-teams',
    specDir = 'docs'
  } = inputs;

  const startTime = ctx.now();
  const milestoneResults = [];

  ctx.log('info', `Starting implementation of ${projectName} - 7 milestones`);

  // ============================================================================
  // MILESTONE 1: Project Bootstrap & Core Infrastructure
  // ============================================================================

  ctx.log('info', 'Milestone 1: Project Bootstrap & Core Infrastructure');

  const m1Result = await ctx.task(milestoneTask, {
    milestone: 1,
    title: 'Project Bootstrap & Core Infrastructure',
    projectName,
    specDir,
    description: `Initialize the TypeScript project and build core infrastructure. This is the foundation milestone.`,
    tasks: [
      'M1-T1: Initialize TypeScript project with ESM configuration (package.json type:module, tsconfig.json strict+ESM+Node22, esbuild.config.ts, .eslintrc.cjs, .gitignore)',
      'M1-T2: Create vitest test infrastructure (vitest.config.ts, tests/unit/smoke.test.ts)',
      'M1-T3: Configuration system with zod schemas (src/config/schema.ts, defaults.ts, loader.ts, paths.ts) - reads ~/.cc-ms-teams/config.json, merges env vars, validates with zod',
      'M1-T4: Structured logging with pino (src/logging/logger.ts, audit.ts) - JSON structured logs, audit log for security events',
      'M1-T5: CLI entry point with commander (src/cli/main.ts, commands/setup.ts, start.ts, stop.ts, status.ts) - cc-ms-teams command with subcommands',
      'M1-T6: Dev tunnel manager - types (src/tunnel/types.ts IDevTunnelManager interface)',
      'M1-T7: Dev tunnel manager - MS Dev Tunnels provider (src/tunnel/devtunnel-provider.ts, manager.ts) - wraps devtunnel CLI',
      'M1-T8: Dev tunnel manager - ngrok fallback provider (src/tunnel/ngrok-provider.ts) - fallback tunnel provider',
      'M1-T9: Dev tunnel health monitoring (src/tunnel/health.ts) - periodic HTTP ping to verify tunnel is alive'
    ],
    acceptanceCriteria: [
      'npm install succeeds with no peer dependency warnings',
      'npx tsc --noEmit passes',
      'npm run build produces ESM output in dist/',
      'npm test runs and passes smoke test',
      'cc-ms-teams status command runs (shows "not configured" state)',
      'Configuration loads from file + env vars with zod validation',
      'Logger outputs structured JSON',
      'Tunnel manager can detect available tunnel providers'
    ],
    fileStructure: `
src/index.ts, src/cli/main.ts, src/cli/commands/setup.ts, src/cli/commands/start.ts, src/cli/commands/stop.ts, src/cli/commands/status.ts,
src/config/schema.ts, src/config/defaults.ts, src/config/loader.ts, src/config/paths.ts,
src/logging/logger.ts, src/logging/audit.ts,
src/tunnel/types.ts, src/tunnel/manager.ts, src/tunnel/devtunnel-provider.ts, src/tunnel/ngrok-provider.ts, src/tunnel/health.ts,
src/utils/async-queue.ts, src/utils/retry.ts, src/utils/pid-file.ts,
package.json, tsconfig.json, esbuild.config.ts, vitest.config.ts, .eslintrc.cjs, .gitignore,
tests/unit/smoke.test.ts, tests/unit/config/loader.test.ts`
  });
  milestoneResults.push(m1Result);

  await ctx.breakpoint({
    question: 'Milestone 1 (Project Bootstrap) complete. Review the project structure, config system, CLI, and tunnel manager. Run `npm test` and `cc-ms-teams status` to verify. Approve to continue?',
    title: 'Milestone 1 Review',
    context: { runId: ctx.runId, milestone: 1 }
  });

  // ============================================================================
  // MILESTONE 2: Teams Bot Foundation
  // ============================================================================

  ctx.log('info', 'Milestone 2: Teams Bot Foundation');

  const m2Result = await ctx.task(milestoneTask, {
    milestone: 2,
    title: 'Teams Bot Foundation',
    projectName,
    specDir,
    description: `Set up the Teams SDK v2 bot with activity handlers, message routing, and basic echo functionality.`,
    tasks: [
      'M2-T1: Teams App factory (src/bot/teams-app.ts) - create Teams SDK v2 App instance with MCP plugin, configure HTTP adapter on port 3978, /api/messages endpoint',
      'M2-T2: Activity handlers (src/bot/activity-handlers.ts) - app.on("message") for text, app.on("card.action") for Adaptive Card submits, install/uninstall handlers',
      'M2-T3: Command parser (src/bot/command-parser.ts) - parse /new, /stop, /status, /help, /permissions, /project slash commands from message text',
      'M2-T4: Proactive sender (src/bot/proactive-sender.ts) - wrapper around app.send(conversationId, content) for async Claude output delivery',
      'M2-T5: Conversation store (src/bot/conversation-store.ts) - JSON file mapping userId -> conversationId, persisted in ~/.cc-ms-teams/conversations.json',
      'M2-T6: App manifest generator (src/bot/manifest-generator.ts) - generate manifest.json + zip with bot ID, scopes=[personal], supportsFiles=false, icons',
      'M2-T7: Setup wizard integration - update src/cli/commands/setup.ts to guide Azure Bot registration, collect app ID/password, generate manifest, store config',
      'M2-T8: Start command integration - update src/cli/commands/start.ts to boot tunnel + Teams App, register message handlers, listen on port',
      'M2-T9: Basic echo test - wire message handler to echo back user message as confirmation the bot works end-to-end'
    ],
    acceptanceCriteria: [
      'Teams App starts and listens on port 3978',
      '/api/messages endpoint receives and processes activities',
      'Bot echoes received messages back to sender',
      'Slash commands are parsed correctly',
      'Conversation store persists userId -> conversationId',
      'App manifest can be generated and zipped',
      'Setup wizard collects and stores Azure Bot credentials',
      'npm test passes with bot unit tests'
    ],
    fileStructure: `
src/bot/teams-app.ts, src/bot/activity-handlers.ts, src/bot/command-parser.ts,
src/bot/proactive-sender.ts, src/bot/conversation-store.ts, src/bot/manifest-generator.ts,
tests/unit/bot/command-parser.test.ts, tests/unit/bot/conversation-store.test.ts,
tests/mocks/teams-sdk.ts`
  });
  milestoneResults.push(m2Result);

  await ctx.breakpoint({
    question: 'Milestone 2 (Teams Bot Foundation) complete. The bot should echo messages. Run `npm test` to verify. Approve to continue?',
    title: 'Milestone 2 Review',
    context: { runId: ctx.runId, milestone: 2 }
  });

  // ============================================================================
  // MILESTONE 3: Claude Code Integration
  // ============================================================================

  ctx.log('info', 'Milestone 3: Claude Code Integration');

  const m3Result = await ctx.task(milestoneTask, {
    milestone: 3,
    title: 'Claude Code Integration',
    projectName,
    specDir,
    description: `Integrate Claude Agent SDK with streaming input mode for persistent sessions.`,
    tasks: [
      'M3-T1: Session types (src/session/types.ts) - ISessionManager, Session, SessionOptions, SessionState interfaces',
      'M3-T2: Async queue utility (src/utils/async-queue.ts) - typed AsyncIterable push queue for streaming input adapter',
      'M3-T3: Stream input adapter (src/session/stream-input-adapter.ts) - converts push-based Teams messages to AsyncIterable<SDKUserMessage> for query()',
      'M3-T4: Session factory (src/session/session-factory.ts) - creates query() calls with streaming input, configures allowedTools, permissionMode, working directory',
      'M3-T5: Session manager (src/session/session-manager.ts) - SessionPool with getOrCreate, resume, stop, list. Per-user session isolation. Maps userId to active session',
      'M3-T6: Output processor (src/session/output-processor.ts) - consumes SDK async iterator output, categorizes events (text, tool_use, error), forwards to bridge',
      'M3-T7: Permission handler (src/session/permission-handler.ts) - canUseTool callback implementation, pending permission request map, timeout handling',
      'M3-T8: Tool permission config - default read-only tools (Read, Grep, Glob, LS), configurable write tools opt-in (Write, Edit, Bash)',
      'M3-T9: Wire session manager into bot - update activity handlers to route messages to session manager instead of echo',
      'M3-T10: Basic query/response test - send a message through Teams handler -> session -> Claude SDK -> response back (single-shot first, streaming later)'
    ],
    acceptanceCriteria: [
      'Session manager creates per-user Claude Agent SDK sessions',
      'StreamInputAdapter correctly converts push messages to AsyncIterable',
      'query() is called with streaming input mode',
      'Output processor categorizes SDK events correctly',
      'Permission handler defaults to read-only tools',
      'canUseTool callback blocks unauthorized tool requests',
      'Session lifecycle (create, query, stop) works correctly',
      'npm test passes with session unit tests'
    ],
    fileStructure: `
src/session/types.ts, src/session/session-manager.ts, src/session/session-factory.ts,
src/session/stream-input-adapter.ts, src/session/output-processor.ts, src/session/permission-handler.ts,
src/utils/async-queue.ts,
tests/unit/session/session-manager.test.ts, tests/unit/session/stream-input-adapter.test.ts,
tests/unit/session/permission-handler.test.ts, tests/mocks/claude-sdk.ts`
  });
  milestoneResults.push(m3Result);

  await ctx.breakpoint({
    question: 'Milestone 3 (Claude Code Integration) complete. Session manager, streaming input, and permission handler are implemented. Run `npm test` to verify. Approve to continue?',
    title: 'Milestone 3 Review',
    context: { runId: ctx.runId, milestone: 3 }
  });

  // ============================================================================
  // MILESTONE 4: Message Bridge & Streaming
  // ============================================================================

  ctx.log('info', 'Milestone 4: Message Bridge & Streaming');

  const m4Result = await ctx.task(milestoneTask, {
    milestone: 4,
    title: 'Message Bridge & Streaming',
    projectName,
    specDir,
    description: `Build the bidirectional message bridge with streaming support and progressive Teams message updates.`,
    tasks: [
      'M4-T1: Bridge types (src/bridge/types.ts) - IMessageBridge, MessageContext, TeamsContent, ClaudeContent interfaces',
      'M4-T2: Teams-to-Claude transformer (src/bridge/teams-to-claude.ts) - converts Teams activity text/markdown to SDKUserMessage format',
      'M4-T3: Claude-to-Teams transformer (src/bridge/claude-to-teams.ts) - converts SDK output events (SDKTextBlock, SDKToolUseSummary, etc.) to Teams message content',
      'M4-T4: Stream batcher (src/bridge/stream-batcher.ts) - batches streaming SDK text chunks into 500ms/200char batches to reduce Teams message update frequency',
      'M4-T5: Content chunker (src/bridge/content-chunker.ts) - splits responses exceeding 28KB Adaptive Card limit or 4KB text limit into multiple messages',
      'M4-T6: Message bridge orchestrator (src/bridge/message-bridge.ts) - wires transformers, batcher, chunker together. Manages progressive message updates (edit-in-place)',
      'M4-T7: Progressive message updates - implement message editing (update existing message) for streaming responses instead of sending new messages',
      'M4-T8: Message history tracking - track conversation context per session for multi-turn coherence',
      'M4-T9: Wire bridge into bot + session - connect output processor -> bridge -> proactive sender pipeline',
      'M4-T10: End-to-end streaming test - verify full flow: Teams message -> session -> Claude SDK -> streaming output -> batched updates -> Teams'
    ],
    acceptanceCriteria: [
      'Teams messages are correctly transformed to SDKUserMessage format',
      'Claude SDK output events are transformed to Teams-renderable content',
      'Stream batcher reduces update frequency to ~2/second',
      'Content chunker splits oversized responses into multiple messages',
      'Progressive message updates work (edit-in-place for streaming)',
      'Full pipeline works: Teams -> Claude -> streaming -> Teams',
      'npm test passes with bridge unit tests'
    ],
    fileStructure: `
src/bridge/types.ts, src/bridge/message-bridge.ts, src/bridge/teams-to-claude.ts,
src/bridge/claude-to-teams.ts, src/bridge/stream-batcher.ts, src/bridge/content-chunker.ts,
tests/unit/bridge/teams-to-claude.test.ts, tests/unit/bridge/claude-to-teams.test.ts,
tests/unit/bridge/stream-batcher.test.ts, tests/unit/bridge/content-chunker.test.ts`
  });
  milestoneResults.push(m4Result);

  await ctx.breakpoint({
    question: 'Milestone 4 (Message Bridge & Streaming) complete. The full bidirectional pipeline should work with streaming. Run `npm test` to verify. Approve to continue?',
    title: 'Milestone 4 Review',
    context: { runId: ctx.runId, milestone: 4 }
  });

  // ============================================================================
  // MILESTONE 5: Adaptive Cards & Rich Output
  // ============================================================================

  ctx.log('info', 'Milestone 5: Adaptive Cards & Rich Output');

  const m5Result = await ctx.task(milestoneTask, {
    milestone: 5,
    title: 'Adaptive Cards & Rich Output',
    projectName,
    specDir,
    description: `Build Adaptive Card templates for code blocks, diffs, progress indicators, errors, and permission prompts.`,
    tasks: [
      'M5-T1: Card types and renderer interface (src/cards/types.ts) - IAdaptiveCardRenderer, AdaptiveCard type definitions, card template registry',
      'M5-T2: Language mapper (src/cards/language-mapper.ts) - maps file extensions and fence labels to CodeBlock language identifiers (22 supported languages)',
      'M5-T3: Code block template (src/cards/templates/code-block.ts) - Adaptive Card with CodeBlock element, syntax highlighting, line numbers, language label',
      'M5-T4: Diff card template (src/cards/templates/diff-card.ts) - side-by-side diff using ColumnSet with two CodeBlock elements, unified diff fallback for mobile',
      'M5-T5: Progress card template (src/cards/templates/progress-card.ts) - thinking indicator, tool usage indicator with tool name and status',
      'M5-T6: Error card template (src/cards/templates/error-card.ts) - user-friendly error display with error type, message, and suggested actions',
      'M5-T7: Permission card template (src/cards/templates/permission-card.ts) - approve/deny/always-allow buttons for canUseTool requests, shows tool name, args, risk level',
      'M5-T8: Main renderer (src/cards/renderer.ts) - dispatches to templates based on content type, integrates with claude-to-teams transformer'
    ],
    acceptanceCriteria: [
      'CodeBlock cards render with correct syntax highlighting language',
      'Diff cards show side-by-side before/after with CodeBlock elements',
      'Progress cards show thinking and tool usage indicators',
      'Error cards display user-friendly messages with actionable suggestions',
      'Permission cards have working approve/deny/always-allow buttons',
      'Card JSON output validates against Adaptive Card schema',
      'Cards stay within 28KB payload limit',
      'npm test passes with card template tests'
    ],
    fileStructure: `
src/cards/types.ts, src/cards/renderer.ts, src/cards/language-mapper.ts,
src/cards/templates/code-block.ts, src/cards/templates/diff-card.ts,
src/cards/templates/progress-card.ts, src/cards/templates/error-card.ts,
src/cards/templates/permission-card.ts, src/cards/templates/session-summary.ts,
tests/unit/cards/language-mapper.test.ts, tests/unit/cards/renderer.test.ts,
tests/unit/cards/code-block.test.ts, tests/unit/cards/permission-card.test.ts`
  });
  milestoneResults.push(m5Result);

  await ctx.breakpoint({
    question: 'Milestone 5 (Adaptive Cards) complete. Code blocks, diffs, progress, errors, and permission cards are implemented. Run `npm test` to verify. Approve to continue?',
    title: 'Milestone 5 Review',
    context: { runId: ctx.runId, milestone: 5 }
  });

  // ============================================================================
  // MILESTONE 6: Authentication & Security
  // ============================================================================

  ctx.log('info', 'Milestone 6: Authentication & Security');

  const m6Result = await ctx.task(milestoneTask, {
    milestone: 6,
    title: 'Authentication & Security',
    projectName,
    specDir,
    description: `Implement Azure AD token validation, user ACL, rate limiting, tool permission enforcement, and audit logging.`,
    tasks: [
      'M6-T1: Auth types (src/auth/types.ts) - IAuthModule, AuthConfig, AuthResult, UserPermissions interfaces',
      'M6-T2: Auth module orchestrator (src/auth/auth-module.ts) - validates incoming activity tokens, checks user ACL, enforces rate limits',
      'M6-T3: User ACL store (src/auth/user-acl.ts) - whitelist by Azure AD Object ID, stored in ~/.cc-ms-teams/acl.json, CRUD operations',
      'M6-T4: Rate limiter (src/auth/rate-limiter.ts) - per-user sliding window rate limiter (configurable messages/minute), returns 429-equivalent card',
      'M6-T5: Tool permission tiers - enforce read-only default (Read, Grep, Glob), standard (+ Write, Edit), full (+ Bash). Per-user tier config',
      'M6-T6: Sensitive path blocklist - block access to ~/.cc-ms-teams/, ~/.ssh/, ~/.aws/, .env files via canUseTool callback',
      'M6-T7: Audit logging integration - wire auth events, tool usage, permission changes to audit log (src/logging/audit.ts)',
      'M6-T8: Auth middleware in bot pipeline - insert auth check between activity receipt and message routing',
      'M6-T9: Setup wizard auth flow - update setup wizard to configure user ACL, collect first admin user ID'
    ],
    acceptanceCriteria: [
      'Unauthorized users receive "access denied" card',
      'Rate-limited users receive "slow down" card with retry-after',
      'Tool permissions enforce tier restrictions',
      'Sensitive paths are blocked regardless of tool tier',
      'Audit log records all auth and tool usage events',
      'Setup wizard configures first admin user',
      'npm test passes with auth unit tests'
    ],
    fileStructure: `
src/auth/types.ts, src/auth/auth-module.ts, src/auth/user-acl.ts, src/auth/rate-limiter.ts,
tests/unit/auth/auth-module.test.ts, tests/unit/auth/user-acl.test.ts,
tests/unit/auth/rate-limiter.test.ts`
  });
  milestoneResults.push(m6Result);

  await ctx.breakpoint({
    question: 'Milestone 6 (Auth & Security) complete. ACL, rate limiting, tool tiers, and audit logging are implemented. Run `npm test` to verify. Approve to continue?',
    title: 'Milestone 6 Review',
    context: { runId: ctx.runId, milestone: 6 }
  });

  // ============================================================================
  // MILESTONE 7: Polish, Testing & Documentation
  // ============================================================================

  ctx.log('info', 'Milestone 7: Polish, Testing & Documentation');

  const m7Result = await ctx.task(milestoneTask, {
    milestone: 7,
    title: 'Polish, Testing & Documentation',
    projectName,
    specDir,
    description: `Final polish: error handling, reconnection logic, integration tests, documentation, and packaging.`,
    tasks: [
      'M7-T1: Error handling refinement - review all components for consistent error handling, add graceful degradation, improve error messages across the codebase',
      'M7-T2: Reconnection logic - tunnel drop recovery (auto-restart), bot service reconnection (exponential backoff), session recovery after process restart',
      'M7-T3: Integration tests (tests/integration/) - bot-message-flow.test.ts, session-lifecycle.test.ts, stream-end-to-end.test.ts, permission-flow.test.ts',
      'M7-T4: README.md - project overview, quick start guide (5-minute setup), architecture diagram, configuration reference, troubleshooting',
      'M7-T5: Setup guide - detailed Azure Bot registration walkthrough with screenshots placeholders, dev tunnel setup, Teams app sideloading',
      'M7-T6: npm package config - ensure package.json bin, exports, files, engines are correct for npm publish. Test with npm pack',
      'M7-T7: Final quality check - run full test suite, lint, typecheck, verify all acceptance criteria from all milestones'
    ],
    acceptanceCriteria: [
      'All error paths produce user-friendly messages',
      'Tunnel reconnection works automatically',
      'All integration tests pass',
      'README provides clear 5-minute setup guide',
      'npm pack produces a clean distributable package',
      'Full test suite passes (npm test)',
      'TypeScript strict mode passes (npm run typecheck)',
      'Linting passes (npm run lint)'
    ],
    fileStructure: `
tests/integration/bot-message-flow.test.ts, tests/integration/session-lifecycle.test.ts,
tests/integration/stream-end-to-end.test.ts, tests/integration/permission-flow.test.ts,
README.md, docs/setup-guide.md`
  });
  milestoneResults.push(m7Result);

  await ctx.breakpoint({
    question: 'Milestone 7 (Polish & Documentation) complete. All integration tests, documentation, and packaging done. Run `npm test` and review README.md. Final approval?',
    title: 'Final Implementation Review',
    context: { runId: ctx.runId, milestone: 7, totalMilestones: 7 }
  });

  return {
    success: true,
    projectName,
    milestones: milestoneResults,
    totalMilestones: 7,
    duration: ctx.now() - startTime,
    metadata: {
      processId: 'cc-ms-teams-impl',
      timestamp: startTime
    }
  };
}

// ============================================================================
// MILESTONE TASK DEFINITION
// ============================================================================

export const milestoneTask = defineTask('milestone-impl', (args, taskCtx) => ({
  kind: 'agent',
  title: `Milestone ${args.milestone}: ${args.title}`,
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior TypeScript developer implementing a Claude Code <-> Microsoft Teams bidirectional chat plugin',
      task: `Implement Milestone ${args.milestone}: ${args.title} for the "${args.projectName}" project.`,
      context: {
        milestone: args.milestone,
        title: args.title,
        description: args.description,
        tasks: args.tasks,
        acceptanceCriteria: args.acceptanceCriteria,
        fileStructure: args.fileStructure,
        projectName: args.projectName,
        specDir: args.specDir
      },
      instructions: [
        `You are implementing Milestone ${args.milestone} of the cc-ms-teams plugin.`,
        '',
        'CRITICAL: Read these spec documents FIRST for full context:',
        `- ${args.specDir}/specification.md (detailed component specs, TypeScript interfaces, Adaptive Card templates)`,
        `- ${args.specDir}/implementation-plan.md (full task details, acceptance criteria)`,
        `- ${args.specDir}/architecture-design.md (component architecture, data flows)`,
        '',
        'IMPLEMENTATION RULES:',
        '- Write real, complete, working TypeScript code - not stubs or placeholders',
        '- Use ESM imports (import/export), not CommonJS (require)',
        '- Follow the file structure defined in the implementation plan exactly',
        '- Use the TypeScript interfaces from the specification document',
        '- All files must pass TypeScript strict mode',
        '- Write unit tests for every module created (in tests/unit/)',
        '- Use vitest for testing, zod for validation, pino for logging',
        '- Teams SDK v2: @microsoft/teams.apps (App class, NOT botbuilder v4)',
        '- Claude Agent SDK: @anthropic-ai/claude-agent-sdk (query() with streaming input)',
        '',
        'TASKS TO IMPLEMENT:',
        ...args.tasks.map(t => `- ${t}`),
        '',
        'ACCEPTANCE CRITERIA:',
        ...args.acceptanceCriteria.map(c => `- ${c}`),
        '',
        'FILES TO CREATE/MODIFY:',
        args.fileStructure,
        '',
        'After implementing all tasks:',
        '1. Run npm install if new dependencies are needed',
        '2. Run npx tsc --noEmit to verify TypeScript compiles',
        '3. Run npm test to verify tests pass',
        '4. Fix any compilation or test failures',
        '',
        'Return a summary of what was implemented, files created, and test results.'
      ],
      outputFormat: 'JSON with implementation summary'
    },
    outputSchema: {
      type: 'object',
      required: ['milestone', 'filesCreated', 'testsStatus'],
      properties: {
        milestone: { type: 'number' },
        title: { type: 'string' },
        filesCreated: { type: 'array', items: { type: 'string' } },
        filesModified: { type: 'array', items: { type: 'string' } },
        testsStatus: { type: 'string', enum: ['pass', 'partial', 'fail'] },
        testResults: { type: 'object' },
        issues: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['implementation', `milestone-${args.milestone}`, args.projectName]
}));
