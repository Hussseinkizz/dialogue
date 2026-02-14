import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/rate-limiter";

describe("Rate Limiter", () => {
  describe("createRateLimiter", () => {
    it("should allow requests under the limit", () => {
      const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });

      // First 5 requests should be allowed
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed("user-1")).toBe(true);
      }

      limiter.clear();
    });

    it("should block requests over the limit", () => {
      const limiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000 });

      // Use all 3 allowed requests
      expect(limiter.isAllowed("user-1")).toBe(true);
      expect(limiter.isAllowed("user-1")).toBe(true);
      expect(limiter.isAllowed("user-1")).toBe(true);

      // 4th request should be blocked
      expect(limiter.isAllowed("user-1")).toBe(false);
      expect(limiter.isAllowed("user-1")).toBe(false);

      limiter.clear();
    });

    it("should track different keys separately", () => {
      const limiter = createRateLimiter({ maxRequests: 2, windowMs: 60_000 });

      // User 1 uses their limit
      expect(limiter.isAllowed("user-1")).toBe(true);
      expect(limiter.isAllowed("user-1")).toBe(true);
      expect(limiter.isAllowed("user-1")).toBe(false);

      // User 2 should still have their full limit
      expect(limiter.isAllowed("user-2")).toBe(true);
      expect(limiter.isAllowed("user-2")).toBe(true);
      expect(limiter.isAllowed("user-2")).toBe(false);

      limiter.clear();
    });

    it("should return correct remaining count", () => {
      const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });

      // Initially should have full limit
      expect(limiter.remaining("user-1")).toBe(5);

      // Use some requests
      limiter.isAllowed("user-1");
      expect(limiter.remaining("user-1")).toBe(4);

      limiter.isAllowed("user-1");
      limiter.isAllowed("user-1");
      expect(limiter.remaining("user-1")).toBe(2);

      limiter.clear();
    });

    it("should reset after window expires", async () => {
      const limiter = createRateLimiter({ maxRequests: 2, windowMs: 100 }); // 100ms window

      // Use all requests
      expect(limiter.isAllowed("user-1")).toBe(true);
      expect(limiter.isAllowed("user-1")).toBe(true);
      expect(limiter.isAllowed("user-1")).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be allowed again
      expect(limiter.isAllowed("user-1")).toBe(true);

      limiter.clear();
    });

    it("should clear all entries", () => {
      const limiter = createRateLimiter({ maxRequests: 2, windowMs: 60_000 });

      // Use some requests
      limiter.isAllowed("user-1");
      limiter.isAllowed("user-2");

      expect(limiter.remaining("user-1")).toBe(1);
      expect(limiter.remaining("user-2")).toBe(1);

      // Clear
      limiter.clear();

      // Should have full limits again
      expect(limiter.remaining("user-1")).toBe(2);
      expect(limiter.remaining("user-2")).toBe(2);
    });

    it("should return full remaining for unknown keys", () => {
      const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });

      expect(limiter.remaining("never-seen")).toBe(10);

      limiter.clear();
    });

    it("should return 0 remaining when at limit", () => {
      const limiter = createRateLimiter({ maxRequests: 2, windowMs: 60_000 });

      limiter.isAllowed("user-1");
      limiter.isAllowed("user-1");

      expect(limiter.remaining("user-1")).toBe(0);

      // Additional attempts don't make it negative
      limiter.isAllowed("user-1");
      expect(limiter.remaining("user-1")).toBe(0);

      limiter.clear();
    });
  });
});
