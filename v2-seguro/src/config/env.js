const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

// Hardened contrast with v1: no default/fallback secret is provided for
// JWT_SECRET or any DB credential. Missing critical config fails fast at
// boot instead of silently falling back to an insecure default.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DB_HOST: z.string().min(1, 'DB_HOST is required'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1, 'DB_NAME is required'),
  DB_USER: z.string().min(1, 'DB_USER is required'),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be set and reasonably long'),
  JWT_EXPIRES_IN: z.string().default('15m'),

  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    // Fail fast: an app that boots with an invalid/missing security-critical
    // config is worse than one that refuses to start.
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return parsed.data;
}

const env = loadEnv();

module.exports = { env };
