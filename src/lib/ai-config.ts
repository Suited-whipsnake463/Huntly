import { env } from '../config.js';

/** Runtime AI config — mutable so the dashboard can switch providers without restart. */
export const aiConfig = {
  provider: env.AI_PROVIDER as 'ollama' | 'groq' | 'openai',
  ollamaModel: env.OLLAMA_MODEL,
  ollamaUrl: env.OLLAMA_URL,
};
