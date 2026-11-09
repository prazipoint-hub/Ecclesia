/**
 * Opt-in concurrency checks against a REAL MySQL (not run by vitest). Use a scratch database only:
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/scratch_ecclesia npx prisma migrate deploy
 *   DATABASE_URL=... npx tsx tests/integration/mysql-concurrency.ts
 * It creates its own church and data. Refuses to run unless the URL contains "scratch".
 */
import { prisma } from '@/database';
import { cashReviewService } from '@/features/accounting/service/cashReview';
import { depositService } from '@/features/accounting/service/deposits';
import { DEFAULT_CHART } from '@/features/accounting/service/defaultChart';
import type { AuthorizedUser } from '@/types';

if (!/scratch/.test(process.env.DATABASE_URL ?? '')) { console.error('Refusing: DATABASE_URL must point at a scratch database'); process.exit(2); }

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); if (!ok) failures += 1; };
const user = (id: string, churchId: string, memberId: string | null, ...permissions: string[]): AuthorizedUser => ({ id, churchId, memberId, permissions } as AuthorizedUser);
const tag = Math.random().toString(36).slice(2, 8);

async function main() {
  const church = await prisma.church.create({ data: { name: `Conc ${tag}` } });
  const fa = await prisma.financialAccount.create({ data: { churchId: church.id } });
  await prisma.ledgerAccount.createMany({ data: DEFAULT_CHART.map((a) => ({ churchId: church.id, code: a.code, name: a.name, type: a.type })) });

  // ---- deposits: many verifiers race on one deposit -> exactly one wins, exactly one journal entry
  const recorder = user('u-rec', church.id, null, 'finance:deposit:record');
  const dep = await depositService.record(recorder, { currency: 'USD', amount: 100, depositDate: new Date().toISOString(), bankReference: `SLIP-${tag}` });
  const verifiers = Array.from({ length: 10 }, (_, i) => user(`u-ver${i}`, church.id, null, 'finance:deposit:verify'));
  const res = await Promise.allSettled(verifiers.map((v) => depositService.verify(v, dep.id)));
  const won = res.filter((r) => r.status === 'fulfilled').length;
  const entries = await prisma.journalEntry.count({ where: { churchId: church.id, source: 'DEPOSIT', sourceId: dep.id } });
  const lost = res.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason?.message ?? (r as PromiseRejectedResult).reason?.code).slice(0, 60));
  check('deposit: exactly one verifier wins', won === 1, `won=${won} errors=${[...new Set(lost)].join(' | ')}`);
  check('deposit: exactly one journal entry', entries === 1, `entries=${entries}`);
  const dup = await Promise.allSettled(Array.from({ length: 8 }, () => depositService.record(recorder, { currency: 'USD', amount: 5, depositDate: new Date().toISOString(), bankReference: `DUP-${tag}` })));
  check('deposit: duplicate bank reference recorded once', dup.filter((r) => r.status === 'fulfilled').length === 1, `ok=${dup.filter((r) => r.status === 'fulfilled').length}`);

  // ---- cash session: many reviewers race to approve one submission
  const member = await prisma.member.create({ data: { churchId: church.id, firstName: 'C', lastName: 'Ashier', membershipNumber: `M-${tag}` } as never });
  const cashier = user('u-cash', church.id, member.id, 'finance:cash_session:manage');
  const session = await prisma.cashSession.create({ data: { churchId: church.id, accountId: fa.id, openingBalance: 0, handledBy: member.id, currency: 'USD' } });
  await cashReviewService.submit(cashier, session.id, { counts: [{ currency: 'USD', counted: 0 }], cashPaidOut: 0 });
  const reviewers = Array.from({ length: 10 }, (_, i) => user(`u-rv${i}`, church.id, `m-rv${i}`, 'finance:cash_session:review'));
  const ap = await Promise.allSettled(reviewers.map((r) => cashReviewService.approve(r, session.id, { submissionNo: 1, received: [{ currency: 'USD', amount: 0 }] })));
  const approved = ap.filter((r) => r.status === 'fulfilled').length;
  const events = await prisma.cashSessionEvent.count({ where: { sessionId: session.id, action: 'APPROVED' } });
  check('cash session: exactly one approval wins', approved === 1, `won=${approved}`);
  check('cash session: exactly one APPROVED event', events === 1, `events=${events}`);

  await prisma.church.delete({ where: { id: church.id } }).catch(() => undefined);
  await prisma.$disconnect();
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
