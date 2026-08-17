/**
 * Which AI service a deployment is configured for — the decision alone, with no
 * network and no server-only imports, so it can be tested directly.
 *
 * Both vendors speak the OpenAI HTTP shape, so this is the only thing that has
 * to be decided: everything downstream is a base URL and a model id.
 */

export type AiVendor = 'groq' | 'openrouter';

export type AiEnv = {
  AI_PROVIDER?: string | null;
  OPENROUTER_API_KEY?: string | null;
  GROQ_API_KEY?: string | null;
};

const KEY_FOR: Record<AiVendor, keyof AiEnv> = {
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

function has(env: AiEnv, vendor: AiVendor): boolean {
  return !!env[KEY_FOR[vendor]]?.trim();
}

/**
 * OpenRouter wins when both keys are present — having added it is the decision.
 * `AI_PROVIDER` pins one either way, and pinning a vendor whose key is missing
 * resolves to null rather than quietly falling through to the other one: that
 * would send traffic somewhere the operator explicitly did not choose.
 */
export function pickVendor(env: AiEnv): AiVendor | null {
  const pinned = env.AI_PROVIDER?.trim().toLowerCase();
  if (pinned === 'groq' || pinned === 'openrouter') {
    return has(env, pinned) ? pinned : null;
  }
  if (has(env, 'openrouter')) return 'openrouter';
  if (has(env, 'groq')) return 'groq';
  return null;
}
