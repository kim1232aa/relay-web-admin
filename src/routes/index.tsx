import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AppShell } from "@/components/app-shell";
import { WatchdogEngine } from "@/components/watchdog-engine";
import { ExitsView } from "@/components/views/exits";
import { LogsView } from "@/components/views/logs";
import { Overview } from "@/components/views/overview";
import { SettingsView } from "@/components/views/settings";
import { useAdminStore } from "@/lib/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const view = useAdminStore((s) => s.view);

  useEffect(() => {
    void (async () => {
      await useAdminStore.persist.rehydrate();
      const store = useAdminStore.getState();
      if (store.settings.publicHost === "relay.local") {
        store.updateSettings({ publicHost: "groktun.alibb123.ccwu.cc" });
      }
      if (!store.watchdogStartedAt) {
        useAdminStore.setState({ watchdogStartedAt: Date.now() });
      }
      store.setHydrated();
    })();
  }, []);

  return (
    <>
      <WatchdogEngine />
      <AppShell>
        {view === "overview" ? <Overview /> : null}
        {view === "exits" ? <ExitsView /> : null}
        {view === "logs" ? <LogsView /> : null}
        {view === "settings" ? <SettingsView /> : null}
      </AppShell>
      <Toaster
        theme="dark"
        position="bottom-center"
        toastOptions={{ className: "font-sans text-sm" }}
      />
    </>
  );
}
