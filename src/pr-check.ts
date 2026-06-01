import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { apiFetch } from "./utils/api.js";
import type { PRInfo } from "./utils/types.js";

function getToken(): string {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const { execSync } = require("child_process");
    return execSync("gh auth token", { encoding: "utf-8" }).trim();
  } catch {
    throw new Error("No GitHub token found");
  }
}

export async function matchPRs(
  repo: string,
  forkOwners: string[],
  outputDir: string,
): Promise<Map<string, PRInfo[]>> {
  const ownerSet = new Set(forkOwners);

  // Fetch all closed + open PRs from upstream
  const prs: any[] = [];
  for (const state of ["all"]) {
    let page = 1;
    while (true) {
      const data = await apiFetch(
        "/repos/" + repo + "/pulls?state=" + state + "&per_page=100&page=" + page
      );
      if (!data || !Array.isArray(data) || data.length === 0) break;
      prs.push(...data);
      page++;
      if (data.length < 100) break;
    }
  }

  // Filter to fork PRs from our owners
  const forkPrs = prs.filter((p: any) => {
    if (!p.head?.repo?.fork) return false;
    return ownerSet.has(p.user?.login);
  });

  // Get reactions for each PR
  const result = new Map<string, PRInfo[]>();
  const GITHUB_TOKEN = getToken();

  for (const p of forkPrs) {
    const owner = p.user.login;
    if (!result.has(owner)) result.set(owner, []);

    let reactionsData: any[] = [];
    try {
      const resp = await fetch(
        "https://api.github.com/repos/" + repo + "/issues/" + p.number + "/reactions",
        {
          headers: {
            Authorization: "Bearer " + GITHUB_TOKEN,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "fork-scanner",
          },
        }
      );
      if (resp.ok) reactionsData = await resp.json();
    } catch {}

    const reactions = reactionsData.map((r: any) => ({
      content: r.content,
      user: r.user?.login,
      created_at: r.created_at,
    }));

    result.get(owner)!.push({
      number: p.number,
      title: p.title || "",
      state: p.merged_at ? "merged" : p.state,
      created_at: p.created_at,
      merged_at: p.merged_at || null,
      closed_at: p.closed_at || null,
      url: p.html_url,
      reaction_count: reactions.length,
      reactions,
      first_reaction: reactions.length > 0
        ? reactions.reduce((a: any, b: any) => a.created_at < b.created_at ? a : b).created_at
        : null,
      last_reaction: reactions.length > 0
        ? reactions.reduce((a: any, b: any) => a.created_at > b.created_at ? a : b).created_at
        : null,
    });
  }

  // Cache
  const cache: any[] = [];
  for (const [owner, prs] of result) {
    cache.push({ full_name: owner + "/Backlog.md", prs });
  }
  writeFileSync(join(outputDir, "prs.json"), JSON.stringify(cache, null, 2));
  return result;
}