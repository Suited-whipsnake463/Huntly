import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { campaignRepo } from '../db/index.js';
import { sourceQueue } from '../workers/source.worker.js';
import { apiKeyAuth } from '../middleware/api-key-auth.js';
import { prisma } from '../lib/prisma.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CreateBody {
  name: string;
  vertical: string;
  regions: string[];
  dripConfig?: Record<string, unknown>;
  senderAddress?: string;
}

interface UpdateBody {
  name?: string;
  status?: 'draft' | 'active' | 'paused' | 'completed';
  regions?: string[];
  senderAddress?: string;
  dripConfig?: Record<string, unknown>;
}

interface IdParams {
  id: string;
}

/* ------------------------------------------------------------------ */
/*  Plugin                                                             */
/* ------------------------------------------------------------------ */

export default async function campaignRoutes(app: FastifyInstance) {
  app.addHook('onRequest', apiKeyAuth);

  /* POST /campaigns — create */
  app.post<{ Body: CreateBody }>('/campaigns', async (request, reply) => {
    const { name, vertical, regions, dripConfig, senderAddress } = request.body;

    const campaign = await campaignRepo.create({
      name,
      vertical,
      regions,
      dripConfig: (dripConfig ?? {}) as Prisma.InputJsonValue,
      senderAddress,
    });

    return reply.status(201).send(campaign);
  });

  /* GET /campaigns — list with lead counts */
  app.get('/campaigns', async (_request, reply) => {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { leads: true } },
        leads: {
          select: { status: true },
        },
      },
    });

    const result = campaigns.map((c) => {
      const statusCounts: Record<string, number> = {};
      for (const lead of c.leads) {
        statusCounts[lead.status] = (statusCounts[lead.status] ?? 0) + 1;
      }
      const { leads: _leads, ...rest } = c;
      return { ...rest, leadsByStatus: statusCounts };
    });

    return reply.send(result);
  });

  /* GET /campaigns/:id — detail with funnel stats */
  app.get<{ Params: IdParams }>('/campaigns/:id', async (request, reply) => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: request.params.id },
      include: {
        leads: { select: { status: true } },
      },
    });

    if (!campaign) {
      return reply.status(404).send({ error: 'Campaign not found' });
    }

    const funnel: Record<string, number> = {};
    for (const lead of campaign.leads) {
      funnel[lead.status] = (funnel[lead.status] ?? 0) + 1;
    }
    const { leads: _leads, ...rest } = campaign;

    return reply.send({ ...rest, funnel });
  });

  /* PATCH /campaigns/:id — update */
  app.patch<{ Params: IdParams; Body: UpdateBody }>(
    '/campaigns/:id',
    async (request, reply) => {
      const { name, status, regions, senderAddress, dripConfig } = request.body;

      const existing = await campaignRepo.findById(request.params.id);
      if (!existing) {
        return reply.status(404).send({ error: 'Campaign not found' });
      }

      const updated = await prisma.campaign.update({
        where: { id: request.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(status !== undefined && { status }),
          ...(regions !== undefined && { regions }),
          ...(senderAddress !== undefined && { senderAddress }),
          ...(dripConfig !== undefined && { dripConfig: dripConfig as Prisma.InputJsonValue }),
        },
      });

      return reply.send(updated);
    },
  );

  /* POST /campaigns/:id/launch — activate + enqueue source job */
  app.post<{ Params: IdParams }>(
    '/campaigns/:id/launch',
    async (request, reply) => {
      const campaign = await campaignRepo.findById(request.params.id);
      if (!campaign) {
        return reply.status(404).send({ error: 'Campaign not found' });
      }

      await campaignRepo.updateStatus(campaign.id, 'active');

      await sourceQueue.add('source-campaign', {
        campaignId: campaign.id,
      });

      return reply.send({ status: 'launched', campaignId: campaign.id });
    },
  );

  /* POST /campaigns/:id/stop — pause campaign */
  app.post<{ Params: IdParams }>(
    '/campaigns/:id/stop',
    async (request, reply) => {
      const campaign = await campaignRepo.findById(request.params.id);
      if (!campaign) {
        return reply.status(404).send({ error: 'Campaign not found' });
      }

      await campaignRepo.updateStatus(campaign.id, 'paused');
      return reply.send({ status: 'paused', campaignId: campaign.id });
    },
  );

  /* GET /campaigns/:id/analytics — campaign email & conversion analytics */
  app.get<{ Params: IdParams }>(
    '/campaigns/:id/analytics',
    async (request, reply) => {
      const { id: campaignId } = request.params;

      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign) {
        return reply.status(404).send({ error: 'Campaign not found' });
      }

      // Count emails by status
      const emailCounts = await prisma.outreachEmail.groupBy({
        by: ['status'],
        where: { campaignId },
        _count: { status: true },
      });

      const statusMap: Record<string, number> = {};
      let total = 0;
      for (const row of emailCounts) {
        statusMap[row.status] = row._count.status;
        total += row._count.status;
      }

      const sent = total - (statusMap['scheduled'] ?? 0);
      const delivered = (statusMap['delivered'] ?? 0) + (statusMap['opened'] ?? 0) + (statusMap['clicked'] ?? 0);
      const opened = (statusMap['opened'] ?? 0) + (statusMap['clicked'] ?? 0);
      const clicked = statusMap['clicked'] ?? 0;
      const bounced = statusMap['bounced'] ?? 0;

      // Count replied + converted leads for this campaign
      const leadCounts = await prisma.lead.groupBy({
        by: ['status'],
        where: { campaignId, status: { in: ['replied', 'converted'] } },
        _count: { status: true },
      });

      const leadMap: Record<string, number> = {};
      for (const row of leadCounts) {
        leadMap[row.status] = row._count.status;
      }

      const replied = leadMap['replied'] ?? 0;
      const converted = leadMap['converted'] ?? 0;

      // Compute rates (avoid division by zero)
      const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 1000) / 10 : 0;
      const openRate = delivered > 0 ? Math.round((opened / delivered) * 1000) / 10 : 0;
      const clickRate = opened > 0 ? Math.round((clicked / opened) * 1000) / 10 : 0;
      const bounceRate = sent > 0 ? Math.round((bounced / sent) * 1000) / 10 : 0;
      const replyRate = delivered > 0 ? Math.round((replied / delivered) * 1000) / 10 : 0;
      const conversionRate = delivered > 0 ? Math.round((converted / delivered) * 1000) / 10 : 0;

      return reply.send({
        total,
        sent,
        delivered,
        opened,
        clicked,
        bounced,
        replied,
        converted,
        rates: {
          deliveryRate,
          openRate,
          clickRate,
          bounceRate,
          replyRate,
          conversionRate,
        },
      });
    },
  );

  /* DELETE /campaigns/:id — delete campaign + all its leads, enrichments, qualifications, emails */
  app.delete<{ Params: IdParams }>(
    '/campaigns/:id',
    async (request, reply) => {
      const campaign = await campaignRepo.findById(request.params.id);
      if (!campaign) {
        return reply.status(404).send({ error: 'Campaign not found' });
      }

      // Delete in order: outreach emails → qualifications → enrichments → leads → campaign
      await prisma.outreachEmail.deleteMany({ where: { campaignId: campaign.id } });
      const leadIds = await prisma.lead.findMany({ where: { campaignId: campaign.id }, select: { id: true } });
      const ids = leadIds.map(l => l.id);
      if (ids.length > 0) {
        await prisma.leadQualification.deleteMany({ where: { leadId: { in: ids } } });
        await prisma.leadEnrichment.deleteMany({ where: { leadId: { in: ids } } });
      }
      await prisma.lead.deleteMany({ where: { campaignId: campaign.id } });
      await prisma.campaign.delete({ where: { id: campaign.id } });

      return reply.send({ status: 'deleted', campaignId: campaign.id });
    },
  );
}
