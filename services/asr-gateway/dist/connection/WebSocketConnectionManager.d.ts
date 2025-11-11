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
export declare enum ConnectionState {
    CONNECTING = "connecting",
    CONNECTED = "connected",
    RECONNECTING = "reconnecting",
    DISCONNECTED = "disconnected",
    FAILED = "failed"
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
export declare class WebSocketConnectionManager extends EventEmitter {
    private connections;
    private config;
    private heartbeatIntervals;
    private stats;
    constructor(config?: ConnectionConfig);
    /**
     * Register a new WebSocket connection
     */
    registerConnection(ws: WebSocket, metadata?: Record<string, any>): string;
    /**
     * Unregister a connection
     */
    unregisterConnection(connectionId: string): void;
    /**
     * Get connection by ID
     */
    getConnection(connectionId: string): ManagedConnection | undefined;
    /**
     * Check if connection is healthy
     */
    isConnectionHealthy(connectionId: string): boolean;
    /**
     * Attempt to reconnect a failed connection
     */
    attemptReconnection(connectionId: string): Promise<boolean>;
    /**
     * Get current connection statistics
     */
    getStats(): ConnectionStats;
    /**
     * Get buffer size configuration
     */
    getBufferSize(): number;
    /**
     * Cleanup all connections
     */
    cleanup(): void;
    /**
     * Private: Setup heartbeat monitoring for a connection
     */
    private setupHeartbeat;
    /**
     * Private: Clear heartbeat interval
     */
    private clearHeartbeat;
    /**
     * Private: Setup connection event listeners
     */
    private setupConnectionListeners;
    /**
     * Private: Generate unique connection ID
     */
    private generateConnectionId;
    /**
     * Private: Sleep utility
     */
    private sleep;
}
export {};
//# sourceMappingURL=WebSocketConnectionManager.d.ts.map