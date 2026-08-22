import { BLOCK_KINDS, type AssetKind, type BlockKind } from '@/lib/reels/blocks';
import { ENGAGEMENT_OPTIONS, VISUAL_OPTIONS, type EngagementType, type VisualType } from '@/lib/domain';
import {
  CONTENT_STATUSES,
  isValidStatus,
  type ContentStatus,
  type ContentType,
} from '@/lib/content/statusSystem';

/**
 * What Claude can do to the app — the tool surface, and the rules its arguments
 * must survive. Pure: no database, no React, no `process.env`, so the contract
 * can be tested on its own and the executor can assume clean input.
 *
 * The shape of a tool is chosen for someone TALKING, not filling a form: a reel
 * arrives as its blocks in order, a storytelling as its stories in order, and
 * the only required field anywhere is the content itself. Everything else —
 * date, status, name — has a sane default, because a spoken instruction rarely
 * carries all three.
 */

const ASSET_KINDS: readonly AssetKind[] = ['film', 'find', 'screenshot', 'photo'];
const CONTENT_TYPES: readonly ContentType[] = ['reel', 'carousel', 'story', 'idea'];

export type McpToolName =
  | 'list_content'
  | 'get_content'
  | 'create_reel'
  | 'create_story'
  | 'create_carousel'
  | 'create_idea'
  | 'schedule_content'
  | 'set_content_status';

export type ReelBlockInput = {
  kind: BlockKind;
  speaker: string | null;
  spoken: string | null;
  screenText: string | null;
  recordNote: string | null;
  assetKind: AssetKind | null;
  assetNote: string | null;
  editNote: string | null;
};

export type StoryInput = {
  text: string;
  visual: VisualType | null;
  engagement: EngagementType | null;
};

export type SlideInput = {
  title: string;
  body: string;
  items: string[] | null;
};

export type ParsedArgs =
  | { tool: 'list_content'; args: { from: string | null; to: string | null; type: ContentType | null; status: ContentStatus | null; limit: number } }
  | { tool: 'get_content'; args: { id: string } }
  | { tool: 'create_reel'; args: { name: string | null; overview: string | null; date: string | null; status: ContentStatus | null; blocks: ReelBlockInput[] } }
  | { tool: 'create_story'; args: { name: string | null; date: string | null; status: ContentStatus | null; stories: StoryInput[] } }
  | { tool: 'create_carousel'; args: { name: string | null; date: string | null; status: ContentStatus | null; slides: SlideInput[] } }
  | { tool: 'create_idea'; args: { text: string; type: ContentType | null } }
  | { tool: 'schedule_content'; args: { id: string; date: string | null } }
  | { tool: 'set_content_status'; args: { id: string; status: ContentStatus } };

export type ParseResult = { ok: true; call: ParsedArgs } | { ok: false; error: string };

// ── primitives ──────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Trimmed text, or null — the shape every optional text column wants. */
function optionalText(value: unknown): string | null {
  const s = str(value);
  return s ? s : null;
}

function optionalDate(value: unknown, field: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const s = str(value);
  if (!DATE_RE.test(s)) return { ok: false, error: `${field} must be a date like 2026-08-24` };
  // Reject 2026-02-31 and friends: the calendar groups by this string, so an
  // impossible day would file the piece on a date the grid never renders.
  const [y, m, d] = s.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return { ok: false, error: `${field} is not a real date` };
  }
  return { ok: true, value: s };
}

function optionalStatus(
  value: unknown,
  type: ContentType,
): { ok: true; value: ContentStatus | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const s = str(value).toLowerCase() as ContentStatus;
  if (!CONTENT_STATUSES.includes(s)) {
    return { ok: false, error: `status must be one of: ${CONTENT_STATUSES.join(', ')}` };
  }
  if (!isValidStatus(type, s)) {
    return { ok: false, error: `status "${s}" does not exist on the ${type} track` };
  }
  return { ok: true, value: s };
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** One of a fixed set, case-insensitively, or null. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const s = str(value).toLowerCase();
  return (allowed.find((a) => a.toLowerCase() === s) as T | undefined) ?? null;
}

