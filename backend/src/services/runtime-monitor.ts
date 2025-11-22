import logger from '../utils/logger';
import { db } from '../db';
import { projects, runtimeLogs } from '../db/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import orchestrator from '../agent/orchestrator';
import axios from 'axios';
import { Server as SocketIOServer } from 'socket.io';

// Socket.io instance will be set by index.ts
let io: SocketIOServer | null = null;

export function setSocketIO(socketIO: SocketIOServer): void {
  io = socketIO;
  logger.info('✅ Runtime Monitor: Socket.io instance set', {
    hasSocket: !!io,
    socketType: io ? 'SocketIOServer' : 'null',
  });
}

export function getSocketIO(): SocketIOServer | null {
  return io;
}

/**
 * Runtime Error Monitor
 * 
 * Monitors runtime errors from SDK and automatically triggers incident response.
 * 
 * Detection Methods:
 * 1. Receives errors via webhook (client-side SDK) - Automatic
 * 2. Fetches logs from external API URL and stores in DB - Manual trigger
 * 
 * Note: No polling - errors come from SDK or manual log fetching
 */
export class RuntimeMonitor {
  private readonly ERROR_THRESHOLD = 1; // Trigger after 1 error (lowered for immediate incident creation)
  private errorCounts: Map<string, { count: number; firstError: Date }> = new Map(); // projectId -> error tracking

  /**
   * Fetch logs from external API URL and store in database
   * 
   * @param projectId - Project ID from database
   * @param apiUrl - API endpoint URL to fetch logs from
   * @param options - Optional configuration
   */
  async fetchAndStoreLogs(
    projectId: string,
    apiUrl: string,
    options?: {
      headers?: Record<string, string>;
      limit?: number;
      since?: Date;
    }
  ): Promise<{ stored: number; errors: number }> {
    try {
      logger.info(`Fetching logs from ${apiUrl} for project ${projectId}`);

      // Fetch logs from API
      const response = await axios.get(apiUrl, {
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers || {}),
        },
      });

      const logsData = response.data;
      
      // Handle different response formats
      const logs = Array.isArray(logsData) 
        ? logsData 
        : logsData.logs || logsData.data || [];

      if (!Array.isArray(logs)) {
        throw new Error('Invalid logs format: expected array');
      }

      // Limit logs if specified
      const logsToProcess = options?.limit 
        ? logs.slice(0, options.limit)
        : logs;

      // Filter by timestamp if 'since' is provided
      const filteredLogs = options?.since
        ? logsToProcess.filter((log: any) => {
            const logTime = new Date(log.timestamp || log.created || log.date || 0);
            return logTime >= options.since!;
          })
        : logsToProcess;

      // Store logs in database
      const logEntries = filteredLogs.map((log: any) => {
        // Parse timestamp
        let timestamp: Date;
        if (log.timestamp) {
          timestamp = typeof log.timestamp === 'number' 
            ? new Date(log.timestamp * 1000) // Unix timestamp in seconds
            : new Date(log.timestamp);
        } else if (log.created) {
          timestamp = new Date(log.created);
        } else if (log.date) {
          timestamp = new Date(log.date);
        } else {
          timestamp = new Date();
        }

        // Determine log level
        let level = log.level || 'info';
        if (log.type === 'error' || log.type === 'stderr') {
          level = 'error';
        } else if (log.type === 'warn' || log.type === 'warning') {
          level = 'warn';
        } else if (log.type === 'debug') {
          level = 'debug';
        }

        // Extract message
        const message = log.message || log.text || log.content || JSON.stringify(log);

        return {
          projectId,
          timestamp,
          level,
          message,
          deploymentId: log.deploymentId || log.deployment?.id,
          functionName: log.function?.name || log.functionName || log.function,
          requestId: log.requestId || log.id || log.request?.id,
          url: log.url || log.path || log.request?.url,
          method: log.method || log.request?.method,
          statusCode: log.statusCode || log.status || log.response?.statusCode,
          source: log.source || log.type || 'api',
          metadata: {
            ...log,
            originalPayload: log,
          },
        };
      });

      // Insert logs into database
      if (logEntries.length > 0) {
        // Insert logs and get the inserted IDs
        const insertedLogs = await db.insert(runtimeLogs).values(logEntries).returning();
        logger.info(`✅ Stored ${insertedLogs.length} logs from ${apiUrl} for project ${projectId}`);
        
        // Emit logs via socket for real-time updates
        if (io) {
          const logsForSocket = insertedLogs.map((log) => ({
            id: log.id,
            projectId: log.projectId,
            timestamp: log.timestamp,
            level: log.level,
            message: log.message,
            source: log.source,
            url: log.url,
            metadata: log.metadata,
          }));
          io.emit('logs:stream', { logs: logsForSocket });
          logger.info(`📡 Emitted ${logsForSocket.length} log(s) via socket for project ${projectId}`, {
            logIds: logsForSocket.map(l => l.id),
            projectId: projectId,
          });
        } else {
          logger.warn('⚠️ Socket.io not available, logs not emitted');
        }
      }

      // Count errors
      const errorCount = logEntries.filter(log => log.level === 'error').length;

