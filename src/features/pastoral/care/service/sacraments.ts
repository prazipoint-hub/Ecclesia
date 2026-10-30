import { ConflictError, NotFoundError, ValidationError } from '@/types/errors';
import type { AuthorizedUser } from '@/types';
import { pastoralCareRepository as repository } from '../repository';
import type { CreateFuneralInput, UpdateFuneralInput } from '../types';
import { actorOf, audit, memberInChurch, notInFuture, require } from './common';

const PERMISSION = 'pastoral:sacrament:manage';

const BAPTISM = ['CANDIDATE', 'IN_PREPARATION', 'INTERVIEWED', 'APPROVED', 'BAPTIZED', 'RECORDED'];
const CONFIRMATION = ['CANDIDATE', 'IN_PREPARATION', 'TAUGHT', 'ASSESSED', 'APPROVED', 'CONFIRMED', 'RECORDED'];
const MARRIAGE = ['PRE_MARITAL_COUNSELING', 'COUNSELING_COMPLETE', 'APPROVED', 'MARRIED', 'RECORDED'];

/** A sacrament moves one step at a time; skipping or going back would misstate what actually happened. */
function nextStep(order: string[], current: string, requested: string): void {
  const from = order.indexOf(current);
  const to = order.indexOf(requested);
  if (from < 0 || to < 0) throw new ValidationError(`Unknown status ${requested}`);
  if (to !== from + 1) {
    const expected = order[from + 1];
    throw new ConflictError(expected ? `This record is ${current}; the next step is ${expected}, not ${requested}` : `This record is already ${current} and cannot move further`);
  }
}

const need = (value: unknown, message: string): void => {
  if (!value) throw new ValidationError(message);
};

export class SacramentService {
  // ------------------------------------------------------------------ baptism
  async listBaptisms(user: AuthorizedUser, query: { status?: string; memberId?: string; skip: number; take: number }) {
    require(user, PERMISSION);
    return repository.listBaptisms(
      { churchId: user.churchId, ...(query.status ? { status: query.status } : {}), ...(query.memberId ? { memberId: query.memberId } : {}) },
      query
    );
  }

  async createBaptism(user: AuthorizedUser, input: { memberId: string; preparationNotes?: string }) {
    require(user, PERMISSION);
    actorOf(user);
    await memberInChurch(user, input.memberId);
    if (await repository.findBaptismFor(user.churchId, input.memberId)) throw new ConflictError('This member already has a baptism record');
    const record = await repository.createBaptism({ churchId: user.churchId, memberId: input.memberId, preparationNotes: input.preparationNotes ?? null });
    await audit(user, 'BAPTISM_RECORD_CREATED', 'BAPTISM', record.id, { memberId: input.memberId });
    return record;
  }

  async advanceBaptism(
    user: AuthorizedUser,
    id: string,
    input: { status: string; preparationNotes?: string; interviewDate?: Date; baptismDate?: Date; baptizedBy?: string; location?: string; witnesses?: string }
  ) {
    require(user, PERMISSION);
    const actor = actorOf(user);
    const record = await repository.findBaptism(user.churchId, id);
    if (!record) throw new NotFoundError('Baptism record');
    nextStep(BAPTISM, record.status, input.status);
    if (input.status === 'INTERVIEWED') need(input.interviewDate, 'Enter the interview date');
    if (input.status === 'BAPTIZED') {
      need(input.baptismDate ?? record.baptismDate, 'Enter the baptism date');
      need(input.baptizedBy ?? record.baptizedBy, 'Enter who performed the baptism');
      notInFuture((input.baptismDate ?? record.baptismDate)!, 'The baptism date');
    }
    const claimed = await repository.claimBaptism(id, record.status, {
      status: input.status,
      ...(input.preparationNotes !== undefined ? { preparationNotes: input.preparationNotes } : {}),
      ...(input.status === 'INTERVIEWED' ? { interviewDate: input.interviewDate, interviewedBy: actor } : {}),
      ...(input.baptismDate ? { baptismDate: input.baptismDate } : {}),
      ...(input.baptizedBy ? { baptizedBy: input.baptizedBy } : {}),
      ...(input.location ? { location: input.location } : {}),
      ...(input.witnesses ? { witnesses: input.witnesses } : {}),
      ...(input.status === 'RECORDED' ? { recordedAt: new Date() } : {}),
    });
    if (claimed.count === 0) throw new ConflictError('This record was changed by someone else. Reload and try again.');
    await audit(user, 'BAPTISM_STATUS_CHANGED', 'BAPTISM', id, { from: record.status, to: input.status });
    return repository.findBaptism(user.churchId, id);
  }

