import { Badge } from "@/components/ui/badge";
import type { ExitStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: ExitStatus }) {
  if (status === "ok") return <Badge variant="ok">正常</Badge>;
  return <Badge variant="danger">故障</Badge>;
}

export function LiveDot({ on }: { on: boolean }) {
  return (
    <span className="relative inline-flex size-2">
      {on ? <span className="live-ping absolute inset-0 rounded-full bg-live" /> : null}
      <span className={`relative inline-flex size-2 rounded-full ${on ? "bg-live" : "bg-subtle"}`} />
    </span>
  );
}
