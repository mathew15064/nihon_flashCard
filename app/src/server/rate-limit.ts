import type { FastifyInstance } from "fastify";

type Window = { count: number; expiresAt: number };
type Decision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Lightweight per-process limiter for sensitive endpoints.
 * The IP must come from Fastify's socket (trustProxy=false), never X-Forwarded-For.
 * Storage is bounded; a saturated limiter fails closed until a window expires.
 */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly maxKeys = 2048) {}

  consume(key: string, maxRequests: number, windowMs: number, now = Date.now()): Decision {
    const previous = this.windows.get(key);
    if (previous && previous.expiresAt > now) {
      if (previous.count >= maxRequests) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((previous.expiresAt - now) / 1000)) };
      }
      previous.count++;
      return { allowed: true };
    }
    if (previous) this.windows.delete(key);

    if (this.windows.size >= this.maxKeys) {
      for (const [candidate, window] of this.windows) {
        if (window.expiresAt <= now) this.windows.delete(candidate);
      }
    }
    if (this.windows.size >= this.maxKeys) {
      // Do not evict an active bucket: that would let attackers bypass a limit.
      let earliestExpiry = Number.POSITIVE_INFINITY;
      for (const window of this.windows.values()) {
        earliestExpiry = Math.min(earliestExpiry, window.expiresAt);
      }
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((earliestExpiry - now) / 1000)) };
    }

    this.windows.set(key, { count: 1, expiresAt: now + windowMs });
    return { allowed: true };
  }

  clear(): void { this.windows.clear(); }
}

const rules: Record<string, { maxRequests: number; windowMs: number }> = {
  "/api/v1/setup/initialize": { maxRequests: 5, windowMs: 15 * 60_000 },
  "/api/v1/auth/admin/login": { maxRequests: 10, windowMs: 15 * 60_000 },
  "/api/v1/auth/learner/login": { maxRequests: 25, windowMs: 15 * 60_000 },
  "/api/v1/auth/learner/password": { maxRequests: 10, windowMs: 15 * 60_000 },
  "/api/v1/auth/learner/register": { maxRequests: 6, windowMs: 60 * 60_000 },
};

export function registerAuthRateLimits(app: FastifyInstance): void {
  const limiter = new FixedWindowLimiter();
  app.addHook("onRequest", async (request, reply) => {
    if (request.method !== "POST") return;
    const path = request.url.split("?", 1)[0].replace(/\/+$/, "");
    const rule = rules[path];
    if (!rule) return;
    const decision = limiter.consume(request.ip + "|" + path, rule.maxRequests, rule.windowMs);
    if (!decision.allowed) {
      reply.header("Retry-After", String(decision.retryAfterSeconds));
      return reply.code(429).send({ success: false, error: { code: "RATE_LIMITED" } });
    }
  });
  app.addHook("onClose", async () => { limiter.clear(); });
}
