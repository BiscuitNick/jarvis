/**
 * streaming.ts
 *
 * WebSocket handler for real-time streaming pipeline
 * Handles bidirectional audio streaming with live transcripts, LLM responses, and TTS audio
 */

import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { PipelineOrchestrator } from '../orchestration/PipelineOrchestrator';
import { InterruptionHandler } from '../orchestration/InterruptionHandler';
import { LatencyMonitor } from '../orchestration/LatencyMonitor';
import { logger } from '../utils/logger';
import { SessionManager } from '../session/SessionManager';
import { verifyToken } from '../auth/deviceToken';

interface StreamingClient {
  ws: WebSocket;
  pipelineId?: string;
  sessionId: string;
  userId: string;
  isAlive: boolean;
}

export class StreamingHandler {
  private orchestrator: PipelineOrchestrator;
  private interruptionHandler: InterruptionHandler;
  private latencyMonitor: LatencyMonitor;
  private sessionManager: SessionManager;
  private clients: Map<string, StreamingClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout;

  constructor(
    orchestrator: PipelineOrchestrator,
    interruptionHandler: InterruptionHandler,
    latencyMonitor: LatencyMonitor
  ) {
    this.orchestrator = orchestrator;
    this.interruptionHandler = interruptionHandler;
    this.latencyMonitor = latencyMonitor;
    this.sessionManager = SessionManager.getInstance();

    // Start heartbeat to check client connections
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeats();
    }, 30000); // Every 30 seconds
  }

  /**
   * Handle new WebSocket connection
   */
  public async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const sessionId = url.searchParams.get('sessionId');

    // Validate authentication
    if (!token) {
      ws.close(4001, 'Missing authentication token');
      return;
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (error) {
      logger.error({ error }, 'Invalid authentication token');
      ws.close(4001, 'Invalid authentication token');
      return;
    }

    const userId = decoded.userId;
    const clientId = `${userId}-${Date.now()}`;

    // Create or get session
    let session;
    if (sessionId) {
      session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        ws.close(4004, 'Session not found');
        return;
      }
    } else {
      session = await this.sessionManager.createSession(userId);
    }

    const client: StreamingClient = {
      ws,
      sessionId: session.id,
      userId,
      isAlive: true,
    };

    this.clients.set(clientId, client);

    logger.info({ clientId, userId, sessionId: session.id }, 'New streaming client connected');

    // Set up event handlers
    ws.on('message', (data: Buffer) => {
      this.handleMessage(clientId, data);
    });

    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('close', () => {
      this.handleDisconnect(clientId);
    });

    ws.on('error', (error) => {
      logger.error({ error, clientId }, 'WebSocket error');
      this.handleDisconnect(clientId);
    });

    // Send welcome message
    this.sendMessage(clientId, {
      type: 'connected',
      sessionId: session.id,
      userId,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle incoming message from client
   */
  private async handleMessage(clientId: string, data: Buffer): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      // Try to parse as JSON (control message)
      const text = data.toString('utf8');
      if (text.startsWith('{')) {
        const message = JSON.parse(text);
        await this.handleControlMessage(clientId, message);
      } else {
        // Binary audio data
        await this.handleAudioData(clientId, data);
      }
    } catch (error) {
      logger.error({ error, clientId }, 'Error handling message');
      this.sendMessage(clientId, {
        type: 'error',
        error: 'Failed to process message',
      });
    }
  }

  /**
   * Handle control message
   */
  private async handleControlMessage(clientId: string, message: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    logger.debug({ clientId, messageType: message.type }, 'Control message received');

    switch (message.type) {
      case 'start':
        await this.startPipeline(clientId);
        break;

      case 'stop':
        await this.stopPipeline(clientId);
        break;

      case 'interrupt':
        await this.handleInterrupt(clientId);
        break;

      case 'vad':
        // Voice Activity Detection signal from client
        await this.handleVAD(clientId, message.confidence, message.duration);
        break;

      case 'ping':
        client.isAlive = true;
        this.sendMessage(clientId, { type: 'pong' });
        break;

      default:
        logger.warn({ clientId, messageType: message.type }, 'Unknown control message type');
    }
  }

  /**
   * Start a new pipeline for the client
   */
  private async startPipeline(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const pipeline = await this.orchestrator.startPipeline(client.sessionId, client.userId, {
        onTranscriptPartial: (transcript) => {
          this.sendMessage(clientId, {
            type: 'transcript',
            isFinal: false,
            transcript,
            timestamp: Date.now(),
          });
        },
        onTranscriptFinal: (transcript) => {
          this.sendMessage(clientId, {
            type: 'transcript',
            isFinal: true,
            transcript,
            timestamp: Date.now(),
          });
        },
        onLLMChunk: (chunk) => {
          this.sendMessage(clientId, {
            type: 'llm-response',
            chunk,
            timestamp: Date.now(),
          });
        },
        onTTSChunk: (audioData) => {
          // Send binary audio data
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(audioData);
          }
        },
        onComplete: (state) => {
          this.sendMessage(clientId, {
            type: 'complete',
            metrics: state.metrics,
            sources: state.context.ragContext?.citations || [],
            timestamp: Date.now(),
          });
          this.latencyMonitor.stopMonitoring(state);
        },
        onError: (error) => {
          this.sendMessage(clientId, {
            type: 'error',
            error: error.message,
            timestamp: Date.now(),
          });
        },
        onInterrupt: () => {
          this.sendMessage(clientId, {
            type: 'interrupted',
            timestamp: Date.now(),
          });
        },
      });

      client.pipelineId = pipeline.id;
      this.latencyMonitor.startMonitoring(pipeline.id, client.sessionId);

      this.sendMessage(clientId, {
        type: 'pipeline-started',
        pipelineId: pipeline.id,
        stage: pipeline.stage,
        timestamp: Date.now(),
      });

      logger.info({ clientId, pipelineId: pipeline.id }, 'Pipeline started');
    } catch (error: any) {
      logger.error({ error, clientId }, 'Failed to start pipeline');
      this.sendMessage(clientId, {
        type: 'error',
        error: error.message,
      });
    }
  }

  /**
   * Handle audio data from client
   */
  private async handleAudioData(clientId: string, audioData: Buffer): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.pipelineId) {
      logger.warn({ clientId }, 'Received audio data without active pipeline');
      return;
    }

    try {
      await this.orchestrator.processAudioChunk(client.pipelineId, audioData);
    } catch (error) {
      logger.error({ error, clientId }, 'Error processing audio data');
    }
  }

  /**
   * Handle Voice Activity Detection signal
   */
  private async handleVAD(clientId: string, confidence: number, durationMs: number): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.pipelineId) return;

    try {
      await this.interruptionHandler.handleVAD(client.pipelineId, client.sessionId, confidence, durationMs);
    } catch (error) {
      logger.error({ error, clientId }, 'Error handling VAD');
    }
  }

  /**
   * Handle interruption request
   */
  private async handleInterrupt(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.pipelineId) return;

    try {
      await this.interruptionHandler.manualInterrupt(client.pipelineId, client.sessionId);
    } catch (error) {
      logger.error({ error, clientId }, 'Error handling interruption');
    }
  }

  /**
   * Stop the active pipeline
   */
  private async stopPipeline(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || !client.pipelineId) return;

    try {
      await this.orchestrator.endPipeline(client.pipelineId);
      client.pipelineId = undefined;

      this.sendMessage(clientId, {
        type: 'pipeline-stopped',
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error({ error, clientId }, 'Error stopping pipeline');
    }
  }

  /**
   * Handle client disconnect
   */
  private async handleDisconnect(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    logger.info({ clientId, sessionId: client.sessionId }, 'Client disconnected');

    // End active pipeline
    if (client.pipelineId) {
      try {
        await this.orchestrator.endPipeline(client.pipelineId);
      } catch (error) {
        logger.error({ error, clientId }, 'Error ending pipeline on disconnect');
      }
    }

    this.clients.delete(clientId);
  }

  /**
   * Send message to client
   */
  private sendMessage(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error({ error, clientId }, 'Error sending message');
    }
  }

  /**
   * Check heartbeats and cleanup dead connections
   */
  private checkHeartbeats(): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (!client.isAlive) {
        logger.info({ clientId }, 'Client failed heartbeat, terminating');
        client.ws.terminate();
        this.handleDisconnect(clientId);
      } else {
        client.isAlive = false;
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      }
    }
  }

  /**
   * Shutdown handler
   */
  public shutdown(): void {
    logger.info('Shutting down StreamingHandler');

    clearInterval(this.heartbeatInterval);

    // Close all client connections
    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.ws.close(1001, 'Server shutting down');
      } catch (error) {
        logger.error({ error, clientId }, 'Error closing client connection');
      }
    }

    this.clients.clear();
  }
}
