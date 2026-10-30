import { describe, expect, test, vi } from 'vitest';
import { ZodError } from 'zod';
import { handleError } from '@/utils/errorHandler';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '@/types/errors';

function mockRes() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('handleError', () => {
  test.each([
    [new UnauthorizedError(), 401],
    [new ForbiddenError(), 403],
    [new NotFoundError('Member'), 404],
    [new ValidationError('bad'), 400],
    [new ConflictError('dup'), 409],
  ])('maps typed error %# to status %i', (error, status) => {
    const res = mockRes();
    handleError(error, res as never);
    expect(res.status).toHaveBeenCalledWith(status);
  });

  test('NotFoundError message includes entity name', () => {
    expect(new NotFoundError('Member').message).toBe('Member not found');
  });

  test('keeps legacy keyword mapping for plain errors', () => {
    const res = mockRes();
    handleError(new Error('Unauthorized: member:create permission required'), res as never);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('maps ZodError to 400 with details', () => {
    const res = mockRes();
    handleError(new ZodError([{ code: 'custom', path: ['email'], message: 'bad email' }]), res as never);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].details[0]).toEqual({ path: 'email', message: 'bad email' });
  });

  test('unknown thrown value returns generic 500', () => {
    const res = mockRes();
    handleError('boom', res as never);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
