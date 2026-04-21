import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type LimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

interface LimitClient {
  limit: (identifier: string) => Promise<LimitResult>;
}

function createNoopLimitClient(): LimitClient {
  return {
    async limit() {
      const now = Date.now();
      return {
        success: true,
        limit: Number.MAX_SAFE_INTEGER,
        remaining: Number.MAX_SAFE_INTEGER,
        reset: now + 60 * 60 * 1000,
      };
    },
  };
}

function hasUpstashEnv(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

function createLimitClient(factory: (redis: Redis) => Ratelimit): LimitClient {
  if (!hasUpstashEnv()) {
    console.warn('[ratelimit] Upstash env is missing. Falling back to no-op limits.');
    return createNoopLimitClient();
  }

  try {
    const redis = Redis.fromEnv();
    return factory(redis);
  } catch (error) {
    console.error('[ratelimit] Failed to initialize Upstash client. Falling back to no-op limits.', error);
    return createNoopLimitClient();
  }
}

/** Groq: rant-to-reel, scenario builder, rant-to-stories, carousel text gen, template/scene AI steps. */
export const aiLimit = createLimitClient(
  (redis) =>
    new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '1 h'),
      prefix: 'ratelimit:ai',
    })
);

/** Apify competitor scans — free tier. */
export const scanLimitFree = createLimitClient(
  (redis) =>
    new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(3, '24 h'),
      prefix: 'ratelimit:scan:free',
    })
);

/** Apify competitor scans — paid tier. */
export const scanLimitPaid = createLimitClient(
  (redis) =>
    new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(20, '24 h'),
      prefix: 'ratelimit:scan:paid',
    })
);

/** Audio transcription (Groq STT on reuse / reference flows). */
export const transcribeLimit = createLimitClient(
  (redis) =>
    new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '1 h'),
      prefix: 'ratelimit:transcribe',
    })
);
