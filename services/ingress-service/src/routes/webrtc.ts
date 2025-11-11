import { Router } from 'express';
import MediaServer from '../webrtc/MediaServer';
import SessionManager, { SessionStatus } from '../session/SessionManager';
import { requireAuth } from '../auth/middleware';
import logger from '../utils/logger';
import { errorsTotal } from '../utils/metrics';

const router = Router();

/**
 * Get router RTP capabilities
 */
router.get('/capabilities', requireAuth, async (req, res) => {
  try {
    const mediaServer = MediaServer.getInstance();
    const capabilities = mediaServer.getRouterRtpCapabilities();

    if (!capabilities) {
      return res.status(500).json({ error: 'Media server not initialized' });
    }

    res.json({ capabilities });
  } catch (error: any) {
    logger.error({ error }, 'Failed to get RTP capabilities');
    errorsTotal.inc({ type: 'webrtc', endpoint: '/capabilities' });
    res.status(500).json({ error: 'Failed to get RTP capabilities' });
  }
});

/**
 * Create WebRTC transport for a session
 */
router.post('/transport/create', requireAuth, async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  try {
    const sessionManager = SessionManager.getInstance();
    const session = await sessionManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const mediaServer = MediaServer.getInstance();
    const transportOptions = await mediaServer.createWebRtcTransport(sessionId);

    res.json({ transportOptions });
  } catch (error: any) {
    logger.error({ error, sessionId }, 'Failed to create WebRTC transport');
    errorsTotal.inc({ type: 'webrtc', endpoint: '/transport/create' });
    res.status(500).json({ error: 'Failed to create transport' });
  }
});

/**
 * Connect WebRTC transport
 */
router.post('/transport/connect', requireAuth, async (req, res) => {
  const { sessionId, dtlsParameters } = req.body;

  if (!sessionId || !dtlsParameters) {
    return res.status(400).json({ error: 'Missing sessionId or dtlsParameters' });
  }

  try {
    const sessionManager = SessionManager.getInstance();
    const session = await sessionManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const mediaServer = MediaServer.getInstance();
    await mediaServer.connectTransport(sessionId, dtlsParameters);

    res.json({ success: true });
  } catch (error: any) {
    logger.error({ error, sessionId }, 'Failed to connect transport');
    errorsTotal.inc({ type: 'webrtc', endpoint: '/transport/connect' });
    res.status(500).json({ error: 'Failed to connect transport' });
  }
});

/**
 * Create audio producer
 */
router.post('/producer/create', requireAuth, async (req, res) => {
  const { sessionId, kind, rtpParameters } = req.body;

  if (!sessionId || !kind || !rtpParameters) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const sessionManager = SessionManager.getInstance();
    const session = await sessionManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const mediaServer = MediaServer.getInstance();
    const producerId = await mediaServer.createProducer(sessionId, kind, rtpParameters);

    // Update session status to active if not already
    if (session.status === SessionStatus.PENDING) {
      await sessionManager.updateSessionStatus(sessionId, SessionStatus.ACTIVE);
    }

    res.json({ producerId });
  } catch (error: any) {
    logger.error({ error, sessionId }, 'Failed to create producer');
    errorsTotal.inc({ type: 'webrtc', endpoint: '/producer/create' });
    res.status(500).json({ error: 'Failed to create producer' });
  }
});

/**
 * Create data producer for audio chunks
 */
router.post('/data-producer/create', requireAuth, async (req, res) => {
  const { sessionId, sctpStreamParameters } = req.body;

  if (!sessionId || !sctpStreamParameters) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const sessionManager = SessionManager.getInstance();
    const session = await sessionManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const mediaServer = MediaServer.getInstance();
    const dataProducerId = await mediaServer.createDataProducer(sessionId, sctpStreamParameters);

    res.json({ dataProducerId });
  } catch (error: any) {
    logger.error({ error, sessionId }, 'Failed to create data producer');
    errorsTotal.inc({ type: 'webrtc', endpoint: '/data-producer/create' });
    res.status(500).json({ error: 'Failed to create data producer' });
  }
});

export default router;
