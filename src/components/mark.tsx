import { Waypoints } from "lucide-react";

export function Mark() {
  return (
    <span className="flex size-9 items-center justify-center rounded-sm border border-border bg-elevated text-fg">
      <Waypoints className="size-4" strokeWidth={1.75} />
    </span>
  );
}
