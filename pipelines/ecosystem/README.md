# DevCompass ecosystem pipeline

Task B reads active technologies from the RDS `skill` table, collects GitHub
Search and Stack Overflow question counts, and writes one versioned snapshot per
Step Functions execution.

## Required environment

- `DEVCOMPASS_DSN`, or the standard `PGHOST`, `PGDATABASE`, and `PGUSER` values
- `GITHUB_TOKEN`
- `DEVCOMPASS_WORKFLOW_RUN_ID` in AWS; a local run ID is generated when omitted

`STACKEXCHANGE_KEY` is optional but recommended for a higher API quota. The
window is fixed at 180 days because the persisted metric columns use a `180d`
contract.

Use `DEVCOMPASS_ECOSYSTEM_SKILL_LIMIT` only for a manual smoke test. A scheduled
run should leave it unset so every active skill is collected.

## Retry behavior

Each source is retried independently. Successful source rows are retained under
the same run ID, so an ECS or Step Functions retry resumes only missing or failed
source work. The process exits nonzero unless every target skill has both GitHub
and Stack Overflow results.
