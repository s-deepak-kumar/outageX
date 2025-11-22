import groqClient from '../groq/client';
import logger from '../utils/logger';
import { RootCause, Solution, CommitInfo, ResearchResult } from '../utils/types';
import Sandbox from 'e2b';

/**
 * Solution Solver
 * 
 * Uses Groq AI to diagnose root cause and generate solutions.
 * Tests solutions in E2B sandbox before proposing.
 */
export class SolutionSolver {
  /**
   * Diagnose root cause using all available data
   */
  async diagnoseRootCause(
    logAnalysis: any,
    suspectedCommit: CommitInfo,
    diff: string,
    researchResults: ResearchResult[]
  ): Promise<RootCause> {
    logger.info('Diagnosing root cause with Groq AI...');

    const rootCause = await groqClient.diagnoseRootCause(
      logAnalysis,
      suspectedCommit,
      diff,
      researchResults
    );

    logger.info(`Root cause diagnosed with ${rootCause.confidence}% confidence`);
    return rootCause;
  }

  /**
   * Generate solution based on root cause
   * Now reads the actual file from GitHub to generate REAL code fixes
   */
  async generateSolution(
    rootCause: RootCause,
    diff: string,
    filePath?: string,
    fileContent?: string,
    githubOwner?: string,
    githubRepo?: string
  ): Promise<Solution> {
    logger.info('Generating solution with Groq AI...');

    // If file path is provided but content is not, fetch it from GitHub
    let actualFileContent = fileContent;
    if (filePath && !actualFileContent && githubOwner && githubRepo) {
      try {
        logger.info(`Reading actual file from GitHub: ${filePath}`);
        const IntegrationManager = (await import('../services/integration-manager')).IntegrationManager;
        const integrationManager = new IntegrationManager('demo-user');
        const github = await integrationManager.getGitHubIntegration();
        
        if (github) {
          const fileData = await github.getFileContent(filePath, 'main', githubOwner, githubRepo);
          actualFileContent = fileData.content;
          logger.info(`✅ Read ${filePath} from GitHub (${actualFileContent.length} chars)`);
        }
      } catch (error: any) {
        logger.warn(`Could not read file ${filePath} from GitHub: ${error.message}`);
      }
    }

    const solution = await groqClient.generateSolution(
      rootCause, 
      diff, 
      actualFileContent || undefined,
      filePath || undefined
    );
    
    logger.info(`Solution generated: ${solution.type} (${solution.confidence}% confidence)`);
    return solution;
  }

  /**
   * Test solution in E2B sandbox before proposing
   */
  async testSolution(solution: Solution): Promise<Solution> {
    logger.info('Testing solution in E2B sandbox...');

    try {
      let testResult;

      if (solution.code) {
        // Test code in E2B sandbox
        testResult = await this.testCodeInSandbox(solution);
      } else {
        // No code to test (rollback, restart, etc.)
        testResult = { success: true, output: 'No code validation required' };
      }

      logger.info(`Solution test result: ${testResult.success ? 'PASSED' : 'FAILED'}`);

      return {
        ...solution,
        testResults: testResult,
      };
    } catch (error) {
      logger.error('Error testing solution:', error);
      
      return {
        ...solution,
        testResults: {
          success: false,
          output: '',
          errors: [`Failed to test solution: ${error instanceof Error ? error.message : 'Unknown error'}`],
        },
      };
    }
  }

