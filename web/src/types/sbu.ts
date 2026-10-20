export type SbuKey = 'RRW' | 'UMYF' | 'MUMC' | 'CHILDRENS_MINISTRY';
export type SbuScope = 'CONFERENCE' | 'DISTRICT' | 'CIRCUIT';
export type SbuLeadershipRole = 'LEADER' | 'SECRETARY' | 'TREASURER' | 'MEMBER';

export interface Sbu {
  id: string;
  key: SbuKey;
  name: string;
  displayName: string;
  scopeId: string;
  scopeType: SbuScope;
  status: 'ACTIVE' | 'INACTIVE';
  parentSbuId?: string;
}

export interface SbuAssignment {
  id: string;
  sbuId: string;
  userId: string;
  role: SbuLeadershipRole;
  status: 'NOMINATED' | 'CONFIRMED' | 'ACTIVE' | 'INACTIVE';
  nominatedBy?: string;
  nominatedAt?: string;
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface SbuOversight {
  sbuId: string;
  overseerRole: 'PASTOR' | 'LAY_LEADER' | 'DISTRICT_SUPERINTENDENT' | 'BISHOP';
  overseerUserId?: string;
  scopeId: string;
  canReview: boolean;
  canApprove: boolean;
}
