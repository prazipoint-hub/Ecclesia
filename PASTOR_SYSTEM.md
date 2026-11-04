# Ecclesia Pastor System — Complete Specification

## 1. Overview

The Pastor System is a comprehensive pastoral operating system integrated into Ecclesia. It enables pastors to understand congregational health, manage pastoral care, conduct and record visits, approve membership lifecycle events, and maintain historical records—all while preserving strict separation between member data, operational pastoral data, and confidential counseling information.

**Core principle:** Pastoral work is data-driven intelligence + human judgment. Ecclesia aggregates, signals, and records. The pastor decides and acts.

---

## 2. Architectural Principles

### 2.1 Integration Without Duplication

- The Pastor System does **not** recreate member management, events, or attendance.
- It **consumes** data from Members, Families, Sections, Organizations, Events, and Attendance.
- It **produces** pastoral records (visits, counseling, cases, referrals).
- It **influences** membership lifecycle (approvals, sacraments).

### 2.2 Data Sensitivity Stratification

Four access tiers:

| Tier | Content | Access Control |
|------|---------|-----------------|
| **L1** | Member basics, sections, organizations | Normal `member:view` permission |
| **L2** | Pastoral visits, case status, follow-ups | `pastoral:visit:view`, `pastoral:case:view` |
| **L3** | Counseling notes, sensitive observations | `pastoral:counseling:confidential` only |
| **L4** | Restricted pastoral information | Requires specific role + audit justification |

**Critical rule:** Having `member:view` does NOT imply `pastoral:counseling:confidential`.

### 2.3 Permission Model

```
pastoral:visit:view
pastoral:visit:create
pastoral:visit:update
pastoral:case:view
pastoral:case:create
pastoral:case:update
pastoral:case:close
pastoral:counseling:view               # Summary only
pastoral:counseling:create
pastoral:counseling:update
pastoral:counseling:confidential       # Full notes
pastoral:prayer:view
pastoral:prayer:manage
pastoral:referral:view
pastoral:referral:create
pastoral:referral:update
pastoral:followup:view
pastoral:followup:manage
pastoral:sacrament:manage
pastoral:membership:approve            # Baptism, confirmation, marriage, funeral
pastoral:report:view
pastoral:dashboard:view
pastoral:calendar:view
pastoral:assessment:view
pastoral:assessment:update
```

### 2.4 The Pastor Is A Normal Member

- Login → Member account
- My Account → Personal member space
- Church Tools → Pastor module (when they have `pastoral:*` permissions)
- Permissions layered on top of member record
- No separate "pastor admin account"

---

## 3. Database Schema Extensions

### 3.1 Core Pastoral Entities

