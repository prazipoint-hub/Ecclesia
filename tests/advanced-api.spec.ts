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
import { buildIcs, fold } from '@/features/calendar/service/ical';
import { fill, unknownPlaceholders } from '@/features/documents/service/render';

const prisma = mocked.prisma as ReturnType<typeof createMockPrisma>;
const app = createApp();

const as = (...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: 'user-1', email: 'u1@example.com', churchId: 'church-1', memberId: 'member-1', permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.$transaction.mockImplementation((async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))) as never);
  prisma.auditLog.create.mockResolvedValue({});
});

describe('permissions', () => {
  const routes: Array<[string, string]> = [
    ['get', '/api/v2/campaigns'], ['post', '/api/v2/campaigns'], ['post', '/api/v2/campaigns/c1/activate'], ['post', '/api/v2/campaigns/c1/close'],
    ['get', '/api/v2/groups'], ['post', '/api/v2/groups'], ['post', '/api/v2/groups/g1/members'], ['post', '/api/v2/groups/g1/sessions'],
    ['get', '/api/v2/assets'], ['post', '/api/v2/assets'], ['post', '/api/v2/assets/a1/retire'], ['get', '/api/v2/assets/maintenance/due'],
    ['get', '/api/v2/documents'], ['post', '/api/v2/documents/generate'], ['post', '/api/v2/documents/templates'], ['get', '/api/v2/documents/d1/pdf'],
  ];
  test.each(routes)('%s %s needs sign-in and the right permission', async (method, path) => {
    expect((await (request(app) as any)[method](path)).status).toBe(401);
    expect((await (request(app) as any)[method](path).set(as('finance:view'))).status).toBe(403);
  });
});

