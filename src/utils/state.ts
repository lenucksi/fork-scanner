import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export function loadState(outputDir: string): { completed: string[]; results: BranchResult[] } {
  const p = join(outputDir, "state.json");
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf-8"));
  return { completed: [], results: [] };
}

export function saveState(outputDir: string, state: any) {
  writeFileSync(join(outputDir, "state.json"), JSON.stringify(state, null, 2));
}

import type { BranchCompare } from "./types.js";

interface BranchResult extends BranchCompare {}
