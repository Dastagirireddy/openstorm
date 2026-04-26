/**
 * Git API - IPC wrapper functions
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  RepoInfo,
  RepoStatus,
  BranchInfo,
  CommitResult,
  CommitInfo,
  CommitEntry,
  CommitEntryWithStats,
  DiffStats,
  RemoteInfo,
  PullRequest,
  ChangedFile,
} from './git-types.js';

// ============================================================================
// Repository Detection & Initialization
// ============================================================================

/** Check if git is installed on the system */
export async function gitCheckInstalled(): Promise<boolean> {
  return invoke('git_check_installed');
}

/** Check if a path is a git repository */
export async function gitCheckRepository(path: string): Promise<RepoInfo> {
  return invoke('git_check_repository', { path });
}

/** Initialize a git repository */
export async function gitInit(path: string): Promise<string> {
  return invoke('git_init', { path });
}

// ============================================================================
// Branch Operations
// ============================================================================

/** Get current branch name */
export async function gitGetBranch(path: string): Promise<string> {
  return invoke('git_get_branch', { path });
}

/** Get all branches (returns { current, branches }) */
export async function gitGetBranches(path: string): Promise<{ current: string; branches: string[] }> {
  try {
    const current = await invoke('git_get_branch', { path }) as string;
    const branches = await invoke('git_list_branches', { path }) as BranchInfo[];
    return {
      current,
      branches: branches.map(b => b.name),
    };
  } catch (e) {
    return { current: '', branches: [] };
  }
}

/** List all local branches */
export async function gitListBranches(path: string): Promise<BranchInfo[]> {
  return invoke('git_list_branches', { path });
}

/** List all remote branches */
export async function gitListRemoteBranches(path: string): Promise<BranchInfo[]> {
  return invoke('git_list_remote_branches', { path });
}

/** Create a new branch */
export async function gitCreateBranch(
  path: string,
  name: string,
  startPoint?: string
): Promise<void> {
  return invoke('git_create_branch', { path, name, start_point: startPoint });
}

/** Delete a branch */
export async function gitDeleteBranch(
  path: string,
  name: string,
  force: boolean
): Promise<void> {
  return invoke('git_delete_branch', { path, name, force });
}

/** Checkout/switch to a branch */
export async function gitCheckoutBranch(path: string, name: string): Promise<void> {
  return invoke('git_checkout_branch', { path, name });
}

// ============================================================================
// Status & File Changes
// ============================================================================

/** Get repository status (staged, unstaged, untracked files) */
export async function gitGetStatus(path: string): Promise<RepoStatus> {
  return invoke('git_get_status', { path });
}

/** Stage a file */
export async function gitStageFile(path: string, filePath: string): Promise<void> {
  return invoke('git_stage_file', { path, filePath });
}

/** Stage all files */
export async function gitStageAll(path: string): Promise<void> {
  return invoke('git_stage_all', { path });
}

/** Unstage a file */
export async function gitUnstageFile(path: string, filePath: string): Promise<void> {
  return invoke('git_unstage_file', { path, filePath });
}

/** Unstage all files */
export async function gitUnstageAll(path: string): Promise<void> {
  return invoke('git_unstage_all', { path });
}

// ============================================================================
// Commit Operations
// ============================================================================

/** Create a commit */
export async function gitCommit(path: string, message: string): Promise<CommitResult> {
  return invoke('git_commit', { path, message });
}

/** Amend the last commit */
export async function gitAmendCommit(
  path: string,
  message?: string
): Promise<CommitResult> {
  return invoke('git_amend_commit', { path, message });
}

/** Discard changes in a file */
export async function gitDiscardFile(
  path: string,
  filePath: string,
  staged: boolean
): Promise<void> {
  return invoke('git_discard_file', { path, filePath, staged });
}

/** Discard all changes */
export async function gitDiscardAll(path: string): Promise<void> {
  return invoke('git_discard_all', { path });
}

// ============================================================================
// Diff Operations
// ============================================================================

/** Get diff for a file */
export async function gitGetFileDiff(
  path: string,
  filePath: string,
  staged: boolean
): Promise<string> {
  return invoke('git_get_file_diff', { path, filePath, staged });
}

/** Get repository diff stats */
export async function gitGetDiffStats(path: string): Promise<DiffStats> {
  return invoke('git_get_diff_stats', { path });
}

// ============================================================================
// Remote Operations
// ============================================================================

/** Fetch from remote */
export async function gitFetch(path: string): Promise<void> {
  return invoke('git_fetch', { path });
}

/** Pull from remote */
export async function gitPull(path: string): Promise<string> {
  return invoke('git_pull', { path });
}

/** Push to remote */
export async function gitPush(path: string, force: boolean): Promise<string> {
  return invoke('git_push', { path, force });
}

/** List remotes */
export async function gitListRemotes(path: string): Promise<RemoteInfo[]> {
  return invoke('git_list_remotes', { path });
}

/** Add a remote */
export async function gitAddRemote(
  path: string,
  name: string,
  url: string
): Promise<void> {
  return invoke('git_add_remote', { path, name, url });
}

/** Remove a remote */
export async function gitRemoveRemote(path: string, name: string): Promise<void> {
  return invoke('git_remove_remote', { path, name });
}

// ============================================================================
// Log & History
// ============================================================================

