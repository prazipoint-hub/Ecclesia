import type { AuthorizedUser } from '@/types';
import { pastoralCareRepository as repository } from '../repository';
import { audit, memberInChurch, require } from './common';
import { redact } from './counseling';
import { NotFoundError } from '@/types/errors';

const DAY = 24 * 60 * 60 * 1000;
const UNVISITED_AFTER_DAYS = 180;

export class PastoralDashboardService {
  async overview(user: AuthorizedUser) {
    require(user, 'pastoral:dashboard:view');
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * DAY);
    const unvisitedCutoff = new Date(now.getTime() - UNVISITED_AFTER_DAYS * DAY);
    const [byPriority, urgent, overdue, upcoming, visits30, visited, activeMembers, prayer, flagged] = await Promise.all([
      repository.openCasesByPriority(user.churchId),
      repository.urgentCases(user.churchId, 10),
      repository.countOverdueFollowUps(user.churchId, now),
      repository.upcomingFollowUps(user.churchId, now, new Date(now.getTime() + 7 * DAY), 10),
      repository.countVisitsSince(user.churchId, monthAgo),
      repository.visitedMemberIdsSince(user.churchId, unvisitedCutoff),
      repository.countActiveMembers(user.churchId),
      repository.countPrayerByStatus(user.churchId),
      repository.latestAssessmentsFlagged(user.churchId, 10),
    ]);
    const count = (rows: Array<{ _count: { _all: number } }>) => rows.reduce((sum, r) => sum + r._count._all, 0);
    return {
      openCases: { total: count(byPriority), byPriority: Object.fromEntries(byPriority.map((r) => [r.priority, r._count._all])) },
      priorityCases: urgent,
      followUps: { overdue, dueThisWeek: upcoming },
      visitsLast30Days: visits30,
      unvisitedMembers: { thresholdDays: UNVISITED_AFTER_DAYS, count: Math.max(activeMembers - visited.length, 0), activeMembers },
      prayerRequests: Object.fromEntries(prayer.map((r) => [r.status, r._count._all])),
      flaggedAssessments: flagged,
    };
  }

  /** One page that assembles whatever of a member's care record the viewer is allowed to see. */
  async careProfile(user: AuthorizedUser, memberId: string) {
    require(user, 'pastoral:case:view');
    const member = await memberInChurch(user, memberId);
    if (!member) throw new NotFoundError('Member');
    const can = (p: string) => user.permissions.includes(p);
    const p = (permission: string, load: () => Promise<unknown>, empty: unknown = null) => (can(permission) ? load() : Promise.resolve(empty));
    const base = { churchId: user.churchId, memberId };
    const page = { skip: 0, take: 20 };

    const [cases, visits, counseling, referrals, followUps, assessments, prayer, baptism, confirmation, lifeEvents] = await Promise.all([
      repository.memberCases(user.churchId, memberId),
      p('pastoral:visit:view', async () => (await repository.listVisits(base, page)).items),
      p('pastoral:counseling:view', async () => (await repository.listCounseling(base, page)).items.map(redact)),
      p('pastoral:referral:view', async () => (await repository.listReferrals(base, page)).items),
      p('pastoral:followup:view', async () => (await repository.listFollowUps(base, page)).items),
      p('pastoral:assessment:view', async () => (await repository.listAssessments(base, { skip: 0, take: 5 })).items),
      p('pastoral:prayer:view', async () => (await repository.listPrayer({ ...base, visibility: { not: 'CONFIDENTIAL' } }, page)).items),
      p('pastoral:sacrament:manage', () => repository.findBaptismFor(user.churchId, memberId)),
      p('pastoral:sacrament:manage', () => repository.findConfirmationFor(user.churchId, memberId)),
      repository.memberLifeEvents(user.churchId, memberId),
    ]);
    await audit(user, 'PASTORAL_CARE_PROFILE_VIEWED', 'MEMBER', memberId);
    return { member, cases, visits, counseling, referrals, followUps, assessments, prayer, sacraments: { baptism, confirmation }, lifeEvents };
  }
}

export const pastoralDashboardService = new PastoralDashboardService();
