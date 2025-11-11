import { Router } from 'express';
import SessionManager, { SessionStatus } from '../session/SessionManager';
import MediaServer from '../webrtc/MediaServer';
import { requireAuth } from '../auth/middleware';
import logger from '../utils/logger';
import { errorsTotal } from '../utils/metrics';

const router = Router();

/**
 * Create a new session
 */
router.post('/create', requireAuth, async (req, res) => {
  const { audioConfig, voiceConfig, metadata } = req.body;

  try {
    const sessionManager = SessionManager.getInstance();

    const contextData = {
      metadata: metadata || {},
      userPreferences: {
        audioConfig: audioConfig || {
          sampleRate: 16000,
          channels: 1,
          bitDepth: 16,
          codec: 'opus',
        },
        voiceConfig: voiceConfig || {
          voiceId: 'default',
          speed: 1.0,
          pitch: 1.0,
          language: 'en-US',
        },
      },
    };

    const session = await sessionManager.createSession(req.userId!, contextData, 60);

    logger.info({ sessionId: session.id, userId: req.userId }, 'Session created via REST API');

    res.status(201).json({
      sessionId: session.id,
      status: session.status,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error: any) {
    logger.error({ error, userId: req.userId }, 'Failed to create session');
    errorsTotal.inc({ type: 'session', endpoint: '/create' });
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * Get session status
 */
router.get('/:sessionId', requireAuth, async (req, res) => {
  const { sessionId } = req.params;

  try {
    const sessionManager = SessionManager.getInstance();
    const session = await sessionManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({
      sessionId: session.id,
      status: session.status,
      contextData: session.contextData,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error: any) {
    logger.error({ error, sessionId }, 'Failed to get session');
    errorsTotal.inc({ type: 'session', endpoint: '/get' });
    res.status(500).json({ error: 'Failed to get session' });
  }
});

/**
 * Update session configuration
 */
router.patch('/:sessionId/config', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const { audioConfig, voiceConfig } = req.body;

  try {
    const sessionManager = SessionManager.getInstance();
    const session = await sessionManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const updates: any = {};
    if (audioConfig) {
      updates.userPreferences = { audioConfig };
    }
    if (voiceConfig) {
      updates.userPreferences = {
        ...(updates.userPreferences || {}),
        voiceConfig,
      };
    }

    await sessionManager.updateSessionContext(sessionId, updates);

    res.json({ success: true, message: 'Session configuration updated' });
  } catch (error: any) {
    logger.error({ error, sessionId }, 'Failed to update session config');
    errorsTotal.inc({ type: 'session', endpoint: '/update-config' });
    res.status(500).json({ error: 'Failed to update session configuration' });
  }
});

/**
 * End a session
 */
router.delete('/:sessionId', requireAuth, async (req, res) => {
  const { sessionId } = req.params;

  try {
    const sessionManager = SessionManager.getInstance();
    const session = await sessionManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Close WebRTC resources
    const mediaServer = MediaServer.getInstance();
    await mediaServer.closeSession(sessionId);

    // End session
    await sessionManager.endSession(sessionId);

    logger.info({ sessionId, userId: req.userId }, 'Session ended via REST API');

    res.json({ success: true, message: 'Session ended successfully' });
  } catch (error: any) {
    logger.error({ error, sessionId }, 'Failed to end session');
    errorsTotal.inc({ type: 'session', endpoint: '/end' });
    res.status(500).json({ error: 'Failed to end session' });
  }
});

/**
 * List user sessions
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const sessionManager = SessionManager.getInstance();
    const sessions = await sessionManager.getUserSessions(req.userId!);

    res.json({
      sessions: sessions.map((s) => ({
        sessionId: s.id,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
    });
  } catch (error: any) {
    logger.error({ error, userId: req.userId }, 'Failed to list sessions');
    errorsTotal.inc({ type: 'session', endpoint: '/list' });
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

export default router;
