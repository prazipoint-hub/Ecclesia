import { Request } from 'express';

export type AuthorizedUser = {
  id: string;
  email?: string;
  churchId: string;
  permissions: string[];
  memberId?: string | null;
  roleIds?: string[];
};

export interface AuthRequest extends Request {
  user?: AuthorizedUser;
}
