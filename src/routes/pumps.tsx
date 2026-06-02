import { createFileRoute } from "@tanstack/react-router";
import { Gauge } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTelemetry } from "@/contexts/TelemetryContext";

export const Route = createFileRoute("/pumps")({
  head: () => ({ meta: [{ title: "Pumps — HydroSCADA" }] }),
  component: PumpsPage,
});

function PumpsPage() {
  const { pumps } = useTelemetry();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pump Stations</h1>
        <p className="text-sm text-muted-foreground">Status and runtime metrics for all pump assets.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pumps.map((p) => (
          <Card key={p.id} className="border-border/60 bg-card/60">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Gauge className="h-4 w-4 text-primary" /> {p.name}
              </CardTitle>
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
            </CardHeader>
            <CardContent>
              <div className="font-mono text-xs text-muted-foreground">{p.id}</div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">RPM</div>
                  <div className="font-mono text-2xl">{p.rpm}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Power</div>
                  <div className="font-mono text-2xl">
                    {p.power}
                    <span className="ml-1 text-xs text-muted-foreground">kW</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}