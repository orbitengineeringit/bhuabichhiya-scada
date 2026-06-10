import { useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { MqttMessage } from '@/contexts/MqttContext';
import type { TagData } from '@/contexts/ScadaContext';
import { toast } from 'sonner';
import { useAlarm } from '@/contexts/AlarmContext';
import { logError, logDebug, logWarn, logInfo } from '@/lib/errorLogger';
import {
  ALL_OHT_SENSORS, INTAKE_SENSORS, WTP_SENSORS, ALL_SENSORS,
  VALID_OHT_KEYS, VALID_INTAKE_KEYS, VALID_WTP_KEYS,
  BuaBicchiyaSensor, PT_TO_PUMP_MAP,
} from '@/config/buaBicchiyaSensors';

interface TagUpdate {
  tagId: string;
  value: number;
  section: 'oht' | 'intake' | 'wtp';
  topic: string;
  reason?: 'interval' | 'abnormal' | 'alarm' | 'state_change';
}

// Instant ON/OFF: flip to disconnected as soon as MQTT stops delivering.
// Typical SCADA publish cadence is 1-2s, so a 3s grace avoids false-OFF
// while keeping the visible flip near-instant.
const DISCONNECT_TIMEOUT_MS = 3000;
// Historian persistence policy:
//  - Normal data: save every 5 minutes per tag (keeps DB small)
//  - Abnormal fluctuation: save immediately if value changes > ABNORMAL_DELTA_PCT of range since last save
//  - Alarm crossing: save immediately if value crosses high/low setpoint
//  - Digital state change (pump on/off): save immediately
const SAVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ABNORMAL_DELTA_PCT = 0.12;        // 12% of sensor range
const FLUSH_INTERVAL_MS = 30 * 1000;    // batch-write queue to DB every 30s

/**
 * Process-engineering safety bands per instrument type.
 * Independent of operator-configured setpoints (which may be wrong/missing).
 * If a reading falls OUTSIDE these bands → definitely abnormal → save immediately.
 * Returns true when the value is in the abnormal/unsafe zone.
 */
const isAbnormalReading = (sensor: BuaBicchiyaSensor, value: number): boolean => {
  switch (sensor.instrumentType) {
    case 'pt':
    case 'combined_pt':
      // Pressure (0-10 Bar): safe 0.3 – 80% of max. Below = pump dry-run risk, above = burst risk
      return value < 0.3 || value > sensor.max * 0.85;
    case 'lt':
      // Level %: safe 8-95. Below = empty risk, above = overflow risk
      return value < 8 || value > 95;
    case 'flow':
      // Flow: abnormal if > 95% of design capacity (overloading)
      return value > sensor.max * 0.95;
    case 'ph':
      // pH: potable safe 6.5-8.5
      return value < 6.5 || value > 8.5;
    case 'chlorine':
      // Free chlorine residual safe 0.2-1.5 mg/L
      return value < 0.2 || value > 1.5;
    case 'turbidity': {
      // Raw intake turbidity tolerates higher; treated water must be < 5 NTU
      const isRawIntake = sensor.section === 'wtp' && sensor.id.includes('TA-IN');
      return isRawIntake ? value > 50 : value > 5;
    }
    case 'kw':
      // Energy: abnormal if > 90% of max rated load
      return value > sensor.max * 0.9;
    default:
      return false;
  }
};

export const useMqttTagSync = (
  intakeTags: TagData[],
  ohtTags: TagData[],
  wtpTags: TagData[],
  setIntakeTags: React.Dispatch<React.SetStateAction<TagData[]>>,
  setOhtTags: React.Dispatch<React.SetStateAction<TagData[]>>,
  setWtpTags: React.Dispatch<React.SetStateAction<TagData[]>>
) => {
  const pendingLogs = useRef<TagUpdate[]>([]);
  const flushInterval = useRef<NodeJS.Timeout | null>(null);
  const disconnectCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const { addAlarm } = useAlarm();
  const tagConfigCache = useRef<Map<string, string>>(new Map());
  const lastCacheRefresh = useRef<number>(0);
  const CACHE_TTL = 30000;
  // Per-tag last-saved tracker for deadband + interval logic
  const lastSaved = useRef<Map<string, { value: number; at: number; inAlarm: boolean }>>(new Map());

  useEffect(() => {
    disconnectCheckInterval.current = setInterval(() => {
      const now = new Date();
      const checkTags = (setter: React.Dispatch<React.SetStateAction<TagData[]>>) => {
        setter(prev => prev.map(tag => {
          if (tag.source === 'mqtt' && tag.lastDataTime) {
            const elapsed = now.getTime() - tag.lastDataTime.getTime();
            if (elapsed > DISCONNECT_TIMEOUT_MS && tag.status !== 'disconnected') {
              return { ...tag, status: 'disconnected' as const };
            }
          }
          return tag;
        }));
      };
      checkTags(setIntakeTags);
      checkTags(setOhtTags);
      checkTags(setWtpTags);
    }, 1000);
    return () => { if (disconnectCheckInterval.current) clearInterval(disconnectCheckInterval.current); };
  }, [addAlarm, setIntakeTags, setOhtTags, setWtpTags]);

  const ensureTagConfigExists = useCallback(async (section: 'oht' | 'intake' | 'wtp', tagId: string) => {
    const key = `${section}-${tagId}`;
    if (tagConfigCache.current.has(key)) return;
    try {
      const { data: existing } = await supabase.from('tag_config').select('id')
        .eq('section', section).eq('tag_id', tagId).limit(1).maybeSingle();
      if (existing?.id) { tagConfigCache.current.set(key, existing.id); return; }
      const sensor = ALL_SENSORS.find(s => s.id === tagId && s.section === section);
      const { data: created } = await supabase.from('tag_config').insert({
        section, tag_id: tagId, label: sensor?.label || '', unit: sensor?.unit || '',
        is_active: true, activated_at: new Date().toISOString(),
        high_setpoint: null, low_setpoint: null, alarm_enabled: true, alarm_emails: [],
      }).select('id').single();
      if (created?.id) tagConfigCache.current.set(key, created.id);
    } catch (error) { logError('TagSync.ensureTagConfigExists', error); }
  }, []);

  const refreshTagConfigCache = useCallback(async () => {
    try {
      const { data: tagConfigs } = await supabase.from('tag_config').select('id, tag_id, section');
      if (tagConfigs) {
        tagConfigCache.current.clear();
        tagConfigs.forEach(tc => tagConfigCache.current.set(`${tc.section}-${tc.tag_id}`, tc.id));
        lastCacheRefresh.current = Date.now();
      }
    } catch (error) { logError('TagSync.refreshCache', error); }
  }, []);

  const startBatchWriter = useCallback(() => {
    if (flushInterval.current) return () => {};
    refreshTagConfigCache();
    flushInterval.current = setInterval(async () => {
      if (pendingLogs.current.length === 0) return;
      if (Date.now() - lastCacheRefresh.current > CACHE_TTL) await refreshTagConfigCache();
      const logsToWrite = [...pendingLogs.current];
      pendingLogs.current = [];
      try {
        const uncached = logsToWrite.filter(l => !tagConfigCache.current.has(`${l.section}-${l.tagId}`));
        if (uncached.length > 0) {
          await Promise.all(uncached.map(l => ensureTagConfigExists(l.section as any, l.tagId)));
        }
        const logsToInsert = logsToWrite
          .filter(log => tagConfigCache.current.has(`${log.section}-${log.tagId}`))
          .map(log => ({
            tag_config_id: tagConfigCache.current.get(`${log.section}-${log.tagId}`)!,
            tag_id: log.tagId, section: log.section, value: log.value,
            timestamp: new Date().toISOString(),
            source: log.reason ? `mqtt:${log.reason}` : 'mqtt',
            mqtt_topic: log.topic,
          }));
        if (logsToInsert.length > 0) {
          const { error } = await supabase.from('historian_logs').insert(logsToInsert);
          if (error) { logError('TagSync.batchWrite', error); pendingLogs.current.push(...logsToWrite); }
        }
      } catch (error) { logError('TagSync.batchWrite', error); pendingLogs.current.push(...logsToWrite); }
    }, FLUSH_INTERVAL_MS);
    return () => { if (flushInterval.current) { clearInterval(flushInterval.current); flushInterval.current = null; } };
  }, [ensureTagConfigExists, refreshTagConfigCache]);

  const processMqttMessage = useCallback(async (message: MqttMessage) => {
    const { payload, section, subsection, topic } = message;
    if (section === 'unknown') return;

    let sensors: BuaBicchiyaSensor[];
    let setter: React.Dispatch<React.SetStateAction<TagData[]>>;
    let tags: TagData[];
    let validKeys: string[];

    if (section === 'oht') {
      sensors = ALL_OHT_SENSORS.filter(s => !subsection || s.subsection === subsection);
      setter = setOhtTags;
      tags = ohtTags;
      validKeys = VALID_OHT_KEYS;
    } else if (section === 'intake') {
      sensors = INTAKE_SENSORS;
      setter = setIntakeTags;
      tags = intakeTags;
      validKeys = VALID_INTAKE_KEYS;
    } else if (section === 'wtp') {
      sensors = WTP_SENSORS;
      setter = setWtpTags;
      tags = wtpTags;
      validKeys = VALID_WTP_KEYS;
    } else return;

    for (const [mqttKey, rawValue] of Object.entries(payload)) {
      if (!validKeys.includes(mqttKey)) continue;

      const value = typeof rawValue === 'string' ? parseFloat(rawValue) : rawValue;
      if (isNaN(value)) continue;

      const sensor = sensors.find(s => s.mqttKey === mqttKey);
      if (!sensor) continue;

      const sensorId = sensor.id;
      const existingTag = tags.find(t => t.id === sensorId);

      let displayValue = value;
      let shouldLog = true;

      // Non-pump analog instruments
      if (value < 0) { displayValue = 0; shouldLog = false; }
      if (value === 0) { displayValue = 0; shouldLog = false; }
      // PT overflow protection
      if (sensor.instrumentType === 'pt' && value > 1e30) { displayValue = 0; shouldLog = false; }

      // Alarm check for analog sensors (uses operator setpoints if configured)
      if (existingTag && sensor.type === 'analog') {
        const highThreshold = existingTag.highSetpoint ?? existingTag.max;
        const lowThreshold = existingTag.lowSetpoint ?? existingTag.min;
        const alarmEnabled = existingTag.alarmEnabled !== false;
        if (alarmEnabled && (displayValue > highThreshold || displayValue < lowThreshold)) {
          const type = displayValue > highThreshold ? 'High' : 'Low';
          const threshold = type === 'High' ? highThreshold : lowThreshold;
          const msg = `Alarm: ${existingTag.label} ${type} (${displayValue.toFixed(2)} ${existingTag.unit}) - Threshold: ${threshold}`;
          addAlarm({
            tagId: sensorId, tagConfigId: existingTag.dbId, label: existingTag.label,
            value: displayValue, unit: existingTag.unit, type, message: msg,
            section: section as 'intake' | 'oht',
            highSetpoint: existingTag.highSetpoint, lowSetpoint: existingTag.lowSetpoint,
          });
        }
      }

      // Update the sensor tag value and its derived pump status atomically in a single state change
      setter(prev => {
        const pumpId = PT_TO_PUMP_MAP[sensorId];
        const pumpValue = sensor.instrumentType === 'pt' ? (displayValue > 1.5 ? 1 : 0) : null;

        return prev.map(t => {
          if (t.id === sensorId) {
            return {
              ...t, value: displayValue, timestamp: new Date(), source: 'mqtt' as const,
              mqttTopic: topic, isActive: true, lastDataTime: new Date(), status: 'connected' as const
            };
          }
          if (pumpId && t.id === pumpId) {
            return {
              ...t, value: pumpValue!, timestamp: new Date(), source: 'mqtt' as const,
              mqttTopic: topic, isActive: true, lastDataTime: new Date(), status: 'connected' as const
            };
          }
          return t;
        });
      });

      if (shouldLog) {
        // ---- Smart save decision: 5-min interval OR abnormal change OR alarm crossing ----
        const key = `${section}-${sensorId}`;
        const now = Date.now();
        const prev = lastSaved.current.get(key);

        // Use hardcoded process safety bands (operator setpoints may be wrong/missing)
        const abnormalNow = isAbnormalReading(sensor, displayValue);

        const range = Math.max(1e-6, (sensor.max ?? 1) - (sensor.min ?? 0));
        const deltaPct = prev ? Math.abs(displayValue - prev.value) / range : 1;

        let reason: TagUpdate['reason'] | null = null;
        if (!prev) {
          reason = 'interval';
        } else if (sensor.type !== 'analog' && displayValue !== prev.value) {
          reason = 'state_change';                     // pump/valve on↔off
        } else if (abnormalNow && !prev.inAlarm) {
          reason = 'alarm';                            // entered unsafe process zone
        } else if (deltaPct >= ABNORMAL_DELTA_PCT) {
          reason = 'abnormal';                         // sudden fluctuation
        } else if (now - prev.at >= SAVE_INTERVAL_MS) {
          reason = 'interval';                         // normal 5-min checkpoint
        }

        if (reason) {
          pendingLogs.current.push({
            tagId: sensorId, value: displayValue,
            section: section as 'oht' | 'intake' | 'wtp',
            topic, reason,
          });
          lastSaved.current.set(key, { value: displayValue, at: now, inAlarm: abnormalNow });
        }
      }
    }
  }, [intakeTags, ohtTags, wtpTags, setIntakeTags, setOhtTags, setWtpTags, addAlarm]);

  return { processMqttMessage, startBatchWriter };
};
