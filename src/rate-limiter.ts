/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/**
 * Rate limiter instance returned by createRateLimiter
 */
export interface RateLimiter {
  /**
   * Check if a request is allowed for the given key.
   * Returns true if allowed, false if rate limited.
   */
  isAllowed(key: string): boolean;
  /**
   * Get remaining requests for the given key
   */
  remaining(key: string): number;
  /**
   * Clear all rate limit data (useful for testing)
   */
  clear(): void;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Creates a simple in-memory rate limiter using sliding window algorithm.
 * Tracks requests per key (typically socket ID or user ID) and enforces limits.
 *
 * @param config - Rate limiter configuration
 * @returns RateLimiter instance
 *
 * @example
 * const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60000 });
 *
 * if (!limiter.isAllowed(socketId)) {
 *   socket.emit("dialogue:error", { code: "RATE_LIMITED" });
 *   return;
 * }
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const entries = new Map<string, RateLimitEntry>();

  // Cleanup expired entries periodically to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (now >= entry.resetAt) {
        entries.delete(key);
      }
    }
  }, config.windowMs);

  // Prevent the interval from keeping the process alive
  cleanupInterval.unref?.();

  return {
    isAllowed(key: string): boolean {
      const now = Date.now();
      const entry = entries.get(key);

      // No existing entry or window expired - allow and reset
      if (!entry || now >= entry.resetAt) {
        entries.set(key, {
          count: 1,
          resetAt: now + config.windowMs,
        });
        return true;
      }

      // Within window - check count
      if (entry.count >= config.maxRequests) {
        return false;
      }

      // Increment and allow
      entry.count++;
      return true;
    },

    remaining(key: string): number {
      const now = Date.now();
      const entry = entries.get(key);

      if (!entry || now >= entry.resetAt) {
        return config.maxRequests;
      }

      return Math.max(0, config.maxRequests - entry.count);
    },

    clear(): void {
      entries.clear();
    },
  };
}
