import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { createMockPrisma } from './helpers/mockPrisma';

const mocked = vi.hoisted(() => ({ prisma: undefined as unknown }));
vi.mock('@/database', async () => {
  const { createMockPrisma: create } = await import('./helpers/mockPrisma');
  mocked.prisma = create();
  return { prisma: mocked.prisma, default: mocked.prisma };
});

import { createWithNumber, nextReceiptNumber } from '@/features/finance/shared/receiptNumber';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const year = new Date().getFullYear();
const clash = () => new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target: 'CircuitReceipt_receiptNumber_key' } });

beforeEach(() => {
  vi.resetAllMocks();
  prisma.$transaction.mockImplementation((async (fn: unknown) => (fn as (tx: unknown) => unknown)(prisma)) as never);
});

describe('circuit/district/section receipt numbers', () => {
  test('first allocation continues after the highest legacy number', async () => {
    prisma.circuitReceipt.findFirst.mockResolvedValue({ receiptNumber: `CIR-${year}-000041` });
    prisma.receiptSequence.upsert.mockImplementation((async (a: { create: { last: number } }) => ({ last: a.create.last })) as never);
    expect(await nextReceiptNumber('CIR')).toBe(`CIR-${year}-000042`);
    expect(prisma.receiptSequence.upsert.mock.calls[0][0].where.churchId_year.churchId).toBe('GLOBAL:CIR');
  });

  test('later allocations use the atomic increment, not a count', async () => {
    prisma.districtReceipt.findFirst.mockResolvedValue(undefined);
    prisma.receiptSequence.upsert.mockResolvedValue({ last: 7 });
    expect(await nextReceiptNumber('DST')).toBe(`DST-${year}-000007`);
    expect(prisma.receiptSequence.upsert.mock.calls[0][0].update).toEqual({ last: { increment: 1 } });
  });

  test('uses the right table per prefix', async () => {
    prisma.sectionReceipt.findFirst.mockResolvedValue(undefined);
    prisma.receiptSequence.upsert.mockResolvedValue({ last: 1 });
    await nextReceiptNumber('SEC');
    expect(prisma.sectionReceipt.findFirst).toHaveBeenCalled();
    expect(prisma.circuitReceipt.findFirst).not.toHaveBeenCalled();
  });

  test('a number clash takes the next number; other errors surface', async () => {
    prisma.circuitReceipt.findFirst.mockResolvedValue(undefined);
    prisma.receiptSequence.upsert.mockResolvedValueOnce({ last: 1 }).mockResolvedValueOnce({ last: 2 });
    const create = vi.fn().mockRejectedValueOnce(clash()).mockResolvedValueOnce({ id: 'r' });
    const out = await createWithNumber('CIR', create);
    expect(out.receiptNumber).toBe(`CIR-${year}-000002`);
    expect(create).toHaveBeenCalledTimes(2);
    prisma.receiptSequence.upsert.mockResolvedValue({ last: 3 });
    await expect(createWithNumber('CIR', vi.fn().mockRejectedValue(new Error('boom')))).rejects.toThrow('boom');
  });
});
