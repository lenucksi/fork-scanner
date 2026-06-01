import { existsSync, readFileSync, writeFileSync, cpSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));

import { join } from "path";
import { execSync } from "child_process";
import { REPORT_PATTERN, parseMetaTimestamp, parseTimestampFromFilename, formatTimestamp, formatMtime, getReportMeta, makeOptionLabel, findLatestByStage, getReportStage } from "./utils/report-ui.js";


interface Notes { [forkName: string]: { checked: boolean; note: string } }

function findFreePort(start: number): number {
  try {
    const raw = execSync(
      "ss -tlnp 2>/dev/null | awk '{print $4}' | grep -oP '\\d+$'",
      { encoding: "utf-8" }
    );
    const used = new Set(raw.trim().split("\n").filter(Boolean).map(Number));
    let port = start;
    while (used.has(port)) port++;
    return port;
  } catch {
    return start;
  }
}


export function generateNavBar(outputDir: string, currentFile?: string): string {
  const navTmpl = readFileSync(join(__dirname, "..", "templates", "nav.html"), "utf-8");
  const reports: string[] = [];
  try {
    for (const f of readdirSync(outputDir)) {
      if (REPORT_PATTERN.test(f)) reports.push(f);
    }
  } catch {}
  reports.sort((a, b) => {
    const ta = parseMetaTimestamp(join(outputDir, a)) || parseTimestampFromFilename(a);
    const tb = parseMetaTimestamp(join(outputDir, b)) || parseTimestampFromFilename(b);
    if (ta && tb) return tb.localeCompare(ta);
    try { return statSync(join(outputDir, b)).mtimeMs - statSync(join(outputDir, a)).mtimeMs; }
    catch { return 0; }
  });

  const latestStage1 = findLatestByStage(reports, outputDir, "1");
  const latestStage2 = findLatestByStage(reports, outputDir, "2");
  const currentStage = currentFile ? getReportStage(currentFile) : "";
  let options = "";
  for (const r of reports) {
    const rStage = getReportStage(r);
    if (currentStage && rStage !== currentStage) continue;
    const fp = join(outputDir, r);
    const meta = getReportMeta(fp);
    const ts = parseMetaTimestamp(fp);
    const dateStr = ts ? formatTimestamp(ts) : formatMtime(fp);
    const label = makeOptionLabel(meta.runType, dateStr, meta.changeCount, rStage, currentStage);
    const selected = r === currentFile ? " selected" : "";
    options += '<option value="/' + r + '"' + selected + ">" + (label || r.replace(/\.html$/, "").replace("report-", "")) + "</option>";
  }
  let result = navTmpl.replace("{{VERSION_OPTIONS}}", options);
  result = result.replace("{{STAGE1_LINK}}", latestStage1);
  result = result.replace("{{STAGE2_LINK}}", latestStage2);
  return result;
}

