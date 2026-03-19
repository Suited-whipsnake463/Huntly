import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ====================================================================== */
/*  Shared mock state                                                      */
/* ====================================================================== */

// --- External services ---
const mockSearchBusinesses = vi.fn();
const mockFetchReviews = vi.fn();
const mockCrawlWebsite = vi.fn();
const mockAnalyzeReviews = vi.fn();
const mockQualifyLead = vi.fn();
const mockSendEmail = vi.fn();

// --- Redis ---
const mockRedisGet = vi.fn();
const mockRedisIncr = vi.fn();
const mockRedisExpire = vi.fn();

// --- Repos ---
const mockCampaignRepo = { findById: vi.fn() };

const mockLeadRepo = {
  findById: vi.fn(),
  existsByPlaceId: vi.fn(),
  createFromSource: vi.fn(),
  setEmail: vi.fn(),
  updateStatus: vi.fn(),
  setDemoExpiry: vi.fn(),
  findByUnsubscribeToken: vi.fn(),
  unsubscribe: vi.fn(),
};

const mockEnrichmentRepo = { upsert: vi.fn() };
const mockQualificationRepo = { upsert: vi.fn() };

const mockOutreachRepo = {
  create: vi.fn(),
  updateStatus: vi.fn(),
  hasClickedAny: vi.fn(),
  findScheduledBefore: vi.fn(),
  pauseDripForLead: vi.fn(),
};

const mockExcludedClientRepo = { isExcluded: vi.fn() };

// --- Queue tracking ---
// We need to track queue.add calls per queue name so we can verify
// cross-worker enqueue calls and simulate the next worker in the chain.
const queueAddCalls: Record<string, Array<{ jobName: string; data: unknown; opts?: unknown }>> = {};

function trackQueueAdd(queueName: string) {
  return vi.fn().mockImplementation((jobName: string, data: unknown, opts?: unknown) => {
    if (!queueAddCalls[queueName]) queueAddCalls[queueName] = [];
    queueAddCalls[queueName]!.push({ jobName, data, opts });
    return Promise.resolve({});
  });
}

const mockEnrichQueueAdd = trackQueueAdd('enrich');
const mockQualifyQueueAdd = trackQueueAdd('qualify');
const mockOutreachQueueAdd = trackQueueAdd('outreach');

// --- Captured processors ---
type AnyProcessor = (job: { name: string; data: Record<string, unknown> }) => Promise<void>;

const processors: Record<string, AnyProcessor> = {};

/* ====================================================================== */
/*  vi.mock — must be hoisted before any dynamic import                    */
/* ====================================================================== */

vi.mock('bullmq', () => {
  class MockQueue {
    name: string;
    add: ReturnType<typeof vi.fn>;
    constructor(name: string) {
      this.name = name;
      if (name === 'enrich') this.add = mockEnrichQueueAdd;
      else if (name === 'qualify') this.add = mockQualifyQueueAdd;
      else if (name === 'outreach') this.add = mockOutreachQueueAdd;
      else this.add = vi.fn();
    }
  }
  class MockWorker {
    name: string;
    constructor(name: string, processor: AnyProcessor) {
      this.name = name;
      processors[name] = processor;
    }
  }
  return { Queue: MockQueue, Worker: MockWorker };
});

vi.mock('../../src/lib/redis.js', () => ({
  redis: {
    get: (...args: unknown[]) => mockRedisGet(...args),
    set: vi.fn(),
    incr: (...args: unknown[]) => mockRedisIncr(...args),
    expire: (...args: unknown[]) => mockRedisExpire(...args),
    del: vi.fn(),
    duplicate: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
  },
}));

vi.mock('../../src/services/outscraper.service.js', () => ({
  searchBusinesses: (...args: unknown[]) => mockSearchBusinesses(...args),
  fetchReviews: (...args: unknown[]) => mockFetchReviews(...args),
}));

