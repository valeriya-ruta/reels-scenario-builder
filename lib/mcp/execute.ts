import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabaseAdmin';
import { createEmptySlide, slidesForDatabase } from '@/lib/carouselSlides';
import { displayTitle, NEW_LABELS } from '@/lib/content/displayTitle';
import { toReelBlock, REEL_BLOCK_COLUMNS } from '@/lib/reels/blocks';
import {
  isValidStatus,
  STATUS_LABELS,
  TYPE_LABELS,
  TYPE_TRACKS,
  type ContentStatus,
  type ContentType,
} from '@/lib/content/statusSystem';
import type { ToolResult } from '@/lib/mcp/protocol';
import type { ParsedArgs, ReelBlockInput, SlideInput, StoryInput } from '@/lib/mcp/tools';

/**
 * The tools, actually run — the only file in `lib/mcp` that touches a database.
 *
 * Every query is scoped by `user_id` BY HAND, because the client here is the
 * service role and there is no `auth.uid()` to lean on: the MCP token is the
 * credential, and it names exactly one user. That is the whole security model,
 * so it is written out on every statement rather than assumed once at the top —
 * a missing `.eq('user_id', …)` here would hand one user another's plan.
 *
 * Pro scoping is deliberately absent: an MCP token belongs to an account, not
 * to whichever blogger a browser tab happens to be pinned to, so rows are
 * created unscoped (`project_id` null) exactly as the personal edition does.
 */

type RefTable = 'projects' | 'carousel_projects' | 'storytelling_projects' | 'ideas';

const HREF_BY_TABLE: Record<RefTable, (id: string) => string> = {
  projects: (id) => `/project/${id}`,
  carousel_projects: (id) => `/carousel/${id}`,
  storytelling_projects: (id) => `/storytelling/${id}`,
  ideas: () => '/dashboard',
};

/** Where a piece lives on the web, for a link the user can actually click. */
function appUrl(table: RefTable, id: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  return `${base}${HREF_BY_TABLE[table](id)}`;
}

function fail(text: string): ToolResult {
  return { text, isError: true };
}

// ── shared reads ────────────────────────────────────────────────────────────

type PieceRow = {
  id: string;
  content_type: ContentType;
  status: ContentStatus;
  title: string | null;
  ref_table: RefTable;
  scheduled_date: string | null;
  updated_at: string;
};

/**
 * The four tables content lives in, read directly.
 *
 * The app's own screens read the `content_pieces` view instead, and that is
 * right for them — it is `security_invoker`, granted to `authenticated`, and
 * RLS does the scoping. Neither of those holds here: this client is the service
 * role, so the grant is not guaranteed and RLS is not in force. Reading the base
 * tables means the only thing standing between two users is the `user_id`
 * filter, which is then visible on every single query rather than inherited
 * from a view definition in a migration.
 */
type Source = {
  table: RefTable;
  columns: string;
  /** Fixed for the content tables; taken from the row for ideas. */
  type: ContentType | null;
  /** `projects` also holds rows that are not reels. */
  onlyProjectType?: string;
};

const NAMED_COLUMNS = 'id,name,status,scheduled_date,updated_at';

const SOURCES: readonly Source[] = [
  { table: 'projects', columns: NAMED_COLUMNS, type: 'reel', onlyProjectType: 'reels' },
  { table: 'carousel_projects', columns: NAMED_COLUMNS, type: 'carousel' },
  { table: 'storytelling_projects', columns: NAMED_COLUMNS, type: 'story' },
  { table: 'ideas', columns: 'id,title,content,content_type,status,scheduled_date,updated_at', type: null },
];

