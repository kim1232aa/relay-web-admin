import { useEffect, useRef, useState } from "react";
import { useAdminStore } from "@/lib/store";
import { formatTime } from "@/lib/seed";

export function LogsView() {
  const logs = useAdminStore((s) => s.logs);
  const preRef = useRef<HTMLPreElement>(null);
  const [stackLogs, setStackLogs] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const res = await fetch("/api/stack", { cache: "no-store" });
        const d = (await res.json()) as { logs?: string[] };
        if (!cancelled) setStackLogs(d.logs ?? []);
      } catch {
        /* keep */
      }
    }
    void pull();
    const id = window.setInterval(() => void pull(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [logs, stackLogs]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header>
        <p className="text-xs font-medium tracking-widest text-subtle uppercase">Watchdog</p>
        <h1 className="font-display mt-1 text-2xl font-medium tracking-tight">日志</h1>
        <p className="mt-1 text-sm text-muted">探活记录，以及 xray / cloudflared 保活输出。</p>
      </header>
      <pre
        ref={preRef}
        className="h-96 overflow-auto rounded-lg border border-border bg-bg p-4 font-mono text-xs leading-relaxed text-ok"
      >
        {[
          ...logs.map((l) => `${formatTime(l.t)}  ${l.text}`),
          ...stackLogs.map((l) => l),
        ].join("\n") || "（暂无日志）"}
      </pre>
    </div>
  );
}
