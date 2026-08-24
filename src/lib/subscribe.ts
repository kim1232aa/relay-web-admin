import { STACK_UUID } from "./seed";
import { buildClashYaml, buildSingbox, buildV2rayLinks } from "./nodes";
import { liveExitSlots } from "./tunnel.server";

export const SUB_TOKEN = "7e4c91ab2d08f3c6";
export const SUB_PATH = `/sub-${SUB_TOKEN}`;

export function hostFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host");
  const raw = (forwarded?.split(",")[0] ?? request.headers.get("host") ?? "relay.local").trim();
  return raw;
}

export function publicHostname(hostWithPort: string): string {
  return hostWithPort.replace(/:\d+$/, "");
}

export function clashBody(host: string): string {
  return buildClashYaml(publicHostname(host), STACK_UUID, SUB_PATH, liveExitSlots());
}

export function v2rayBody(host: string): string {
  return buildV2rayLinks(publicHostname(host), STACK_UUID, liveExitSlots());
}

export function singboxBody(host: string): string {
  return buildSingbox(publicHostname(host), STACK_UUID, liveExitSlots());
}

export function clashHeaders(): HeadersInit {
  return {
    "content-type": "text/yaml; charset=utf-8",
    "cache-control": "no-store",
    "profile-update-interval": "24",
    "profile-title": "Relay",
    "subscription-userinfo": "upload=0; download=0; total=107374182400; expire=0",
  };
}
