import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { createMockPrisma } from './helpers/mockPrisma';

const mocked = vi.hoisted(() => ({ prisma: undefined as unknown }));

vi.mock('@/database', async () => {
  const { createMockPrisma: create } = await import('./helpers/mockPrisma');
  mocked.prisma = create();
  return { prisma: mocked.prisma, default: mocked.prisma };
});

import { createApp } from '@/app';
import { jwtSecret } from '@/config/secrets';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const app = createApp();
const base = '/api/v2/pastoral';

const token = (id: string, memberId: string | null, permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: id, email: `${id}@example.com`, churchId: 'church-1', memberId, permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const as = (...permissions: string[]) => token('user-1', 'pastor-1', permissions);
const member = { id: 'm1', firstName: 'Ann', lastName: 'Moyo', membershipNumber: 'M-1', churchId: 'church-1', archivedAt: null };
const openCase = { id: 'case1', churchId: 'church-1', memberId: 'm1', status: 'OPEN' };
const long = 'This is a long enough description.';

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.$transaction.mockImplementation((async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))) as never);
  prisma.auditLog.create.mockResolvedValue({});
  prisma.member.findFirst.mockResolvedValue(member);
  prisma.pastoralCase.findFirst.mockResolvedValue(openCase);
});

describe('visits', () => {
  const body = { memberId: 'm1', visitType: 'SICKNESS', visitDate: '2026-03-01', purpose: long, observations: 'Recovering well at home, in good spirits.', outcome: 'NO_FURTHER_ACTION' };

  test('needs permission and a member-linked account', async () => {
    expect((await request(app).post(`${base}/visits`).set(as()).send(body)).status).toBe(403);
    const res = await request(app).post(`${base}/visits`).set(token('u', null, ['pastoral:visit:create'])).send(body);
    expect(res.status).toBe(400);
  });

  test('records the visit under the signed-in pastor and audits it', async () => {
    prisma.pastoralVisit.create.mockResolvedValue({ id: 'v1', memberId: 'm1', visitType: 'SICKNESS', outcome: 'NO_FURTHER_ACTION' });
    const res = await request(app).post(`${base}/visits`).set(as('pastoral:visit:create')).send(body);
    expect(res.status).toBe(201);
    expect(prisma.pastoralVisit.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', visitedBy: 'pastor-1' });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  test('a member from another church is not found', async () => {
    prisma.member.findFirst.mockResolvedValue(null);
    const res = await request(app).post(`${base}/visits`).set(as('pastoral:visit:create')).send(body);
    expect(res.status).toBe(404);
    expect(prisma.pastoralVisit.create).not.toHaveBeenCalled();
  });

  test('a case belonging to a different member is rejected', async () => {
    prisma.pastoralCase.findFirst.mockResolvedValue({ ...openCase, memberId: 'someone-else' });
    const res = await request(app).post(`${base}/visits`).set(as('pastoral:visit:create')).send({ ...body, caseId: 'case1' });
    expect(res.status).toBe(400);
  });

  test('a required follow-up needs a date', async () => {
    const res = await request(app).post(`${base}/visits`).set(as('pastoral:visit:create')).send({ ...body, followUpRequired: true });
    expect(res.status).toBe(400);
    expect(prisma.pastoralVisit.create).not.toHaveBeenCalled();
  });
});

describe('counseling confidentiality', () => {
  const session = {
    id: 'c1', churchId: 'church-1', memberId: 'm1', counselorId: 'pastor-1', counselingType: 'GRIEF', concern: 'Loss', outcome: 'ONGOING',
    sessionDate: new Date(), confidentialNotes: 'secret details', followUpPlan: 'meet weekly', member,
  };

  test('lists never include confidential fields, even for the confidential role', async () => {
    prisma.counselingSession.findMany.mockResolvedValue([session]);
    prisma.counselingSession.count.mockResolvedValue(1);
    const res = await request(app).get(`${base}/counseling`).set(as('pastoral:counseling:view', 'pastoral:counseling:confidential'));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('secret details');
    expect(res.body.items[0].hasConfidentialContent).toBe(true);
  });

  test('without the confidential permission a single read is also redacted and not audited', async () => {
    prisma.counselingSession.findFirst.mockResolvedValue(session);
    const res = await request(app).get(`${base}/counseling/c1`).set(as('pastoral:counseling:view'));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('secret details');
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('with the permission the read releases the notes and is audited first', async () => {
    prisma.counselingSession.findFirst.mockResolvedValue(session);
    const res = await request(app).get(`${base}/counseling/c1`).set(as('pastoral:counseling:view', 'pastoral:counseling:confidential'));
    expect(res.body.confidentialNotes).toBe('secret details');
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('COUNSELING_CONFIDENTIAL_VIEWED');
  });

  test('notes are withheld if the audit entry cannot be written', async () => {
    prisma.counselingSession.findFirst.mockResolvedValue(session);
    prisma.auditLog.create.mockRejectedValue(new Error('db down'));
    const res = await request(app).get(`${base}/counseling/c1`).set(as('pastoral:counseling:view', 'pastoral:counseling:confidential'));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(res.body)).not.toContain('secret details');
  });

  test('only the confidential role may write confidential fields', async () => {
    const body = { memberId: 'm1', counselingType: 'GRIEF', concern: long, outcome: 'ONGOING', sessionDate: '2026-03-01', confidentialNotes: 'private' };
    expect((await request(app).post(`${base}/counseling`).set(as('pastoral:counseling:create')).send(body)).status).toBe(403);
    prisma.counselingSession.create.mockResolvedValue(session);
    expect((await request(app).post(`${base}/counseling`).set(as('pastoral:counseling:create', 'pastoral:counseling:confidential')).send(body)).status).toBe(201);
    prisma.counselingSession.findFirst.mockResolvedValue(session);
    expect((await request(app).put(`${base}/counseling/c1`).set(as('pastoral:counseling:update')).send({ confidentialNotes: 'x' })).status).toBe(403);
  });
});

describe('prayer requests', () => {
  const prayer = (over: Record<string, unknown> = {}) => ({
    id: 'p1', churchId: 'church-1', memberId: 'm1', request: 'Please pray for my family', visibility: 'PASTOR_ONLY', status: 'NEW', submitted: new Date(), member, ...over,
  });

  test('any member can submit for themselves only', async () => {
    prisma.prayerRequest.create.mockResolvedValue(prayer());
    const res = await request(app).post(`${base}/prayer`).set(token('u', 'm9', [])).send({ request: 'Please pray for my family', memberId: 'm1' });
    expect(res.status).toBe(201);
    expect(prisma.prayerRequest.create.mock.calls[0][0].data.memberId).toBe('m9');
  });

  test('the church-wide wall shows first names and only church-wide, open requests', async () => {
    prisma.prayerRequest.findMany.mockResolvedValue([prayer({ visibility: 'CHURCH_WIDE' })]);
    prisma.prayerRequest.count.mockResolvedValue(1);
    const res = await request(app).get(`${base}/prayer/wall`).set(token('u', 'm9', []));
    expect(res.status).toBe(200);
    expect(prisma.prayerRequest.findMany.mock.calls[0][0].where).toMatchObject({ visibility: 'CHURCH_WIDE', status: { not: 'CLOSED' } });
    expect(res.body.items[0]).toEqual(expect.objectContaining({ firstName: 'Ann' }));
    expect(res.body.items[0].lastName).toBeUndefined();
  });

  test('the pastoral list hides confidential requests unless L4, and redacts the text', async () => {
    prisma.prayerRequest.findMany.mockResolvedValue([]);
    prisma.prayerRequest.count.mockResolvedValue(0);
    await request(app).get(`${base}/prayer`).set(as('pastoral:prayer:view'));
    expect(prisma.prayerRequest.findMany.mock.calls[0][0].where.visibility).toEqual({ not: 'CONFIDENTIAL' });

    prisma.prayerRequest.findMany.mockResolvedValue([prayer({ visibility: 'CONFIDENTIAL', request: 'very private' })]);
    const res = await request(app).get(`${base}/prayer`).set(as('pastoral:prayer:view', 'pastoral:l4:access'));
    expect(JSON.stringify(res.body)).not.toContain('very private');
  });

  test('a confidential request is invisible without L4, and needs a justification with it', async () => {
    prisma.prayerRequest.findFirst.mockResolvedValue(prayer({ visibility: 'CONFIDENTIAL' }));
    expect((await request(app).get(`${base}/prayer/p1`).set(as('pastoral:prayer:view'))).status).toBe(404);
    const noReason = await request(app).get(`${base}/prayer/p1`).set(as('pastoral:prayer:view', 'pastoral:l4:access'));
    expect(noReason.status).toBe(400);
    expect(JSON.stringify(noReason.body)).not.toContain('Please pray');
    const ok = await request(app).get(`${base}/prayer/p1?justification=Urgent%20welfare%20check`).set(as('pastoral:prayer:view', 'pastoral:l4:access'));
    expect(ok.status).toBe(200);
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('CONFIDENTIAL_PRAYER_VIEWED');
  });

  test('the owner can always read their own request; a stranger without permission cannot', async () => {
    prisma.prayerRequest.findFirst.mockResolvedValue(prayer({ visibility: 'CONFIDENTIAL' }));
    expect((await request(app).get(`${base}/prayer/p1`).set(token('u', 'm1', []))).status).toBe(200);
    expect((await request(app).get(`${base}/prayer/p1`).set(token('u', 'm7', []))).status).toBe(403);
  });

  test('status changes are atomic and closing needs a reason', async () => {
    prisma.prayerRequest.findFirst.mockResolvedValue(prayer());
    const manage = as('pastoral:prayer:manage');
    expect((await request(app).put(`${base}/prayer/p1/status`).set(manage).send({ status: 'CLOSED' })).status).toBe(400);
    prisma.prayerRequest.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).put(`${base}/prayer/p1/status`).set(manage).send({ status: 'BEING_PRAYED_FOR' })).status).toBe(409);
    prisma.prayerRequest.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).put(`${base}/prayer/p1/status`).set(manage).send({ status: 'BEING_PRAYED_FOR' })).status).toBe(200);
  });

  test('managing a confidential request needs L4', async () => {
    prisma.prayerRequest.findFirst.mockResolvedValue(prayer({ visibility: 'CONFIDENTIAL' }));
    const res = await request(app).put(`${base}/prayer/p1/status`).set(as('pastoral:prayer:manage')).send({ status: 'BEING_PRAYED_FOR' });
    expect(res.status).toBe(403);
  });
});

