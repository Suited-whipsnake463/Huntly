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
}
