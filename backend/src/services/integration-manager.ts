import { db } from '../db';
import { integrations } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../utils/encryption';
import logger from '../utils/logger';
import VercelIntegration from '../integrations/vercel';
import GitHubIntegration from '../integrations/github';

/**
 * Integration Manager Service
 * 
 * Manages user integrations and provides access to integrated services
 */
export class IntegrationManager {
  private userId: string;
  private cachedIntegrations: Map<string, any> = new Map();

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Get all user integrations
   */
  async getUserIntegrations() {
    try {
      const userIntegrations = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.userId, this.userId),
            eq(integrations.enabled, true)
          )
        );

      return userIntegrations;
    } catch (error) {
      logger.error('Error fetching user integrations:', error);
      return [];
    }
  }

  /**
   * Get Vercel integration
   */
  async getVercelIntegration(): Promise<VercelIntegration | null> {
    try {
      // Check cache first
      if (this.cachedIntegrations.has('vercel')) {
        return this.cachedIntegrations.get('vercel');
      }

      const [integration] = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.userId, this.userId),
            eq(integrations.provider, 'vercel'),
            eq(integrations.enabled, true)
          )
        );

      if (!integration) {
        logger.debug(`No Vercel integration found for user ${this.userId}`);
        
        // Fallback to environment variable
        if (process.env.VERCEL_TOKEN) {
          logger.debug('Using VERCEL_TOKEN from environment');
          const vercel = new VercelIntegration(process.env.VERCEL_TOKEN);
          this.cachedIntegrations.set('vercel', vercel);
          return vercel;
        }
        
        return null;
      }

      // Decrypt token
      const token = decrypt(integration.accessToken);
      const vercel = new VercelIntegration(token);

      // Update lastUsed
      await db
        .update(integrations)
        .set({ lastUsed: new Date() })
        .where(eq(integrations.id, integration.id));

      // Cache it
      this.cachedIntegrations.set('vercel', vercel);

      logger.info(`Vercel integration loaded for user ${this.userId}`);
      return vercel;
    } catch (error) {
      logger.error('Error loading Vercel integration:', error);
      return null;
    }
  }

  /**
   * Get GitHub integration
   */
  async getGitHubIntegration(): Promise<GitHubIntegration | null> {
    try {
      // Check cache first
      if (this.cachedIntegrations.has('github')) {
        return this.cachedIntegrations.get('github');
      }

      const [integration] = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.userId, this.userId),
            eq(integrations.provider, 'github'),
            eq(integrations.enabled, true)
          )
        );

      if (!integration) {
        logger.debug(`No GitHub integration found for user ${this.userId}`);
        logger.warn('GitHub integration not found in database. Please connect GitHub at /integrations');
        return null;
      }

      // Decrypt token
      const token = decrypt(integration.accessToken);
      const config = integration.config as { owner?: string; repo?: string };
      const github = new GitHubIntegration(token, config.owner, config.repo);

      // Update lastUsed
      await db
        .update(integrations)
        .set({ lastUsed: new Date() })
        .where(eq(integrations.id, integration.id));

      // Cache it
      this.cachedIntegrations.set('github', github);

      logger.info(`GitHub integration loaded for user ${this.userId}`);
      return github;
    } catch (error) {
      logger.error('Error loading GitHub integration:', error);
      return null;
    }
  }

  /**
   * Get integration credentials (generic)
   */
  async getIntegrationCredentials(provider: string): Promise<{
    token: string;
    config: Record<string, any>;
  } | null> {
    try {
      const [integration] = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.userId, this.userId),
            eq(integrations.provider, provider as 'vercel' | 'github' | 'datadog' | 'sentry'),
            eq(integrations.enabled, true)
          )
        );

      if (!integration) {
        return null;
      }

      // Decrypt token
      const token = decrypt(integration.accessToken);

      // Update lastUsed
      await db
        .update(integrations)
        .set({ lastUsed: new Date() })
        .where(eq(integrations.id, integration.id));

      return {
        token,
        config: integration.config as Record<string, any>,
      };
    } catch (error) {
      logger.error(`Error loading ${provider} integration:`, error);
      return null;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cachedIntegrations.clear();
  }
}

export default IntegrationManager;

