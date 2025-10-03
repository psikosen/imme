# Database Options Evaluation

This analysis validates our choice of SQLite for persisting Imme projects and tasks while
tracking the trade-offs across the primary candidates.

## Decision Summary

- **Recommended store:** SQLite (file-backed, embedded).
- **Rationale:** Aligns with the repository-first workflow, requires zero services to
  operate, and unlocks transactional guarantees missing from Markdown-based tracking.
- **Fallback options:** PostgreSQL for future multi-user concurrency; document stores for
  schemaless experimentation.

## Option Comparison

| Option | Advantages | Considerations |
| --- | --- | --- |
| SQLite | Embedded, transactional, ships with robust tooling (`sqlite3`, `.dump`). | Requires migration discipline, limited concurrent writers. |
| PostgreSQL | Mature ecosystem, rich SQL surface, first-class migrations. | Needs operational footprint (container, secrets, provisioning). |
| Document store (LiteFS / SurrealDB) | Flexible schema evolution, natural for nested task notes. | Requires new operational playbooks, less proven analytics tooling. |

## Adoption Plan

1. **Embed SQLite in the CLI.** Use the `better-sqlite3` driver to create a synchronous
   API that matches the current CLI execution model.
2. **Version schema migrations.** Store DDL statements in source control and append an
   entry to `schema_migrations` as part of each deployment.
3. **Align configuration.** Persist the database file within `.imme/` so contributors
   can opt into sharing state via Git, mirroring the existing log strategy.
4. **Document fallbacks.** Outline when PostgreSQL (high concurrency) or a document
   store (rapid schema iteration) becomes the right tool.

This evaluation is a living reference; update it as requirements evolve.
