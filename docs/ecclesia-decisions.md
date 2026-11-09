# Ecclesia decisions log

## Adopted defaults (reversible)

| Decision | Choice | Why |
|---|---|---|
| Mini-Conference | Not modelled as a hierarchy level | Guide §4.1: source does not establish it |
| Circuit status values | PENDING, ACTIVE, SUSPENDED, CLOSED; registration creates ACTIVE | No approval step specified; PENDING reserved |
| Circuit ID number | Upper-cased `[A-Z0-9/-]{2,40}`, globally unique, supplied by registrar | Issuing scheme unknown; legacy circuits keep NULL |
| Circuit registrar permission | `circuit:register`, must be granted explicitly | Church Administrators must not get higher-scope power. Note `prisma/seed.ts` gives the *local demo* admin every permission, including this one; do not copy that to production |
| Circuit audit location | AuditLog row under the acting user's church | `AuditLog.churchId` is required; revisit with ACCESS-1 |
| Retry safety | `Idempotency-Key` header stored as unique `registrationKey` | Prevents duplicate Circuits on resubmit |

| Scoped grant inheritance | A grant covers its scope and everything below, never above | Oversight roles need downward reach; guide forbids upward leaks |
| Grant freshness | Active grants read from DB per request, not baked into JWT | Guide §8.1: revoked authority must not survive in old tokens. Cost: one query per scoped check |
| Global bootstrap | `access:assign:global` (JWT permission) may assign anywhere, no subset check, still no self-assignment | Someone must create the first Conference/District grants. Hand it out sparingly |
| Role home | A scoped grant reuses a `Role`; the role's church must lie inside the granted scope | Avoids a parallel permission-bundle table now; a scope-level role catalogue is a later refactor |
| Manual grant key | `sourceId` is `''` for MANUAL | MySQL unique indexes ignore NULLs, so NULL would allow duplicates |

