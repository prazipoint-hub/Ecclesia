import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { audit, require } from '@/features/shared';
import type { AuthorizedUser } from '@/types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/types/errors';
import { documentRepository as repository } from '../repository';
import type { CreateTemplateInput, GenerateDocumentInput, UpdateTemplateInput } from '../types';
import { fill, placeholdersIn, renderPdf, unknownPlaceholders } from './render';

const isP2002 = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const serial = (now: Date) => `DOC-${now.getUTCFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;

export class DocumentService {
  async templates(user: AuthorizedUser, type?: string) {
    require(user, 'document:view');
    return repository.templates(user.churchId, type);
  }

  async createTemplate(user: AuthorizedUser, input: CreateTemplateInput) {
    require(user, 'document:template:manage');
    this.assertPlaceholders(input.title, input.body);
    try {
      const t = await repository.createTemplate({ churchId: user.churchId, ...input });
      await audit(user, 'DOCUMENT_TEMPLATE_CREATED', 'DOCUMENT_TEMPLATE', t.id, { name: t.name, type: t.type });
      return t;
    } catch (e) {
      if (isP2002(e)) throw new ConflictError('A template with that name already exists');
      throw e;
    }
  }

  async updateTemplate(user: AuthorizedUser, id: string, input: UpdateTemplateInput) {
    require(user, 'document:template:manage');
    const t = await repository.findTemplate(user.churchId, id);
    if (!t) throw new NotFoundError('Template');
    this.assertPlaceholders(input.title ?? t.title, input.body ?? t.body);
    try {
      const updated = await repository.updateTemplate(id, input);
      await audit(user, 'DOCUMENT_TEMPLATE_UPDATED', 'DOCUMENT_TEMPLATE', id, { fields: Object.keys(input) });
      return updated;
    } catch (e) {
      if (isP2002(e)) throw new ConflictError('A template with that name already exists');
      throw e;
    }
  }

  /** The text is rendered and frozen now, so later template edits never alter an issued document. */
  async generate(user: AuthorizedUser, input: GenerateDocumentInput, now = new Date()) {
    require(user, 'document:generate');
    const template = await repository.findTemplate(user.churchId, input.templateId);
    if (!template) throw new NotFoundError('Template');
    if (!template.isActive) throw new ConflictError('This template is switched off');
    const church = await repository.church(user.churchId);

    const needed = placeholdersIn(`${template.title}\n${template.body}`);
    const needsMember = needed.some((p) => p.startsWith('member'));
    let member: NonNullable<Awaited<ReturnType<typeof repository.member>>> | null = null;
    if (input.memberId) {
      member = await repository.member(user.churchId, input.memberId);
      if (!member) throw new NotFoundError('Member');
      if (member.archivedAt) throw new ForbiddenError('This member record is archived');
    }
    if (needsMember && !member) throw new ValidationError('This template needs a member');
    const missing = needed.filter((p) => p.startsWith('field.') && input.fields[p.slice(6)] === undefined).map((p) => p.slice(6));
    if (missing.length) throw new ValidationError(`Missing values: ${missing.join(', ')}`);

    for (let attempt = 0; attempt < 3; attempt++) {
      const number = serial(now);
      const values: Record<string, string | undefined> = {
        memberName: member ? `${member.firstName} ${member.lastName}` : undefined, memberFirstName: member?.firstName, memberLastName: member?.lastName,
        membershipNumber: member?.membershipNumber, churchName: church?.name ?? '', date: now.toISOString().slice(0, 10), serial: number,
        ...Object.fromEntries(Object.entries(input.fields).map(([k, v]) => [`field.${k}`, v])),
      };
      try {
        const doc = await repository.create({
          churchId: user.churchId, templateId: template.id, memberId: member?.id ?? null, type: template.type, serial: number,
          title: fill(template.title, values), content: fill(template.body, values), issuedBy: user.memberId ?? user.id,
        });
        await audit(user, 'DOCUMENT_GENERATED', 'DOCUMENT', doc.id, { serial: number, type: template.type, memberId: member?.id ?? null });
        return doc;
      } catch (e) {
        if (!isP2002(e) || attempt === 2) throw e;
      }
    }
    throw new ConflictError('Please try again');
  }

  async list(user: AuthorizedUser, query: { type?: string; memberId?: string; skip: number; take: number }) {
    require(user, 'document:view');
    return repository.list(user.churchId, query);
  }

  async get(user: AuthorizedUser, id: string) {
    require(user, 'document:view');
    return this.find(user, id);
  }

  async pdf(user: AuthorizedUser, id: string) {
    require(user, 'document:view');
    const doc = await this.find(user, id);
    const church = await repository.church(user.churchId);
    const buffer = await renderPdf({ title: doc.title, content: doc.content, serial: doc.serial, churchName: church?.name ?? '', voided: Boolean(doc.voidedAt), type: doc.type });
    return { buffer, filename: `${doc.serial}.pdf` };
  }

  /** A voided document stays on record and its PDF is stamped VOID; it is never deleted. */
  async void(user: AuthorizedUser, id: string, reason: string) {
    require(user, 'document:generate');
    await this.find(user, id);
    const claimed = await repository.void(user.churchId, id, reason, new Date());
    if (claimed.count === 0) throw new ConflictError('This document is already void');
    await audit(user, 'DOCUMENT_VOIDED', 'DOCUMENT', id, { reason });
    return this.find(user, id);
  }

  private async find(user: AuthorizedUser, id: string) {
    const doc = await repository.find(user.churchId, id);
    if (!doc) throw new NotFoundError('Document');
    return doc;
  }
  private assertPlaceholders(...texts: string[]) {
    const unknown = [...new Set(texts.flatMap(unknownPlaceholders))];
    if (unknown.length) throw new ValidationError(`Unknown placeholders: ${unknown.map((p) => `{{${p}}}`).join(', ')}`);
  }
}

export const documentService = new DocumentService();
