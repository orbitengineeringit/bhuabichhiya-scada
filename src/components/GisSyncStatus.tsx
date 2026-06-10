import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Satellite, RefreshCw, Copy, ChevronDown, ChevronUp } from 'lucide-react';
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

const DEVICES = [
  { key: 'intake', id: 'BHU_INTK_001', label: 'Intake Well' },
  { key: 'wtp', id: 'BHU_WTP_001', label: 'WTP' },
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
    return {
      intake: {
        Level_m: get(intakeTags, 'INT-LT'),
        Flow_m3hr: get(intakeTags, 'INT-Flow'),
        Pressure_Bar: get(intakeTags, 'INT-PT1'),
      },
      wtp: {
        InletFlow: get(wtpTags, 'WTP-Flow-IN'),
        OutletFlow: get(wtpTags, 'WTP-Flow-OUT'),
        RawPH: get(wtpTags, 'WTP-PH-IN'),
        RawTurb: get(wtpTags, 'WTP-TA-IN'),
        TreatedPH: get(wtpTags, 'WTP-PH'),
        TreatedTurb: get(wtpTags, 'WTP-TA'),
        Chlorine: get(wtpTags, 'WTP-CL'),
        CWR: get(wtpTags, 'WTP-LT-CW'),
        Backwash: get(wtpTags, 'WTP-LT-BW'),
        Header: get(wtpTags, 'WTP-CombinedPT1'),
      },
      oht1: { PT: get(ohtTags, 'OHT1-PT'), LT: get(ohtTags, 'OHT1-LT'), Flow: get(ohtTags, 'OHT1-Flow-IN') },
      oht2: { PT: get(ohtTags, 'OHT2-PT'), LT: get(ohtTags, 'OHT2-LT'), Flow: get(ohtTags, 'OHT2-Flow-IN') },
      oht3: { PT: get(ohtTags, 'OHT3-PT'), LT: get(ohtTags, 'OHT3-LT'), Flow: get(ohtTags, 'OHT3-Flow-IN') },
    } as Record<string, Record<string, number | undefined>>;
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
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Satellite className="h-5 w-5 text-primary" />
            MPGARUD SCADA-to-GIS Telemetry (v1.0)
          </DialogTitle>
        </DialogHeader>

        {/* Manual trigger */}
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card">
          <div className="text-xs">
            <div className="font-semibold">urbangis.mp.gov.in</div>
            <div className="text-muted-foreground">
              Last sync: {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : '—'}
              {lastResponse?.status && (
                <Badge variant="outline" className={`ml-2 ${lastResponse.status === 200 ? 'text-success border-success/40' : 'text-destructive border-destructive/40'}`}>
                  HTTP {lastResponse.status}
                </Badge>
              )}
            </div>
          </div>
          <Button onClick={triggerSync} disabled={busy} size="sm">
            <RefreshCw className={`h-4 w-4 mr-1 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Syncing…' : 'Manual Sync'}
          </Button>
        </div>

        <Tabs defaultValue="board" className="mt-3">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="board">Live Status</TabsTrigger>
            <TabsTrigger value="logs">Proof Logs</TabsTrigger>
            <TabsTrigger value="json">Outgoing JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="board" className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {DEVICES.map(d => (
                <div key={d.key} className="glass-strong rounded-lg p-3 border">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm">{d.label}</div>
                    <Badge variant="outline" className="text-[10px] font-mono">{d.id}</Badge>
                  </div>
                  <div className="mt-2 text-xs font-mono space-y-1">
                    {Object.entries(live[d.key] || {}).map(([k, val]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-semibold">{val === undefined ? '—' : Number(val).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="logs" className="space-y-2">
            {logs.length === 0 && <div className="text-xs text-muted-foreground p-4 text-center">No sync logs yet.</div>}
            {logs.map(log => (
              <div key={log.id} className="border rounded-lg p-3 bg-card text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-mono">
                    {new Date(log.triggered_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={log.success ? 'text-success border-success/40' : 'text-destructive border-destructive/40'}>
                      HTTP {log.response_status ?? 'ERR'}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => copyProof(log)}>
                      <Copy className="h-3 w-3 mr-1" /> Copy Proof
                    </Button>
                  </div>
                </div>
                {log.response_body && (
                  <pre className="mt-2 p-2 bg-muted/40 rounded text-[10px] overflow-x-auto whitespace-pre-wrap break-all max-h-24">
                    {log.response_body.slice(0, 400)}
                  </pre>
                )}
                {log.error_message && <div className="mt-1 text-destructive">{log.error_message}</div>}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="json">
            <Button variant="outline" size="sm" onClick={() => setShowJson(s => !s)} className="mb-2">
              {showJson ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
              {showJson ? 'Hide' : 'Show'} Full Pipeline JSON
            </Button>
            {showJson && (
              <pre className="p-3 bg-muted/40 rounded text-[10px] overflow-auto max-h-[50vh] whitespace-pre-wrap break-all">
                {lastPayload ? JSON.stringify(lastPayload, null, 2) : 'No payload yet — trigger a sync.'}
              </pre>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default GisSyncStatus;