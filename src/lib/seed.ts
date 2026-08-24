import { DIRECT_ID, type Exit, type LogLine, type Settings } from "./types";
import { buildClashYaml, catalog, vlessLinkFor } from "./nodes";

export const STACK_UUID = "a3f1c8e2-9b47-4d6a-8e21-c5f90b3d7a14";

export function makeSettings(): Settings {
  return {
    publicHost: "relay.local",
    intervalSec: 8,
    keepalive: true,
    subPath: "/sub-7e4c91ab2d08f3c6",
  };
}

export function makeExits(): Exit[] {
  return [
    { id: DIRECT_ID, label: "直连", url: "", status: "ok", kind: "direct" },
    { id: "hk1", label: "HK-1", url: "socks5://exit:k7m2@203.0.113.10:1080", status: "ok", kind: "socks5" },
    { id: "sg2", label: "SG-2", url: "http://exit:n9q4@198.51.100.22:8080", status: "ok", kind: "http" },
    { id: "01", label: "JP住宅·NTT", url: "socks5://res:t3w8@203.0.113.88:1080", status: "ok", kind: "socks5" },
    { id: "02", label: "JP住宅·KDDI", url: "socks5://res:u4x1@203.0.113.91:1080", status: "ok", kind: "socks5" },
    { id: "03", label: "KR住宅·KT", url: "socks5://res:v5y2@198.51.100.40:1080", status: "ok", kind: "socks5" },
    { id: "04", label: "TW住宅·CHT", url: "http://res:w6z3@198.51.100.55:8080", status: "ok", kind: "http" },
    { id: "05", label: "HK住宅·HGC", url: "socks5://res:a1b2@203.0.113.44:1080", status: "ok", kind: "socks5" },
    { id: "06", label: "SG住宅·Singtel", url: "socks5://res:c3d4@198.51.100.61:1080", status: "ok", kind: "socks5" },
    { id: "07", label: "US住宅·Comcast", url: "socks5://res:x7a4@203.0.113.120:1080", status: "ok", kind: "socks5" },
    { id: "08", label: "JP机房·AWS", url: "socks5://dc:y8b5@198.51.100.80:1080", status: "down", kind: "socks5" },
  ];
}

export function makeLogs(now: number, host: string, exitLabel: string): LogLine[] {
  const lines = [
    `[node] relay inbound  /vless  host=${host}`,
    `[sub] ${catalog(host).length} nodes published`,
    `[exit] ${exitLabel} active`,
    `[watchdog] interval=8s  keepalive=on`,
    `[probe] GET /vless  200  16ms  via ${exitLabel}`,
  ];
  return lines.map((text, i) => ({
    t: now - (lines.length - i) * 8000,
    text,
  }));
}

export function vlessLink(host: string, uuid: string): string {
  const node = catalog(host)[0];
  return vlessLinkFor(host, uuid, node);
}

export function clashYaml(host: string, uuid: string, _exits: Exit[], subPath: string): string {
  return buildClashYaml(host, uuid, subPath);
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function maskUrl(url: string): string {
  if (!url) return "—";
  return url.replace(/\/\/([^/@:]+):([^@]+)@/, "//$1:••••@");
}

export function randomId(len = 8): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export function kindOfUrl(url: string): "socks5" | "http" {
  return url.startsWith("socks5://") ? "socks5" : "http";
}