describe('referrals', () => {
  const referral = (status: string, extra: Record<string, unknown> = {}) => ({ id: 'r1', churchId: 'church-1', memberId: 'm1', caseId: 'case1', status, outcome: null, member, ...extra });

  test('is created from the case, taking the member from it', async () => {
    prisma.pastoralReferral.create.mockResolvedValue(referral('PENDING'));
    const res = await request(app).post(`${base}/referrals`).set(as('pastoral:referral:create')).send({ caseId: 'case1', referralType: 'MEDICAL', providerName: 'City Clinic', reason: long });
    expect(res.status).toBe(201);
    expect(prisma.pastoralReferral.create.mock.calls[0][0].data).toMatchObject({ memberId: 'm1', referredBy: 'pastor-1' });
  });

  test('a closed case cannot receive a referral', async () => {
    prisma.pastoralCase.findFirst.mockResolvedValue({ ...openCase, status: 'CLOSED' });
    const res = await request(app).post(`${base}/referrals`).set(as('pastoral:referral:create')).send({ caseId: 'case1', referralType: 'MEDICAL', providerName: 'City Clinic', reason: long });
    expect(res.status).toBe(409);
  });

  test.each([
    ['PENDING', 'COMPLETED'],
    ['PENDING', 'IN_PROGRESS'],
    ['AWAITING_RESPONSE', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'ACCEPTED'],
  ])('%s cannot jump to %s', async (from, to) => {
    prisma.pastoralReferral.findFirst.mockResolvedValue(referral(from));
    const res = await request(app).put(`${base}/referrals/r1`).set(as('pastoral:referral:update')).send({ status: to, outcome: 'done' });
    expect(res.status).toBe(409);
    expect(prisma.pastoralReferral.updateMany).not.toHaveBeenCalled();
  });

  test.each(['COMPLETED', 'DECLINED'])('a %s referral is final', async (status) => {
    prisma.pastoralReferral.findFirst.mockResolvedValue(referral(status));
    expect((await request(app).put(`${base}/referrals/r1`).set(as('pastoral:referral:update')).send({ notes: 'late note' })).status).toBe(409);
  });

  test('completing needs an outcome, and loses to a concurrent change', async () => {
    prisma.pastoralReferral.findFirst.mockResolvedValue(referral('ACCEPTED'));
    const update = as('pastoral:referral:update');
    expect((await request(app).put(`${base}/referrals/r1`).set(update).send({ status: 'COMPLETED' })).status).toBe(400);
    prisma.pastoralReferral.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).put(`${base}/referrals/r1`).set(update).send({ status: 'COMPLETED', outcome: 'Seen and treated' })).status).toBe(409);
    prisma.pastoralReferral.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).put(`${base}/referrals/r1`).set(update).send({ status: 'COMPLETED', outcome: 'Seen and treated' })).status).toBe(200);
    expect(prisma.pastoralReferral.updateMany.mock.calls[1][0].where).toEqual({ id: 'r1', status: 'ACCEPTED' });
  });
});

