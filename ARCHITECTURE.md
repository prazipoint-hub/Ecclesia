# Ecclesia Architecture

## Philosophy

Ecclesia is a **member-centric**, **permission-driven** church management platform. Every person is fundamentally a **Member**, and all roles, responsibilities, and access derive from the member record.

---

## Core Architectural Principles

### 1. Account-First Model

**One person = One member record**

```
Member (person)
  ├── Leadership (positions, roles)
  ├── Organization Membership (fellowships, committees)
  ├── Section Assignment (geographical/functional grouping)
  ├── Permissions (granular capabilities)
  └── Financial Activity (giver, steward, receiver)
```

- A pastor is a member who holds a pastoral leadership role
- A treasurer is a member with financial permissions
- A youth leader is a member in the UMYF organization
- **No separate "pastor account" or "admin account"** — all access flows through the member + permissions model

### 2. Multi-Tenancy with Strict Scoping

Every church is an isolated tenant. **Every operation must enforce `churchId`.**

```typescript
// Example: Service layer enforces church scoping
if (data.churchId !== user.churchId && !user.permissions.includes('member:create:all_churches')) {
  throw new Error('Unauthorized: cannot create member in another church');
}
```

- Cross-church operations require explicit permissions (e.g., `member:create:all_churches`, `statistics:view:all_churches`)
- Database queries must include `where: { churchId }` before executing
- Never assume user's church — always validate against `user.churchId`

### 3. Role-Based Access Control (RBAC)

**Roles = Collections of granular permissions**

Permissions follow a hierarchical naming convention:

```
{resource}:{action}
{resource}:{action}:{scope}
```

#### Example Permission Set

```
# Member operations
member:view
member:create
member:update
member:delete
member:create:all_churches      # Cross-tenant

# Membership (lifecycle, status changes)
membership:status:request        # Request status change
membership:status:approve        # Approve pending changes
membership:view

# Finance
finance:view                     # View own church finance
finance:view:section             # View section finance
finance:receipt:create           # Issue receipts
finance:expenditure:approve      # Approve expenditures
finance:journal:create           # Double-entry accounting

# Organization
organization:manage              # Create, update organizations
organization:member:add          # Add members to organizations

# Audit
audit:view                       # View audit logs
audit:review                     # Review and approve reversals

# Statistics
statistics:view                  # View own church statistics
statistics:view:all_churches     # Cross-tenant statistics
```

**Authorization boundary:** The service layer is the final authority. Controllers validate syntax; services enforce permissions.

### 4. Section Finance Isolation

Sections maintain **completely separate ledgers** from the main church.

```
Church Financials
├── Main Operating Account
│    ├── Receipts (church-wide offerings, tithes)
│    └── Expenditures (administrative, building, salaries)
│
├── Section A Financials (isolated)
│    ├── Section A Account
│    ├── Section A Receipts
│    └── Section A Expenditures
│
├── Section B Financials (isolated)
│    ├── Section B Account
│    ├── Section B Receipts
│    └── Section B Expenditures
```

**Critical rule:** A section transaction (receipt or expenditure) must always carry `sectionId`. It **cannot** be reclassified to the main church without explicit approval and a correcting entry.

### 5. Auditability and Historical Integrity

All sensitive mutations are **immutable and traceable**.

Every audit event records:

```typescript
{
  id: UUID,
  action: "MEMBER_CREATED" | "STATUS_CHANGED" | "RECEIPT_ISSUED" | "ROLE_ASSIGNED",
  entityType: "MEMBER" | "RECEIPT" | "EXPENDITURE" | "ROLE",
  entityId: UUID,
  actorId: UUID,                    // Who performed the action
  churchId: UUID,                   // Tenant scoping
  timestamp: DateTime,
  previousState: JSON | null,       // Before (if applicable)
  newState: JSON,                   // After
  reason: string | null,            // Why (e.g., "Marriage ceremony")
  reference: string | null          // External reference (e.g., receipt #)
}
```

**Financial reversals** do not delete. Instead:

```
Original:  RECEIPT #001 | Amount: +1000 | Account Balance: +1000
Reversal:  RECEIPT #001-REV | Amount: -1000 | Account Balance: 0
           ↓
Result:    Account balance correctly returns to previous state
           Historical record intact for audit
```

### 6. Approval Before Mutation (Governance)

Where governance requires approval, the workflow is:

```
Request
  ↓
StatusChangeRequest (pending)
  ↓
Review & Approval
  ↓
APPROVED
  ↓
Effective State Change
```

