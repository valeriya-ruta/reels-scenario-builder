function Bar({ className }: { className: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-[color:var(--surface)] ${className}`}>
      <div className="reels-planner-skeleton-shimmer absolute inset-0 rounded-lg opacity-90" />
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Bar className="mb-8 h-9 w-40" />
        <div className="space-y-4 rounded-xl border border-[color:var(--border)] bg-white p-6 card-shadow">
          <Bar className="h-5 w-full" />
          <Bar className="h-5 w-4/5" />
          <Bar className="h-10 w-28 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
