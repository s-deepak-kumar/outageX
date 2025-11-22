import { Router } from 'express';
import VercelIntegration from '../integrations/vercel';
import logger from '../utils/logger';
import { AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * GET /api/integrations/vercel/projects
 * Get all Vercel projects
 */
router.get('/vercel/projects', async (_req, res) => {
  try {
    const token = process.env.VERCEL_TOKEN;
    const teamId = process.env.VERCEL_TEAM_ID;

    if (!token) {
      return res.status(400).json({ 
        error: 'Vercel token not configured',
        message: 'Add VERCEL_TOKEN to .env file'
      });
    }

    const vercel = new VercelIntegration(token, teamId);
    const projects = await vercel.getProjects();

    return res.json({ 
      success: true,
      data: projects 
    });
  } catch (error: any) {
    logger.error('Error fetching Vercel projects:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch projects',
      message: error.message 
    });
  }
});

/**
 * GET /api/integrations/vercel/project/:name
 * Get specific project details
 */
router.get('/vercel/project/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const token = process.env.VERCEL_TOKEN;
    const teamId = process.env.VERCEL_TEAM_ID;

    if (!token) {
      return res.status(400).json({ error: 'Vercel token not configured' });
    }

    const vercel = new VercelIntegration(token, teamId);
    const project = await vercel.getProject(name);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    return res.json({ 
      success: true,
      data: project 
    });
  } catch (error: any) {
    logger.error('Error fetching Vercel project:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/integrations/vercel/project/:name/health
 * Get project health metrics
 */
router.get('/vercel/project/:name/health', async (req, res) => {
  try {
    const { name } = req.params;
    const token = process.env.VERCEL_TOKEN;
    const teamId = process.env.VERCEL_TEAM_ID;

    if (!token) {
      return res.status(400).json({ error: 'Vercel token not configured' });
    }

    const vercel = new VercelIntegration(token, teamId);
    const health = await vercel.getSystemHealth(name);

    return res.json({ 
      success: true,
      data: health 
    });
  } catch (error: any) {
    logger.error('Error fetching system health:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/integrations/vercel/project/:name/metrics
 * Get project metrics
 */
router.get('/vercel/project/:name/metrics', async (req, res) => {
  try {
    const { name } = req.params;
    const token = process.env.VERCEL_TOKEN;
    const teamId = process.env.VERCEL_TEAM_ID;

    if (!token) {
      return res.status(400).json({ error: 'Vercel token not configured' });
    }

    const vercel = new VercelIntegration(token, teamId);
    const metrics = await vercel.getMetrics(name);

    return res.json({ 
      success: true,
      data: metrics 
    });
  } catch (error: any) {
    logger.error('Error fetching metrics:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/integrations/vercel/deployments/:projectName
 * Get deployments for a project
 */
router.get('/vercel/deployments/:projectName', async (req, res) => {
  try {
    const { projectName } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const token = process.env.VERCEL_TOKEN;
    const teamId = process.env.VERCEL_TEAM_ID;

    if (!token) {
      return res.status(400).json({ error: 'Vercel token not configured' });
    }

    const vercel = new VercelIntegration(token, teamId);
    const deployments = await vercel.getDeployments(projectName, limit);

    return res.json({ 
      success: true,
      data: deployments 
    });
  } catch (error: any) {
    logger.error('Error fetching deployments:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/integrations/vercel/deployment/:id/logs
 * Get logs for a deployment
 */
router.get('/vercel/deployment/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const token = process.env.VERCEL_TOKEN;
    const teamId = process.env.VERCEL_TEAM_ID;

    if (!token) {
      return res.status(400).json({ error: 'Vercel token not configured' });
    }

    const vercel = new VercelIntegration(token, teamId);
    const logs = await vercel.getDeploymentLogs(id, limit);

    return res.json({ 
      success: true,
      data: logs 
    });
  } catch (error: any) {
    logger.error('Error fetching deployment logs:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/integrations/vercel/deployment/:id/redeploy
 * Trigger redeployment
 */
router.post('/vercel/deployment/:id/redeploy', async (req, res) => {
  try {
    const { id } = req.params;
    const token = process.env.VERCEL_TOKEN;
    const teamId = process.env.VERCEL_TEAM_ID;

    if (!token) {
      return res.status(400).json({ error: 'Vercel token not configured' });
    }

    const vercel = new VercelIntegration(token, teamId);
    const result = await vercel.redeploy(id);

    return res.json({ 
      success: true,
      data: result 
    });
  } catch (error: any) {
    logger.error('Error triggering redeploy:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/integrations/github/repos
 * Get user's GitHub repositories
 */
router.get('/github/repos', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId || 'demo-user';
    
    // Get GitHub integration from database
    const IntegrationManager = (await import('../services/integration-manager')).IntegrationManager;
    const integrationManager = new IntegrationManager(userId);
    const github = await integrationManager.getGitHubIntegration();

    if (!github) {
      return res.status(400).json({ 
        error: 'GitHub integration not found',
        message: 'Please connect your GitHub account at /integrations'
      });
    }

    // Use GitHub API to list repos
    const repos = await github.getRepositories({
      type: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: 100,
    });

    const reposData = repos.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      owner: repo.owner?.login || repo.owner,
      private: repo.private,
      html_url: repo.html_url,
      description: repo.description,
      updated_at: repo.updated_at,
      language: repo.language,
      default_branch: repo.default_branch,
    }));

    return res.json({ 
      success: true,
      data: reposData 
    });
  } catch (error: any) {
    logger.error('Error fetching GitHub repos:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;

