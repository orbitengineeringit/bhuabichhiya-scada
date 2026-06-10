import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Background auto-sync to MP Urban GIS portal.
 * Invokes the `gis-sync` edge function on an interval and stores
 * the last payload/response in localStorage for the UI to show.
 */
export const useGisAutoSync = (intervalMs = 30_000) => {
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const { data, error } = await supabase.functions.invoke('gis-sync');
        if (cancelled) return;
        if (!error && data) {
          try {
            localStorage.setItem('gov_last_payload', JSON.stringify((data as any).request_payload ?? null));
            localStorage.setItem('gov_last_response', JSON.stringify((data as any).proof ?? null));
            localStorage.setItem('gov_last_sync_at', new Date().toISOString());
            window.dispatchEvent(new CustomEvent('gis-sync-updated'));
          } catch { /* ignore quota */ }
        }
      } catch { /* network */ }
      finally { inFlight.current = false; }
    };

    // run immediately, then on interval
    tick();
    const id = setInterval(tick, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [intervalMs]);
};