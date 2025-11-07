# Zest Health - Biologics Decision Support Tool

A Next.js 14 prototype for dermatology biologic optimization with formulary guidance, RAG-enabled LLM decision support, and analytics.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

```bash
cp .env.example .env
# Update values for your environment
```

3. Set up the database schema and seed mock data:

```bash
npx prisma db push
npx prisma db seed
```

4. Ingest knowledge base embeddings (requires OpenAI + Pinecone credentials):

```bash
npm run ingest-knowledge
```

5. Run the development server:

```bash
npm run dev
```

6. Open the app at [http://localhost:3000](http://localhost:3000).

## Test Accounts

- Provider: `provider@zest.com` / `password123`
- Admin: `admin@zest.com` / `password123`

> Password hashes in the seed script are placeholders. Replace with secure hashes before production use.

## Test Patients

Five mock patients spanning stability and formulary quadrants are seeded. Review `prisma/seed.ts` for clinical narratives and claims data.

## Tech Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + shadcn-inspired UI components
- Prisma ORM + PostgreSQL
- OpenAI GPT-4 for recommendations
- Pinecone for retrieval-augmented generation
- React Query for data fetching
- Recharts for analytics visualizations

## Scripts

- `npm run dev` – start the development server
- `npm run build` – production build
- `npm run start` – run the compiled app
- `npm run ingest-knowledge` – embed knowledge base markdown into Pinecone

## Deployment

Use the included `docker-compose.yml` for local PostgreSQL and `scripts/deploy-vercel.sh` for Vercel deployment scaffolding (to be customized with project details).