function toPieceRow(source: Source, row: Record<string, unknown>): PieceRow {
  const rawTitle = typeof row.name === 'string' ? row.name : typeof row.title === 'string' ? row.title : '';
  const ideaTitle = rawTitle || String(row.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return {
    id: String(row.id),
    content_type: (source.type ?? (row.content_type as ContentType) ?? 'idea') as ContentType,
    status: ((row.status as ContentStatus) ?? 'idea') as ContentStatus,
    title: source.table === 'ideas' ? ideaTitle : rawTitle,
    ref_table: source.table,
    scheduled_date: (row.scheduled_date as string | null) ?? null,
    updated_at: String(row.updated_at ?? ''),
  };
}

/** One piece of the user's own content, or null. The id is never trusted. */
async function findPiece(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<PieceRow | null> {
  const found = await Promise.all(
    SOURCES.map(async (source) => {
      const { data } = await supabase
        .from(source.table)
        .select(source.columns)
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle<Record<string, unknown>>();
      return data ? toPieceRow(source, data) : null;
    }),
  );
  return found.find(Boolean) ?? null;
}

/** The one-line summary a piece gets in a list. */
function pieceSummary(row: PieceRow): Record<string, unknown> {
  return {
    id: row.id,
    type: row.content_type,
    title: displayTitle(row.title, row.content_type === 'idea' ? 'idea' : row.content_type),
    status: row.status,
    date: row.scheduled_date,
    url: appUrl(row.ref_table, row.id),
  };
}

function describe(row: PieceRow): string {
  const when = row.scheduled_date ? ` на ${row.scheduled_date}` : ' (без дати)';
  const title = displayTitle(row.title, row.content_type === 'idea' ? 'idea' : row.content_type);
  return `${TYPE_LABELS[row.content_type]} «${title}»${when} — ${STATUS_LABELS[row.status]}`;
}

// ── creation helpers ────────────────────────────────────────────────────────

/**
 * A name for something that arrived without one.
 *
 * Falling back to «Новий рілс» is correct but useless in a list of six, so the
 * piece's own opening words are used when there are any — the same trick the
 * app plays when a storytelling names itself from its first card.
 */
function deriveName(explicit: string | null, firstWords: string, kind: 'reel' | 'story' | 'carousel'): string {
  if (explicit) return explicit.slice(0, 120);
  const compact = firstWords.replace(/\s+/g, ' ').trim();
  if (!compact) return NEW_LABELS[kind];
  return compact.length <= 60 ? compact : `${compact.slice(0, 59).trimEnd()}…`;
}

function reelBlockRows(projectId: string, blocks: readonly ReelBlockInput[]): Record<string, unknown>[] {
  return blocks.map((b, i) => ({
    project_id: projectId,
    order_index: i,
    kind: b.kind,
    speaker: b.speaker,
    spoken: b.spoken,
    screen_text: b.screenText,
    record_note: b.recordNote,
    // Mirrors the builder's own `emptyBlock`: a cutaway exists to carry the
    // voice over it, so it is filmed with a voiceover unless told otherwise.
    asset_kind: b.assetKind ?? (b.kind === 'broll' ? 'film' : null),
    asset_note: b.assetNote,
    edit_note: b.editNote,
    ...(b.kind === 'broll' ? { audio_source: 'voiceover' } : {}),
  }));
}

function storyRows(columnId: string, stories: readonly StoryInput[]): Record<string, unknown>[] {
  return stories.map((s, i) => ({
    column_id: columnId,
    order_index: i,
    text: s.text,
    visual: s.visual,
    engagement: s.engagement,
  }));
}

/**
 * Slides, in the shape the carousel editor stores.
 *
 * Built on top of `createEmptySlide` rather than hand-written, so a carousel
 * that arrives through MCP carries every field the designer expects — colours,
 * sizes, placement — and opens in the editor looking like any other carousel
 * instead of a half-populated row.
 */
function carouselSlides(slides: readonly SlideInput[]) {
  return slidesForDatabase(
    slides.map((raw, index) => {
      const slide = createEmptySlide();
      slide.title = raw.title;
      slide.body = raw.body;
      slide.layout = raw.title ? 'title_and_text' : 'text_only';
      slide.listItems = raw.items;
      slide.slideType = index === 0 ? 'cover' : index === slides.length - 1 ? 'final' : 'slide';
      slide.layoutPreset =
        slide.slideType === 'cover' ? null : slide.slideType === 'final' ? 'goal' : raw.items ? 'list' : 'text';
      return slide;
    }),
  );
}

// ── the executor ────────────────────────────────────────────────────────────

export function createExecutor(userId: string) {
  const supabase = createServiceRoleClient();

  return async function execute(call: ParsedArgs): Promise<ToolResult> {
    switch (call.tool) {
      case 'list_content': {
        const { from, to, type, status, limit } = call.args;

        // Only the tables that can answer are asked. An idea row carries its own
        // content_type, so a `type` filter narrows it after the read.
        const wanted = SOURCES.filter((s) => !type || s.type === type || s.table === 'ideas');

        const perSource = await Promise.all(
          wanted.map(async (source) => {
            let query = supabase
              .from(source.table)
              .select(source.columns)
              .eq('user_id', userId);
            if (source.onlyProjectType) query = query.eq('project_type', source.onlyProjectType);
            if (from) query = query.gte('scheduled_date', from);
            if (to) query = query.lte('scheduled_date', to);
            if (status) query = query.eq('status', status);

            const { data, error } = await query
              .order('scheduled_date', { ascending: true, nullsFirst: false })
              .order('updated_at', { ascending: false })
              .limit(limit)
              .returns<Record<string, unknown>[]>();

            if (error) throw new Error(error.message);
            return (data ?? []).map((row) => toPieceRow(source, row));
          }),
        ).catch((error: Error) => error);

        if (perSource instanceof Error) {
          return fail(`Не вдалося прочитати контент: ${perSource.message}`);
        }

        // Dated work reads as a plan when it is in date order; undated work has
        // no order but recency, so it sorts by that underneath.
        const rows = perSource
          .flat()
          .filter((row) => !type || row.content_type === type)
          .sort((a, b) => {
            if (a.scheduled_date !== b.scheduled_date) {
              if (!a.scheduled_date) return 1;
              if (!b.scheduled_date) return -1;
              return a.scheduled_date < b.scheduled_date ? -1 : 1;
            }
            return a.updated_at < b.updated_at ? 1 : -1;
          })
          .slice(0, limit);
        return {
          text:
            rows.length === 0
              ? 'Нічого не знайдено.'
              : rows.map((r) => `• ${describe(r)} [${r.id}]`).join('\n'),
          structured: { count: rows.length, pieces: rows.map(pieceSummary) },
        };
      }

      case 'get_content': {
        const piece = await findPiece(supabase, userId, call.args.id);
        if (!piece) return fail('Такого контенту немає.');

        const base = pieceSummary(piece);

        if (piece.ref_table === 'projects') {
          const [{ data: project }, { data: blocks }] = await Promise.all([
            supabase
              .from('projects')
              .select('overview')
              .eq('id', piece.id)
              .eq('user_id', userId)
              .maybeSingle<{ overview: string | null }>(),
            supabase
              .from('reel_blocks')
              .select(REEL_BLOCK_COLUMNS)
              .eq('project_id', piece.id)
              .order('order_index', { ascending: true }),
          ]);
          const parsed = (blocks ?? []).map((b) => toReelBlock(b as Record<string, unknown>));
          return {
            text: [
              describe(piece),
              project?.overview ? `Про що: ${project.overview}` : null,
              ...parsed.map(
                (b, i) =>
                  `${i + 1}. [${b.kind}] ${b.spoken ?? b.assetNote ?? b.screenText ?? '—'}${
                    b.screenText && b.spoken ? ` | на екрані: ${b.screenText}` : ''
                  }`,
              ),
            ]
              .filter(Boolean)
              .join('\n'),
            structured: { ...base, overview: project?.overview ?? null, blocks: parsed },
          };
        }

        if (piece.ref_table === 'storytelling_projects') {
          const { data: columns } = await supabase
            .from('storytelling_columns')
            .select('id')
            .eq('project_id', piece.id)
            .order('order_index', { ascending: true });
          const columnIds = ((columns ?? []) as { id: string }[]).map((c) => c.id);
          const { data: stories } = columnIds.length
            ? await supabase
                .from('storytelling_stories')
                .select('id,text,visual,engagement,order_index')
                .in('column_id', columnIds)
                .order('order_index', { ascending: true })
            : { data: [] as unknown[] };
          const rows = (stories ?? []) as { text: string; visual: string | null; engagement: string | null }[];
          return {
            text: [
              describe(piece),
              ...rows.map((s, i) => `Сторіс ${i + 1}: ${s.text || '—'}`),
            ].join('\n'),
            structured: { ...base, stories: rows },
          };
        }

        if (piece.ref_table === 'carousel_projects') {
          const { data: row } = await supabase
            .from('carousel_projects')
            .select('slides')
            .eq('id', piece.id)
            .eq('user_id', userId)
            .maybeSingle<{ slides: unknown }>();
          const slides = Array.isArray(row?.slides)
            ? (row.slides as { title?: string; body?: string }[])
            : [];
          return {
            text: [
              describe(piece),
              ...slides.map((s, i) => `Слайд ${i + 1}: ${[s.title, s.body].filter(Boolean).join(' — ') || '—'}`),
            ].join('\n'),
            structured: { ...base, slides },
          };
        }

        const { data: idea } = await supabase
          .from('ideas')
          .select('content')
          .eq('id', piece.id)
          .eq('user_id', userId)
          .maybeSingle<{ content: string | null }>();
        return {
          text: `${describe(piece)}\n${idea?.content ?? ''}`.trim(),
          structured: { ...base, text: idea?.content ?? '' },
        };
      }

      case 'create_reel': {
        const { name, overview, date, status, blocks } = call.args;
        const title = deriveName(name, blocks[0]?.spoken ?? blocks[0]?.screenText ?? '', 'reel');

        const { data: project, error } = await supabase
          .from('projects')
          .insert({
            user_id: userId,
            name: title,
            crew_mode: 'with_crew',
            project_type: 'reels',
            scheduled_date: date,
            status: status ?? 'idea',
            overview: overview ? overview.slice(0, 2000) : null,
          })
          .select('id')
          .single<{ id: string }>();

        if (error || !project) return fail(`Не вдалося створити рілс: ${error?.message ?? 'невідома помилка'}`);

        const { error: blockError } = await supabase
          .from('reel_blocks')
          .insert(reelBlockRows(project.id, blocks));
        if (blockError) {
          // A reel with no blocks is not a reel — leaving the empty shell behind
          // would put a piece on the calendar that says nothing.
          await supabase.from('projects').delete().eq('id', project.id).eq('user_id', userId);
          return fail(`Не вдалося записати блоки: ${blockError.message}`);
        }

        const url = appUrl('projects', project.id);
        return {
          text: `Рілс «${title}» створено — ${blocks.length} блоків${date ? `, на ${date}` : ''}.\n${url}`,
          structured: { id: project.id, type: 'reel', title, date, url },
        };
      }

      case 'create_story': {
        const { name, date, status, stories } = call.args;
        const title = deriveName(name, stories[0]?.text ?? '', 'story');

        const { data: project, error } = await supabase
          .from('storytelling_projects')
          .insert({ user_id: userId, name: title, scheduled_date: date, status: status ?? 'idea' })
          .select('id')
          .single<{ id: string }>();

        if (error || !project) return fail(`Не вдалося створити сторітел: ${error?.message ?? 'невідома помилка'}`);

        const { data: column, error: columnError } = await supabase
          .from('storytelling_columns')
          .insert({ project_id: project.id, name: 'Storytelling 1', order_index: 0 })
          .select('id')
          .single<{ id: string }>();

        if (columnError || !column) {
          await supabase.from('storytelling_projects').delete().eq('id', project.id).eq('user_id', userId);
          return fail(`Не вдалося створити сторітел: ${columnError?.message ?? 'невідома помилка'}`);
        }

        const { error: storyError } = await supabase
          .from('storytelling_stories')
          .insert(storyRows(column.id, stories));
        if (storyError) {
          await supabase.from('storytelling_projects').delete().eq('id', project.id).eq('user_id', userId);
          return fail(`Не вдалося записати сторіс: ${storyError.message}`);
        }

        const url = appUrl('storytelling_projects', project.id);
        return {
          text: `Сторітел «${title}» створено — ${stories.length} сторіс${date ? `, на ${date}` : ''}.\n${url}`,
          structured: { id: project.id, type: 'story', title, date, url },
        };
      }

      case 'create_carousel': {
        const { name, date, status, slides } = call.args;
        const title = deriveName(name, slides[0]?.title || slides[0]?.body || '', 'carousel');

        const { data: project, error } = await supabase
          .from('carousel_projects')
          .insert({
            user_id: userId,
            name: title,
            scheduled_date: date,
            status: status ?? 'idea',
            slides: carouselSlides(slides),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single<{ id: string }>();

        if (error || !project) return fail(`Не вдалося створити карусель: ${error?.message ?? 'невідома помилка'}`);

        const url = appUrl('carousel_projects', project.id);
        return {
          text: `Карусель «${title}» створено — ${slides.length} слайдів${date ? `, на ${date}` : ''}.\n${url}`,
          structured: { id: project.id, type: 'carousel', title, date, url },
        };
      }

      case 'create_idea': {
        const { text, type } = call.args;
        const title = text.replace(/\s+/g, ' ').trim().slice(0, 80);
        const { data, error } = await supabase
          .from('ideas')
          .insert({
            user_id: userId,
            content: text,
            title,
            source: 'mcp',
            ...(type && type !== 'idea' ? { content_type: type } : {}),
          })
          .select('id')
          .single<{ id: string }>();

        if (error || !data) return fail(`Не вдалося зберегти думку: ${error?.message ?? 'невідома помилка'}`);
        return {
          text: `Думку збережено: «${title}».`,
          structured: { id: data.id, type: 'idea', title },
        };
      }

      case 'schedule_content': {
        const piece = await findPiece(supabase, userId, call.args.id);
        if (!piece) return fail('Такого контенту немає.');

        const { error } = await supabase
          .from(piece.ref_table)
          .update({ scheduled_date: call.args.date })
          .eq('id', piece.id)
          .eq('user_id', userId);
        if (error) return fail(`Не вдалося змінити дату: ${error.message}`);

        return {
          text: call.args.date
            ? `Перенесено на ${call.args.date}: ${describe({ ...piece, scheduled_date: call.args.date })}`
            : `Знято з календаря: ${describe({ ...piece, scheduled_date: null })}`,
          structured: { id: piece.id, date: call.args.date },
        };
      }

      case 'set_content_status': {
        const piece = await findPiece(supabase, userId, call.args.id);
        if (!piece) return fail('Такого контенту немає.');

        // The status track is per TYPE, and the type is only known once the
        // piece has been found — so this check cannot live with the rest of the
        // argument parsing. A carousel has no «Зняти».
        if (!isValidStatus(piece.content_type, call.args.status)) {
          return fail(
            `Статус «${call.args.status}» не існує для типу ${piece.content_type}: ${TYPE_TRACKS[
              piece.content_type
            ].join(', ')}`,
          );
        }

        const { error } = await supabase
          .from(piece.ref_table)
          .update({ status: call.args.status, updated_at: new Date().toISOString() })
          .eq('id', piece.id)
          .eq('user_id', userId);
        if (error) return fail(`Не вдалося змінити статус: ${error.message}`);

        return {
          text: describe({ ...piece, status: call.args.status }),
          structured: { id: piece.id, status: call.args.status },
        };
      }
    }
  };
}