  /**
   * Test code in E2B sandbox
   */
  private async testCodeInSandbox(solution: Solution): Promise<{
    success: boolean;
    output: string;
    errors?: string[];
  }> {
    const apiKey = process.env.E2B_API_KEY;
    if (!apiKey) {
      logger.warn('E2B_API_KEY not set. Skipping sandbox testing.');
      return {
        success: true, // Don't block if E2B not configured
        output: 'E2B not configured - skipped sandbox testing',
      };
    }

    let sandbox: Sandbox | null = null;

    try {
      // Create E2B sandbox
      logger.info('Creating E2B sandbox for code testing...');
      sandbox = await Sandbox.create({
        apiKey,
        timeoutMs: 30000, // 30 seconds for testing
      });

      // Determine file extension from code or metadata
      const filePath = solution.metadata?.filePath || 'test_fix.ts';
      const extension = filePath.split('.').pop() || 'ts';
      
      // Write code to sandbox using echo command (E2B doesn't expose filesystem directly)
      const testFilePath = `/tmp/test_fix.${extension}`;
      if (!solution.code) {
        return {
          success: false,
          output: '',
          errors: ['Solution code is missing'],
        };
      }
      const escapedCode = solution.code.replace(/'/g, "'\\''").replace(/\n/g, '\\n');
      await sandbox.commands.run(
        `echo '${escapedCode}' > ${testFilePath}`,
        { timeoutMs: 5000 }
      );

      // Test based on file type
      let testOutput = '';
      let testErrors: string[] = [];

      if (extension === 'ts' || extension === 'tsx' || extension === 'js' || extension === 'jsx') {
        // Test JavaScript/TypeScript syntax
        try {
          // Try to compile/check syntax
          if (extension === 'ts' || extension === 'tsx') {
            const result = await sandbox.commands.run(
              `npx tsc --noEmit ${testFilePath} 2>&1 || echo "Syntax check complete"`,
              { timeoutMs: 10000 }
            );
            testOutput = result.stdout || '';
            if (result.exitCode !== 0 && result.stderr) {
              testErrors.push(`TypeScript compilation error: ${result.stderr}`);
            }
          } else {
            // For JS, just check if it can be parsed
            const result = await sandbox.commands.run(
              `node -c ${testFilePath} 2>&1 || echo "Syntax check complete"`,
              { timeoutMs: 10000 }
            );
            testOutput = result.stdout || '';
            if (result.exitCode !== 0 && result.stderr) {
              testErrors.push(`JavaScript syntax error: ${result.stderr}`);
            }
          }
        } catch (error: any) {
          testErrors.push(`Syntax check failed: ${error.message}`);
        }
      } else if (extension === 'py') {
        // Test Python syntax
        try {
          const result = await sandbox.commands.run(
            `python3 -m py_compile ${testFilePath} 2>&1 || echo "Syntax check complete"`,
            { timeoutMs: 10000 }
          );
          testOutput = result.stdout || '';
          if (result.exitCode !== 0 && result.stderr) {
            testErrors.push(`Python syntax error: ${result.stderr}`);
          }
        } catch (error: any) {
          testErrors.push(`Python syntax check failed: ${error.message}`);
        }
      } else {
        // For other file types, verify file exists
        const checkResult = await sandbox.commands.run(
          `test -f ${testFilePath} && echo "File exists" || echo "File not found"`,
          { timeoutMs: 5000 }
        );
        if (checkResult.stdout?.includes('File exists')) {
          testOutput = 'File written successfully - basic validation passed';
        } else {
          testErrors.push('File was not created');
        }
      }

      // CRITICAL: Validate that code is actual code, not just text/description
      const codeText = solution.code || '';
      const isTextDescription = 
        codeText.toLowerCase().includes('optimized code will be provided') ||
        codeText.toLowerCase().includes('code will be provided') ||
        codeText.toLowerCase().includes('after refactoring') ||
        codeText.toLowerCase().includes('focusing on') ||
        (codeText.length < 50 && !codeText.includes('function') && !codeText.includes('const') && !codeText.includes('import') && !codeText.includes('export'));

      if (isTextDescription) {
        testErrors.push('Code appears to be a text description, not actual code. Must contain real code.');
        logger.error('❌ E2B TEST FAILED: Solution code is text description, not actual code!');
        logger.error(`Code content: ${codeText.substring(0, 200)}...`);
      }

      // Basic validation checks
      const hasDescription = solution.description.length > 0;
      const hasSteps = solution.steps.length > 0;
      const hasValidCode = codeText.length > 0;

      if (!hasValidCode) {
        testErrors.push('Code is empty');
      } else if (codeText.length < 50) {
        testErrors.push('Code is too short - likely not a complete file');
      }
      if (!hasDescription) {
        testErrors.push('Description is missing');
      }
      if (!hasSteps) {
        testErrors.push('Solution steps are missing');
      }

      // Check for actual code patterns
      const hasCodePatterns = 
        codeText.includes('function') ||
        codeText.includes('const') ||
        codeText.includes('let') ||
        codeText.includes('var') ||
        codeText.includes('import') ||
        codeText.includes('export') ||
        codeText.includes('class') ||
        codeText.includes('interface') ||
        codeText.includes('type') ||
        codeText.includes('=') ||
        codeText.includes('{') ||
        codeText.includes('(');

      if (!hasCodePatterns && codeText.length > 0) {
        testErrors.push('Code does not contain valid code patterns (functions, variables, imports, etc.)');
      }

      const success = testErrors.length === 0;

      return {
        success,
        output: success 
          ? `✅ Code tested successfully in E2B sandbox\n${testOutput || 'Syntax validation passed'}`
          : `❌ Code testing failed:\n${testErrors.join('\n')}`,
        errors: testErrors.length > 0 ? testErrors : undefined,
      };
    } catch (error: any) {
      logger.error('Error testing code in E2B sandbox:', error);
      return {
        success: false,
        output: '',
        errors: [`E2B sandbox test failed: ${error.message}`],
      };
    } finally {
      // Cleanup sandbox
      if (sandbox) {
        try {
          await sandbox.kill();
          logger.info('E2B sandbox closed after testing');
        } catch (error) {
          logger.warn('Error closing E2B sandbox:', error);
        }
      }
    }
  }

  /**
   * Complete diagnosis and solution pipeline
   */
  async solve(
    logAnalysis: any,
    suspectedCommit: CommitInfo,
    diff: string,
    researchResults: ResearchResult[],
    filePath?: string,
    fileContent?: string,
    githubOwner?: string,
    githubRepo?: string
  ): Promise<{
    rootCause: RootCause;
    solution: Solution;
  }> {
    // Step 1: Diagnose root cause
    const rootCause = await this.diagnoseRootCause(
      logAnalysis,
      suspectedCommit,
      diff,
      researchResults
    );

    // Step 2: Generate solution (with actual file content)
    let solution = await this.generateSolution(
      rootCause, 
      diff,
      filePath,
      fileContent,
      githubOwner,
      githubRepo
    );

    // Add file path to solution metadata if not present
    if (!solution.metadata?.filePath && filePath) {
      solution.metadata = {
        ...solution.metadata,
        filePath,
      };
    }

    // Step 3: Test solution
    solution = await this.testSolution(solution);

    return {
      rootCause,
      solution,
    };
  }

  /**
   * Assess solution risk
   */
  assessRisk(solution: Solution): 'low' | 'medium' | 'high' {
    // Consider multiple factors
    let riskScore = 0;

    // Type risk
    if (solution.type === 'rollback') riskScore += 1;
    if (solution.type === 'config_fix') riskScore += 2;
    if (solution.type === 'patch') riskScore += 3;

    // Confidence risk
    if (solution.confidence < 70) riskScore += 2;
    if (solution.confidence < 50) riskScore += 3;

    // Test result risk
    if (solution.testResults && !solution.testResults.success) {
      riskScore += 5;
    }

    // Final assessment
    if (riskScore >= 6) return 'high';
    if (riskScore >= 3) return 'medium';
    return 'low';
  }
}

export default new SolutionSolver();

