---
name: fork-scan
description: "Scan all forks of a GitHub repo and analyze community contributions across branches"
---

# fork-scan

Scan all forks of any GitHub repo. Two-stage analysis:

## Stage 1 — Deterministic

Run the fork-scanner CLI for branch comparison, bot detection, and PR matching:

```
fork-scan <repo> --output ./scan-data
```

This fetches all forks, compares every branch against upstream, identifies shared vs unique branches, detects bot-only commits, and matches PRs with reactions.

## Stage 2 — Deep Analysis (Skill Harness Mode)

1. Prepare data:
   ```
   fork-scan <repo> --output ./scan-data --prepare-deep --deep-limit 30
   ```
   This runs Stage 1 + writes `deep-input/` files with commit messages + file diffs.

2. Launch sub-agents (via Task tool, batches of 5):
   - Read `deep-input/*.json` files
   - For each fork: analyze commit messages + file changes
   - Classify: tags, value assessment (high/medium/low), upstreamability (1-5), main_focus
   - Write results as JSON array to `deep-output/batchN.json`

3. Merge results into Stage 2 report:
   ```
   fork-scan <repo> --output ./scan-data --merge-deep ./deep-output
   ```

4. Optionally start the report server:
   ```
   fork-scan <repo> --output ./scan-data --serve
   ```

## LLM Configuration

- **In skill mode**: Uses the harness's own sub-agent infrastructure — no API key needed.
- **Standalone CLI**: Needs `ANTHROPIC_API_KEY` or `--llm-key` for LLM calls.

## Output

- `report-stage1.html` — All forks, charts, tables (Stage 1)
- `report-stage2.html` — Deep analysis, priority matrix, feature heatmap (Stage 2)
- `notes.json` — User persistierte Notizen (vom serve-Endpunkt)
- `deep-input/` — Per-fork Daten für Sub-Agent Analyse
- `deep-output/` — Batch-Ergebnisse der Sub-Agents
