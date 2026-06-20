import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import mqtt from "npm:mqtt@5.10.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type Section = "intake" | "wtp" | "oht";
type Sensor = {
  id: string;
  mqttKey: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  section: Section;
  subsection?: string;
  instrumentType: "pt" | "lt" | "flow" | "totalizer" | "kw" | "ph" | "turbidity" | "chlorine" | "pump" | "combined_pt";
};
type MqttConfig = {
  broker_url: string | null;
  client_id: string | null;
  intake_topic: string | null;
  wtp_topic: string | null;
  oht_topic: string | null;
  oht_topic_2: string | null;
  oht_topic_3: string | null;
};
type ParsedMessage = {
  topic: string;
  payload: Record<string, string | number>;
  section: Section | "unknown";
  subsection?: string;
  timestamp: Date;
};

const DEFAULT_TOPICS = {
  INTAKE: "Orbit/BICHIYA/INTAKE/0000000001",
  WTP: "Orbit/BICHIYA/WTP/0000000001",
  OHT1: "Orbit/BICHIYA/OHT01/0000000001",
  OHT2: "Orbit/BICHIYA/OHT02/0000000001",
  OHT3: "Orbit/BICHIYA/OHT03/0000000001",
};

const ohtSensors = (n: number): Sensor[] => {
  const prefix = `OHT${n}`;
  const subsection = `OHT-${n}`;
  return [
    { id: `${prefix}-PT`, mqttKey: "PT_01", label: "Pressure (PT)", unit: "Bar", min: 0, max: 10, section: "oht", subsection, instrumentType: "pt" },
    { id: `${prefix}-LT`, mqttKey: "LEVEL", label: "Level (LT)", unit: "%", min: 0, max: 100, section: "oht", subsection, instrumentType: "lt" },
    { id: `${prefix}-Flow-IN`, mqttKey: "FLOW", label: "Flow Meter (Inlet)", unit: "m³/hr", min: 0, max: 50, section: "oht", subsection, instrumentType: "flow" },
    { id: `${prefix}-Flow-OUT`, mqttKey: "FLOW_OUT", label: "Flow Meter (Outlet)", unit: "m³/hr", min: 0, max: 50, section: "oht", subsection, instrumentType: "flow" },
    { id: `${prefix}-Totalizer`, mqttKey: "TOTALIZER", label: "Totalizer", unit: "m³", min: 0, max: 999999, section: "oht", subsection, instrumentType: "totalizer" },
  ];
};

