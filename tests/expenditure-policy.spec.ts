import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { createMockPrisma } from './helpers/mockPrisma';

const mocked = vi.hoisted(() => ({ prisma: undefined as unknown }));
vi.mock('@/database', async () => {
  const { createMockPrisma: create } = await import('./helpers/mockPrisma');
  mocked.prisma = create();
  return { prisma: mocked.prisma, default: mocked.prisma };
});

import { assertPayer, gate, setPolicy } from '@/features/finance/shared/approvalPolicy';
import type { AuthorizedUser } from '@/types';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const user = (id: string, ...permissions: string[]): AuthorizedUser => ({ id, churchId: 'church-1', memberId: `m-${id}`, permissions, roleIds: [] } as AuthorizedUser);
const policy = (v: unknown) => prisma.systemSetting.findUnique.mockResolvedValue(v === null ? null : { value: v });

beforeEach(() => {
  vi.resetAllMocks();
  prisma.expenditureApproval.create.mockResolvedValue({});
  prisma.expenditureApproval.findMany.mockResolvedValue([]);
  prisma.auditLog.create.mockResolvedValue({});
});

describe('expenditure approval gate', () => {
  test('with no policy one approval decides, as before', async () => {
    policy(null);
    expect(await gate(user('a'), 'CHURCH', 'e1', 1_000_000, true)).toMatchObject({ waiting: false, needed: 1 });
  });

  test('below the threshold one approval is enough', async () => {
    policy({ dualApprovalThreshold: 500 });
    expect((await gate(user('a'), 'CHURCH', 'e1', 499.99, true)).waiting).toBe(false);
  });

  test('at the threshold the first approval waits for a second person', async () => {
    policy({ dualApprovalThreshold: 500 });
    expect(await gate(user('a'), 'CHURCH', 'e1', 500, true)).toEqual({ waiting: true, approvals: 1, needed: 2 });
    expect(prisma.expenditureApproval.create.mock.calls[0][0].data).toMatchObject({ kind: 'CHURCH', expenditureId: 'e1', approverId: 'a', decision: 'APPROVED' });
  });

  test('a different second approver completes it', async () => {
    policy({ dualApprovalThreshold: 500 });
    prisma.expenditureApproval.findMany.mockResolvedValue([{ approverId: 'a' }]);
    expect(await gate(user('b'), 'CHURCH', 'e1', 800, true)).toEqual({ waiting: false, approvals: 2, needed: 2 });
  });

  test('the same person cannot be both approvers', async () => {
    policy({ dualApprovalThreshold: 500 });
    prisma.expenditureApproval.findMany.mockResolvedValue([{ approverId: 'a' }]);
    await expect(gate(user('a'), 'CHURCH', 'e1', 800, true)).rejects.toThrow(/second, different approver/);
    expect(prisma.expenditureApproval.create).not.toHaveBeenCalled();
  });

  test('a rejection is final at once, whatever the amount', async () => {
    policy({ dualApprovalThreshold: 500 });
    expect((await gate(user('a'), 'CHURCH', 'e1', 9000, false)).waiting).toBe(false);
    expect(prisma.expenditureApproval.create.mock.calls[0][0].data.decision).toBe('REJECTED');
  });

  test('a repeated click updates the same decision instead of failing', async () => {
    policy(null);
    prisma.expenditureApproval.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    prisma.expenditureApproval.updateMany.mockResolvedValue({ count: 1 });
    await gate(user('a'), 'CHURCH', 'e1', 10, true);
    expect(prisma.expenditureApproval.updateMany).toHaveBeenCalled();
  });
});

describe('payment segregation', () => {
  test('the requester can never record payment on their own request', async () => {
    policy(null);
    await expect(assertPayer(user('a'), 'CHURCH', 'e1', 'm-a')).rejects.toThrow(/your own request/);
    await expect(assertPayer(user('a'), 'CIRCUIT', 'e1', 'a')).rejects.toThrow(/your own request/);
  });

  test('an approver may pay unless the church turned the rule on', async () => {
    prisma.expenditureApproval.findMany.mockResolvedValue([{ approverId: 'a' }]);
    policy(null);
    await expect(assertPayer(user('a'), 'CHURCH', 'e1', 'someone')).resolves.toBeUndefined();
    policy({ payerNotApprover: true });
    await expect(assertPayer(user('a'), 'CHURCH', 'e1', 'someone')).rejects.toThrow(/you approved/);
    await expect(assertPayer(user('z'), 'CHURCH', 'e1', 'someone')).resolves.toBeUndefined();
  });
});

describe('policy setting', () => {
  test('needs finance:policy:manage and rejects nonsense', async () => {
    await expect(setPolicy(user('a'), { dualApprovalThreshold: 100 })).rejects.toThrow(/finance:policy:manage/);
    await expect(setPolicy(user('a', 'finance:policy:manage'), { dualApprovalThreshold: -5 })).rejects.toThrow();
    await expect(setPolicy(user('a', 'finance:policy:manage'), { surprise: true })).rejects.toThrow();
    prisma.systemSetting.upsert.mockResolvedValue({});
    expect(await setPolicy(user('a', 'finance:policy:manage'), { dualApprovalThreshold: 250 })).toEqual({ dualApprovalThreshold: 250, payerNotApprover: false });
  });
});
