import { Request, Response, NextFunction } from 'express';
import { verifyToken, DeviceTokenPayload } from './deviceToken';
import logger from '../utils/logger';
import { authAttemptsTotal } from '../utils/metrics';

// Extend Express Request type to include user information
declare global {
  namespace Express {
    interface Request {
      user?: DeviceTokenPayload;
      userId?: string;
      deviceToken?: string;
    }
  }
}

/**
 * Middleware to verify JWT authentication
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      authAttemptsTotal.inc({ status: 'missing_token', method: 'jwt' });
      logger.warn({ path: req.path }, 'Missing or invalid Authorization header');
      res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the token
    const decoded = verifyToken(token);

    if (decoded.type !== 'access') {
      authAttemptsTotal.inc({ status: 'invalid_token_type', method: 'jwt' });
      logger.warn({ path: req.path, tokenType: decoded.type }, 'Invalid token type');
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid token type' });
      return;
    }

    // Attach user information to request
    req.user = decoded;
    req.userId = decoded.userId;
    req.deviceToken = decoded.deviceToken;

    authAttemptsTotal.inc({ status: 'success', method: 'jwt' });
    logger.debug({ userId: decoded.userId, path: req.path }, 'Authentication successful');

    next();
  } catch (error) {
    authAttemptsTotal.inc({ status: 'failed', method: 'jwt' });
    logger.error({ error, path: req.path }, 'Authentication failed');
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}

/**
 * Optional authentication middleware - doesn't block if no token is present
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token present, continue without authentication
      next();
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (decoded.type === 'access') {
      req.user = decoded;
      req.userId = decoded.userId;
      req.deviceToken = decoded.deviceToken;
    }

    next();
  } catch (error) {
    // Invalid token, but don't block the request
    logger.debug({ error, path: req.path }, 'Optional auth failed, continuing anyway');
    next();
  }
}

/**
 * Rate limiting middleware (simple in-memory implementation)
 */
const rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();

export function rateLimit(maxRequests: number = 100, windowMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const identifier = req.userId || req.ip || 'unknown';
    const now = Date.now();

    let record = rateLimitStore.get(identifier);

    if (!record || now > record.resetTime) {
      // Create new rate limit record
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(identifier, record);
      next();
      return;
    }

    if (record.count >= maxRequests) {
      logger.warn({ identifier, count: record.count }, 'Rate limit exceeded');
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
      return;
    }

    record.count++;
    next();
  };
}
