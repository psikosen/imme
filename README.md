# Imme Workspace

This repository is being built iteratively. The initial milestone establishes a Node.js project skeleton with linting, unit tests, and a structured logger that follows the mandated canonical schema.

## Getting started

Install dependencies:

```bash
npm install
```

Review the current workspace configuration and run quality gates:

```bash
npm run start
npm run build
npm run lint
npm test
```

## Logger overview

The `StructuredLogger` writes a JSON payload containing the required fields (`filename`, `timestamp`, `classname`, `function`, `system_section`, `line_num`, `error`, `db_phase`, `method`, and `message`) to the persistent writer, followed by a human readable line prefixed with `[Continuous skepticism (Sherlock Protocol)]`. Import the logger from `src/index.js`:

```js
import { StructuredLogger } from "./src/index.js";

const logger = new StructuredLogger({
  baseContext: { filename: "app.js", systemSection: "startup" }
});

logger.info({ message: "Boot sequence complete", functionName: "main" });
```

## CLI logging tool

Install the CLI locally to emit structured logs from the terminal:

```bash
npm link
imme log --message "hello" --filename cli.js
```

Entries are appended to `.imme/logs.jsonl` by default. The CLI accepts
additional context fields (`--system-section`, `--method`, `--db-phase`, etc.)
that match the canonical log schema.

## Workspace configuration management

Use the `config` subcommands to manage workspace defaults:

```bash
# Create or refresh the configuration file
imme config init --name "Imme Workspace"

# Display the current configuration JSON
imme config show

# Update individual fields using dot-notation keys
imme config set --key workspace.environment --value production

# Update workspace metadata via guided flags
imme config workspace set --environment staging --log-path ./artifacts/log.jsonl
```

Configuration lives at `.imme/config.json` and should be committed whenever team
defaults change. The CLI automatically stamps each update with an ISO-8601
`lastUpdated` timestamp. Run `imme config workspace show` to view resolved paths
and SQLite connection details.

## SQLite-backed storage

Projects and tasks now persist to a SQLite database located at
`.imme/imme.db` (configurable via the CLI). The `SQLiteStorage` class under
`src/storage/sqlite.js` exposes CRUD helpers that mirror the domain model.

- Migrations run automatically on startup and are versioned within the source
  tree.
- Tests use temporary databases to keep fixtures isolated.

## Dark mode web UI

Launch the workspace dashboard with:

```bash
npm run web
```

The server reads the shared SQLite database and exposes read-only APIs under
`/api`. Visit `http://localhost:3000` to view workspace health, projects, and
tasks. The interface follows the provided palette and the Laws of UX for a
focused, high-contrast experience.

Refer to `docs/runbook.md` for operational procedures and
`docs/onboarding.md` for contributor guidelines.