vi.mock('../../src/services/crawler.service.js', () => ({
  crawlWebsite: (...args: unknown[]) => mockCrawlWebsite(...args),
}));

vi.mock('../../src/services/review-analyzer.service.js', () => ({
  analyzeReviews: (...args: unknown[]) => mockAnalyzeReviews(...args),
}));

vi.mock('../../src/services/qualifier.service.js', () => ({
  qualifyLead: (...args: unknown[]) => mockQualifyLead(...args),
}));

vi.mock('../../src/services/email.service.js', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock('../../src/db/index.js', () => ({
  campaignRepo: mockCampaignRepo,
  leadRepo: mockLeadRepo,
  enrichmentRepo: mockEnrichmentRepo,
  qualificationRepo: mockQualificationRepo,
  outreachRepo: mockOutreachRepo,
  excludedClientRepo: mockExcludedClientRepo,
}));

vi.mock('../../src/config.js', () => ({
  env: {
    BASE_URL: 'https://huntly.test',
    PHYSICAL_ADDRESS: '123 Test St',
    SENDER_EMAIL: 'hello@test.com',
    SENDER_NAME: 'Huntly',
  },
}));

/* ====================================================================== */
/*  Dynamic imports — trigger module evaluation (registers processors)     */
/* ====================================================================== */

await import('../../src/workers/source.worker.js');
await import('../../src/workers/enrich.worker.js');
await import('../../src/workers/qualify.worker.js');
await import('../../src/workers/outreach.worker.js');

/* ====================================================================== */
/*  Helpers                                                                */
/* ====================================================================== */

function sourceProcessor() {
  return processors['source']!;
}

function enrichProcessor() {
  return processors['enrich']!;
}

function qualifyProcessor() {
  return processors['qualify']!;
}

function outreachProcessor() {
  return processors['outreach']!;
}

/* ====================================================================== */
/*  Test fixtures                                                          */
/* ====================================================================== */

function makeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 'camp-1',
    name: 'Dental BH',
    status: 'active',
    vertical: 'dentists',
    regions: ['Belo Horizonte'],
    senderAddress: null,
    ...overrides,
  };
}

function makeOutscraperResult(overrides: Record<string, unknown> = {}) {
  return {
    businessName: 'Acme Dental',
    category: 'Dentist',
    address: '123 Main St',
    phone: '+5531999887766',
    websiteUrl: 'https://acmedental.com',
    googleMapsPlaceId: 'ChIJ_abc123',
    googleRating: 4.5,
    googleReviewCount: 120,
    raw: { place_id: 'ChIJ_abc123', name: 'Acme Dental' },
    ...overrides,
  };
}

function makeCrawlResult(overrides: Record<string, unknown> = {}) {
  return {
    emails: ['contact@acmedental.com', 'admin@acmedental.com'],
    hasWhatsapp: true,
    hasChatbot: false,
    hasOnlineBooking: false,
    techSignals: { pagesCrawled: 3 },
    ...overrides,
  };
}

function makeReviewAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    sentimentSummary: 'Good dentists but hard to reach.',
    painSignals: [
      { signal: 'slow_response', count: 5, example: 'Took 3 days to reply' },
      { signal: 'hard_to_book', count: 3, example: 'Hard to book an appointment' },
    ],
    positiveThemes: ['friendly staff', 'clean office'],
    totalAnalyzed: 15,
    ...overrides,
  };
}

function makeQualificationResult(overrides: Record<string, unknown> = {}) {
  return {
    fitScore: 85,
    scoreReasoning: 'High pain signals and no chatbot make this an excellent fit.',
    personalizedHook: 'Your customers say it takes 3 days to get a reply...',
    demoScenario: {
      businessName: 'Acme Dental',
      customerMessage: 'Quero marcar uma limpeza.',
      botReply: 'Temos horarios na terca e quinta.',
      followUp: 'Terca de manha.',
      botConfirm: 'Agendei para terca as 9h!',
    },
    disqualifyReason: null,
    ...overrides,
  };
}

