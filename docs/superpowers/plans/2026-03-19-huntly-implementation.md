# Huntly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an end-to-end lead generation pipeline that sources businesses from Google Maps, enriches them with website + review intelligence, generates personalized outreach emails, and drives SigmaAI signups.

**Architecture:** 4-stage BullMQ pipeline (Source → Enrich → Qualify → Outreach) with Fastify HTTP for admin API, demo pages, unsubscribe flow, and Resend webhooks. Cheerio for lightweight HTML parsing, Playwright fallback for SPAs. Groq AI for review analysis + qualification with GPT-4o-mini fallback.

**Tech Stack:** Node.js 22, TypeScript (ES modules), Fastify, BullMQ, PostgreSQL + Prisma, Playwright, Cheerio, Resend, Outscraper API, Groq SDK, OpenAI SDK

**Spec:** `docs/superpowers/specs/2026-03-19-huntly-lead-engine-design.md`

---

## File Map

```
Huntly/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── prisma/
│   └── schema.prisma
├── src/
│   ├── index.ts                         # Fastify server entry + worker bootstrap
│   ├── config.ts                        # Env validation via envalid
│   ├── lib/
│   │   ├── redis.ts                     # Shared Redis connection (IORedis)
│   │   ├── prisma.ts                    # Shared Prisma client singleton
│   │   ├── ai.ts                        # Groq + OpenAI client init, callAI() with fallback
│   │   └── tokens.ts                    # generateToken() helper (crypto.randomBytes)
│   ├── db/
│   │   ├── repositories/
│   │   │   ├── campaign.repo.ts
│   │   │   ├── lead.repo.ts
│   │   │   ├── enrichment.repo.ts
│   │   │   ├── qualification.repo.ts
│   │   │   ├── outreach.repo.ts
│   │   │   └── excluded-client.repo.ts
│   │   └── index.ts                     # Re-exports all repos
│   ├── services/
│   │   ├── outscraper.service.ts        # Google Maps search + reviews
│   │   ├── crawler.service.ts           # Cheerio first, Playwright fallback
│   │   ├── review-analyzer.service.ts   # AI review sentiment analysis
│   │   ├── qualifier.service.ts         # AI scoring + hook + demo gen
│   │   ├── email.service.ts             # Resend send + template rendering
│   │   └── demo-page.service.ts         # Demo page HTML rendering
│   ├── workers/
│   │   ├── source.worker.ts
│   │   ├── enrich.worker.ts
│   │   ├── qualify.worker.ts
│   │   └── outreach.worker.ts
│   ├── middleware/
│   │   └── api-key-auth.ts
│   ├── routes/
│   │   ├── campaign.routes.ts
│   │   ├── lead.routes.ts
│   │   ├── outreach.routes.ts
│   │   ├── demo.routes.ts
│   │   ├── unsubscribe.routes.ts
│   │   └── webhook.routes.ts
│   └── templates/
│       ├── emails/
│       │   ├── mirror.html              # Email 1 template
│       │   ├── social-proof.html        # Email 2 template
│       │   └── direct-offer.html        # Email 3 template
│       ├── demo/
│       │   └── demo-page.html           # Demo page template
│       └── unsubscribe/
│           └── unsubscribe.html         # Unsubscribe confirmation
├── tests/
│   ├── setup.ts                         # Test helpers, mock factories
│   ├── services/
│   │   ├── outscraper.service.test.ts
│   │   ├── crawler.service.test.ts
│   │   ├── review-analyzer.service.test.ts
│   │   ├── qualifier.service.test.ts
│   │   ├── email.service.test.ts
│   │   └── demo-page.service.test.ts
│   ├── workers/
│   │   ├── source.worker.test.ts
│   │   ├── enrich.worker.test.ts
│   │   ├── qualify.worker.test.ts
│   │   └── outreach.worker.test.ts
│   └── routes/
│       ├── campaign.routes.test.ts
│       ├── demo.routes.test.ts
│       ├── unsubscribe.routes.test.ts
│       └── webhook.routes.test.ts
└── scripts/
    └── seed-campaign.ts
```

---

## Phase 1: Foundation

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.env.example`, `.gitignore`

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/pauloloureiro/Dev/PersonalProjects/Huntly
npm init -y
```

- [ ] **Step 2: Install core dependencies**

```bash
npm i fastify @fastify/cors bullmq ioredis @prisma/client envalid dotenv
npm i -D typescript @types/node tsx vitest prisma
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create .env.example**

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/huntly_db
REDIS_URL=redis://localhost:6379
OUTSCRAPER_API_KEY=
GROQ_API_KEY=
OPENAI_API_KEY=
RESEND_API_KEY=
ADMIN_API_KEY=
RESEND_WEBHOOK_SECRET=
SENDER_EMAIL=hello@outreach.sigmaintel.io
SENDER_NAME=Huntly
PHYSICAL_ADDRESS="Your physical address here"
BASE_URL=http://localhost:3001
NODE_ENV=development
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 6: Add scripts to package.json**

Add `"type": "module"` and scripts:
```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:studio": "prisma studio",
    "seed": "tsx scripts/seed-campaign.ts"
  }
}
```

- [ ] **Step 7: Create vitest.config.ts and tests/setup.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
  },
});
```

```typescript
// tests/setup.ts
import { vi } from 'vitest';

// Mock Redis globally to prevent real connections in tests
vi.mock('../src/lib/redis.js', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
    duplicate: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
  },
}));
```

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json .env.example .gitignore vitest.config.ts tests/setup.ts
git commit -m "chore: project scaffold — package.json, tsconfig, vitest config, env template"
```

---

### Task 2: Config + Shared Libraries

**Files:**
- Create: `src/config.ts`, `src/lib/redis.ts`, `src/lib/prisma.ts`, `src/lib/tokens.ts`, `src/lib/ai.ts`

- [ ] **Step 1: Create config.ts with envalid**

```typescript
// src/config.ts
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
  BASE_URL: str({ default: 'http://localhost:3001' }),
  NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),
  PORT: num({ default: 3001 }),
});
```

- [ ] **Step 2: Create lib/redis.ts**

```typescript
// src/lib/redis.ts
import IORedis from 'ioredis';
import { env } from '../config.js';

export const redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
```

- [ ] **Step 3: Create lib/prisma.ts**

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 4: Create lib/tokens.ts**

```typescript
// src/lib/tokens.ts
import crypto from 'node:crypto';

