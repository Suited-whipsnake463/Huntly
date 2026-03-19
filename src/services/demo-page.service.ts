import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  Template loading                                                    */
/* ------------------------------------------------------------------ */

let templateCache: string | null = null;

function loadTemplate(): string {
  if (templateCache) return templateCache;
  templateCache = readFileSync(
    resolve(__dirname, '../templates/demo/demo-page.html'),
    'utf-8',
  );
  return templateCache;
}

/* ------------------------------------------------------------------ */
/*  Render                                                              */
/* ------------------------------------------------------------------ */

const DISCLAIMER =
  'This is a simulated example of how an AI assistant could work for your business.';

export function renderDemoPage(data: {
  businessName: string;
  demoScenario: {
    customerMessage: string;
    botReply: string;
    followUp: string;
    botConfirm: string;
  };
  signupUrl: string;
}): string {
  let html = loadTemplate();

  const fields: Record<string, string> = {
    business_name: data.businessName,
    customer_message: data.demoScenario.customerMessage,
    bot_reply: data.demoScenario.botReply,
    follow_up: data.demoScenario.followUp,
    bot_confirm: data.demoScenario.botConfirm,
    signup_url: data.signupUrl,
    disclaimer: DISCLAIMER,
  };

  for (const [key, value] of Object.entries(fields)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }

  return html;
}
