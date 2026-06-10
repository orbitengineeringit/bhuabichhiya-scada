import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logError, logDebug } from '@/lib/errorLogger';
import {
  ALL_OHT_SENSORS, INTAKE_SENSORS, WTP_SENSORS, ALL_SENSORS,
  BuaBicchiyaSensor, OHT1_SENSORS, OHT2_SENSORS, OHT3_SENSORS,
} from '@/config/buaBicchiyaSensors';

/** Get default setpoints based on instrument type and range */
const getDefaultSetpoints = (sensor: BuaBicchiyaSensor): { high: number | null; low: number | null } => {
  switch (sensor.instrumentType) {
    case 'pt': // Pressure: high at 80% of max, low at 10% of max
      return { high: sensor.max * 0.8, low: sensor.max * 0.1 };
    case 'lt': // Level: high at 90%, low at 15%
      return { high: sensor.max * 0.9, low: sensor.max * 0.15 };
    case 'flow': // Flow: high at 90% of max, low at 0 (no low alarm)
      return { high: sensor.max * 0.9, low: null };
    case 'ph': // pH: normal range 6.5-8.5
      return { high: 8.5, low: 6.5 };
    case 'turbidity': // Turbidity: high alarm only
      return { high: sensor.section === 'wtp' && sensor.id.includes('TA-IN') ? 50 : 5, low: null };
    case 'chlorine': // Chlorine: 0.2-1.0 mg/L safe range
      return { high: 1.0, low: 0.2 };
    case 'combined_pt': // Combined pressure
      return { high: sensor.max * 0.8, low: sensor.max * 0.1 };
    default:
      return { high: null, low: null };
  }
};

export interface AlarmSettings {
  highSetpoint?: number;
  lowSetpoint?: number;
  alarmEnabled: boolean;
  alarmEmails: string[];
}

export interface TagData {
  id: string;
  label: string;
  value: number;
  unit: string;
  timestamp: Date;
  min: number;
  max: number;
  isActive: boolean;
  dbId?: string;
  source?: 'mqtt' | 'simulated';
  mqttTopic?: string;
  highSetpoint?: number;
  lowSetpoint?: number;
  alarmEmails?: string[];
  alarmEnabled?: boolean;
  lastDataTime?: Date;
  status?: 'connected' | 'disconnected' | 'unknown';
  mqttKey?: string;
  section?: 'oht' | 'intake' | 'wtp';
  subsection?: string;
  instrumentType?: string;
  sensorType?: 'analog' | 'digital' | 'totalizer';
  notInstalled?: boolean;
}

interface ScadaState {
  plantName: string;
  intakeTags: TagData[];
  ohtTags: TagData[];
  wtpTags: TagData[];
  configMode: boolean;
  isLoading: boolean;
  mqttEnabled: boolean;
}

interface ScadaContextType extends ScadaState {
  setPlantName: (name: string) => void;
  setConfigMode: (mode: boolean) => void;
  updateTagSetpoints: (section: 'intake' | 'oht' | 'wtp', tagId: string, high?: number, low?: number) => void;
  updateTagAlarmSettings: (section: 'intake' | 'oht' | 'wtp', tagId: string, settings: AlarmSettings) => void;
  getActiveTagCount: () => number;
  setIntakeTags: React.Dispatch<React.SetStateAction<TagData[]>>;
  setOhtTags: React.Dispatch<React.SetStateAction<TagData[]>>;
  setWtpTags: React.Dispatch<React.SetStateAction<TagData[]>>;
  setMqttEnabled: (enabled: boolean) => void;
}

const sensorToTag = (sensor: BuaBicchiyaSensor): TagData => ({
  id: sensor.id,
  label: sensor.label,
  unit: sensor.unit,
  min: sensor.min,
  max: sensor.max,
  mqttKey: sensor.mqttKey,
  value: 0,
  timestamp: new Date(),
  isActive: true,
  status: 'unknown' as const,
  section: sensor.section,
  subsection: sensor.subsection,
  instrumentType: sensor.instrumentType,
  sensorType: sensor.type,
  notInstalled: sensor.notInstalled,
});

const ScadaContext = createContext<ScadaContextType | undefined>(undefined);

