import { describe, expect, test } from 'vitest';
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateToken,
  hashToken,
  otpauthUrl,
  totp,
  verifyTotp,
} from '@/features/auth/crypto';
import { resolveJwtSecret } from '@/config/secrets';

// RFC 6238 appendix B: ASCII secret "12345678901234567890", SHA-1.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  test('matches the RFC 6238 test vectors', () => {
    expect(totp(RFC_SECRET, 59_000, 8)).toBe('94287082');
    expect(totp(RFC_SECRET, 1_111_111_109_000, 8)).toBe('07081804');
    expect(totp(RFC_SECRET, 20_000_000_000_000, 8)).toBe('65353130');
  });

  test('verifies codes within one step of drift and rejects others', () => {
    const now = 1_700_000_000_000;
    const code = totp(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, code, now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, code, now + 30_000)).toBe(true);
    expect(verifyTotp(RFC_SECRET, code, now + 120_000)).toBe(false);
    expect(verifyTotp(RFC_SECRET, '12345', now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef', now)).toBe(false);
  });
});

describe('base32', () => {
  test('round-trips arbitrary bytes', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  test('rejects invalid characters', () => {
    expect(() => base32Decode('not*base32')).toThrow();
  });
});

describe('secret encryption', () => {
  test('round-trips and is non-deterministic', () => {
    const a = encryptSecret('JBSWY3DPEHPK3PXP');
    const b = encryptSecret('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('JBSWY3DPEHPK3PXP');
  });

  test('detects tampering', () => {
    const [iv, tag, data] = encryptSecret('secret').split('.');
    const bytes = Buffer.from(data, 'base64url');
    bytes[0] ^= 0xff;
    expect(() => decryptSecret([iv, tag, bytes.toString('base64url')].join('.'))).toThrow();
  });
});

describe('tokens and backup codes', () => {
  test('generateToken returns the sha256 of the raw token', () => {
    const { raw, hash } = generateToken();
    expect(raw).toHaveLength(64);
    expect(hash).toBe(hashToken(raw));
    expect(generateToken().raw).not.toBe(raw);
  });

  test('backup codes are unique, formatted, and stored hashed', () => {
    const { codes, hashes } = generateBackupCodes(8);
    expect(new Set(codes).size).toBe(8);
    expect(codes.every((code) => /^[0-9a-f]{5}-[0-9a-f]{5}$/.test(code))).toBe(true);
    expect(hashes).toEqual(codes.map(hashToken));
  });

  test('otpauth url carries issuer, secret and account', () => {
    const url = otpauthUrl('a@b.org', 'ABC234');
    expect(url).toContain('otpauth://totp/Ecclesia%3Aa%40b.org');
    expect(url).toContain('secret=ABC234');
  });
});

describe('resolveJwtSecret', () => {
  test('allows the dev default outside production', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe('ecclesia-dev-secret');
  });

  test.each([
    [{ NODE_ENV: 'production' }],
    [{ NODE_ENV: 'production', JWT_SECRET: 'your-secret-key-change-in-production' }],
    [{ NODE_ENV: 'production', JWT_SECRET: 'too-short' }],
  ])('refuses weak secrets in production (%#)', (env) => {
    expect(() => resolveJwtSecret(env as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);
  });

  test('accepts a strong production secret', () => {
    const secret = 'x'.repeat(40);
    expect(resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: secret } as NodeJS.ProcessEnv)).toBe(secret);
  });
});
