import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/vless")({
  component: VlessHealth,
});

function VlessHealth() {
  return (
    <main className="min-h-dvh bg-bg px-6 py-10 font-mono text-sm text-ok">
      ok
    </main>
  );
}
