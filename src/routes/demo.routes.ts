import type { FastifyInstance } from 'fastify';
import { leadRepo } from '../db/index.js';
import { renderDemoPage } from '../services/demo-page.service.js';

/* ------------------------------------------------------------------ */
/*  Types for the included relations                                    */
/* ------------------------------------------------------------------ */

interface DemoPageData {
  businessName: string;
  customerMessage: string;
  botReply: string;
  followUp: string;
  botConfirm: string;
}

/* ------------------------------------------------------------------ */
/*  Plugin                                                              */
/* ------------------------------------------------------------------ */

export default async function demoRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>(
    '/demo/:token',
    async (request, reply) => {
      const { token } = request.params;

      // 1. Look up lead by demo token
      const lead = await leadRepo.findByDemoToken(token);
      if (!lead) {
        return reply.status(404).send({ error: 'Not found' });
      }

      // 2. Check expiry
      if (lead.demoExpiresAt && new Date() > lead.demoExpiresAt) {
        return reply.status(404).send({ error: 'Not found' });
      }

      // 3. Must have qualification data
      if (!lead.qualification) {
        return reply.status(404).send({ error: 'Not found' });
      }

      // 4. Build signup URL
      const signupUrl =
        `https://appai.sigmaintel.io/signup?ref=huntly&lead=${lead.id}&vertical=${encodeURIComponent(lead.campaign.vertical)}`;

      // 5. Render demo page
      const demoData = lead.qualification.demoPageData as unknown as DemoPageData;
      const html = renderDemoPage({
        businessName: demoData.businessName,
        demoScenario: {
          customerMessage: demoData.customerMessage,
          botReply: demoData.botReply,
          followUp: demoData.followUp,
          botConfirm: demoData.botConfirm,
        },
        signupUrl,
      });

      return reply.type('text/html').send(html);
    },
  );
}
