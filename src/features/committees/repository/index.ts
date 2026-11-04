import { prisma } from '@/database';

const include = { _count: { select: { members: true } } } as const;
export class CommitteeRepository {
  async list(churchId: string) { return prisma.committee.findMany({ where: { churchId }, include, orderBy: { name: 'asc' } }); }
  async findById(id: string, churchId: string) { return prisma.committee.findFirst({ where: { id, churchId }, include }); }
  async create(data: { churchId: string; name: string; description?: string }) { return prisma.committee.create({ data, include }); }
  async update(id: string, churchId: string, data: { name?: string; description?: string }) {
    const committee = await prisma.committee.findFirst({ where: { id, churchId }, select: { id: true } });
    return committee ? prisma.committee.update({ where: { id }, data, include }) : null;
  }
}
export const committeeRepository = new CommitteeRepository();
