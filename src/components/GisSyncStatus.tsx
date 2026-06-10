import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CloudUpload, RefreshCw, Copy, ChevronDown, CheckCircle2, XCircle,
  Database, Clock, Wifi, Code2, FileText, History, Satellite,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useScada } from '@/contexts/ScadaContext';
import { toast } from 'sonner';

interface SyncLog {
  id: string;
  endpoint: string;
  response_status: number | null;
  response_body: string | null;
  request_payload: any;
  success: boolean;
  error_message: string | null;
  duration_ms: number | null;
  triggered_at: string;
}

type ParamRow = { param: string; value: string; unit?: string; sensorId: string };

const VENDOR_KEY = 'UADDORESREG022';

const DEVICES = [
  { key: 'intake', id: 'BHU_INTK_001', label: 'INTAKE WELL' },
  { key: 'wtp', id: 'BHU_WTP_001', label: 'WATER TREATMENT PLANT (WTP)' },
  { key: 'oht1', id: 'BHU_OHT_001', label: 'OHT-1' },
  { key: 'oht2', id: 'BHU_OHT_002', label: 'OHT-2' },
  { key: 'oht3', id: 'BHU_OHT_003', label: 'OHT-3' },
] as const;

const GisSyncStatus = () => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [lastPayload, setLastPayload] = useState<any>(null);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const { intakeTags, ohtTags, wtpTags } = useScada();

  const readLocal = () => {
    try {
      setLastPayload(JSON.parse(localStorage.getItem('gov_last_payload') || 'null'));
      setLastResponse(JSON.parse(localStorage.getItem('gov_last_response') || 'null'));
      setLastSyncAt(localStorage.getItem('gov_last_sync_at'));
    } catch { /* ignore */ }
  };

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('gis_sync_logs')
      .select('*')
      .order('triggered_at', { ascending: false })
      .limit(10);
    if (data) setLogs(data as SyncLog[]);
  };

  useEffect(() => {
    if (!open) return;
    readLocal();
    fetchLogs();
    const onUpd = () => { readLocal(); fetchLogs(); };
    window.addEventListener('gis-sync-updated', onUpd);
    const id = setInterval(fetchLogs, 10_000);
    return () => { window.removeEventListener('gis-sync-updated', onUpd); clearInterval(id); };
  }, [open]);

  const triggerSync = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('gis-sync');
      if (error) throw error;
      const proof = (data as any)?.proof;
      const ok = (data as any)?.success;
      if (ok) toast.success(`GIS sync OK (HTTP ${proof?.status})`);
      else toast.error(`GIS sync failed: HTTP ${proof?.status ?? 'n/a'}`);
      localStorage.setItem('gov_last_payload', JSON.stringify((data as any).request_payload ?? null));
      localStorage.setItem('gov_last_response', JSON.stringify(proof ?? null));
      localStorage.setItem('gov_last_sync_at', new Date().toISOString());
      readLocal();
      fetchLogs();
    } catch (e: any) {
      toast.error(`Sync error: ${e?.message || e}`);
    } finally { setBusy(false); }
  };

  const live = useMemo(() => {
    const get = (arr: any[], id: string) => arr.find(t => t.id === id)?.value;
    const f = (n: number | undefined, d = 2) => (n == null || isNaN(Number(n)) ? '—' : Number(n).toFixed(d));
    const mld = (m3hr: number | undefined) => (m3hr == null ? '—' : (Number(m3hr) * 0.024).toFixed(3));

    const intake: ParamRow[] = [
      { param: 'LT', value: f(get(intakeTags, 'INT-LT'), 2), unit: 'mtr', sensorId: 'INT-LT' },
      { param: 'Flow', value: f(get(intakeTags, 'INT-Flow'), 3), unit: `m³/hr (${mld(get(intakeTags, 'INT-Flow'))} MLD)`, sensorId: 'INT-Flow' },
      { param: 'Pressure 1', value: f(get(intakeTags, 'INT-PT1'), 3), unit: 'Bar', sensorId: 'INT-PT1' },
    ];
    const wtp: ParamRow[] = [
      { param: 'Inlet Flow', value: f(get(wtpTags, 'WTP-Flow-IN'), 3), unit: `m³/hr (${mld(get(wtpTags, 'WTP-Flow-IN'))} MLD)`, sensorId: 'WTP-Flow-IN' },
      { param: 'Outlet Flow', value: f(get(wtpTags, 'WTP-Flow-OUT'), 3), unit: `m³/hr (${mld(get(wtpTags, 'WTP-Flow-OUT'))} MLD)`, sensorId: 'WTP-Flow-OUT' },
      { param: 'Raw pH', value: f(get(wtpTags, 'WTP-PH-IN'), 2), unit: 'pH', sensorId: 'WTP-PH-IN' },
      { param: 'Raw Turbidity', value: f(get(wtpTags, 'WTP-TA-IN'), 2), unit: 'NTU', sensorId: 'WTP-TA-IN' },
      { param: 'Treated pH', value: f(get(wtpTags, 'WTP-PH'), 2), unit: 'pH', sensorId: 'WTP-PH' },
      { param: 'Treated Turbidity', value: f(get(wtpTags, 'WTP-TA'), 2), unit: 'NTU', sensorId: 'WTP-TA' },
      { param: 'Chlorine', value: f(get(wtpTags, 'WTP-CL'), 2), unit: 'ppm', sensorId: 'WTP-CL' },
      { param: 'CWR Level', value: f(get(wtpTags, 'WTP-LT-CW'), 2), unit: 'm', sensorId: 'WTP-LT-CW' },
      { param: 'Backwash Level', value: f(get(wtpTags, 'WTP-LT-BW'), 2), unit: 'm', sensorId: 'WTP-LT-BW' },
      { param: 'Header Pressure', value: f(get(wtpTags, 'WTP-CombinedPT1'), 2), unit: 'Bar', sensorId: 'WTP-CombinedPT1' },
    ];
    const ohtFor = (n: 1 | 2 | 3): ParamRow[] => ([
      { param: 'LT', value: f(get(ohtTags, `OHT${n}-LT`), 2), unit: 'm', sensorId: `OHT${n}-LT` },
      { param: 'Flow In', value: f(get(ohtTags, `OHT${n}-Flow-IN`), 3), unit: `m³/hr (${mld(get(ohtTags, `OHT${n}-Flow-IN`))} MLD)`, sensorId: `OHT${n}-Flow-IN` },
      { param: 'Pressure', value: f(get(ohtTags, `OHT${n}-PT`), 3), unit: 'Bar', sensorId: `OHT${n}-PT` },
    ]);
    return { intake, wtp, oht1: ohtFor(1), oht2: ohtFor(2), oht3: ohtFor(3) } as Record<string, ParamRow[]>;
  }, [intakeTags, ohtTags, wtpTags]);

  const copyProof = (log: SyncLog) => {
    const text = [
      '════════════════════════════════════',
      'MPGARUD SCADA-to-GIS Proof of Delivery',
      '════════════════════════════════════',
      `Timestamp (IST): ${new Date(log.triggered_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
      `Endpoint: ${log.endpoint}`,
      `HTTP Status: ${log.response_status ?? 'n/a'}`,
      `Success: ${log.success}`,
      `Duration: ${log.duration_ms ?? '?'} ms`,
      `Response Body: ${log.response_body ?? ''}`,
      'Request Payload (JSON):',
      JSON.stringify(log.request_payload, null, 2),
      '════════════════════════════════════',
    ].join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Proof copied to clipboard');
  };

  const lastLog = logs[0];
  const successCount = logs.filter(l => l.success).length;
  const batchTotal = logs.length;
  const gatewayOk = !!lastLog?.success;
  const lastDuration = lastLog?.duration_ms ?? lastResponse?.duration_ms;
  const lastStatus = lastLog?.response_status ?? lastResponse?.status;
  const lastTimeStr = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          title="MP GIS Telemetry Sync"
          className="flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-bold border bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition"
        >
          <Satellite className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
          <span className="uppercase tracking-wider hidden sm:inline">GIS</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-primary/5 via-transparent to-primary/5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                <CloudUpload className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight">
                  MPGARUD GIS Lab API · Telemetry Sync Details
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Real-time integration data pipeline for Directorate of Urban Administration & Development, Bhopal.
                </p>
              </div>
            </div>
            <div className="hidden sm:flex flex-col items-end gap-1 text-[11px] mr-8">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Vendor Key:</span>
                <span className="font-mono font-bold tracking-wider">{VENDOR_KEY}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Status:</span>
                <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15 text-[10px] font-bold">ENABLED</Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-5">
          {/* Top stat row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="GATEWAY CONNECTION"
              icon={<Wifi className="h-4 w-4" />}
              value={
                <span className={`flex items-center gap-1.5 font-bold ${gatewayOk ? 'text-success' : 'text-destructive'}`}>
                  {gatewayOk ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {gatewayOk ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
              }
              accent={
                <Badge className={`text-[10px] font-bold ${gatewayOk ? 'bg-success/15 text-success border-success/30' : 'bg-destructive/15 text-destructive border-destructive/30'}`}>
                  {gatewayOk ? 'OK' : 'ERR'}
                </Badge>
              }
            />
            <StatCard
              label="UPLOAD BATCH STATUS"
              icon={<Database className="h-4 w-4" />}
              value={
                <span className="text-base font-bold">
                  {successCount} / {batchTotal || 0} <span className="text-xs font-medium text-muted-foreground">Succeeded</span>
                </span>
              }
            />
            <StatCard
              label="LAST PUSHED TIME"
              icon={<Clock className="h-4 w-4 text-primary" />}
              value={<span className="text-base font-bold font-mono">{lastTimeStr}</span>}
              accent={<span className="text-[10px] text-muted-foreground">1 hr cycle · manual any time</span>}
            />
            <div className="rounded-xl border bg-card p-3 flex flex-col gap-2">
              <div className="text-[10px] font-bold tracking-wider text-muted-foreground">MANUAL SYNC OVERRIDE</div>
              <div className="flex gap-2">
                <Button onClick={triggerSync} disabled={busy} size="sm" className="flex-1 h-8 text-xs">
                  <RefreshCw className={`h-3 w-3 mr-1 ${busy ? 'animate-spin' : ''}`} />
                  {busy ? 'Syncing…' : 'Trigger Sync Now'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowJson(s => !s)} className="h-8 text-xs">
                  <Code2 className="h-3 w-3 mr-1" /> JSON
                </Button>
              </div>
            </div>
          </div>

          {/* Telemetry Sync Board */}
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <h3 className="text-xs font-bold tracking-wider text-foreground">TELEMETRY SYNC BOARD</h3>
              <span className="text-[11px] text-muted-foreground">(scroll horizontally to view all 5 stations)</span>
            </div>
            <div className="overflow-x-auto pb-2 -mx-1 px-1">
              <div className="flex gap-3 min-w-min">
                {DEVICES.map(d => (
                  <StationCard
                    key={d.key}
                    label={d.label}
                    deviceId={d.id}
                    success={gatewayOk}
                    status={lastStatus}
                    duration={lastDuration}
                    timeStr={lastTimeStr}
                    rows={live[d.key] || []}
                    payload={lastPayload}
                    responseText={lastLog?.response_body || lastResponse?.response}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Full JSON collapsible */}
          {showJson && (
            <div className="rounded-xl border bg-card">
              <div className="flex items-center justify-between px-4 py-2 border-b">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <Code2 className="h-4 w-4 text-primary" /> Full Outgoing Pipeline JSON
                </div>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => { navigator.clipboard.writeText(JSON.stringify(lastPayload ?? {}, null, 2)); toast.success('JSON copied'); }}
                >
                  <Copy className="h-3 w-3 mr-1" /> Copy
                </Button>
              </div>
              <pre className="p-3 text-[10px] overflow-auto max-h-[40vh] whitespace-pre-wrap break-all font-mono">
                {lastPayload ? JSON.stringify(lastPayload, null, 2) : 'No payload yet — trigger a sync.'}
              </pre>
            </div>
          )}

          {/* Recent sync logs */}
          <details className="rounded-xl border bg-card" open>
            <summary className="cursor-pointer flex items-center justify-between px-4 py-3 select-none">
              <div className="flex items-center gap-2 text-xs font-bold">
                <History className="h-4 w-4 text-primary" />
                Recent Sync Logs · Pipeline History (Last {logs.length})
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </summary>
            <div className="divide-y border-t">
              {logs.length === 0 && (
                <div className="text-xs text-muted-foreground p-4 text-center">No sync logs yet.</div>
              )}
              {logs.map(log => (
                <div key={log.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs hover:bg-muted/30 transition">
                  <div className="flex items-center gap-2 min-w-0">
                    {log.success
                      ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                      : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        {log.success ? 'Transmission Successful' : 'Transmission Failed'}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {new Date(log.triggered_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })} IST · {log.duration_ms ?? '?'}ms
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={`text-[10px] font-mono font-bold ${log.success ? 'text-success border-success/40 bg-success/10' : 'text-destructive border-destructive/40 bg-destructive/10'}`}>
                      HTTP {log.response_status ?? 'ERR'}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => copyProof(log)}>
                      <Copy className="h-3 w-3 mr-1" /> Copy Proof
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GisSyncStatus;

/* ---------- Subcomponents ---------- */

const StatCard = ({ label, icon, value, accent }: {
  label: string; icon: React.ReactNode; value: React.ReactNode; accent?: React.ReactNode;
}) => (
  <div className="rounded-xl border bg-card p-3 flex flex-col gap-1.5">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </div>
      {accent}
    </div>
    <div className="text-sm">{value}</div>
  </div>
);

const StationCard = ({ label, deviceId, success, status, duration, timeStr, rows, payload, responseText }: {
  label: string; deviceId: string; success: boolean;
  status?: number | null; duration?: number | null; timeStr: string;
  rows: ParamRow[]; payload: any; responseText?: string | null;
}) => {
  const [showJson, setShowJson] = useState(false);
  const [showResp, setShowResp] = useState(false);
  return (
    <div className="w-[300px] shrink-0 rounded-xl border bg-card overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b flex items-center justify-between bg-muted/30">
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-wide truncate">{label}</div>
          <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
            <span>{deviceId}</span>
            <button
              className="hover:text-foreground"
              onClick={() => { navigator.clipboard.writeText(deviceId); toast.success('Device ID copied'); }}
            >
              <Copy className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
        <Badge className={`text-[9px] font-bold ${success ? 'bg-success/15 text-success border-success/30' : 'bg-destructive/15 text-destructive border-destructive/30'}`}>
          {success ? 'SUCCESS' : 'FAILED'}
        </Badge>
      </div>

      <div className="px-3 py-2 border-b text-[10px] font-mono flex items-center justify-between gap-2 bg-background">
        <span><span className="text-muted-foreground">Code:</span> <b className={success ? 'text-success' : 'text-destructive'}>{status ?? '—'}</b></span>
        <span><span className="text-muted-foreground">Duration:</span> <b>{duration ?? '?'}ms</b></span>
        <span><span className="text-muted-foreground">Time:</span> <b>{timeStr}</b></span>
      </div>

      <div className="px-3 py-2">
        <div className="text-[10px] font-bold tracking-wider text-muted-foreground mb-1.5">ACTIVE PARAMETERS PUSHED</div>
        <div className="text-[10px]">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 gap-y-1 font-mono items-center">
            <div className="text-muted-foreground font-semibold">Param</div>
            <div className="text-muted-foreground font-semibold text-right">Value</div>
            <div className="text-muted-foreground font-semibold text-right">Sensor ID</div>
            {rows.map(r => (
              <FragmentRow key={r.sensorId} row={r} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-auto px-3 py-2 border-t flex gap-1.5 bg-muted/20">
        <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={() => setShowJson(s => !s)}>
          <Code2 className="h-3 w-3 mr-1" /> Outgoing JSON
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={() => setShowResp(s => !s)}>
          <FileText className="h-3 w-3 mr-1" /> Response
        </Button>
      </div>
      {showJson && (
        <pre className="px-3 py-2 text-[9px] bg-muted/40 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono border-t">
          {payload ? JSON.stringify(payload, null, 2) : 'No payload yet.'}
        </pre>
      )}
      {showResp && (
        <pre className="px-3 py-2 text-[9px] bg-muted/40 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono border-t">
          {responseText || 'No response captured.'}
        </pre>
      )}
    </div>
  );
};

const FragmentRow = ({ row }: { row: ParamRow }) => (
  <>
    <div className="font-semibold">{row.param}</div>
    <div className="text-right">
      <span className="inline-block px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
        {row.value}{row.unit ? <span className="text-muted-foreground font-normal ml-1">{row.unit}</span> : null}
      </span>
    </div>
    <div className="text-right text-muted-foreground font-mono truncate max-w-[110px]">{row.sensorId}</div>
  </>
);