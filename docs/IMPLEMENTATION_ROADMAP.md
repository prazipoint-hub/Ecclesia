# Ecclesia completion roadmap

## Product outcome

Ecclesia is a secure, multi-tenant church ERP in which a person is a member
first and every leadership responsibility, operational workflow, and financial
action is scoped, authorised, auditable, and usable from the web application.

## Non-negotiable rules

- Tenant boundaries are enforced by the service layer and database queries.
- Permissions come from persisted roles and assignments; no user receives a
  hard-coded permission bundle.
- Finance is append-only: corrections use reversals, never destructive edits.
- Governance changes take effect only after their required approval.
- Counselling and other pastoral data have separate, more restrictive access.
- Every delivered workflow includes API validation, authorisation, audit data,
  a web path, and automated proof.

## Canonical hierarchy to implement

The current backend and web client describe different portions of the church
hierarchy. The working model for the migration is:

```
Conference -> District -> Circuit -> Church -> Section
                                      ├-> Organizations / SBUs
                                      └-> Committees
```

Members belong to a church and may additionally belong to a section, family,
organization, committee, or leadership assignment. A hierarchy migration must
preserve existing `Circuit -> Church -> Section` data before the new levels are
enabled.

## Releases

### R0 — Stabilise the current baseline

- [ ] Reconcile documentation with MySQL, Node 22, Vite, and `/api/v2`.
- [x] Establish a non-watch test command.
- [x] Add consistent application errors and request validation.
- [ ] Add structured logging.
- [ ] Document environment, seed data, local startup, backup, and deployment.

### R1 — Identity, hierarchy, and access control

- [x] Persist role permissions and resolve them at login/token refresh.
- [x] Implement member-first registration, logout, refresh-token rotation,
      and server-side session revocation.
- [ ] Implement invitations, password reset, device revocation, and production
      secret checks.
- [x] Add the Conference → District → Circuit hierarchy expansion and a
      scoped read workspace. Applying the migration remains an operator task.
- [x] Replace the client-side sample hierarchy with scoped server data.
- [ ] Add audit records for access and hierarchy administration.

### R2 — People, membership, and governance

- [ ] Complete member profile, family, dependent, search, import, and archival
      workflows.
- [ ] Complete membership requests, approval history, transfers, deceased and
      inactive workflows.
- [ ] Implement leadership terms, appointments, succession, and handover.
- [ ] Implement organizations, SBUs, committees, nominations, and confirmed
      office assignments.

### R3 — Ministry operations

- [x] Implement church events, programmes, and attendance check-in.
- [ ] Add event registrations and absence follow-up policy/workflows.
- [ ] Deliver section, circuit, district, and conference dashboards using live
      data.
- [ ] Implement notifications, announcements, reminders, and user preferences.

### R4 — Finance and controls

- [ ] Finish chart of accounts, funds, opening balances, journals, and
      double-entry posting.
- [ ] Deliver receipts, offerings/POS, cash sessions, expenditures, approvals,
      payments, reversals, budgets, and reconciliation.
- [ ] Enforce independent ledgers and approval rules at church, section,
      circuit, and district scope.
- [ ] Provide finance dashboards, exports, audit trails, and period controls.

### R5 — Pastoral care

- [x] Expose pastoral cases through authorised service,
      controller, route, and web layers.
- [ ] Implement visits, counselling, prayer, referrals, follow-ups, life
      events, sacraments, assessments, and pastoral dashboards.
- [ ] Enforce the L1–L4 pastoral sensitivity model with access justification
      and audit logging.

### R6 — Reporting, administration, and readiness

- [x] Generate actual CSV, XLSX, and PDF reports; remove placeholder exports.
- [ ] Implement operational, financial, attendance, pastoral, and audit report
      catalogues with saved filters and scoped visibility.
- [ ] Add settings, data-retention rules, export/import, backup/restore
      procedures, monitoring, and production deployment documentation.
- [ ] Reach feature-level API, integration, and UI test coverage for every
      completed workflow.

## Definition of done for each workflow

1. Schema and migration preserve existing data.
2. Input is validated and business rules live in the service layer.
3. Tenant scope and permission checks are exercised by tests.
4. Mutations create appropriate audit records.
5. The web client has loading, empty, error, and success states.
6. API and UI tests pass, and documentation names the actual endpoint.

## Current first implementation slice

R1 is the first slice because every later module needs trustworthy identity,
permissions, hierarchy, and scoped workspace data. Existing uncommitted work
already starts the login, seed, CORS, and route wiring needed for this slice;
it will be preserved and completed rather than replaced.
