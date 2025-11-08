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

## Codespace Setup (First-Time Setup)

When opening a new codespace, run these commands in order:

### 1. Switch to Node.js 20
```bash
nvm use 20
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start and Configure PostgreSQL
```bash
# Disable SSL for dev environment
sed -i "s/ssl = on/ssl = off/" /etc/postgresql/16/main/postgresql.conf

# Configure authentication
sed -i 's/peer/trust/g' /etc/postgresql/16/main/pg_hba.conf

# Start PostgreSQL
service postgresql start

# Wait for startup
sleep 2

# Create database
su - postgres -c "createdb zest_biologic_dss"

# Set postgres user password
su - postgres -c "psql -c \"ALTER USER postgres PASSWORD 'password';\""

# Enable password authentication
sed -i 's/trust/md5/g' /etc/postgresql/16/main/pg_hba.conf

# Restart PostgreSQL
service postgresql restart
```

### 4. Set Up Database Schema
```bash
# Push Prisma schema to database
npx prisma db push
```

### 5. Start Development Server
```bash
npm run dev
```

**All-in-One Command** (Copy-paste this entire block):
```bash
nvm use 20 && \
npm install && \
sed -i "s/ssl = on/ssl = off/" /etc/postgresql/16/main/postgresql.conf && \
sed -i 's/peer/trust/g' /etc/postgresql/16/main/pg_hba.conf && \
service postgresql start && \
sleep 2 && \
su - postgres -c "createdb zest_biologic_dss" && \
su - postgres -c "psql -c \"ALTER USER postgres PASSWORD 'password';\"" && \
sed -i 's/trust/md5/g' /etc/postgresql/16/main/pg_hba.conf && \
service postgresql restart && \
sleep 2 && \
npx prisma db push && \
npm run dev
```

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
