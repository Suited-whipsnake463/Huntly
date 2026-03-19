import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks — must be hoisted before any import of the worker module    */
/* ------------------------------------------------------------------ */

const mockSendEmail = vi.fn();

const mockLeadRepo = {
  findById: vi.fn(),
  updateStatus: vi.fn(),
  setDemoExpiry: vi.fn(),
};

const mockOutreachRepo = {
  create: vi.fn(),
  updateStatus: vi.fn(),
  hasClickedAny: vi.fn(),
  findScheduledBefore: vi.fn(),
  pauseDripForLead: vi.fn(),
};

const mockOutreachQueueAdd = vi.fn();

const mockRedisGet = vi.fn();
const mockRedisIncr = vi.fn();
const mockRedisExpire = vi.fn();

// Track the processor function that Worker receives
let capturedProcessor: (job: { name: string; data: Record<string, unknown> }) => Promise<void>;

vi.mock('bullmq', () => {
  class MockQueue {
    name: string;
    add: ReturnType<typeof vi.fn>;
    constructor(name: string) {
      this.name = name;
      this.add = mockOutreachQueueAdd;
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
  redis: {
    get: (...args: unknown[]) => mockRedisGet(...args),
    incr: (...args: unknown[]) => mockRedisIncr(...args),
    expire: (...args: unknown[]) => mockRedisExpire(...args),
  },
}));

vi.mock('../../src/services/email.service.js', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock('../../src/db/index.js', () => ({
  leadRepo: mockLeadRepo,
  outreachRepo: mockOutreachRepo,
}));

vi.mock('../../src/config.js', () => ({
  env: {
    BASE_URL: 'https://huntly.test',
    PHYSICAL_ADDRESS: '123 Test St',
    SENDER_EMAIL: 'hello@test.com',
  },
}));

// Dynamic import — triggers module evaluation after mocks are set up
const mod = await import('../../src/workers/outreach.worker.js');
const { getDailyCap } = mod;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeSendDripJob(leadId: string, sequenceNumber: number) {
  return { name: 'send-drip', data: { leadId, sequenceNumber } };
}

function makeProcessScheduledJob() {
  return { name: 'process-scheduled', data: {} };
}

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    businessName: 'Acme Dental',
    campaignId: 'campaign-1',
    email: 'contact@acmedental.com',
    status: 'qualified',
    hasReplied: false,
    demoToken: 'demo-tok-123',
    unsubscribeToken: 'unsub-tok-456',
    enrichment: {
      painSignals: [
        { signal: 'slow_response', count: 5, example: 'Took 3 days to reply' },
        { signal: 'no_booking', count: 3, example: 'No online scheduling' },
      ],
    },
    qualification: {
      personalizedHook: 'Your customers say it takes 3 days to get a reply...',
    },
    campaign: {
      id: 'campaign-1',
      senderAddress: null,
    },
    outreachEmails: [],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('outreach worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set time to 30 days after WARMUP_START_DATE so cap is MAX_CAP (50)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00Z'));
    // Default: daily cap not reached
    mockRedisGet.mockResolvedValue('0');
    mockRedisIncr.mockResolvedValue(1);
    mockRedisExpire.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /* ---- send-drip: Email 1 (mirror) ---- */

  it('sends Email 1 immediately for qualified leads', async () => {
    const lead = makeLead();
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockOutreachRepo.hasClickedAny.mockResolvedValue(false);
    mockOutreachRepo.create.mockResolvedValue({ id: 'email-rec-1' });
    mockSendEmail.mockResolvedValue('resend-msg-id-1');
    mockOutreachRepo.updateStatus.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockOutreachQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeSendDripJob('lead-1', 1));

    // Email sent with correct template
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'contact@acmedental.com',
        templateName: 'mirror',
        subject: '8 of your customers can\'t reach you, Acme Dental',
        unsubscribeUrl: 'https://huntly.test/unsubscribe/unsub-tok-456',
      }),
    );

    // Outreach record created
    expect(mockOutreachRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sequenceNumber: 1,
        status: 'scheduled',
      }),
    );

    // Status updated to sending with resendMessageId
    expect(mockOutreachRepo.updateStatus).toHaveBeenCalledWith(
      'email-rec-1',
      'sending',
      expect.objectContaining({
        resendMessageId: 'resend-msg-id-1',
      }),
    );
  });

  it('updates lead status to contacted on first email', async () => {
    const lead = makeLead();
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockOutreachRepo.hasClickedAny.mockResolvedValue(false);
    mockOutreachRepo.create.mockResolvedValue({ id: 'email-rec-1' });
    mockSendEmail.mockResolvedValue('resend-msg-id-1');
    mockOutreachRepo.updateStatus.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockOutreachQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeSendDripJob('lead-1', 1));

    expect(mockLeadRepo.updateStatus).toHaveBeenCalledWith('lead-1', 'contacted');
  });

  it('does not update lead status to contacted on Email 2', async () => {
    const lead = makeLead({ status: 'contacted' });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockOutreachRepo.hasClickedAny.mockResolvedValue(false);
    mockOutreachRepo.create.mockResolvedValue({ id: 'email-rec-2' });
    mockSendEmail.mockResolvedValue('resend-msg-id-2');
    mockOutreachRepo.updateStatus.mockResolvedValue({});
    mockOutreachQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeSendDripJob('lead-1', 2));

    expect(mockLeadRepo.updateStatus).not.toHaveBeenCalled();
  });

  /* ---- Scheduling next drip ---- */

  it('schedules Email 2 for day 3 after sending Email 1', async () => {
    const lead = makeLead();
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockOutreachRepo.hasClickedAny.mockResolvedValue(false);
    mockOutreachRepo.create.mockResolvedValue({ id: 'email-rec-1' });
    mockSendEmail.mockResolvedValue('resend-msg-id-1');
    mockOutreachRepo.updateStatus.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockOutreachQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeSendDripJob('lead-1', 1));

    // Should schedule next drip with 3-day delay
    expect(mockOutreachQueueAdd).toHaveBeenCalledWith(
      'send-drip',
      { leadId: 'lead-1', sequenceNumber: 2 },
      { delay: 3 * 86_400_000 },
    );
  });

  it('schedules Email 3 for day 4 (relative) after sending Email 2', async () => {
    const lead = makeLead({ status: 'contacted' });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockOutreachRepo.hasClickedAny.mockResolvedValue(false);
    mockOutreachRepo.create.mockResolvedValue({ id: 'email-rec-2' });
    mockSendEmail.mockResolvedValue('resend-msg-id-2');
    mockOutreachRepo.updateStatus.mockResolvedValue({});
    mockOutreachQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeSendDripJob('lead-1', 2));

    // Email 3 is day 7, Email 2 is day 3, so delay = 4 days
    expect(mockOutreachQueueAdd).toHaveBeenCalledWith(
      'send-drip',
      { leadId: 'lead-1', sequenceNumber: 3 },
      { delay: 4 * 86_400_000 },
    );
  });

  /* ---- Demo expiry after last email ---- */

  it('sets demo_expires_at to 60 days after last email', async () => {
    const lead = makeLead({ status: 'contacted' });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockOutreachRepo.hasClickedAny.mockResolvedValue(false);
    mockOutreachRepo.create.mockResolvedValue({ id: 'email-rec-3' });
    mockSendEmail.mockResolvedValue('resend-msg-id-3');
    mockOutreachRepo.updateStatus.mockResolvedValue({});
    mockLeadRepo.setDemoExpiry.mockResolvedValue({});
    mockOutreachQueueAdd.mockResolvedValue({});

    const now = Date.now();

    await capturedProcessor(makeSendDripJob('lead-1', 3));

    // Should NOT schedule another drip
    expect(mockOutreachQueueAdd).not.toHaveBeenCalled();

    // Should set demo expiry to ~60 days from now
    expect(mockLeadRepo.setDemoExpiry).toHaveBeenCalledWith(
      'lead-1',
      expect.any(Date),
    );

    const expiryDate = mockLeadRepo.setDemoExpiry.mock.calls[0]![1] as Date;
    const expectedMs = now + 60 * 86_400_000;
    expect(Math.abs(expiryDate.getTime() - expectedMs)).toBeLessThan(1000);
  });

  /* ---- Stop conditions ---- */

  it('skips sending if lead unsubscribed', async () => {
    const lead = makeLead({ status: 'unsubscribed' });
    mockLeadRepo.findById.mockResolvedValue(lead);

    await capturedProcessor(makeSendDripJob('lead-1', 1));

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockOutreachRepo.create).not.toHaveBeenCalled();
  });

  it('skips sending if lead replied', async () => {
    const lead = makeLead({ hasReplied: true });
    mockLeadRepo.findById.mockResolvedValue(lead);

    await capturedProcessor(makeSendDripJob('lead-1', 1));

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockOutreachRepo.create).not.toHaveBeenCalled();
  });

  it('skips sending if any email clicked', async () => {
    const lead = makeLead();
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockOutreachRepo.hasClickedAny.mockResolvedValue(true);

    await capturedProcessor(makeSendDripJob('lead-1', 2));

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockOutreachRepo.create).not.toHaveBeenCalled();
  });

  it('skips if lead not found', async () => {
    mockLeadRepo.findById.mockResolvedValue(null);

    await capturedProcessor(makeSendDripJob('nonexistent', 1));

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockOutreachRepo.create).not.toHaveBeenCalled();
  });

  /* ---- Daily cap ---- */

  it('re-schedules for tomorrow 9am when daily cap hit', async () => {
    const lead = makeLead();
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockOutreachRepo.hasClickedAny.mockResolvedValue(false);
    // Cap hit: return a large count
    mockRedisGet.mockResolvedValue('999');
    mockOutreachQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeSendDripJob('lead-1', 1));

    // Should not send
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockOutreachRepo.create).not.toHaveBeenCalled();

    // Should re-schedule
    expect(mockOutreachQueueAdd).toHaveBeenCalledWith(
      'send-drip',
      { leadId: 'lead-1', sequenceNumber: 1 },
      expect.objectContaining({ delay: expect.any(Number) }),
    );
  });

  /* ---- Error handling ---- */

  it('handles Resend 4xx — marks email failed, does not throw', async () => {
    const lead = makeLead();
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockOutreachRepo.hasClickedAny.mockResolvedValue(false);
    mockOutreachRepo.create.mockResolvedValue({ id: 'email-rec-1' });
    mockSendEmail.mockRejectedValue(new Error('Resend error: 422 Unprocessable'));
    mockOutreachRepo.updateStatus.mockResolvedValue({});

    await capturedProcessor(makeSendDripJob('lead-1', 1));

    // Email record marked as failed
    expect(mockOutreachRepo.updateStatus).toHaveBeenCalledWith('email-rec-1', 'failed');

    // No further updates (no lead status change, no next drip)
    expect(mockLeadRepo.updateStatus).not.toHaveBeenCalled();
    expect(mockOutreachQueueAdd).not.toHaveBeenCalled();
  });

  /* ---- process-scheduled job ---- */

  it('process-scheduled enqueues send-drip for due emails', async () => {
    mockOutreachRepo.findScheduledBefore.mockResolvedValue([
      { id: 'email-1', leadId: 'lead-1', sequenceNumber: 2 },
      { id: 'email-2', leadId: 'lead-2', sequenceNumber: 1 },
    ]);
    mockOutreachQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeProcessScheduledJob());

    expect(mockOutreachRepo.findScheduledBefore).toHaveBeenCalledWith(
      expect.any(Date),
    );
    expect(mockOutreachQueueAdd).toHaveBeenCalledTimes(2);
    expect(mockOutreachQueueAdd).toHaveBeenCalledWith(
      'send-drip',
      { leadId: 'lead-1', sequenceNumber: 2 },
      expect.objectContaining({ jobId: expect.stringContaining('drip-lead-1-2-') }),
    );
    expect(mockOutreachQueueAdd).toHaveBeenCalledWith(
      'send-drip',
      { leadId: 'lead-2', sequenceNumber: 1 },
      expect.objectContaining({ jobId: expect.stringContaining('drip-lead-2-1-') }),
    );
  });

  /* ---- Merge fields ---- */

  it('builds correct merge fields from lead data', async () => {
    const lead = makeLead({
      campaign: { id: 'campaign-1', senderAddress: '456 Custom Ave' },
    });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockOutreachRepo.hasClickedAny.mockResolvedValue(false);
    mockOutreachRepo.create.mockResolvedValue({ id: 'email-rec-1' });
    mockSendEmail.mockResolvedValue('resend-msg-id-1');
    mockOutreachRepo.updateStatus.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockOutreachQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeSendDripJob('lead-1', 1));

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        mergeFields: expect.objectContaining({
          business_name: 'Acme Dental',
          personalized_hook: 'Your customers say it takes 3 days to get a reply...',
          demo_url: 'https://huntly.test/demo/demo-tok-123',
          physical_address: '456 Custom Ave',
          count: '8', // 5 + 3 from pain signals
        }),
      }),
    );
  });

  it('uses env.PHYSICAL_ADDRESS when campaign has no senderAddress', async () => {
    const lead = makeLead(); // campaign.senderAddress = null
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockOutreachRepo.hasClickedAny.mockResolvedValue(false);
    mockOutreachRepo.create.mockResolvedValue({ id: 'email-rec-1' });
    mockSendEmail.mockResolvedValue('resend-msg-id-1');
    mockOutreachRepo.updateStatus.mockResolvedValue({});
    mockLeadRepo.updateStatus.mockResolvedValue({});
    mockOutreachQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeSendDripJob('lead-1', 1));

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        mergeFields: expect.objectContaining({
          physical_address: '123 Test St',
        }),
      }),
    );
  });

  it('uses correct template per sequence number', async () => {
    const lead = makeLead({ status: 'contacted' });
    mockLeadRepo.findById.mockResolvedValue(lead);
    mockOutreachRepo.hasClickedAny.mockResolvedValue(false);
    mockOutreachRepo.create.mockResolvedValue({ id: 'email-rec-2' });
    mockSendEmail.mockResolvedValue('resend-msg-id-2');
    mockOutreachRepo.updateStatus.mockResolvedValue({});
    mockOutreachQueueAdd.mockResolvedValue({});

    await capturedProcessor(makeSendDripJob('lead-1', 2));

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: 'social-proof',
      }),
    );
  });
});

