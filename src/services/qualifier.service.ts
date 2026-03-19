import { callAI } from '../lib/ai.js';
import { excludedClientRepo } from '../db/index.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface QualificationInput {
  businessName: string;
  category: string;
  region: string;
  country?: string;
  phone?: string;
  websiteUrl?: string;
  googleRating?: number;
  googleReviewCount?: number;
  // Enrichment data
  hasWhatsapp: boolean | null;
  hasChatbot: boolean | null;
  hasOnlineBooking: boolean | null;
  painSignals: Array<{ signal: string; count: number; example: string }>;
  reviewSentimentSummary: string;
  /** ISO language code detected from region (en, pt, ar). Defaults to en. */
  language?: string;
}

export interface QualificationResult {
  fitScore: number;
  scoreReasoning: string;
  personalizedHook: string;
  demoScenario: {
    businessName: string;
    customerMessage: string;
    botReply: string;
    followUp: string;
    botConfirm: string;
  };
  disqualifyReason: string | null;
}

/* ------------------------------------------------------------------ */
/*  Prompt                                                             */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are scoring a business lead for SigmaAI, an AI-powered WhatsApp assistant platform. Based on the business profile and enrichment signals, produce:

1. fit_score (0-100): Higher if they have pain signals (slow response, hard to reach), use WhatsApp but have no chatbot, have high review volume, and are appointment-based.
2. score_reasoning: 1-2 sentences explaining the score.
3. personalized_hook: A compelling first paragraph for a cold email that references their specific pain signals and review data. Address the business owner by business name. Make it feel like a consultation, not spam.
4. demo_scenario: A realistic simulated WhatsApp conversation showing how SigmaAI would handle a customer inquiry for THIS specific business type.

Return ONLY valid JSON:
{
  "fitScore": number,
  "scoreReasoning": "string",
  "personalizedHook": "string",
  "demoScenario": {
    "businessName": "string",
    "customerMessage": "string",
    "botReply": "string",
    "followUp": "string",
    "botConfirm": "string"
  },
  "disqualifyReason": null
}`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  pt: 'Portuguese',
  ar: 'Arabic',
};

function buildUserPrompt(input: QualificationInput): string {
  const painText =
    input.painSignals.length > 0
      ? input.painSignals
          .map((p) => `${p.signal} (${p.count}x, e.g. "${p.example}")`)
          .join(', ')
      : 'None detected';

  const lang = input.language ?? 'en';
  const langLabel = LANGUAGE_LABELS[lang] ?? 'English';

  return `Business: ${input.businessName}
Category: ${input.category}
Location: ${input.region}${input.country ? ', ' + input.country : ''}
Google Rating: ${input.googleRating ?? 'N/A'} (${input.googleReviewCount ?? 0} reviews)
Has WhatsApp: ${input.hasWhatsapp ?? 'unknown'}
Has Chatbot: ${input.hasChatbot ?? 'unknown'}
Has Online Booking: ${input.hasOnlineBooking ?? 'unknown'}
Review Sentiment: ${input.reviewSentimentSummary || 'No reviews analyzed'}
Pain Signals: ${painText}
Language: Generate the personalized_hook and demo_scenario in ${langLabel}.`;
}

function emptyResult(businessName: string): QualificationResult {
  return {
    fitScore: 0,
    scoreReasoning: '',
    personalizedHook: '',
    demoScenario: {
      businessName,
      customerMessage: '',
      botReply: '',
      followUp: '',
      botConfirm: '',
    },
    disqualifyReason: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

export async function qualifyLead(
  input: QualificationInput,
): Promise<QualificationResult> {
  // 1. Check exclusion first
  const domain = input.websiteUrl
    ? new URL(input.websiteUrl).hostname
    : undefined;
  const isExcluded = await excludedClientRepo.isExcluded(
    input.phone ?? undefined,
    domain,
  );
  if (isExcluded) {
    return {
      ...emptyResult(input.businessName),
      scoreReasoning: 'Excluded: existing client or competitor',
      disqualifyReason: 'excluded_client',
    };
  }

  // 2. Call AI for scoring + content generation
  const raw = await callAI({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(input),
    json: true,
  });

  try {
    const result = JSON.parse(raw) as QualificationResult;
    // Ensure fitScore is bounded
    result.fitScore = Math.max(0, Math.min(100, result.fitScore));
    return result;
  } catch {
    // If AI returns garbage, return low score for manual review
    return {
      ...emptyResult(input.businessName),
      fitScore: 30,
      scoreReasoning: 'AI qualification failed — manual review needed',
    };
  }
}