// ── tool definitions (what `tools/list` returns) ────────────────────────────

export type McpToolDefinition = {
  name: McpToolName;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const DATE_PROP = {
  type: 'string',
  description: 'Day to put it on the План calendar, as YYYY-MM-DD. Omit to leave it undated.',
};

const STATUS_PROP = {
  type: 'string',
  enum: CONTENT_STATUSES as unknown as string[],
  description: 'Production status. Defaults to "idea".',
};

export const MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: 'list_content',
    title: 'List content',
    description:
      "Everything in the user's content plan — reels, carousels, storytellings and ideas — with their dates and statuses. Use it before creating something to see what is already planned for a day.",
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Only pieces scheduled on or after this YYYY-MM-DD.' },
        to: { type: 'string', description: 'Only pieces scheduled on or before this YYYY-MM-DD.' },
        type: { type: 'string', enum: CONTENT_TYPES as unknown as string[] },
        status: { type: 'string', enum: CONTENT_STATUSES as unknown as string[] },
        limit: { type: 'integer', description: 'Max rows to return (1–200, default 50).' },
      },
    },
  },
  {
    name: 'get_content',
    title: 'Read one piece',
    description:
      'The full written content of one piece: a reel block by block, a storytelling story by story, a carousel slide by slide.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The piece id, as returned by list_content.' } },
      required: ['id'],
    },
  },
  {
    name: 'create_reel',
    title: 'Create a reel',
    description:
      'Write a reel into the app as an ordered stack of blocks. A block is one beat: someone talking, a line of text on screen, a cutaway, a dialogue, a sound moment.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'What the reel is called. Defaults to «Новий рілс».' },
        overview: {
          type: 'string',
          description: 'Про що цей рілс — the brief the editor reads first: the idea, the mood, what the viewer should feel.',
        },
        date: DATE_PROP,
        status: STATUS_PROP,
        blocks: {
          type: 'array',
          description: 'The reel, in order. At least one block.',
          items: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: BLOCK_KINDS as unknown as string[],
                description:
                  'talk = говорю в камеру, dialogue = діалог, text = текст на екрані, broll = нарізка/перебивка, sound = звуковий момент. Defaults to talk.',
              },
              speaker: { type: 'string', description: 'Who says it, for a dialogue.' },
              spoken: { type: 'string', description: 'The words said out loud.' },
              screen_text: { type: 'string', description: 'The words burnt on screen.' },
              record_note: { type: 'string', description: 'How to shoot it.' },
              asset_kind: {
                type: 'string',
                enum: ASSET_KINDS as unknown as string[],
                description: 'film / find / screenshot / photo — what someone has to DO to get this shot.',
              },
              asset_note: { type: 'string', description: 'What the shot or asset actually is.' },
              edit_note: { type: 'string', description: 'What the editor does with it.' },
            },
          },
        },
      },
      required: ['blocks'],
    },
  },
  {
    name: 'create_story',
    title: 'Create a storytelling',
    description:
      'Write one day of Instagram stories into the app — the stories in order, each with what is said, how it looks and how it invites a reply.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'What this storytelling is called. Defaults to «Новий сторітел».' },
        date: DATE_PROP,
        status: STATUS_PROP,
        stories: {
          type: 'array',
          description: 'The stories, in posting order. At least one.',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'What this story says.' },
              visual: { type: 'string', enum: VISUAL_OPTIONS as unknown as string[] },
              engagement: { type: 'string', enum: ENGAGEMENT_OPTIONS as unknown as string[] },
            },
            required: ['text'],
          },
        },
      },
      required: ['stories'],
    },
  },
  {
    name: 'create_carousel',
    title: 'Create a carousel',
    description:
      'Write a carousel into the app slide by slide. The first slide is the cover and the last is the CTA; the design is applied in the app afterwards.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'What the carousel is called. Defaults to the cover title.' },
        date: DATE_PROP,
        status: STATUS_PROP,
        slides: {
          type: 'array',
          description: 'The slides, in order. At least one.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'The slide headline.' },
              body: { type: 'string', description: 'The slide body text.' },
              items: {
                type: 'array',
                items: { type: 'string' },
                description: 'Bullet lines, when the slide is a list.',
              },
            },
          },
        },
      },
      required: ['slides'],
    },
  },
  {
    name: 'create_idea',
    title: 'Save an idea',
    description:
      'Drop a raw thought into the app to be turned into content later. Use this when there is no script yet — just the idea.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The idea, in the user’s own words.' },
        type: {
          type: 'string',
          enum: CONTENT_TYPES as unknown as string[],
          description: 'What it is probably going to become, if that is already clear.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'schedule_content',
    title: 'Put a piece on a day',
    description: 'Move an existing piece to a day on the План calendar, or clear its date.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD, or null to unschedule it.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'set_content_status',
    title: 'Move a piece along',
    description: 'Set the production status of an existing piece (ідея → скрипт → зняти → змонтувати → готово → опубліковано).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: CONTENT_STATUSES as unknown as string[] },
      },
      required: ['id', 'status'],
    },
  },
] as const;

