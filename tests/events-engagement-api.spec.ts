import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { createMockPrisma } from './helpers/mockPrisma';

const mocked = vi.hoisted(() => ({ prisma: undefined as unknown, notify: undefined as unknown }));

vi.mock('@/database', async () => {
  const { createMockPrisma: create } = await import('./helpers/mockPrisma');
  mocked.prisma = create();
  return { prisma: mocked.prisma, default: mocked.prisma };
});
vi.mock('@/services/notifications', async (importOriginal) => {
  const notify = vi.fn().mockResolvedValue(undefined);
  mocked.notify = notify;
  return { ...(await importOriginal<object>()), notificationDispatcher: { notify } };
});

import { createApp } from '@/app';
import { jwtSecret } from '@/config/secrets';
import { signQr } from '@/features/events/service/qr';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const notify = mocked.notify as ReturnType<typeof vi.fn>;
const app = createApp();
const base = '/api/v2/events';
const P2002 = () => new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' });

const token = (id: string, memberId: string | null, permissions: string[], churchId = 'church-1') => ({
  Authorization: `Bearer ${jwt.sign({ sub: id, email: `${id}@example.com`, churchId, memberId, permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const as = (...permissions: string[]) => token('user-1', 'usher-1', permissions);
const asMember = (memberId = 'm1') => token(`u-${memberId}`, memberId, []);

const HOUR = 3_600_000;
const event = (over: Record<string, unknown> = {}) => ({
  id: 'e1', churchId: 'church-1', title: 'Sunday Service', eventType: 'SERVICE', status: 'SCHEDULED',
  startDateTime: new Date(Date.now() - HOUR), endDateTime: new Date(Date.now() + HOUR), capacity: null, registrationRequired: false, ...over,
});
const member = { id: 'm1', firstName: 'Ann', lastName: 'Moyo', membershipNumber: 'M-1', archivedAt: null, membershipStatus: 'ACTIVE' };
const eventToken = (over: Record<string, unknown> = {}) => signQr({ typ: 'event', eventId: 'e1', churchId: 'church-1', ...over } as never, 600).token;
const badgeToken = (memberId = 'm1', churchId = 'church-1') => signQr({ typ: 'badge', memberId, churchId }, 600).token;

beforeEach(() => {
  vi.resetAllMocks();
  notify.mockResolvedValue(undefined);
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.$transaction.mockImplementation((async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))) as never);
  prisma.auditLog.create.mockResolvedValue({});
  prisma.event.findFirst.mockResolvedValue(event());
  prisma.member.findFirst.mockResolvedValue(member);
  prisma.eventCheckIn.create.mockResolvedValue({});
  prisma.eventAttendance.upsert.mockResolvedValue({});
});

describe('QR codes', () => {
  test('the door code needs permission and carries no login power', async () => {
    expect((await request(app).get(`${base}/e1/qr`).set(as())).status).toBe(403);
    const res = await request(app).get(`${base}/e1/qr`).set(as('event:qr:generate'));
    expect(res.status).toBe(200);
    expect(res.body.dataUrl).toMatch(/^data:image\/png;base64,/);
    // the QR token must not work as a session token
    const asLogin = await request(app).get(`${base}/upcoming`).set({ Authorization: `Bearer ${res.body.token}` });
    expect(asLogin.status).toBe(401);
  });

  test('no code for a finished or long-closed event', async () => {
    prisma.event.findFirst.mockResolvedValue(event({ status: 'COMPLETED' }));
    expect((await request(app).get(`${base}/e1/qr`).set(as('event:qr:generate'))).status).toBe(409);
    prisma.event.findFirst.mockResolvedValue(event({ status: 'SCHEDULED', startDateTime: new Date(Date.now() - 48 * HOUR), endDateTime: new Date(Date.now() - 47 * HOUR) }));
    expect((await request(app).get(`${base}/e1/qr`).set(as('event:qr:generate'))).status).toBe(409);
  });

  test('a member badge is short-lived and needs a member-linked account', async () => {
    const res = await request(app).get(`${base}/members/me/badge`).set(asMember());
    expect(res.status).toBe(200);
    const exp = new Date(res.body.expiresAt).getTime() - Date.now();
    expect(exp).toBeLessThanOrEqual(121_000);
    expect((await request(app).get(`${base}/members/me/badge`).set(token('u', null, []))).status).toBe(400);
  });
});

describe('self check-in', () => {
  test('a valid door code checks the member in and marks them present', async () => {
    const res = await request(app).post(`${base}/checkin/self`).set(asMember()).send({ token: eventToken() });
    expect(res.status).toBe(200);
    expect(res.body.alreadyCheckedIn).toBe(false);
    expect(prisma.eventCheckIn.create.mock.calls[0][0].data).toMatchObject({ eventId: 'e1', memberId: 'm1', method: 'QR', churchId: 'church-1' });
    expect(prisma.eventAttendance.upsert.mock.calls[0][0].update.status).toBe('PRESENT');
  });

  test.each([
    ['garbage', 'x'.repeat(40)],
    ['a login token', jwt.sign({ typ: 'event', eventId: 'e1', churchId: 'church-1' }, jwtSecret, { audience: 'ecclesia-qr' })],
    ['an expired code', jwt.sign({ typ: 'event', eventId: 'e1', churchId: 'church-1' }, 'wrong-key', { expiresIn: -10 })],
    ['a member badge', badgeToken()],
  ])('rejects %s', async (_name, bad) => {
    const res = await request(app).post(`${base}/checkin/self`).set(asMember()).send({ token: bad });
    expect(res.status).toBe(400);
    expect(prisma.eventCheckIn.create).not.toHaveBeenCalled();
  });

  test('a code signed with the right key but the wrong audience is rejected', async () => {
    const qrKey = createHmac('sha256', jwtSecret).update('ecclesia:qr:v1').digest();
    const noAudience = jwt.sign({ typ: 'event', eventId: 'e1', churchId: 'church-1' }, qrKey, { expiresIn: 600 });
    expect((await request(app).post(`${base}/checkin/self`).set(asMember()).send({ token: noAudience })).status).toBe(400);
  });

  test('a code from another church is rejected', async () => {
    const res = await request(app).post(`${base}/checkin/self`).set(asMember()).send({ token: eventToken({ churchId: 'church-2' }) });
    expect(res.status).toBe(400);
  });

  test('scanning twice is a harmless repeat', async () => {
    prisma.eventCheckIn.create.mockRejectedValue(P2002());
    prisma.eventCheckIn.findUnique.mockResolvedValue({ checkedInAt: new Date('2026-03-01T09:00:00Z'), method: 'QR' });
    const res = await request(app).post(`${base}/checkin/self`).set(asMember()).send({ token: eventToken() });
    expect(res.status).toBe(200);
    expect(res.body.alreadyCheckedIn).toBe(true);
    expect(res.body.checkedInAt).toBe('2026-03-01T09:00:00.000Z');
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('check-in is closed before it opens and after it closes', async () => {
    prisma.event.findFirst.mockResolvedValue(event({ startDateTime: new Date(Date.now() + 10 * HOUR), endDateTime: new Date(Date.now() + 11 * HOUR) }));
    expect((await request(app).post(`${base}/checkin/self`).set(asMember()).send({ token: eventToken() })).status).toBe(409);
    prisma.event.findFirst.mockResolvedValue(event({ startDateTime: new Date(Date.now() - 10 * HOUR), endDateTime: new Date(Date.now() - 9 * HOUR) }));
    expect((await request(app).post(`${base}/checkin/self`).set(asMember()).send({ token: eventToken() })).status).toBe(409);
    expect(prisma.eventCheckIn.create).not.toHaveBeenCalled();
  });

  test('a cancelled event and an archived member are refused', async () => {
    prisma.event.findFirst.mockResolvedValue(event({ status: 'CANCELLED' }));
    expect((await request(app).post(`${base}/checkin/self`).set(asMember()).send({ token: eventToken() })).status).toBe(409);
    prisma.event.findFirst.mockResolvedValue(event());
    prisma.member.findFirst.mockResolvedValue({ ...member, archivedAt: new Date() });
    expect((await request(app).post(`${base}/checkin/self`).set(asMember()).send({ token: eventToken() })).status).toBe(403);
  });

  test('a registration-only event refuses unregistered members', async () => {
    prisma.event.findFirst.mockResolvedValue(event({ registrationRequired: true }));
    prisma.eventRegistration.findUnique.mockResolvedValue(null);
    expect((await request(app).post(`${base}/checkin/self`).set(asMember()).send({ token: eventToken() })).status).toBe(409);
    prisma.eventRegistration.findUnique.mockResolvedValue({ status: 'CANCELLED' });
    expect((await request(app).post(`${base}/checkin/self`).set(asMember()).send({ token: eventToken() })).status).toBe(409);
    prisma.eventRegistration.findUnique.mockResolvedValue({ status: 'REGISTERED' });
    expect((await request(app).post(`${base}/checkin/self`).set(asMember()).send({ token: eventToken() })).status).toBe(200);
  });
});

describe('staff check-in', () => {
  const usher = () => as('event:checkin:manage');

  test('an usher scans a member badge', async () => {
    expect((await request(app).post(`${base}/e1/checkin/scan`).set(as()).send({ token: badgeToken() })).status).toBe(403);
    const res = await request(app).post(`${base}/e1/checkin/scan`).set(usher()).send({ token: badgeToken() });
    expect(res.status).toBe(200);
    expect(prisma.eventCheckIn.create.mock.calls[0][0].data.checkedInBy).toBe('usher-1');
    // an event code is not a badge
    expect((await request(app).post(`${base}/e1/checkin/scan`).set(usher()).send({ token: eventToken() })).status).toBe(400);
    expect((await request(app).post(`${base}/e1/checkin/scan`).set(usher()).send({ token: badgeToken('m1', 'church-2') })).status).toBe(400);
  });

  test('manual check-in takes a member id or a membership number, not both or neither', async () => {
    expect((await request(app).post(`${base}/e1/checkin`).set(usher()).send({})).status).toBe(400);
    expect((await request(app).post(`${base}/e1/checkin`).set(usher()).send({ memberId: 'm1', membershipNumber: 'M-1' })).status).toBe(400);
    const res = await request(app).post(`${base}/e1/checkin`).set(usher()).send({ membershipNumber: 'M-1', method: 'KIOSK' });
    expect(res.status).toBe(200);
    expect(prisma.member.findFirst.mock.calls[0][0].where).toMatchObject({ churchId: 'church-1', membershipNumber: 'M-1' });
    expect(prisma.eventCheckIn.create.mock.calls[0][0].data.method).toBe('KIOSK');
  });

  test('an unknown member or an event from another church is not found', async () => {
    prisma.member.findFirst.mockResolvedValue(null);
    expect((await request(app).post(`${base}/e1/checkin`).set(usher()).send({ memberId: 'ghost' })).status).toBe(404);
    prisma.event.findFirst.mockResolvedValue(null);
    expect((await request(app).post(`${base}/other/checkin`).set(usher()).send({ memberId: 'm1' })).status).toBe(404);
  });
});

describe('registration', () => {
  const reg = (over: Record<string, unknown> = {}) => ({ id: 'r1', eventId: 'e1', memberId: 'm1', status: 'REGISTERED', ...over });
  const future = (over: Record<string, unknown> = {}) => event({ startDateTime: new Date(Date.now() + 24 * HOUR), endDateTime: new Date(Date.now() + 25 * HOUR), ...over });

  test('a member registers once; repeating is a no-op', async () => {
    prisma.event.findFirst.mockResolvedValue(future());
    prisma.eventRegistration.findUnique.mockResolvedValue(null);
    prisma.eventRegistration.create.mockResolvedValue(reg());
    expect((await request(app).post(`${base}/e1/register`).set(asMember()).send({})).status).toBe(201);
    prisma.eventRegistration.create.mockClear();
    prisma.eventRegistration.findUnique.mockResolvedValue(reg());
    expect((await request(app).post(`${base}/e1/register`).set(asMember()).send({})).status).toBe(201);
    expect(prisma.eventRegistration.create).not.toHaveBeenCalled();
  });

  test('a full event refuses new registrations, including a cancelled member coming back', async () => {
    prisma.event.findFirst.mockResolvedValue(future({ capacity: 2 }));
    prisma.eventRegistration.findUnique.mockResolvedValue(null);
    prisma.eventRegistration.count.mockResolvedValue(2);
    expect((await request(app).post(`${base}/e1/register`).set(asMember()).send({})).status).toBe(409);
    expect(prisma.eventRegistration.create).not.toHaveBeenCalled();
    prisma.eventRegistration.findUnique.mockResolvedValue(reg({ status: 'CANCELLED' }));
    expect((await request(app).post(`${base}/e1/register`).set(asMember()).send({})).status).toBe(409);
    expect(prisma.eventRegistration.updateMany).not.toHaveBeenCalled();
  });

  test('a cancelled member returns when a spot is free', async () => {
    prisma.event.findFirst.mockResolvedValue(future({ capacity: 2 }));
    prisma.eventRegistration.findUnique.mockResolvedValueOnce(reg({ status: 'CANCELLED' })).mockResolvedValueOnce(reg());
    prisma.eventRegistration.count.mockResolvedValue(1);
    prisma.eventRegistration.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post(`${base}/e1/register`).set(asMember()).send({})).status).toBe(201);
  });

  test('a race on the unique index returns the existing registration', async () => {
    prisma.event.findFirst.mockResolvedValue(future());
    prisma.eventRegistration.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(reg());
    prisma.eventRegistration.create.mockRejectedValue(P2002());
    expect((await request(app).post(`${base}/e1/register`).set(asMember()).send({})).status).toBe(201);
  });

  test('past, finished and cancelled events cannot be registered for', async () => {
    prisma.event.findFirst.mockResolvedValue(event({ startDateTime: new Date(Date.now() - 5 * HOUR), endDateTime: new Date(Date.now() - 4 * HOUR) }));
    expect((await request(app).post(`${base}/e1/register`).set(asMember()).send({})).status).toBe(409);
    prisma.event.findFirst.mockResolvedValue(future({ status: 'CANCELLED' }));
    expect((await request(app).post(`${base}/e1/register`).set(asMember()).send({})).status).toBe(409);
  });

  test('cancelling needs an existing registration', async () => {
    prisma.eventRegistration.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).delete(`${base}/e1/register`).set(asMember())).status).toBe(404);
    prisma.eventRegistration.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).delete(`${base}/e1/register`).set(asMember())).status).toBe(200);
    expect(prisma.eventRegistration.updateMany.mock.calls[1][0].where).toMatchObject({ eventId: 'e1', memberId: 'm1', status: 'REGISTERED' });
  });

  test('staff can register a guest, but not the same guest email twice, and not past capacity', async () => {
    const staff = as('event:registration:manage');
    prisma.event.findFirst.mockResolvedValue(future({ capacity: 1 }));
    const guest = { guest: { name: 'Visitor One', email: 'v@example.com' } };
    expect((await request(app).post(`${base}/e1/registrations`).set(as()).send(guest)).status).toBe(403);
    expect((await request(app).post(`${base}/e1/registrations`).set(staff).send({})).status).toBe(400);
    prisma.eventRegistration.findFirst.mockResolvedValue({ id: 'g0' });
    expect((await request(app).post(`${base}/e1/registrations`).set(staff).send(guest)).status).toBe(409);
    prisma.eventRegistration.findFirst.mockResolvedValue(null);
    prisma.eventRegistration.count.mockResolvedValue(1);
    expect((await request(app).post(`${base}/e1/registrations`).set(staff).send(guest)).status).toBe(409);
    prisma.eventRegistration.count.mockResolvedValue(0);
    prisma.eventRegistration.create.mockResolvedValue(reg({ id: 'g1', memberId: null }));
    expect((await request(app).post(`${base}/e1/registrations`).set(staff).send(guest)).status).toBe(201);
  });

  test('upcoming events show spots left and whether I am registered', async () => {
    prisma.event.findMany.mockResolvedValue([{ id: 'e1', title: 'Retreat', capacity: 10, _count: { registrations: 4 } }, { id: 'e2', title: 'Open day', capacity: null, _count: { registrations: 0 } }]);
    prisma.eventRegistration.findMany.mockResolvedValue([{ eventId: 'e1' }]);
    const res = await request(app).get(`${base}/upcoming`).set(asMember());
    expect(res.body[0]).toMatchObject({ spotsLeft: 6, registeredByMe: true, registered: 4 });
    expect(res.body[1]).toMatchObject({ spotsLeft: null, registeredByMe: false });
  });
});

describe('volunteers', () => {
  const schedule = (over: Record<string, unknown> = {}) => ({
    id: 'v1', churchId: 'church-1', eventId: 'e1', memberId: 'm1', role: 'Usher', status: 'ASSIGNED',
    event: { id: 'e1', title: 'Sunday Service', startDateTime: new Date(Date.now() + 24 * HOUR) }, member, ...over,
  });
  const manage = () => as('volunteer:schedule:manage');

  test('assigning notifies the volunteer and refuses a duplicate role', async () => {
    prisma.volunteerSchedule.create.mockResolvedValue(schedule());
    const body = { eventId: 'e1', memberId: 'm1', role: 'Usher' };
    expect((await request(app).post(`${base}/volunteers`).set(as('volunteer:schedule:view')).send(body)).status).toBe(403);
    expect((await request(app).post(`${base}/volunteers`).set(manage()).send(body)).status).toBe(201);
    expect(notify).toHaveBeenCalledWith('m1', expect.objectContaining({ category: 'EVENTS', type: 'VOLUNTEER_ASSIGNED' }));
    prisma.volunteerSchedule.create.mockRejectedValue(P2002());
    expect((await request(app).post(`${base}/volunteers`).set(manage()).send(body)).status).toBe(409);
  });

  test('no volunteers for a cancelled event or an archived member', async () => {
    prisma.event.findFirst.mockResolvedValue(event({ status: 'CANCELLED' }));
    expect((await request(app).post(`${base}/volunteers`).set(manage()).send({ eventId: 'e1', memberId: 'm1', role: 'Usher' })).status).toBe(409);
    prisma.event.findFirst.mockResolvedValue(event());
    prisma.member.findFirst.mockResolvedValue({ ...member, archivedAt: new Date() });
    expect((await request(app).post(`${base}/volunteers`).set(manage()).send({ eventId: 'e1', memberId: 'm1', role: 'Usher' })).status).toBe(404);
  });

  test('a volunteer answers only for themselves', async () => {
    prisma.volunteerSchedule.findFirst.mockResolvedValue(schedule());
    prisma.volunteerSchedule.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post(`${base}/volunteers/v1/respond`).set(asMember('m9')).send({ response: 'CONFIRMED' })).status).toBe(403);
    expect(prisma.volunteerSchedule.updateMany).not.toHaveBeenCalled();
    expect((await request(app).post(`${base}/volunteers/v1/respond`).set(asMember('m1')).send({ response: 'CONFIRMED' })).status).toBe(200);
    expect(prisma.volunteerSchedule.updateMany.mock.calls[0][0].where.status).toEqual({ in: ['ASSIGNED', 'DECLINED'] });
  });

  test('a response that loses a race, or comes after the event started, is refused', async () => {
    prisma.volunteerSchedule.findFirst.mockResolvedValue(schedule());
    prisma.volunteerSchedule.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).post(`${base}/volunteers/v1/respond`).set(asMember('m1')).send({ response: 'DECLINED' })).status).toBe(409);
    prisma.volunteerSchedule.findFirst.mockResolvedValue(schedule({ event: { id: 'e1', title: 'x', startDateTime: new Date(Date.now() - HOUR) } }));
    expect((await request(app).post(`${base}/volunteers/v1/respond`).set(asMember('m1')).send({ response: 'DECLINED' })).status).toBe(409);
  });

  test('completed or no-show is only possible once the event has started, and final states are final', async () => {
    prisma.volunteerSchedule.findFirst.mockResolvedValue(schedule());
    expect((await request(app).put(`${base}/volunteers/v1`).set(manage()).send({ status: 'COMPLETED' })).status).toBe(400);
    prisma.volunteerSchedule.findFirst.mockResolvedValue(schedule({ status: 'COMPLETED' }));
    expect((await request(app).put(`${base}/volunteers/v1`).set(manage()).send({ notes: 'late' })).status).toBe(409);
    expect(prisma.volunteerSchedule.updateMany).not.toHaveBeenCalled();
  });

  test('cancelling tells the volunteer', async () => {
    prisma.volunteerSchedule.findFirst.mockResolvedValue(schedule());
    prisma.volunteerSchedule.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).put(`${base}/volunteers/v1`).set(manage()).send({ status: 'CANCELLED' })).status).toBe(200);
    expect(notify).toHaveBeenCalledWith('m1', expect.objectContaining({ type: 'VOLUNTEER_CANCELLED' }));
  });
});

describe('attendance analytics', () => {
  const row = (id: string, type: string, date: string, present: number, expected: number | null) => ({
    id, title: id, eventType: type, startDateTime: new Date(date), expectedAttendance: expected, _count: { attendances: present, registrations: 0 },
  });

  test('needs permission and a sensible period', async () => {
    expect((await request(app).get(`${base}/analytics/attendance`).set(as())).status).toBe(403);
    const res = await request(app).get(`${base}/analytics/attendance?from=2024-01-01&to=2026-01-01`).set(as('attendance:analytics:view'));
    expect(res.status).toBe(400);
    expect((await request(app).get(`${base}/analytics/attendance?from=2026-02-01&to=2026-01-01`).set(as('attendance:analytics:view'))).status).toBe(400);
  });

  test('summarises by type and month, and only counts events that have started', async () => {
    prisma.event.findMany.mockResolvedValue([
      row('a', 'SERVICE', '2026-01-04T08:00:00Z', 100, 120), row('b', 'SERVICE', '2026-01-11T08:00:00Z', 80, null),
      row('c', 'BIBLE_STUDY', '2026-02-03T08:00:00Z', 30, 50),
    ]);
    prisma.eventCheckIn.groupBy.mockResolvedValue([{ method: 'QR', _count: { _all: 60 } }, { method: 'MANUAL', _count: { _all: 10 } }]);
    prisma.eventAttendance.groupBy.mockResolvedValue([{ memberId: 'x' }, { memberId: 'y' }]);
    const res = await request(app).get(`${base}/analytics/attendance?from=2026-01-01&to=2026-03-01`).set(as('attendance:analytics:view'));
    expect(res.status).toBe(200);
    expect(prisma.event.findMany.mock.calls[0][0].where.status).toEqual({ in: ['ONGOING', 'COMPLETED'] });
    expect(res.body).toMatchObject({ totalEvents: 3, totalPresent: 210, averagePerEvent: 70, uniqueAttendees: 2, checkInMethods: { QR: 60, MANUAL: 10 } });
    expect(res.body.byType[0]).toMatchObject({ eventType: 'SERVICE', events: 2, present: 180, average: 90 });
    expect(res.body.byMonth.map((m: { month: string }) => m.month)).toEqual(['2026-01', '2026-02']);
    expect(res.body.events[0].attendanceRate).toBe(83.3);
    expect(res.body.events[1].attendanceRate).toBeNull();
  });
});

describe('absence follow-ups', () => {
  const staff = () => as('absence:followup:manage');
  const recent = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, startDateTime: new Date(Date.now() - (i + 1) * 7 * 24 * HOUR) }));

  test('does nothing when too few events have attendance recorded', async () => {
    prisma.event.findMany.mockResolvedValue(recent(2));
    const res = await request(app).post(`${base}/absences/detect`).set(staff()).send({ threshold: 3 });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(0);
    expect(res.body.message).toMatch(/needed/);
    expect(prisma.member.findMany).not.toHaveBeenCalled();
  });

  test('looks only at completed events with attendance, treats excused as not absent, and skips already-open members', async () => {
    prisma.event.findMany.mockResolvedValue(recent(3));
    prisma.member.findMany.mockResolvedValue([member]);
    prisma.absenceFollowUp.createMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post(`${base}/absences/detect`).set(staff()).send({});
    expect(res.body.created).toBe(1);
    const eventWhere = prisma.event.findMany.mock.calls[0][0].where;
    expect(eventWhere).toMatchObject({ status: 'COMPLETED', eventType: 'SERVICE', attendances: { some: { status: 'PRESENT' } } });
    const memberWhere = prisma.member.findMany.mock.calls[0][0].where;
    expect(memberWhere.eventAttendances.none.status).toEqual({ in: ['PRESENT', 'EXCUSED'] });
    expect(memberWhere.absenceFollowUps.none).toEqual({ openKey: 'OPEN' });
    expect(memberWhere).toMatchObject({ archivedAt: null, membershipStatus: 'ACTIVE' });
    expect(prisma.absenceFollowUp.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  test('a dry run reports candidates without writing', async () => {
    prisma.event.findMany.mockResolvedValue(recent(3));
    prisma.member.findMany.mockResolvedValue([member]);
    const res = await request(app).post(`${base}/absences/detect`).set(staff()).send({ dryRun: true });
    expect(res.body.candidates).toHaveLength(1);
    expect(prisma.absenceFollowUp.createMany).not.toHaveBeenCalled();
  });

  test('needs permission', async () => {
    expect((await request(app).post(`${base}/absences/detect`).set(as()).send({})).status).toBe(403);
    expect((await request(app).get(`${base}/absences`).set(as())).status).toBe(403);
  });

  const followUp = (status: string) => ({ id: 'a1', churchId: 'church-1', memberId: 'm1', status, member });

  test('closing needs notes and frees the member to be flagged again', async () => {
    prisma.absenceFollowUp.findFirst.mockResolvedValue(followUp('CONTACTED'));
    expect((await request(app).put(`${base}/absences/a1`).set(staff()).send({ status: 'RESOLVED' })).status).toBe(400);
    prisma.absenceFollowUp.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).put(`${base}/absences/a1`).set(staff()).send({ status: 'RESOLVED', notes: 'Back at church' })).status).toBe(200);
    const data = prisma.absenceFollowUp.updateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'RESOLVED', openKey: null });
    expect(data.closedAt).toBeInstanceOf(Date);
    expect(prisma.absenceFollowUp.updateMany.mock.calls[0][0].where).toEqual({ id: 'a1', status: { in: ['CONTACTED'] } });
  });

  test.each([['RESOLVED', 'CONTACTED'], ['DISMISSED', 'RESOLVED'], ['CONTACTED', 'CONTACTED']])('a %s follow-up cannot become %s', async (from, to) => {
    prisma.absenceFollowUp.findFirst.mockResolvedValue(followUp(from));
    expect((await request(app).put(`${base}/absences/a1`).set(staff()).send({ status: to, notes: 'x' })).status).toBe(409);
    expect(prisma.absenceFollowUp.updateMany).not.toHaveBeenCalled();
  });

  test('an update that loses a race conflicts; assigning needs a real, unarchived member', async () => {
    prisma.absenceFollowUp.findFirst.mockResolvedValue(followUp('OPEN'));
    prisma.absenceFollowUp.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).put(`${base}/absences/a1`).set(staff()).send({ status: 'CONTACTED' })).status).toBe(409);
    prisma.member.findFirst.mockResolvedValue(null);
    expect((await request(app).put(`${base}/absences/a1/assign`).set(staff()).send({ assignedTo: 'ghost' })).status).toBe(404);
    prisma.member.findFirst.mockResolvedValue({ ...member, archivedAt: new Date() });
    expect((await request(app).put(`${base}/absences/a1/assign`).set(staff()).send({ assignedTo: 'm1' })).status).toBe(404);
  });
});

describe('existing event routes still resolve', () => {
  test('GET /events/:id is not swallowed by the fixed paths', async () => {
    prisma.event.findFirst.mockResolvedValue({ ...event(), section: null, organization: null, _count: { attendances: 0, participants: 0 } });
    const res = await request(app).get(`${base}/e1`).set(as('event:view'));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('e1');
  });
});
