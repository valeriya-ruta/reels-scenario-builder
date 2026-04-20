import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

/** Groq: rant-to-reel, scenario builder, rant-to-stories, carousel text gen, template/scene AI steps. */
export const aiLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),
  prefix: 'ratelimit:ai',
});

/** Apify competitor scans — free tier. */
export const scanLimitFree = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(3, '24 h'),
  prefix: 'ratelimit:scan:free',
});

/** Apify competitor scans — paid tier. */
export const scanLimitPaid = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(20, '24 h'),
  prefix: 'ratelimit:scan:paid',
});

/** Audio transcription (Groq STT on reuse / reference flows). */
export const transcribeLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 h'),
  prefix: 'ratelimit:transcribe',
});
