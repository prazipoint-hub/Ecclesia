export interface UserCommitteeMembership {
  committeeId: string;
  committeeName: string;
  committeeLevel: 'DISTRICT' | 'CIRCUIT' | 'SECTION' | 'CONFERENCE';
  scopeId: string;
  scopeName: string;
  role: 'CHAIR' | 'VICE_CHAIR' | 'SECRETARY' | 'TREASURER' | 'MEMBER';
  isConfirmed: boolean;
  confirmedBy?: string;
  confirmedAt?: string;
  dashboardAccess: boolean;
}

export interface UserSbuMembership {
  sbuId: string;
  sbuKey: 'RRW' | 'UMYF' | 'MUMC' | 'CHILDRENS_MINISTRY';
  sbuName: string;
  scopeId: string;
  scopeName: string;
  scopeType: 'CONFERENCE' | 'DISTRICT' | 'CIRCUIT';
  role: 'LEADER' | 'SECRETARY' | 'TREASURER' | 'MEMBER';
  status: 'NOMINATED' | 'CONFIRMED' | 'ACTIVE' | 'INACTIVE';
  dashboardAccess: boolean;
}

export type OrganizationLevel = 'CONFERENCE' | 'DISTRICT' | 'CIRCUIT' | 'SECTION';

export interface UserOrganizationContext {
  roleId: string;
  role: string;
  organizationId: string;
  organizationName: string;
  organizationLevel: OrganizationLevel;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  churchId?: string;
  permissions: string[];
  avatar?: string;
  committees: UserCommitteeMembership[];
  sbus: UserSbuMembership[];
  organizationContexts: UserOrganizationContext[];
  defaultContextId?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  activeCommitteeId?: string;
  activeSbuId?: string;
  currentContextId?: string;
}

export interface LoginRequest { email: string; password: string; }
export interface RegisterRequest { email: string; password: string; churchId: string; }
export interface AuthResponse { user: User; token: string; refreshToken: string; }
