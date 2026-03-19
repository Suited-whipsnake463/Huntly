import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config.js';

// Import routes (default exports)
import demoRoutes from './routes/demo.routes.js';
import unsubscribeRoutes from './routes/unsubscribe.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import campaignRoutes from './routes/campaign.routes.js';
import leadRoutes from './routes/lead.routes.js';
import outreachRoutes from './routes/outreach.routes.js';

// Import workers (side-effect: starts listening on queues)
import { sourceWorker } from './workers/source.worker.js';
import { enrichWorker } from './workers/enrich.worker.js';
import { qualifyWorker } from './workers/qualify.worker.js';
import { outreachWorker } from './workers/outreach.worker.js';

const app = Fastify({ logger: true });

await app.register(cors);

// Public routes (no auth)
await app.register(demoRoutes, { prefix: '/demo' });
await app.register(unsubscribeRoutes, { prefix: '/unsubscribe' });
await app.register(webhookRoutes, { prefix: '/webhooks' });

// Admin routes (API key auth applied inside each route file)
await app.register(campaignRoutes, { prefix: '/api' });
await app.register(leadRoutes, { prefix: '/api' });
await app.register(outreachRoutes, { prefix: '/api' });

// Graceful shutdown
const shutdown = async () => {
  console.log('[shutdown] Closing workers...');
  await Promise.all([
    sourceWorker.close(),
    enrichWorker.close(),
    qualifyWorker.close(),
    outreachWorker.close(),
  ]);
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: env.PORT, host: '0.0.0.0' });
console.log(`Huntly running on port ${env.PORT}`);
