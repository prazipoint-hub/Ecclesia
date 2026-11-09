export type Money = Record<string, string>;

export interface ReviewQueueItem {
  id: string; cashier: string; submittedAt: string | null; submissionNo: number;
  expected: Money; receiptCount: number; discrepancy: boolean; ownSession: boolean;
}
export interface CashSessionDetail {
  id: string; status: string; cashier: string; submissionNo: number; submittedAt: string | null; reviewedAt: string | null; reviewNote: string | null;
  submission: { counts: { currency: string; counted: number; denominations?: Record<string, number> }[]; cashPaidOut: number; notes: string | null; variances: Record<string, string> } | null;
  snapshot: { expected: Money; cashReceipts: Money; other: Money; categories: Money; receiptCount: number } | null;
  live: { expected: Money; cashReceipts: Money; other: Money; receiptCount: number };
  changedSinceSubmission: boolean;
  receipts: { receiptNumber: string; amount: number; currency: string; paymentMethod: string; incomeType: string; status: string; recordedAt: string }[];
  history: { action: string; at: string; by: string; note: string | null }[];
}
export interface Deposit {
  id: string; currency: string; amount: number; depositDate: string; bankReference: string; bankName: string | null; notes: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED'; recordedBy: string; verifiedBy: string | null; rejectReason: string | null; cashSessionId: string | null;
}
export interface TreasurerOverview {
  approvedCash: Money; approvedSessions: number; pendingCash: Money; pendingSessions: number;
  depositsVerified: Money; depositsAwaitingVerification: Money; undepositedCash: Money;
  sessionsOutstanding: { id: string; sessionDate: string; outstanding: Money }[];
  funds: { id: string; name: string; balance: number; isRestricted: boolean }[];
  note: string;
}
export interface ProfileCompletion {
  required: string[]; ruleSource: 'church' | 'default'; missing: string[]; percent: number;
  nextOfKin: { name: string; relationship: string; phone: string; altPhone: string | null; address: string | null } | null;
}
export interface ProfileChange {
  id: string; field: string; oldValue: string | null; newValue: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; reviewNote: string | null; createdAt: string; memberId?: string; ownRequest?: boolean;
}
export interface CompletionReport { required: string[]; activeMembers: number; complete: number; averagePercent: number; missingByField: Record<string, number>; truncated: boolean }
