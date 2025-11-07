import OpenAI from 'openai';

type OpenAIClient = OpenAI;

let client: OpenAIClient | null = null;

export function getOpenAIClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}
