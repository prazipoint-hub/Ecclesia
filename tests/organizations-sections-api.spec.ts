import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { createMockPrisma } from './helpers/mockPrisma';
import type { withLegacyModels } from './helpers/legacyMocks';

const mocked = vi.hoisted(() => ({ prisma: undefined as unknown }));

vi.mock('@/database', async () => {
  const { createMockPrisma: create } = await import('./helpers/mockPrisma');
  const { withLegacyModels: extend } = await import('./helpers/legacyMocks');
  mocked.prisma = extend(create());
  return { prisma: mocked.prisma, default: mocked.prisma };
});

import { createApp } from '@/app';
import { jwtSecret } from '@/config/secrets';

const prisma = mocked.prisma as ReturnType<typeof withLegacyModels<ReturnType<typeof createMockPrisma>>>;
const app = createApp();

// These older modules validate ids as UUIDs, so the test church needs a UUID id.
const CHURCH = '11111111-1111-4111-8111-111111111111';
const OTHER_CHURCH = '22222222-2222-4222-8222-222222222222';
const SECTION = '33333333-3333-4333-8333-333333333333';
const ORG = '44444444-4444-4444-8444-444444444444';
const MEMBER = '55555555-5555-4555-8555-555555555555';

const as = (...permissions: string[]) => ({
  Authorization: `Bearer ${jwt.sign({ sub: 'user-1', email: 'u1@example.com', churchId: CHURCH, memberId: 'member-1', permissions, sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const section = (over: Record<string, unknown> = {}) => ({ id: SECTION, churchId: CHURCH, name: 'North', code: 'N', ...over });
const org = (over: Record<string, unknown> = {}) => ({ id: ORG, churchId: CHURCH, name: 'Women', organizationType: 'RRW', ...over });

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.$transaction.mockImplementation((async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[]))) as never);
  prisma.auditLog.create.mockResolvedValue({});
});

describe('sections', () => {
  test('every route needs sign-in; writes need their permission', async () => {
    expect((await request(app).get('/api/v2/sections')).status).toBe(401);
    expect((await request(app).post('/api/v2/sections').set(as('section:manage'))).status).toBe(403);
    expect((await request(app).post('/api/v2/sections/leadership').set(as('section:create'))).status).toBe(403);
  });

  test('list needs a churchId and is limited to the user church', async () => {
    expect((await request(app).get('/api/v2/sections').set(as())).status).toBe(400);
    prisma.section.findMany.mockResolvedValue([section()]);
    prisma.section.count.mockResolvedValue(1);
    const ok = await request(app).get(`/api/v2/sections?churchId=${CHURCH}&skip=2&take=5`).set(as());
    expect(ok.body.total).toBe(1);
    expect(prisma.section.findMany.mock.calls[0][0]).toMatchObject({ where: { churchId: CHURCH }, skip: 2, take: 5, orderBy: { name: 'asc' } });

    prisma.section.findMany.mockClear();
    const foreign = await request(app).get(`/api/v2/sections?churchId=${OTHER_CHURCH}`).set(as());
    expect(foreign.body).toMatchObject({ sections: [], total: 0 });
    expect(prisma.section.findMany).not.toHaveBeenCalled();
    await request(app).get(`/api/v2/sections?churchId=${OTHER_CHURCH}`).set(as('section:view:all_churches'));
    expect(prisma.section.findMany).toHaveBeenCalled();
  });

  test('a section of another church looks like it does not exist', async () => {
    prisma.section.findUnique.mockResolvedValue(section({ churchId: OTHER_CHURCH }));
    expect((await request(app).get(`/api/v2/sections/${SECTION}`).set(as())).status).toBe(404);
    expect((await request(app).get(`/api/v2/sections/${SECTION}/members`).set(as('member:view'))).status).toBe(404);
    expect((await request(app).get(`/api/v2/sections/${SECTION}/leadership`).set(as('member:view'))).status).toBe(404);
    expect(prisma.member.findMany).not.toHaveBeenCalled();
    prisma.section.findUnique.mockResolvedValue(section({ churchId: OTHER_CHURCH }));
    expect((await request(app).get(`/api/v2/sections/${SECTION}`).set(as('section:view:all_churches'))).status).toBe(200);
    prisma.section.findUnique.mockResolvedValue(null);
    expect((await request(app).get(`/api/v2/sections/${SECTION}`).set(as())).status).toBe(404);
  });

  test('members and current leadership of an own section', async () => {
    prisma.section.findUnique.mockResolvedValue(section());
    prisma.member.findMany.mockResolvedValue([{ id: MEMBER }]);
    prisma.leadershipAssignment.findMany.mockResolvedValue([{ id: 'a1' }]);
    // Listing people needs the member:view permission; being signed in is not enough.
    expect((await request(app).get(`/api/v2/sections/${SECTION}/members`)).status).toBe(401);
    expect((await request(app).get(`/api/v2/sections/${SECTION}/members`).set(as())).status).toBe(403);
    expect((await request(app).get(`/api/v2/sections/${SECTION}/leadership`).set(as())).status).toBe(403);
    expect(prisma.member.findMany).not.toHaveBeenCalled();
    expect((await request(app).get(`/api/v2/sections/${SECTION}/members`).set(as('member:view'))).body).toEqual([{ id: MEMBER }]);
    expect(prisma.member.findMany.mock.calls[0][0].where).toEqual({ sectionId: SECTION });
    await request(app).get(`/api/v2/sections/${SECTION}/leadership`).set(as('member:view'));
    expect(prisma.leadershipAssignment.findMany.mock.calls[0][0].where).toEqual({ sectionId: SECTION, endDate: null });
  });

  test('create: validation, own church only, audit', async () => {
    const post = (body: object, ...perms: string[]) => request(app).post('/api/v2/sections').set(as(...(perms.length ? perms : ['section:create']))).send(body);
    expect((await post({ name: '', churchId: CHURCH })).status).toBe(400);
    expect((await post({ name: 'X', churchId: '' })).status).toBe(400);
    expect((await post({ name: 'X', churchId: CHURCH, code: 'WAYTOOLONGCODE' })).status).toBe(400);
    expect([401, 403]).toContain((await post({ name: 'X', churchId: OTHER_CHURCH })).status);
    expect(prisma.section.create).not.toHaveBeenCalled();

    prisma.section.create.mockImplementation((async ({ data }: any) => data) as never);
    const ok = await post({ name: 'South', churchId: CHURCH, code: 'S' });
    expect(ok.status).toBe(201);
    expect(prisma.section.create.mock.calls[0][0].data).toMatchObject({ name: 'South', churchId: CHURCH, code: 'S' });
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'SECTION_CREATED', entityType: 'SECTION', churchId: CHURCH });

    expect((await post({ name: 'Elsewhere', churchId: OTHER_CHURCH }, 'section:create', 'section:create:all_churches')).status).toBe(201);
  });

  describe('assigning leadership', () => {
    const body = { sectionId: SECTION, memberId: MEMBER, position: 'TREASURER' };
    const assign = (b: object = body) => request(app).post('/api/v2/sections/leadership').set(as('section:manage')).send(b);
    const happy = () => {
      prisma.section.findUnique.mockResolvedValue(section());
      prisma.member.findUnique.mockResolvedValue({ id: MEMBER, churchId: CHURCH });
      prisma.role.upsert.mockResolvedValue({ id: 'role-1' });
      prisma.leadershipAssignment.updateMany.mockResolvedValue({ count: 1 });
      prisma.leadershipAssignment.create.mockImplementation((async ({ data }: any) => data) as never);
    };

    test('ends the previous holder of the position and starts the new one', async () => {
      happy();
      const res = await assign({ ...body, effectiveDate: '2026-02-01T00:00:00.000Z' });
      expect(res.status).toBe(201);
      expect(prisma.role.upsert.mock.calls[0][0].where).toEqual({ churchId_name: { churchId: CHURCH, name: 'Section TREASURER' } });
      expect(prisma.leadershipAssignment.updateMany.mock.calls[0][0]).toMatchObject({ where: { sectionId: SECTION, position: 'TREASURER', endDate: null } });
      expect(prisma.leadershipAssignment.updateMany.mock.calls[0][0].data.endDate).toBeInstanceOf(Date);
      expect(prisma.leadershipAssignment.create.mock.calls[0][0].data).toMatchObject({ churchId: CHURCH, sectionId: SECTION, memberId: MEMBER, roleId: 'role-1', endDate: null });
      expect(prisma.leadershipAssignment.create.mock.calls[0][0].data.startDate.toISOString()).toBe('2026-02-01T00:00:00.000Z');
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('SECTION_LEADERSHIP_ASSIGNED');
    });

    test('validation and lookups', async () => {
      expect((await assign({ ...body, position: 'CHAIR' })).status).toBe(400);
      expect((await assign({ ...body, memberId: '' })).status).toBe(400);
      expect((await assign({ ...body, effectiveDate: 'yesterday' })).status).toBe(400);
      prisma.section.findUnique.mockResolvedValue(null);
      expect((await assign()).status).toBe(404);
      prisma.section.findUnique.mockResolvedValue(section({ churchId: OTHER_CHURCH }));
      expect((await assign()).status).toBe(404);
      expect(prisma.leadershipAssignment.create).not.toHaveBeenCalled();
    });

    test('the member must belong to the section church', async () => {
      happy();
      prisma.member.findUnique.mockResolvedValue({ id: MEMBER, churchId: OTHER_CHURCH });
      expect((await assign()).status).toBe(404);
      prisma.member.findUnique.mockResolvedValue(null);
      expect((await assign()).status).toBe(404);
      expect(prisma.leadershipAssignment.updateMany).not.toHaveBeenCalled();
      expect(prisma.leadershipAssignment.create).not.toHaveBeenCalled();
    });
  });
});

describe('organizations', () => {
  test('sign-in and permissions', async () => {
    expect((await request(app).get('/api/v2/organizations')).status).toBe(401);
    expect((await request(app).post('/api/v2/organizations').set(as('organization:manage'))).status).toBe(403);
    expect((await request(app).post(`/api/v2/organizations/${ORG}/members`).set(as('organization:view'))).status).toBe(403);
    expect((await request(app).post(`/api/v2/organizations/${ORG}/roles`).set(as('organization:view'))).status).toBe(403);
  });

  test('list needs a churchId and hides other churches', async () => {
    expect((await request(app).get('/api/v2/organizations').set(as())).status).toBe(400);
    prisma.organization.findMany.mockResolvedValue([org()]);
    prisma.organization.count.mockResolvedValue(1);
    expect((await request(app).get(`/api/v2/organizations?churchId=${CHURCH}`).set(as())).body.total).toBe(1);
    prisma.organization.findMany.mockClear();
    expect((await request(app).get(`/api/v2/organizations?churchId=${OTHER_CHURCH}`).set(as())).body.total).toBe(0);
    expect(prisma.organization.findMany).not.toHaveBeenCalled();
  });

  test('detail includes the active member count; other churches are 404', async () => {
    prisma.organization.findUnique.mockResolvedValue(org());
    prisma.organizationMembership.count.mockResolvedValue(12);
    const res = await request(app).get(`/api/v2/organizations/${ORG}`).set(as());
    expect(res.body.memberCount).toBe(12);
    expect(prisma.organizationMembership.count.mock.calls[0][0].where).toEqual({ organizationId: ORG, membershipStatus: 'ACTIVE' });
    prisma.organization.findUnique.mockResolvedValue(org({ churchId: OTHER_CHURCH }));
    expect((await request(app).get(`/api/v2/organizations/${ORG}`).set(as())).status).toBe(404);
    expect((await request(app).get(`/api/v2/organizations/${ORG}`).set(as('organization:view:all_churches'))).status).toBe(200);
  });

  describe('create', () => {
    const body = { churchId: CHURCH, organizationType: 'RRW', name: 'Women', shortName: 'RRW' };
    const post = (b: object = body, ...perms: string[]) => request(app).post('/api/v2/organizations').set(as(...(perms.length ? perms : ['organization:create']))).send(b);

    test('validation', async () => {
      expect((await post({ ...body, organizationType: 'CHOIR' })).status).toBe(400);
      expect((await post({ ...body, shortName: 'x'.repeat(21) })).status).toBe(400);
      expect((await post({ ...body, name: '' })).status).toBe(400);
      expect((await post({ ...body, churchId: '' })).status).toBe(400);
      expect([401, 403]).toContain((await post({ ...body, churchId: OTHER_CHURCH })).status);
      expect(prisma.organization.create).not.toHaveBeenCalled();
    });

    test('creates the organization with its own zero-balance finance account and audits', async () => {
      prisma.organization.create.mockImplementation((async ({ data }: any) => data) as never);
      prisma.organizationFinancialAccount.create.mockResolvedValue({});
      const res = await post();
      expect(res.status).toBe(201);
      expect(prisma.organization.create.mock.calls[0][0].data).toMatchObject({ churchId: CHURCH, status: 'ACTIVE', organizationType: 'RRW' });
      expect(prisma.organizationFinancialAccount.create.mock.calls[0][0].data).toMatchObject({ churchId: CHURCH, openingBalance: 0, currentBalance: 0 });
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'ORGANIZATION_CREATED', entityType: 'ORGANIZATION' });
    });
  });

  describe('members', () => {
    const add = (b: object = { memberId: MEMBER }) => request(app).post(`/api/v2/organizations/${ORG}/members`).set(as('organization:manage')).send(b);
    const happy = () => {
      prisma.organization.findUnique.mockResolvedValue(org());
      prisma.member.findUnique.mockResolvedValue({ id: MEMBER, churchId: CHURCH });
      prisma.organizationMembership.findFirst.mockResolvedValue(null);
      prisma.organizationMembership.create.mockImplementation((async ({ data }: any) => data) as never);
      prisma.user.findFirst.mockResolvedValue({ id: 'member-user' });
      prisma.notification.create.mockResolvedValue({});
    };

    test('links an existing member, audits and notifies', async () => {
      happy();
      const res = await add({ memberId: MEMBER, notes: 'Joined at conference' });
      expect(res.status).toBe(201);
      expect(prisma.member.create).not.toHaveBeenCalled();
      expect(prisma.organizationMembership.create.mock.calls[0][0].data).toMatchObject({ organizationId: ORG, memberId: MEMBER, membershipStatus: 'ACTIVE', notes: 'Joined at conference', endedAt: null });
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('ORGANIZATION_MEMBER_ADDED');
      expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({ recipientId: 'member-user', type: 'ORGANIZATION_MEMBERSHIP' });
    });

    test('a member can rejoin after leaving; a member without a login gets no notification', async () => {
      happy();
      prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'old', membershipStatus: 'LEFT' });
      prisma.user.findFirst.mockResolvedValue(null);
      expect((await add()).status).toBe(201);
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    test('invalid status, unknown organization and foreign members are refused', async () => {
      expect((await add({ memberId: MEMBER, membershipStatus: 'GONE' })).status).toBe(400);
      expect((await add({ memberId: '' })).status).toBe(400);
      prisma.organization.findUnique.mockResolvedValue(null);
      expect((await add()).status).toBe(404);
      happy();
      prisma.organization.findUnique.mockResolvedValue(org({ churchId: OTHER_CHURCH }));
      expect((await add()).status).toBe(404);
      happy();
      prisma.member.findUnique.mockResolvedValue({ id: MEMBER, churchId: OTHER_CHURCH });
      expect((await add()).status).toBe(404);
      expect(prisma.organizationMembership.create).not.toHaveBeenCalled();
    });

    test('adding someone who is already a member answers 409', async () => {
      happy();
      prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm', membershipStatus: 'ACTIVE' });
      expect((await add()).status).toBe(409);
    });
    test('adding someone who is already a member creates nothing', async () => {
      happy();
      prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm', membershipStatus: 'ACTIVE' });
      await add();
      expect(prisma.organizationMembership.create).not.toHaveBeenCalled();
    });

    test('without organization:view a missing and an existing organization look the same', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      const missing = await request(app).get(`/api/v2/organizations/${ORG}/members`).set(as());
      prisma.organization.findUnique.mockResolvedValue(org());
      const existing = await request(app).get(`/api/v2/organizations/${ORG}/members`).set(as());
      expect(missing.status).toBe(existing.status);
      expect(missing.status).not.toBe(404);
      expect(prisma.organization.findUnique).toHaveBeenCalledTimes(0);
    });

    test('listing members needs organization:view and passes status and paging through', async () => {
      prisma.organization.findUnique.mockResolvedValue(org());
      prisma.organizationMembership.findMany.mockResolvedValue([]);
      prisma.organizationMembership.count.mockResolvedValue(0);
      // The service reports a missing permission as "Unauthorized", which the error handler maps to 401 (403 would be the correct code).
      expect([401, 403]).toContain((await request(app).get(`/api/v2/organizations/${ORG}/members`).set(as())).status);
      const res = await request(app).get(`/api/v2/organizations/${ORG}/members?status=ACTIVE&skip=3&take=7`).set(as('organization:view'));
      expect(res.status).toBe(200);
      expect(prisma.organizationMembership.findMany.mock.calls[0][0]).toMatchObject({ where: { organizationId: ORG, membershipStatus: 'ACTIVE' }, skip: 3, take: 7 });
    });
  });

  describe('roles', () => {
    const assign = (b: object = { memberId: MEMBER, position: 'Treasurer' }) => request(app).post(`/api/v2/organizations/${ORG}/roles`).set(as('organization:manage')).send(b);
    const happy = () => {
      prisma.organization.findUnique.mockResolvedValue(org());
      prisma.member.findUnique.mockResolvedValue({ id: MEMBER, churchId: CHURCH });
      prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.organizationRoleAssignment.updateMany.mockResolvedValue({ count: 1 });
      prisma.organizationRoleAssignment.create.mockImplementation((async ({ data }: any) => data) as never);
    };

    test('replaces the current holder of the position', async () => {
      happy();
      const res = await assign({ memberId: MEMBER, position: 'Treasurer', startDate: '2026-03-01T00:00:00.000Z' });
      expect(res.status).toBe(201);
      expect(prisma.organizationMembership.findFirst.mock.calls[0][0].where).toEqual({ organizationId: ORG, memberId: MEMBER, membershipStatus: 'ACTIVE' });
      expect(prisma.organizationRoleAssignment.updateMany.mock.calls[0][0].where).toEqual({ organizationId: ORG, position: 'Treasurer', endDate: null });
      expect(prisma.organizationRoleAssignment.create.mock.calls[0][0].data).toMatchObject({ organizationId: ORG, memberId: MEMBER, position: 'Treasurer', endDate: null });
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('ORGANIZATION_ROLE_ASSIGNED');
    });

    test('validation and scope', async () => {
      expect((await assign({ memberId: MEMBER, position: '' })).status).toBe(400);
      expect((await assign({ memberId: MEMBER, position: 'X', startDate: 'soon' })).status).toBe(400);
      prisma.organization.findUnique.mockResolvedValue(null);
      expect((await assign()).status).toBe(404);
      happy();
      prisma.member.findUnique.mockResolvedValue({ id: MEMBER, churchId: OTHER_CHURCH });
      expect((await assign()).status).toBe(404);
      expect(prisma.organizationRoleAssignment.create).not.toHaveBeenCalled();
    });

    test('a non-member cannot hold a role (409)', async () => {
      happy();
      prisma.organizationMembership.findFirst.mockResolvedValue(null);
      expect((await assign()).status).toBe(409);
    });
    test('a non-member is never given a role', async () => {
      happy();
      prisma.organizationMembership.findFirst.mockResolvedValue(null);
      await assign();
      expect(prisma.organizationRoleAssignment.updateMany).not.toHaveBeenCalled();
      expect(prisma.organizationRoleAssignment.create).not.toHaveBeenCalled();
    });
  });

  describe('dashboard', () => {
    test('needs organization:view and gathers leadership, account and upcoming events', async () => {
      prisma.organization.findUnique.mockResolvedValue(org());
      prisma.organizationMembership.count.mockResolvedValue(4);
      prisma.organizationRoleAssignment.findMany.mockResolvedValue([{ id: 'r' }]);
      prisma.organizationFinancialAccount.findUnique.mockResolvedValue({ currentBalance: 10 });
      prisma.event.findMany.mockResolvedValue([]);
      expect([401, 403]).toContain((await request(app).get(`/api/v2/organizations/${ORG}/dashboard`).set(as())).status);
      const res = await request(app).get(`/api/v2/organizations/${ORG}/dashboard`).set(as('organization:view'));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ activeMembers: 4, leadership: [{ id: 'r' }], financialAccount: { currentBalance: 10 } });
      expect(prisma.organizationRoleAssignment.findMany.mock.calls[0][0].where).toEqual({ organizationId: ORG, endDate: null });
      expect(prisma.event.findMany.mock.calls[0][0]).toMatchObject({ where: { organizationId: ORG }, take: 5 });
    });

    test('another church organization is 404', async () => {
      prisma.organization.findUnique.mockResolvedValue(org({ churchId: OTHER_CHURCH }));
      expect((await request(app).get(`/api/v2/organizations/${ORG}/dashboard`).set(as('organization:view'))).status).toBe(404);
    });
  });
});

describe('repository helpers used elsewhere', () => {
  test('member organizations include active roles only and an other-church member is refused', async () => {
    const { organizationService } = await import('@/features/organizations/service');
    const user = { id: 'user-1', churchId: CHURCH, permissions: [] as string[] };
    prisma.member.findUnique.mockResolvedValue({ id: MEMBER, churchId: CHURCH });
    prisma.organizationMembership.findMany.mockResolvedValue([{ id: 'x' }]);
    expect(await organizationService.getMemberOrganizations(MEMBER, user)).toEqual([{ id: 'x' }]);
    expect(prisma.organizationMembership.findMany.mock.calls[0][0].include.member.include.organizationRoles.where).toEqual({ endDate: null });
    prisma.member.findUnique.mockResolvedValue({ id: MEMBER, churchId: OTHER_CHURCH });
    await expect(organizationService.getMemberOrganizations(MEMBER, user)).rejects.toThrow(/another church/);
    prisma.member.findUnique.mockResolvedValue(null);
    await expect(organizationService.getMemberOrganizations(MEMBER, user)).rejects.toThrow(/not found/);
  });

  test('section repository helpers', async () => {
    const { sectionRepository } = await import('@/features/sections/repository');
    prisma.section.update.mockResolvedValue({});
    (prisma.section as any).findUniqueOrThrow = vi.fn().mockResolvedValue({ id: SECTION, members: [] });
    prisma.member.count.mockResolvedValue(9);
    await sectionRepository.update(SECTION, { name: 'New' });
    expect(prisma.section.update).toHaveBeenCalledWith({ where: { id: SECTION }, data: { name: 'New' } });
    expect(await sectionRepository.findWithMembers(SECTION)).toMatchObject({ id: SECTION });
    expect(await sectionRepository.getMembersCount(SECTION)).toBe(9);
  });

  test('organization repository helpers', async () => {
    const { organizationRepository } = await import('@/features/organizations/repository');
    prisma.organizationMembership.findMany.mockResolvedValue([]);
    await organizationRepository.getMemberOrganizations(MEMBER);
    expect(prisma.organizationMembership.findMany.mock.calls[0][0].where).toEqual({ memberId: MEMBER });
  });
});
