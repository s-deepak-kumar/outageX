import { Router, Response } from 'express';
import { db } from '../db';
import { projects, runtimeLogs } from '../db/schema';
import { eq, and, desc, gte } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth';
import IntegrationManager from '../services/integration-manager';
import logger from '../utils/logger';
import crypto from 'crypto';

const router = Router();

/**
 * Get all projects for user
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || 'demo-user';
    
    const userProjects = await db.select().from(projects).where(eq(projects.userId, userId));

    return res.json(userProjects);
  } catch (error: any) {
    logger.error('Error fetching projects:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Get available Vercel projects (not yet added)
 */
router.get('/available', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || 'demo-user';
    
    // Get user's Vercel integration
    const integrationManager = new IntegrationManager(userId);
    const vercel = await integrationManager.getVercelIntegration();
    
    if (!vercel) {
      return res.status(400).json({ 
        error: 'No Vercel integration found. Please connect Vercel first.' 
      });
    }

    // Get all Vercel projects
    const vercelProjects = await vercel.getProjects();
    
    logger.info(`Fetched ${vercelProjects.length} projects from Vercel`);
    
    // Get already added projects
    const addedProjects = await db.select().from(projects).where(eq(projects.userId, userId));
    
    const addedProjectIds = new Set(addedProjects.map((p) => p.vercelProjectId));
    
    // Filter out already added projects and ensure required fields
    const availableProjects = vercelProjects
      .filter((p: any) => {
        const hasRequiredFields = p.id && p.name;
        if (!hasRequiredFields) {
          logger.warn('Project missing required fields:', p);
        }
        return hasRequiredFields && !addedProjectIds.has(p.id);
      })
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        framework: p.framework || 'unknown',
        link: p.link || null,
      }));

    logger.info(`Returning ${availableProjects.length} available projects`);
    return res.json(availableProjects);
  } catch (error: any) {
    logger.error('Error fetching available projects:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Add project with automatic webhook setup
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || 'demo-user';
    const { vercelProjectId, vercelProjectName, githubOwner, githubRepo, autoFix, autoFixThreshold } = req.body;

    logger.info('Received project creation request:', {
      vercelProjectId,
      vercelProjectName,
      githubOwner,
      githubRepo,
      hasAllFields: !!(vercelProjectId && vercelProjectName && githubOwner && githubRepo),
    });

    if (!vercelProjectId || !vercelProjectName || !githubOwner || !githubRepo) {
      logger.error('Missing required fields:', {
        vercelProjectId: !!vercelProjectId,
        vercelProjectName: !!vercelProjectName,
        githubOwner: !!githubOwner,
        githubRepo: !!githubRepo,
        body: req.body,
      });
      return res.status(400).json({ 
        error: 'Missing required fields: vercelProjectId, vercelProjectName, githubOwner, githubRepo',
        received: {
          vercelProjectId: !!vercelProjectId,
          vercelProjectName: !!vercelProjectName,
          githubOwner: !!githubOwner,
          githubRepo: !!githubRepo,
        }
      });
    }

    const integrationManager = new IntegrationManager(userId);
    
    // 1. Create Vercel webhook automatically
    logger.info(`Creating Vercel webhook for project: ${vercelProjectName}`);
    const vercel = await integrationManager.getVercelIntegration();
    
    if (!vercel) {
      return res.status(400).json({ error: 'No Vercel integration found' });
    }

    const webhookSecret = crypto.randomBytes(32).toString('hex');
    const webhookUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    
    // Log the webhook URL being used for debugging
    logger.info(`🔗 Using webhook URL: ${webhookUrl}`);
    logger.info(`🔗 BACKEND_URL from env: ${process.env.BACKEND_URL || 'NOT SET'}`);
    
    // Try to create webhooks and log drain, but don't fail if they can't be created (for local dev)
    let vercelWebhook: any = null;
    let githubWebhook: any = null;
    let vercelLogDrain: any = null;
    
    // Vercel webhooks require a publicly accessible URL
    const isLocalhost = webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1');
    
    if (isLocalhost) {
      logger.warn('⚠️  Using localhost for webhook URL. Vercel requires a publicly accessible URL.');
      logger.warn('💡 For local testing, use ngrok: npx ngrok http 3001');
      logger.warn('💡 Or set BACKEND_URL in .env to your public URL');
      logger.warn('💡 Make sure to restart the backend server after setting BACKEND_URL!');
    } else {
      logger.info(`✅ Using public URL for webhooks: ${webhookUrl}`);
    }
    
    // Try to create Vercel webhook
    // Note: Some projects don't support all event types, so we use the most common ones
    try {
      vercelWebhook = await vercel.createWebhook(vercelProjectId, {
        url: `${webhookUrl}/api/webhooks/vercel`,
        events: ['deployment.created', 'deployment.error'],
        secret: webhookSecret,
      });
      logger.info(`✅ Vercel webhook created: ${vercelWebhook.id}`);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      logger.warn(`⚠️  Failed to create Vercel webhook: ${errorMessage}`);
      logger.warn('   Project will be added without Vercel webhook. You can add it manually later.');
      if (isLocalhost) {
        logger.warn('   This is expected for localhost. Use ngrok for local testing.');
      }
      // Continue without webhook for local development
    }

    // 2. Create GitHub webhook automatically
    const github = await integrationManager.getGitHubIntegration();
    
    if (!github) {
      // Rollback Vercel webhook if it was created
      if (vercelWebhook) {
        try {
          await vercel.deleteWebhook(vercelWebhook.id);
        } catch (e) {
          logger.warn('Failed to rollback Vercel webhook:', e);
        }
      }
      return res.status(400).json({ error: 'No GitHub integration found' });
    }

    try {
      githubWebhook = await github.createWebhook(githubOwner, githubRepo, {
        url: `${webhookUrl}/api/webhooks/github`,
        events: ['push', 'pull_request', 'deployment_status'],
        secret: webhookSecret,
      });
      logger.info(`✅ GitHub webhook created: ${githubWebhook.id}`);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message;
      logger.warn(`⚠️  Failed to create GitHub webhook: ${errorMessage}`);
      logger.warn('   Project will be added without GitHub webhook. You can add it manually later.');
      if (isLocalhost) {
        logger.warn('   This is expected for localhost. Use ngrok for local testing.');
      }
      // Continue without webhook for local development
    }

    // 3. Get project details
    const projectDetails = await vercel.getProject(vercelProjectName);

    // 4. Save to database first (we need the project ID for Log Drain)
    const [project] = await db.insert(projects).values({
      userId,
      vercelProjectId,
      vercelProjectName,
      vercelWebhookId: vercelWebhook?.id || null,
      vercelLogDrainId: null, // Will be updated after creation
      githubOwner,
      githubRepo,
      githubWebhookId: githubWebhook?.id ? String(githubWebhook.id) : null,
      enabled: true,
      autoFix: autoFix || false,
      autoFixThreshold: autoFixThreshold || 90,
      framework: projectDetails?.framework || 'unknown',
      lastDeployment: null,
    }).returning();

    // 4.5. Create Vercel Log Drain for runtime logs (console.log, function execution)
    // This is the ONLY way to get runtime logs from Vercel via API
    // We need the project ID from DB to include in Log Drain headers
    if (!isLocalhost && project) {
      try {
        vercelLogDrain = await vercel.createLogDrain({
          name: `OutageX - ${vercelProjectName}`,
          url: `${webhookUrl}/api/webhooks/vercel-logs`,
          projectIds: [vercelProjectId],
          headers: {
            'X-Project-Id': project.id, // Include project ID in headers for webhook handler
            'X-Vercel-Project-Id': vercelProjectId, // Also include Vercel project ID as fallback
          },
        });
        logger.info(`✅ Vercel Log Drain created: ${vercelLogDrain.id}`);
        
        // Update project with Log Drain ID
        await db
          .update(projects)
          .set({ vercelLogDrainId: vercelLogDrain.id })
          .where(eq(projects.id, project.id));
        
        project.vercelLogDrainId = vercelLogDrain.id;
      } catch (error: any) {
        const errorMessage = error.response?.data?.error?.message || error.message;
        const isPlanLimitation = errorMessage?.toLowerCase().includes('hobby') || 
                                 errorMessage?.toLowerCase().includes('pro trial') ||
                                 errorMessage?.toLowerCase().includes('not available');
        
        if (isPlanLimitation) {
          logger.warn(`⚠️  Log Drains not available: ${errorMessage}`);
          logger.warn('   💡 Log Drains require a Vercel Pro (paid) account.');
          logger.warn('   💡 Runtime logs are only available through:');
          logger.warn('      - Vercel Dashboard (Logs tab) - Manual viewing');
          logger.warn('      - Upgrade to Pro plan - Enables Log Drains API');
          logger.warn('      - Third-party logging services (Datadog, Logflare, etc.)');
        } else {
          logger.warn(`⚠️  Failed to create Vercel Log Drain: ${errorMessage}`);
          logger.warn('   Runtime logs will not be available. Log Drains require a publicly accessible URL.');
          logger.warn('   For local testing, use ngrok: npx ngrok http 3001');
        }
        // Continue without log drain
      }
    } else if (isLocalhost) {
      logger.warn('⚠️  Skipping Log Drain creation (localhost detected)');
      logger.warn('💡 Log Drains require a publicly accessible URL to receive runtime logs');
      logger.warn('💡 Use ngrok for local testing: npx ngrok http 3001');
      logger.warn('💡 Set BACKEND_URL in .env to your ngrok URL and restart the server');
    }

    logger.info(`✅ Project added: ${project.id}`);

    // Check if Log Drain failed due to plan limitation
    const logDrainError = vercelLogDrain ? null : 
      (isLocalhost ? 'localhost not supported' : 
       'Log Drains require Vercel Pro (paid) account. Hobby/Pro Trial plans do not support Log Drains.');

    const webhookStatus = {
      vercel: vercelWebhook ? { id: vercelWebhook.id, url: vercelWebhook.url } : { created: false, reason: isLocalhost ? 'localhost not supported' : 'creation failed' },
      github: githubWebhook ? { id: githubWebhook.id, url: githubWebhook.config?.url } : { created: false, reason: isLocalhost ? 'localhost not supported' : 'creation failed' },
      logDrain: vercelLogDrain ? { id: vercelLogDrain.id, url: `${webhookUrl}/api/webhooks/vercel-logs` } : { created: false, reason: logDrainError },
    };

    let message = 'Project added successfully';
    if (vercelWebhook && githubWebhook && vercelLogDrain) {
      message = 'Project added successfully with automatic webhook and Log Drain setup';
    } else if (vercelWebhook && githubWebhook) {
      message = 'Project added successfully. Log Drains require Vercel Pro (paid) account.';
    } else {
      message = 'Project added successfully. Some webhooks could not be created.';
    }

    return res.status(201).json({
      success: true,
      message,
      project,
      webhooks: webhookStatus,
    });
  } catch (error: any) {
    logger.error('Error adding project:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Get single project
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || 'demo-user';
    const { id } = req.params;

    const [project] = await db.select().from(projects).where(
      and(
        eq(projects.id, id),
        eq(projects.userId, userId)
      )
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    return res.json(project);
  } catch (error: any) {
    logger.error('Error fetching project:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Get project health
 */
router.get('/:id/health', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || 'demo-user';
    const { id } = req.params;

    const [project] = await db.select().from(projects).where(
      and(
        eq(projects.id, id),
        eq(projects.userId, userId)
      )
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const integrationManager = new IntegrationManager(userId);
    const vercel = await integrationManager.getVercelIntegration();
    
    if (!vercel) {
      return res.status(400).json({ error: 'No Vercel integration found' });
    }

    const health = await vercel.getSystemHealth(project.vercelProjectName);
    return res.json({ success: true, data: health });
  } catch (error: any) {
    logger.error('Error fetching project health:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Get project metrics
 */
router.get('/:id/metrics', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || 'demo-user';
    const { id } = req.params;

    const [project] = await db.select().from(projects).where(
      and(
        eq(projects.id, id),
        eq(projects.userId, userId)
      )
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const integrationManager = new IntegrationManager(userId);
    const vercel = await integrationManager.getVercelIntegration();
    
    if (!vercel) {
      return res.status(400).json({ error: 'No Vercel integration found' });
    }

    const metrics = await vercel.getMetrics(project.vercelProjectName);
    return res.json({ success: true, data: metrics });
  } catch (error: any) {
    logger.error('Error fetching project metrics:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Get project system metrics (CPU, Memory, Error Rate, Requests/sec)
 */
router.get('/:id/system-metrics', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || 'demo-user';
    const { id } = req.params;

    const [project] = await db.select().from(projects).where(
      and(
        eq(projects.id, id),
        eq(projects.userId, userId)
      )
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const integrationManager = new IntegrationManager(userId);
    const vercel = await integrationManager.getVercelIntegration();
    
    if (!vercel) {
      return res.status(400).json({ error: 'No Vercel integration found' });
    }

    const systemMetrics = await vercel.getSystemMetrics(project.vercelProjectName);
    return res.json({ success: true, data: systemMetrics });
  } catch (error: any) {
    logger.error('Error fetching system metrics:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Get project deployments
 */
router.get('/:id/deployments', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || 'demo-user';
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const [project] = await db.select().from(projects).where(
      and(
        eq(projects.id, id),
        eq(projects.userId, userId)
      )
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const integrationManager = new IntegrationManager(userId);
    const vercel = await integrationManager.getVercelIntegration();
    
    if (!vercel) {
      return res.status(400).json({ error: 'No Vercel integration found' });
    }

    const deployments = await vercel.getDeployments(project.vercelProjectName, limit);
    return res.json({ success: true, data: deployments });
  } catch (error: any) {
    logger.error('Error fetching deployments:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Fetch and store logs from external API URL
 * This allows users to fetch logs from any API endpoint and store them in DB
 */
router.post('/:id/logs/fetch', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || 'demo-user';
    const { id } = req.params;
    const { apiUrl, headers, limit, since } = req.body;

    if (!apiUrl) {
      return res.status(400).json({ error: 'apiUrl is required' });
    }

    const [project] = await db.select().from(projects).where(
      and(
        eq(projects.id, id),
        eq(projects.userId, userId)
      )
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.enabled) {
      return res.status(400).json({ error: 'Project monitoring is disabled' });
    }

    const runtimeMonitor = (await import('../services/runtime-monitor')).default;

    const result = await runtimeMonitor.fetchAndStoreLogs(id, apiUrl, {
      headers,
      limit: limit ? parseInt(limit) : undefined,
      since: since ? new Date(since) : undefined,
    });

    return res.json({
      success: true,
      message: `Fetched and stored ${result.stored} logs (${result.errors} errors)`,
      stored: result.stored,
      errors: result.errors,
    });
  } catch (error: any) {
    logger.error('Error fetching/storing logs:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Get deployment logs (build-time logs) or runtime logs
 */
router.get('/:id/logs', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || 'demo-user';
    const { id } = req.params;
    const logType = (req.query.type as string) || 'runtime'; // 'runtime' or 'deployment'
    const deploymentId = req.query.deploymentId as string;
    const limit = parseInt(req.query.limit as string) || 100;
    const since = req.query.since ? parseInt(req.query.since as string) : undefined;

    const [project] = await db.select().from(projects).where(
      and(
        eq(projects.id, id),
        eq(projects.userId, userId)
      )
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const integrationManager = new IntegrationManager(userId);
    const vercel = await integrationManager.getVercelIntegration();
    
    if (!vercel) {
      return res.status(400).json({ error: 'No Vercel integration found' });
    }

    let logs: any[] = [];

    if (logType === 'runtime') {
      // Get runtime logs from database (stored via SDK or Log Drain webhook)
      // Priority: SDK logs first, then Vercel Log Drain logs
      const whereConditions: any[] = [eq(runtimeLogs.projectId, id)];
      if (since) {
        whereConditions.push(gte(runtimeLogs.timestamp, new Date(since)));
      }
      
      const dbLogs = await db
        .select()
        .from(runtimeLogs)
        .where(and(...whereConditions))
        .orderBy(desc(runtimeLogs.timestamp))
        .limit(limit * 2); // Get more logs to filter
      
      // Prioritize SDK logs: show SDK logs first, then Vercel logs
      const sdkLogs = dbLogs.filter(log => log.source === 'client_sdk');
      const vercelLogs = dbLogs.filter(log => log.source === 'vercel_log_drain');
      
      // Combine: SDK logs first, then Vercel logs, limit to requested amount
      const combinedLogs = [...sdkLogs, ...vercelLogs].slice(0, limit);
      
      // Convert database logs to API format
      logs = combinedLogs.map((log) => ({
        id: log.id,
        message: log.message,
        level: log.level,
        source: log.source,
        timestamp: log.timestamp,
        created: log.timestamp,
        deploymentId: log.deploymentId,
        functionName: log.functionName,
        requestId: log.requestId,
        url: log.url,
        method: log.method,
        statusCode: log.statusCode,
        metadata: log.metadata,
      }));
      
      logger.info(`Fetched ${logs.length} runtime logs from database for project ${id} (${sdkLogs.length} SDK, ${vercelLogs.length} Vercel)`);
      
      if (logs.length === 0) {
        logger.info('No runtime logs found. Add the OutageX SDK to your app to capture runtime errors automatically.');
      }
    } else {
      // Get deployment logs (build-time logs)
      let targetDeploymentId = deploymentId;
      
      if (!targetDeploymentId) {
        const deployments = await vercel.getDeployments(project.vercelProjectName, 1);
        if (deployments && deployments.length > 0) {
          targetDeploymentId = deployments[0].uid;
        } else {
          return res.json({ success: true, data: [] });
        }
      }

      logs = await vercel.getDeploymentLogs(targetDeploymentId, limit);
    }

    return res.json({ success: true, data: logs, type: logType });
  } catch (error: any) {
    logger.error('Error fetching logs:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Update project settings
 */
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || 'demo-user';
    const { id } = req.params;
    const { enabled, autoFix, autoFixThreshold } = req.body;

    const [updated] = await db
      .update(projects)
      .set({
        ...(enabled !== undefined && { enabled }),
        ...(autoFix !== undefined && { autoFix }),
        ...(autoFixThreshold !== undefined && { autoFixThreshold }),
        updatedAt: new Date(),
      })
      .where(and(
        eq(projects.id, id),
        eq(projects.userId, userId)
      ))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Project not found' });
    }

    return res.json(updated);
  } catch (error: any) {
    logger.error('Error updating project:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Delete project and remove webhooks
 */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || 'demo-user';
    const { id } = req.params;

    // Get project
    const [project] = await db.select().from(projects).where(
      and(
        eq(projects.id, id),
        eq(projects.userId, userId)
      )
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const integrationManager = new IntegrationManager(userId);

    // Delete Vercel webhook
    if (project.vercelWebhookId) {
      try {
        const vercel = await integrationManager.getVercelIntegration();
        if (vercel) {
          await vercel.deleteWebhook(project.vercelWebhookId);
          logger.info(`✅ Deleted Vercel webhook: ${project.vercelWebhookId}`);
        }
      } catch (error: any) {
        logger.warn('Failed to delete Vercel webhook:', error.message);
      }
    }

    // Delete GitHub webhook
    if (project.githubWebhookId) {
      try {
        const github = await integrationManager.getGitHubIntegration();
        if (github) {
          await github.deleteWebhook(
            project.githubOwner,
            project.githubRepo,
            parseInt(project.githubWebhookId)
          );
          logger.info(`✅ Deleted GitHub webhook: ${project.githubWebhookId}`);
        }
      } catch (error: any) {
        logger.warn('Failed to delete GitHub webhook:', error.message);
      }
    }

    // Delete Vercel Log Drain
    if (project.vercelLogDrainId) {
      try {
        const vercel = await integrationManager.getVercelIntegration();
        if (vercel) {
          await vercel.deleteLogDrain(project.vercelLogDrainId);
          logger.info(`✅ Deleted Vercel Log Drain: ${project.vercelLogDrainId}`);
        }
      } catch (error: any) {
        logger.warn('Failed to delete Vercel Log Drain:', error.message);
      }
    }

    // Delete from database
    await db.delete(projects).where(eq(projects.id, id));

    return res.json({ 
      success: true,
      message: 'Project and webhooks removed successfully' 
    });
  } catch (error: any) {
    logger.error('Error deleting project:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;

