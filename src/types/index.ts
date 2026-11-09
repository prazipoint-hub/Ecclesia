import { Request } from 'express';

export type AuthorizedUser = {
  id: string;
  email?: string;
  churchId: string;
  permissions: string[];
  memberId?: string | null;
  roleIds?: string[];
  /** Set only on a read-only "view as" token. */
  preview?: { roleId: string; roleName: string };
};

export interface AuthRequest extends Request {
  user?: AuthorizedUser;
  sessionId?: string;
}
