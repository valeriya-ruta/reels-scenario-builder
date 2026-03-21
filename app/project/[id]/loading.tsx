function ShimmerBlock({
  className,
}: {
  className: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded bg-zinc-200/70 ${className}`}>
      <div className="absolute inset-0">
        <div className="absolute left-0 top-0 h-full w-1/2 bg-gradient-to-r from-transparent via-white/60 to-transparent reels-planner-shimmer" />
      </div>
    </div>
  );
}

export default function ProjectLoading() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <ShimmerBlock className="h-5 w-52" />
          <div className="mt-3 flex items-center gap-3">
            <ShimmerBlock className="h-7 w-48" />
            <ShimmerBlock className="h-9 w-28" />
          </div>
        </div>

        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={idx}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <ShimmerBlock className="h-6 w-6 rounded" />
                  <div className="flex-1 space-y-2">
                    <ShimmerBlock className="h-4 w-3/5" />
                    <ShimmerBlock className="h-3 w-2/5" />
                  </div>
                </div>
                <ShimmerBlock className="h-6 w-10 rounded" />
              </div>

              {/* Collapsed scenes only: avoids rendering heavy inputs while loading */}
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

