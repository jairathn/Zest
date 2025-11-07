import { Pinecone, type ScoredPineconeRecord } from '@pinecone-database/pinecone';
import { getOpenAIClient } from '@/lib/llm/openai-client';

let pinecone: Pinecone | null = null;

function getPineconeClient() {
  if (!pinecone) {
    const apiKey = process.env.PINECONE_API_KEY;
    const environment = process.env.PINECONE_ENVIRONMENT;
    if (!apiKey || !environment) {
      throw new Error('Pinecone credentials are not configured');
    }
    pinecone = new Pinecone({ apiKey });
  }
  return pinecone;
}

export async function getKnowledgeIndex() {
  const indexName = process.env.PINECONE_INDEX_NAME;
  if (!indexName) {
    throw new Error('PINECONE_INDEX_NAME is not set');
  }
  const client = getPineconeClient();
  return client.index(indexName);
}

export async function generateEmbedding(text: string) {
  const openai = getOpenAIClient();
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  });
  return response.data[0]?.embedding ?? [];
}

export type RetrievedDocument = {
  id: string;
  score: number;
  content: string;
  metadata?: Record<string, unknown>;
};

export async function upsertKnowledgeChunk(id: string, content: string, metadata: Record<string, unknown> = {}) {
  const index = await getKnowledgeIndex();
  const values = await generateEmbedding(content);
  await index.upsert([
    {
      id,
      values,
      metadata: {
        content,
        ...metadata
      }
    }
  ]);
}

export async function queryKnowledgeBase(query: string, topK = 5): Promise<RetrievedDocument[]> {
  const index = await getKnowledgeIndex();
  const values = await generateEmbedding(query);
  const results = await index.query({
    vector: values,
    topK,
    includeMetadata: true
  });

  return (results.matches ?? []).map((match: ScoredPineconeRecord<Record<string, any>>) => ({
    id: match.id,
    score: match.score ?? 0,
    content: (match.metadata?.content as string) ?? '',
    metadata: match.metadata ?? {}
  }));
}
