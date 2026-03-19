import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const { mockSend } = vi.hoisted(() => {
  const mockSend = vi.fn();
  return { mockSend };
});

vi.mock('resend', () => {
  return {
    Resend: class {
      emails = { send: mockSend };
    },
  };
});

vi.mock('../../src/config.js', () => ({
  env: {
    RESEND_API_KEY: 're_test_key',
    SENDER_EMAIL: 'hello@outreach.example.com',
    SENDER_NAME: 'Huntly',
    PHYSICAL_ADDRESS: '123 Main St, Anytown, ST 00000',
  },
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue(
    '<html><body>{{personalized_hook}} — {{business_name}} — {{demo_url}} — {{unsubscribe_url}} — {{physical_address}}</body></html>',
  ),
}));

/* ------------------------------------------------------------------ */
/*  Import after mocks                                                 */
/* ------------------------------------------------------------------ */

import { renderTemplate, sendEmail } from '../../src/services/email.service.js';

/* ------------------------------------------------------------------ */
/*  renderTemplate                                                     */
/* ------------------------------------------------------------------ */

describe('renderTemplate', () => {
  it('replaces all merge fields', () => {
    const template = 'Hello {{name}}, welcome to {{company}}.';
    const result = renderTemplate(template, {
      name: 'Alice',
      company: 'Acme',
    });
    expect(result).toBe('Hello Alice, welcome to Acme.');
  });

  it('handles multiple occurrences of the same field', () => {
    const template = '{{name}} said hi. Thanks, {{name}}!';
    const result = renderTemplate(template, { name: 'Bob' });
    expect(result).toBe('Bob said hi. Thanks, Bob!');
  });

  it('leaves unknown placeholders untouched', () => {
    const template = '{{known}} and {{unknown}}';
    const result = renderTemplate(template, { known: 'yes' });
    expect(result).toBe('yes and {{unknown}}');
  });
});

/* ------------------------------------------------------------------ */
/*  sendEmail                                                          */
/* ------------------------------------------------------------------ */

describe('sendEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Resend with correct from, to, subject, and html', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg_abc123' }, error: null });

    await sendEmail({
      to: 'lead@example.com',
      subject: 'Check this out',
      templateName: 'mirror',
      mergeFields: {
        personalized_hook: 'I noticed your website...',
        business_name: 'Acme Dental',
        demo_url: 'https://demo.example.com/acme',
      },
      unsubscribeUrl: 'https://example.com/unsub/abc',
    });

    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0]![0];
    expect(call.from).toBe('Huntly <hello@outreach.example.com>');
    expect(call.to).toBe('lead@example.com');
    expect(call.subject).toBe('Check this out');
    expect(call.html).toContain('I noticed your website...');
    expect(call.html).toContain('Acme Dental');
  });

  it('includes List-Unsubscribe headers', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg_abc123' }, error: null });

    await sendEmail({
      to: 'lead@example.com',
      subject: 'Hello',
      templateName: 'mirror',
      mergeFields: { business_name: 'Test Biz' },
      unsubscribeUrl: 'https://example.com/unsub/xyz',
    });

    const call = mockSend.mock.calls[0]![0];
    expect(call.headers['List-Unsubscribe']).toBe('<https://example.com/unsub/xyz>');
    expect(call.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('includes physical address in rendered HTML', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg_abc123' }, error: null });

    await sendEmail({
      to: 'lead@example.com',
      subject: 'Hello',
      templateName: 'mirror',
      mergeFields: {},
      unsubscribeUrl: 'https://example.com/unsub/xyz',
    });

    const call = mockSend.mock.calls[0]![0];
    expect(call.html).toContain('123 Main St, Anytown, ST 00000');
  });

  it('returns Resend message ID on success', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg_success_456' }, error: null });

    const id = await sendEmail({
      to: 'lead@example.com',
      subject: 'Hi',
      templateName: 'mirror',
      mergeFields: {},
      unsubscribeUrl: 'https://example.com/unsub/abc',
    });

    expect(id).toBe('msg_success_456');
  });

  it('throws on Resend error', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Invalid API key', name: 'validation_error' },
    });

    await expect(
      sendEmail({
        to: 'lead@example.com',
        subject: 'Hi',
        templateName: 'mirror',
        mergeFields: {},
        unsubscribeUrl: 'https://example.com/unsub/abc',
      }),
    ).rejects.toThrow('Resend error: Invalid API key');
  });

  it('passes replyTo when provided', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg_reply' }, error: null });

    await sendEmail({
      to: 'lead@example.com',
      subject: 'Hi',
      templateName: 'mirror',
      mergeFields: {},
      unsubscribeUrl: 'https://example.com/unsub/abc',
      replyTo: 'sales@example.com',
    });

    const call = mockSend.mock.calls[0]![0];
    expect(call.replyTo).toBe('sales@example.com');
  });
});
