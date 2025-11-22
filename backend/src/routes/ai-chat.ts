import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import groqClient from '../groq/client';
import IntegrationManager from '../services/integration-manager';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/ai-chat
 * Chat with AI about a project's GitHub repository
 */
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || 'demo-user';
    const { projectId, githubOwner, githubRepo, question } = req.body;

    if (!projectId || !githubOwner || !githubRepo || !question) {
      return res.status(400).json({
        error: 'Missing required fields: projectId, githubOwner, githubRepo, question',
      });
    }

    logger.info(`AI Chat request for project ${projectId}:`, {
      githubOwner,
      githubRepo,
      questionLength: question.length,
    });

    // Get GitHub integration
    const integrationManager = new IntegrationManager(userId);
    const github = await integrationManager.getGitHubIntegration();

    if (!github) {
      return res.status(400).json({
        error: 'GitHub integration not configured',
        message: 'Please connect your GitHub account at /integrations',
      });
    }

    // Step 1: Get directory hierarchy first
    let directoryTree = '';
    let readmeContent = '';
    let filesToRead: string[] = [];

    try {
      logger.info(`📂 Step 1: Getting directory hierarchy for ${githubOwner}/${githubRepo}...`);

      // Get root directory structure
      const rootContents = await github.getDirectoryContents('.', 'main', githubOwner, githubRepo);
      const rootFiles = Array.isArray(rootContents) ? rootContents : [rootContents];
      
      // Build directory tree (only structure, not content)
      const buildTree = async (path: string, prefix: string = '', maxDepth: number = 2, currentDepth: number = 0): Promise<string> => {
        if (currentDepth >= maxDepth) return '';
        
        try {
          const contents = await github.getDirectoryContents(path, 'main', githubOwner, githubRepo);
          const items = Array.isArray(contents) ? contents : [contents];
          
          let tree = '';
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const isLast = i === items.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            tree += `${prefix}${connector}${item.name}${item.type === 'dir' ? '/' : ''}\n`;
            
            if (item.type === 'dir' && currentDepth < maxDepth - 1) {
              const nextPrefix = prefix + (isLast ? '    ' : '│   ');
              tree += await buildTree(item.path, nextPrefix, maxDepth, currentDepth + 1);
            }
          }
          return tree;
        } catch (error: any) {
          logger.debug(`Could not list ${path}:`, error.message);
          return '';
        }
      };

      directoryTree = await buildTree('.', '', 2, 0);
      logger.info(`✅ Directory tree built (${directoryTree.split('\n').length} lines)`);

      // Step 2: Read README if exists (for context, not full content)
      const readmeFile = rootFiles.find((f: any) => 
        f.type === 'file' && 
        (f.name.toLowerCase() === 'readme.md' || f.name.toLowerCase() === 'readme.txt')
      );
      
      if (readmeFile) {
        try {
          const readmeData = await github.getFileContent(readmeFile.path, 'main', githubOwner, githubRepo);
          // Only get first 2000 chars for context, not full file
          readmeContent = readmeData.content.substring(0, 2000);
          logger.info(`✅ Read README (${readmeData.content.length} chars, using first 2000 for context)`);
        } catch (error: any) {
          logger.warn('Could not read README:', error.message);
        }
      }

      // Step 3: Parse user's question to determine which files to read
      const questionLower = question.toLowerCase();
      
      // Extract file paths mentioned in question
      const filePathPatterns = [
        /(?:file|code|in|from)\s+['"`]?([a-zA-Z0-9\/\-_\.]+\.(?:ts|tsx|js|jsx|py|go|rb|php|java|c|cpp|cs|html|css|json|yaml|xml|md))['"`]?/gi,
        /([a-zA-Z0-9\/\-_\.]+\.(?:ts|tsx|js|jsx|py|go|rb|php|java|c|cpp|cs|html|css|json|yaml|xml|md))/gi,
      ];
      
      const mentionedFiles = new Set<string>();
      for (const pattern of filePathPatterns) {
        const matches = question.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            mentionedFiles.add(match[1]);
          }
        }
      }

      // Also check for common file names mentioned
      const commonFileNames = ['page.tsx', 'layout.tsx', 'index.ts', 'index.tsx', 'app.tsx', 'main.ts', 'component.tsx'];
      for (const fileName of commonFileNames) {
        if (questionLower.includes(fileName.toLowerCase())) {
          mentionedFiles.add(fileName);
        }
      }

      logger.info(`🔍 Files mentioned in question: ${Array.from(mentionedFiles).join(', ') || 'none'}`);

      // Step 4: Find and read only relevant files
      const findAndReadFile = async (fileName: string, searchPath: string = '.'): Promise<string | null> => {
        try {
          const contents = await github.getDirectoryContents(searchPath, 'main', githubOwner, githubRepo);
          const items = Array.isArray(contents) ? contents : [contents];
          
          // Check if file exists in current directory
          const exactMatch = items.find((f: any) => 
            f.type === 'file' && (f.name === fileName || f.path === fileName || f.path.endsWith(fileName))
          );
          
          if (exactMatch) {
            try {
              const fileData = await github.getFileContent(exactMatch.path, 'main', githubOwner, githubRepo);
              return fileData.content;
            } catch (error: any) {
              logger.warn(`Could not read file ${exactMatch.path}:`, error.message);
              return null;
            }
          }
          
          // Recursively search in subdirectories (limited depth)
          for (const item of items) {
            if (item.type === 'dir' && searchPath === '.') {
              const found = await findAndReadFile(fileName, item.path);
              if (found) return found;
            }
          }
        } catch (error: any) {
          logger.debug(`Could not search in ${searchPath}:`, error.message);
        }
        return null;
      };

      // Read mentioned files
      for (const fileName of mentionedFiles) {
        if (filesToRead.length >= 5) break; // Limit to 5 files
        
        logger.info(`📖 Searching for file: ${fileName}`);
        const content = await findAndReadFile(fileName);
        if (content) {
          filesToRead.push(`\n\nFile: ${fileName}\n\`\`\`\n${content.substring(0, 5000)}\n\`\`\``);
          logger.info(`✅ Found and read: ${fileName} (${content.length} chars)`);
        }
      }

      // If no files mentioned, get main entry point and package.json for context
      if (filesToRead.length === 0) {
        logger.info(`📖 No specific files mentioned, getting main entry point...`);
        
        // Get package.json for project info
        const packageJsonFile = rootFiles.find((f: any) => f.name === 'package.json');
        if (packageJsonFile) {
          try {
            const packageData = await github.getFileContent('package.json', 'main', githubOwner, githubRepo);
            filesToRead.push(`\n\npackage.json:\n\`\`\`json\n${packageData.content.substring(0, 2000)}\n\`\`\``);
            logger.info(`✅ Read package.json`);
          } catch (error: any) {
            logger.debug('Could not read package.json:', error.message);
          }
        }

        // Get main entry point
        const entryPoint = await github.findMainEntryPoint('main', githubOwner, githubRepo);
        if (entryPoint) {
          try {
            const fileData = await github.getFileContent(entryPoint, 'main', githubOwner, githubRepo);
            filesToRead.push(`\n\nMain Entry Point (${entryPoint}):\n\`\`\`\n${fileData.content.substring(0, 5000)}\n\`\`\``);
            logger.info(`✅ Read main entry point: ${entryPoint}`);
          } catch (error: any) {
            logger.warn('Could not read main entry point:', error.message);
          }
        }
      }

      logger.info(`📊 Context prepared:`, {
        directoryTreeLines: directoryTree.split('\n').length,
        hasReadme: !!readmeContent,
        filesRead: filesToRead.length,
      });

    } catch (error: any) {
      logger.error('Error fetching repository info:', error);
      // Continue anyway - we'll use what we have
    }

    // Build context for Groq (hierarchy first, then README, then specific files)
    const context = `
Repository: ${githubOwner}/${githubRepo}

Directory Structure:
${directoryTree || 'Could not fetch directory structure'}

${readmeContent ? `README (for context):\n\`\`\`\n${readmeContent}\n\`\`\`` : ''}

${filesToRead.length > 0 ? `Relevant Files:\n${filesToRead.join('\n')}` : 'No specific files requested or found.'}
`.trim();

    logger.info(`📝 Context built for AI (${context.length} characters)`);

    // Generate response using Groq
    const response = await groqClient.generateChatResponse(
      question,
      context
    );

    logger.info(`AI Chat response generated for project ${projectId}`);

    return res.json({
      success: true,
      response,
      projectId,
      githubOwner,
      githubRepo,
    });
  } catch (error: any) {
    logger.error('Error in AI chat:', error);
    return res.status(500).json({
      error: 'Failed to generate AI response',
      message: error.message || 'Internal server error',
    });
  }
});

export default router;

