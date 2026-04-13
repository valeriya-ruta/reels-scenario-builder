function Bar({ className }: { className: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-[color:var(--surface)] ${className}`}>
      <div className="reels-planner-skeleton-shimmer absolute inset-0 rounded-lg opacity-90" />
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl pb-16">
      <div className="space-y-6 pt-2">
        <Bar className="mx-auto h-10 w-72 max-w-full rounded-lg" />
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          <div className="order-2 flex w-full flex-col gap-3 lg:order-2 lg:w-56">
            <Bar className="h-12 w-full rounded-xl" />
            <Bar className="h-12 w-full rounded-xl" />
            <Bar className="h-12 w-full rounded-xl" />
          </div>
          <div className="order-1 min-h-[120px] flex-1 lg:order-1">
            <Bar className="h-full min-h-[100px] w-full rounded-xl" />
          </div>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Bar className="h-[124px] w-full rounded-2xl" />
        <Bar className="h-[124px] w-full rounded-2xl" />
      </div>
    </div>
  );
}
