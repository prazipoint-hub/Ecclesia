import { vi } from 'vitest';

const model = () => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
});

export function createMockPrisma() {
  const prisma = {
    user: model(),
    member: model(),
    church: model(),
    session: model(),
    device: model(),
    passwordReset: model(),
    emailVerification: model(),
    invitation: model(),
    twoFactorSecret: model(),
    auditLog: model(),
    receipt: model(),
    sectionReceipt: model(),
    familyRelationship: model(),
    notification: model(),
    pastoralNotification: model(),
    $transaction: vi.fn(async (operations: unknown[]) => Promise.all(operations)),
  };
  return prisma;
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;
