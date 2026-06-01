// SPDX-License-Identifier: AGPL-3.0-only
import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";

export function resolveToken(): string {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync("gh auth token", { encoding: "utf-8" }).trim();
  } catch {
    throw new Error("Need GH_TOKEN, GITHUB_TOKEN, or `gh auth login`");
  }
}

let _token: string | null = null;
export function getToken(): string {
  if (_token) return _token;
  _token = resolveToken();
  return _token;
}

export const UPSTREAM_BRANCH = "main";

export function categorizePushed(pushedAt: string): string {
  if (!pushedAt) return "never";
  const days = (Date.now() - new Date(pushedAt).getTime()) / 86400000;
  if (days < 30) return "last-30-days";
  if (days < 90) return "last-3-months";
  if (days < 180) return "last-6-months";
  if (days < 365) return "last-year";
  return "older";
}

export const PUSHED_LABELS: Record<string, string> = {
  "last-30-days": "Last 30 days",
  "last-3-months": "Last 3 months",
  "last-6-months": "Last 6 months",
  "last-year": "Last year",
  "older": "Over 1 year ago",
  "never": "Never pushed",
};
