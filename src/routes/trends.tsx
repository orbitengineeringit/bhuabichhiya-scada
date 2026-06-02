import { createFileRoute } from "@tanstack/react-router";

import { TrendChart } from "@/components/TrendChart";
import { useTelemetry } from "@/contexts/TelemetryContext";

export const Route = createFileRoute("/trends")({
  head: () => ({ meta: [{ title: "Trends — HydroSCADA" }] }),
  component: TrendsPage,
});

function TrendsPage() {
  const { history } = useTelemetry();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trend Analysis</h1>
        <p className="text-sm text-muted-foreground">Historic telemetry for operational review.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TrendChart title="Flow Rate" data={history} dataKey="flow" color="var(--color-chart-1)" unit=" m³/h" />
        <TrendChart title="Pressure" data={history} dataKey="pressure" color="var(--color-chart-2)" unit=" bar" />
        <TrendChart title="Reservoir Level" data={history} dataKey="level" color="var(--color-chart-3)" unit=" %" domain={[0, 100]} />
      </div>
    </div>
  );
}