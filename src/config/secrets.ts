import 'dotenv/config';

const DEV_SECRET = 'ecclesia-dev-secret';
const KNOWN_PLACEHOLDERS = new Set([DEV_SECRET, 'your-secret-key-change-in-production']);

export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET || DEV_SECRET;
  if (env.NODE_ENV === 'production' && (KNOWN_PLACEHOLDERS.has(secret) || secret.length < 32)) {
    throw new Error('JWT_SECRET must be set to a unique value of at least 32 characters in production');
  }
  return secret;
}

export const jwtSecret = resolveJwtSecret();
