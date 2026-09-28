// Opening a project shows its outline straight away instead of freezing
// on the list while the plan, team and tickets load.
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading project">
      <div className="flex items-center gap-3">
        <div className="shimmer h-5 w-20 rounded" />
        <div className="shimmer h-7 w-72 rounded-md" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[84px] rounded-xl border border-navy-900/8 bg-surface p-4">
            <div className="shimmer h-2.5 w-20 rounded" />
            <div className="shimmer mt-3 h-5 w-32 rounded" />
          </div>
        ))}
      </div>
      <div className="h-14 rounded-xl border border-navy-900/8 bg-surface" />
      <div className="flex gap-2 border-b border-navy-900/10 pb-2.5">
        {[90, 70, 110, 80, 100, 90].map((w, i) => (
          <div key={i} className="shimmer h-5 rounded" style={{ width: w }} />
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-navy-900/8 bg-surface p-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="shimmer h-3.5 rounded" style={{ width: `${90 - i * 9}%` }} />
        ))}
      </div>
    </div>
  );
}
