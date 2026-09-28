export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  churchId: string;
  permissions: string[];
  avatar?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
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
