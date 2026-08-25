import { createFileRoute } from "@tanstack/react-router";
import { clashBody, clashHeaders, hostFromRequest, publicHostname } from "@/lib/subscribe";
import { liveExitSlots, tunnelHostname } from "@/lib/tunnel.server";

export const Route = createFileRoute("/sub-7e4c91ab2d08f3c6")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const host = tunnelHostname() || publicHostname(hostFromRequest(request));
        return new Response(clashBody(host, liveExitSlots()), { headers: clashHeaders() });
      },
    },
  },
});
