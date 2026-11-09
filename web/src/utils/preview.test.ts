import { describe, expect, it } from 'vitest';
import { readPreview } from './preview';

const tok = (claims: object) => `h.${btoa(JSON.stringify(claims))}.s`;
describe('readPreview', () => {
  it('reads the preview claim', () => {
    expect(readPreview(tok({ preview: { roleId: 'r1', roleName: 'Treasurer' }, exp: 100 }))).toEqual({ roleId: 'r1', roleName: 'Treasurer', expiresAt: 100000 });
  });
  it('is null for a normal or malformed token', () => {
    expect(readPreview(tok({ sub: 'u' }))).toBeNull();
    expect(readPreview('garbage')).toBeNull();
    expect(readPreview(null)).toBeNull();
  });
});