// ------------------------------------------------------------------ campaigns
describe('campaigns', () => {
  const campaign = (over: Record<string, unknown> = {}) => ({
    id: 'c1', churchId: 'church-1', fundId: 'f1', name: 'New roof', slug: 'new-roof-ab12cd', description: null, goalAmount: 1000, startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'), status: 'DRAFT', isPublic: true, createdAt: new Date(), ...over,
  });
  const progress = (total: number, donors = 2) => {
    prisma.payment.aggregate.mockResolvedValue({ _sum: { amount: total }, _count: 3 });
    prisma.payment.groupBy.mockResolvedValue(Array.from({ length: donors }, (_, i) => ({ memberId: `m${i}` })));
  };
  const body = { name: 'New roof', goalAmount: 1000, startDate: '2026-01-01', isPublic: true };

  test('create makes a closed restricted fund on the church account', async () => {
    prisma.financialAccount.findUnique.mockResolvedValue({ id: 'fa1' });
    prisma.fund.create.mockResolvedValue({ id: 'f1' });
    prisma.campaign.create.mockResolvedValue(campaign());
    progress(0, 0);
    const res = await request(app).post('/api/v2/campaigns').set(as('campaign:manage')).send(body);
    expect(res.status).toBe(201);
    expect(prisma.fund.create.mock.calls[0][0].data).toMatchObject({ churchId: 'church-1', accountId: 'fa1', isActive: false, isRestricted: true });
    expect(prisma.campaign.create.mock.calls[0][0].data.slug).toMatch(/^new-roof-[0-9a-f]{6}$/);
  });

  test('needs a financial account; validates money and dates', async () => {
    prisma.financialAccount.findUnique.mockResolvedValue(null);
    expect((await request(app).post('/api/v2/campaigns').set(as('campaign:manage')).send(body)).status).toBe(409);
    expect((await request(app).post('/api/v2/campaigns').set(as('campaign:manage')).send({ ...body, goalAmount: 10.001 })).status).toBe(400);
    expect((await request(app).post('/api/v2/campaigns').set(as('campaign:manage')).send({ ...body, goalAmount: 0 })).status).toBe(400);
    expect((await request(app).post('/api/v2/campaigns').set(as('campaign:manage')).send({ ...body, endDate: '2025-01-01' })).status).toBe(400);
  });

  test('progress counts completed payments of its own fund only', async () => {
    prisma.campaign.findFirst.mockResolvedValue(campaign({ status: 'ACTIVE' }));
    progress(250.5, 4);
    const res = await request(app).get('/api/v2/campaigns/c1').set(as('campaign:manage'));
    expect(res.body).toMatchObject({ raised: 250.5, donors: 4, percent: 25.1 });
    expect(prisma.payment.aggregate.mock.calls[0][0].where).toEqual({ fundId: 'f1', status: 'COMPLETED' });
    expect(prisma.campaign.findFirst.mock.calls[0][0].where).toEqual({ id: 'c1', churchId: 'church-1' });
  });

  test('percent is capped at 100', async () => {
    prisma.campaign.findFirst.mockResolvedValue(campaign());
    progress(5000);
    expect((await request(app).get('/api/v2/campaigns/c1').set(as('campaign:manage'))).body.percent).toBe(100);
  });

  test('activate opens the fund; double activation is a conflict', async () => {
    prisma.campaign.findFirst.mockResolvedValue(campaign());
    prisma.campaign.updateMany.mockResolvedValue({ count: 1 });
    prisma.fund.update.mockResolvedValue({});
    progress(0, 0);
    expect((await request(app).post('/api/v2/campaigns/c1/activate').set(as('campaign:manage'))).status).toBe(200);
    expect(prisma.campaign.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'c1', status: 'DRAFT' }, data: { status: 'ACTIVE' } });
    expect(prisma.fund.update.mock.calls[0][0]).toMatchObject({ where: { id: 'f1' }, data: { isActive: true } });
    prisma.campaign.findFirst.mockResolvedValue(campaign({ status: 'ACTIVE' }));
    expect((await request(app).post('/api/v2/campaigns/c1/activate').set(as('campaign:manage'))).status).toBe(409);
  });

  test('losing the claim race changes nothing', async () => {
    prisma.campaign.findFirst.mockResolvedValue(campaign());
    prisma.campaign.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).post('/api/v2/campaigns/c1/activate').set(as('campaign:manage'))).status).toBe(409);
    expect(prisma.fund.update).not.toHaveBeenCalled();
  });

  test('close shuts the fund to new gifts', async () => {
    prisma.campaign.findFirst.mockResolvedValue(campaign({ status: 'ACTIVE' }));
    prisma.campaign.updateMany.mockResolvedValue({ count: 1 });
    prisma.fund.update.mockResolvedValue({});
    progress(0, 0);
    expect((await request(app).post('/api/v2/campaigns/c1/close').set(as('campaign:manage'))).status).toBe(200);
    expect(prisma.fund.update.mock.calls[0][0].data).toEqual({ isActive: false });
  });

  test('a closed campaign cannot be edited', async () => {
    prisma.campaign.findFirst.mockResolvedValue(campaign({ status: 'CLOSED' }));
    expect((await request(app).put('/api/v2/campaigns/c1').set(as('campaign:manage')).send({ name: 'Other' })).status).toBe(409);
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  test('public page needs no sign-in and shows progress without donor identities', async () => {
    prisma.campaign.findFirst.mockResolvedValue(campaign({ status: 'ACTIVE' }));
    progress(100, 3);
    const res = await request(app).get('/api/v2/public/campaigns/new-roof-ab12cd');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'New roof', raised: 100, donors: 3, goalAmount: 1000 });
    expect(JSON.stringify(res.body)).not.toMatch(/memberId|churchId|createdBy|status/);
    expect(prisma.campaign.findFirst.mock.calls[0][0].where).toEqual({ slug: 'new-roof-ab12cd', isPublic: true, status: 'ACTIVE' });
  });

  test('public page hides private, draft or unknown campaigns', async () => {
    prisma.campaign.findFirst.mockResolvedValue(null);
    expect((await request(app).get('/api/v2/public/campaigns/nope')).status).toBe(404);
  });
});

