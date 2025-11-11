import { Router } from 'express';
import { generateDeviceToken, refreshAccessToken, revokeDeviceToken } from '../auth/deviceToken';
import { requireAuth } from '../auth/middleware';
import logger from '../utils/logger';
import { authAttemptsTotal, errorsTotal } from '../utils/metrics';

const router = Router();

/**
 * Register or login with a device identifier
 */
router.post('/register', async (req, res) => {
  const { deviceIdentifier } = req.body;

  if (!deviceIdentifier) {
    return res.status(400).json({ error: 'Missing deviceIdentifier' });
  }

  try {
    const result = await generateDeviceToken(deviceIdentifier);

    authAttemptsTotal.inc({ status: 'success', method: 'register' });

    res.status(201).json({
      userId: result.userId,
      deviceToken: result.deviceToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
  } catch (error: any) {
    logger.error({ error, deviceIdentifier }, 'Failed to register device');
    authAttemptsTotal.inc({ status: 'failed', method: 'register' });
    errorsTotal.inc({ type: 'auth', endpoint: '/register' });
    res.status(500).json({ error: 'Failed to register device' });
  }
});

/**
 * Refresh access token
 */
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Missing refreshToken' });
  }

  try {
    const result = await refreshAccessToken(refreshToken);

    authAttemptsTotal.inc({ status: 'success', method: 'refresh' });

    res.json({
      accessToken: result.accessToken,
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to refresh token');
    authAttemptsTotal.inc({ status: 'failed', method: 'refresh' });
    errorsTotal.inc({ type: 'auth', endpoint: '/refresh' });
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

/**
 * Revoke device token (logout)
 */
router.post('/revoke', requireAuth, async (req, res) => {
  try {
    await revokeDeviceToken(req.userId!, req.deviceToken!);

    authAttemptsTotal.inc({ status: 'success', method: 'revoke' });

    res.json({ success: true, message: 'Device token revoked' });
  } catch (error: any) {
    logger.error({ error, userId: req.userId }, 'Failed to revoke token');
    errorsTotal.inc({ type: 'auth', endpoint: '/revoke' });
    res.status(500).json({ error: 'Failed to revoke token' });
  }
});

/**
 * Verify current token (for testing)
 */
router.get('/verify', requireAuth, (req, res) => {
  res.json({
    valid: true,
    userId: req.userId,
    deviceToken: req.deviceToken,
  });
});

export default router;
