import * as mediasoup from 'mediasoup';
import { types as mediasoupTypes } from 'mediasoup';
import logger from '../utils/logger';
import { webrtcConnectionsTotal, webrtcConnectionsActive, audioChunksReceived, audioBytesReceived } from '../utils/metrics';

export interface AudioChunk {
  sessionId: string;
  timestamp: number;
  data: Buffer;
  format: {
    sampleRate: number;
    channels: number;
    bitDepth: number;
  };
}

export type AudioChunkHandler = (chunk: AudioChunk) => void | Promise<void>;

export class MediaServer {
  private static instance: MediaServer;
  private worker: mediasoupTypes.Worker | null = null;
  private router: mediasoupTypes.Router | null = null;
  private transports: Map<string, mediasoupTypes.WebRtcTransport> = new Map();
  private producers: Map<string, mediasoupTypes.Producer> = new Map();
  private dataProducers: Map<string, mediasoupTypes.DataProducer> = new Map();
  private audioHandlers: Set<AudioChunkHandler> = new Set();

  private constructor() {}

  public static getInstance(): MediaServer {
    if (!MediaServer.instance) {
      MediaServer.instance = new MediaServer();
    }
    return MediaServer.instance;
  }

  /**
   * Initialize the mediasoup worker and router
   */
  public async initialize(): Promise<void> {
    try {
      // Create mediasoup worker
      this.worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: parseInt(process.env.RTC_MIN_PORT || '10000', 10),
        rtcMaxPort: parseInt(process.env.RTC_MAX_PORT || '10100', 10),
      });

      this.worker.on('died', () => {
        logger.error('Mediasoup worker died, exiting in 2 seconds...');
        setTimeout(() => process.exit(1), 2000);
      });

      // Create router
      this.router = await this.worker.createRouter({
        mediaCodecs: [
          {
            kind: 'audio',
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2,
            parameters: {
              useinbandfec: 1,
              usedtx: 1,
            },
          },
        ],
      });

