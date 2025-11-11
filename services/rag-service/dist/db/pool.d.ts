import { Pool } from 'pg';
export declare function getPool(): Pool;
export declare function connectWithRetry(maxRetries?: number, baseDelayMs?: number): Promise<void>;
export declare function closePool(): Promise<void>;
//# sourceMappingURL=pool.d.ts.map