import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DEFAULT_PASSWORD,
  DIRECT_ID,
  LOGIN_LOCK_MS,
  LOGIN_MAX_ATTEMPTS,
  PROXY_SCHEMES,
  SESSION_TTL_MS,
  STORAGE_KEY,
  type Exit,
  type LogLine,
  type Session,
  type Settings,
  type ViewId,
} from "./types";
import {
  STACK_UUID,
  kindOfUrl,
  makeExits,
  makeLogs,
  makeSettings,
  randomId,
  vlessLink,
} from "./seed";

export interface AdminState {
  hydrated: boolean;
  view: ViewId;
  session: Session | null;
  failStamps: number[];
  password: string;
  exits: Exit[];
  currentExitId: string;
  logs: LogLine[];
  settings: Settings;
  uuid: string;
  lastProbeAt: number | null;
  lastLatency: number | null;
  latencies: number[];
  failoverBusy: boolean;
  watchdogStartedAt: number;
  probeCount: number;

  setHydrated: () => void;
  setView: (view: ViewId) => void;
  login: (password: string) => { ok: true } | { ok: false; error: string };
  logout: () => void;
  isAuthed: () => boolean;
  addExit: (label: string, url: string) => { ok: true } | { ok: false; error: string };
  deleteExit: (id: string) => { ok: true } | { ok: false; error: string };
  toggleExit: (id: string) => void;
  selectExit: (id: string) => void;
  appendLog: (text: string) => void;
  currentExit: () => Exit | undefined;
  recordProbe: (ms: number, ok: boolean) => void;
  requestFailover: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  changePassword: (current: string, next: string) => { ok: true } | { ok: false; error: string };
  resetDemo: () => void;
}

function seedNow(now = Date.now()) {
  const settings = makeSettings();
  const exits = makeExits();
  const currentExitId = "hk1";
  return {
    view: "overview" as ViewId,
    session: null as Session | null,
    failStamps: [] as number[],
    password: DEFAULT_PASSWORD,
    exits,
    currentExitId,
    logs: [] as ReturnType<typeof makeLogs>,
    settings,
    uuid: STACK_UUID,
    lastProbeAt: null as number | null,
    lastLatency: null as number | null,
    latencies: [] as number[],
    failoverBusy: false,
    watchdogStartedAt: 0,
    probeCount: 0,
  };
}

