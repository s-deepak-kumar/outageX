import { Server as SocketServer } from 'socket.io';
import incidentDetector from './detector';
import logAnalyzer from './analyzer';
import incidentResearcher from './researcher';
import solutionSolver from './solver';
import solutionExecutor from './executor';
import logger from '../utils/logger';
import { db } from '../db';
import { projects } from '../db/schema';
import { eq } from 'drizzle-orm';
import {
  Incident,
  TimelineEntry,
  RootCause,
  Solution,
  ChatMessage,
  AgentPhase,
} from '../utils/types';

/**
 * Agent Orchestrator
 * 
 * Coordinates all agent modules and manages the incident response pipeline:
 * 1. Detection
 * 2. Log Analysis
 * 3. Commit Correlation
 * 4. Research
 * 5. Diagnosis
 * 6. Solution Generation
 * 7. Execution
 */
export class AgentOrchestrator {
  private io: SocketServer | null = null;
  private currentIncident: Incident | null = null;
  private timeline: TimelineEntry[] = [];
  private isProcessing: boolean = false;
  private currentProject: typeof projects.$inferSelect | null = null;

  /**
   * Initialize with Socket.io server
   */
  initialize(io: SocketServer): void {
    this.io = io;
    logger.info('Agent Orchestrator initialized');
  }

