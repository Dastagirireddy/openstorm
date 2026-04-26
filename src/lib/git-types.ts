/**
 * Git integration types
 */

/** Status of a file in the repository */
export type FileStatus =
  | 'added'
  | 'copied'
  | 'deleted'
  | 'modified'
  | 'renamed'
  | 'type_changed'
  | 'unmerged'
  | 'untracked'
  | 'ignored';

/** A file change in the repository */
export interface FileChange {
  path: string;
  old_path: string | null;
  status: FileStatus;
  staged: boolean;
  index: number;
}

/** Overall repository status */
export interface RepoStatus {
  branch: string;
  ahead: number | null;
  behind: number | null;
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: FileChange[];
  total_changes: number;
}

/** Information about a git repository */
export interface RepoInfo {
  is_repository: boolean;
  root_path: string | null;
  git_dir: string | null;
}

/** Information about a branch */
export interface BranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  upstream: string | null;
  top_commit?: string;
}

/** Result of a commit operation */
export interface CommitResult {
  success: boolean;
  commit_hash: string | null;
  message: string | null;
  error: string | null;
}

/** Commit information */
export interface CommitInfo {
  hash: string;
  short_hash: string;
  subject: string;
  body: string;
  author: string;
  author_email: string;
  timestamp: number;
}

/** Commit entry in the log */
export interface CommitEntry {
  hash: string;
  short_hash: string;
  subject: string;
  body: string;
  author: string;
  author_email: string;
  timestamp: number;
  parent_hashes: string[];
}

/** Extended commit entry with stats (computed client-side) */
export interface CommitEntryWithStats extends CommitEntry {
  files_changed: number;
  additions: number;
  deletions: number;
}

/** A changed file in a commit diff */
export interface ChangedFile {
  path: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
}

/** Diff statistics */
export interface DiffStats {
  additions: number;
  deletions: number;
  files_changed: number;
}

/** Information about a remote */
export interface RemoteInfo {
  name: string;
  url: string;
  fetch_url: string;
  push_url: string;
}

/** Git repository state for UI */
export interface GitState {
  available: boolean;
  initialized: boolean;
  branch: string | null;
  ahead: number | null;
  behind: number | null;
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: FileChange[];
  loading: boolean;
  error: string | null;
}

/** Pull request status */
export type PullRequestStatus = 'open' | 'closed' | 'merged';

/** Pull request information */
export interface PullRequest {
  id: number;
  number: number;
  title: string;
  state: PullRequestStatus;
  author: string;
  created_at: string;
  head_branch: string;
  base_branch: string;
  body: string | null;
  commits: number;
  changed_files: number;
  additions: number;
  deletions: number;
}
