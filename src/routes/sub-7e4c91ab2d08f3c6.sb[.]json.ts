import { createFileRoute } from "@tanstack/react-router";
import { hostFromRequest, publicHostname, singboxBody } from "@/lib/subscribe";
import { liveExitSlots, tunnelHostname } from "@/lib/tunnel.server";

export const Route = createFileRoute("/sub-7e4c91ab2d08f3c6/sb.json")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const host = tunnelHostname() || publicHostname(hostFromRequest(request));
        return new Response(singboxBody(host, liveExitSlots()), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