export function serve(outputDir: string, port: number, projectRoot?: string) {
  const actualPort = findFreePort(port);
  const NOTES_FILE = join(outputDir, "notes.json");

  try {
    const templatesDir = join(__dirname, "..", "templates");
    for (const f of ["marked.min.js", "highlight.min.js", "github-dark.min.css", "chart.umd.min.js"]) {
      const src = join(templatesDir, f);
      if (existsSync(src)) cpSync(src, join(outputDir, f));
    }
  } catch {}

  function loadNotes(): Notes {
    if (!existsSync(NOTES_FILE)) return {};
    return JSON.parse(readFileSync(NOTES_FILE, "utf-8"));
  }

  Bun.serve({
    port: actualPort,
    async fetch(req) {
      const url = new URL(req.url);
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

      if (req.method === "OPTIONS") return new Response(null, { headers: cors });

      if (url.pathname === "/save-note" && req.method === "POST") {
        const body = await req.json();
        const current = loadNotes();
        current[body.fork] = { checked: body.checked, note: body.note || "" };
        writeFileSync(NOTES_FILE, JSON.stringify(current, null, 2));
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...cors } });
      }

      if (url.pathname === "/load-notes" || url.pathname === "/api/notes") {
        const notes = loadNotes();
        return new Response(JSON.stringify(notes), { headers: { "Content-Type": "application/json", ...cors } });
      }

      const notesMatch = url.pathname.match(/^\/api\/notes\/(.+)$/);
      if (notesMatch) {
        const notes = loadNotes();
        const fork = decodeURIComponent(notesMatch[1]);
        return new Response(JSON.stringify(notes[fork] || { checked: false, note: "" }), { headers: { "Content-Type": "application/json", ...cors } });
      }

      if (url.pathname === "/docs" || url.pathname === "/docs/") {
        const readmeCandidates = [
          projectRoot ? join(projectRoot, "README.md") : null,
          join(__dirname, "..", "README.md"),
          join(__dirname, "README.md"),
          join(outputDir, "..", "README.md"),
          join(outputDir, "..", "..", "README.md"),
        ].filter(Boolean) as string[];
        let readmePath = readmeCandidates.find((p) => existsSync(p));
        if (!readmePath) return new Response("README not found (" + outputDir + ")", { status: 404 });
        const md = readFileSync(readmePath, "utf-8");
        const safe = JSON.stringify(md);
        const nav = generateNavBar(outputDir);
        const page = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>fork-scanner Docs</title><link rel="stylesheet" href="/github-dark.min.css"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f0f23;color:#eaeaea;line-height:1.7;max-width:900px;margin:0 auto;padding:32px 24px}a{color:#5e7ce2;padding:0 4px}code{background:#1a1a3e;padding:2px 6px;border-radius:4px}pre{background:#1a1a3e;padding:16px;border-radius:8px;overflow-x:auto}.nav{display:flex;gap:16px;margin-bottom:24px;padding:12px;background:#1a1a3e;border-radius:8px}.nav a{color:#5e7ce2;text-decoration:none;font-weight:600}</style></head><body>' + nav + '<div id="content">Loading...</div><script src="/marked.min.js"></script><script src="/highlight.min.js"></script><script>hljs.highlightAll();fetch("/readme.md").then(r=>r.text()).then(md=>{document.getElementById("content").innerHTML=marked.parse(md);document.querySelectorAll("pre code").forEach(b=>hljs.highlightElement(b));}).catch(()=>{document.getElementById("content").innerHTML="<pre>"+safe+"</pre>";});</script></body></html>';
        return new Response(page, { headers: { "Content-Type": "text/html;charset=utf-8", ...cors } });
      }

      if (url.pathname === "/readme.md") {
        const rc = [
          projectRoot ? join(projectRoot, "README.md") : null,
          join(__dirname, "..", "README.md"),
          join(__dirname, "README.md"),
          join(outputDir, "..", "README.md"),
          join(outputDir, "..", "..", "README.md"),
        ].filter(Boolean) as string[];
        const rp = rc.find((p) => existsSync(p));
        if (!rp) return new Response("Not found (" + outputDir + ")", { status: 404 });
        return new Response(readFileSync(rp, "utf-8"), { headers: { "Content-Type": "text/markdown;charset=utf-8", ...cors } });
      }

      if (url.pathname === "/") {
        const { statSync } = await import("fs");
        const files = await Array.fromAsync(new Bun.Glob("report-*.html").scan({ cwd: outputDir }));
        const map: Record<string, string> = { stage2: "Stage 2", stage1: "Stage 1" };

        const reports = files
          .filter(f => REPORT_PATTERN.test(f) && !f.includes("-v0"))
          .map(f => {
            const stage = Object.entries(map).find(([k]) => f.includes(k))?.[1] || "Report";
            let timestamp = parseMetaTimestamp(join(outputDir, f));
            if (!timestamp) {
              timestamp = parseTimestampFromFilename(f);
            }
            if (!timestamp) {
              try {
                const mtime = statSync(join(outputDir, f)).mtime;
                timestamp = mtime.toISOString();
              } catch {}
            }
            return { name: stage, file: f, stage, timestamp };
          });

        const templatesDir = join(__dirname, "..", "templates");
        const tmplPath = join(templatesDir, "landing.html");
        let html = existsSync(tmplPath) ? readFileSync(tmplPath, "utf-8") : "";
        if (html) {
          const sorted = sortReports(reports);
          html = html.replace("{{NAV_BAR}}", generateNavBar(outputDir));
          html = html.replace("{{REPOS_JSON}}", JSON.stringify(sorted));
          html = html.replace("{{DATE}}", new Date().toISOString().slice(0, 10));
          return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8", ...cors } });
        }
        const links = reports.map(r => `<a href="/` + r.file + `" class="report-link">` + r.name + (r.timestamp ? " (" + r.timestamp.slice(0, 10) + ")" : "") + `</a>`).join("");
        const page = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Fork Scanner Reports</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f0f23;color:#eaeaea;line-height:1.7;max-width:900px;margin:0 auto;padding:48px 24px;text-align:center}h1{font-size:2.5rem;margin-bottom:8px}.subtitle{color:#9ca3af;margin-bottom:48px}.links{display:flex;flex-direction:column;gap:12px;align-items:center}.report-link{display:inline-block;padding:16px 48px;background:#1a1a3e;border:1px solid #2d2d44;border-radius:12px;color:#5e7ce2;text-decoration:none;font-size:1.1rem;font-weight:600;transition:border-color .2s;min-width:300px}.report-link:hover{border-color:#5e7ce2}.nav{display:flex;gap:16px;justify-content:center;margin-top:48px}.nav a{color:#5e7ce2;text-decoration:none;font-weight:600;padding:8px 16px;background:#1a1a3e;border-radius:8px}</style></head><body><h1>🔬 Fork Scanner Reports</h1><div class="subtitle">' + outputDir.split("/").pop() + '</div><div class="links">' + links + '</div><div class="nav"><a href="/docs">Docs</a></div></body></html>';
        return new Response(page, { headers: { "Content-Type": "text/html;charset=utf-8", ...cors } });
      }

      let filePath = join(outputDir, url.pathname);
      if (!existsSync(filePath)) {
        const m = url.pathname.match(/report-stage(\d+)/);
        const num = m ? m[1] : "1";
        const candidates = [
          "report-stage" + num + "-full-*.html",
          "report-stage" + num + "-inc-*.html",
          "report-stage" + num + ".html",
          "report-stufe" + num + ".html",
        ];
        for (const c of candidates) {
          if (c.includes("*")) {
            for (const f of readdirSync(outputDir)) {
              const pat = new RegExp("^" + c.replace(/\*/g, ".*") + "$");
              if (pat.test(f)) {
                filePath = join(outputDir, f);
                break;
              }
            }
            if (existsSync(filePath)) break;
          } else {
            filePath = join(outputDir, c);
            if (existsSync(filePath)) break;
          }
        }
      }
      if (!existsSync(filePath)) return new Response("Not Found", { status: 404 });

      const ext = filePath.split(".").pop() || "";
      const types: Record<string, string> = { html: "text/html;charset=utf-8", js: "application/javascript", css: "text/css", json: "application/json" };
      let body = readFileSync(filePath);
      if (ext === "html") {
        let str = body.toString();
        if (str.includes("{{NAV_BAR}}")) {
          str = str.replace("{{NAV_BAR}}", generateNavBar(outputDir, url.pathname.replace(/^\//, "")));
          body = Buffer.from(str);
        }
      }
      if (ext === "html" && url.pathname.includes("report-stage")) {
        try {
          const notes = loadNotes();
          if (Object.keys(notes).length > 0) {
            const json = JSON.stringify(notes).replace(/</g, "\\u003c");
            const str = body.toString().replace('</body>', '<script>try{localStorage.setItem("fork-notes",' + json + ');}catch(e){}</script></body>');
            body = Buffer.from(str);
          }
        } catch {}
      }
      return new Response(body, { headers: { "Content-Type": types[ext] || "application/octet-stream", ...cors } });
    },
  });

  console.log("\n  Fork Scanner Report Server");
  console.log("  " + "-".repeat(30));
  console.log("  Landing: http://localhost:" + actualPort);
  console.log("  Stage 1: http://localhost:" + actualPort + "/" + latestStage1());
  console.log("  Stage 2: http://localhost:" + actualPort + "/" + latestStage2());

  function latestStage1(): string {
    try {
      for (const f of readdirSync(outputDir)) {
        if (/^report-stage1-(full|inc)-\d{4}-\d{2}-\d{2}/.test(f)) return f;
      }
    } catch {}
    return "report-stage1.html";
  }

  function latestStage2(): string {
    try {
      for (const f of readdirSync(outputDir)) {
        if (/^report-stage2-(full|inc)-\d{4}-\d{2}-\d{2}/.test(f)) return f;
      }
    } catch {}
    return "report-stage2.html";
  }
}

function sortReports(reports: { name: string; file: string; timestamp: string; stage: string }[]): any[] {
  const grouped = new Map<string, typeof reports>();
  for (const r of reports) {
    const stage = r.stage || "Report";
    if (!grouped.has(stage)) grouped.set(stage, []);
    grouped.get(stage)!.push(r);
  }
  for (const [, group] of grouped) {
    group.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  }
  const flat: any[] = [];
  const sortedGroups = [...grouped.entries()].sort((a, b) => {
    const aMax = a[1][0]?.timestamp || "";
    const bMax = b[1][0]?.timestamp || "";
    return bMax.localeCompare(aMax);
  });
  for (const [stage, items] of sortedGroups) {
    for (let i = 0; i < items.length; i++) {
      flat.push({ ...items[i], stage, seq: items.length > 1 ? i + 1 : undefined });
    }
  }
  return flat;
}
