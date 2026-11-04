export interface SmsProvider {
  send(to: string, text: string): Promise<void>;
}

/**
 * No SMS provider is wired up yet. Implement `SmsProvider` for the chosen gateway and return it here;
 * until then SMS deliveries are recorded as skipped and broadcasts cannot select the SMS channel.
 */
export function createSmsProvider(_env: NodeJS.ProcessEnv = process.env): SmsProvider | null {
  return null;
}
