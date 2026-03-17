# cc-ms-teams Specification Validation Report

**Date:** 2026-03-17
**Reviewer:** QA Architecture Review
**Documents Reviewed:**
- `docs/research-report.md`
- `docs/architecture-design.md`
- `docs/specification.md`
- `docs/implementation-plan.md`

**Validation Context:**
- File Sharing Service was DROPPED from v1.0 scope per user feedback
- Personal chat only in v1.0 (no channel/team scope)
- Developer experience is a top priority

---

## Executive Summary

The cc-ms-teams specification package is **thorough and well-structured**, with detailed TypeScript interfaces, comprehensive error handling strategies, and a well-decomposed implementation plan. The documents demonstrate strong internal consistency across the spec and implementation plan, with the major exception being the architecture document, which still contains a fully-specified File Sharing Service component that was dropped from v1.0 scope. The technology choices are sound and the 62-task implementation plan is realistic. Several interface mismatches between the architecture doc and the specification need reconciliation, and a few accuracy concerns around SDK APIs should be verified before implementation begins.

**Overall Assessment: needs-revisions**

---

## 1. Completeness (Score: 82/100)

### 1.1 Component Coverage

All 6 required v1.0 components are specified in the specification document:

| # | Component | Spec Section | Interfaces Defined | Error Handling | Config Options |
|---|-----------|-------------|-------------------|----------------|----------------|
| 1 | Teams Bot Service | 3.1 | Yes (ITeamsBotService implied via App usage) | Yes | Yes (4 options) |
| 2 | Message Bridge | 3.2 | Yes (IMessageBridge, StreamBatcher) | Partial | Yes (via streaming config) |
| 3 | Session Manager | 3.3 | Yes (ISessionManager, Session, SessionOptions) | Yes | Yes (model, cwd, budget, tools) |
| 4 | Adaptive Card Renderer | 3.4 | Yes (IAdaptiveCardRenderer, 7 render methods) | Partial | Partial |
| 5 | Auth Module | 3.5 | Yes (IAuthModule, AuthConfig) | Yes | Yes (5 options) |
| 6 | Dev Tunnel Manager | 3.6 | Yes (IDevTunnelManager, TunnelConfig) | Yes | Yes (5 options) |

### 1.2 Data Flows

Data flows are documented in the architecture document (Section 3) with sequence diagrams for:
- Teams user message -> Claude Code (happy path)
- Claude Code streaming response -> Teams
- Permission request flow
- Proactive messaging flow
- File sharing flow (should be removed or marked as deferred)

**Gap:** The MCP bidirectional flow (Claude Code calling `sendToUser`/`askUser` via MCP tools) lacks a dedicated sequence diagram. The spec describes the tools but not the end-to-end data flow when Claude Code initiates a Teams interaction.

### 1.3 API Contracts

API contracts are well-defined:
- `POST /api/messages` -- Teams webhook (Section 5.1)
- `POST /mcp` -- MCP endpoint (Section 5.2)
- `GET /health` -- Health check (Section 5.3)
- Internal component APIs via TypeScript interfaces (Section 5.4)

**Gap:** The `getConversationHistory` MCP tool is listed in the API contracts (Section 5.2) but has no implementation specified anywhere in the spec or implementation plan.

### 1.4 Configuration

Configuration is comprehensively documented:
- Full Zod schema (Section 4.1) with defaults for every field
- Environment variable mapping (Section 7.1)
- Example config file (Section 7.2)
- Minimal config example (Section 7.3)

### 1.5 Error Handling

Error handling is well-covered in Section 8 with:
- 7 error categories with user-facing messages and strategies
- Reconnection logic with exponential backoff diagram
- User-facing error message format guidelines

**Gap:** No error handling is defined for the MCP endpoint specifically. What happens if Claude Code sends malformed MCP requests?

### 1.6 Implementation Plan Coverage

The implementation plan covers all specification components across 7 milestones (62 tasks). Each task has:
- Clear description
- File list
- Acceptance criteria

