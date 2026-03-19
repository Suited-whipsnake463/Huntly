import { Resend } from 'resend';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config.js';

const resend = new Resend(env.RESEND_API_KEY);
const __dirname = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  Template loading + caching                                         */
/* ------------------------------------------------------------------ */

const templateCache = new Map<string, string>();

function loadTemplate(name: string): string {
  if (templateCache.has(name)) return templateCache.get(name)!;
  const content = readFileSync(
    resolve(__dirname, `../templates/emails/${name}.html`),
    'utf-8',
  );
  templateCache.set(name, content);
  return content;
}

/* ------------------------------------------------------------------ */
/*  Merge-field rendering                                              */
/* ------------------------------------------------------------------ */

export function renderTemplate(
  template: string,
  fields: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(fields)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Send                                                               */
/* ------------------------------------------------------------------ */

export async function sendEmail(opts: {
  to: string;
  subject: string;
  templateName: string;
  mergeFields: Record<string, string>;
  unsubscribeUrl: string;
  replyTo?: string;
}): Promise<string> {
  const template = loadTemplate(opts.templateName);
  const html = renderTemplate(template, {
    ...opts.mergeFields,
    unsubscribe_url: opts.unsubscribeUrl,
    physical_address: env.PHYSICAL_ADDRESS,
  });

  const { data, error } = await resend.emails.send({
    from: `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
    to: opts.to,
    subject: opts.subject,
    html,
    replyTo: opts.replyTo,
    headers: {
      'List-Unsubscribe': `<${opts.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
  return data!.id;
}
