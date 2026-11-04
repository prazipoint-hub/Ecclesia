import nodemailer from 'nodemailer';
import { logger } from '@/config/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{ filename: string; content: string | Buffer; contentType?: string }>;
}

export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}

class NodemailerEmailService implements EmailService {
  private readonly transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({ from: process.env.SMTP_FROM || 'Ecclesia <no-reply@ecclesia.local>', ...message });
  }
}

class LogEmailService implements EmailService {
  async send(message: EmailMessage): Promise<void> {
    logger.info({ to: message.to, subject: message.subject, body: message.text }, 'Email not sent: SMTP_HOST is not configured');
  }
}

export function createEmailService(env: NodeJS.ProcessEnv = process.env): EmailService {
  if (env.SMTP_HOST) return new NodemailerEmailService();
  if (env.NODE_ENV === 'production') logger.warn('SMTP_HOST is not set in production; emails will only be logged');
  return new LogEmailService();
}

export const emailService: EmailService = createEmailService();