```prisma
// Domain: Pastoral Care

model PastoralCase {
  id                String      @id @default(cuid())
  churchId          String      // Tenant scoping
  memberId          String
  member            Member      @relation("PastoralCaseMember", fields: [memberId], references: [id])
  
  category          String      // SPIRITUAL, FAMILY, MARRIAGE, BEREAVEMENT, etc.
  concern           String      // Free-text description of the pastoral concern
  priority          String      // LOW, NORMAL, HIGH, URGENT
  status            String      // OPEN, IN_PROGRESS, WAITING_FOLLOW_UP, REFERRED, RESOLVED, CLOSED
  
  assignedPastorId  String?
  assignedPastor    Member?     @relation("PastoralCaseAssignedPastor", fields: [assignedPastorId], references: [id])
  
  openedAt          DateTime    @default(now())
  openedBy          String      // Member ID of pastor who opened case
  
  targetFollowUpAt  DateTime?   // Next follow-up due date
  resolvedAt        DateTime?
  resolvedReason    String?     // Why the case was resolved
  closedAt          DateTime?
  
  // Relationships
  activities        PastoralCaseActivity[]
  visits            PastoralVisit[]       @relation("CaseVisits")
  counselingSessions CounselingSession[]  @relation("CaseCounseling")
  referrals         PastoralReferral[]
  followUps         PastoralFollowUp[]
  
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  
  @@index([churchId])
  @@index([memberId])
  @@index([status])
  @@index([priority])
}

model PastoralCaseActivity {
  id                String      @id @default(cuid())
  caseId            String
  case              PastoralCase @relation(fields: [caseId], references: [id], onDelete: Cascade)
  
  activityType      String      // VISIT, COUNSELING, PRAYER, PHONE_CALL, MESSAGE, REFERRAL, ASSISTANCE, FAMILY_INTERVENTION, FOLLOW_UP, ASSESSMENT, NOTE
  
  description       String      // What happened
  notes             String?     // Additional details
  actorId           String      // Who performed the activity (member/pastor)
  
  occurredAt        DateTime    @default(now())
  createdAt         DateTime    @default(now())
  
  @@index([caseId])
  @@index([activityType])
}

model PastoralVisit {
  id                String      @id @default(cuid())
  churchId          String
  memberId          String
  member            Member      @relation("PastoralVisits", fields: [memberId], references: [id])
  
  caseId            String?     // Optional link to pastoral case
  case              PastoralCase? @relation("CaseVisits", fields: [caseId], references: [id])
  
  visitType         String      // GENERAL_PASTORAL, SICKNESS, HOSPITAL, BEREAVEMENT, FAMILY, MARRIAGE, NEW_MEMBER, INACTIVE_MEMBER, ELDERLY, BIRTH, CELEBRATION, FINANCIAL_SUPPORT, SPIRITUAL_SUPPORT, CRISIS, FOLLOW_UP, OTHER
  
  visitedBy         String      // Member ID of pastor who visited
  visitDate         DateTime
  location          String?     // Where the visit occurred
  
  purpose           String      // Why the visit occurred
  observations      String      // What the pastor observed
  outcome           String      // NO_FURTHER_ACTION, FOLLOW_UP_REQUIRED, COUNSELING_REQUIRED, FINANCIAL_ASSISTANCE, FAMILY_INTERVENTION, REFERRAL, PRAYER_SUPPORT
  
  followUpRequired  Boolean     @default(false)
  followUpDate      DateTime?
  
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  
  @@index([churchId])
  @@index([memberId])
  @@index([visitDate])
  @@index([caseId])
}

model CounselingSession {
  id                String      @id @default(cuid())
  churchId          String
  memberId          String
  member            Member      @relation("CounselingSessions", fields: [memberId], references: [id])
  
  caseId            String?
  case              PastoralCase? @relation("CaseCounseling", fields: [caseId], references: [id])
  
  counselorId       String      // Member ID of pastor/counselor
  counselingType    String      // SPIRITUAL, PRE_MARITAL, MARRIAGE, FAMILY, GRIEF, EMOTIONAL_SUPPORT, FINANCIAL, CAREER, YOUTH, CHILD, PARENTING, LIFE_DECISION, CRISIS, ADDICTION_SUPPORT, BEREAVEMENT, OTHER
  
  concern           String      // Topic of counseling
  intervention      String?     // What was discussed/recommended
  outcome           String      // RESOLVED, FOLLOW_UP_REQUIRED, ONGOING, REFERRED, ESCALATED
  
  sessionDate       DateTime
  
  // Confidential data — requires pastoral:counseling:confidential permission
  confidentialNotes String?     @db.Text
  followUpPlan      String?
  
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  
  @@index([churchId])
  @@index([memberId])
  @@index([counselorId])
  @@index([caseId])
}

model PastoralReferral {
  id                String      @id @default(cuid())
  churchId          String
  memberId          String
  member            Member      @relation("PastoralReferrals", fields: [memberId], references: [id])
  
  caseId            String
  case              PastoralCase @relation(fields: [caseId], references: [id])
  
  referralType      String      // PROFESSIONAL_COUNSELING, MEDICAL, FINANCIAL_SUPPORT, EMPLOYMENT, LEGAL_SUPPORT, FAMILY_SUPPORT, COMMUNITY_ASSISTANCE, OTHER
  
  referredBy        String      // Member ID of pastor who referred
  providerName      String      // Name of provider/organization
  reason            String      // Why referred
  
  referralDate      DateTime    @default(now())
  status            String      // PENDING, ACCEPTED, IN_PROGRESS, COMPLETED, DECLINED, AWAITING_RESPONSE
  followUpDate      DateTime?
  
  outcome           String?
  notes             String?
  
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  
  @@index([churchId])
  @@index([memberId])
  @@index([caseId])
  @@index([status])
}

model PastoralFollowUp {
  id                String      @id @default(cuid())
  churchId          String
  memberId          String
  member            Member      @relation("PastoralFollowUps", fields: [memberId], references: [id])
  
  caseId            String
  case              PastoralCase @relation(fields: [caseId], references: [id])
  
  dueDate           DateTime    // When follow-up is due
  completedAt       DateTime?   // When follow-up was completed
  
  reason            String      // Why follow-up is needed
  notes             String?
  
  status            String      // PENDING, COMPLETED, CANCELLED, OVERDUE
  
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  
  @@index([churchId])
  @@index([memberId])
  @@index([dueDate])
  @@index([status])
}

model PastoralAssessment {
  id                String      @id @default(cuid())
  churchId          String
  memberId          String
  member            Member      @relation("PastoralAssessments", fields: [memberId], references: [id])
  
  // Wellbeing dimensions
  spiritual         String      // HEALTHY, STABLE, DISENGAGED, NEEDS_DISCIPLESHIP, FAITH_CRISIS, GROWING, LEADERSHIP_DEVELOPMENT
  social            String      // HEALTHY, FAMILY_CONFLICT, MARRIAGE_DIFFICULTY, BEREAVEMENT, SOCIAL_ISOLATION, PARENTING_CONCERN, FAMILY_TRANSITION
  emotional         String      // NORMAL, GRIEF, STRESS, LONELINESS, CRISIS, EMOTIONAL_SUPPORT_NEEDED, RELATIONSHIP_DIFFICULTY, LIFE_TRANSITION
  economic          String      // SECURE, EMPLOYMENT_DIFFICULTY, UNEMPLOYED, BUSINESS_DIFFICULTY, FOOD_INSECURITY, SCHOOL_FEE_DIFFICULTY, HOUSING_DIFFICULTY, DEBT
  physical          String      // NORMAL, HOSPITALIZED, HOMEBOUND, ELDERLY_CARE_NEEDED, DISABILITY_SUPPORT, RECOVERY, TRANSPORTATION_NEED, PRACTICAL_ASSISTANCE
  
  notes             String?     // Pastoral observations
  
  assessedAt        DateTime    @default(now())
  assessedBy        String      // Member ID of pastor
  
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  
  @@index([churchId])
  @@index([memberId])
}

model PrayerRequest {
  id                String      @id @default(cuid())
  churchId          String
  memberId          String
  member            Member      @relation("PrayerRequests", fields: [memberId], references: [id])
  
  request           String      @db.Text // The prayer request
  visibility        String      // PASTOR_ONLY, SECTION_PASTORAL_TEAM, CHURCH_WIDE, CONFIDENTIAL
  
  submitted         DateTime    @default(now())
  status            String      // NEW, BEING_PRAYED_FOR, FOLLOW_UP_REQUIRED, CLOSED
  closedReason      String?
  
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  
  @@index([churchId])
  @@index([memberId])
  @@index([visibility])
}

model LifeEvent {
  id                String      @id @default(cuid())
  churchId          String
  memberId          String
  member            Member      @relation("LifeEvents", fields: [memberId], references: [id])
  
  eventType         String      // BIRTH, BAPTISM, CONFIRMATION, GRADUATION, MARRIAGE, ANNIVERSARY, NEW_EMPLOYMENT, BUSINESS_LAUNCH, RETIREMENT, MINISTRY_ACHIEVEMENT, ILLNESS_HOSPITALIZATION, BEREAVEMENT, DIVORCE, JOB_LOSS, FINANCIAL_HARDSHIP, FAMILY_CRISIS, RELOCATION, DEATH
  
  eventDate         DateTime
  description       String      // Details about the event
  
  // Workflow integration
  triggersPastoralWorkflow Boolean @default(false) // Should this event trigger pastoral action?
  workflowCreated   Boolean     @default(false)
  caseId            String?
  
  createdAt         DateTime    @default(now())
  
  @@index([churchId])
  @@index([memberId])
  @@index([eventType])
  @@index([eventDate])
}

model SpiritualDevelopmentRecord {
  id                String      @id @default(cuid())
  churchId          String
  memberId          String
  member            Member      @relation("SpiritualDevelopmentRecords", fields: [memberId], references: [id])
  
  // Development areas with achievement records
  area              String      // WORSHIP, PRAYER, BIBLE_STUDY, DISCIPLESHIP, FELLOWSHIP, SERVICE, EVANGELISM, LEADERSHIP, GIVING, COMMUNITY_OUTREACH
  
  status            String      // INACTIVE, BEGINNER, ACTIVE, ADVANCED, LEADERSHIP
  notes             String?
  
  recordedAt        DateTime    @default(now())
  recordedBy        String      // Member ID of pastor
  
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  
  @@index([churchId])
  @@index([memberId])
  @@index([area])
}

model BaptismRecord {
  id                String      @id @default(cuid())
  churchId          String
  memberId          String
  member            Member      @relation("BaptismRecords", fields: [memberId], references: [id])
  
  status            String      // CANDIDATE, IN_PREPARATION, INTERVIEWED, APPROVED, BAPTIZED, RECORDED
  
  preparationNotes  String?
  interviewDate     DateTime?
  interviewedBy     String?     // Member ID of pastor
  
  baptismDate       DateTime?
  baptizedBy        String?     // Member ID of pastor
  location          String?
  witnesses         String?
  
  recordedAt        DateTime?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  
  @@index([churchId])
  @@index([memberId])
  @@index([status])
}

model ConfirmationRecord {
  id                String      @id @default(cuid())
  churchId          String
  memberId          String
  member            Member      @relation("ConfirmationRecords", fields: [memberId], references: [id])
  
  status            String      // CANDIDATE, IN_PREPARATION, TAUGHT, ASSESSED, APPROVED, CONFIRMED, RECORDED
  
  preparationNotes  String?
  teachingNotes     String?
  assessmentNotes   String?
  
  confirmationDate  DateTime?
  confirmedBy       String?     // Member ID of pastor
  location          String?
  
  recordedAt        DateTime?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  
  @@index([churchId])
  @@index([memberId])
  @@index([status])
}

model MarriageRecord {
  id                String      @id @default(cuid())
  churchId          String
  
  partner1Id        String
  partner1          Member      @relation("MarriageRecordPartner1", fields: [partner1Id], references: [id])
  
  partner2Id        String
  partner2          Member      @relation("MarriageRecordPartner2", fields: [partner2Id], references: [id])
  
  status            String      // PRE_MARITAL_COUNSELING, COUNSELING_COMPLETE, APPROVED, MARRIED, RECORDED
  
  premaritalCounselingNotes String?
  counselorId       String?     // Member ID of pastor
  counselingComplete DateTime?
  
  marriageDate      DateTime?
  marriedBy         String?     // Member ID of pastor
  location          String?
  witnesses         String?
  
  membershipStatusUpdated Boolean @default(false) // Did member status lifecycle complete?
  
  recordedAt        DateTime?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  
  @@index([churchId])
  @@index([partner1Id])
  @@index([partner2Id])
  @@index([status])
}

model FuneralRecord {
  id                String      @id @default(cuid())
  churchId          String
  deceasedId        String
  deceased          Member      @relation("FuneralRecords", fields: [deceasedId], references: [id])
  
  deathDate         DateTime
  deathLocation     String?
  
  funeralDate       DateTime?
  funeralLocation   String?
  funeralBy         String?     // Member ID of pastor
  
  familyNotified    Boolean     @default(false)
  familyNotifiedAt  DateTime?
  
  bereavementCaseId String?
  bereavementCaseOpened Boolean @default(false)
  
  recordedAt        DateTime?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  
  @@index([churchId])
  @@index([deceasedId])
}

model PastoralNotification {
  id                String      @id @default(cuid())
  churchId          String
  pastorId          String      // Member ID of pastor receiving notification
  
  notificationType  String      // MEMBERSHIP_APPROVAL_REQUIRED, PASTORAL_FOLLOWUP_DUE, PRAYER_REQUEST, HOSPITALIZATION, DEATH, MARRIAGE_REQUEST, COUNSELING_REFERRAL, ATTENDANCE_CONCERN, CASE_ACTIVITY
  
  relatedMemberId   String?     // Which member this is about
  relatedCaseId     String?     // Which case this is about
  
  title             String
  message           String      @db.Text
  actionUrl         String?     // Link to relevant workflow
  
  read              Boolean     @default(false)
  readAt            DateTime?
  
  createdAt         DateTime    @default(now())
  
  @@index([churchId])
  @@index([pastorId])
  @@index([read])
}
```