const SENSORS: Sensor[] = [
  ...ohtSensors(1), ...ohtSensors(2), ...ohtSensors(3),
  { id: "INT-PT1", mqttKey: "PT_01", label: "Pressure 1 (PT)", unit: "Bar", min: 0, max: 10, section: "intake", instrumentType: "pt" },
  { id: "INT-PT2", mqttKey: "PT_02", label: "Pressure 2 (PT)", unit: "Bar", min: 0, max: 10, section: "intake", instrumentType: "pt" },
  { id: "INT-CombinedPT", mqttKey: "PT_03", label: "Combined Pressure (P1+P2)", unit: "Bar", min: 0, max: 10, section: "intake", instrumentType: "combined_pt" },
  { id: "INT-LT", mqttKey: "LEVEL", label: "Level (LT)", unit: "Meter", min: 0, max: 7, section: "intake", instrumentType: "lt" },
  { id: "INT-Flow", mqttKey: "FLOW", label: "Flow Meter", unit: "m³/hr", min: 0, max: 200, section: "intake", instrumentType: "flow" },
  { id: "INT-Totalizer", mqttKey: "TOTALIZER", label: "Totalizer", unit: "m³", min: 0, max: 999999, section: "intake", instrumentType: "totalizer" },
  { id: "INT-KW", mqttKey: "KW", label: "Energy Meter", unit: "kW", min: 0, max: 100, section: "intake", instrumentType: "kw" },
  { id: "INT-Pump1", mqttKey: "", label: "VT Pump 1", unit: "", min: 0, max: 1, section: "intake", instrumentType: "pump" },
  { id: "INT-Pump2", mqttKey: "", label: "VT Pump 2", unit: "", min: 0, max: 1, section: "intake", instrumentType: "pump" },
  { id: "WTP-LT-BW", mqttKey: "BW_LEVEL", label: "Level - Backwash", unit: "%", min: 0, max: 100, section: "wtp", instrumentType: "lt" },
  { id: "WTP-LT-CW", mqttKey: "CWR_LEVEL", label: "Level - Clear Water", unit: "%", min: 0, max: 100, section: "wtp", instrumentType: "lt" },
  { id: "WTP-PT1", mqttKey: "PT_01", label: "HT Pump 1 PT", unit: "Bar", min: 0, max: 10, section: "wtp", instrumentType: "pt" },
  { id: "WTP-PT2", mqttKey: "PT_02", label: "HT Pump 2 PT", unit: "Bar", min: 0, max: 10, section: "wtp", instrumentType: "pt" },
  { id: "WTP-CombinedPT1", mqttKey: "PT_03", label: "Combined Pressure (P1+P2)", unit: "Bar", min: 0, max: 10, section: "wtp", instrumentType: "combined_pt" },
  { id: "WTP-PT3", mqttKey: "CWR_PT_04", label: "HT Pump 3 PT", unit: "Bar", min: 0, max: 10, section: "wtp", instrumentType: "pt" },
  { id: "WTP-PT4", mqttKey: "CWR_PT_05", label: "HT Pump 4 PT", unit: "Bar", min: 0, max: 10, section: "wtp", instrumentType: "pt" },
  { id: "WTP-CombinedPT2", mqttKey: "CWR_PT_06", label: "Combined Pressure (P3+P4)", unit: "Bar", min: 0, max: 10, section: "wtp", instrumentType: "combined_pt" },
  { id: "WTP-Flow-IN", mqttKey: "FLOW", label: "Flow Meter (Inlet)", unit: "m³/hr", min: 0, max: 200, section: "wtp", instrumentType: "flow" },
  { id: "WTP-Flow-OUT", mqttKey: "FLOW_OUT", label: "Flow Meter (Outlet)", unit: "m³/hr", min: 0, max: 200, section: "wtp", instrumentType: "flow" },
  { id: "WTP-Totalizer", mqttKey: "TOTALIZER", label: "Totalizer", unit: "m³", min: 0, max: 999999, section: "wtp", instrumentType: "totalizer" },
  { id: "WTP-PH-IN", mqttKey: "RAW_PH", label: "pH Analyzer (Inlet)", unit: "pH", min: 0, max: 14, section: "wtp", instrumentType: "ph" },
  { id: "WTP-TA-IN", mqttKey: "RAW_TR", label: "Turbidity (Inlet)", unit: "NTU", min: 0, max: 100, section: "wtp", instrumentType: "turbidity" },
  { id: "WTP-PH", mqttKey: "PH", label: "pH Analyzer (Outlet)", unit: "pH", min: 0, max: 14, section: "wtp", instrumentType: "ph" },
  { id: "WTP-CL", mqttKey: "CL", label: "Chlorine (Outlet)", unit: "mg/L", min: 0, max: 5, section: "wtp", instrumentType: "chlorine" },
  { id: "WTP-TA", mqttKey: "TR", label: "Turbidity (Outlet)", unit: "NTU", min: 0, max: 100, section: "wtp", instrumentType: "turbidity" },
  { id: "WTP-KW", mqttKey: "KW", label: "Energy Meter (MFM)", unit: "kW", min: 0, max: 100, section: "wtp", instrumentType: "kw" },
  { id: "WTP-Pump1", mqttKey: "", label: "HT Pump 1", unit: "", min: 0, max: 1, section: "wtp", instrumentType: "pump" },
  { id: "WTP-Pump2", mqttKey: "", label: "HT Pump 2", unit: "", min: 0, max: 1, section: "wtp", instrumentType: "pump" },
  { id: "WTP-Pump3", mqttKey: "", label: "HT Pump 3", unit: "", min: 0, max: 1, section: "wtp", instrumentType: "pump" },
  { id: "WTP-Pump4", mqttKey: "", label: "HT Pump 4", unit: "", min: 0, max: 1, section: "wtp", instrumentType: "pump" },
];

