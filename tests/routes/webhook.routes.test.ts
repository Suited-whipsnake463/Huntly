import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const {
  mockFindByResendMessageId,
  mockUpdateStatus,
  mockPauseDripForLead,
  mockUpdateLeadStatus,
  mockUnsubscribe,
  mockFindByEmail,
  mockMarkReplied,
  mockWebhookVerify,
} = vi.hoisted(() => ({
  mockFindByResendMessageId: vi.fn(),
  mockUpdateStatus: vi.fn(),
  mockPauseDripForLead: vi.fn(),
  mockUpdateLeadStatus: vi.fn(),
  mockUnsubscribe: vi.fn(),
  mockFindByEmail: vi.fn(),
  mockMarkReplied: vi.fn(),
  mockWebhookVerify: vi.fn(),
}));

vi.mock('../../src/db/index.js', () => ({
  outreachRepo: {
    findByResendMessageId: mockFindByResendMessageId,
    updateStatus: mockUpdateStatus,
    pauseDripForLead: mockPauseDripForLead,
  },
  leadRepo: {
    updateStatus: mockUpdateLeadStatus,
    unsubscribe: mockUnsubscribe,
    findByEmail: mockFindByEmail,
    markReplied: mockMarkReplied,
  },
}));

vi.mock('../../src/config.js', () => ({
  env: {
    RESEND_WEBHOOK_SECRET: 'whsec_test_secret',
  },
}));

vi.mock('svix', () => {
  return {
    Webhook: class MockWebhook {
      verify(payload: string, headers: Record<string, string>) {
        return mockWebhookVerify(payload, headers);
      }
    },
  };
});

/* ------------------------------------------------------------------ */
/*  Import after mocks                                                 */
/* ------------------------------------------------------------------ */

import webhookRoutes from '../../src/routes/webhook.routes.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildApp() {
  const app = Fastify();
  app.register(webhookRoutes);
  return app;
}

function makeOutreachEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'outreach-001',
    leadId: 'lead-001',
    resendMessageId: 'resend-msg-001',
    status: 'sending',
    ...overrides,
  };
}

function resendPayload(type: string, emailId = 'resend-msg-001') {
  return { type, data: { email_id: emailId } };
}

function injectResend(app: ReturnType<typeof Fastify>, body: unknown) {
  return app.inject({
    method: 'POST',
    url: '/webhooks/resend',
    payload: body,
    headers: {
      'content-type': 'application/json',
      'svix-id': 'msg_test123',
      'svix-timestamp': '1234567890',
      'svix-signature': 'v1,valid_signature',
    },
  });
}

function injectReply(app: ReturnType<typeof Fastify>, body: unknown) {
  return app.inject({
    method: 'POST',
    url: '/webhooks/reply',
    payload: body,
    headers: { 'content-type': 'application/json' },
  });
}

/* ------------------------------------------------------------------ */
/*  Tests — POST /webhooks/resend                                      */
/* ------------------------------------------------------------------ */

