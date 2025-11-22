import { Router } from 'express';
import { db } from '../db';
import { integrations } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { encrypt } from '../utils/encryption';
import logger from '../utils/logger';
import axios from 'axios';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Helper to get userId from authenticated request
const getUserId = (req: AuthRequest): string => {
  return req.userId || 'demo-user';
};

/**
 * GET /api/user/integrations
 * Get all integrations for user
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userId = getUserId(req);
    
    const userIntegrations = await db
      .select({
        id: integrations.id,
        provider: integrations.provider,
        enabled: integrations.enabled,
        config: integrations.config,
        lastUsed: integrations.lastUsed,
        createdAt: integrations.createdAt,
      })
      .from(integrations)
      .where(eq(integrations.userId, userId));
    
    return res.json({
      success: true,
      data: userIntegrations,
    });
  } catch (error: any) {
    logger.error('Error fetching integrations:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/user/integrations
 * Add new integration
 */
router.post('/', async (req: AuthRequest, res) => {
  try {
    const userId = getUserId(req);
    const { provider, accessToken, refreshToken, config } = req.body;
    
    if (!provider || !accessToken) {
      return res.status(400).json({ 
        error: 'Provider and accessToken are required' 
      });
    }
    
    // Encrypt tokens
    const encryptedToken = encrypt(accessToken);
    const encryptedRefresh = refreshToken ? encrypt(refreshToken) : null;
    
    // Check if integration already exists
    const existing = await db
      .select()
      .from(integrations)
      .where(
        and(
          eq(integrations.userId, userId),
          eq(integrations.provider, provider)
        )
      );
    
    let result;
    
    if (existing.length > 0) {
      // Update existing
      [result] = await db
        .update(integrations)
        .set({
          accessToken: encryptedToken,
          refreshToken: encryptedRefresh,
          config: config || {},
          enabled: true,
          updatedAt: new Date(),
        })
        .where(eq(integrations.id, existing[0].id))
        .returning();
    } else {
      // Create new
      [result] = await db
        .insert(integrations)
        .values({
          userId,
          provider,
          accessToken: encryptedToken,
          refreshToken: encryptedRefresh,
          config: config || {},
          enabled: true,
        })
        .returning();
    }
    
    logger.info(`Integration ${provider} ${existing.length > 0 ? 'updated' : 'created'} for user ${userId}`);
    
    // Return without sensitive data
    return res.json({
      success: true,
      data: {
        id: result.id,
        provider: result.provider,
        enabled: result.enabled,
        config: result.config,
      },
    });
  } catch (error: any) {
    logger.error('Error creating integration:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/user/integrations/test
 * Test integration connection
 */
router.post('/test', async (req, res) => {
  try {
    const { provider, accessToken, config } = req.body;
    
    if (!provider || !accessToken) {
      return res.status(400).json({ 
        error: 'Provider and accessToken are required' 
      });
    }
    
    let testResult;
    
    switch (provider) {
      case 'vercel':
        testResult = await testVercelConnection(accessToken, config);
        break;
      case 'github':
        testResult = await testGitHubConnection(accessToken);
        break;
      default:
        return res.status(400).json({ error: 'Unknown provider' });
    }
    
    return res.json({
      success: true,
      data: testResult,
    });
  } catch (error: any) {
    logger.error('Error testing connection:', error);
    return res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * DELETE /api/user/integrations/:id
 * Delete integration
 */
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    
    await db
      .delete(integrations)
      .where(
        and(
          eq(integrations.id, id),
          eq(integrations.userId, userId)
        )
      );
    
    logger.info(`Integration ${id} deleted for user ${userId}`);
    
    return res.json({
      success: true,
      message: 'Integration deleted',
    });
  } catch (error: any) {
    logger.error('Error deleting integration:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/user/integrations/:id/toggle
 * Enable/disable integration
 */
router.patch('/:id/toggle', async (req: AuthRequest, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { enabled } = req.body;
    
    const [result] = await db
      .update(integrations)
      .set({
        enabled,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrations.id, id),
          eq(integrations.userId, userId)
        )
      )
      .returning();
    
    return res.json({
      success: true,
      data: {
        id: result.id,
        enabled: result.enabled,
      },
    });
  } catch (error: any) {
    logger.error('Error toggling integration:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Helper: Test Vercel connection
async function testVercelConnection(token: string, config?: any) {
  try {
    const teamId = config?.teamId;
    const url = teamId
      ? `https://api.vercel.com/v9/projects?teamId=${teamId}&limit=1`
      : 'https://api.vercel.com/v9/projects?limit=1';
    
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    return {
      connected: true,
      message: `Found ${response.data.projects?.length || 0} project(s)`,
      projects: response.data.projects?.length || 0,
    };
  } catch (error: any) {
    throw new Error(error.response?.data?.error?.message || 'Invalid Vercel token');
  }
}

// Helper: Test GitHub connection
async function testGitHubConnection(token: string) {
  try {
    const response = await axios.get(
      'https://api.github.com/user',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );
    
    return {
      connected: true,
      message: `Connected as ${response.data.login}`,
      username: response.data.login,
      name: response.data.name,
    };
  } catch (error: any) {
    throw new Error(error.response?.data?.message || 'Invalid GitHub token');
  }
}

export default router;

