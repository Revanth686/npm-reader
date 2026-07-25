# Npm Reader

curated collection of newly released npm packages

## Categories

- [Testing (0)](packages/testing.md)
- [Frontend (0)](packages/frontend.md)
- [Backend (0)](packages/backend.md)
- [Data and Databases (0)](packages/data.md)
- [Build Tools (0)](packages/build-tools.md)
- [Command Line (0)](packages/cli.md)
- [DevOps (0)](packages/devops.md)
- [Utilities (0)](packages/utilities.md)

## Automation

The action follows npm's replication feed from the checkpoint in `data/registry-state.json`, identifies likely new packages from first- and second-revision changes, verifies their creation timestamps, fetches their public registry metadata, applies the rules in `config/discovery.json`, and adds at most 25 packages per run. Higher-revision documents are intentionally excluded as high-churn candidates in curated mode. Temporarily unavailable and overflow candidates are retained for later runs, with configured feed-page and pending-queue limits to bound each run. The first run establishes an overlapping sequence/time checkpoint so publications at the initialization boundary are reconsidered on the next run.

Scheduled workflows may start later when GitHub Actions is busy.
