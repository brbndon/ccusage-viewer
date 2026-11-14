const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function formatAge(scannedAt: Date, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - scannedAt.getTime());
  if (elapsed < MINUTE_MS) return "just now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} min ago`;
  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(elapsed / DAY_MS);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** Shown while the page displays a scan saved on disk rather than one run in this session. */
export default function SavedScanNotice({
  scannedAt,
  refreshing,
}: {
  scannedAt: string;
  /** The server is re-running the saved scan in the background. */
  refreshing: boolean;
}) {
  const taken = new Date(scannedAt);
  const when = taken.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      role="status"
      className="reveal flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-slate-700 shadow-xs"
    >
      <span className="font-semibold text-slate-900">Saved scan</span>
      <span className="num-tabular">
        {when} <span className="text-slate-500">({formatAge(taken, new Date())})</span>
      </span>
      <span className="text-xs text-slate-500">
        {refreshing
          ? "Updating in the background; this page refreshes when it finishes."
          : "Press Scan Usage to get the latest numbers."}
      </span>
    </div>
  );
}
