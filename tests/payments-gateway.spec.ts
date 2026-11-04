import { describe, expect, test, vi } from 'vitest';
import { mapPaynowStatus, PaynowGateway, paynowHash } from '@/services/payments/gateways/paynow';
import { createPaymentGateway } from '@/services/payments';
import { SimulatedGateway } from '@/services/payments/gateways/simulated';

const KEY = 'integration-key';
const signed = (fields: Record<string, string>) => ({ ...fields, hash: paynowHash(Object.values(fields), KEY) });
const reply = (fields: Record<string, string>) => new Response(new URLSearchParams(signed(fields)).toString());

function gateway(fetchImpl: typeof fetch) {
  return new PaynowGateway({ integrationId: '1234', integrationKey: KEY, resultUrl: 'https://api.test/hook', returnUrl: 'https://app.test/give/confirm', fetchImpl });
}

describe('paynowHash', () => {
  test('is an upper-case SHA-512 of the concatenated values plus the key', () => {
    const hash = paynowHash(['a', 'b'], 'k');
    expect(hash).toMatch(/^[0-9A-F]{128}$/);
    expect(hash).toBe(paynowHash(['ab'], 'k'));
    expect(hash).not.toBe(paynowHash(['a', 'b'], 'other'));
  });
});

describe('status mapping', () => {
  test.each([
    ['Paid', 'COMPLETED'],
    ['Awaiting Delivery', 'COMPLETED'],
    ['Delivered', 'COMPLETED'],
    ['Created', 'PENDING'],
    ['Sent', 'PENDING'],
    ['Cancelled', 'CANCELLED'],
    ['Failed', 'FAILED'],
    ['Refunded', 'FAILED'],
    ['Something New', 'PENDING'],
  ])('%s -> %s', (raw, expected) => expect(mapPaynowStatus(raw)).toBe(expected));
});

