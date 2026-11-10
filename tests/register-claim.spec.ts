import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { createMockPrisma } from './helpers/mockPrisma';

const mocked = vi.hoisted(() => ({ prisma: undefined as unknown }));
vi.mock('@/database', async () => {
  const { createMockPrisma: create } = await import('./helpers/mockPrisma');
  mocked.prisma = create();
  return { prisma: mocked.prisma, default: mocked.prisma };
});

import { register } from '@/features/auth/service';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
beforeEach(() => {
  vi.resetAllMocks();
  prisma.user.findUnique.mockResolvedValue(null);
});

describe('claiming a member profile by registering', () => {
  test('two unclaimed profiles with the same email: nobody gets either automatically', async () => {
    prisma.member.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
    await expect(register('shared@example.org', 'pw-123456789', 'church-1')).rejects.toThrow(/matching member record was not found/);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test('no profile with that email: same answer, so existence is not revealed', async () => {
    prisma.member.findMany.mockResolvedValue([]);
    await expect(register('nobody@example.org', 'pw-123456789', 'church-1')).rejects.toThrow(/matching member record was not found/);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
