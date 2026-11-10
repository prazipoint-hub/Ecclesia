import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '@/config/logger';
import { prisma } from '@/database';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { profileCompletionService } from './profileCompletion';

/**
 * Profile extras: church-defined fields, guardians for minors, and one small photo per member.
 * Guardian access is a link an administrator creates and the system ends by itself at 18 (checked on every use).
 */
export const FIELD_TYPES = ['TEXT', 'DATE', 'NUMBER', 'CHOICE'] as const;
export const FieldSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/, 'Use lowercase letters, digits and underscores, starting with a letter'),
  label: z.string().trim().min(2).max(100),
  fieldType: z.enum(FIELD_TYPES),
  options: z.array(z.string().trim().min(1).max(100)).min(2).max(30).optional(),
  required: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(1000).default(0),
}).strict().refine((f) => (f.fieldType === 'CHOICE') === !!f.options, { message: 'Choices are needed for a choice field, and only for a choice field', path: ['options'] });
export const FieldUpdateSchema = z.object({ label: z.string().trim().min(2).max(100).optional(), required: z.boolean().optional(), active: z.boolean().optional(), sortOrder: z.number().int().min(0).max(1000).optional() }).strict();
export const ValuesSchema = z.object({ values: z.record(z.string().max(64), z.string().trim().max(500)) }).strict();
export const GuardianSchema = z.object({ guardianMemberId: z.string().trim().min(1).max(64), minorMemberId: z.string().trim().min(1).max(64), relationship: z.enum(['PARENT', 'LEGAL_GUARDIAN', 'OTHER']) }).strict();
export const MAX_PHOTO_BYTES = 300 * 1024;
const ADULT_AGE = 18;

const ageOn = (dob: Date, now = new Date()) => {
  let a = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) a -= 1;
  return a;
};
export const isMinor = (dob: Date | null | undefined, now = new Date()) => !!dob && ageOn(dob, now) < ADULT_AGE;

