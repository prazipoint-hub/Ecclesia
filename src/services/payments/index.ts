import { logger } from '@/config/logger';
import { AppError } from '@/types/errors';
import { PaynowGateway } from './gateways/paynow';
import { SimulatedGateway } from './gateways/simulated';
import type { PaymentGateway } from './gateways/types';

export function createPaymentGateway(env: NodeJS.ProcessEnv = process.env): PaymentGateway {
  if (env.PAYNOW_INTEGRATION_ID && env.PAYNOW_INTEGRATION_KEY) {
    const appUrl = env.APP_URL || 'http://localhost:5173';
    return new PaynowGateway({
      integrationId: env.PAYNOW_INTEGRATION_ID,
      integrationKey: env.PAYNOW_INTEGRATION_KEY,
      resultUrl: env.PAYNOW_RESULT_URL || `${env.API_URL || 'http://localhost:3000'}/api/v2/payments/webhook/paynow`,
      returnUrl: env.PAYNOW_RETURN_URL || `${appUrl}/give/confirm`,
    });
  }
  if (env.NODE_ENV === 'production') {
    logger.warn('PAYNOW_INTEGRATION_ID/KEY not set in production; online payments are disabled');
    return {
      name: 'UNCONFIGURED',
      async initiate() { throw new AppError(503, 'Online payments are not configured', 'GATEWAY_UNCONFIGURED'); },
      async poll() { throw new AppError(503, 'Online payments are not configured', 'GATEWAY_UNCONFIGURED'); },
      parseWebhook() { throw new AppError(503, 'Online payments are not configured', 'GATEWAY_UNCONFIGURED'); },
    };
  }
  return new SimulatedGateway();
}

export const paymentGateway: PaymentGateway = createPaymentGateway();
export type { PaymentGateway } from './gateways/types';
