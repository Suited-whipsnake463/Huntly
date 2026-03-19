import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import { redis } from '../lib/redis.js';
import { leadRepo, qualificationRepo } from '../db/index.js';
import { qualifyLead, type QualificationInput } from '../services/qualifier.service.js';
import type { Prisma } from '@prisma/client';

// Cast needed: ioredis root vs bullmq's bundled ioredis have divergent types
const connection = redis as unknown as ConnectionOptions;

export const outreachQueue = new Queue('outreach', { connection });

interface QualifyJobData {
  leadId: string;
}

export const qualifyWorker = new Worker<QualifyJobData>(
  'qualify',
  async (job) => {
    const { leadId } = job.data;
    const lead = await leadRepo.findById(leadId);
    if (!lead) return;

    const enrichment = lead.enrichment;

    // Build qualification input from lead + enrichment
    const input: QualificationInput = {
      businessName: lead.businessName,
      category: lead.category ?? '',
      region: lead.region ?? '',
      country: lead.country ?? undefined,
      phone: lead.phone ?? undefined,
      websiteUrl: lead.websiteUrl ?? undefined,
      googleRating: lead.googleRating ?? undefined,
      googleReviewCount: lead.googleReviewCount ?? undefined,
      hasWhatsapp: enrichment?.hasWhatsapp ?? null,
      hasChatbot: enrichment?.hasChatbot ?? null,
      hasOnlineBooking: enrichment?.hasOnlineBooking ?? null,
      painSignals: Array.isArray(enrichment?.painSignals)
        ? (enrichment.painSignals as Array<{ signal: string; count: number; example: string }>)
        : [],
      reviewSentimentSummary: enrichment?.reviewSentimentSummary ?? '',
    };

    let result;
    try {
      result = await qualifyLead(input);
    } catch (err) {
      // Record error, leave status unchanged
      await leadRepo.updateStatus(
        leadId,
        lead.status,
        `qualify: ${(err as Error).message}`,
      );
      return;
    }

    // AI fallback (fitScore 30 with manual-review reasoning) — save as-is, leave status enriched
    if (
      result.fitScore === 30 &&
      result.scoreReasoning.includes('manual review')
    ) {
      await qualificationRepo.upsert(leadId, {
        fitScore: result.fitScore,
        scoreReasoning: result.scoreReasoning,
        personalizedHook: result.personalizedHook,
        demoPageData: result.demoScenario as unknown as Prisma.InputJsonValue,
      });
      return;
    }

    // Save qualification
    await qualificationRepo.upsert(leadId, {
      fitScore: result.fitScore,
      scoreReasoning: result.scoreReasoning,
      personalizedHook: result.personalizedHook,
      demoPageData: result.demoScenario as unknown as Prisma.InputJsonValue,
    });

    // Update lead status to qualified
    await leadRepo.updateStatus(leadId, 'qualified');

    // Route based on fitScore and disqualification
    const hasEmail = Boolean(lead.email);

    if (result.disqualifyReason) {
      // Disqualified — no outreach
      return;
    }

    if (!hasEmail) {
      // No email — can't send outreach, treat as disqualified
      return;
    }

    if (result.fitScore >= 70) {
      // Auto-approve: enqueue outreach
      await outreachQueue.add('send-drip', { leadId, sequenceNumber: 1 }, {
        jobId: `outreach-${leadId}`,
      });
    }

    // fitScore 40-69: qualified, manual review (no outreach enqueue)
    // fitScore < 40: qualified, auto-skip (no outreach enqueue)
  },
  {
    connection,
    concurrency: 3,
  },
);
