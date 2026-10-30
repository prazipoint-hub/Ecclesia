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
const YEAR = new Date().getFullYear();

const as = (...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: 'user-1', email: 'a@example.com', churchId: 'church-1', memberId: 'member-1', permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.$transaction.mockImplementation((async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))) as never);
  prisma.auditLog.create.mockResolvedValue({});
});

// ---------------------------------------------------------------- visitors

describe('visitors', () => {
  const visitor = (over: Record<string, unknown> = {}) => ({
    id: 'v1', churchId: 'church-1', firstName: 'Tendai', lastName: 'Dube', phone: '0771', email: 'tendai@example.com', visitDate: new Date(), source: null, notes: null,
    followUpStatus: 'NEW', assignedToId: null, convertedMemberId: null, createdAt: new Date(), followUps: [], ...over,
  });

  test('permissions gate every action', async () => {
    expect((await request(app).get('/api/v2/visitors').set(as())).status).toBe(403);
    expect((await request(app).post('/api/v2/visitors').set(as('visitor:view')).send({})).status).toBe(403);
    expect((await request(app).put('/api/v2/visitors/v1').set(as('visitor:view')).send({ notes: 'x' })).status).toBe(403);
    expect((await request(app).post('/api/v2/visitors/v1/convert').set(as('visitor:view')).send({})).status).toBe(403);
  });

  test('create validates and stamps the church', async () => {
    expect((await request(app).post('/api/v2/visitors').set(as('visitor:create')).send({ firstName: '', lastName: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/v2/visitors').set(as('visitor:create')).send({ firstName: 'A', lastName: 'B', email: 'nope' })).status).toBe(400);
    prisma.visitor.create.mockResolvedValue(visitor());
    const res = await request(app).post('/api/v2/visitors').set(as('visitor:create')).send({ firstName: 'Tendai', lastName: 'Dube', email: 'TENDAI@example.com' });
    expect(res.status).toBe(201);
    expect(prisma.visitor.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', email: 'tendai@example.com' });
  });

  test('the assignee must be a member of this church', async () => {
    prisma.member.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/v2/visitors').set(as('visitor:create')).send({ firstName: 'A', lastName: 'B', assignedToId: 'other' });
    expect(res.status).toBe(400);
    expect(prisma.member.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'other', churchId: 'church-1' });
  });

  test('list is church-scoped with status counts', async () => {
    prisma.visitor.findMany.mockResolvedValue([visitor()]);
    prisma.visitor.count.mockResolvedValue(1);
    prisma.visitor.groupBy.mockResolvedValue([{ followUpStatus: 'NEW', _count: { _all: 3 } }, { followUpStatus: 'JOINED', _count: { _all: 1 } }]);
    const res = await request(app).get('/api/v2/visitors?status=NEW&q=ten dube').set(as('visitor:view'));
    expect(res.body.statusCounts).toEqual({ NEW: 3, JOINED: 1 });
    expect(prisma.visitor.findMany.mock.calls[0][0].where).toMatchObject({ churchId: 'church-1', followUpStatus: 'NEW' });
    expect(prisma.visitor.findMany.mock.calls[0][0].where.AND).toHaveLength(2);
  });

  test("another church's visitor is 404", async () => {
    prisma.visitor.findUnique.mockResolvedValue(visitor({ churchId: 'church-2' }));
    expect((await request(app).get('/api/v2/visitors/v1').set(as('visitor:view'))).status).toBe(404);
  });

  test('the first follow-up moves NEW to CONTACTED; later ones do not regress the status', async () => {
    prisma.visitor.findUnique.mockResolvedValue(visitor());
    prisma.visitorFollowUp.create.mockResolvedValue({});
    prisma.visitor.update.mockResolvedValue({});
    await request(app).post('/api/v2/visitors/v1/follow-ups').set(as('visitor:manage')).send({ method: 'CALL', notes: 'Spoke to Tendai' });
    expect(prisma.visitor.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { followUpStatus: 'CONTACTED' } });
    expect(prisma.visitorFollowUp.create.mock.calls[0][0].data).toMatchObject({ visitorId: 'v1', churchId: 'church-1', actorId: 'user-1', method: 'CALL' });

    prisma.visitor.update.mockClear();
    prisma.visitor.findUnique.mockResolvedValue(visitor({ followUpStatus: 'SCHEDULED' }));
    await request(app).post('/api/v2/visitors/v1/follow-ups').set(as('visitor:manage')).send({ method: 'MESSAGE' });
    expect(prisma.visitor.update).not.toHaveBeenCalled();
  });

  test('follow-up cannot set JOINED directly and rejects unknown methods', async () => {
    expect((await request(app).post('/api/v2/visitors/v1/follow-ups').set(as('visitor:manage')).send({ method: 'CALL', status: 'JOINED' })).status).toBe(400);
    expect((await request(app).post('/api/v2/visitors/v1/follow-ups').set(as('visitor:manage')).send({ method: 'TELEPATHY' })).status).toBe(400);
  });

  test('converting needs member:create too, then creates the member and links it', async () => {
    expect((await request(app).post('/api/v2/visitors/v1/convert').set(as('visitor:manage')).send({})).status).toBe(403);

    prisma.visitor.findUnique.mockResolvedValue(visitor());
    prisma.member.findFirst.mockResolvedValue(null);
    prisma.member.findMany.mockResolvedValue([{ membershipNumber: `M${YEAR}0004` }]);
    prisma.visitor.updateMany.mockResolvedValue({ count: 1 });
    prisma.member.create.mockResolvedValue({ id: 'new-member', membershipNumber: `M${YEAR}0005` });
    prisma.visitor.update.mockResolvedValue({});
    const res = await request(app).post('/api/v2/visitors/v1/convert').set(as('visitor:manage', 'member:create')).send({});
    expect(res.status).toBe(201);
    expect(res.body.member).toEqual({ id: 'new-member', membershipNumber: `M${YEAR}0005` });
    expect(prisma.member.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', firstName: 'Tendai', email: 'tendai@example.com', membershipNumber: `M${YEAR}0005`, membershipStatus: 'ACTIVE' });
    expect(prisma.visitor.update.mock.calls.at(-1)?.[0].data).toEqual({ convertedMemberId: 'new-member' });
  });

  test('converting twice, or onto an existing member email, conflicts', async () => {
    const perms = as('visitor:manage', 'member:create');
    prisma.visitor.findUnique.mockResolvedValue(visitor({ convertedMemberId: 'm9' }));
    expect((await request(app).post('/api/v2/visitors/v1/convert').set(perms).send({})).status).toBe(409);

    prisma.visitor.findUnique.mockResolvedValue(visitor());
    prisma.member.findFirst.mockResolvedValue({ id: 'existing' });
    expect((await request(app).post('/api/v2/visitors/v1/convert').set(perms).send({})).status).toBe(409);
    expect(prisma.member.create).not.toHaveBeenCalled();
  });

  test('a concurrent conversion loses the claim and creates no member', async () => {
    prisma.visitor.findUnique.mockResolvedValue(visitor());
    prisma.member.findFirst.mockResolvedValue(null);
    prisma.member.findMany.mockResolvedValue([]);
    prisma.visitor.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).post('/api/v2/visitors/v1/convert').set(as('visitor:manage', 'member:create')).send({})).status).toBe(409);
    expect(prisma.member.create).not.toHaveBeenCalled();
  });

  test('a converted visitor can no longer be edited', async () => {
    prisma.visitor.findUnique.mockResolvedValue(visitor({ convertedMemberId: 'm9' }));
    expect((await request(app).put('/api/v2/visitors/v1').set(as('visitor:manage')).send({ notes: 'x' })).status).toBe(409);
  });
});

// -------------------------------------------------------- committee meetings

describe('committee meetings', () => {
  const meeting = (over: Record<string, unknown> = {}) => ({
    id: 'mt1', churchId: 'church-1', committeeId: 'c1', title: 'Monthly', scheduledAt: new Date(), location: null, agenda: null, minutes: null,
    status: 'SCHEDULED', minutesLockedAt: null, createdBy: 'user-1', decisions: [], committee: { name: 'Finance' }, ...over,
  });
  const manage = as('committee:view', 'committee:meeting:manage');

  test('permissions', async () => {
    expect((await request(app).get('/api/v2/committees/meetings/mt1').set(as())).status).toBe(403);
    expect((await request(app).post('/api/v2/committees/c1/meetings').set(as('committee:view')).send({})).status).toBe(403);
    expect((await request(app).post('/api/v2/committees/meetings/mt1/lock-minutes').set(as('committee:view')).send()).status).toBe(403);
  });

  test("creating needs a committee in the caller's church", async () => {
    prisma.committee.findFirst.mockResolvedValue(null);
    const body = { title: 'Monthly', scheduledAt: new Date(Date.now() + 86400000).toISOString() };
    expect((await request(app).post('/api/v2/committees/c1/meetings').set(as('committee:meeting:create', 'committee:view')).send(body)).status).toBe(404);
    expect(prisma.committee.findFirst.mock.calls[0][0].where).toEqual({ id: 'c1', churchId: 'church-1' });

    prisma.committee.findFirst.mockResolvedValue({ id: 'c1', name: 'Finance' });
    prisma.committeeMeeting.create.mockResolvedValue({ id: 'mt1' });
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting());
    const res = await request(app).post('/api/v2/committees/c1/meetings').set(as('committee:meeting:create', 'committee:view')).send(body);
    expect(res.status).toBe(201);
    expect(prisma.committeeMeeting.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', committeeId: 'c1', createdBy: 'user-1' });
  });

  test("another church's meeting is 404", async () => {
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting({ churchId: 'church-2' }));
    expect((await request(app).get('/api/v2/committees/meetings/mt1').set(manage)).status).toBe(404);
  });

  test('minutes can only be written once the meeting was held', async () => {
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting());
    expect((await request(app).put('/api/v2/committees/meetings/mt1').set(manage).send({ minutes: 'We met.' })).status).toBe(409);
    expect(prisma.committeeMeeting.updateMany).not.toHaveBeenCalled();
  });

  test('locked minutes cannot be edited, and the check is atomic', async () => {
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting({ status: 'HELD' }));
    prisma.committeeMeeting.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).put('/api/v2/committees/meetings/mt1').set(manage).send({ minutes: 'Changed afterwards' });
    expect(res.status).toBe(409);
    expect(prisma.committeeMeeting.updateMany.mock.calls[0][0].where).toEqual({ id: 'mt1', minutesLockedAt: null });
  });

  test('an edit on an unlocked held meeting succeeds', async () => {
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting({ status: 'HELD' }));
    prisma.committeeMeeting.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).put('/api/v2/committees/meetings/mt1').set(manage).send({ minutes: 'We met.' })).status).toBe(200);
  });

  test('state transitions: held once, cancel only when scheduled', async () => {
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting({ status: 'HELD' }));
    expect((await request(app).post('/api/v2/committees/meetings/mt1/held').set(manage)).status).toBe(409);
    expect((await request(app).post('/api/v2/committees/meetings/mt1/cancel').set(manage)).status).toBe(409);
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting());
    prisma.committeeMeeting.update.mockResolvedValue({});
    expect((await request(app).post('/api/v2/committees/meetings/mt1/held').set(manage)).status).toBe(200);
    expect(prisma.committeeMeeting.update.mock.calls[0][0].data).toEqual({ status: 'HELD' });
  });

  test('locking requires a held meeting with minutes and is audited', async () => {
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting());
    expect((await request(app).post('/api/v2/committees/meetings/mt1/lock-minutes').set(manage)).status).toBe(409);
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting({ status: 'HELD', minutes: '   ' }));
    expect((await request(app).post('/api/v2/committees/meetings/mt1/lock-minutes').set(manage)).status).toBe(400);
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting({ status: 'HELD', minutes: 'We met.' }));
    prisma.committeeMeeting.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post('/api/v2/committees/meetings/mt1/lock-minutes').set(manage)).status).toBe(200);
    expect(prisma.auditLog.create.mock.calls.at(-1)?.[0].data.action).toBe('COMMITTEE_MINUTES_LOCKED');
  });

  test('locking twice conflicts', async () => {
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting({ status: 'HELD', minutes: 'We met.', minutesLockedAt: new Date() }));
    prisma.committeeMeeting.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).post('/api/v2/committees/meetings/mt1/lock-minutes').set(manage)).status).toBe(409);
  });

  test.each([
    ['approved without a majority', { status: 'APPROVED', votesFor: 2, votesAgainst: 5 }],
    ['approved on a tie', { status: 'APPROVED', votesFor: 3, votesAgainst: 3 }],
    ['rejected despite a majority', { status: 'REJECTED', votesFor: 5, votesAgainst: 1 }],
    ['negative votes', { votesFor: -1 }],
  ])('decision rejected: %s', async (_n, patch) => {
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting({ status: 'HELD' }));
    const res = await request(app).post('/api/v2/committees/meetings/mt1/decisions').set(manage).send({ description: 'Buy a laptop', ...patch });
    expect(res.status).toBe(400);
    expect(prisma.committeeDecision.create).not.toHaveBeenCalled();
  });

  test('a consistent decision is recorded', async () => {
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting({ status: 'HELD' }));
    prisma.committeeDecision.create.mockResolvedValue({});
    const res = await request(app).post('/api/v2/committees/meetings/mt1/decisions').set(manage).send({ description: 'Buy a laptop', status: 'APPROVED', votesFor: 5, votesAgainst: 2, abstentions: 1 });
    expect(res.status).toBe(201);
    expect(prisma.committeeDecision.create.mock.calls[0][0].data).toMatchObject({ meetingId: 'mt1', churchId: 'church-1', status: 'APPROVED' });
  });

  test('decisions are frozen once the minutes are locked, or the meeting is cancelled', async () => {
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting({ status: 'HELD', minutesLockedAt: new Date() }));
    expect((await request(app).post('/api/v2/committees/meetings/mt1/decisions').set(manage).send({ description: 'Late addition' })).status).toBe(409);
    prisma.committeeDecision.findUnique.mockResolvedValue({ id: 'd1', churchId: 'church-1', meetingId: 'mt1', status: 'PROPOSED', votesFor: 0, votesAgainst: 0, meeting: { id: 'mt1', churchId: 'church-1', minutesLockedAt: new Date(), status: 'HELD' } });
    expect((await request(app).put('/api/v2/committees/decisions/d1').set(manage).send({ status: 'DEFERRED' })).status).toBe(409);
    expect((await request(app).delete('/api/v2/committees/decisions/d1').set(manage)).status).toBe(409);
    expect(prisma.committeeDecision.delete).not.toHaveBeenCalled();
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting({ status: 'CANCELLED' }));
    expect((await request(app).post('/api/v2/committees/meetings/mt1/decisions').set(manage).send({ description: 'x' })).status).toBe(409);
  });

  test("updating a decision re-checks the stored votes against the new outcome", async () => {
    prisma.committeeDecision.findUnique.mockResolvedValue({ id: 'd1', churchId: 'church-1', meetingId: 'mt1', status: 'PROPOSED', votesFor: 1, votesAgainst: 4, meeting: { id: 'mt1', churchId: 'church-1', minutesLockedAt: null, status: 'HELD' } });
    expect((await request(app).put('/api/v2/committees/decisions/d1').set(manage).send({ status: 'APPROVED' })).status).toBe(400);
    expect(prisma.committeeDecision.update).not.toHaveBeenCalled();
  });

  test("another church's decision is 404", async () => {
    prisma.committeeDecision.findUnique.mockResolvedValue({ id: 'd1', churchId: 'church-2', meeting: {} });
    expect((await request(app).delete('/api/v2/committees/decisions/d1').set(manage)).status).toBe(404);
  });

  test('the owner of a decision must be a church member', async () => {
    prisma.committeeMeeting.findUnique.mockResolvedValue(meeting({ status: 'HELD' }));
    prisma.member.findFirst.mockResolvedValue(null);
    expect((await request(app).post('/api/v2/committees/meetings/mt1/decisions').set(manage).send({ description: 'x', ownerMemberId: 'ghost' })).status).toBe(400);
  });

  test('existing committee routes still work alongside the new ones', async () => {
    prisma.committee.findMany.mockResolvedValue([{ id: 'c1', name: 'Finance' }]);
    const res = await request(app).get('/api/v2/committees').set(as('committee:view'));
    expect(res.status).toBe(200);
  });
});

