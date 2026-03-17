/**
 * @process cc-ms-teams-spec
 * @description Research and create comprehensive specification for Claude Code MS Teams plugin -
 *              bidirectional chat interface with file sharing, local-first architecture.
 * @inputs { projectName: string, requirements: object }
 * @outputs { success: boolean, specification: object, implementationPlan: object, artifacts: array }
 *
 * @skill mcp-sdk-typescript-bootstrapper specializations/cli-mcp-development/skills/mcp-sdk-typescript-bootstrapper/SKILL.md
 * @agent mcp-protocol-expert specializations/cli-mcp-development/agents/mcp-protocol-expert/AGENT.md
 * @agent mcp-transport-architect specializations/cli-mcp-development/agents/mcp-transport-architect/AGENT.md
 * @agent plugin-system-architect specializations/cli-mcp-development/agents/plugin-system-architect/AGENT.md
 * @agent cli-ux-architect specializations/cli-mcp-development/agents/cli-ux-architect/AGENT.md
 */

import { defineTask } from '@a5c-ai/babysitter-sdk';

export async function process(inputs, ctx) {
  const {
    projectName = 'cc-ms-teams',
    requirements = {}
  } = inputs;

  const startTime = ctx.now();
  const artifacts = [];

  ctx.log('info', `Starting specification process for: ${projectName}`);

  // ============================================================================
  // PHASE 1: DEEP RESEARCH - Existing solutions, APIs, architecture patterns
  // ============================================================================

  ctx.log('info', 'Phase 1: Deep research on MS Teams Bot Framework, Claude Code SDK, and existing solutions');

  const researchResult = await ctx.task(deepResearchTask, {
    projectName,
    requirements,
    researchTopics: [
      'Microsoft Teams SDK v2 with MCP support - bot architecture, activity handlers, adaptive cards',
      'Claude Agent SDK (TypeScript) - programmatic session management, streaming, tool access',
      'Claude Code headless mode and hooks system for integration',
      'Existing teams-claude-bot project architecture and lessons learned',
      'Composio MS Teams MCP server capabilities and limitations',
      'Azure Bot Service registration and local development with dev tunnels',
      'Teams Adaptive Cards for code rendering, diffs, and file sharing',
      'Proactive messaging patterns for sending Claude Code outputs to Teams',
      'Authentication: Azure AD app registration vs personal access tokens',
      'Security considerations for exposing Claude Code via Teams'
    ]
  });
  artifacts.push('research-report.md');

  // ============================================================================
  // PHASE 2: ARCHITECTURE DESIGN - System components and data flow
  // ============================================================================

  ctx.log('info', 'Phase 2: Architecture design');

  const architectureResult = await ctx.task(architectureDesignTask, {
    projectName,
    requirements,
    research: researchResult
  });
  artifacts.push('architecture-design.md');

  // Quality gate: Review architecture
  await ctx.breakpoint({
    question: 'Review the architecture design. Does the component layout, data flow, and technology choices look correct for a local-first Teams-Claude Code bridge?',
    title: 'Architecture Review',
    context: {
      runId: ctx.runId,
      summary: 'Architecture design for local Teams bot bridging to Claude Code via Agent SDK'
    }
  });

  // ============================================================================
  // PHASE 3: DETAILED SPECIFICATION - Component specs, API contracts, data models
  // ============================================================================

  ctx.log('info', 'Phase 3: Detailed specification');

  const specificationResult = await ctx.task(detailedSpecificationTask, {
    projectName,
    requirements,
    research: researchResult,
    architecture: architectureResult
  });
  artifacts.push('specification.md');

  // ============================================================================
  // PHASE 4: IMPLEMENTATION PLAN - Milestones, tasks, dependencies
  // ============================================================================

  ctx.log('info', 'Phase 4: Implementation plan');

  const implementationPlanResult = await ctx.task(implementationPlanTask, {
    projectName,
    requirements,
    architecture: architectureResult,
    specification: specificationResult
  });
  artifacts.push('implementation-plan.md');

  // ============================================================================
  // PHASE 5: SPECIFICATION VALIDATION - Cross-check completeness and consistency
  // ============================================================================

  ctx.log('info', 'Phase 5: Specification validation');

  const validationResult = await ctx.task(specValidationTask, {
    projectName,
    requirements,
    research: researchResult,
    architecture: architectureResult,
    specification: specificationResult,
    implementationPlan: implementationPlanResult
  });
  artifacts.push('validation-report.md');

  // Final quality gate
  await ctx.breakpoint({
    question: 'Review the complete specification package: research findings, architecture, detailed spec, implementation plan, and validation report. Is the specification comprehensive and ready for implementation?',
    title: 'Final Specification Review',
    context: {
      runId: ctx.runId,
      artifacts
    }
  });

  return {
    success: true,
    projectName,
    research: researchResult,
    architecture: architectureResult,
    specification: specificationResult,
    implementationPlan: implementationPlanResult,
    validation: validationResult,
    artifacts,
    duration: ctx.now() - startTime,
    metadata: {
      processId: 'cc-ms-teams-spec',
      timestamp: startTime
    }
  };
}