// ------------------------------------------------------------------ small groups
describe('small groups', () => {
  const group = (over: Record<string, unknown> = {}, members: any[] = []) => ({
    id: 'g1', churchId: 'church-1', name: 'Youth', description: null, meetingDay: null, meetingTime: null, location: null, curriculumName: null, capacity: null, status: 'ACTIVE', members, ...over,
  });
  const gm = (id: string, memberId = `m-${id}`) => ({ id, groupId: 'g1', memberId, role: 'MEMBER', joinedAt: new Date(), leftAt: null, member: { id: memberId, firstName: 'A', lastName: 'B', membershipNumber: 'M' } });
  const person = { id: 'member-2', firstName: 'C', lastName: 'D', membershipNumber: 'M2', archivedAt: null };

  test('group of another church is not found', async () => {
    prisma.smallGroup.findFirst.mockResolvedValue(null);
    expect((await request(app).get('/api/v2/groups/g9').set(as('group:view'))).status).toBe(404);
    expect(prisma.smallGroup.findFirst.mock.calls[0][0].where).toEqual({ id: 'g9', churchId: 'church-1' });
  });

  test('duplicate group name is a conflict', async () => {
    const { Prisma } = await import('@prisma/client');
    prisma.smallGroup.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    expect((await request(app).post('/api/v2/groups').set(as('group:manage')).send({ name: 'Youth' })).status).toBe(409);
  });

  test('adds a member; refuses duplicates, archived and full groups', async () => {
    prisma.smallGroup.findFirst.mockResolvedValue(group({ capacity: 2 }, [gm('a')]));
    prisma.member.findFirst.mockResolvedValue(person);
    prisma.smallGroupMember.findFirst.mockResolvedValue(null);
    prisma.smallGroupMember.count.mockResolvedValue(1);
    prisma.smallGroupMember.create.mockResolvedValue({});
    expect((await request(app).post('/api/v2/groups/g1/members').set(as('group:manage')).send({ memberId: 'member-2' })).status).toBe(201);
    expect(prisma.member.findFirst.mock.calls[0][0].where).toEqual({ id: 'member-2', churchId: 'church-1' });

    prisma.smallGroupMember.count.mockResolvedValue(2);
    expect((await request(app).post('/api/v2/groups/g1/members').set(as('group:manage')).send({ memberId: 'member-2' })).status).toBe(409);

    prisma.smallGroupMember.findFirst.mockResolvedValue({ id: 'x' });
    expect((await request(app).post('/api/v2/groups/g1/members').set(as('group:manage')).send({ memberId: 'member-2' })).status).toBe(409);

    prisma.smallGroupMember.findFirst.mockResolvedValue(null);
    prisma.member.findFirst.mockResolvedValue({ ...person, archivedAt: new Date() });
    expect((await request(app).post('/api/v2/groups/g1/members').set(as('group:manage')).send({ memberId: 'member-2' })).status).toBe(403);
  });

  test('a closed group takes no members or sessions', async () => {
    prisma.smallGroup.findFirst.mockResolvedValue(group({ status: 'CLOSED' }));
    expect((await request(app).post('/api/v2/groups/g1/members').set(as('group:manage')).send({ memberId: 'member-2' })).status).toBe(409);
    expect((await request(app).post('/api/v2/groups/g1/sessions').set(as('group:attendance:record')).send({ heldOn: '2026-01-01', topic: 'Prayer' })).status).toBe(409);
  });

  test('removing a member is scoped to this group and keeps the row', async () => {
    prisma.smallGroup.findFirst.mockResolvedValue(group({}, [gm('a')]));
    prisma.smallGroupMember.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).delete('/api/v2/groups/g1/members/a').set(as('group:manage'))).status).toBe(200);
    expect(prisma.smallGroupMember.updateMany.mock.calls[0][0].where).toEqual({ id: 'a', groupId: 'g1', leftAt: null });
    expect(prisma.smallGroupMember.deleteMany).not.toHaveBeenCalled();
    prisma.smallGroupMember.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).delete('/api/v2/groups/g1/members/zzz').set(as('group:manage'))).status).toBe(404);
  });

  test('session attendance only for current members of this group, once each', async () => {
    prisma.smallGroup.findFirst.mockResolvedValue(group({}, [gm('a')]));
    prisma.smallGroupMember.findMany.mockResolvedValue([{ id: 'a' }]);
    const base = { heldOn: '2026-01-01', topic: 'Prayer' };
    const post = (attendance: unknown) => request(app).post('/api/v2/groups/g1/sessions').set(as('group:attendance:record')).send({ ...base, attendance });
    expect((await post([{ membershipId: 'other-group', present: true }])).status).toBe(400);
    expect((await post([{ membershipId: 'a', present: true }, { membershipId: 'a', present: false }])).status).toBe(400);
    expect(prisma.smallGroupSession.create).not.toHaveBeenCalled();
  });

  test('records a session with attendance', async () => {
    prisma.smallGroup.findFirst.mockResolvedValue(group({}, [gm('a')]));
    prisma.smallGroupMember.findMany.mockResolvedValue([{ id: 'a' }]);
    prisma.smallGroupSession.create.mockResolvedValue({ id: 's1' });
    prisma.smallGroupSession.findFirst.mockResolvedValue({ id: 's1', heldOn: new Date(), topic: 'Prayer', lesson: null, notes: null, attendance: [] });
    const res = await request(app).post('/api/v2/groups/g1/sessions').set(as('group:attendance:record', 'group:view')).send({ heldOn: '2026-01-01', topic: 'Prayer', attendance: [{ membershipId: 'a', present: true }] });
    expect(res.status).toBe(201);
    expect(prisma.smallGroupAttendance.createMany.mock.calls[0][0].data).toEqual([{ sessionId: 's1', membershipId: 'a', present: true }]);
  });

  test('future sessions are refused; recording needs its own permission', async () => {
    prisma.smallGroup.findFirst.mockResolvedValue(group());
    const future = new Date(Date.now() + 10 * 86400_000).toISOString();
    expect((await request(app).post('/api/v2/groups/g1/sessions').set(as('group:attendance:record')).send({ heldOn: future, topic: 'Prayer' })).status).toBe(400);
    expect((await request(app).post('/api/v2/groups/g1/sessions').set(as('group:manage', 'group:view')).send({ heldOn: '2026-01-01', topic: 'Prayer' })).status).toBe(403);
  });

  test('attendance summary computes rates per member', async () => {
    prisma.smallGroup.findFirst.mockResolvedValue(group({}, [gm('a'), gm('b')]));
    prisma.smallGroupAttendance.findMany.mockResolvedValue([{ membershipId: 'a', present: true }, { membershipId: 'a', present: false }, { membershipId: 'a', present: true }]);
    prisma.smallGroupSession.count.mockResolvedValue(3);
    const res = await request(app).get('/api/v2/groups/g1/attendance-summary').set(as('group:view'));
    expect(res.body.members.find((m: any) => m.membershipId === 'a')).toMatchObject({ present: 2, recorded: 3, rate: 67 });
    expect(res.body.members.find((m: any) => m.membershipId === 'b').rate).toBeNull();
  });

  test('capacity cannot drop below current members', async () => {
    prisma.smallGroup.findFirst.mockResolvedValue(group({}, [gm('a'), gm('b'), gm('c')]));
    expect((await request(app).put('/api/v2/groups/g1').set(as('group:manage')).send({ capacity: 2 })).status).toBe(409);
  });
});

