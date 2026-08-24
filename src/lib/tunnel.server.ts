import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { counts, type LiveExit } from "./nodes";

const HOST_FILE = "/workspace/proxy-bin/cf-hostname";
const TOKEN_FILE = "/workspace/proxy-bin/cf-tunnel-token";

function pidAlive(file: string): boolean {
  try {
    if (!existsSync(file)) return false;
    const pid = Number(readFileSync(file, "utf8").trim());
    if (!Number.isFinite(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tailFile(file: string, max = 24): string[] {
  try {
    if (!existsSync(file)) return [];
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    return lines.slice(-max);
  } catch {
    return [];
  }
}

export function tunnelHostname(): string | null {
  try {
    if (!existsSync(HOST_FILE)) return null;
    const host = readFileSync(HOST_FILE, "utf8").trim();
    return host || null;
  } catch {
    return null;
  }
}

export function hasTunnelToken(): boolean {
  try {
    return existsSync(TOKEN_FILE) && readFileSync(TOKEN_FILE, "utf8").trim().length > 0;
  } catch {
    return false;
  }
}

export function writeTunnelAuth(token?: string, host?: string) {
  if (typeof token === "string") {
    writeFileSync(TOKEN_FILE, token.trim() + "\n");
  }
  if (typeof host === "string" && host.trim()) {
    const h = host.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    writeFileSync(HOST_FILE, h + "\n");
  }
}

export function restartStack() {
  spawn("bash", ["/workspace/proxy-bin/start.sh"], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

export function liveExitSlots(): LiveExit[] {
  const rows: LiveExit[] = [];
  for (const file of ["/workspace/proxy-bin/slots.json", "/workspace/proxy-bin/ovpn.json"]) {
    try {
      if (!existsSync(file)) continue;
      const parsed = JSON.parse(readFileSync(file, "utf8")) as { slots?: LiveExit[] };
      rows.push(...(parsed.slots ?? []));
    } catch {
      /* ignore */
    }
  }
  return rows;
}

export function stackStatus() {
  const host = tunnelHostname();
  const procs = {
    xray: pidAlive("/workspace/proxy-bin/xray.pid"),
    mux: pidAlive("/workspace/proxy-bin/mux.pid"),
    cloudflared: pidAlive("/workspace/proxy-bin/cloudflared.pid"),
    supervise: pidAlive("/workspace/proxy-bin/supervise.pid"),
    slots: pidAlive("/workspace/proxy-bin/slots.pid"),
  };
  const live = procs.xray && procs.mux && procs.cloudflared;
  const slots = liveExitSlots();
  return {
    host,
    token: hasTunnelToken(),
    uuid: "a3f1c8e2-9b47-4d6a-8e21-c5f90b3d7a14",
    procs,
    live,
    egress: "this-host",
    slots,
    counts: counts(host || "relay.local", slots),
    logs: [
      ...tailFile("/workspace/proxy-bin/supervise.log", 12),
      ...tailFile("/workspace/proxy-bin/cf.log", 8),
    ].slice(-20),
  };
}
