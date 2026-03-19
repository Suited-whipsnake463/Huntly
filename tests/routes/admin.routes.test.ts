import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const {
  mockCampaignCreate,
  mockCampaignFindById,
  mockCampaignFindAll,
  mockCampaignUpdateStatus,
  mockLeadFindById,
  mockLeadUpdateStatus,
  mockLeadFindByCampaignAndStatus,
  mockOutreachPauseDripForLead,
  mockOutreachFindByCampaignId,
  mockSourceQueueAdd,
  mockOutreachQueueAdd,
  mockPrisma,
} = vi.hoisted(() => ({
  mockCampaignCreate: vi.fn(),
  mockCampaignFindById: vi.fn(),
  mockCampaignFindAll: vi.fn(),
  mockCampaignUpdateStatus: vi.fn(),
  mockLeadFindById: vi.fn(),
  mockLeadUpdateStatus: vi.fn(),
  mockLeadFindByCampaignAndStatus: vi.fn(),
  mockOutreachPauseDripForLead: vi.fn(),
  mockOutreachFindByCampaignId: vi.fn(),
  mockSourceQueueAdd: vi.fn(),
  mockOutreachQueueAdd: vi.fn(),
  mockPrisma: {
    campaign: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    lead: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
    },
    outreachEmail: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('../../src/config.js', () => ({
  env: {
    ADMIN_API_KEY: 'test-admin-key-123',
  },
}));

vi.mock('../../src/db/index.js', () => ({
  campaignRepo: {
    create: mockCampaignCreate,
    findById: mockCampaignFindById,
    findAll: mockCampaignFindAll,
    updateStatus: mockCampaignUpdateStatus,
  },
  leadRepo: {
    findById: mockLeadFindById,
    updateStatus: mockLeadUpdateStatus,
    findByCampaignAndStatus: mockLeadFindByCampaignAndStatus,
  },
  outreachRepo: {
    pauseDripForLead: mockOutreachPauseDripForLead,
    findByCampaignId: mockOutreachFindByCampaignId,
  },
}));

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../src/workers/source.worker.js', () => ({
  sourceQueue: { add: mockSourceQueueAdd },
}));

vi.mock('../../src/workers/qualify.worker.js', () => ({
  outreachQueue: { add: mockOutreachQueueAdd },
}));

/* ------------------------------------------------------------------ */
/*  Import after mocks                                                 */
/* ------------------------------------------------------------------ */

import campaignRoutes from '../../src/routes/campaign.routes.js';
import leadRoutes from '../../src/routes/lead.routes.js';
import outreachRoutes from '../../src/routes/outreach.routes.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const API_KEY = 'test-admin-key-123';

function buildApp() {
  const app = Fastify();
  app.register(campaignRoutes);
  app.register(leadRoutes);
  app.register(outreachRoutes);
  return app;
}

function authHeaders(json = true) {
  const h: Record<string, string> = { 'x-api-key': API_KEY };
  if (json) h['content-type'] = 'application/json';
  return h;
}

function makeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 'campaign-001',
    name: 'Dental Outreach',
    status: 'draft',
    vertical: 'dental',
    regions: ['São Paulo', 'Rio de Janeiro'],
    dripConfig: {},
    senderAddress: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    emailTemplateSetId: null,
    ...overrides,
  };
}

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-001',
    campaignId: 'campaign-001',
    businessName: 'Acme Dental',
    category: 'dentist',
    status: 'qualified',
    email: 'owner@acme.com',
    enrichment: { hasWhatsapp: true, hasChatbot: false },
    qualification: { fitScore: 55, scoreReasoning: 'good fit', personalizedHook: 'hook' },
    outreachEmails: [],
    campaign: makeCampaign(),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests — Auth middleware                                             */
/* ------------------------------------------------------------------ */

describe('API Key Auth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 without API key', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/campaigns' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Invalid API key' });
  });

  it('returns 401 with wrong API key', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/campaigns',
      headers: { 'x-api-key': 'wrong-key' },
    });
    expect(res.statusCode).toBe(401);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests — Campaign routes                                            */
/* ------------------------------------------------------------------ */

