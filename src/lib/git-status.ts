export async function getGitBranch(projectPath: string): Promise<string> {
  const { gitGetBranch } = await import('./git-api.js');
  return gitGetBranch(projectPath);
}
