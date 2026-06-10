import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const EXPORT_INTERVAL_DAYS = 90;
const CLEANUP_GRACE_DAYS = 7;
const RAW_RETENTION_DAYS = 7;
// Supabase default max is 1000 rows per query
const PAGE_SIZE = 1000;

/**
 * Paginated fetch — reliably pulls ALL rows using Supabase's 1000-row limit.
 * Returns a flat array of all matching rows.
 */
async function fetchAllPaginated(
  supabase: any,
  table: string,
  select: string,
  filters: (q: any) => any,
  orderCol: string
): Promise<any[]> {
  const results: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let query = supabase.from(table).select(select).order(orderCol, { ascending: true }).range(from, to);
    query = filters(query);
    const { data, error } = await query;

    if (error) throw new Error(`Paginated fetch error on ${table}: ${error.message}`);
    if (data && data.length > 0) {
      results.push(...data);
      page++;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return results;
}

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

    // Admin role check — destructive operations must be admin-only
    const { data: isAdmin } = await userClient.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Use service role for data operations
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let body: any = {};
    try { body = await req.json(); } catch {}
    const action = body.action || 'daily_check';
    const results: any = { action, steps: [] };

    // ===== STEP 1: Cleanup raw historian_logs older than 7 days =====
    if (action === 'daily_check' || action === 'cleanup_raw') {
      const cutoff = new Date(Date.now() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const { count: rawCount } = await supabase
        .from('historian_logs')
        .select('*', { count: 'exact', head: true })
        .lt('timestamp', cutoff);

      if (rawCount && rawCount > 0) {
        const BATCH = 1000;
        let totalDeleted = 0;
        let hasMore = true;

        while (hasMore && totalDeleted < 100000) {
          const { data: toDelete } = await supabase
            .from('historian_logs')
            .select('id')
            .lt('timestamp', cutoff)
            .limit(BATCH);

          if (!toDelete || toDelete.length === 0) { hasMore = false; break; }

          const ids = toDelete.map((r: any) => r.id);
          const { error } = await supabase.from('historian_logs').delete().in('id', ids);

          if (error) { results.steps.push({ step: 'cleanup_raw', error: error.message }); break; }
          totalDeleted += toDelete.length;
          if (toDelete.length < BATCH) hasMore = false;
        }

        results.steps.push({ step: 'cleanup_raw', deleted: totalDeleted, totalEligible: rawCount });
      } else {
        results.steps.push({ step: 'cleanup_raw', message: 'No raw data to clean' });
      }
    }

    // ===== STEP 2: Check if 3-month export is due =====
    if (action === 'daily_check' || action === 'export') {
      const { data: lastExport } = await supabase
        .from('data_exports')
        .select('period_end')
        .order('period_end', { ascending: false })
        .limit(1)
        .maybeSingle();

      const now = new Date();
      const lastExportEnd = lastExport ? new Date(lastExport.period_end) : null;
      const shouldExport = !lastExportEnd ||
        (now.getTime() - lastExportEnd.getTime()) >= EXPORT_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

      if (shouldExport || action === 'export') {
        const periodStart = lastExportEnd || new Date('2024-01-01');
        const periodEnd = new Date(now.getTime() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000);

        if (periodEnd > periodStart) {
          const pStart = periodStart.toISOString();
          const pEnd = periodEnd.toISOString();

          // 1) Fetch ALL aggregated sensor data (paginated, 1000 per page)
          console.log(`[export] Fetching aggregates from ${pStart} to ${pEnd}`);
          const allAggregates = await fetchAllPaginated(
            supabase,
            'historian_aggregates',
            'tag_id, section, bucket_start, avg_value, min_value, max_value, sample_count',
            (q: any) => q.gte('bucket_start', pStart).lt('bucket_start', pEnd),
            'bucket_start'
          );
          console.log(`[export] Fetched ${allAggregates.length} aggregate rows`);

          // 2) Fetch ALL pump analytics data (daily summaries — NOT from historian_logs which gets deleted)
          const allPumpAnalytics = await fetchAllPaginated(
            supabase,
            'pump_analytics',
            'pump_id, section, date, runtime_seconds, start_count, total_runtime_seconds, total_start_count',
            (q: any) => q.gte('date', pStart.split('T')[0]).lt('date', pEnd.split('T')[0]),
            'date'
          );
          console.log(`[export] Fetched ${allPumpAnalytics.length} pump analytics rows`);

          // 3) Fetch ALL consumption data
          const allConsumption = await fetchAllPaginated(
            supabase,
            'consumption_data',
            'section, date, hour, daily_consumption, hourly_consumption, totalizer_start, totalizer_end',
            (q: any) => q.gte('date', pStart.split('T')[0]).lt('date', pEnd.split('T')[0]),
            'date'
          );
          console.log(`[export] Fetched ${allConsumption.length} consumption rows`);

          const totalRecords = allAggregates.length + allPumpAnalytics.length + allConsumption.length;

          if (totalRecords > 0) {
            // Build CSV with all data types
            const csvParts: string[] = [];
            csvParts.push('Type,Timestamp/Date,Section,Tag/Pump ID,Value,Min,Max,Avg,Samples,Runtime(s),Starts,Consumption\n');

            // Aggregates
            for (const row of allAggregates) {
              csvParts.push(`Aggregate,${row.bucket_start},${row.section},${row.tag_id},,${Number(row.min_value).toFixed(4)},${Number(row.max_value).toFixed(4)},${Number(row.avg_value).toFixed(4)},${row.sample_count},,,\n`);
            }

            // Pump analytics (daily summaries)
            for (const row of allPumpAnalytics) {
              csvParts.push(`PumpDaily,${row.date},${row.section},${row.pump_id},,,,,,${row.runtime_seconds},${row.start_count},\n`);
            }

            // Consumption data
            for (const row of allConsumption) {
              const ts = row.hour !== null ? `${row.date} ${String(row.hour).padStart(2, '0')}:00` : row.date;
              csvParts.push(`Consumption,${ts},${row.section},,,,,,,,,${Number(row.hourly_consumption || row.daily_consumption).toFixed(2)}\n`);
            }

            const csv = csvParts.join('');

            const startStr = periodStart.toISOString().split('T')[0];
            const endStr = periodEnd.toISOString().split('T')[0];
            const fileName = `bhua_bicchiya_scada_export_${startStr}_to_${endStr}.csv`;

            // Ensure storage bucket exists
            const { data: buckets } = await supabase.storage.listBuckets();
            if (!buckets?.find((b: any) => b.id === 'data-exports')) {
              await supabase.storage.createBucket('data-exports', { public: false });
            }

            const { error: uploadError } = await supabase.storage
              .from('data-exports')
              .upload(fileName, new Blob([csv], { type: 'text/csv' }), { contentType: 'text/csv', upsert: true });

            if (uploadError) throw uploadError;

            const { data: signedUrlData } = await supabase.storage
              .from('data-exports')
              .createSignedUrl(fileName, 30 * 24 * 60 * 60);

            const downloadUrl = signedUrlData?.signedUrl || '';

            const { data: exportRecord } = await supabase
              .from('data_exports')
              .insert({
                period_start: periodStart.toISOString(),
                period_end: periodEnd.toISOString(),
                file_path: fileName,
                record_count: totalRecords,
                status: 'exported',
              })
              .select('id')
              .single();

            // Send email notification
            const { data: plantConfig } = await supabase.from('plant_config').select('plant_name').limit(1).maybeSingle();
            const { data: recipientRows } = await supabase
              .from('notification_recipients')
              .select('email')
              .eq('scope', 'export');
            const emails: string[] = (recipientRows || []).map((r: any) => r.email);
            const plantName = (plantConfig as any)?.plant_name || 'Bhua Bicchiya SCADA';
            const resendApiKey = Deno.env.get('RESEND_API_KEY');
            let emailSent = false;

            if (resendApiKey && emails.length > 0 && downloadUrl) {
              const emailResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from: `${plantName} <info@orbitengineerings.com>`,
                  to: emails.slice(0, 10),
                  subject: `📊 ${plantName} - Data Export (${startStr} to ${endStr})`,
                  html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
                    <body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background:#f3f4f6;">
                      <div style="max-width:600px;margin:0 auto;background:#fff;">
                        <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);color:white;padding:30px 25px;text-align:center;">
                          <h1 style="margin:0 0 10px;font-size:24px;">📊 Data Export Report</h1>
                          <p style="margin:0;font-size:16px;">${plantName}</p>
                        </div>
                        <div style="padding:25px;">
                          <p><strong>Period:</strong> ${startStr} to ${endStr}</p>
                          <p><strong>Total Records:</strong> ${totalRecords.toLocaleString()}</p>
                          <ul style="margin:10px 0;padding-left:20px;font-size:14px;">
                            <li>Sensor Aggregates: ${allAggregates.length.toLocaleString()}</li>
                            <li>Pump Analytics: ${allPumpAnalytics.length.toLocaleString()}</li>
                            <li>Consumption Data: ${allConsumption.length.toLocaleString()}</li>
                          </ul>
                          <div style="margin-top:25px;text-align:center;">
                            <a href="${downloadUrl}" style="display:inline-block;padding:14px 30px;background:linear-gradient(135deg,#1e40af,#3b82f6);color:white;text-decoration:none;border-radius:8px;font-weight:600;">⬇️ Download CSV</a>
                          </div>
                          <p style="margin-top:15px;font-size:12px;color:#9ca3af;text-align:center;">Link valid for 30 days.</p>
                        </div>
                      </div>
                    </body></html>`,
                }),
              });

              emailSent = emailResponse.ok;
              if (!emailSent) {
                console.error('[export] Email send failed:', await emailResponse.text());
              }
              if (emailSent && exportRecord?.id) {
                await supabase.from('data_exports').update({ email_sent: true }).eq('id', exportRecord.id);
              }
            }

            results.steps.push({
              step: 'export',
              records: totalRecords,
              aggregates: allAggregates.length,
              pumpAnalytics: allPumpAnalytics.length,
              consumption: allConsumption.length,
              fileName,
              emailSent,
            });
          } else {
            results.steps.push({ step: 'export', message: 'No data to export in this period' });
          }
        } else {
          results.steps.push({ step: 'export', message: 'Period end before start — skipping' });
        }
      } else {
        results.steps.push({ step: 'export', message: 'Not due yet' });
      }
    }

    // ===== STEP 3: Cleanup exported aggregates =====
    if (action === 'daily_check' || action === 'cleanup_exported') {
      const graceCutoff = new Date(Date.now() - CLEANUP_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const { data: confirmedExports } = await supabase
        .from('data_exports')
        .select('*')
        .eq('cleanup_done', false)
        .eq('status', 'exported')
        .lt('created_at', graceCutoff)
        .or('email_sent.eq.true,downloaded.eq.true');

      for (const exp of confirmedExports || []) {
        // Delete aggregates for this period
        const { error } = await supabase
          .from('historian_aggregates')
          .delete()
          .gte('bucket_start', exp.period_start)
          .lt('bucket_start', exp.period_end);

        if (!error) {
          await supabase.from('data_exports').update({
            cleanup_done: true,
            status: 'cleaned',
            updated_at: new Date().toISOString(),
          }).eq('id', exp.id);
          results.steps.push({ step: 'cleanup_exported', export_id: exp.id, status: 'cleaned' });
        } else {
          results.steps.push({ step: 'cleanup_exported', export_id: exp.id, error: error.message });
        }
      }

      // Safety: warn about unconfirmed exports
      const { data: unconfirmed } = await supabase
        .from('data_exports')
        .select('id')
        .eq('cleanup_done', false)
        .eq('status', 'exported')
        .eq('email_sent', false)
        .eq('downloaded', false)
        .lt('created_at', graceCutoff);

      if (unconfirmed && unconfirmed.length > 0) {
        results.steps.push({ step: 'safety_hold', message: `${unconfirmed.length} exports not confirmed — data preserved` });
      }
    }

    // ===== Action: mark_downloaded =====
    if (action === 'mark_downloaded' && body.exportId) {
      const { data: exportRecord } = await supabase
        .from('data_exports')
        .select('id')
        .eq('id', body.exportId)
        .maybeSingle();
      if (!exportRecord) {
        return new Response(JSON.stringify({ error: 'Export not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await supabase.from('data_exports').update({ downloaded: true, updated_at: new Date().toISOString() }).eq('id', body.exportId);
      results.steps.push({ step: 'mark_downloaded', exportId: body.exportId });
    }

    // ===== Action: get_download_url =====
    if (action === 'get_download_url' && body.filePath) {
      const { data: exportRecord } = await supabase
        .from('data_exports')
        .select('file_path')
        .eq('file_path', body.filePath)
        .maybeSingle();
      if (!exportRecord) {
        return new Response(JSON.stringify({ error: 'File not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: signedUrlData } = await supabase.storage.from('data-exports').createSignedUrl(body.filePath, 24 * 60 * 60);
      results.downloadUrl = signedUrlData?.signedUrl || null;
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[export-historian-data] Internal error:', message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