export function generateToken(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}
```

- [ ] **Step 5: Install AI SDKs and create lib/ai.ts**

```bash
npm i groq-sdk openai
```

```typescript
// src/lib/ai.ts
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { env } from '../config.js';

export const groq = new Groq({ apiKey: env.GROQ_API_KEY });
export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export interface AiCallOptions {
  systemPrompt: string;
  userPrompt: string;
  json?: boolean;
}

/**
 * Call Groq first, fall back to GPT-4o-mini on 429 or error.
 * Returns parsed JSON if json=true, raw string otherwise.
 */
export async function callAI(opts: AiCallOptions): Promise<string> {
  const messages = [
    { role: 'system' as const, content: opts.systemPrompt },
    { role: 'user' as const, content: opts.userPrompt },
  ];

  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.3,
      ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
    });
    const content = res.choices[0]?.message?.content ?? '';
    if (opts.json && !content.trim()) throw new Error('Groq returned empty response in JSON mode');
    return content;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;

    // Surface config errors — don't silently fall back
    if (status === 401 || status === 403) {
      throw new Error(`Groq auth error (${status}) — check GROQ_API_KEY`);
    }

    if (status === 429) {
      console.warn('[ai] Groq rate limited (429), waiting 10s then falling back to GPT-4o-mini');
      await new Promise(r => setTimeout(r, 10_000));
    } else {
      console.warn(`[ai] Groq failed (${status ?? 'unknown'}), falling back to GPT-4o-mini`);
    }

    // Fallback to OpenAI
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.3,
      ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
    });
    const content = res.choices[0]?.message?.content ?? '';
    if (opts.json && !content.trim()) throw new Error('OpenAI returned empty response in JSON mode');
    return content;
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/lib/
git commit -m "feat: config validation + shared libs (redis, prisma, ai, tokens)"
```

---

### Task 3: Prisma Schema + Database

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Create the full Prisma schema**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum CampaignStatus {
  draft
  active
  paused
  completed
}

enum LeadStatus {
  sourced
  enriched
  qualified
  contacted
  replied
  converted
  unsubscribed
}

enum EmailStatus {
  scheduled
  sending
  delivered
  opened
  clicked
  bounced
  failed
  complained
}

model Campaign {
  id                 String         @id @default(uuid())
  name               String
  status             CampaignStatus @default(draft)
  vertical           String
  regions            String[]
  emailTemplateSetId String?        @map("email_template_set_id")
  dripConfig         Json           @default("{\"delays\": [0, 3, 7], \"maxEmails\": 3}") @map("drip_config")
  senderAddress      String?        @map("sender_address")
  createdAt          DateTime       @default(now()) @map("created_at")
  updatedAt          DateTime       @updatedAt @map("updated_at")

  leads           Lead[]
  outreachEmails  OutreachEmail[]
  emailTemplateSet EmailTemplateSet? @relation(fields: [emailTemplateSetId], references: [id])

  @@map("campaigns")
}

model Lead {
  id                  String     @id @default(uuid())
  campaignId          String     @map("campaign_id")
  businessName        String     @map("business_name")
  category            String?
  address             String?
  region              String?
  country             String?
  phone               String?
  websiteUrl          String?    @map("website_url")
  email               String?
  googleMapsPlaceId   String?    @unique @map("google_maps_place_id")
  googleRating        Float?     @map("google_rating")
  googleReviewCount   Int?       @map("google_review_count")
  sourceData          Json?      @map("source_data")
  status              LeadStatus @default(sourced)
  hasReplied          Boolean    @default(false) @map("has_replied")
  demoToken           String?    @unique @map("demo_token")
  demoExpiresAt       DateTime?  @map("demo_expires_at")
  unsubscribeToken    String?    @unique @map("unsubscribe_token")
  lastError           String?    @map("last_error")
  createdAt           DateTime   @default(now()) @map("created_at")
  updatedAt           DateTime   @updatedAt @map("updated_at")

  campaign       Campaign          @relation(fields: [campaignId], references: [id])
  enrichment     LeadEnrichment?
  qualification  LeadQualification?
  outreachEmails OutreachEmail[]

  @@index([campaignId])
  @@index([status])
  @@map("leads")
}

model LeadEnrichment {
  leadId                 String   @id @map("lead_id")
  hasWhatsapp            Boolean? @map("has_whatsapp")
  hasChatbot             Boolean? @map("has_chatbot")
  hasOnlineBooking       Boolean? @map("has_online_booking")
  emailsFound            String[] @map("emails_found")
  websiteTechSignals     Json?    @map("website_tech_signals")
  reviewSentimentSummary String?  @map("review_sentiment_summary")
  painSignals            Json?    @map("pain_signals")
  enrichedAt             DateTime @default(now()) @map("enriched_at")

  lead Lead @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@map("lead_enrichments")
}

model LeadQualification {
  leadId           String   @id @map("lead_id")
  fitScore         Int      @map("fit_score")
  scoreReasoning   String   @map("score_reasoning")
  personalizedHook String   @map("personalized_hook")
  demoPageData     Json     @map("demo_page_data")
  qualifiedAt      DateTime @default(now()) @map("qualified_at")

  lead Lead @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@map("lead_qualifications")
}

model OutreachEmail {
  id              String      @id @default(uuid())
  leadId          String      @map("lead_id")
  campaignId      String      @map("campaign_id")
  sequenceNumber  Int         @map("sequence_number")
  resendMessageId String?     @map("resend_message_id")
  subject         String
  bodyHtml        String      @map("body_html")
  status          EmailStatus @default(scheduled)
  scheduledFor    DateTime    @map("scheduled_for")
  sentAt          DateTime?   @map("sent_at")
  deliveredAt     DateTime?   @map("delivered_at")
  openedAt        DateTime?   @map("opened_at")
  clickedAt       DateTime?   @map("clicked_at")
  createdAt       DateTime    @default(now()) @map("created_at")
  updatedAt       DateTime    @updatedAt @map("updated_at")

  lead     Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  campaign Campaign @relation(fields: [campaignId], references: [id])

  @@index([leadId])
  @@index([campaignId])
  @@index([status, scheduledFor])
  @@map("outreach_emails")
}

model EmailTemplateSet {
  id       String @id @default(uuid())
  name     String
  vertical String

  templates EmailTemplate[]
  campaigns Campaign[]

  @@map("email_template_sets")
}

model EmailTemplate {
  id              String @id @default(uuid())
  templateSetId   String @map("template_set_id")
  sequenceNumber  Int    @map("sequence_number")
  subjectTemplate String @map("subject_template")
  bodyTemplate    String @map("body_template")
  createdAt       DateTime @default(now()) @map("created_at")

  templateSet EmailTemplateSet @relation(fields: [templateSetId], references: [id], onDelete: Cascade)

  @@unique([templateSetId, sequenceNumber])
  @@map("email_templates")
}

model ExcludedClient {
  id        String   @id @default(uuid())
  phone     String?
  domain    String?
  reason    String
  createdAt DateTime @default(now()) @map("created_at")

  @@map("excluded_clients")
}
```

