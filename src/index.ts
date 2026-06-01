#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, cpSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { resolveToken } from "./config.js";
import { fetchForks, scanBranches } from "./scan.js";
import { analyze } from "./analyze.js";
import { matchPRs } from "./pr-check.js";
import { prepareDeepInputs, mergeDeepResults } from "./deep.js";
import { generateStage1Report, generateStage2Report } from "./report.js";
import { exportGhPages } from "./gh-pages.js";


interface Args {
  repo: string;
  output: string;
  deep: boolean;
  "deep-limit": number;
  "llm-key": string | null;
  serve: boolean;
  port: number;
  interactive: boolean;
  "prepare-deep": boolean;
  "merge-deep": string | null;
  "gh-pages": boolean;
  version: boolean;
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
    .option("version", { alias: "v", type: "boolean", default: false, describe: "Versioned output files" })
    .parse() as Args;

  const repo = argv.repo || "";
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
    generateStage2Report([], [], analysisData, outputDir, deepMap, new Map(), argv.version, {});
    console.log("Stage 2 report generated with " + deepMap.size + " deep analyses.");
    if (argv["gh-pages"]) {
      exportGhPages(outputDir, join(outputDir, "gh-pages"));
    }
    if (argv.serve) startServer(outputDir, argv.port);
    return;
  }

  // Serve-only mode (no repo or merge-deep needed)
  if (argv.serve && !argv["merge-deep"]) {
    startServer(outputDir, argv.port);
    return;
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
  generateStage1Report(forks, allResults, analysisData, outputDir, argv.version);

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
    exportGhPages(outputDir, join(outputDir, "gh-pages"));
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

  const out = await ask("Output directory", outputDir);
  const doDeep = (await ask("Run deep analysis?", "n")).toLowerCase() === "y";
  const deepLimit = doDeep ? parseInt(await ask("Deep analysis limit", "30")) || 30 : 0;
  const llmKey = doDeep ? await ask("Anthropic API key (or ENTER to skip)") : "";
  const doServe = (await ask("Start report server?", "y")).toLowerCase() !== "n";
  const port = doServe ? parseInt(await ask("Server port", "4099")) || 4099 : 0;

  const argv: any = {
    repo,
    output: out,
    deep: doDeep,
    "deep-limit": deepLimit,
    "llm-key": llmKey || undefined,
    serve: doServe,
    port,
    "prepare-deep": false,
    "merge-deep": undefined,
    "gh-pages": false,
    version: false,
  };

  if (!existsSync(argv.output)) mkdirSync(argv.output, { recursive: true });

  resolveToken();
  const forks = await fetchForks(repo, argv.output);
  const allResults = await scanBranches(repo, forks, argv.output);
  const analysisData = analyze(forks, allResults, argv.output);
  const forkOwners = [...new Set(analysisData.map((f: any) => f.owner))];
  const prMap = await matchPRs(repo, forkOwners, argv.output);

  if (doDeep && llmKey) {
    process.env.ANTHROPIC_API_KEY = llmKey;
    console.log("  Deep analysis prepared. Use skill sub-agents or --deep flag.");
  }

  if (argv["prepare-deep"] || doDeep) {
    const dl = argv["deep-limit"] || 30;
    const analysis = JSON.parse(readFileSync(join(argv.output, "analysis.json"), "utf-8"));
    const inputs = prepareDeepInputs(analysis, [], dl, argv.output);
    console.log("  Prepared " + inputs.length + " deep-input files for sub-agents.");
  }

  generateStage1Report(forks, allResults, analysisData, argv.output, argv.version);
  console.log("  Stage 1 report generated.");

  if (doServe) startServer(argv.output, port);
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
