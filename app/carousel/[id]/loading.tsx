'use client';

export default function CarouselStudioLoading() {
  return (
    <div className="min-h-[60vh] px-4">
      <div className="mx-auto flex h-[60vh] w-full max-w-4xl flex-col items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-200 border-t-[color:var(--accent)]" />
        <p className="mt-4 text-sm text-zinc-600">Відкриваємо карусель…</p>
      </div>
    </div>
  );
}
