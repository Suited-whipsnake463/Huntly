import { cleanEnv, str, url, num, bool } from 'envalid';
import 'dotenv/config';

export const env = cleanEnv(process.env, {
  DATABASE_URL: url(),
  REDIS_URL: url({ default: 'redis://localhost:6379' }),
  OUTSCRAPER_API_KEY: str(),
  GROQ_API_KEY: str({ default: '' }),
  OPENAI_API_KEY: str({ default: '' }),
  AI_PROVIDER: str({ choices: ['ollama', 'groq', 'openai'], default: 'ollama' }),
  OLLAMA_URL: str({ default: 'http://localhost:11434' }),
  OLLAMA_MODEL: str({ default: 'qwen3.5:latest' }),
  RESEND_API_KEY: str({ default: '' }),
  RESEND_WEBHOOK_SECRET: str({ default: '' }),
  ADMIN_API_KEY: str(),
  SENDER_EMAIL: str({ default: 'hello@outreach.sigmaintel.io' }),
  SENDER_NAME: str({ default: 'Huntly' }),
  PHYSICAL_ADDRESS: str({ default: '' }),
  BASE_URL: str({ default: 'https://sigmaintel.io' }),
  NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),
  PORT: num({ default: 3002 }),
  EMAIL_ENABLED: bool({ default: false }),
});
