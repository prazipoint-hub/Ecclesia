import { AppError } from '@/types/errors';
import type { InitiateRequest, InitiateResult, PaymentGateway, StatusResult } from './types';

/** Development-only gateway: every payment completes the first time it is polled. Never used in production. */
export class SimulatedGateway implements PaymentGateway {
  readonly name = 'SIMULATED';
  private readonly amounts = new Map<string, string>();

  async initiate(request: InitiateRequest): Promise<InitiateResult> {
    this.amounts.set(request.reference, request.amount);
    return {
      gatewayRef: `SIM-${request.reference}`,
      pollUrl: `simulated://${request.reference}`,
      redirectUrl: request.method === 'WEB' ? `simulated://checkout/${request.reference}` : undefined,
      instructions: request.method === 'WEB' ? undefined : 'Simulated payment: no prompt is sent.',
    };
  }

  async poll(pollUrl: string): Promise<StatusResult> {
    const reference = pollUrl.replace('simulated://', '');
    return { reference, gatewayRef: `SIM-${reference}`, amount: this.amounts.get(reference) ?? '', status: 'COMPLETED', rawStatus: 'Paid' };
  }

  parseWebhook(): StatusResult {
    throw new AppError(400, 'The simulated gateway has no webhook', 'VALIDATION_ERROR');
  }
}