const PT_TO_PUMP: Record<string, string> = {
  "INT-PT1": "INT-Pump1", "INT-PT2": "INT-Pump2",
  "WTP-PT1": "WTP-Pump1", "WTP-PT2": "WTP-Pump2", "WTP-PT3": "WTP-Pump3", "WTP-PT4": "WTP-Pump4",
};

function getDefaultSetpoints(sensor: Sensor): { high: number | null; low: number | null } {
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
      return { high: sensor.section === 'wtp' && (sensor.id.includes('TA-IN') || sensor.id.includes('RAW')) ? 50 : 5, low: null };
    case 'chlorine': // Chlorine: 0.2-1.0 mg/L safe range
      return { high: 1.0, low: 0.2 };
    case 'combined_pt': // Combined pressure
      return { high: sensor.max * 0.8, low: sensor.max * 0.1 };
    default:
      return { high: null, low: null };
  }
}

function parsePayload(payload: string): Record<string, string | number>[] {
  const results: Record<string, string | number>[] = [];
  try {
    const parsed = JSON.parse(payload);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed);
      const tagKey = keys.find(k => k.toUpperCase() === "TAG");
      const valKey = keys.find(k => k.toUpperCase() === "VALUE");
      if (tagKey && valKey && keys.length <= 3) {
        results.push({ [String(parsed[tagKey])]: parsed[valKey] });
        return results;
      }
      Object.entries(parsed).forEach(([key, value]) => {
        results.push({ [key]: typeof value === "object" && value !== null && "value" in value ? (value as any).value : value as any });
      });
    } else if (Array.isArray(parsed)) {
      parsed.forEach(item => item?.name && item.value !== undefined ? results.push({ [item.name]: item.value }) : results.push(item));
    }
  } catch {
    const matches = payload.match(/\{[^}]+\}/g);
    matches?.forEach(match => { try { results.push(JSON.parse(match)); } catch { /* ignore */ } });
  }
  return results;
}

function topicSetup(cfg: MqttConfig | null) {
  const topics = {
    INTAKE: cfg?.intake_topic || DEFAULT_TOPICS.INTAKE,
    WTP: cfg?.wtp_topic || DEFAULT_TOPICS.WTP,
    OHT1: cfg?.oht_topic || DEFAULT_TOPICS.OHT1,
    OHT2: cfg?.oht_topic_2 || DEFAULT_TOPICS.OHT2,
    OHT3: cfg?.oht_topic_3 || DEFAULT_TOPICS.OHT3,
  };
  const topicToSection = new Map<string, { section: Section; subsection?: string }>([
    [topics.INTAKE, { section: "intake" }],
    [topics.WTP, { section: "wtp" }],
    [topics.OHT1, { section: "oht", subsection: "OHT-1" }],
    [topics.OHT2, { section: "oht", subsection: "OHT-2" }],
    [topics.OHT3, { section: "oht", subsection: "OHT-3" }],
  ]);
  return { topics: Object.values(topics).filter(Boolean), topicToSection };
}

function normalizeBrokerUrl(url: string | null | undefined): string {
  let raw = url || "mqtt://broker.hivemq.com:1883";
  // For Deno backend, native TCP is much more reliable than WebSocket.
  // Convert websocket URLs to standard TCP URLs.
  if (raw.startsWith("wss://")) {
    if (raw.includes("broker.hivemq.com")) {
      return "mqtt://broker.hivemq.com:1883";
    }
    raw = raw.replace("wss://", "mqtts://");
    if (raw.includes(":8084")) raw = raw.replace(":8084", ":8883");
  } else if (raw.startsWith("ws://")) {
    if (raw.includes("broker.hivemq.com")) {
      return "mqtt://broker.hivemq.com:1883";
    }
    raw = raw.replace("ws://", "mqtt://");
    if (raw.includes(":8083")) raw = raw.replace(":8083", ":1883");
  }
  // Strip websocket path suffix /mqtt if present in TCP URLs
  if ((raw.startsWith("mqtt://") || raw.startsWith("mqtts://")) && raw.endsWith("/mqtt")) {
    raw = raw.slice(0, -5);
  }
  return raw;
}

