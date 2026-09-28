// Shown the instant a Projects page is navigated to, while its data loads.
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <div className="shimmer h-7 w-56 rounded-md" />
        <div className="shimmer h-3.5 w-96 max-w-full rounded" />
      </div>
      <div className="flex gap-2 border-b border-navy-900/10 pb-2.5">
        {[120, 150, 130, 160].map((w) => (
          <div key={w} className="shimmer h-5 rounded" style={{ width: w }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[92px] rounded-xl border border-navy-900/8 bg-surface p-4">
            <div className="shimmer h-2.5 w-20 rounded" />
            <div className="shimmer mt-3 h-6 w-10 rounded" />
            <div className="shimmer mt-2.5 h-2.5 w-24 rounded" />
          </div>
        ))}
      </div>
      <div className="h-[60px] rounded-xl border border-navy-900/8 bg-surface" />
      <div className="overflow-hidden rounded-xl border border-navy-900/8 bg-surface">
        <div className="h-10 border-b border-navy-900/10 bg-surface-2" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-navy-900/6 px-4 py-4 last:border-0">
            <div className="shimmer h-4 w-16 rounded" />
            <div className="flex-1 space-y-2">
              <div className="shimmer h-3 w-2/5 rounded" />
              <div className="shimmer h-2.5 w-3/5 rounded" />
            </div>
            <div className="shimmer h-7 w-7 rounded-full" />
            <div className="shimmer h-3 w-24 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
