import { createFileRoute } from "@tanstack/react-router";
import { Activity, Droplets, Gauge, Waves, Zap } from "lucide-react";

import { MetricCard } from "@/components/MetricCard";
import { TrendChart } from "@/components/TrendChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useTelemetry } from "@/contexts/TelemetryContext";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — HydroSCADA" },
      { name: "description", content: "Real-time SCADA dashboard for water supply operations." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { current, history, pumps, reservoirLevel, alarms } = useTelemetry();
  const runningPumps = pumps.filter((p) => p.status === "running").length;
  const totalPower = pumps.reduce((s, p) => s + p.power, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System Overview</h1>
          <p className="text-sm text-muted-foreground">
            Live telemetry from Plant 01 — refreshed every 2 seconds.
          </p>
        </div>
        <Badge variant="secondary" className="font-mono">SCAN CYCLE · 2.0s</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Flow Rate"
          value={current.flow.toFixed(0)}
          unit="m³/h"
          delta={2.4}
          icon={Waves}
          tone="primary"
        />
        <MetricCard
          label="Line Pressure"
          value={current.pressure.toFixed(2)}
          unit="bar"
          delta={-0.8}
          icon={Gauge}
          tone="accent"
        />
        <MetricCard
          label="Reservoir Level"
          value={reservoirLevel.toFixed(1)}
          unit="%"
          delta={1.1}
          icon={Droplets}
          tone="success"
        />
        <MetricCard
          label="Total Draw"
          value={totalPower.toFixed(0)}
          unit="kW"
          delta={0.4}
          icon={Zap}
          tone="warning"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TrendChart
          title="Flow Rate"
          description="Distribution main — last 60s"
          data={history}
          dataKey="flow"
          color="var(--color-chart-1)"
          unit=" m³/h"
        />
        <TrendChart
          title="Pressure"
          description="Line pressure trend"
          data={history}
          dataKey="pressure"
          color="var(--color-chart-2)"
          unit=" bar"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/60 bg-card/60 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm font-semibold">
              Pump Status
              <span className="text-xs font-normal text-muted-foreground">
                {runningPumps}/{pumps.length} running
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pumps.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 p-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={
                      "h-2.5 w-2.5 rounded-full " +
                      (p.status === "running"
                        ? "bg-[color:var(--color-success)] shadow-[0_0_10px_var(--color-success)]"
                        : p.status === "fault"
                          ? "bg-destructive animate-pulse"
                          : "bg-muted-foreground/40")
                    }
                  />
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.id}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6 font-mono text-xs text-muted-foreground">
                  <span>{p.rpm} rpm</span>
                  <span>{p.power} kW</span>
                  <Badge
                    variant="outline"
                    className={
                      p.status === "running"
                        ? "border-[color:var(--color-success)]/40 text-[color:var(--color-success)]"
                        : p.status === "fault"
                          ? "border-destructive/40 text-destructive"
                          : "border-border text-muted-foreground"
                    }
                  >
                    {p.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-accent" /> Recent Alarms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alarms.map((a) => (
              <div key={a.id} className="rounded-md border border-border/60 bg-background/40 p-3">
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className={
                      a.severity === "critical"
                        ? "border-destructive/40 text-destructive"
                        : a.severity === "warning"
                          ? "border-[color:var(--color-warning)]/40 text-[color:var(--color-warning)]"
                          : "border-border text-muted-foreground"
                    }
                  >
                    {a.severity.toUpperCase()}
                  </Badge>
                  <span className="font-mono text-[10px] text-muted-foreground">{a.timestamp}</span>
                </div>
                <div className="mt-2 text-sm">{a.message}</div>
                <div className="mt-1 text-xs text-muted-foreground">Source: {a.source}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/60">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Reservoir Capacity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { name: "Reservoir 01 — North", level: reservoirLevel },
            { name: "Reservoir 02 — South", level: Math.max(20, reservoirLevel - 18) },
            { name: "Reservoir 03 — East", level: Math.min(98, reservoirLevel + 12) },
          ].map((r) => (
            <div key={r.name}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{r.name}</span>
                <span className="font-mono text-muted-foreground">{r.level.toFixed(1)}%</span>
              </div>
              <Progress value={r.level} className="mt-1.5 h-2" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
