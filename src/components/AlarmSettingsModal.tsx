import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Mail, Bell, AlertTriangle } from 'lucide-react';
import { TagData } from '@/contexts/ScadaContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logError } from '@/lib/errorLogger';

interface AlarmSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag: TagData;
  section: 'intake' | 'oht' | 'wtp';
  onSave: (settings: AlarmSettings) => void;
}

export interface AlarmSettings {
  highSetpoint?: number;
  lowSetpoint?: number;
  alarmEnabled: boolean;
  alarmEmails: string[];
}

const AlarmSettingsModal: React.FC<AlarmSettingsModalProps> = ({
  open,
  onOpenChange,
  tag,
  section,
  onSave,
}) => {
  const { toast } = useToast();
  const [highSetpoint, setHighSetpoint] = useState<string>('');
  const [lowSetpoint, setLowSetpoint] = useState<string>('');
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Load current settings when modal opens
  useEffect(() => {
    if (open && tag) {
      setHighSetpoint(tag.highSetpoint?.toString() || '');
      setLowSetpoint(tag.lowSetpoint?.toString() || '');
      setAlarmEnabled(tag.alarmEnabled ?? true);
      
      // Load emails from database
      loadEmails();
    }
  }, [open, tag]);

  const loadEmails = async () => {
    if (!tag.dbId) return;

    try {
      const { data } = await supabase
        .from('notification_recipients')
        .select('email')
        .eq('scope', 'alarm')
        .eq('tag_config_id', tag.dbId);

      setEmails((data || []).map((r) => r.email));
    } catch (error) {
      logError('AlarmSettings.loadEmails', error);
      setEmails([]);
    }
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const handleAddEmail = () => {
    const trimmedEmail = newEmail.trim().toLowerCase();
    
    if (!trimmedEmail) return;
    
    if (!validateEmail(trimmedEmail)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      });
      return;
    }
    
    if (emails.includes(trimmedEmail)) {
      toast({
        title: 'Duplicate Email',
        description: 'This email is already in the list.',
        variant: 'destructive',
      });
      return;
    }
    
    setEmails([...emails, trimmedEmail]);
    setNewEmail('');
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setEmails(emails.filter(email => email !== emailToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddEmail();
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      const settings: AlarmSettings = {
        highSetpoint: highSetpoint ? parseFloat(highSetpoint) : undefined,
        lowSetpoint: lowSetpoint ? parseFloat(lowSetpoint) : undefined,
        alarmEnabled,
        alarmEmails: emails,
      };

      // Save to database if tag has dbId
      if (tag.dbId) {
        const { error } = await supabase
          .from('tag_config')
          .update({
            high_setpoint: settings.highSetpoint || null,
            low_setpoint: settings.lowSetpoint || null,
            alarm_enabled: settings.alarmEnabled,
          })
          .eq('id', tag.dbId);

        if (error) throw error;

        // Replace alarm recipients atomically: delete existing, insert new
        await supabase
          .from('notification_recipients')
          .delete()
          .eq('scope', 'alarm')
          .eq('tag_config_id', tag.dbId);

        if (settings.alarmEmails.length > 0) {
          const rows = settings.alarmEmails.map((email) => ({
            scope: 'alarm',
            tag_config_id: tag.dbId!,
            email: email.toLowerCase(),
          }));
          const { error: insertErr } = await supabase
            .from('notification_recipients')
            .insert(rows);
          if (insertErr) throw insertErr;
        }
      }

      onSave(settings);
      
      toast({
        title: 'Settings Saved',
        description: `Alarm settings for ${tag.label || tag.id} have been updated.`,
      });
      
      onOpenChange(false);
    } catch (error) {
      logError('AlarmSettings.save', error);
      toast({
        title: 'Save Failed',
        description: 'Could not save alarm settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-card border-border" aria-describedby="alarm-settings-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Bell className="h-5 w-5 text-primary" />
            Alarm Settings - {tag.label || tag.id}
          </DialogTitle>
          <p id="alarm-settings-description" className="text-sm text-muted-foreground">
            Configure alarm thresholds and email notifications for this tag.
          </p>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Alarm Enable Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-foreground">Enable Alarms</Label>
              <p className="text-xs text-muted-foreground">
                Receive notifications when value exceeds setpoints
              </p>
            </div>
            <Switch
              checked={alarmEnabled}
              onCheckedChange={setAlarmEnabled}
            />
          </div>

          {/* Setpoints */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="highSetpoint" className="flex items-center gap-1 text-foreground">
                <AlertTriangle className="h-3 w-3 text-destructive" />
                High Setpoint
              </Label>
              <Input
                id="highSetpoint"
                type="number"
                step="0.01"
                placeholder={`e.g., 80`}
                value={highSetpoint}
                onChange={(e) => setHighSetpoint(e.target.value)}
                className="bg-secondary/50 border-border"
                disabled={!alarmEnabled}
              />
              <p className="text-xs text-muted-foreground">
                Alarm if value &gt; {highSetpoint || '?'} {tag.unit}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lowSetpoint" className="flex items-center gap-1 text-foreground">
                <AlertTriangle className="h-3 w-3 text-warning" />
                Low Setpoint
              </Label>
              <Input
                id="lowSetpoint"
                type="number"
                step="0.01"
                placeholder={`e.g., 20`}
                value={lowSetpoint}
                onChange={(e) => setLowSetpoint(e.target.value)}
                className="bg-secondary/50 border-border"
                disabled={!alarmEnabled}
              />
              <p className="text-xs text-muted-foreground">
                Alarm if value &lt; {lowSetpoint || '?'} {tag.unit}
              </p>
            </div>
          </div>

          {/* Email Recipients */}
          <div className="space-y-3">
            <Label className="flex items-center gap-1 text-foreground">
              <Mail className="h-4 w-4 text-primary" />
              Email Recipients
            </Label>
            
            {/* Email Input */}
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Enter email address..."
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-secondary/50 border-border"
                disabled={!alarmEnabled}
              />
              <Button
                type="button"
                size="icon"
                onClick={handleAddEmail}
                disabled={!alarmEnabled || !newEmail.trim()}
                className="shrink-0"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Email Chips */}
            <div className="flex flex-wrap gap-2 min-h-[32px]">
              {emails.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No email recipients added
                </p>
              ) : (
                emails.map((email) => (
                  <Badge
                    key={email}
                    variant="secondary"
                    className="flex items-center gap-1 pl-2 pr-1 py-1 bg-secondary text-secondary-foreground"
                  >
                    <span className="text-xs">{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveEmail(email)}
                      className="ml-1 hover:bg-destructive/20 rounded p-0.5 transition-colors"
                      disabled={!alarmEnabled}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
            
            <p className="text-xs text-muted-foreground">
              All recipients will receive alarm notifications via email
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AlarmSettingsModal;
