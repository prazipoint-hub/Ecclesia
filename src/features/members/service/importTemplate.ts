/**
 * Versioned membership CSV template and the pure row rules around it. No database access here.
 * Source columns (guide §5.1): name,surname,phone,sex,marital_status,baptism_status,confirmation_status,section,organization
 */
export const TEMPLATE_VERSION = '1.0';
export const TEMPLATE_COLUMNS = ['name', 'surname', 'phone', 'sex', 'marital_status', 'baptism_status', 'confirmation_status', 'section', 'organization'] as const;

export const ALLOWED_VALUES = {
  sex: ['MALE', 'FEMALE', 'OTHER'],
  marital_status: ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'],
  baptism_status: ['YES', 'NO', 'UNKNOWN'],
  confirmation_status: ['YES', 'NO', 'UNKNOWN'],
} as const;

export const TEMPLATE_SPEC = {
  version: TEMPLATE_VERSION,
  columns: TEMPLATE_COLUMNS,
  required: ['name', 'surname'],
  optional: 'Every other cell may be blank. Nothing is guessed for a blank cell (for example no marital status is assumed for a child).',
  allowedValues: ALLOWED_VALUES,
  aliases: { sex: ['M', 'F', 'gender'], baptism_status: ['TRUE/FALSE accepted as YES/NO'], organization: ['organisation', 'organizations'] },
  organizationEncoding: 'Several organisations are separated by ";" or "|", e.g. UMYF;MUMC. Names must match an existing organisation (full or short name) in this church.',
  phone: 'Keep it as text. "+", digits, spaces, dashes and brackets are accepted. A number that starts with 0 or + is kept as typed (cleaned of spaces); no country is assumed.',
  sacraments: 'baptism_status and confirmation_status are checked and kept on the import for review but are not written to sacrament records, which need a date and officiant.',
  extraColumns: 'Optional: email, address, date_of_birth (YYYY-MM-DD), middle_name. Unknown columns are reported and ignored.',
  encoding: 'UTF-8 (a byte-order mark is fine). Quoted fields and Unicode names are supported.',
} as const;

export const templateCsv = () => `${TEMPLATE_COLUMNS.join(',')}\r\n`;

const norm = (h: string) => h.trim().toLowerCase().replace(/[\s_\-]/g, '');
export const COLUMN_ALIASES: Record<string, string> = {
  name: 'firstName', firstname: 'firstName', surname: 'lastName', lastname: 'lastName', middlename: 'middleName',
  phone: 'phone', sex: 'sex', gender: 'sex', maritalstatus: 'maritalStatus', baptismstatus: 'baptism', confirmationstatus: 'confirmation',
  section: 'section', organization: 'organization', organisation: 'organization', organizations: 'organization', organisations: 'organization',
  email: 'email', address: 'address', dateofbirth: 'dateOfBirth', dob: 'dateOfBirth',
};

export function mapHeader(header: string[]) {
  const columns = header.map((h) => COLUMN_ALIASES[norm(h)] ?? null);
  return {
    columns,
    ignored: header.filter((_h, i) => !columns[i]).map((h) => h.trim()).filter(Boolean),
    missing: (['firstName', 'lastName'] as const).filter((c) => !columns.includes(c)).map((c) => (c === 'firstName' ? 'name' : 'surname')),
  };
}

export type Parsed = {
  firstName: string; middleName: string | null; lastName: string; phone: string | null; gender: string | null; maritalStatus: string | null;
  baptism: string | null; confirmation: string | null; sectionName: string | null; organizationNames: string[]; email: string | null; address: string | null; dateOfBirth: string | null;
};

export const cleanPhone = (v: string): string => {
  let p = v.trim().replace(/[\s().\-]/g, '');
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  return p;
};
export const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
export const nameKey = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

const pick = (raw: Record<string, string>, k: string) => (raw[k] ?? '').trim();
const oneOf = (value: string, allowed: readonly string[], label: string, errors: string[], map: Record<string, string> = {}) => {
  if (!value) return null;
  const up = map[value.toUpperCase()] ?? value.toUpperCase();
  if (!allowed.includes(up)) { errors.push(`${label}: "${value}" is not one of ${allowed.join(', ')}`); return null; }
  return up;
};

