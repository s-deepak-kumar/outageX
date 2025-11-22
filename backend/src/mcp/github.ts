import e2bMCPManager from './e2b-mcp-manager';
import logger from '../utils/logger';
import { CommitInfo, GitHubCommitResponse, GitHubDiffResponse } from '../utils/types';
import { mockCommits, suspiciousCommitDiff } from '../data/mock-scenarios';

/**
 * GitHub MCP Client (via E2B Docker Hub MCP)
 * 
 * Uses E2B Sandbox to run GitHub MCP server from Docker Hub
 * Communicates via MCP protocol through E2B gateway
 */
export class GitHubMCPClient {
  private serverName = 'github';

  /**
   * Check if GitHub MCP server is available
   */
  isAvailable(): boolean {
    return e2bMCPManager.isServerAvailable(this.serverName);
  }

  /**
   * Fetch recent commits via MCP
   */
  async getRecentCommits(limit: number = 10, owner?: string, repo?: string): Promise<GitHubCommitResponse> {
    if (!this.isAvailable()) {
      logger.info('Using mock GitHub commits (MCP not available)');
      return { commits: mockCommits };
    }

    // Use provided owner/repo or fallback to env vars
    const repoOwner = owner || process.env.GITHUB_REPO_OWNER;
    const repoName = repo || process.env.GITHUB_REPO_NAME;

    if (!repoOwner || !repoName) {
      logger.warn('GitHub owner/repo not provided and not in env vars. Using mock commits.');
      return { commits: mockCommits };
    }

    try {
      const result = await e2bMCPManager.callTool(
        this.serverName,
        'list_commits',
        {
          owner: repoOwner,
          repo: repoName,
          count: limit,
        }
      );

      if (!result) {
        return { commits: mockCommits };
      }

      const commits: CommitInfo[] = result.commits?.map((commit: any) => ({
        sha: commit.sha?.substring(0, 12) || '',
        author: commit.author || '',
        message: commit.message || '',
        timestamp: new Date(commit.timestamp),
        filesChanged: commit.files || [],
        additions: commit.additions || 0,
        deletions: commit.deletions || 0,
      })) || [];

      return { commits };
    } catch (error) {
      logger.error('Error fetching commits via GitHub MCP:', error);
      return { commits: mockCommits };
    }
  }

  /**
   * Get commit diff via MCP
   */
  async getCommitDiff(sha: string, owner?: string, repo?: string): Promise<GitHubDiffResponse> {
    if (!this.isAvailable()) {
      logger.info('Using mock GitHub diff (MCP not available)');
      return { sha, diff: suspiciousCommitDiff };
    }

    // Use provided owner/repo or fallback to env vars
    const repoOwner = owner || process.env.GITHUB_REPO_OWNER;
    const repoName = repo || process.env.GITHUB_REPO_NAME;

    if (!repoOwner || !repoName) {
      logger.warn('GitHub owner/repo not provided and not in env vars. Using mock diff.');
      return { sha, diff: suspiciousCommitDiff };
    }

    try {
      const result = await e2bMCPManager.callTool(
        this.serverName,
        'get_commit_diff',
        {
          owner: repoOwner,
          repo: repoName,
          sha,
        }
      );

      if (!result) {
        return { sha, diff: suspiciousCommitDiff };
      }

      return {
        sha,
        diff: result.diff || suspiciousCommitDiff,
      };
    } catch (error) {
      logger.error('Error fetching diff via GitHub MCP:', error);
      return { sha, diff: suspiciousCommitDiff };
    }
  }

  /**
   * Create pull request via MCP
   */
  async createPullRequest(
    title: string,
    body: string,
    headBranch: string,
    baseBranch: string = 'main'
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    if (!this.isAvailable()) {
      logger.info('Mock: Would create PR via GitHub MCP');
      return {
        success: true,
        url: `https://github.com/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/pull/123`,
      };
    }

    try {
      const result = await e2bMCPManager.callTool(
        this.serverName,
        'create_pull_request',
        {
          owner: process.env.GITHUB_REPO_OWNER,
          repo: process.env.GITHUB_REPO_NAME,
          title,
          body,
          head: headBranch,
          base: baseBranch,
        }
      );

      if (!result) {
        return {
          success: false,
          error: 'Failed to create PR via MCP',
        };
      }

      return {
        success: true,
        url: result.url,
      };
    } catch (error: any) {
      logger.error('Error creating PR via GitHub MCP:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List available tools in GitHub MCP
   */
  async listAvailableTools(): Promise<string[]> {
    const tools = await e2bMCPManager.listTools(this.serverName);
    return tools.map((t: any) => t.name);
  }
}

export default GitHubMCPClient;

