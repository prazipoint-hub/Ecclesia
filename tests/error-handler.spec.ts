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
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('failed credentials stay 401 while refused access is 403', () => {
    const bad = mockRes();
    handleError(new Error('Unauthorized: incorrect password'), bad as never);
    expect(bad.status).toHaveBeenCalledWith(401);
    const scope = mockRes();
    handleError(new Error('Unauthorized: cannot view member in another church'), scope as never);
    expect(scope.status).toHaveBeenCalledWith(403);
  });

  test('business-rule refusals are 409 and ownership mismatches 400', () => {
    for (const [msg, code] of [['Insufficient section balance', 409], ['Cannot approve your own request', 409], ['Member is already part of this organization', 409], ['Expenditure does not belong to the provided church', 400]] as const) {
      const res = mockRes();
      handleError(new Error(msg), res as never);
      expect(res.status).toHaveBeenCalledWith(code);
    }
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
