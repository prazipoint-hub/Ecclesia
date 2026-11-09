import { z } from 'zod';

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const RegisterCircuitSchema = z.object({
  name: text(2, 120),
  conferenceId: text(1, 191),
  districtId: text(1, 191),
  location: text(1, 191).optional(),
  /** A Circuit needs at least one church / preaching point so the Secretary's role has a home before the register exists. */
  firstChurch: z.object({ name: text(2, 120), location: text(1, 191).optional() }),
  secretary: z.object({
    firstName: text(1, 100),
    lastName: text(1, 100),
    email: z.string().trim().toLowerCase().email().max(191),
    phone: text(5, 30).optional(),
  }),
  identificationNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9\-\/]{1,39}$/, 'use 2-40 letters, digits, "-" or "/"'),
});
export type RegisterCircuitInput = z.infer<typeof RegisterCircuitSchema>;

export const IdempotencyKeySchema = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._\-]+$/);

export const CircuitStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']) });

/** Allowed status moves. PENDING is reserved for a future approval step. */
export const CIRCUIT_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ACTIVE', 'CLOSED'],
  ACTIVE: ['SUSPENDED', 'CLOSED'],
  SUSPENDED: ['ACTIVE', 'CLOSED'],
  CLOSED: [],
};

/**
 * What the Circuit Secretary may do. Deliberately no finance, journal, expenditure or access:assign permissions:
 * circuit administration does not imply financial approval or the power to grant roles (guide §4.3, §8.2).
 */
export const CIRCUIT_SECRETARY_ROLE = 'Circuit Secretary';
export const CIRCUIT_SECRETARY_PERMISSIONS = [
  'circuit:view', 'circuit:onboard', 'member:view', 'member:create', 'member:update', 'member:import', 'member:export',
  'section:create', 'section:manage', 'organization:create', 'organization:manage', 'organization:view',
  'leadership:term:manage', 'leadership:import', 'leadership:position:view', 'leadership:appointment:view', 'event:view',
];
