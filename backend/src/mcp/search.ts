import e2bMCPManager from './e2b-mcp-manager';
import logger from '../utils/logger';
import { ResearchResult, WebSearchResponse } from '../utils/types';
import { mockResearchResults } from '../data/mock-scenarios';

/**
 * Unified Search MCP Client (via E2B Docker Hub MCP)
 * 
 * Combines Perplexity, Brave Search, and Exa via E2B MCP servers
 * All run in E2B sandbox and communicate via MCP protocol
 */
export class SearchMCPClient {
  /**
   * Search with Perplexity MCP
   * Uses perplexity_research tool for deep research with citations
   * See: https://hub.docker.com/mcp/server/perplexity-ask/overview
   */
  async searchWithPerplexity(query: string): Promise<ResearchResult[]> {
    if (!e2bMCPManager.isServerAvailable('perplexity')) {
      logger.info('Using mock Perplexity results (MCP not available)');
      return mockResearchResults.slice(0, 2);
    }

    try {
      // List ALL tools first to see what's actually available
      const allTools = await e2bMCPManager.listTools();
      logger.info(`🔍 All available MCP tools (${allTools.length} total):`, {
        toolNames: allTools.map((t: any) => t.name),
        toolDetails: allTools.map((t: any) => ({
          name: t.name,
          description: t.description?.substring(0, 50) || 'No description',
        })),
      });
      
      // Find Perplexity tools - try multiple patterns
      const perplexityTools = allTools.filter((t: any) => {
        const name = t.name.toLowerCase();
        // Match exact tool names or any variation
        return name === 'perplexity_research' ||
               name === 'perplexity_ask' ||
               name === 'perplexity_reason' ||
               name.includes('perplexity') ||
               name.includes('perplexity-ask') ||
               name.startsWith('perplexity') ||
               name.includes('perplexity_ask') ||
               // Also check for tools that might be prefixed with server name
               (name.includes('ask') && (name.includes('research') || name.includes('reason')));
      });
      
      // If still no tools found, try listing tools with 'perplexity' server name
      if (perplexityTools.length === 0) {
        const perplexityServerTools = await e2bMCPManager.listTools('perplexity');
        if (perplexityServerTools.length > 0) {
          logger.info(`✅ Found Perplexity tools via server name filter:`, perplexityServerTools.map((t: any) => t.name));
          perplexityTools.push(...perplexityServerTools);
        }
      }
      
      logger.info(`🔍 Perplexity tool search results:`, {
        found: perplexityTools.length,
        toolNames: perplexityTools.map((t: any) => t.name),
        allToolNames: allTools.map((t: any) => t.name),
        searchPatterns: ['perplexity_research', 'perplexity_ask', 'perplexity_reason', 'perplexity', 'perplexity-ask'],
      });
      
      // Find the research tool - exact name: perplexity_research
      let toolName = 'perplexity_research'; // Default from Docker Hub docs
      
      if (perplexityTools.length > 0) {
        // Look for exact match first
        const exactMatch = perplexityTools.find((t: any) => 
          t.name.toLowerCase() === 'perplexity_research'
        );
        
        if (exactMatch) {
          toolName = exactMatch.name;
        } else {
          // Fallback: find any tool with "research" in name
          const researchTool = perplexityTools.find((t: any) => 
            t.name.toLowerCase().includes('research')
          );
          if (researchTool) {
            toolName = researchTool.name;
          } else {
            // Last resort: use first available Perplexity tool
            toolName = perplexityTools[0].name;
            logger.warn(`Using fallback Perplexity tool: ${toolName} (preferred: perplexity_research)`);
          }
        }
      } else {
        logger.warn('No Perplexity tools found in MCP Gateway. Perplexity MCP server may not be initialized.');
        logger.warn('Make sure PERPLEXITY_API_KEY is set and E2B sandbox is restarted.');
        return mockResearchResults.slice(0, 2);
      }

      logger.info(`Using Perplexity tool: ${toolName}`);

      // Use perplexity_research tool for comprehensive research with citations
      const result = await e2bMCPManager.callTool(
        'perplexity',
        toolName,
        {
          messages: [
            {
              role: 'user',
              content: query,
            },
          ],
        }
      );

      if (!result) {
        logger.warn('Perplexity MCP returned no result');
        return mockResearchResults.slice(0, 2);
      }

      // Parse Perplexity response - MCP returns content array with text
      // The response might be in result.text, result.content, or result.answer
      let responseText = '';
      let citations: any[] = [];

      // Handle different response formats
      if (typeof result === 'string') {
        responseText = result;
      } else if (result.text) {
        responseText = result.text;
        citations = result.citations || [];
      } else if (result.content) {
        responseText = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
        citations = result.citations || result.sources || [];
      } else if (result.answer) {
        responseText = result.answer;
        citations = result.citations || result.sources || [];
      } else if (Array.isArray(result)) {
        // MCP might return array of content items
        responseText = result.map((item: any) => item.text || item.content || '').join('\n');
      }

      // Extract sources from citations
      const sources: ResearchResult[] = citations.map((citation: any, index: number) => ({
        source: 'Perplexity AI',
        title: citation.title || `Source ${index + 1}`,
        summary: responseText.substring(0, 200) || '',
        url: citation.url || (typeof citation === 'string' ? citation : '') || '',
        relevance: 0.9 - (index * 0.1),
      }));

      // If no citations but we have text, create a single result
      if (sources.length === 0 && responseText) {
        sources.push({
          source: 'Perplexity AI',
          title: 'Research Response',
          summary: responseText.substring(0, 500),
          url: '',
          relevance: 0.9,
        });
      }

      return sources.length > 0 ? sources : mockResearchResults.slice(0, 2);
    } catch (error: any) {
      logger.error('Error searching with Perplexity MCP:', error);
      logger.debug('Perplexity error details:', { message: error.message, stack: error.stack });
      return mockResearchResults.slice(0, 2);
    }
  }

