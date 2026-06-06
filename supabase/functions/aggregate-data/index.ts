import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // Admin role check — only admins or scheduled jobs (via service_role) should trigger aggregation
    const { data: isAdmin } = await userClient.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Use service role for aggregation
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const bucketStart = new Date(now);
    bucketStart.setMinutes(0, 0, 0);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setHours(bucketEnd.getHours() + 1);

    const { data: tagConfigs, error: tcError } = await supabase
      .from('tag_config')
      .select('id, tag_id, section')
      .eq('is_active', true);

    if (tcError) throw tcError;

    let aggregatedCount = 0;

    for (const tc of tagConfigs || []) {
      const { data: logs, error: logsError } = await supabase
        .from('historian_logs')
        .select('value')
        .eq('tag_config_id', tc.id)
        .gte('timestamp', bucketStart.toISOString())
        .lt('timestamp', bucketEnd.toISOString());

      if (logsError || !logs || logs.length === 0) continue;

      const values = logs.map(l => Number(l.value));
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      const { error: upsertError } = await supabase
        .from('historian_aggregates')
        .upsert({
          tag_config_id: tc.id,
          tag_id: tc.tag_id,
          section: tc.section,
          bucket_start: bucketStart.toISOString(),
          bucket_size: '1h',
          avg_value: parseFloat(avg.toFixed(4)),
          min_value: parseFloat(min.toFixed(4)),
          max_value: parseFloat(max.toFixed(4)),
          sample_count: values.length,
        }, { onConflict: 'tag_config_id,bucket_start,bucket_size', ignoreDuplicates: false });

      if (!upsertError) aggregatedCount++;
    }

    return new Response(
      JSON.stringify({ success: true, aggregated: aggregatedCount, bucket: bucketStart.toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[aggregate-data] Internal error:', message);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