**The database must not change effective state before approval.**

Example: Marriage Status Change

```typescript
// Step 1: Member reports marriage
StatusChangeRequest {
  memberId,
  previousStatus: "SINGLE",
  requestedStatus: "MARRIED",
  spouseId: UUID,
  requestedAt: now(),
  status: "PENDING"
}

// Step 2: Pastor reviews and approves
StatusChangeApproval {
  requestId,
  approvedBy: pastorId,
  approvedAt: now(),
  reason: "Marriage ceremony on 2026-09-15"
}

// Step 3: Status change takes effect
Member {
  id,
  membershipStatus: "ACTIVE",
  maritalStatus: "MARRIED"
}
```

---

## Directory Structure

### Project Layout

```
src/
├── app.ts                    # Express app initialization, middleware setup
├── server.ts                 # Server entry point
│
├── config/                   # Environment & configuration
│   ├── env.ts               # Validated env vars
│   ├── database.ts          # Database connection config
│   └── constants.ts         # App-wide constants
│
├── database/                 # Database utilities
│   ├── index.ts             # Prisma client export
│   └── migrations.ts        # Migration utilities (if needed)
│
├── middleware/               # Express middleware
│   ├── auth.ts              # JWT/session validation
│   ├── authorization.ts     # Permission checking
│   ├── validation.ts        # Request body validation
│   ├── errorHandler.ts      # Global error handling
│   └── logging.ts           # Pino logging setup
│
├── types/                    # Global types & interfaces
│   ├── auth.ts              # AuthRequest, AuthorizedUser
│   ├── errors.ts            # Error classes
│   └── common.ts            # Shared DTOs, enums
│
├── utils/                    # Shared utilities
│   ├── errorHandler.ts      # Error response formatting
│   ├── validators.ts        # Reusable validators
│   ├── permission.ts        # Permission checking helpers
│   └── audit.ts             # Audit logging helpers
│
├── features/                 # Feature modules (business domains)
│   ├── auth/
│   ├── members/
│   ├── families/
│   ├── membership/
│   ├── organizations/
│   ├── sections/
│   ├── leadership/
│   ├── events/
│   ├── attendance/
│   ├── pastoral/
│   ├── counseling/
│   ├── finance/
│   │   ├── types/
│   │   ├── controller/
│   │   ├── service/
│   │   ├── repository/
│   │   ├── routes/
│   │   └── section/          # Section-specific finance submodule
│   │       ├── types/
│   │       ├── controller/
│   │       ├── service/
│   │       ├── repository/
│   │       └── routes/
│   ├── projects/
│   ├── tickets/
│   ├── assets/
│   ├── hr/
│   ├── reporting/
│   ├── notifications/
│   └── audit/
│
└── prisma/
    ├── schema.prisma        # Database schema
    └── seed.ts              # Seeding script
```

### Feature Module Structure

Every feature follows the same layered pattern:

```
feature/
├── types/
│   └── index.ts             # Zod schemas, type definitions
��
├── controller/
│   └── index.ts             # HTTP request handlers (thin layer)
│
├── service/
│   └── index.ts             # Business logic, auth checks, audit
│
├── repository/
│   └── index.ts             # Database queries via Prisma
│
└── routes/
    └── index.ts             # Route definitions, middleware chains
```

---

## Request Flow

```
Client (HTTP)
  │
  └─→ Express Server
       │
       └─→ Middleware Pipeline
            ├── Authentication (verify JWT/session)
            ├── CORS, Security Headers (helmet)
            ├── Request logging (pino)
            └── Body parsing (JSON)
            │
            └─→ Route Matching
                 │
                 └─→ Controller
                      ├── Parse & validate request schema (Zod)
                      ├── Extract params, query, body
                      └─→ Call Service
                           │
                           └─→ Service
                                ├── Check user permissions
                                ├── Validate business rules
                                ├── Enforce tenant scoping (churchId)
                                ├── Execute core logic
                                ├── Call Repository
                                │    └─→ Prisma
                                │         └─→ PostgreSQL
                                ├── Log audit event
                                └─→ Return data
                      │
                      └─→ Format response (controller)
                      │
                      └─→ Send JSON
                      │
Error anywhere
  └─→ Global Error Handler
       ├── Log error
       ├── Format error response
       └─→ Send (401 | 403 | 400 | 500)
```

---

## Data Model: The Core Relationship

