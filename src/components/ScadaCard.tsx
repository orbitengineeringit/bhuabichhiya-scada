import React, { useState, useEffect, useRef, forwardRef } from 'react';
import { useScada, TagData } from '@/contexts/ScadaContext';
import { Activity, Gauge, Thermometer, Droplets, Zap, Settings2, AlertCircle, Bell, Wifi, WifiOff, TrendingUp } from 'lucide-react';
import AlarmSettingsModal, { AlarmSettings } from './AlarmSettingsModal';
import SensorTrendModal from './SensorTrendModal';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ScadaCardProps {
  tag: TagData;
  section: 'intake' | 'oht' | 'wtp';
  index: number;
}

const getIconForTag = (label: string) => {
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes('pressure') || lowerLabel.includes('psi') || lowerLabel.includes('pt')) return Gauge;
  if (lowerLabel.includes('temp')) return Thermometer;
  if (lowerLabel.includes('flow') || lowerLabel.includes('level') || lowerLabel.includes('water')) return Droplets;
  if (lowerLabel.includes('power') || lowerLabel.includes('kw') || lowerLabel.includes('energy')) return Zap;
  return Activity;
};

type ConnectionStatus = 'connected' | 'no-data';

const ScadaCard = forwardRef<HTMLDivElement, ScadaCardProps>(({ tag, section, index }, ref) => {
  const { configMode, updateTagAlarmSettings } = useScada();
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

  // Instant ON/OFF: derive purely from upstream tag.status. Zero values stay "connected".
  const connectionStatus: ConnectionStatus =
    tag.status === 'disconnected' ? 'no-data' : 'connected';

  const handleAlarmSettingsSave = (settings: AlarmSettings) => {
    updateTagAlarmSettings(section, tag.id, settings);
  };

  const Icon = tag.label ? getIconForTag(tag.label) : AlertCircle;
  const percentage = ((tag.value - tag.min) / (tag.max - tag.min)) * 100;
  
  const getStatusColor = () => {
    if (!tag.isActive) return 'muted';
    if (tag.highSetpoint !== undefined && tag.value > tag.highSetpoint) return 'destructive';
    if (tag.lowSetpoint !== undefined && tag.value < tag.lowSetpoint) return 'warning';
    if (percentage > 90 || percentage < 10) return 'destructive';
    if (percentage > 75 || percentage < 25) return 'warning';
    return 'success';
  };

  const statusColor = getStatusColor();
  const hasAlarmConfig = tag.alarmEnabled && (tag.highSetpoint !== undefined || tag.lowSetpoint !== undefined);

  const getConnectionBadge = () => {
    if (!tag.isActive) return null;
    switch (connectionStatus) {
      case 'connected':
        return (
          <span className="status-indicator status-active">
            <Wifi className="w-3 h-3 text-success" />
          </span>
        );
      case 'no-data':
        return (
          <span className="status-indicator bg-destructive/10 text-destructive animate-pulse">
            <WifiOff className="w-3 h-3" />
          </span>
        );
    }
  };

  return (
    <>
      <div
        ref={ref}
        className={`
          premium-card p-4 relative overflow-hidden cursor-pointer
          opacity-0 animate-fade-in transition-all duration-300
          hover:ring-1 hover:ring-primary/20
          ${configMode ? 'config-active' : ''}
          ${!tag.isActive ? 'opacity-60' : ''}
          ${connectionStatus === 'no-data' ? 'border-destructive/40' : ''}
        `}
        style={{ animationDelay: `${index * 50}ms` }}
        onClick={() => tag.isActive && setShowTrends(true)}
      >
        {tag.isActive && (
          <div
            className="absolute inset-0 opacity-[0.02] transition-opacity duration-500"
            style={{
              background: `radial-gradient(ellipse at top right, hsl(var(--${statusColor})) 0%, transparent 70%)`,
            }}
          />
        )}

        {configMode && (
          <div className="absolute top-2 right-2 z-10">
            <Settings2 className="h-4 w-4 text-accent animate-pulse" />
          </div>
        )}

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase">
                {tag.id}
              </span>
              {getConnectionBadge()}
            </div>
            
            <div className="flex items-center gap-1.5">
              {!configMode && tag.isActive && (
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon"
                      className="h-7 w-7 bg-card hover:bg-secondary border border-border hover:border-primary/50 text-muted-foreground hover:text-primary"
                      onClick={(e) => { e.stopPropagation(); setShowTrends(true); }}>
                      <TrendingUp className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>View Trends</p></TooltipContent>
                </Tooltip>
              )}
              {!configMode && tag.isActive && (
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={hasAlarmConfig ? "default" : "outline"} size="icon"
                      className={`h-7 w-7 ${hasAlarmConfig 
                        ? 'bg-primary hover:bg-primary/90 text-primary-foreground' 
                        : 'bg-card hover:bg-secondary border border-border hover:border-primary/50 text-muted-foreground hover:text-primary'}`}
                      onClick={(e) => { e.stopPropagation(); setShowAlarmSettings(true); }}>
                      <Bell className={`h-3.5 w-3.5 ${hasAlarmConfig ? 'animate-pulse' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>{hasAlarmConfig ? 'Edit Alarms' : 'Set Alarms'}</p></TooltipContent>
                </Tooltip>
              )}
              <div className={`p-1.5 rounded-lg ${tag.isActive ? `bg-${statusColor}/10` : 'bg-muted'}`}>
                <Icon className={`h-3.5 w-3.5 ${tag.isActive ? `text-${statusColor}` : 'text-muted-foreground'}`} />
              </div>
            </div>
          </div>

          <h3 className="text-sm font-medium text-foreground mb-2 truncate">
            {tag.label || <span className="text-muted-foreground italic">Not configured</span>}
          </h3>

          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-2xl font-mono font-bold ${tag.isActive ? 'scada-value' : 'text-muted-foreground'} ${isFlickering ? 'value-flicker' : ''}`}>
              {tag.isActive ? tag.value.toFixed(2) : '---'}
            </span>
            <span className="text-xs text-muted-foreground">{tag.unit || '--'}</span>
          </div>

          {tag.isActive && (tag.highSetpoint !== undefined || tag.lowSetpoint !== undefined) && (
            <div className="flex gap-2 text-[10px] mb-2">
              {tag.highSetpoint !== undefined && (
                <span className={`px-1.5 py-0.5 rounded-md ${tag.value > tag.highSetpoint ? 'bg-destructive/15 text-destructive' : 'bg-secondary text-muted-foreground'}`}>
                  H: {tag.highSetpoint}
                </span>
              )}
              {tag.lowSetpoint !== undefined && (
                <span className={`px-1.5 py-0.5 rounded-md ${tag.value < tag.lowSetpoint ? 'bg-warning/15 text-warning' : 'bg-secondary text-muted-foreground'}`}>
                  L: {tag.lowSetpoint}
                </span>
              )}
            </div>
          )}

          <div className="h-1 bg-secondary/80 rounded-full overflow-hidden mb-2">
            {tag.isActive && (
              <div className={`h-full rounded-full transition-all duration-300 ease-out bg-${statusColor}`}
                style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }} />
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {tag.isActive && connectionStatus === 'connected' && (
                <div className="w-1.5 h-1.5 rounded-full bg-success pulse-live" />
              )}
              <span className="text-[10px] text-muted-foreground font-mono">
                {tag.isActive ? tag.timestamp.toLocaleTimeString() : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <AlarmSettingsModal open={showAlarmSettings} onOpenChange={setShowAlarmSettings}
        tag={tag} section={section} onSave={handleAlarmSettingsSave} />
      <SensorTrendModal open={showTrends} onOpenChange={setShowTrends}
        tagId={tag.id} label={tag.label} unit={tag.unit} section={section}
        highSetpoint={tag.highSetpoint} lowSetpoint={tag.lowSetpoint} currentValue={tag.value} />
    </>
  );
});

ScadaCard.displayName = 'ScadaCard';
export default ScadaCard;
