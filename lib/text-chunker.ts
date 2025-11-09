/**
 * Text chunking utilities for RAG
 */

export interface TextChunk {
  content: string;
  index: number;
}

/**
 * Splits text into chunks based on paragraphs with overlap
 * @param text - The full text to chunk
 * @param targetChunkSize - Target size for each chunk in characters (default 700)
 * @param overlapSize - Number of characters to overlap between chunks (default 100)
 * @returns Array of text chunks
 */
export function chunkTextByParagraph(
  text: string,
  targetChunkSize: number = 700,
  overlapSize: number = 100
): TextChunk[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Split by paragraphs (double newline or single newline for PDFs)
  const paragraphs = text
    .split(/\n\n+|\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const chunks: TextChunk[] = [];
  let currentChunk = '';
  let chunkIndex = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];

    // If adding this paragraph would exceed target size
    if (currentChunk.length + paragraph.length > targetChunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex++,
      });

      // Start new chunk with overlap from the end of current chunk
      const overlapText = currentChunk.slice(-overlapSize);
      currentChunk = overlapText + '\n\n' + paragraph;
    } else {
      // Add paragraph to current chunk
      currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + paragraph;
    }
  }

  // Add the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
    });
  }

  return chunks;
}

/**
 * Splits text into fixed-size chunks with overlap
 * Useful for texts without clear paragraph structure
 */
export function chunkTextBySize(
  text: string,
  chunkSize: number = 700,
  overlapSize: number = 100
): TextChunk[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks: TextChunk[] = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length);
    const chunk = text.slice(startIndex, endIndex);

    chunks.push({
      content: chunk.trim(),
      index: chunkIndex++,
    });

    // Move start index forward, accounting for overlap
    startIndex += chunkSize - overlapSize;

    // Prevent infinite loop if overlap is too large
    if (chunkSize <= overlapSize) {
      break;
    }
  }

  return chunks;
}