describe('follow-ups', () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
  const fu = (over: Record<string, unknown> = {}) => ({ id: 'f1', churchId: 'church-1', memberId: 'm1', caseId: 'case1', status: 'PENDING', dueDate: new Date(Date.now() + 86_400_000), member, ...over });

  test('cannot be due in the past', async () => {
    const res = await request(app).post(`${base}/followups`).set(as('pastoral:followup:manage')).send({ caseId: 'case1', dueDate: '2020-01-01', reason: 'Check in' });
    expect(res.status).toBe(400);
  });

  test('is created against an open case', async () => {
    prisma.pastoralFollowUp.create.mockResolvedValue(fu());
    expect((await request(app).post(`${base}/followups`).set(as('pastoral:followup:manage')).send({ caseId: 'case1', dueDate: tomorrow, reason: 'Check in' })).status).toBe(201);
    prisma.pastoralCase.findFirst.mockResolvedValue({ ...openCase, status: 'CLOSED' });
    expect((await request(app).post(`${base}/followups`).set(as('pastoral:followup:manage')).send({ caseId: 'case1', dueDate: tomorrow, reason: 'Check in' })).status).toBe(409);
  });

  test('a pending follow-up past its date is reported as overdue', async () => {
    prisma.pastoralFollowUp.findMany.mockResolvedValue([fu({ dueDate: new Date('2020-01-01') })]);
    prisma.pastoralFollowUp.count.mockResolvedValue(1);
    const res = await request(app).get(`${base}/followups`).set(as('pastoral:followup:view'));
    expect(res.body.items[0].effectiveStatus).toBe('OVERDUE');
  });

  test('the overdue filter matches open follow-ups with a past due date', async () => {
    prisma.pastoralFollowUp.findMany.mockResolvedValue([]);
    prisma.pastoralFollowUp.count.mockResolvedValue(0);
    await request(app).get(`${base}/followups?status=OVERDUE`).set(as('pastoral:followup:view'));
    const where = prisma.pastoralFollowUp.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['PENDING', 'OVERDUE'] });
    expect(where.dueDate.lt).toBeInstanceOf(Date);
  });

  test('completing twice conflicts instead of overwriting', async () => {
    prisma.pastoralFollowUp.findFirst.mockResolvedValue(fu());
    prisma.pastoralFollowUp.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post(`${base}/followups/f1/complete`).set(as('pastoral:followup:manage')).send({})).status).toBe(200);
    prisma.pastoralFollowUp.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).post(`${base}/followups/f1/complete`).set(as('pastoral:followup:manage')).send({})).status).toBe(409);
    expect((await request(app).post(`${base}/followups/f1/cancel`).set(as('pastoral:followup:manage')).send({})).status).toBe(409);
  });
});

