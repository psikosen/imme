# Imme Workspace

This repository is being built iteratively. The initial milestone establishes a Node.js project skeleton with linting, unit tests, and a structured logger that follows the mandated canonical schema.

## Getting started

Install dependencies:

```bash
npm install
```

Run linting and tests:

```bash
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
