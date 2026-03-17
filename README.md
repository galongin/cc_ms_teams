# cc-ms-teams

`cc-ms-teams` is a local-first bridge between Microsoft Teams and Claude Code. It lets you run Claude Code on your machine, chat with it from Teams, and receive rich responses back as Adaptive Cards for code, diffs, progress, errors, and permission prompts.

## Features

- Bidirectional Teams <-> Claude Code chat
- Persistent local Claude Code sessions
- Adaptive Cards for code blocks, diffs, progress, and approvals
- Local bot endpoint exposed through a dev tunnel
- CLI workflow for setup, start, stop, and status

## Requirements

- Node.js `>=22`
- Microsoft Teams / Azure Bot configuration
- A dev tunnel provider such as Microsoft Dev Tunnels or ngrok
- Local Claude Code access and credentials

## Usage

```bash
npm install
npm run build
npm start
```

For development:

```bash
npm run dev -- --help
npm run typecheck
npm test
npm run lint
```

## CLI

```bash
cc-ms-teams setup
cc-ms-teams start
cc-ms-teams stop
cc-ms-teams status
```

## Docs

- [Architecture](/home/gall/work_area/cc_ms_teams/docs/architecture-design.md)
- [Specification](/home/gall/work_area/cc_ms_teams/docs/specification.md)
- [Implementation Plan](/home/gall/work_area/cc_ms_teams/docs/implementation-plan.md)
- [Validation Report](/home/gall/work_area/cc_ms_teams/docs/validation-report.md)