```
Circuit (denomination/umbrella)
  │
  └─→ Church (tenant)
       │
       ├─→ Sections (geographical or functional units)
       │    │
       │    └─→ Families (member groupings)
       │         │
       │         └─→ Members (person)
       │              └─→ Leadership Assignments
       │              └─→ Permissions
       │              └─→ Financial Activity
       │
       ├─→ Organizations (MUMC, RRW, UMYF, etc.)
       │    │
       │    └─→ Organization Membership
       │         └─→ Member (person)
       │
       ├─→ Committees (governance bodies)
       │    │
       │    └─→ Leadership Assignments
       │         └─→ Member (person)
       │
       └─→ Finance
            ├─→ Main Ledger (church-wide)
            │    ├─→ Accounts
            │    ├─→ Receipts
            │    └─→ Expenditures
            │
            └─→ Section Ledgers (isolated)
                 ├─→ Section A Ledger
                 ├─→ Section B Ledger
                 └─→ Section C Ledger
```

---

## My Account vs Church Tools

This distinction shapes the entire UX and feature set:

### My Account (Member-Personal)

The member's own space for personal and spiritual information:

```
My Account
├── Profile
│    ├── First name, last name, contact
│    ├── Gender, date of birth
│    └── Photo, bio
│
├── Family
│    ├── Spouse
│    ├── Children
│    └── Family relationships
│
├── Spiritual Life
│    ├── Membership status
│    ├── Join date
│    └── Spiritual notes (private)
│
├── Financial Activity
│    ├── Giving history (my tithes, offerings)
│    ├── Pledges
│    └── Receipts
│
├── Notifications
│    └── Personal events, updates
│
└── Personal History
     └── Membership events, status changes
```

### Church Tools (Operational/Administrative)

The professional interface for managing church operations. Access granted by role/permission:

```
Church Tools
├── Membership (admin, leaders)
│    ├── List members
│    ├── Create, update, delete
│    ├── Manage dependants
│    └── View statistics
│
├── Sections (section leaders)
│    ├── Manage section members
│    ├── Section finance (isolated)
│    └── Section events
│
├── Organizations (organization presidents/treasurers)
│    ├── Manage fellowship membership
│    ├── Assign positions
│    └── Organization finance
│
├── Finance (treasurer, finance committee)
│    ├── Receipts & Offerings
│    ├── Expenditures & Approvals
│    ├── Cash sessions
│    └── Financial reports
│
├── Events (event coordinator)
│    ├── Create events
│    ├── Manage attendance
│    └── Generate attendance reports
│
├── Pastoral Care (pastors)
│    ├── Visit tracking
│    ├─�� Counseling notes
│    ├── Prayer requests
│    └── Spiritual development tracking
│
├── Committees (committee chairs)
│    ├── Manage committee members
│    ├── Meeting minutes
│    └── Committee decisions
│
├── Reports (statistician, admin)
│    ├── Financial reports
│    ├── Membership reports
│    ├── Attendance reports
│    └── Custom reports
│
└── Admin (head pastor, senior leadership)
     ├── User management
     ├── Role & permission assignment
     ├── Audit logs
     └── System configuration
```

**Key insight:** A pastor doesn't log in to a separate "pastor dashboard." The pastor logs in to their member account and accesses **Church Tools → Pastoral** based on their permissions.

---

## Database Domains (Conceptual Organization)

The schema is organized into 9 logical domains that align with business concepts:

### Domain 1: Identity & Sessions

```
User (login credentials, authentication)
  └── Session (active sessions, refresh tokens)
```

**Purpose:** Authentication layer. Separate from member for flexibility (e.g., spouse may use same device, login as different member).

---

### Domain 2: Core Membership

```
Member (person)
  ├── Gender, date of birth, contact info
  ├── Membership number (auto-generated: M{YEAR}{COUNTER})
  ├── Membership status (ACTIVE, INACTIVE, TRANSFERRED, DECEASED)
  ├── Is dependent (child under parental supervision)
  └── Parent ID (nullable, if dependent)
```

**Purpose:** The central person record. All roles attach here.

---

### Domain 3: Organization

```
Church (tenant root)
  └── Circuit (denomination/umbrella, if multi-church)

Section (geographical or functional subdivision)
  └── Family (member grouping within section)

Organization (fellowship: MUMC, RRW, UMYF, Children Ministries)
  └── Organizational Membership
```

**Purpose:** Structural hierarchy and grouping.

---

### Domain 4: Leadership & Permissions

