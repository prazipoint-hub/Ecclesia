import { z } from 'zod';
import { logger } from '@/config/logger';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError } from '@/types/errors';

/**
 * Profile completion, next of kin, and review of sensitive self-service changes.
 *  - The completion rule is a church setting (`profile.required_fields`); percent = satisfied required fields / required fields.
 *  - Members edit contact details directly (myAccount). Date of birth, gender and marital status go through a review queue
 *    and are applied only when someone OTHER than the member approves, and only if the value is still what it was.
 *  - Reports return counts only; no personal values leave this service.
 */
export const RULE_KEY = 'profile.required_fields';
export const FIELDS = ['firstName', 'lastName', 'phone', 'email', 'dateOfBirth', 'gender', 'maritalStatus', 'address', 'section', 'nextOfKin'] as const;
export type RuleField = (typeof FIELDS)[number];
export const DEFAULT_RULE: RuleField[] = ['firstName', 'lastName', 'phone', 'dateOfBirth', 'gender', 'address', 'nextOfKin'];
export const REVIEWED_FIELDS = ['dateOfBirth', 'gender', 'maritalStatus'] as const;

export const RuleSchema = z.object({ fields: z.array(z.enum(FIELDS)).min(1).max(FIELDS.length) }).strict();
export const NextOfKinSchema = z.object({
  name: z.string().trim().min(2).max(120),
  relationship: z.string().trim().min(2).max(60),
  phone: z.string().trim().min(5).max(40),
  altPhone: z.string().trim().min(5).max(40).optional(),
  address: z.string().trim().max(190).optional(),
}).strict();
export const ChangeRequestSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('dateOfBirth'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().startsWith(v) && new Date(v) < new Date() && new Date(v).getUTCFullYear() > 1900, 'Enter a real past date') }).strict(),
  z.object({ field: z.literal('gender'), value: z.enum(['MALE', 'FEMALE']) }).strict(),
  z.object({ field: z.literal('maritalStatus'), value: z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']) }).strict(),
]);
export const ReviewSchema = z.object({ note: z.string().trim().min(3).max(500) }).strict();

const present = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '';
type Check = Record<string, unknown> & { nextOfKin?: unknown };

export class ProfileCompletionService {
  async rule(churchId: string): Promise<{ fields: RuleField[]; source: 'church' | 'default' }> {
    const row = await prisma.systemSetting.findUnique({ where: { churchId_key: { churchId, key: RULE_KEY } } });
    const parsed = RuleSchema.safeParse({ fields: row?.value });
    return parsed.success ? { fields: parsed.data.fields, source: 'church' } : { fields: DEFAULT_RULE, source: 'default' };
  }

  async setRule(user: AuthorizedUser, raw: unknown) {
    this.need(user, 'member:profile:configure');
    const { fields } = RuleSchema.parse(raw);
    await prisma.systemSetting.upsert({
      where: { churchId_key: { churchId: user.churchId, key: RULE_KEY } },
      create: { churchId: user.churchId, key: RULE_KEY, value: fields, category: 'profile', updatedBy: user.id },
      update: { value: fields, updatedBy: user.id },
    });
    await this.audit(user.churchId, user.id, 'PROFILE_RULE_CHANGED', 'SETTING', RULE_KEY, { fields });
    return { fields, source: 'church' as const };
  }

  private missing(rule: RuleField[], m: Check): RuleField[] {
    return rule.filter((f) => !present(f === 'section' ? m.sectionId : m[f]));
  }

  /** Percent comes only from the rule: satisfied required fields / required fields. */
  async mine(user: AuthorizedUser) {
    if (!user.memberId) throw new ForbiddenError('Forbidden: your account is not linked to a member profile');
    const member = await prisma.member.findUnique({ where: { id: user.memberId }, include: { nextOfKin: true } });
    if (!member || member.churchId !== user.churchId) throw new NotFoundError('Member profile');
    const { fields, source } = await this.rule(user.churchId);
    const missing = this.missing(fields, member as unknown as Check);
    return { required: fields, ruleSource: source, missing, percent: Math.round(((fields.length - missing.length) / fields.length) * 100), nextOfKin: member.nextOfKin ? { name: member.nextOfKin.name, relationship: member.nextOfKin.relationship, phone: member.nextOfKin.phone, altPhone: member.nextOfKin.altPhone, address: member.nextOfKin.address } : null };
  }

  async setNextOfKin(user: AuthorizedUser, raw: unknown) {
    if (!user.memberId) throw new ForbiddenError('Forbidden: your account is not linked to a member profile');
    const data = NextOfKinSchema.parse(raw);
    const member = await prisma.member.findUnique({ where: { id: user.memberId }, select: { churchId: true } });
    if (!member || member.churchId !== user.churchId) throw new NotFoundError('Member profile');
    await prisma.memberNextOfKin.upsert({ where: { memberId: user.memberId }, create: { memberId: user.memberId, ...data }, update: { ...data, altPhone: data.altPhone ?? null, address: data.address ?? null } });
    await this.audit(user.churchId, user.id, 'NEXT_OF_KIN_UPDATED', 'MEMBER', user.memberId, { fields: Object.keys(data) }); // values are not logged
    return this.mine(user);
  }

  // ---------------------------------------------------------------- reviewed changes