async function collectSnapshot(cfg: MqttConfig | null): Promise<ParsedMessage[]> {
  const brokerUrl = normalizeBrokerUrl(cfg?.broker_url);
  const { topics, topicToSection } = topicSetup(cfg);
  const messages: ParsedMessage[] = [];
  const seenTopics = new Set<string>();

  return await new Promise((resolve, reject) => {
    const client = mqtt.connect(brokerUrl, {
      clientId: `${cfg?.client_id || "bua-bicchiya-backend"}-${crypto.randomUUID().slice(0, 8)}`,
      clean: true,
      connectTimeout: 10_000,
      reconnectPeriod: 0,
      keepalive: 15,
    });
    let settled = false;
    // earlyExitTimer: starts a 5s settle window after first message arrives.
    // This lets other active topics reply without waiting for the full 25s hard timeout,
    // while still not blocking on devices that are offline.
    let earlyExitTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (earlyExitTimer) clearTimeout(earlyExitTimer);
      try { client.end(true); } catch { /* ignore */ }
      if (err && messages.length === 0) reject(err);
      else resolve(messages);
    };
    // Hard timeout: 25 seconds — absolute ceiling regardless of device state
    const timer = setTimeout(() => finish(), 25_000);

    client.on("connect", () => {
      client.subscribe(topics, { qos: 0 }, (err) => { if (err) finish(err as Error); });
    });
    client.on("message", (topic, payload) => {
      const mapped = topicToSection.get(topic) || { section: "unknown" as const };
      const combined: Record<string, string | number> = {};
      parsePayload(payload.toString()).forEach(part => Object.assign(combined, part));
      if (Object.keys(combined).length > 0) {
        messages.push({ topic, payload: combined, timestamp: new Date(), ...mapped });
        seenTopics.add(topic);
      }
      // Exit immediately if all subscribed topics have responded
      if (seenTopics.size >= topics.length) {
        finish();
        return;
      }
      // After the FIRST message arrives, start a 5-second settling window.
      // Devices that are online will reply within a few seconds; offline ones won't.
      // This avoids always waiting the full 25s when some sections are offline.
      if (seenTopics.size === 1 && !earlyExitTimer) {
        earlyExitTimer = setTimeout(() => finish(), 5_000);
      }
    });
    client.on("error", (err) => finish(err as Error));
    client.on("close", () => { if (!settled && messages.length > 0) finish(); });
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const started = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const { data: cfgRow } = await supabase.from("gis_config").select("cron_secret").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const isCron = !!req.headers.get("x-cron-key") && req.headers.get("x-cron-key") === cfgRow?.cron_secret;
    if (!isCron) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: mqttCfg } = await supabase.from("mqtt_config").select("*").limit(1).maybeSingle();
    const messages = await collectSnapshot(mqttCfg as MqttConfig | null);
    if (messages.length === 0) throw new Error("No MQTT messages received during capture window");

    const byTag = new Map<string, { sensor: Sensor; value: number; topic: string; at: string }>();
    for (const msg of messages) {
      if (msg.section === "unknown") continue;
      const sensors = SENSORS.filter(s => s.section === msg.section && (!s.subsection || s.subsection === msg.subsection) && s.mqttKey);
      for (const [mqttKey, rawValue] of Object.entries(msg.payload)) {
        const sensor = sensors.find(s => s.mqttKey === mqttKey);
        if (!sensor) continue;
        const value = typeof rawValue === "string" ? Number.parseFloat(rawValue) : Number(rawValue);
        if (!Number.isFinite(value) || value > 1e30) continue;
        const cleanValue = value < 0 ? 0 : value;
        byTag.set(`${sensor.section}-${sensor.id}`, { sensor, value: cleanValue, topic: msg.topic, at: msg.timestamp.toISOString() });

        const pumpId = PT_TO_PUMP[sensor.id];
        if (pumpId) {
          const pump = SENSORS.find(s => s.id === pumpId && s.section === sensor.section);
          if (pump) byTag.set(`${pump.section}-${pump.id}`, { sensor: pump, value: cleanValue > 1.5 ? 1 : 0, topic: msg.topic, at: msg.timestamp.toISOString() });
        }
      }
    }

    const tagRows = Array.from(byTag.values()).map(({ sensor }) => ({
      section: sensor.section, tag_id: sensor.id, label: sensor.label, unit: sensor.unit,
      is_active: true, activated_at: new Date().toISOString(), alarm_enabled: true,
    }));
    const uniqueTagRows = Array.from(new Map(tagRows.map(r => [`${r.section}-${r.tag_id}`, r])).values());
    if (uniqueTagRows.length > 0) {
      await supabase.from("tag_config").upsert(uniqueTagRows, { onConflict: "section,tag_id", ignoreDuplicates: true });
    }

    const { data: configs, error: cfgErr } = await supabase
      .from("tag_config")
      .select("id,section,tag_id,high_setpoint,low_setpoint,alarm_enabled")
      .in("tag_id", uniqueTagRows.map(r => r.tag_id));
    if (cfgErr) throw new Error(`tag_config lookup failed: ${cfgErr.message}`);
    const configMap = new Map((configs || []).map((r: any) => [`${r.section}-${r.tag_id}`, r.id]));

    const logs = Array.from(byTag.values())
      .filter(({ sensor }) => configMap.has(`${sensor.section}-${sensor.id}`))
      .map(({ sensor, value, topic, at }) => ({
        tag_config_id: configMap.get(`${sensor.section}-${sensor.id}`),
        tag_id: sensor.id,
        section: sensor.section,
        value,
        timestamp: at,
        source: "backend:5min",
        mqtt_topic: topic,
      }));

    const { error: insertErr } = logs.length > 0
      ? await supabase.from("historian_logs").insert(logs)
      : { error: null } as any;
    if (insertErr) throw new Error(`historian insert failed: ${insertErr.message}`);

    // Backend Alarm Detection & Debounce
    const alarmsToInsert = [];
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    for (const entry of Array.from(byTag.values())) {
      const { sensor, value, topic, at } = entry;
      // Threshold alarms are checked for analog instruments only
      if (sensor.instrumentType === "pump" || sensor.instrumentType === "totalizer") continue;

      const cfg = configs?.find(c => c.tag_id === sensor.id && c.section === sensor.section);
      const dbId = cfg?.id;
      const alarmEnabled = cfg ? cfg.alarm_enabled !== false : true;

      if (!alarmEnabled) continue;

      const defaults = getDefaultSetpoints(sensor);
      const highThreshold = cfg?.high_setpoint != null ? Number(cfg.high_setpoint) : (defaults.high ?? null);
      const lowThreshold = cfg?.low_setpoint != null ? Number(cfg.low_setpoint) : (defaults.low ?? null);

      let alarmType: "High" | "Low" | null = null;
      if (highThreshold !== null && value > highThreshold) {
        alarmType = "High";
      } else if (lowThreshold !== null && value < lowThreshold) {
        alarmType = "Low";
      }

      if (alarmType) {
        const thresholdVal = alarmType === "High" ? highThreshold : lowThreshold;
        // Debounce: check if same alarm was logged recently (within 10 mins)
        const { count, error: countErr } = await supabase
          .from("alarms")
          .select("id", { count: "exact", head: true })
          .eq("tag_id", sensor.id)
          .eq("alarm_type", alarmType)
          .gte("created_at", tenMinutesAgo);

        if (!countErr && (count || 0) === 0) {
          alarmsToInsert.push({
            tag_id: sensor.id,
            tag_config_id: dbId || null,
            label: sensor.label,
            value,
            unit: sensor.unit,
            alarm_type: alarmType,
            message: `Alarm: ${sensor.label} ${alarmType} (${value.toFixed(2)} ${sensor.unit}) - Threshold: ${thresholdVal}`,
            section: sensor.section,
            source: "backend:5min",
            acknowledged: false,
            email_sent: false,
          });
        }
      }
    }

    if (alarmsToInsert.length > 0) {
      const { error: alarmErr } = await supabase.from("alarms").insert(alarmsToInsert);
      if (alarmErr) console.error("Failed to insert backend alarms:", alarmErr.message);
    }

    await supabase.rpc("refresh_consumption_from_historian", {
      _from: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      _to: new Date().toISOString(),
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({
      success: true,
      saved_count: logs.length,
      received_topics: Array.from(new Set(messages.map(m => m.topic))).length,
      duration_ms: Date.now() - started,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("scada-ingest failed", err);
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - started }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});