export function isToolName(name: unknown): name is McpToolName {
  return typeof name === 'string' && MCP_TOOLS.some((t) => t.name === name);
}

// ── argument parsing ────────────────────────────────────────────────────────

function parseBlocks(value: unknown): { ok: true; value: ReelBlockInput[] } | { ok: false; error: string } {
  const raw = list(value);
  if (raw.length === 0) return { ok: false, error: 'blocks must contain at least one block' };

  const blocks = raw.map((item) => {
    const b = record(item);
    return {
      kind: oneOf(b.kind, BLOCK_KINDS) ?? 'talk',
      speaker: optionalText(b.speaker),
      spoken: optionalText(b.spoken),
      // Both spellings accepted: a model writing JSON reaches for camelCase as
      // readily as for the snake_case in the schema, and rejecting one would
      // fail a call whose content is perfectly good.
      screenText: optionalText(b.screen_text ?? b.screenText),
      recordNote: optionalText(b.record_note ?? b.recordNote),
      assetKind: oneOf(b.asset_kind ?? b.assetKind, ASSET_KINDS),
      assetNote: optionalText(b.asset_note ?? b.assetNote),
      editNote: optionalText(b.edit_note ?? b.editNote),
    } satisfies ReelBlockInput;
  });

  const empty = blocks.every(
    (b) => !b.spoken && !b.screenText && !b.recordNote && !b.assetNote && !b.editNote,
  );
  if (empty) return { ok: false, error: 'every block is empty — a reel needs words, a shot or a note' };
  return { ok: true, value: blocks };
}

function parseStories(value: unknown): { ok: true; value: StoryInput[] } | { ok: false; error: string } {
  const raw = list(value);
  if (raw.length === 0) return { ok: false, error: 'stories must contain at least one story' };

  const stories = raw.map((item) => {
    // A bare string is a story too — «зроби сторіс про X, Y, Z» is the most
    // natural thing to say, and it should not need an object per line.
    const s = typeof item === 'string' ? { text: item } : record(item);
    return {
      text: str(s.text),
      visual: oneOf(s.visual, VISUAL_OPTIONS),
      engagement: oneOf(s.engagement, ENGAGEMENT_OPTIONS),
    } satisfies StoryInput;
  });

  if (stories.every((s) => !s.text)) return { ok: false, error: 'every story is empty' };
  return { ok: true, value: stories };
}

function parseSlides(value: unknown): { ok: true; value: SlideInput[] } | { ok: false; error: string } {
  const raw = list(value);
  if (raw.length === 0) return { ok: false, error: 'slides must contain at least one slide' };

  const slides = raw.map((item) => {
    const s = typeof item === 'string' ? { body: item } : record(item);
    const items = list(s.items ?? s.listItems)
      .map((i) => str(i))
      .filter(Boolean);
    return {
      title: str(s.title),
      body: str(s.body),
      items: items.length > 0 ? items : null,
    } satisfies SlideInput;
  });

  if (slides.every((s) => !s.title && !s.body && !s.items)) {
    return { ok: false, error: 'every slide is empty' };
  }
  return { ok: true, value: slides };
}