  // ------------------------------------------------------------- confirmation
  async listConfirmations(user: AuthorizedUser, query: { status?: string; memberId?: string; skip: number; take: number }) {
    require(user, PERMISSION);
    return repository.listConfirmations(
      { churchId: user.churchId, ...(query.status ? { status: query.status } : {}), ...(query.memberId ? { memberId: query.memberId } : {}) },
      query
    );
  }

  async createConfirmation(user: AuthorizedUser, input: { memberId: string; preparationNotes?: string }) {
    require(user, PERMISSION);
    actorOf(user);
    await memberInChurch(user, input.memberId);
    if (await repository.findConfirmationFor(user.churchId, input.memberId)) throw new ConflictError('This member already has a confirmation record');
    const record = await repository.createConfirmation({ churchId: user.churchId, memberId: input.memberId, preparationNotes: input.preparationNotes ?? null });
    await audit(user, 'CONFIRMATION_RECORD_CREATED', 'CONFIRMATION', record.id, { memberId: input.memberId });
    return record;
  }

  async advanceConfirmation(
    user: AuthorizedUser,
    id: string,
    input: { status: string; preparationNotes?: string; teachingNotes?: string; assessmentNotes?: string; confirmationDate?: Date; confirmedBy?: string; location?: string }
  ) {
    require(user, PERMISSION);
    actorOf(user);
    const record = await repository.findConfirmation(user.churchId, id);
    if (!record) throw new NotFoundError('Confirmation record');
    nextStep(CONFIRMATION, record.status, input.status);
    if (input.status === 'CONFIRMED') {
      need(input.confirmationDate ?? record.confirmationDate, 'Enter the confirmation date');
      need(input.confirmedBy ?? record.confirmedBy, 'Enter who performed the confirmation');
      notInFuture((input.confirmationDate ?? record.confirmationDate)!, 'The confirmation date');
    }
    const claimed = await repository.claimConfirmation(id, record.status, {
      status: input.status,
      ...(input.preparationNotes !== undefined ? { preparationNotes: input.preparationNotes } : {}),
      ...(input.teachingNotes !== undefined ? { teachingNotes: input.teachingNotes } : {}),
      ...(input.assessmentNotes !== undefined ? { assessmentNotes: input.assessmentNotes } : {}),
      ...(input.confirmationDate ? { confirmationDate: input.confirmationDate } : {}),
      ...(input.confirmedBy ? { confirmedBy: input.confirmedBy } : {}),
      ...(input.location ? { location: input.location } : {}),
      ...(input.status === 'RECORDED' ? { recordedAt: new Date() } : {}),
    });
    if (claimed.count === 0) throw new ConflictError('This record was changed by someone else. Reload and try again.');
    await audit(user, 'CONFIRMATION_STATUS_CHANGED', 'CONFIRMATION', id, { from: record.status, to: input.status });
    return repository.findConfirmation(user.churchId, id);
  }