- [ ] **Step 2: Run initial migration**

```bash
npx prisma migrate dev --name init
```

Run: `npx prisma migrate dev --name init`
Expected: Migration created, `huntly_db` tables generated.

- [ ] **Step 3: Commit**

```bash
git add prisma/
git commit -m "feat: Prisma schema — campaigns, leads, enrichment, qualification, outreach, templates"
```

---

### Task 4: Repository Layer

**Files:**
- Create: `src/db/repositories/campaign.repo.ts`, `lead.repo.ts`, `enrichment.repo.ts`, `qualification.repo.ts`, `outreach.repo.ts`, `excluded-client.repo.ts`, `src/db/index.ts`

- [ ] **Step 1: Create lead.repo.ts** (most complex — dedup, status transitions)

```typescript
// src/db/repositories/lead.repo.ts
import { prisma } from '../../lib/prisma.js';
import { LeadStatus, Prisma } from '@prisma/client';
import { generateToken } from '../../lib/tokens.js';

export const leadRepo = {
  async createFromSource(data: {
    campaignId: string;
    businessName: string;
    category?: string;
    address?: string;
    region?: string;
    country?: string;
    phone?: string;
    websiteUrl?: string;
    googleMapsPlaceId?: string;
    googleRating?: number;
    googleReviewCount?: number;
    sourceData?: Prisma.InputJsonValue;
  }) {
    return prisma.lead.create({
      data: {
        ...data,
        demoToken: generateToken(),
        unsubscribeToken: generateToken(),
      },
    });
  },

  async existsByPlaceId(placeId: string): Promise<boolean> {
    const count = await prisma.lead.count({
      where: { googleMapsPlaceId: placeId },
    });
    return count > 0;
  },

  async updateStatus(id: string, status: LeadStatus, error?: string) {
    return prisma.lead.update({
      where: { id },
      data: { status, lastError: error ?? null },
    });
  },

  async findByDemoToken(token: string) {
    return prisma.lead.findUnique({
      where: { demoToken: token },
      include: { qualification: true, campaign: true },
    });
  },

  async findByUnsubscribeToken(token: string) {
    return prisma.lead.findUnique({
      where: { unsubscribeToken: token },
    });
  },

  async unsubscribe(id: string) {
    return prisma.lead.update({
      where: { id },
      data: { status: 'unsubscribed' },
    });
  },

  async markReplied(id: string) {
    return prisma.lead.update({
      where: { id },
      data: { hasReplied: true, status: 'replied' },
    });
  },

  async findByCampaignAndStatus(campaignId: string, status: LeadStatus, limit = 50) {
    return prisma.lead.findMany({
      where: { campaignId, status },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });
  },

  async setDemoExpiry(id: string, expiresAt: Date) {
    return prisma.lead.update({
      where: { id },
      data: { demoExpiresAt: expiresAt },
    });
  },

  async setEmail(id: string, email: string) {
    return prisma.lead.update({
      where: { id },
      data: { email },
    });
  },
};
```

- [ ] **Step 2: Create remaining repos** (campaign, enrichment, qualification, outreach, excluded-client)

Each follows the same pattern. Key methods:

- `campaign.repo.ts`: `create()`, `findById()`, `updateStatus()`, `findActive()`
- `enrichment.repo.ts`: `upsert(leadId, data)` — creates or updates enrichment
- `qualification.repo.ts`: `upsert(leadId, data)` — creates or updates qualification
- `outreach.repo.ts`: `create()`, `findByLeadId()`, `updateStatus()`, `findScheduledBefore(date)`, `pauseDripForLead(leadId)`
- `excluded-client.repo.ts`: `isExcluded(phone?, domain?)`, `create()`

- [ ] **Step 3: Create db/index.ts re-export**

```typescript
// src/db/index.ts
export { campaignRepo } from './repositories/campaign.repo.js';
export { leadRepo } from './repositories/lead.repo.js';
export { enrichmentRepo } from './repositories/enrichment.repo.js';
export { qualificationRepo } from './repositories/qualification.repo.js';
export { outreachRepo } from './repositories/outreach.repo.js';
export { excludedClientRepo } from './repositories/excluded-client.repo.js';
```

- [ ] **Step 4: Write tests for lead.repo.ts** (dedup + status transitions)

```typescript
// tests/db/lead.repo.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
// Test dedup: createFromSource with same placeId should throw unique constraint
// Test status transitions: sourced → enriched → qualified → contacted
// Test findByDemoToken returns lead + qualification
// Test unsubscribe sets status to 'unsubscribed'
```

Run: `npm test -- tests/db/lead.repo.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/db/ tests/db/
git commit -m "feat: repository layer — campaign, lead, enrichment, qualification, outreach, excluded-client"
```

---

## Phase 2: Source Pipeline

### Task 5: Outscraper Service

**Files:**
- Create: `src/services/outscraper.service.ts`, `tests/services/outscraper.service.test.ts`

- [ ] **Step 1: Install outscraper client**

```bash
npm i outscraper
```

- [ ] **Step 2: Write failing test**

```typescript
// tests/services/outscraper.service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { searchBusinesses, fetchReviews } from '../../src/services/outscraper.service.js';

// Mock outscraper SDK
vi.mock('outscraper', () => ({
  default: class {
    googleMapsSearch = vi.fn();
    googleMapsReviews = vi.fn();
  }
}));

describe('outscraper.service', () => {
  it('searchBusinesses returns normalized leads from API response', async () => {
    // Test: raw Outscraper response → normalized LeadSourceData[]
  });

  it('fetchReviews returns review texts for a place_id', async () => {
    // Test: returns { reviews: string[], rating: number }
  });

  it('searchBusinesses deduplicates by place_id within batch', async () => {
    // Test: if API returns duplicates, only unique place_ids returned
  });
});
```

Run: `npm test -- tests/services/outscraper.service.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement outscraper.service.ts**

```typescript
// src/services/outscraper.service.ts
import Outscraper from 'outscraper';
import { env } from '../config.js';

