import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Extended Express Request with userId
 */
export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Auth Middleware (POC Version)
 * 
 * Always uses demo-user for POC testing
 * Check x-user-id header first, then default to demo-user
 */
export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction) {
  // Check x-user-id header (for API testing)
  const headerUserId = req.headers['x-user-id'] as string;
  if (headerUserId) {
    req.userId = headerUserId;
    logger.debug(`Auth: Using header userId: ${headerUserId}`);
    return next();
  }

  // Default to demo-user for POC
  req.userId = 'demo-user';
  logger.debug('Auth: Using demo-user (POC mode)');
  return next();
}

/**
 * Require Auth Middleware (POC Version)
 * 
 * In POC mode, demo-user is always authenticated
 * Only rejects if userId is completely missing
 */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  // Allow demo-user in POC mode
  return next();
}

