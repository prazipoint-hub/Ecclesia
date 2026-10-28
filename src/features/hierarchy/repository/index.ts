import { prisma } from '@/database';

export const hierarchyRepository = {
  findChurchWorkspace(churchId: string) {
    return prisma.church.findUnique({
      where: { id: churchId },
      include: {
        circuit: {
          include: {
            district: { include: { conference: true } },
          },
        },
        sections: { orderBy: { name: 'asc' } },
        organizations: { where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } },
      },
    });
  },
};