describe('assessments', () => {
  const body = { memberId: 'm1', spiritual: 'STABLE', social: 'HEALTHY', emotional: 'NORMAL', economic: 'SECURE', physical: 'NORMAL' };

  test('are append-only snapshots attributed to the assessor', async () => {
    prisma.pastoralAssessment.create.mockResolvedValue({ id: 'a1' });
    expect((await request(app).post(`${base}/assessments`).set(as('pastoral:assessment:view')).send(body)).status).toBe(403);
    expect((await request(app).post(`${base}/assessments`).set(as('pastoral:assessment:update')).send(body)).status).toBe(201);
    expect(prisma.pastoralAssessment.create.mock.calls[0][0].data).toMatchObject({ assessedBy: 'pastor-1', churchId: 'church-1' });
  });

  test('reading a member\'s assessments is audited', async () => {
    prisma.pastoralAssessment.findMany.mockResolvedValue([]);
    prisma.pastoralAssessment.count.mockResolvedValue(0);
    expect((await request(app).get(`${base}/assessments?memberId=m1`).set(as('pastoral:assessment:view'))).status).toBe(200);
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('PASTORAL_ASSESSMENTS_VIEWED');
  });
});

describe('sacraments', () => {
  const manage = () => as('pastoral:sacrament:manage');
  const baptism = (status: string, over: Record<string, unknown> = {}) => ({ id: 'b1', churchId: 'church-1', memberId: 'm1', status, baptismDate: null, baptizedBy: null, member, ...over });

  test('need the sacrament permission', async () => {
    expect((await request(app).get(`${base}/sacraments/baptisms`).set(as())).status).toBe(403);
  });

  test('one baptism record per member', async () => {
    prisma.baptismRecord.findFirst.mockResolvedValue(baptism('CANDIDATE'));
    expect((await request(app).post(`${base}/sacraments/baptisms`).set(manage()).send({ memberId: 'm1' })).status).toBe(409);
    prisma.baptismRecord.findFirst.mockResolvedValue(null);
    prisma.baptismRecord.create.mockResolvedValue(baptism('CANDIDATE'));
    expect((await request(app).post(`${base}/sacraments/baptisms`).set(manage()).send({ memberId: 'm1' })).status).toBe(201);
  });

  test.each([
    ['CANDIDATE', 'INTERVIEWED'],
    ['CANDIDATE', 'BAPTIZED'],
    ['APPROVED', 'RECORDED'],
    ['BAPTIZED', 'APPROVED'],
  ])('baptism cannot skip or go back: %s -> %s', async (from, to) => {
    prisma.baptismRecord.findFirst.mockResolvedValue(baptism(from));
    const res = await request(app).put(`${base}/sacraments/baptisms/b1`).set(manage()).send({ status: to, interviewDate: '2026-01-01', baptismDate: '2026-01-01', baptizedBy: 'Rev' });
    expect(res.status).toBe(409);
    expect(prisma.baptismRecord.updateMany).not.toHaveBeenCalled();
  });

  test('baptism needs its date and officiant, and cannot be in the future', async () => {
    prisma.baptismRecord.findFirst.mockResolvedValue(baptism('APPROVED'));
    expect((await request(app).put(`${base}/sacraments/baptisms/b1`).set(manage()).send({ status: 'BAPTIZED' })).status).toBe(400);
    expect((await request(app).put(`${base}/sacraments/baptisms/b1`).set(manage()).send({ status: 'BAPTIZED', baptismDate: '2999-01-01', baptizedBy: 'Rev' })).status).toBe(400);
    prisma.baptismRecord.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).put(`${base}/sacraments/baptisms/b1`).set(manage()).send({ status: 'BAPTIZED', baptismDate: '2026-01-04', baptizedBy: 'Rev' })).status).toBe(200);
    expect(prisma.baptismRecord.updateMany.mock.calls[0][0].where).toEqual({ id: 'b1', status: 'APPROVED' });
  });

  test('a concurrent change is a conflict', async () => {
    prisma.baptismRecord.findFirst.mockResolvedValue(baptism('CANDIDATE'));
    prisma.baptismRecord.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).put(`${base}/sacraments/baptisms/b1`).set(manage()).send({ status: 'IN_PREPARATION' })).status).toBe(409);
  });

  test('marriage needs two different members and no other marriage in progress', async () => {
    expect((await request(app).post(`${base}/sacraments/marriages`).set(manage()).send({ partner1Id: 'm1', partner2Id: 'm1' })).status).toBe(400);
    prisma.marriageRecord.findFirst.mockResolvedValue({ id: 'other' });
    expect((await request(app).post(`${base}/sacraments/marriages`).set(manage()).send({ partner1Id: 'm1', partner2Id: 'm2' })).status).toBe(409);
    prisma.marriageRecord.findFirst.mockResolvedValue(null);
    prisma.marriageRecord.create.mockResolvedValue({ id: 'mr1' });
    expect((await request(app).post(`${base}/sacraments/marriages`).set(manage()).send({ partner1Id: 'm1', partner2Id: 'm2' })).status).toBe(201);
  });

  test('marriage cannot be marked married without a date or officiant', async () => {
    prisma.marriageRecord.findFirst.mockResolvedValue({ id: 'mr1', churchId: 'church-1', status: 'APPROVED', marriageDate: null, marriedBy: null });
    expect((await request(app).put(`${base}/sacraments/marriages/mr1`).set(manage()).send({ status: 'MARRIED' })).status).toBe(400);
  });

  test('funeral: one per member, date of death not in the future, recorded records are final', async () => {
    const body = { deceasedId: 'm1', deathDate: '2026-02-01' };
    prisma.funeralRecord.findFirst.mockResolvedValue({ id: 'fr0' });
    expect((await request(app).post(`${base}/sacraments/funerals`).set(manage()).send(body)).status).toBe(409);
    prisma.funeralRecord.findFirst.mockResolvedValue(null);
    expect((await request(app).post(`${base}/sacraments/funerals`).set(manage()).send({ ...body, deathDate: '2999-01-01' })).status).toBe(400);
    prisma.funeralRecord.create.mockResolvedValue({ id: 'fr1' });
    expect((await request(app).post(`${base}/sacraments/funerals`).set(manage()).send(body)).status).toBe(201);

    prisma.funeralRecord.findFirst.mockResolvedValue({ id: 'fr1', churchId: 'church-1', recordedAt: new Date(), familyNotified: false, funeralDate: null });
    expect((await request(app).put(`${base}/sacraments/funerals/fr1`).set(manage()).send({ familyNotified: true })).status).toBe(409);
    prisma.funeralRecord.findFirst.mockResolvedValue({ id: 'fr1', churchId: 'church-1', recordedAt: null, familyNotified: false, funeralDate: null });
    expect((await request(app).put(`${base}/sacraments/funerals/fr1`).set(manage()).send({ record: true })).status).toBe(400);
  });
});