  /**
   * Start incident response pipeline
   */
  async startIncidentResponse(userId: string = 'demo-user', metadata?: Record<string, any>): Promise<void> {
    if (this.isProcessing) {
      logger.warn('Incident response already in progress');
      return;
    }

    this.isProcessing = true;
    this.timeline = [];
    
    // Log ALL metadata details for debugging
    logger.info(`🚨 Starting incident response for user: ${userId}`);
    logger.info(`📋 FULL METADATA RECEIVED:`, JSON.stringify(metadata, null, 2));
    
    if (metadata) {
      logger.info(`🔍 Error details in metadata:`, {
        source: metadata.source,
        errorMessage: metadata.errorMessage,
        errorCount: metadata.errorCount,
        errors: metadata.errors ? `Array of ${metadata.errors.length} errors` : 'No errors array',
        firstError: metadata.errors?.[0] ? {
          message: metadata.errors[0].message,
          filename: metadata.errors[0].filename,
          stack: metadata.errors[0].stack ? metadata.errors[0].stack.substring(0, 200) + '...' : 'No stack',
          url: metadata.errors[0].url,
          metadata: metadata.errors[0].metadata,
        } : 'No first error',
        projectId: metadata.projectId,
        projectName: metadata.projectName,
        githubOwner: metadata.githubOwner,
        githubRepo: metadata.githubRepo,
      });
    } else {
      logger.warn('⚠️ No metadata provided to startIncidentResponse');
    }

    // Store metadata in timeline for later retrieval
    if (metadata) {
      this.addTimelineEntry('detection', 'Incident detected', 'in_progress', {
        metadata: metadata,
        errors: metadata.errors || [],
        errorMessage: metadata.errorMessage,
        source: metadata.source,
      });
    }

    // Pass metadata to detector if provided (from runtime monitor or webhook)
    if (metadata) {
      incidentDetector.setMetadata(metadata);
    }

    // Pass userId to executor and researcher for REAL integrations
    solutionExecutor.setUserId(userId);
    incidentResearcher.setUserId(userId);

    // Get project info for autoFix check
    this.currentProject = null;
    if (metadata?.projectId) {
      try {
        const [projectData] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, metadata.projectId))
          .limit(1);
        this.currentProject = projectData || null;
        if (this.currentProject) {
          logger.info(`Project loaded: ${this.currentProject.vercelProjectName}, autoFix=${this.currentProject.autoFix}, threshold=${this.currentProject.autoFixThreshold}`);
        } else {
          logger.warn(`Project not found for ID: ${metadata.projectId}`);
        }
      } catch (error) {
        logger.warn('Could not fetch project info:', error);
      }
    } else {
      logger.warn('No projectId in metadata, cannot check autoFix');
    }

    try {
      // Phase 1: Detection
      await this.phaseDetection();

      // Phase 2: Log Analysis
      await this.phaseLogAnalysis();

      // Phase 3: Commit Correlation
      await this.phaseCommitCorrelation();

      // Phase 4: Research
      await this.phaseResearch();

      // Phase 5: Diagnosis & Solution
      await this.phaseDiagnosisAndSolution();

      // Check if autoFix is enabled
      const solutionData = this.timeline.find(t => t.phase === 'solution_generation')?.metadata?.solution;
      
      // Debug logging
      logger.info(`AutoFix check: project=${this.currentProject?.id || 'null'}, autoFix=${this.currentProject?.autoFix || false}, threshold=${this.currentProject?.autoFixThreshold || 90}, solutionData=${!!solutionData}, confidence=${solutionData?.confidence || 0}`);
      
      if (this.currentProject?.autoFix && solutionData) {
        const confidence = solutionData.confidence || 0;
        const threshold = this.currentProject.autoFixThreshold || 90;

        if (confidence >= threshold) {
          logger.info(`🚀 AutoFix enabled! Confidence ${confidence}% >= threshold ${threshold}%. Executing automatically...`);
          this.emitChatMessage(
            'agent',
            `🤖 **AutoFix Enabled**\n\nConfidence: ${confidence}% (threshold: ${threshold}%)\n\nAutomatically executing solution...`
          );

          // Automatically execute solution
          await this.executeSolution(solutionData.id);
        } else {
          logger.info(`AutoFix enabled but confidence ${confidence}% < threshold ${threshold}%. Awaiting approval.`);
          this.emitChatMessage(
            'agent',
            `⚠️ **AutoFix Enabled** but confidence (${confidence}%) is below threshold (${threshold}%)\n\nAwaiting manual approval for safety.`
          );
        }
      } else {
        // Await user approval for execution
        const reason = !this.currentProject 
          ? 'Project not found' 
          : !this.currentProject.autoFix 
          ? 'AutoFix disabled' 
          : !solutionData 
          ? 'Solution data not found' 
          : 'Unknown';
        logger.info(`Awaiting user approval for solution execution... (Reason: ${reason})`);
        this.emitChatMessage(
          'agent',
          '👤 **Manual Approval Required**\n\nPlease review and approve the solution to execute.'
        );
      }
      
    } catch (error) {
      logger.error('Error in incident response pipeline:', error);
      this.emitStatusChange('failed');
      this.emitChatMessage(
        'system',
        '❌ An error occurred during incident response. Please check logs.'
      );
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Phase 1: Incident Detection
   */
  private async phaseDetection(): Promise<void> {
    this.addTimelineEntry('detection', 'Detecting incident', 'in_progress');
    this.emitAgentUpdate('detection', 'Detecting incident', 'Analyzing system metrics and health checks...');

    await this.sleep(1500);

    const incident = await incidentDetector.detectIncident();
    this.currentIncident = incident;

    this.updateTimelineEntry('detection', 'completed');
    this.emitIncidentDetected(incident);
    this.emitChatMessage(
      'agent',
      `🚨 **Incident Detected**\n\n**${incident.title}**\n\n${incident.description}\n\n**Severity:** ${incident.severity}\n**Affected Services:** ${incident.affectedServices.join(', ')}`
    );

    await this.sleep(1000);
  }

  /**
   * Phase 2: Log Analysis
   */
  private async phaseLogAnalysis(): Promise<void> {
    if (!this.currentIncident) return;

    this.addTimelineEntry('log_analysis', 'Analyzing logs', 'in_progress');
    this.emitAgentUpdate('log_analysis', 'Analyzing logs', 'Fetching logs from affected services...');

    // Fetch logs
    const logs = await logAnalyzer.fetchLogs(this.currentIncident.affectedServices);
    this.emitLogsStream(logs);

    await this.sleep(2000);

    // Analyze logs with E2B
    this.emitAgentUpdate('log_analysis', 'Analyzing patterns', 'Running Python analysis in E2B sandbox...');
    const analysis = await logAnalyzer.analyzeLogs(logs);

    // Store analysis
    const insights = logAnalyzer.extractInsights(logs, analysis);
    
    this.updateTimelineEntry('log_analysis', 'completed', { analysis });
    this.emitChatMessage(
      'agent',
      `📊 **Log Analysis Complete**\n\n${insights.map(i => `• ${i}`).join('\n')}\n\n**Key Finding:** ${analysis.most_common_errors[0]?.message}`
    );

    await this.sleep(1000);
  }

  /**
   * Phase 3: Commit Correlation
   */
  private async phaseCommitCorrelation(): Promise<void> {
    this.addTimelineEntry('commit_correlation', 'Correlating commits', 'in_progress');
    this.emitAgentUpdate('commit_correlation', 'Checking recent changes', 'Fetching commit history from GitHub...');

    const logAnalysis = this.timeline.find(t => t.phase === 'log_analysis')?.metadata?.analysis;
    const errorPattern = logAnalysis?.most_common_errors[0]?.message || 'CPU time limit exceeded';

    await this.sleep(2000);

    // Pass project GitHub info to researcher for real API calls
    const githubOwner = this.currentProject?.githubOwner;
    const githubRepo = this.currentProject?.githubRepo;
    const { commits: _commits, suspectedCommit, diff } = await incidentResearcher.correlateCommits(
      errorPattern,
      githubOwner,
      githubRepo
    );

    if (suspectedCommit) {
      this.updateTimelineEntry('commit_correlation', 'completed', { suspectedCommit, diff });
      this.emitAgentUpdate('commit_correlation', 'Suspicious commit identified', `Analyzing commit ${suspectedCommit.sha}...`);
      this.emitChatMessage(
        'agent',
        `🔍 **Suspicious Commit Identified**\n\n**SHA:** \`${suspectedCommit.sha}\`\n**Author:** ${suspectedCommit.author}\n**Message:** ${suspectedCommit.message}\n\n**Files Changed:** ${suspectedCommit.filesChanged.join(', ')}`
      );
    } else {
      this.updateTimelineEntry('commit_correlation', 'completed');
      this.emitChatMessage('agent', '⚠️ Could not identify suspicious commit from recent changes.');
    }

    await this.sleep(1000);
  }

  /**
   * Phase 4: Research
   */
  private async phaseResearch(): Promise<void> {
    this.addTimelineEntry('research', 'Researching similar incidents', 'in_progress');
    this.emitAgentUpdate('research', 'Researching solutions', 'Querying Perplexity and web search...');

    const logAnalysis = this.timeline.find(t => t.phase === 'log_analysis')?.metadata?.analysis;
    const errorPattern = logAnalysis?.most_common_errors[0]?.message || 'Worker CPU time limit';

    await this.sleep(2500);

    const research = await incidentResearcher.comprehensiveResearch(
      errorPattern,
      'Cloudflare Workers'
    );

    const keyFindings = incidentResearcher.extractKeyFindings(research.allResults);

    this.updateTimelineEntry('research', 'completed', { research: research.allResults });
    this.emitChatMessage(
      'agent',
      `🔬 **Research Complete**\n\nFound ${research.allResults.length} relevant resources:\n\n${keyFindings.slice(0, 3).map(f => `• ${f}`).join('\n')}`
    );

    await this.sleep(1000);
  }

  /**
   * Phase 5: Diagnosis and Solution Generation
   */
  private async phaseDiagnosisAndSolution(): Promise<void> {
    this.addTimelineEntry('diagnosis', 'Diagnosing root cause', 'in_progress');
    this.emitAgentUpdate('diagnosis', 'Analyzing data', 'Using Groq AI to diagnose root cause...');

    const logAnalysis = this.timeline.find(t => t.phase === 'log_analysis')?.metadata?.analysis;
    const commitData = this.timeline.find(t => t.phase === 'commit_correlation')?.metadata;
    const researchData = this.timeline.find(t => t.phase === 'research')?.metadata?.research || [];

    if (!commitData?.suspectedCommit) {
      this.emitChatMessage('agent', '❌ Cannot proceed without suspected commit data.');
      return;
    }

    await this.sleep(3000);

    // Determine file path from suspected commit or diff
    const suspectedCommit = commitData.suspectedCommit;
    const diff = commitData.diff || '';
    
    logger.info(`🔍 Determining file path from commit data:`, {
      commitSha: suspectedCommit?.sha,
      commitMessage: suspectedCommit?.message,
      filesChanged: suspectedCommit?.filesChanged,
      diffLength: diff.length,
    });

    // Try to extract file path from error metadata first
    let filePath: string | undefined;
    
    // Check if error metadata has file information
    const detectionEntry = this.timeline.find(t => t.phase === 'detection');
    const errorMetadata = detectionEntry?.metadata;
    
    logger.info(`🔍 Searching for file path in error metadata...`, {
      hasDetectionEntry: !!detectionEntry,
      hasMetadata: !!errorMetadata,
      hasErrors: !!errorMetadata?.errors,
      errorsCount: errorMetadata?.errors?.length || 0,
      firstError: errorMetadata?.errors?.[0] ? {
        hasFilename: !!errorMetadata.errors[0].filename,
        filename: errorMetadata.errors[0].filename,
        hasStack: !!errorMetadata.errors[0].stack,
        stackPreview: errorMetadata.errors[0].stack ? errorMetadata.errors[0].stack.substring(0, 300) : null,
        hasMetadata: !!errorMetadata.errors[0].metadata,
        metadataKeys: errorMetadata.errors[0].metadata ? Object.keys(errorMetadata.errors[0].metadata) : [],
      } : 'No first error',
    });
    
    if (errorMetadata?.errors?.[0]) {
      const firstError = errorMetadata.errors[0];
      
      // Priority order for file path extraction:
      // 1. metadata.sourceFile (extracted by SDK from stack trace)
      // 2. metadata.filename (from SDK)
      // 3. error.filename (from error event)
      // 4. Extract from stack trace
      
      if (firstError.metadata?.sourceFile) {
        filePath = firstError.metadata.sourceFile;
        logger.info(`✅ Found file path from error.metadata.sourceFile (SDK extracted): ${filePath}`, {
          line: firstError.metadata.sourceLine,
          column: firstError.metadata.sourceColumn,
        });
      } else if (firstError.metadata?.filename) {
        filePath = firstError.metadata.filename;
        logger.info(`✅ Found file path from error.metadata.filename: ${filePath}`, {
          line: firstError.metadata.lineno || firstError.metadata.sourceLine,
          column: firstError.metadata.colno || firstError.metadata.sourceColumn,
        });
      } else if (firstError.filename) {
        filePath = firstError.filename;
        logger.info(`✅ Found file path from error.filename: ${filePath}`, {
          line: firstError.lineno,
          column: firstError.colno,
        });
      }
      // Try extracting from stack trace
      else if (firstError.stack) {
        logger.info(`🔍 Attempting to extract file path from stack trace...`);
        logger.debug(`Stack trace (first 500 chars): ${firstError.stack.substring(0, 500)}`);
        
        // Try multiple stack trace patterns
        const patterns = [
          /at .+ \((.+?):\d+:\d+\)/g,  // Standard: at function (file:line:col)
          /\((.+?):\d+:\d+\)/g,         // Without function: (file:line:col)
          /at (.+?):\d+:\d+/g,          // Without parentheses: at file:line:col
          /(.+?\.(ts|tsx|js|jsx)):\d+/g, // Just file:line
        ];
        
        for (const pattern of patterns) {
          const matches = [...firstError.stack.matchAll(pattern)];
          if (matches.length > 0) {
            for (const match of matches) {
              if (match[1]) {
                let extractedPath = match[1];
                // Remove webpack://, file://, http:// prefixes
                extractedPath = extractedPath.replace(/^webpack:\/\/|^file:\/\/|^https?:\/\/[^/]+\//, '');
                // Remove leading ./
                extractedPath = extractedPath.replace(/^\.\//, '');
                
                // Only use if it looks like a valid file path
                if (extractedPath.match(/\.(ts|tsx|js|jsx)$/)) {
                  filePath = extractedPath;
                  logger.info(`✅ Extracted file path from stack trace (pattern: ${pattern}): ${filePath}`);
                  break;
                }
              }
            }
            if (filePath) break;
          }
        }
        
        if (!filePath) {
          logger.warn(`⚠️ Could not extract file path from stack trace`);
        }
      }
    }
    
    // If not found in error, try to extract from commit or diff (but this is less reliable)
    if (!filePath) {
      logger.warn(`⚠️ File path NOT found in error metadata! This means SDK didn't capture it properly.`);
      logger.info(`🔍 Falling back to commit/diff extraction (less reliable)...`);
      
      if (suspectedCommit?.filesChanged && suspectedCommit.filesChanged.length > 0) {
        filePath = suspectedCommit.filesChanged[0];
        logger.warn(`📄 Using file path from commit (FALLBACK): ${filePath}`, {
          allFilesChanged: suspectedCommit.filesChanged,
          warning: 'This may not be the actual file with the error!',
        });
      } else if (diff) {
        logger.debug(`🔍 Searching diff for file path...`, {
          diffLength: diff.length,
          diffPreview: diff.substring(0, 500),
        });
        
        // Try to extract from diff header
        const diffMatch = diff.match(/^diff --git a\/(.+?) b\/(.+?)$/m);
        if (diffMatch) {
          filePath = diffMatch[2]; // Use 'b' path (new file)
          logger.warn(`📄 Extracted file path from diff header (FALLBACK): ${filePath}`, {
            warning: 'This may not be the actual file with the error!',
          });
        } else {
          // Try to find file path in diff
          const fileMatch = diff.match(/^--- a\/(.+?)$|^\+\+\+ b\/(.+?)$/m);
          if (fileMatch) {
            filePath = fileMatch[1] || fileMatch[2];
            logger.warn(`📄 Extracted file path from diff file headers (FALLBACK): ${filePath}`, {
              warning: 'This may not be the actual file with the error!',
            });
          } else {
            logger.warn(`⚠️ Could not extract file path from diff`);
          }
        }
      } else {
        logger.warn(`⚠️ No diff available to extract file path from`);
      }
    }
    
    // Final check - if still no file path, log everything we have
    if (!filePath) {
      logger.error(`❌ NO FILE PATH FOUND FROM ERROR! This is a problem.`, {
        errorMetadata: errorMetadata,
        firstError: errorMetadata?.errors?.[0] ? {
          message: errorMetadata.errors[0].message,
          filename: errorMetadata.errors[0].filename,
          metadata: errorMetadata.errors[0].metadata,
          hasStack: !!errorMetadata.errors[0].stack,
          stackPreview: errorMetadata.errors[0].stack ? errorMetadata.errors[0].stack.substring(0, 300) : null,
        } : 'No error in metadata',
        suspectedCommit: suspectedCommit ? {
          sha: suspectedCommit.sha,
          message: suspectedCommit.message,
          filesChanged: suspectedCommit.filesChanged,
        } : 'No commit',
        hasDiff: !!diff,
        diffLength: diff?.length || 0,
        action: 'Will search repository for main entry point as last resort',
      });
      logger.warn(`⚠️ CRITICAL: SDK should capture actual file path from stack trace!`);
    }

    logger.info(`📂 Final file path to read: ${filePath || 'NOT FOUND - will search repository'}`, {
      project: {
        githubOwner: this.currentProject?.githubOwner,
        githubRepo: this.currentProject?.githubRepo,
      },
      source: filePath ? 'extracted from error' : 'not found in error',
      errorMetadata: errorMetadata?.errors?.[0] ? {
        hasFilename: !!errorMetadata.errors[0].filename,
        hasMetadataFilename: !!errorMetadata.errors[0].metadata?.filename,
        hasSourceFile: !!errorMetadata.errors[0].metadata?.sourceFile,
        hasStack: !!errorMetadata.errors[0].stack,
      } : 'No error in metadata',
    });
    
    // CRITICAL: If we have a file path from error, we MUST use it - no guessing!
    if (filePath) {
      logger.info(`✅ Using ACTUAL file path from error: ${filePath}`, {
        source: errorMetadata?.errors?.[0]?.metadata?.sourceFile ? 'SDK extracted' :
                errorMetadata?.errors?.[0]?.metadata?.filename ? 'SDK filename' :
                errorMetadata?.errors?.[0]?.filename ? 'Error event filename' :
                'Stack trace extracted',
        willNotGuess: true,
      });
    } else {
      logger.warn(`⚠️ NO FILE PATH from error! Will search repository, but this is not ideal.`, {
        suggestion: 'SDK should capture actual file path from stack trace',
      });
    }

    let fileContent: string | undefined;

    // Read the actual file from GitHub before generating solution
    if (this.currentProject?.githubOwner && this.currentProject?.githubRepo) {
      const IntegrationManager = (await import('../services/integration-manager')).IntegrationManager;
      const integrationManager = new IntegrationManager(this.userId || 'demo-user');
      const github = await integrationManager.getGitHubIntegration();
      
      if (!github) {
        logger.warn('⚠️ GitHub integration not available');
      } else {
        // If we have a file path, try to read it
        if (filePath) {
          try {
            logger.info(`📖 Reading actual file from GitHub: ${filePath}`, {
              owner: this.currentProject.githubOwner,
              repo: this.currentProject.githubRepo,
              branch: 'main',
            });
            
            const fileData = await github.getFileContent(
              filePath, 
              'main', 
              this.currentProject.githubOwner, 
              this.currentProject.githubRepo
            );
            fileContent = fileData.content;
            logger.info(`✅ Successfully read ${filePath} from GitHub:`, {
              size: fileContent.length,
              sha: fileData.sha,
              actualPath: fileData.path,
            });
          } catch (error: any) {
            const status = error.response?.status || error.status || (error.is404 ? 404 : undefined);
            logger.info(`🔍 Error details:`, {
              status: status,
              is404: status === 404 || error.is404,
              errorMessage: error.message,
              hasResponse: !!error.response,
            });
            
            if (status === 404 || error.is404) {
              logger.warn(`⚠️ File ${filePath} not found (404). Searching repository for actual files...`);
              
              // First, try to list root directory to see what actually exists
              try {
                logger.info(`📁 Listing root directory to see actual repository structure...`);
                const rootContents = await github.getDirectoryContents(
                  '.',
                  'main',
                  this.currentProject.githubOwner,
                  this.currentProject.githubRepo
                );
                
                const files = Array.isArray(rootContents) ? rootContents : [rootContents];
                logger.info(`📁 Root directory contents:`, {
                  total: files.length,
                  files: files.map((f: any) => ({ name: f.name, type: f.type, path: f.path })),
                });
                
                // Find any .ts, .tsx, .js, .jsx files
                const codeFiles = files.filter((f: any) => 
                  f.type === 'file' && 
                  (f.name.endsWith('.ts') || f.name.endsWith('.tsx') || 
                   f.name.endsWith('.js') || f.name.endsWith('.jsx'))
                );
                
                if (codeFiles.length > 0) {
                  // Use the first code file found
                  filePath = codeFiles[0].path;
                  logger.info(`✅ Found code file in root: ${filePath}`);
                  
                  try {
                    const fileData = await github.getFileContent(
                      filePath,
                      'main',
                      this.currentProject.githubOwner,
                      this.currentProject.githubRepo
                    );
                    fileContent = fileData.content;
                    logger.info(`✅ Successfully read ${filePath} from GitHub:`, {
                      size: fileContent.length,
                      sha: fileData.sha,
                    });
                  } catch (readError: any) {
                    logger.warn(`⚠️ Could not read found file ${filePath}: ${readError.message}`);
                  }
                } else {
                  logger.warn(`⚠️ No code files found in root directory`);
                }
              } catch (listError: any) {
                logger.warn(`⚠️ Could not list root directory: ${listError.message}`);
              }
              
              // If still no file, try searching by filename
              if (!fileContent) {
                const fileName = filePath.split('/').pop() || filePath;
                logger.info(`🔍 Searching repository for files matching: ${fileName}`);
                
                try {
                  const matchingFiles = await github.searchFiles(
                    fileName,
                    'main',
                    this.currentProject.githubOwner,
                    this.currentProject.githubRepo
                  );
                  
                  if (matchingFiles.length > 0) {
                    filePath = matchingFiles[0].path;
                    logger.info(`✅ Found matching file in repository: ${filePath}`);
                    
                    try {
                      const fileData = await github.getFileContent(
                        filePath,
                        'main',
                        this.currentProject.githubOwner,
                        this.currentProject.githubRepo
                      );
                      fileContent = fileData.content;
                      logger.info(`✅ Successfully read ${filePath} from GitHub:`, {
                        size: fileContent.length,
                        sha: fileData.sha,
                      });
                    } catch (readError: any) {
                      logger.warn(`⚠️ Could not read found file ${filePath}: ${readError.message}`);
                    }
                  }
                } catch (searchError: any) {
                  logger.warn(`⚠️ Error searching for files: ${searchError.message}`);
                }
              }
              
              // If still no file, try to find main entry point
              if (!fileContent) {
                logger.info(`🔍 No matching files found. Searching for main entry point...`);
                try {
                  const mainEntryPoint = await github.findMainEntryPoint(
                    'main',
                    this.currentProject.githubOwner,
                    this.currentProject.githubRepo
                  );
                  
                  if (mainEntryPoint) {
                    filePath = mainEntryPoint;
                    logger.info(`✅ Using main entry point: ${filePath}`);
                    
                    try {
                      const fileData = await github.getFileContent(
                        filePath,
                        'main',
                        this.currentProject.githubOwner,
                        this.currentProject.githubRepo
                      );
                      fileContent = fileData.content;
                      logger.info(`✅ Successfully read ${filePath} from GitHub:`, {
                        size: fileContent.length,
                        sha: fileData.sha,
                      });
                    } catch (readError: any) {
                      logger.warn(`⚠️ Could not read main entry point ${filePath}: ${readError.message}`);
                    }
                  } else {
                    logger.warn(`⚠️ Could not find main entry point. Will generate solution without file content.`);
                  }
                } catch (entryPointError: any) {
                  logger.warn(`⚠️ Error finding main entry point: ${entryPointError.message}`);
                }
              }
              
              if (!fileContent) {
                logger.warn(`💡 Could not find any file in repository. Will generate solution without file content (using diff only)`);
              }
            } else {
              logger.warn(`⚠️ Could not read file ${filePath} from GitHub (status: ${status}):`, {
                error: error.message,
                status: status,
                owner: this.currentProject?.githubOwner,
                repo: this.currentProject?.githubRepo,
                path: filePath,
              });
              logger.warn(`💡 Will generate solution without file content (using diff only)`);
            }
          }
        } else {
          // No file path available, try to find main entry point
          logger.info(`🔍 No file path available. Searching for main entry point...`);
          try {
            const mainEntryPoint = await github.findMainEntryPoint(
              'main',
              this.currentProject.githubOwner,
              this.currentProject.githubRepo
            );
            
            if (mainEntryPoint) {
              filePath = mainEntryPoint;
              logger.info(`✅ Found main entry point: ${filePath}`);
              
              try {
                const fileData = await github.getFileContent(
                  filePath,
                  'main',
                  this.currentProject.githubOwner,
                  this.currentProject.githubRepo
                );
                fileContent = fileData.content;
                logger.info(`✅ Successfully read ${filePath} from GitHub:`, {
                  size: fileContent.length,
                  sha: fileData.sha,
                });
              } catch (readError: any) {
                logger.warn(`⚠️ Could not read main entry point ${filePath}: ${readError.message}`);
              }
            } else {
              logger.warn(`⚠️ Could not find main entry point. Will generate solution without file content.`);
            }
          } catch (searchError: any) {
            logger.warn(`⚠️ Error searching for main entry point: ${searchError.message}`);
          }
        }
      }
    } else {
      logger.warn('⚠️ Cannot read file from GitHub - project GitHub info missing:', {
        hasOwner: !!this.currentProject?.githubOwner,
        hasRepo: !!this.currentProject?.githubRepo,
        projectId: this.currentProject?.id,
      });
    }

    const { rootCause, solution } = await solutionSolver.solve(
      logAnalysis,
      commitData.suspectedCommit,
      commitData.diff,
      researchData,
      filePath,
      fileContent,
      this.currentProject?.githubOwner,
      this.currentProject?.githubRepo
    );

    // Add project info and file path to solution metadata for autoFix
    if (this.currentProject && solution) {
      solution.metadata = {
        ...solution.metadata,
        projectId: this.currentProject.id,
        projectName: this.currentProject.vercelProjectName,
        githubOwner: this.currentProject.githubOwner,
        githubRepo: this.currentProject.githubRepo,
        filePath: filePath || solution.metadata?.filePath, // Ensure file path is stored
      };
      
      logger.info(`✅ Solution metadata updated:`, {
        projectId: solution.metadata.projectId,
        filePath: solution.metadata.filePath,
        hasFilePath: !!solution.metadata.filePath,
      });
    } else if (filePath && solution) {
      // Even if no project, store file path
      solution.metadata = {
        ...solution.metadata,
        filePath: filePath,
      };
      logger.info(`✅ File path stored in solution metadata: ${filePath}`);
    } else {
      logger.warn(`⚠️ Solution created but file path not stored!`, {
        hasProject: !!this.currentProject,
        hasSolution: !!solution,
        filePath: filePath,
        solutionMetadata: solution?.metadata,
      });
    }

    this.updateTimelineEntry('diagnosis', 'completed', { rootCause });
    
    this.addTimelineEntry('solution_generation', 'Generating solution', 'completed', { solution });

    this.emitChatMessage(
      'agent',
      `🎯 **Root Cause Identified**\n\n${rootCause.description}\n\n**Confidence:** ${rootCause.confidence}%\n\n**Evidence:**\n${rootCause.evidence.map(e => `• ${e}`).join('\n')}`
    );

    await this.sleep(1500);

    this.emitSolutionProposed(solution, rootCause);
    this.emitChatMessage(
      'agent',
      `✅ **Solution Ready**\n\n${solution.description}\n\n**Type:** ${solution.type}\n**Risk:** ${solution.risk}\n**Confidence:** ${solution.confidence}%\n**Estimated Time:** ${solution.estimatedTime}\n\nPlease review and approve the solution to execute.`
    );

    if (this.currentIncident) {
      this.currentIncident.status = 'proposing';
      this.emitStatusChange('proposing');
    }
  }

  /**
   * Execute approved solution
   */
  async executeSolution(solutionId: string): Promise<void> {
    logger.info(`Executing solution: ${solutionId}`);

    this.addTimelineEntry('execution', 'Executing solution', 'in_progress');
    this.emitAgentUpdate('execution', 'Executing fix', 'Applying solution...');
    this.emitStatusChange('executing');

    const solutionData = this.timeline.find(t => t.phase === 'solution_generation')?.metadata?.solution;
    
    if (!solutionData) {
      this.emitChatMessage('agent', '❌ Solution data not found.');
      return;
    }

    await this.sleep(2000);

    const result = await solutionExecutor.execute(solutionData);

    if (result.success) {
      this.updateTimelineEntry('execution', 'completed', { result });
      
      const mergeMessage = result.merged 
        ? `\n\n🚀 **PR Merged Automatically**\n\nPull request #${result.prNumber} has been created and merged.\n**Merge Commit:** ${result.mergeCommitSha?.substring(0, 7) || 'N/A'}`
        : '';
      
      this.emitChatMessage(
        'agent',
        `🎉 **Solution Executed Successfully**\n\n${result.message}${mergeMessage}\n\n${result.url ? `**Link:** ${result.url}` : ''}\n\nMonitoring system health...`
      );

      await this.sleep(2000);

      // Monitor results
      const monitoring = await solutionExecutor.monitorSolution(solutionId);
      this.emitChatMessage(
        'agent',
        `📈 **Monitoring Results**\n\nError rate: ${monitoring.errorRate}%\nSuccess rate: ${monitoring.successRate}%\n\n${monitoring.recommendation}`
      );

      if (this.currentIncident) {
        this.currentIncident.status = 'resolved';
        this.currentIncident.resolvedAt = new Date();
        this.emitStatusChange('resolved');
      }

      this.emitChatMessage('agent', '✅ **Incident Resolved** - All systems nominal.');
    } else {
      this.updateTimelineEntry('execution', 'failed', { result });
      this.emitChatMessage('agent', `❌ **Execution Failed**\n\n${result.error || result.message}`);
      this.emitStatusChange('failed');
    }
  }

  // Helper methods
  private addTimelineEntry(
    phase: AgentPhase,
    title: string,
    status: TimelineEntry['status'],
    metadata?: any
  ): void {
    const entry: TimelineEntry = {
      id: `timeline-${Date.now()}`,
      timestamp: new Date(),
      phase,
      title,
      description: '',
      status,
      metadata,
    };

    this.timeline.push(entry);
    this.emitTimelineAdd(entry);
  }

  private updateTimelineEntry(
    phase: AgentPhase,
    status: TimelineEntry['status'],
    metadata?: any
  ): void {
    const entry = this.timeline.find(t => t.phase === phase);
    if (entry) {
      entry.status = status;
      if (metadata) {
        entry.metadata = { ...entry.metadata, ...metadata };
      }
      this.emitTimelineAdd(entry);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Socket.io emission methods
  private emitIncidentDetected(incident: Incident): void {
    this.io?.emit('incident:detected', { incident });
  }

  private emitAgentUpdate(phase: AgentPhase, status: string, message: string, data?: any): void {
    this.io?.emit('agent:update', { phase, status, message, data });
  }

  private emitLogsStream(logs: any[]): void {
    this.io?.emit('logs:stream', { logs });
  }

  private emitSolutionProposed(solution: Solution, rootCause: RootCause): void {
    this.io?.emit('solution:proposed', { solution, rootCause });
  }

  private emitStatusChange(status: string): void {
    this.io?.emit('status:change', { status, incident: this.currentIncident });
  }

  private emitChatMessage(role: 'user' | 'agent' | 'system', content: string): void {
    const message: ChatMessage = {
      id: `msg-${Date.now()}`,
      role,
      content,
      timestamp: new Date(),
    };
    this.io?.emit('chat:message', { message });
  }

  private emitTimelineAdd(entry: TimelineEntry): void {
    this.io?.emit('timeline:add', { entry });
  }
}

export default new AgentOrchestrator();

