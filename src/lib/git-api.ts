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
  DiffStats,
  RemoteInfo,
  PullRequest,
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

/** Get commit log */
export async function gitGetLog(
  path: string,
  limit?: number
): Promise<CommitEntry[]> {
  return invoke('git_get_log', { path, limit });
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
