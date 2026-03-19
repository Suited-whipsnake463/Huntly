import type { FastifyInstance } from 'fastify';
import { outreachRepo } from '../db/index.js';
import { apiKeyAuth } from '../middleware/api-key-auth.js';
import { prisma } from '../lib/prisma.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CampaignEmailsParams {
  campaignId: string;
}

interface CampaignEmailsQuery {
  status?: string;
}

interface LeadIdParams {
  id: string;
}

/* ------------------------------------------------------------------ */
/*  Plugin                                                             */
/* ------------------------------------------------------------------ */

export default async function outreachRoutes(app: FastifyInstance) {
  app.addHook('onRequest', apiKeyAuth);

  /* GET /campaigns/:campaignId/emails — list outreach emails */
  app.get<{ Params: CampaignEmailsParams; Querystring: CampaignEmailsQuery }>(
    '/campaigns/:campaignId/emails',
    async (request, reply) => {
      const { campaignId } = request.params;
      const { status } = request.query;

      const where: Record<string, unknown> = { campaignId };
      if (status) {
        where.status = status;
      }

      const emails = await prisma.outreachEmail.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { lead: { select: { id: true, businessName: true, email: true } } },
      });

      return reply.send(emails);
    },
  );

  /* POST /leads/:id/pause-drip — pause drip for a lead */
  app.post<{ Params: LeadIdParams }>(
    '/leads/:id/pause-drip',
    async (request, reply) => {
      const result = await outreachRepo.pauseDripForLead(request.params.id);
      return reply.send({
        status: 'paused',
        leadId: request.params.id,
        cancelledCount: result.count,
      });
    },
  );

  /* GET /stats — sending stats */
  app.get('/stats', async (_request, reply) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [sentToday, totalOpens, totalClicks, totalBounces, totalReplies] =
      await Promise.all([
        prisma.outreachEmail.count({
          where: { sentAt: { gte: today } },
        }),
        prisma.outreachEmail.count({
          where: { status: 'opened' },
        }),
        prisma.outreachEmail.count({
          where: { status: 'clicked' },
        }),
        prisma.outreachEmail.count({
          where: { status: 'bounced' },
        }),
        prisma.lead.count({
          where: { hasReplied: true },
        }),
      ]);

    return reply.send({
      sentToday,
      totalOpens,
      totalClicks,
      totalBounces,
      totalReplies,
    });
  });
}