**Gap:** The implementation plan lacks a dedicated task for the `getConversationHistory` MCP tool referenced in the spec Section 5.2.

### Completeness Issues

| ID | Severity | Finding | Suggested Fix |
|----|----------|---------|---------------|
| C1 | Major | `getConversationHistory` MCP tool listed in spec Section 5.2 but never implemented | Either add implementation to Session Manager and a task in M2 or M4, or remove from the MCP tool list |
| C2 | Minor | No sequence diagram for MCP-initiated bidirectional flow | Add a sequence diagram in the architecture doc Section 3 showing Claude Code -> MCP tool -> Teams message |
| C3 | Minor | No MCP endpoint error handling specified | Add MCP-specific error handling to Section 8.1 (e.g., malformed tool calls, auth for MCP endpoint) |
| C4 | Minor | `MarkdownAdapter` listed in architecture doc (Section 2.2) but absent from spec and implementation plan | Either add it to the spec/plan or clarify that markdown handling is embedded in ClaudeToTeamsTransformer |
| C5 | Minor | No explicit task for generating Teams app icons (icon-color.png, icon-outline.png) referenced in manifest | Add to M2-T1 or create a small task in M2 |

---

## 2. Consistency (Score: 75/100)

### 2.1 File Sharing Service -- Not Consistently Dropped

**This is the most significant consistency issue.**

The architecture document (`architecture-design.md`) still contains:
- A fully specified **File Sharing Service** component (Section 2.5) with 4 modules, TypeScript interfaces, and full design
- `fileConsent` routing in ActivityRouter (Section 2.1, line 121)
- `attachments: Attachment[]` in MessageContext interface (Section 2.1, line 143)
- File upload sequence diagram (Section 3, lines 615-665)
- File upload error handling (Section 6, line 826)
- File-related config options: `uploadDir`, `maxFileSizeMb`, `allowedMimeTypes` (Section 9, lines 1144-1146)
- File Sharing Service box in the architecture diagram (lines 74-84)

The **specification** correctly drops File Sharing:
- Listed as "Deferred to future versions" (Section 1.3)
- `attachments: never[]` in MessageContext (Section 3.2, line 470) -- uses `never[]` to explicitly signal deferred status
- Comment `// File sharing deferred` in activity handler (line 303)

The **implementation plan** correctly omits File Sharing:
- States "file sharing is deferred to a future version" (line 33)
- No tasks reference file sharing

### 2.2 Interface Mismatches Between Architecture and Specification

| Interface | Architecture Doc | Specification | Impact |
|-----------|-----------------|---------------|--------|
| `teamsToClaudeMessage` return type | `Promise<SDKUserMessage>` | `Promise<string>` | **Major** -- different return types. Spec returns plain string, arch returns SDK message object |
| `MessageContext.attachments` | `Attachment[]` | `never[]` | Expected (file sharing dropped) |
| `TeamsToClaudeTransformer` scope | Handles attachments, images, @mentions | Only @mentions and whitespace | Expected (file sharing dropped) |
| `ITeamsBotService` interface | Explicit interface defined | Not defined; uses Teams SDK App directly | Minor -- spec chose thinner abstraction |

### 2.3 Technology Choices

Technology choices are **consistent** across all 4 documents:
- Teams SDK v2 (`@microsoft/teams.apps` + `@microsoft/teams.mcp`) -- consistent
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) -- consistent
- Adaptive Cards v1.5 with CodeBlock -- consistent
- Zod for validation -- consistent
- Vitest for testing -- consistent
- Pino for logging -- consistent
- Esbuild for bundling -- consistent
- Commander for CLI -- consistent

### 2.4 Data Model Alignment

Data models align well between spec and implementation plan:
- Configuration schema (Zod) matches in both documents
- Session/conversation persistence models match
- Audit log format matches
- Card action data types match

### 2.5 Milestone Dependencies

