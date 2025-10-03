# Imme Workspace

## Purpose
Imme Workspace is a Node.js toolchain that unifies structured logging, configuration governance, and project tracking for the Imme program. The repository ships a CLI, SQLite-backed persistence layer, and a dark-mode web dashboard so contributors can manage work with consistent telemetry and observability.

## Roadmap status
- Outstanding tasks: none — every backlog item tracked in `project-manager/task.md` is complete.
- Latest milestone: automated configuration drift detection and a browser-based project editor are now available for day-to-day operations.

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

## CLI logging & configuration management

Install the CLI locally to emit structured logs from the terminal:

```bash
npm link
imme log --message "hello" --filename cli.js
```

Entries are appended to `.imme/logs.jsonl` by default. The CLI accepts additional context fields (`--system-section`, `--method`, `--db-phase`, etc.) that match the canonical log schema.

Configuration lives at `.imme/config.json` and should be committed whenever team defaults change. Use the `config` subcommands to manage workspace defaults and verify configuration drift:

```bash
# Create or refresh the configuration file
imme config init --name "Imme Workspace"

# Display the current configuration JSON
imme config show

# Update individual fields using dot-notation keys
imme config set --key workspace.environment --value production

# Detect drift between your local config and the tracked baseline
imme config drift

# Update workspace metadata via guided flags
imme config workspace set --environment staging --log-path ./artifacts/log.jsonl
```

The CLI automatically stamps each update with an ISO-8601 `lastUpdated` timestamp. Run `imme config workspace show` to view resolved paths and SQLite connection details. `imme config drift` exits with code `1` when local changes diverge from the committed baseline, making it suitable for CI enforcement.

## SQLite-backed storage

Projects and tasks persist to a SQLite database located at `.imme/imme.db` (configurable via the CLI). The `SQLiteStorage` class under `src/storage/sqlite.js` exposes CRUD helpers that mirror the domain model.

- Migrations run automatically on startup and are versioned within the source tree.
- Tests use temporary databases to keep fixtures isolated.

## Dark mode web UI & project editor

Launch the workspace dashboard with:

```bash
npm run web
```

Visit `http://localhost:3000` to view workspace health, projects, and tasks. The interface follows the provided palette and the Laws of UX for a focused, high-contrast experience. The dashboard now includes editors for both projects and tasks: create or update projects via the `/api/projects` POST and PUT endpoints, and manage per-project tasks directly from the inline task editor. Use the Refresh button to sync the view after CLI-driven changes.

Refer to `docs/runbook.md` for operational procedures and `docs/onboarding.md` for contributor guidelines.