      // Check if errors should trigger incident
      if (errorCount > 0) {
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId));

        if (project && project.enabled) {
          const errorLogs = logEntries.filter(log => log.level === 'error');
          await this.handleErrors(project, errorLogs);
        }
      }

      return {
        stored: logEntries.length,
        errors: errorCount,
      };
    } catch (error: any) {
      logger.error(`Error fetching/storing logs from ${apiUrl}:`, error);
      throw error;
    }
  }

  /**
   * Handle detected errors and trigger incident if threshold is met
   */
  private async handleErrors(
    project: typeof projects.$inferSelect,
    errors: any[]
  ): Promise<void> {
    try {
      const projectId = project.id;
      const now = new Date();
      
      // Get or create error tracking
      let errorTracking = this.errorCounts.get(projectId);
      if (!errorTracking) {
        errorTracking = { count: 0, firstError: now };
        this.errorCounts.set(projectId, errorTracking);
      }

      // Reset if more than 5 minutes have passed
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      if (errorTracking.firstError < fiveMinutesAgo) {
        errorTracking.count = 0;
        errorTracking.firstError = now;
      }

      // Increment error count
      errorTracking.count += errors.length;
      this.errorCounts.set(projectId, errorTracking);

      logger.info(
        `Project ${project.vercelProjectName}: ${errorTracking.count} errors in last 5 minutes (threshold: ${this.ERROR_THRESHOLD})`
      );

      // Trigger incident if threshold is met
      if (errorTracking.count >= this.ERROR_THRESHOLD) {
        logger.error(
          `🚨 ERROR THRESHOLD REACHED for project ${project.vercelProjectName}! Triggering incident response...`
        );

        // Get latest error details
        const latestError = errors[0];
        const errorMessage = latestError.message || 'Multiple runtime errors detected';

        // Trigger orchestrator with project info for autoFix check
        await orchestrator.startIncidentResponse(project.userId, {
          source: 'runtime_monitor',
          projectId: project.id,
          projectName: project.vercelProjectName,
          deploymentId: latestError.deploymentId,
          errorCount: errorTracking.count,
          errorMessage: errorMessage,
          errors: errors.slice(0, 10), // Include first 10 errors
          githubOwner: project.githubOwner,
          githubRepo: project.githubRepo,
        });

        // Reset error count after triggering
        errorTracking.count = 0;
        errorTracking.firstError = now;
      }
    } catch (error: any) {
      logger.error('Error handling errors:', error);
    }
  }

  /**
   * Report error from external source (e.g., client-side SDK)
   * This is called when SDK sends errors via webhook
   */
  async reportError(
    projectId: string,
    error: {
      message: string;
      stack?: string;
      url?: string;
      userAgent?: string;
      timestamp?: Date;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId));

      if (!project || !project.enabled) {
        logger.warn(`Project ${projectId} not found or not enabled`);
        return;
      }

      // Extract file information from metadata
      const filePath = error.metadata?.filename || error.metadata?.sourceFile;
      const lineNumber = error.metadata?.lineno || error.metadata?.sourceLine;
      const columnNumber = error.metadata?.colno || error.metadata?.sourceColumn;

      logger.info(`📄 Error file details:`, {
        filePath: filePath,
        lineNumber: lineNumber,
        columnNumber: columnNumber,
        hasStack: !!error.stack,
        stackPreview: error.stack ? error.stack.substring(0, 200) : 'No stack',
      });

      // Store error in database
      const errorLog = {
        projectId: project.id,
        timestamp: error.timestamp || new Date(),
        level: 'error' as const,
        message: error.message,
        source: 'client_sdk',
        url: error.url,
        metadata: {
          stack: error.stack,
          userAgent: error.userAgent,
          // Explicitly include file information
          filename: filePath,
          lineno: lineNumber,
          colno: columnNumber,
          sourceFile: filePath,
          sourceLine: lineNumber,
          sourceColumn: columnNumber,
          ...error.metadata,
        },
      };

      // Store in database
      const insertedLogs = await db.insert(runtimeLogs).values(errorLog).returning();
      const insertedLog = insertedLogs[0];
      
      if (!insertedLog) {
        logger.error('Failed to insert error log into database');
        return;
      }
      
      logger.info(`✅ Stored error from SDK for project ${project.vercelProjectName}`);
      
      // Emit log via socket for real-time updates
      // Re-check socket in case module was cached before socket was set
      const currentSocket = io || getSocketIO();
      
      if (currentSocket) {
        const logForSocket = {
          id: insertedLog.id,
          projectId: insertedLog.projectId,
          timestamp: insertedLog.timestamp,
          level: insertedLog.level,
          message: insertedLog.message,
          source: insertedLog.source,
          url: insertedLog.url,
          metadata: insertedLog.metadata,
        };
        currentSocket.emit('logs:stream', { logs: [logForSocket] });
        logger.info(`📡 Emitted error log via socket for project ${project.id}`, {
          logId: logForSocket.id,
          projectId: project.id,
          socketConnected: currentSocket.sockets.sockets.size,
        });
      } else {
        logger.error('❌ Socket.io not available! This should not happen. Check initialization order.');
        logger.error('   Error log stored in DB but not emitted via socket.');
        logger.error('   Socket should be set in index.ts before services start.');
        logger.error('   Current io value:', { io: io === null ? 'null' : 'exists', type: typeof io });
      }

      // Check if this triggers an incident
      await this.handleErrors(project, [errorLog]);
    } catch (error: any) {
      logger.error('Error reporting error:', error);
      throw error;
    }
  }
}

export default new RuntimeMonitor();