describe('initiate', () => {
  test('sends a correctly signed mobile money request and returns the poll url', async () => {
    const fetchMock = vi.fn(async () =>
      reply({ status: 'Ok', instructions: 'Dial *151*2*4#', paynowreference: '999', pollurl: 'https://www.paynow.co.zw/interface/poll/?guid=abc' })
    );
    const result = await gateway(fetchMock as unknown as typeof fetch).initiate({
      reference: 'ECC-1', amount: '10.50', description: 'tithe', email: 'a@b.co', method: 'ECOCASH', phone: '0771234567',
    });
    expect(result).toMatchObject({ pollUrl: 'https://www.paynow.co.zw/interface/poll/?guid=abc', gatewayRef: '999', instructions: 'Dial *151*2*4#' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('https://www.paynow.co.zw/interface/remotetransaction');
    const sent = new URLSearchParams(init.body);
    expect(sent.get('method')).toBe('ecocash');
    expect(sent.get('phone')).toBe('0771234567');
    const values = [...sent].filter(([k]) => k !== 'hash').map(([, v]) => v);
    expect(sent.get('hash')).toBe(paynowHash(values, KEY));
    expect(sent.get('id')).toBe('1234');
  });

  test('web checkout uses the standard endpoint and returns the browser url', async () => {
    const fetchMock = vi.fn(async () => reply({ status: 'Ok', browserurl: 'https://www.paynow.co.zw/pay/1', pollurl: 'https://www.paynow.co.zw/interface/poll/?guid=1' }));
    const result = await gateway(fetchMock as unknown as typeof fetch).initiate({ reference: 'R', amount: '1.00', description: 'd', email: 'a@b.co', method: 'WEB' });
    expect(result.redirectUrl).toBe('https://www.paynow.co.zw/pay/1');
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://www.paynow.co.zw/interface/initiatetransaction');
  });

  test('rejects a response with a forged signature', async () => {
    const forged = new Response('status=Ok&pollurl=https%3A%2F%2Fevil.test&hash=DEADBEEF');
    await expect(
      gateway((async () => forged) as unknown as typeof fetch).initiate({ reference: 'R', amount: '1.00', description: 'd', email: 'a@b.co', method: 'WEB' })
    ).rejects.toThrow(/signature/i);
  });

  test('surfaces a gateway error as 502', async () => {
    const fetchMock = async () => new Response('status=Error&error=Invalid+Integration+Key');
    await expect(
      gateway(fetchMock as unknown as typeof fetch).initiate({ reference: 'R', amount: '1.00', description: 'd', email: 'a@b.co', method: 'WEB' })
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  test('network failure becomes 502 without leaking details', async () => {
    const fetchMock = async () => { throw new Error('ECONNREFUSED 10.0.0.1'); };
    await expect(
      gateway(fetchMock as unknown as typeof fetch).initiate({ reference: 'R', amount: '1.00', description: 'd', email: 'a@b.co', method: 'WEB' })
    ).rejects.toMatchObject({ statusCode: 502, message: 'Payment gateway is unreachable' });
  });
});

describe('poll and webhook', () => {
  test('poll refuses urls that are not Paynow over https', async () => {
    const fetchMock = vi.fn();
    const g = gateway(fetchMock as unknown as typeof fetch);
    await expect(g.poll('https://evil.test/poll')).rejects.toMatchObject({ statusCode: 502 });
    await expect(g.poll('http://www.paynow.co.zw/poll')).rejects.toMatchObject({ statusCode: 502 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('poll returns the verified status', async () => {
    const fetchMock = async () => reply({ reference: 'ECC-1', paynowreference: '55', amount: '10.00', status: 'Paid', pollurl: 'x' });
    const result = await gateway(fetchMock as unknown as typeof fetch).poll('https://www.paynow.co.zw/interface/poll/?guid=1');
    expect(result).toEqual({ reference: 'ECC-1', gatewayRef: '55', amount: '10.00', status: 'COMPLETED', rawStatus: 'Paid' });
  });

  test('webhook accepts a genuine signed body', () => {
    const body = signed({ reference: 'ECC-1', paynowreference: '55', amount: '10.00', status: 'Paid', pollurl: 'https://www.paynow.co.zw/p' });
    expect(gateway(vi.fn() as never).parseWebhook(body)).toMatchObject({ reference: 'ECC-1', status: 'COMPLETED' });
  });

  test.each([
    ['tampered amount', (b: Record<string, string>) => ({ ...b, amount: '0.01' })],
    ['tampered reference', (b: Record<string, string>) => ({ ...b, status: 'Paid', reference: 'ECC-OTHER' })],
    ['missing hash', ({ hash: _hash, ...rest }: Record<string, string>) => rest],
    ['wrong hash', (b: Record<string, string>) => ({ ...b, hash: 'A'.repeat(128) })],
  ])('webhook rejects %s', (_name, mutate) => {
    const body = signed({ reference: 'ECC-1', paynowreference: '55', amount: '10.00', status: 'Cancelled', pollurl: 'x' });
    expect(() => gateway(vi.fn() as never).parseWebhook(mutate(body))).toThrow(/signature|signed/i);
  });
});

describe('gateway selection', () => {
  test('uses Paynow when keys are present', () => {
    expect(createPaymentGateway({ PAYNOW_INTEGRATION_ID: '1', PAYNOW_INTEGRATION_KEY: 'k' } as NodeJS.ProcessEnv).name).toBe('PAYNOW');
  });
  test('simulated outside production without keys', () => {
    expect(createPaymentGateway({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBeInstanceOf(SimulatedGateway);
  });
  test('production without keys refuses to take payments rather than simulate them', async () => {
    const g = createPaymentGateway({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    await expect(g.initiate({ reference: 'R', amount: '1.00', description: 'd', email: 'a@b.co', method: 'WEB' })).rejects.toMatchObject({ statusCode: 503 });
  });
});
