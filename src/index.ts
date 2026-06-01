// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, mkdirSync, readFileSync, cpSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { resolveToken } from "./config.js";
import { fetchForks, scanBranches, scanForkBranches, detectChanges, buildOldShaMap } from "./scan.js";
import { analyze } from "./analyze.js";
import type { BranchCompare, Fork, ForkAnalysis } from "./utils/types.js";
import { matchPRs } from "./pr-check.js";
import { prepareDeepInputs, mergeDeepResults } from "./deep.js";
import { generateStage1Report, generateStage2Report } from "./report.js";
import { exportGhPages } from "./gh-pages.js";

interface Args {
  _: (string | number)[];
  repo: string;
  output: string;
  deep: boolean;
  "deep-limit": number;
  "llm-key"?: string;
  serve: boolean;
  port: number;
  interactive: boolean;
  "prepare-deep": boolean;
  "merge-deep"?: string;
  "gh-pages": boolean;
  "gh-pages-subpath"?: string;
  "gh-pages-notes": boolean;
  incremental: boolean;
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("fork-scan")
    .usage("Usage: $0 [repo] [options]")
    .positional("repo", { type: "string", describe: "GitHub repo (e.g., MrLesk/Backlog.md)" })
    .option("output", { alias: "o", type: "string", default: "./scan-output", describe: "Output directory" })
    .option("deep", { type: "boolean", default: false, describe: "Run deep LLM analysis (needs --llm-key)" })
    .option("deep-limit", { type: "number", default: 30, describe: "Max forks for deep analysis" })
    .option("llm-key", { type: "string", describe: "Anthropic API key (or set ANTHROPIC_API_KEY)" })
    .option("serve", { type: "boolean", default: false, describe: "Start local report server" })
    .option("port", { type: "number", default: 4099, describe: "Server port" })
    .option("interactive", { alias: "i", type: "boolean", default: false, describe: "Interactive interview mode" })
    .option("prepare-deep", { type: "boolean", default: false, describe: "Stage 1 + prepare deep-input files" })
    .option("merge-deep", { type: "string", describe: "Deep output dir to merge into report" })
    .option("gh-pages", { type: "boolean", default: false, describe: "Export static GH Pages site" })
    .option("gh-pages-subpath", { type: "string", describe: "Subdirectory within gh-pages export (e.g., mrlesk-backlog.md)" })
    .option("gh-pages-notes", { type: "boolean", default: false, describe: "Include user notes in gh-pages export" })
    .option("incremental", { type: "boolean", default: false, describe: "Incremental: only re-scan changed forks" })
    .version(false)
    .parse() as Args;

  const repo = argv.repo || (argv._[0] as string) || "";
  const outputDir = argv.output;
  const isDeep = argv.deep || !!argv["llm-key"] || !!process.env.ANTHROPIC_API_KEY;

  // Resolve token (validates auth early)
  resolveToken();

  // Create output dir
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  console.log("\n  \u{1F9EC} Fork Scanner");
  console.log("  " + "\u2501".repeat(40));

  if (argv.interactive) {
    await runInteractive(outputDir);
    return;
  }

  if (argv["merge-deep"]) {
    // Stage 2: merge existing deep results into report
    const analysisPath = join(outputDir, "analysis.json");
    if (!existsSync(analysisPath)) {
      console.error("No analysis.json found in " + outputDir + ". Run without --merge-deep first.");
      process.exit(1);
    }
    const analysisData = JSON.parse(readFileSync(analysisPath, "utf-8"));
    const deepMap = mergeDeepResults(analysisData, argv["merge-deep"]);
    const forksData = existsSync(join(outputDir, "forks.json"))
      ? JSON.parse(readFileSync(join(outputDir, "forks.json"), "utf-8")) : [];
    let prsData = new Map<string, any[]>();
    try {
      const prsRaw = JSON.parse(readFileSync(join(outputDir, "prs.json"), "utf-8"));
      if (Array.isArray(prsRaw) && prsRaw.length > 0 && prsRaw[0].full_name) {
        prsData = new Map(prsRaw.map((p: any) => [p.full_name, p.prs || []]));
      }
    } catch {}
    const notesData = existsSync(join(outputDir, "notes.json"))
      ? JSON.parse(readFileSync(join(outputDir, "notes.json"), "utf-8")) : {};
    generateStage2Report(forksData, [], analysisData, outputDir, deepMap, prsData, notesData, repo);
    console.log("Stage 2 report generated with " + deepMap.size + " deep analyses.");
    if (argv["gh-pages"]) {
      exportGhPages(outputDir, join(outputDir, "gh-pages"), argv["gh-pages-subpath"], !argv["gh-pages-notes"]);
    }
    if (argv.serve) startServer(outputDir, argv.port);
    return;
  }

