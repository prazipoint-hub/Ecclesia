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
    // "Unauthorized: ..." is used both for failed credentials (401) and for refused access (403). Only the former
    // means the caller should sign in again, so everything about permissions, scope or another church is a 403.
    if (message.includes('Unauthorized')) {
      const badCredentials = /invalid|incorrect|expired|credential|sign in|token/i.test(message);
      res.status(badCredentials ? 401 : 403).json({ error: message });
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

    // Legacy business-rule refusals: the request was understood but the record is not in a state that allows it.
    if (/^(Insufficient|Cannot |Can only )/.test(message) || /already part of|must be part of|is already /.test(message)) {
      res.status(409).json({ error: message });
      return;
    }

    if (message.includes('does not belong')) {
      res.status(400).json({ error: message });
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