  /**
   * Search with Brave Search MCP
   */
  async searchWithBrave(query: string, limit: number = 5): Promise<ResearchResult[]> {
    if (!e2bMCPManager.isServerAvailable('brave-search')) {
      logger.info('Using mock Brave search results (MCP not available)');
      return mockResearchResults.slice(0, limit);
    }

    try {
      const result = await e2bMCPManager.callTool(
        'brave-search',
        'web_search',
        {
          query,
          count: limit,
        }
      );

      if (!result || !result.results) {
        return mockResearchResults.slice(0, limit);
      }

      return result.results.map((r: any) => ({
        source: this.extractDomain(r.url),
        title: r.title || '',
        summary: r.description || r.snippet || '',
        url: r.url || '',
        relevance: r.relevance || 0.7,
      }));
    } catch (error) {
      logger.error('Error searching with Brave MCP:', error);
      return mockResearchResults.slice(0, limit);
    }
  }

  /**
   * Search with Exa AI MCP
   * Uses Exa's semantic search capabilities
   */
  async searchWithExa(query: string, limit: number = 5): Promise<ResearchResult[]> {
    if (!e2bMCPManager.isServerAvailable('exa')) {
      logger.info('Using mock Exa results (MCP not available)');
      return mockResearchResults.slice(0, limit);
    }

    try {
      // List available tools to find the correct tool name
      const tools = await e2bMCPManager.listTools('exa');
      logger.info(`Available Exa tools: ${tools.map((t: any) => t.name).join(', ') || 'NONE FOUND'}`);

      // Find the correct tool name - from Docker Hub: web_search_exa
      let toolName = 'web_search_exa'; // Default from docs
      
      if (tools.length === 0) {
        // No tools found via filtering, try listing all tools
        const allTools = await e2bMCPManager.listTools();
        logger.debug(`All MCP tools: ${allTools.map((t: any) => t.name).join(', ')}`);
        
        // Look for exa tools in all tools
        const exaTools = allTools.filter((t: any) => 
          t.name.toLowerCase().includes('exa') || 
          t.name.toLowerCase().includes('web_search')
        );
        
        if (exaTools.length > 0) {
          // Prefer web_search_exa
          const searchTool = exaTools.find((t: any) => 
            t.name.toLowerCase().includes('web_search_exa') ||
            t.name.toLowerCase().includes('web_search')
          );
          toolName = searchTool ? searchTool.name : exaTools[0].name;
        }
      } else {
        // Tools found, use exact match or find search tool
        const toolNames = tools.map((t: any) => t.name.toLowerCase());
        
        if (toolNames.includes('web_search_exa')) {
          toolName = tools.find((t: any) => t.name.toLowerCase() === 'web_search_exa')!.name;
        } else {
          // Find any search tool
          const searchTool = tools.find((t: any) => 
            t.name.toLowerCase().includes('search') ||
            t.name.toLowerCase().includes('web_search')
          );
          toolName = searchTool ? searchTool.name : tools[0].name;
        }
      }

      logger.info(`Using Exa tool: ${toolName}`);

      const result = await e2bMCPManager.callTool(
        'exa',
        toolName,
        {
          query,
          numResults: limit, // Note: Exa uses numResults (camelCase), not num_results
        }
      );

      if (!result || !result.results) {
        return mockResearchResults.slice(0, limit);
      }

      return result.results.map((r: any) => ({
        source: this.extractDomain(r.url),
        title: r.title || '',
        summary: r.text || r.snippet || '',
        url: r.url || '',
        relevance: r.score || 0.8,
      }));
    } catch (error) {
      logger.error('Error searching with Exa MCP:', error);
      return mockResearchResults.slice(0, limit);
    }
  }

