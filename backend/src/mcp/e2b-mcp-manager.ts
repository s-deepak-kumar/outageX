import Sandbox from 'e2b';
// @ts-ignore - MCP SDK types may not be available
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
// @ts-ignore - MCP SDK types may not be available
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import logger from '../utils/logger';

/**
 * E2B MCP Manager
 * 
 * Manages MCP servers running in E2B sandbox via MCP Gateway
 * Uses MCP protocol to communicate with Docker Hub MCP servers
 */
export class E2BMCPManager {
  private sandbox: Sandbox | null = null;
  private mcpClient: Client | null = null;
  private isInitialized: boolean = false;
  private availableServers: Set<string> = new Set();
  private mcpUrl: string | null = null;
  private mcpToken: string | null = null;

  /**
   * Initialize E2B Sandbox with MCP servers from Docker Hub
   */
  async initialize(userId: string = 'demo-user'): Promise<void> {
    try {
      const apiKey = process.env.E2B_API_KEY;
      if (!apiKey) {
        logger.warn('E2B_API_KEY not found. MCP servers will use mock data.');
        return;
      }

      logger.info('Creating E2B sandbox with Docker Hub MCP servers...');

      // Build MCP configuration for Docker Hub servers
      const mcpConfig: Record<string, any> = {};

      // GitHub MCP Server (from Docker Hub) - Get token from database
      try {
        const { db } = await import('../db');
        const { integrations } = await import('../db/schema');
        const { eq, and } = await import('drizzle-orm');
        const { decrypt } = await import('../utils/encryption');

        const [githubIntegration] = await db
          .select()
          .from(integrations)
          .where(
            and(
              eq(integrations.userId, userId),
              eq(integrations.provider, 'github'),
              eq(integrations.enabled, true)
            )
          )
          .limit(1);

        if (githubIntegration) {
          const githubToken = decrypt(githubIntegration.accessToken);
          mcpConfig.githubOfficial = {
            githubPersonalAccessToken: githubToken,
          };
          this.availableServers.add('github');
          logger.info(`✅ GitHub MCP configured using token from database (user: ${userId})`);
        } else {
          logger.debug(`No GitHub integration found in database for user ${userId}. GitHub MCP will not be available.`);
        }
      } catch (error: any) {
        logger.warn(`Could not load GitHub token from database for MCP: ${error.message}`);
      }

      // Perplexity MCP Server (from E2B Docker Hub)
      // According to E2B docs: object name is "perplexityAsk", property is "perplexityApiKey"
      // See: https://e2b.dev/docs/mcp/perplexity
      if (process.env.PERPLEXITY_API_KEY) {
        const apiKey = process.env.PERPLEXITY_API_KEY.trim();
        if (apiKey && apiKey.length > 0) {
          mcpConfig.perplexityAsk = {
            perplexityApiKey: apiKey, // Correct property name per E2B docs
          };
          this.availableServers.add('perplexity'); // Keep 'perplexity' for our internal reference
          logger.info(`✅ Perplexity MCP server configured (object: perplexityAsk, API key length: ${apiKey.length})`);
        } else {
          logger.warn('⚠️ PERPLEXITY_API_KEY is set but empty');
        }
      } else {
        logger.warn('⚠️ PERPLEXITY_API_KEY not found in environment variables');
      }

      // Brave Search MCP Server (DISABLED per user request)
      // if (process.env.BRAVE_SEARCH_API_KEY) {
      //   mcpConfig['brave-search'] = {
      //     apiKey: process.env.BRAVE_SEARCH_API_KEY,
      //   };
      //   this.availableServers.add('brave-search');
      // }

      // Exa MCP Server (from Docker Hub)
      if (process.env.EXA_API_KEY) {
        mcpConfig.exa = {
          apiKey: process.env.EXA_API_KEY,
        };
        this.availableServers.add('exa');
      }

      // Create E2B sandbox with MCP servers configured
      logger.info(`Creating E2B sandbox with ${Object.keys(mcpConfig).length} MCP server(s):`, Object.keys(mcpConfig));
      
      try {
        this.sandbox = await Sandbox.create({
          apiKey,
          mcp: mcpConfig,
          timeoutMs: 600_000, // 10 minutes
        });

        logger.info('✅ E2B Sandbox created successfully');
      } catch (error: any) {
        logger.error('❌ Failed to create E2B sandbox:', {
          error: error.message,
          mcpConfig: Object.keys(mcpConfig),
          suggestion: 'Check if all MCP server configurations are valid',
        });
        throw error;
      }

      // Get MCP Gateway URL and token
      this.mcpUrl = this.sandbox.getMcpUrl();
      this.mcpToken = await this.sandbox.getMcpToken() || null;

      if (!this.mcpToken) {
        logger.warn('MCP token not available. MCP Gateway may not be accessible.');
        this.isInitialized = false;
        return;
      }

      logger.info(`MCP Gateway URL: ${this.mcpUrl}`);
      logger.info(`MCP servers configured in sandbox: ${Object.keys(mcpConfig).join(', ')}`);

      // Wait for MCP servers to initialize (longer wait for Perplexity)
      logger.info('Waiting for MCP servers to initialize...');
      await new Promise<void>((resolve) => setTimeout(resolve, 5000)); // Increased to 5 seconds

      // Create MCP client and connect to Gateway
      this.mcpClient = new Client({
        name: 'outagex-mcp-client',
        version: '1.0.0',
      });

      const transport = new StreamableHTTPClientTransport(
        new URL(this.mcpUrl),
        {
          requestInit: {
            headers: {
              'Authorization': `Bearer ${this.mcpToken}`,
            },
          },
        }
      );

      logger.info('Connecting to MCP Gateway...');
      await this.mcpClient.connect(transport);
      logger.info('✅ Connected to MCP Gateway successfully');

      this.isInitialized = true;

      if (this.availableServers.size > 0) {
        logger.info(`MCP servers configured: ${Array.from(this.availableServers).join(', ')}`);

        // List available tools for debugging
        try {
          const tools = await this.mcpClient.listTools();
          logger.info(`📋 Available MCP tools: ${tools.tools.length} total`);
          
          // Group tools by server
          const toolsByServer: Record<string, any[]> = {};
          tools.tools.forEach((tool: any) => {
            const toolName = tool.name.toLowerCase();
            let server = 'unknown';
            
            if (toolName.includes('perplexity')) {
              server = 'perplexity';
            } else if (toolName.includes('exa')) {
              server = 'exa';
            } else if (toolName.includes('github')) {
              server = 'github';
            }
            
            if (!toolsByServer[server]) {
              toolsByServer[server] = [];
            }
            toolsByServer[server].push(tool);
          });
          
          // Log tools grouped by server
          Object.entries(toolsByServer).forEach(([server, serverTools]) => {
            logger.info(`  ${server.toUpperCase()} tools (${serverTools.length}):`, 
              serverTools.map((t: any) => t.name).join(', ')
            );
          });
          
          // Log all tool names for debugging
          logger.debug(`🔧 All MCP tool names:`, tools.tools.map((t: any) => t.name).join(', '));
          
          // Check if Perplexity tools are present
          const perplexityTools = tools.tools.filter((t: any) => {
            const name = t.name.toLowerCase();
            return name.includes('perplexity') || 
                   name.includes('perplexity-ask') ||
                   name.includes('perplexity_ask') ||
                   name.startsWith('perplexity');
          });
          
          logger.info(`🔍 Perplexity tool detection:`, {
            configured: this.availableServers.has('perplexity'),
            found: perplexityTools.length,
            toolNames: perplexityTools.map((t: any) => t.name),
            allToolPrefixes: [...new Set(tools.tools.map((t: any) => t.name.split('-')[0] || t.name.split('_')[0]))],
          });
          
          if (this.availableServers.has('perplexity') && perplexityTools.length === 0) {
            logger.error(`❌ Perplexity server configured but NO tools found!`, {
              configuredServers: Array.from(this.availableServers),
              mcpConfigKeys: Object.keys(mcpConfig),
              totalTools: tools.tools.length,
              sampleToolNames: tools.tools.slice(0, 10).map((t: any) => t.name),
              allToolNames: tools.tools.map((t: any) => t.name),
              suggestion: 'Check if PERPLEXITY_API_KEY is valid and E2B sandbox supports perplexity-ask server',
            });
            
            // Try to find tools with similar patterns
            const similarTools = tools.tools.filter((t: any) => {
              const name = t.name.toLowerCase();
              return name.includes('ask') || name.includes('research') || name.includes('reason');
            });
            
            if (similarTools.length > 0) {
              logger.warn(`💡 Found similar tools (might be Perplexity?):`, similarTools.map((t: any) => t.name));
            }
          } else if (perplexityTools.length > 0) {
            logger.info(`✅ Perplexity tools found: ${perplexityTools.map((t: any) => t.name).join(', ')}`);
          }
        } catch (error: any) {
          logger.error('❌ Could not list MCP tools:', {
            error: error.message,
            stack: error.stack,
          });
        }
      } else {
        logger.warn('No MCP server API keys provided - system will use mock data');
      }

      logger.info('E2B MCP Manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize E2B MCP Manager:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Call a tool on an MCP server via MCP protocol
   */
  async callTool(serverName: string, toolName: string, args: any): Promise<any> {
    if (!this.isInitialized || !this.mcpClient) {
      logger.warn(`E2B MCP client not initialized. Cannot call tool on ${serverName}`);
      return null;
    }

    if (!this.availableServers.has(serverName)) {
      logger.warn(`MCP server ${serverName} not configured. Using mock data.`);
      return null;
    }

    try {
      logger.info(`Calling MCP tool ${toolName} on ${serverName} server...`);

      // Call tool via MCP protocol
      // @ts-ignore - MCP SDK types
      const result = await this.mcpClient.callTool({
        name: toolName,
        arguments: args,
      });

      // @ts-ignore - MCP SDK types
      if (result.isError) {
        // @ts-ignore - MCP SDK types
        logger.error(`MCP tool ${toolName} returned error:`, result.content);
        return null;
      }

      // Parse result content
      // @ts-ignore - MCP SDK types
      const content = result.content;
      if (Array.isArray(content) && content.length > 0) {
        const firstContent = content[0];
        // @ts-ignore - MCP SDK types
        if (firstContent.type === 'text') {
          try {
            // @ts-ignore - MCP SDK types
            const parsed = JSON.parse(firstContent.text);
            logger.info(`✅ MCP tool ${toolName} on ${serverName} executed successfully`);
            return parsed;
          } catch {
            // If not JSON, return as text
            logger.info(`✅ MCP tool ${toolName} on ${serverName} executed successfully`);
            // @ts-ignore - MCP SDK types
            return { text: firstContent.text };
          }
        }
      }

      logger.warn(`MCP tool ${toolName} returned unexpected format`);
      return null;
    } catch (error) {
      logger.error(`Error calling MCP tool ${toolName} on ${serverName}:`, error);
      return null;
    }
  }

  /**
   * List available tools for a server
   */
  async listTools(serverName?: string): Promise<any[]> {
    if (!this.mcpClient || !this.isInitialized) {
      return [];
    }

    try {
      const tools = await this.mcpClient.listTools();
      logger.debug(`All available MCP tools: ${tools.tools.map((t: any) => t.name).join(', ')}`);
      
      if (serverName) {
        // Filter by server name - tools might be prefixed with server name
        // e.g., "perplexity_research", "perplexity-ask/perplexity_research", "exa-web_search_exa", etc.
        const filtered = tools.tools.filter((tool: any) => {
          const toolName = tool.name.toLowerCase();
          const serverNameLower = serverName.toLowerCase();
          
          // Handle different naming patterns:
          // - perplexity -> perplexity_research, perplexity-ask/perplexity_research
          // - exa -> exa-web_search_exa
          // - perplexity-ask -> perplexity_research (server name with dash)
          const patterns = [
            serverNameLower,
            serverNameLower.replace('-', '_'),
            serverNameLower.replace('_', '-'),
            'perplexity-ask', // Legacy naming
            'perplexityask', // E2B object name (camelCase)
            'perplexity_ask', // Alternative naming
          ];
          
          return patterns.some(pattern => 
            toolName.startsWith(pattern) || 
            toolName.includes(pattern) ||
            toolName.includes(pattern.replace('-', '_'))
          );
        });
        
        logger.debug(`Filtered tools for ${serverName}: ${filtered.map((t: any) => t.name).join(', ')}`);
        return filtered;
      }
      return tools.tools;
    } catch (error) {
      logger.error('Error listing MCP tools:', error);
      return [];
    }
  }

  /**
   * Check if a server is available
   */
  isServerAvailable(serverName: string): boolean {
    return this.availableServers.has(serverName);
  }

  /**
   * Get all available servers
   */
  getAvailableServers(): string[] {
    return Array.from(this.availableServers);
  }

  /**
   * Cleanup and close connections
   */
  async cleanup(): Promise<void> {
    try {
      logger.info('Cleaning up E2B MCP Manager...');

      // Close MCP client connection
      if (this.mcpClient) {
        try {
          // MCP client doesn't have explicit close, but we can set to null
          this.mcpClient = null;
        } catch (error) {
          logger.warn('Error closing MCP client:', error);
        }
      }

      // Kill E2B sandbox
      if (this.sandbox) {
        logger.info('Closing E2B sandbox...');
        await this.sandbox.kill();
        this.sandbox = null;
        logger.info('E2B sandbox closed successfully');
      }

      this.availableServers.clear();
      this.isInitialized = false;
      this.mcpUrl = null;
      this.mcpToken = null;

      logger.info('E2B MCP Manager cleanup complete');
    } catch (error) {
      logger.error('Error during E2B MCP Manager cleanup:', error);
    }
  }
}

export default new E2BMCPManager();