Milestone dependencies are logical:
- M1 (infrastructure) -> M2 (bot) -> M3 (Claude) -> M4 (bridge) -> M7 (polish) -- correct critical path
- M5 (cards) depends on M4 interfaces -- correct
- M6 (auth/security) depends on M2 -- correct
- M5 and M6 can run in parallel -- correct

The one concern is that M5 (Adaptive Cards) starts after M4 (Bridge), but the card renderer interfaces are already defined in M3 tasks. The dependency could be relaxed to allow M5 to start once M3 card interfaces are available.

### Consistency Issues

| ID | Severity | Finding | Suggested Fix |
|----|----------|---------|---------------|
| S1 | Critical | Architecture doc still contains full File Sharing Service spec (Section 2.5), file-related sequence diagrams, ActivityRouter fileConsent routing, and file config options | Remove or clearly mark all File Sharing content as "Deferred to v2.0" with a consistent banner. Remove from architecture diagram. |
| S2 | Major | `IMessageBridge.teamsToClaudeMessage()` return type is `Promise<SDKUserMessage>` in architecture but `Promise<string>` in spec | Reconcile to `Promise<string>` (spec is authoritative and simpler) and update architecture doc |
| S3 | Minor | Architecture doc lists `MarkdownAdapter` module in Message Bridge but spec and plan omit it | Remove from architecture doc or add clarifying note that markdown handling is embedded in ClaudeToTeamsTransformer |
| S4 | Minor | Architecture doc's MessageContext has `attachments: Attachment[]`; spec has `attachments: never[]` | Update architecture doc to match spec |
| S5 | Minor | Architecture doc lists `BudgetTracker` as a separate module in Session Manager; spec handles budgets inline via query options | Clarify which approach is canonical. The spec's approach (relying on SDK `maxBudgetUsd` option) is simpler. |

---

## 3. Feasibility (Score: 88/100)

### 3.1 Technology Choices for Local-First Deployment

The local-first architecture is well-suited to the technology choices:
- Single Node.js process -- no containers, no cloud backend
- File-based persistence (`~/.cc-ms-teams/`) -- no database required
- Child process tunnel management -- clean lifecycle management
- In-memory rate limiting -- appropriate for single-user workloads

### 3.2 Teams SDK v2 Feasibility

The Teams SDK v2 (`@microsoft/teams.apps`) is described in the research report as GA for JavaScript/TypeScript. The `App` class API, `McpPlugin`, and event handler patterns (`app.on('message', ...)`) are consistent with the documented SDK.

**Risk:** The implementation plan's Risk Register correctly identifies that Teams SDK v2 may still have API changes (R1). The mitigation (pin version, thin adapter) is appropriate.

### 3.3 Claude Agent SDK Feasibility

The streaming input mode (`query()` with async iterable prompt) is well-documented in the research report with working code examples. The `canUseTool` callback, hooks system, and `permissionMode` options are all covered.

**Risk:** The `StreamInputAdapter` pattern (push-pull queue bridging Teams messages to Claude SDK) is the most novel part of the design. The implementation plan correctly identifies this as critical path (R2).

### 3.4 Adaptive Cards CodeBlock

The `CodeBlock` element with `codeSnippet` and `language` properties is documented in the research report with 22+ supported languages. The spec's language mapper covers all documented languages.

**Concern:** The side-by-side diff card uses `ColumnSet` with `CodeBlock` inside `Column` items. This is valid Adaptive Card schema but may render poorly on mobile Teams clients where columns collapse. The spec mentions a unified diff fallback for >20 lines but not for narrow viewports.

### 3.5 Scope Realism (62 Tasks)

The 62-task scope breaks down as:
- M1: 9 tasks (infrastructure)
- M2: 9 tasks (bot foundation)
- M3: 10 tasks (Claude integration)
- M4: 10 tasks (bridge/streaming)
- M5: 8 tasks (adaptive cards)
- M6: 9 tasks (auth/security)
- M7: 7 tasks (polish/testing)

