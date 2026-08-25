import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { counts, type LiveExit } from "./nodes";

const BIN = process.env.PROXY_BIN || join(process.cwd(), "proxy-bin");
const HOST_FILE = join(BIN, "cf-hostname");
const TOKEN_FILE = join(BIN, "cf-tunnel-token");

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
  spawn("bash", [join(BIN, "start.sh")], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

async function httpOk(url: string, ms: number): Promise<boolean> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { method: "GET", signal: ac.signal, cache: "no-store" });
    return res.ok || res.status === 426 || res.status === 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let tickleFails = 0;

export async function tickleStack() {
  const host = tunnelHostname();
  const local = await httpOk("http://127.0.0.1:38079/vless", 4000);
  const tunnel = host ? await httpOk(`https://${host}/vless`, 8000) : false;
  const bad = !local || Boolean(host && !tunnel);
  tickleFails = bad ? tickleFails + 1 : 0;
  const restarted = tickleFails >= 3;
  if (restarted) tickleFails = 0;
  const row = {
    at: new Date().toISOString(),
    local,
    tunnel,
    host,
    restarted,
  };
  try {
    writeFileSync(join(BIN, "heartbeat.json"), JSON.stringify(row) + "\n");
  } catch {
    /* ignore */
  }
  try {
    const line = `${row.at} tickle local=${local} tunnel=${tunnel} host=${host || "-"} restarted=${restarted}\n`;
    writeFileSync(join(BIN, "supervise.log"), line, { flag: "a" });
  } catch {
    /* ignore */
  }
  if (restarted) restartStack();
  return row;
}

export function liveExitSlots(): LiveExit[] {
  const rows: LiveExit[] = [];
  for (const file of [join(BIN, "slots.json"), join(BIN, "ovpn.json")]) {
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
    xray: pidAlive(join(BIN, "xray.pid")),
    mux: pidAlive(join(BIN, "mux.pid")),
    cloudflared: pidAlive(join(BIN, "cloudflared.pid")),
    supervise: pidAlive(join(BIN, "supervise.pid")),
    slots: pidAlive(join(BIN, "slots.pid")),
    ovpn: pidAlive(join(BIN, "ovpn-slots.pid")),
  };
  let heartbeat: { at?: string; local?: boolean; tunnel?: boolean } | null = null;
  try {
    if (existsSync(join(BIN, "heartbeat.json"))) {
      heartbeat = JSON.parse(readFileSync(join(BIN, "heartbeat.json"), "utf8")) as {
        at?: string;
        local?: boolean;
        tunnel?: boolean;
      };
    }
  } catch {
    heartbeat = null;
  }
  const live = procs.xray && procs.mux && procs.cloudflared;
  const slots = liveExitSlots();
  return {
    host,
    token: hasTunnelToken(),
    uuid: "a3f1c8e2-9b47-4d6a-8e21-c5f90b3d7a14",
    procs,
    live,
    heartbeat,
    egress: "this-host",
    slots,
    counts: counts(host || "relay.local", slots),
    logs: [
      ...tailFile(join(BIN, "supervise.log"), 12),
      ...tailFile(join(BIN, "cf.log"), 8),
    ].slice(-20),
  };
}
