/**
 * Fail-fast environment validation.
 *
 * Nest calls this before the DI container boots, so a missing `DATABASE_URL` or
 * a weak production `JWT_SECRET` crashes the process at start-up with a clear
 * message instead of surfacing as a confusing 500 later on.
 */

/** Variables that must always be present, whatever the environment. */
const REQUIRED_VARS = ['DATABASE_URL'] as const;

/** Variables that must additionally be set (and non-default) in production. */
const REQUIRED_IN_PRODUCTION = ['JWT_SECRET', 'IP_HASH_SALT', 'PUBLIC_BASE_URL'] as const;

/** Minimum acceptable length for secrets in production. */
const MIN_SECRET_LENGTH = 16;

/**
 * Validates the raw environment, throwing on the first fatal problem found.
 *
 * @param env Raw `process.env`-shaped record supplied by `ConfigModule`.
 * @returns The same record, unchanged, when validation passes.
 * @throws {Error} If a required variable is missing or a production secret is weak.
 */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const problems: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!env[key]) problems.push(`${key} is required`);
  }

  if (env.NODE_ENV === 'production') {
    for (const key of REQUIRED_IN_PRODUCTION) {
      const value = env[key];
      if (typeof value !== 'string' || value.length === 0) {
        problems.push(`${key} must be set in production`);
      } else if (key !== 'PUBLIC_BASE_URL' && value.length < MIN_SECRET_LENGTH) {
        problems.push(`${key} must be at least ${MIN_SECRET_LENGTH} characters in production`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
  }

  return env;
}