With 45 tasks on the critical path and parallel opportunities for M5/M6, this is achievable for a 2-developer team over approximately 4-6 weeks. Task sizing (S/M/L) appears reasonable. The critical path bottleneck at M3 (4 Large tasks) is correctly identified.

### 3.6 Dev Tunnel Reliability

Dev tunnels are inherently fragile for persistent connections. The spec addresses this with:
- Persistent tunnel IDs (same URL across restarts)
- Health monitoring (30s interval)
- Auto-reconnection (5 attempts with backoff)
- ngrok fallback
- Message queueing during reconnection (60s window)

This is adequate, though developers should expect occasional brief outages.

### 3.7 Security Adequacy

Security measures are appropriate for the threat model (local developer tool exposed via Azure Bot Service):
- Two-layer auth (Azure AD JWT + user ACL)
- Single-tenant by default
- Read-only tools by default
- Rate limiting (10 req/min per user)
- Sensitive path blocking
- Audit logging
- Bot credentials stored with 0600 permissions

**Concern:** The MCP endpoint (`/mcp`) is described as "Local only (not exposed through tunnel by default)" but no mechanism is specified to prevent it from being accessed through the tunnel. If the bot server listens on `0.0.0.0:3978` and the tunnel forwards all traffic, the MCP endpoint would be accessible. A path-based tunnel filter or middleware is needed.

### Feasibility Issues

| ID | Severity | Finding | Suggested Fix |
|----|----------|---------|---------------|
| F1 | Major | MCP endpoint `/mcp` claims to be local-only but no mechanism prevents tunnel exposure | Add middleware to reject MCP requests that arrive through the tunnel (check X-Forwarded-For or similar header) or bind MCP on a separate port |
| F2 | Minor | Side-by-side diff cards may render poorly on mobile Teams clients | Add a responsive fallback: detect viewport or always use unified diff format for mobile-originated messages (if detectable from activity metadata) |
| F3 | Minor | The reconnection backoff in M7-T2 (5s, 10s, 20s, 40s, 60s) differs from the spec's Section 8.2 (immediate, 2s, 4s, 8s, 16s) | Reconcile the two backoff sequences. The spec's faster initial retry is better for developer experience. |

---

## 4. Accuracy (Score: 80/100)

### 4.1 MS Teams SDK v2 API References

| API | Usage in Spec | Assessment |
|-----|--------------|------------|
| `@microsoft/teams.apps` `App` class | `new App({ plugins })` | Plausible -- matches research report examples |
| `app.on('message', ...)` handler | `async ({ activity, send }) => {}` | Plausible -- matches research report examples |
| `app.on('card.action', ...)` handler | `async ({ activity, send }) => {}` | Plausible -- but research report shows `card.action` without detailed examples; verify event name |
| `app.on('install.add', ...)` handler | `async ({ activity, send }) => {}` | Plausible -- common Teams SDK pattern |
| `McpPlugin` from `@microsoft/teams.mcp` | `mcpPlugin.tool(name, desc, schema, options, handler)` | Plausible -- matches research report |
| `DevtoolsPlugin` from `@microsoft/teams.dev` | Used conditionally in dev mode | Plausible |
| `@microsoft/teams.api` | Activity types | Referenced but not directly imported in spec code samples |

**Concern:** The Teams SDK v2 package names (`@microsoft/teams.apps`, etc.) use a dot-separated naming convention that is unusual for npm packages. The research report states these are the correct names, but they should be verified against the npm registry before implementation starts.

### 4.2 Claude Agent SDK API References

| API | Usage in Spec | Assessment |
|-----|--------------|------------|
| `query()` function | `import { query } from '@anthropic-ai/claude-agent-sdk'` | Matches research report |
| Streaming input (async iterable prompt) | `query({ prompt: asyncIterable, options: {...} })` | Matches research report |
| `options.canUseTool` | `async (toolName, input, { signal }) => { behavior, message }` | Matches research report (signal param confirmed) |
| `options.hooks` | `Notification`, `PostToolUse`, `SessionEnd` | Plausible -- research report mentions hooks system |
| `options.permissionMode` | `'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'` | Matches research report |
| `options.systemPrompt` | `{ type: 'preset', preset: 'claude_code', append: string }` | Plausible -- matches research report patterns |
| `query.initializationResult()` | Returns `{ sessionId }` | Plausible but not explicitly shown in research report |
| `query.interrupt()` | Stops the session | Plausible -- referenced in research report |
| `SDKMessage` types | `assistant`, `result`, `partial` | Matches research report |

