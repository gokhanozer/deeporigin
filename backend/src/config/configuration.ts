/**
 * Typed application configuration.
 *
 * Everything the app needs from the environment is parsed exactly once, here,
 * and exposed as a strongly-typed object. Feature code injects
 * `ConfigService<AppConfig, true>` and reads `config.get('links.slugLength')`
 * instead of touching `process.env` directly — which keeps env parsing,
 * defaults and coercion in a single reviewable place.
 */

/** Shape of the fully-resolved configuration tree. */
export interface AppConfig {
  /** HTTP port the Nest server binds to. */
  port: number;
  /** `development` | `production` | `test`. */
  nodeEnv: string;
  /** Origins allowed to call the API from a browser. */
  corsOrigins: string[];
  /** Public base URL that short links are built from, e.g. `https://short.ly`. */
  publicBaseUrl: string;
  /** Prefix applied to every API route (`/api/v1/...`). */
  apiPrefix: string;
  auth: {
    /** HMAC secret used to sign JWTs. */
    jwtSecret: string;
    /** Token lifetime, in a format `@nestjs/jwt` understands (e.g. `7d`). */
    jwtExpiresIn: string;
    /** bcrypt cost factor. 10–12 is the usual production range. */
    bcryptRounds: number;
  };
  links: {
    /** Number of characters in an auto-generated slug. */
    slugLength: number;
    /** How many times to retry generation when a slug collides. */
    maxSlugGenerationAttempts: number;
  };
  privacy: {
    /** Salt mixed into IP hashes so they cannot be reversed via a rainbow table. */
    ipHashSalt: string;
  };
  redis: {
    /**
     * Redis connection string, e.g. `redis://redis:6379`.
     *
     * When set, rate-limit counters are shared across every backend replica.
     * When unset, the throttler falls back to per-process in-memory storage —
     * correct for a single instance, and what keeps local development and the
     * test suite free of a Redis dependency.
     */
    url: string | null;
  };
  rateLimit: {
    /** Sliding window length in milliseconds. */
    windowMs: number;
    /** Requests allowed per window for general API traffic. */
    limit: number;
    /** Tighter allowance for link creation (the expensive, abusable path). */
    createLimit: number;
    /** Tightest allowance for auth endpoints, to blunt credential stuffing. */
    authLimit: number;
  };
}

/**
 * Reads a variable as an integer, falling back when unset or unparseable.
 *
 * @param value    Raw environment value (may be `undefined`).
 * @param fallback Value to use when parsing fails.
 * @returns A finite integer.
 */
function envInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Reads a comma-separated variable into a trimmed, non-empty string array.
 *
 * @param value    Raw environment value, e.g. `"http://a.com, http://b.com"`.
 * @param fallback Value to use when unset.
 * @returns Array of individual entries.
 */
function envList(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  const items = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

/**
 * Configuration factory consumed by `ConfigModule.forRoot({ load: [configuration] })`.
 *
 * @returns The resolved {@link AppConfig} for this process.
 */
export const configuration = (): AppConfig => ({
  port: envInt(process.env.PORT, 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigins: envList(process.env.CORS_ORIGINS, ['http://localhost:3000']),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  auth: {
    jwtSecret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    bcryptRounds: envInt(process.env.BCRYPT_ROUNDS, 10),
  },
  links: {
    slugLength: envInt(process.env.SLUG_LENGTH, 7),
    maxSlugGenerationAttempts: envInt(process.env.MAX_SLUG_ATTEMPTS, 5),
  },
  privacy: {
    ipHashSalt: process.env.IP_HASH_SALT ?? 'dev-only-ip-salt',
  },
  redis: {
    // Empty string and unset both mean "no Redis" — an empty env var is a
    // common way to disable a feature, and should not produce a broken URL.
    url: process.env.REDIS_URL && process.env.REDIS_URL.length > 0
      ? process.env.REDIS_URL
      : null,
  },
  rateLimit: {
    windowMs: envInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    limit: envInt(process.env.RATE_LIMIT_MAX, 100),
    createLimit: envInt(process.env.RATE_LIMIT_CREATE_MAX, 10),
    authLimit: envInt(process.env.RATE_LIMIT_AUTH_MAX, 5),
  },
});
