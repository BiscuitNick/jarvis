/**
 * CircuitBreaker.ts
 *
 * Implements circuit breaker pattern for graceful degradation.
 * Prevents cascade failures when downstream services are unavailable or slow.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export enum CircuitState {
  CLOSED = 'closed', // Normal operation
  OPEN = 'open', // Failing, requests rejected
  HALF_OPEN = 'half_open', // Testing if service recovered
}

interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening circuit
  successThreshold: number; // Number of successes in half-open to close
  timeout: number; // Time to wait before trying again (ms)
  rollingWindow: number; // Time window for failure counting (ms)
}

interface CircuitMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rejectedRequests: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

export class CircuitBreaker extends EventEmitter {
  private serviceName: string;
  private state: CircuitState;
  private config: CircuitBreakerConfig;
  private metrics: CircuitMetrics;
  private failures: number[] = []; // Timestamps of recent failures
  private halfOpenSuccesses: number = 0;
  private nextAttemptTime: number = 0;

  constructor(serviceName: string, config?: Partial<CircuitBreakerConfig>) {
    super();
    this.serviceName = serviceName;
    this.state = CircuitState.CLOSED;

    this.config = {
      failureThreshold: config?.failureThreshold || 5,
      successThreshold: config?.successThreshold || 2,
      timeout: config?.timeout || 30000, // 30 seconds
      rollingWindow: config?.rollingWindow || 60000, // 1 minute
    };

    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
    };

    logger.info({ serviceName, config: this.config }, 'CircuitBreaker initialized');
  }

  /**
   * Execute a function with circuit breaker protection
   */
  public async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    this.metrics.totalRequests++;

    if (this.state === CircuitState.OPEN) {
      // Check if timeout has elapsed
      if (Date.now() < this.nextAttemptTime) {
        this.metrics.rejectedRequests++;
        logger.warn(
          { serviceName: this.serviceName, state: this.state },
          'Circuit breaker is OPEN, request rejected'
        );

        if (fallback) {
          logger.info({ serviceName: this.serviceName }, 'Using fallback');
          return await fallback();
        }

        throw new Error(`Circuit breaker is OPEN for ${this.serviceName}`);
      }

      // Transition to half-open to test service
      this.transitionTo(CircuitState.HALF_OPEN);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();

      if (fallback) {
        logger.info({ serviceName: this.serviceName, error }, 'Execution failed, using fallback');
        return await fallback();
      }

      throw error;
    }
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    this.metrics.successfulRequests++;
    this.metrics.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses++;

      if (this.halfOpenSuccesses >= this.config.successThreshold) {
        logger.info({ serviceName: this.serviceName }, 'Circuit breaker recovered, closing circuit');
        this.transitionTo(CircuitState.CLOSED);
        this.resetMetrics();
      }
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(): void {
    this.metrics.failedRequests++;
    this.metrics.lastFailureTime = Date.now();

    const now = Date.now();
    this.failures.push(now);

    // Clean up old failures outside rolling window
    this.failures = this.failures.filter((timestamp) => now - timestamp < this.config.rollingWindow);

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during recovery test, reopen circuit
      logger.warn({ serviceName: this.serviceName }, 'Circuit breaker failed during test, reopening');
      this.transitionTo(CircuitState.OPEN);
      this.scheduleRetry();
      return;
    }

    if (this.state === CircuitState.CLOSED && this.failures.length >= this.config.failureThreshold) {
      logger.warn(
        {
          serviceName: this.serviceName,
          failures: this.failures.length,
          threshold: this.config.failureThreshold,
        },
        'Failure threshold reached, opening circuit'
      );
      this.transitionTo(CircuitState.OPEN);
      this.scheduleRetry();
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses = 0;
    }

    logger.info({ serviceName: this.serviceName, oldState, newState }, 'Circuit breaker state changed');

    this.emit('stateChange', {
      serviceName: this.serviceName,
      oldState,
      newState,
      timestamp: Date.now(),
    });
  }

  /**
   * Schedule next retry attempt
   */
  private scheduleRetry(): void {
    this.nextAttemptTime = Date.now() + this.config.timeout;
    logger.debug(
      { serviceName: this.serviceName, retryAt: new Date(this.nextAttemptTime).toISOString() },
      'Scheduled circuit breaker retry'
    );
  }

  /**
   * Reset metrics (called after recovery)
   */
  private resetMetrics(): void {
    this.failures = [];
    this.halfOpenSuccesses = 0;
  }

  /**
   * Get current state
   */
  public getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit is allowing requests
   */
  public isAvailable(): boolean {
    if (this.state === CircuitState.OPEN) {
      return Date.now() >= this.nextAttemptTime;
    }
    return true;
  }

  /**
   * Get metrics
   */
  public getMetrics(): CircuitMetrics & { state: CircuitState; recentFailures: number } {
    return {
      ...this.metrics,
      state: this.state,
      recentFailures: this.failures.length,
    };
  }

  /**
   * Manually open circuit (for testing or maintenance)
   */
  public open(): void {
    logger.info({ serviceName: this.serviceName }, 'Manually opening circuit');
    this.transitionTo(CircuitState.OPEN);
    this.scheduleRetry();
  }

  /**
   * Manually close circuit (for testing or after manual recovery)
   */
  public close(): void {
    logger.info({ serviceName: this.serviceName }, 'Manually closing circuit');
    this.transitionTo(CircuitState.CLOSED);
    this.resetMetrics();
  }

  /**
   * Reset all metrics
   */
  public reset(): void {
    logger.info({ serviceName: this.serviceName }, 'Resetting circuit breaker');
    this.state = CircuitState.CLOSED;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
    };
    this.resetMetrics();
  }
}

/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers for different services
 */
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private defaultConfig: Partial<CircuitBreakerConfig>;

  constructor(defaultConfig?: Partial<CircuitBreakerConfig>) {
    this.defaultConfig = defaultConfig || {};
  }

  /**
   * Get or create a circuit breaker for a service
   */
  public getBreaker(serviceName: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      const breaker = new CircuitBreaker(serviceName, { ...this.defaultConfig, ...config });
      this.breakers.set(serviceName, breaker);

      // Forward events
      breaker.on('stateChange', (event) => {
        logger.info(event, 'Circuit breaker state change');
      });
    }

    return this.breakers.get(serviceName)!;
  }

  /**
   * Get all circuit breakers
   */
  public getAllBreakers(): Map<string, CircuitBreaker> {
    return this.breakers;
  }

  /**
   * Get health status of all services
   */
  public getHealthStatus(): Record<string, { state: CircuitState; isAvailable: boolean; metrics: any }> {
    const status: Record<string, any> = {};

    for (const [serviceName, breaker] of this.breakers.entries()) {
      status[serviceName] = {
        state: breaker.getState(),
        isAvailable: breaker.isAvailable(),
        metrics: breaker.getMetrics(),
      };
    }

    return status;
  }

  /**
   * Reset all circuit breakers
   */
  public resetAll(): void {
    logger.info('Resetting all circuit breakers');
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}