**Concern:** The `query().initializationResult()` method and exact shape of `SDKPartialAssistantMessage` (`delta.text`) are used in the spec but not explicitly demonstrated in the research report. These should be verified against SDK documentation.

### 4.3 Adaptive Card Schema Accuracy

| Element | Usage | Assessment |
|---------|-------|------------|
| `CodeBlock` with `codeSnippet`, `language` | Correct | Matches research report Section 8 |
| `CodeBlock.startLineNumber` | Used for line-numbered display | Matches research report |
| `ColumnSet` with `Column` items | Used for side-by-side diffs | Standard Adaptive Cards schema |
| `Container` with `style: 'attention'` | Used for error cards | Standard Adaptive Cards schema |
| `FactSet` with `facts` array | Used for session summary | Standard Adaptive Cards schema |
| `Action.Submit` with `data` payload | Used for permission buttons | Standard Adaptive Cards schema |
| `Action.OpenUrl` with `vscode://` URI | Used for VS Code deep links | Valid URI scheme |
| Card version `1.5` | Used throughout | Correct for CodeBlock support |

**Concern:** The spec claims 22 supported CodeBlock languages, but the research report's list contains 23 entries (Bash, C, C++, C#, CSS, DOS, Go, GraphQL, HTML, Java, JavaScript, JSON, Perl, PHP, PowerShell, Python, SQL, TypeScript, Visual Basic, Verilog, VHDL, XML, PlainText). The language mapper in the spec includes all of these, but the "22 languages" claim should be updated to "23 languages" or explicitly exclude PlainText from the count.

### 4.4 Azure AD Registration Steps

The setup wizard's Azure Bot registration flow (spec Section 3.5) follows the current Azure Portal workflow:
- Bot handle, single-tenant, create new App ID -- correct Azure Bot creation flow
- Copy Client ID, Client Secret, Tenant ID -- correct credential collection
- Manifest schema `v1.17` -- current as of March 2026
- Sideloading via "Upload a custom app" -- correct Teams install path

### Accuracy Issues

| ID | Severity | Finding | Suggested Fix |
|----|----------|---------|---------------|
| A1 | Major | `card.action` event name for Adaptive Card submit actions not explicitly confirmed in Teams SDK v2 research | Verify the exact event name in Teams SDK v2 docs. It may be `invoke` or `messageReaction` or a different handler registration pattern. |
| A2 | Minor | Spec claims "22 languages" for CodeBlock but the actual list has 23 entries (including PlainText) | Update to "23 languages" or "22 languages plus PlainText" for accuracy |
| A3 | Minor | `query().initializationResult()` API not explicitly demonstrated in research report | Verify this method exists in Claude Agent SDK; add fallback sessionId generation if not available |
| A4 | Minor | `SDKPartialAssistantMessage` shape (specifically `delta.text`) not confirmed in research report | Verify the exact streaming partial message format against SDK docs |
| A5 | Minor | Teams SDK v2 package names use unusual dot notation (`@microsoft/teams.apps`); verify npm availability | Run `npm view @microsoft/teams.apps` before starting M1-T1 |

---

## 5. Scored Assessment Summary

| Criteria | Score | Rationale |
|----------|-------|-----------|
| **Completeness** | 82/100 | All 6 components fully specified with interfaces, config, and error handling. Gaps: one undefined MCP tool, missing MCP sequence diagram, MarkdownAdapter omission. |
| **Consistency** | 75/100 | Spec and implementation plan are well-aligned. Architecture doc has significant stale content (File Sharing Service) and interface mismatches that need cleanup. |
| **Feasibility** | 88/100 | Technology choices are practical, scope is realistic, security is adequate. MCP endpoint exposure is the main concern. |
| **Accuracy** | 80/100 | Most API references align with research report. A few SDK method calls need verification. Minor language count discrepancy. |

