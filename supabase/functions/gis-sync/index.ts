// MPGARUD SCADA-to-GIS Telemetry sync (Version 1.0)
// Pushes latest sensor values for Intake + WTP + 3 OHTs to MP Urban GIS portal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// MQTT tag-id mapping per request
const TAG = {
  intake: { pt: "INT-PT1", lt: "INT-LT", flow: "INT-Flow" },
  wtp: {
    inFlow: "WTP-Flow-IN", outFlow: "WTP-Flow-OUT",
    rawPh: "WTP-PH-IN", rawTr: "WTP-TA-IN",
    trPh: "WTP-PH", trTr: "WTP-TA", cl: "WTP-CL",
    cwr: "WTP-LT-CW", bw: "WTP-LT-BW", header: "WTP-CombinedPT1",
  },
  oht: (n: number) => ({
    pt: `OHT${n}-PT`, lt: `OHT${n}-LT`,
    // Flow-OUT is not installed on these OHTs — fall back to Flow-IN
    flow: `OHT${n}-Flow-IN`,
  }),
};

function toIstString(d: Date | string | number): string {
  const date = new Date(d);
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}T` +
    `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}.` +
    `${pad(ist.getUTCMilliseconds(), 3)}`;
}

const mld = (m3hr: number | null | undefined): number =>
  m3hr == null || isNaN(Number(m3hr)) ? 0 : Number((Number(m3hr) * 0.024).toFixed(4));

const num = (v: number | null | undefined): number =>
  v == null || isNaN(Number(v)) ? 0 : Number(v);

// Cache the cron secret across warm invocations to avoid extra vault reads.
let cachedCronSecret: string | null = null;
async function getCronSecret(client: ReturnType<typeof createClient>): Promise<string | null> {
  if (cachedCronSecret) return cachedCronSecret;
  const { data, error } = await client
    .from("gis_config")
    .select("cron_secret")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.cron_secret) {
    console.error("getCronSecret failed:", error?.message);
    return null;
  }
  cachedCronSecret = data.cron_secret as string;
  return cachedCronSecret;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const started = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Service-role client for reading credentials, vault, and writing audit log
  const supabase = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- AuthN/AuthZ ---
  // Allow either: (a) signed-in user (browser trigger) OR
  // (b) internal pg_cron call carrying the shared secret in x-cron-key header.
  const cronKey = req.headers.get("x-cron-key");
  const expectedCronKey = await getCronSecret(supabase);
  const isCron = !!cronKey && !!expectedCronKey && cronKey === expectedCronKey;
  console.log("auth-check", {
    hasCronKey: !!cronKey,
    hasExpected: !!expectedCronKey,
    expectedLen: expectedCronKey?.length ?? 0,
    cronKeyLen: cronKey?.length ?? 0,
    isCron,
  });

  if (!isCron) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let endpoint = "";
  let requestPayload: any = null;
  let sanitisedPayload: any = null;
  let responseStatus: number | null = null;
  let responseBody = "";
  let success = false;
  let errorMessage: string | null = null;

  try {
    // 1) Load GIS config
    const { data: cfg, error: cfgErr } = await supabase
      .from("gis_config").select("*")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (cfgErr || !cfg) throw new Error(cfgErr?.message || "gis_config row missing");
    endpoint = cfg.base_url;

    // 2) Collect every needed tag id and fetch latest value per tag in one query
    const intakeIds = Object.values(TAG.intake);
    const wtpIds = Object.values(TAG.wtp);
    const ohtIds = [1, 2, 3].flatMap(n => Object.values(TAG.oht(n)));
    const allIds = [...intakeIds, ...wtpIds, ...ohtIds];

    const { data: rows, error: hErr } = await supabase
      .from("historian_logs")
      .select("tag_id, value, timestamp")
      .in("tag_id", allIds)
      .order("timestamp", { ascending: false })
      .limit(2000);
    if (hErr) throw new Error(`historian_logs: ${hErr.message}`);

    const latest = new Map<string, { value: number; timestamp: string }>();
    for (const r of rows ?? []) {
      if (!latest.has(r.tag_id)) latest.set(r.tag_id, { value: Number(r.value), timestamp: r.timestamp });
    }
    const v = (id: string) => latest.get(id)?.value;

    const nowIst = toIstString(new Date());

    // 3) Build payload
    requestPayload = {
      auth: { token: cfg.api_token, vendorKey: cfg.vendor_key },
      intake: {
        intakWell_Device_id: cfg.intake_device_id,
        intakeWellLevel_mtr: num(v(TAG.intake.lt)),
        outletFlow_mld: mld(v(TAG.intake.flow)),
        powerConsumption_Monthly_watt: 0,
        powerFactor_Live_watt: 0,
        headerDesignPressure: 3.0,
        headerActualPressure: num(v(TAG.intake.pt)),
        recordDateTime: nowIst,
      },
      intakePumps: [
        { pumpNumber: 1, ratedPressure: 5.0, actualPressure: num(v(TAG.intake.pt)) },
      ],
      wtpUnits: [
        {
          wtp: {
            wtP_Device_id: cfg.wtp_device_id,
            inletFlow_mld: mld(v(TAG.wtp.inFlow)),
            outletFlow_mld: mld(v(TAG.wtp.outFlow)),
            backwashLevel: num(v(TAG.wtp.bw)),
            cwrLevel: num(v(TAG.wtp.cwr)),
            powerConsumption_Monthly_watt: 0,
            powerFactor_Live_watt: 0,
            rawPh: num(v(TAG.wtp.rawPh)),
            rawTurbidity: num(v(TAG.wtp.rawTr)),
            treatedPh: num(v(TAG.wtp.trPh)),
            chlorine: num(v(TAG.wtp.cl)),
            treatedTurbidity: num(v(TAG.wtp.trTr)),
            headerDesignPressure: 4.0,
            headerActualPressure: num(v(TAG.wtp.header)),
            recordDateTime: nowIst,
          },
          pumps: [],
          ohts: [1, 2, 3].map((n) => {
            const t = TAG.oht(n);
            const id = (cfg as any)[`oht${n}_device_id`];
            return {
              ohT_Device_id: id,
              inletFlow_mld: mld(v(t.flow)),
              waterLevel_mld: num(v(t.lt)),
              residualChlorine: 0,
              inletPressure: num(v(t.pt)),
              recordDateTime: nowIst,
            };
          }),
        },
      ],
    };

    // 4) POST to government endpoint
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });
    responseStatus = resp.status;
    responseBody = await resp.text();
    success = resp.ok;
    if (!resp.ok) errorMessage = `HTTP ${resp.status}`;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    success = false;
  }

  const duration = Date.now() - started;

  // Build a credential-free copy of the payload for the audit log AND the HTTP response.
  if (requestPayload) {
    sanitisedPayload = { ...requestPayload, auth: "[REDACTED]" };
  }

  // 5) Audit log (always)
  try {
    await supabase.from("gis_sync_logs").insert({
      endpoint, request_payload: sanitisedPayload, response_status: responseStatus,
      response_body: responseBody, success, error_message: errorMessage, duration_ms: duration,
    });
  } catch (_) { /* swallow */ }

  return new Response(JSON.stringify({
    success, proof: { endpoint, status: responseStatus, response: responseBody, duration_ms: duration },
    request_payload: sanitisedPayload, error: errorMessage,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});