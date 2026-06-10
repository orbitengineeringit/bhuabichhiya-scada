import React, { useState, useEffect, forwardRef, memo, useMemo } from 'react';
import { useScada } from '@/contexts/ScadaContext';
import { useMqtt } from '@/contexts/MqttContext';
import { Clock, Activity, Database, Wifi, WifiOff, Loader2 } from 'lucide-react';
import GisSyncStatus from './GisSyncStatus';
import { useGisAutoSync } from '@/hooks/useGisAutoSync';

const StatusBar = memo(forwardRef<HTMLDivElement>((_, ref) => {
  const { getActiveTagCount, intakeTags, ohtTags, wtpTags } = useScada();
  const { isConnected, isConnecting, config } = useMqtt();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Background push to MP Urban GIS every 30s
  useGisAutoSync(60 * 60 * 1000);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeCount = getActiveTagCount();
  const totalCount = useMemo(() => intakeTags.length + ohtTags.length + wtpTags.length, [intakeTags.length, ohtTags.length, wtpTags.length]);

  const showConnecting = isConnecting || (!isConnected && config.autoConnect);

  return (
    <div ref={ref} className="glass-strong statusbar-gradient-border py-2 sm:py-3 px-3 sm:px-4">
      <div className="container mx-auto flex items-center justify-between text-xs font-mono gap-2">
        {/* Left: Branding + MQTT Status */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-success pulse-live shrink-0" />
            <span className="text-gradient-primary font-semibold truncate hidden sm:block">Bua Bicchiya SCADA</span>
            <span className="text-gradient-primary font-semibold sm:hidden">SCADA</span>
          </div>
          {/* MQTT Status Pill */}
          <div className="w-px h-3.5 bg-border/40 shrink-0 hidden sm:block" />
          <div className={`flex items-center gap-1 sm:gap-1.5 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-bold transition-all duration-300 border shrink-0 ${
            isConnected
              ? 'bg-success/10 text-success border-success/20'
              : showConnecting
                ? 'bg-warning/10 text-warning border-warning/20'
                : 'bg-destructive/10 text-destructive border-destructive/20'
          }`}>
            {showConnecting ? (
              <Loader2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 animate-spin shrink-0" />
            ) : isConnected ? (
              <Wifi className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
            ) : (
              <WifiOff className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
            )}
            <span className="uppercase tracking-wider">
              {isConnected ? 'Online' : showConnecting ? '...' : 'Off'}
            </span>
          </div>
          <GisSyncStatus />
        </div>

        {/* Center: Stats */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 sm:gap-2">
            <Database className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary shrink-0" />
            <span>
              <span className="font-bold text-primary">{activeCount}</span>
              <span className="text-muted-foreground">/{totalCount}</span>
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5">
            <Activity className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-success shrink-0" />
            <span className="text-muted-foreground hidden sm:inline">Live</span>
          </div>
        </div>

        {/* Right: Time */}
        <div className="flex items-center gap-1 sm:gap-2 text-foreground">
          <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium tabular-nums">{currentTime.toLocaleTimeString()}</span>
          <span className="hidden md:inline text-muted-foreground">{currentTime.toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}));

StatusBar.displayName = 'StatusBar';
export default StatusBar;
