/**
 * PipelineOrchestrator.ts
 *
 * Coordinates the real-time voice assistant pipeline across all services:
 * Audio → ASR Gateway → LLM Router → RAG Service → TTS Service → Client
 *
 * Handles streaming coordination, state management, and latency optimization.
 */

import WebSocket from 'ws';
import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import { PipelineState, PipelineStage } from './PipelineState';
import { logger } from '../utils/logger';
import { SessionManager } from '../session/SessionManager';
import { CircuitBreakerManager } from './CircuitBreaker';

interface OrchestratorConfig {
  asrGatewayUrl: string;
  llmRouterUrl: string;
  ragServiceUrl: string;
  ttsServiceUrl: string;
  maxLatencyMs: number; // Target <500ms
  enableStreaming: boolean;
}

interface StreamingCallbacks {
  onTranscriptPartial?: (transcript: string) => void;
  onTranscriptFinal?: (transcript: string) => void;
  onLLMChunk?: (chunk: string) => void;
  onTTSChunk?: (audioData: Buffer) => void;
  onComplete?: (state: PipelineState) => void;
  onError?: (error: Error) => void;
  onInterrupt?: () => void;
}

export class PipelineOrchestrator extends EventEmitter {
  private config: OrchestratorConfig;
  private httpClient: AxiosInstance;
  private activePipelines: Map<string, PipelineState> = new Map();
  private asrConnections: Map<string, WebSocket> = new Map();
  private circuitBreakers: CircuitBreakerManager;

  constructor(config: OrchestratorConfig) {
    super();
    this.config = config;
    this.httpClient = axios.create({
      timeout: config.maxLatencyMs,
    });

    // Initialize circuit breakers for all downstream services
    this.circuitBreakers = new CircuitBreakerManager({
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000,
      rollingWindow: 60000,
    });

    logger.info('PipelineOrchestrator initialized with circuit breakers');
  }

