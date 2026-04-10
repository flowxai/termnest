import type {
  BranchInfo,
  FileEntry,
  GitCommitInfo,
  GitFileStatus,
  GitRepoInfo,
} from '../types';

export interface FileTreeCacheSnapshot {
  rootEntries: FileEntry[];
  gitStatuses: GitFileStatus[];
}

export interface GitHistoryRepoStateSnapshot {
  commits: GitCommitInfo[];
  loading: boolean;
  hasMore: boolean;
}

export interface GitHistoryCacheSnapshot {
  repos: GitRepoInfo[];
  expandedRepoPaths: string[];
  repoStates: Array<[string, GitHistoryRepoStateSnapshot]>;
  repoBranches: Array<[string, BranchInfo[]]>;
}

const fileTreeCache = new Map<string, FileTreeCacheSnapshot>();
const gitHistoryCache = new Map<string, GitHistoryCacheSnapshot>();

function cloneFileEntries(entries: FileEntry[]): FileEntry[] {
  return entries.map((entry) => {
    if (!entry.children) {
      return { ...entry };
    }
    return {
      ...entry,
      children: cloneFileEntries(entry.children),
    };
  });
}

function cloneGitStatuses(statuses: GitFileStatus[]): GitFileStatus[] {
  return statuses.map((status) => ({ ...status }));
}

function cloneRepos(repos: GitRepoInfo[]): GitRepoInfo[] {
  return repos.map((repo) => ({ ...repo }));
}

function cloneCommits(commits: GitCommitInfo[]): GitCommitInfo[] {
  return commits.map((commit) => ({ ...commit }));
}

function cloneBranches(branches: BranchInfo[]): BranchInfo[] {
  return branches.map((branch) => ({ ...branch }));
}

export function getFileTreeCache(projectPath: string): FileTreeCacheSnapshot | null {
  const cached = fileTreeCache.get(projectPath);
  if (!cached) return null;
  return {
    rootEntries: cloneFileEntries(cached.rootEntries),
    gitStatuses: cloneGitStatuses(cached.gitStatuses),
  };
}

export function setFileTreeCache(projectPath: string, snapshot: FileTreeCacheSnapshot): void {
  fileTreeCache.set(projectPath, {
    rootEntries: cloneFileEntries(snapshot.rootEntries),
    gitStatuses: cloneGitStatuses(snapshot.gitStatuses),
  });
}

export function getGitHistoryCache(projectPath: string): GitHistoryCacheSnapshot | null {
  const cached = gitHistoryCache.get(projectPath);
  if (!cached) return null;
  return {
    repos: cloneRepos(cached.repos),
    expandedRepoPaths: [...cached.expandedRepoPaths],
    repoStates: cached.repoStates.map(([repoPath, state]) => [
      repoPath,
      {
        commits: cloneCommits(state.commits),
        loading: state.loading,
        hasMore: state.hasMore,
      },
    ]),
    repoBranches: cached.repoBranches.map(([repoPath, branches]) => [
      repoPath,
      cloneBranches(branches),
    ]),
  };
}

export function setGitHistoryCache(projectPath: string, snapshot: GitHistoryCacheSnapshot): void {
  const repoStates = snapshot.repoStates ?? [];
  const repoBranches = snapshot.repoBranches ?? [];
  gitHistoryCache.set(projectPath, {
    repos: cloneRepos(snapshot.repos),
    expandedRepoPaths: [...snapshot.expandedRepoPaths],
    repoStates: repoStates.map(([repoPath, state]) => [
      repoPath,
      {
        commits: cloneCommits(state.commits),
        loading: state.loading,
        hasMore: state.hasMore,
      },
    ]),
    repoBranches: repoBranches.map(([repoPath, branches]) => [
      repoPath,
      cloneBranches(branches),
    ]),
  });
}

export function clearProjectPanelCache(): void {
  fileTreeCache.clear();
  gitHistoryCache.clear();
}
