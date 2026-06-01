
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync } from "fs";
import { join } from "path";
import { generateLanding } from "./report.js";
import { dirname } from "path";
const __dirname = dirname(new URL(import.meta.url).pathname);

export function exportGhPages(outputDir: string, ghPagesDir: string) {
  if (!existsSync(ghPagesDir)) mkdirSync(ghPagesDir, { recursive: true });

  // Copy report files
  const navTmpl = readFileSync(join(__dirname, "..", "templates", "nav.html"), "utf-8");
  const navHtml = navTmpl.replace("{{VERSION_OPTIONS}}", "");
  for (const file of ["report-stage1.html", "report-stage2.html", "report-stage1-v1.html", "report-stage2-v1.html"]) {
    const src = join(outputDir, file);
    if (existsSync(src)) {
      let html = readFileSync(src, "utf-8");
      // Remove interactive /save-note references (gh-pages is static)
      html = html.replace(/fetch\(['"]\/save-note['"][\s\S]*?\)\.catch\(\(\)=>{}\)\);/g, "");
      html = html.replace(/\/save-note/g, "#");
      // Inject nav bar (static version, no dropdown)
      html = html.replace("{{NAV_BAR}}", navHtml);
      writeFileSync(join(ghPagesDir, file), html);
    }
  }

  // Copy analysis data
  for (const file of ["analysis.json", "forks.json", "prs.json"]) {
    const src = join(outputDir, file);
    if (existsSync(src)) {
      cpSync(src, join(ghPagesDir, file));
    }
  }

  // Copy vendor JS/CSS for /docs
  const templatesDir = join(__dirname, "..", "templates");
  for (const f of ["marked.min.js", "highlight.min.js", "github-dark.min.css", "chart.umd.min.js"]) {
    const src = join(templatesDir, f);
    if (existsSync(src)) cpSync(src, join(ghPagesDir, f));
  }

  // Generate landing page
  const reports: any[] = [];
  const stage1 = existsSync(join(ghPagesDir, "report-stage1.html"));
  const stage2 = existsSync(join(ghPagesDir, "report-stage2.html"));

  // Try to read stats from analysis.json
  let forks = 0, interesting = 0;
  try {
    const data = JSON.parse(readFileSync(join(outputDir, "analysis.json"), "utf-8"));
    forks = data.length;
    interesting = data.filter((d: any) => !d.is_bot_only && d.max_ahead > 0).length;
  } catch {}

  reports.push({
    name: outputDir.split("/").pop() || "scan-output",
    dir: ".",
    stage1: stage1 ? "report-stage1.html" : null,
    stage2: stage2 ? "report-stage2.html" : null,
    forks,
    interesting,
    date: new Date().toISOString().slice(0, 10),
  });

  generateLanding(reports, ghPagesDir);

  // .nojekyll for GH Pages with _ in dir names
  writeFileSync(join(ghPagesDir, ".nojekyll"), "");
  console.log("GH Pages export: " + ghPagesDir);
}
