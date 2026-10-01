export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  churchId?: string;
  permissions: string[];
  avatar?: string;
  committees: UserCommitteeMembership[];
}

export interface UserCommitteeMembership {
  committeeId: string;
  committeeName: string;
  committeeLevel: 'DISTRICT' | 'CIRCUIT' | 'SECTION' | 'CONFERENCE';
  scopeId: string; // The unit ID (district, circuit, etc.)
  scopeName: string;
  role: 'CHAIR' | 'VICE_CHAIR' | 'SECRETARY' | 'TREASURER' | 'MEMBER';
  isConfirmed: boolean;
  confirmedBy?: string;
  confirmedAt?: string;
  dashboardAccess: boolean;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  activeCommitteeId?: string; // Currently viewed committee context
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  churchId?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
}
