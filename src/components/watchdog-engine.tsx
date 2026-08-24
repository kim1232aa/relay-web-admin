import { useEffect } from "react";
import { useAdminStore } from "@/lib/store";

export function WatchdogEngine() {
  const intervalSec = useAdminStore((s) => s.settings.intervalSec);

  useEffect(() => {
    let cancelled = false;

    async function probe() {
      const t0 = performance.now();
      try {
        const res = await fetch("/api/stack", { cache: "no-store" });
        const d = (await res.json()) as { live?: boolean };
        const ms = Math.max(1, Math.round(performance.now() - t0));
        if (!cancelled) useAdminStore.getState().recordProbe(ms, res.ok && Boolean(d.live));
      } catch {
        const ms = Math.max(1, Math.round(performance.now() - t0));
        if (!cancelled) useAdminStore.getState().recordProbe(ms, false);
      }
    }

    void probe();
    const id = window.setInterval(() => {
      void probe();
    }, Math.max(3, intervalSec) * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalSec]);

  return null;
}