// ============================================================================
// TASK DEFINITIONS
// ============================================================================

export const deepResearchTask = defineTask('deep-research', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Deep research: MS Teams + Claude Code integration landscape',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior technical researcher specializing in API integrations and bot frameworks',
      task: `Conduct deep research for building a Claude Code ↔ Microsoft Teams bidirectional chat plugin called "${args.projectName}".`,
      context: {
        projectName: args.projectName,
        requirements: args.requirements,
        researchTopics: args.researchTopics,
        knownExisting: {
          'teams-claude-bot': 'Open source GitHub project (Marvae/teams-claude-bot) that bridges Claude Code to Teams using Bot Framework SDK + Claude Agent SDK',
          'composio-mcp': 'Composio provides a hosted MCP server for Teams, but reverse direction (Claude acts on Teams)',
          'claude-m365-connector': 'Official Claude M365 connector for Team/Enterprise plans',
          'teams-sdk-v2': 'Microsoft Teams SDK v2 now has native MCP support and A2A protocol',
          'copilot-cowork': 'Microsoft Copilot Cowork launched March 2026 with Claude integration'
        }
      },
      instructions: [
        'Research each topic thoroughly using web searches and documentation fetching',
        'For MS Teams Bot architecture: document the Teams SDK v2 approach (NOT the deprecated Bot Framework), activity handlers, card system, proactive messaging, and MCP integration capabilities',
        'For Claude Code: document the Agent SDK TypeScript API (query function, streaming, tool permissions), headless mode CLI options, hooks system, and MCP server capabilities',
        'For existing solutions: analyze Marvae/teams-claude-bot architecture in detail - what works, what are the limitations, what can we improve',
        'For authentication: document both Azure AD app registration flow AND simpler personal token approaches',
        'For local development: document ngrok/dev tunnel setup for receiving Teams webhooks locally',
        'Produce a comprehensive research report as a markdown document saved to the project',
        'The research report should be written to: docs/research-report.md',
        'Include specific API references, code patterns, and concrete technical details - not just high-level descriptions',
        'Include a section on security considerations for exposing local Claude Code sessions via Teams'
      ],
      outputFormat: 'JSON with summary and key findings'
    },
    outputSchema: {
      type: 'object',
      required: ['summary', 'findings', 'recommendations'],
      properties: {
        summary: { type: 'string', description: 'Executive summary of research findings' },
        findings: {
          type: 'object',
          properties: {
            teamsArchitecture: { type: 'object', description: 'MS Teams bot architecture details' },
            claudeCodeSDK: { type: 'object', description: 'Claude Agent SDK capabilities' },
            existingSolutions: { type: 'object', description: 'Analysis of existing solutions' },
            authentication: { type: 'object', description: 'Auth approaches' },
            localDevelopment: { type: 'object', description: 'Local dev setup' },
            security: { type: 'object', description: 'Security considerations' }
          }
        },
        recommendations: { type: 'array', items: { type: 'string' }, description: 'Key recommendations for architecture' },
        artifacts: { type: 'array', items: { type: 'string' }, description: 'Files created' }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['research', 'teams', 'claude-code', 'specification']
}));

