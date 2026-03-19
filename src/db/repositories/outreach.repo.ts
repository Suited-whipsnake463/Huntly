import { prisma } from '../../lib/prisma.js';
import { EmailStatus, Prisma } from '@prisma/client';

export const outreachRepo = {
  async create(data: Prisma.OutreachEmailCreateInput) {
    return prisma.outreachEmail.create({ data });
  },

  async findByLeadId(leadId: string) {
    return prisma.outreachEmail.findMany({
      where: { leadId },
      orderBy: { sequenceNumber: 'asc' },
    });
  },

  async findByResendMessageId(messageId: string) {
    return prisma.outreachEmail.findFirst({
      where: { resendMessageId: messageId },
    });
  },

  async updateStatus(
    id: string,
    status: EmailStatus,
    extra?: { sentAt?: Date; deliveredAt?: Date; openedAt?: Date; clickedAt?: Date; resendMessageId?: string },
  ) {
    return prisma.outreachEmail.update({
      where: { id },
      data: { status, ...extra },
    });
  },

  async findScheduledBefore(date: Date, limit = 100) {
    return prisma.outreachEmail.findMany({
      where: { status: 'scheduled', scheduledFor: { lte: date } },
      take: limit,
      orderBy: { scheduledFor: 'asc' },
      include: { lead: true, campaign: true },
    });
  },

  async pauseDripForLead(leadId: string) {
    return prisma.outreachEmail.updateMany({
      where: { leadId, status: 'scheduled' },
      data: { status: 'failed' },
    });
  },

  async findByCampaignId(campaignId: string) {
    return prisma.outreachEmail.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'asc' },
    });
  },

  async hasClickedAny(leadId: string): Promise<boolean> {
    const count = await prisma.outreachEmail.count({
      where: { leadId, status: 'clicked' },
    });
    return count > 0;
  },
};