// ------------------------------------------------------------------ assets
describe('assets', () => {
  const asset = (over: Record<string, unknown> = {}) => ({
    id: 'a1', churchId: 'church-1', tag: 'SND-1', name: 'Mixer', location: null, status: 'ACTIVE', purchaseDate: null, purchaseCost: null, serialNumber: null, notes: null, retiredAt: null,
    category: { id: 'cat1', name: 'Sound' }, maintenance: [], ...over,
  });

  test('another church category is not found', async () => {
    prisma.assetCategory.findFirst.mockResolvedValue(null);
    expect((await request(app).post('/api/v2/assets').set(as('asset:manage')).send({ categoryId: 'cat9', tag: 'SND-1', name: 'Mixer' })).status).toBe(404);
    expect(prisma.assetCategory.findFirst.mock.calls[0][0].where).toEqual({ id: 'cat9', churchId: 'church-1' });
    expect(prisma.asset.create).not.toHaveBeenCalled();
  });

  test('creates an asset; duplicate tag is a conflict; bad tag rejected', async () => {
    prisma.assetCategory.findFirst.mockResolvedValue({ id: 'cat1' });
    prisma.asset.create.mockResolvedValue({ id: 'a1' });
    prisma.asset.findFirst.mockResolvedValue(asset());
    expect((await request(app).post('/api/v2/assets').set(as('asset:manage', 'asset:view')).send({ categoryId: 'cat1', tag: 'SND-1', name: 'Mixer', purchaseCost: 99.5 })).status).toBe(201);
    expect(prisma.asset.create.mock.calls[0][0].data.churchId).toBe('church-1');
    const { Prisma } = await import('@prisma/client');
    prisma.asset.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    expect((await request(app).post('/api/v2/assets').set(as('asset:manage')).send({ categoryId: 'cat1', tag: 'SND-1', name: 'Mixer' })).status).toBe(409);
    expect((await request(app).post('/api/v2/assets').set(as('asset:manage')).send({ categoryId: 'cat1', tag: 'bad tag!', name: 'Mixer' })).status).toBe(400);
  });

  test('retire claims atomically; second retire is a conflict', async () => {
    prisma.asset.findFirst.mockResolvedValue(asset());
    prisma.asset.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post('/api/v2/assets/a1/retire').set(as('asset:manage', 'asset:view'))).status).toBe(200);
    expect(prisma.asset.updateMany.mock.calls[0][0].where).toEqual({ id: 'a1', churchId: 'church-1', status: { not: 'RETIRED' } });
    prisma.asset.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).post('/api/v2/assets/a1/retire').set(as('asset:manage'))).status).toBe(409);
  });

  test('a retired asset cannot be edited or serviced', async () => {
    prisma.asset.findFirst.mockResolvedValue(asset({ status: 'RETIRED' }));
    expect((await request(app).put('/api/v2/assets/a1').set(as('asset:manage')).send({ name: 'Other' })).status).toBe(409);
    expect((await request(app).post('/api/v2/assets/a1/maintenance').set(as('asset:manage')).send({ performedOn: '2026-01-01', description: 'Cleaned' })).status).toBe(409);
    expect(prisma.assetMaintenance.create).not.toHaveBeenCalled();
  });

  test('maintenance next-due date must follow the work date', async () => {
    prisma.asset.findFirst.mockResolvedValue(asset());
    expect((await request(app).post('/api/v2/assets/a1/maintenance').set(as('asset:manage')).send({ performedOn: '2026-02-01', description: 'Service', nextDueDate: '2026-01-01' })).status).toBe(400);
    prisma.assetMaintenance.create.mockResolvedValue({ id: 'm1' });
    expect((await request(app).post('/api/v2/assets/a1/maintenance').set(as('asset:manage', 'asset:view')).send({ performedOn: '2026-02-01', description: 'Service', nextDueDate: '2026-08-01' })).status).toBe(201);
  });

  test('due list is church scoped and ignores superseded reminders', async () => {
    const past = new Date(Date.now() - 86400_000);
    prisma.assetMaintenance.findMany
      .mockResolvedValueOnce([
        { assetId: 'a1', performedOn: new Date('2026-01-01'), nextDueDate: past, description: 'old', asset: { id: 'a1', tag: 'T1', name: 'X', location: null } },
        { assetId: 'a2', performedOn: new Date('2026-01-01'), nextDueDate: past, description: 'only', asset: { id: 'a2', tag: 'T2', name: 'Y', location: null } },
      ])
      .mockResolvedValueOnce([{ assetId: 'a1', performedOn: new Date('2026-03-01'), nextDueDate: null }, { assetId: 'a2', performedOn: new Date('2026-01-01'), nextDueDate: past }]);
    const res = await request(app).get('/api/v2/assets/maintenance/due').set(as('asset:view'));
    expect(res.body.map((r: any) => r.assetId)).toEqual(['a2']);
    expect(res.body[0].overdue).toBe(true);
    expect(prisma.assetMaintenance.findMany.mock.calls[0][0].where.asset).toMatchObject({ churchId: 'church-1' });
  });
});