export const architectureDesignTask = defineTask('architecture-design', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Architecture design: System components and data flow',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior software architect specializing in bot frameworks, real-time messaging systems, and developer tools',
      task: `Design the system architecture for "${args.projectName}" - a local-first Claude Code ↔ MS Teams bidirectional chat plugin.`,
      context: {
        projectName: args.projectName,
        requirements: args.requirements,
        researchFindings: args.research
      },
      instructions: [
        'Design a clean, modular architecture for a local-first Teams bot that bridges to Claude Code',
        'Key components to design:',
        '  1. Teams Bot Service - handles incoming Teams messages using Teams SDK v2 or M365 Agents SDK',
        '  2. Message Bridge - translates between Teams message format and Claude Code format',
        '  3. Claude Code Session Manager - manages Claude Agent SDK sessions (start, send, receive, stream)',
        '  4. Adaptive Card Renderer - formats Claude Code outputs (code, diffs, file trees) as Teams Adaptive Cards',
        '  5. File Sharing Service - handles code snippets, diff attachments, and file uploads between Teams and local filesystem',
        '  6. Auth Module - supports both Azure AD and personal token authentication',
        '  7. Dev Tunnel Manager - manages ngrok/dev tunnel for local development',
        'Document the data flow for:',
        '  - User sends a message in Teams → Claude Code processes it → response sent back to Teams',
        '  - Claude Code outputs (streaming) → formatted as Adaptive Cards → sent to Teams',
        '  - File/code snippet shared from Claude Code → Adaptive Card with syntax highlighting in Teams',
        '  - User uploads a file in Teams → available to Claude Code session',
        'Define the technology stack: TypeScript/Node.js, Teams SDK v2, Claude Agent SDK, Express/Fastify',
        'Create ASCII component diagrams showing the architecture',
        'Write the architecture document to: docs/architecture-design.md',
        'Include deployment architecture for local machine with dev tunnel',
        'Include error handling and reconnection strategies'
      ],
      outputFormat: 'JSON with architecture summary'
    },
    outputSchema: {
      type: 'object',
      required: ['components', 'dataFlows', 'techStack', 'deploymentModel'],
      properties: {
        components: { type: 'array', description: 'List of system components' },
        dataFlows: { type: 'array', description: 'Key data flow descriptions' },
        techStack: { type: 'object', description: 'Technology stack decisions' },
        deploymentModel: { type: 'object', description: 'Deployment architecture' },
        artifacts: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['architecture', 'design', 'teams', 'claude-code']
}));