### 3.2 Updates to Existing Models

```prisma
model Member {
  // ... existing fields ...
  
  // New pastoral relationships
  pastoralCases         PastoralCase[]        @relation("PastoralCaseMember")
  assignedCases         PastoralCase[]        @relation("PastoralCaseAssignedPastor")
  pastoralVisits        PastoralVisit[]
  counselingSessions    CounselingSession[]
  pastoralReferrals     PastoralReferral[]
  pastoralFollowUps     PastoralFollowUp[]
  pastoralAssessments   PastoralAssessment[]
  prayerRequests        PrayerRequest[]
  lifeEvents            LifeEvent[]
  spiritualDevelopment  SpiritualDevelopmentRecord[]
  baptismRecords        BaptismRecord[]
  confirmationRecords   ConfirmationRecord[]
  marriageRecordsP1     MarriageRecord[]      @relation("MarriageRecordPartner1")
  marriageRecordsP2     MarriageRecord[]      @relation("MarriageRecordPartner2")
  funeralRecords        FuneralRecord[]
  
  // Audit: last pastoral contact
  lastPastoralContactAt DateTime?
}
```

---

## 4. Feature Module Structure

```
src/features/pastoral/
├── README.md                          # Module documentation
├── types/
│   └── index.ts                       # All Zod schemas and TypeScript types
├── cases/
│   ├── controller/
│   │   └── index.ts                   # Case CRUD endpoints
│   ├── service/
│   │   └── index.ts                   # Case business logic
│   ├── repository/
│   │   └── index.ts                   # Case database queries
│   └── routes/
│       └── index.ts                   # Case API routes
├── visits/
│   ├── controller/
│   ├── service/
│   ├── repository/
│   └── routes/
├── counseling/
│   ├── controller/
│   ├── service/
│   ├── repository/
│   └── routes/
├── referrals/
│   ├── controller/
│   ├── service/
│   ├── repository/
│   └── routes/
├── prayer/
│   ├── controller/
│   ├── service/
│   ├── repository/
│   └── routes/
├── followups/
│   ├── controller/
│   ├── service/
│   └── routes/
├── wellbeing/
│   ├── controller/
│   ├── service/
│   └── routes/
├── spiritual-development/
│   ├── controller/
│   ├── service/
│   └── routes/
├── sacraments/
│   ├── baptism/
│   │   ├── controller/
│   │   ├── service/
│   │   └── routes/
│   ├── confirmation/
│   │   ├── controller/
│   │   ├── service/
│   │   └── routes/
│   ├── marriage/
│   │   ├── controller/
│   │   ├── service/
│   │   └── routes/
│   └── funerals/
│       ├── controller/
│       ├── service/
│       └── routes/
├── dashboard/
│   ├── service/
│   │   └── index.ts                   # Dashboard aggregation logic
│   ├── controller/
│   └── routes/
├── reports/
│   ├── service/
│   ├── controller/
│   └── routes/
├── life-events/
│   ├── service/
│   ├── controller/
│   └── routes/
├── notifications/
│   ├── service/
│   └── controller/
└── routes/
    └── index.ts                       # Master pastor routes
```

