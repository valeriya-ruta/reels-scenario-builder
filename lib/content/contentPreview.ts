import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabaseServer';
import type { ContentPiece, ContentPreview } from '@/lib/content/contentPiece';
import { estimateDialogueSeconds } from '@/lib/dialogueDuration';
import {
  estimateSeconds,
  isBlockEmpty,
  spokenScript,
  toReelBlock,
  type ReelBlock,
} from '@/lib/reels/blocks';

/** «1:35» — the shape a creator checks a Reel's length against. */
function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * Attach a real preview to each content piece (task 3.1).
 *
 * A content card must look like what it will BECOME — a carousel shows its
 * actual first slide in its actual colours, a story shows its opening line, a
 * reel shows its hook. None of that lives on the unified `content_pieces` view
 * (it is one row per piece, no bodies), so this batches one extra read per type
 * present in the list. Three queries at most, regardless of list length, and
 * every one is RLS-scoped.
 *
 * Deliberately best-effort: a failed preview read leaves the piece without a
 * preview and the card falls back to its title. A list must never fail to
 * render because a thumbnail could not be built.
 */

/** Shape of a stored carousel slide we care about here (see lib/carouselTypes). */
type StoredSlide = {
  title?: string | null;
  body?: string | null;
  backgroundColor?: string | null;
  backgroundType?: string | null;
  backgroundImageUrl?: string | null;
  titleColor?: string | null;
  bodyColor?: string | null;
};

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export async function attachPreviews(pieces: ContentPiece[]): Promise<ContentPiece[]> {
  if (pieces.length === 0) return pieces;
  const supabase = await createServerSupabaseClient();

  const carouselIds = pieces.filter((p) => p.refTable === 'carousel_projects').map((p) => p.id);
  const reelIds = pieces.filter((p) => p.refTable === 'projects').map((p) => p.id);
  const storyIds = pieces.filter((p) => p.refTable === 'storytelling_projects').map((p) => p.id);

  const previews = new Map<string, ContentPreview>();

  await Promise.all([
    (async () => {
      if (carouselIds.length === 0) return;
      const { data } = await supabase
        .from('carousel_projects')
        .select('id,slides')
        .in('id', carouselIds)
        .returns<{ id: string; slides: StoredSlide[] | null }[]>();
      for (const row of data ?? []) {
        const slides = Array.isArray(row.slides) ? row.slides : [];
        const cover = slides[0];
        if (!cover) continue;
        previews.set(row.id, {
          lead: clean(cover.title),
          sub: clean(cover.body),
          count: slides.length,
          countLabel: `${slides.length} слайдів`,
          // The card renders the cover in the carousel's OWN palette, so a
          // dark-brand carousel reads dark in the list too.
          cover: {
            background: cover.backgroundColor || '#1A1A2E',
            titleColor: cover.titleColor || '#FFFFFF',
            bodyColor: cover.bodyColor || '#FFFFFF',
            hasPhoto: cover.backgroundType === 'image' && !!cover.backgroundImageUrl,
          },
        });
      }
    })(),

    (async () => {
      if (reelIds.length === 0) return;

      // A reel is BLOCKS (migration 033). `scenes` is the shape from before
      // that and is mirrored one way only — scenes → blocks — so a reel that
      // has been edited in the builder still carries whatever `scenes` held the
      // day it was created. Reading `scenes` here put text on the card that the
      // author had already rewritten, in a language she had already changed.
      const { data: blockRows } = await supabase
        .from('reel_blocks')
        .select(
          'id,project_id,order_index,kind,speaker,spoken,screen_text,record_note,asset_kind,asset_note,asset_url,edit_note,overlays,audio_source,duration_sec',
        )
        .in('project_id', reelIds)
        .order('order_index', { ascending: true });

      const byProject = new Map<string, ReelBlock[]>();
      for (const row of blockRows ?? []) {
        const block = toReelBlock(row as Record<string, unknown>);
        const list = byProject.get(block.projectId);
        if (list) list.push(block);
        else byProject.set(block.projectId, [block]);
      }

      for (const [id, all] of byProject) {
        const blocks = all.filter((b) => !isBlockEmpty(b));
        if (blocks.length === 0) continue;
        // The same derivation the builder and the shared page use, so the card
        // cannot disagree with the screen it links to.
        const lead = clean(spokenScript(blocks).split('\n\n')[0]) || clean(blocks[0].recordNote) || clean(blocks[0].assetNote);
        const seconds = estimateSeconds(blocks);
        previews.set(id, {
          lead,
          count: blocks.length,
          countLabel: `${blocks.length} блоків`,
          ...(seconds > 0 ? { durationLabel: formatDuration(seconds) } : {}),
        });
      }

      // Reels written before blocks existed, and any whose mirror never ran.
      // Keyed on HAVING blocks, not on having produced a preview: a reel whose
      // blocks were emptied out shows no preview rather than resurrecting the
      // text from `scenes` that the author deleted.
      const withoutBlocks = reelIds.filter((id) => !byProject.has(id));
      if (withoutBlocks.length === 0) return;

      // The hook is scene 0 by construction (see flattenToSceneDrafts).
      const { data } = await supabase
        .from('scenes')
        .select('project_id,order_index,lines')
        .in('project_id', withoutBlocks)
        .order('order_index', { ascending: true })
        .returns<{ project_id: string; order_index: number; lines: string | null }[]>();
      const counts = new Map<string, number>();
      const seconds = new Map<string, number>();
      for (const row of data ?? []) {
        counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
        seconds.set(
          row.project_id,
          (seconds.get(row.project_id) ?? 0) + estimateDialogueSeconds(row.lines),
        );
        if (!previews.has(row.project_id)) {
          previews.set(row.project_id, { lead: clean(row.lines), count: 0, countLabel: '' });
        }
      }
      for (const [id, count] of counts) {
        const preview = previews.get(id);
        if (preview) {
          preview.count = count;
          preview.countLabel = `${count} сцен`;
          const total = seconds.get(id) ?? 0;
          // Only meaningful once something is actually written.
          if (total > 0) preview.durationLabel = formatDuration(total);
        }
      }
    })(),

    (async () => {
      if (storyIds.length === 0) return;
      // storytelling_stories hang off columns, so resolve columns → stories.
      const { data: columns } = await supabase
        .from('storytelling_columns')
        .select('id,project_id,order_index')
        .in('project_id', storyIds)
        .order('order_index', { ascending: true })
        .returns<{ id: string; project_id: string; order_index: number }[]>();
      if (!columns || columns.length === 0) return;

      const projectByColumn = new Map(columns.map((c) => [c.id, c.project_id]));
      const { data: stories } = await supabase
        .from('storytelling_stories')
        .select('column_id,order_index,text')
        .in('column_id', columns.map((c) => c.id))
        .order('order_index', { ascending: true })
        .returns<{ column_id: string; order_index: number; text: string | null }[]>();

      const counts = new Map<string, number>();
      for (const row of stories ?? []) {
        const projectId = projectByColumn.get(row.column_id);
        if (!projectId) continue;
        counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
        if (!previews.has(projectId)) {
          // The stored text carries an optional "Нотатка: …" tail; the card wants
          // only what the story actually says on screen.
          const opening = clean((row.text ?? '').split('\nНотатка:')[0]);
          previews.set(projectId, { lead: opening, count: 0, countLabel: '' });
        }
      }
      for (const [id, count] of counts) {
        const preview = previews.get(id);
        if (preview) {
          preview.count = count;
          preview.countLabel = `${count} сторіс`;
        }
      }
    })(),
  ]);

  return pieces.map((p) => {
    const preview = previews.get(p.id);
    return preview && preview.lead ? { ...p, preview } : p;
  });
}
