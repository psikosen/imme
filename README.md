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
```

Configuration lives at `.imme/config.json` and should be committed whenever team
defaults change. The CLI automatically stamps each update with an ISO-8601
`lastUpdated` timestamp.

Refer to `docs/runbook.md` for operational procedures and
`docs/onboarding.md` for contributor guidelines.
