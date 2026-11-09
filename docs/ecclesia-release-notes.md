# Release notes (unreleased)

## Migration order
1. Back up the database.
2. `npm run db:migrate:deploy` applies `0014_circuit_registration` (adds nullable/defaulted columns + two unique indexes; existing circuits unchanged, status defaults to ACTIVE).

2. Then `0015_scoped_role_assignments` (new table only; no existing data touched).

3. Then `0016_invitation_scoped_grant` (three nullable Invitation columns).

4. Then `0017_circuit_onboarding` (new table + two nullable Circuit columns).

5. Then `0018_member_import_jobs` (two new tables).

6. Then `0019_positions_appointments` (adds `kind` to `MemberImportJob`, two new tables).

7. Then `0020_cash_session_review` (new columns on CashSession and Receipt, one new table). Existing sessions keep OPEN/CLOSED.

8. Then `0021_receipt_numbering`. It drops the global unique index on `Receipt.receiptNumber` and adds per-church uniqueness. Before applying, confirm no code or report outside this repo looks a receipt up by number alone.
9. Then `0022_deposits`. Additive: one new `Deposit` table. New permissions `finance:deposit:record` and `finance:deposit:verify` must be seeded and granted (Treasurer records; a different person verifies).

## Configuration
Send a fresh `Idempotency-Key` (8-128 chars, e.g. a UUID generated when the form opens) with every church receipt POST so double-clicks and retries cannot create a second receipt.
Add permission `finance:cash_session:review` and give it to the Chief Recording Secretary role only (not to cashiers). To stop cashiers closing their own sessions directly, set SystemSetting `finance.cash_session.review_required` to `true` for the church. Existing cash receipts are not attached to any session (cashSessionId stays NULL); only receipts recorded after release are.
Add permission rows: `leadership:import`, `leadership:position:view`, `leadership:position:manage`, `leadership:appointment:view`, `leadership:appointment:manage`, `leadership:appointment:approve`. Give `approve` to someone other than whoever imports. Positions grant no access until mapped to a role.
Add the `circuit:onboard` permission row before registering circuits (seed does this locally); the Secretary role includes it only if the row exists.
The `Circuit Secretary` role is built from permission rows that must already exist (`prisma/seed.ts` list); missing ones are silently skipped, so confirm `member:import` etc. exist in production before registering a circuit.
Hand out `access:assign:global` only to the platform owner; everyone else is granted `access:assign` via a scoped role.
Grant `circuit:register` (and `circuit:view` / `circuit:view:all`) only to the Conference/District-level role that may register circuits. Permission rows are created by `prisma/seed.ts` for local use; in production add them via the admin role tools.

## Recovery
0022: drop `Deposit` only if none is VERIFIED; verified ones have `source = 'DEPOSIT'` journal entries that must be reversed first.
0021: recreate the global unique index on receiptNumber (fails if two churches now share a number), drop the new indexes/columns and `ReceiptSequence`.
0020: drop `CashSessionEvent`, the new CashSession columns and `Receipt.cashSessionId` (review history is lost).
0019: drop `Appointment`, `PositionDefinition` and `MemberImportJob.kind` (appointments and mappings are lost; derived scoped grants must be revoked first).
0018: drop tables `MemberImportRow` then `MemberImportJob` (staged imports lost; created members stay).
0017: drop table `CircuitOnboardingStep` and the two Circuit columns.
0016: drop the three columns (pending secretary grants are lost).
0015: `DROP TABLE ScopedRoleAssignment` (loses scoped grants made after release).
Migration is additive. To roll back, drop the two indexes then the six columns; circuits registered after the migration lose their registration metadata.

## Not production-verified
Migration not run against MySQL in this session.
