import GitHubMCPClient from '../mcp/github';
import SearchMCPClient from '../mcp/search';
import groqClient from '../groq/client';
import IntegrationManager from '../services/integration-manager';
import logger from '../utils/logger';
import { CommitInfo, ResearchResult } from '../utils/types';

/**
 * Incident Researcher (Using REAL APIs and E2B MCP Servers)
 * 
 * Researches incidents using:
 * - REAL GitHub API for commit history (not MCP)
 * - Perplexity MCP for AI-powered research
 * - Brave Search MCP for web search
 * - Exa MCP for semantic search
 */
export class IncidentResearcher {
  private githubMCPClient: GitHubMCPClient;
  private searchClient: SearchMCPClient;
  private userId: string = 'demo-user';

  constructor() {
    this.githubMCPClient = new GitHubMCPClient();
    this.searchClient = new SearchMCPClient();
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Correlate incident with recent commits via REAL GitHub API
   */
  async correlateCommits(errorPattern: string, owner?: string, repo?: string): Promise<{
    commits: CommitInfo[];
    suspectedCommit: CommitInfo | null;
    diff: string;
  }> {
    logger.info('Correlating commits with error pattern via REAL GitHub API...');

    if (!owner || !repo) {
      logger.warn('GitHub owner/repo not provided. Cannot fetch commits.');
      return { commits: [], suspectedCommit: null, diff: '' };
    }

    let commits: CommitInfo[] = [];

    try {
      // Try REAL GitHub API first
      const integrationManager = new IntegrationManager(this.userId);
      const github = await integrationManager.getGitHubIntegration();

      if (github) {
        logger.info(`Using REAL GitHub API for ${owner}/${repo}`);
        const githubCommits = await github.getCommits(owner, repo, { per_page: 10 });
        
        commits = githubCommits.map((commit: any) => ({
          sha: commit.sha?.substring(0, 12) || '',
          author: commit.commit.author.name || commit.author?.login || 'Unknown',
          message: commit.commit.message || '',
          timestamp: new Date(commit.commit.author.date),
          filesChanged: commit.files?.map((f: any) => f.filename) || [],
          additions: commit.stats?.additions || 0,
          deletions: commit.stats?.deletions || 0,
        }));

        logger.info(`Found ${commits.length} recent commits via REAL GitHub API`);
      } else {
        logger.warn('No GitHub integration found. Cannot fetch commits.');
        return { commits: [], suspectedCommit: null, diff: '' };
      }
    } catch (error: any) {
      logger.error('Error fetching commits via REAL GitHub API:', error);
      return { commits: [], suspectedCommit: null, diff: '' };
    }

    if (commits.length === 0) {
      logger.warn('No commits found');
      return { commits: [], suspectedCommit: null, diff: '' };
    }

    // Use Groq to analyze which commit is suspicious
    const suspectedCommit = await groqClient.analyzeCommits(commits, errorPattern);
    
    if (!suspectedCommit) {
      logger.warn('Could not identify suspected commit');
      return { commits, suspectedCommit: null, diff: '' };
    }

    logger.info(`Suspected commit identified: ${suspectedCommit.sha}`);

    // Fetch diff via REAL GitHub API
    let diff = '';
    try {
      const integrationManager = new IntegrationManager(this.userId);
      const github = await integrationManager.getGitHubIntegration();
      
      if (github) {
        diff = await github.getCommitDiff(suspectedCommit.sha, owner, repo);
        logger.info(`Fetched diff via REAL GitHub API (${diff.length} chars)`);
      }
    } catch (error: any) {
      logger.error('Error fetching diff via REAL GitHub API:', error);
      diff = '';
    }

    return {
      commits,
      suspectedCommit,
      diff,
    };
  }

  /**
   * Research with Perplexity MCP
   */
  async researchWithPerplexity(
    errorMessage: string,
    context: string
  ): Promise<ResearchResult[]> {
    logger.info('Researching with Perplexity MCP...');
    
    const response = await this.searchClient.researchError(errorMessage, context);
    
    logger.info(`Found research results from Perplexity MCP: ${response.sources.length} sources`);
    return response.sources;
  }

  /**
   * Search web with Brave Search MCP
   */
  async searchWeb(
    errorMessage: string,
    technology: string
  ): Promise<ResearchResult[]> {
    logger.info('Searching web with Brave Search MCP...');

    const response = await this.searchClient.searchSimilarIssues(errorMessage, technology);
    
    logger.info(`Found ${response.results.length} Brave search results via MCP`);
    return response.results;
  }

  /**
   * Search with Exa AI MCP
   */
  async searchWithExa(
    errorMessage: string,
    context: string
  ): Promise<ResearchResult[]> {
    logger.info('Searching with Exa AI MCP...');

    const response = await this.searchClient.searchSimilarIncidents(errorMessage, context);
    
    logger.info(`Found ${response.results.length} Exa search results via MCP`);
    return response.results;
  }

  /**
   * Comprehensive research combining all MCP sources
   */
  async comprehensiveResearch(
    errorPattern: string,
    technology: string,
    _commitContext?: CommitInfo
  ): Promise<{
    perplexityResults: ResearchResult[];
    braveResults: ResearchResult[];
    exaResults: ResearchResult[];
    allResults: ResearchResult[];
  }> {
    logger.info('Starting comprehensive research via E2B MCP servers...');

    // Use comprehensive search from SearchMCPClient
    const query = `${errorPattern} ${technology}`;
    const results = await this.searchClient.comprehensiveSearch(query);

    logger.info(`Research complete via MCP: ${results.allResults.length} total results`);
    logger.info(`Available MCP servers: ${this.searchClient.getAvailableServers().join(', ')}`);

    return results;
  }

  /**
   * Extract key findings from research
   */
  extractKeyFindings(results: ResearchResult[]): string[] {
    return results
      .slice(0, 5)
      .map(r => `${r.source}: ${r.summary}`);
  }

  /**
   * List available GitHub MCP tools
   */
  async listGitHubTools(): Promise<string[]> {
    return await this.githubMCPClient.listAvailableTools();
  }
}

export default new IncidentResearcher();

