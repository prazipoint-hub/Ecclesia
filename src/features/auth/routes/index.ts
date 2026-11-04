import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authorize } from '@/middleware/authorization';
import { loginLimiter, passwordResetLimiter, registrationLimiter } from '@/middleware/rateLimit';
import { authController as c } from '@/features/auth/controller';

const router = Router();

router.post('/login', loginLimiter, c.login.bind(c));
router.post('/register', registrationLimiter, c.register.bind(c));
router.post('/refresh', c.refresh.bind(c));
router.post('/logout', authenticate, c.logout.bind(c));
router.get('/me', authenticate, c.me.bind(c));

router.post('/password-reset/request', passwordResetLimiter, c.requestPasswordReset.bind(c));
router.post('/password-reset/confirm', c.confirmPasswordReset.bind(c));
router.post('/password/change', authenticate, c.changePassword.bind(c));

router.post('/email/verify', c.verifyEmail.bind(c));
router.post('/email/resend-verification', authenticate, passwordResetLimiter, c.resendVerification.bind(c));

router.post('/invite', authenticate, authorize('auth:invite:create'), c.createInvitation.bind(c));
router.delete('/invite/:invitationId', authenticate, authorize('auth:invite:revoke'), c.revokeInvitation.bind(c));
router.post('/invite/accept', registrationLimiter, c.acceptInvitation.bind(c));

router.get('/devices', authenticate, c.listDevices.bind(c));
router.delete('/devices/:deviceId', authenticate, c.revokeDevice.bind(c));

router.get('/2fa/status', authenticate, c.twoFactorStatus.bind(c));
router.post('/2fa/setup', authenticate, c.twoFactorSetup.bind(c));
router.post('/2fa/verify', authenticate, c.twoFactorVerify.bind(c));
router.post('/2fa/disable', authenticate, c.twoFactorDisable.bind(c));

export default router;