---

## 5. Core API Endpoints

### 5.1 Dashboard

```
GET    /api/v2/pastor/dashboard
       Returns:
       - Today's priorities (visits, follow-ups, approvals, hospital visits, prayer requests)
       - Congregational overview (membership, engagement, pastoral care, wellbeing)
       - Quick statistics

GET    /api/v2/pastor/dashboard/priorities
       Returns:
       - Pending visits
       - Overdue follow-ups
       - Pending membership approvals
       - New prayer requests
       - Members requiring attention
```

### 5.2 Congregation Overview

```
GET    /api/v2/pastor/congregation/overview
       Returns:
       - Membership statistics
       - Engagement metrics
       - Attendance trends
       - Open cases
       - Wellbeing indicators

GET    /api/v2/pastor/congregation/attendance-concerns
       Returns:
       - Members with declining attendance
       - Members absent for X services
       - New attenders
```

### 5.3 Member Pastoral Profile

```
GET    /api/v2/pastor/members/:memberId/pastoral-profile
       Returns:
       - Overview tab: contact, family, organizations, membership status, sacraments
       - Pastoral care tab: open cases, visits, counseling summaries
       - Attendance tab: recent attendance
       - Life events tab: recorded events
       - Spiritual development tab: progression through disciplines
       - History tab: pastoral contact history

GET    /api/v2/pastor/members/:memberId/wellbeing
       Returns:
       - Spiritual, social, emotional, economic, physical dimensions
       - Latest assessment
       - Recommendations

GET    /api/v2/pastor/members/:memberId/life-events
       Returns:
       - All recorded life events
       - Pastoral workflow status
```

