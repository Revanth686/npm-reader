# NPM Reader

A curated list of newly published npm packages, refreshed automatically every 24 hours.

Packages are selected from the public npm registry using deterministic metadata filters. Inclusion is for discovery only and is not a security endorsement. Review packages before installing them.

## Categories

- [Testing (419)](packages/testing.md)
- [Frontend (1487)](packages/frontend.md)
- [Backend (1566)](packages/backend.md)
- [Data and Databases (596)](packages/data.md)
- [Build Tools (728)](packages/build-tools.md)
- [Command Line (653)](packages/cli.md)
- [DevOps (284)](packages/devops.md)
- [Utilities (1153)](packages/utilities.md)

## Automation

The repository uses its own dependency-free JavaScript action. It does not star package repositories or use third-party marketplace actions.

The action follows npm's replication feed from the checkpoint in `data/registry-state.json`, identifies likely new packages from first- and second-revision changes, verifies their creation timestamps, fetches their public registry metadata, applies the rules in `config/discovery.json`, and adds at most 25 packages per run. Higher-revision documents are intentionally excluded as high-churn candidates in curated mode. Temporarily unavailable and overflow candidates are retained for later runs, with configured feed-page and pending-queue limits to bound each run. The first run establishes an overlapping sequence/time checkpoint so publications at the initialization boundary are reconsidered on the next run.

The workflow runs daily at 02:17 UTC and can also be started manually in dry-run mode. Scheduled workflows may start later when GitHub Actions is busy.

```
