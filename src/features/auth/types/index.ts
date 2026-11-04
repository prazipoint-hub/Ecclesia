import { z } from 'zod';

const password = z.string().min(8).max(128);
const email = z.string().email().max(190);
const token = z.string().min(20).max(256);

export const LoginSchema = z.object({ email, password, totpCode: z.string().max(32).optional() });
export const RegistrationSchema = z.object({ email, password, churchId: z.string().min(1) });
export const RefreshSchema = z.object({ refreshToken: z.string().uuid() });

export const PasswordResetRequestSchema = z.object({ email });
export const PasswordResetConfirmSchema = z.object({ token, password });
export const VerifyEmailSchema = z.object({ token });
export const ChangePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });

export const CreateInvitationSchema = z.object({ email, memberId: z.string().min(1).optional() });
export const AcceptInvitationSchema = z.object({ token, password });

export const TwoFactorVerifySchema = z.object({ code: z.string().min(6).max(32) });
export const TwoFactorDisableSchema = z.object({ password: z.string().min(1).max(128), code: z.string().min(6).max(32) });

export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateInvitationInput = z.infer<typeof CreateInvitationSchema>;
