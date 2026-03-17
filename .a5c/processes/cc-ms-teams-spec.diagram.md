# CC-MS-Teams Specification Process - Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                  CC-MS-Teams Specification Process                    │
│                                                                      │
│  ┌──────────────────┐                                                │
│  │  PHASE 1: DEEP   │  Research MS Teams SDK v2, Claude Agent SDK,   │
│  │  RESEARCH         │  existing solutions, auth patterns, security   │
│  │  (agent task)     │                                                │
│  └────────┬─────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────┐                                                │
│  │  PHASE 2:        │  Component design, data flows, tech stack,     │
│  │  ARCHITECTURE    │  deployment model, ASCII diagrams              │
│  │  DESIGN          │                                                │
│  │  (agent task)    │                                                │
│  └────────┬─────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────┐                                                │
│  │  ★ BREAKPOINT    │  Review architecture before proceeding         │
│  │  Architecture    │                                                │
│  │  Review          │                                                │
│  └────────┬─────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────┐                                                │
│  │  PHASE 3:        │  Full spec: component specs, API contracts,    │
│  │  DETAILED        │  data models, TypeScript interfaces,           │
│  │  SPECIFICATION   │  Adaptive Card templates, security spec        │
│  │  (agent task)    │                                                │
│  └────────┬─────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────┐                                                │
│  │  PHASE 4:        │  8 milestones with tasks, dependencies,        │
│  │  IMPLEMENTATION  │  acceptance criteria, risk assessment,          │
│  │  PLAN            │  directory structure                            │
│  │  (agent task)    │                                                │
│  └────────┬─────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────┐                                                │
│  │  PHASE 5:        │  Cross-check completeness, consistency,        │
│  │  SPECIFICATION   │  feasibility, accuracy of all docs             │
│  │  VALIDATION      │                                                │
│  │  (agent task)    │                                                │
│  └────────┬─────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────┐                                                │
│  │  ★ BREAKPOINT    │  Final review of complete spec package         │
│  │  Final Review    │                                                │
│  └────────┬─────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────┐                                                │
│  │  COMPLETE        │  All artifacts in docs/                        │
│  └──────────────────┘                                                │
└─────────────────────────────────────────────────────────────────────┘

Artifacts produced:
  docs/research-report.md        - Deep research findings
  docs/architecture-design.md    - System architecture
  docs/specification.md          - Detailed component specification
  docs/implementation-plan.md    - Milestone-based implementation plan
  docs/validation-report.md      - Specification validation report
```