/** Get commit log with filters */
export async function gitGetLog(
  path: string,
  limit?: number,
  filters?: {
    author?: string;
    since?: string;
    until?: string;
    path?: string;
    mergesOnly?: boolean;
    noMerges?: boolean;
  }
): Promise<CommitEntry[]> {
  return invoke('git_get_log', {
    path,
    limit,
    author: filters?.author,
    since: filters?.since,
    until: filters?.until,
    pathFilter: filters?.path,
    mergesOnly: filters?.mergesOnly,
    noMerges: filters?.noMerges,
  });
}

/** Get commit details */
export async function gitGetCommit(path: string, hash: string): Promise<CommitEntry> {
  return invoke('git_get_commit', { path, hash });
}

/** Get commit diff (show) */
export async function gitShowCommit(path: string, hash: string): Promise<string> {
  return invoke('git_get_commit_diff', { path, hash });
}

/** Get commit diff */
export async function gitGetCommitDiff(path: string, hash: string): Promise<string> {
  return invoke('git_get_commit_diff', { path, hash });
}

/** Get last commit info */
export async function gitGetLastCommit(path: string): Promise<CommitInfo> {
  return invoke('git_get_last_commit', { path });
}

/** Search commits by message */
export async function gitSearchCommits(
  path: string,
  query: string,
  limit?: number
): Promise<CommitEntry[]> {
  return invoke('git_search_commits', { path, query, limit });
}

/** Get file history */
export async function gitGetFileHistory(
  path: string,
  filePath: string,
  limit?: number
): Promise<CommitEntry[]> {
  return invoke('git_get_file_history', { path, filePath, limit });
}

// ============================================================================
// GitHub Pull Requests
// ============================================================================

/** Get GitHub pull requests */
export async function gitGetPullRequests(path: string): Promise<PullRequest[]> {
  return invoke('git_get_pull_requests', { path });
}

// ============================================================================
// Commit Analysis Helpers (Client-side parsing)
// ============================================================================

/**
 * Parse commit diff to extract changed files with stats
 * Format: "diff --git a/path b/path\nindex ...\n--- a/path\n+++ b/path\n@@ -line,count +line,count @@\n+add\n-delete"
 */
export async function getCommitChangedFiles(
  path: string,
  hash: string
): Promise<ChangedFile[]> {
  const diff = await gitGetCommitDiff(path, hash);
  return parseDiffToChangedFiles(diff);
}

/**
 * Get commit stats (additions, deletions, files changed)
 */
export async function getCommitStats(
  path: string,
  hash: string
): Promise<{ additions: number; deletions: number; files_changed: number }> {
  const diff = await gitGetCommitDiff(path, hash);
  return parseDiffStats(diff);
}

/**
 * Parse a unified diff and return changed files with stats
 */
function parseDiffToChangedFiles(diff: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  const lines = diff.split('\n');
  let currentFile: Partial<ChangedFile> | null = null;
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    // Match "diff --git a/path b/path"
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diffMatch) {
      // Save previous file
      if (currentFile && currentFile.path) {
        currentFile.additions = additions;
        currentFile.deletions = deletions;
        files.push(currentFile as ChangedFile);
      }
      // Start new file
      currentFile = { path: diffMatch[2], status: 'modified', binary: false };
      additions = 0;
      deletions = 0;
      continue;
    }

    // Match "--- a/path" (skip, we get path from diff --git line)
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      continue;
    }

    // Match "@@ -line,count +line,count @@"
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch && currentFile) {
      // New file (starts at line 1 with no deletions)
      if (hunkMatch[1] === '1' && !hunkMatch[2]) {
        currentFile.status = 'added';
      }
      continue;
    }

    // Match "deleted file mode ..."
    if (line.startsWith('deleted file mode')) {
      if (currentFile) currentFile.status = 'deleted';
      continue;
    }

    // Match "new file mode ..."
    if (line.startsWith('new file mode')) {
      if (currentFile) currentFile.status = 'added';
      continue;
    }

    // Match "rename from/to"
    if (line.startsWith('rename from') || line.startsWith('rename to')) {
      if (currentFile) currentFile.status = 'renamed';
      continue;
    }

    // Binary file marker
    if (line.startsWith('Binary files')) {
      if (currentFile) currentFile.binary = true;
      continue;
    }

    // Count additions and deletions
    if (currentFile) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    }
  }

  // Don't forget the last file
  if (currentFile && currentFile.path) {
    currentFile.additions = additions;
    currentFile.deletions = deletions;
    files.push(currentFile as ChangedFile);
  }

  return files;
}

/**
 * Parse a unified diff and return stats
 */
function parseDiffStats(diff: string): { additions: number; deletions: number; files_changed: number } {
  const files = parseDiffToChangedFiles(diff);
  let additions = 0;
  let deletions = 0;

  for (const file of files) {
    additions += file.additions;
    deletions += file.deletions;
  }

  return {
    additions,
    deletions,
    files_changed: files.length,
  };
}

/**
 * Enhance commit entries with stats for display
 */
export async function enrichCommitsWithStats(
  path: string,
  entries: CommitEntry[]
): Promise<CommitEntryWithStats[]> {
  const results: CommitEntryWithStats[] = [];

  for (const entry of entries) {
    try {
      const stats = await getCommitStats(path, entry.hash);
      results.push({
        ...entry,
        ...stats,
      });
    } catch {
      // If stats fetch fails, use zeros
      results.push({
        ...entry,
        files_changed: 0,
        additions: 0,
        deletions: 0,
      });
    }
  }

  return results;
}
