// src/models/church-finance-model.ts

export type EntityScope = { type: "church" | "organization" | "section"; id: string };

export enum Role {
  ChurchAdmin = "ChurchAdmin",
  FinanceCommittee = "FinanceCommittee",
  ChiefRecordingSecretary = "ChiefRecordingSecretary",
  Treasurer = "Treasurer",
  POSOperator = "POSOperator",
  Auditor = "Auditor",
}

export interface User {
  id: string;
  name: string;
}

export interface RoleAssignment {
  userId: string;
  role: Role;
  scope: EntityScope; // where the role applies
}

export enum TransactionType {
  Cash = "Cash",
  BankTransfer = "BankTransfer",
  POS = "POS",
  Donation = "Donation",
  Other = "Other",
}

export enum TransactionStatus {
  Received = "Received",
  Confirmed = "Confirmed",
  WithTreasurer = "WithTreasurer",
  Reconciled = "Reconciled",
  Rejected = "Rejected",
}

export interface Transaction {
  id: string;
  scope: EntityScope;
  amountCents: number;
  currency: string;
  type: TransactionType;
  receivedByUserId: string;
  status: TransactionStatus;
  timestamps: {
    receivedAt: string;
    confirmedAt?: string;
    withTreasurerAt?: string;
    reconciledAt?: string;
  };
  metadata?: Record<string, any>;
}

export interface AuditRecord {
  id: string;
  scope: EntityScope;
  transactionId: string;
  performedByUserId: string;
  action: string; // e.g., "inspect", "flag", "approve"
  note?: string;
  createdAt: string;
}

// Permission helpers
// Rules implemented here (clarified):
// - Main church: FinanceCommittee and ChurchAdmin may receive money; ChiefRecordingSecretary confirms; Treasurer processes after confirmation.
// - Organizations: Treasurer is the primary receiver/confirmor; FinanceCommittee members in organizations may run POS but do not receive/confirm general receipts.
// - Sections: same as organizations (everything under Treasurer).

export function canReceiveMoney(assignments: RoleAssignment[], scope: EntityScope): boolean {
  // Main church: FinanceCommittee and ChurchAdmin can receive money
  if (scope.type === "church") {
    return assignments.some(a =>
      a.scope.type === scope.type && a.scope.id === scope.id && (
        a.role === Role.FinanceCommittee ||
        a.role === Role.ChurchAdmin
      )
    );
  }

  // Organizations & Sections: Treasurers are the primary receivers. POSOperators may create POS receipts if allowed.
  return assignments.some(a =>
    a.scope.type === scope.type && a.scope.id === scope.id && (
      a.role === Role.Treasurer || a.role === Role.POSOperator
    )
  );
}

export function canConfirmIncome(assignments: RoleAssignment[], scope: EntityScope): boolean {
  // Main church: ChiefRecordingSecretary confirms
  if (scope.type === "church") {
    return assignments.some(a =>
      a.scope.type === scope.type && a.scope.id === scope.id && a.role === Role.ChiefRecordingSecretary
    );
  }

  // Organizations & Sections: Treasurer confirms
  return assignments.some(a =>
    a.scope.type === scope.type && a.scope.id === scope.id && a.role === Role.Treasurer
  );
}

export function canHandToTreasurer(assignments: RoleAssignment[], scope: EntityScope): boolean {
  // Any scope: the Treasurer role in that scope can acknowledge/receive custody
  return assignments.some(a =>
    a.scope.type === scope.type && a.scope.id === scope.id && a.role === Role.Treasurer
  );
}

export function canRunPOS(assignments: RoleAssignment[], scope: EntityScope): boolean {
  // POS rules:
  // - POSOperator role always allowed in their scope.
  // - FinanceCommittee members in organizations (not the main church) can run POS per rules.
  if (assignments.some(a => a.scope.type === scope.type && a.scope.id === scope.id && a.role === Role.POSOperator)) {
    return true;
  }

  if (scope.type === "organization") {
    return assignments.some(a =>
      a.scope.type === scope.type && a.scope.id === scope.id && a.role === Role.FinanceCommittee
    );
  }

  // Sections and church: only POSOperator or Treasurer (if configured) should run POS. We'll allow Treasurer in sections.
  if (scope.type === "section") {
    return assignments.some(a =>
      a.scope.type === scope.type && a.scope.id === scope.id && (
        a.role === Role.Treasurer || a.role === Role.POSOperator
      )
    );
  }

  // Default deny
  return false;
}

export function canAudit(assignments: RoleAssignment[], scope: EntityScope): boolean {
  return assignments.some(a =>
    a.scope.type === scope.type && a.scope.id === scope.id && a.role === Role.Auditor
  );
}
