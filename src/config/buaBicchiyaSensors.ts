/**
 * BUA BICCHIYA SCADA - COMPLETE SENSOR CONFIGURATION
 * 
 * MQTT topic paths are loaded securely from the database at runtime.
 * Only topic keys (OHT1, OHT2, OHT3, INTAKE, WTP) are defined here.
 * 
 * OHT (×3): PT, Level, Flow In, Flow Out, Totalizer (computed)
 * Intake: PT1, PT2, CombinedPT, Level, Flow, Totalizer (computed), KW (not installed), Pump1, Pump2 (derived from PT)
 * WTP: PT1-PT4, CombinedPT1, CombinedPT2, LT_BW, LT_CW, Flow_IN, Flow_OUT, Totalizer (computed),
 *       PH_IN, TA_IN, PH, CL, TA, KW (not installed), Pump1-Pump4 (derived from PT)
 */

export type SectionType = 'oht' | 'intake' | 'wtp';

export interface BuaBicchiyaSensor {
  id: string;
  mqttKey: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  section: SectionType;
  subsection?: string;
  type: 'analog' | 'digital' | 'totalizer';
  instrumentType: 'pt' | 'lt' | 'flow' | 'totalizer' | 'valve' | 'kw' | 'pump' | 'ph' | 'turbidity' | 'chlorine' | 'fcv' | 'combined_pt';
  notInstalled?: boolean;
  /** If this is a pump, which PT sensor ID drives its ON/OFF status */
  derivedFromPt?: string;
}

// ==================== OHT SENSORS ====================
// Each OHT has: PT, Level, Flow In, Flow Out, Totalizer (computed)
const createOhtSensors = (ohtNum: number): BuaBicchiyaSensor[] => {
  const prefix = `OHT${ohtNum}`;
  const sub = `OHT-${ohtNum}`;
  return [
    { id: `${prefix}-PT`, mqttKey: 'PT', label: 'Pressure (PT)', unit: 'Bar', min: 0, max: 10, section: 'oht', subsection: sub, type: 'analog', instrumentType: 'pt' },
    { id: `${prefix}-LT`, mqttKey: 'LEVEL', label: 'Level (LT)', unit: '%', min: 0, max: 100, section: 'oht', subsection: sub, type: 'analog', instrumentType: 'lt' },
    { id: `${prefix}-Flow-IN`, mqttKey: 'FLOW_IN', label: 'Flow Meter (Inlet)', unit: 'm³/hr', min: 0, max: 50, section: 'oht', subsection: sub, type: 'analog', instrumentType: 'flow' },
    { id: `${prefix}-Flow-OUT`, mqttKey: 'FLOW_OUT', label: 'Flow Meter (Outlet)', unit: 'm³/hr', min: 0, max: 50, section: 'oht', subsection: sub, type: 'analog', instrumentType: 'flow', notInstalled: true },
    { id: `${prefix}-FCV`, mqttKey: 'FCV', label: 'Flow Control Valve', unit: '%', min: 0, max: 100, section: 'oht', subsection: sub, type: 'analog', instrumentType: 'fcv', notInstalled: true },
    { id: `${prefix}-Totalizer`, mqttKey: '', label: 'Totalizer', unit: 'm³', min: 0, max: 999999, section: 'oht', subsection: sub, type: 'totalizer', instrumentType: 'totalizer' },
  ];
};

export const OHT1_SENSORS = createOhtSensors(1);
export const OHT2_SENSORS = createOhtSensors(2);
export const OHT3_SENSORS = createOhtSensors(3);
export const ALL_OHT_SENSORS = [...OHT1_SENSORS, ...OHT2_SENSORS, ...OHT3_SENSORS];