### 5.4 Pastoral Cases

```
GET    /api/v2/pastor/cases
       Query params: status, priority, memberId, assigned
       Returns: List of cases with summary

GET    /api/v2/pastor/cases/:caseId
       Returns: Full case with activity timeline

POST   /api/v2/pastor/cases
       Body: member, category, concern, priority
       Returns: Created case

PUT    /api/v2/pastor/cases/:caseId
       Body: status, priority, concern, targetFollowUpAt
       Returns: Updated case

POST   /api/v2/pastor/cases/:caseId/activities
       Body: activityType, description, notes, occurredAt
       Returns: New activity added to timeline

POST   /api/v2/pastor/cases/:caseId/close
       Body: resolvedReason
       Returns: Case marked CLOSED
```

### 5.5 Pastoral Visits

```
GET    /api/v2/pastor/visits
       Query: memberId, visitType, dateRange
       Returns: List of visits

POST   /api/v2/pastor/visits
       Body: memberId, caseId, visitType, visitDate, location, purpose, observations, outcome
       Returns: Created visit

GET    /api/v2/pastor/visits/:visitId
       Returns: Full visit record

PUT    /api/v2/pastor/visits/:visitId
       Body: outcome, followUpRequired, followUpDate
       Returns: Updated visit
```

### 5.6 Counseling Sessions

```
GET    /api/v2/pastor/counseling
       Query: memberId, status
       Returns: Counseling sessions (summaries only, no confidential notes)

POST   /api/v2/pastor/counseling
       Body: memberId, caseId, counselingType, concern, intervention, outcome, sessionDate
       Returns: Created session

GET    /api/v2/pastor/counseling/:sessionId
       Requires: pastoral:counseling:confidential permission
       Returns: Full session with confidential notes

PUT    /api/v2/pastor/counseling/:sessionId
       Requires: pastoral:counseling:confidential permission
       Body: intervention, outcome, confidentialNotes, followUpPlan
       Returns: Updated session
```

### 5.7 Prayer Requests

```
GET    /api/v2/pastor/prayer-requests
       Query: status, visibility
       Returns: Prayer requests visible to this pastor

POST   /api/v2/pastor/prayer-requests/:requestId/mark-prayed
       Returns: Updated status

GET    /api/v1/members/:memberId/prayer-requests
       (Member can submit from My Account)
```

### 5.8 Referrals

```
GET    /api/v2/pastor/referrals
       Query: status, type
       Returns: List of referrals

POST   /api/v2/pastor/referrals
       Body: memberId, caseId, referralType, providerName, reason
       Returns: Created referral

PUT    /api/v2/pastor/referrals/:referralId
       Body: status, outcome, notes
       Returns: Updated referral
```

### 5.9 Follow-ups

```
GET    /api/v2/pastor/followups
       Query: status, dueDate
       Returns: Overdue and upcoming follow-ups

POST   /api/v2/pastor/followups/:followUpId/complete
       Returns: Marked COMPLETED
```

### 5.10 Sacraments

```
# Baptism
POST   /api/v2/pastor/sacraments/baptism/candidates
       Body: memberId, preparationNotes
       Returns: Baptism record created (status: CANDIDATE)

PUT    /api/v2/pastor/sacraments/baptism/:recordId/complete
       Body: baptismDate, baptizedBy, location, witnesses
       Returns: Record status updated to BAPTIZED

# Confirmation
POST   /api/v2/pastor/sacraments/confirmation/candidates
       Body: memberId
       Returns: Confirmation record created

PUT    /api/v2/pastor/sacraments/confirmation/:recordId/complete
       Body: confirmationDate, confirmedBy, location
       Returns: Record status updated to CONFIRMED

# Marriage
POST   /api/v2/pastor/sacraments/marriage
       Body: partner1Id, partner2Id, preparationNotes
       Returns: Marriage record created (status: PRE_MARITAL_COUNSELING)

POST   /api/v2/pastor/sacraments/marriage/:recordId/complete-counseling
       Body: counselingComplete, counselorNotes
       Returns: Status updated to COUNSELING_COMPLETE

POST   /api/v2/pastor/sacraments/marriage/:recordId/complete
       Body: marriageDate, marriedBy, location, witnesses
       Returns: Status updated to MARRIED, triggers membership lifecycle

# Funerals
POST   /api/v2/pastor/sacraments/funeral
       Body: deceasedId, deathDate, deathLocation
       Returns: Funeral record created

PUT    /api/v2/pastor/sacraments/funeral/:recordId
       Body: funeralDate, funeralLocation, funeralBy
       Returns: Updated funeral record
```

