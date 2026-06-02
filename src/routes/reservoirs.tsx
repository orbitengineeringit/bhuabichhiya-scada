import { createFileRoute } from "@tanstack/react-router";
import { Droplets } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useTelemetry } from "@/contexts/TelemetryContext";

export const Route = createFileRoute("/reservoirs")({
  head: () => ({ meta: [{ title: "Reservoirs — HydroSCADA" }] }),
  component: ReservoirsPage,
});

function ReservoirsPage() {
  const { reservoirLevel } = useTelemetry();
  const tanks = [
    { name: "Reservoir 01 — North", capacity: 12000, level: reservoirLevel },
    { name: "Reservoir 02 — South", capacity: 8500, level: Math.max(20, reservoirLevel - 18) },
    { name: "Reservoir 03 — East", capacity: 15000, level: Math.min(98, reservoirLevel + 12) },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reservoirs</h1>
        <p className="text-sm text-muted-foreground">Live tank levels across the distribution network.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {tanks.map((t) => (
          <Card key={t.name} className="border-border/60 bg-card/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Droplets className="h-4 w-4 text-accent" />
                {t.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative mx-auto flex h-48 w-32 items-end overflow-hidden rounded-lg border border-border/60 bg-background/40">
                <div
                  className="w-full bg-gradient-to-t from-primary to-accent transition-all duration-700"
                  style={{ height: `${t.level}%` }}
                />
              </div>
              <div className="mt-4 flex justify-between text-xs">
                <span className="text-muted-foreground">Capacity</span>
                <span className="font-mono">{t.capacity.toLocaleString()} m³</span>
              </div>
              <div className="mt-2 flex justify-between text-xs">
                <span className="text-muted-foreground">Fill</span>
                <span className="font-mono">{t.level.toFixed(1)}%</span>
              </div>
              <Progress value={t.level} className="mt-3 h-1.5" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}