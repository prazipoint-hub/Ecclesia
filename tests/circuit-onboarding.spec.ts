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
const as = () => ({
  Authorization: `Bearer ${jwt.sign({ sub: 'sec', email: 's@example.com', churchId: 'ch1', memberId: 'mem-sec', permissions: [], sessionId: 's1', tokenId: 't1' }, jwtSecret, { expiresIn: '5m' })}`,
});
const grant = (scopeType: string, scopeId: string, ...perms: string[]) => ({ scopeType, scopeId, role: { permissions: perms.map((name) => ({ permission: { name } })) } });
const url = (p = '') => `/api/v2/hierarchy/circuits/ci1/onboarding${p}`;

type World = { circuit?: object; sections?: number; orgs?: number; members?: number; leaders?: number; confirmed?: string[] };
const world = (w: World = {}) => {
  prisma.circuit.findUnique.mockResolvedValue({ id: 'ci1', districtId: 'd1', identificationNumber: 'CIR-1', location: 'Harare', status: 'ACTIVE', onboardedAt: null, ...w.circuit });
  prisma.church.findMany.mockResolvedValue([{ id: 'ch1' }]);
  prisma.circuitOnboardingStep.findMany.mockResolvedValue((w.confirmed ?? []).map((step) => ({ step, confirmedAt: new Date() })));
  prisma.invitation.findFirst.mockResolvedValue({ memberId: 'mem-sec' });
  prisma.section.count.mockResolvedValue(w.sections ?? 0);
  prisma.organization.count.mockResolvedValue(w.orgs ?? 0);
  prisma.member.count.mockResolvedValue(w.members ?? 0);
  prisma.leadershipAssignment.count.mockResolvedValue(w.leaders ?? 0);
  prisma.appointment.count.mockResolvedValue(0);
};

beforeEach(() => {
  vi.resetAllMocks();
  prisma.session.findFirst.mockResolvedValue({ id: 's1', deviceId: null });
  prisma.auditLog.create.mockResolvedValue({});
  // The scope chain for circuit ci1 is ci1 -> d1 -> c1.
  prisma.circuit.findUnique.mockResolvedValue({ districtId: 'd1' });
  prisma.district.findUnique.mockResolvedValue({ conferenceId: 'c1' });
  prisma.scopedRoleAssignment.findMany.mockResolvedValue([grant('CIRCUIT', 'ci1', 'circuit:onboard', 'circuit:view')]);
  world();
});

describe('onboarding access', () => {
  test('a grant for another circuit, or no grant, sees the circuit as missing', async () => {
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([grant('CIRCUIT', 'other', 'circuit:onboard')]);
    expect((await request(app).get(url()).set(as())).status).toBe(404);
    expect((await request(app).post(url('/complete')).set(as())).status).toBe(404);
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([]);
    expect((await request(app).get(url()).set(as())).status).toBe(404);
    expect((await request(app).get(url())).status).toBe(401);
  });

  test('view-only holders can read progress but not change it', async () => {
    prisma.scopedRoleAssignment.findMany.mockResolvedValue([grant('CIRCUIT', 'ci1', 'circuit:view')]);
    expect((await request(app).get(url()).set(as())).status).toBe(200);
    expect((await request(app).post(url('/steps/DETAILS/confirm')).set(as())).status).toBe(404);
    expect(prisma.circuitOnboardingStep.upsert).not.toHaveBeenCalled();
  });
});

