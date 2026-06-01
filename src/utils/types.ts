export interface Fork {
  full_name: string;
  owner: string;
  default_branch: string;
  pushed_at: string;
  created_at: string;
  size: number;
}
export interface BranchCompare {
  full_name: string;
  branch: string;
  status: string;
  ahead_by: number;
  behind_by: number;
  merge_base_sha: string;
  total_commits: number;
  commits: CommitInfo[];
  total_files: number;
  total_additions: number;
  total_deletions: number;
  files: FileChange[];
}
export interface CommitInfo {
  sha: string;
  short_sha: string;
  author_login: string | null;
  author_name: string | null;
  author_email: string | null;
  message: string;
  date: string | null;
  /** Set during incremental merge: true if this commit is new since last scan */
  _is_new?: boolean;
}
export interface FileChange {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}
export interface ForkAnalysis {
  full_name: string;
  owner: string;
  pushed_at: string;
  total_branches_with_changes: number;
  max_ahead: number;
  max_behind: number;
  is_bot_only: boolean;
  branches: BranchCompare[];
  cluster_group: string;
  pushed_category: string;
  /** Incremental scan change tracking */
  _change?: "new" | "updated" | "rewritten" | "unchanged";
  _new_commits?: number;
  _rewritten_commits?: number;
}
export interface DeepAnalysis {
  full_name: string;
  title: string;
  description: string;
  tags: string[];
  has_code_changes: boolean;
  main_focus: "feature" | "fix" | "config" | "docs" | "maintenance";
  upstreamability: number;
  value_assessment: "high" | "medium" | "low";
  /** Incremental update history appended on each re-analysis */
  _updates?: DeepAnalysisUpdate[];
}

export interface DeepAnalysisUpdate {
  date: string;
  change: "new" | "updated" | "rewritten";
  new_commits: number;
  rewritten_commits?: number;
  analysis: string;
  value_assessment?: "high" | "medium" | "low";
  upstreamability?: number;
  /** True for the most recent update run */
  _is_current?: boolean;
}
export interface DeepInput {
  full_name: string;
  url: string;
  pushed_at: string;
  max_ahead: number;
  max_behind: number;
  pushed_category: string;
  /** Change context from incremental scan */
  _change?: "new" | "updated" | "rewritten";
  _new_commits?: number;
  _rewritten_commits?: number;
  branches: {
    name: string;
    ahead_by: number;
    behind_by: number;
    total_commits: number;
    commits: { sha: string; author: string | null; message: string; date: string | null }[];
    total_files: number;
    total_additions: number;
    total_deletions: number;
    files: { filename: string; status: string; additions: number; deletions: number }[];
  }[];
}
export interface PRInfo {
  number: number;
  title: string;
  state: string;
  created_at: string;
  merged_at: string | null;
  closed_at: string | null;
  url: string;
  reaction_count: number;
  reactions: { content: string; user: string; created_at: string }[];
  first_reaction: string | null;
  last_reaction: string | null;
}
export interface UserNotes { [forkName: string]: { checked: boolean; note: string } }
export interface ScanConfig {
  repo: string; outputDir: string; deep: boolean; deepLimit: number;
  llmKey: string | null; serve: boolean; port: number; interactive: boolean;
  prepareDeep: boolean; mergeDeep: string | null; ghPages: boolean; version: boolean;
}
