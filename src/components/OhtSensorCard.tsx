import React, { useState, useEffect, useRef } from 'react';
import { useScada, TagData } from '@/contexts/ScadaContext';
import { Gauge, Droplets, Activity, Bell, Wifi, WifiOff, TrendingUp } from 'lucide-react';
import AlarmSettingsModal, { AlarmSettings } from './AlarmSettingsModal';
import SensorTrendModal from './SensorTrendModal';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface OhtSensorCardProps {
  tag: TagData;
  index: number;
}

// Fixed icons for each sensor type
const getIconForSensor = (id: string) => {
  switch (id) {
    case 'OHT-001': return Gauge;      // Pressure
    case 'OHT-002': return Droplets;   // Level
    case 'OHT-003': return Activity;   // Flow
    default: return Activity;
  }
};

// Connection status types
type ConnectionStatus = 'connected' | 'no-data';

const OhtSensorCard: React.FC<OhtSensorCardProps> = ({ tag, index }) => {
  const { updateTagAlarmSettings } = useScada();
  const [isFlickering, setIsFlickering] = useState(false);
  const [showAlarmSettings, setShowAlarmSettings] = useState(false);
  const [showTrends, setShowTrends] = useState(false);
  const prevValue = useRef(tag.value);

  // Track value changes for flickering effect
  useEffect(() => {
    if (prevValue.current !== tag.value) {
      setIsFlickering(true);
      const timer = setTimeout(() => setIsFlickering(false), 100);
      prevValue.current = tag.value;
      return () => clearTimeout(timer);
    }
  }, [tag.value]);

  // Instant ON/OFF: derive purely from upstream tag.status, which useMqttTagSync
  // flips within ~1s of MQTT going silent. Zero values stay "connected".
  const connectionStatus: ConnectionStatus =
    tag.status === 'disconnected' ? 'no-data' : 'connected';

  const handleAlarmSettingsSave = (settings: AlarmSettings) => {
    updateTagAlarmSettings('oht', tag.id, settings);
  };

  const Icon = getIconForSensor(tag.id);
  const percentage = ((tag.value - tag.min) / (tag.max - tag.min)) * 100;
  
  // Determine status color
  const getStatusColor = () => {
    if (tag.highSetpoint !== undefined && tag.value > tag.highSetpoint) return 'destructive';
    if (tag.lowSetpoint !== undefined && tag.value < tag.lowSetpoint) return 'warning';
    if (percentage > 90 || percentage < 10) return 'destructive';
    if (percentage > 75 || percentage < 25) return 'warning';
    return 'success';
  };

  const statusColor = getStatusColor();

  // Get connection status badge
  const getConnectionBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <span className="status-indicator status-active">
            <Wifi className="w-3 h-3 text-success" />
            <span className="text-success">Connected</span>
          </span>
        );
      case 'no-data':
        return (
          <span className="status-indicator bg-destructive/10 text-destructive border-destructive/30 animate-pulse">
            <WifiOff className="w-3 h-3" />
            <span>No Data</span>
          </span>
        );
      default:
        return null;
    }
  };

  const hasAlarmConfig = tag.alarmEnabled && (tag.highSetpoint !== undefined || tag.lowSetpoint !== undefined);

  return (
    <>
      <div
        className={`
          premium-card rounded-xl p-4 relative overflow-hidden cursor-pointer
          opacity-0 animate-fade-in transition-all duration-300
          hover:ring-2 hover:ring-primary/30 hover:shadow-lg
          ${connectionStatus === 'no-data' ? 'border-destructive/50' : ''}
        `}
        style={{ animationDelay: `${index * 50}ms` }}
        onClick={() => setShowTrends(true)}
      >
        {/* Background gradient based on status */}
        <div
          className="absolute inset-0 opacity-[0.03] transition-opacity duration-500"
          style={{
            background: `radial-gradient(ellipse at top right, hsl(var(--${statusColor})) 0%, transparent 70%)`,
          }}
        />

        <div className="relative z-10">
          {/* Header with Connection Status and Alarm Bell */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {getConnectionBadge()}
            </div>
            
            <div className="flex items-center gap-2">
              {/* Trend Button */}
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 bg-card hover:bg-secondary border border-border hover:border-primary/50 text-muted-foreground hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTrends(true);
                    }}
                  >
                    <TrendingUp className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-popover text-popover-foreground border border-border shadow-lg z-50">
                  <p className="font-medium">📈 View Trends</p>
                </TooltipContent>
              </Tooltip>

              {/* Alarm Settings Button */}
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  <Button
                    variant={hasAlarmConfig ? "default" : "outline"}
                    size="icon"
                    className={`
                      h-8 w-8 transition-all duration-200
                      focus-visible:ring-2 focus-visible:ring-primary/30
                      ${hasAlarmConfig 
                        ? 'bg-primary hover:bg-primary/90 text-primary-foreground hover:shadow-[0_0_12px_hsl(var(--primary)/0.4)]' 
                        : 'bg-card hover:bg-secondary border border-border hover:border-primary/50 text-muted-foreground hover:text-primary hover:shadow-[0_0_8px_hsl(var(--primary)/0.2)]'
                      }
                    `}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAlarmSettings(true);
                    }}
                  >
                    <Bell className={`h-4 w-4 ${hasAlarmConfig ? 'animate-pulse' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-popover text-popover-foreground border border-border shadow-lg z-50">
                  <p className="font-medium">{hasAlarmConfig ? '⚙️ Edit Alarm Settings' : '🔔 Configure Alarms'}</p>
                </TooltipContent>
              </Tooltip>
              
              {/* Status Icon */}
              <div className={`p-2 rounded-lg bg-${statusColor}/10`}>
                <Icon className={`h-4 w-4 text-${statusColor}`} />
              </div>
            </div>
          </div>

          {/* FIXED Tag Label - NOT Editable */}
          <h3 className="text-sm font-medium text-foreground mb-3 truncate">
            {tag.label}
          </h3>

          {/* Value Display with FIXED Unit */}
          <div className="flex items-baseline gap-2 mb-2">
            <span
              className={`text-3xl font-mono font-bold scada-value ${isFlickering ? 'value-flicker' : ''}`}
            >
              {tag.value.toFixed(2)}
            </span>
            <span className="text-sm text-muted-foreground">{tag.unit}</span>
          </div>

          {/* Setpoint indicators */}
          {(tag.highSetpoint !== undefined || tag.lowSetpoint !== undefined) && (
            <div className="flex gap-2 text-xs mb-2">
              {tag.highSetpoint !== undefined && (
                <span className={`px-1.5 py-0.5 rounded ${tag.value > tag.highSetpoint ? 'bg-destructive/20 text-destructive' : 'bg-secondary text-muted-foreground'}`}>
                  H: {tag.highSetpoint}
                </span>
              )}
              {tag.lowSetpoint !== undefined && (
                <span className={`px-1.5 py-0.5 rounded ${tag.value < tag.lowSetpoint ? 'bg-warning/20 text-warning' : 'bg-secondary text-muted-foreground'}`}>
                  L: {tag.lowSetpoint}
                </span>
              )}
            </div>
          )}

          {/* Progress bar */}
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden mb-3">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out bg-${statusColor}`}
              style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
            />
          </div>

          {/* Timestamp and click hint */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {connectionStatus === 'connected' && (
                <div className="w-1.5 h-1.5 rounded-full bg-success pulse-live" />
              )}
              <span className="text-xs text-muted-foreground font-mono">
                {tag.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <span className="text-xs text-muted-foreground/50">Click for trends</span>
          </div>
        </div>
      </div>

      {/* Alarm Settings Modal */}
      <AlarmSettingsModal
        open={showAlarmSettings}
        onOpenChange={setShowAlarmSettings}
        tag={tag}
        section="oht"
        onSave={handleAlarmSettingsSave}
      />

      {/* Sensor Trend Modal */}
      <SensorTrendModal
        open={showTrends}
        onOpenChange={setShowTrends}
        tagId={tag.id}
        label={tag.label}
        unit={tag.unit}
        section="oht"
        highSetpoint={tag.highSetpoint}
        lowSetpoint={tag.lowSetpoint}
        currentValue={tag.value}
      />
    </>
  );
};

export default OhtSensorCard;
