import { cleanEnv, str, url, num } from 'envalid';
import 'dotenv/config';

export const env = cleanEnv(process.env, {
  DATABASE_URL: url(),
  REDIS_URL: url({ default: 'redis://localhost:6379' }),
  OUTSCRAPER_API_KEY: str(),
  GROQ_API_KEY: str(),
  OPENAI_API_KEY: str(),
  RESEND_API_KEY: str(),
  RESEND_WEBHOOK_SECRET: str({ default: '' }),
  ADMIN_API_KEY: str(),
  SENDER_EMAIL: str({ default: 'hello@outreach.sigmaintel.io' }),
  SENDER_NAME: str({ default: 'Huntly' }),
  PHYSICAL_ADDRESS: str(),
  BASE_URL: str({ default: 'http://localhost:3002' }),
  NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),
  PORT: num({ default: 3002 }),
});
