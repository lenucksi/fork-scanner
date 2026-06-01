// SPDX-License-Identifier: AGPL-3.0-only
import { getToken } from "../config.js";

const API_BASE = "https://api.github.com";
const MAX_RETRIES = 5;

export async function apiFetch(path: string, retries = MAX_RETRIES): Promise<any> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const token = getToken();
  for (let attempt = 0; attempt < retries; attempt++) {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "fork-scanner",
      },
    });
    if (resp.status === 429) {
      const wait = Math.min(1000 * 2 ** attempt, 30000);
      console.error(`  429 — waiting ${wait}ms`);
      await Bun.sleep(wait);
      continue;
    }
    if ([404, 409, 422].includes(resp.status)) return null;
    if (!resp.ok) return null;
    return await resp.json();
  }
  return null;
}

export async function apiFetchPaginated(path: string): Promise<any[]> {
  const results: any[] = [];
  let page = 1;
  while (true) {
    const sep = path.includes("?") ? "&" : "?";
    const data = await apiFetch(`${path}${sep}per_page=100&page=${page}`);
    if (!data || !Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return results;
}