  // ----------------------------------------------------------------- marriage
  async listMarriages(user: AuthorizedUser, query: { status?: string; memberId?: string; skip: number; take: number }) {
    require(user, PERMISSION);
    return repository.listMarriages(
      {
        churchId: user.churchId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.memberId ? { OR: [{ partner1Id: query.memberId }, { partner2Id: query.memberId }] } : {}),
      },
      query
    );
  }

  async createMarriage(user: AuthorizedUser, input: { partner1Id: string; partner2Id: string; counselorId?: string; premaritalCounselingNotes?: string }) {
    require(user, PERMISSION);
    actorOf(user);
    if (input.partner1Id === input.partner2Id) throw new ValidationError('A marriage needs two different people');
    await memberInChurch(user, input.partner1Id, 'First partner');
    await memberInChurch(user, input.partner2Id, 'Second partner');
    if (input.counselorId) await memberInChurch(user, input.counselorId, 'Counselor');
    if (await repository.findMarriageInvolving(user.churchId, [input.partner1Id, input.partner2Id])) {
      throw new ConflictError('One of these members already has a marriage record in progress');
    }
    const record = await repository.createMarriage({
      churchId: user.churchId,
      partner1Id: input.partner1Id,
      partner2Id: input.partner2Id,
      counselorId: input.counselorId ?? null,
      premaritalCounselingNotes: input.premaritalCounselingNotes ?? null,
    });
    await audit(user, 'MARRIAGE_RECORD_CREATED', 'MARRIAGE', record.id, { partner1Id: input.partner1Id, partner2Id: input.partner2Id });
    return record;
  }

  async advanceMarriage(
    user: AuthorizedUser,
    id: string,
    input: { status: string; premaritalCounselingNotes?: string; marriageDate?: Date; marriedBy?: string; location?: string; witnesses?: string }
  ) {
    require(user, PERMISSION);
    actorOf(user);
    const record = await repository.findMarriage(user.churchId, id);
    if (!record) throw new NotFoundError('Marriage record');
    nextStep(MARRIAGE, record.status, input.status);
    if (input.status === 'MARRIED') {
      need(input.marriageDate ?? record.marriageDate, 'Enter the marriage date');
      need(input.marriedBy ?? record.marriedBy, 'Enter who officiated');
      notInFuture((input.marriageDate ?? record.marriageDate)!, 'The marriage date');
    }
    const claimed = await repository.claimMarriage(id, record.status, {
      status: input.status,
      ...(input.premaritalCounselingNotes !== undefined ? { premaritalCounselingNotes: input.premaritalCounselingNotes } : {}),
      ...(input.status === 'COUNSELING_COMPLETE' ? { counselingComplete: new Date() } : {}),
      ...(input.marriageDate ? { marriageDate: input.marriageDate } : {}),
      ...(input.marriedBy ? { marriedBy: input.marriedBy } : {}),
      ...(input.location ? { location: input.location } : {}),
      ...(input.witnesses ? { witnesses: input.witnesses } : {}),
      ...(input.status === 'RECORDED' ? { recordedAt: new Date() } : {}),
    });
    if (claimed.count === 0) throw new ConflictError('This record was changed by someone else. Reload and try again.');
    await audit(user, 'MARRIAGE_STATUS_CHANGED', 'MARRIAGE', id, { from: record.status, to: input.status });
    return repository.findMarriage(user.churchId, id);
  }

  // ------------------------------------------------------------------ funeral
  async listFunerals(user: AuthorizedUser, query: { memberId?: string; skip: number; take: number }) {
    require(user, PERMISSION);
    return repository.listFunerals({ churchId: user.churchId, ...(query.memberId ? { deceasedId: query.memberId } : {}) }, query);
  }

  async createFuneral(user: AuthorizedUser, input: CreateFuneralInput) {
    require(user, PERMISSION);
    actorOf(user);
    await memberInChurch(user, input.deceasedId, 'Deceased member');
    notInFuture(input.deathDate, 'The date of death');
    if (await repository.findFuneralFor(user.churchId, input.deceasedId)) throw new ConflictError('A funeral record already exists for this member');
    const record = await repository.createFuneral({ ...input, churchId: user.churchId });
    await audit(user, 'FUNERAL_RECORD_CREATED', 'FUNERAL', record.id, { deceasedId: input.deceasedId });
    return record;
  }

  async updateFuneral(user: AuthorizedUser, id: string, input: UpdateFuneralInput) {
    require(user, PERMISSION);
    actorOf(user);
    const record = await repository.findFuneral(user.churchId, id);
    if (!record) throw new NotFoundError('Funeral record');
    if (record.recordedAt) throw new ConflictError('A recorded funeral can no longer be changed');
    if (input.record && !(input.funeralDate ?? record.funeralDate)) throw new ValidationError('Enter the funeral date before recording it');
    const { record: recordNow, familyNotified, ...details } = input;
    const updated = await repository.updateFuneral(id, {
      ...details,
      ...(familyNotified && !record.familyNotified ? { familyNotified: true, familyNotifiedAt: new Date() } : {}),
      ...(recordNow ? { recordedAt: new Date() } : {}),
    });
    await audit(user, 'FUNERAL_RECORD_UPDATED', 'FUNERAL', id, { familyNotified, recorded: Boolean(recordNow) });
    return updated;
  }
}

export const sacramentService = new SacramentService();
