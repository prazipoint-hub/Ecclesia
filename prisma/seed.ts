import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const conference = await prisma.conference.upsert({ where: { name: 'Harare Conference' }, update: { code: 'HARARE' }, create: { name: 'Harare Conference', code: 'HARARE' } });
  const district = await prisma.district.upsert({ where: { conferenceId_name: { conferenceId: conference.id, name: 'Harare District' } }, update: { code: 'HARARE-CENTRAL' }, create: { conferenceId: conference.id, name: 'Harare District', code: 'HARARE-CENTRAL' } });
  const circuit = await prisma.circuit.upsert({ where: { id: 'demo-circuit' }, update: { name: 'Harare Central Circuit', districtId: district.id }, create: { id: 'demo-circuit', districtId: district.id, name: 'Harare Central Circuit' } });
  const church = await prisma.church.upsert({ where: { id: 'demo-church' }, update: { circuitId: circuit.id, name: 'Ecclesia Community Church', location: 'Harare, Zimbabwe' }, create: { id: 'demo-church', circuitId: circuit.id, name: 'Ecclesia Community Church', location: 'Harare, Zimbabwe' } });
  const section = await prisma.section.upsert({ where: { churchId_name: { churchId: church.id, name: 'Central Section' } }, update: { code: 'CENTRAL' }, create: { churchId: church.id, name: 'Central Section', code: 'CENTRAL', description: 'Main demonstration section' } });
  const family = await prisma.family.findFirst({ where: { churchId: church.id, name: 'Moyo Family' } }) ?? await prisma.family.create({ data: { churchId: church.id, sectionId: section.id, name: 'Moyo Family' } });
  const member = await prisma.member.upsert({ where: { membershipNumber: 'ECC-0001' }, update: { churchId: church.id, sectionId: section.id, familyId: family.id, firstName: 'Admin', lastName: 'Moyo', email: 'admin@ecclesia.local' }, create: { churchId: church.id, sectionId: section.id, familyId: family.id, firstName: 'Admin', lastName: 'Moyo', email: 'admin@ecclesia.local', phone: '+263771000001', membershipNumber: 'ECC-0001', membershipStatus: 'ACTIVE', gender: 'FEMALE' } });
  const passwordHash = await bcrypt.hash('Admin#2026!', 12);
  await prisma.user.upsert({ where: { email: 'admin@ecclesia.local' }, update: { passwordHash, memberId: member.id, churchId: church.id }, create: { email: 'admin@ecclesia.local', passwordHash, memberId: member.id, churchId: church.id } });
  const account = await prisma.financialAccount.upsert({ where: { churchId: church.id }, update: {}, create: { churchId: church.id, openingBalance: 5000, currentBalance: 5000 } });
  await prisma.fund.upsert({ where: { churchId_name: { churchId: church.id, name: 'General Fund' } }, update: {}, create: { churchId: church.id, accountId: account.id, name: 'General Fund', description: 'General operating fund', balance: 5000 } });
  const permissionNames = [
    'member:view', 'member:profile:review', 'member:profile:report', 'member:profile:configure', 'member:create', 'member:update', 'family:create', 'family:update',
    'section:create', 'section:manage', 'organization:create', 'organization:manage', 'organization:view',
    'membership:status:request', 'membership:status:approve',
    'pastoral:case:view', 'pastoral:case:create', 'pastoral:case:update', 'pastoral:case:close',
    'event:view', 'event:create', 'event:update', 'event:attendance:record',
    'committee:view', 'committee:create', 'committee:update',
    'finance:view', 'finance:receipt:create', 'finance:expenditure:create', 'finance:expenditure:approve', 'finance:payment:create',
    'section_finance:view', 'section_receipt:create', 'section_expenditure:create', 'section_expenditure:approve', 'section_payment:create',
    'circuit_finance:view', 'circuit_receipt:create', 'circuit_expenditure:create', 'circuit_expenditure:approve', 'circuit_payment:create',
    'district_finance:view', 'district_receipt:create', 'district_expenditure:create', 'district_expenditure:approve', 'district_payment:create',
    'report:view:financial', 'report:view:administrative', 'report:view:audit', 'report:view:all_churches', 'report:view:hierarchy',
    'report:view:section_finance', 'report:view:organization_finance',
    'auth:invite:create', 'auth:invite:revoke',
    'member:import', 'member:export', 'member:archive', 'visitor:view', 'visitor:create', 'visitor:manage',
    'finance:coa:manage', 'finance:journal:create', 'finance:journal:approve', 'finance:journal:reverse', 'finance:budget:create', 'finance:budget:approve',
    'finance:period:manage', 'finance:fund:manage', 'finance:opening:set', 'finance:cash_session:manage', 'finance:cash_session:review', 'finance:deposit:record', 'finance:deposit:verify',
    'pastoral:visit:view', 'pastoral:visit:create', 'pastoral:visit:update',
    'pastoral:counseling:view', 'pastoral:counseling:create', 'pastoral:counseling:update', 'pastoral:counseling:confidential',
    'pastoral:prayer:view', 'pastoral:prayer:manage', 'pastoral:referral:view', 'pastoral:referral:create', 'pastoral:referral:update',
    'pastoral:followup:view', 'pastoral:followup:manage', 'pastoral:sacrament:manage',
    'pastoral:assessment:view', 'pastoral:assessment:update', 'pastoral:dashboard:view', 'pastoral:l4:access',
    'event:registration:manage', 'event:checkin:manage', 'event:qr:generate', 'volunteer:schedule:view', 'volunteer:schedule:manage',
    'attendance:analytics:view', 'absence:followup:manage',
    'report:saved:manage_all', 'report:schedule:run',
    'admin:user:manage', 'admin:role:manage', 'admin:settings:manage', 'admin:audit:view', 'admin:retention:manage', 'admin:api:view',
    'campaign:manage', 'group:view', 'group:manage', 'group:attendance:record', 'document:view', 'document:template:manage', 'document:generate', 'asset:view', 'asset:manage',
    'committee:meeting:create', 'committee:meeting:manage', 'leadership:term:manage',
    'notification:broadcast:create', 'notification:broadcast:send', 'notification:template:manage',
    'circuit:register', 'circuit:onboard', 'circuit:view', 'circuit:view:all', 'access:assign', 'access:assign:global', 'access:preview', 'leadership:import', 'leadership:position:view', 'leadership:position:manage', 'leadership:appointment:view', 'leadership:appointment:manage', 'leadership:appointment:approve',
    'payment:view:all', 'pledge:view:all', 'recurring:manage',
  ];
  const permissions = await Promise.all(permissionNames.map((name) => prisma.permission.upsert({ where: { name }, update: {}, create: { name } })));
  const role = await prisma.role.upsert({
    where: { churchId_name: { churchId: church.id, name: 'Church Administrator' } },
    update: {},
    create: { churchId: church.id, name: 'Church Administrator', description: 'Initial local administrator role' },
  });
  await Promise.all(permissions.map((permission) => prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
    update: {},
    create: { roleId: role.id, permissionId: permission.id },
  })));
  const existingAssignment = await prisma.leadershipAssignment.findFirst({
    where: { churchId: church.id, memberId: member.id, roleId: role.id, endDate: null },
  });
  if (!existingAssignment) await prisma.leadershipAssignment.create({ data: { churchId: church.id, memberId: member.id, roleId: role.id, position: 'System Administrator' } });
  console.log('Seed complete: use admin@ecclesia.local / Admin#2026!');
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
