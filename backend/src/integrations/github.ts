import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';

/**
 * GitHub Integration
 * 
 * Provides direct access to GitHub API for repository operations
 */
export class GitHubIntegration {
  private client: AxiosInstance;
  private token: string;
  private owner?: string;
  private repo?: string;

  constructor(token: string, owner?: string, repo?: string) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;

    this.client = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'OutageX',
      },
    });
  }

  /**
   * Get authenticated user
   */
  async getUser() {
    try {
      const response = await this.client.get('/user');
      return response.data;
    } catch (error) {
      logger.error('Error fetching GitHub user:', error);
      throw error;
    }
  }

  /**
   * Get repositories
   */
  async getRepositories(options: {
    type?: 'all' | 'owner' | 'member';
    sort?: 'created' | 'updated' | 'pushed' | 'full_name';
    direction?: 'asc' | 'desc';
    per_page?: number;
  } = {}) {
    try {
      const response = await this.client.get('/user/repos', {
        params: {
          type: options.type || 'all',
          sort: options.sort || 'updated',
          direction: options.direction || 'desc',
          per_page: options.per_page || 30,
        },
      });
      return response.data;
    } catch (error) {
      logger.error('Error fetching repositories:', error);
      throw error;
    }
  }

  /**
   * Get repository
   */
  async getRepository(owner?: string, repo?: string) {
    const repoOwner = owner || this.owner;
    const repoName = repo || this.repo;

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name are required');
    }

    try {
      const response = await this.client.get(`/repos/${repoOwner}/${repoName}`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching repository:', error);
      throw error;
    }
  }

  /**
   * Get recent commits
   */
  async getCommits(owner?: string, repo?: string, options: {
    since?: string;
    until?: string;
    per_page?: number;
    page?: number;
  } = {}) {
    const repoOwner = owner || this.owner;
    const repoName = repo || this.repo;

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name are required');
    }

    try {
      const response = await this.client.get(`/repos/${repoOwner}/${repoName}/commits`, {
        params: {
          since: options.since,
          until: options.until,
          per_page: options.per_page || 10,
          page: options.page || 1,
        },
      });
      return response.data;
    } catch (error) {
      logger.error('Error fetching commits:', error);
      throw error;
    }
  }

  /**
   * Get commit details
   */
  async getCommit(sha: string, owner?: string, repo?: string) {
    const repoOwner = owner || this.owner;
    const repoName = repo || this.repo;

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name are required');
    }

    try {
      const response = await this.client.get(`/repos/${repoOwner}/${repoName}/commits/${sha}`);
      return response.data;
    } catch (error) {
      logger.error('Error fetching commit:', error);
      throw error;
    }
  }

  /**
   * Get commit diff
   */
  async getCommitDiff(sha: string, owner?: string, repo?: string): Promise<string> {
    const repoOwner = owner || this.owner;
    const repoName = repo || this.repo;

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name are required');
    }

    try {
      const response = await this.client.get(`/repos/${repoOwner}/${repoName}/commits/${sha}`, {
        headers: {
          Accept: 'application/vnd.github.v3.diff',
        },
        responseType: 'text',
      });
      return response.data;
    } catch (error) {
      logger.error('Error fetching commit diff:', error);
      throw error;
    }
  }

  /**
   * Create branch from base branch
   */
  async createBranch(newBranch: string, fromBranch: string = 'main', owner?: string, repo?: string) {
    const repoOwner = owner || this.owner;
    const repoName = repo || this.repo;

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name are required');
    }

    try {
      // Get the SHA of the base branch
      const refResponse = await this.client.get(
        `/repos/${repoOwner}/${repoName}/git/refs/heads/${fromBranch}`
      );
      
      const baseSha = refResponse.data.object.sha;

      // Create new branch
      const response = await this.client.post(
        `/repos/${repoOwner}/${repoName}/git/refs`,
        {
          ref: `refs/heads/${newBranch}`,
          sha: baseSha,
        }
      );

      logger.info(`Branch created: ${newBranch} from ${fromBranch}`);
      return response.data;
    } catch (error: any) {
      // Branch might already exist
      if (error.response?.status === 422) {
        logger.warn(`Branch ${newBranch} already exists`);
        return { exists: true };
      }
      logger.error('Error creating branch:', error);
      throw error;
    }
  }

  /**
   * Create or update file in repository
   */
  async createOrUpdateFile(
    path: string,
    content: string,
    message: string,
    branch: string,
    owner?: string,
    repo?: string
  ) {
    const repoOwner = owner || this.owner;
    const repoName = repo || this.repo;

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name are required');
    }

    try {
      // Check if file exists to get its SHA
      let sha: string | undefined;
      try {
        const existingFile = await this.client.get(
          `/repos/${repoOwner}/${repoName}/contents/${path}`,
          { params: { ref: branch } }
        );
        sha = existingFile.data.sha;
      } catch (error: any) {
        // File doesn't exist, that's ok
        if (error.response?.status !== 404) {
          throw error;
        }
      }

      // Create or update file
      const response = await this.client.put(
        `/repos/${repoOwner}/${repoName}/contents/${path}`,
        {
          message,
          content: Buffer.from(content).toString('base64'),
          branch,
          ...(sha && { sha }), // Include SHA if updating existing file
        }
      );

      logger.info(`File ${path} ${sha ? 'updated' : 'created'} on branch ${branch}`);
      return response.data;
    } catch (error) {
      logger.error('Error creating/updating file:', error);
      throw error;
    }
  }

  /**
   * Get file content from repository
   */
  async getFileContent(path: string, branch: string = 'main', owner?: string, repo?: string) {
    const repoOwner = owner || this.owner;
    const repoName = repo || this.repo;

    logger.info(`📂 getFileContent called:`, {
      path,
      branch,
      owner: repoOwner,
      repo: repoName,
      usingDefaultOwner: !owner,
      usingDefaultRepo: !repo,
    });

    if (!repoOwner || !repoName) {
      logger.error('❌ Repository owner and name are required', {
        repoOwner,
        repoName,
        providedOwner: owner,
        providedRepo: repo,
        defaultOwner: this.owner,
        defaultRepo: this.repo,
      });
      throw new Error('Repository owner and name are required');
    }

    try {
      const apiUrl = `/repos/${repoOwner}/${repoName}/contents/${path}`;
      logger.info(`🌐 Fetching file from GitHub API: ${apiUrl}`, {
        branch,
        fullUrl: `https://api.github.com${apiUrl}?ref=${branch}`,
      });

      const response = await this.client.get(apiUrl, { 
        params: { ref: branch },
        validateStatus: (status) => {
          logger.debug(`GitHub API response status: ${status}`);
          return status < 500; // Don't throw on 4xx, let us handle it
        },
      });

      if (response.status === 404) {
        // Don't log as error for 404s - it's expected when searching for files
        logger.debug(`File not found (404): ${path}`, {
          branch,
          owner: repoOwner,
          repo: repoName,
        });
        
        // Create error with 404 status preserved (but don't log parent directory listing to reduce noise)
        const notFoundError: any = new Error(`File not found: ${path} in ${repoOwner}/${repoName} (branch: ${branch})`);
        notFoundError.status = 404;
        notFoundError.response = { status: 404, statusText: 'Not Found' };
        notFoundError.is404 = true;
        throw notFoundError;
      }

      if (response.status !== 200) {
        logger.error(`❌ Unexpected status code: ${response.status}`, {
          status: response.status,
          statusText: response.statusText,
          data: response.data,
        });
        throw new Error(`GitHub API returned status ${response.status}: ${response.statusText}`);
      }

      // Decode base64 content
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      
      logger.info(`✅ Successfully read file:`, {
        path: response.data.path,
        size: content.length,
        sha: response.data.sha,
        encoding: response.data.encoding,
      });
      
      return {
        content,
        sha: response.data.sha,
        path: response.data.path,
      };
    } catch (error: any) {
      // Preserve status code in error for proper handling upstream
      const status = error.response?.status || error.status;
      const errorWithStatus = new Error(error.message || 'Failed to get file content');
      (errorWithStatus as any).status = status;
      (errorWithStatus as any).response = error.response;
      (errorWithStatus as any).is404 = status === 404;
      
      // Only log as error if it's not a 404 (404s are expected when searching)
      if (status === 404) {
        logger.debug(`File not found: ${path}`);
      } else {
        logger.error('❌ Error getting file content:', {
          path,
          branch,
          owner: repoOwner,
          repo: repoName,
          error: error.message,
          status: status,
          statusText: error.response?.statusText,
        });
      }
      throw errorWithStatus;
    }
  }

  /**
   * Get directory contents from repository
   */
  async getDirectoryContents(path: string, branch: string = 'main', owner?: string, repo?: string) {
    const repoOwner = owner || this.owner;
    const repoName = repo || this.repo;

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name are required');
    }

    try {
      logger.info(`📁 Getting directory contents: ${path}`, {
        branch,
        owner: repoOwner,
        repo: repoName,
      });

      const response = await this.client.get(
        `/repos/${repoOwner}/${repoName}/contents/${path}`,
        { params: { ref: branch } }
      );

      // GitHub API returns array for directories, single object for files
      if (Array.isArray(response.data)) {
        return response.data.map((item: any) => ({
          name: item.name,
          path: item.path,
          type: item.type, // 'file' or 'dir'
          size: item.size,
          sha: item.sha,
          url: item.html_url,
        }));
      } else {
        // Single file, return as array with one item
        return [{
          name: response.data.name,
          path: response.data.path,
          type: response.data.type,
          size: response.data.size,
          sha: response.data.sha,
          url: response.data.html_url,
        }];
      }
    } catch (error: any) {
      logger.error('Error getting directory contents:', {
        path,
        branch,
        owner: repoOwner,
        repo: repoName,
        error: error.message,
        status: error.response?.status,
      });
      throw error;
    }
  }

  /**
   * Create webhook for repository
   */
  async createWebhook(owner: string, repo: string, config: {
    url: string;
    events: string[];
    secret?: string;
  }): Promise<any> {
    try {
      const payload: any = {
        name: 'web',
        active: true,
        events: config.events,
        config: {
          url: config.url,
          content_type: 'json',
          insecure_ssl: '0',
        },
      };

      // Only add secret if provided and URL is not localhost
      if (config.secret && !config.url.includes('localhost') && !config.url.includes('127.0.0.1')) {
        payload.config.secret = config.secret;
      }

      // Check if URL is localhost (GitHub won't accept it)
      const isLocalhost = config.url.includes('localhost') || config.url.includes('127.0.0.1');
      if (isLocalhost) {
        throw new Error('GitHub webhooks require a publicly accessible URL. localhost is not supported.');
      }

      logger.info(`Creating GitHub webhook for ${owner}/${repo}:`, {
        url: config.url,
        events: config.events,
        hasSecret: !!payload.config.secret,
      });

      const response = await this.client.post(
        `/repos/${owner}/${repo}/hooks`,
        payload
      );

      logger.info(`GitHub webhook created for ${owner}/${repo}: ${response.data.id}`);
      return response.data;
    } catch (error: any) {
      const errorDetails = error.response?.data || error.message;
      logger.error('Error creating GitHub webhook:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: errorDetails,
        config: {
          url: config.url,
          events: config.events,
          owner,
          repo,
        },
      });
      throw error;
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(owner: string, repo: string, webhookId: number): Promise<void> {
    try {
      await this.client.delete(`/repos/${owner}/${repo}/hooks/${webhookId}`);
      logger.info(`GitHub webhook deleted: ${webhookId}`);
    } catch (error: any) {
      logger.error('Error deleting GitHub webhook:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create pull request
   */
  async createPullRequest(
    title: string,
    head: string,
    base: string,
    body: string,
    owner?: string,
    repo?: string
  ) {
    const repoOwner = owner || this.owner;
    const repoName = repo || this.repo;

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name are required');
    }

    try {
      const response = await this.client.post(`/repos/${repoOwner}/${repoName}/pulls`, {
        title,
        head,
        base,
        body,
      });
      
      logger.info(`Pull request created: ${response.data.html_url}`);
      return response.data;
    } catch (error) {
      logger.error('Error creating pull request:', error);
      throw error;
    }
  }

  /**
   * Get pull requests
   */
  async getPullRequests(owner?: string, repo?: string, options: {
    state?: 'open' | 'closed' | 'all';
    sort?: 'created' | 'updated' | 'popularity' | 'long-running';
    direction?: 'asc' | 'desc';
    per_page?: number;
  } = {}) {
    const repoOwner = owner || this.owner;
    const repoName = repo || this.repo;

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name are required');
    }

    try {
      const response = await this.client.get(`/repos/${repoOwner}/${repoName}/pulls`, {
        params: {
          state: options.state || 'open',
          sort: options.sort || 'created',
          direction: options.direction || 'desc',
          per_page: options.per_page || 30,
        },
      });
      return response.data;
    } catch (error) {
      logger.error('Error fetching pull requests:', error);
      throw error;
    }
  }

  /**
   * Merge pull request
   */
  async mergePullRequest(
    prNumber: number,
    owner?: string,
    repo?: string,
    options: {
      mergeMethod?: 'merge' | 'squash' | 'rebase';
      commitTitle?: string;
      commitMessage?: string;
    } = {}
  ) {
    const repoOwner = owner || this.owner;
    const repoName = repo || this.repo;

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name are required');
    }

    try {
      const response = await this.client.put(
        `/repos/${repoOwner}/${repoName}/pulls/${prNumber}/merge`,
        {
          merge_method: options.mergeMethod || 'merge',
          commit_title: options.commitTitle,
          commit_message: options.commitMessage,
        }
      );

      logger.info(`Pull request #${prNumber} merged successfully`);
      return response.data;
    } catch (error: any) {
      logger.error('Error merging pull request:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get repository health/status
   */
  async getRepositoryHealth(owner?: string, repo?: string) {
    const repoOwner = owner || this.owner;
    const repoName = repo || this.repo;

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name are required');
    }

    try {
      // Get repository details
      const repo = await this.getRepository(repoOwner, repoName);
      
      // Get recent commits
      const commits = await this.getCommits(repoOwner, repoName, { per_page: 5 });
      
      // Get open issues
      const issues = await this.client.get(`/repos/${repoOwner}/${repoName}/issues`, {
        params: { state: 'open', per_page: 100 },
      });
      
      // Get open pull requests
      const prs = await this.getPullRequests(repoOwner, repoName, { state: 'open' });

      return {
        repository: {
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
          default_branch: repo.default_branch,
          updated_at: repo.updated_at,
          pushed_at: repo.pushed_at,
        },
        health: {
          open_issues: issues.data.length,
          open_prs: prs.length,
          recent_commits: commits.length,
          last_commit: commits[0]?.commit.committer.date,
          is_active: new Date(repo.pushed_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Active in last 7 days
        },
        stats: {
          stars: repo.stargazers_count,
          watchers: repo.watchers_count,
          forks: repo.forks_count,
          size: repo.size,
        },
      };
    } catch (error) {
      logger.error('Error fetching repository health:', error);
      throw error;
    }
  }

  /**
   * Search for files in repository by name pattern
   * Uses GitHub's search API to find files matching the pattern
   */
  async searchFiles(
    fileName: string,
    branch: string = 'main',
    owner?: string,
    repo?: string
  ): Promise<Array<{ path: string; name: string; type: string }>> {
    const repoOwner = owner || this.owner;
    const repoName = repo || this.repo;

    if (!repoOwner || !repoName) {
      throw new Error('Repository owner and name are required');
    }

    try {
      // Use GitHub's code search API
      // Format: filename:extension repo:owner/repo
      const searchQuery = `filename:${fileName} repo:${repoOwner}/${repoName}`;
      
      logger.info(`🔍 Searching GitHub for files matching: ${fileName}`, {
        query: searchQuery,
        owner: repoOwner,
        repo: repoName,
      });

      const response = await this.client.get('/search/code', {
        params: {
          q: searchQuery,
        },
      });

      if (response.data.items && response.data.items.length > 0) {
        const files = response.data.items.map((item: any) => ({
          path: item.path,
          name: item.name,
          type: 'file',
        }));
        
        logger.info(`✅ Found ${files.length} file(s) matching "${fileName}":`, files.map((f: any) => f.path));
        return files;
      }

      logger.warn(`No files found matching "${fileName}" in ${repoOwner}/${repoName}`);
      // Fallback: try to list root directory and search recursively
      return await this.findFileInDirectory(fileName, '.', branch, repoOwner, repoName);
    } catch (error: any) {
      logger.warn(`Error searching for files: ${error.message}`);
      // Fallback: try to list root directory and search recursively
      return await this.findFileInDirectory(fileName, '.', branch, repoOwner, repoName);
    }
  }

  /**
   * Recursively search for a file in a directory
   */
  private async findFileInDirectory(
    fileName: string,
    directory: string,
    branch: string,
    owner: string,
    repo: string,
    maxDepth: number = 3,
    currentDepth: number = 0
  ): Promise<Array<{ path: string; name: string; type: string }>> {
    if (currentDepth >= maxDepth) {
      return [];
    }

    try {
      const contents = await this.getDirectoryContents(directory, branch, owner, repo);
      const results: Array<{ path: string; name: string; type: string }> = [];

      for (const item of Array.isArray(contents) ? contents : [contents]) {
        if (item.type === 'file') {
          // Check if filename matches (case-insensitive, partial match)
          if (item.name.toLowerCase().includes(fileName.toLowerCase()) ||
              fileName.toLowerCase().includes(item.name.toLowerCase())) {
            results.push({
              path: item.path,
              name: item.name,
              type: 'file',
            });
          }
        } else if (item.type === 'dir' && currentDepth < maxDepth) {
          // Recursively search subdirectories
          const subResults = await this.findFileInDirectory(
            fileName,
            item.path,
            branch,
            owner,
            repo,
            maxDepth,
            currentDepth + 1
          );
          results.push(...subResults);
        }
      }

      return results;
    } catch (error: any) {
      logger.debug(`Could not search directory ${directory}: ${error.message}`);
      return [];
    }
  }

  /**
   * Find the main entry point file in a repository
   * Optimized to check Next.js app directory first, then other common patterns
   */
  async findMainEntryPoint(
    branch: string = 'main',
    owner?: string,
    repo?: string
  ): Promise<string | null> {
    const repoOwner = owner || this.owner;
    const repoName = repo || this.repo;

    if (!repoOwner || !repoName) {
      return null;
    }

    logger.info(`🔍 Searching for main entry point in ${repoOwner}/${repoName}...`);

    // First, check for Next.js app directory (most common for modern Next.js apps)
    try {
      const rootContents = await this.getDirectoryContents('.', branch, repoOwner, repoName);
      const rootFiles = Array.isArray(rootContents) ? rootContents : [rootContents];
      
      // Check for app directory (Next.js 13+)
      const appDir = rootFiles.find((f: any) => f.type === 'dir' && f.name === 'app');
      if (appDir) {
        try {
          const appContents = await this.getDirectoryContents('app', branch, repoOwner, repoName);
          const appFiles = Array.isArray(appContents) ? appContents : [appContents];
          
          // Priority: page.tsx > layout.tsx > any other .tsx/.ts file
          const pageFile = appFiles.find((f: any) => 
            f.type === 'file' && f.name === 'page.tsx'
          );
          if (pageFile) {
            logger.info(`✅ Found Next.js entry point: ${pageFile.path}`);
            return pageFile.path;
          }
          
          const layoutFile = appFiles.find((f: any) => 
            f.type === 'file' && f.name === 'layout.tsx'
          );
          if (layoutFile) {
            logger.info(`✅ Found Next.js layout: ${layoutFile.path}`);
            return layoutFile.path;
          }
          
          // Any other .tsx/.ts file in app directory
          const anyAppFile = appFiles.find((f: any) => 
            f.type === 'file' && 
            (f.name.endsWith('.tsx') || f.name.endsWith('.ts'))
          );
          if (anyAppFile) {
            logger.info(`✅ Found app file: ${anyAppFile.path}`);
            return anyAppFile.path;
          }
        } catch (error: any) {
          logger.debug(`Could not list app directory: ${error.message}`);
        }
      }

      // Check for pages directory (Next.js 12 and earlier)
      const pagesDir = rootFiles.find((f: any) => f.type === 'dir' && f.name === 'pages');
      if (pagesDir) {
        try {
          const pagesContents = await this.getDirectoryContents('pages', branch, repoOwner, repoName);
          const pagesFiles = Array.isArray(pagesContents) ? pagesContents : [pagesContents];
          
          const indexFile = pagesFiles.find((f: any) => 
            f.type === 'file' && (f.name === 'index.tsx' || f.name === 'index.ts' || f.name === 'index.jsx' || f.name === 'index.js')
          );
          if (indexFile) {
            logger.info(`✅ Found Next.js pages entry point: ${indexFile.path}`);
            return indexFile.path;
          }
        } catch (error: any) {
          logger.debug(`Could not list pages directory: ${error.message}`);
        }
      }

      // Check for src directory
      const srcDir = rootFiles.find((f: any) => f.type === 'dir' && f.name === 'src');
      if (srcDir) {
        // Check src/app (Next.js with src directory)
        try {
          const srcAppContents = await this.getDirectoryContents('src/app', branch, repoOwner, repoName);
          const srcAppFiles = Array.isArray(srcAppContents) ? srcAppContents : [srcAppContents];
          const srcPageFile = srcAppFiles.find((f: any) => 
            f.type === 'file' && f.name === 'page.tsx'
          );
          if (srcPageFile) {
            logger.info(`✅ Found Next.js entry point: ${srcPageFile.path}`);
            return srcPageFile.path;
          }
        } catch (error: any) {
          // src/app doesn't exist, try src root
        }

        // Check src root for index files
        try {
          const srcContents = await this.getDirectoryContents('src', branch, repoOwner, repoName);
          const srcFiles = Array.isArray(srcContents) ? srcContents : [srcContents];
          const srcIndexFile = srcFiles.find((f: any) => 
            f.type === 'file' && 
            (f.name === 'index.tsx' || f.name === 'index.ts' || f.name === 'index.jsx' || f.name === 'index.js' ||
             f.name === 'main.tsx' || f.name === 'main.ts' || f.name === 'main.jsx' || f.name === 'main.js' ||
             f.name === 'app.tsx' || f.name === 'app.ts')
          );
          if (srcIndexFile) {
            logger.info(`✅ Found src entry point: ${srcIndexFile.path}`);
            return srcIndexFile.path;
          }
        } catch (error: any) {
          logger.debug(`Could not list src directory: ${error.message}`);
        }
      }

      // Check root for common entry points (excluding config files)
      const configFileNames = ['next.config', 'tailwind.config', 'tsconfig', 'package.json', 'README'];
      const rootCodeFiles = rootFiles.filter((f: any) => 
        f.type === 'file' && 
        (f.name.endsWith('.ts') || f.name.endsWith('.tsx') || 
         f.name.endsWith('.js') || f.name.endsWith('.jsx')) &&
        !configFileNames.some(configName => f.name.startsWith(configName))
      );

      // Priority order for root files
      const priorityNames = ['index', 'main', 'app'];
      for (const priorityName of priorityNames) {
        const priorityFile = rootCodeFiles.find((f: any) => 
          f.name.startsWith(priorityName) && 
          (f.name.endsWith('.tsx') || f.name.endsWith('.ts') || f.name.endsWith('.jsx') || f.name.endsWith('.js'))
        );
        if (priorityFile) {
          logger.info(`✅ Found root entry point: ${priorityFile.path}`);
          return priorityFile.path;
        }
      }

      // Last resort: any code file in root (excluding config files)
      if (rootCodeFiles.length > 0) {
        logger.info(`✅ Found potential entry point: ${rootCodeFiles[0].path}`);
        return rootCodeFiles[0].path;
      }
    } catch (error: any) {
      logger.warn(`Could not list root directory: ${error.message}`);
    }

    logger.warn(`⚠️ Could not find main entry point in ${repoOwner}/${repoName}`);
    return null;
  }
}

export default GitHubIntegration;

