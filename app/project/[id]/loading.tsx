function ShimmerBlock({
  className,
}: {
  className: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-[color:var(--surface)] ${className}`}>
      <div className="reels-planner-skeleton-shimmer absolute inset-0 rounded-lg opacity-90" />
    </div>
  );
}

export default function ProjectLoading() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <ShimmerBlock className="h-5 w-52" />
          <div className="mt-3 flex items-center gap-3">
            <ShimmerBlock className="h-7 w-48" />
            <ShimmerBlock className="h-9 w-28" />
          </div>
        </div>

        <div className="space-y-6">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={`sk-sc-${idx}`}
              className="rounded-lg border border-[color:var(--border)] bg-white p-5 card-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-1 items-center gap-4">
                  <ShimmerBlock className="h-6 w-6 rounded" />
                  <div className="flex-1 space-y-2">
                    <ShimmerBlock className="h-4 w-3/5" />
                    <ShimmerBlock className="h-3 w-2/5" />
                  </div>
                </div>
                <ShimmerBlock className="h-7 w-14 rounded-full" />
              </div>

              <div className="mt-4 space-y-3">
                <ShimmerBlock className="h-6 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
