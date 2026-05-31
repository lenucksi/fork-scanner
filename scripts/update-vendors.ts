// SPDX-License-Identifier: AGPL-3.0-only
const { writeFileSync, mkdirSync, existsSync } = await import("fs");
const { join, dirname } = await import("path");
const { fileURLToPath } = await import("url");

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(__dirname, "..", "templates");

const vendors: { file: string; url: string }[] = [
  { file: "marked.min.js", url: "https://cdn.jsdelivr.net/npm/marked@15/marked.min.js" },
  { file: "highlight.min.js", url: "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js" },
  { file: "github-dark.min.css", url: "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css" },
  { file: "chart.umd.min.js", url: "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js" },
];

if (!existsSync(templatesDir)) mkdirSync(templatesDir, { recursive: true });

let updated = 0;
for (const v of vendors) {
  const resp = await fetch(v.url);
  if (!resp.ok) {
    console.error(`  ✗ ${v.file} — HTTP ${resp.status}`);
    continue;
  }
  const buf = await resp.arrayBuffer();
  writeFileSync(join(templatesDir, v.file), new Uint8Array(buf));
  const size = (buf.byteLength / 1024).toFixed(1);
  console.log(`  ✓ ${v.file} (${size} KB)`);
  updated++;
}

console.log(`\n${updated}/${vendors.length} vendor files updated in templates/`);
