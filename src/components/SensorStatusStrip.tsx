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
  if (tag.status === 'disconnected') return false;
  if (tag.lastDataTime) {
    const elapsed = Date.now() - new Date(tag.lastDataTime).getTime();
    return elapsed <= 30000;
  }
  return tag.source === 'mqtt';
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

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-lg bg-card/60 border border-border/60 backdrop-blur-sm mb-2">
      <span className="text-[9px] font-bold text-muted-foreground tracking-wider uppercase mr-1">Sensors:</span>
      {items.map(({ id, live, label }) => (
        <span
          key={id}
          title={`${label} — ${live ? 'Receiving MQTT data' : 'No data'}`}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-semibold border ${
            live
              ? 'bg-success/10 text-success border-success/30'
              : 'bg-destructive/10 text-destructive border-destructive/30'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-success pulse-live' : 'bg-destructive animate-pulse'}`}
          />
          {id}
          <span className={`ml-0.5 text-[8px] font-bold ${live ? 'text-success' : 'text-destructive'}`}>
            {live ? 'ON' : 'OFF'}
          </span>
        </span>
      ))}
    </div>
  );
};

export default SensorStatusStrip;