/** The image type comes from the file's own first bytes, never from the header the client sent. */
export function sniffImage(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

const valid = (type: string, options: unknown, v: string): boolean => {
  if (v === '') return true; // clearing a value is allowed
  if (type === 'DATE') return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  if (type === 'NUMBER') return v.trim() !== '' && Number.isFinite(Number(v));
  if (type === 'CHOICE') return Array.isArray(options) && options.includes(v);
  return true;
};

export class ProfileExtrasService {
  // ----------------------------------------------------------------- extra fields

  async fieldsAdmin(user: AuthorizedUser) {
    this.need(user, 'member:profile:configure');
    return prisma.profileFieldDefinition.findMany({ where: { churchId: user.churchId }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }], take: 100 });
  }

  async createField(user: AuthorizedUser, raw: unknown) {
    this.need(user, 'member:profile:configure');
    const input = FieldSchema.parse(raw);
    try {
      const row = await prisma.profileFieldDefinition.create({ data: { churchId: user.churchId, key: input.key, label: input.label, fieldType: input.fieldType, options: input.options ?? Prisma.JsonNull, required: input.required, sortOrder: input.sortOrder } });
      await this.audit(user, 'PROFILE_FIELD_CREATED', row.id, { key: row.key, required: row.required });
      return row;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('A field with that key already exists');
      throw error;
    }
  }

  async updateField(user: AuthorizedUser, id: string, raw: unknown) {
    this.need(user, 'member:profile:configure');
    const input = FieldUpdateSchema.parse(raw);
    const res = await prisma.profileFieldDefinition.updateMany({ where: { id, churchId: user.churchId }, data: input });
    if (res.count === 0) throw new NotFoundError('Field');
    await this.audit(user, 'PROFILE_FIELD_UPDATED', id, input);
    return { id, ...input };
  }

  /** A member's active fields with their own values. */
  async mine(user: AuthorizedUser) {
    if (!user.memberId) throw new ForbiddenError('Forbidden: your account is not linked to a member profile');
    return this.valuesFor(user.churchId, user.memberId);
  }

  async setMine(user: AuthorizedUser, raw: unknown) {
    if (!user.memberId) throw new ForbiddenError('Forbidden: your account is not linked to a member profile');
    await this.writeValues(user, user.memberId, raw);
    return this.valuesFor(user.churchId, user.memberId);
  }

  private async valuesFor(churchId: string, memberId: string) {
    const defs = await prisma.profileFieldDefinition.findMany({ where: { churchId, active: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }], take: 100 });
    const vals = defs.length ? await prisma.profileFieldValue.findMany({ where: { memberId, fieldId: { in: defs.map((d) => d.id) } }, select: { fieldId: true, value: true } }) : [];
    const byField = new Map(vals.map((v) => [v.fieldId, v.value]));
    return { fields: defs.map((d) => ({ key: d.key, label: d.label, type: d.fieldType, options: d.options, required: d.required, value: byField.get(d.id) ?? '' })) };
  }

  private async writeValues(user: AuthorizedUser, memberId: string, raw: unknown) {
    const { values } = ValuesSchema.parse(raw);
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { churchId: true } });
    if (!member || member.churchId !== user.churchId) throw new NotFoundError('Member profile');
    const defs = await prisma.profileFieldDefinition.findMany({ where: { churchId: user.churchId, active: true, key: { in: Object.keys(values) } } });
    const known = new Map(defs.map((d) => [d.key, d]));
    for (const [key, v] of Object.entries(values)) {
      const d = known.get(key);
      if (!d) throw new ValidationError(`Unknown field: ${key}`);
      if (!valid(d.fieldType, d.options, v)) throw new ValidationError(`Invalid value for ${d.label}`);
    }
    await prisma.$transaction(async (tx) => {
      for (const [key, v] of Object.entries(values)) {
        const d = known.get(key)!;
        await tx.profileFieldValue.upsert({ where: { memberId_fieldId: { memberId, fieldId: d.id } }, create: { memberId, fieldId: d.id, value: v }, update: { value: v } });
      }
    });
    await this.audit(user, 'PROFILE_FIELDS_UPDATED', memberId, { keys: Object.keys(values), onBehalf: memberId !== user.memberId }); // values are not logged
  }

  // ----------------------------------------------------------------- guardians

  async linkGuardian(user: AuthorizedUser, raw: unknown) {
    this.need(user, 'family:update');
    const input = GuardianSchema.parse(raw);
    if (input.guardianMemberId === input.minorMemberId) throw new ValidationError('A person cannot be their own guardian');
    const [guardian, minor] = await Promise.all([
      prisma.member.findUnique({ where: { id: input.guardianMemberId }, select: { churchId: true, dateOfBirth: true } }),
      prisma.member.findUnique({ where: { id: input.minorMemberId }, select: { churchId: true, dateOfBirth: true } }),
    ]);
    if (!guardian || !minor || guardian.churchId !== user.churchId || minor.churchId !== user.churchId) throw new NotFoundError('Member');
    if (!minor.dateOfBirth) throw new ValidationError('Record the minor\'s date of birth first');
    if (!isMinor(minor.dateOfBirth)) throw new ValidationError('That person is 18 or older and manages their own profile');
    if (!guardian.dateOfBirth || isMinor(guardian.dateOfBirth)) throw new ValidationError('A guardian must be an adult with a recorded date of birth');
    const existing = await prisma.guardianLink.findUnique({ where: { guardianMemberId_minorMemberId: { guardianMemberId: input.guardianMemberId, minorMemberId: input.minorMemberId } } });
    if (existing?.status === 'ACTIVE') return { id: existing.id, created: false };
    const row = existing
      ? await prisma.guardianLink.update({ where: { id: existing.id }, data: { status: 'ACTIVE', relationship: input.relationship, revokedBy: null, revokedAt: null, createdBy: user.id } })
      : await prisma.guardianLink.create({ data: { churchId: user.churchId, ...input, createdBy: user.id } });
    await this.audit(user, 'GUARDIAN_LINKED', row.id, { relationship: input.relationship });
    return { id: row.id, created: true };
  }

  async revokeGuardian(user: AuthorizedUser, id: string) {
    this.need(user, 'family:update');
    const res = await prisma.guardianLink.updateMany({ where: { id, churchId: user.churchId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedBy: user.id, revokedAt: new Date() } });
    if (res.count === 0) throw new NotFoundError('Guardian link');
    await this.audit(user, 'GUARDIAN_REVOKED', id, {});
    return { id, status: 'REVOKED' };
  }

  async listGuardians(user: AuthorizedUser) {
    this.need(user, 'family:update');
    return prisma.guardianLink.findMany({ where: { churchId: user.churchId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  /** Throws unless the caller is an active guardian of this member AND the member is still under 18. */
  async assertGuardian(user: AuthorizedUser, minorMemberId: string) {
    if (!user.memberId) throw new ForbiddenError('Forbidden: your account is not linked to a member profile');
    const link = await prisma.guardianLink.findFirst({ where: { churchId: user.churchId, guardianMemberId: user.memberId, minorMemberId, status: 'ACTIVE' } });
    const minor = link ? await prisma.member.findUnique({ where: { id: minorMemberId }, select: { churchId: true, dateOfBirth: true } }) : null;
    // One answer for "not a guardian", "no such member" and "grown up now", so this cannot be used to probe other profiles.
    if (!link || !minor || minor.churchId !== user.churchId || !isMinor(minor.dateOfBirth)) throw new NotFoundError('Dependant');
  }

  async myDependants(user: AuthorizedUser) {
    if (!user.memberId) throw new ForbiddenError('Forbidden: your account is not linked to a member profile');
    const links = await prisma.guardianLink.findMany({ where: { churchId: user.churchId, guardianMemberId: user.memberId, status: 'ACTIVE' }, take: 50 });
    const out = [];
    for (const l of links) {
      const m = await prisma.member.findUnique({ where: { id: l.minorMemberId }, include: { nextOfKin: true } });
      if (!m || m.churchId !== user.churchId || !isMinor(m.dateOfBirth)) continue;
      const rule = await profileCompletionService.rule(user.churchId);
      const c = await profileCompletionService.completionFor(user.churchId, m as never, rule.fields, rule.source);
      out.push({ memberId: m.id, name: `${m.firstName} ${m.lastName}`, relationship: l.relationship, percent: c.percent, missing: c.missing, nextOfKin: c.nextOfKin });
    }
    return { dependants: out };
  }

  async dependantFields(user: AuthorizedUser, minorId: string) {
    await this.assertGuardian(user, minorId);
    return this.valuesFor(user.churchId, minorId);
  }
  async setDependantFields(user: AuthorizedUser, minorId: string, raw: unknown) {
    await this.assertGuardian(user, minorId);
    await this.writeValues(user, minorId, raw);
    return this.valuesFor(user.churchId, minorId);
  }
  async setDependantNextOfKin(user: AuthorizedUser, minorId: string, raw: unknown) {
    await this.assertGuardian(user, minorId);
    await profileCompletionService.setNextOfKinFor(user, minorId, raw);
    return { ok: true };
  }
  async requestDependantChange(user: AuthorizedUser, minorId: string, raw: unknown) {
    await this.assertGuardian(user, minorId);
    return profileCompletionService.requestChangeFor(user, minorId, raw);
  }

  // ----------------------------------------------------------------- photo

  async putPhoto(user: AuthorizedUser, memberId: string, body: unknown) {
    await this.mayEditPhoto(user, memberId);
    if (!Buffer.isBuffer(body) || body.length === 0) throw new ValidationError('Send the image as the request body (JPEG, PNG or WebP)');
    if (body.length > MAX_PHOTO_BYTES) throw new ValidationError(`The photo must be ${MAX_PHOTO_BYTES / 1024} KB or smaller`);
    const mime = sniffImage(body);
    if (!mime) throw new ValidationError('That file is not a JPEG, PNG or WebP image');
    const sha256 = createHash('sha256').update(body).digest('hex');
    await prisma.memberPhoto.upsert({ where: { memberId }, create: { memberId, mimeType: mime, data: body, sizeBytes: body.length, sha256, updatedBy: user.id }, update: { mimeType: mime, data: body, sizeBytes: body.length, sha256, updatedBy: user.id } });
    await this.audit(user, 'MEMBER_PHOTO_SET', memberId, { bytes: body.length, onBehalf: memberId !== user.memberId });
    return { memberId, mimeType: mime, sizeBytes: body.length };
  }

  async deletePhoto(user: AuthorizedUser, memberId: string) {
    await this.mayEditPhoto(user, memberId);
    await prisma.memberPhoto.deleteMany({ where: { memberId } });
    await this.audit(user, 'MEMBER_PHOTO_REMOVED', memberId, {});
    return { memberId, removed: true };
  }

  /** Own photo, a dependant's photo, or any photo to staff who can view members; always inside the caller's church. */
  async getPhoto(user: AuthorizedUser, memberId: string) {
    const member = await prisma.member.findUnique({ where: { id: memberId }, select: { churchId: true } });
    if (!member || member.churchId !== user.churchId) throw new NotFoundError('Photo');
    const allowed = memberId === user.memberId || user.permissions.includes('member:view') || (await this.isGuardianOf(user, memberId));
    if (!allowed) throw new NotFoundError('Photo');
    const photo = await prisma.memberPhoto.findUnique({ where: { memberId } });
    if (!photo) throw new NotFoundError('Photo');
    return { mimeType: photo.mimeType, data: Buffer.from(photo.data), sha256: photo.sha256 };
  }

  private async isGuardianOf(user: AuthorizedUser, memberId: string) {
    try { await this.assertGuardian(user, memberId); return true; } catch { return false; }
  }

  private async mayEditPhoto(user: AuthorizedUser, memberId: string) {
    if (memberId === user.memberId) return;
    if (!(await this.isGuardianOf(user, memberId))) throw new NotFoundError('Member profile');
  }

  private need(user: AuthorizedUser, perm: string) {
    if (!user.permissions.includes(perm)) throw new ForbiddenError(`Forbidden: ${perm} permission required`);
  }

  private async audit(user: AuthorizedUser, action: string, entityId: string, details: Record<string, unknown>) {
    try {
      await prisma.auditLog.create({ data: { churchId: user.churchId, action, entityType: 'MEMBER', entityId, actorId: user.id, changes: JSON.stringify(details) } });
    } catch (error) { logger.error({ err: error, action }, 'Failed to write profile audit log'); }
  }
}

export const profileExtrasService = new ProfileExtrasService();