describe('onboarding progress is derived from real data', () => {
  test('a fresh circuit shows blockers and no invented counts; visiting does not complete anything', async () => {
    world({ circuit: { location: null } });
    const res = await request(app).get(url()).set(as());
    expect(res.body.progress).toEqual({ done: 0, total: 5 });
    const by = Object.fromEntries(res.body.steps.map((s: { step: string }) => [s.step, s]));
    expect(by.DETAILS.blockers).toEqual(['no location recorded']);
    expect(by.STRUCTURE.blockers).toHaveLength(2);
    expect(by.MEMBERSHIP.counts).toEqual({ members: 0 });
    expect(by.ACCESS.ready).toBe(true);
    expect(by.ACCESS.done).toBe(false); // ready is not done until the Secretary confirms
    expect(res.body.canComplete).toBe(false);
    // The Secretary herself is excluded from the membership and leadership counts.
    expect(prisma.member.count.mock.calls[0][0].where.id).toEqual({ not: 'mem-sec' });
    expect(prisma.leadershipAssignment.count.mock.calls[0][0].where.memberId).toEqual({ not: 'mem-sec' });
  });

  test('structure completes by itself from sections and organisations', async () => {
    world({ sections: 2, orgs: 3 });
    const res = await request(app).get(url()).set(as());
    expect(res.body.steps.find((s: { step: string }) => s.step === 'STRUCTURE')).toMatchObject({ done: true, counts: { sections: 2, organizations: 3 } });
  });

  test('a confirmation goes stale when the underlying data disappears', async () => {
    world({ members: 0, confirmed: ['MEMBERSHIP'] });
    const res = await request(app).get(url()).set(as());
    expect(res.body.steps.find((s: { step: string }) => s.step === 'MEMBERSHIP')).toMatchObject({ confirmed: true, done: false });
  });
});

describe('confirming and completing', () => {
  test('cannot confirm a step whose prerequisites fail, and unknown steps are rejected', async () => {
    const blocked = await request(app).post(url('/steps/membership/confirm')).set(as());
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toContain('import or add at least one member');
    expect((await request(app).post(url('/steps/STRUCTURE/confirm')).set(as())).status).toBe(400);
    expect(prisma.circuitOnboardingStep.upsert).not.toHaveBeenCalled();
  });

  test('confirming is an idempotent upsert and is audited', async () => {
    world({ members: 4 });
    const res = await request(app).post(url('/steps/MEMBERSHIP/confirm')).set(as());
    expect(res.status).toBe(200);
    expect(prisma.circuitOnboardingStep.upsert.mock.calls[0][0]).toMatchObject({ where: { circuitId_step: { circuitId: 'ci1', step: 'MEMBERSHIP' } }, create: { confirmedBy: 'sec' } });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('CIRCUIT_ONBOARDING_STEP_CONFIRMED');
  });

  test('complete is refused while any mandatory step is open, and names what is missing', async () => {
    world({ sections: 1, orgs: 1, members: 3, leaders: 1, confirmed: ['DETAILS', 'MEMBERSHIP', 'LEADERSHIP'] });
    const res = await request(app).post(url('/complete')).set(as());
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Review access and finance setup');
    expect(prisma.circuit.updateMany).not.toHaveBeenCalled();
  });

  test('complete succeeds once every step passes, records once, and a retry is a no-op', async () => {
    world({ sections: 1, orgs: 1, members: 3, leaders: 1, confirmed: ['DETAILS', 'MEMBERSHIP', 'LEADERSHIP', 'ACCESS'] });
    prisma.circuit.updateMany.mockResolvedValue({ count: 1 });
    const ok = await request(app).post(url('/complete')).set(as());
    expect(ok.status).toBe(200);
    expect(prisma.circuit.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'ci1', onboardedAt: null } });
    expect(prisma.auditLog.create.mock.calls.at(-1)![0].data.action).toBe('CIRCUIT_ONBOARDING_COMPLETED');

    // Already complete: no second write, no second audit.
    world({ sections: 1, orgs: 1, members: 3, leaders: 1, confirmed: ['DETAILS', 'MEMBERSHIP', 'LEADERSHIP', 'ACCESS'], circuit: { onboardedAt: new Date() } });
    prisma.circuit.updateMany.mockClear();
    prisma.auditLog.create.mockClear();
    expect((await request(app).post(url('/complete')).set(as())).status).toBe(200);
    expect(prisma.circuit.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect((await request(app).post(url('/steps/DETAILS/confirm')).set(as())).status).toBe(409);
  });

  test('losing the completion race records nothing extra', async () => {
    world({ sections: 1, orgs: 1, members: 3, leaders: 1, confirmed: ['DETAILS', 'MEMBERSHIP', 'LEADERSHIP', 'ACCESS'] });
    prisma.circuit.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).post(url('/complete')).set(as())).status).toBe(200);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
