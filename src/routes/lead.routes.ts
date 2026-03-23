import type { FastifyInstance } from 'fastify';
import { leadRepo } from '../db/index.js';
import { apiKeyAuth } from '../middleware/api-key-auth.js';
import { prisma } from '../lib/prisma.js';
import { renderTemplate } from '../services/email.service.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEmailTemplate(name: string): string {
  return readFileSync(resolve(__dirname, `../templates/emails/${name}.html`), 'utf-8');
}

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
  search?: string;
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
        search,
      } = request.query;

      const limit = limitStr ? parseInt(limitStr, 10) : 50;
      const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

      const where: Record<string, unknown> = { campaignId };
      if (status) {
        where.status = status;
      }

      if (search) {
        where.businessName = { contains: search, mode: 'insensitive' };
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

  /* POST /leads/:id/approve — enqueue outreach for qualified leads with email */
  /* Query param ?sendNow=true bypasses timezone scheduling */
  app.post<{ Params: LeadIdParams; Querystring: { sendNow?: string } }>(
    '/leads/:id/approve',
    async (request, reply) => {
      const lead = await leadRepo.findById(request.params.id);
      if (!lead) {
        return reply.status(404).send({ error: 'Lead not found' });
      }

      if (lead.status !== 'qualified') {
        return reply.status(400).send({ error: `Lead status is '${lead.status}', must be 'qualified'` });
      }

      if (!lead.qualification) {
        return reply.status(400).send({ error: 'Lead has no qualification data' });
      }

      if (!lead.email) {
        return reply.status(400).send({ error: 'Lead has no email address' });
      }

      if (!env.EMAIL_ENABLED) {
        return reply.status(403).send({ error: 'Email sending is disabled. Set EMAIL_ENABLED=true to enable.' });
      }

      const sendNow = request.query.sendNow === 'true';

      if (sendNow) {
        // Send immediately — API waits for actual Resend delivery
        const { sendDripDirect } = await import('../workers/outreach.worker.js');
        const result = await sendDripDirect(lead.id, 1);
        if (result.status === 'failed') {
          return reply.status(500).send({ error: result.error, leadId: lead.id });
        }
        return reply.send({ status: 'sent', leadId: lead.id, sendNow: true });
      }

      // Scheduled send — enqueue for timezone-aware delivery
      const { outreachQueue } = await import('../workers/qualify.worker.js');

      await outreachQueue.add(
        'send-drip',
        { leadId: lead.id, sequenceNumber: 1, sendNow: false },
        { jobId: `outreach-${lead.id}-${Date.now()}` },
      );

      return reply.send({ status: 'scheduled', leadId: lead.id, sendNow: false });
    },
  );

  /* GET /leads/:id/preview — preview what email 1 would look like */
  app.get<{ Params: LeadIdParams }>(
    '/leads/:id/preview',
    async (request, reply) => {
      const lead = await leadRepo.findById(request.params.id);
      if (!lead) {
        return reply.status(404).send({ error: 'Lead not found' });
      }

      const qualification = lead.qualification;
      const enrichment = lead.enrichment;
      const painSignals = (enrichment?.painSignals as Array<{ signal: string; count: number; example: string }>) ?? [];
      const topSignal = painSignals[0];
      const painCount = topSignal?.count ?? 0;

      const ownerName = enrichment?.ownerName;
      const firstName = ownerName?.split(' ')[0];

      const mergeFields: Record<string, string> = {
        business_name: lead.businessName,
        personalized_hook: qualification?.personalizedHook ?? '',
        demo_url: `${env.BASE_URL}/demo/${lead.demoToken}`,
        count: String(painCount),
        owner_greeting: firstName ? `Hi ${firstName},` : 'Hi there,',
      };

      const unsubscribeUrl = `${env.BASE_URL}/unsubscribe/${lead.unsubscribeToken}`;

      const template = loadEmailTemplate('mirror');
      const html = renderTemplate(template, {
        ...mergeFields,
        unsubscribe_url: unsubscribeUrl,
        physical_address: lead.campaign?.senderAddress ?? env.PHYSICAL_ADDRESS,
      });

      const subject = painCount > 0
        ? `${painCount} of your customers can't reach you, ${lead.businessName}`
        : `Are your customers reaching you, ${lead.businessName}?`;

      return reply.send({
        subject,
        html,
        to: lead.email,
        from: `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
        lead: {
          id: lead.id,
          businessName: lead.businessName,
          email: lead.email,
          score: qualification?.fitScore,
          reasoning: qualification?.scoreReasoning,
          hook: qualification?.personalizedHook,
          demoScenario: qualification?.demoPageData,
        },
        enrichment: {
          hasWhatsapp: enrichment?.hasWhatsapp,
          hasChatbot: enrichment?.hasChatbot,
          hasOnlineBooking: enrichment?.hasOnlineBooking,
          emailsFound: enrichment?.emailsFound,
          painSignals,
          sentimentSummary: enrichment?.reviewSentimentSummary,
        },
      });
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