```
Role
  └── RolePermission (collections of permissions)

Permission (granular capability: member:create, finance:view, etc.)

Leadership Assignment (person holds role at scope)
  └── Member
  └── Church | Organization | Section | Committee
  └── Position (e.g., Treasurer, Pastor, President)
  └── Date range (start, end)

Organization Role Assignment
  └── Member
  └── Organization
  └── Position
  └── Date range
```

**Purpose:** RBAC. Permissions determine what a user can do.

---

### Domain 5: Events & Attendance

```
Event
  ├── Church, Organization, or Section scoped
  ├── Date, time, location
  ├── Expected attendance count
  └── Status (SCHEDULED, ONGOING, COMPLETED, CANCELLED)

Event Attendance
  ├── Event ID
  ├── Member ID
  └── Status (PRESENT, ABSENT, EXCUSED)

Event Participant (optional detailed role)
```

**Purpose:** Track meetings, services, gatherings and participation.

---

### Domain 6: Finance (Main Church Ledger)

```
Financial Account
  ├── Church ID (tenant)
  ├── Opening balance
  ├── Current balance
  └── Status (ACTIVE, INACTIVE)

Fund (categorized bucket: Building Fund, Missions, etc.)
  ├── Financial Account
  ├── Name
  └── Balance

Receipt (income transaction)
  ├── Fund ID
  ├── Member ID (giver, if applicable)
  ├── Amount, currency
  ├── Income type (OFFERING, TITHE, DONATION, FUNDRAISING)
  ├── Payment method (CASH, BANK_TRANSFER, MOBILE_MONEY, CHEQUE)
  ├── Receipt number (auto-generated)
  └── Status (ISSUED, VOIDED, REVERSED)

Expenditure (expense request)
  ├── Fund ID
  ├── Amount, purpose, category
  ├── Requested by (member)
  ├── Status (DRAFT, SUBMITTED, APPROVED, REJECTED, PAID)
  ├── Approved by (if applicable)
  └── Approval date (if applicable)

Cash Session
  ├── Opening balance, closing balance
  ├── Session date
  └── Handled by (member)
```

**Purpose:** Double-entry accounting. Record financial flows at the church level.

---

### Domain 7: Section Finance (Isolated Ledger)

```
Section Financial Account (isolated from main church)
  ├── Section ID
  ├── Church ID (for context)
  ├── Opening balance
  ├── Current balance
  └── Status

Section Receipt (section-scoped income)
  ├── Section ID
  ├── Member ID (giver, if applicable)
  ├── Amount, income type, payment method
  └── Status (ISSUED, VOIDED, REVERSED)

Section Expenditure (section-scoped expense)
  ├── Section ID
  ├── Amount, purpose
  ├── Requested by (member)
  ├── Status (DRAFT, SUBMITTED, APPROVED, REJECTED, PAID)
  └── Approval details

Section Journal Entry (double-entry per transaction)
  ├── Section ID
  ├── Debit amount, credit amount
  ├── Posted at (date)
  └── Reference
```

**Critical rule:** Every section transaction is scoped by `sectionId`. A section receipt cannot be moved to main church finance without explicit approval and a correcting entry.

---

### Domain 8: Pastoral Care

```
Pastoral Visit
  ├── Member ID (visited)
  ├── Visited by (member, pastor)
  ├── Visit date, time
  ├── Notes
  └── Follow-up required (boolean)

Counseling Conversation
  ├── Member ID (counseled)
  ├── Counselor ID (member, pastor)
  ├── Conversation date
  ├── Topic, notes
  ├── Status (IN_PROGRESS, COMPLETED, REFERRED)
  └── Follow-up plan
```

**Purpose:** Track spiritual care and support.

---

### Domain 9: Audit & Status Management

```
Audit Log (immutable)
  ├── Entity (MEMBER, RECEIPT, EXPENDITURE, ROLE)
  ├── Action (CREATED, UPDATED, DELETED, APPROVED, REVERSED)
  ├── Actor (who performed it)
  ├── Timestamp
  ├── Previous state (JSON)
  ├── New state (JSON)
  ├── Reason (nullable)
  └── Reference (e.g., approval ID)

Status Change Request
  ├── Member ID
  ├── Previous status
  ├── Requested status
  ├── Reason (e.g., marriage, transfer, deceased)
  ├── Requested at
  └── Status (PENDING, APPROVED, REJECTED)

Status Change Approval
  ├── Request ID
  ├── Approved by (member, pastoral authority)
  ├── Approved at
  ├── Reason/notes
  └── Effective date (when change applies)
```

**Purpose:** Complete historical traceability and approval workflows.

---