// ==================== INTAKE SENSORS ====================
// PT1, PT2, CombinedPT, Level, Flow, Totalizer (computed), KW (not installed), 2 VT Pumps (derived from PT)
export const INTAKE_SENSORS: BuaBicchiyaSensor[] = [
  { id: 'INT-PT1', mqttKey: 'PT_01', label: 'Pressure 1 (PT)', unit: 'Bar', min: 0, max: 10, section: 'intake', type: 'analog', instrumentType: 'pt' },
  { id: 'INT-PT2', mqttKey: 'PT_02', label: 'Pressure 2 (PT)', unit: 'Bar', min: 0, max: 10, section: 'intake', type: 'analog', instrumentType: 'pt' },
  { id: 'INT-CombinedPT', mqttKey: 'PT_COM', label: 'Combined Pressure (P1+P2)', unit: 'Bar', min: 0, max: 10, section: 'intake', type: 'analog', instrumentType: 'combined_pt' },
  { id: 'INT-LT', mqttKey: 'LEVEL', label: 'Level (LT)', unit: '%', min: 0, max: 100, section: 'intake', type: 'analog', instrumentType: 'lt' },
  { id: 'INT-Flow', mqttKey: 'FLOW', label: 'Flow Meter', unit: 'm³/hr', min: 0, max: 200, section: 'intake', type: 'analog', instrumentType: 'flow' },
  { id: 'INT-Totalizer', mqttKey: '', label: 'Totalizer', unit: 'm³', min: 0, max: 999999, section: 'intake', type: 'totalizer', instrumentType: 'totalizer' },
  { id: 'INT-KW', mqttKey: 'KW', label: 'Energy Meter', unit: 'kW', min: 0, max: 100, section: 'intake', type: 'analog', instrumentType: 'kw' },
  { id: 'INT-Pump1', mqttKey: '', label: 'VT Pump 1', unit: '', min: 0, max: 1, section: 'intake', type: 'digital', instrumentType: 'pump', derivedFromPt: 'INT-PT1' },
  { id: 'INT-Pump2', mqttKey: '', label: 'VT Pump 2', unit: '', min: 0, max: 1, section: 'intake', type: 'digital', instrumentType: 'pump', derivedFromPt: 'INT-PT2' },
];

