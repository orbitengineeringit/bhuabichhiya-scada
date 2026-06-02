import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  delta?: number;
  icon: LucideIcon;
  tone?: "primary" | "accent" | "success" | "warning" | "destructive";
}

const toneMap: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  primary: "text-primary bg-primary/10 ring-primary/30",
  accent: "text-accent bg-accent/10 ring-accent/30",
  success: "text-[color:var(--color-success)] bg-[color:var(--color-success)]/10 ring-[color:var(--color-success)]/30",
  warning: "text-[color:var(--color-warning)] bg-[color:var(--color-warning)]/10 ring-[color:var(--color-warning)]/30",
  destructive: "text-destructive bg-destructive/10 ring-destructive/30",
};

export function MetricCard({ label, value, unit, delta, icon: Icon, tone = "primary" }: MetricCardProps) {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className="relative overflow-hidden border-border/60 bg-card/60">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-mono text-3xl font-semibold tabular-nums">{value}</span>
              {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
            </div>
            {delta !== undefined && (
              <div
                className={cn(
                  "mt-2 inline-flex items-center gap-1 text-xs font-medium",
                  positive ? "text-[color:var(--color-success)]" : "text-destructive",
                )}
              >
                {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(delta).toFixed(1)}% vs 1h
              </div>
            )}
          </div>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg ring-1", toneMap[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      </CardContent>
    </Card>
  );
}