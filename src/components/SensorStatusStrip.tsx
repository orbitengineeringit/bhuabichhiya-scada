import React, { useMemo } from 'react';
import { TagData } from '@/contexts/ScadaContext';

interface SensorStatusStripProps {
  tags: TagData[];
  sensorIds: string[];
  /** Optional label override per sensor id */
  labels?: Record<string, string>;
}

const isLive = (tag?: TagData): boolean => {
  if (!tag) return false;
  // Instant ON/OFF: rely solely on upstream tag.status, which useMqttTagSync
  // flips within ~1s of MQTT going silent. Zero values are still "live".
  return tag.status !== 'disconnected';
};

/**
 * Compact horizontal strip showing ON/OFF status for each listed sensor.
 * Green dot = MQTT data flowing, Red dot = no data.
 */
const SensorStatusStrip: React.FC<SensorStatusStripProps> = ({ tags, sensorIds, labels }) => {
  const items = useMemo(() => sensorIds.map(id => {
    const tag = tags.find(t => t.id === id);
    return { id, tag, live: isLive(tag), label: labels?.[id] ?? tag?.label ?? id };
  }), [tags, sensorIds, labels]);

  const liveCount = items.filter(i => i.live).length;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 px-2.5 py-2 rounded-lg bg-card/60 border border-border/60 backdrop-blur-sm mb-2">
      <div className="flex items-center gap-1.5 mr-1 shrink-0">
        <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
          Sensors
        </span>
        <span className="text-[9px] font-mono font-semibold text-muted-foreground/80 bg-muted/40 px-1.5 py-0.5 rounded">
          {liveCount}/{items.length}
        </span>
      </div>
      {items.map(({ id, live, label }) => (
        <span
          key={id}
          title={`${label} — ${live ? 'Receiving MQTT data' : 'No data'}`}
          className={`inline-flex items-center gap-1.5 pl-1.5 pr-0.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-mono font-semibold border whitespace-nowrap ${
            live
              ? 'bg-success/10 text-success border-success/30'
              : 'bg-destructive/10 text-destructive border-destructive/30'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${live ? 'bg-success pulse-live' : 'bg-destructive animate-pulse'}`}
          />
          <span className="leading-none">{id}</span>
          <span
            className={`leading-none text-[8px] sm:text-[9px] font-bold px-1 py-0.5 rounded ${
              live
                ? 'bg-success/20 text-success'
                : 'bg-destructive/20 text-destructive'
            }`}
          >
            {live ? 'ON' : 'OFF'}
          </span>
        </span>
      ))}
    </div>
  );
};

export default SensorStatusStrip;