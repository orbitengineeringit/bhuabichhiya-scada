import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import { useScada, TagData } from '@/contexts/ScadaContext';
import { BuaBicchiyaSensor } from '@/config/buaBicchiyaSensors';
import PtGauge from './instruments/PtGauge';
import LevelBar from './instruments/LevelBar';
import FlowIndicator from './instruments/FlowIndicator';
import ValveIcon from './instruments/ValveIcon';
import KwBar from './instruments/KwBar';
import ChlorineAnalyzer from './instruments/ChlorineAnalyzer';
import PhAnalyzer from './instruments/PhAnalyzer';
import TurbidityAnalyzer from './instruments/TurbidityAnalyzer';
import OhtLevelTank from './instruments/OhtLevelTank';
import WtpLevelTank from './instruments/WtpLevelTank';
import TotalizerDisplay from './instruments/TotalizerDisplay';
import IntakePump from './instruments/IntakePump';
import WtpPump from './instruments/WtpPump';
import AlarmSettingsModal, { AlarmSettings } from './AlarmSettingsModal';
import SensorTrendModal from './SensorTrendModal';
import { Button } from '@/components/ui/button';
import { Bell, TrendingUp, Wifi, WifiOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface InstrumentCardProps {
  tag: TagData;
  sensor: BuaBicchiyaSensor;
  section: 'intake' | 'oht' | 'wtp';
  index: number;
  pumpComponent?: 'intake' | 'wtp';
}

const InstrumentCard: React.FC<InstrumentCardProps> = memo(({ tag, sensor, section, index, pumpComponent }) => {
  const { updateTagAlarmSettings } = useScada();
  const [isFlickering, setIsFlickering] = useState(false);
  const [showAlarmSettings, setShowAlarmSettings] = useState(false);
  const [showTrends, setShowTrends] = useState(false);
  const prevValue = useRef(tag.value);
  useEffect(() => {
    if (prevValue.current !== tag.value) {
      setIsFlickering(true);
      const timer = setTimeout(() => setIsFlickering(false), 100);
      prevValue.current = tag.value;
      return () => clearTimeout(timer);
    }
  }, [tag.value]);

  // Derive connection status: binary ON (data flowing) or OFF (no data).
  // No "waiting/standby" state — MQTT either delivers or it doesn't.
  // Instant ON/OFF: derived purely from upstream tag.status. Zero values are
  // still "connected" (the value 0 is shown, not hidden as offline).
  const connectionStatus = useMemo<'connected' | 'no-data'>(
    () => (tag.status === 'disconnected' ? 'no-data' : 'connected'),
    [tag.status]
  );

  const handleAlarmSave = useCallback((settings: AlarmSettings) => {
    updateTagAlarmSettings(section, tag.id, settings);
  }, [updateTagAlarmSettings, section, tag.id]);

  const hasAlarmConfig = tag.alarmEnabled && (tag.highSetpoint !== undefined || tag.lowSetpoint !== undefined);
  const isDigital = sensor.type === 'digital';
  const isTotalizer = sensor.type === 'totalizer';

  const renderInstrument = () => {
    const showNotInstalled = sensor.notInstalled || tag.notInstalled;
    
    if (showNotInstalled && sensor.instrumentType !== 'kw') {
      return (
        <div className="flex flex-col items-center justify-center text-center gap-2 py-4">
          <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
            <span className="text-lg">🚫</span>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">Device Not Installed</span>
        </div>
      );
    }
    
    switch (sensor.instrumentType) {
      case 'pt':
        const isPt5 = tag.id === 'WTP-PT5';
        const ptSize = isPt5 ? 160 : 130;
        return <PtGauge value={tag.value} min={tag.min} max={tag.max} unit={tag.unit} label={tag.label} size={ptSize} variant={isPt5 ? 'cwph' : 'default'} />;
      case 'lt':
        if (section === 'oht') {
          return <OhtLevelTank value={tag.value} min={tag.min} max={tag.max} unit={tag.unit} />;
        }
        if (section === 'wtp') {
          const wtpVariant = sensor.id.includes('CW') ? 'clearwater' : 'backwash';
          return <WtpLevelTank value={tag.value} min={tag.min} max={tag.max} unit={tag.unit} variant={wtpVariant} />;
        }
        return <LevelBar value={tag.value} min={tag.min} max={tag.max} unit={tag.unit} label={tag.label} />;
      case 'flow': {
        const flowDir = sensor.id?.toLowerCase().includes('in') ? 'inlet' as const
          : sensor.id?.toLowerCase().includes('out') ? 'outlet' as const
          : undefined;
        return <FlowIndicator value={tag.value} unit={tag.unit} max={tag.max} direction={flowDir} />;
      }
      case 'totalizer':
        return <TotalizerDisplay value={tag.value} unit={tag.unit} />;
      case 'valve':
        return <ValveIcon isOpen={tag.value > 0.5} />;
      case 'kw':
        return (
          <div className="flex flex-col items-center w-full">
            <KwBar value={tag.value} max={tag.max} unit={tag.unit} />
            {showNotInstalled && (
              <span className="text-[10px] font-semibold text-destructive/70 mt-1">Device Not Installed</span>
            )}
          </div>
        );
      case 'pump':
        if (pumpComponent === 'wtp') {
          return <WtpPump isOn={tag.value > 0.5} label={sensor.label} size={100} />;
        }
        return <IntakePump isOn={tag.value > 0.5} label={sensor.label} size={100} />;
      case 'ph':
        return <PhAnalyzer value={tag.value} unit={tag.unit} />;
      case 'turbidity':
        return <TurbidityAnalyzer value={tag.value} max={tag.max} unit={tag.unit} />;
      case 'chlorine':
        return <ChlorineAnalyzer value={tag.value} max={tag.max} unit={tag.unit} />;
      case 'fcv':
        const fcvOpen = tag.value > 1;
        return (
          <div className="text-center w-full flex flex-col items-center">
            <div className="relative w-full max-w-[120px] aspect-square mx-auto mb-2">
              <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-sm">
                {/* Background track */}
                <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
                {/* Active arc */}
                <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(var(--primary))" strokeWidth="5"
                  strokeDasharray={`${(tag.value / 100) * 175.93} 175.93`}
                  strokeLinecap="round" transform="rotate(-90 32 32)" className="transition-all duration-500" />
                {/* Pulsing glow ring when valve is open */}
                {fcvOpen && (
                  <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" opacity="0.3">
                    <animate attributeName="r" values="28;31;28" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.3;0.05;0.3" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                {/* Flow indicator dots moving along the arc when open */}
                {fcvOpen && (
                  <circle r="2" fill="hsl(var(--primary))" opacity="0.6">
                    <animateMotion dur="2.5s" repeatCount="indefinite"
                      path="M32,4 A28,28 0 0,1 60,32" />
                    <animate attributeName="opacity" values="0;0.7;0" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                )}
                {/* Center value */}
                <text x="32" y="38" textAnchor="middle" className="fill-foreground text-xl font-mono font-bold">{tag.value.toFixed(0)}%</text>
              </svg>
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">FCV Position</span>
          </div>
        );
      default:
        return (
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-mono font-bold scada-value ${isFlickering ? 'value-flicker' : ''}`}>
              {tag.value.toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground">{tag.unit}</span>
          </div>
        );
    }
  };

  // Instrument health detection
  const instrumentHealth = useMemo(() => {
    if (tag.source !== 'mqtt') return 'unknown';
    if (connectionStatus === 'no-data') return 'offline';
    // Stuck detection: if value hasn't changed for a while despite receiving data
    if (connectionStatus === 'connected' && tag.value === 0 && !isDigital && !isTotalizer) return 'zero-reading';
    if (connectionStatus === 'connected') return 'healthy';
    if (connectionStatus === 'standby') return 'standby';
    return 'unknown';
  }, [connectionStatus, tag.source, tag.value, isDigital, isTotalizer]);

  const getHealthBadge = () => {
    // Always show an ON/OFF status so operators know if data is flowing,
    // regardless of whether the value is zero or the tag source is mqtt/sim.
    let label: string;
    let className: string;
    if (connectionStatus === 'connected') {
      label = 'ON';
      className = 'bg-success/15 text-success border border-success/30';
    } else {
      label = 'OFF';
      className = 'bg-destructive/15 text-destructive border border-destructive/30 animate-pulse';
    }
    return (
      <span className={`text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded-md tracking-wider ${className}`}>
        {label}
      </span>
    );
  };

  if (isDigital) {
    return (
      <div
        className={`premium-card rounded-xl p-3 sm:p-4 relative overflow-visible opacity-0 animate-fade-in flex flex-col h-full ${connectionStatus === 'no-data' ? 'border-destructive/50' : ''}`}
        style={{ animationDelay: `${index * 40}ms` }}
      >
        <div className="relative z-10 flex flex-col flex-1">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <div className="flex items-center gap-1 min-w-0">
              {connectionStatus === 'connected' ? (
                <Wifi className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-success shrink-0" />
              ) : (
                <WifiOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0 text-destructive animate-pulse" />
              )}
              <span className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">{sensor.label}</span>
            </div>
            {getHealthBadge()}
          </div>
          <div className="flex-1 flex items-center justify-center">
            {renderInstrument()}
          </div>
          <div className="flex items-center gap-1 mt-1">
            {connectionStatus === 'connected' && <div className="w-1.5 h-1.5 rounded-full bg-success pulse-live shrink-0" />}
            <span className="text-[9px] sm:text-[10px] text-muted-foreground font-mono truncate">{tag.timestamp.toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={`
          premium-card rounded-xl p-2 sm:p-3 relative overflow-visible cursor-pointer
          opacity-0 animate-fade-in
          flex flex-col h-full
          ${connectionStatus === 'no-data' ? 'border-destructive/50' : ''}
        `}
        style={{ animationDelay: `${index * 40}ms` }}
        onClick={() => setShowTrends(true)}
      >
        <div className="relative z-10 flex flex-col flex-1">
          <div className="flex items-center justify-between mb-1.5 sm:mb-2 shrink-0">
            <div className="flex items-center gap-1 min-w-0">
              {connectionStatus === 'connected' ? (
                <Wifi className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-success shrink-0" />
              ) : (
                <WifiOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0 text-destructive animate-pulse" />
              )}
              <span className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">{sensor.label}</span>
              {getHealthBadge()}
            </div>
            <div className="flex gap-0 sm:gap-0.5 shrink-0">
              <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-5 w-5 sm:h-6 sm:w-6 hover:bg-primary/10"
                      onClick={(e) => { e.stopPropagation(); setShowTrends(true); }}>
                      <TrendingUp className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="z-[100]"><p>View Trends</p></TooltipContent>
                </Tooltip>
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  <Button variant={hasAlarmConfig ? "default" : "ghost"} size="icon"
                    className={`h-5 w-5 sm:h-6 sm:w-6 ${hasAlarmConfig ? 'bg-primary text-primary-foreground' : 'hover:bg-primary/10'}`}
                    onClick={(e) => { e.stopPropagation(); setShowAlarmSettings(true); }}>
                    <Bell className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="z-[100]"><p>Alarm Settings</p></TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center py-0.5 sm:py-1 overflow-hidden">
            {renderInstrument()}
          </div>

          <div className="shrink-0 mt-auto">
            {(tag.highSetpoint !== undefined || tag.lowSetpoint !== undefined) && (
              <div className="flex gap-0.5 sm:gap-1 text-xs mt-1">
                {tag.highSetpoint !== undefined && (
                  <span className={`px-1 sm:px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-mono ${tag.value > tag.highSetpoint ? 'bg-destructive/20 text-destructive' : 'bg-secondary text-muted-foreground'}`}>
                    H:{tag.highSetpoint}
                  </span>
                )}
                {tag.lowSetpoint !== undefined && (
                  <span className={`px-1 sm:px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-mono ${tag.value < tag.lowSetpoint ? 'bg-warning/20 text-warning' : 'bg-secondary text-muted-foreground'}`}>
                    L:{tag.lowSetpoint}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-1 mt-1">
              {connectionStatus === 'connected' && <div className="w-1.5 h-1.5 rounded-full bg-success pulse-live shrink-0" />}
              <span className="text-[9px] sm:text-[10px] text-muted-foreground font-mono truncate">{tag.timestamp.toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </div>

      {showAlarmSettings && (
        <AlarmSettingsModal open={showAlarmSettings} onOpenChange={setShowAlarmSettings}
          tag={tag} section={section} onSave={handleAlarmSave} />
      )}
      {showTrends && (
        <SensorTrendModal open={showTrends} onOpenChange={setShowTrends}
          tagId={tag.id} label={tag.label} unit={tag.unit} section={section}
          highSetpoint={tag.highSetpoint} lowSetpoint={tag.lowSetpoint} currentValue={tag.value} />
      )}
    </>
  );
}, (prev, next) => {
  return (
    prev.tag.value === next.tag.value &&
    prev.tag.timestamp === next.tag.timestamp &&
    prev.tag.highSetpoint === next.tag.highSetpoint &&
    prev.tag.lowSetpoint === next.tag.lowSetpoint &&
    prev.tag.alarmEnabled === next.tag.alarmEnabled &&
    prev.tag.status === next.tag.status &&
    prev.sensor.id === next.sensor.id &&
    prev.section === next.section &&
    prev.index === next.index
  );
});

InstrumentCard.displayName = 'InstrumentCard';

export default InstrumentCard;