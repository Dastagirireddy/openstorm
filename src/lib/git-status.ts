import { gitGetBranch } from './git-api.js';

export function getGitBranch(projectPath: string): Promise<string> {
  return gitGetBranch(projectPath);
}