describe('dashboard and care profile', () => {
  test('dashboard needs its permission and reports counts', async () => {
    expect((await request(app).get(`${base}/dashboard`).set(as())).status).toBe(403);
    prisma.pastoralCase.groupBy.mockResolvedValue([{ priority: 'URGENT', _count: { _all: 2 } }, { priority: 'NORMAL', _count: { _all: 3 } }]);
    prisma.pastoralCase.findMany.mockResolvedValue([]);
    prisma.pastoralFollowUp.count.mockResolvedValue(4);
    prisma.pastoralFollowUp.findMany.mockResolvedValue([]);
    prisma.pastoralVisit.count.mockResolvedValue(7);
    prisma.pastoralVisit.groupBy.mockResolvedValue([{ memberId: 'm1' }]);
    prisma.member.count.mockResolvedValue(10);
    prisma.prayerRequest.groupBy.mockResolvedValue([{ status: 'NEW', _count: { _all: 5 } }]);
    prisma.pastoralAssessment.findMany.mockResolvedValue([]);
    const res = await request(app).get(`${base}/dashboard`).set(as('pastoral:dashboard:view'));
    expect(res.status).toBe(200);
    expect(res.body.openCases.total).toBe(5);
    expect(res.body.followUps.overdue).toBe(4);
    expect(res.body.unvisitedMembers.count).toBe(9);
    expect(res.body.prayerRequests).toEqual({ NEW: 5 });
  });

  test('prayer counts on the dashboard exclude confidential requests', async () => {
    prisma.pastoralCase.groupBy.mockResolvedValue([]);
    prisma.pastoralCase.findMany.mockResolvedValue([]);
    prisma.pastoralFollowUp.count.mockResolvedValue(0);
    prisma.pastoralFollowUp.findMany.mockResolvedValue([]);
    prisma.pastoralVisit.count.mockResolvedValue(0);
    prisma.pastoralVisit.groupBy.mockResolvedValue([]);
    prisma.member.count.mockResolvedValue(0);
    prisma.prayerRequest.groupBy.mockResolvedValue([]);
    prisma.pastoralAssessment.findMany.mockResolvedValue([]);
    await request(app).get(`${base}/dashboard`).set(as('pastoral:dashboard:view'));
    expect(prisma.prayerRequest.groupBy.mock.calls[0][0].where.visibility).toEqual({ not: 'CONFIDENTIAL' });
  });

  test('care profile only includes the sections the viewer may see, and is audited', async () => {
    prisma.pastoralCase.findMany.mockResolvedValue([openCase]);
    prisma.lifeEvent.findMany.mockResolvedValue([]);
    prisma.pastoralVisit.findMany.mockResolvedValue([{ id: 'v1' }]);
    prisma.pastoralVisit.count.mockResolvedValue(1);
    const res = await request(app).get(`${base}/members/m1/care-profile`).set(as('pastoral:case:view', 'pastoral:visit:view'));
    expect(res.status).toBe(200);
    expect(res.body.visits).toHaveLength(1);
    expect(res.body.counseling).toBeNull();
    expect(res.body.prayer).toBeNull();
    expect(res.body.assessments).toBeNull();
    expect(prisma.counselingSession.findMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('PASTORAL_CARE_PROFILE_VIEWED');
  });

  test('care profile hides confidential prayer and counseling secrets', async () => {
    prisma.pastoralCase.findMany.mockResolvedValue([]);
    prisma.lifeEvent.findMany.mockResolvedValue([]);
    prisma.counselingSession.findMany.mockResolvedValue([{ id: 'c1', confidentialNotes: 'secret details', followUpPlan: null, member }]);
    prisma.counselingSession.count.mockResolvedValue(1);
    prisma.prayerRequest.findMany.mockResolvedValue([]);
    prisma.prayerRequest.count.mockResolvedValue(0);
    const res = await request(app).get(`${base}/members/m1/care-profile`).set(as('pastoral:case:view', 'pastoral:counseling:view', 'pastoral:counseling:confidential', 'pastoral:prayer:view'));
    expect(JSON.stringify(res.body)).not.toContain('secret details');
    expect(prisma.prayerRequest.findMany.mock.calls[0][0].where.visibility).toEqual({ not: 'CONFIDENTIAL' });
  });

  test('care profile for a member of another church is not found', async () => {
    prisma.member.findFirst.mockResolvedValue(null);
    expect((await request(app).get(`${base}/members/other/care-profile`).set(as('pastoral:case:view'))).status).toBe(404);
  });
});
