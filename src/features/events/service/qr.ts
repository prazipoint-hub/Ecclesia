import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { jwtSecret } from '@/config/secrets';
import { ValidationError } from '@/types/errors';

const AUDIENCE = 'ecclesia-qr';
const INVALID = 'This QR code is invalid or has expired';

/** QR tokens use their own key, so a leaked QR can never be replayed as a login token or the reverse. */
const key = () => createHmac('sha256', jwtSecret).update('ecclesia:qr:v1').digest();

export type EventQrPayload = { typ: 'event'; eventId: string; churchId: string };
export type BadgeQrPayload = { typ: 'badge'; memberId: string; churchId: string };

export function signQr(payload: EventQrPayload | BadgeQrPayload, expiresInSeconds: number): { token: string; expiresAt: Date } {
  const seconds = Math.max(Math.floor(expiresInSeconds), 30);
  const token = jwt.sign(payload, key(), { algorithm: 'HS256', audience: AUDIENCE, expiresIn: seconds });
  return { token, expiresAt: new Date(Date.now() + seconds * 1000) };
}

export function verifyQr<T extends EventQrPayload | BadgeQrPayload>(token: string, typ: T['typ']): T {
  try {
    const payload = jwt.verify(token, key(), { algorithms: ['HS256'], audience: AUDIENCE }) as T;
    if (payload.typ !== typ) throw new Error('wrong type');
    return payload;
  } catch {
    throw new ValidationError(INVALID);
  }
}

export const qrDataUrl = (token: string): Promise<string> => QRCode.toDataURL(token, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