**Weighted Overall: 81/100**

---

## 6. Complete Issue Registry

### Critical Issues (1)

| ID | Issue | Impact | Fix |
|----|-------|--------|-----|
| S1 | Architecture doc contains full File Sharing Service specification, sequence diagrams, config, and routing that was dropped from v1.0 | Developers will implement dropped features; wasted effort and scope creep | Remove or clearly gate all File Sharing content in architecture doc behind a "DEFERRED v2.0" banner. Remove from architecture diagram and ActivityRouter routing table. |

### Major Issues (4)

| ID | Issue | Impact | Fix |
|----|-------|--------|-----|
| C1 | `getConversationHistory` MCP tool listed but never implemented | Incomplete API surface; runtime error if called | Add implementation or remove from spec Section 5.2 |
| S2 | `teamsToClaudeMessage()` return type mismatch: `SDKUserMessage` (arch) vs `string` (spec) | Interface confusion during implementation | Standardize on `string` (spec) and update architecture doc |
| F1 | MCP endpoint `/mcp` accessible through dev tunnel despite "local only" claim | Security risk: external parties could invoke MCP tools | Add request-origin middleware or bind MCP to localhost-only port |
| A1 | `card.action` event name not verified in Teams SDK v2 | Activity handler may not fire; permission flow broken | Verify against SDK docs; may need `app.on('invoke', ...)` pattern |

### Minor Issues (11)

| ID | Issue | Impact | Fix |
|----|-------|--------|-----|
| C2 | No MCP-initiated bidirectional flow diagram | Documentation gap | Add sequence diagram |
| C3 | No MCP endpoint error handling specified | Edge case errors unhandled | Add to Section 8.1 |
| C4 | MarkdownAdapter in architecture doc but absent from spec/plan | Module confusion | Remove from architecture doc or add to spec |
| C5 | No task for generating Teams app icons | Missing assets at runtime | Add to M2 setup task |
| S3 | Architecture doc MarkdownAdapter not in spec/plan | Document drift | Align documents |
| S4 | Architecture doc MessageContext.attachments type mismatch | Document drift | Update architecture doc |
| S5 | BudgetTracker as separate module (arch) vs inline (spec) | Design ambiguity | Clarify canonical approach |
| F2 | Side-by-side diff may render poorly on mobile | Poor mobile UX | Add unified diff fallback for narrow viewports |
| F3 | Reconnection backoff timings differ between spec and plan | Implementation ambiguity | Reconcile to spec's values |
| A2 | "22 languages" claim but 23 entries in list | Minor documentation error | Fix count |
| A3 | `query().initializationResult()` not confirmed in research | Potential runtime failure | Verify or add fallback |
| A4 | `SDKPartialAssistantMessage.delta.text` not confirmed | Potential runtime failure | Verify against SDK docs |
| A5 | Teams SDK v2 npm package names need registry verification | Potential install failure | Verify before M1-T1 |

---

## 7. Overall Readiness Assessment

**Assessment: needs-revisions**

The specification package is substantially complete and well-designed. The core architecture, component interfaces, data flows, and implementation plan are solid. However, three categories of issues require attention before implementation should begin:

1. **Architecture document cleanup (critical):** The File Sharing Service must be removed or clearly deferred. This is the single most important fix to prevent scope creep and developer confusion.

2. **Interface reconciliation (major):** The `teamsToClaudeMessage()` return type and a few other mismatches between the architecture doc and specification need to be resolved. The specification should be treated as authoritative.

3. **Security gap (major):** The MCP endpoint exposure through the dev tunnel needs a concrete mitigation mechanism before implementation.

Once these revisions are made (estimated effort: 2-4 hours of document editing), the specification package will be ready for implementation.