  async requestChange(user: AuthorizedUser, raw: unknown) {
    if (!user.memberId) throw new ForbiddenError('Forbidden: your account is not linked to a member profile');
    const input = ChangeRequestSchema.parse(raw);
    const member = await prisma.member.findUnique({ where: { id: user.memberId } });
    if (!member || member.churchId !== user.churchId) throw new NotFoundError('Member profile');
    const raw0: unknown = member[input.field];
    const current = raw0 instanceof Date ? raw0.toISOString().slice(0, 10) : ((raw0 as string | null) ?? null);
    if (current === input.value) throw new ConflictError('That is already your recorded value');
    const open = await prisma.profileChangeRequest.findFirst({ where: { memberId: member.id, field: input.field, status: 'PENDING' } });
    if (open) throw new ConflictError('You already have a pending request for this field');
    const row = await prisma.profileChangeRequest.create({ data: { churchId: user.churchId, memberId: member.id, field: input.field, oldValue: current, newValue: input.value, requestedBy: user.id } });
    await this.audit(user.churchId, user.id, 'PROFILE_CHANGE_REQUESTED', 'MEMBER', member.id, { field: input.field });
    return this.view(row);
  }

  async myRequests(user: AuthorizedUser) {
    if (!user.memberId) throw new ForbiddenError('Forbidden: your account is not linked to a member profile');
    const rows = await prisma.profileChangeRequest.findMany({ where: { memberId: user.memberId, churchId: user.churchId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((r) => this.view(r));
  }

  async queue(user: AuthorizedUser) {
    this.need(user, 'member:profile:review');
    const rows = await prisma.profileChangeRequest.findMany({ where: { churchId: user.churchId, status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 100 });
    return rows.map((r) => ({ ...this.view(r), memberId: r.memberId, ownRequest: !!user.memberId && r.memberId === user.memberId }));
  }

  async approve(user: AuthorizedUser, id: string, raw: unknown) {
    return this.decide(user, id, raw, true);
  }
  async reject(user: AuthorizedUser, id: string, raw: unknown) {
    return this.decide(user, id, raw, false);
  }

  private async decide(user: AuthorizedUser, id: string, raw: unknown, approve: boolean) {
    this.need(user, 'member:profile:review');
    const { note } = ReviewSchema.parse(raw);
    const req = await prisma.profileChangeRequest.findUnique({ where: { id } });
    if (!req || req.churchId !== user.churchId) throw new NotFoundError('Change request');
    if (req.requestedBy === user.id || (user.memberId && req.memberId === user.memberId)) throw new ForbiddenError('You cannot review a change to your own profile');
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.profileChangeRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: approve ? 'APPROVED' : 'REJECTED', reviewedBy: user.id, reviewedAt: new Date(), reviewNote: note } });
      if (claimed.count === 0) throw new ConflictError('This request was already reviewed');
      if (!approve) return;
      const member = await tx.member.findUnique({ where: { id: req.memberId } });
      if (!member || member.churchId !== user.churchId) throw new NotFoundError('Member');
      const cur: unknown = member[req.field as 'gender'];
      const now = cur instanceof Date ? cur.toISOString().slice(0, 10) : ((cur as string | null) ?? null);
      if (now !== req.oldValue) throw new ConflictError('The record changed since this was requested; ask the member to submit again');
      await tx.member.update({ where: { id: req.memberId }, data: { [req.field]: req.field === 'dateOfBirth' ? new Date(req.newValue) : req.newValue } });
    });
    await this.audit(user.churchId, user.id, approve ? 'PROFILE_CHANGE_APPROVED' : 'PROFILE_CHANGE_REJECTED', 'MEMBER', req.memberId, { field: req.field, requestId: id });
    return { id, status: approve ? 'APPROVED' : 'REJECTED' };
  }

  // ---------------------------------------------------------------- reporting (counts only)

  async report(user: AuthorizedUser) {
    this.need(user, 'member:profile:report');
    const { fields } = await this.rule(user.churchId);
    const members = await prisma.member.findMany({ where: { churchId: user.churchId, archivedAt: null, membershipStatus: 'ACTIVE' }, select: { firstName: true, lastName: true, phone: true, email: true, dateOfBirth: true, gender: true, maritalStatus: true, address: true, sectionId: true, nextOfKin: { select: { id: true } } }, take: 20000 });
    const missingBy: Record<string, number> = Object.fromEntries(fields.map((f) => [f, 0]));
    let complete = 0;
    let percentSum = 0;
    for (const m of members) {
      const miss = this.missing(fields, m as unknown as Check);
      miss.forEach((f) => { missingBy[f] += 1; });
      if (miss.length === 0) complete += 1;
      percentSum += ((fields.length - miss.length) / fields.length) * 100;
    }
    return { required: fields, activeMembers: members.length, complete, averagePercent: members.length ? Math.round(percentSum / members.length) : 0, missingByField: missingBy, truncated: members.length === 20000 };
  }

  private need(user: AuthorizedUser, perm: string) {
    if (!user.permissions.includes(perm)) throw new ForbiddenError(`Forbidden: ${perm} permission required`);
  }
  private view(r: { id: string; field: string; oldValue: string | null; newValue: string; status: string; reviewNote: string | null; createdAt: Date; reviewedAt: Date | null }) {
    return { id: r.id, field: r.field, oldValue: r.oldValue, newValue: r.newValue, status: r.status, reviewNote: r.reviewNote, createdAt: r.createdAt, reviewedAt: r.reviewedAt };
  }
  private async audit(churchId: string, actorId: string, action: string, entityType: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId, action, entityType, entityId, actorId, changes: JSON.stringify(details) } });
    } catch (error) { logger.error({ err: error, action }, 'Failed to write profile audit log'); }
  }
}

export const profileCompletionService = new ProfileCompletionService();
