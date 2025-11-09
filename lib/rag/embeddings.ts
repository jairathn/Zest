import OpenAI from 'openai';
import { prisma } from '@/lib/db';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate embedding for a text string using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000), // Limit to 8000 chars to stay within token limits
    });

    return response.data[0].embedding;
  } catch (error: any) {
    console.error('Error generating embedding:', error);
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Chunk text into smaller pieces for better retrieval
 */
export function chunkText(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * Process and embed a knowledge document
 */
export async function embedKnowledgeDocument(
  title: string,
  content: string,
  category: string,
  sourceFile?: string,
  sourceUrl?: string
): Promise<string[]> {
  const chunks = chunkText(content);
  const documentIds: string[] = [];

  for (const chunk of chunks) {
    const embedding = await generateEmbedding(chunk);

    // Store with raw SQL to handle vector type
    const result = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "KnowledgeDocument" (
        id,
        title,
        content,
        embedding,
        category,
        "sourceFile",
        "sourceUrl",
        metadata,
        "createdAt",
        "updatedAt"
      )
      VALUES (
        gen_random_uuid()::text,
        ${title},
        ${chunk},
        ${embedding}::vector,
        ${category},
        ${sourceFile || null},
        ${sourceUrl || null},
        '{}'::jsonb,
        NOW(),
        NOW()
      )
      RETURNING id
    `;

    if (result && result.length > 0) {
      documentIds.push(result[0].id);
    }
  }

  return documentIds;
}

/**
 * Search knowledge base using vector similarity
 */
export async function searchKnowledge(
  query: string,
  limit: number = 5,
  category?: string
): Promise<Array<{
  id: string;
  title: string;
  content: string;
  category: string;
  similarity: number;
}>> {
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // Use pgvector cosine distance for similarity search
  const categoryFilter = category ? `AND category = '${category}'` : '';

  const results = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      id,
      title,
      content,
      category,
      "sourceFile",
      "sourceUrl",
      1 - (embedding <=> '${embeddingStr}'::vector) as similarity
    FROM "KnowledgeDocument"
    WHERE embedding IS NOT NULL
    ${categoryFilter}
    ORDER BY embedding <=> '${embeddingStr}'::vector
    LIMIT ${limit}
  `);

  return results.map(r => ({
    id: r.id,
    title: r.title,
    content: r.content,
    category: r.category,
    similarity: Number(r.similarity),
  }));
}
