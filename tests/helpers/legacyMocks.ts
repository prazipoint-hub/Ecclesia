import { vi } from 'vitest';

const model = () => ({
  findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), createMany: vi.fn(), update: vi.fn(),
  updateMany: vi.fn(), upsert: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn(),
});

/** Models used by the older modules that the shared mock does not define. Added here so the shared helper stays untouched. */
export function withLegacyModels<T extends object>(prisma: T) {
  const extra = {
    membershipStatusChange: model(),
    organizationMembership: model(),
    organizationRoleAssignment: model(),
    organizationFinancialAccount: model(),
    pastoralCaseActivity: model(),
    sectionExpenditure: model(),
    sectionJournalEntry: model(),
    sectionFinancialAccount: model(),
  };
  const merged = Object.assign(prisma, Object.fromEntries(Object.entries(extra).filter(([k]) => !(k in prisma)))) as T & typeof extra;
  return merged;
}
