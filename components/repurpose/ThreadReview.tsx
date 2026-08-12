'use client';

import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import MaterialIcon from '@/components/ui/MaterialIcon';
import ProposalActions from '@/components/propose/ProposalActions';
import { REPURPOSE_TARGETS } from '@/lib/repurpose/types';
import { THREADS_POST_CHAR_LIMIT } from '@/lib/ai/threadNormalize';

/**
 * A generated Threads post, reviewed in place — the same three verbs every other
 * AI result in the app gets (Лишаємо / Ще раз / Підкрутити).
 *
 * A thread is the one output the app can't open in an editor, so the review IS
 * the delivery: every post is shown in full, in real type, with its own copy
 * button and character count against Threads' 500-character limit. Copying is
 * per post because that is how a thread is actually published — one box at a
 * time — with a copy-all for the drafting case.
 */
export default function ThreadReview({
  title,
  posts,
  sourceUrl,
  onKeep,
  onRegenerate,
  onTweak,
  regenerating,
}: {
  title: string;
  posts: string[];
  sourceUrl: string;
  onKeep: () => void;
  onRegenerate: () => void;
  onTweak: () => void;
  regenerating?: boolean;
}) {
  const [copied, setCopied] = useState<number | 'all' | null>(null);

  const copy = useCallback(async (text: string, key: number | 'all') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((cur) => (cur === key ? null : cur)), 1600);
    } catch {
      /* clipboard can be blocked (http, permissions) — the text is on screen anyway */
    }
  }, []);

  const meta = REPURPOSE_TARGETS.threads;

  return (
    <div data-testid="thread-review">
      <div
        className="rounded-[16px] border border-[color:var(--border)] bg-white/90 p-3.5"
        style={{ boxShadow: 'var(--elev-1)' }}
      >
        <div className="flex items-center gap-2">
          <MaterialIcon name="alternate_email" size={16} style={{ color: meta.color }} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-tight text-[color:var(--foreground)]">
            {title || meta.label}
          </span>
          <button
            type="button"
            onClick={() => void copy(posts.join('\n\n'), 'all')}
            data-testid="thread-copy-all"
            className="app-pill shrink-0 py-1.5 text-[11.5px]"
          >
            {copied === 'all' ? (
              <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
            ) : (
              <Copy className="h-3.5 w-3.5" strokeWidth={2} />
            )}
            {copied === 'all' ? 'Скопійовано' : 'Копіювати все'}
          </button>
        </div>

        <p className="mt-1.5 text-[11.5px] text-[color:var(--text-muted)]">
          {posts.length} {postsWord(posts.length)} · збережено в ідеї
        </p>

        <div className="mt-2.5 max-h-[46vh] space-y-1.5 overflow-y-auto">
          {posts.map((post, index) => {
            const over = post.length > THREADS_POST_CHAR_LIMIT;
            return (
              <div
                key={index}
                data-testid="thread-post"
                className="rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface)] p-2.5"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                    Пост {index + 1}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[10px] font-medium tabular-nums"
                      style={{ color: over ? '#dc2626' : 'var(--text-muted)' }}
                    >
                      {post.length}/{THREADS_POST_CHAR_LIMIT}
                    </span>
                    <button
                      type="button"
                      onClick={() => void copy(post, index)}
                      aria-label={`Скопіювати пост ${index + 1}`}
                      title="Скопіювати"
                      className="rounded-md p-1 text-[color:var(--text-muted)] transition-colors hover:bg-white hover:text-[color:var(--foreground)]"
                    >
                      {copied === index ? (
                        <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                      ) : (
                        <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                      )}
                    </button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-[13.5px] leading-snug text-[color:var(--foreground)]">
                  {post}
                </p>
              </div>
            );
          })}
        </div>

        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 inline-block truncate text-[11.5px] text-[color:var(--text-muted)] underline-offset-2 hover:underline"
        >
          Оригінал
        </a>
      </div>

      <div className="mt-3">
        <ProposalActions
          rationale={meta.rationale}
          onKeep={onKeep}
          onRegenerate={onRegenerate}
          onTweak={onTweak}
          regenerating={regenerating}
        />
      </div>
    </div>
  );
}

function postsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'пост';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'пости';
  return 'постів';
}
