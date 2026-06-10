import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Mail, Trash2, Plus, Loader2, Shield, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { logError } from '@/lib/errorLogger';

interface DataExport {
  id: string;
  period_start: string;
  period_end: string;
  file_path: string;
  record_count: number;
  email_sent: boolean;
  downloaded: boolean;
  cleanup_done: boolean;
  status: string;
  created_at: string;
}

const DataExportSettings: React.FC = () => {
  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [exports, setExports] = useState<DataExport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [recipientsResult, exportsResult] = await Promise.all([
        supabase.from('notification_recipients').select('email').eq('scope', 'export'),
        supabase.from('data_exports').select('*').order('created_at', { ascending: false }).limit(20),
      ]);

      setEmails((recipientsResult.data || []).map((r: any) => r.email));
      if (exportsResult.data) {
        setExports(exportsResult.data as unknown as DataExport[]);
      }
    } catch (error) {
      logError('DataExport.loadData', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const saveEmails = async (updatedEmails: string[]) => {
    setIsSaving(true);
    try {
      // Replace export recipients: delete all + insert new
      const { error: delErr } = await supabase
        .from('notification_recipients')
        .delete()
        .eq('scope', 'export');
      if (delErr) throw delErr;

      if (updatedEmails.length > 0) {
        const rows = updatedEmails.map((email) => ({
          scope: 'export',
          tag_config_id: null,
          email: email.toLowerCase(),
        }));
        const { error: insErr } = await supabase
          .from('notification_recipients')
          .insert(rows);
        if (insErr) throw insErr;
      }

      setEmails(updatedEmails);
      toast.success('Export emails updated');
    } catch (error) {
      logError('DataExport.saveEmails', error);
      toast.error('Failed to save emails');
    } finally {
      setIsSaving(false);
    }
  };

  const addEmail = () => {
    const email = newEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (emails.includes(email)) {
      toast.error('Email already added');
      return;
    }
    if (emails.length >= 5) {
      toast.error('Maximum 5 emails allowed');
      return;
    }
    saveEmails([...emails, email]);
    setNewEmail('');
  };

  const removeEmail = (email: string) => {
    saveEmails(emails.filter(e => e !== email));
  };

  const triggerManualExport = async () => {
    setIsExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-historian-data', {
        body: { action: 'export' },
      });

      if (error) throw error;
      toast.success('Export triggered successfully');
      loadData();
    } catch (error) {
      logError('DataExport.triggerExport', error);
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const downloadExport = async (exp: DataExport) => {
    try {
      const { data, error } = await supabase.functions.invoke('export-historian-data', {
        body: { action: 'get_download_url', filePath: exp.file_path },
      });

      if (error) throw error;
      if (data?.downloadUrl) {
        window.open(data.downloadUrl, '_blank');

        // Mark as downloaded
        await supabase.functions.invoke('export-historian-data', {
          body: { action: 'mark_downloaded', exportId: exp.id },
        });

        toast.success('Download started — export marked as confirmed');
        loadData();
      } else {
        toast.error('Download link not available');
      }
    } catch (error) {
      logError('DataExport.download', error);
      toast.error('Failed to get download link');
    }
  };

  const getStatusBadge = (exp: DataExport) => {
    if (exp.status === 'cleaned') {
      return <Badge className="bg-success/20 text-success"><CheckCircle className="h-3 w-3 mr-1" />Cleaned</Badge>;
    }
    if (exp.downloaded || exp.email_sent) {
      return <Badge className="bg-primary/20 text-primary"><Shield className="h-3 w-3 mr-1" />Confirmed</Badge>;
    }
    return <Badge className="bg-warning/20 text-warning"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Export Email Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="h-5 w-5 text-primary" />
            Export Email Recipients
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Data export reports will be sent to these email addresses every 3 months automatically.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Enter email address"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addEmail()}
              type="email"
              className="flex-1"
            />
            <Button onClick={addEmail} disabled={isSaving} size="sm">
              <Plus className="h-4 w-4 mr-1" />Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {emails.map((email) => (
              <Badge key={email} variant="secondary" className="flex items-center gap-1 px-3 py-1.5">
                {email}
                <button onClick={() => removeEmail(email)} className="ml-1 hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {emails.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No emails configured — exports won't be emailed</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Retention Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-success" />
            Data Retention Policy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="font-semibold text-sm text-primary mb-1">Raw Data</h4>
              <p className="text-xs text-muted-foreground">Kept for <strong>7 days</strong>, then auto-cleaned (hourly aggregates preserved)</p>
            </div>
            <div className="p-4 rounded-lg bg-success/5 border border-success/20">
              <h4 className="font-semibold text-sm text-success mb-1">Hourly Aggregates</h4>
              <p className="text-xs text-muted-foreground">Exported every <strong>3 months</strong> as CSV via email + download</p>
            </div>
            <div className="p-4 rounded-lg bg-warning/5 border border-warning/20">
              <h4 className="font-semibold text-sm text-warning mb-1">Safety Check</h4>
              <p className="text-xs text-muted-foreground"><strong>7-day grace period</strong> — cleanup only after confirmed download/email</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Download className="h-5 w-5 text-primary" />
            Export History
          </CardTitle>
          <Button onClick={triggerManualExport} disabled={isExporting} size="sm" variant="outline">
            {isExporting
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Exporting...</>
              : <><Download className="h-4 w-4 mr-1" />Manual Export</>}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : exports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Download className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No exports yet</p>
              <p className="text-sm">First auto-export will run after 3 months of data collection</p>
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Downloaded</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exports.map((exp) => (
                    <TableRow key={exp.id}>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(exp.period_start), 'dd/MM/yy')} — {format(new Date(exp.period_end), 'dd/MM/yy')}
                      </TableCell>
                      <TableCell className="font-bold">{exp.record_count.toLocaleString()}</TableCell>
                      <TableCell>{getStatusBadge(exp)}</TableCell>
                      <TableCell>{exp.email_sent ? '✅' : '❌'}</TableCell>
                      <TableCell>{exp.downloaded ? '✅' : '❌'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(exp.created_at), 'dd/MM/yy HH:mm')}
                      </TableCell>
                      <TableCell>
                        {exp.status !== 'cleaned' && exp.file_path && (
                          <Button size="sm" variant="ghost" onClick={() => downloadExport(exp)}>
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DataExportSettings;
