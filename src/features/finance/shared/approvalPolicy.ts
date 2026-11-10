import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError } from '@/types/errors';

/**
 * Expenditure controls shared by church, section, circuit and district spending. Church setting `finance.expenditure.policy`:
 *  - dualApprovalThreshold: amounts at or above it need approval from TWO different people (null/absent = one approver, as before);
 *  - payerNotApprover: the person who records payment may not be one of the approvers (default off).
 * Always on: nobody approves their own request (checked by each service) and nobody records payment on their own request.
 */
export const POLICY_KEY = 'finance.expenditure.policy';
export const PolicySchema = z.object({
  dualApprovalThreshold: z.number().finite().positive().max(1e12).nullable().default(null),
  payerNotApprover: z.boolean().default(false),
}).strict();
export type ExpenditurePolicy = z.infer<typeof PolicySchema>;
export type ExpenditureKind = 'CHURCH' | 'SECTION' | 'CIRCUIT' | 'DISTRICT';

export async function getPolicy(churchId: string): Promise<ExpenditurePolicy> {
  const row = await prisma.systemSetting.findUnique({ where: { churchId_key: { churchId, key: POLICY_KEY } } });
  const parsed = PolicySchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : { dualApprovalThreshold: null, payerNotApprover: false };
}

export async function setPolicy(user: AuthorizedUser, raw: unknown) {
  if (!user.permissions.includes('finance:policy:manage')) throw new ForbiddenError('Forbidden: finance:policy:manage permission required');
  const value = PolicySchema.parse(raw);
  await prisma.systemSetting.upsert({
    where: { churchId_key: { churchId: user.churchId, key: POLICY_KEY } },
    create: { churchId: user.churchId, key: POLICY_KEY, value, category: 'finance', updatedBy: user.id },
    update: { value, updatedBy: user.id },
  });
  await prisma.auditLog.create({ data: { churchId: user.churchId, action: 'EXPENDITURE_POLICY_CHANGED', entityType: 'FINANCE', entityId: POLICY_KEY, actorId: user.memberId ?? user.id, changes: JSON.stringify(value) } }).catch(() => undefined);
  return value;
}

/**
 * Records this approver's decision and says whether the expenditure may now be decided.
 * A rejection is final at once. An approval below the threshold is final at once. At or above it, the first approval is
 * recorded and the expenditure stays SUBMITTED until a second, different person approves.
 */
export async function gate(user: AuthorizedUser, kind: ExpenditureKind, expenditureId: string, amount: Prisma.Decimal.Value, approved: boolean, notes?: string) {
  const policy = await getPolicy(user.churchId);
  const needed = approved && policy.dualApprovalThreshold !== null && new Prisma.Decimal(amount).gte(policy.dualApprovalThreshold) ? 2 : 1;
  const decision = approved ? 'APPROVED' : 'REJECTED';
  const prior = await prisma.expenditureApproval.findMany({ where: { kind, expenditureId, decision: 'APPROVED' }, select: { approverId: true } });
  const others = new Set(prior.map((p) => p.approverId).filter((id) => id !== user.id));
  if (approved && needed === 2 && prior.some((p) => p.approverId === user.id) && others.size === 0) {
    throw new ConflictError('You have already approved this. A second, different approver is needed.');
  }
  try {
    await prisma.expenditureApproval.create({ data: { kind, expenditureId, approverId: user.id, decision, notes: notes ?? null } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    await prisma.expenditureApproval.updateMany({ where: { kind, expenditureId, approverId: user.id }, data: { decision, notes: notes ?? null } });
  }
  const approvals = approved ? others.size + 1 : 0;
  return { waiting: approved && approvals < needed, approvals, needed };
}

/** Payment segregation: never the requester; optionally never an approver. */
export async function assertPayer(user: AuthorizedUser, kind: ExpenditureKind, expenditureId: string, requestedBy: string | null | undefined) {
  if (requestedBy && [user.id, user.memberId].some((id) => id && id === requestedBy)) throw new Error('Cannot record payment on your own request');
  const policy = await getPolicy(user.churchId);
  if (!policy.payerNotApprover) return;
  const approvers = await prisma.expenditureApproval.findMany({ where: { kind, expenditureId, decision: 'APPROVED' }, select: { approverId: true } });
  if (approvers.some((a) => a.approverId === user.id)) throw new Error('Cannot record payment on a request you approved (church policy)');
}