// ------------------------------------------------------------------ documents
describe('documents', () => {
  const tpl = (over: Record<string, unknown> = {}) => ({ id: 't1', churchId: 'church-1', type: 'CERTIFICATE', name: 'Baptism', title: 'Certificate for {{memberName}}', body: 'Baptised on {{field.baptismDate}}. {{serial}}', isActive: true, ...over });
  const mem = { id: 'member-2', firstName: 'Ann', lastName: 'Moyo', membershipNumber: 'M2', archivedAt: null };

  test('placeholder helpers', () => {
    expect(unknownPlaceholders('{{memberName}} {{field.x1}} {{evil}} {{constructor}}')).toEqual(['evil', 'constructor']);
    expect(fill('Hi {{memberName}}', { memberName: '{{serial}}' })).toBe('Hi {{serial}}');
    expect(() => fill('{{date}}', {})).toThrow();
  });

  test('template with unknown placeholder is rejected', async () => {
    const res = await request(app).post('/api/v2/documents/templates').set(as('document:template:manage')).send({ type: 'LETTER', name: 'X1', title: 'Hello', body: 'Dear {{password}}' });
    expect(res.status).toBe(400);
    expect(prisma.documentTemplate.create).not.toHaveBeenCalled();
  });

  test('generation freezes rendered text, audits, and scopes lookups to the church', async () => {
    prisma.documentTemplate.findFirst.mockResolvedValue(tpl());
    prisma.church.findUnique.mockResolvedValue({ name: 'Grace' });
    prisma.member.findFirst.mockResolvedValue(mem);
    prisma.generatedDocument.create.mockImplementation((async ({ data }: any) => ({ id: 'd1', ...data })) as never);
    const res = await request(app).post('/api/v2/documents/generate').set(as('document:generate')).send({ templateId: 't1', memberId: 'member-2', fields: { baptismDate: '1 May 2026' } });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Certificate for Ann Moyo');
    expect(res.body.content).toMatch(/^Baptised on 1 May 2026\. DOC-\d{4}-[0-9A-F]{8}$/);
    expect(prisma.documentTemplate.findFirst.mock.calls[0][0].where).toEqual({ id: 't1', churchId: 'church-1' });
    expect(prisma.member.findFirst.mock.calls[0][0].where).toEqual({ id: 'member-2', churchId: 'church-1' });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('DOCUMENT_GENERATED');
  });

  test('missing member or field values are rejected before anything is stored', async () => {
    prisma.documentTemplate.findFirst.mockResolvedValue(tpl());
    prisma.church.findUnique.mockResolvedValue({ name: 'Grace' });
    expect((await request(app).post('/api/v2/documents/generate').set(as('document:generate')).send({ templateId: 't1', fields: { baptismDate: 'x' } })).status).toBe(400);
    prisma.member.findFirst.mockResolvedValue(mem);
    expect((await request(app).post('/api/v2/documents/generate').set(as('document:generate')).send({ templateId: 't1', memberId: 'member-2' })).status).toBe(400);
    expect(prisma.generatedDocument.create).not.toHaveBeenCalled();
  });

  test('inactive template and archived member are refused', async () => {
    prisma.documentTemplate.findFirst.mockResolvedValue(tpl({ isActive: false }));
    expect((await request(app).post('/api/v2/documents/generate').set(as('document:generate')).send({ templateId: 't1' })).status).toBe(409);
    prisma.documentTemplate.findFirst.mockResolvedValue(tpl());
    prisma.church.findUnique.mockResolvedValue({ name: 'Grace' });
    prisma.member.findFirst.mockResolvedValue({ ...mem, archivedAt: new Date() });
    expect((await request(app).post('/api/v2/documents/generate').set(as('document:generate')).send({ templateId: 't1', memberId: 'member-2', fields: { baptismDate: 'x' } })).status).toBe(403);
  });

  test('pdf download returns a PDF; void stamps and cannot repeat', async () => {
    const doc = { id: 'd1', churchId: 'church-1', type: 'LETTER', serial: 'DOC-2026-AAAA1111', title: 'T', content: 'Body', voidedAt: null, member: null };
    prisma.generatedDocument.findFirst.mockResolvedValue(doc);
    prisma.church.findUnique.mockResolvedValue({ name: 'Grace' });
    const res = await request(app).get('/api/v2/documents/d1/pdf').set(as('document:view')).buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on('data', (d) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    prisma.generatedDocument.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post('/api/v2/documents/d1/void').set(as('document:generate', 'document:view')).send({ reason: 'Wrong name printed' })).status).toBe(200);
    expect(prisma.generatedDocument.updateMany.mock.calls[0][0].where).toEqual({ id: 'd1', churchId: 'church-1', voidedAt: null });
    prisma.generatedDocument.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).post('/api/v2/documents/d1/void').set(as('document:generate')).send({ reason: 'Wrong name printed' })).status).toBe(409);
  });

  test('document of another church is not found', async () => {
    prisma.generatedDocument.findFirst.mockResolvedValue(null);
    expect((await request(app).get('/api/v2/documents/d9').set(as('document:view'))).status).toBe(404);
  });
});

