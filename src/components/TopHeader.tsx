import { Bell, CircleDot, RadioTower } from "lucide-react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useClock } from "@/hooks/use-clock";
import { useTelemetry } from "@/contexts/TelemetryContext";

export function TopHeader() {
  const now = useClock();
  const { online, alarms } = useTelemetry();
  const unack = alarms.filter((a) => !a.acknowledged).length;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <div className="flex items-center gap-2">
        <RadioTower className="h-4 w-4 text-accent" />
        <span className="text-sm font-medium">Plant 01 — Northridge</span>
      </div>
      <div className="ml-auto flex items-center gap-4">
        <div className="hidden font-mono text-xs text-muted-foreground sm:block">
          {now.toLocaleDateString()} · {now.toLocaleTimeString()}
        </div>
        <Badge
          variant="outline"
          className="gap-1.5 border-[color:var(--color-success)]/40 text-[color:var(--color-success)]"
        >
          <CircleDot className="h-3 w-3 animate-pulse" />
          {online ? "LIVE" : "OFFLINE"}
        </Badge>
        <button className="relative rounded-md p-2 hover:bg-muted">
          <Bell className="h-4 w-4" />
          {unack > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unack}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}