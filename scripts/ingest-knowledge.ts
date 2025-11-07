import fs from 'fs';
import path from 'path';
import { upsertKnowledgeChunk } from '../lib/rag/knowledge-base';

const KNOWLEDGE_DIR = path.join(process.cwd(), 'data/knowledge');

function chunkText(text: string, chunkSize = 1000, overlap = 200) {
  const tokens = text.split(/\s+/);
  const chunks: string[] = [];

  for (let i = 0; i < tokens.length; i += chunkSize - overlap) {
    const chunk = tokens.slice(i, i + chunkSize).join(' ').trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

async function ingest() {
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter((file) => file.endsWith('.md'));
  for (const file of files) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const chunks = chunkText(content);

    let index = 0;
    for (const chunk of chunks) {
      const chunkId = `${file}-${index}`;
      await upsertKnowledgeChunk(chunkId, chunk, {
        source: file,
        order: index
      });
      index += 1;
      console.log(`Ingested chunk ${chunkId}`);
    }
  }
  console.log('Knowledge ingestion complete');
}

ingest().catch((error) => {
  console.error('Failed to ingest knowledge base', error);
  process.exit(1);
});
