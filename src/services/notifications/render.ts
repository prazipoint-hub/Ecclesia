import type { EmailMessage } from '@/services/email';

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export const TEMPLATE_VARIABLES = ['firstName', 'lastName', 'churchName'] as const;

/** Replaces {{name}} placeholders. Unknown placeholders render empty so they never leak into a message. */
export function renderTemplate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => variables[key] ?? '');
}

export function messageEmail(to: string, subject: string, body: string, churchName: string): EmailMessage {
  const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  const preferences = `${appUrl}/my-account/notification-preferences`;
  const paragraphs = body.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
  return {
    to,
    subject,
    text: `${body}\n\n-- ${churchName}\nManage what you receive: ${preferences}`,
    html: `${paragraphs}<hr><p style="color:#666;font-size:12px">${escapeHtml(churchName)} · <a href="${escapeHtml(preferences)}">Manage notification preferences</a></p>`,
  };
}
