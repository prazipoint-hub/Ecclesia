import { z } from 'zod';

const STATUSES = ['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED'] as const;
const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
const MARITAL = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'] as const;

export const DirectoryQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  sectionId: z.string().min(1).optional(),
  status: z.enum(STATUSES).optional(),
  gender: z.enum(GENDERS).optional(),
  archived: z.enum(['exclude', 'include', 'only']).default('exclude'),
  sort: z.enum(['name', 'joined']).default('name'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const ImportQuerySchema = z.object({
  fileName: z.string().trim().min(1).max(200).default('members.csv'),
  skipInvalid: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalText = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const upper = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : v);
const pastDate = z.preprocess(
  blank,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD')
    .transform((v) => new Date(`${v}T00:00:00.000Z`))
    .refine((d) => !Number.isNaN(d.getTime()), 'not a real date')
    .optional()
);

export const ImportRowSchema = z.object({
  firstName: z.string().trim().min(1, 'first name is required').max(100),
  middleName: optionalText(100),
  lastName: z.string().trim().min(1, 'last name is required').max(100),
  gender: z.preprocess(
    (v) => {
      const value = upper(blank(v));
      if (value === 'M') return 'MALE';
      if (value === 'F') return 'FEMALE';
      return value;
    },
    z.enum(GENDERS).optional()
  ),
  dateOfBirth: pastDate.refine((d) => !d || d.getTime() < Date.now(), 'date of birth is in the future'),
  phone: optionalText(30),
  email: z.preprocess((v) => (typeof v === 'string' ? blank(v.trim().toLowerCase()) : v), z.string().email('invalid email').max(190).optional()),
  address: optionalText(300),
  section: optionalText(100),
  membershipStatus: z.preprocess((v) => upper(blank(v)), z.enum(STATUSES).default('ACTIVE')),
  maritalStatus: z.preprocess((v) => upper(blank(v)), z.enum(MARITAL).optional()),
  membershipDate: pastDate,
});

export type DirectoryQuery = z.infer<typeof DirectoryQuerySchema>;
export type ImportRow = z.infer<typeof ImportRowSchema>;