// ==================== WTP SENSORS ====================
export const WTP_SENSORS: BuaBicchiyaSensor[] = [
  // Levels
  { id: 'WTP-LT-BW', mqttKey: 'BW_LEVEL', label: 'Level - Backwash', unit: '%', min: 0, max: 100, section: 'wtp', type: 'analog', instrumentType: 'lt', notInstalled: true },
  { id: 'WTP-LT-CW', mqttKey: 'CWR_LEVEL', label: 'Level - Clear Water', unit: '%', min: 0, max: 100, section: 'wtp', type: 'analog', instrumentType: 'lt' },
  // Pressures (2 individual PTs + 1 combined)
  { id: 'WTP-PT1', mqttKey: 'PT_01', label: 'HT Pump 1 PT', unit: 'Bar', min: 0, max: 10, section: 'wtp', type: 'analog', instrumentType: 'pt' },
  { id: 'WTP-PT2', mqttKey: 'PT_02', label: 'HT Pump 2 PT', unit: 'Bar', min: 0, max: 10, section: 'wtp', type: 'analog', instrumentType: 'pt' },
  { id: 'WTP-CombinedPT1', mqttKey: 'PT_03', label: 'Combined Pressure (P1+P2)', unit: 'Bar', min: 0, max: 10, section: 'wtp', type: 'analog', instrumentType: 'combined_pt' },
  { id: 'WTP-PT3', mqttKey: 'CWR_PT_04', label: 'HT Pump 3 PT', unit: 'Bar', min: 0, max: 10, section: 'wtp', type: 'analog', instrumentType: 'pt', notInstalled: true },
  { id: 'WTP-PT4', mqttKey: 'CWR_PT_05', label: 'HT Pump 4 PT', unit: 'Bar', min: 0, max: 10, section: 'wtp', type: 'analog', instrumentType: 'pt', notInstalled: true },
  { id: 'WTP-CombinedPT2', mqttKey: 'CWR_PT_06', label: 'Combined Pressure (P3+P4)', unit: 'Bar', min: 0, max: 10, section: 'wtp', type: 'analog', instrumentType: 'combined_pt', notInstalled: true },
  // Flow (Inlet + Outlet)
  { id: 'WTP-Flow-IN', mqttKey: 'FLOW', label: 'Flow Meter (Inlet)', unit: 'm³/hr', min: 0, max: 200, section: 'wtp', type: 'analog', instrumentType: 'flow' },
  { id: 'WTP-Flow-OUT', mqttKey: 'FLOW_OUT', label: 'Flow Meter (Outlet)', unit: 'm³/hr', min: 0, max: 200, section: 'wtp', type: 'analog', instrumentType: 'flow', notInstalled: true },
  { id: 'WTP-Totalizer', mqttKey: 'TOTALIZER', label: 'Totalizer', unit: 'm³', min: 0, max: 999999, section: 'wtp', type: 'totalizer', instrumentType: 'totalizer' },
  // Inlet analyzers (not installed in this WTP)
  { id: 'WTP-PH-IN', mqttKey: 'RAW_PH', label: 'pH Analyzer (Inlet)', unit: 'pH', min: 0, max: 14, section: 'wtp', subsection: 'inlet', type: 'analog', instrumentType: 'ph', notInstalled: true },
  { id: 'WTP-TA-IN', mqttKey: 'RAW_TR', label: 'Turbidity (Inlet)', unit: 'NTU', min: 0, max: 100, section: 'wtp', subsection: 'inlet', type: 'analog', instrumentType: 'turbidity', notInstalled: true },
  // Outlet analyzers
  { id: 'WTP-PH', mqttKey: 'PH', label: 'pH Analyzer (Outlet)', unit: 'pH', min: 0, max: 14, section: 'wtp', subsection: 'outlet', type: 'analog', instrumentType: 'ph' },
  { id: 'WTP-CL', mqttKey: 'CL', label: 'Chlorine (Outlet)', unit: 'mg/L', min: 0, max: 5, section: 'wtp', subsection: 'outlet', type: 'analog', instrumentType: 'chlorine' },
  { id: 'WTP-TA', mqttKey: 'TR', label: 'Turbidity (Outlet)', unit: 'NTU', min: 0, max: 100, section: 'wtp', subsection: 'outlet', type: 'analog', instrumentType: 'turbidity' },
  // Energy Meter (MFM) - Active
  { id: 'WTP-KW', mqttKey: 'KW', label: 'Energy Meter (MFM)', unit: 'kW', min: 0, max: 100, section: 'wtp', type: 'analog', instrumentType: 'kw' },
  // Pumps (derived from PT status — no MQTT key)
  { id: 'WTP-Pump1', mqttKey: '', label: 'HT Pump 1', unit: '', min: 0, max: 1, section: 'wtp', type: 'digital', instrumentType: 'pump', derivedFromPt: 'WTP-PT1' },
  { id: 'WTP-Pump2', mqttKey: '', label: 'HT Pump 2', unit: '', min: 0, max: 1, section: 'wtp', type: 'digital', instrumentType: 'pump', derivedFromPt: 'WTP-PT2' },
  { id: 'WTP-Pump3', mqttKey: '', label: 'HT Pump 3', unit: '', min: 0, max: 1, section: 'wtp', type: 'digital', instrumentType: 'pump', derivedFromPt: 'WTP-PT3', notInstalled: true },
  { id: 'WTP-Pump4', mqttKey: '', label: 'HT Pump 4', unit: '', min: 0, max: 1, section: 'wtp', type: 'digital', instrumentType: 'pump', derivedFromPt: 'WTP-PT4', notInstalled: true },
];

// ==================== ALL SENSORS ====================
export const ALL_SENSORS = [...ALL_OHT_SENSORS, ...INTAKE_SENSORS, ...WTP_SENSORS];

// ==================== PT → PUMP DERIVATION MAP ====================
// When PT > 0, corresponding pump is ON
export const PT_TO_PUMP_MAP: Record<string, string> = {};
ALL_SENSORS.filter(s => s.derivedFromPt).forEach(pump => {
  PT_TO_PUMP_MAP[pump.derivedFromPt!] = pump.id;
});

