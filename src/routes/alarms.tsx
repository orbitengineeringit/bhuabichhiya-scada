import { createFileRoute } from "@tanstack/react-router";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTelemetry } from "@/contexts/TelemetryContext";

export const Route = createFileRoute("/alarms")({
  head: () => ({ meta: [{ title: "Alarms — HydroSCADA" }] }),
  component: AlarmsPage,
});

function AlarmsPage() {
  const { alarms } = useTelemetry();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alarm Log</h1>
        <p className="text-sm text-muted-foreground">Active and historical alarm events.</p>
      </div>
      <Card className="border-border/60 bg-card/60">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Severity</th>
                <th className="px-4 py-3 text-left">Message</th>
                <th className="px-4 py-3 text-left">Source</th>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">State</th>
              </tr>
            </thead>
            <tbody>
              {alarms.map((a) => (
                <tr key={a.id} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{a.id}</td>
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3">{a.message}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.source}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.timestamp}</td>
                  <td className="px-4 py-3 text-xs">
                    {a.acknowledged ? (
                      <span className="text-muted-foreground">Acknowledged</span>
                    ) : (
                      <span className="text-[color:var(--color-warning)]">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}