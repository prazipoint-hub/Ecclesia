import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@/middleware/auth';
import { AuthRequest } from '@/types';
import * as authService from '@/features/auth/service';

const router = Router();
const CredentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });
const RegistrationSchema = CredentialsSchema.extend({ churchId: z.string().min(1) });
const RefreshSchema = z.object({ refreshToken: z.string().uuid() });
const validationError = (error: unknown) =>
  error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join(', ') : 'Invalid request';

router.post('/login', async (req, res) => {
  try {
    const { email, password } = CredentialsSchema.parse(req.body);
    const response = await authService.login(email.toLowerCase(), password);
    if (!response) return res.status(401).json({ error: 'Invalid email or password' });
    return res.json(response);
  } catch (error) {
    return res.status(400).json({ error: validationError(error) });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { email, password, churchId } = RegistrationSchema.parse(req.body);
    const response = await authService.register(email.toLowerCase(), password, churchId);
    return res.status(201).json(response);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to register account' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = RefreshSchema.parse(req.body);
    const response = await authService.refresh(refreshToken);
    if (!response) return res.status(401).json({ error: 'Invalid or expired refresh token' });
    return res.json(response);
  } catch (error) {
    return res.status(400).json({ error: validationError(error) });
  }
});

router.post('/logout', authenticate, async (req: AuthRequest, res) => {
  if (req.sessionId) await authService.revokeSession(req.sessionId);
  res.status(204).send();
});

router.get('/me', authenticate, async (req: AuthRequest, res) => {
  const user = await authService.getCurrentUser(req.user!.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
});

export default router;
