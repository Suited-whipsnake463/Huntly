import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const { mockFindByDemoToken } = vi.hoisted(() => {
  const mockFindByDemoToken = vi.fn();
  return { mockFindByDemoToken };
});

vi.mock('../../src/db/index.js', () => ({
  leadRepo: {
    findByDemoToken: mockFindByDemoToken,
  },
}));

vi.mock('../../src/config.js', () => ({
  env: {
    BASE_URL: 'http://localhost:3001',
  },
}));

/* ------------------------------------------------------------------ */
/*  Import after mocks                                                 */
/* ------------------------------------------------------------------ */

import demoRoutes from '../../src/routes/demo.routes.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildApp() {
  const app = Fastify();
  app.register(demoRoutes);
  return app;
}

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-001',
    businessName: 'Acme Dental',
    demoToken: 'valid-token-abc',
    demoExpiresAt: null,
    campaign: { vertical: 'dental' },
    qualification: {
      demoPageData: {
        businessName: 'Acme Dental',
        customerMessage: 'Hi, I need to schedule a cleaning.',
        botReply: 'Hello! I can help you with that. We have openings this Thursday and Friday. Which works better for you?',
        followUp: 'Thursday at 2pm would be great.',
        botConfirm: 'Perfect! You are booked for Thursday at 2:00 PM. We will send you a reminder the day before.',
      },
    },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('GET /demo/:token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders demo page for valid token', async () => {
    mockFindByDemoToken.mockResolvedValue(makeLead());
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/demo/valid-token-abc',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Acme Dental');
  });

  it('HTML includes the conversation bubbles', async () => {
    mockFindByDemoToken.mockResolvedValue(makeLead());
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/demo/valid-token-abc',
    });

    expect(res.body).toContain('I need to schedule a cleaning');
    expect(res.body).toContain('We have openings this Thursday and Friday');
    expect(res.body).toContain('Thursday at 2pm would be great');
    expect(res.body).toContain('You are booked for Thursday at 2:00 PM');
  });

  it('returns 404 for unknown token', async () => {
    mockFindByDemoToken.mockResolvedValue(null);
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/demo/unknown-token',
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for expired demo', async () => {
    const pastDate = new Date('2020-01-01T00:00:00Z');
    mockFindByDemoToken.mockResolvedValue(
      makeLead({ demoExpiresAt: pastDate }),
    );
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/demo/valid-token-abc',
    });

    expect(res.statusCode).toBe(404);
  });

  it('allows access when demoExpiresAt is in the future', async () => {
    const futureDate = new Date(Date.now() + 86_400_000); // +1 day
    mockFindByDemoToken.mockResolvedValue(
      makeLead({ demoExpiresAt: futureDate }),
    );
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/demo/valid-token-abc',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Acme Dental');
  });

  it('returns 404 when no qualification data', async () => {
    mockFindByDemoToken.mockResolvedValue(
      makeLead({ qualification: null }),
    );
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/demo/valid-token-abc',
    });

    expect(res.statusCode).toBe(404);
  });

  it('HTML includes disclaimer text', async () => {
    mockFindByDemoToken.mockResolvedValue(makeLead());
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/demo/valid-token-abc',
    });

    expect(res.body).toContain(
      'This is a simulated example of how an AI assistant could work for your business',
    );
  });

  it('CTA links to SigmaAI signup with correct params', async () => {
    mockFindByDemoToken.mockResolvedValue(makeLead());
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/demo/valid-token-abc',
    });

    expect(res.body).toContain(
      'https://appai.sigmaintel.io/signup?ref=huntly&lead=lead-001&vertical=dental',
    );
  });

  it('encodes vertical in signup URL', async () => {
    mockFindByDemoToken.mockResolvedValue(
      makeLead({
        campaign: { vertical: 'real estate' },
      }),
    );
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/demo/valid-token-abc',
    });

    expect(res.body).toContain('vertical=real%20estate');
  });

  it('passes the correct token to leadRepo', async () => {
    mockFindByDemoToken.mockResolvedValue(null);
    const app = buildApp();

    await app.inject({
      method: 'GET',
      url: '/demo/my-special-token',
    });

    expect(mockFindByDemoToken).toHaveBeenCalledWith('my-special-token');
  });
});