function nextOkExit(exits: Exit[], currentId: string): Exit | null {
  const healthy = exits.filter((e) => e.status === "ok");
  if (healthy.length === 0) return null;
  const idx = healthy.findIndex((e) => e.id === currentId);
  return healthy[(idx + 1) % healthy.length] ?? healthy[0];
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      ...seedNow(),

      setHydrated: () => set({ hydrated: true }),
      setView: (view) => set({ view }),

      isAuthed: () => {
        const s = get().session;
        if (!s) return false;
        return Date.now() - s.issuedAt < SESSION_TTL_MS;
      },

      login: (password) => {
        const now = Date.now();
        const recent = get().failStamps.filter((t) => now - t < LOGIN_LOCK_MS);
        if (recent.length >= LOGIN_MAX_ATTEMPTS) {
          return { ok: false, error: "尝试过多，请稍后再试" };
        }
        if (password !== get().password) {
          set({ failStamps: [...recent, now] });
          return { ok: false, error: "密码错误" };
        }
        set({ session: { issuedAt: now }, failStamps: [] });
        return { ok: true };
      },

      logout: () => set({ session: null, view: "overview" }),

      currentExit: () => get().exits.find((e) => e.id === get().currentExitId),

      addExit: (label, url) => {
        const l = label.trim();
        const u = url.trim();
        if (!l) return { ok: false, error: "标签不能为空" };
        if (!PROXY_SCHEMES.some((s) => u.startsWith(s))) {
          return { ok: false, error: "URL 需以 http://、https:// 或 socks5:// 开头" };
        }
        const entry: Exit = {
          id: randomId(),
          label: l,
          url: u,
          status: "ok",
          kind: kindOfUrl(u),
        };
        set((s) => ({ exits: [...s.exits, entry] }));
        get().appendLog(`[exit] added ${l}`);
        return { ok: true };
      },

      deleteExit: (id) => {
        if (id === DIRECT_ID) return { ok: false, error: "直连不能删除" };
        const s = get();
        const target = s.exits.find((e) => e.id === id);
        if (!target) return { ok: false, error: "未找到" };
        const nextId = s.currentExitId === id ? DIRECT_ID : s.currentExitId;
        set({
          exits: s.exits.filter((e) => e.id !== id),
          currentExitId: nextId,
        });
        get().appendLog(`[exit] removed ${target.label}`);
        return { ok: true };
      },

      toggleExit: (id) => {
        if (id === DIRECT_ID) return;
        const target = get().exits.find((e) => e.id === id);
        if (!target) return;
        const next: Exit["status"] = target.status === "ok" ? "down" : "ok";
        set((s) => ({
          exits: s.exits.map((e) => (e.id === id ? { ...e, status: next } : e)),
        }));
        get().appendLog(`[exit] ${target.label}  ${next}`);
        if (next === "down" && get().currentExitId === id) {
          get().requestFailover();
        }
      },

      selectExit: (id) => {
        const e = get().exits.find((x) => x.id === id);
        if (!e || e.status !== "ok") return;
        set({ currentExitId: id });
        get().appendLog(`[exit] ${e.label} active`);
      },

      appendLog: (text) => {
        const line: LogLine = { t: Date.now(), text };
        set((s) => ({ logs: [...s.logs, line].slice(-400) }));
      },

      recordProbe: (ms, ok) => {
        const s = get();
        if (s.failoverBusy) return;
        const via = s.exits.find((e) => e.id === s.currentExitId)?.label ?? "直连";
        if (!ok) {
          get().appendLog(`[probe] GET /vless  FAIL  ${ms}ms  via ${via}`);
          set((st) => ({
            lastProbeAt: Date.now(),
            lastLatency: ms,
            latencies: [...st.latencies, ms].slice(-24),
            probeCount: st.probeCount + 1,
          }));
          get().requestFailover();
          return;
        }
        get().appendLog(`[probe] GET /vless  200  ${ms}ms  via ${via}`);
        set((st) => ({
          lastProbeAt: Date.now(),
          lastLatency: ms,
          latencies: [...st.latencies, ms].slice(-24),
          probeCount: st.probeCount + 1,
        }));
        if (s.settings.keepalive && Math.random() < 0.22) {
          get().appendLog("[keepalive] tickle ok");
        }
      },

      requestFailover: () => {
        if (get().failoverBusy) return;
        const currentId = get().currentExitId;
        const next = nextOkExit(get().exits, currentId);
        set({ failoverBusy: true });
        get().appendLog("[force] failover requested");
        if (!next || next.id === currentId) {
          get().appendLog("[rotate] no other healthy exit");
          set({ failoverBusy: false });
          return;
        }
        const skipped = get().exits.filter(
          (e) => e.id !== currentId && e.id !== next.id && e.status !== "ok",
        );
        const leaving = get().exits.find((e) => e.id === currentId);
        window.setTimeout(() => {
          if (leaving) get().appendLog(`[rotate] leaving ${leaving.label}`);
          for (const sk of skipped) {
            get().appendLog(`[rotate] skip ${sk.label}: down`);
          }
        }, 350);
        window.setTimeout(() => {
          get().appendLog(`[exit] switching outbound → ${next.label}`);
        }, 900);
        window.setTimeout(() => {
          set((st) => ({
            currentExitId: next.id,
            failoverBusy: false,
            lastProbeAt: Date.now(),
            probeCount: st.probeCount + 1,
          }));
          get().appendLog(`[exit] ${next.label} active`);
        }, 1600);
      },

      updateSettings: (patch) => {
        set((s) => ({ settings: { ...s.settings, ...patch } }));
      },

      changePassword: (current, next) => {
        if (current !== get().password) return { ok: false, error: "当前密码不正确" };
        if (next.length < 4) return { ok: false, error: "新密码至少 4 位" };
        set({ password: next });
        return { ok: true };
      },

      resetDemo: () => {
        const now = Date.now();
        const label = "HK-1";
        const seeded = seedNow(now);
        set({
          ...seeded,
          session: get().session,
          hydrated: true,
          watchdogStartedAt: now,
          logs: makeLogs(now, seeded.settings.publicHost, label),
        });
        get().appendLog("[admin] node restored");
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        session: s.session,
        failStamps: s.failStamps,
        password: s.password,
        exits: s.exits,
        currentExitId: s.currentExitId,
        logs: s.logs.slice(-200),
        settings: s.settings,
        uuid: s.uuid,
        lastProbeAt: s.lastProbeAt,
        lastLatency: s.lastLatency,
        latencies: s.latencies,
        watchdogStartedAt: s.watchdogStartedAt,
        probeCount: s.probeCount,
        view: s.view,
      }),
    },
  ),
);

export function selectProxyLink(): string {
  const s = useAdminStore.getState();
  return vlessLink(s.settings.publicHost, s.uuid);
}