  /**
   * Search for technical issues (uses Perplexity since Brave is disabled)
   */
  async searchSimilarIssues(
    errorMessage: string,
    technology: string
  ): Promise<WebSearchResponse> {
    const query = `${errorMessage} ${technology} stackoverflow github`;
    // Use Perplexity instead of Brave (Brave is disabled)
    const results = await this.searchWithPerplexity(query);
    return { results };
  }

  /**
   * Research error with Perplexity AI
   */
  async researchError(
    errorMessage: string,
    context: string
  ): Promise<{ answer: string; sources: ResearchResult[] }> {
    const query = `Technical incident: ${errorMessage}. Context: ${context}. What are common causes and solutions?`;
    const sources = await this.searchWithPerplexity(query);
    
    return {
      answer: sources.length > 0 
        ? sources[0].summary 
        : 'Research results unavailable',
      sources,
    };
  }

  /**
   * Search similar incidents with semantic understanding (Exa)
   */
  async searchSimilarIncidents(
    errorMessage: string,
    context: string
  ): Promise<WebSearchResponse> {
    const query = `${errorMessage} ${context} production incident resolution`;
    const results = await this.searchWithExa(query, 5);
    return { results };
  }

  /**
   * Comprehensive search across all MCPs (Brave disabled)
   */
  async comprehensiveSearch(
    query: string
  ): Promise<{
    perplexityResults: ResearchResult[];
    braveResults: ResearchResult[];
    exaResults: ResearchResult[];
    allResults: ResearchResult[];
  }> {
    logger.info('Running comprehensive search across MCP servers (Perplexity & Exa)...');

    // Run searches in parallel (Brave is disabled)
    const [perplexityResults, exaResults] = await Promise.all([
      this.searchWithPerplexity(query),
      this.searchWithExa(query, 5),
    ]);

    // Brave is disabled, return empty array
    const braveResults: ResearchResult[] = [];

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const allResults: ResearchResult[] = [];

    [...perplexityResults, ...exaResults].forEach((result) => {
      if (result.url && !seenUrls.has(result.url)) {
        seenUrls.add(result.url);
        allResults.push(result);
      } else if (!result.url) {
        allResults.push(result);
      }
    });

    // Sort by relevance
    allResults.sort((a, b) => b.relevance - a.relevance);

    return {
      perplexityResults,
      braveResults, // Empty since disabled
      exaResults,
      allResults: allResults.slice(0, 10),
    };
  }

  /**
   * List available MCP servers
   */
  getAvailableServers(): string[] {
    return e2bMCPManager.getAvailableServers();
  }

  private extractDomain(url: string): string {
    try {
      const domain = new URL(url).hostname;
      return domain.replace('www.', '');
    } catch {
      return 'Unknown';
    }
  }
}

export default SearchMCPClient;