/* ------------------------------------------------------------------ */
/*  getDailyCap unit tests                                             */
/* ------------------------------------------------------------------ */

describe('getDailyCap', () => {
  it('returns 0 before warmup start date', () => {
    const futureDate = new Date(Date.now() + 86_400_000 * 30);
    expect(getDailyCap(futureDate)).toBe(0);
  });

  it('returns BASE_CAP on day 0', () => {
    const now = new Date();
    // day 0: floor(20 * 1.2^0) = 20
    expect(getDailyCap(now)).toBe(20);
  });

  it('ramps up over warmup period', () => {
    const day5 = new Date(Date.now() - 5 * 86_400_000);
    // floor(20 * 1.2^5) = floor(20 * 2.48832) = floor(49.7664) = 49
    expect(getDailyCap(day5)).toBe(49);
  });

  it('caps at MAX_CAP (50) during warmup', () => {
    const day6 = new Date(Date.now() - 6 * 86_400_000);
    // floor(20 * 1.2^6) = floor(20 * 2.985...) = floor(59.7...) = 50 (capped)
    expect(getDailyCap(day6)).toBe(50);
  });

  it('returns MAX_CAP after warmup period', () => {
    const day30 = new Date(Date.now() - 30 * 86_400_000);
    expect(getDailyCap(day30)).toBe(50);
  });

  it('returns MAX_CAP exactly at WARMUP_DAYS boundary', () => {
    const day14 = new Date(Date.now() - 14 * 86_400_000);
    expect(getDailyCap(day14)).toBe(50);
  });

  it('ramps correctly on day 1', () => {
    const day1 = new Date(Date.now() - 1 * 86_400_000);
    // floor(20 * 1.2^1) = floor(24) = 24
    expect(getDailyCap(day1)).toBe(24);
  });

  it('ramps correctly on day 3', () => {
    const day3 = new Date(Date.now() - 3 * 86_400_000);
    // floor(20 * 1.2^3) = floor(20 * 1.728) = floor(34.56) = 34
    expect(getDailyCap(day3)).toBe(34);
  });
});