export const ScadaProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [plantName, setPlantNameState] = useState('Bhua Bicchiya SCADA');
  const [configMode, setConfigModeState] = useState(false);
  const [intakeTags, setIntakeTags] = useState<TagData[]>(() => INTAKE_SENSORS.map(sensorToTag));
  const [ohtTags, setOhtTags] = useState<TagData[]>(() => ALL_OHT_SENSORS.map(sensorToTag));
  const [wtpTags, setWtpTags] = useState<TagData[]>(() => WTP_SENSORS.map(sensorToTag));
  const [isLoading, setIsLoading] = useState(true);
  const [mqttEnabled, setMqttEnabled] = useState(true);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [plantResult, tagResult] = await Promise.all([
          supabase.from('plant_config').select('*').limit(1).maybeSingle(),
          supabase.from('tag_config').select('*'),
        ]);
        if (plantResult.data) setPlantNameState(plantResult.data.plant_name);
        const tagConfigsInitial = tagResult.data;

        const allSensors = [...INTAKE_SENSORS, ...ALL_OHT_SENSORS, ...WTP_SENSORS];

        const existingSet = new Set((tagConfigsInitial || []).map(c => `${c.section}-${c.tag_id}`));
        const missingSensors = allSensors.filter(s => !existingSet.has(`${s.section}-${s.id}`));

        let tagConfigs = tagConfigsInitial || [];

        if (missingSensors.length > 0) {
          const insertData = missingSensors.map(s => {
            const defaults = getDefaultSetpoints(s);
            return {
              section: s.section,
              tag_id: s.id,
              label: s.label,
              unit: s.unit,
              is_active: true,
              activated_at: new Date().toISOString(),
              high_setpoint: defaults.high,
              low_setpoint: defaults.low,
              alarm_enabled: false,
              alarm_emails: [],
            };
          });

          const { data: created, error } = await supabase.from('tag_config').insert(insertData).select('*');
          if (error) logError('ScadaContext.createTagConfigs', error);
          else if (created) tagConfigs = [...tagConfigs, ...created];
        }

        const applyConfig = (tags: TagData[], section: string) => {
          const configs = tagConfigs.filter(t => t.section === section);
          return tags.map(tag => {
            const config = configs.find(c => c.tag_id === tag.id);
            return {
              ...tag,
              dbId: config?.id,
              highSetpoint: config?.high_setpoint ? Number(config.high_setpoint) : undefined,
              lowSetpoint: config?.low_setpoint ? Number(config.low_setpoint) : undefined,
              alarmEmails: (config as any)?.alarm_emails || [],
              alarmEnabled: config?.alarm_enabled ?? false,
            };
          });
        };

        setIntakeTags(prev => applyConfig(prev, 'intake'));
        setOhtTags(prev => applyConfig(prev, 'oht'));
        setWtpTags(prev => applyConfig(prev, 'wtp'));
      } catch (error) {
        logError('ScadaContext.loadConfig', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadConfig();
  }, []);

  const setPlantName = useCallback(async (name: string) => {
    setPlantNameState(name);
    try {
      const { data: existing } = await supabase.from('plant_config').select('id').limit(1).maybeSingle();
      if (existing) await supabase.from('plant_config').update({ plant_name: name }).eq('id', existing.id);
    } catch (error) {
      logError('ScadaContext.setPlantName', error);
    }
  }, []);

  const setConfigMode = useCallback((mode: boolean) => setConfigModeState(mode), []);

  const updateTagSetpoints = useCallback(async (section: 'intake' | 'oht' | 'wtp', tagId: string, high?: number, low?: number) => {
    const setter = section === 'intake' ? setIntakeTags : section === 'wtp' ? setWtpTags : setOhtTags;
    const tags = section === 'intake' ? intakeTags : section === 'wtp' ? wtpTags : ohtTags;
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;
    if (tag.dbId) {
      await supabase.from('tag_config').update({ high_setpoint: high || null, low_setpoint: low || null }).eq('id', tag.dbId);
    }
    setter(prev => prev.map(t => t.id === tagId ? { ...t, highSetpoint: high, lowSetpoint: low } : t));
  }, [intakeTags, ohtTags, wtpTags]);

  const updateTagAlarmSettings = useCallback(async (section: 'intake' | 'oht' | 'wtp', tagId: string, settings: AlarmSettings) => {
    const setter = section === 'intake' ? setIntakeTags : section === 'wtp' ? setWtpTags : setOhtTags;
    setter(prev => prev.map(t =>
      t.id === tagId ? { ...t, highSetpoint: settings.highSetpoint, lowSetpoint: settings.lowSetpoint,
        alarmEnabled: settings.alarmEnabled, alarmEmails: settings.alarmEmails } : t
    ));
  }, []);

  const getActiveTagCount = useCallback(() => {
    return [...intakeTags, ...ohtTags, ...wtpTags].filter(t => t.isActive).length;
  }, [intakeTags, ohtTags, wtpTags]);

  return (
    <ScadaContext.Provider value={{
      plantName, intakeTags, ohtTags, wtpTags, configMode, isLoading, mqttEnabled,
      setPlantName, setConfigMode, updateTagSetpoints, updateTagAlarmSettings,
      getActiveTagCount, setIntakeTags, setOhtTags, setWtpTags, setMqttEnabled,
    }}>
      {children}
    </ScadaContext.Provider>
  );
};

export const useScada = (): ScadaContextType => {
  const context = useContext(ScadaContext);
  if (!context) throw new Error('useScada must be used within a ScadaProvider');
  return context;
};