/** Full lead object as returned by leadRepo.findById (with relations) */
function makeFullLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    businessName: 'Acme Dental',
    campaignId: 'camp-1',
    category: 'Dentist',
    region: 'Belo Horizonte',
    country: null,
    phone: '+5531999887766',
    websiteUrl: 'https://acmedental.com',
    email: 'contact@acmedental.com',
    googleMapsPlaceId: 'ChIJ_abc123',
    googleRating: 4.5,
    googleReviewCount: 120,
    status: 'sourced',
    hasReplied: false,
    demoToken: 'demo-tok-abc',
    unsubscribeToken: 'unsub-tok-xyz',
    enrichment: {
      hasWhatsapp: true,
      hasChatbot: false,
      hasOnlineBooking: false,
      emailsFound: ['contact@acmedental.com', 'admin@acmedental.com'],
      painSignals: [
        { signal: 'slow_response', count: 5, example: 'Took 3 days to reply' },
        { signal: 'hard_to_book', count: 3, example: 'Hard to book an appointment' },
      ],
      reviewSentimentSummary: 'Good dentists but hard to reach.',
    },
    qualification: {
      fitScore: 85,
      personalizedHook: 'Your customers say it takes 3 days to get a reply...',
      demoPageData: {},
    },
    campaign: makeCampaign(),
    outreachEmails: [],
    ...overrides,
  };
}

/* ====================================================================== */
/*  Tests                                                                  */
/* ====================================================================== */

