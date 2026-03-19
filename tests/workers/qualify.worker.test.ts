import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks — must be hoisted before any import of the worker module    */
/* ------------------------------------------------------------------ */

const mockQualifyLead = vi.fn();

const mockLeadRepo = {
  findById: vi.fn(),
  updateStatus: vi.fn(),
};

const mockQualificationRepo = {
  upsert: vi.fn(),
};

const mockOutreachQueueAdd = vi.fn();

// Track the processor function that Worker receives
let capturedProcessor: (job: { data: { leadId: string } }) => Promise<void>;

vi.mock('bullmq', () => {
  class MockQueue {
    name: string;
    add: ReturnType<typeof vi.fn>;
    constructor(name: string) {
      this.name = name;
      if (name === 'outreach') {
        this.add = mockOutreachQueueAdd;
      } else {
        this.add = vi.fn();
      }
    }
  }
  class MockWorker {
    name: string;
    constructor(name: string, processor: (job: any) => Promise<void>) {
      this.name = name;
      capturedProcessor = processor;
    }
  }
  return { Queue: MockQueue, Worker: MockWorker };
});

vi.mock('../../src/lib/redis.js', () => ({
  redis: {},
}));

vi.mock('../../src/services/qualifier.service.js', () => ({
  qualifyLead: (...args: unknown[]) => mockQualifyLead(...args),
}));

vi.mock('../../src/db/index.js', () => ({
  leadRepo: mockLeadRepo,
  qualificationRepo: mockQualificationRepo,
}));

// Dynamic import — triggers module evaluation after mocks are set up
await import('../../src/workers/qualify.worker.js');

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeJob(leadId: string) {
  return { data: { leadId } };
}

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    businessName: 'Acme Dental',
    category: 'dentist',
    region: 'Belo Horizonte',
    country: 'Brazil',
    phone: '+5531999887766',
    websiteUrl: 'https://acmedental.com',
    email: 'contact@acmedental.com',
    googleRating: 4.2,
    googleReviewCount: 87,
    status: 'enriched',
    enrichment: {
      hasWhatsapp: true,
      hasChatbot: false,
      hasOnlineBooking: false,
      painSignals: [
        { signal: 'slow_response', count: 5, example: 'Took 3 days to reply' },
      ],
      reviewSentimentSummary: 'Good dentists but hard to reach.',
    },
    ...overrides,
  };
}

