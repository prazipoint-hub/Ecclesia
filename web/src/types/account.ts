export interface MyProfile {
  id: string;
  membershipNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  maritalStatus: string | null;
  membershipStatus: string;
  joinDate: string;
  membershipDate: string;
  isDependent: boolean;
  church: { id: string; name: string };
  section: { id: string; name: string } | null;
  family: { id: string; name: string } | null;
}

export interface UpdateMyProfileInput {
  phone?: string | null;
  email?: string;
  address?: string | null;
}

export interface FamilyPerson {
  id: string;
  firstName: string;
  lastName: string;
  isDependent: boolean;
}

export interface MyFamily {
  family: { id: string; name: string } | null;
  relationships: Array<{ id: string; relationshipType: 'SPOUSE' | 'PARENT' | 'CHILD'; member: FamilyPerson }>;
  dependents: FamilyPerson[];
  household: Array<FamilyPerson & { membershipStatus: string }>;
}

export type ReceiptStatus = 'ISSUED' | 'VOIDED' | 'REVERSED';

export interface GivingItem {
  id: string;
  source: 'CHURCH' | 'SECTION';
  receiptNumber: string;
  amount: number;
  currency: string;
  incomeType: string;
  paymentMethod: string;
  status: ReceiptStatus;
  issuedAt: string;
  fundName: string | null;
  sectionName: string | null;
}

export interface GivingList {
  items: GivingItem[];
  total: number;
  page: number;
  pageSize: number;
  availableYears: number[];
}

export interface GivingSummary {
  year: number;
  availableYears: number[];
  totals: Array<{ currency: string; total: number; count: number }>;
  byIncomeType: Array<{ incomeType: string; currency: string; total: number }>;
  byMonth: Array<{ month: number; currency: string; total: number }>;
}

export interface NotificationItem {
  id: string;
  source: 'SYSTEM' | 'PASTORAL';
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  actionUrl: string | null;
}

export interface NotificationList {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
}
