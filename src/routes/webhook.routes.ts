import type { FastifyInstance } from 'fastify';
import { Webhook } from 'svix';
import { env } from '../config.js';
import { outreachRepo, leadRepo } from '../db/index.js';
import { prisma } from '../lib/prisma.js';

/* ------------------------------------------------------------------ */
/*  Plugin                                                              */
/* ------------------------------------------------------------------ */

export default async function webhookRoutes(app: FastifyInstance) {
  /* ---------------------------------------------------------------- */
  /*  POST /webhooks/resend — Resend event webhooks                    */
  /* ---------------------------------------------------------------- */

  app.post('/webhooks/resend', async (request, reply) => {
    try {
      const headers = request.headers as Record<string, string>;
      const body = JSON.stringify(request.body);

      /* 1. Verify signature (skip if no secret configured) */
      if (env.RESEND_WEBHOOK_SECRET) {
        const wh = new Webhook(env.RESEND_WEBHOOK_SECRET);
        wh.verify(body, headers);
      }

      /* 2. Parse event */
      const event = request.body as { type: string; data: { email_id: string } };
      const { type, data } = event;

      /* 3. Look up outreach email */
      const outreachEmail = await outreachRepo.findByResendMessageId(data.email_id);
      if (!outreachEmail) {
        request.log.warn(`[webhook] No outreach email found for resend message ${data.email_id}`);
        return reply.status(200).send({ ok: true });
      }

      /* 4. Update based on event type */
      switch (type) {
        case 'email.sent':
          await outreachRepo.updateStatus(outreachEmail.id, 'sending', { sentAt: new Date() });
          break;

        case 'email.delivered':
          await outreachRepo.updateStatus(outreachEmail.id, 'delivered', { deliveredAt: new Date() });
          break;

        case 'email.opened':
          await outreachRepo.updateStatus(outreachEmail.id, 'opened', { openedAt: new Date() });

          /* Auto follow-up: if email 1 was opened but no clicks, fast-track email 2 */
          if (outreachEmail.sequenceNumber === 1) {
            const hasClicks = await outreachRepo.hasClickedAny(outreachEmail.leadId);
            if (!hasClicks) {
              const existingEmail2 = await prisma.outreachEmail.findFirst({
                where: { leadId: outreachEmail.leadId, sequenceNumber: 2 },
              });
              if (!existingEmail2) {
                const { outreachQueue } = await import('../workers/qualify.worker.js');
                await outreachQueue.add(
                  'send-drip',
                  { leadId: outreachEmail.leadId, sequenceNumber: 2 },
                  { jobId: `auto-followup-${outreachEmail.leadId}-2-${Date.now()}` },
                );
                const lead = await prisma.lead.findUnique({ where: { id: outreachEmail.leadId }, select: { businessName: true } });
                console.log(`[webhook] Auto follow-up: opened email 1, fast-tracking email 2 for ${lead?.businessName ?? outreachEmail.leadId}`);
              }
            }
          }
          break;

        case 'email.clicked':
          await outreachRepo.updateStatus(outreachEmail.id, 'clicked', { clickedAt: new Date() });
          await outreachRepo.pauseDripForLead(outreachEmail.leadId);
          break;

        case 'email.bounced':
          await outreachRepo.updateStatus(outreachEmail.id, 'bounced');
          await leadRepo.updateStatus(outreachEmail.leadId, 'sourced');
          break;

        case 'email.complained':
          await outreachRepo.updateStatus(outreachEmail.id, 'complained');
          await leadRepo.unsubscribe(outreachEmail.leadId);
          break;

        default:
          request.log.info(`[webhook] Ignoring unknown event type: ${type}`);
      }

      return reply.status(200).send({ ok: true });
    } catch (err) {
      request.log.error(err, '[webhook] Error processing Resend webhook');
      return reply.status(200).send({ ok: true });
    }
  });

  /* ---------------------------------------------------------------- */
  /*  POST /webhooks/reply — Resend inbound email routing              */
  /* ---------------------------------------------------------------- */

  app.post('/webhooks/reply', async (request, reply) => {
    try {
      const payload = request.body as { from: string };
      const senderEmail = payload.from;

      const lead = await leadRepo.findByEmail(senderEmail);
      if (!lead) {
        request.log.info(`[reply] No lead found for sender: ${senderEmail}`);
        return reply.status(200).send({ ok: true });
      }

      await leadRepo.markReplied(lead.id);
      await outreachRepo.pauseDripForLead(lead.id);

      request.log.info(`[reply] Lead ${lead.businessName} replied`);

      return reply.status(200).send({ ok: true });
    } catch (err) {
      request.log.error(err, '[reply] Error processing reply webhook');
      return reply.status(200).send({ ok: true });
    }
  });
}