      logger.info('MediaServer initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize MediaServer');
      throw error;
    }
  }

  /**
   * Get router RTP capabilities
   */
  public getRouterRtpCapabilities(): mediasoupTypes.RtpCapabilities | null {
    return this.router?.rtpCapabilities || null;
  }

  /**
   * Create a WebRTC transport for a session
   */
  public async createWebRtcTransport(sessionId: string): Promise<{
    id: string;
    iceParameters: mediasoupTypes.IceParameters;
    iceCandidates: mediasoupTypes.IceCandidate[];
    dtlsParameters: mediasoupTypes.DtlsParameters;
  }> {
    if (!this.router) {
      throw new Error('Router not initialized');
    }

    try {
      const transport = await this.router.createWebRtcTransport({
        listenIps: [
          {
            ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
            announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
          },
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      this.transports.set(sessionId, transport);

      transport.on('dtlsstatechange', (dtlsState) => {
        if (dtlsState === 'closed') {
          logger.debug({ sessionId }, 'Transport closed');
          transport.close();
          this.transports.delete(sessionId);
        }
      });

      webrtcConnectionsTotal.inc({ status: 'created' });
      webrtcConnectionsActive.inc();

      logger.info({ sessionId, transportId: transport.id }, 'WebRTC transport created');

      return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to create WebRTC transport');
      throw error;
    }
  }

  /**
   * Connect transport with DTLS parameters
   */
  public async connectTransport(sessionId: string, dtlsParameters: mediasoupTypes.DtlsParameters): Promise<void> {
    const transport = this.transports.get(sessionId);

    if (!transport) {
      throw new Error('Transport not found');
    }

    try {
      await transport.connect({ dtlsParameters });
      logger.info({ sessionId }, 'Transport connected');
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to connect transport');
      throw error;
    }
  }

  /**
   * Create a producer for audio streaming
   */
  public async createProducer(
    sessionId: string,
    kind: mediasoupTypes.MediaKind,
    rtpParameters: mediasoupTypes.RtpParameters
  ): Promise<string> {
    const transport = this.transports.get(sessionId);

    if (!transport) {
      throw new Error('Transport not found');
    }

    try {
      const producer = await transport.produce({
        kind,
        rtpParameters,
      });

      this.producers.set(sessionId, producer);

      producer.on('transportclose', () => {
        logger.debug({ sessionId, producerId: producer.id }, 'Producer transport closed');
        this.producers.delete(sessionId);
      });

      logger.info({ sessionId, producerId: producer.id, kind }, 'Producer created');

      return producer.id;
    } catch (error) {
      logger.error({ error, sessionId, kind }, 'Failed to create producer');
      throw error;
    }
  }

  /**
   * Create a data channel for audio chunks
   */
  public async createDataProducer(sessionId: string, sctpStreamParameters: mediasoupTypes.SctpStreamParameters): Promise<string> {
    const transport = this.transports.get(sessionId);

    if (!transport) {
      throw new Error('Transport not found');
    }

    try {
      const dataProducer = await transport.produceData({
        sctpStreamParameters,
        label: 'audio-chunks',
        protocol: 'jarvis-audio-v1',
      });

      this.dataProducers.set(sessionId, dataProducer);

      // DataProducers send data, they don't receive it
      // Audio data will be handled through the transport's data channels

      dataProducer.on('transportclose', () => {
        logger.debug({ sessionId, dataProducerId: dataProducer.id }, 'DataProducer transport closed');
        this.dataProducers.delete(sessionId);
      });

      logger.info({ sessionId, dataProducerId: dataProducer.id }, 'DataProducer created');

      return dataProducer.id;
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to create data producer');
      throw error;
    }
  }

  /**
   * Handle incoming audio data from WebRTC data channel
   */
  private handleAudioData(sessionId: string, data: Buffer | string): void {
    try {
      const buffer = typeof data === 'string' ? Buffer.from(data) : data;

      // Parse audio chunk (assuming a simple format with header)
      const chunk: AudioChunk = {
        sessionId,
        timestamp: Date.now(),
        data: buffer,
        format: {
          sampleRate: 16000, // Default, should be negotiated
          channels: 1,
          bitDepth: 16,
        },
      };

      // Update metrics
      audioChunksReceived.inc({ session_id: sessionId });
      audioBytesReceived.inc({ session_id: sessionId }, buffer.length);

      // Notify all registered handlers
      this.audioHandlers.forEach((handler) => {
        try {
          handler(chunk);
        } catch (error) {
          logger.error({ error, sessionId }, 'Audio handler error');
        }
      });
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to handle audio data');
    }
  }

  /**
   * Register an audio chunk handler
   */
  public onAudioChunk(handler: AudioChunkHandler): void {
    this.audioHandlers.add(handler);
  }

  /**
   * Remove an audio chunk handler
   */
  public offAudioChunk(handler: AudioChunkHandler): void {
    this.audioHandlers.delete(handler);
  }

  /**
   * Close a session's WebRTC resources
   */
  public async closeSession(sessionId: string): Promise<void> {
    const transport = this.transports.get(sessionId);
    const producer = this.producers.get(sessionId);
    const dataProducer = this.dataProducers.get(sessionId);

    if (dataProducer) {
      dataProducer.close();
      this.dataProducers.delete(sessionId);
    }

    if (producer) {
      producer.close();
      this.producers.delete(sessionId);
    }

    if (transport) {
      transport.close();
      this.transports.delete(sessionId);
      webrtcConnectionsActive.dec();
    }

    logger.info({ sessionId }, 'Session WebRTC resources closed');
  }

  /**
   * Shutdown the media server
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down MediaServer...');

    // Close all transports
    for (const [sessionId, transport] of this.transports.entries()) {
      transport.close();
      this.transports.delete(sessionId);
    }

    this.producers.clear();
    this.dataProducers.clear();
    this.audioHandlers.clear();

    if (this.worker) {
      this.worker.close();
      this.worker = null;
    }

    logger.info('MediaServer shutdown complete');
  }
}

export default MediaServer;
