import { createFileRoute } from "@tanstack/react-router";
import { restartStack, stackStatus, writeTunnelAuth } from "@/lib/tunnel.server";

export const Route = createFileRoute("/api/stack")({
  server: {
    handlers: {
      GET: () => Response.json(stackStatus()),
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          token?: string;
          host?: string;
          restart?: boolean;
        };
        if (!body.restart) writeTunnelAuth(body.token, body.host);
        restartStack();
        return Response.json({ ok: true });
      },
    },
  },
});
