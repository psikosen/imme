# Developer Onboarding Guide

Welcome to the Imme project! This guide helps new contributors become
productive quickly by outlining environment setup, workflows, and key
capabilities.

## 1. Prerequisites

- **Node.js 20+**: The codebase uses ESM modules and Node's built-in test
  runner. Install via [fnm](https://github.com/Schniz/fnm) or the official
  binaries.
- **npm 10+**: Bundled with Node 20, used for dependency management.
- **ripgrep**: Preferred search tool for inspecting large repositories.

## 2. Workspace Setup

```sh
git clone <repo-url>
cd imme
npm install
```

The project intentionally keeps dependencies light; the only direct dependencies
are `eslint` and `@eslint/js` for linting.

## 3. Useful Commands

- `npm test` – Executes the Node.js test suite (`node --test`).
- `npm run lint` – Runs ESLint across the repo using the shared configuration.
- `imme log --help` – Lists CLI commands and options.

Add the CLI to your path during development:

```sh
npm link
imme --help
```

## 4. Logging Workflow

1. Invoke the CLI to emit structured logs:
   ```sh
   imme log --message "boot" --filename server.js --system-section startup
   ```
2. Inspect persistent logs at `.imme/logs.jsonl`. Each line is a JSON object
   suitable for ingestion by log processors.
3. When testing without touching disk, append `--dry-run` to CLI commands.

## 5. Coding Guidelines

- Favor small, focused modules and avoid unnecessary dependencies.
- Follow the canonical log schema: never omit `filename` and `message` when
  emitting entries.
- Document intent in comments, not just behavior.
- Write tests alongside features. Code without tests is considered incomplete.

## 6. Pull Request Expectations

- Include a summary of changes and reference related tasks in
  `project-manager/task.md`.
- Ensure `npm test` and `npm run lint` pass locally before pushing.
- Provide links to relevant runbook sections when introducing operational
  features.

## 7. Next Steps

- Review `docs/domain-model.md` to understand the core entities.
- Browse `docs/runbook.md` for operational procedures and escalation paths.
- Coordinate ongoing work via the task tracker in `project-manager/task.md`.

Welcome aboard!