export const detailedSpecificationTask = defineTask('detailed-specification', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Detailed specification: Component specs, API contracts, data models',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior technical writer and software architect creating detailed engineering specifications',
      task: `Create a comprehensive, detailed specification document for "${args.projectName}" - the Claude Code MS Teams plugin.`,
      context: {
        projectName: args.projectName,
        requirements: args.requirements,
        research: args.research,
        architecture: args.architecture
      },
      instructions: [
        'Create a comprehensive specification document at: docs/specification.md',
        'The spec must include ALL of the following sections:',
        '',
        '## 1. Executive Summary',
        '- Project overview, goals, and scope',
        '- Target users and use cases',
        '- Key differentiators from existing solutions',
        '',
        '## 2. System Architecture',
        '- High-level architecture diagram (ASCII)',
        '- Component inventory with responsibilities',
        '- Deployment topology (local machine + dev tunnel)',
        '',
        '## 3. Component Specifications',
        'For EACH component, specify:',
        '- Purpose and responsibilities',
        '- Public API / interface definitions (TypeScript interfaces)',
        '- Dependencies on other components',
        '- Configuration options',
        '- Error handling behavior',
        '',
        '### 3.1 Teams Bot Service',
        '- Teams SDK v2 integration details',
        '- Activity handler implementation',
        '- Message routing logic',
        '- Bot registration and manifest',
        '',
        '### 3.2 Message Bridge',
        '- Teams → Claude Code message transformation',
        '- Claude Code → Teams response transformation',
        '- Streaming response handling (chunking, progressive updates)',
        '- Message history and context management',
        '',
        '### 3.3 Claude Code Session Manager',
        '- Claude Agent SDK integration (TypeScript)',
        '- Session lifecycle (create, query, stream, destroy)',
        '- Tool permissions and allowedTools configuration',
        '- Working directory and project context management',
        '- Concurrent session handling',
        '',
        '### 3.4 Adaptive Card Renderer',
        '- Card templates for: code blocks, diffs, file trees, progress indicators, error messages',
        '- Syntax highlighting approach',
        '- Card actions (copy code, expand/collapse, approve/reject)',
        '- Message size handling (chunking long responses)',
        '',
        '### 3.5 File Sharing Service',
        '- Code snippet rendering in Adaptive Cards',
        '- File upload handling (Teams → local filesystem)',
        '- Diff visualization cards',
        '- File tree navigation cards',
        '',
        '### 3.6 Authentication Module',
        '- Azure AD app registration flow (detailed steps)',
        '- Personal access token flow (simpler alternative)',
        '- Token storage and refresh',
        '- User authorization and permission scoping',
        '',
        '### 3.7 Dev Tunnel Manager',
        '- ngrok / VS Code dev tunnel integration',
        '- Automatic tunnel lifecycle management',
        '- HTTPS certificate handling',
        '',
        '## 4. Data Models',
        '- TypeScript interfaces for all data structures',
        '- Message format definitions',
        '- Session state model',
        '- Configuration schema',
        '',
        '## 5. API Contracts',
        '- Internal component APIs',
        '- Teams webhook endpoints',
        '- Health check and monitoring endpoints',
        '',
        '## 6. Security Specification',
        '- Authentication and authorization model',
        '- Rate limiting and abuse prevention',
        '- Data privacy (what data leaves the machine)',
        '- Tool permission scoping for Claude Code',
        '- Secure tunnel configuration',
        '',
        '## 7. Configuration',
        '- Environment variables',
        '- Configuration file schema (JSON/YAML)',
        '- Sensible defaults',
        '',
        '## 8. Error Handling',
        '- Error categories and handling strategies',
        '- Reconnection logic',
        '- User-facing error messages in Teams',
        '- Logging and observability',
        '',
        '## 9. Testing Strategy',
        '- Unit testing approach',
        '- Integration testing with mock Teams endpoints',
        '- E2E testing strategy',
        '',
        '## 10. Non-Functional Requirements',
        '- Performance targets (message latency, streaming throughput)',
        '- Resource usage (memory, CPU on local machine)',
        '- Reliability and recovery',
        '',
        'Make the specification detailed enough that a developer could implement the system without additional clarification.',
        'Include TypeScript interface definitions for all major data structures.',
        'Include Adaptive Card JSON templates for the key card types.'
      ],
      outputFormat: 'JSON with specification summary and artifact paths'
    },
    outputSchema: {
      type: 'object',
      required: ['sections', 'artifacts'],
      properties: {
        sections: { type: 'array', description: 'List of specification sections with summaries' },
        keyDecisions: { type: 'array', description: 'Key technical decisions made' },
        openQuestions: { type: 'array', description: 'Any remaining open questions' },
        artifacts: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['specification', 'detailed', 'teams', 'claude-code']
}));

export const implementationPlanTask = defineTask('implementation-plan', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Implementation plan: Milestones, tasks, and dependencies',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior project technical lead creating implementation roadmaps',
      task: `Create a detailed implementation plan for "${args.projectName}" based on the architecture and specification.`,
      context: {
        projectName: args.projectName,
        requirements: args.requirements,
        architecture: args.architecture,
        specification: args.specification
      },
      instructions: [
        'Create a detailed implementation plan at: docs/implementation-plan.md',
        'Organize into milestones with clear deliverables:',
        '',
        '### Milestone 1: Project Bootstrap & Core Infrastructure',
        '- TypeScript project setup with build tooling',
        '- Configuration system',
        '- Logging and error handling framework',
        '- Dev tunnel integration (ngrok)',
        '',
        '### Milestone 2: Teams Bot Foundation',
        '- Azure Bot registration and app manifest',
        '- Teams SDK v2 bot setup with activity handlers',
        '- Basic message echo (Teams → bot → Teams)',
        '- Local testing with Bot Framework Emulator',
        '',
        '### Milestone 3: Claude Code Integration',
        '- Claude Agent SDK session management',
        '- Basic query/response flow (no streaming)',
        '- Tool permission configuration',
        '- Working directory management',
        '',
        '### Milestone 4: Message Bridge & Streaming',
        '- Bidirectional message transformation',
        '- Streaming response handling with progressive Teams message updates',
        '- Message history and context tracking',
        '',
        '### Milestone 5: Adaptive Cards & Rich Output',
        '- Code block cards with syntax highlighting',
        '- Diff visualization cards',
        '- File tree cards',
        '- Error and progress indicator cards',
        '- Card action handlers (copy, expand, etc.)',
        '',
        '### Milestone 6: File Sharing',
        '- Code snippet rendering',
        '- File upload from Teams to local filesystem',
        '- File/diff attachment sharing from Claude Code to Teams',
        '',
        '### Milestone 7: Authentication & Security',
        '- Azure AD authentication flow',
        '- Personal token authentication',
        '- User permission scoping',
        '- Security hardening',
        '',
        '### Milestone 8: Polish & Documentation',
        '- Error handling refinement',
        '- Performance optimization',
        '- User documentation',
        '- Setup guide',
        '',
        'For each milestone:',
        '- List specific implementation tasks with estimated complexity (S/M/L)',
        '- Identify dependencies between tasks',
        '- Define acceptance criteria',
        '- Note any risks or blockers',
        '',
        'Include a dependency graph between milestones',
        'Include recommended tech stack with package versions',
        'Include a project directory structure'
      ],
      outputFormat: 'JSON with milestones and task counts'
    },
    outputSchema: {
      type: 'object',
      required: ['milestones', 'totalTasks', 'artifacts'],
      properties: {
        milestones: { type: 'array', description: 'List of milestones with task counts' },
        totalTasks: { type: 'number', description: 'Total number of implementation tasks' },
        criticalPath: { type: 'array', description: 'Critical path milestones' },
        risks: { type: 'array', description: 'Identified risks' },
        artifacts: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['planning', 'implementation', 'milestones']
}));

