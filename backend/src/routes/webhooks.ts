import { Router, Request, Response } from 'express';
import orchestrator from '../agent/orchestrator';
import logger from '../utils/logger';
import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';

const router = Router();

// Socket.io instance will be set by index.ts
let io: SocketIOServer | null = null;

export function setSocketIO(socketIO: SocketIOServer): void {
  io = socketIO;
}

/**
 * Vercel Deployment Webhook
 * Automatically triggers incident response on deployment failures
 * 
 * Setup in Vercel:
 * 1. Project Settings → Webhooks
 * 2. Add webhook: https://your-backend.com/api/webhooks/vercel
 * 3. Select events: deployment.created, deployment.error, deployment.ready
 */
router.post('/vercel', async (req: Request, res: Response) => {
  try {
    const event = req.body;
    
    logger.info(`Vercel webhook received: ${event.type}`);

    // Verify webhook signature if secret is configured
    if (process.env.VERCEL_WEBHOOK_SECRET) {
      const signature = req.headers['x-vercel-signature'] as string;
      const isValid = verifyVercelSignature(
        JSON.stringify(req.body),
        signature,
        process.env.VERCEL_WEBHOOK_SECRET
      );

      if (!isValid) {
        logger.warn('Invalid Vercel webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Handle different event types
    switch (event.type) {
      case 'deployment.error':
      case 'deployment.failed':
        logger.error(`Deployment failed: ${event.deployment?.url}`);
        
        // Trigger automatic incident response
        await orchestrator.startIncidentResponse('demo-user', {
          source: 'vercel_webhook',
          deploymentId: event.deployment?.id,
          deploymentUrl: event.deployment?.url,
          error: event.deployment?.error,
        });
        
        break;

      case 'deployment.ready':
        logger.info(`Deployment succeeded: ${event.deployment?.url}`);
        // Could track successful deployments here
        break;

      default:
        logger.debug(`Unhandled Vercel event: ${event.type}`);
    }

    return res.json({ received: true });
  } catch (error: any) {
    logger.error('Error handling Vercel webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GitHub Webhook
 * Monitors repository events for incidents
 * 
 * Setup in GitHub:
 * 1. Repository Settings → Webhooks
 * 2. Add webhook: https://your-backend.com/api/webhooks/github
 * 3. Select events: push, pull_request, deployment_status
 */
router.post('/github', async (req: Request, res: Response) => {
  try {
    const event = req.headers['x-github-event'] as string;
    const payload = req.body;

    logger.info(`GitHub webhook received: ${event}`);

    // Verify webhook signature
    if (process.env.GITHUB_WEBHOOK_SECRET) {
      const signature = req.headers['x-hub-signature-256'] as string;
      const isValid = verifyGitHubSignature(
        JSON.stringify(req.body),
        signature,
        process.env.GITHUB_WEBHOOK_SECRET
      );

      if (!isValid) {
        logger.warn('Invalid GitHub webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Handle different event types
    switch (event) {
      case 'deployment_status':
        if (payload.deployment_status?.state === 'failure' || 
            payload.deployment_status?.state === 'error') {
          logger.error(`GitHub deployment failed: ${payload.deployment?.url}`);
          
          // Trigger automatic incident response
          await orchestrator.startIncidentResponse('demo-user', {
            source: 'github_webhook',
            deploymentId: payload.deployment?.id,
            deploymentUrl: payload.deployment?.url,
            commit: payload.deployment?.sha,
          });
        }
        break;

      case 'push':
        // Could monitor for broken builds
        logger.debug(`Push to ${payload.repository?.full_name}`);
        break;

      default:
        logger.debug(`Unhandled GitHub event: ${event}`);
    }

    return res.json({ received: true });
  } catch (error: any) {
    logger.error('Error handling GitHub webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Client-side Error Reporting Webhook
 * Receives errors from client-side SDK (browser, mobile, etc.)
 * 
 * This allows automatic error detection even without Log Drains
 */
router.post('/error-report', async (req: Request, res: Response) => {
  try {
    const { projectId, error, metadata } = req.body;

    if (!projectId || !error) {
      return res.status(400).json({ error: 'projectId and error are required' });
    }

    logger.info(`📥 Error reported from client for project ${projectId}:`, {
      message: error.message,
      url: error.url,
    });

    // Import runtime monitor
    const runtimeMonitor = (await import('../services/runtime-monitor')).default;

    // Extract file information from error
    const filePath = error.filename || metadata?.sourceFile || metadata?.filename;
    const lineNumber = error.lineno || metadata?.sourceLine || metadata?.lineno;
    const columnNumber = error.colno || metadata?.sourceColumn || metadata?.colno;

    logger.info(`📋 Error file information:`, {
      filename: error.filename,
      lineno: error.lineno,
      colno: error.colno,
      extractedFilePath: metadata?.sourceFile,
      extractedLine: metadata?.sourceLine,
      finalFilePath: filePath,
      finalLine: lineNumber,
      finalColumn: columnNumber,
      stack: error.stack ? error.stack.substring(0, 300) : 'No stack',
    });

    // Report error to runtime monitor
    await runtimeMonitor.reportError(projectId, {
      message: error.message || 'Unknown error',
      stack: error.stack,
      url: error.url || req.headers.referer,
      userAgent: req.headers['user-agent'],
      timestamp: new Date(),
      metadata: {
        ...metadata,
        ...error,
        // Explicitly include file information
        filename: filePath, // Use extracted/actual filename
        lineno: lineNumber,
        colno: columnNumber,
        sourceFile: filePath,
        sourceLine: lineNumber,
        sourceColumn: columnNumber,
      },
    });

    return res.json({ received: true, message: 'Error reported successfully' });
  } catch (error: any) {
    logger.error('Error handling error report:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Manual trigger endpoint (for testing)
 * Allows manual incident triggering with custom scenario
 */
router.post('/trigger-incident', async (req: Request, res: Response) => {
  try {
    const { userId, scenario } = req.body;
    
    logger.info(`Manual incident trigger requested by user: ${userId || 'demo-user'}`);
    
    await orchestrator.startIncidentResponse(userId || 'demo-user', scenario);
    
    return res.json({ 
      success: true,
      message: 'Incident response started' 
    });
  } catch (error: any) {
    logger.error('Error triggering manual incident:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Vercel Log Drain Webhook
 * Receives runtime logs (console.log, function execution) from Vercel
 * 
 * IMPORTANT: This is the ONLY way to get runtime logs from Vercel programmatically.
 * Vercel's REST API does NOT provide runtime logs - only Log Drains do.
 * 
 * Log Drains send logs to this endpoint via HTTP POST in JSON format.
 * Format: https://vercel.com/docs/logs#log-drains
 */
router.post('/vercel-logs', async (req: Request, res: Response) => {
  try {
    // Vercel Log Drains send logs as an array of log objects
    const logs = Array.isArray(req.body) ? req.body : [req.body];
    
    logger.info(`📥 Received ${logs.length} runtime log(s) from Vercel Log Drain`);

    // Get project ID from header (set when creating Log Drain)
    let projectId = req.headers['x-project-id'] as string;
    
    // Fallback: Try to find project by Vercel project ID from log metadata
    if (!projectId && logs.length > 0) {
      const firstLog = logs[0];
      const vercelProjectId = firstLog?.projectId || firstLog?.project?.id;
      
      if (vercelProjectId) {
        const { db } = await import('../db');
        const { projects } = await import('../db/schema');
        const { eq } = await import('drizzle-orm');
        
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.vercelProjectId, vercelProjectId))
          .limit(1);
        
        if (project) {
          projectId = project.id;
          logger.info(`Found project ${projectId} by Vercel project ID: ${vercelProjectId}`);
        }
      }
    }
    
    if (!projectId) {
      logger.warn('⚠️  No project ID found in Log Drain webhook. Logs not stored.');
      logger.warn('   Logs payload:', JSON.stringify(logs[0] || {}, null, 2));
      // Still return 200 to prevent Vercel from retrying
      return res.json({ received: true, stored: 0, warning: 'Project ID not found' });
    }

    await storeLogs(projectId, logs);
    
    return res.json({ received: true, stored: logs.length });
  } catch (error: any) {
    logger.error('Error handling Vercel Log Drain webhook:', error);
    // Return 200 to prevent Vercel from retrying on our errors
    return res.status(200).json({ received: true, error: error.message });
  }
});

/**
 * Store runtime logs in database
 */
async function storeLogs(projectId: string, logs: any[]) {
  try {
    const { db } = await import('../db');
    const { runtimeLogs } = await import('../db/schema');
    
    const logEntries = logs.map((log: any) => {
      // Vercel Log Drain format: https://vercel.com/docs/logs#log-drains
      // Logs can have different formats, handle both:
      // - { timestamp: 1234567890, message: "...", level: "info", ... }
      // - { date: "2024-...", text: "...", type: "stdout", ... }
      
      let timestamp: Date;
      if (log.timestamp) {
        // Vercel sends timestamp in seconds (Unix timestamp)
        timestamp = new Date(log.timestamp * 1000);
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
        deploymentId: log.deploymentId || log.deployment?.id || log.deploymentId,
        functionName: log.function?.name || log.functionName || log.function,
        requestId: log.requestId || log.id || log.request?.id,
        url: log.url || log.path || log.request?.url,
        method: log.method || log.request?.method,
        statusCode: log.statusCode || log.status || log.response?.statusCode,
        source: 'vercel_log_drain', // Explicitly mark as Vercel Log Drain
        metadata: {
          ...log,
          originalPayload: log,
        },
      };
    });

    if (logEntries.length > 0) {
      // Insert logs and get the inserted IDs
      const insertedLogs = await db.insert(runtimeLogs).values(logEntries).returning();
      logger.info(`✅ Stored ${insertedLogs.length} runtime log(s) for project ${projectId}`);
      
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
  } catch (error: any) {
    logger.error('Error storing runtime logs:', error);
    throw error;
  }
}

/**
 * Health check endpoint for webhook testing
 */
router.get('/health', (_req: Request, res: Response) => {
  return res.json({ 
    status: 'healthy',
    webhooks: {
      vercel: '/api/webhooks/vercel',
      github: '/api/webhooks/github',
      vercelLogs: '/api/webhooks/vercel-logs',
      manual: '/api/webhooks/trigger-incident',
    }
  });
});

/**
 * Verify Vercel webhook signature
 */
function verifyVercelSignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha1', secret);
  const digest = 'sha1=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

/**
 * Verify GitHub webhook signature
 */
function verifyGitHubSignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

export default router;

