import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const VALID_ALARM_TYPES = ['High', 'Low', 'Disconnect'];

interface AlarmEmailRequest {
  alarmId: string;
  tagId: string;
  label: string;
  value: number;
  unit: string;
  type: 'High' | 'Low' | 'Disconnect';
  message: string;
  section: string;
  timestamp: string;
  highSetpoint?: number;
  lowSetpoint?: number;
}

const handler = async (req: Request): Promise<Response> => {
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

    const alarmData: AlarmEmailRequest = await req.json();

    // Validate alarm type
    if (!VALID_ALARM_TYPES.includes(alarmData.type)) {
      return new Response(JSON.stringify({ error: 'Invalid alarm type' }), { status: 400, headers: corsHeaders });
    }

    // Validate required fields
    if (!alarmData.alarmId || !alarmData.tagId || typeof alarmData.value !== 'number') {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders });
    }

    console.log('[send-alarm-email] Received alarm:', alarmData.alarmId);

    // Use service role for DB operations
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch alarm from DB to verify it exists
    const { data: alarmRecord } = await supabase
      .from('alarms')
      .select('id, tag_id, label, message, value, unit, section, alarm_type')
      .eq('id', alarmData.alarmId)
      .maybeSingle();

    if (!alarmRecord) {
      return new Response(JSON.stringify({ error: 'Alarm not found' }), { status: 404, headers: corsHeaders });
    }

    // Use DB values instead of request body for email content (prevents injection)
    const safeLabel = escapeHtml(alarmRecord.label);
    const safeMessage = escapeHtml(alarmRecord.message);
    const safeTagId = escapeHtml(alarmRecord.tag_id);
    const safeSection = escapeHtml(alarmRecord.section);
    const safeUnit = escapeHtml(alarmRecord.unit || '');
    const safeValue = Number(alarmRecord.value).toFixed(2);

    const { data: plantConfig } = await supabase.from('plant_config').select('plant_name').limit(1).maybeSingle();
    const plantName = escapeHtml(plantConfig?.plant_name || 'SCADA System');

    const { data: tagConfig } = await supabase
      .from('tag_config')
      .select('id, alarm_enabled')
      .eq('tag_id', alarmRecord.tag_id)
      .maybeSingle();

    if (tagConfig && !tagConfig.alarm_enabled) {
      return new Response(JSON.stringify({ success: true, message: 'Alarms disabled for this tag' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: recipientRows } = await supabase
      .from('notification_recipients')
      .select('email')
      .eq('scope', 'alarm')
      .eq('tag_config_id', tagConfig?.id ?? '');
    const rawEmails: string[] = (recipientRows || []).map((r: any) => r.email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const recipientEmails = rawEmails
      .filter(e => typeof e === 'string' && emailRegex.test(e.trim()) && e.trim().length <= 255)
      .map(e => e.trim())
      .slice(0, 10);

    if (recipientEmails.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No valid email recipients configured' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase.from('alarms').update({ email_sent: true, email_sent_at: new Date().toISOString() }).eq('id', alarmData.alarmId);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(JSON.stringify({ success: false, message: 'RESEND_API_KEY not configured' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const getAlarmColor = (type: string) => {
      switch (type) {
        case 'High': return { bg: '#ef4444', text: 'HIGH ALARM' };
        case 'Low': return { bg: '#f59e0b', text: 'LOW ALARM' };
        case 'Disconnect': return { bg: '#6b7280', text: 'DISCONNECT ALARM' };
        default: return { bg: '#3b82f6', text: 'ALARM' };
      }
    };

    const alarmColor = getAlarmColor(alarmRecord.alarm_type);
    const formattedTime = new Date(alarmData.timestamp).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'medium',
    });

    let setpointInfo = '';
    if (alarmRecord.alarm_type === 'High' && alarmData.highSetpoint !== undefined) {
      setpointInfo = `<tr><td style="padding:12px 15px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#374151;width:40%;">High Setpoint</td><td style="padding:12px 15px;border-bottom:1px solid #e5e7eb;color:#ef4444;font-weight:600;">${Number(alarmData.highSetpoint).toFixed(2)} ${safeUnit}</td></tr>`;
    } else if (alarmRecord.alarm_type === 'Low' && alarmData.lowSetpoint !== undefined) {
      setpointInfo = `<tr><td style="padding:12px 15px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#374151;width:40%;">Low Setpoint</td><td style="padding:12px 15px;border-bottom:1px solid #e5e7eb;color:#f59e0b;font-weight:600;">${Number(alarmData.lowSetpoint).toFixed(2)} ${safeUnit}</td></tr>`;
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${plantName} Alerts <info@orbitengineerings.com>`,
        to: recipientEmails,
        subject: `🚨 ${alarmColor.text}: ${safeLabel} - ${plantName}`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
          <body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f3f4f6;">
            <div style="max-width:600px;margin:0 auto;background:#ffffff;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
              <div style="background:linear-gradient(135deg,${alarmColor.bg} 0%,${alarmColor.bg}dd 100%);color:white;padding:30px 25px;text-align:center;">
                <h1 style="margin:0 0 10px;font-size:28px;font-weight:700;">⚠️ ${alarmColor.text}</h1>
                <p style="margin:0;font-size:16px;opacity:0.9;">${plantName}</p>
              </div>
              <div style="background-color:#1f2937;color:white;padding:20px 25px;">
                <div><p style="margin:0 0 5px;font-size:12px;text-transform:uppercase;letter-spacing:1px;opacity:0.7;">Tag Name</p><p style="margin:0;font-size:22px;font-weight:600;">${safeLabel}</p></div>
                <div style="text-align:right;margin-top:10px;"><p style="margin:0 0 5px;font-size:12px;text-transform:uppercase;letter-spacing:1px;opacity:0.7;">Current Value</p><p style="margin:0;font-size:28px;font-weight:700;color:${alarmColor.bg};">${safeValue} ${safeUnit}</p></div>
              </div>
              <div style="padding:25px;">
                <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
                  <tr style="background:#f9fafb;"><td style="padding:12px 15px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#374151;width:40%;">Tag ID</td><td style="padding:12px 15px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-family:monospace;">${safeTagId}</td></tr>
                  <tr><td style="padding:12px 15px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#374151;">Section</td><td style="padding:12px 15px;border-bottom:1px solid #e5e7eb;color:#6b7280;text-transform:uppercase;">${safeSection}</td></tr>
                  <tr style="background:#f9fafb;"><td style="padding:12px 15px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#374151;">Alarm Type</td><td style="padding:12px 15px;border-bottom:1px solid #e5e7eb;"><span style="background-color:${alarmColor.bg};color:white;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;">${escapeHtml(alarmRecord.alarm_type).toUpperCase()}</span></td></tr>
                  ${setpointInfo}
                  <tr><td style="padding:12px 15px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#374151;">Timestamp</td><td style="padding:12px 15px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${formattedTime}</td></tr>
                </table>
                <div style="margin-top:20px;padding:15px 20px;background-color:#fef2f2;border-left:4px solid ${alarmColor.bg};border-radius:0 8px 8px 0;">
                  <p style="margin:0 0 5px;font-weight:600;color:#991b1b;font-size:14px;">Alert Message</p>
                  <p style="margin:0;color:#7f1d1d;font-size:15px;">${safeMessage}</p>
                </div>
              </div>
              <div style="background:#1f2937;color:#9ca3af;padding:20px 25px;text-align:center;">
                <p style="margin:0 0 5px;font-size:14px;color:#ffffff;">${plantName}</p>
                <p style="margin:0;font-size:12px;">Powered by Orbit Engineering Group</p>
                <p style="margin:10px 0 0;font-size:11px;opacity:0.7;">Automated alert. Do not reply.</p>
              </div>
            </div>
          </body></html>`,
      }),
    });

    const emailResult = await emailResponse.json();
    if (!emailResponse.ok) {
      return new Response(JSON.stringify({ success: false, error: emailResult }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, message: 'Email sent', emailId: emailResult.id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[send-alarm-email] Internal error:', message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
};

serve(handler);