/** Validate one row's cells. Reference lookups (section, organisation) happen later against real records. */
export function parseRow(raw: Record<string, string>): { parsed: Parsed | null; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const firstName = pick(raw, 'firstName');
  const lastName = pick(raw, 'lastName');
  if (!firstName) errors.push('name: required');
  if (!lastName) errors.push('surname: required');
  if (firstName.length > 100) errors.push('name: too long (max 100)');
  if (lastName.length > 100) errors.push('surname: too long (max 100)');

  let phone: string | null = null;
  const rawPhone = pick(raw, 'phone');
  if (rawPhone) {
    if (!/^\+?[0-9()\s.\-]{5,30}$/.test(rawPhone)) errors.push(`phone: "${rawPhone}" is not a phone number`);
    else {
      phone = cleanPhone(rawPhone);
      if (!phone.startsWith('+') && !phone.startsWith('0') && /^\d{9,10}$/.test(phone)) {
        warnings.push('phone: no leading 0 or +; a spreadsheet may have dropped it. Kept as typed, please check');
      }
    }
  }

  const gender = oneOf(pick(raw, 'sex'), ALLOWED_VALUES.sex, 'sex', errors, { M: 'MALE', F: 'FEMALE' });
  const maritalStatus = oneOf(pick(raw, 'maritalStatus'), ALLOWED_VALUES.marital_status, 'marital_status', errors);
  const yn = { TRUE: 'YES', FALSE: 'NO', Y: 'YES', N: 'NO' };
  const baptism = oneOf(pick(raw, 'baptism'), ALLOWED_VALUES.baptism_status, 'baptism_status', errors, yn);
  const confirmation = oneOf(pick(raw, 'confirmation'), ALLOWED_VALUES.confirmation_status, 'confirmation_status', errors, yn);
  if (baptism || confirmation) warnings.push('baptism/confirmation values are kept for review only; no sacrament record is created');

  const email = pick(raw, 'email').toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`email: "${email}" is not valid`);
  const dob = pick(raw, 'dateOfBirth');
  if (dob) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? new Date(`${dob}T00:00:00.000Z`) : null;
    if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dob) errors.push('date_of_birth: use a real date as YYYY-MM-DD');
    else if (d.getTime() > Date.now()) errors.push('date_of_birth: is in the future');
  }

  const organizationNames = [...new Set(pick(raw, 'organization').split(/[;|]/).map((s) => s.trim()).filter(Boolean))];
  if (errors.length) return { parsed: null, errors, warnings };
  return {
    parsed: {
      firstName, lastName, middleName: pick(raw, 'middleName') || null, phone, gender, maritalStatus, baptism, confirmation,
      sectionName: pick(raw, 'section') || null, organizationNames, email: email || null, address: pick(raw, 'address') || null, dateOfBirth: dob || null,
    },
    errors, warnings,
  };
}

export type Candidate = { id: string; membershipNumber: string; firstName: string; lastName: string; phone: string | null };

/**
 * Candidates, never proof. A match needs the same full name, or the same phone together with the same first
 * name or surname. The same phone alone only produces a warning, because families share numbers.
 */
export function findCandidates(p: Pick<Parsed, 'firstName' | 'lastName' | 'phone'>, pool: Candidate[]) {
  const matches: { memberId: string; membershipNumber: string; name: string; why: string }[] = [];
  const warnings: string[] = [];
  const pd = digits(p.phone);
  for (const m of pool) {
    const sameFirst = nameKey(m.firstName) === nameKey(p.firstName);
    const sameLast = nameKey(m.lastName) === nameKey(p.lastName);
    const samePhone = !!pd && pd.length >= 7 && digits(m.phone).slice(-9) === pd.slice(-9);
    const why = sameFirst && sameLast ? (samePhone ? 'same name and phone' : 'same name') : samePhone && (sameFirst || sameLast) ? `same phone and ${sameFirst ? 'first name' : 'surname'}` : null;
    if (why) matches.push({ memberId: m.id, membershipNumber: m.membershipNumber, name: `${m.firstName} ${m.lastName}`, why });
    else if (samePhone) warnings.push(`phone is also held by ${m.firstName} ${m.lastName} (${m.membershipNumber}); shared numbers are allowed`);
  }
  return { matches, warnings };
}
