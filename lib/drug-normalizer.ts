import OpenAI from 'openai';

// Static mapping of brand names to generic names for common dermatology biologics
const BRAND_TO_GENERIC: Record<string, string> = {
  'dupixent': 'dupilumab',
  'humira': 'adalimumab',
  'stelara': 'ustekinumab',
  'skyrizi': 'risankizumab',
  'tremfya': 'guselkumab',
  'cosentyx': 'secukinumab',
  'taltz': 'ixekizumab',
  'otezla': 'apremilast',
  'rinvoq': 'upadacitinib',
  'cibinqo': 'abrocitinib',
  'adbry': 'tralokinumab',
  'ilumya': 'tildrakizumab',
  'siliq': 'brodalumab',
  'remicade': 'infliximab',
  'enbrel': 'etanercept',
  'simponi': 'golimumab',
  'cimzia': 'certolizumab',
  'actemra': 'tocilizumab',
  'orencia': 'abatacept',
};

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

/**
 * Normalizes a drug name to its generic form
 * Uses static mapping first, falls back to LLM if not found
 */
export async function normalizeToGeneric(drugName: string): Promise<string> {
  if (!drugName) return drugName;

  const normalized = drugName.toLowerCase().trim();

  // Check static table first
  if (BRAND_TO_GENERIC[normalized]) {
    return BRAND_TO_GENERIC[normalized];
  }

  // If already looks like a generic name (ends in -mab, -kin, etc), return as-is
  if (normalized.match(/mab$|kin$|nib$|lib$|tinib$/)) {
    return normalized;
  }

  // Try LLM fallback if OpenAI is available
  const client = getOpenAIClient();
  if (client) {
    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Convert this drug name to its generic name. If it's already a generic name, return it as-is. Return ONLY the generic name in lowercase, nothing else: ${drugName}`
        }],
        max_tokens: 20,
        temperature: 0,
      });

      const genericName = response.choices[0].message.content?.toLowerCase().trim() || normalized;
      return genericName;
    } catch (error) {
      console.error('Error normalizing drug name with LLM:', error);
      // Fall through to return normalized input
    }
  }

  // If LLM not available or failed, return normalized input
  return normalized;
}

/**
 * Normalizes a drug name synchronously using only the static table
 * Useful for cases where you don't want to wait for LLM
 */
export function normalizeToGenericSync(drugName: string): string {
  if (!drugName) return drugName;

  const normalized = drugName.toLowerCase().trim();
  return BRAND_TO_GENERIC[normalized] || normalized;
}