## Development Workflow

### Adding a New Feature

1. **Define the domain** — What business concept does it represent?
2. **Add to database schema** (`prisma/schema.prisma`)
   - Include `churchId` if church-scoped
   - Include `sectionId` if section-scoped
   - Include `createdAt`, `updatedAt` for audit
3. **Create feature directory** under `src/features/{feature}`
4. **Define types** (`types/index.ts`)
   - Zod schemas for input validation
   - TypeScript interfaces for output
5. **Implement repository** (`repository/index.ts`)
   - Database queries via Prisma
   - No business logic, no auth checks
6. **Implement service** (`service/index.ts`)
   - All business rules and validation
   - Permission checks (final authorization boundary)
   - Tenant/section scoping
   - Audit logging
7. **Implement controller** (`controller/index.ts`)
   - Parse request (Zod validation)
   - Call service
   - Format response
8. **Define routes** (`routes/index.ts`)
   - Mount in main Express app
9. **Write tests**
   - Unit: business rules (service layer)
   - Integration: database operations (repository + service)
   - API: HTTP workflows (controller + service + repository)

### Permissions Checklist

When implementing a new feature:

- [ ] Define permission names (e.g., `feature:action`, `feature:action:scope`)
- [ ] Document in service layer which permissions are required
- [ ] Add permission checks in every mutation operation
- [ ] Log audit events for sensitive changes
- [ ] Enforce `churchId` scoping in all queries
- [ ] Consider `sectionId` scoping if applicable
- [ ] Add tests verifying authorization (deny and allow cases)

### Testing

```bash
# Unit tests (Vitest)
npm test feature/members/service

# Integration tests (Vitest + Prisma)
npm test feature/members/repository

# API tests (Supertest)
npm test feature/members/controller

# Coverage
npm run test:coverage
```

---

## Common Patterns

### Service Layer Authorization Template

```typescript
export class MyFeatureService {
  async doSomething(id: string, user: AuthorizedUser): Promise<Result> {
    // Step 1: Check permission
    if (!user.permissions.includes('myfeature:doSomething')) {
      throw new UnauthorizedError('myfeature:doSomething permission required');
    }

    // Step 2: Fetch the entity
    const entity = await repository.findById(id);
    if (!entity) {
      throw new NotFoundError(`Entity not found: ${id}`);
    }

    // Step 3: Enforce tenant scoping
    if (entity.churchId !== user.churchId && !user.permissions.includes('myfeature:doSomething:all_churches')) {
      throw new UnauthorizedError('Cannot access entity in another church');
    }

    // Step 4: Execute business logic
    const result = await repository.update(id, { /* changes */ });

    // Step 5: Audit
    await auditLog({
      action: 'MYFEATURE_CHANGED',
      entityType: 'MyFeature',
      entityId: id,
      actorId: user.id,
      churchId: entity.churchId,
      previousState: entity,
      newState: result,
    });

    return result;
  }
}
```

### Permission Check Helper

```typescript
// utils/permission.ts
export function requirePermission(
  user: AuthorizedUser,
  permission: string,
  context?: { churchId?: string; sectionId?: string }
): void {
  if (!user.permissions.includes(permission)) {
    throw new UnauthorizedError(`${permission} permission required`);
  }

  // If context provided, validate scoping
  if (context?.churchId && context.churchId !== user.churchId) {
    throw new UnauthorizedError(`Cannot access another church without permission`);
  }
}
```

### Audit Log Helper

```typescript
// utils/audit.ts
export async function logAudit(data: {
  action: string;
  entityType: string;
  entityId: string;
  actorId: string;
  churchId: string;
  previousState?: any;
  newState: any;
  reason?: string;
  reference?: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      id: uuidv4(),
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      actorId: data.actorId,
      churchId: data.churchId,
      previousState: data.previousState ? JSON.stringify(data.previousState) : null,
      newState: JSON.stringify(data.newState),
      reason: data.reason,
      reference: data.reference,
      timestamp: new Date(),
    },
  });
}
```

---

## Summary

This architecture ensures:

✅ **One source of truth:** Member is the core identity  
✅ **Clear authorization:** Permissions checked at service boundary  
✅ **Tenant isolation:** Every query enforces churchId  
✅ **Financial integrity:** Separate ledgers, immutable transactions  
✅ **Auditability:** Every change is traceable  
✅ **Governance:** Approvals precede mutations  
✅ **Scalability:** Modular features, consistent patterns  
✅ **Developer clarity:** Feature structure is predictable  

