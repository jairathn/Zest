# Setup Guide

## Prerequisites

- Node.js 18+ installed
- Docker and Docker Compose (for PostgreSQL)
- OpenAI API key (for embeddings and optional LLM)

## Step-by-Step Setup

### 1. Start PostgreSQL with pgvector

```bash
docker-compose up -d
```

This will start PostgreSQL 16 with the pgvector extension on port 5432.

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and set:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/zest_biologic_dss?schema=public"
OPENAI_API_KEY="sk-..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 4. Initialize Database

```bash
# Push Prisma schema to database
npm run db:push

# Seed with sample data
npm run db:seed
```

### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Sample Data

The seed script creates:

- **1 Insurance Plan**: BlueCross PPO 2025
- **8 Formulary Drugs**: Mix of Tier 1 biosimilars, Tier 2 preferred, and Tier 3 non-preferred
- **3 Sample Patients**:
  - John Doe (P001): On Humira (Tier 3) - candidate for biosimilar switch
  - Jane Smith (P002): On Cosentyx (Tier 2) - stable, candidate for dose reduction
  - Bob Johnson (P003): On Tremfya (Tier 3), has heart failure contraindication
- **3 Knowledge Documents**: Biosimilar guidance, dose reduction evidence, formulary strategy

## Uploading Your Own Data

### 1. Navigate to Admin Panel

Go to [http://localhost:3000/admin](http://localhost:3000/admin)

### 2. Upload Formulary Data (CSV)

Expected columns:
```
Drug Name, Generic Name, Drug Class, Tier, Annual Cost, Copay T1, Copay T2, Copay T3, PA Required
```

Example:
```csv
Drug Name,Generic Name,Drug Class,Tier,Annual Cost,Copay T1,Copay T2,Copay T3,PA Required
Humira,adalimumab,TNF,3,84000,850,850,850,Yes
Amjevita,adalimumab-atto,TNF,1,28500,25,25,25,No
```

### 3. Upload Patient Eligibility (CSV)

Expected columns:
```
Patient ID, First Name, Last Name, Date of Birth
```

Example:
```csv
Patient ID,First Name,Last Name,Date of Birth
P001,John,Doe,1978-03-15
P002,Jane,Smith,1985-07-22
```

### 4. Upload Pharmacy Claims (CSV)

Expected columns:
```
Patient ID, Drug Name, Fill Date, Days Supply, Quantity, Out of Pocket, Plan Paid
```

Example:
```csv
Patient ID,Drug Name,Fill Date,Days Supply,Quantity,Out of Pocket,Plan Paid
P001,Humira,2024-01-15,90,6,850,20000
```

### 5. Upload Knowledge Base Documents

Upload PDF or Markdown files with clinical guidelines, biosimilar evidence, or dose reduction studies. These will be automatically:
- Chunked into smaller pieces
- Embedded using OpenAI
- Stored in PostgreSQL with pgvector for semantic search

## Using the Application

### Create an Assessment

1. Go to "New Assessment" or select a patient from the patient list
2. Fill out the simplified form:
   - Select patient (auto-fills claims & plan data)
   - Enter current biologic, dose, frequency
   - Select indication (psoriasis or eczema)
   - Check contraindications
   - Set DLQI score (disease severity)
   - Enter months stable
3. Click "Generate Recommendations"

### Review Recommendations

The system will:
- Automatically classify patient into stability/formulary quadrant
- Pull relevant evidence from knowledge base
- Generate 1-3 cost-saving recommendations
- Show detailed cost analysis and savings
- Provide clinical rationale with evidence citations
- Flag contraindications

### Accept/Reject Recommendations

- Review each recommendation
- Accept the recommended option
- System tracks decisions for analytics

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker ps

# View logs
docker logs zest_postgres

# Restart container
docker-compose restart
```

### Prisma Issues

```bash
# Regenerate Prisma client
npx prisma generate

# Reset database (WARNING: deletes all data)
npx prisma db push --force-reset
npm run db:seed
```

### OpenAI API Errors

If you don't have an OpenAI API key:
- Knowledge base uploads won't generate embeddings (OK for testing)
- Recommendations will use rule-based logic instead of LLM (fully functional)

## Next Steps

1. **Customize Formulary**: Upload your plan's actual formulary
2. **Import Patients**: Upload real patient eligibility data
3. **Add Claims**: Upload historical pharmacy claims
4. **Expand Knowledge Base**: Add clinical guidelines, trial data, formulary policies
5. **Configure Decision Logic**: Adjust stability thresholds in `lib/decision-engine.ts`

## Production Considerations

Before deploying to production:

1. **Security**:
   - Enable proper authentication (NextAuth, Auth0, etc.)
   - Implement RBAC for admin vs provider access
   - Add audit logging for all PHI access
   - Enable SSL/TLS

2. **Compliance**:
   - Ensure HIPAA compliance
   - Get BAAs from all vendors (OpenAI, cloud provider)
   - Implement data retention policies
   - Add consent management

3. **Performance**:
   - Add caching (Redis)
   - Optimize database queries
   - Implement rate limiting
   - Set up monitoring (Sentry, DataDog)

4. **Deployment**:
   - Deploy to Vercel, AWS, or Azure
   - Use managed PostgreSQL (AWS RDS, Supabase, Neon)
   - Set up CI/CD
   - Configure backups