export const specValidationTask = defineTask('spec-validation', (args, taskCtx) => ({
  kind: 'agent',
  title: 'Specification validation: Completeness and consistency check',
  agent: {
    name: 'general-purpose',
    prompt: {
      role: 'Senior QA architect and specification reviewer',
      task: `Validate the complete specification package for "${args.projectName}" for completeness, consistency, and feasibility.`,
      context: {
        projectName: args.projectName,
        requirements: args.requirements,
        research: args.research,
        architecture: args.architecture,
        specification: args.specification,
        implementationPlan: args.implementationPlan
      },
      instructions: [
        'Read all generated specification documents in the docs/ directory',
        'Validate the specification against these criteria:',
        '',
        '1. COMPLETENESS',
        '- Are all required components specified?',
        '- Are all data flows documented?',
        '- Are all API contracts defined?',
        '- Are all configuration options documented?',
        '- Are error handling strategies defined for each component?',
        '',
        '2. CONSISTENCY',
        '- Do component interfaces match across documents?',
        '- Are technology choices consistent?',
        '- Do data models align between components?',
        '- Does the implementation plan cover everything in the spec?',
        '',
        '3. FEASIBILITY',
        '- Are the technology choices practical for local-first deployment?',
        '- Are there any known limitations of the chosen APIs that are not addressed?',
        '- Is the scope realistic?',
        '- Are security measures adequate?',
        '',
        '4. ACCURACY',
        '- Are MS Teams API references accurate and up-to-date?',
        '- Are Claude Agent SDK API references accurate?',
        '- Are Adaptive Card schemas valid?',
        '',
        'Write the validation report to: docs/validation-report.md',
        'Include:',
        '- Summary of findings',
        '- List of issues found (critical, major, minor)',
        '- Suggested fixes for each issue',
        '- Overall readiness assessment (ready / needs revisions / major rework)',
        '',
        'If critical issues are found, suggest specific fixes inline in the report'
      ],
      outputFormat: 'JSON with validation summary'
    },
    outputSchema: {
      type: 'object',
      required: ['overallAssessment', 'issues'],
      properties: {
        overallAssessment: { type: 'string', enum: ['ready', 'needs-revisions', 'major-rework'] },
        issues: {
          type: 'object',
          properties: {
            critical: { type: 'array' },
            major: { type: 'array' },
            minor: { type: 'array' }
          }
        },
        completenessScore: { type: 'number', description: 'Score 0-100' },
        consistencyScore: { type: 'number', description: 'Score 0-100' },
        feasibilityScore: { type: 'number', description: 'Score 0-100' },
        artifacts: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  io: {
    inputJsonPath: `tasks/${taskCtx.effectId}/input.json`,
    outputJsonPath: `tasks/${taskCtx.effectId}/result.json`
  },
  labels: ['validation', 'quality', 'specification']
}));