### 5.11 Membership Approvals (Integration)

```
GET    /api/v2/pastor/membership/approvals
       Returns: Pending status change approvals

POST   /api/v2/pastor/membership/approvals/:approvalId/approve
       Body: reason
       Returns: Approved, member status updated

POST   /api/v2/pastor/membership/approvals/:approvalId/reject
       Body: reason
       Returns: Rejected
```

### 5.12 Reports

```
GET    /api/v2/pastor/reports/membership
       Query: dateRange
       Returns: Membership summary, new members, transfers, deaths, sacraments

GET    /api/v2/pastor/reports/pastoral-ministry
       Query: dateRange
       Returns: Visits, counseling, cases, referrals, follow-ups

GET    /api/v2/pastor/reports/congregational-health
       Query: dateRange
       Returns: Attendance trends, participation, development, support activity

GET    /api/v2/pastor/reports/leadership
       Returns: Assignments, vacancies, expiring appointments

GET    /api/v2/pastor/reports/intelligence
       Returns: Congregational trends, needs, signals
```

---

## 6. Data Security & Access Control

### 6.1 Permission Enforcement Matrix

| Resource | Operation | Permission | Notes |
|----------|-----------|-----------|-------|
| Pastoral Case | View | `pastoral:case:view` | Scoped to church |
| Pastoral Case | Create | `pastoral:case:create` | Requires case category |
| Pastoral Case | Update | `pastoral:case:update` | Own cases or assigned |
| Pastoral Case | Close | `pastoral:case:close` | Requires resolution reason |
| Pastoral Visit | View | `pastoral:visit:view` | - |
| Pastoral Visit | Create | `pastoral:visit:create` | - |
| Counseling | View Summary | `pastoral:counseling:view` | Counts only, no details |
| Counseling | View Full | `pastoral:counseling:confidential` | **Restricted** |
| Counseling | Create/Update | `pastoral:counseling:create` | Requires `confidential` for notes |
| Prayer Request | View | `pastoral:prayer:view` | Per member visibility setting |
| Referral | Manage | `pastoral:referral:create/update` | - |
| Membership Approval | Approve/Reject | `pastoral:membership:approve` | **Approval workflow** |

### 6.2 Confidential Counseling Access Control

**The critical boundary:**

```typescript
// Bad: Counseling access through member:view
// ❌ await getCounselingNotes(memberId) // Fails if user lacks pastoral:counseling:confidential

// Good: Explicit permission check
async getCounselingNotes(sessionId: string, user: AuthorizedUser) {
  // This is the final authorization boundary
  if (!user.permissions.includes('pastoral:counseling:confidential')) {
    throw UnauthorizedError('pastoral:counseling:confidential required');
  }
  
  const session = await repository.findById(sessionId);
  
  // Church scoping
  if (session.churchId !== user.churchId) {
    throw UnauthorizedError('Cannot access counseling in another church');
  }
  
  return session; // Full confidential content
}
```

### 6.3 Service Layer Authorization Template

```typescript
// features/pastoral/cases/service/index.ts

export class PastoralCaseService {
  async createCase(data: CreateCaseDTO, user: AuthorizedUser) {
    // 1. Permission check
    if (!user.permissions.includes('pastoral:case:create')) {
      throw new UnauthorizedError('pastoral:case:create required');
    }
    
    // 2. Verify member exists and is in same church
    const member = await memberRepository.findById(data.memberId);
    if (!member || member.churchId !== user.churchId) {
      throw new NotFoundError('Member not found in this church');
    }
    
    // 3. Create case
    const caseRecord = await repository.create({
      ...data,
      churchId: user.churchId,
      openedBy: user.id,
      openedAt: new Date(),
    });
    
    // 4. Audit
    await auditLog({
      action: 'PASTORAL_CASE_OPENED',
      entityType: 'PastoralCase',
      entityId: caseRecord.id,
      actorId: user.id,
      churchId: user.churchId,
      newState: caseRecord,
    });
    
    // 5. Generate notification
    if (caseRecord.priority === 'URGENT') {
      await notificationService.notifyPastors(user.churchId, {
        type: 'CASE_OPENED_URGENT',
        relatedMemberId: data.memberId,
        relatedCaseId: caseRecord.id,
      });
    }
    
    return caseRecord;
  }
}
```

---

## 7. Dashboard Aggregation Logic

### 7.1 Today's Priorities Service

