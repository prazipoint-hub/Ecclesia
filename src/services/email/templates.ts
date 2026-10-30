import type { EmailMessage } from './index';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

function layout(to: string, subject: string, intro: string, path: string, token: string, action: string): EmailMessage {
  const link = `${appUrl()}${path}?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject,
    text: `${intro}\n\n${action}: ${link}\n\nIf you did not expect this email you can ignore it.`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(action)}</a></p><p>If you did not expect this email you can ignore it.</p>`,
  };
}

export const passwordResetEmail = (to: string, token: string) =>
  layout(to, 'Reset your Ecclesia password', 'We received a request to reset your password. This link expires in 1 hour.', '/auth/reset-password', token, 'Reset password');

export const verifyEmailEmail = (to: string, token: string) =>
  layout(to, 'Verify your Ecclesia email', 'Please confirm your email address. This link expires in 48 hours.', '/auth/verify-email', token, 'Verify email');

export const invitationEmail = (to: string, token: string, churchName: string) =>
  layout(to, `You are invited to join ${churchName} on Ecclesia`, `You have been invited to join ${churchName}. This invitation expires in 7 days.`, '/auth/invite', token, 'Accept invitation');
