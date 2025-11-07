import { queryKnowledgeBase } from './knowledge-base';

export async function retrieveRelevantContext(query: string, topK: number = 5) {
  const matches = await queryKnowledgeBase(query, topK);
  return matches.map((match) => ({
    id: match.id,
    score: match.score,
    content: match.content,
    metadata: match.metadata ?? {}
  }));
}
