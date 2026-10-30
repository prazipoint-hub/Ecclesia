import { Prisma } from '@prisma/client';
import { prisma } from '@/database';

const paymentInclude = {
  fund: { select: { name: true, accountId: true } },
  receipt: { select: { receiptNumber: true } },
} satisfies Prisma.PaymentInclude;

export type PaymentRecord = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export class PaymentRepository {
  findFund(churchId: string, fundId: string) {
    return prisma.fund.findFirst({ where: { id: fundId, churchId }, select: { id: true, name: true, isActive: true } });
  }

  listFunds(churchId: string) {
    return prisma.fund.findMany({ where: { churchId, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, description: true } });
  }

  findMember(memberId: string) {
    return prisma.member.findUnique({ where: { id: memberId }, select: { id: true, email: true, firstName: true } });
  }

  createPayment(data: Prisma.PaymentUncheckedCreateInput) {
    return prisma.payment.create({ data, include: paymentInclude });
  }

  updatePayment(id: string, data: Prisma.PaymentUncheckedUpdateInput) {
    return prisma.payment.update({ where: { id }, data, include: paymentInclude });
  }

  findPayment(id: string) {
    return prisma.payment.findUnique({ where: { id }, include: paymentInclude });
  }

  findPaymentByReference(reference: string) {
    return prisma.payment.findUnique({ where: { reference }, include: paymentInclude });
  }

  async listPayments(where: Prisma.PaymentWhereInput, skip: number, take: number) {
    return Promise.all([
      prisma.payment.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: paymentInclude }),
      prisma.payment.count({ where }),
    ]);
  }

  // Pledges
  findPledge(id: string) {
    return prisma.pledge.findUnique({
      where: { id },
      include: {
        fund: { select: { name: true } },
        payments: { where: { status: 'COMPLETED' }, orderBy: { paidAt: 'desc' }, select: { id: true, amount: true, currency: true, paidAt: true } },
      },
    });
  }

  createPledge(data: Prisma.PledgeUncheckedCreateInput) {
    return prisma.pledge.create({ data });
  }

  async listPledges(where: Prisma.PledgeWhereInput, skip: number, take: number) {
    return Promise.all([
      prisma.pledge.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { fund: { select: { name: true } }, payments: { where: { status: 'COMPLETED' }, select: { amount: true } } },
      }),
      prisma.pledge.count({ where }),
    ]);
  }

  updatePledge(id: string, data: Prisma.PledgeUncheckedUpdateInput) {
    return prisma.pledge.update({ where: { id }, data });
  }

  // Recurring giving
  createRecurring(data: Prisma.RecurringGivingUncheckedCreateInput) {
    return prisma.recurringGiving.create({ data, include: { fund: { select: { name: true } } } });
  }

  findRecurring(id: string) {
    return prisma.recurringGiving.findUnique({ where: { id }, include: { fund: { select: { name: true } } } });
  }

  listRecurringForMember(memberId: string) {
    return prisma.recurringGiving.findMany({ where: { memberId }, orderBy: { createdAt: 'desc' }, include: { fund: { select: { name: true } } } });
  }

  listDueRecurring(churchId: string, now: Date) {
    return prisma.recurringGiving.findMany({ where: { churchId, isActive: true, nextChargeDate: { lte: now } }, take: 200 });
  }

  updateRecurring(id: string, data: Prisma.RecurringGivingUncheckedUpdateInput) {
    return prisma.recurringGiving.update({ where: { id }, data, include: { fund: { select: { name: true } } } });
  }

  // Saved payment methods
  listSavedMethods(memberId: string) {
    return prisma.savedPaymentMethod.findMany({ where: { memberId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
  }

  findSavedMethod(id: string) {
    return prisma.savedPaymentMethod.findUnique({ where: { id } });
  }

  async createSavedMethod(data: Prisma.SavedPaymentMethodUncheckedCreateInput) {
    if (data.isDefault) await prisma.savedPaymentMethod.updateMany({ where: { memberId: data.memberId }, data: { isDefault: false } });
    return prisma.savedPaymentMethod.create({ data });
  }

  deleteSavedMethod(id: string) {
    return prisma.savedPaymentMethod.delete({ where: { id } });
  }
}

export const paymentRepository = new PaymentRepository();
