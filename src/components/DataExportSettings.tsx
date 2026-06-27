import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, CheckCircle, Clock, Shield } from 'lucide-react';
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
  const [exports, setExports] = useState<DataExport[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('data_exports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      if (data) {
        setExports(data as unknown as DataExport[]);
      }
    } catch (error) {
      logError('DataExport.loadData', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
    const isExpired = new Date(exp.period_end).getTime() < Date.now() - 365 * 24 * 60 * 60 * 1000;
    if (exp.status === 'cleaned' || isExpired) {
      return <Badge className="bg-success/20 text-success border-success/30 font-medium"><CheckCircle className="h-3 w-3 mr-1" />Cleaned</Badge>;
    }
    return <Badge className="bg-primary/20 text-primary border-primary/30 font-medium"><Shield className="h-3 w-3 mr-1" />Active</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Data Retention Policy */}
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
              <p className="text-xs text-muted-foreground">Preserved in database for <strong>1 year</strong>, and automatically exported every <strong>3 months</strong> as CSV via email + download</p>
            </div>
            <div className="p-4 rounded-lg bg-warning/5 border border-warning/20">
              <h4 className="font-semibold text-sm text-warning mb-1">1-Year Cleanup</h4>
              <p className="text-xs text-muted-foreground"><strong>Rolling Monthly Deletion</strong> — Data older than 12 months is automatically deleted in 1-month blocks to keep database size lightweight</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Download className="h-5 w-5 text-primary" />
            Export History
          </CardTitle>
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
                    <TableHead>Email Status</TableHead>
                    <TableHead>DB Status</TableHead>
                    <TableHead>Export Date</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exports.map((exp) => {
                    const isExpired = new Date(exp.period_end).getTime() < Date.now() - 365 * 24 * 60 * 60 * 1000;
                    return (
                      <TableRow key={exp.id}>
                        <TableCell className="font-mono text-xs">
                          {format(new Date(exp.period_start), 'dd/MM/yy')} — {format(new Date(exp.period_end), 'dd/MM/yy')}
                        </TableCell>
                        <TableCell className="font-bold">{exp.record_count?.toLocaleString() || '0'}</TableCell>
                        <TableCell>
                          {exp.email_sent ? (
                            <Badge className="bg-success/20 text-success border-success/30 font-medium">Sent</Badge>
                          ) : (
                            <Badge className="bg-warning/20 text-warning border-warning/30 font-medium">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(exp)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(exp.created_at), 'dd/MM/yy HH:mm')}
                        </TableCell>
                        <TableCell>
                          {exp.status !== 'cleaned' && !isExpired && exp.file_path && (
                            <Button size="sm" variant="ghost" onClick={() => downloadExport(exp)} className="h-8 w-8 p-0">
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
