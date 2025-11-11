/**
 * orchestration.ts
 *
 * API routes for real-time pipeline orchestration
 */

import express, { Request, Response } from 'express';
import { PipelineOrchestrator } from '../orchestration/PipelineOrchestrator';
import { InterruptionHandler } from '../orchestration/InterruptionHandler';
import { LatencyMonitor } from '../orchestration/LatencyMonitor';
import { logger } from '../utils/logger';
import WebSocket from 'ws';

const router = express.Router();

let orchestrator: PipelineOrchestrator;
let interruptionHandler: InterruptionHandler;
let latencyMonitor: LatencyMonitor;

/**
 * Initialize orchestration services
 */
export function initializeOrchestration(
  _orchestrator: PipelineOrchestrator,
  _interruptionHandler: InterruptionHandler,
  _latencyMonitor: LatencyMonitor
): void {
  orchestrator = _orchestrator;
  interruptionHandler = _interruptionHandler;
  latencyMonitor = _latencyMonitor;
}

/**
 * Start a new voice interaction pipeline
 * POST /api/orchestration/start
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { sessionId, userId } = req.body;

    if (!sessionId || !userId) {
      return res.status(400).json({ error: 'sessionId and userId are required' });
    }

    // Start pipeline
    const pipeline = await orchestrator.startPipeline(sessionId, userId, {
      onTranscriptPartial: (transcript) => {
        logger.debug({ sessionId, transcript }, 'Partial transcript');
      },
      onTranscriptFinal: (transcript) => {
        logger.info({ sessionId, transcript }, 'Final transcript');
      },
      onLLMChunk: (chunk) => {
        logger.debug({ sessionId, chunk: chunk.substring(0, 50) }, 'LLM chunk');
      },
      onComplete: (state) => {
        logger.info({ sessionId, metrics: state.metrics }, 'Pipeline completed');
        latencyMonitor.stopMonitoring(state);
      },
      onError: (error) => {
        logger.error({ sessionId, error }, 'Pipeline error');
      },
    });

    // Start latency monitoring
    latencyMonitor.startMonitoring(pipeline.id, sessionId);

    res.json({
      pipelineId: pipeline.id,
      sessionId: pipeline.sessionId,
      status: 'started',
      stage: pipeline.stage,
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to start pipeline');
    res.status(500).json({ error: 'Failed to start pipeline', message: error.message });
  }
});

/**
 * Get pipeline status
 * GET /api/orchestration/pipeline/:pipelineId
 */
router.get('/pipeline/:pipelineId', (req: Request, res: Response) => {
  try {
    const { pipelineId } = req.params;
    const state = orchestrator.getPipelineState(pipelineId);

    if (!state) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    res.json(state.getSnapshot());
  } catch (error: any) {
    logger.error({ error }, 'Failed to get pipeline status');
    res.status(500).json({ error: 'Failed to get pipeline status', message: error.message });
  }
});

/**
 * Interrupt a pipeline
 * POST /api/orchestration/interrupt/:pipelineId
 */
router.post('/interrupt/:pipelineId', async (req: Request, res: Response) => {
  try {
    const { pipelineId } = req.params;
    const state = orchestrator.getPipelineState(pipelineId);

    if (!state) {
      return res.status(404).json({ error: 'Pipeline not found' });
    }

    await interruptionHandler.manualInterrupt(pipelineId, state.sessionId);

    res.json({
      pipelineId,
      status: 'interrupted',
      timestamp: Date.now(),
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to interrupt pipeline');
    res.status(500).json({ error: 'Failed to interrupt pipeline', message: error.message });
  }
});

/**
 * End a pipeline
 * POST /api/orchestration/end/:pipelineId
 */
router.post('/end/:pipelineId', async (req: Request, res: Response) => {
  try {
    const { pipelineId } = req.params;
    await orchestrator.endPipeline(pipelineId);

    res.json({
      pipelineId,
      status: 'ended',
      timestamp: Date.now(),
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to end pipeline');
    res.status(500).json({ error: 'Failed to end pipeline', message: error.message });
  }
});

/**
 * Get all active pipelines
 * GET /api/orchestration/pipelines
 */
router.get('/pipelines', (req: Request, res: Response) => {
  try {
    const pipelines = orchestrator.getActivePipelines();
    const snapshots = pipelines.map((p) => p.getSnapshot());

    res.json({
      count: snapshots.length,
      pipelines: snapshots,
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to get active pipelines');
    res.status(500).json({ error: 'Failed to get active pipelines', message: error.message });
  }
});

/**
 * Get latency statistics
 * GET /api/orchestration/latency/stats
 */
router.get('/latency/stats', (req: Request, res: Response) => {
  try {
    const stats = latencyMonitor.getStats();
    res.json(stats);
  } catch (error: any) {
    logger.error({ error }, 'Failed to get latency stats');
    res.status(500).json({ error: 'Failed to get latency stats', message: error.message });
  }
});

/**
 * Get interruption statistics for a session
 * GET /api/orchestration/interruptions/:sessionId
 */
router.get('/interruptions/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const stats = interruptionHandler.getSessionStats(sessionId);
    res.json(stats);
  } catch (error: any) {
    logger.error({ error }, 'Failed to get interruption stats');
    res.status(500).json({ error: 'Failed to get interruption stats', message: error.message });
  }
});

/**
 * Health check for orchestration services
 * GET /api/orchestration/health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await orchestrator.healthCheck();
    const allHealthy = Object.values(health).every((v) => v === true);

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      services: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error({ error }, 'Health check failed');
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