describe('Campaign routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST /campaigns creates a campaign', async () => {
    const created = makeCampaign();
    mockCampaignCreate.mockResolvedValue(created);
    const app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns',
      headers: authHeaders(),
      payload: {
        name: 'Dental Outreach',
        vertical: 'dental',
        regions: ['São Paulo'],
      },
    });

    expect(res.statusCode).toBe(201);
    expect(mockCampaignCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Dental Outreach',
        vertical: 'dental',
        regions: ['São Paulo'],
      }),
    );
  });

  it('GET /campaigns returns list with lead counts', async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([
      {
        ...makeCampaign(),
        _count: { leads: 3 },
        leads: [
          { status: 'sourced' },
          { status: 'sourced' },
          { status: 'qualified' },
        ],
      },
    ]);
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].leadsByStatus).toEqual({ sourced: 2, qualified: 1 });
  });

  it('GET /campaigns/:id returns campaign with funnel', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue({
      ...makeCampaign(),
      leads: [
        { status: 'sourced' },
        { status: 'enriched' },
        { status: 'enriched' },
      ],
    });
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-001',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.funnel).toEqual({ sourced: 1, enriched: 2 });
  });

  it('GET /campaigns/:id returns 404 for missing campaign', async () => {
    mockPrisma.campaign.findUnique.mockResolvedValue(null);
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/nonexistent',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /campaigns/:id/launch activates and enqueues source job', async () => {
    mockCampaignFindById.mockResolvedValue(makeCampaign());
    mockCampaignUpdateStatus.mockResolvedValue(makeCampaign({ status: 'active' }));
    mockSourceQueueAdd.mockResolvedValue({});
    const app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-001/launch',
      headers: authHeaders(false),
    });

    expect(res.statusCode).toBe(200);
    expect(mockCampaignUpdateStatus).toHaveBeenCalledWith('campaign-001', 'active');
    expect(mockSourceQueueAdd).toHaveBeenCalledWith('source-campaign', {
      campaignId: 'campaign-001',
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Tests — Lead routes                                                */
/* ------------------------------------------------------------------ */

describe('Lead routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /leads/:id returns lead detail', async () => {
    const lead = makeLead();
    mockLeadFindById.mockResolvedValue(lead);
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/leads/lead-001',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().businessName).toBe('Acme Dental');
  });

  it('GET /leads/:id returns 404 for missing lead', async () => {
    mockLeadFindById.mockResolvedValue(null);
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/leads/nonexistent',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(404);
  });

  it('GET /funnel returns status counts', async () => {
    mockPrisma.lead.groupBy.mockResolvedValue([
      { status: 'sourced', _count: { status: 10 } },
      { status: 'enriched', _count: { status: 5 } },
      { status: 'qualified', _count: { status: 3 } },
      { status: 'contacted', _count: { status: 2 } },
    ]);
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/funnel',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      sourced: 10,
      enriched: 5,
      qualified: 3,
      contacted: 2,
    });
  });

  it('POST /leads/:id/approve enqueues outreach for 40-69 score leads', async () => {
    mockLeadFindById.mockResolvedValue(makeLead({ qualification: { fitScore: 55 } }));
    mockOutreachQueueAdd.mockResolvedValue({});
    const app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/leads/lead-001/approve',
      headers: authHeaders(false),
    });

    expect(res.statusCode).toBe(200);
    expect(mockOutreachQueueAdd).toHaveBeenCalledWith(
      'send-drip',
      { leadId: 'lead-001', sequenceNumber: 1 },
      { jobId: 'outreach-lead-001' },
    );
  });

  it('POST /leads/:id/approve rejects score outside 40-69', async () => {
    mockLeadFindById.mockResolvedValue(makeLead({ qualification: { fitScore: 80 } }));
    const app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/leads/lead-001/approve',
      headers: authHeaders(false),
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /leads/:id/convert marks lead as converted', async () => {
    mockLeadFindById.mockResolvedValue(makeLead());
    mockLeadUpdateStatus.mockResolvedValue({});
    const app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/leads/lead-001/convert',
      headers: authHeaders(false),
    });

    expect(res.statusCode).toBe(200);
    expect(mockLeadUpdateStatus).toHaveBeenCalledWith('lead-001', 'converted');
  });
});

/* ------------------------------------------------------------------ */
/*  Tests — Outreach routes                                            */
/* ------------------------------------------------------------------ */

describe('Outreach routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /stats returns sending stats', async () => {
    mockPrisma.outreachEmail.count
      .mockResolvedValueOnce(15)  // sentToday
      .mockResolvedValueOnce(42)  // totalOpens
      .mockResolvedValueOnce(8)   // totalClicks
      .mockResolvedValueOnce(3);  // totalBounces
    mockPrisma.lead.count.mockResolvedValue(7); // totalReplies

    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/stats',
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      sentToday: 15,
      totalOpens: 42,
      totalClicks: 8,
      totalBounces: 3,
      totalReplies: 7,
    });
  });

  it('POST /leads/:id/pause-drip pauses drip emails', async () => {
    mockOutreachPauseDripForLead.mockResolvedValue({ count: 3 });
    const app = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/leads/lead-001/pause-drip',
      headers: authHeaders(false),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: 'paused',
      leadId: 'lead-001',
      cancelledCount: 3,
    });
  });
});
