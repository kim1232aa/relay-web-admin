import { useAdminStore } from "@/lib/store";

export function LatencySpark() {
  const latencies = useAdminStore((s) => s.latencies);
  if (latencies.length < 2) return null;
  const w = 240;
  const h = 36;
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  const span = Math.max(1, max - min);
  const pts = latencies
    .map((v, i) => {
      const x = (i / (latencies.length - 1)) * w;
      const y = h - 4 - ((v - min) / span) * (h - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="mt-4">
      <p className="text-xs text-subtle">探活延迟</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-9 w-full max-w-xs text-live" aria-hidden>
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={pts}
        />
      </svg>
    </div>
  );
}
