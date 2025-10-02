# Domain Model & Persistence Requirements

The Imme workspace tracks project delivery efforts across three primary concerns:

1. **Operational logs** that capture activity from tools and services.
2. **Work management artifacts** (projects, tasks, and workflows).
3. **Knowledge assets** such as runbooks and onboarding documentation.

This document defines the initial domain model and the accompanying persistence
expectations so that future features can build on a shared vocabulary.

## Core Entities

### ProjectWorkspace

Represents the root of the Imme environment. A workspace owns the configuration
for logging, file locations, and default CLI behaviors.

| Field | Description |
| --- | --- |
| `id` | Stable identifier (UUID). |
| `name` | Human friendly workspace name. |
| `defaultLogPath` | Absolute path to the JSONL log file used by the CLI. |
| `createdAt` | ISO-8601 timestamp of workspace creation. |

Persistence: stored as a configuration document (`workspace.json`) within the
repository so that new contributors inherit the defaults immediately.

### Project

Captures a unit of delivery inside the workspace.

| Field | Description |
| --- | --- |
| `id` | UUID. |
| `name` | Project name (e.g., "CLI Rollout"). |
| `description` | Narrative summary of scope and context. |
| `status` | Enum: `proposed`, `active`, `complete`. |
| `createdAt` / `updatedAt` | ISO-8601 timestamps. |

Persistence: near-term storage uses Markdown in `project-manager/` for human
review. When a database is introduced, projects map cleanly to a relational
table with unique IDs and timestamp metadata.

### Task

Represents a work item belonging to a project.

| Field | Description |
| --- | --- |
| `id` | UUID. |
| `projectId` | Foreign key to `Project`. |
| `title` | Concise task title. |
| `status` | Enum: `todo`, `in_progress`, `blocked`, `done`. |
| `assignees` | Array of contributor identifiers. |
| `notes` | Free-form Markdown notes, often referencing commit hashes. |
| `createdAt` / `updatedAt` | ISO-8601 timestamps. |

Persistence: Markdown checklists remain authoritative until a task tracker is
implemented. The schema deliberately matches a future SQLite table so that a
transparent migration path exists.

### LogEntry

Structured record emitted by automation (CLI, services) that follows the
canonical schema defined in `StructuredLogger`.

| Field | Description |
| --- | --- |
| `timestamp` | ISO-8601 string (UTC). |
| `level` | `DEBUG`, `INFO`, or `ERROR`. |
| `filename` | Originating source file. |
| `classname` | Optional class or module name. |
| `function` | Optional function name. |
| `system_section` | Logical domain component (e.g., `startup`). |
| `line_num` | Optional source line number (integer). |
| `method` | HTTP method context (`GET`, `POST`, `DELETE`, `PUT`, `NONE`). |
| `db_phase` | Database interaction phase (`pre`, `post`, `none`). |
| `message` | Human-readable summary. |
| `error` | Structured error payload when applicable. |

Persistence: appended to a JSON Lines (JSONL) file with one object per line to
support streaming analytics and log rotation. Log retention policies are
managed via operating runbooks.

## Persistence Requirements

1. **Durability**: Persistent logs must survive process restarts. The
   `createPersistentFileWriter` utility appends to disk synchronously to avoid
   data loss in the presence of abrupt exits.
2. **Portability**: All data formats remain text-based (`.json`, `.jsonl`,
   Markdown) to support Git-based workflows and diff review.
3. **Isolation**: Environment-specific data (e.g., generated logs) lives under
   the workspace `.imme/` directory so that developers can opt-in to sharing it
   via `.gitignore` rules.
4. **Forward Compatibility**: Schemas mirror traditional relational tables so
   that migration to SQLite or Postgres can occur without rewriting business
   logic. UUIDs are mandated across entities to simplify replication and
   distributed workflows.

## Future Considerations

- Introduce an event-sourcing stream for CLI actions so that automation can
  rebuild state from log history.
- Leverage SQLite for storing workspace, project, and task entities while
  maintaining JSONL logs for append-only record keeping.
- Expose persistence configuration through the CLI (`imme config`) once more
  services depend on the data model.
