import { useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { MqttMessage } from '@/contexts/MqttContext';
import { type TagData, getDefaultSetpoints } from '@/contexts/ScadaContext';
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
  value: number | null;
  section: 'oht' | 'intake' | 'wtp';
  topic: string;
  reason?: 'interval' | 'abnormal' | 'alarm' | 'state_change';
}

const DISCONNECT_TIMEOUT_MS = 3000;
const ABNORMAL_DELTA_PCT = 0.12;        // 12% of sensor range
const FLUSH_INTERVAL_MS = 30 * 1000;    // batch-write queue to DB every 30s

const isAbnormalReading = (sensor: BuaBicchiyaSensor, value: number): boolean => {
  switch (sensor.instrumentType) {
    case 'pt':
    case 'combined_pt':
      return value < 0.3 || value > sensor.max * 0.85;
    case 'lt':
      return value < 8 || value > 95;
    case 'flow':
      return value > sensor.max * 0.95;
    case 'ph':
      return value < 6.5 || value > 8.5;
    case 'chlorine':
      return value < 0.2 || value > 1.5;
    case 'turbidity': {
      const isRawIntake = sensor.section === 'wtp' && sensor.id.includes('TA-IN');
      return isRawIntake ? value > 50 : value > 5;
    }
    case 'kw':
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
  const lastSaved = useRef<Map<string, { value: number | null; at: number; inAlarm: boolean }>>(new Map());

  // Alarm tracking state
  const alarmActiveSince = useRef<Map<string, number>>(new Map());
  // Sensor frozen tracking: tagId -> { value: number; timestamp: number }
  const lastValueTracker = useRef<Map<string, { value: number; timestamp: number }>>(new Map());
  // Rolling pressure history for cavitation checks: tagId -> { value: number; timestamp: number }[]
  const pressureHistory = useRef<Map<string, { value: number; timestamp: number }[]>>(new Map());
  // Rolling level history for turbulence check: tagId -> { value: number; timestamp: number }[]
  const levelHistory = useRef<Map<string, { value: number; timestamp: number }[]>>(new Map());
  // Level trend tracker for Mass Balance check: tagId -> { startLevel: number; timestamp: number }
  const massBalanceTracker = useRef<Map<string, { startLevel: number; timestamp: number }>>(new Map());
  // Pump start times tracker for short cycling watchdog: pumpId -> startTimestamps[]
  const pumpStartHistory = useRef<Map<string, number[]>>(new Map());

  // Helper to determine if pressure alarm should be suppressed due to no flow
  const isPressureSuppressed = (sensorId: string, currentTags: TagData[]): boolean => {
    const getSectionFlowValue = (sec: 'intake' | 'wtp', flowTagId: string): number => {
      const localTags = sec === 'intake' ? intakeTags : wtpTags;
      const localFlow = localTags.find(t => t.id === flowTagId);
      
      // If local flow sensor is online and valid, use it
      if (localFlow && localFlow.status === 'connected' && localFlow.value !== null) {
        return localFlow.value;
      }
      
      // Fallback to cross-section redundancy (Intake outflow matches WTP raw water inflow)
      const crossTags = sec === 'intake' ? wtpTags : intakeTags;
      const crossFlowId = sec === 'intake' ? 'WTP-Flow-IN' : 'INT-Flow';
      const crossFlow = crossTags.find(t => t.id === crossFlowId);
      if (crossFlow && crossFlow.status === 'connected' && crossFlow.value !== null) {
        return crossFlow.value;
      }
      
      return 999.0; // If both are offline, disable suppression (safety fallback)
    };

    if (sensorId.startsWith('INT-PT') || sensorId === 'INT-CombinedPT') {
      const flowVal = getSectionFlowValue('intake', 'INT-Flow');
      return flowVal < 5.0;
    }
    if (sensorId.startsWith('WTP-PT') || sensorId.startsWith('WTP-CombinedPT')) {
      const flowVal = getSectionFlowValue('wtp', 'WTP-Flow-IN');
      return flowVal < 5.0;
    }
    if (sensorId.startsWith('OHT') && sensorId.includes('-PT')) {
      const ohtNum = sensorId.match(/OHT(\d+)/)?.[1];
      if (ohtNum) {
        const flowTag = currentTags.find(t => t.id === `OHT${ohtNum}-Flow-IN`);
        if (!flowTag || flowTag.status !== 'connected' || flowTag.value === null) {
          return false; // local flow sensor offline, disable suppression
        }
        return flowTag.value < 1.0;
      }
    }
    return false;
  };

  useEffect(() => {
    disconnectCheckInterval.current = setInterval(() => {
      const now = new Date();
      const checkTags = (setter: React.Dispatch<React.SetStateAction<TagData[]>>) => {
        setter(prev => prev.map(tag => {
          if (tag.source === 'mqtt' && tag.lastDataTime) {
            const elapsed = now.getTime() - tag.lastDataTime.getTime();
            const timeout = tag.section === 'intake' ? 8000 : tag.section === 'oht' ? 25000 : 35000;
            if (elapsed > timeout && tag.status !== 'disconnected') {
              // Add a Disconnect alarm (TDM Case E)
              const msg = `Communication Loss: ${tag.label} is offline (No data for ${Math.round(elapsed / 1000)}s)`;
              addAlarm({
                tagId: tag.id,
                tagConfigId: tag.dbId,
                label: tag.label,
                value: 0,
                unit: '',
                type: 'Disconnect',
                message: msg,
                section: tag.section,
              });
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
        high_setpoint: null, low_setpoint: null, alarm_enabled: true,
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

    // Build map of latest values in this message cycle to support MIV cross-checks
    const latestValues = new Map<string, number>();
    tags.forEach(t => latestValues.set(t.id, t.value));

    const nowTime = Date.now();

    for (const [mqttKey, rawValue] of Object.entries(payload)) {
      if (!validKeys.includes(mqttKey)) continue;

      const value = typeof rawValue === 'string' ? parseFloat(rawValue) : rawValue;
      
      const sensor = sensors.find(s => s.mqttKey === mqttKey);
      if (!sensor) continue;

      const sensorId = sensor.id;
      const existingTag = tags.find(t => t.id === sensorId);

      // --- 1. Telemetry Validation Layer (TDM Case A & B) ---
      const isNaNOrInfinite = value === null || value === undefined || isNaN(value) || !Number.isFinite(value);
      const isNegativeOverflow = !isNaNOrInfinite && (value < sensor.min - Math.max(1.0, sensor.max * 0.1));
      const isPositiveOverflow = !isNaNOrInfinite && (
        value > sensor.max * 2.0 || 
        value === 32767 || 
        value === 65535 || 
        value > 1e10
      );
      const isCorrupt = isNaNOrInfinite || isNegativeOverflow || isPositiveOverflow;

      if (isCorrupt) {
        // Non-destructive error logging: save null in historian to record the incident
        pendingLogs.current.push({
          tagId: sensorId, value: null,
          section: section as 'oht' | 'intake' | 'wtp',
          topic, reason: 'alarm',
        });

        // Trigger Sensor Signal Fault alarm with 30s debounce to avoid transient spikes
        const faultKey = `${sensorId}-SignalFault`;
        const faultStart = alarmActiveSince.current.get(faultKey);
        if (!faultStart) {
          alarmActiveSince.current.set(faultKey, nowTime);
        } else if (nowTime - faultStart > 30000) {
          const type = isNegativeOverflow ? 'Sensor Wire Break' : 'Signal Overflow';
          const msg = `Telemetry Fault: ${sensor.label} (${sensorId}) is reading corrupt value: ${value}. (${type})`;
          addAlarm({
            tagId: sensorId, tagConfigId: existingTag?.dbId, label: sensor.label,
            value: 0, unit: sensor.unit, type: 'Low', message: msg,
            section: section as 'intake' | 'oht' | 'wtp',
          });
        }
        continue; // Discard further processing for this sensor
      }

      // Reset signal fault debounce if reading is healthy
      alarmActiveSince.current.delete(`${sensorId}-SignalFault`);

      // --- 2. Rate-of-Change (ROC) Telemetry Limiter ---
      const prevVal = existingTag ? existingTag.value : null;
      let rawValueAdjusted = value;
      if (prevVal !== null && existingTag.status === 'connected') {
        const delta = Math.abs(value - prevVal);
        if (sensor.instrumentType === 'pt' || sensor.instrumentType === 'combined_pt') {
          if (delta > 3.0) { // Pressure changed by > 3.0 Bar in 1 packet
            rawValueAdjusted = value > prevVal ? prevVal + 0.5 : prevVal - 0.5; // Clamp to max 0.5 Bar change
            const noiseKey = `${sensorId}-ROCNoise`;
            const noiseStart = alarmActiveSince.current.get(noiseKey);
            if (!noiseStart) {
              alarmActiveSince.current.set(noiseKey, nowTime);
              const msg = `Telemetry Warning: Pressure Telemetry Noise detected on ${sensor.label} (Raw change of ${delta.toFixed(2)} Bar clamped to 0.5 Bar)`;
              addAlarm({
                tagId: sensorId, tagConfigId: existingTag?.dbId, label: sensor.label,
                value: value, unit: sensor.unit, type: 'Low', message: msg,
                section: section as 'intake' | 'oht' | 'wtp',
              });
            }
          } else {
            alarmActiveSince.current.delete(`${sensorId}-ROCNoise`);
          }
        } else if (sensor.instrumentType === 'lt') {
          const isMetres = sensor.unit === 'm';
          const threshold = isMetres ? 1.5 : 20.0; // 1.5m or 20%
          if (delta > threshold) {
            rawValueAdjusted = value > prevVal ? prevVal + (isMetres ? 0.14 : 2.0) : prevVal - (isMetres ? 0.14 : 2.0); // Clamp to 2% or 0.14m change
            const noiseKey = `${sensorId}-ROCNoise`;
            const noiseStart = alarmActiveSince.current.get(noiseKey);
            if (!noiseStart) {
              alarmActiveSince.current.set(noiseKey, nowTime);
              const msg = `Telemetry Warning: Level Telemetry Noise detected on ${sensor.label} (Raw change of ${delta.toFixed(2)} ${sensor.unit} clamped)`;
              addAlarm({
                tagId: sensorId, tagConfigId: existingTag?.dbId, label: sensor.label,
                value: value, unit: sensor.unit, type: 'Low', message: msg,
                section: section as 'intake' | 'oht' | 'wtp',
              });
            }
          } else {
            alarmActiveSince.current.delete(`${sensorId}-ROCNoise`);
          }
        }
      }

      // --- 3. Numeric Precision (Rounding Jitter Filters) ---
      let roundedValue = rawValueAdjusted;
      if (sensor.instrumentType === 'pt' || sensor.instrumentType === 'combined_pt' || sensor.instrumentType === 'lt' || sensor.instrumentType === 'ph' || sensor.instrumentType === 'chlorine') {
        roundedValue = Math.round(rawValueAdjusted * 100) / 100; // 2 decimal places
      } else if (sensor.instrumentType === 'flow' || sensor.instrumentType === 'kw' || sensor.instrumentType === 'turbidity') {
        roundedValue = Math.round(rawValueAdjusted * 10) / 10;  // 1 decimal place
      }

      const displayValue = roundedValue;
      latestValues.set(sensorId, displayValue);

      // --- 4. Sensor Frozen / Stuck Check (TDM Case C) ---
      const lastValEntry = lastValueTracker.current.get(sensorId);
      
      let sectionFlowActive = false;
      if (section === 'intake') {
        const flowTag = intakeTags.find(t => t.id === 'INT-Flow');
        sectionFlowActive = flowTag ? flowTag.value > 10.0 : false;
      } else if (section === 'wtp') {
        const flowTag = wtpTags.find(t => t.id === 'WTP-Flow-IN');
        sectionFlowActive = flowTag ? flowTag.value > 10.0 : false;
      }
      
      if (sensor.type === 'analog' && sectionFlowActive) {
        if (!lastValEntry || lastValEntry.value !== value) {
          lastValueTracker.current.set(sensorId, { value, timestamp: nowTime });
          alarmActiveSince.current.delete(`${sensorId}-Frozen`);
        } else if (nowTime - lastValEntry.timestamp > 30 * 60 * 1000) { // 30 minutes stuck
          const frozenKey = `${sensorId}-Frozen`;
          const frozenStart = alarmActiveSince.current.get(frozenKey);
          if (!frozenStart) {
            alarmActiveSince.current.set(frozenKey, nowTime);
            const msg = `Telemetry Fault: ${sensor.label} (${sensorId}) is frozen at exactly ${displayValue.toFixed(2)} ${sensor.unit} (No signal jitter for 30 min)`;
            addAlarm({
              tagId: sensorId, tagConfigId: existingTag?.dbId, label: sensor.label,
              value: displayValue, unit: sensor.unit, type: 'Low', message: msg,
              section: section as 'intake' | 'oht' | 'wtp',
            });
          }
        }
      } else {
        lastValueTracker.current.set(sensorId, { value, timestamp: nowTime });
        alarmActiveSince.current.delete(`${sensorId}-Frozen`);
      }

      // --- 5. Alarm limit validation (with 15s Debounce, Suppression & Watchdog blocks) ---
      const isTagConnected = existingTag ? existingTag.status === 'connected' : true;
      if (existingTag && sensor.type === 'analog' && isTagConnected) {
        const defaults = getDefaultSetpoints(sensor);
        const highThreshold = existingTag.highSetpoint ?? defaults.high ?? existingTag.max;
        const lowThreshold = existingTag.lowSetpoint ?? defaults.low ?? existingTag.min;
        const alarmEnabled = existingTag.alarmEnabled !== false;

        const isLowAlarm = lowThreshold !== null && displayValue < lowThreshold;
        const isHighAlarm = highThreshold !== null && displayValue > highThreshold;

        // Suppress alarms if pressure is low but pump is stopped (Condition 2)
        let suppressed = false;
        if (isLowAlarm && (sensor.instrumentType === 'pt' || sensor.instrumentType === 'combined_pt')) {
          suppressed = isPressureSuppressed(sensorId, tags);
        }

        const activeAlarmType = !suppressed && isHighAlarm ? 'High' : (!suppressed && isLowAlarm ? 'Low' : null);

        if (alarmEnabled && activeAlarmType) {
          const alarmKey = `${sensorId}-${activeAlarmType}`;
          const activeTime = alarmActiveSince.current.get(alarmKey);
          
          if (!activeTime) {
            alarmActiveSince.current.set(alarmKey, nowTime); // Start 15s debounce
          } else if (nowTime - activeTime > 15000) {
            const threshold = activeAlarmType === 'High' ? highThreshold : lowThreshold;
            const msg = `Alarm: ${existingTag.label} ${activeAlarmType} (${displayValue.toFixed(2)} ${existingTag.unit}) - Threshold: ${threshold}`;
            addAlarm({
              tagId: sensorId, tagConfigId: existingTag.dbId, label: existingTag.label,
              value: displayValue, unit: existingTag.unit, type: activeAlarmType, message: msg,
              section: section as 'intake' | 'oht' | 'wtp',
              highSetpoint: existingTag.highSetpoint ?? (defaults.high !== null ? defaults.high : undefined),
              lowSetpoint: existingTag.lowSetpoint ?? (defaults.low !== null ? defaults.low : undefined),
            });
          }
        } else {
          // Reset debounce if value goes healthy or suppressed
          alarmActiveSince.current.delete(`${sensorId}-High`);
          alarmActiveSince.current.delete(`${sensorId}-Low`);
        }
      }

      // --- 6. Derived Status Multi-Sensor Correction (DSMC) ---
      let pumpValue = sensor.instrumentType === 'pt' ? (displayValue > 1.5 ? 1 : 0) : null;
      
      if (sensor.instrumentType === 'pt' && pumpValue === 0) {
        // DSMC Rule 1: Flow-based status correction (If PT reads 0 but flow is active, override pump status to ON)
        let isFlowActive = false;
        if (section === 'intake') {
          const intakeFlow = latestValues.get('INT-Flow') || 0;
          const wtpFlowIn = latestValues.get('WTP-Flow-IN') || 0;
          isFlowActive = intakeFlow > 10.0 || wtpFlowIn > 10.0;
        } else if (section === 'wtp') {
          const wtpFlowIn = latestValues.get('WTP-Flow-IN') || 0;
          const intakeFlow = latestValues.get('INT-Flow') || 0;
          isFlowActive = wtpFlowIn > 10.0 || intakeFlow > 10.0;
        }

        if (isFlowActive) {
          const otherPtId = sensorId === 'INT-PT1' ? 'INT-PT2' : 
                             sensorId === 'INT-PT2' ? 'INT-PT1' : 
                             sensorId === 'WTP-PT1' ? 'WTP-PT2' : 
                             sensorId === 'WTP-PT2' ? 'WTP-PT1' : null;
          const otherPtVal = otherPtId ? (latestValues.get(otherPtId) || 0) : 0;
          
          if (otherPtVal <= 1.5) {
            pumpValue = 1; // Force ON
            const pumpId = PT_TO_PUMP_MAP[sensorId];
            if (pumpId) {
              const corrKey = `${pumpId}-StatusCorrection`;
              const corrStart = alarmActiveSince.current.get(corrKey);
              if (!corrStart) {
                alarmActiveSince.current.set(corrKey, nowTime);
                const msg = `Status Correction: ${pumpId} display status forced to ON (Flow is active, but pump pressure reads ${displayValue.toFixed(2)} Bar)`;
                addAlarm({
                  tagId: pumpId, tagConfigId: existingTag?.dbId, label: pumpId,
                  value: 1, unit: '', type: 'High', message: msg,
                  section: section as 'intake' | 'wtp',
                });
              }
            }
          }
        }
      }

      // DSMC Rule 2: Power-based status correction (If WTP power < 2.0 kW, WTP pumps are OFF regardless of PT)
      if (sensor.instrumentType === 'pt' && pumpValue === 1 && section === 'wtp') {
        const kwTag = tags.find(t => t.id === 'WTP-KW');
        const kwVal = latestValues.get('WTP-KW') || 0;
        const isKwHealthy = kwTag && kwTag.status === 'connected' && !kwTag.notInstalled;
        if (isKwHealthy && kwVal < 2.0) {
          pumpValue = 0; // Force OFF
          const pumpId = PT_TO_PUMP_MAP[sensorId];
          if (pumpId) {
            alarmActiveSince.current.delete(`${pumpId}-DryRun`);
            alarmActiveSince.current.delete(`${pumpId}-Efficiency`);
          }
        }
      }

      // --- 7. Pump Motor Short Cycling Watchdog (MCC Rule 2) ---
      const pumpId = PT_TO_PUMP_MAP[sensorId];
      if (pumpId && pumpValue !== null) {
        const prevPumpTag = tags.find(t => t.id === pumpId);
        const prevPumpValue = prevPumpTag ? prevPumpTag.value : 0;

        if (prevPumpValue === 0 && pumpValue === 1) {
          // Transitioned from OFF to ON! Log start transition timestamp
          let starts = pumpStartHistory.current.get(pumpId) || [];
          starts.push(nowTime);
          // Keep only starts in the last 10 minutes
          starts = starts.filter(t => nowTime - t <= 10 * 60 * 1000);
          pumpStartHistory.current.set(pumpId, starts);
          
          if (starts.length > 5) {
            const cycleKey = `${pumpId}-ShortCycling`;
            const cycleStart = alarmActiveSince.current.get(cycleKey);
            if (!cycleStart) {
              alarmActiveSince.current.set(cycleKey, nowTime);
              const msg = `Mechanical Fault: Pump Short Cycling detected on ${pumpId} (Pump started ${starts.length} times in 10 minutes. Check valve leakage or level setpoint overlap suspected)`;
              addAlarm({
                tagId: pumpId, tagConfigId: prevPumpTag?.dbId, label: pumpId,
                value: starts.length, unit: 'starts', type: 'High', message: msg,
                section: section as 'intake' | 'wtp',
              });
            }
          }
        } else if (pumpValue === 0) {
          alarmActiveSince.current.delete(`${pumpId}-ShortCycling`);
        }
      }

      // Update local state atomically
      setter(prev => {
        return prev.map(t => {
          if (t.id === sensorId) {
            return {
              ...t, value: displayValue, timestamp: new Date(), source: 'mqtt' as const,
              mqttTopic: topic, isActive: true, lastDataTime: new Date(), status: 'connected' as const
            };
          }
          if (pumpId && t.id === pumpId && pumpValue !== null) {
            return {
              ...t, value: pumpValue, timestamp: new Date(), source: 'mqtt' as const,
              mqttTopic: topic, isActive: true, lastDataTime: new Date(), status: 'connected' as const
            };
          }
          return t;
        });
      });

      // Smart save decision (Interval saves are backend's job)
      const key = `${section}-${sensorId}`;
      const nowSave = Date.now();
      const prev = lastSaved.current.get(key);
      const abnormalNow = isAbnormalReading(sensor, displayValue);
      const range = Math.max(1e-6, (sensor.max ?? 1) - (sensor.min ?? 0));
      const deltaPct = prev && prev.value !== null ? Math.abs(displayValue - prev.value) / range : 1;

      let reason: TagUpdate['reason'] | null = null;
      if (sensor.type !== 'analog' && prev && displayValue !== prev.value) {
        reason = 'state_change';
      } else if (abnormalNow && (!prev || !prev.inAlarm)) {
        reason = 'alarm';
      } else if (prev && deltaPct >= ABNORMAL_DELTA_PCT) {
        reason = 'abnormal';
      }

      if (reason) {
        pendingLogs.current.push({
          tagId: sensorId, value: displayValue,
          section: section as 'oht' | 'intake' | 'wtp',
          topic, reason,
        });
        lastSaved.current.set(key, { value: displayValue, at: nowSave, inAlarm: abnormalNow });
      } else if (!prev) {
        lastSaved.current.set(key, { value: displayValue, at: nowSave, inAlarm: abnormalNow });
      }
    }

    // ==========================================
    // --- 8. Multi-Instrument Cross-Validation (MIV & Ultra-MIV) ---
    // ==========================================

    // -- MCC Watchdog Rule 1: Pump Duty-Standby Overload Alert --
    const checkDutyStandbyOverload = (p1Id: string, p2Id: string, secName: 'intake' | 'wtp') => {
      let p1Val = latestValues.get(p1Id);
      let p2Val = latestValues.get(p2Id);
      if (p1Val === undefined) p1Val = tags.find(t => t.id === p1Id)?.value || 0;
      if (p2Val === undefined) p2Val = tags.find(t => t.id === p2Id)?.value || 0;
      
      const isP1On = p1Val === 1;
      const isP2On = p2Val === 1;

      if (isP1On && isP2On) {
        const overloadKey = `${secName}-PumpOverload`;
        const overloadStart = alarmActiveSince.current.get(overloadKey);
        if (!overloadStart) {
          alarmActiveSince.current.set(overloadKey, nowTime);
        } else if (nowTime - overloadStart > 300000) { // 5 minutes
          const t1 = tags.find(t => t.id === p1Id);
          const msg = `Process Warning: Pump Duty-Standby Overload (Both ${p1Id} and ${p2Id} are running simultaneously in ${secName}. Stuck MCC contactor or manual override suspected)`;
          addAlarm({
            tagId: p1Id, tagConfigId: t1?.dbId, label: 'Pump Overload',
            value: 2, unit: 'pumps', type: 'High', message: msg,
            section: secName,
          });
        }
      } else {
        alarmActiveSince.current.delete(`${secName}-PumpOverload`);
      }
    };

    if (section === 'intake') {
      checkDutyStandbyOverload('INT-Pump1', 'INT-Pump2', 'intake');
    } else if (section === 'wtp') {
      checkDutyStandbyOverload('WTP-Pump1', 'WTP-Pump2', 'wtp');
    }

    // -- Ultra-MIV Rule 1: Pump Cavitation / Air Lock Check --
    const checkCavitation = (ptId: string) => {
      const ptVal = latestValues.get(ptId);
      if (ptVal === undefined || ptVal <= 1.2) {
        pressureHistory.current.delete(ptId);
        alarmActiveSince.current.delete(`${ptId}-Cavitation`);
        return;
      }
      let history = pressureHistory.current.get(ptId) || [];
      history.push({ value: ptVal, timestamp: nowTime });
      history = history.filter(h => nowTime - h.timestamp <= 15000);
      pressureHistory.current.set(ptId, history);

      if (history.length >= 5) {
        const values = history.map(h => h.value);
        const maxP = Math.max(...values);
        const minP = Math.min(...values);
        if (maxP - minP > 1.0) {
          const cavKey = `${ptId}-Cavitation`;
          const cavStart = alarmActiveSince.current.get(cavKey);
          if (!cavStart) {
            alarmActiveSince.current.set(cavKey, nowTime);
            const tag = tags.find(t => t.id === ptId);
            const msg = `Mechanical Fault: Pump Cavitation / Air Lock suspected on ${tag?.label || ptId} (Pressure fluctuates between ${minP.toFixed(2)} and ${maxP.toFixed(2)} Bar)`;
            addAlarm({
              tagId: ptId, tagConfigId: tag?.dbId, label: tag?.label || ptId,
              value: ptVal, unit: 'Bar', type: 'High', message: msg,
              section: section as 'intake' | 'wtp',
            });
          }
        }
      }
    };

    if (section === 'intake') {
      checkCavitation('INT-PT1');
      checkCavitation('INT-PT2');
    } else if (section === 'wtp') {
      checkCavitation('WTP-PT1');
      checkCavitation('WTP-PT2');
    }

    // -- Ultra-MIV Rule 2: Pipeline Burst Check --
    if (section === 'wtp') {
      const flowIn = latestValues.get('WTP-Flow-IN') || 0;
      const combinedPT = latestValues.get('WTP-CombinedPT1') || 0;
      const flowTag = tags.find(t => t.id === 'WTP-Flow-IN');
      const ptTag = tags.find(t => t.id === 'WTP-CombinedPT1');
      
      const isFlowActive = flowTag && flowTag.status === 'connected' && flowIn > 120.0;
      const isPressureLow = ptTag && ptTag.status === 'connected' && combinedPT < 0.6;

      if (isFlowActive && isPressureLow) {
        const burstKey = 'WTP-PipelineBurst';
        const burstStart = alarmActiveSince.current.get(burstKey);
        if (!burstStart) {
          alarmActiveSince.current.set(burstKey, nowTime);
        } else if (nowTime - burstStart > 45000) {
          const msg = `Critical Process Alert: Major Pipeline Burst / Leakage suspected (Flow: ${flowIn.toFixed(1)} m³/hr, pressure: ${combinedPT.toFixed(2)} Bar)`;
          addAlarm({
            tagId: 'WTP-CombinedPT1', tagConfigId: ptTag.dbId, label: 'Combined Pressure',
            value: combinedPT, unit: 'Bar', type: 'Low', message: msg,
            section: 'wtp',
          });
        }
      } else {
        alarmActiveSince.current.delete('WTP-PipelineBurst');
      }
    }

    // -- Ultra-MIV Rule 3: Level Sensor Turbulence Filter --
    const checkLevelTurbulence = (ltId: string) => {
      const ltVal = latestValues.get(ltId);
      if (ltVal === undefined) return;
      let history = levelHistory.current.get(ltId) || [];
      history.push({ value: ltVal, timestamp: nowTime });
      history = history.filter(h => nowTime - h.timestamp <= 5000);
      levelHistory.current.set(ltId, history);

      if (history.length >= 3) {
        const first = history[0].value;
        const last = history[history.length - 1].value;
        const delta = Math.abs(last - first);
        if (delta > 15.0) { // level fluctuated by > 15% in 5 seconds
          const turbKey = `${ltId}-Turbulence`;
          const turbStart = alarmActiveSince.current.get(turbKey);
          if (!turbStart) {
            alarmActiveSince.current.set(turbKey, nowTime);
            const tag = tags.find(t => t.id === ltId);
            const msg = `Telemetry Warning: Level Sensor Turbulence / Jitter filter triggered on ${tag?.label || ltId} (fluctuation of ${delta.toFixed(1)}% ignored)`;
            addAlarm({
              tagId: ltId, tagConfigId: tag?.dbId, label: tag?.label || ltId,
              value: ltVal, unit: tag?.unit || '%', type: 'Low', message: msg,
              section: section as 'intake' | 'wtp',
            });
          }
        }
      }
    };

    if (section === 'oht') {
      const ohtNum = subsection?.match(/OHT-(\d+)/)?.[1];
      if (ohtNum) checkLevelTurbulence(`OHT${ohtNum}-LT`);
    } else if (section === 'wtp') {
      checkLevelTurbulence('WTP-LT-CW');
    }

    // -- Ultra-MIV Rule 4: Impeller Wear / Low Pump Output Detector (FDHE Fallback) --
    if (section === 'wtp') {
      const flowIn = latestValues.get('WTP-Flow-IN') || 0;
      const kwVal = latestValues.get('WTP-KW') || 0;
      
      const checkPumpEfficiency = (ptId: string, pumpId: string) => {
        const ptVal = latestValues.get(ptId) || 0;
        const ptTag = tags.find(t => t.id === ptId);
        
        const isPtActive = ptTag && ptTag.status === 'connected' && ptVal > 1.8;
        const kwTag = tags.find(t => t.id === 'WTP-KW');
        const isKwActive = kwTag && kwTag.status === 'connected' && !kwTag.notInstalled && kwVal > 10.0;
        const kwMissing = !kwTag || kwTag.status !== 'connected' || kwTag.notInstalled;
        
        const isPumpRunning = isPtActive && (isKwActive || kwMissing);
        const flowTag = tags.find(t => t.id === 'WTP-Flow-IN');
        const isFlowLow = flowTag && flowTag.status === 'connected' && flowIn < 40.0;

        if (isPumpRunning && isFlowLow) {
          const effKey = `${pumpId}-Efficiency`;
          const effStart = alarmActiveSince.current.get(effKey);
          if (!effStart) {
            alarmActiveSince.current.set(effKey, nowTime);
          } else if (nowTime - effStart > 120000) {
            const msg = `Mechanical Alert: Low Pump Output suspected on ${pumpId} (Pressure: ${ptVal.toFixed(2)} Bar, flow: ${flowIn.toFixed(1)} m³/hr. ${kwMissing ? 'Note: Energy meter uninstalled/offline' : `Consumption: ${kwVal.toFixed(1)} kW`})`;
            addAlarm({
              tagId: pumpId, tagConfigId: ptTag?.dbId, label: pumpId,
              value: ptVal, unit: 'Bar', type: 'Low', message: msg,
              section: 'wtp',
            });
          }
        } else {
          alarmActiveSince.current.delete(`${pumpId}-Efficiency`);
        }
      };
      checkPumpEfficiency('WTP-PT1', 'WTP-Pump1');
      checkPumpEfficiency('WTP-PT2', 'WTP-Pump2');
    }

    // -- Ultra-MIV Rule 5: Sump / Reservoir Mass Balance Check --
    if (section === 'wtp') {
      const flowIn = latestValues.get('WTP-Flow-IN') || 0;
      const level = latestValues.get('WTP-LT-CW') || 0;
      
      const pump1Val = latestValues.get('WTP-Pump1') || 0;
      const pump2Val = latestValues.get('WTP-Pump2') || 0;
      const arePumpsOff = pump1Val === 0 && pump2Val === 0;
      
      const flowTag = tags.find(t => t.id === 'WTP-Flow-IN');
      const ltTag = tags.find(t => t.id === 'WTP-LT-CW');
      
      const isFlowActive = flowTag && flowTag.status === 'connected' && flowIn > 40.0;
      const isLtHealthy = ltTag && ltTag.status === 'connected';
      
      if (isFlowActive && isLtHealthy && arePumpsOff) {
        const tracker = massBalanceTracker.current.get('WTP-LT-CW');
        if (!tracker) {
          massBalanceTracker.current.set('WTP-LT-CW', { startLevel: level, timestamp: nowTime });
        } else if (nowTime - tracker.timestamp > 15 * 60 * 1000) { // 15 mins
          const levelDiff = level - tracker.startLevel;
          if (levelDiff < 1.0) { // level rose by < 1%
            const mbKey = 'WTP-SumpMassBalance';
            const mbStart = alarmActiveSince.current.get(mbKey);
            if (!mbStart) {
              alarmActiveSince.current.set(mbKey, nowTime);
              const msg = `Process Warning: Sump Mass Balance Discrepancy (Active inflow ${flowIn.toFixed(1)} m³/hr, pumps OFF, but level is not rising. Sump leak or level sensor fault suspected)`;
              addAlarm({
                tagId: 'WTP-LT-CW', tagConfigId: ltTag.dbId, label: 'CWR Level',
                value: level, unit: '%', type: 'Low', message: msg,
                section: 'wtp',
              });
            }
          } else {
            massBalanceTracker.current.set('WTP-LT-CW', { startLevel: level, timestamp: nowTime });
            alarmActiveSince.current.delete('WTP-SumpMassBalance');
          }
        }
      } else {
        massBalanceTracker.current.delete('WTP-LT-CW');
        alarmActiveSince.current.delete('WTP-SumpMassBalance');
      }
    }

    // -- Ultra-MIV Rule 6: OHT Mass Balance Check --
    if (section === 'oht') {
      const ohtNum = subsection?.match(/OHT-(\d+)/)?.[1];
      if (ohtNum) {
        const flowId = `OHT${ohtNum}-Flow-IN`;
        const ltId = `OHT${ohtNum}-LT`;
        
        const flowIn = latestValues.get(flowId) || 0;
        const level = latestValues.get(ltId) || 0;
        
        const flowTag = tags.find(t => t.id === flowId);
        const ltTag = tags.find(t => t.id === ltId);
        
        const isFlowActive = flowTag && flowTag.status === 'connected' && flowIn > 15.0;
        const isLtHealthy = ltTag && ltTag.status === 'connected';
        
        if (isFlowActive && isLtHealthy) {
          const tracker = massBalanceTracker.current.get(ltId);
          if (!tracker) {
            massBalanceTracker.current.set(ltId, { startLevel: level, timestamp: nowTime });
          } else if (nowTime - tracker.timestamp > 10 * 60 * 1000) { // 10 mins
            const levelDiff = level - tracker.startLevel;
            if (levelDiff < -2.0) { // level dropped by > 2% under inflow
              const mbKey = `${ltId}-MassBalance`;
              const mbStart = alarmActiveSince.current.get(mbKey);
              if (!mbStart) {
                alarmActiveSince.current.set(mbKey, nowTime);
                const msg = `Process Warning: OHT ${ohtNum} Mass Balance Discrepancy (Active inlet flow ${flowIn.toFixed(1)} m³/hr, but tank level is decreasing. Leakage or abnormal distribution suspected)`;
                addAlarm({
                  tagId: ltId, tagConfigId: ltTag.dbId, label: ltTag.label,
                  value: level, unit: '%', type: 'Low', message: msg,
                  section: 'oht',
                });
              }
            } else {
              massBalanceTracker.current.set(ltId, { startLevel: level, timestamp: nowTime });
              alarmActiveSince.current.delete(`${ltId}-MassBalance`);
            }
          }
        } else {
          massBalanceTracker.current.delete(ltId);
          alarmActiveSince.current.delete(`${ltId}-MassBalance`);
        }
      }
    }

    // -- Ultra-MIV Rule 7: Water Quality Potability Safety Alert --
    if (section === 'wtp') {
      const flowIn = latestValues.get('WTP-Flow-IN') || 0;
      const ph = latestValues.get('WTP-PH') || 7.0;
      const chlorine = latestValues.get('WTP-CL') || 0.5;
      const turbidity = latestValues.get('WTP-TA') || 1.0;
      
      const flowTag = tags.find(t => t.id === 'WTP-Flow-IN');
      const phTag = tags.find(t => t.id === 'WTP-PH');
      const clTag = tags.find(t => t.id === 'WTP-CL');
      const taTag = tags.find(t => t.id === 'WTP-TA');
      
      const isFlowActive = flowTag && flowTag.status === 'connected' && flowIn > 15.0;
      const isPhHealthy = phTag && phTag.status === 'connected';
      const isClHealthy = clTag && clTag.status === 'connected';
      const isTaHealthy = taTag && taTag.status === 'connected';
      
      if (isFlowActive && isPhHealthy && isClHealthy && isTaHealthy) {
        const isPhUnsafe = ph < 6.5 || ph > 8.5;
        const isClUnsafe = chlorine < 0.2 || chlorine > 1.5;
        const isTaUnsafe = turbidity > 5.0;
        
        if (isPhUnsafe || isClUnsafe || isTaUnsafe) {
          const wqKey = 'WTP-WaterQualitySafety';
          const wqStart = alarmActiveSince.current.get(wqKey);
          if (!wqStart) {
            alarmActiveSince.current.set(wqKey, nowTime);
          } else if (nowTime - wqStart > 600000) { // 10 minutes non-potable flow
            let reasonStr = '';
            if (isPhUnsafe) reasonStr += `pH ${ph.toFixed(2)} out of bounds (6.5-8.5). `;
            if (isClUnsafe) reasonStr += `Chlorine ${chlorine.toFixed(2)} mg/L out of bounds (0.2-1.5). `;
            if (isTaUnsafe) reasonStr += `Turbidity ${turbidity.toFixed(1)} NTU exceeds 5.0 limit. `;
            
            const msg = `Water Quality Alert: Active Water Pumping Violates Potable Standards! Reason: ${reasonStr.trim()} (Flow: ${flowIn.toFixed(1)} m³/hr)`;
            addAlarm({
              tagId: 'WTP-PH', tagConfigId: phTag.dbId, label: 'pH Analyzer',
              value: ph, unit: 'pH', type: 'High', message: msg,
              section: 'wtp',
            });
          }
        } else {
          alarmActiveSince.current.delete('WTP-WaterQualitySafety');
        }
      } else {
        alarmActiveSince.current.delete('WTP-WaterQualitySafety');
      }
    }

    // -- MIV Rule 1: Pump Dry-Run / Valve Blockage Detector (FDHE Fallback) --
    const checkDryRun = (ptId: string, pumpId: string, flowTagId: string, minFlow: number) => {
      const ptVal = latestValues.get(ptId) || 0;
      const flowVal = latestValues.get(flowTagId) || 0;
      const ptTag = tags.find(t => t.id === ptId);
      const flowTag = tags.find(t => t.id === flowTagId);

      const isPtHigh = ptTag && ptTag.status === 'connected' && ptVal > 1.8;
      const isFlowNearZero = flowTag && flowTag.status === 'connected' && flowVal < minFlow;

      if (isPtHigh && isFlowNearZero) {
        const dryKey = `${pumpId}-DryRun`;
        const dryStart = alarmActiveSince.current.get(dryKey);
        if (!dryStart) {
          alarmActiveSince.current.set(dryKey, nowTime);
        } else if (nowTime - dryStart > 60000) {
          const msg = `Mechanical Fault: Dry Run or Closed Discharge Valve suspected on ${pumpId} (High pressure ${ptVal.toFixed(2)} Bar, zero flow ${flowVal.toFixed(1)} m³/hr)`;
          addAlarm({
            tagId: pumpId, tagConfigId: ptTag?.dbId, label: pumpId,
            value: ptVal, unit: 'Bar', type: 'High', message: msg,
            section: section as 'intake' | 'wtp',
          });
        }
      } else {
        alarmActiveSince.current.delete(`${pumpId}-DryRun`);
      }
    };

    if (section === 'intake') {
      checkDryRun('INT-PT1', 'INT-Pump1', 'INT-Flow', 2.0);
      checkDryRun('INT-PT2', 'INT-Pump2', 'INT-Flow', 2.0);
    } else if (section === 'wtp') {
      checkDryRun('WTP-PT1', 'WTP-Pump1', 'WTP-Flow-IN', 2.0);
      checkDryRun('WTP-PT2', 'WTP-Pump2', 'WTP-Flow-IN', 2.0);
    }

    // -- MIV Rule 2 & 3: Flow active but pressure/level at 0 (Sensor Discrepancy) --
    if (section === 'intake') {
      const flowVal = latestValues.get('INT-Flow') || 0;
      const pt1 = latestValues.get('INT-PT1') || 0;
      const pt2 = latestValues.get('INT-PT2') || 0;
      const level = latestValues.get('INT-LT') || 0;

      const flowTag = tags.find(t => t.id === 'INT-Flow');
      const pt1Tag = tags.find(t => t.id === 'INT-PT1');
      const pt2Tag = tags.find(t => t.id === 'INT-PT2');
      const ltTag = tags.find(t => t.id === 'INT-LT');

      const isFlowActive = flowTag && flowTag.status === 'connected' && flowVal > 15.0;

      if (isFlowActive && pt1Tag && pt1Tag.status === 'connected' && pt2Tag && pt2Tag.status === 'connected' && pt1 < 0.2 && pt2 < 0.2) {
        const ptDiscKey = 'INT-PTDiscrepancy';
        const ptDiscStart = alarmActiveSince.current.get(ptDiscKey);
        if (!ptDiscStart) {
          alarmActiveSince.current.set(ptDiscKey, nowTime);
        } else if (nowTime - ptDiscStart > 30000) {
          const msg = `Telemetry Fault: Intake Pressure Transmitters Discrepancy (Flow active ${flowVal.toFixed(1)} m³/hr, but both pressures read < 0.2 Bar)`;
          addAlarm({
            tagId: 'INT-CombinedPT', tagConfigId: pt1Tag.dbId, label: 'Combined Pressure',
            value: 0, unit: 'Bar', type: 'Low', message: msg,
            section: 'intake',
          });
        }
      } else {
        alarmActiveSince.current.delete('INT-PTDiscrepancy');
      }

      if (isFlowActive && ltTag && ltTag.status === 'connected' && level < 0.35) { // 5% of 7m is 0.35m
        const ltDiscKey = 'INT-LTDiscrepancy';
        const ltDiscStart = alarmActiveSince.current.get(ltDiscKey);
        if (!ltDiscStart) {
          alarmActiveSince.current.set(ltDiscKey, nowTime);
        } else if (nowTime - ltDiscStart > 30000) {
          const msg = `Telemetry Fault: Intake Suction Level Discrepancy (Flow active ${flowVal.toFixed(1)} m³/hr, but level sensor reads near-empty ${level.toFixed(2)}m)`;
          addAlarm({
            tagId: 'INT-LT', tagConfigId: ltTag.dbId, label: 'Intake Level',
            value: level, unit: 'm', type: 'Low', message: msg,
            section: 'intake',
          });
        }
      } else {
        alarmActiveSince.current.delete('INT-LTDiscrepancy');
      }
    } else if (section === 'wtp') {
      const flowVal = latestValues.get('WTP-Flow-IN') || 0;
      const pt1 = latestValues.get('WTP-PT1') || 0;
      const pt2 = latestValues.get('WTP-PT2') || 0;
      const level = latestValues.get('WTP-LT-CW') || 0;

      const flowTag = tags.find(t => t.id === 'WTP-Flow-IN');
      const pt1Tag = tags.find(t => t.id === 'WTP-PT1');
      const pt2Tag = tags.find(t => t.id === 'WTP-PT2');
      const ltTag = tags.find(t => t.id === 'WTP-LT-CW');

      const isFlowActive = flowTag && flowTag.status === 'connected' && flowVal > 15.0;

      if (isFlowActive && pt1Tag && pt1Tag.status === 'connected' && pt2Tag && pt2Tag.status === 'connected' && pt1 < 0.2 && pt2 < 0.2) {
        const ptDiscKey = 'WTP-PTDiscrepancy';
        const ptDiscStart = alarmActiveSince.current.get(ptDiscKey);
        if (!ptDiscStart) {
          alarmActiveSince.current.set(ptDiscKey, nowTime);
        } else if (nowTime - ptDiscStart > 30000) {
          const msg = `Telemetry Fault: WTP Discharge Pressures Discrepancy (Flow active ${flowVal.toFixed(1)} m³/hr, but both pressures read < 0.2 Bar)`;
          addAlarm({
            tagId: 'WTP-CombinedPT1', tagConfigId: pt1Tag.dbId, label: 'Combined Pressure',
            value: 0, unit: 'Bar', type: 'Low', message: msg,
            section: 'wtp',
          });
        }
      } else {
        alarmActiveSince.current.delete('WTP-PTDiscrepancy');
      }

      if (isFlowActive && ltTag && ltTag.status === 'connected' && level < 5.0) { // 5% of 100% CWR
        const ltDiscKey = 'WTP-LTDiscrepancy';
        const ltDiscStart = alarmActiveSince.current.get(ltDiscKey);
        if (!ltDiscStart) {
          alarmActiveSince.current.set(ltDiscKey, nowTime);
        } else if (nowTime - ltDiscStart > 30000) {
          const msg = `Telemetry Fault: WTP CWR Level Discrepancy (Flow active ${flowVal.toFixed(1)} m³/hr, but level sensor reads near-empty ${level.toFixed(1)}%)`;
          addAlarm({
            tagId: 'WTP-LT-CW', tagConfigId: ltTag.dbId, label: 'CWR Level',
            value: level, unit: '%', type: 'Low', message: msg,
            section: 'wtp',
          });
        }
      } else {
        alarmActiveSince.current.delete('WTP-LTDiscrepancy');
      }
    }

  }, [intakeTags, ohtTags, wtpTags, setIntakeTags, setOhtTags, setWtpTags, addAlarm]);

  return { processMqttMessage, startBatchWriter };
};
