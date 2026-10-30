import rateLimit from 'express-rate-limit';

const limiter = (windowMs: number, limit: number, message: string, countSuccessful = true) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: message, code: 'RATE_LIMITED' },
    skip: () => process.env.NODE_ENV === 'test',
    skipSuccessfulRequests: !countSuccessful,
    // A login that merely asks for a two-factor code is not a failed attempt.
    requestWasSuccessful: (_req, res) => res.statusCode < 400 || Boolean(res.locals.twoFactorRequired),
  });

export const loginLimiter = limiter(15 * 60_000, 5, 'Too many login attempts. Try again in 15 minutes.', false);
export const registrationLimiter = limiter(60 * 60_000, 5, 'Too many registration attempts. Try again later.');
export const passwordResetLimiter = limiter(60 * 60_000, 3, 'Too many password reset requests. Try again later.');
