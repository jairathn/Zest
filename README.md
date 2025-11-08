# Zest Biologic Decision Support System

A simplified MVP for dermatology biologic optimization with cost-saving recommendations.

## Features

- 📊 **CSV Upload System** - Upload formulary data, claims data, and patient eligibility
- 📚 **Local Knowledge Base** - PDF/Markdown upload with pgvector embeddings (no Pinecone!)
- 🎯 **Simplified Assessment** - Quick patient assessment with auto-population
- 💰 **Cost Savings** - 1-3 evidence-based recommendations for dose reduction or formulary switches
- 🔍 **Local RAG** - PostgreSQL + pgvector for document retrieval

## Quick Start

1. **Install dependencies:**
```bash
npm install
```

2. **Set up database:**
```bash
# Create .env file
cp .env.example .env
# Edit .env with your PostgreSQL connection string

# Push schema to database
npm run db:push

# Seed with sample data
npm run db:seed
```

3. **Run development server:**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

- **Framework:** Next.js 14 (App Router)
- **Database:** PostgreSQL + pgvector extension
- **ORM:** Prisma
- **Styling:** Tailwind CSS
- **LLM:** OpenAI (optional - falls back to rule-based)

## Data Upload

Upload CSVs via the admin dashboard:
- **Formulary:** Drug name, tier, costs, PA requirements
- **Claims:** Patient ID, drug, fill dates, costs
- **Eligibility:** Patient demographics and plan info
- **Knowledge Base:** PDFs or Markdown for clinical evidence

## Simplified Workflow

1. Select patient
2. Fill simple assessment form (biologic, indication, DLQI, stability)
3. System auto-populates claims, plan, formulary
4. Generates 1-3 cost-saving recommendations with evidence
5. Accept or reject recommendations

## Tech Stack

- Next.js 14 + TypeScript
- Tailwind CSS
- Prisma ORM + PostgreSQL
- pgvector for embeddings
- OpenAI API (embeddings + optional LLM)
- Papa Parse (CSV parsing)
- pdf-parse (PDF extraction)

## License

Proprietary
