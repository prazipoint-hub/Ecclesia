export type GatewayMethod = 'WEB' | 'ECOCASH' | 'ONEMONEY';
export type GatewayStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface InitiateRequest {
  reference: string;
  amount: string; // decimal string, two places
  description: string;
  email: string;
  method: GatewayMethod;
  phone?: string;
}

export interface InitiateResult {
  gatewayRef?: string;
  pollUrl: string;
  redirectUrl?: string;
  instructions?: string;
}

export interface StatusResult {
  reference: string;
  gatewayRef?: string;
  amount: string;
  status: GatewayStatus;
  rawStatus: string;
}

export interface PaymentGateway {
  readonly name: string;
  initiate(request: InitiateRequest): Promise<InitiateResult>;
  poll(pollUrl: string): Promise<StatusResult>;
  /** Verifies the signature of a gateway callback and returns the reported status. Throws when it is not authentic. */
  parseWebhook(body: Record<string, string>): StatusResult;
}
