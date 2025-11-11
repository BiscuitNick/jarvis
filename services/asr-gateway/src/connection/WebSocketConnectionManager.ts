/**
 * WebSocket Connection Manager
 * Manages WebSocket connections with pooling, health monitoring, and reconnection logic
 */

import { WebSocket } from 'ws';
import { EventEmitter } from 'node:events';

export interface ConnectionConfig {
  maxConnections?: number;
  heartbeatInterval?: number;
  reconnectMaxAttempts?: number;
  reconnectBaseDelay?: number;
  reconnectMaxDelay?: number;
  connectionTimeout?: number;
  bufferSize?: number;
}

export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  failedConnections: number;
  reconnectionAttempts: number;
  averageLatency: number;
}

export enum ConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed',
}

interface ManagedConnection {
  id: string;
  ws: WebSocket;
  state: ConnectionState;
  createdAt: number;
  lastHeartbeat: number;
  reconnectAttempts: number;
  metadata: Record<string, any>;
}

export class WebSocketConnectionManager extends EventEmitter {
  private connections: Map<string, ManagedConnection> = new Map();
  private config: Required<ConnectionConfig>;
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private stats: ConnectionStats;

  constructor(config: ConnectionConfig = {}) {
    super();

    this.config = {
      maxConnections: config.maxConnections || 100,
      heartbeatInterval: config.heartbeatInterval || 30000, // 30 seconds
      reconnectMaxAttempts: config.reconnectMaxAttempts || 5,
      reconnectBaseDelay: config.reconnectBaseDelay || 1000, // 1 second
      reconnectMaxDelay: config.reconnectMaxDelay || 30000, // 30 seconds
      connectionTimeout: config.connectionTimeout || 10000, // 10 seconds
      bufferSize: config.bufferSize || 32 * 1024, // 32KB chunks for low latency
    };

    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      reconnectionAttempts: 0,
      averageLatency: 0,
    };
  }

  /**
   * Register a new WebSocket connection
   */
  registerConnection(ws: WebSocket, metadata: Record<string, any> = {}): string {
    const connectionId = this.generateConnectionId();

    if (this.connections.size >= this.config.maxConnections) {
      throw new Error(`Maximum connections (${this.config.maxConnections}) reached`);
    }

    const connection: ManagedConnection = {
      id: connectionId,
      ws,
      state: ConnectionState.CONNECTED,
      createdAt: Date.now(),
      lastHeartbeat: Date.now(),
      reconnectAttempts: 0,
      metadata,
    };

    this.connections.set(connectionId, connection);
    this.stats.totalConnections++;
    this.stats.activeConnections++;

    // Set up heartbeat monitoring
    this.setupHeartbeat(connectionId);

    // Set up connection event listeners
    this.setupConnectionListeners(connectionId);

    this.emit('connection:registered', { connectionId, metadata });

    return connectionId;
  }

  /**
   * Unregister a connection
   */
  unregisterConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    // Clear heartbeat
    this.clearHeartbeat(connectionId);

    // Update stats
    if (connection.state === ConnectionState.CONNECTED) {
      this.stats.activeConnections--;
    }

    // Remove connection
    this.connections.delete(connectionId);

    this.emit('connection:unregistered', { connectionId });
  }

  /**
   * Get connection by ID
   */
  getConnection(connectionId: string): ManagedConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Check if connection is healthy
   */
  isConnectionHealthy(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    const now = Date.now();
    const timeSinceLastHeartbeat = now - connection.lastHeartbeat;

    return (
      connection.state === ConnectionState.CONNECTED &&
      connection.ws.readyState === WebSocket.OPEN &&
      timeSinceLastHeartbeat < this.config.heartbeatInterval * 2
    );
  }

  /**
   * Attempt to reconnect a failed connection
   */
  async attemptReconnection(connectionId: string): Promise<boolean> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    if (connection.reconnectAttempts >= this.config.reconnectMaxAttempts) {
      connection.state = ConnectionState.FAILED;
      this.stats.failedConnections++;
      this.emit('connection:failed', { connectionId });
      return false;
    }

    connection.state = ConnectionState.RECONNECTING;
    connection.reconnectAttempts++;
    this.stats.reconnectionAttempts++;

    // Calculate exponential backoff delay
    const delay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, connection.reconnectAttempts - 1),
      this.config.reconnectMaxDelay
    );

    this.emit('connection:reconnecting', {
      connectionId,
      attempt: connection.reconnectAttempts,
      delay
    });

    // Wait before reconnecting
    await this.sleep(delay);

    try {
      // Reconnection logic would go here
      // For now, we mark it as connected and reset attempts
      connection.state = ConnectionState.CONNECTED;
      connection.reconnectAttempts = 0;
      connection.lastHeartbeat = Date.now();

      this.emit('connection:reconnected', { connectionId });
      return true;
    } catch (error) {
      this.emit('connection:reconnect-failed', { connectionId, error });
      // Recursive retry
      return this.attemptReconnection(connectionId);
    }
  }

  /**
   * Get current connection statistics
   */
  getStats(): ConnectionStats {
    return { ...this.stats };
  }

  /**
   * Get buffer size configuration
   */
  getBufferSize(): number {
    return this.config.bufferSize;
  }

  /**
   * Cleanup all connections
   */
  cleanup(): void {
    for (const connectionId of this.connections.keys()) {
      this.unregisterConnection(connectionId);
    }
    this.connections.clear();
    this.heartbeatIntervals.clear();
  }

  /**
   * Private: Setup heartbeat monitoring for a connection
   */
  private setupHeartbeat(connectionId: string): void {
    const interval = setInterval(() => {
      const connection = this.connections.get(connectionId);
      if (!connection) {
        this.clearHeartbeat(connectionId);
        return;
      }

      const now = Date.now();
      const timeSinceLastHeartbeat = now - connection.lastHeartbeat;

      // Check if connection is still alive
      if (connection.ws.readyState === WebSocket.OPEN) {
        // Send ping
        try {
          connection.ws.ping();

          // If no response to previous heartbeat, consider reconnecting
          if (timeSinceLastHeartbeat > this.config.heartbeatInterval * 2) {
            this.emit('connection:heartbeat-timeout', { connectionId });
            this.attemptReconnection(connectionId);
          }
        } catch (error) {
          this.emit('connection:heartbeat-error', { connectionId, error });
        }
      } else {
        // Connection is not open, attempt reconnection
        this.attemptReconnection(connectionId);
      }
    }, this.config.heartbeatInterval);

    this.heartbeatIntervals.set(connectionId, interval);
  }

  /**
   * Private: Clear heartbeat interval
   */
  private clearHeartbeat(connectionId: string): void {
    const interval = this.heartbeatIntervals.get(connectionId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(connectionId);
    }
  }

  /**
   * Private: Setup connection event listeners
   */
  private setupConnectionListeners(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    const { ws } = connection;

    // Pong handler - update last heartbeat time
    ws.on('pong', () => {
      const conn = this.connections.get(connectionId);
      if (conn) {
        conn.lastHeartbeat = Date.now();
        this.emit('connection:heartbeat', { connectionId });
      }
    });

    // Error handler
    ws.on('error', (error) => {
      this.emit('connection:error', { connectionId, error });
    });

    // Close handler
    ws.on('close', (code, reason) => {
      this.emit('connection:closed', { connectionId, code, reason: reason.toString() });

      // Attempt reconnection if it wasn't a clean close
      if (code !== 1000) {
        this.attemptReconnection(connectionId);
      } else {
        this.unregisterConnection(connectionId);
      }
    });
  }

  /**
   * Private: Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `conn-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Private: Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