// ==================== MQTT TOPICS ====================
export const MQTT_TOPIC_KEYS = ['OHT1','OHT2','OHT3','INTAKE','WTP'] as const;

// Default topics for Bua Bicchiya plant — overridable from DB config
export const DEFAULT_MQTT_TOPICS: Record<string, string> = {
  INTAKE: 'Orbit/BICHIYA/INTAKE/0000000001',
  WTP:    'Orbit/BICHIYA/WTP/0000000001',
  OHT1:   'Orbit/BICHIYA/OHT01/0000000001',
  OHT2:   'Orbit/BICHIYA/OHT02/0000000001',
  OHT3:   'Orbit/BICHIYA/OHT03/0000000001',
};

// Mutable map — initialized with defaults, may be overridden from DB
export const MQTT_TOPICS: Record<string, string> = { ...DEFAULT_MQTT_TOPICS };

// Built dynamically when topics are loaded from DB
export const TOPIC_TO_SECTION: Record<string, { section: SectionType; subsection?: string }> = {};

export const ALL_MQTT_TOPICS: string[] = [];

/** Called by MqttContext after loading topics from database */
export const setTopicsFromDb = (topics: Record<string, string>) => {
  for (const [key, val] of Object.entries(topics)) {
    if (val) MQTT_TOPICS[key] = val;
  }
  for (const k in TOPIC_TO_SECTION) delete TOPIC_TO_SECTION[k];
  const sectionMap: Record<string, { section: SectionType; subsection?: string }> = {
    OHT1: { section: 'oht', subsection: 'OHT-1' },
    OHT2: { section: 'oht', subsection: 'OHT-2' },
    OHT3: { section: 'oht', subsection: 'OHT-3' },
    INTAKE: { section: 'intake' },
    WTP: { section: 'wtp' },
  };
  for (const [key, topic] of Object.entries(MQTT_TOPICS)) {
    if (topic && sectionMap[key]) {
      TOPIC_TO_SECTION[topic] = sectionMap[key];
    }
  }
  ALL_MQTT_TOPICS.length = 0;
  ALL_MQTT_TOPICS.push(...Object.values(MQTT_TOPICS).filter(Boolean));
};

// Get sensors for a specific subsection
export const getSensorsForSubsection = (subsection: string): BuaBicchiyaSensor[] => {
  return ALL_SENSORS.filter(s => s.subsection === subsection);
};

// Get sensors for a section
export const getSensorsForSection = (section: SectionType): BuaBicchiyaSensor[] => {
  return ALL_SENSORS.filter(s => s.section === section);
};

// Get analog sensors only (for trends)
export const getAnalogSensors = (section: SectionType, subsection?: string): BuaBicchiyaSensor[] => {
  return ALL_SENSORS.filter(s => 
    s.section === section && 
    s.type === 'analog' && 
    (!subsection || s.subsection === subsection)
  );
};

// Get pump sensors
export const getPumpSensors = (section: SectionType): BuaBicchiyaSensor[] => {
  return ALL_SENSORS.filter(s => s.section === section && s.instrumentType === 'pump');
};

// Valid MQTT keys per section (only keys that actually come from MQTT)
export const VALID_OHT_KEYS = ['PT', 'LEVEL', 'FLOW_IN', 'FLOW_OUT', 'FCV'];
export const VALID_INTAKE_KEYS = ['PT_01', 'PT_02', 'PT_COM', 'LEVEL', 'FLOW', 'KW'];
export const VALID_WTP_KEYS = ['CWR_LEVEL', 'BW_LEVEL', 'PT_01', 'PT_02', 'PT_03', 'CWR_PT_04', 'CWR_PT_05', 'CWR_PT_06', 'FLOW', 'FLOW_IN', 'FLOW_OUT', 'PH', 'CL', 'TR', 'RAW_PH', 'RAW_TR', 'CW_PH', 'CW_CL', 'CW_TR', 'TOTALIZER', 'KW'];
