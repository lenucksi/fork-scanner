---
id: TASK-9
title: Set up weekly CI scan via GitHub Actions + GitHub Models
status: To Do
assignee: []
created_date: 2026-06-01 00:00
labels:
  - ci
  - github-actions
  - github-models
  - automation
dependencies: []
priority: medium
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
1. **Workflow**: `.github/workflows/scan-weekly.yml` with `schedule: cron('0 6 * * 1')` and `workflow_dispatch`
2. **Caching**: `actions/cache@v4` to persist scan state across runs (forks.json, compare.jsonl, state.json) so incremental scans work
3. **Stage 1**: Run `fork-scan MrLesk/Backlog.md -o ./scan-data --incremental --versioned` — produces versioned reports with change tracking
4. **Stage 2 deep analysis**: Use GitHub Models API (`POST https://models.github.ai/inference`) authenticated via `GITHUB_TOKEN` (no extra key needed). Must batch and parallelize calls to fit within rate limits. Use `actions/ai-inference` or direct curl against the OpenAI-compatible endpoint with model like `anthropic/claude-sonnet-4`
5. **Merge deep**: `fork-scan MrLesk/Backlog.md -o ./scan-data --merge-deep ./deep-output --versioned`
6. **Deploy**: Use `peaceiris/actions-gh-pages@v4` with `external_repository: lenucksi/fork-scanner-reports`, `publish_dir: ./scan-data/gh-pages`, `destination_dir: mrlesk-backlog.md`, `keep_files: true` so old versioned reports aren't removed. Auth via `deploy_key` secret.
7. **Versioning**: CI runs produce versioned report files (report-stage1-v{N}.html, report-stage2-v{N}.html). The nav bar's version dropdown auto-discovers these via filesystem scan.
8. **Cost**: Free tier — public repo Actions are free, GitHub Models has free rate limits for dev use.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Workflow file exists at .github/workflows/scan-weekly.yml with cron schedule and workflow_dispatch trigger
- [ ] #2 actions/cache@v4 caches scan state (forks.json, compare.jsonl, state.json) across runs
- [ ] #3 Stage 1 produces versioned reports with incremental scanning
- [ ] #4 Stage 2 calls GitHub Models API with batched/parallelized inference calls and merges results via --merge-deep
- [ ] #5 Deploy step publishes to fork-scanner-reports repo via peaceiris/actions-gh-pages@v4 with keep_files: true
- [ ] #6 Versioned reports auto-discovered by nav bar version dropdown
- [ ] #7 CI runs complete within GitHub Actions free tier limits
<!-- AC:END -->