```typescript
// features/pastoral/dashboard/service/index.ts

async getTodaysPriorities(user: AuthorizedUser): Promise<DashboardPriorities> {
  const today = startOfDay(new Date());
  const tomorrow = endOfDay(new Date());
  
  // Requires: pastoral:visit:view, pastoral:followup:view, etc.
  
  return {
    visitsScheduled: await getVisitsForRange(user.churchId, today, tomorrow),
    followUpsDue: await getFollowUpsDue(user.churchId, today),
    membershipApprovalsNeeded: await getPendingMembershipApprovals(user.churchId),
    hospitalVisitsNeeded: await getHospitalizationAlerts(user.churchId),
    prayerRequestsNew: await getPrayerRequests(user.churchId, 'NEW'),
  };
}
```

### 7.2 Congregational Overview Service

```typescript
async getCongregationalOverview(user: AuthorizedUser): Promise<CongregationalOverview> {
  // Aggregates data across multiple domains
  
  return {
    membership: {
      total: await memberService.countActiveMembers(user.churchId),
      active: await memberService.countByStatus(user.churchId, 'ACTIVE'),
      inactive: await memberService.countByStatus(user.churchId, 'INACTIVE'),
      newThisMonth: await memberService.countNewMembers(user.churchId, thisMonth()),
      transfers: await memberService.countTransfers(user.churchId, thisMonth()),
      deaths: await memberService.countDeaths(user.churchId, thisMonth()),
      baptisms: await baptismService.countRecent(user.churchId, thisMonth()),
      confirmations: await confirmationService.countRecent(user.churchId, thisMonth()),
    },
    engagement: {
      attendanceRate: await attendanceService.calculateRate(user.churchId, last4Weeks()),
      communionParticipation: await memberService.countWithSacrament(user.churchId, 'COMMUNION'),
      bibleStudyActive: await organizationService.countActive(user.churchId, 'BIBLE_STUDY'),
      sectionParticipation: await sectionService.calculateParticipation(user.churchId),
      organizationParticipation: await organizationService.calculateParticipation(user.churchId),
      volunteerParticipation: await eventService.countVolunteers(user.churchId, thisMonth()),
    },
    pastoralCare: {
      openCases: await caseService.countByStatus(user.churchId, 'OPEN'),
      highPriorityCases: await caseService.countByPriority(user.churchId, 'HIGH'),
      overdueFollowUps: await followUpService.countOverdue(user.churchId),
      membersNotRecentlyVisited: await visitService.countNotVisitedInDays(user.churchId, 90),
      membersWithDecliningAttendance: await attendanceService.countDecliningAttendance(user.churchId),
    },
    wellbeing: {
      spiritualConcerns: await assessmentService.countByDimension(user.churchId, 'spiritual', ['DISENGAGED', 'FAITH_CRISIS']),
      familyCases: await caseService.countByCategory(user.churchId, 'FAMILY'),
      economicAssistance: await caseService.countByCategory(user.churchId, 'FINANCIAL'),
      bereavementActive: await caseService.countByCategory(user.churchId, 'BEREAVEMENT'),
    },
  };
}
```

### 7.3 Attendance Concern Detection

```typescript
// Signals, not judgments
async identifyAttendanceConcerns(churchId: string) {
  return {
    decliningTrend: await attendanceService.findDecliningMembers(churchId),
    multipleAbsences: await attendanceService.findAbsentForX(churchId, 4),
    noRecordedAttendance: await attendanceService.findNoAttendanceInDays(churchId, 56),
  };
}
```

---

## 8. Integration Points with Other Domains

### 8.1 Members Domain

- Read member data (with `member:view` permission)
- Link pastoral activities to members
- Update `lastPastoralContactAt`
- Respect member privacy settings

### 8.2 Families Domain

- View family composition
- Record family-level pastoral cases
- Identify interconnected family needs

### 8.3 Attendance Domain

- Read attendance data
- Identify attendance concerns automatically
- Trigger pastoral signals (not automated actions)

### 8.4 Events Domain

- Consume worship events
- Track pastoral participation
- Record sacramental events (baptisms, confirmations, weddings, funerals)

### 8.5 Sections Domain

- View section health aggregates
- Section-scoped pastoral oversight
- Do NOT give pastors section finance access

### 8.6 Organizations Domain

- Monitor organization participation
- Track leadership assignments
- Identify leadership needs

### 8.7 Membership Domain

- Approve status changes (marriage, death, transfer, transfer)
- Atomically update member status + audit
- Respect approval workflow

### 8.8 Notifications Domain

- Receive actionable notifications
- Links to relevant workflows
- Aggregates across domains

---

## 9. Notification Types

```typescript
enum PastoralNotificationType {
  // Membership governance
  MEMBERSHIP_APPROVAL_REQUIRED = 'membership_approval_required',
  
  // Pastoral activities
  PASTORAL_FOLLOWUP_DUE = 'pastoral_followup_due',
  VISIT_SCHEDULED = 'visit_scheduled',
  COUNSELING_REFERRAL_UPDATE = 'counseling_referral_update',
  
  // Member events
  PRAYER_REQUEST_RECEIVED = 'prayer_request_received',
  HOSPITALIZATION_REPORTED = 'hospitalization_reported',
  DEATH_REPORTED = 'death_reported',
  MARRIAGE_REQUEST = 'marriage_request',
  
  // Congregational intelligence
  ATTENDANCE_CONCERN = 'attendance_concern',
  CASE_ACTIVITY = 'case_activity',
  OVERDUE_FOLLOWUP = 'overdue_followup',
}
```

