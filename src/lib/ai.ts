import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { env } from '../config.js';
import { aiConfig } from './ai-config.js';

/* ------------------------------------------------------------------ */
/*  Provider clients (lazy — only created when needed)                 */
/* ------------------------------------------------------------------ */

let _groq: Groq | null = null;
function groq(): Groq {
  if (!_groq) {
    if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
    _groq = new Groq({ apiKey: env.GROQ_API_KEY });
  }
  return _groq;
}

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) {
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
    _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return _openai;
}

/** Ollama client — recreated when URL changes at runtime. */
let _ollama: OpenAI | null = null;
let _ollamaUrl = '';
function ollama(): OpenAI {
  if (!_ollama || _ollamaUrl !== aiConfig.ollamaUrl) {
    _ollamaUrl = aiConfig.ollamaUrl;
    _ollama = new OpenAI({
      baseURL: `${_ollamaUrl}/v1`,
      apiKey: 'ollama',
    });
  }
  return _ollama;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AiCallOptions {
  systemPrompt: string;
  userPrompt: string;
  json?: boolean;
}

type Provider = 'ollama' | 'groq' | 'openai';

/* ------------------------------------------------------------------ */
/*  Provider-specific call functions                                   */
/* ------------------------------------------------------------------ */

async function callOllama(opts: AiCallOptions): Promise<string> {
  const messages = [
    { role: 'system' as const, content: opts.systemPrompt },
    { role: 'user' as const, content: opts.userPrompt },
  ];

  const res = await ollama().chat.completions.create({
    model: aiConfig.ollamaModel,
    messages,
    temperature: 0.3,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
  });

  const content = res.choices[0]?.message?.content ?? '';
  if (opts.json && !content.trim()) throw new Error('Ollama returned empty response in JSON mode');
  return content;
}

async function callGroq(opts: AiCallOptions): Promise<string> {
  const messages = [
    { role: 'system' as const, content: opts.systemPrompt },
    { role: 'user' as const, content: opts.userPrompt },
  ];

  const res = await groq().chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.3,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
  });

  const content = res.choices[0]?.message?.content ?? '';
  if (opts.json && !content.trim()) throw new Error('Groq returned empty response in JSON mode');
  return content;
}

async function callOpenAI(opts: AiCallOptions): Promise<string> {
  const messages = [
    { role: 'system' as const, content: opts.systemPrompt },
    { role: 'user' as const, content: opts.userPrompt },
  ];

  const res = await openai().chat.completions.create({
    model: 'gpt-4.1-mini',
    messages,
    temperature: 0.3,
    ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
  });

  const content = res.choices[0]?.message?.content ?? '';
  if (opts.json && !content.trim()) throw new Error('OpenAI returned empty response in JSON mode');
  return content;
}

/* ------------------------------------------------------------------ */
/*  Fallback chain                                                     */
/* ------------------------------------------------------------------ */

const CALL_MAP: Record<Provider, (opts: AiCallOptions) => Promise<string>> = {
  ollama: callOllama,
  groq: callGroq,
  openai: callOpenAI,
};

const FALLBACK_CHAIN: Record<Provider, Provider[]> = {
  ollama: ['ollama', 'groq', 'openai'],
  groq: ['groq', 'openai'],
  openai: ['openai'],
};

/**
 * Call AI with automatic fallback.
 * Reads provider from aiConfig (mutable at runtime via dashboard).
 */
export async function callAI(opts: AiCallOptions): Promise<string> {
  const chain = FALLBACK_CHAIN[aiConfig.provider];

  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i]!;
    const callFn = CALL_MAP[provider];

    try {
      return await callFn(opts);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const isLast = i === chain.length - 1;

      if (status === 401 || status === 403) {
        if (isLast) throw err;
        console.warn(`[ai] ${provider} auth error (${status}), trying next provider`);
        continue;
      }

      if (status === 429) {
        console.warn(`[ai] ${provider} rate limited, trying next provider`);
      } else {
        console.warn(`[ai] ${provider} failed: ${(err as Error).message}${isLast ? '' : ', trying next provider'}`);
      }

      if (isLast) throw err;
    }
  }

  throw new Error('All AI providers failed');
}
