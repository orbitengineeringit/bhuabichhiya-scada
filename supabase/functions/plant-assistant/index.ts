import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "x-quota-used, x-quota-remaining, x-quota-limit",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
  liveSnapshot?: Record<string, any>;
  dateRange?: { from?: string; to?: string };
}

const SYSTEM_PROMPT = `You are "Plant Assistant" — an expert AI-SCADA copilot for the Bhua Bicchiya Water Treatment Plant (13 MLD, AMRUT 2.0). You combine live telemetry with 30-day historian data to deliver operator-grade insights, predictive maintenance, and anomaly detection.

STRICT RULES:
1. ONLY answer plant/SCADA related queries — water consumption, pump runtime/starts, tank levels, flow, pressure (PT), turbidity, pH, chlorine, alarms, sensor trends, intake/WTP/OHTs, **predictive maintenance, anomaly detection, efficiency & energy audit, root-cause analysis, optimization, schedule recommendations, forecasts, plant health scoring**.
2. If user asks ANYTHING unrelated (jokes, general knowledge, coding, weather, news), politely refuse in their language and remind them you only handle plant queries.
3. DEFAULT LANGUAGE = ENGLISH. AUTO-DETECT per message: Hindi/Hinglish (Roman or Devanagari) → reply in same style; else English. Never mix unless user does.
4. STRUCTURE replies with markdown — concise headings (###), bullets, **bold key numbers**, tables for comparisons. Always include units (KL, hours, bar, NTU, mg/L, kWh).
5. For ANALYTICAL queries (maintenance/anomaly/efficiency/RCA), use this template:
   ### 🔍 Observation
   - key data points with numbers
   ### ⚠️ Likely Cause / Risk
   - reasoned hypothesis with confidence (Low/Med/High)
   ### ✅ Recommended Action
   - prioritized steps (P1/P2/P3)
   ### 📅 When
   - immediate / within 24h / weekly / monthly
6. For PREDICTIVE queries: use historical patterns (start_count trends, runtime accumulation, alarm frequency, sensor drift in historian_aggregates) to project next 24h–7d. State assumptions and confidence.
7. For ANOMALY detection: flag values >2σ from typical, sudden state changes, missing data gaps, or correlated alarm bursts. Quantify deviation.
8. For EFFICIENCY: compute KL per pump-hour, starts/hour ratio (frequent cycling = bad), idle vs run time. Suggest setpoint tuning.
9. NEVER invent numbers. If data missing for asked period, say so clearly.
10. At END of every reply, output EXACTLY (on its own line, NOT in answer body):
<<SUGGESTIONS>>["follow up 1","follow up 2","follow up 3"]<<END>>
3 suggestions, <8 words each, same language as reply, topically related.

Sections: Intake Well, WTP, OHTs (Bhua Bicchiya OHT-1/2/3).
Pumps: Intake VT-01/VT-02; WTP filtration + chlorination. Pump ON if PT > 1.5 bar.
Healthy ranges: Turbidity <5 NTU, pH 6.5–8.5, Free Chlorine 0.2–1.0 mg/L, OHT level 20–90%.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // === AUTHENTICATE USER ===
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      console.error("getClaims failed:", claimsErr);
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // === DAILY QUOTA — 4 user messages per 24h, applies to ALL users (including admin) ===
    const DAILY_LIMIT = 4;
    // Rolling 24-hour window
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { count } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user")
      .gte("created_at", windowStart.toISOString());
    const used = count ?? 0;
    const remaining = Math.max(0, DAILY_LIMIT - used);
    if (used >= DAILY_LIMIT) {
      return new Response(JSON.stringify({
        error: `Daily limit reached (${DAILY_LIMIT} questions per 24 hours). Please try again later.`,
        quota: { used, remaining: 0, limit: DAILY_LIMIT, reset: "24h rolling" },
      }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: RequestBody = await req.json();
    const { messages, liveSnapshot, dateRange } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine date range — default last 30 days
    const to = dateRange?.to ? new Date(dateRange.to) : new Date();
    const from = dateRange?.from
      ? new Date(dateRange.from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Cap to 31 days
    const maxMs = 31 * 24 * 60 * 60 * 1000;
    const fromCapped = new Date(Math.max(from.getTime(), to.getTime() - maxMs));

    // Fetch plant data in parallel
    const [consumption, pumps, alarms, aggregates] = await Promise.all([
      supabase
        .from("consumption_data")
        .select("section,date,hour,hourly_consumption,daily_consumption")
        .gte("date", fromCapped.toISOString().slice(0, 10))
        .lte("date", to.toISOString().slice(0, 10))
        .order("date", { ascending: false })
        .limit(500),
      supabase
        .from("pump_analytics")
        .select("section,pump_id,date,runtime_seconds,start_count,total_runtime_seconds,total_start_count,current_state")
        .gte("date", fromCapped.toISOString().slice(0, 10))
        .lte("date", to.toISOString().slice(0, 10))
        .order("date", { ascending: false })
        .limit(300),
      supabase
        .from("alarms")
        .select("section,label,alarm_type,value,unit,acknowledged,created_at")
        .gte("created_at", fromCapped.toISOString())
        .lte("created_at", to.toISOString())
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("historian_aggregates")
        .select("section,tag_id,bucket_start,min_value,max_value,avg_value,sample_count")
        .gte("bucket_start", fromCapped.toISOString())
        .lte("bucket_start", to.toISOString())
        .order("bucket_start", { ascending: false })
        .limit(300),
    ]);

    // Aggregate consumption summary
    const consumptionBySection: Record<string, number> = {};
    (consumption.data || []).forEach((r: any) => {
      consumptionBySection[r.section] = (consumptionBySection[r.section] || 0) + Number(r.hourly_consumption || 0);
    });

    // Aggregate pump runtime summary
    const pumpSummary: Record<string, { runtime_hours: number; starts: number; section: string }> = {};
    (pumps.data || []).forEach((r: any) => {
      const key = `${r.section}/${r.pump_id}`;
      if (!pumpSummary[key]) pumpSummary[key] = { runtime_hours: 0, starts: 0, section: r.section };
      pumpSummary[key].runtime_hours += Number(r.runtime_seconds || 0) / 3600;
      pumpSummary[key].starts += Number(r.start_count || 0);
    });

    const dataContext = {
      period: { from: fromCapped.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
      live_now: liveSnapshot || null,
      consumption_total_KL_by_section: Object.fromEntries(
        Object.entries(consumptionBySection).map(([k, v]) => [k, Number(v.toFixed(2))])
      ),
      consumption_recent: (consumption.data || []).slice(0, 50),
      pump_summary: Object.fromEntries(
        Object.entries(pumpSummary).map(([k, v]) => [
          k,
          { runtime_hours: Number(v.runtime_hours.toFixed(2)), starts: v.starts, section: v.section },
        ])
      ),
      pump_recent: (pumps.data || []).slice(0, 30),
      alarms_count: (alarms.data || []).length,
      alarms_recent: (alarms.data || []).slice(0, 20),
      sensor_trends_recent: (aggregates.data || []).slice(0, 50),
    };

    const augmentedMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `PLANT DATA CONTEXT (period ${dataContext.period.from} to ${dataContext.period.to}):\n${JSON.stringify(dataContext)}`,
      },
      ...messages,
    ];

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: augmentedMessages,
        stream: true,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add quota info to response headers (count this request as used since it passed quota check)
    const newUsed = used + 1;
    const newRemaining = Math.max(0, DAILY_LIMIT - newUsed);

    return new Response(aiResponse.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "x-quota-used": String(newUsed),
        "x-quota-remaining": String(newRemaining),
        "x-quota-limit": String(DAILY_LIMIT),
      },
    });
  } catch (e) {
    console.error("plant-assistant error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
