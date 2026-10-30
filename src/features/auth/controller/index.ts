import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '@/types';
import { AppError } from '@/types/errors';
import { handleError } from '@/utils/errorHandler';
import * as authService from '@/features/auth/service';
import * as securityService from '@/features/auth/service/security';
import * as twoFactorService from '@/features/auth/service/twoFactor';
import {
  AcceptInvitationSchema,
  ChangePasswordSchema,
  CreateInvitationSchema,
  LoginSchema,
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
  RefreshSchema,
  RegistrationSchema,
  TwoFactorDisableSchema,
  TwoFactorVerifySchema,
  VerifyEmailSchema,
} from '@/features/auth/types';

const sessionContext = (req: Request) => ({ userAgent: req.get('user-agent') ?? undefined, ipAddress: req.ip });

function respondError(error: unknown, res: Response): void {
  if (error instanceof ZodError) {
    res.status(400).json({ error: error.issues.map((issue) => issue.message).join(', ') });
    return;
  }
  handleError(error, res);
}

export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, totpCode } = LoginSchema.parse(req.body);
      const response = await authService.login(email.toLowerCase(), password, { ...sessionContext(req), totpCode });
      if (!response) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }
      res.json(response);
    } catch (error) {
      if (error instanceof AppError && error.code === 'TWO_FACTOR_REQUIRED') res.locals.twoFactorRequired = true;
      respondError(error, res);
    }
  }

  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, churchId } = RegistrationSchema.parse(req.body);
      res.status(201).json(await authService.register(email.toLowerCase(), password, churchId, sessionContext(req)));
    } catch (error) {
      respondError(error, res);
    }
  }

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = RefreshSchema.parse(req.body);
      const response = await authService.refresh(refreshToken, sessionContext(req));
      if (!response) {
        res.status(401).json({ error: 'Invalid or expired refresh token' });
        return;
      }
      res.json(response);
    } catch (error) {
      respondError(error, res);
    }
  }

  async logout(req: AuthRequest, res: Response): Promise<void> {
    if (req.sessionId) await authService.revokeSession(req.sessionId);
    res.status(204).send();
  }

  async me(req: AuthRequest, res: Response): Promise<void> {
    try {
      const user = await authService.getCurrentUser(req.user!.id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json(user);
    } catch (error) {
      respondError(error, res);
    }
  }

  async requestPasswordReset(req: Request, res: Response): Promise<void> {
    try {
      const { email } = PasswordResetRequestSchema.parse(req.body);
      await securityService.requestPasswordReset(email.toLowerCase());
      res.status(202).json({ message: 'If an account exists for that email, a reset link has been sent.' });
    } catch (error) {
      respondError(error, res);
    }
  }

  async confirmPasswordReset(req: Request, res: Response): Promise<void> {
    try {
      const { token, password } = PasswordResetConfirmSchema.parse(req.body);
      await securityService.confirmPasswordReset(token, password);
      res.json({ message: 'Password updated. You can now sign in.' });
    } catch (error) {
      respondError(error, res);
    }
  }

  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = VerifyEmailSchema.parse(req.body);
      await securityService.verifyEmail(token);
      res.json({ message: 'Email verified.' });
    } catch (error) {
      respondError(error, res);
    }
  }

  async resendVerification(req: AuthRequest, res: Response): Promise<void> {
    try {
      await securityService.resendVerification(req.user!.id);
      res.status(202).json({ message: 'Verification email sent if your address is not yet verified.' });
    } catch (error) {
      respondError(error, res);
    }
  }

  async changePassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { currentPassword, newPassword } = ChangePasswordSchema.parse(req.body);
      await securityService.changePassword(req.user!.id, req.sessionId, currentPassword, newPassword);
      res.status(204).send();
    } catch (error) {
      respondError(error, res);
    }
  }

  async createInvitation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const input = CreateInvitationSchema.parse(req.body);
      res.status(201).json(await securityService.createInvitation(req.user!, input));
    } catch (error) {
      respondError(error, res);
    }
  }

  async revokeInvitation(req: AuthRequest, res: Response): Promise<void> {
    try {
      await securityService.revokeInvitation(req.user!, req.params.invitationId);
      res.status(204).send();
    } catch (error) {
      respondError(error, res);
    }
  }

  async acceptInvitation(req: Request, res: Response): Promise<void> {
    try {
      const { token, password } = AcceptInvitationSchema.parse(req.body);
      res.status(201).json(await securityService.acceptInvitation(token, password, sessionContext(req)));
    } catch (error) {
      respondError(error, res);
    }
  }

  async listDevices(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json({ devices: await securityService.listDevices(req.user!.id, req.sessionId) });
    } catch (error) {
      respondError(error, res);
    }
  }

  async revokeDevice(req: AuthRequest, res: Response): Promise<void> {
    try {
      await securityService.revokeDevice(req.user!.id, req.params.deviceId, await this.churchOf(req));
      res.status(204).send();
    } catch (error) {
      respondError(error, res);
    }
  }

  async twoFactorStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json(await twoFactorService.getTwoFactorStatus(req.user!.id));
    } catch (error) {
      respondError(error, res);
    }
  }

  async twoFactorSetup(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.json(await twoFactorService.setupTwoFactor(req.user!.id, req.user!.email ?? ''));
    } catch (error) {
      respondError(error, res);
    }
  }

  async twoFactorVerify(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { code } = TwoFactorVerifySchema.parse(req.body);
      res.json(await twoFactorService.verifyAndEnableTwoFactor(req.user!.id, await this.churchOf(req), code));
    } catch (error) {
      respondError(error, res);
    }
  }

  async twoFactorDisable(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { password, code } = TwoFactorDisableSchema.parse(req.body);
      await twoFactorService.disableTwoFactor(req.user!.id, await this.churchOf(req), password, code);
      res.status(204).send();
    } catch (error) {
      respondError(error, res);
    }
  }

  // The JWT carries a placeholder church id for church-less accounts, so audit scoping uses the stored value.
  private async churchOf(req: AuthRequest): Promise<string | null> {
    const user = await authService.getCurrentUser(req.user!.id);
    return user?.churchId ?? null;
  }
}

export const authController = new AuthController();
