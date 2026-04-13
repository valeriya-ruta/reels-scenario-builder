function Bar({ className }: { className: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-[color:var(--surface)] ${className}`}>
      <div className="reels-planner-skeleton-shimmer absolute inset-0 rounded-lg opacity-90" />
    </div>
  );
}

export default function CompetitorAnalysisLoading() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Bar className="mb-6 h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4 rounded-xl border border-[color:var(--border)] bg-white p-6 card-shadow">
            <Bar className="h-12 w-full max-w-md" />
            <Bar className="h-10 w-32 rounded-xl" />
            <Bar className="h-24 w-full" />
          </div>
          <div className="space-y-3 rounded-xl border border-[color:var(--border)] bg-white p-5 card-shadow">
            {Array.from({ length: 4 }).map((_, i) => (
              <Bar key={`sk-ca-${i}`} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
