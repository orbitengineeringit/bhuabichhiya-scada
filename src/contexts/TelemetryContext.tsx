import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface TelemetryPoint {
  time: string;
  flow: number;
  pressure: number;
  level: number;
}

export interface PumpStatus {
  id: string;
  name: string;
  status: "running" | "idle" | "fault";
  rpm: number;
  power: number;
}

export interface Alarm {
  id: string;
  severity: "critical" | "warning" | "info";
  message: string;
  source: string;
  timestamp: string;
  acknowledged: boolean;
}

interface TelemetryState {
  history: TelemetryPoint[];
  current: TelemetryPoint;
  pumps: PumpStatus[];
  alarms: Alarm[];
  reservoirLevel: number;
  online: boolean;
}

const TelemetryContext = createContext<TelemetryState | null>(null);

const SEED: TelemetryPoint[] = Array.from({ length: 30 }, (_, i) => ({
  time: new Date(Date.now() - (29 - i) * 2000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }),
  flow: 420 + Math.sin(i / 3) * 40 + Math.random() * 20,
  pressure: 4.2 + Math.cos(i / 4) * 0.4 + Math.random() * 0.1,
  level: 72 + Math.sin(i / 5) * 6,
}));

const INITIAL_PUMPS: PumpStatus[] = [
  { id: "P-01", name: "Intake Pump A", status: "running", rpm: 1480, power: 132 },
  { id: "P-02", name: "Intake Pump B", status: "running", rpm: 1465, power: 128 },
  { id: "P-03", name: "Booster Pump", status: "idle", rpm: 0, power: 0 },
  { id: "P-04", name: "Backup Pump", status: "fault", rpm: 0, power: 0 },
];

const INITIAL_ALARMS: Alarm[] = [
  {
    id: "A-1042",
    severity: "critical",
    message: "Backup Pump P-04 motor overload",
    source: "P-04",
    timestamp: new Date(Date.now() - 1000 * 60 * 4).toLocaleTimeString(),
    acknowledged: false,
  },
  {
    id: "A-1041",
    severity: "warning",
    message: "Reservoir 2 level approaching low threshold",
    source: "RES-02",
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toLocaleTimeString(),
    acknowledged: false,
  },
  {
    id: "A-1040",
    severity: "info",
    message: "Scheduled maintenance window opened",
    source: "SYS",
    timestamp: new Date(Date.now() - 1000 * 60 * 32).toLocaleTimeString(),
    acknowledged: true,
  },
];

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<TelemetryPoint[]>(SEED);
  const [pumps, setPumps] = useState<PumpStatus[]>(INITIAL_PUMPS);
  const [reservoirLevel, setReservoirLevel] = useState(73);

  useEffect(() => {
    const id = setInterval(() => {
      setHistory((prev) => {
        const last = prev[prev.length - 1];
        const next: TelemetryPoint = {
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          flow: Math.max(300, Math.min(560, last.flow + (Math.random() - 0.5) * 25)),
          pressure: Math.max(3, Math.min(5.5, last.pressure + (Math.random() - 0.5) * 0.15)),
          level: Math.max(40, Math.min(95, last.level + (Math.random() - 0.5) * 1.2)),
        };
        return [...prev.slice(-29), next];
      });
      setPumps((prev) =>
        prev.map((p) =>
          p.status === "running"
            ? { ...p, rpm: Math.round(1450 + Math.random() * 50), power: Math.round(125 + Math.random() * 15) }
            : p,
        ),
      );
      setReservoirLevel((l) => Math.max(40, Math.min(95, l + (Math.random() - 0.5) * 1.5)));
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const current = history[history.length - 1];

  return (
    <TelemetryContext.Provider
      value={{
        history,
        current,
        pumps,
        alarms: INITIAL_ALARMS,
        reservoirLevel,
        online: true,
      }}
    >
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetry() {
  const ctx = useContext(TelemetryContext);
  if (!ctx) throw new Error("useTelemetry must be used within TelemetryProvider");
  return ctx;
}