import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import SessionManager, { SessionStatus } from '../session/SessionManager';
import logger from '../utils/logger';

const PROTO_PATH = path.join(__dirname, '../../proto/session.proto');

// Load proto file
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const sessionProto = protoDescriptor.jarvis.ingress;

/**
 * gRPC service implementation
 */
export const sessionServiceImpl = {
  /**
   * Start a new session
   */
  async StartSession(call: any, callback: any) {
    const { user_id, audio_config, voice_config, metadata } = call.request;

    try {
      const sessionManager = SessionManager.getInstance();

      const contextData = {
        metadata: metadata || {},
        userPreferences: {
          audioConfig: audio_config || {
            sample_rate: 16000,
            channels: 1,
            bit_depth: 16,
            codec: 'opus',
          },
          voiceConfig: voice_config || {
            voice_id: 'default',
            speed: 1.0,
            pitch: 1.0,
            language: 'en-US',
          },
        },
      };

      const session = await sessionManager.createSession(user_id, contextData, 60);

      // Update status to active
      await sessionManager.updateSessionStatus(session.id, SessionStatus.ACTIVE);

      logger.info({ sessionId: session.id, userId: user_id }, 'Session started via gRPC');

      callback(null, {
        session_id: session.id,
        status: 'active',
        webrtc_offer: '', // Will be populated by WebRTC signaling
        error_message: '',
      });
    } catch (error: any) {
      logger.error({ error, userId: user_id }, 'Failed to start session');
      callback(null, {
        session_id: '',
        status: 'error',
        webrtc_offer: '',
        error_message: error.message || 'Failed to start session',
      });
    }
  },

  /**
   * Stop an active session
   */
  async StopSession(call: any, callback: any) {
    const { session_id } = call.request;

    try {
      const sessionManager = SessionManager.getInstance();
      await sessionManager.endSession(session_id);

      logger.info({ sessionId: session_id }, 'Session stopped via gRPC');

      callback(null, {
        success: true,
        message: 'Session stopped successfully',
      });
    } catch (error: any) {
      logger.error({ error, sessionId: session_id }, 'Failed to stop session');
      callback(null, {
        success: false,
        message: error.message || 'Failed to stop session',
      });
    }
  },

  /**
   * Get session status
   */
  async GetSessionStatus(call: any, callback: any) {
    const { session_id } = call.request;

    try {
      const sessionManager = SessionManager.getInstance();
      const session = await sessionManager.getSession(session_id);

      if (!session) {
        callback(null, {
          session_id,
          status: 'not_found',
          created_at: 0,
          updated_at: 0,
          expires_at: 0,
        });
        return;
      }

      callback(null, {
        session_id: session.id,
        status: session.status,
        created_at: session.createdAt.getTime(),
        updated_at: session.updatedAt.getTime(),
        expires_at: session.expiresAt.getTime(),
      });
    } catch (error: any) {
      logger.error({ error, sessionId: session_id }, 'Failed to get session status');
      callback({
        code: grpc.status.INTERNAL,
        message: error.message || 'Failed to get session status',
      });
    }
  },

  /**
   * Update session configuration
   */
  async UpdateSessionConfig(call: any, callback: any) {
    const { session_id, audio_config, voice_config } = call.request;

    try {
      const sessionManager = SessionManager.getInstance();

      const updates: any = {};
      if (audio_config) {
        updates.userPreferences = { audioConfig: audio_config };
      }
      if (voice_config) {
        updates.userPreferences = {
          ...(updates.userPreferences || {}),
          voiceConfig: voice_config,
        };
      }

      await sessionManager.updateSessionContext(session_id, updates);

      logger.info({ sessionId: session_id }, 'Session config updated via gRPC');

      callback(null, {
        success: true,
        message: 'Session configuration updated',
      });
    } catch (error: any) {
      logger.error({ error, sessionId: session_id }, 'Failed to update session config');
      callback(null, {
        success: false,
        message: error.message || 'Failed to update session configuration',
      });
    }
  },

  /**
   * List user sessions
   */
  async ListSessions(call: any, callback: any) {
    const { user_id } = call.request;

    try {
      const sessionManager = SessionManager.getInstance();
      const sessions = await sessionManager.getUserSessions(user_id);

      const sessionInfos = sessions.map((session) => ({
        session_id: session.id,
        status: session.status,
        created_at: session.createdAt.getTime(),
        expires_at: session.expiresAt.getTime(),
      }));

      callback(null, {
        sessions: sessionInfos,
      });
    } catch (error: any) {
      logger.error({ error, userId: user_id }, 'Failed to list sessions');
      callback({
        code: grpc.status.INTERNAL,
        message: error.message || 'Failed to list sessions',
      });
    }
  },
};

/**
 * Create and start gRPC server
 */
export function createGrpcServer(port: number = 50051): grpc.Server {
  const server = new grpc.Server();

  server.addService(sessionProto.SessionControl.service, sessionServiceImpl);

  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        logger.error({ error }, 'Failed to bind gRPC server');
        throw error;
      }
      logger.info({ port }, 'gRPC server started');
    }
  );

  return server;
}