// -------------------------------------------------------------- leadership

describe('leadership terms', () => {
  const manage = as('leadership:term:manage');
  const assignment = (terms: object[] = [], over: Record<string, unknown> = {}) => ({
    id: 'a1', churchId: 'church-1', memberId: 'm1', roleId: 'r1', committeeId: null, position: 'Treasurer', startDate: new Date('2025-01-01'), endDate: null,
    member: { id: 'm1', firstName: 'Ada', lastName: 'Moyo' }, role: { id: 'r1', name: 'Treasurer' }, committee: null, terms, ...over,
  });
  const term = (over: Record<string, unknown> = {}) => ({
    id: 't1', churchId: 'church-1', assignmentId: 'a1', termNumber: 1, startDate: new Date('2025-01-01'), plannedEndDate: null, endDate: null, status: 'ACTIVE', successorId: null,
    notes: null, assignment: assignment(), ...over,
  });

  test('every route needs leadership:term:manage', async () => {
    for (const [method, path] of [['get', '/assignments'], ['get', '/terms'], ['post', '/assignments/a1/terms'], ['put', '/terms/t1/end']] as const) {
      expect((await request(app)[method](`/api/v2/leadership${path}`).set(as('member:view'))).status).toBe(403);
    }
  });

  test('assignments list shows the current term and defaults to active appointments in this church', async () => {
    prisma.leadershipAssignment.findMany.mockResolvedValue([assignment([{ id: 't1', termNumber: 2, status: 'ACTIVE', startDate: new Date(), plannedEndDate: null }, { id: 't0', termNumber: 1, status: 'COMPLETED' }])]);
    prisma.leadershipAssignment.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v2/leadership/assignments').set(manage);
    expect(res.body.items[0]).toMatchObject({ termCount: 2, currentTerm: { id: 't1', termNumber: 2 } });
    const where = prisma.leadershipAssignment.findMany.mock.calls[0][0].where;
    expect(where.churchId).toBe('church-1');
    expect(where.OR).toBeDefined();
  });

  test('starting a term numbers it after the previous one and aligns the appointment end date', async () => {
    prisma.leadershipAssignment.findUnique.mockResolvedValue(assignment([{ termNumber: 1, status: 'COMPLETED', endDate: new Date('2025-12-31') }]));
    prisma.leadershipTerm.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 't2', ...data }));
    prisma.leadershipAssignment.update.mockResolvedValue({});
    const planned = new Date(Date.now() + 365 * 86400000).toISOString();
    const res = await request(app).post('/api/v2/leadership/assignments/a1/terms').set(manage).send({ startDate: '2026-01-01', plannedEndDate: planned });
    expect(res.status).toBe(201);
    expect(prisma.leadershipTerm.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', assignmentId: 'a1', termNumber: 2 });
    expect(prisma.leadershipAssignment.update.mock.calls[0][0]).toMatchObject({ where: { id: 'a1' }, data: { endDate: new Date(planned) } });
  });

  test('cannot start a term while one is active, or before the last one ended', async () => {
    prisma.leadershipAssignment.findUnique.mockResolvedValue(assignment([{ termNumber: 1, status: 'ACTIVE', endDate: null }]));
    expect((await request(app).post('/api/v2/leadership/assignments/a1/terms').set(manage).send({})).status).toBe(409);
    prisma.leadershipAssignment.findUnique.mockResolvedValue(assignment([{ termNumber: 1, status: 'COMPLETED', endDate: new Date('2026-06-01') }]));
    expect((await request(app).post('/api/v2/leadership/assignments/a1/terms').set(manage).send({ startDate: '2026-01-01' })).status).toBe(400);
    expect(prisma.leadershipTerm.create).not.toHaveBeenCalled();
  });

  test('a planned end date must be after the start', async () => {
    const res = await request(app).post('/api/v2/leadership/assignments/a1/terms').set(manage).send({ startDate: '2026-06-01', plannedEndDate: '2026-01-01' });
    expect(res.status).toBe(400);
  });

  test("another church's appointment is 404", async () => {
    prisma.leadershipAssignment.findUnique.mockResolvedValue(assignment([], { churchId: 'church-2' }));
    expect((await request(app).post('/api/v2/leadership/assignments/a1/terms').set(manage).send({})).status).toBe(404);
  });

  test('ending a term closes the appointment on the same date, atomically', async () => {
    prisma.leadershipTerm.findUnique.mockResolvedValueOnce(term()).mockResolvedValue(term({ status: 'COMPLETED' }));
    prisma.member.findFirst.mockResolvedValue({ id: 'm2' });
    prisma.leadershipTerm.updateMany.mockResolvedValue({ count: 1 });
    prisma.leadershipAssignment.update.mockResolvedValue({});
    const res = await request(app).put('/api/v2/leadership/terms/t1/end').set(manage).send({ status: 'COMPLETED', endDate: '2026-06-30', successorId: 'm2' });
    expect(res.status).toBe(200);
    expect(prisma.leadershipTerm.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 't1', status: 'ACTIVE' }, data: { status: 'COMPLETED', successorId: 'm2' } });
    expect(prisma.leadershipAssignment.update.mock.calls[0][0]).toEqual({ where: { id: 'a1' }, data: { endDate: new Date('2026-06-30') } });
  });

  test('end-term validation: already ended, before start, self as successor, unknown successor, lost race', async () => {
    prisma.leadershipTerm.findUnique.mockResolvedValue(term({ status: 'COMPLETED' }));
    expect((await request(app).put('/api/v2/leadership/terms/t1/end').set(manage).send({ status: 'COMPLETED' })).status).toBe(409);

    prisma.leadershipTerm.findUnique.mockResolvedValue(term());
    expect((await request(app).put('/api/v2/leadership/terms/t1/end').set(manage).send({ status: 'COMPLETED', endDate: '2024-01-01' })).status).toBe(400);
    expect((await request(app).put('/api/v2/leadership/terms/t1/end').set(manage).send({ status: 'COMPLETED', successorId: 'm1' })).status).toBe(400);
    prisma.member.findFirst.mockResolvedValue(null);
    expect((await request(app).put('/api/v2/leadership/terms/t1/end').set(manage).send({ status: 'COMPLETED', successorId: 'ghost' })).status).toBe(400);

    prisma.leadershipTerm.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).put('/api/v2/leadership/terms/t1/end').set(manage).send({ status: 'TERMINATED' })).status).toBe(409);
    expect(prisma.leadershipAssignment.update).not.toHaveBeenCalled();
  });

  test('terms list can show what is expiring soon with days remaining', async () => {
    const planned = new Date(Date.now() + 10 * 86400000 + 3600000);
    prisma.leadershipTerm.findMany.mockResolvedValue([{ ...term({ plannedEndDate: planned }), assignment: { position: 'Treasurer', member: { id: 'm1', firstName: 'Ada', lastName: 'Moyo' }, role: { name: 'Treasurer' }, committee: null } }]);
    prisma.leadershipTerm.count.mockResolvedValue(1);
    const res = await request(app).get('/api/v2/leadership/terms?expiringWithinDays=30').set(manage);
    expect(res.body.items[0]).toMatchObject({ roleName: 'Treasurer', daysRemaining: 11 });
    expect(prisma.leadershipTerm.findMany.mock.calls[0][0].where).toMatchObject({ churchId: 'church-1', status: 'ACTIVE' });
  });
});
