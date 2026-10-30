import { vi } from 'vitest';

const model = () => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
  aggregate: vi.fn(),
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
    fund: model(),
    payment: model(),
    pledge: model(),
    recurringGiving: model(),
    savedPaymentMethod: model(),
    notificationPreference: model(),
    notificationDelivery: model(),
    pushSubscription: model(),
    communicationTemplate: model(),
    broadcastMessage: model(),
    section: model(),
    organization: model(),
    $transaction: vi.fn(),
  };
  // Supports both transaction styles: an array of operations and an interactive callback.
  prisma.$transaction.mockImplementation((async (arg: unknown) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[])) as never);
  return prisma;
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;
