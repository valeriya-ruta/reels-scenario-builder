import { test, expect } from '@playwright/test';
import { pickVendor } from '@/lib/ai/aiVendor';

/**
 * Pro ran for weeks with every AI feature dead because it had no GROQ_API_KEY —
 * transcripts said «Транскрипт потребує уваги», the rest failed quietly. These
 * are the rules that decide where a request goes now that either key works.
 */
test.describe('which AI service a deployment uses', () => {
  test('OpenRouter wins when both keys are present — adding it IS the decision', () => {
    expect(pickVendor({ OPENROUTER_API_KEY: 'or', GROQ_API_KEY: 'gq' })).toBe('openrouter');
  });

  test('either key alone is enough', () => {
    expect(pickVendor({ GROQ_API_KEY: 'gq' })).toBe('groq');
    expect(pickVendor({ OPENROUTER_API_KEY: 'or' })).toBe('openrouter');
  });

  test('no key resolves to nothing, so the caller can say so plainly', () => {
    expect(pickVendor({})).toBeNull();
    expect(pickVendor({ GROQ_API_KEY: '   ' })).toBeNull();
  });

  test('AI_PROVIDER pins a vendor even when the other key exists', () => {
    expect(pickVendor({ AI_PROVIDER: 'groq', OPENROUTER_API_KEY: 'or', GROQ_API_KEY: 'gq' })).toBe(
      'groq',
    );
    expect(pickVendor({ AI_PROVIDER: 'OpenRouter', OPENROUTER_API_KEY: 'or' })).toBe('openrouter');
  });

  test('pinning a vendor with no key fails rather than silently using the other', () => {
    // Falling through would send traffic to a service the operator did not pick.
    expect(pickVendor({ AI_PROVIDER: 'openrouter', GROQ_API_KEY: 'gq' })).toBeNull();
  });

  test('an unknown AI_PROVIDER is ignored, not obeyed', () => {
    expect(pickVendor({ AI_PROVIDER: 'anthropic', GROQ_API_KEY: 'gq' })).toBe('groq');
  });
});