/**
 * Validate one `tools/call` payload.
 *
 * Everything that can be forgiven is forgiven (missing name, missing date,
 * camelCase where the schema says snake_case, a bare string where an object was
 * described); everything that would write nonsense into the plan is refused
 * with a sentence the model can act on.
 */
export function parseToolCall(name: string, rawArgs: unknown): ParseResult {
  if (!isToolName(name)) return { ok: false, error: `unknown tool "${name}"` };
  const args = record(rawArgs);

  switch (name) {
    case 'list_content': {
      const from = optionalDate(args.from, 'from');
      if (!from.ok) return from;
      const to = optionalDate(args.to, 'to');
      if (!to.ok) return to;

      const type = oneOf(args.type, CONTENT_TYPES);
      if (args.type !== undefined && args.type !== null && args.type !== '' && !type) {
        return { ok: false, error: `type must be one of: ${CONTENT_TYPES.join(', ')}` };
      }
      const status = oneOf(args.status, CONTENT_STATUSES);
      if (args.status !== undefined && args.status !== null && args.status !== '' && !status) {
        return { ok: false, error: `status must be one of: ${CONTENT_STATUSES.join(', ')}` };
      }

      const rawLimit = Number(args.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 50;
      return { ok: true, call: { tool: name, args: { from: from.value, to: to.value, type, status, limit } } };
    }

    case 'get_content': {
      const id = str(args.id);
      if (!id) return { ok: false, error: 'id is required' };
      return { ok: true, call: { tool: name, args: { id } } };
    }

    case 'create_reel': {
      const date = optionalDate(args.date, 'date');
      if (!date.ok) return date;
      const status = optionalStatus(args.status, 'reel');
      if (!status.ok) return status;
      const blocks = parseBlocks(args.blocks);
      if (!blocks.ok) return blocks;
      return {
        ok: true,
        call: {
          tool: name,
          args: {
            name: optionalText(args.name),
            overview: optionalText(args.overview),
            date: date.value,
            status: status.value,
            blocks: blocks.value,
          },
        },
      };
    }

    case 'create_story': {
      const date = optionalDate(args.date, 'date');
      if (!date.ok) return date;
      const status = optionalStatus(args.status, 'story');
      if (!status.ok) return status;
      const stories = parseStories(args.stories);
      if (!stories.ok) return stories;
      return {
        ok: true,
        call: {
          tool: name,
          args: { name: optionalText(args.name), date: date.value, status: status.value, stories: stories.value },
        },
      };
    }

    case 'create_carousel': {
      const date = optionalDate(args.date, 'date');
      if (!date.ok) return date;
      const status = optionalStatus(args.status, 'carousel');
      if (!status.ok) return status;
      const slides = parseSlides(args.slides);
      if (!slides.ok) return slides;
      return {
        ok: true,
        call: {
          tool: name,
          args: { name: optionalText(args.name), date: date.value, status: status.value, slides: slides.value },
        },
      };
    }

    case 'create_idea': {
      const text = str(args.text);
      if (!text) return { ok: false, error: 'text is required' };
      return { ok: true, call: { tool: name, args: { text, type: oneOf(args.type, CONTENT_TYPES) } } };
    }

    case 'schedule_content': {
      const id = str(args.id);
      if (!id) return { ok: false, error: 'id is required' };
      // `null` is meaningful here (unschedule), so it is not the same as absent.
      const date = optionalDate(args.date, 'date');
      if (!date.ok) return date;
      return { ok: true, call: { tool: name, args: { id, date: date.value } } };
    }

    case 'set_content_status': {
      const id = str(args.id);
      if (!id) return { ok: false, error: 'id is required' };
      const status = oneOf(args.status, CONTENT_STATUSES);
      if (!status) return { ok: false, error: `status must be one of: ${CONTENT_STATUSES.join(', ')}` };
      return { ok: true, call: { tool: name, args: { id, status } } };
    }
  }
}
