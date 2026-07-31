/**
 * Turn a reel's scenes into ONE continuous spoken block (pure).
 *
 * The scenario view is a shot list; the teleprompter is the thing you actually
 * say. So this keeps only what comes out of the mouth: scene lines, in order,
 * with director's notes, framing labels and empty scenes stripped out. Reading a
 * scene label aloud is exactly the failure mode this mode exists to prevent.
 */

export type TeleprompterBeat = {
  /** 1-based position, used only for the subtle margin marker. */
  index: number;
  /** Beat label (ХУК / CTA) when the scene carries one — never read aloud. */
  label: string | null;
  /** What the creator says. */
  text: string;
};

type SceneLike = { order_index: number; lines: string | null; name?: string | null };

/** Labels that mark a structural beat rather than naming a scene. */
const BEAT_LABELS = new Set(['хук', 'hook', 'cta', 'заклик']);

function isBeatLabel(name: string | null | undefined): boolean {
  return !!name && BEAT_LABELS.has(name.trim().toLowerCase());
}

export function toTeleprompterBeats(scenes: ReadonlyArray<SceneLike>): TeleprompterBeat[] {
  return [...scenes]
    .sort((a, b) => a.order_index - b.order_index)
    .map((scene) => (scene.lines ?? '').replace(/\s+/g, ' ').trim())
    .map((text, i) => ({ text, i }))
    .filter(({ text }) => text.length > 0)
    .map(({ text, i }, position) => {
      const scene = [...scenes].sort((a, b) => a.order_index - b.order_index)[i];
      return {
        index: position + 1,
        label: isBeatLabel(scene?.name) ? (scene?.name ?? '').trim().toUpperCase() : null,
        text,
      };
    });
}

/** Rough spoken duration in seconds (~2.6 words/second, conversational Ukrainian). */
export function estimateSpokenSeconds(beats: ReadonlyArray<TeleprompterBeat>): number {
  const words = beats.reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0);
  return Math.round(words / 2.6);
}

/** «0:48» — a duration the creator can sanity-check against a Reel's length. */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The whole script as one plain block, for copy-to-clipboard. */
export function beatsToPlainText(beats: ReadonlyArray<TeleprompterBeat>): string {
  return beats.map((b) => b.text).join('\n\n');
}
