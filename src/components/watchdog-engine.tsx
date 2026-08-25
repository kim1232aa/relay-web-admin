import { useEffect } from "react";
import { useAdminStore } from "@/lib/store";

export function WatchdogEngine() {
  const intervalSec = useAdminStore((s) => s.settings.intervalSec);
  const keepalive = useAdminStore((s) => s.settings.keepalive);

  useEffect(() => {
    let cancelled = false;

    async function probe(tickle: boolean) {
      const t0 = performance.now();
      try {
        const res = await fetch("/api/stack", {
          method: tickle ? "POST" : "GET",
          cache: "no-store",
          headers: tickle ? { "content-type": "application/json" } : undefined,
          body: tickle ? JSON.stringify({ tickle: true }) : undefined,
        });
        const d = (await res.json()) as {
          live?: boolean;
          tickle?: { local?: boolean; tunnel?: boolean; restarted?: boolean };
        };
        const ms = Math.max(1, Math.round(performance.now() - t0));
        const ok = res.ok && Boolean(d.live || d.tickle?.local);
        if (!cancelled) useAdminStore.getState().recordProbe(ms, ok, tickle ? d.tickle : undefined);
      } catch {
        const ms = Math.max(1, Math.round(performance.now() - t0));
        if (!cancelled) useAdminStore.getState().recordProbe(ms, false);
      }
    }

    void probe(keepalive);
    const probeId = window.setInterval(() => {
      void probe(false);
    }, Math.max(3, intervalSec) * 1000);
    const tickleId = keepalive
      ? window.setInterval(() => {
          void probe(true);
        }, 60_000)
      : 0;
    return () => {
      cancelled = true;
      window.clearInterval(probeId);
      if (tickleId) window.clearInterval(tickleId);
    };
  }, [intervalSec, keepalive]);

  return null;
}