  /**
   * Start a new voice interaction pipeline
   */
  public async startPipeline(
    sessionId: string,
    userId: string,
    callbacks: StreamingCallbacks
  ): Promise<PipelineState> {
    const state = new PipelineState(sessionId, userId);
    this.activePipelines.set(state.id, state);

    logger.info({ pipelineId: state.id, sessionId }, 'Starting new pipeline');

    try {
      // Transition to audio capture stage
      state.transitionTo(PipelineStage.AUDIO_CAPTURE);

      // Set up event handlers
      this.setupCallbacks(state.id, callbacks);

      return state;
    } catch (error) {
      logger.error({ error, pipelineId: state.id }, 'Failed to start pipeline');
      state.setError(error as Error);
      callbacks.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Process audio chunk through the pipeline
   */
  public async processAudioChunk(pipelineId: string, audioData: Buffer): Promise<void> {
    const state = this.activePipelines.get(pipelineId);
    if (!state) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    if (!state.canProceed()) {
      logger.debug({ pipelineId }, 'Pipeline cannot proceed, skipping audio chunk');
      return;
    }

    try {
      // Transition to ASR processing if not already there
      if (state.stage === PipelineStage.AUDIO_CAPTURE) {
        state.transitionTo(PipelineStage.ASR_PROCESSING);
        await this.connectToASR(pipelineId, state);
      }

      // Send audio to ASR Gateway
      const asrWs = this.asrConnections.get(pipelineId);
      if (asrWs && asrWs.readyState === WebSocket.OPEN) {
        asrWs.send(audioData);
      } else {
        logger.warn({ pipelineId }, 'ASR WebSocket not ready');
      }
    } catch (error) {
      logger.error({ error, pipelineId }, 'Error processing audio chunk');
      state.setError(error as Error);
      this.emit(`error:${pipelineId}`, error);
    }
  }

  /**
   * Handle final transcript from ASR and trigger LLM+RAG processing
   */
  private async processFinalTranscript(pipelineId: string, transcript: string): Promise<void> {
    const state = this.activePipelines.get(pipelineId);
    if (!state || !state.canProceed()) return;

    logger.info({ pipelineId, transcript }, 'Processing final transcript');

    try {
      state.updateTranscript(transcript, true);
      state.addToHistory('user', transcript);

      // Transition to LLM processing
      state.transitionTo(PipelineStage.LLM_PROCESSING);

      // Call LLM Router with streaming
      await this.streamLLMResponse(pipelineId, state, transcript);
    } catch (error) {
      logger.error({ error, pipelineId }, 'Error processing final transcript');
      state.setError(error as Error);
      this.emit(`error:${pipelineId}`, error);
    }
  }

  /**
   * Stream LLM response with RAG integration
   */
  private async streamLLMResponse(pipelineId: string, state: PipelineState, query: string): Promise<void> {
    const llmBreaker = this.circuitBreakers.getBreaker('llm-router');

    try {
      const messages = [
        ...state.context.conversationHistory.slice(-5).map((turn) => ({
          role: turn.role,
          content: turn.content,
        })),
      ];

      logger.debug({ pipelineId, messageCount: messages.length }, 'Streaming LLM response');

      // Make streaming request to LLM Router with circuit breaker
      const response = await llmBreaker.execute(
        async () => {
          return await fetch(`${this.config.llmRouterUrl}/complete/stream`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages,
              temperature: 0.7,
              maxTokens: 500,
            }),
          });
        },
        // Fallback: return cached or simple response
        async () => {
          logger.warn({ pipelineId }, 'LLM Router unavailable, using fallback response');
          state.appendResponse("I'm currently experiencing technical difficulties. Please try again shortly.");
          state.addToHistory('assistant', state.context.currentResponse);
          await this.synthesizeSpeech(pipelineId, state);
          return new Response();
        }
      );

      if (!response.ok) {
        throw new Error(`LLM Router returned ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body from LLM Router');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;
        if (!state.canProceed()) {
          logger.info({ pipelineId }, 'Pipeline interrupted during LLM streaming');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.content) {
                state.appendResponse(data.content);
                state.markFirstToken();
                this.emit(`llm-chunk:${pipelineId}`, data.content);
              }

              if (data.done) {
                // Store sources and grounding info
                if (data.sources) {
                  state.setRagContext(data.sources, data.citations || []);
                }
                if (data.grounding) {
                  state.context.metadata.grounding = data.grounding;
                }

                // Add response to history
                state.addToHistory('assistant', state.context.currentResponse);

                // Transition to TTS
                await this.synthesizeSpeech(pipelineId, state);
                break;
              }
            } catch (e) {
              logger.error({ error: e, line }, 'Failed to parse SSE line');
            }
          }
        }
      }
    } catch (error) {
      logger.error({ error, pipelineId }, 'Error streaming LLM response');
      throw error;
    }
  }

  /**
   * Synthesize speech from text response
   */
  private async synthesizeSpeech(pipelineId: string, state: PipelineState): Promise<void> {
    if (!state.canProceed()) return;

    const ttsBreaker = this.circuitBreakers.getBreaker('tts-service');

    try {
      state.transitionTo(PipelineStage.TTS_SYNTHESIS);

      const response = await ttsBreaker.execute(
        async () => {
          return await this.httpClient.post(
            `${this.config.ttsServiceUrl}/synthesize/stream`,
            {
              text: state.context.currentResponse,
              voice: state.context.metadata.voiceSettings?.voice || 'default',
              speed: state.context.metadata.voiceSettings?.speed || 1.0,
            },
            {
              responseType: 'stream',
            }
          );
        },
        // Fallback: skip TTS and just return text
        async () => {
          logger.warn({ pipelineId }, 'TTS Service unavailable, skipping audio synthesis');
          state.transitionTo(PipelineStage.COMPLETED);
          this.emit(`complete:${pipelineId}`, state);
          return null as any;
        }
      );

      if (!response) return; // Fallback was used

      // Stream audio chunks to client
      state.transitionTo(PipelineStage.AUDIO_PLAYBACK);

      response.data.on('data', (chunk: Buffer) => {
        if (state.canProceed()) {
          state.metrics.ttsChunkCount++;
          this.emit(`tts-chunk:${pipelineId}`, chunk);
        }
      });

      response.data.on('end', () => {
        if (state.canProceed()) {
          state.transitionTo(PipelineStage.COMPLETED);
          this.emit(`complete:${pipelineId}`, state);
          logger.info({ pipelineId, metrics: state.metrics }, 'Pipeline completed');
        }
      });

      response.data.on('error', (error: Error) => {
        logger.error({ error, pipelineId }, 'TTS streaming error');
        state.setError(error);
        this.emit(`error:${pipelineId}`, error);
      });
    } catch (error) {
      logger.error({ error, pipelineId }, 'Error synthesizing speech');
      throw error;
    }
  }

  /**
   * Connect to ASR Gateway via WebSocket
   */
  private async connectToASR(pipelineId: string, state: PipelineState): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.config.asrGatewayUrl.replace('http', 'ws') + '/transcribe/stream';
        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
          logger.info({ pipelineId }, 'Connected to ASR Gateway');

          // Send start message
          ws.send(
            JSON.stringify({
              action: 'start',
              languageCode: 'en-US',
              sampleRate: 16000,
            })
          );

          this.asrConnections.set(pipelineId, ws);
          resolve();
        });

        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());

            if (message.type === 'transcript') {
              if (message.isFinal) {
                logger.debug({ pipelineId, transcript: message.transcript }, 'Final transcript');
                this.emit(`transcript-final:${pipelineId}`, message.transcript);
                this.processFinalTranscript(pipelineId, message.transcript);
              } else {
                state.updateTranscript(message.transcript, false);
                this.emit(`transcript-partial:${pipelineId}`, message.transcript);
              }
            } else if (message.type === 'error') {
              logger.error({ pipelineId, error: message.error }, 'ASR error');
              state.setError(new Error(message.error));
              this.emit(`error:${pipelineId}`, new Error(message.error));
            }
          } catch (error) {
            logger.error({ error, pipelineId }, 'Failed to parse ASR message');
          }
        });

        ws.on('error', (error) => {
          logger.error({ error, pipelineId }, 'ASR WebSocket error');
          state.setError(error);
          this.emit(`error:${pipelineId}`, error);
          reject(error);
        });

        ws.on('close', () => {
          logger.info({ pipelineId }, 'ASR WebSocket closed');
          this.asrConnections.delete(pipelineId);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Interrupt an active pipeline (e.g., user starts speaking)
   */
  public async interruptPipeline(pipelineId: string): Promise<void> {
    const state = this.activePipelines.get(pipelineId);
    if (!state) return;

    logger.info({ pipelineId, currentStage: state.stage }, 'Interrupting pipeline');

    state.interrupt();
    this.emit(`interrupt:${pipelineId}`);

    // Close ASR connection
    const asrWs = this.asrConnections.get(pipelineId);
    if (asrWs) {
      asrWs.close();
      this.asrConnections.delete(pipelineId);
    }

    // Cleanup
    // Note: TTS and LLM interruption will happen via checking state.canProceed()
  }

  /**
   * End a pipeline and cleanup resources
   */
  public async endPipeline(pipelineId: string): Promise<void> {
    const state = this.activePipelines.get(pipelineId);
    if (!state) return;

    logger.info({ pipelineId, metrics: state.metrics }, 'Ending pipeline');

    // Close ASR connection
    const asrWs = this.asrConnections.get(pipelineId);
    if (asrWs) {
      asrWs.send(JSON.stringify({ action: 'stop' }));
      asrWs.close();
      this.asrConnections.delete(pipelineId);
    }

    // Remove from active pipelines
    this.activePipelines.delete(pipelineId);

    // Emit completion
    this.emit(`end:${pipelineId}`, state.getSnapshot());
  }

  /**
   * Setup event callbacks for a pipeline
   */
  private setupCallbacks(pipelineId: string, callbacks: StreamingCallbacks): void {
    if (callbacks.onTranscriptPartial) {
      this.on(`transcript-partial:${pipelineId}`, callbacks.onTranscriptPartial);
    }
    if (callbacks.onTranscriptFinal) {
      this.on(`transcript-final:${pipelineId}`, callbacks.onTranscriptFinal);
    }
    if (callbacks.onLLMChunk) {
      this.on(`llm-chunk:${pipelineId}`, callbacks.onLLMChunk);
    }
    if (callbacks.onTTSChunk) {
      this.on(`tts-chunk:${pipelineId}`, callbacks.onTTSChunk);
    }
    if (callbacks.onComplete) {
      this.on(`complete:${pipelineId}`, callbacks.onComplete);
    }
    if (callbacks.onError) {
      this.on(`error:${pipelineId}`, callbacks.onError);
    }
    if (callbacks.onInterrupt) {
      this.on(`interrupt:${pipelineId}`, callbacks.onInterrupt);
    }
  }

  /**
   * Get current pipeline state
   */
  public getPipelineState(pipelineId: string): PipelineState | undefined {
    return this.activePipelines.get(pipelineId);
  }

  /**
   * Get all active pipelines
   */
  public getActivePipelines(): PipelineState[] {
    return Array.from(this.activePipelines.values());
  }

  /**
   * Health check for all downstream services
   */
  public async healthCheck(): Promise<Record<string, boolean>> {
    const services = {
      asr: this.config.asrGatewayUrl,
      llm: this.config.llmRouterUrl,
      rag: this.config.ragServiceUrl,
      tts: this.config.ttsServiceUrl,
    };

    const health: Record<string, boolean> = {};

    for (const [name, url] of Object.entries(services)) {
      try {
        const response = await axios.get(`${url}/healthz`, { timeout: 2000 });
        health[name] = response.status === 200;
      } catch (error) {
        health[name] = false;
      }
    }

    return health;
  }

  /**
   * Get circuit breaker status
   */
  public getCircuitBreakerStatus(): Record<string, any> {
    return this.circuitBreakers.getHealthStatus();
  }

  /**
   * Shutdown orchestrator and cleanup all resources
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down PipelineOrchestrator');

    // Close all ASR connections
    for (const [pipelineId, ws] of this.asrConnections.entries()) {
      try {
        ws.close();
      } catch (error) {
        logger.error({ error, pipelineId }, 'Error closing ASR connection');
      }
    }

    this.asrConnections.clear();
    this.activePipelines.clear();
    this.removeAllListeners();
  }
}
