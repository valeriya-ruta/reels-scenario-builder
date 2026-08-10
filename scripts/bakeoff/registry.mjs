/**
 * The four generation types under test, each wired to the PRODUCTION prompt.
 *
 * The prompt builders are imported from `lib/` rather than pasted, so the
 * bake-off can never drift from what actually ships. If someone edits a prompt,
 * the next bake-off run automatically tests the edited prompt.
 *
 * Sampling params (temperature / max_tokens) are mirrored here from the call
 * sites and cross-referenced in AI_AUDIT.md. They are the one thing that IS
 * duplicated — keep them in sync if a call site changes.
 */

import * as carouselPrompt from '@/lib/ai/carouselPrompt';
import * as reelPrompt from '@/lib/ai/rantToScript';
import * as storiesPrompt from '@/lib/ai/rantToStories';
import { SYSTEM_PROMPT as IDEAS_SYSTEM_PROMPT, buildUserContent as buildIdeasUserContent } from '@/lib/propose/proposeAngles';
import { PROPOSAL_COUNT } from '@/lib/propose/types';

import { postProcessCarouselRant } from '@/lib/ai/carouselRantPostProcess';
import { normalizeOutput as normalizeStories } from '@/lib/ai/storiesNormalize';
import { normalizeProposals } from '@/lib/propose/proposeAngles';

import { checkCarousel, checkIdeas, checkReel, checkStorytelling } from './rules.mjs';

/**
 * Default candidates, from ClickUp task 86d3ymaw7, plus the incumbent.
 *
 * The incumbent baseline is not in the task list but is included deliberately:
 * without it you learn which candidate is best, not whether any candidate beats
 * what is already in production. Drop it with --models if you don't want it.
 */
export const DEFAULT_MODELS = [
  'meta-llama/llama-3.3-70b-instruct', // incumbent — what ships today via Groq
  'deepseek/deepseek-chat',
  'google/gemini-2.5-pro',
  'anthropic/claude-sonnet-4.5',
];

export const GENERATION_TYPES = {
  carousel: {
    label: 'Карусель',
    callSite: 'app/api/carousel/rant-to-slides/route.ts → lib/ai/carouselPrompt.ts',
    temperature: 0.7,
    maxTokens: 3000,
    buildMessages(set) {
      const rant = set.braindump;
      const lang = carouselPrompt.detectOutputLanguage(rant);
      return [
        { role: 'system', content: carouselPrompt.buildSystemPrompt(lang) },
        { role: 'user', content: rant },
      ];
    },
    check: (parsed) => checkCarousel(parsed),
    normalize: (parsed) => postProcessCarouselRant(parsed),
  },

  reel: {
    label: 'Рілс',
    callSite: 'lib/ai/rantToScript.ts → transformRantToScript',
    temperature: 0.7,
    maxTokens: null,
    buildMessages(set) {
      const rant = set.braindump;
      const lang = reelPrompt.detectOutputLanguage(rant);
      return [
        { role: 'system', content: reelPrompt.buildSystemPrompt(lang) },
        { role: 'user', content: reelPrompt.buildUserContent(rant, lang) },
      ];
    },
    check: (parsed) => checkReel(parsed),
    normalize: null, // flattenToSceneDrafts is module-private; raw output is what we score
  },

  storytelling: {
    label: 'Сторітелінг',
    callSite: 'lib/ai/rantToStories.ts → generateStoriesFromRant',
    temperature: 0.7,
    maxTokens: null,
    buildMessages(set) {
      const rant = set.braindump;
      const lang = storiesPrompt.detectOutputLanguage(rant);
      return [
        { role: 'system', content: storiesPrompt.buildSystemPrompt(lang) },
        { role: 'user', content: storiesPrompt.buildUserPrompt(rant, set.storytellingName ?? '', lang) },
      ];
    },
    check: (parsed) => checkStorytelling(parsed),
    normalize: (parsed) => normalizeStories(parsed),
  },

  ideas: {
    label: 'Ідеї / кути',
    callSite: 'lib/propose/proposeAngles.ts → proposeAngles',
    temperature: 0.85,
    maxTokens: null,
    buildMessages(set) {
      // Ideas is signal-driven, not braindump-driven. A test set without
      // `ideasSignals` exercises the cold-start path, which is legitimate.
      const signals = Array.isArray(set.ideasSignals) ? set.ideasSignals : [];
      return [
        { role: 'system', content: IDEAS_SYSTEM_PROMPT },
        { role: 'user', content: buildIdeasUserContent(signals, set.ideasExclude ?? []) },
      ];
    },
    check: (parsed) => checkIdeas(parsed, { expectedCount: PROPOSAL_COUNT }),
    normalize: (parsed) => normalizeProposals(parsed),
  },
};

export const TYPE_IDS = Object.keys(GENERATION_TYPES);
