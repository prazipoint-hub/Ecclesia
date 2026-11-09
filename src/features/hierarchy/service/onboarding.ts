import { prisma } from '@/database';
import { logger } from '@/config/logger';
import { can } from '@/features/access/service/scope';
import type { AuthorizedUser } from '@/types';
import { ConflictError, NotFoundError, ValidationError } from '@/types/errors';

export const CONFIRMABLE_STEPS = ['DETAILS', 'MEMBERSHIP', 'LEADERSHIP', 'ACCESS'] as const;
export type ConfirmableStep = (typeof CONFIRMABLE_STEPS)[number];

type StepState = { step: string; title: string; kind: 'confirm' | 'derived'; confirmed: boolean; confirmedAt: Date | null; ready: boolean; done: boolean; blockers: string[]; counts?: Record<string, number> };

/** Viewing needs circuit:view or circuit:onboard; changing needs circuit:onboard. Both resolve through scoped grants only. */
async function allow(user: AuthorizedUser, circuitId: string, write: boolean) {
  const scope = { type: 'CIRCUIT' as const, id: circuitId };
  const ok = (await can(user, 'circuit:onboard', scope)) || (!write && (await can(user, 'circuit:view', scope)));
  // Same answer as "missing" for people with no business here.
  if (!ok) throw new NotFoundError('Circuit');
}

export class OnboardingService {
  /** Everything shown to the Secretary is recomputed from live records, so nothing can be "completed" by just visiting a page. */
  async status(user: AuthorizedUser, circuitId: string) {
    await allow(user, circuitId, false);
    return this.compute(circuitId);
  }

  async confirm(user: AuthorizedUser, circuitId: string, step: string) {
    await allow(user, circuitId, true);
    if (!(CONFIRMABLE_STEPS as readonly string[]).includes(step)) throw new ValidationError(`Unknown step. Use one of: ${CONFIRMABLE_STEPS.join(', ')}`);
    const state = await this.compute(circuitId);
    if (state.completedAt) throw new ConflictError('Onboarding is already complete');
    const s = state.steps.find((x) => x.step === step)!;
    // A step can only be confirmed once its real prerequisites hold; the blockers say exactly what is missing.
    if (!s.ready) throw new ValidationError(`Cannot confirm ${s.title}: ${s.blockers.join('; ')}`);
    await prisma.circuitOnboardingStep.upsert({
      where: { circuitId_step: { circuitId, step } },
      update: { confirmedBy: user.id, confirmedAt: new Date() },
      create: { circuitId, step, confirmedBy: user.id },
    });
    await this.audit(user, 'CIRCUIT_ONBOARDING_STEP_CONFIRMED', circuitId, { step });
    return this.compute(circuitId);
  }

  async complete(user: AuthorizedUser, circuitId: string) {
    await allow(user, circuitId, true);
    const state = await this.compute(circuitId);
    if (state.completedAt) return state; // retry-safe
    const open = state.steps.filter((s) => !s.done);
    if (open.length) throw new ValidationError(`Onboarding is not finished: ${open.map((s) => `${s.title} (${s.blockers[0] ?? 'needs confirmation'})`).join('; ')}`);
    // Compare-and-set so two simultaneous completes record one completion.
    const res = await prisma.circuit.updateMany({ where: { id: circuitId, onboardedAt: null }, data: { onboardedAt: new Date(), onboardedBy: user.id } });
    if (res.count === 1) await this.audit(user, 'CIRCUIT_ONBOARDING_COMPLETED', circuitId, {});
    return this.compute(circuitId);
  }

  private async compute(circuitId: string) {
    const circuit = await prisma.circuit.findUnique({ where: { id: circuitId } });
    if (!circuit) throw new NotFoundError('Circuit');
    const [churches, confirmations, invite] = await Promise.all([
      prisma.church.findMany({ where: { circuitId }, select: { id: true } }),
      prisma.circuitOnboardingStep.findMany({ where: { circuitId } }),
      prisma.invitation.findFirst({ where: { grantScopeType: 'CIRCUIT', grantScopeId: circuitId }, orderBy: { createdAt: 'asc' }, select: { memberId: true } }),
    ]);
    const churchIds = churches.map((c) => c.id);
    const secretaryId = invite?.memberId ?? null;
    const others = secretaryId ? { id: { not: secretaryId } } : {};
    const now = new Date();
    const [sections, organizations, members, legacyLeaders, appointees] = churchIds.length
      ? await Promise.all([
          prisma.section.count({ where: { churchId: { in: churchIds } } }),
          prisma.organization.count({ where: { churchId: { in: churchIds }, status: 'ACTIVE' } }),
          prisma.member.count({ where: { churchId: { in: churchIds }, membershipStatus: 'ACTIVE', archivedAt: null, ...others } }),
          prisma.leadershipAssignment.count({
            where: { churchId: { in: churchIds }, ...(secretaryId ? { memberId: { not: secretaryId } } : {}), startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gt: now } }] },
          }),
          // Appointments that are approved and in force right now (pending/revoked/expired/future do not count).
          prisma.appointment.count({ where: { churchId: { in: churchIds }, ...(secretaryId ? { memberId: { not: secretaryId } } : {}), status: 'ACTIVE', termStart: { lte: now }, OR: [{ termEnd: null }, { termEnd: { gt: now } }] } }),
        ])
      : [0, 0, 0, 0, 0];
    const leaders = legacyLeaders + appointees;

    const at = (k: string) => confirmations.find((c) => c.step === k);
    const mk = (step: string, title: string, kind: StepState['kind'], blockers: string[], counts?: Record<string, number>): StepState => {
      const c = at(step);
      const ready = blockers.length === 0;
      return { step, title, kind, confirmed: !!c, confirmedAt: c?.confirmedAt ?? null, ready, done: kind === 'derived' ? ready : ready && !!c, blockers, counts };
    };
    const detailsBlockers = [
      ...(circuit.districtId ? [] : ['no district recorded']),
      ...(circuit.identificationNumber ? [] : ['no identification number']),
      ...(circuit.location ? [] : ['no location recorded']),
      ...(circuit.status === 'ACTIVE' ? [] : [`circuit status is ${circuit.status}`]),
    ];
    const structure = [...(sections ? [] : ['add at least one section']), ...(organizations ? [] : ['add at least one organisation'])];
    const steps = [
      mk('DETAILS', 'Confirm circuit details', 'confirm', detailsBlockers),
      mk('STRUCTURE', 'Sections and organisations', 'derived', structure, { sections, organizations }),
      mk('MEMBERSHIP', 'Import and verify membership', 'confirm', members ? [] : ['import or add at least one member besides the Secretary'], { members }),
      mk('LEADERSHIP', 'Import and verify leadership', 'confirm', leaders ? [] : ['record at least one active leadership appointment besides the Secretary'], { appointments: leaders }),
      mk('ACCESS', 'Review access and finance setup', 'confirm', []),
    ];
    const done = steps.filter((s) => s.done).length;
    return {
      circuitId, completedAt: circuit.onboardedAt, progress: { done, total: steps.length }, steps,
      canComplete: done === steps.length && !circuit.onboardedAt,
    };
  }

  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'CIRCUIT', entityId, actorId: user.memberId ?? user.id, changes: JSON.stringify(details) } });
    } catch (error) {
      logger.error({ err: error, action }, 'Failed to write onboarding audit log');
    }
  }
}
export const onboardingService = new OnboardingService();
