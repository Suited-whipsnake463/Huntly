import type { FastifyInstance } from 'fastify';
import { leadRepo } from '../db/index.js';
import { apiKeyAuth } from '../middleware/api-key-auth.js';
import { prisma } from '../lib/prisma.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CampaignLeadsParams {
  campaignId: string;
}

interface CampaignLeadsQuery {
  status?: string;
  minScore?: string;
  maxScore?: string;
  limit?: string;
  offset?: string;
}

interface LeadIdParams {
  id: string;
}

/* ------------------------------------------------------------------ */
/*  Plugin                                                             */
/* ------------------------------------------------------------------ */

export default async function leadRoutes(app: FastifyInstance) {
  app.addHook('onRequest', apiKeyAuth);

  /* GET /campaigns/:campaignId/leads — list leads with filters */
  app.get<{ Params: CampaignLeadsParams; Querystring: CampaignLeadsQuery }>(
    '/campaigns/:campaignId/leads',
    async (request, reply) => {
      const { campaignId } = request.params;
      const {
        status,
        minScore,
        maxScore,
        limit: limitStr,
        offset: offsetStr,
      } = request.query;

      const limit = limitStr ? parseInt(limitStr, 10) : 50;
      const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

      const where: Record<string, unknown> = { campaignId };
      if (status) {
        where.status = status;
      }

      // Score filtering via qualification relation
      if (minScore || maxScore) {
        const scoreFilter: Record<string, unknown> = {};
        if (minScore) scoreFilter.gte = parseInt(minScore, 10);
        if (maxScore) scoreFilter.lte = parseInt(maxScore, 10);
        where.qualification = { fitScore: scoreFilter };
      }

      const leads = await prisma.lead.findMany({
        where,
        include: { enrichment: true, qualification: true },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      });

      return reply.send(leads);
    },
  );

  /* GET /leads/:id — lead detail */
  app.get<{ Params: LeadIdParams }>('/leads/:id', async (request, reply) => {
    const lead = await leadRepo.findById(request.params.id);
    if (!lead) {
      return reply.status(404).send({ error: 'Lead not found' });
    }
    return reply.send(lead);
  });

  /* POST /leads/:id/approve — enqueue outreach for score 40-69 leads */
  app.post<{ Params: LeadIdParams }>(
    '/leads/:id/approve',
    async (request, reply) => {
      const lead = await leadRepo.findById(request.params.id);
      if (!lead) {
        return reply.status(404).send({ error: 'Lead not found' });
      }

      if (!lead.qualification) {
        return reply
          .status(400)
          .send({ error: 'Lead has no qualification data' });
      }

      const score = lead.qualification.fitScore;
      if (score < 40 || score > 69) {
        return reply
          .status(400)
          .send({ error: 'Approve is only for leads with score 40-69' });
      }

      if (!lead.email) {
        return reply.status(400).send({ error: 'Lead has no email address' });
      }

      // Dynamic import to avoid circular dependency at module load
      const { outreachQueue } = await import('../workers/qualify.worker.js');

      await outreachQueue.add(
        'outreach-lead',
        { leadId: lead.id },
        { jobId: `outreach-${lead.id}` },
      );

      return reply.send({ status: 'approved', leadId: lead.id });
    },
  );

  /* POST /leads/:id/skip — manually skip a lead */
  app.post<{ Params: LeadIdParams }>(
    '/leads/:id/skip',
    async (request, reply) => {
      const lead = await leadRepo.findById(request.params.id);
      if (!lead) {
        return reply.status(404).send({ error: 'Lead not found' });
      }

      await leadRepo.updateStatus(lead.id, 'qualified', 'manually skipped');
      return reply.send({ status: 'skipped', leadId: lead.id });
    },
  );

  /* POST /leads/:id/convert — mark lead as converted */
  app.post<{ Params: LeadIdParams }>(
    '/leads/:id/convert',
    async (request, reply) => {
      const lead = await leadRepo.findById(request.params.id);
      if (!lead) {
        return reply.status(404).send({ error: 'Lead not found' });
      }

      await leadRepo.updateStatus(lead.id, 'converted');
      return reply.send({ status: 'converted', leadId: lead.id });
    },
  );

  /* GET /funnel — aggregate stats across all campaigns */
  app.get('/funnel', async (_request, reply) => {
    const counts = await prisma.lead.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const funnel: Record<string, number> = {};
    for (const row of counts) {
      funnel[row.status] = row._count.status;
    }

    return reply.send(funnel);
  });
}
