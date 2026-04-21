import 'server-only';

type LimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

interface LimitClient {
  limit: (identifier: string) => Promise<LimitResult>;
}

type WindowMs = number;

type CounterEntry = {
  count: number;
  resetAt: number;
};

const counters = new Map<string, CounterEntry>();

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function createInMemoryWindowLimitClient(prefix: string, max: number, windowMs: WindowMs): LimitClient {
  return {
    async limit(identifier: string) {
      const now = Date.now();
      const key = `${prefix}:${identifier}`;
      const entry = counters.get(key);

      if (!entry || now >= entry.resetAt) {
        const resetAt = now + windowMs;
        counters.set(key, { count: 1, resetAt });
        return {
          success: true,
          limit: max,
          remaining: Math.max(0, max - 1),
          reset: resetAt,
        };
      }

      const nextCount = entry.count + 1;
      entry.count = nextCount;
      counters.set(key, entry);
      const success = nextCount <= max;

      return {
        success,
        limit: max,
        remaining: Math.max(0, max - nextCount),
        reset: entry.resetAt,
      };
    },
  };
}

/** Groq: rant-to-reel, scenario builder, rant-to-stories, carousel text gen, template/scene AI steps. */
const AI_LIMIT_PER_HOUR = readPositiveIntEnv('AI_LIMIT_PER_HOUR', 60);
const TRANSCRIBE_LIMIT_PER_HOUR = readPositiveIntEnv('TRANSCRIBE_LIMIT_PER_HOUR', 40);
const SCAN_LIMIT_FREE_PER_DAY = readPositiveIntEnv('SCAN_LIMIT_FREE_PER_DAY', 5);
const SCAN_LIMIT_PAID_PER_DAY = readPositiveIntEnv('SCAN_LIMIT_PAID_PER_DAY', 50);

export const aiLimit = createInMemoryWindowLimitClient(
  'ratelimit:ai',
  AI_LIMIT_PER_HOUR,
  60 * 60 * 1000
);

/** Apify competitor scans — free tier. */
export const scanLimitFree = createInMemoryWindowLimitClient(
  'ratelimit:scan:free',
  SCAN_LIMIT_FREE_PER_DAY,
  24 * 60 * 60 * 1000
);

/** Apify competitor scans — paid tier. */
export const scanLimitPaid = createInMemoryWindowLimitClient(
  'ratelimit:scan:paid',
  SCAN_LIMIT_PAID_PER_DAY,
  24 * 60 * 60 * 1000
);

/** Audio transcription (Groq STT on reuse / reference flows). */
export const transcribeLimit = createInMemoryWindowLimitClient(
  'ratelimit:transcribe',
  TRANSCRIBE_LIMIT_PER_HOUR,
  60 * 60 * 1000
);
