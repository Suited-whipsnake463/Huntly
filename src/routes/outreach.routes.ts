import type { FastifyInstance } from 'fastify';
import { outreachRepo } from '../db/index.js';
import { apiKeyAuth } from '../middleware/api-key-auth.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { Queue } from 'bullmq';

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

  /* GET /pipeline — pipeline status: queue depths + lead stats */
  app.get('/pipeline', async (_request, reply) => {
    const connection = redis as any;
    const queueNames = ['source', 'enrich', 'qualify', 'outreach'] as const;

    const queues: Record<string, Record<string, number>> = {};
    for (const name of queueNames) {
      const q = new Queue(name, { connection });
      queues[name] = await q.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed');
    }

    // Lead stats with email/website counts
    const leadStats = await prisma.$queryRawUnsafe<Array<{
      status: string;
      count: bigint;
      with_email: bigint;
      with_website: bigint;
    }>>(`
      SELECT
        status,
        count(*) as count,
        count(*) FILTER (WHERE email IS NOT NULL) as with_email,
        count(*) FILTER (WHERE website_url IS NOT NULL) as with_website
      FROM leads
      GROUP BY status
      ORDER BY count DESC
    `);

    // Recent errors
    const recentErrors = await prisma.lead.findMany({
      where: { lastError: { not: null } },
      select: { id: true, businessName: true, status: true, lastError: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    // Recent leads (last 20 processed)
    const recentActivity = await prisma.lead.findMany({
      select: {
        id: true,
        businessName: true,
        status: true,
        email: true,
        googleRating: true,
        googleReviewCount: true,
        updatedAt: true,
        qualification: { select: { fitScore: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    return reply.send({
      queues,
      leadStats: leadStats.map(r => ({
        status: r.status,
        count: Number(r.count),
        withEmail: Number(r.with_email),
        withWebsite: Number(r.with_website),
      })),
      recentErrors,
      recentActivity,
    });
  });
}
