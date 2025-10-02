# Operations Runbook

This runbook describes how to operate the Imme workspace day-to-day. It focuses
on logging, troubleshooting, and maintenance procedures that leverage the
structured logging utilities delivered by the CLI.

## Daily Checklist

1. **Review Logs**
   - Run `imme log --message "health-check" --level debug --dry-run` to confirm
     the CLI works without touching persistent storage.
   - Inspect `.imme/logs.jsonl` for overnight errors using tools such as
     `rg "ERROR" .imme/logs.jsonl`.
2. **Rotate Logs (Weekly)**
   - Archive the current log file: `mv .imme/logs.jsonl .imme/logs-$(date +%F).jsonl`.
   - Touch a new file so permissions remain consistent: `imme log --message "log rotation"`.
3. **Validate Structured Output**
   - Spot check for the derived line prefix `[Continuous skepticism (Sherlock Protocol)]` in console output.

## Incident Response

1. **Capture Context**
   - Use the CLI to record an incident marker, supplying as much context as
     possible:
     ```sh
     imme log --level error --message "API outage" \
       --filename incident-handler.js \
       --system-section production --method GET --db-phase post
     ```
2. **Analyze Recent Entries**
   - Parse the JSONL log with `jq` to filter entries:
     ```sh
     jq 'select(.level == "ERROR")' .imme/logs.jsonl | tail
     ```
3. **Document Findings**
   - Update `project-manager/task.md` with follow-up actions or new tasks.

## Maintenance Procedures

- **Permissions**: Logs are created with `0600` permissions to protect sensitive
  data. When sharing logs, strip secrets and adjust permissions explicitly.
- **Backups**: Copy `.imme/logs.jsonl` into secure storage before destructive
  testing. The log format is append-only and can be replayed by future services.
- **Configuration Changes**: Manage the workspace configuration via the CLI:
  - Initialize defaults: `imme config init --name "Imme Workspace"`
  - Review current settings: `imme config show`
  - Update individual fields: `imme config set --key workspace.environment --value production`
  After each change, commit the updated `.imme/config.json` to share defaults
  with the team and document the rationale in `project-manager/task.md`.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| CLI reports `Option --foo requires a value`. | Supply a value or drop the unknown option. Run `imme --help` for guidance. |
| Persistent log not written. | Check filesystem permissions and ensure the parent directory is writable. The CLI reports the path when a failure occurs. |
| Derived line missing from console. | Ensure the CLI is not run with `--dry-run` and that stdout is not redirected. |

## Escalation Matrix

1. **First responder**: On-call engineer rotates weekly; consult the shared
   calendar for assignments.
2. **Secondary**: Project maintainer responsible for the affected subsystem.
3. **Tertiary**: Platform engineering lead for infrastructure issues.

Escalations must include a link to the relevant log extracts and a summary of
mitigations attempted.