  // Serve-only mode (no repo, merge-deep, or incremental needed)
  if (argv.serve && !argv["merge-deep"] && !argv.incremental) {
    startServer(outputDir, argv.port);
    return;
  }

  // ---- INCREMENTAL SCAN PATH ----
  if (argv.incremental) {
    if (!repo) {
      console.error("Error: repo required for incremental scan");
      process.exit(1);
    }
    console.log("  Repo: " + repo + "\n");

    const { loadForks, loadCompareJsonl, mergeIncrementalCompare, saveCompareJsonl } = await import("./utils/state.js");
    const oldForks = loadForks(outputDir);
    const oldCompare = loadCompareJsonl(outputDir);
    const oldShaIdx = buildOldShaMap(oldCompare);

    if (oldForks.length === 0) {
      console.log("  No prior scan data found. Running full scan.\n");
    } else {
      console.log("  Incremental mode: detecting changes since last scan\n");

      const freshForks = await fetchForks(repo, outputDir);

      const { newForks, updatedForks, unchangedForks } = detectChanges(freshForks, oldForks, oldShaIdx);
      const changedForks = [...newForks, ...updatedForks];
      console.log("  " + newForks.length + " new, " + updatedForks.length + " updated, " + unchangedForks.length + " unchanged");

      if (changedForks.length === 0) {
        console.log("  No changes detected. Re-generating reports from existing data.\n");
        // Re-generate reports with updated templates
        const existingAnalysis = JSON.parse(readFileSync(join(outputDir, "analysis.json"), "utf-8"));
        const existingForks = loadForks(outputDir);
        const existingCompare = loadCompareJsonl(outputDir);
        generateStage1Report(existingForks, existingCompare, existingAnalysis, outputDir, repo);
        if (argv["gh-pages"]) exportGhPages(outputDir, join(outputDir, "gh-pages"), argv["gh-pages-subpath"], !argv["gh-pages-notes"]);
        if (argv.serve) startServer(outputDir, argv.port);
        return;
      }

      const oldShaMap = buildOldShaMap(oldCompare);
      const newCompare: BranchCompare[] = [];

      console.log("  Scanning " + changedForks.length + " changed forks...");
      for (let i = 0; i < changedForks.length; i++) {
        const fork = changedForks[i];
        const results = await scanForkBranches(repo, fork, oldShaMap);
        for (const r of results) newCompare.push(r);
        const interesting = results.filter((r) => r.ahead_by > 0 || r.behind_by > 0);
        const status = interesting.length > 0
          ? interesting.map((r) => r.branch + "(" + r.ahead_by + "a/" + r.behind_by + "b)").join(", ")
          : "= identical";
        console.log("  [" + (i + 1) + "/" + changedForks.length + "] " + fork.full_name + " " + status);
      }

      const { merged, changes } = mergeIncrementalCompare(oldCompare, newCompare);
      saveCompareJsonl(outputDir, merged);

      const analysisData = analyze(freshForks, merged, outputDir, changes);

      const allOwners = [...new Set([...oldForks, ...freshForks].map((f: Fork) => f.owner))];
      const prMap = await matchPRs(repo, allOwners, outputDir);

      generateStage1Report(freshForks, merged, analysisData, outputDir, repo);

      const interesting = analysisData.filter((f: ForkAnalysis) => !f.is_bot_only && f.max_ahead > 0);
      console.log("\n  Incremental scan complete: " + interesting.length + " interesting forks");

      if (argv["prepare-deep"]) {
        prepareDeepInputs(analysisData, ["lenucksi/Backlog.md"], argv["deep-limit"], outputDir);
        console.log("Deep input files prepared.");
      }

      if (argv["gh-pages"]) {
        exportGhPages(outputDir, join(outputDir, "gh-pages"), argv["gh-pages-subpath"], !argv["gh-pages-notes"]);
      }
      if (argv.serve) startServer(outputDir, argv.port);
      return;
    }
  }

