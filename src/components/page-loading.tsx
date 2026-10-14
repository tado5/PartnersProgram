export function PageLoading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-6">
      <span className="sr-only">Načítava sa…</span>
      <div className="space-y-3">
        <div className="h-3 w-32 rounded bg-stone-200" />
        <div className="h-8 w-2/3 max-w-md rounded bg-stone-200" />
        <div className="h-4 w-full max-w-xl rounded bg-stone-200" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((key) => <div key={key} className="h-24 rounded-xl bg-stone-200" />)}
      </div>
      <div className="h-64 rounded-xl bg-stone-200" />
    </div>
  );
}
