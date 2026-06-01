import { existsSync, readFileSync, writeFileSync, cpSync } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
const __dirname = dirname(fileURLToPath(import.meta.url));

import { join } from "path";
import { execSync } from "child_process";

interface Notes { [forkName: string]: { checked: boolean; note: string } }

function findFreePort(start: number): number {
  try {
    const raw = execSync(
      "ss -tlnp 2>/dev/null | awk '{print $4}' | grep -oP '\\d+$'",
      { encoding: "utf-8" }
    );
    const used = new Set(raw.trim().split("\n").map(Number).filter(Boolean));
    let p = start;
    while (used.has(p)) p++;
    return p;
  } catch {
    return start;
  }
}

export function serve(outputDir: string, port: number, projectRoot?: string) {
  const actualPort = findFreePort(port);
  const NOTES_FILE = join(outputDir, "notes.json");

  // Copy vendor JS/CSS for offline /docs page
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
        const nav = '<div class="nav"><a href="/">Reports</a><a href="/report-stage1.html">Stage 1</a><a href="/report-stage2.html">Stage 2</a><a href="/docs">Docs</a></div>';
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
        const files = (await Array.fromAsync(new Bun.Glob("report-*.html").scan({ cwd: outputDir }))).sort();
        const map = { stufe2: "Stage 2", stufe1: "Stage 1", stage2: "Stage 2", stage1: "Stage 1" };
        const links = files
          .filter(f => !f.includes("-v0"))
          .map(f => {
            const label = Object.entries(map).find(([k]) => f.includes(k))?.[1] || f;
            return `<a href="/${f}" class="report-link">${label}</a>`;
          }).join("");
        const page = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Fork Scanner Reports</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f0f23;color:#eaeaea;line-height:1.7;max-width:900px;margin:0 auto;padding:48px 24px;text-align:center}h1{font-size:2.5rem;margin-bottom:8px}.subtitle{color:#9ca3af;margin-bottom:48px}.links{display:flex;flex-direction:column;gap:12px;align-items:center}.report-link{display:inline-block;padding:16px 48px;background:#1a1a3e;border:1px solid #2d2d44;border-radius:12px;color:#5e7ce2;text-decoration:none;font-size:1.1rem;font-weight:600;transition:border-color .2s;min-width:300px}.report-link:hover{border-color:#5e7ce2}.nav{display:flex;gap:16px;justify-content:center;margin-top:48px}.nav a{color:#5e7ce2;text-decoration:none;font-weight:600;padding:8px 16px;background:#1a1a3e;border-radius:8px}</style></head><body><h1>🔬 Fork Scanner Reports</h1><div class="subtitle">' + outputDir.split("/").pop() + '</div><div class="links">' + links + '</div><div class="nav"><a href="/docs">Docs</a></div></body></html>';
        return new Response(page, { headers: { "Content-Type": "text/html;charset=utf-8", ...cors } });
      }

      let filePath = join(outputDir, url.pathname);
      // Smart fallback: stage ↔ stufe naming
      if (!existsSync(filePath)) {
        const m = url.pathname.match(/report-(?:stage|stufe)(\d+)/);
        const num = m ? m[1] : "1";
        const candidates = ["report-stufe" + num + ".html", "report-stage" + num + ".html", "report-stufe2.html", "report-stage2.html", "report-stufe1.html", "report-stage1.html"];
        for (const c of candidates) {
          filePath = join(outputDir, c);
          if (existsSync(filePath)) break;
        }
      }
      if (!existsSync(filePath)) return new Response("Not Found", { status: 404 });

      const ext = filePath.split(".").pop() || "";
      const types: Record<string, string> = { html: "text/html;charset=utf-8", js: "application/javascript", css: "text/css", json: "application/json" };
      let body = readFileSync(filePath);
      // Inject notes into static HTML reports so old files show checkboxes + notes
      if (ext === "html" && (url.pathname.includes("report-stufe") || url.pathname.includes("report-stage"))) {
        try {
          const notes = loadNotes();
          if (Object.keys(notes).length > 0) {
            const json = JSON.stringify(notes).replace(/</g, "\u003c");
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
  console.log("  Stage 1: http://localhost:" + actualPort + "/report-stage1.html");
  console.log("  Stage 2: http://localhost:" + actualPort + "/report-stage2.html");
  console.log("  Docs:    http://localhost:" + actualPort + "/docs");
  console.log("  Notes:   " + NOTES_FILE + "\n");
}
