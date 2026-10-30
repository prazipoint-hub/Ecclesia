import { Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@/types/errors';
import { logger } from '@/config/logger';

export function handleError(error: unknown, res: Response): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Invalid request data',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }

  if (error instanceof Error) {
    const message = error.message || 'Unknown error';

    // Legacy services still throw plain Errors with keyword messages.
    if (message.includes('Unauthorized')) {
      res.status(401).json({ error: message });
      return;
    }

    if (message.includes('permission') || message.includes('Forbidden')) {
      res.status(403).json({ error: message });
      return;
    }

    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }

    if (message.includes('required') || message.includes('Invalid')) {
      res.status(400).json({ error: message });
      return;
    }

    logger.error({ err: error }, 'Unhandled service error');
    res.status(500).json({ error: message });
    return;
  }

  logger.error({ err: error }, 'Unknown thrown value');
  res.status(500).json({ error: 'Internal server error' });
}