---

## 10. Workflow Example: Marriage

1. **Partner reports marriage intention** (Member → Life Event)
2. **System creates Marriage Record** (status: PRE_MARITAL_COUNSELING)
3. **Pastor notified** of pending pre-marital work
4. **Pastor schedules counseling** → Counseling Session created
5. **Counseling complete** → Marriage Record status: COUNSELING_COMPLETE
6. **Pastor approves marriage** → Marriage Record status: APPROVED
7. **Marriage ceremony occurs** → Marriage Record status: MARRIED
8. **System triggers Membership Status Change Request** (e.g., SINGLE → MARRIED)
9. **Marriage Record links to Status Change Request** (for audit)
10. **Pastor approves status change** → Member.maritalStatus updated atomically
11. **Notifications** sent to member, family, statistician
12. **Marriage Record status: RECORDED**
13. **Historical record complete and immutable**

---

## 11. Workflow Example: Hospitalization → Bereavement

1. **Member reports hospitalization** (Life Event)
2. **System creates LifeEvent** (eventType: ILLNESS_HOSPITALIZATION)
3. **Pastor notified** via notification
4. **Pastor can create case** or dismiss (decision engine)
5. **Pastor visits member** → Visit record created
6. **Outcome: PRAYER_SUPPORT, COUNSELING_REQUIRED, FINANCIAL_ASSISTANCE, etc.**
7. **[Later] Member dies**
8. **Statistician reports death** (Membership Status Change Request)
9. **System creates LifeEvent** (eventType: DEATH)
10. **System offers bereavement case creation** to pastoral team
11. **Pastor creates bereavement case** or existing hospitalization case transitions
12. **Family visited, pastoral support offered**
13. **System links Family member relationships** → identifies extended family needing support
14. **Funeral workflow** begins
15. **Funeral Record** created and completed
16. **Member status approval** (ACTIVE → DECEASED)
17. **Case closed** after follow-up
18. **Complete historical pastoral and membership record**

---

## 12. Security Considerations

### 12.1 Confidential Data Handling

- **No data exposure through member views** → `member:view` ≠ `pastoral:counseling:confidential`
- **Audit all confidential access** → Log every read of counseling notes
- **Limited export** → Reports never include raw counseling content
- **Role-based filtering** → API always filters sensitive fields by permission

### 12.2 Tenure and Turnover

- **Pastoral records remain immutable** after creation (audit-only)
- **Permission revocation** doesn't delete historical records
- **Successor pastor can view history** with appropriate permissions
- **Counseling notes protected** even if pastor leaves

### 12.3 Multi-Tenant Isolation

- **Every query includes `churchId` filter**
- **No cross-church data access** without explicit permission
- **Audit logs include church context**
- **API enforces church scoping** at service boundary

---

## 13. Testing Strategy

### Unit Tests

- **Permission enforcement** (authorized / unauthorized paths)
- **Business rules** (case workflows, status transitions)
- **Data validation** (Zod schemas)

### Integration Tests

- **Case creation** → activities recorded → follow-ups generated
- **Counseling session** → confidential data stored separately
- **Marriage workflow** → pre-marital counseling → status change approval
- **Hospitalization → bereavement** → family relationships linked

### API Tests

- **Dashboard aggregation** (correct counts, no data leakage)
- **Confidential access** (403 without permission)
- **Church scoping** (404 for cross-church access)
- **Notification generation** (correct types, correct recipients)

---

## 14. Phasing Implementation

### Phase 1 (v2.1)

- Pastoral Cases (CRUD, activity timeline)
- Pastoral Visits
- Case-to-member linking
- Dashboard: Today's Priorities
- Membership approvals integration

### Phase 2 (v2.2)

- Counseling sessions (with confidential permission boundary)
- Prayer requests
- Pastoral follow-ups
- Wellbeing assessments
- Dashboard: Congregational Overview

### Phase 3 (v2.3)

- Referrals system
- Life events + event → case workflow
- Sacraments: Baptism, Confirmation
- Spiritual development tracking
- Reports

### Phase 4 (v2.4)

- Marriage workflow (pre-marital, approval, status integration)
- Funeral workflow (bereavement cases, family notifications)
- Congregational intelligence (trends, signals, dashboards)
- Advanced reporting

---

## 15. Summary

The Pastor System transforms Ecclesia from a transaction system into an intelligence system for pastoral ministry. By connecting pastoral work to membership, attendance, events, families, and organizations, pastors gain a complete picture of congregational health and can make informed pastoral decisions.

The multi-tier permission model ensures that confidential counseling remains protected while operational pastoral data is appropriately shared. The historical, immutable record preserves pastoral ministry as part of the church's permanent record.

Most importantly, the pastor works with signals, not data entry. Ecclesia aggregates and alerts; the pastor judges and acts.

