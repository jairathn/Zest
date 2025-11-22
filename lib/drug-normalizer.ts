import Anthropic from '@anthropic-ai/sdk';

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

let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (!anthropic && process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
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

  // Try LLM fallback if Anthropic is available
  const client = getAnthropicClient();
  if (client) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 50,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `Convert this drug name to its generic name. If it's already a generic name, return it as-is. Return ONLY the generic name in lowercase, nothing else: ${drugName}`
        }],
      });

      const content = response.content[0];
      const genericName = (content.type === 'text' ? content.text : '').toLowerCase().trim() || normalized;
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
