import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const statuses = ['Active', 'Inactive', 'Transferred', 'Deceased', 'Removed'];

  for (const name of statuses) {
    await prisma.membershipStatus.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} membership status` },
    });
  }

  console.log('Seed: membership statuses ensured');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