  // Full Stage 1 scan
  if (!repo) {
    console.error("Error: repo required (e.g., MrLesk/Backlog.md)\nRun with --interactive for wizard.");
    process.exit(1);
  }

  console.log("  Repo: " + repo + "\n");

  const forks = await fetchForks(repo, outputDir);
  const allResults = await scanBranches(repo, forks, outputDir);
  const analysisData = analyze(forks, allResults, outputDir);

  // PR matching
  const forkOwners = [...new Set(analysisData.map((f) => f.owner))];
  const prMap = await matchPRs(repo, forkOwners, outputDir);

  // Report
  generateStage1Report(forks, allResults, analysisData, outputDir, repo);

  const interesting = analysisData.filter((f) => !f.is_bot_only && f.max_ahead > 0);
  console.log("\n  Stage 1 complete: " + interesting.length + " interesting forks");

  if (argv["prepare-deep"]) {
    prepareDeepInputs(analysisData, ["lenucksi/Backlog.md"], argv["deep-limit"], outputDir);
    console.log("Deep input files prepared.");
    return;
  }

  if (isDeep) {
    // Standalone LLM analysis
    const llmKey = argv["llm-key"] || process.env.ANTHROPIC_API_KEY || "";
    if (!llmKey) {
      console.error("Need --llm-key or ANTHROPIC_API_KEY for deep analysis");
      process.exit(1);
    }
    console.log("Deep analysis requires sub-agents (use the OpenCode skill) or implement API caller.");
    console.log("For now, run --prepare-deep then use the skill to analyze.");
  }

  if (argv["gh-pages"]) {
    exportGhPages(outputDir, join(outputDir, "gh-pages"), argv["gh-pages-subpath"], !argv["gh-pages-notes"]);
  }
  if (argv.serve) startServer(outputDir, argv.port);
}

import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";

async function ask(query: string, def?: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  const q = def ? `${query} [${def}]: ` : `${query}: `;
  const answer = await rl.question(q);
  rl.close();
  return answer.trim() || def || "";
}

async function runInteractive(outputDir: string) {
  console.log("\n  Fork Scanner -- Interactive Mode\n");

  const repo = await ask("GitHub repo (e.g. MrLesk/Backlog.md)");
  if (!repo) {
    console.error("Repo required.");
    process.exit(1);
  }

  const outputDirChoice = await ask("Output dir", outputDir);
  const token = resolveToken();
  if (!existsSync(outputDirChoice)) mkdirSync(outputDirChoice, { recursive: true });

  const forks = await fetchForks(repo, outputDirChoice);
  const allResults = await scanBranches(repo, forks, outputDirChoice);
  const analysisData = analyze(forks, allResults, outputDirChoice);
  generateStage1Report(forks, allResults, analysisData, outputDirChoice, repo);

  const runDeep = await ask("Run deep analysis? (yes/no)", "no");
  if (runDeep.toLowerCase() === "yes") {
    const deep = await import("./deep.js");
    const interesting = analysisData.filter((f) => !f.is_bot_only && f.max_ahead > 0);
    const llmKey = await ask("Anthropic API key (or leave blank for later)");
    if (llmKey) {
      deep.prepareDeepInputs(analysisData, [repo], 30, outputDirChoice);
      // Actually run deep
      // @ts-ignore -- pre-existing: runDeepAnalysis not in deep.ts exports
      const deepResults = await (deep as any).runDeepAnalysis(interesting.slice(0, 5), repo, llmKey, outputDirChoice);
      const fixedMap = new Map(Object.entries(deepResults));
      const forkOwners = [...new Set(analysisData.map((f: ForkAnalysis) => f.owner))];
      const prMap = await matchPRs(repo, forkOwners, outputDirChoice);
      // @ts-ignore -- pre-existing: Map type mismatch
      generateStage2Report(forks, allResults, analysisData, outputDirChoice, fixedMap as Map<string, DeepAnalysis>, prMap, {}, repo);
      console.log("\nDeep analysis complete.");
    }
  }

  const serveChoice = await ask("Start report server? (yes/no)", "yes");
  if (serveChoice.toLowerCase() === "yes") {
    startServer(outputDirChoice, 4099);
  }
}

function startServer(outputDir: string, port: number) {
  console.log("Starting server on http://localhost:" + port);
  // Dynamic import to avoid loading serve deps
  import("./serve.js").then((mod) => mod.serve(outputDir, port));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
