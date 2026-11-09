# Implementation progress

## Done
- Phase 0: repo inspected, baseline recorded (911 tests pass, tsc clean), gap assessment written.
- Phase 2 (partial): Circuit registration API.
  - `prisma/schema.prisma` Circuit: `identificationNumber`, `location`, `status`, `registeredAt`, `registeredBy`, `registrationKey`.
  - `prisma/migrations/0014_circuit_registration/migration.sql` (additive).
  - `src/features/hierarchy/{types,service,controller,routes}` : register / list / status.
  - Server re-validates District ⊂ Conference; unique ID number; idempotent retry; race on unique index returns the winner; status transitions compare-and-set.
  - Tests: `tests/circuit-registration.spec.ts` (8 tests).

- ACCESS-1 (partial): scoped role assignments.
  - `ScopedRoleAssignment` + `prisma/migrations/0015_scoped_role_assignments`.
  - `src/features/access/service/scope.ts`: ancestor chain (org/section → church → circuit → district → conference), active-grant query (start ≤ now < end, not revoked), `can()`.
  - `src/features/access/service/assignments.ts` + `routes`: assign, revoke, `/me/contexts`.
  - Rules: assigner needs `access:assign` at a covering scope; cannot grant permissions they lack; no self-assignment; role must be defined inside the scope; idempotent; revoke is compare-and-set; both audited.
  - Circuit register/status/list now authorise through scoped grants (JWT `circuit:*` still honoured as the legacy global path).
  - Tests: `tests/scoped-access.spec.ts` (8), circuit spec extended.

- ORG-3 (partial): Secretary bootstrap. `registerCircuit` now requires `firstChurch` + `secretary`, and in one DB transaction creates circuit, church, `Circuit Secretary` role (+permissions that exist), member, church leadership assignment and a hashed single-use invitation with a scoped-grant payload (migration 0016). Email is sent after commit; failure is logged and the registrar can resend. Accepting the invitation creates the account and the CIRCUIT grant in one statement.

- ORG-4 (partial): onboarding checklist API. Schema `CircuitOnboardingStep` + `Circuit.onboardedAt/By` (migration 0017). Completion is compare-and-set and retry-safe; confirm is an idempotent upsert; both audited. Tests: `tests/circuit-onboarding.spec.ts` (10).

- MEM-1..4 (partial): staged membership import (`src/features/members/service/importJobs.ts`, `importTemplate.ts`, routes under `/api/v2/members/import-jobs`, migration 0018). Tests: `tests/member-import-jobs.spec.ts` (21).

- LEAD-1/2 (partial): catalogue, appointments with derived scoped grants, leadership CSV import. Files: `src/features/leadership/service/{catalogue,appointments,leadershipImport}.ts`, `routes/register.ts` (mounted at `/api/v2/leadership-register`), migration 0019. Onboarding's leadership step now also counts approved, in-force appointments. Tests: `tests/leadership-register.spec.ts` (23).
- Found and fixed while testing: an invalid calendar date (e.g. 2026-13-01) crashed the importer with a 400 "Invalid time value" instead of a row error.

- POS review (partial): cash session submit/review/approve/reject, `accounting/service/cashReview.ts`, routes under `/api/v2/accounting/cash-sessions`, migration 0020. Tests: `tests/cash-session-review.spec.ts` (19) + 1 in `finance-legacy-main.spec.ts`.

- Receipt integrity (partial, church receipts only): atomic numbering, per-church uniqueness, idempotency key, stored reference, receipt+audit in one transaction (`finance/main/service/index.ts`, migration 0021). 9 new tests in `tests/finance-legacy-main.spec.ts`.
- Treasurer deposits and overview (partial): `Deposit` (migration 0022) records cash moved to the bank, PENDING → VERIFIED/REJECTED by a different person. Verify posts Dr 1100 Bank / Cr 1000 Cash in the same transaction as the compare-and-set (no income). `GET /api/v2/accounting/treasurer/overview` shows approved (RECONCILED) vs pending (SUBMITTED) cash and deposits per currency, never combined (`accounting/service/deposits.ts`, `tests/deposits.spec.ts`, 12 tests). Not verified against MySQL. No web UI; no bank-statement import or matching; mobile money/bank receipts not reconciled; fund balances not in the overview.
- Circuit/district/section receipt numbering (partial): atomic counter per prefix/year in `ReceiptSequence` under key `GLOBAL:<prefix>`, continuing after the highest legacy number; P2002 on the number takes the next one (`finance/shared/receiptNumber.ts`, `tests/scoped-receipt-numbers.spec.ts`, 4 tests; 3 older tests updated). No migration needed. Failed creates leave gaps in the sequence. Mock-tested only.

## Not done (see gap assessment)
Enforcing scoped grants outside circuits, web switcher/View-As, Secretary bootstrap, onboarding checklist, web UI for any of this, import hardening, leadership
import/catalogue, POS session state machine, accounting scope work, dashboards/preview, reporting checks.

## Not verified
Migration 0014 was **not** applied to a MySQL instance (none available here). No browser/UI check was possible because no UI was added.
