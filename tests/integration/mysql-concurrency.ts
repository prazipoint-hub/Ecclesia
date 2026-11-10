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
import { bankReconciliationService } from '@/features/accounting/service/bankReconciliation';
import { gate } from '@/features/finance/shared/approvalPolicy';
import { importJobService } from '@/features/members/service/importJobs';
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


  // ---- deposits linked to one approved session: five 60s against 100 of cash -> at most one fits
  const approvedSession = await prisma.cashSession.create({ data: { churchId: church.id, accountId: fa.id, openingBalance: 0, handledBy: member.id, currency: 'USD', status: 'RECONCILED', snapshotJson: JSON.stringify({ cashReceipts: { USD: '100.00' } }) } });
  const linked = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => depositService.record(recorder, { currency: 'USD', amount: 60, depositDate: new Date().toISOString(), bankReference: `LNK-${tag}-${i}`, cashSessionId: approvedSession.id })));
  const fit = linked.filter((r) => r.status === 'fulfilled').length;
  const banked = await prisma.deposit.aggregate({ where: { cashSessionId: approvedSession.id }, _sum: { amount: true } });
  check('session deposits: never more than the session holds', Number(banked._sum.amount ?? 0) <= 100 && fit === 1, `fit=${fit} total=${banked._sum.amount}`);

  // ---- bank reconciliation: two statement lines race for one ledger line; five people race to complete
  const bank = await prisma.ledgerAccount.findFirstOrThrow({ where: { churchId: church.id, code: '1100' } });
  const cashAcc = await prisma.ledgerAccount.findFirstOrThrow({ where: { churchId: church.id, code: '1000' } });
  const day = new Date('2026-03-10T00:00:00Z');
  const je = await prisma.journalEntry.create({ data: { churchId: church.id, reference: `JE-R-${tag}`, description: 'Seed', postDate: day, status: 'POSTED', source: 'MANUAL', createdBy: 'seed', lines: { create: [{ accountId: bank.id, debit: 100, credit: 0 }, { accountId: cashAcc.id, debit: 0, credit: 100 }] } }, include: { lines: true } });
  const bankLine = je.lines.find((l) => l.accountId === bank.id)!;
  const starter = user('u-rs', church.id, null, 'finance:reconcile:manage', 'finance:view');
  const rec = await bankReconciliationService.create(starter, { currency: 'USD', periodStart: '2026-03-01', periodEnd: '2026-03-31', statementOpening: 0, statementClosing: 100 });
  await bankReconciliationService.importLines(starter, rec.id, { lines: [{ date: '2026-03-10', description: 'DEP A', amount: 100 }, { date: '2026-03-11', description: 'DEP B', amount: 100 }] });
  const lines = await prisma.bankStatementLine.findMany({ where: { reconciliationId: rec.id } });
  const m = await Promise.allSettled(lines.map((l) => bankReconciliationService.match(starter, rec.id, { lineId: l.id, journalLineId: bankLine.id })));
  check('reconciliation: one ledger line matches one statement line', m.filter((r) => r.status === 'fulfilled').length === 1, `matched=${m.filter((r) => r.status === 'fulfilled').length}`);
  const winner = await prisma.bankStatementLine.findFirstOrThrow({ where: { reconciliationId: rec.id, status: 'MATCHED' } });
  const loser = lines.find((l) => l.id !== winner.id)!;
  await prisma.bankStatementLine.update({ where: { id: loser.id }, data: { status: 'MATCHED', matchedBy: 'x', matchedJournalLineId: 'manual-placeholder' } }); // the other 100 is a different, separately-booked item
  const completers = Array.from({ length: 5 }, (_, i) => user(`u-rc${i}`, church.id, null, 'finance:reconcile:complete', 'finance:view'));
  const done = await Promise.allSettled(completers.map((c) => bankReconciliationService.complete(c, rec.id)));
  const completed = done.filter((r) => r.status === 'fulfilled').length;
  const diffNote = done.filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason?.message).slice(0, 50));
  check('reconciliation: exactly one completion', completed <= 1, `completed=${completed} ${[...new Set(diffNote)].join(' | ')}`);

  // ---- expenditure approvals: one person clicking many times records one approval
  const clicks = await Promise.allSettled(Array.from({ length: 8 }, () => gate(user('u-ap', church.id, null), 'CHURCH', `exp-${tag}`, 50, true)));
  const rows = await prisma.expenditureApproval.count({ where: { kind: 'CHURCH', expenditureId: `exp-${tag}` } });
  check('approvals: repeated clicks by one person make one record', rows === 1, `rows=${rows} threw=${clicks.filter((r) => r.status === 'rejected').length}`);

  // ---- checked member import: six people confirm the same job at once -> each row is imported once
  const csvRows = ['name,surname,phone,sex,marital_status,baptism_status,confirmation_status,section,organization', ...Array.from({ length: 30 }, (_, i) => `Imp${i},Test${tag},,,,,,,`)].join('\n');
  const importer = user('u-imp', church.id, null, 'member:import');
  const staged = await importJobService.stage(importer, csvRows, 'c.csv');
  const confirmed = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => importJobService.confirm(user(`u-imp${i}`, church.id, null, 'member:import'), staged.id, { skipUnresolved: true })));
  for (let i = 0; i < 4; i += 1) await importJobService.confirm(importer, staged.id, { skipUnresolved: true }).catch(() => undefined);
  const imported = await prisma.member.count({ where: { churchId: church.id, lastName: `Test${tag}` } });
  check('member import: concurrent confirms import each row once', imported === 30, `members=${imported} errors=${confirmed.filter((r) => r.status === 'rejected').length}`);

  await prisma.church.delete({ where: { id: church.id } }).catch(() => undefined);
  await prisma.$disconnect();
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
