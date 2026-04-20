'use client';

import { useEffect, useState } from 'react';
import { readPendingStoriesFromStorage, useRantResults } from '@/components/RantResultsContext';
import StoriesResult, { type StoriesOutput } from '@/components/stories/StoriesResult';
import TemplateSelector, { STORY_TEMPLATES, type StoryTemplateId } from '@/components/stories/TemplateSelector';

function ShimmerBlock({ className }: { className: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-[color:var(--surface)] ${className}`}>
      <div className="reels-planner-skeleton-shimmer absolute inset-0 rounded-lg opacity-90" />
    </div>
  );
}

function StoriesLoadingSkeleton() {
  return (
    <div className="space-y-3">
      <ShimmerBlock className="h-6 w-64" />
      <div className="flex flex-col gap-3 md:flex-row md:overflow-x-auto">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div
            key={`story-sk-${idx}`}
            className="w-full rounded-2xl border border-[color:var(--border)] bg-white p-4 md:w-[320px] md:min-w-[320px]"
          >
            <ShimmerBlock className="h-5 w-36" />
            <ShimmerBlock className="mt-3 h-24 w-full" />
            <ShimmerBlock className="mt-3 h-16 w-full" />
            <ShimmerBlock className="mt-3 h-6 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StoriesPage() {
  const { state, clearResult } = useRantResults();
  const [rant, setRant] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<StoryTemplateId | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StoriesOutput | null>(null);

  useEffect(() => {
    const pending = state.stories ?? readPendingStoriesFromStorage();
    if (!pending) return;
    setResult(pending);
    clearResult('stories');
  }, [state.stories, clearResult]);

  const runGeneration = async () => {
    const trimmed = rant.trim();
    if (!trimmed) {
      setError('Введи рент перед генерацією.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const selectedTemplateData = selectedTemplate
        ? STORY_TEMPLATES.find((template) => template.id === selectedTemplate) ?? null
        : null;
      const promptRant = selectedTemplateData
        ? `[Побажання шаблону: ${selectedTemplateData.id} — ${selectedTemplateData.name}]\n${trimmed}`
        : trimmed;

      const response = await fetch('/api/stories/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rant: promptRant }),
      });
      const payload = (await response.json()) as StoriesOutput | { error?: string };
      if (!response.ok) {
        setError((payload as { error?: string }).error ?? 'Не вдалося створити сценарій. Спробуй ще раз.');
        return;
      }
      setResult(payload as StoriesOutput);
    } catch {
      setError('Не вдалося створити сценарій. Спробуй ще раз.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold text-zinc-900">Рент → Сторіс</h1>
        <p className="text-sm text-zinc-600">Одна думка — одна сторіс. Введи свій рент — отримай готовий сценарій.</p>
      </div>

      <TemplateSelector selectedTemplate={selectedTemplate} onSelect={setSelectedTemplate} />
      {selectedTemplate && (
        <p className="text-xs text-zinc-500">Обраний шаблон буде використано як орієнтир при підготовці сценарію.</p>
      )}

      <div className="space-y-2">
        <textarea
          value={rant}
          onChange={(e) => setRant(e.target.value)}
          disabled={loading}
          placeholder="Про що будемо розповідати сьогодні?"
          className="min-h-[100px] w-full resize-y rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-sm leading-normal text-black placeholder:text-zinc-400 focus:border-[color:var(--accent)] focus:shadow-[inset_0_0_0_2px_var(--accent)] focus:outline-none disabled:opacity-60"
        />
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>

      <button
        type="button"
        onClick={() => void runGeneration()}
        disabled={loading}
        className="rounded-xl bg-[color:var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? 'Створюю сценарій…' : 'Створити сценарій'}
      </button>

      {loading && <StoriesLoadingSkeleton />}
      {!loading && result && <StoriesResult data={result} />}
    </div>
  );
}