describe('POST /webhooks/resend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebhookVerify.mockReturnValue(undefined); // valid by default
  });

  it('email.delivered updates status + deliveredAt', async () => {
    mockFindByResendMessageId.mockResolvedValue(makeOutreachEmail());
    mockUpdateStatus.mockResolvedValue({});
    const app = buildApp();

    const res = await injectResend(app, resendPayload('email.delivered'));

    expect(res.statusCode).toBe(200);
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'outreach-001',
      'delivered',
      expect.objectContaining({ deliveredAt: expect.any(Date) }),
    );
  });

  it('email.opened updates status + openedAt', async () => {
    mockFindByResendMessageId.mockResolvedValue(makeOutreachEmail());
    mockUpdateStatus.mockResolvedValue({});
    const app = buildApp();

    const res = await injectResend(app, resendPayload('email.opened'));

    expect(res.statusCode).toBe(200);
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'outreach-001',
      'opened',
      expect.objectContaining({ openedAt: expect.any(Date) }),
    );
  });

  it('email.clicked updates status + clickedAt + pauses drip', async () => {
    mockFindByResendMessageId.mockResolvedValue(makeOutreachEmail());
    mockUpdateStatus.mockResolvedValue({});
    mockPauseDripForLead.mockResolvedValue({ count: 2 });
    const app = buildApp();

    const res = await injectResend(app, resendPayload('email.clicked'));

    expect(res.statusCode).toBe(200);
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'outreach-001',
      'clicked',
      expect.objectContaining({ clickedAt: expect.any(Date) }),
    );
    expect(mockPauseDripForLead).toHaveBeenCalledWith('lead-001');
  });

  it('email.bounced updates status + marks lead as sourced', async () => {
    mockFindByResendMessageId.mockResolvedValue(makeOutreachEmail());
    mockUpdateStatus.mockResolvedValue({});
    mockUpdateLeadStatus.mockResolvedValue({});
    const app = buildApp();

    const res = await injectResend(app, resendPayload('email.bounced'));

    expect(res.statusCode).toBe(200);
    expect(mockUpdateStatus).toHaveBeenCalledWith('outreach-001', 'bounced');
    expect(mockUpdateLeadStatus).toHaveBeenCalledWith('lead-001', 'sourced');
  });

  it('email.complained marks lead as unsubscribed', async () => {
    mockFindByResendMessageId.mockResolvedValue(makeOutreachEmail());
    mockUpdateStatus.mockResolvedValue({});
    mockUnsubscribe.mockResolvedValue({});
    const app = buildApp();

    const res = await injectResend(app, resendPayload('email.complained'));

    expect(res.statusCode).toBe(200);
    expect(mockUpdateStatus).toHaveBeenCalledWith('outreach-001', 'complained');
    expect(mockUnsubscribe).toHaveBeenCalledWith('lead-001');
  });

  it('rejects invalid webhook signature', async () => {
    mockWebhookVerify.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const app = buildApp();

    const res = await injectResend(app, resendPayload('email.delivered'));

    // Should still return 200 (caught by error handler) to prevent retry flood
    expect(res.statusCode).toBe(200);
    // But should NOT have processed the event
    expect(mockFindByResendMessageId).not.toHaveBeenCalled();
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it('ignores unknown event types and returns 200', async () => {
    mockFindByResendMessageId.mockResolvedValue(makeOutreachEmail());
    const app = buildApp();

    const res = await injectResend(app, resendPayload('email.unknown_event'));

    expect(res.statusCode).toBe(200);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it('returns 200 even on processing errors', async () => {
    mockFindByResendMessageId.mockRejectedValue(new Error('DB down'));
    const app = buildApp();

    const res = await injectResend(app, resendPayload('email.delivered'));

    expect(res.statusCode).toBe(200);
  });

  it('returns 200 when no outreach email found for message id', async () => {
    mockFindByResendMessageId.mockResolvedValue(null);
    const app = buildApp();

    const res = await injectResend(app, resendPayload('email.delivered', 'unknown-id'));

    expect(res.statusCode).toBe(200);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it('email.sent updates status + sentAt', async () => {
    mockFindByResendMessageId.mockResolvedValue(makeOutreachEmail());
    mockUpdateStatus.mockResolvedValue({});
    const app = buildApp();

    const res = await injectResend(app, resendPayload('email.sent'));

    expect(res.statusCode).toBe(200);
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      'outreach-001',
      'sending',
      expect.objectContaining({ sentAt: expect.any(Date) }),
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Tests — POST /webhooks/reply                                       */
/* ------------------------------------------------------------------ */

describe('POST /webhooks/reply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebhookVerify.mockReturnValue(undefined);
  });

  it('marks lead as replied + pauses drip', async () => {
    const lead = { id: 'lead-001', businessName: 'Acme Dental' };
    mockFindByEmail.mockResolvedValue(lead);
    mockMarkReplied.mockResolvedValue({});
    mockPauseDripForLead.mockResolvedValue({ count: 1 });
    const app = buildApp();

    const res = await injectReply(app, { from: 'owner@acme.com' });

    expect(res.statusCode).toBe(200);
    expect(mockFindByEmail).toHaveBeenCalledWith('owner@acme.com');
    expect(mockMarkReplied).toHaveBeenCalledWith('lead-001');
    expect(mockPauseDripForLead).toHaveBeenCalledWith('lead-001');
  });

  it('handles unknown sender gracefully', async () => {
    mockFindByEmail.mockResolvedValue(null);
    const app = buildApp();

    const res = await injectReply(app, { from: 'unknown@example.com' });

    expect(res.statusCode).toBe(200);
    expect(mockMarkReplied).not.toHaveBeenCalled();
    expect(mockPauseDripForLead).not.toHaveBeenCalled();
  });

  it('returns 200 even on processing errors', async () => {
    mockFindByEmail.mockRejectedValue(new Error('DB down'));
    const app = buildApp();

    const res = await injectReply(app, { from: 'owner@acme.com' });

    expect(res.statusCode).toBe(200);
  });
});
