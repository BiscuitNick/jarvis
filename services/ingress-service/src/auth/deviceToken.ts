import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db/pool';
import logger from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';

export interface DeviceTokenPayload {
  userId: string;
  deviceToken: string;
  type: 'access' | 'refresh';
}

/**
 * Generate a new device token for a user
 */
export async function generateDeviceToken(deviceIdentifier: string): Promise<{ userId: string; deviceToken: string; accessToken: string; refreshToken: string }> {
  const pool = getPool();

  try {
    // Check if user with this device identifier already exists
    const existingUser = await pool.query(
      'SELECT id, device_token FROM users WHERE device_token = $1',
      [deviceIdentifier]
    );

    let userId: string;
    let deviceToken: string;

    if (existingUser.rows.length > 0) {
      // User exists, use existing device token
      userId = existingUser.rows[0].id;
      deviceToken = existingUser.rows[0].device_token;

      logger.info({ userId, deviceToken }, 'Existing device token retrieved');
    } else {
      // Create new user with device token
      deviceToken = deviceIdentifier || uuidv4();
      const result = await pool.query(
        'INSERT INTO users (device_token) VALUES ($1) RETURNING id',
        [deviceToken]
      );
      userId = result.rows[0].id;

      logger.info({ userId, deviceToken }, 'New device token created');
    }

    // Generate JWT tokens
    const accessToken = jwt.sign(
      { userId, deviceToken, type: 'access' } as DeviceTokenPayload,
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId, deviceToken, type: 'refresh' } as DeviceTokenPayload,
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    return { userId, deviceToken, accessToken, refreshToken };
  } catch (error) {
    logger.error({ error }, 'Error generating device token');
    throw error;
  }
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): DeviceTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DeviceTokenPayload;
    return decoded;
  } catch (error) {
    logger.error({ error }, 'Token verification failed');
    throw new Error('Invalid or expired token');
  }
}

/**
 * Refresh an access token using a refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
  try {
    const decoded = verifyToken(refreshToken);

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    // Verify user still exists
    const pool = getPool();
    const result = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND device_token = $2',
      [decoded.userId, decoded.deviceToken]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    // Generate new access token
    const accessToken = jwt.sign(
      { userId: decoded.userId, deviceToken: decoded.deviceToken, type: 'access' } as DeviceTokenPayload,
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return { accessToken };
  } catch (error) {
    logger.error({ error }, 'Error refreshing access token');
    throw error;
  }
}

/**
 * Revoke a device token (soft delete or mark as revoked)
 */
export async function revokeDeviceToken(userId: string, deviceToken: string): Promise<void> {
  const pool = getPool();

  try {
    // For now, we'll just log the revocation
    // In production, you might want to add a 'revoked' column or delete the user
    logger.info({ userId, deviceToken }, 'Device token revoked');

    // Could also delete sessions associated with this token
    await pool.query(
      'UPDATE sessions SET expires_at = NOW() WHERE user_id = $1',
      [userId]
    );
  } catch (error) {
    logger.error({ error, userId, deviceToken }, 'Error revoking device token');
    throw error;
  }
}
