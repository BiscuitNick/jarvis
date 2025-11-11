import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db/pool';
import logger from '../utils/logger';
import { sessionsTotal, sessionsActive } from '../utils/metrics';

export enum SessionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ERROR = 'error',
  EXPIRED = 'expired',
}

export interface SessionContext {
  conversationHistory?: Array<{ role: string; content: string }>;
  userPreferences?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface Session {
  id: string;
  userId: string;
  status: SessionStatus;
  contextData: SessionContext;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class SessionManager {
  private static instance: SessionManager;
  private activeSessions: Map<string, Session> = new Map();

  private constructor() {
    // Start cleanup task
    this.startCleanupTask();
  }

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Create a new session for a user
   */
  public async createSession(
    userId: string,
    contextData: SessionContext = {},
    expiresInMinutes: number = 60
  ): Promise<Session> {
    const pool = getPool();
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    try {
      const result = await pool.query(
        `INSERT INTO sessions (id, user_id, context_data, expires_at, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, context_data, expires_at, created_at, updated_at`,
        [sessionId, userId, JSON.stringify(contextData), expiresAt, SessionStatus.PENDING]
      );

      const session: Session = {
        id: result.rows[0].id,
        userId: result.rows[0].user_id,
        status: SessionStatus.PENDING,
        contextData: result.rows[0].context_data,
        expiresAt: result.rows[0].expires_at,
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at,
      };

      // Cache in memory
      this.activeSessions.set(sessionId, session);

      // Update metrics
      sessionsTotal.inc({ status: SessionStatus.PENDING });
      sessionsActive.inc();

      logger.info({ sessionId, userId }, 'Session created');

      return session;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to create session');
      throw error;
    }
  }

  /**
   * Get a session by ID
   */
  public async getSession(sessionId: string): Promise<Session | null> {
    // Check cache first
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!;
    }

    // Fetch from database
    const pool = getPool();
    try {
      const result = await pool.query(
        `SELECT id, user_id, context_data, expires_at, created_at, updated_at, status
         FROM sessions
         WHERE id = $1 AND expires_at > NOW()`,
        [sessionId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const session: Session = {
        id: result.rows[0].id,
        userId: result.rows[0].user_id,
        status: result.rows[0].status as SessionStatus,
        contextData: result.rows[0].context_data,
        expiresAt: result.rows[0].expires_at,
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at,
      };

      // Cache it
      this.activeSessions.set(sessionId, session);

      return session;
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to get session');
      throw error;
    }
  }

  /**
   * Update session status
   */
  public async updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
    const pool = getPool();

    try {
      await pool.query(
        'UPDATE sessions SET status = $1, updated_at = NOW() WHERE id = $2',
        [status, sessionId]
      );

      // Update cache
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.status = status;
        session.updatedAt = new Date();
      }

      sessionsTotal.inc({ status });

      logger.info({ sessionId, status }, 'Session status updated');
    } catch (error) {
      logger.error({ error, sessionId, status }, 'Failed to update session status');
      throw error;
    }
  }

  /**
   * Update session context data
   */
  public async updateSessionContext(sessionId: string, contextData: Partial<SessionContext>): Promise<void> {
    const pool = getPool();
    const session = await this.getSession(sessionId);

    if (!session) {
      throw new Error('Session not found');
    }

    const updatedContext = {
      ...session.contextData,
      ...contextData,
    };

    try {
      await pool.query(
        'UPDATE sessions SET context_data = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(updatedContext), sessionId]
      );

      // Update cache
      if (this.activeSessions.has(sessionId)) {
        this.activeSessions.get(sessionId)!.contextData = updatedContext;
      }

      logger.debug({ sessionId }, 'Session context updated');
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to update session context');
      throw error;
    }
  }

  /**
   * End a session
   */
  public async endSession(sessionId: string): Promise<void> {
    try {
      await this.updateSessionStatus(sessionId, SessionStatus.COMPLETED);
      this.activeSessions.delete(sessionId);
      sessionsActive.dec();

      logger.info({ sessionId }, 'Session ended');
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to end session');
      throw error;
    }
  }

  /**
   * Get all active sessions for a user
   */
  public async getUserSessions(userId: string): Promise<Session[]> {
    const pool = getPool();

    try {
      const result = await pool.query(
        `SELECT id, user_id, context_data, expires_at, created_at, updated_at, status
         FROM sessions
         WHERE user_id = $1 AND expires_at > NOW()
         ORDER BY created_at DESC`,
        [userId]
      );

      return result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        status: row.status as SessionStatus,
        contextData: row.context_data,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user sessions');
      throw error;
    }
  }

  /**
   * Cleanup expired sessions from cache
   */
  private startCleanupTask(): void {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [sessionId, session] of this.activeSessions.entries()) {
        if (session.expiresAt.getTime() < now) {
          this.activeSessions.delete(sessionId);
          sessionsActive.dec();
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug({ cleaned }, 'Cleaned up expired sessions from cache');
      }
    }, 60000); // Run every minute
  }
}

export default SessionManager;