describe('Pipeline integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(queueAddCalls)) delete queueAddCalls[key];

    // Default Redis: daily cap not reached
    mockRedisGet.mockResolvedValue('0');
    mockRedisIncr.mockResolvedValue(1);
    mockRedisExpire.mockResolvedValue(1);

    // Use fake timers — 30 days after warmup start (2026-04-01)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /* ------------------------------------------------------------------ */
  /*  1. Full pipeline happy path                                        */
  /* ------------------------------------------------------------------ */

  describe('happy path: source -> enrich -> qualify -> outreach', () => {
    it('processes 3 businesses through the full pipeline, deduping 1 duplicate', async () => {
      // ---- PHASE 1: SOURCE ----
      const campaign = makeCampaign();
      mockCampaignRepo.findById.mockResolvedValue(campaign);

      const biz1 = makeOutscraperResult({ googleMapsPlaceId: 'place-1', businessName: 'Biz One' });
      const biz2 = makeOutscraperResult({ googleMapsPlaceId: 'place-2', businessName: 'Biz Two' });
      const biz3 = makeOutscraperResult({ googleMapsPlaceId: 'place-dup', businessName: 'Biz Dup' });
      mockSearchBusinesses.mockResolvedValue([biz1, biz2, biz3]);

      // place-dup already exists (duplicate)
      mockLeadRepo.existsByPlaceId
        .mockImplementation((placeId: string) => Promise.resolve(placeId === 'place-dup'));

      mockLeadRepo.createFromSource
        .mockResolvedValueOnce({ id: 'lead-1' })
        .mockResolvedValueOnce({ id: 'lead-2' });

      await sourceProcessor()({ name: 'source', data: { campaignId: 'camp-1' } });

      // 3 results, 1 duplicate -> 2 leads created
      expect(mockLeadRepo.createFromSource).toHaveBeenCalledTimes(2);
      expect(mockLeadRepo.existsByPlaceId).toHaveBeenCalledWith('place-dup');

      // 2 enrich jobs enqueued
      expect(mockEnrichQueueAdd).toHaveBeenCalledTimes(2);
      expect(mockEnrichQueueAdd).toHaveBeenCalledWith(
        'enrich-lead',
        { leadId: 'lead-1' },
        { jobId: 'enrich-lead-1' },
      );
      expect(mockEnrichQueueAdd).toHaveBeenCalledWith(
        'enrich-lead',
        { leadId: 'lead-2' },
        { jobId: 'enrich-lead-2' },
      );

      // ---- PHASE 2: ENRICH (lead-1) ----
      const sourcedLead = makeFullLead({
        id: 'lead-1',
        status: 'sourced',
        enrichment: null,
        qualification: null,
      });
      mockLeadRepo.findById.mockResolvedValue(sourcedLead);
      mockCrawlWebsite.mockResolvedValue(makeCrawlResult());
      mockFetchReviews.mockResolvedValue({
        reviews: ['Great service!', 'Hard to get an appointment.'],
        rating: 4.5,
      });
      mockAnalyzeReviews.mockResolvedValue(makeReviewAnalysis());
      mockEnrichmentRepo.upsert.mockResolvedValue({});
      mockLeadRepo.setEmail.mockResolvedValue({});
      mockLeadRepo.updateStatus.mockResolvedValue({});

      await enrichProcessor()({ name: 'enrich-lead', data: { leadId: 'lead-1' } });

      // Enrichment saved
      expect(mockEnrichmentRepo.upsert).toHaveBeenCalledWith(
        'lead-1',
        expect.objectContaining({
          hasWhatsapp: true,
          hasChatbot: false,
          hasOnlineBooking: false,
          emailsFound: ['contact@acmedental.com', 'admin@acmedental.com'],
        }),
      );

      // Best email picked (contact@ preferred)
      expect(mockLeadRepo.setEmail).toHaveBeenCalledWith('lead-1', 'contact@acmedental.com');

      // Status updated to enriched
      expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith('lead-1', 'enriched', undefined);

      // Qualify job enqueued
      expect(mockQualifyQueueAdd).toHaveBeenCalledWith(
        'qualify-lead',
        { leadId: 'lead-1' },
        { jobId: 'qualify-lead-1' },
      );

      // ---- PHASE 3: QUALIFY (lead-1) ----
      vi.clearAllMocks();
      const enrichedLead = makeFullLead({ id: 'lead-1', status: 'enriched' });
      mockLeadRepo.findById.mockResolvedValue(enrichedLead);
      mockQualifyLead.mockResolvedValue(makeQualificationResult({ fitScore: 85 }));
      mockQualificationRepo.upsert.mockResolvedValue({});
      mockLeadRepo.updateStatus.mockResolvedValue({});

      await qualifyProcessor()({ name: 'qualify-lead', data: { leadId: 'lead-1' } });

      // Qualification saved with score 85
      expect(mockQualificationRepo.upsert).toHaveBeenCalledWith(
        'lead-1',
        expect.objectContaining({
          fitScore: 85,
          personalizedHook: expect.any(String),
        }),
      );

      // Lead status updated to qualified
      expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith('lead-1', 'qualified');

      // Score >= 70: outreach enqueued
      expect(mockOutreachQueueAdd).toHaveBeenCalledWith(
        'send-drip',
        { leadId: 'lead-1', sequenceNumber: 1 },
        { jobId: 'outreach-lead-1' },
      );

      // ---- PHASE 4: OUTREACH Email 1 (lead-1) ----
      vi.clearAllMocks();
      mockRedisGet.mockResolvedValue('0');
      mockRedisIncr.mockResolvedValue(1);
      mockRedisExpire.mockResolvedValue(1);

      const qualifiedLead = makeFullLead({ id: 'lead-1', status: 'qualified' });
      mockLeadRepo.findById.mockResolvedValue(qualifiedLead);
      mockOutreachRepo.hasClickedAny.mockResolvedValue(false);
      mockOutreachRepo.create.mockResolvedValue({ id: 'email-rec-1' });
      mockSendEmail.mockResolvedValue('resend-msg-id-001');
      mockOutreachRepo.updateStatus.mockResolvedValue({});
      mockLeadRepo.updateStatus.mockResolvedValue({});

      await outreachProcessor()({ name: 'send-drip', data: { leadId: 'lead-1', sequenceNumber: 1 } });

      // Email sent via Resend
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'contact@acmedental.com',
          templateName: 'mirror',
          subject: expect.stringContaining('Acme Dental'),
        }),
      );

      // Outreach record created with status: scheduled -> updated to sending
      expect(mockOutreachRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sequenceNumber: 1,
          status: 'scheduled',
        }),
      );
      expect(mockOutreachRepo.updateStatus).toHaveBeenCalledWith(
        'email-rec-1',
        'sending',
        expect.objectContaining({ resendMessageId: 'resend-msg-id-001' }),
      );

      // Lead status updated to 'contacted'
      expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith('lead-1', 'contacted');

      // Email 2 scheduled with 3-day delay
      expect(mockOutreachQueueAdd).toHaveBeenCalledWith(
        'send-drip',
        { leadId: 'lead-1', sequenceNumber: 2 },
        { delay: 3 * 86_400_000 },
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /*  2. Stop conditions                                                 */
  /* ------------------------------------------------------------------ */

  describe('stop conditions', () => {
    it('lead clicks demo -> drip paused (outreach stops on next send)', async () => {
      // When a lead has clicked any email, shouldStop() returns true
      const lead = makeFullLead({ id: 'lead-1', status: 'contacted' });
      mockLeadRepo.findById.mockResolvedValue(lead);
      mockOutreachRepo.hasClickedAny.mockResolvedValue(true);

      await outreachProcessor()({
        name: 'send-drip',
        data: { leadId: 'lead-1', sequenceNumber: 2 },
      });

      // No email sent — stop condition triggered
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockOutreachRepo.create).not.toHaveBeenCalled();
      // No next drip scheduled
      expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
    });

    it('lead unsubscribes -> no more emails sent', async () => {
      const lead = makeFullLead({ id: 'lead-1', status: 'unsubscribed' });
      mockLeadRepo.findById.mockResolvedValue(lead);

      await outreachProcessor()({
        name: 'send-drip',
        data: { leadId: 'lead-1', sequenceNumber: 2 },
      });

      // No email sent
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockOutreachRepo.create).not.toHaveBeenCalled();
      expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
    });

    it('lead has replied -> drip stops', async () => {
      const lead = makeFullLead({ id: 'lead-1', status: 'contacted', hasReplied: true });
      mockLeadRepo.findById.mockResolvedValue(lead);

      await outreachProcessor()({
        name: 'send-drip',
        data: { leadId: 'lead-1', sequenceNumber: 2 },
      });

      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockOutreachRepo.create).not.toHaveBeenCalled();
    });
  });

  /* ------------------------------------------------------------------ */
  /*  3. Edge cases                                                      */
  /* ------------------------------------------------------------------ */

  describe('edge cases', () => {
    it('lead with no email -> qualified but no outreach', async () => {
      const lead = makeFullLead({
        id: 'lead-nomail',
        email: null,
        status: 'enriched',
        enrichment: {
          hasWhatsapp: false,
          hasChatbot: false,
          hasOnlineBooking: false,
          painSignals: [],
          reviewSentimentSummary: '',
        },
      });
      mockLeadRepo.findById.mockResolvedValue(lead);
      mockQualifyLead.mockResolvedValue(makeQualificationResult({ fitScore: 95 }));
      mockQualificationRepo.upsert.mockResolvedValue({});
      mockLeadRepo.updateStatus.mockResolvedValue({});

      await qualifyProcessor()({
        name: 'qualify-lead',
        data: { leadId: 'lead-nomail' },
      });

      // Qualification saved
      expect(mockQualificationRepo.upsert).toHaveBeenCalled();
      // Status updated to qualified
      expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith('lead-nomail', 'qualified');
      // No outreach despite score 95 — no email address
      expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
    });

    it('lead with low score (< 40) -> qualified but no outreach', async () => {
      const lead = makeFullLead({ id: 'lead-low', status: 'enriched' });
      mockLeadRepo.findById.mockResolvedValue(lead);
      mockQualifyLead.mockResolvedValue(makeQualificationResult({ fitScore: 25 }));
      mockQualificationRepo.upsert.mockResolvedValue({});
      mockLeadRepo.updateStatus.mockResolvedValue({});

      await qualifyProcessor()({
        name: 'qualify-lead',
        data: { leadId: 'lead-low' },
      });

      // Qualification saved
      expect(mockQualificationRepo.upsert).toHaveBeenCalled();
      expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith('lead-low', 'qualified');
      // No outreach — score too low
      expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
    });

    it('Outscraper returns empty results -> no leads created', async () => {
      const campaign = makeCampaign();
      mockCampaignRepo.findById.mockResolvedValue(campaign);
      mockSearchBusinesses.mockResolvedValue([]);

      await sourceProcessor()({ name: 'source', data: { campaignId: 'camp-1' } });

      expect(mockLeadRepo.createFromSource).not.toHaveBeenCalled();
      expect(mockEnrichQueueAdd).not.toHaveBeenCalled();
    });

    it('crawl fails + reviews fail -> lead still enriched with null data', async () => {
      const lead = makeFullLead({
        id: 'lead-err',
        status: 'sourced',
        enrichment: null,
        qualification: null,
      });
      mockLeadRepo.findById.mockResolvedValue(lead);
      mockCrawlWebsite.mockRejectedValue(new Error('Connection refused'));
      mockFetchReviews.mockRejectedValue(new Error('API rate limited'));
      mockEnrichmentRepo.upsert.mockResolvedValue({});
      mockLeadRepo.updateStatus.mockResolvedValue({});

      await enrichProcessor()({ name: 'enrich-lead', data: { leadId: 'lead-err' } });

      // Enrichment saved with null signals
      expect(mockEnrichmentRepo.upsert).toHaveBeenCalledWith(
        'lead-err',
        expect.objectContaining({
          hasWhatsapp: null,
          hasChatbot: null,
          hasOnlineBooking: null,
          emailsFound: [],
        }),
      );

      // Errors recorded
      expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith(
        'lead-err',
        'enriched',
        expect.stringContaining('crawl: Connection refused'),
      );

      // Qualify still enqueued (partial enrichment is OK)
      expect(mockQualifyQueueAdd).toHaveBeenCalledWith(
        'qualify-lead',
        { leadId: 'lead-err' },
        { jobId: 'qualify-lead-err' },
      );
    });

    it('Resend API failure -> email marked failed, no next drip', async () => {
      const lead = makeFullLead({ id: 'lead-1', status: 'qualified' });
      mockLeadRepo.findById.mockResolvedValue(lead);
      mockOutreachRepo.hasClickedAny.mockResolvedValue(false);
      mockOutreachRepo.create.mockResolvedValue({ id: 'email-rec-1' });
      mockSendEmail.mockRejectedValue(new Error('Resend error: 422'));
      mockOutreachRepo.updateStatus.mockResolvedValue({});

      await outreachProcessor()({
        name: 'send-drip',
        data: { leadId: 'lead-1', sequenceNumber: 1 },
      });

      // Email record marked failed
      expect(mockOutreachRepo.updateStatus).toHaveBeenCalledWith('email-rec-1', 'failed');
      // No further drip scheduled
      expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
      // Lead status NOT updated to contacted
      expect(mockLeadRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('qualifier service error -> status unchanged with error recorded', async () => {
      const lead = makeFullLead({ id: 'lead-err', status: 'enriched' });
      mockLeadRepo.findById.mockResolvedValue(lead);
      mockQualifyLead.mockRejectedValue(new Error('OpenAI API down'));
      mockLeadRepo.updateStatus.mockResolvedValue({});

      await qualifyProcessor()({
        name: 'qualify-lead',
        data: { leadId: 'lead-err' },
      });

      // Error recorded, status stays enriched
      expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith(
        'lead-err',
        'enriched',
        'qualify: OpenAI API down',
      );
      // No qualification saved
      expect(mockQualificationRepo.upsert).not.toHaveBeenCalled();
      // No outreach
      expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
    });

    it('daily cap hit -> email rescheduled for tomorrow', async () => {
      const lead = makeFullLead({ id: 'lead-1', status: 'qualified' });
      mockLeadRepo.findById.mockResolvedValue(lead);
      mockOutreachRepo.hasClickedAny.mockResolvedValue(false);
      // Daily cap hit
      mockRedisGet.mockResolvedValue('999');

      await outreachProcessor()({
        name: 'send-drip',
        data: { leadId: 'lead-1', sequenceNumber: 1 },
      });

      // No email sent
      expect(mockSendEmail).not.toHaveBeenCalled();
      // Rescheduled
      expect(mockOutreachQueueAdd).toHaveBeenCalledWith(
        'send-drip',
        { leadId: 'lead-1', sequenceNumber: 1 },
        expect.objectContaining({ delay: expect.any(Number) }),
      );
    });

    it('last email in sequence (3) -> sets demo expiry, no more drips', async () => {
      const lead = makeFullLead({ id: 'lead-1', status: 'contacted' });
      mockLeadRepo.findById.mockResolvedValue(lead);
      mockOutreachRepo.hasClickedAny.mockResolvedValue(false);
      mockOutreachRepo.create.mockResolvedValue({ id: 'email-rec-3' });
      mockSendEmail.mockResolvedValue('resend-msg-id-003');
      mockOutreachRepo.updateStatus.mockResolvedValue({});
      mockLeadRepo.setDemoExpiry.mockResolvedValue({});

      await outreachProcessor()({
        name: 'send-drip',
        data: { leadId: 'lead-1', sequenceNumber: 3 },
      });

      // Email sent (template: direct-offer)
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ templateName: 'direct-offer' }),
      );

      // Demo expiry set (~60 days from now)
      expect(mockLeadRepo.setDemoExpiry).toHaveBeenCalledWith('lead-1', expect.any(Date));
      const expiryDate = mockLeadRepo.setDemoExpiry.mock.calls[0]![1] as Date;
      const expectedMs = Date.now() + 60 * 86_400_000;
      expect(Math.abs(expiryDate.getTime() - expectedMs)).toBeLessThan(1000);

      // No further drip scheduled (last in sequence)
      expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
    });

    it('mid-score (40-69) -> qualified but no auto-outreach', async () => {
      const lead = makeFullLead({ id: 'lead-mid', status: 'enriched' });
      mockLeadRepo.findById.mockResolvedValue(lead);
      mockQualifyLead.mockResolvedValue(makeQualificationResult({ fitScore: 55 }));
      mockQualificationRepo.upsert.mockResolvedValue({});
      mockLeadRepo.updateStatus.mockResolvedValue({});

      await qualifyProcessor()({
        name: 'qualify-lead',
        data: { leadId: 'lead-mid' },
      });

      expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith('lead-mid', 'qualified');
      // No outreach — manual review range
      expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
    });

    it('disqualified lead -> no outreach regardless of score', async () => {
      const lead = makeFullLead({ id: 'lead-dq', status: 'enriched' });
      mockLeadRepo.findById.mockResolvedValue(lead);
      mockQualifyLead.mockResolvedValue(
        makeQualificationResult({ fitScore: 90, disqualifyReason: 'excluded_client' }),
      );
      mockQualificationRepo.upsert.mockResolvedValue({});
      mockLeadRepo.updateStatus.mockResolvedValue({});

      await qualifyProcessor()({
        name: 'qualify-lead',
        data: { leadId: 'lead-dq' },
      });

      expect(mockQualificationRepo.upsert).toHaveBeenCalled();
      expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith('lead-dq', 'qualified');
      expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
    });
  });
});