// ------------------------------------------------------------------ calendar
describe('calendar feeds', () => {
  test('creating returns the secret once and stores only its hash', async () => {
    prisma.calendarFeed.count.mockResolvedValue(0);
    prisma.calendarFeed.create.mockResolvedValue({ id: 'f1', label: null });
    const res = await request(app).post('/api/v2/calendar/feeds').set(as()).send({});
    expect(res.status).toBe(201);
    const stored = prisma.calendarFeed.create.mock.calls[0][0].data;
    expect(res.body.token).toHaveLength(43);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(res.body.token);
    expect(stored).toMatchObject({ churchId: 'church-1', userId: 'user-1' });
  });

  test('at most five active links', async () => {
    prisma.calendarFeed.count.mockResolvedValue(5);
    expect((await request(app).post('/api/v2/calendar/feeds').set(as()).send({})).status).toBe(409);
  });

  test('revoking only touches your own link', async () => {
    prisma.calendarFeed.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).delete('/api/v2/calendar/feeds/f9').set(as())).status).toBe(404);
    expect(prisma.calendarFeed.updateMany.mock.calls[0][0].where).toEqual({ id: 'f9', userId: 'user-1', revokedAt: null });
  });

  const feed = (over: Record<string, unknown> = {}) => ({ id: 'f1', churchId: 'church-1', revokedAt: null, user: { disabledAt: null }, church: { name: 'Grace, Church' }, ...over });

  test('public link serves church events as iCalendar', async () => {
    prisma.calendarFeed.findUnique.mockResolvedValue(feed());
    prisma.calendarFeed.update.mockResolvedValue({});
    prisma.event.findMany.mockResolvedValue([{ id: 'e1', title: 'Sunday; Service', description: 'Line1\nLine2', location: 'Hall', startDateTime: new Date('2026-05-03T08:00:00Z'), endDateTime: null, updatedAt: new Date('2026-04-01T00:00:00Z') }]);
    const res = await request(app).get('/api/v2/public/calendar/sometoken.ics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.text).toContain(String.raw`SUMMARY:Sunday\; Service`);
    expect(res.text).toContain('DESCRIPTION:Line1\\nLine2');
    expect(res.text).toContain('DTSTART:20260503T080000Z');
    expect(res.text).toContain('DTEND:20260503T090000Z');
    expect(prisma.event.findMany.mock.calls[0][0].where).toMatchObject({ churchId: 'church-1', status: { not: 'CANCELLED' } });
    expect(prisma.calendarFeed.findUnique.mock.calls[0][0].where.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test.each([[null], [feed({ revokedAt: new Date() })], [feed({ user: { disabledAt: new Date() } })]])('unknown, revoked or switched-off link is a plain 404', async (row) => {
    prisma.calendarFeed.findUnique.mockResolvedValue(row);
    expect((await request(app).get('/api/v2/public/calendar/sometoken.ics')).status).toBe(404);
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  test('ics text escaping and line folding', () => {
    const long = 'x'.repeat(200);
    expect(fold(long).split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(fold(long).replace(/\r\n /g, '')).toBe(long);
    const ics = buildIcs('C', [{ id: 'e', title: 'a,b\\c', description: null, location: null, startDateTime: new Date('2026-01-01T00:00:00Z'), endDateTime: new Date('2026-01-01T02:00:00Z'), updatedAt: new Date() }]);
    expect(ics).toContain('SUMMARY:a\\,b\\\\c');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
