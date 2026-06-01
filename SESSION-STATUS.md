# Fork Scanner — Session Status

## Letzte Session: Stage 2 Templates + gh-pages export gebaut

### ✅ Erledigt

- **CLI** (`src/index.ts`) — yargs-basiert, alle Modi: `--serve`, `--prepare-deep`, `--merge-deep`, `--gh-pages`, `--version`
- **Scan** (`src/scan.ts`) — Fork-Discovery + Branch-Compare (resumable, batched, rate-limited)
- **Analyze** (`src/analyze.ts`) — Filter + Cluster + Bot-Detection
- **PR Check** (`src/pr-check.ts`) — PR-Matching + Reactions
- **Deep** (`src/deep.ts`) — Deep-Input prep + merge
- **Report** (`src/report.ts`) — Template-basiert, lädt `templates/*.html` via `{{PLACEHOLDER}}` + `window.__DATA__` JSON
- **Templates** (`templates/stage1.html`, `templates/stage2.html`, `templates/landing.html`) — Client-seitiges Rendering via Chart.js + Vanilla JS
- **Serve** (`src/serve.ts`) — Lokaler Server mit `/save-note`, `/load-notes`, Auto-Port-Findung
- **gh-pages** (`src/gh-pages.ts`) — Statischer Export + Landing Page + `.nojekyll`
- **OpenCode Skill** — `~/.config/opencode/skills/fork-scan/SKILL.md` + `~/.config/opencode/commands/fork-scan.md`
- **README** — 283 Zeilen, GitHub-rendered + via `/docs` im serve
- **TypeScript** — `bunx tsc --noEmit` compiliert clean

### ⚠️ Offene Issues (vor Session-Ende)

1. **Docs hängt auf "Loading..."** — `/docs` lädt marked.js + highlight.js von `cdnjs.cloudflare.com`. Ohne Internetzugriff hängt die Seite. Fix: CDN-Scripts entfernen, Markdown serverseitig rendern (einfacher regex converter in serve.ts) oder nur als `<pre>` anzeigen.

2. **Root URL zeigt Stage 2 statt Stage 1** — `http://localhost:4099/` probiert `report-stage2.html` zuerst. Wenn nur Stage 1 existiert, sollte root URL Stage 1 zeigen. Fix: Fallback-Reihenfolge in `serve.ts` umdrehen.

3. **CDN-Frage vom User** — "warum cloudflare.com abhängigkeiten?" Templates verwenden Chart.js von `cdn.jsdelivr.net` — das ist beabsichtigt (Chart.js ist zu groß zum Inlinen). Aber `/docs` sollte keine externen CDNs brauchen.

### 🎯 Nächste Prioritäten

1. `--interactive` Interview-Wizard implementieren (der Flow aus der ersten Session)
2. Standalone LLM-Deep-Analysis via API (optional, für `--llm-key` Modus)
3. OpenCode Skill verfeinern (Sub-Agent Orchestrierung)
4. Tests

### Server (noch aktiv)

```bash
# Läuft auf :4099, serviert die Backlog.md-Scan-Daten aus dem worktree
PID: 2866170 (war bei session-ende noch aktiv)
```

### Dateien

| File | Status |
|---|---|
| `src/serve.ts` | ✅ Funktioniert, aber CDN-Problem bei /docs |
| `templates/stage2.html` | ✅ Chart.js CDN ok (beabsichtigt) |
| `templates/stage1.html` | ✅ Chart.js CDN ok |
| `~/.config/opencode/skills/fork-scan/SKILL.md` | ✅ Compliant (geprüft via audit) |
| `~/.config/opencode/commands/fork-scan.md` | ✅ Compliant |