const client = new Outscraper(env.OUTSCRAPER_API_KEY);

export interface LeadSourceData {
  businessName: string;
  category: string;
  address: string;
  phone?: string;
  websiteUrl?: string;
  googleMapsPlaceId: string;
  googleRating?: number;
  googleReviewCount?: number;
  raw: Record<string, unknown>;
}

export async function searchBusinesses(query: string, limit = 100): Promise<LeadSourceData[]> {
  const results = await client.googleMapsSearch(query, limit);
  const seen = new Set<string>();
  const leads: LeadSourceData[] = [];

  for (const batch of results) {
    for (const item of Array.isArray(batch) ? batch : [batch]) {
      const placeId = item.place_id;
      if (!placeId || seen.has(placeId)) continue;
      seen.add(placeId);

      leads.push({
        businessName: item.name ?? 'Unknown',
        category: item.type ?? item.category ?? '',
        address: item.full_address ?? item.address ?? '',
        phone: item.phone ?? undefined,
        websiteUrl: item.site ?? undefined,
        googleMapsPlaceId: placeId,
        googleRating: item.rating ? Number(item.rating) : undefined,
        googleReviewCount: item.reviews ? Number(item.reviews) : undefined,
        raw: item,
      });
    }
  }
  return leads;
}

export async function fetchReviews(placeId: string, limit = 20): Promise<{ reviews: string[]; rating: number }> {
  const results = await client.googleMapsReviews(placeId, limit);
  const reviews: string[] = [];
  let rating = 0;

  for (const batch of results) {
    for (const item of Array.isArray(batch) ? batch : [batch]) {
      if (item.reviews_data) {
        for (const review of item.reviews_data) {
          if (review.review_text) reviews.push(review.review_text);
        }
      }
      if (item.rating) rating = Number(item.rating);
    }
  }
  return { reviews, rating };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/services/outscraper.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/outscraper.service.ts tests/services/outscraper.service.test.ts
git commit -m "feat: outscraper service — searchBusinesses + fetchReviews with dedup"
```

---

### Task 6: Source Worker

**Files:**
- Create: `src/workers/source.worker.ts`, `tests/workers/source.worker.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/workers/source.worker.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('source.worker', () => {
  it('generates queries from campaign vertical × regions', () => {
    // vertical: "dental_clinic", regions: ["London,UK", "Dubai,AE"]
    // → ["dental_clinic in London,UK", "dental_clinic in Dubai,AE"]
  });

  it('skips leads with existing place_id (dedup)', async () => {
    // Mock leadRepo.existsByPlaceId to return true
    // Verify createFromSource is NOT called
  });

  it('creates leads with status sourced and enqueues enrich jobs', async () => {
    // Verify lead created + enrichQueue.add called
  });

  it('records error in lead.lastError on Outscraper failure', async () => {
    // Mock searchBusinesses to throw, verify error handling
  });
});
```

- [ ] **Step 2: Implement source.worker.ts**

```typescript
// src/workers/source.worker.ts
import { Worker, Queue } from 'bullmq';
import { redis } from '../lib/redis.js';
import { searchBusinesses } from '../services/outscraper.service.js';
import { leadRepo, campaignRepo } from '../db/index.js';

export const enrichQueue = new Queue('enrich', { connection: redis });

interface SourceJobData {
  campaignId: string;
}

export const sourceWorker = new Worker<SourceJobData>(
  'source',
  async (job) => {
    const campaign = await campaignRepo.findById(job.data.campaignId);
    if (!campaign || campaign.status !== 'active') return;

    for (const region of campaign.regions) {
      const query = `${campaign.vertical} in ${region}`;
      const results = await searchBusinesses(query);

      for (const result of results) {
        // Dedup check
        if (result.googleMapsPlaceId && await leadRepo.existsByPlaceId(result.googleMapsPlaceId)) {
          continue;
        }

        const lead = await leadRepo.createFromSource({
          campaignId: campaign.id,
          businessName: result.businessName,
          category: result.category,
          address: result.address,
          region,
          phone: result.phone,
          websiteUrl: result.websiteUrl,
          googleMapsPlaceId: result.googleMapsPlaceId,
          googleRating: result.googleRating,
          googleReviewCount: result.googleReviewCount,
          sourceData: result.raw,
        });

        await enrichQueue.add('enrich-lead', { leadId: lead.id }, {
          jobId: `enrich-${lead.id}`, // idempotent
        });
      }
    }
  },
  {
    connection: redis,
    concurrency: 2,
    limiter: { max: 2, duration: 5000 },
  }
);
```

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/workers/source.worker.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/workers/source.worker.ts tests/workers/source.worker.test.ts
git commit -m "feat: source worker — queries Outscraper, dedup by place_id, enqueues enrich jobs"
```

---

## Phase 3: Enrich Pipeline

### Task 7: Crawler Service (Cheerio + Playwright Fallback)

**Files:**
- Create: `src/services/crawler.service.ts`, `tests/services/crawler.service.test.ts`

- [ ] **Step 1: Install cheerio + playwright**

```bash
npm i cheerio playwright
npx playwright install chromium
```

- [ ] **Step 2: Write failing tests**

```typescript
// tests/services/crawler.service.test.ts
describe('crawler.service', () => {
  it('extracts emails from mailto: links', () => {});
  it('detects wa.me WhatsApp links', () => {});
  it('detects chat widgets (Intercom, Drift, Tidio)', () => {});
  it('detects booking widgets (Calendly, Cal.com)', () => {});
  it('falls back to Playwright when cheerio finds empty body', () => {});
  it('returns null signals on timeout', () => {});
});
```

- [ ] **Step 3: Implement crawler.service.ts**

Key logic:
1. Fetch homepage with `fetch()` (Node 22 built-in), parse with Cheerio
2. **Multi-page crawl**: discover internal links (contact, about, services) from nav/footer, fetch up to 5 pages total. Prioritize pages matching `/contact|about|service|booking|appointment/i` in URL or link text.
3. Extract emails: scan all pages for `href="mailto:..."` + regex `[\w.-]+@[\w.-]+\.\w+` on text. Deduplicate.
4. Detect WhatsApp: scan for `wa.me`, `api.whatsapp.com`, WhatsApp widget scripts across all pages
5. Detect chatbots: scan for `intercom`, `drift`, `tidio`, `manychat` in script sources
6. Detect booking: scan for `calendly.com`, `cal.com`, booking form patterns
7. If homepage `<body>` has < 50 chars of text content → SPA detected → retry with Playwright (single page only, for resource efficiency)
8. Playwright: launch browser, goto URL with 15s timeout, extract same signals, close

Return type:
```typescript
export interface CrawlResult {
  emails: string[];
  hasWhatsapp: boolean | null;
  hasChatbot: boolean | null;
  hasOnlineBooking: boolean | null;
  techSignals: Record<string, unknown>;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test -- tests/services/crawler.service.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/services/crawler.service.ts tests/services/crawler.service.test.ts
git commit -m "feat: crawler service — cheerio HTML extraction + Playwright SPA fallback"
```

---

### Task 8: Review Analyzer Service

**Files:**
- Create: `src/services/review-analyzer.service.ts`, `tests/services/review-analyzer.service.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('review-analyzer.service', () => {
  it('returns structured pain signals from reviews', async () => {
    // Mock callAI to return valid JSON
    // Verify output shape: { sentimentSummary, painSignals[], positiveThemes[] }
  });

  it('handles empty reviews gracefully', async () => {
    // No reviews → returns empty signals, no AI call
  });

  it('handles malformed AI response with retry', async () => {
    // First callAI returns invalid JSON, second returns valid
  });
});
```

- [ ] **Step 2: Implement review-analyzer.service.ts**

```typescript
// src/services/review-analyzer.service.ts
import { callAI } from '../lib/ai.js';

export interface PainSignal {
  signal: string;
  count: number;
  example: string;
}

export interface ReviewAnalysis {
  sentimentSummary: string;
  painSignals: PainSignal[];
  positiveThemes: string[];
  totalAnalyzed: number;
}

const SYSTEM_PROMPT = `You are analyzing Google reviews for a business. Extract:
1. A 1-sentence sentiment summary
2. Pain signals customers mention (slow_response, hard_to_reach, hard_to_book, no_after_hours, no_online_booking, rude_staff, long_wait)
3. Positive themes

Return ONLY valid JSON:
{
  "sentimentSummary": "string",
  "painSignals": [{"signal": "string", "count": number, "example": "quote from review"}],
  "positiveThemes": ["string"],
  "totalAnalyzed": number
}`;

export async function analyzeReviews(reviews: string[]): Promise<ReviewAnalysis> {
  if (reviews.length === 0) {
    return { sentimentSummary: '', painSignals: [], positiveThemes: [], totalAnalyzed: 0 };
  }

  const userPrompt = `Analyze these ${reviews.length} reviews:\n\n${reviews.map((r, i) => `${i + 1}. "${r}"`).join('\n')}`;

  const raw = await callAI({ systemPrompt: SYSTEM_PROMPT, userPrompt, json: true });

  try {
    return JSON.parse(raw) as ReviewAnalysis;
  } catch {
    // Retry once with stricter prompt
    const retryRaw = await callAI({
      systemPrompt: SYSTEM_PROMPT + '\nIMPORTANT: Return ONLY the JSON object, no markdown, no explanation.',
      userPrompt,
      json: true,
    });
    try {
      return JSON.parse(retryRaw) as ReviewAnalysis;
    } catch {
      // Skip review analysis entirely
      return { sentimentSummary: '', painSignals: [], positiveThemes: [], totalAnalyzed: 0 };
    }
  }
}
```

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add src/services/review-analyzer.service.ts tests/services/review-analyzer.service.test.ts
git commit -m "feat: review analyzer — AI pain signal extraction with retry + graceful fallback"
```

---

### Task 9: Enrich Worker

**Files:**
- Create: `src/workers/enrich.worker.ts`, `tests/workers/enrich.worker.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('enrich.worker', () => {
  it('crawls website and analyzes reviews in parallel', async () => {});
  it('picks best email from crawl results and sets lead.email', async () => {});
  it('saves enrichment data and transitions lead to enriched', async () => {});
  it('enqueues qualify job after successful enrichment', async () => {});
  it('handles crawler timeout gracefully — saves null signals', async () => {});
  it('skips review analysis if no reviews available', async () => {});
});
```

- [ ] **Step 2: Implement enrich.worker.ts**

Key logic:
1. Fetch lead from DB
2. Run in parallel: `crawlWebsite(lead.websiteUrl)` + `fetchReviews(lead.googleMapsPlaceId)` then `analyzeReviews(reviews)`
3. Pick best email from crawl results (prefer contact@ or info@ over generic)
4. Save to `lead_enrichments` via `enrichmentRepo.upsert()`
5. Update lead email if found, set status to `enriched`
6. Enqueue qualify job

Concurrency: 5 (capped for Playwright memory)

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add src/workers/enrich.worker.ts tests/workers/enrich.worker.test.ts
git commit -m "feat: enrich worker — parallel website crawl + review analysis, enqueues qualify"
```

---

## Phase 4: Qualify Pipeline

### Task 10: Qualifier Service

**Files:**
- Create: `src/services/qualifier.service.ts`, `tests/services/qualifier.service.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('qualifier.service', () => {
  it('returns fit score, reasoning, hook, and demo scenario', async () => {});
  it('scores high for businesses with pain signals + WhatsApp + no chatbot', async () => {});
  it('disqualifies leads matching excluded_clients', async () => {});
  it('disqualifies leads with no email', async () => {});
});
```

- [ ] **Step 2: Implement qualifier.service.ts**

Single AI call that receives:
- Business profile (name, category, region, rating, review count)
- Enrichment signals (hasWhatsapp, hasChatbot, hasBooking, painSignals)
- Returns: `{ fitScore, scoreReasoning, personalizedHook, demoScenario }`

Check `excludedClientRepo.isExcluded(phone, domain)` before calling AI.

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add src/services/qualifier.service.ts tests/services/qualifier.service.test.ts
git commit -m "feat: qualifier service — AI scoring, personalized hook, demo scenario generation"
```

---

### Task 11: Qualify Worker

**Files:**
- Create: `src/workers/qualify.worker.ts`, `tests/workers/qualify.worker.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('qualify.worker', () => {
  it('qualifies lead and saves qualification data', async () => {});
  it('auto-approves score >= 70 and enqueues outreach', async () => {});
  it('leaves score 40-69 as qualified for manual review', async () => {});
  it('marks score < 40 as qualified but does not enqueue outreach', async () => {});
  it('retries 2x on AI failure, then leaves lead as enriched', async () => {});
});
```

- [ ] **Step 2: Implement qualify.worker.ts**

Key logic:
1. Fetch lead + enrichment from DB
2. Call `qualifyLead()` from qualifier service
3. Save qualification via `qualificationRepo.upsert()`
4. If `fitScore >= 70`: update lead status to `qualified`, enqueue outreach job
5. If `fitScore 40-69`: update status to `qualified` (manual review required)
6. If `fitScore < 40`: update status to `qualified` (auto-skip, no outreach)

Concurrency: 3 (AI rate limit aware)

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add src/workers/qualify.worker.ts tests/workers/qualify.worker.test.ts
git commit -m "feat: qualify worker — AI scoring with threshold-based routing"
```

---

## Phase 5: Outreach Pipeline

### Task 12: Email Service + Templates

**Files:**
- Create: `src/services/email.service.ts`, `src/templates/emails/mirror.html`, `src/templates/emails/social-proof.html`, `src/templates/emails/direct-offer.html`, `tests/services/email.service.test.ts`

- [ ] **Step 1: Install resend**

```bash
npm i resend
```

- [ ] **Step 2: Write failing test**

```typescript
describe('email.service', () => {
  it('renders template with merge fields', () => {
    // {{business_name}} → "Odonto Premium"
  });
  it('sends email via Resend with correct headers', async () => {
    // Verify List-Unsubscribe, List-Unsubscribe-Post headers
    // Verify physical address in footer
  });
  it('returns resend message ID on success', async () => {});
  it('throws on Resend 4xx', async () => {});
});
```

- [ ] **Step 3: Create HTML email templates**

Three templates with `{{merge_field}}` placeholders:
- `mirror.html`: Uses `{{personalized_hook}}`, `{{pain_stat}}`, `{{demo_url}}`, `{{business_name}}`, `{{unsubscribe_url}}`, `{{physical_address}}`
- `social-proof.html`: Uses `{{business_name}}`, `{{case_study}}`, `{{demo_url}}`, `{{unsubscribe_url}}`, `{{physical_address}}`
- `direct-offer.html`: Uses `{{business_name}}`, `{{unsubscribe_url}}`, `{{physical_address}}`

All templates include: physical address footer, unsubscribe link.

- [ ] **Step 4: Implement email.service.ts**

```typescript
// src/services/email.service.ts
import { Resend } from 'resend';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config.js';

const resend = new Resend(env.RESEND_API_KEY);

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTemplate(name: string): string {
  return readFileSync(resolve(__dirname, `../templates/emails/${name}.html`), 'utf-8');
}

function renderTemplate(template: string, fields: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(fields)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

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
```

- [ ] **Step 5: Run tests, verify pass**

- [ ] **Step 6: Commit**

```bash
git add src/services/email.service.ts src/templates/emails/ tests/services/email.service.test.ts
git commit -m "feat: email service — Resend SDK + 3 drip templates with compliance headers"
```

---

### Task 13: Demo Page Service + Route

**Files:**
- Create: `src/services/demo-page.service.ts`, `src/routes/demo.routes.ts`, `src/templates/demo/demo-page.html`, `tests/routes/demo.routes.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('GET /demo/:token', () => {
  it('renders demo page for valid token', async () => {});
  it('returns 404 for invalid token', async () => {});
  it('returns 404 for expired demo', async () => {});
  it('includes disclaimer text', async () => {});
  it('CTA links to SigmaAI signup with UTM params', async () => {});
});
```

- [ ] **Step 2: Create demo-page.html template**

WhatsApp-style chat UI with:
- Business name header
- Simulated conversation bubbles (customer message → bot reply → follow-up → confirm)
- CTA button: "Get this running on your WhatsApp in 24 hours"
- Disclaimer footer
- Clean, mobile-responsive design

- [ ] **Step 3: Implement demo-page.service.ts + demo.routes.ts**

`demo-page.service.ts`: Takes lead + qualification data, renders HTML template
`demo.routes.ts`: `GET /demo/:token` — looks up lead by `demoToken`, checks expiry, renders page

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/services/demo-page.service.ts src/routes/demo.routes.ts src/templates/demo/ tests/routes/demo.routes.test.ts
git commit -m "feat: demo page — personalized WhatsApp simulation with token auth + expiry"
```

---

### Task 14: Unsubscribe Route

**Files:**
- Create: `src/routes/unsubscribe.routes.ts`, `src/templates/unsubscribe/unsubscribe.html`, `tests/routes/unsubscribe.routes.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('unsubscribe', () => {
  it('GET /unsubscribe/:token renders confirmation page', async () => {});
  it('POST /unsubscribe/:token marks lead as unsubscribed', async () => {});
  it('POST /unsubscribe/:token pauses all pending outreach', async () => {});
  it('returns 404 for invalid token', async () => {});
  it('already unsubscribed lead sees confirmation', async () => {});
});
```

- [ ] **Step 2: Implement unsubscribe.routes.ts**

- GET: Look up lead by `unsubscribeToken`, render confirmation page with business name
- POST: Set lead status to `unsubscribed`, cancel all pending outreach emails via `outreachRepo.pauseDripForLead()`
- Both return 404 for invalid tokens

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add src/routes/unsubscribe.routes.ts src/templates/unsubscribe/ tests/routes/unsubscribe.routes.test.ts
git commit -m "feat: unsubscribe flow — GET confirmation + POST immediate processing (GDPR/CAN-SPAM)"
```

---

### Task 15: Outreach Worker (Drip Engine)

**Files:**
- Create: `src/workers/outreach.worker.ts`, `tests/workers/outreach.worker.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('outreach.worker', () => {
  it('sends Email 1 immediately for newly qualified leads', async () => {});
  it('schedules Email 2 for day 3 if no click on Email 1', async () => {});
  it('schedules Email 3 for day 7 if no click on Email 2', async () => {});
  it('skips sending if lead clicked demo (stop condition)', async () => {});
  it('skips sending if lead replied (stop condition)', async () => {});
  it('skips sending if lead unsubscribed (stop condition)', async () => {});
  it('sets demo_expires_at to 60 days after last email', async () => {});
  it('respects daily sending cap', async () => {});
  it('handles Resend 4xx — marks email failed, continues drip', async () => {});
});
```

- [ ] **Step 2: Implement outreach.worker.ts**

Two job types:
1. `send-drip`: For a specific lead, check stop conditions, send next email in sequence
2. `process-scheduled`: Repeatable job (every 5 min via BullMQ `repeat`) that finds `scheduled` emails where `scheduledFor <= now()` and sends them

Key logic:
- Check stop conditions: `lead.status === 'unsubscribed' || lead.hasReplied || clickedAnyEmail`
- Build merge fields from lead + qualification + enrichment
- Use `campaign.senderAddress ?? env.PHYSICAL_ADDRESS` for email footer
- Call `sendEmail()` with correct template for sequence number
- On success: update email status to `sending`, record `resendMessageId`
- Schedule next email in sequence via BullMQ delayed job
- After last email: set `lead.demoExpiresAt` to 60 days from now

**Daily cap + warm-up logic:**

```typescript
// Redis key: `huntly:sends:${YYYY-MM-DD}` — incremented per send, TTL 48h
const WARMUP_START_DATE = new Date('2026-04-01'); // set when domain goes live
const WARMUP_DAYS = 14;
const BASE_CAP = 20; // starting daily sends
const RAMP_FACTOR = 1.2; // 20% daily increase
const MAX_CAP = 50; // configurable steady-state cap

function getDailyCap(): number {
  const daysSinceStart = Math.floor((Date.now() - WARMUP_START_DATE.getTime()) / 86400000);
  if (daysSinceStart < 0) return 0; // not started yet
  if (daysSinceStart >= WARMUP_DAYS) return MAX_CAP;
  return Math.min(Math.floor(BASE_CAP * Math.pow(RAMP_FACTOR, daysSinceStart)), MAX_CAP);
}

async function canSendToday(): Promise<boolean> {
  const key = `huntly:sends:${new Date().toISOString().slice(0, 10)}`;
  const count = await redis.get(key);
  return (parseInt(count ?? '0', 10)) < getDailyCap();
}

async function incrementSendCount(): Promise<void> {
  const key = `huntly:sends:${new Date().toISOString().slice(0, 10)}`;
  await redis.incr(key);
  await redis.expire(key, 172800); // 48h TTL
}
```

Before each send: call `canSendToday()`. If false, re-schedule the job for next day 9am.
After each send: call `incrementSendCount()`.

Concurrency: 1 (sequential sends to respect cap)

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add src/workers/outreach.worker.ts tests/workers/outreach.worker.test.ts
git commit -m "feat: outreach worker — 3-email drip engine with stop conditions + daily cap"
```

---

### Task 16: Resend Webhook Handler

**Files:**
- Create: `src/routes/webhook.routes.ts`, `tests/routes/webhook.routes.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('webhook.routes', () => {
  it('email.delivered updates status + delivered_at', async () => {});
  it('email.opened updates status + opened_at', async () => {});
  it('email.clicked updates status + clicked_at + pauses drip', async () => {});
  it('email.bounced updates status + marks lead invalid', async () => {});
  it('email.complained marks lead unsubscribed', async () => {});
  it('rejects requests with invalid Resend webhook signature', async () => {});
  it('ignores unknown event types', async () => {});
  it('returns 200 even on processing errors (prevent Resend retry flood)', async () => {});

  // Reply detection
  it('POST /webhooks/reply marks lead as replied + pauses drip', async () => {});
  it('POST /webhooks/reply triggers notification', async () => {});
});
```

- [ ] **Step 2: Implement webhook.routes.ts**

Two webhook endpoints:

**POST /webhooks/resend** — Resend event webhooks (delivered, opened, clicked, bounced, complained):
```typescript
// Verify Resend webhook signature using svix (Resend uses svix for signing)
// npm i svix
// const wh = new Webhook(env.RESEND_WEBHOOK_SECRET);
// wh.verify(payload, headers); // throws on invalid sig
//
// Look up outreach_email by resendMessageId
// Update status based on event type
// For clicks: also pause drip for the lead
// For bounces: mark lead email as invalid
// For complaints: unsubscribe the lead
```

**POST /webhooks/reply** — Resend inbound email routing (reply detection):
```typescript
// Resend inbound routing forwards replies to this endpoint
// Configure in Resend dashboard: replies to outreach.sigmaintel.io → webhook
//
// Extract sender email from inbound payload
// Look up lead by email address
// If found: leadRepo.markReplied(lead.id) + outreachRepo.pauseDripForLead(lead.id)
// Send notification (console.log for MVP, Slack/WhatsApp later)
// Log: "[reply] Lead {businessName} replied: {subject}"
```

Add `RESEND_WEBHOOK_SECRET` to `.env.example` and `config.ts`.

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add src/routes/webhook.routes.ts tests/routes/webhook.routes.test.ts
git commit -m "feat: Resend webhook handler — email status tracking + drip pause on click/bounce"
```

---

## Phase 6: API + Wiring

### Task 17: Auth Middleware + Admin Routes

**Files:**
- Create: `src/middleware/api-key-auth.ts`, `src/routes/campaign.routes.ts`, `src/routes/lead.routes.ts`, `src/routes/outreach.routes.ts`

- [ ] **Step 1: Implement API key auth middleware**

```typescript
// src/middleware/api-key-auth.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config.js';

export async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'];
  if (apiKey !== env.ADMIN_API_KEY) {
    return reply.status(401).send({ error: 'Invalid API key' });
  }
}
```

- [ ] **Step 2: Implement campaign.routes.ts**

Endpoints:
- `POST /api/campaigns` — create campaign
- `GET /api/campaigns` — list all campaigns with lead counts
- `GET /api/campaigns/:id` — campaign detail with funnel stats
- `PATCH /api/campaigns/:id` — update status (activate, pause)
- `POST /api/campaigns/:id/launch` — activate campaign + enqueue source jobs

- [ ] **Step 3: Implement lead.routes.ts**

Endpoints:
- `GET /api/campaigns/:id/leads` — list leads with filters (status, score range)
- `GET /api/leads/:id` — lead detail with enrichment + qualification + emails
- `POST /api/leads/:id/approve` — manually approve score 40-69 lead for outreach
- `POST /api/leads/:id/skip` — manually skip a lead
- `POST /api/leads/:id/convert` — manually mark lead as converted (MVP)
- `GET /api/funnel` — aggregate funnel stats across all campaigns

- [ ] **Step 4: Implement outreach.routes.ts**

Endpoints:
- `GET /api/campaigns/:id/emails` — list outreach emails with status
- `POST /api/leads/:id/pause-drip` — manually pause drip for a lead
- `GET /api/stats` — sending stats (sent today, opens, clicks, bounces)

- [ ] **Step 5: Write route tests**

Test auth rejection (no key, wrong key) + happy paths for key endpoints.

- [ ] **Step 6: Commit**

```bash
git add src/middleware/ src/routes/campaign.routes.ts src/routes/lead.routes.ts src/routes/outreach.routes.ts tests/routes/
git commit -m "feat: admin API — campaign CRUD, lead management, funnel stats (API key auth)"
```

---

### Task 18: Fastify Server Entry + Worker Bootstrap

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement src/index.ts**

```typescript
// src/index.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config.js';

// Import routes
import { campaignRoutes } from './routes/campaign.routes.js';
import { leadRoutes } from './routes/lead.routes.js';
import { outreachRoutes } from './routes/outreach.routes.js';
import { demoRoutes } from './routes/demo.routes.js';
import { unsubscribeRoutes } from './routes/unsubscribe.routes.js';
import { webhookRoutes } from './routes/webhook.routes.js';

// Import workers (side-effect: starts listening)
import './workers/source.worker.js';
import './workers/enrich.worker.js';
import './workers/qualify.worker.js';
import './workers/outreach.worker.js';

const app = Fastify({ logger: true });

await app.register(cors);

// Public routes (no auth)
await app.register(demoRoutes, { prefix: '/demo' });
await app.register(unsubscribeRoutes, { prefix: '/unsubscribe' });
await app.register(webhookRoutes, { prefix: '/webhooks' });

// Admin routes (API key auth)
await app.register(campaignRoutes, { prefix: '/api' });
await app.register(leadRoutes, { prefix: '/api' });
await app.register(outreachRoutes, { prefix: '/api' });

// Graceful shutdown
import { sourceWorker } from './workers/source.worker.js';
import { enrichWorker } from './workers/enrich.worker.js';
import { qualifyWorker } from './workers/qualify.worker.js';
import { outreachWorker } from './workers/outreach.worker.js';

const shutdown = async () => {
  console.log('[shutdown] Closing workers...');
  await Promise.all([
    sourceWorker.close(),
    enrichWorker.close(),
    qualifyWorker.close(),
    outreachWorker.close(),
  ]);
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: env.PORT, host: '0.0.0.0' });
console.log(`Huntly running on port ${env.PORT}`);
```

- [ ] **Step 2: Verify dev server starts**

```bash
npm run dev
```

Expected: Server starts, workers connect to Redis, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: Fastify server entry + worker bootstrap"
```

---

### Task 19: Seed Script

**Files:**
- Create: `scripts/seed-campaign.ts`

- [ ] **Step 1: Implement seed script**

CLI that creates:
1. An email template set for a given vertical
2. A campaign with specified regions
3. Prints the campaign ID for launching

```bash
# Usage:
npx tsx scripts/seed-campaign.ts --vertical dental_clinic --regions "London,UK" "Dubai,AE" --name "Dental Q1 2026"
```

- [ ] **Step 2: Test manually**

```bash
npm run seed -- --vertical dental_clinic --regions "London,UK" --name "Test Campaign"
```

Expected: Campaign created, ID printed.

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-campaign.ts
git commit -m "feat: seed script — CLI to create campaigns with template sets"
```

---

### Task 20: Docker + Deployment Config

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:22-slim

# Playwright dependencies
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 \
    libpango-1.0-0 libcairo2 libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Install Playwright Chromium
RUN npx playwright install chromium

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Create docker-compose.yml** (dev + prod)

```yaml
services:
  huntly:
    build: .
    ports:
      - "3001:3001"
    env_file: .env
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: huntly_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - huntly_pgdata:/var/lib/postgresql/data
    ports:
      - "5433:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6380:6379"

volumes:
  huntly_pgdata:
```

Note: In production on the SigmaAI VPS, Huntly will use the existing PostgreSQL and Redis. The docker-compose above is for local development. Production deploy will use a simpler compose file pointing to shared infra.

- [ ] **Step 3: Verify Docker build**

```bash
docker compose build
docker compose up -d
```

Expected: All services start, Huntly connects to DB and Redis.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: Docker setup — Dockerfile with Playwright deps + docker-compose for dev"
```

---

## Phase 7: End-to-End Verification

### Task 21: Integration Test — Full Pipeline

**Files:**
- Create: `tests/integration/pipeline.test.ts`

- [ ] **Step 1: Write end-to-end test**

Test the full flow with mocked external services (Outscraper, Groq, Resend):
1. Create campaign via API
2. Launch campaign → source worker runs (mocked Outscraper)
3. Verify leads created with status `sourced`
4. Enrich worker runs (mocked crawler + review analyzer)
5. Verify enrichment saved, leads move to `enriched`
6. Qualify worker runs (mocked AI)
7. Verify qualification saved, high-score leads move to `qualified`
8. Outreach worker runs (mocked Resend)
9. Verify emails sent, drip scheduled
10. Simulate webhook → verify status updates
11. Simulate unsubscribe → verify drip paused

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/
git commit -m "test: end-to-end pipeline integration test"
```

---

### Task 22: Manual Smoke Test

- [ ] **Step 1: Create test campaign**

```bash
npm run seed -- --vertical dental_clinic --regions "London,UK" --name "Smoke Test"
```

- [ ] **Step 2: Launch campaign via API**

```bash
curl -X POST http://localhost:3001/api/campaigns/{id}/launch \
  -H "x-api-key: $ADMIN_API_KEY"
```

- [ ] **Step 3: Monitor pipeline**

Watch logs for: source → enrich → qualify → outreach progression.
Check DB: `SELECT status, count(*) FROM leads GROUP BY status;`

- [ ] **Step 4: Verify demo page**

Visit `http://localhost:3001/demo/{token}` for a qualified lead.
Verify: business name, simulated conversation, CTA link.

- [ ] **Step 5: Verify unsubscribe**

Visit `http://localhost:3001/unsubscribe/{token}` for a contacted lead.
POST unsubscribe, verify drip paused.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: smoke test verified — full pipeline operational"
```

---

## Execution Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1. Foundation | 1-4 | Scaffold, config, Prisma schema, repos |
| 2. Source | 5-6 | Outscraper service + source worker |
| 3. Enrich | 7-9 | Crawler + review analyzer + enrich worker |
| 4. Qualify | 10-11 | Qualifier service + qualify worker |
| 5. Outreach | 12-16 | Email service, demo page, unsubscribe, drip worker, webhooks |
| 6. API + Wiring | 17-20 | Auth, routes, server entry, seed script, Docker |
| 7. Verification | 21-22 | Integration test + smoke test |

**Total: 22 tasks, ~7 phases**

Tasks within each phase can be executed sequentially. Phases 2-4 (Source → Enrich → Qualify) are sequential dependencies. Within Phase 5, tasks 12-14 (email service, demo page, unsubscribe) can be parallelized, then task 15 (outreach worker) depends on all three.
