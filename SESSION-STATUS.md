# Fork Scanner — Session Status

## Current Session: Versioned Filenames + serve/dev scripts + README

### ✅ Completed

- **Versioned filename redesign** — every report uses date-based names:
  `report-stage2-full-2026-06-01.html` / `report-stage2-inc-2026-06-07-from-2026-06-01.html`
- **`--versioned` flag removed** — everything is versioned now, no bare files
- **Meta tag extended** — `<meta name="fs:meta">` now stores ISO timestamp + parent reference
  Format: `runType,changeCount,ISOTimestamp[,based-on:parentFilename]`
- **`src/report.ts`** — added `buildReportFilename()` and `findLatestReport()` helpers
- **`templates/nav.html`** — hardcoded href replaced with `{{STAGE1_LINK}}`/`{{STAGE2_LINK}}` placeholders
- **`src/serve.ts`** — new regex matching versioned filenames, meta-tag timestamps for version dropdown, nav link injection pointing to latest per stage
- **`src/gh-pages.ts`** — dynamic file scan (no hardcoded list), nav link injection, all versioned files copied
- **`src/index.ts`** — `--versioned` flag and all `argv.versioned` references removed
- **`bun run serve`** — starts report server on `./scan-output`
- **`bun run dev`** — starts server with `bun --watch` (auto-restart on source changes)
- **`tools/start-analysis-backlog-data.sh`** — gitignored script that merges deep results, exports gh-pages, starts server for existing Backlog.md analysis data (35 deep analyses across 5 batches)
- **Old files migrated** — `report-stage1.html`, `report-stufe1.html`, etc. renamed to date-based convention
- **`report-version.json`** — dead artifact cleaned up
- **README** — fully rewritten: versioned filenames, no `--versioned`, serve/dev scripts, updated output structure, AGPL-3.0 license, new architecture diagram

### Build & Test Status

- `bunx tsc --noEmit` — clean
- `bun test` — 33 pass, 0 fail, 76 expect() calls
- `bun run build` — 46 modules bundled in 26ms

### Open Issues

1. `--fork-owner` feature planned but not implemented (TASK-6 context)
2. Weekly CI scan via GH Actions + GH Models (TASK-9) not yet set up
3. Merged-upstream filter for priority matrix (TASK-10) not yet built
4. Behind count in fork detail-meta lines (TASK-7) not yet added
5. Exclude-from-view per-fork checkbox (TASK-8) not yet wired up

### Data Location

- Analysis data: `/home/jo/kit/claude-code-llm-kram/backlog-fork-analysis/tmp/fork-scan/`
- Tool repo: `/home/jo/kit/claude+opencode-harness-scripts/fork-scanner/`
- Reports repo: `github.com/lenucksi/fork-scanner-reports`
