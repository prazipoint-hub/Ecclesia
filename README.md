# Ecclesia v2.0 — Church Management ERP Platform

A comprehensive, permission-driven church management and administration platform built on account-first principles.

## Architecture

- **Backend**: Node.js 22+, TypeScript, Express 5
- **Database**: PostgreSQL with Prisma ORM
- **Validation**: Zod
- **Authentication**: Token/session-based with role/permission enforcement
- **API**: Versioned REST API (`/api/v1`)
- **Architecture**: Modular feature-based Clean Architecture

## Core Principles

1. **Account-First**: Every leader is a member first. Leadership is permissions layered onto the member account.
2. **Permission-Driven**: Roles are collections of granular permissions, not hardcoded job titles.
3. **Multi-Tenant**: Strict organizational isolation enforced server-side.
4. **Financial Controls**: Double-entry accounting, controlled reversals, audit trails.
5. **Historical Records**: All sensitive changes are auditable and reversible.

## Project Structure

```
src/
├── app.ts                 # Express app initialization
├── server.ts              # Server entry point
├── config/                # Configuration
├── database/              # Database utilities
├── middleware/            # Express middleware
├── utils/                 # Shared utilities
├── types/                 # Global types
├── features/              # Feature modules
│   ├── auth/
│   ├── members/
│   ├── families/
│   ├── membership/
│   ├── sections/
│   ├── leadership/
│   ├── committees/
│   ├── events/
│   ├── attendance/
│   ├── finance/
│   ├── expenditure/
│   ├── pastoral/
│   ├── counseling/
│   ├── projects/
│   ├── tickets/
│   ├── assets/
│   ├── hr/
│   ├── notifications/
│   └── audit/
└── prisma/
    ├── schema.prisma      # Database schema
    └── seed.ts            # Database seeding
```

## Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL 13+
- npm or yarn

### Installation

```bash
# Clone repository
git clone https://github.com/tapiwanashemuchingami-spec/Ecclesia.git
cd Ecclesia

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run db:migrate

# Seed database (optional)
npm run db:seed
```

### Development

```bash
# Start development server with hot reload
npm run dev

# Run tests
npm test

# View database
npm run db:studio
```

## API Documentation

API endpoints follow the structure:

```
/api/v1/{feature}/{resource}
```

### Authentication

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
```

### Members

```
GET    /api/v1/members
GET    /api/v1/members/:id
POST   /api/v1/members
PUT    /api/v1/members/:id
DELETE /api/v1/members/:id
```

## Database Schema

The database is organized into conceptual domains:

- **Identity**: User, Session, Device
- **Organization**: Circuit, Church, Section, Family
- **Membership**: Member, FamilyRelationship, MembershipStatus, StatusChangeRequest
- **Leadership**: Role, Permission, RolePermission, LeadershipAssignment
- **Events**: Event, EventAttendance, EventParticipant
- **Finance**: Account, Fund, Receipt, Journal, JournalEntry, CashSession
- **Sections Finance**: SectionAccount, SectionReceipt, SectionTransaction
- **Pastoral**: PastoralVisit, CounselingConversation
- **Audit**: AuditLog, StatusChangeApproval

## Authorization

The system uses granular, permission-based authorization:

```typescript
Example permissions:
- member:view
- member:create
- member:update
- membership:status:request
- membership:status:approve
- receipt:create
- finance:view:church
- finance:view:section
- section:manage
- audit:review
```

## Development Phases

**Phase 1** (Current): Authentication, Organization, Members, RBAC
**Phase 2**: Membership management, Statistician workflows, Sections, Leadership
**Phase 3**: Events, Attendance, Notifications
**Phase 4**: Main finance, POS, Cash sessions, Double-entry accounting
**Phase 5**: Section finance, Section POS, Section expenditure, Audit
**Phase 6**: Committees, Pastoral care, Counseling
**Phase 7**: Projects, Fundraising, Tickets, QR validation
**Phase 8**: Assets, SPPR, Audit, Advanced reporting

## Testing

Tests are organized at three levels:

- **Unit**: Business rules (Vitest)
- **Integration**: Database operations (Vitest + Prisma)
- **API**: HTTP workflows (Supertest)

```bash
npm test              # Run all tests
npm run test:coverage # Coverage report
```

## License

MIT

## Contact

For questions or contributions, please open an issue.
