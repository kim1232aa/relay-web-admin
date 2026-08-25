import { createFileRoute } from "@tanstack/react-router";
import { hostFromRequest, publicHostname, v2rayBody } from "@/lib/subscribe";
import { liveExitSlots, tunnelHostname } from "@/lib/tunnel.server";

export const Route = createFileRoute("/sub-7e4c91ab2d08f3c6/links")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const host = tunnelHostname() || publicHostname(hostFromRequest(request));
        return new Response(v2rayBody(host, liveExitSlots()), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
