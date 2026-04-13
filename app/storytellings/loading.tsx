function Bar({ className }: { className: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-[color:var(--surface)] ${className}`}>
      <div className="reels-planner-skeleton-shimmer absolute inset-0 rounded-lg opacity-90" />
    </div>
  );
}

export default function StorytellingsLoading() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Bar className="h-9 w-56" />
          <Bar className="h-10 w-40 rounded-xl" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={`sk-st-${i}`}
              className="flex h-[72px] items-stretch rounded-lg border border-[color:var(--border)] bg-white card-shadow"
            >
              <Bar className="m-3 h-8 w-8 shrink-0 rounded" />
              <div className="flex flex-1 flex-col justify-center gap-2 py-3 pr-4">
                <Bar className="h-4 w-1/3 max-w-xs" />
                <Bar className="h-3 w-1/4 max-w-[180px]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