| Circuit Secretary bootstrap | Owner chose: registration requires a first church / preaching point; the Secretary's role lives there | Roles need a home church |
| Secretary access | Church-level `LeadershipAssignment` (works with today's JWT endpoints) + CIRCUIT-scoped grant on invitation accept. Permission whitelist in `types/circuit.ts` has no finance, journal, approval or `access:*` | Guide §4.3/§8.2 |
| Secretary identity | New Member in the first church; registration refuses an email already used by a member or account | Never auto-link by name/email; moving an existing member between churches is a separate (transfer) workflow |

| Onboarding steps | DETAILS, STRUCTURE (derived), MEMBERSHIP, LEADERSHIP, ACCESS; mandatory steps are all five | Guide §4.4 checklist; configurable mandatory set is a later option |
| "Done" rule | Derived step: data present. Confirm step: prerequisites hold now AND Secretary confirmed. A confirmation goes stale if data later vanishes | Visiting a page never completes anything |
| Counts exclude the Secretary | The circuit's first Secretary (invitation member) does not count toward membership/leadership | Otherwise a fresh circuit would look populated |
| Onboarding permission | New `circuit:onboard` (in Secretary role); checked by scoped grant only, no JWT fallback | Registrar (`circuit:register`) can see nothing unless also granted view/onboard at the circuit |

| Import mode | Explicit partial success: good rows commit, rejected rows are reported/downloadable, committed rows are never rolled back; each 100-row batch is atomic | Guide §5.4; large registers should not be all-or-nothing on one typo |
| Import is create-only | No update-existing mode | Guide §5.3 default |
| Candidate rules | Same full name, or same phone + same first name or surname, or same email = REVIEW. Same phone alone = warning | Families share numbers; names alone are not identity |
| Sacrament columns | `baptism_status`/`confirmation_status` validated (YES/NO/UNKNOWN) and kept on the staged row, not written | Sacrament records need date/officiant; do not fabricate |
| Phone handling | Strings only; spaces/dashes/brackets removed, `00` becomes `+`; no country inferred; 9–10 digit numbers without 0/+ get a "leading zero dropped?" warning | No country configuration exists in the repo |
| Unknown section/organisation | Row rejected; never created from CSV text | Guide §5.2 |
| Staged data retention | Cancel deletes the staged rows; completed jobs keep raw rows (needed for the problems report). A retention/purge rule is not set | Needs owner policy |

| Position ≠ permission | A position grants nothing until an administrator maps it to a Role (`leadership:position:manage`) | Guide §3 |
| Privileged appointments | Any appointment whose position is mapped is created PENDING (even if the CSV says ACTIVE) and must be approved by a different person with `leadership:appointment:approve` | Crafted CSV cannot grant access by itself; segregation of duties |
| Unmapped positions | Import as ACTIVE directly (register entry only, no access) | No approval needed for a title that carries no power |
| Occupancy | All positions allow several holders by default; `allowMultiple=false` can be set per position and then blocks overlapping holders | Guide §20: no blanket single-holder rule |
| Term boundary | `termEnd` stored as exclusive UTC instant; CSV/UI end date is inclusive and becomes the next UTC day 00:00 | Guide §7.1. UTC, not church-local time; revisit if a local time zone is configured |
| Statuses via CSV | ACTIVE, PENDING, ENDED accepted; REVOKED refused (revoke in the app, with a reason) | Revocation must be explicit and audited |
| Person matching | member_number exact; otherwise exact name (phone narrows ties). Several matches → REVIEW with explicit `USE:<id>` choice; none → rejected; people are never created | Guide §7.2 |
| Committee / department | `committee_or_board` must name an existing Committee; `department` is free text | No Department entity exists |
| Grants timing | Grants are created when a privileged appointment is approved, and again when the member's account is created (invitation accepted). A member who gets an account by another route needs a re-sync (not built) | Only the invitation path is hooked |

| Session states | OPEN, SUBMITTED, REJECTED (correction required), RECONCILED; legacy CLOSED rows untouched | Guide §11.4 |
| Expected cash | Opening float (session currency) + CASH receipts attached to this session − cash paid out; per currency; non-cash methods listed separately, never counted | Guide §11.3 |
| Posting | Approval/handover records custody only and writes no journal; income is recognised once, when the receipt is recorded | Guide §10.5 default. Confirm with the owner if existing policy defers posting |
| Self-review | Blocked if the reviewer is the cashier (member), or the login that submitted | Guide §8.1 |
| Reviewer independence | Reviewer must type the cash received per currency; a difference needs a note and is recorded on the approval | Guide §12.1 |
| Overlapping sessions | One OPEN session per cashier; other cashiers and sessions awaiting review never block opening | Guide §11.4 |
| Legacy close | Still allowed by default for compatibility; set SystemSetting `finance.cash_session.review_required` = true to force the review path | Avoids breaking current users. A production church should turn this on |

| Church receipt numbers | Format `CH-YYYY-NNNNNN` kept; counter is `ReceiptSequence` per church per year, first value continues after the highest existing number; uniqueness is now per church, not global | The old global unique index plus a per-church counter made a second church's first receipt collide |
| Receipt retries | Optional `Idempotency-Key` header; same key + same payment returns the original (HTTP 200, `replayed: true`); same key + different payment is 409 | Guide §11.1. Callers that send no key keep today's behaviour, so double-clicks are not protected until the UI sends a key |
| Transaction reference | Now stored on the receipt (`reference`), not unique | Provider semantics unknown; guide §11.1 says enforce only where real |
| Receipt currency | Must be a 3-letter code, upper-cased | Guide §11.1 |

## Unresolved business decisions

- Meaning of "bi-annually" for section audits (twice a year vs every two years). No audit scheduling built.
- Whether accounting posts at receipt time or handover approval (guide default: at receipt, once).
- Whether new cash sessions may open while earlier ones await review.
- Approval limits, budget-overspend behaviour, non-member giving policy.

## Deposits are movements, not income
A cash deposit debits 1100 Bank and credits 1000 Cash. Income was already recognised per receipt, so a deposit never touches revenue. Recorder and verifier must differ; `bankReference` is unique per church to stop the same slip being entered twice. Open: whether deposits should be tied to specific cash sessions (currently matched only in aggregate per currency) and whether bank-statement import is wanted.

## Global receipt counters reuse ReceiptSequence
Circuit/district/section receipt numbers stay globally unique, so their counter is global per prefix and year, stored in `ReceiptSequence` with `churchId = 'GLOBAL:CIR|DST|SEC'` (the column has no foreign key). Avoids a migration; accepted trade-off: a failed insert burns a number.

## Preview is a reduced copy of the admin's own session
View-As returns a token for the same user and session with only read permissions and no member link, valid 15 minutes. It never signs in as another person. Read-only is enforced in `authenticate`, so no route can forget it. A role's read permissions are those ending `:view`, `:view:all`, `:report`, `:read`; other GET routes (for example exports) are not granted.

## Sensitive profile fields go through review
Date of birth, gender and marital status change only after a different person approves, and only if the stored value is unchanged since the request. Contact details stay self-service. Which fields need review is fixed in code (`REVIEWED_FIELDS`), not configurable yet.

## Fund balances mix currencies
`fundService.list` (existing rule) adds all currencies together. The Treasurer overview shows it with a warning rather than hiding it. Fixing this needs a per-currency fund model.

