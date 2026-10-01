export type CommitteeMemberRole = 'CHAIR' | 'VICE_CHAIR' | 'SECRETARY' | 'TREASURER' | 'MEMBER';

export type CommitteeDashboardView =
  | 'FINANCE'
  | 'YOUTH'
  | 'WOMENS'
  | 'PROPERTY'
  | 'NOMINATIONS'
  | 'STEWARDSHIP'
  | 'EVANGELISM'
  | 'WORSHIP'
  | 'EDUCATION';

export interface Committee {
  id: string;
  name: string;
  displayName?: string;
  scopeId: string;
  parentCommitteeId?: string;
  status: 'ACTIVE' | 'INACTIVE';
  dashboardView?: CommitteeDashboardView;
  description?: string;
}

export interface CommitteeMember {
  id: string;
  committeeId: string;
  userId: string;
  role: CommitteeMemberRole;
  startDate?: string;
  endDate?: string;
  status: 'ACTIVE' | 'INACTIVE';
  confirmedBy?: string; // ID of pastor (circuit) or superintendent (district)
  confirmedAt?: string;
  nominatedBy?: string; // ID of nominating committee
  nominatedAt?: string;
}