function makeQualificationResult(overrides: Record<string, unknown> = {}) {
  return {
    fitScore: 82,
    scoreReasoning: 'High pain signals make this an excellent fit.',
    personalizedHook: 'Your customers say it takes 3 days to get a reply...',
    demoScenario: {
      businessName: 'Acme Dental',
      customerMessage: 'Quero marcar uma limpeza.',
      botReply: 'Temos horários na terça e quinta.',
      followUp: 'Terça de manhã.',
      botConfirm: 'Agendei para terça às 9h!',
    },
    disqualifyReason: null,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('qualify worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('qualifies lead and saves qualification data', async () => {
    const lead = makeLead();
    const result = makeQualificationResult();
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockQualifyLead.mockResolvedValue(result);
    mockQualificationRepo.upsert.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockOutreachQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    // Qualification saved with correct data
    expect(mockQualificationRepo.upsert).toHaveBeenCalledWith('lead-1', {
      fitScore: 82,
      scoreReasoning: 'High pain signals make this an excellent fit.',
      personalizedHook: 'Your customers say it takes 3 days to get a reply...',
      demoPageData: result.demoScenario,
    });

    // Lead status updated to qualified
    expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith('lead-1', 'qualified');
  });

  it('builds QualificationInput from lead + enrichment data', async () => {
    const lead = makeLead();
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockQualifyLead.mockResolvedValue(makeQualificationResult());
    mockQualificationRepo.upsert.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockOutreachQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    expect(mockQualifyLead).toHaveBeenCalledWith({
      businessName: 'Acme Dental',
      category: 'dentist',
      region: 'Belo Horizonte',
      country: 'Brazil',
      phone: '+5531999887766',
      websiteUrl: 'https://acmedental.com',
      googleRating: 4.2,
      googleReviewCount: 87,
      hasWhatsapp: true,
      hasChatbot: false,
      hasOnlineBooking: false,
      painSignals: [
        { signal: 'slow_response', count: 5, example: 'Took 3 days to reply' },
      ],
      reviewSentimentSummary: 'Good dentists but hard to reach.',
    });
  });

  it('auto-approves score >= 70 and enqueues outreach', async () => {
    const lead = makeLead();
    const result = makeQualificationResult({ fitScore: 85 });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockQualifyLead.mockResolvedValue(result);
    mockQualificationRepo.upsert.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockOutreachQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith('lead-1', 'qualified');
    expect(mockOutreachQueueAdd).toHaveBeenCalledWith(
      'send-drip',
      { leadId: 'lead-1', sequenceNumber: 1 },
      { jobId: 'outreach-lead-1' },
    );
  });

  it('leaves score 40-69 as qualified without enqueuing outreach', async () => {
    const lead = makeLead();
    const result = makeQualificationResult({ fitScore: 55 });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockQualifyLead.mockResolvedValue(result);
    mockQualificationRepo.upsert.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith('lead-1', 'qualified');
    expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
  });

  it('score < 40 qualified but no outreach', async () => {
    const lead = makeLead();
    const result = makeQualificationResult({ fitScore: 25 });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockQualifyLead.mockResolvedValue(result);
    mockQualificationRepo.upsert.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith('lead-1', 'qualified');
    expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
  });

  it('disqualified leads (disqualifyReason set) — no outreach', async () => {
    const lead = makeLead();
    const result = makeQualificationResult({
      fitScore: 0,
      disqualifyReason: 'excluded_client',
    });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockQualifyLead.mockResolvedValue(result);
    mockQualificationRepo.upsert.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    // Qualification still saved
    expect(mockQualificationRepo.upsert).toHaveBeenCalled();
    // Status still updated to qualified
    expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith('lead-1', 'qualified');
    // No outreach enqueued
    expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
  });

  it('disqualified leads with high fitScore still skip outreach', async () => {
    const lead = makeLead();
    const result = makeQualificationResult({
      fitScore: 90,
      disqualifyReason: 'excluded_client',
    });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockQualifyLead.mockResolvedValue(result);
    mockQualificationRepo.upsert.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
  });

  it('leads with no email — treated as disqualified (no outreach)', async () => {
    const lead = makeLead({ email: null });
    const result = makeQualificationResult({ fitScore: 95 });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockQualifyLead.mockResolvedValue(result);
    mockQualificationRepo.upsert.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    // Qualification saved and status updated
    expect(mockQualificationRepo.upsert).toHaveBeenCalled();
    expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith('lead-1', 'qualified');
    // No outreach enqueued — no email
    expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
  });

  it('records error in lastError on qualifier service failure', async () => {
    const lead = makeLead();
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockQualifyLead.mockRejectedValue(new Error('OpenAI API down'));
    mockLeadRepo.updateStatus.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    // Error recorded, status stays as enriched
    expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith(
      'lead-1',
      'enriched',
      'qualify: OpenAI API down',
    );
    // No qualification saved
    expect(mockQualificationRepo.upsert).not.toHaveBeenCalled();
    // No outreach enqueued
    expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
  });

  it('saves AI fallback result as-is and leaves status as enriched', async () => {
    const lead = makeLead();
    const fallbackResult = makeQualificationResult({
      fitScore: 30,
      scoreReasoning: 'AI qualification failed — manual review needed',
      personalizedHook: '',
      demoScenario: {
        businessName: 'Acme Dental',
        customerMessage: '',
        botReply: '',
        followUp: '',
        botConfirm: '',
      },
    });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockQualifyLead.mockResolvedValue(fallbackResult);
    mockQualificationRepo.upsert.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    // Qualification saved with fallback data
    expect(mockQualificationRepo.upsert).toHaveBeenCalledWith('lead-1', {
      fitScore: 30,
      scoreReasoning: 'AI qualification failed — manual review needed',
      personalizedHook: '',
      demoPageData: fallbackResult.demoScenario,
    });
    // Status NOT updated — stays enriched for manual review
    expect(mockLeadRepo.updateStatus).not.toHaveBeenCalled();
    // No outreach enqueued
    expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
  });

  it('skips processing when lead is not found', async () => {
    mockLeadRepo.findById.mockResolvedValue(null);

    await capturedProcessor(makeJob('nonexistent'));

    expect(mockQualifyLead).not.toHaveBeenCalled();
    expect(mockQualificationRepo.upsert).not.toHaveBeenCalled();
    expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
  });

  it('handles lead with no enrichment data gracefully', async () => {
    const lead = makeLead({ enrichment: null });
    const result = makeQualificationResult({ fitScore: 40 });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockQualifyLead.mockResolvedValue(result);
    mockQualificationRepo.upsert.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    // Input built with null/empty defaults
    expect(mockQualifyLead).toHaveBeenCalledWith(
      expect.objectContaining({
        hasWhatsapp: null,
        hasChatbot: null,
        hasOnlineBooking: null,
        painSignals: [],
        reviewSentimentSummary: '',
      }),
    );
  });

  it('fitScore exactly 70 enqueues outreach', async () => {
    const lead = makeLead();
    const result = makeQualificationResult({ fitScore: 70 });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockQualifyLead.mockResolvedValue(result);
    mockQualificationRepo.upsert.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockOutreachQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    expect(mockOutreachQueueAdd).toHaveBeenCalledWith(
      'send-drip',
      { leadId: 'lead-1', sequenceNumber: 1 },
      { jobId: 'outreach-lead-1' },
    );
  });

  it('fitScore exactly 69 does not enqueue outreach', async () => {
    const lead = makeLead();
    const result = makeQualificationResult({ fitScore: 69 });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockQualifyLead.mockResolvedValue(result);
    mockQualificationRepo.upsert.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});

    await capturedProcessor(makeJob('lead-1'));

    expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
  });
});
