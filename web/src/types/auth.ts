export type OrganizationLevel = 'CONFERENCE' | 'DISTRICT' | 'CIRCUIT' | 'SECTION';

export type UserRole = 
  | 'CONFERENCE_LEADER'
  | 'DISTRICT_LEADER'
  | 'DISTRICT_ORGANIZATION_LEADER'
  | 'CIRCUIT_LEADER'
  | 'CIRCUIT_ORGANIZATION_LEADER'
  | 'SECTION_LEADER'
  | 'MEMBER';

export interface UserOrganizationContext {
  roleId: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
  organizationLevel: OrganizationLevel;
  isDefault?: boolean;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  churchId: string;
  permissions: string[];
  avatar?: string;
  organizationContexts: UserOrganizationContext[];
  defaultContextId?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  currentContextId?: string;
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
  churchId: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
}
