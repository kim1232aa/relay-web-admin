import { createFileRoute } from "@tanstack/react-router";
import { restartStack, stackStatus, tickleStack, writeTunnelAuth } from "@/lib/tunnel.server";

export const Route = createFileRoute("/api/stack")({
  server: {
    handlers: {
      GET: () => Response.json(stackStatus()),
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          token?: string;
          host?: string;
          restart?: boolean;
          tickle?: boolean;
        };
        if (body.tickle) {
          const tickle = await tickleStack();
          return Response.json({ ...stackStatus(), tickle });
        }
        if (body.token || body.host) writeTunnelAuth(body.token, body.host);
        if (body.restart || body.token || body.host) restartStack();
        return Response.json({ ok: true, ...stackStatus() });
      },
    },
  },
});
