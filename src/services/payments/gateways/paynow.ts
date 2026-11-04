import { createHash, timingSafeEqual } from 'node:crypto';
import { logger } from '@/config/logger';
import { AppError, UnauthorizedError } from '@/types/errors';
import type { GatewayStatus, InitiateRequest, InitiateResult, PaymentGateway, StatusResult } from './types';

const BASE_URL = 'https://www.paynow.co.zw/interface';

export interface PaynowConfig {
  integrationId: string;
  integrationKey: string;
  resultUrl: string;
  returnUrl: string;
  fetchImpl?: typeof fetch;
}

/** Paynow signs a message by hashing every field value in order, then the integration key (SHA-512, upper-case hex). */
export function paynowHash(values: string[], integrationKey: string): string {
  return createHash('sha512')
    .update(values.join('') + integrationKey, 'utf8')
    .digest('hex')
    .toUpperCase();
}

export function mapPaynowStatus(raw: string): GatewayStatus {
  switch (raw.trim().toLowerCase()) {
    case 'paid':
    case 'awaiting delivery':
    case 'delivered':
      return 'COMPLETED';
    case 'cancelled':
      return 'CANCELLED';
    case 'failed':
    case 'refunded':
    case 'disputed':
      return 'FAILED';
    default:
      return 'PENDING'; // created, sent, pending
  }
}

function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a.toUpperCase());
  const right = Buffer.from(b.toUpperCase());
  return left.length === right.length && timingSafeEqual(left, right);
}

export class PaynowGateway implements PaymentGateway {
  readonly name = 'PAYNOW';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: PaynowConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async initiate(request: InitiateRequest): Promise<InitiateResult> {
    const mobile = request.method !== 'WEB';
    const fields: [string, string][] = [
      ['id', this.config.integrationId],
      ['reference', request.reference],
      ['amount', request.amount],
      ['additionalinfo', request.description],
      ['returnurl', this.config.returnUrl],
      ['resulturl', this.config.resultUrl],
      ['authemail', request.email],
    ];
    if (mobile) {
      fields.push(['phone', request.phone ?? ''], ['method', request.method.toLowerCase()]);
    }
    fields.push(['status', 'Message']);
    fields.push(['hash', paynowHash(fields.map(([, v]) => v), this.config.integrationKey)]);

    const response = await this.post(mobile ? `${BASE_URL}/remotetransaction` : `${BASE_URL}/initiatetransaction`, new URLSearchParams(fields));
    const data = this.verified(response);
    if (data.status.toLowerCase() !== 'ok') {
      throw new AppError(502, `Payment gateway rejected the request: ${data.error ?? data.status}`, 'GATEWAY_REJECTED');
    }
    if (!data.pollurl) throw new AppError(502, 'Payment gateway returned no poll URL', 'GATEWAY_ERROR');
    return { pollUrl: data.pollurl, redirectUrl: data.browserurl, instructions: data.instructions, gatewayRef: data.paynowreference };
  }

  async poll(pollUrl: string): Promise<StatusResult> {
    this.assertPaynowUrl(pollUrl);
    const data = this.verified(await this.post(pollUrl, new URLSearchParams()));
    return this.toStatus(data);
  }

  parseWebhook(body: Record<string, string>): StatusResult {
    return this.toStatus(this.verified(body));
  }

  private toStatus(data: Record<string, string>): StatusResult {
    if (!data.reference || !data.status) throw new UnauthorizedError('Malformed gateway message');
    return {
      reference: data.reference,
      gatewayRef: data.paynowreference,
      amount: data.amount ?? '',
      status: mapPaynowStatus(data.status),
      rawStatus: data.status,
    };
  }

  /** Returns the message with lower-cased keys once its signature checks out. */
  private verified(message: Record<string, string>): Record<string, string> {
    const entries = Object.entries(message).map(([k, v]) => [k.toLowerCase(), String(v)] as const);
    const hash = entries.find(([k]) => k === 'hash')?.[1];
    if (!hash) throw new UnauthorizedError('Gateway message is not signed');
    const expected = paynowHash(entries.filter(([k]) => k !== 'hash').map(([, v]) => v), this.config.integrationKey);
    if (!hashesMatch(hash, expected)) throw new UnauthorizedError('Gateway signature mismatch');
    return Object.fromEntries(entries);
  }

  private assertPaynowUrl(url: string): void {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('paynow.co.zw')) {
      throw new AppError(502, 'Refusing to poll a non-Paynow URL', 'GATEWAY_ERROR');
    }
  }

  private async post(url: string, body: URLSearchParams): Promise<Record<string, string>> {
    let text: string;
    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      text = await res.text();
    } catch (error) {
      logger.error({ err: error }, 'Paynow request failed');
      throw new AppError(502, 'Payment gateway is unreachable', 'GATEWAY_UNREACHABLE');
    }
    const parsed: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(text)) parsed[key] = value;
    if (parsed.status?.toLowerCase() === 'error' && !parsed.hash) {
      throw new AppError(502, `Payment gateway error: ${parsed.error ?? 'unknown'}`, 'GATEWAY_REJECTED');
    }
    return parsed;
  }
}
