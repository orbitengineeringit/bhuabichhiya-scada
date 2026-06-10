import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import StatusBar from '@/components/StatusBar';
import GlobalFilterBar, { GlobalFilters, AssetFilter } from '@/components/GlobalFilterBar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useScada } from '@/contexts/ScadaContext';
import ExcelJS from 'exceljs';
import { 
  Download, 
  FileSpreadsheet, 
  Loader2, 
  Database, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw,
  Waves, 
  Filter, 
  Gauge, 
  Ruler, 
  Activity, 
  FlaskConical, 
  Power, 
  Zap,
  Droplet
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { logError } from '@/lib/errorLogger';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface HistorianLog {
  id: string;
  tag_id: string;
  section: string;
  value: number;
  timestamp: string;
  tag_config: {
    label: string;
    unit: string;
  } | null;
}

const OhtSvg = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 14L5 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M17 14L19 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M12 12V22" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M8 18H16" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    <rect x="6" y="4" width="12" height="9" rx="1.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M9 4C9 3 15 3 15 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="8" y1="10" x2="16" y2="10" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1 1"/>
  </svg>
);

const IntakeWellSvg = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="14" width="14" height="7" rx="1" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M5 17H19" stroke="currentColor" strokeWidth="1"/>
    <path d="M7 14V7" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M17 14V7" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M5 8L12 3L19 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 7V11" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="10.5" y="11" width="3" height="3" rx="0.5" fill="currentColor" stroke="currentColor" strokeWidth="1"/>
  </svg>
);

const WtpSvg = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 21H21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M4 21V10L9 7L14 10L19 7V21H4Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <line x1="7" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1"/>
    <line x1="7" y1="17" x2="16" y2="17" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1 1"/>
    <path d="M12 11C13 11 14 12 14 13C14 14.5 12 16.5 12 16.5C12 16.5 10 14.5 10 13C10 12 11 11 12 11Z" fill="#38bdf8" stroke="#0284c7" strokeWidth="1"/>
  </svg>
);

const VtPumpSvg = ({ className = "h-4.5 w-4.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="3" width="8" height="7" rx="1.5" fill="currentColor" fillOpacity="0.20" stroke="currentColor" strokeWidth="1.8"/>
    <line x1="10" y1="5" x2="10" y2="8" stroke="currentColor" strokeWidth="1.2"/>
    <line x1="12" y1="5" x2="12" y2="8" stroke="currentColor" strokeWidth="1.2"/>
    <line x1="14" y1="5" x2="14" y2="8" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="7" y="10" width="10" height="2" rx="0.5" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="1"/>
    <path d="M11 12V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M13 12V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M9 21H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M13 14H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M16 12L18 14L16 16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const LevelTransmitterSvg = ({ className = "h-4.5 w-4.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="9" y="3" width="6" height="5" rx="1" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="8" y="8" width="8" height="1.5" rx="0.5" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="0.8"/>
    <path d="M12 9.5V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M10 12.5C11 12 13 12 14 12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M8.5 15C10.5 14.2 13.5 14.2 15.5 15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M4 18.5C6 18 18 18 20 18.5" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const PressureTransmitterSvg = ({ className = "h-4.5 w-4.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="9" r="6" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M12 9L15 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="12" cy="9" r="1" fill="#fff" stroke="currentColor" strokeWidth="0.8"/>
    <rect x="10" y="15" width="4" height="4" rx="0.5" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="1"/>
    <line x1="12" y1="15" x2="12" y2="18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
    <line x1="11" y1="20" x2="13" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const FlowTransmitterSvg = ({ className = "h-4.5 w-4.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="11" width="2" height="8" rx="0.5" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="0.8"/>
    <rect x="19" y="11" width="2" height="8" rx="0.5" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="0.8"/>
    <rect x="5" y="12" width="14" height="6" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="9" y="4" width="6" height="6" rx="1.2" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.8"/>
    <line x1="12" y1="10" x2="12" y2="12" stroke="currentColor" strokeWidth="2"/>
    <path d="M8 15H16M16 15L13.5 12.5M16 15L13.5 17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const PhAnalyzerSvg = ({ className = "h-4.5 w-4.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 3H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M10.5 3V8L5.5 17C4.5 19 6 21 8.5 21H15.5C18 21 19.5 19 18.5 17L13.5 8V3H10.5Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <rect x="11.2" y="5" width="1.6" height="11" rx="0.8" fill="currentColor" stroke="currentColor" strokeWidth="0.8"/>
    <rect x="11" y="15" width="2" height="2" rx="0.5" fill="#f59e0b"/>
    <line x1="7.5" y1="15" x2="16.5" y2="15" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1"/>
  </svg>
);

const EnergyMeterSvg = ({ className = "h-4.5 w-4.5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="3" width="16" height="18" rx="2" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="7" y="6" width="10" height="5" rx="0.5" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1"/>
    <line x1="8.5" y1="8.5" x2="15.5" y2="8.5" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M12 13.5L10 16.5H13L12 19.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);

const getSectionIcon = (section: string) => {
  switch (section.toLowerCase()) {
    case 'intake':
      return <IntakeWellSvg className="h-4.5 w-4.5 mr-1.5" />;
    case 'wtp':
      return <WtpSvg className="h-4.5 w-4.5 mr-1.5" />;
    case 'oht':
      return <OhtSvg className="h-4.5 w-4.5 mr-1.5" />;
    default:
      return <Database className="h-4.5 w-4.5 mr-1.5" />;
  }
};

const getSensorIcon = (tagId: string, label: string) => {
  const normalized = (label + ' ' + tagId).toLowerCase();
  if (normalized.includes('pump')) {
    return <VtPumpSvg className="h-4.5 w-4.5 text-emerald-500 dark:text-emerald-400" />;
  }
  if (normalized.includes('level') || normalized.includes(' rlt') || normalized.includes('-lt')) {
    return <LevelTransmitterSvg className="h-4.5 w-4.5 text-sky-500 dark:text-sky-400" />;
  }
  if (normalized.includes('pressure') || normalized.includes('-pt')) {
    return <PressureTransmitterSvg className="h-4.5 w-4.5 text-purple-500 dark:text-purple-400" />;
  }
  if (normalized.includes('flow') || normalized.includes('-ft') || normalized.includes('totalizer')) {
    return <FlowTransmitterSvg className="h-4.5 w-4.5 text-cyan-500 dark:text-cyan-400" />;
  }
  if (normalized.includes('ph')) {
    return <PhAnalyzerSvg className="h-4.5 w-4.5 text-teal-500 dark:text-teal-400" />;
  }
  if (normalized.includes('kw') || normalized.includes('energy') || normalized.includes('power')) {
    return <EnergyMeterSvg className="h-4.5 w-4.5 text-amber-500 dark:text-amber-400" />;
  }
  return <Gauge className="h-4.5 w-4.5 text-slate-400" />;
};


// Default page sizes based on density
const PAGE_SIZES = {
  fast: 20,
  detailed: 50,
  analytical: 100,
};

const TableRowSkeleton: React.FC = () => (
  <TableRow className="border-b border-border/30">
    <TableCell className="pl-6 py-4"><Skeleton className="h-4 w-36" /></TableCell>
    <TableCell className="py-4"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
    <TableCell className="py-4"><Skeleton className="h-4 w-28" /></TableCell>
    <TableCell className="text-right pr-6 py-4"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
    <TableCell className="pl-4 py-4"><Skeleton className="h-4 w-12" /></TableCell>
  </TableRow>
);

const HistoryPage: React.FC = () => {
  const today = new Date();
  const [globalFilters, setGlobalFilters] = useState<GlobalFilters>({
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    endDate: today,
    assets: ['all'],
    density: 'detailed',
  });
  const [logs, setLogs] = useState<HistorianLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{
    open: boolean;
    phase: 'estimating' | 'fetching' | 'building' | 'done';
    fetched: number;
    total: number;
    estSec: number;
    startedAt: number;
  }>({ open: false, phase: 'estimating', fetched: 0, total: 0, estSec: 0, startedAt: 0 });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const pageSize = PAGE_SIZES[globalFilters.density];
  const totalPages = Math.ceil(totalCount / pageSize);

  const getSectionFilters = useCallback((): ('intake' | 'oht' | 'wtp')[] => {
    if (globalFilters.assets.includes('all')) return [];
    const sections = new Set<'intake' | 'oht' | 'wtp'>();
    globalFilters.assets.forEach(a => {
      if (a === 'intake') sections.add('intake');
      else if (a === 'wtp') sections.add('wtp');
      else if (a.startsWith('oht')) sections.add('oht');
    });
    return [...sections];
  }, [globalFilters.assets]);

  // Get specific OHT tag_id prefixes for filtering (e.g., 'OHT1-', 'OHT2-')
  const getOhtTagPrefixes = useCallback((): string[] => {
    if (globalFilters.assets.includes('all')) return [];
    return globalFilters.assets
      .filter(a => a.startsWith('oht-'))
      .map(a => {
        const num = a.split('-')[1];
        return `OHT${num}-`;
      });
  }, [globalFilters.assets]);

  const fetchLogs = useCallback(async (page: number = 1) => {
    if (!globalFilters.startDate || !globalFilters.endDate) {
      toast({ title: 'Select Date Range', description: 'Please select both start and end dates.', variant: 'destructive' });
      return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    try {
      const startTime = startOfDay(globalFilters.startDate).toISOString();
      const endTime = endOfDay(globalFilters.endDate).toISOString();
      const sectionFilters = getSectionFilters();
      const ohtPrefixes = getOhtTagPrefixes();

      // Run count and data queries in parallel
      let countQuery = supabase.from('historian_logs').select('*', { count: 'exact', head: true })
        .gte('timestamp', startTime).lte('timestamp', endTime);
      if (sectionFilters.length > 0) countQuery = countQuery.in('section', sectionFilters);
      // Apply specific OHT tag filtering
      if (ohtPrefixes.length > 0 && sectionFilters.includes('oht') && !globalFilters.assets.includes('intake') && !globalFilters.assets.includes('wtp')) {
        const ohtFilter = ohtPrefixes.map(p => `tag_id.like.${p}%`).join(',');
        countQuery = countQuery.or(ohtFilter);
      }

      const offset = (page - 1) * pageSize;
      let dataQuery = supabase.from('historian_logs')
        .select(`id, tag_id, section, value, timestamp, tag_config:tag_config_id (label, unit)`)
        .gte('timestamp', startTime).lte('timestamp', endTime)
        .order('timestamp', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (sectionFilters.length > 0) dataQuery = dataQuery.in('section', sectionFilters);
      if (ohtPrefixes.length > 0 && sectionFilters.includes('oht') && !globalFilters.assets.includes('intake') && !globalFilters.assets.includes('wtp')) {
        const ohtFilter = ohtPrefixes.map(p => `tag_id.like.${p}%`).join(',');
        dataQuery = dataQuery.or(ohtFilter);
      }

      const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);

      if (countResult.error) throw countResult.error;
      if (dataResult.error) throw dataResult.error;

      setTotalCount(countResult.count || 0);
      setLogs(dataResult.data as unknown as HistorianLog[]);
      setCurrentPage(page);
      if (page === 1) toast({ title: 'Data Loaded', description: `Found ${countResult.count || 0} total records.` });
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      logError('History.fetchLogs', error);
      toast({ title: 'Error', description: 'Failed to fetch historical data.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [globalFilters.startDate, globalFilters.endDate, getSectionFilters, getOhtTagPrefixes, globalFilters.assets, toast]);

  useEffect(() => {
    if (autoRefresh && globalFilters.startDate && globalFilters.endDate && totalCount > 0) {
      autoRefreshIntervalRef.current = setInterval(() => fetchLogs(currentPage), 30000);
    }
    return () => { if (autoRefreshIntervalRef.current) clearInterval(autoRefreshIntervalRef.current); };
  }, [autoRefresh, globalFilters.startDate, globalFilters.endDate, currentPage, totalCount, fetchLogs]);

  const handlePageChange = useCallback((newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) fetchLogs(newPage);
  }, [totalPages, fetchLogs]);

  const exportToCSV = useCallback(async () => {
    if (!globalFilters.startDate || !globalFilters.endDate) return;
    setIsExporting(true);
    try {
      const startTime = startOfDay(globalFilters.startDate).toISOString();
      const endTime = endOfDay(globalFilters.endDate).toISOString();
      const sectionFilters = getSectionFilters();
      const ohtPrefixes = getOhtTagPrefixes();

      // Paginated export to handle large datasets
      const PAGE_SIZE = 1000;
      let allData: HistorianLog[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase.from('historian_logs')
          .select(`id, tag_id, section, value, timestamp, tag_config:tag_config_id (label, unit)`)
          .gte('timestamp', startTime).lte('timestamp', endTime)
          .order('timestamp', { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (sectionFilters.length > 0) query = query.in('section', sectionFilters);
        if (ohtPrefixes.length > 0 && sectionFilters.includes('oht') && !globalFilters.assets.includes('intake') && !globalFilters.assets.includes('wtp')) {
          const ohtFilter = ohtPrefixes.map(p => `tag_id.like.${p}%`).join(',');
          query = query.or(ohtFilter);
        }
        const { data, error } = await query;
        if (error) throw error;
        if (data && data.length > 0) {
          allData = [...allData, ...(data as unknown as HistorianLog[])];
          page++;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      const headers = ['Timestamp', 'Section', 'Label', 'Value', 'Unit'];
      const csvRows = [headers.join(',')];
      allData.forEach(log => {
        const isPump = log.tag_id.includes('Pump');
        csvRows.push([
          format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
          log.section.toUpperCase(),
          `"${log.tag_config?.label || 'N/A'}"`,
          isPump ? (Number(log.value) >= 1 ? 'ON' : 'OFF') : log.value.toFixed(2),
          log.tag_config?.unit || '',
        ].join(','));
      });

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.setAttribute('href', URL.createObjectURL(blob));
      link.setAttribute('download', `scada_history_${format(globalFilters.startDate!, 'yyyyMMdd')}_${format(globalFilters.endDate!, 'yyyyMMdd')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: 'Export Complete', description: `Exported ${allData.length} records.` });
    } catch (error) {
      logError('History.exportCSV', error);
      toast({ title: 'Export Failed', description: 'Failed to generate CSV.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  }, [globalFilters.startDate, globalFilters.endDate, getSectionFilters, toast]);

  const paginationInfo = useMemo(() => {
    if (totalPages <= 1) return null;
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage + 1 < maxVisible) startPage = Math.max(1, endPage - maxVisible + 1);
    const pages = [];
    for (let i = startPage; i <= endPage; i++) pages.push(i);
    return { pages, from: ((currentPage - 1) * pageSize) + 1, to: Math.min(currentPage * pageSize, totalCount) };
  }, [totalPages, currentPage, totalCount, pageSize]);

  return (
    <div className="min-h-screen flex flex-col bg-background grid-pattern relative overflow-hidden">
      {/* Floating gradient decorative orbs for premium depth */}
      <div className="floating-orb bg-primary w-[300px] h-[300px] -top-20 -left-20 opacity-[0.04] dark:opacity-[0.06]" />
      <div className="floating-orb bg-accent w-[250px] h-[250px] top-[40%] -right-10 opacity-[0.03] dark:opacity-[0.05]" />
      <div className="floating-orb bg-success w-[300px] h-[300px] -bottom-20 left-[30%] opacity-[0.03] dark:opacity-[0.05]" />

      <main className="flex-1 container mx-auto px-3 sm:px-4 py-5 sm:py-6 md:py-8 relative z-10">
        <div className="flex items-start sm:items-center gap-2.5 sm:gap-3.5 mb-5 sm:mb-6 md:mb-8 opacity-0 animate-fade-in">
          <div className="p-2.5 sm:p-3.5 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/20 border border-primary/20 shadow-md shrink-0">
            <Database className="h-5 w-5 sm:h-6 sm:w-6 text-primary animate-pulse" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight text-foreground bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-shadow-glow">Historical Telemetry</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Explore, query and export historical sensor data logs</p>
          </div>
        </div>

        <GlobalFilterBar filters={globalFilters} onFiltersChange={setGlobalFilters} onApply={() => fetchLogs(1)} />

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-5 opacity-0 animate-fade-in" style={{ animationDelay: '100ms' }}>
          <Button 
            onClick={() => fetchLogs(1)} 
            disabled={isLoading} 
            className="flex-1 sm:flex-none bg-gradient-to-r from-primary via-primary/95 to-cyan-500 hover:from-primary/95 hover:to-cyan-600 text-primary-foreground hover:shadow-lg hover:shadow-primary/20 border-0 font-semibold shadow-md transition-all active:scale-[0.98] duration-200"
          >
            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...</> : <><Database className="mr-2 h-4 w-4" />Fetch Data</>}
          </Button>
          <Button 
            onClick={exportToCSV} 
            disabled={isExporting || totalCount === 0} 
            variant="outline" 
            className="flex-1 sm:flex-none border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500 font-semibold shadow-sm transition-all active:scale-[0.98] duration-200"
          >
            {isExporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Exporting...</> : <><FileSpreadsheet className="mr-2 h-4 w-4" />Export CSV</>}
          </Button>
          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto justify-center glass border border-border/40 px-3.5 py-1.5 rounded-xl shadow-sm">
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} disabled={totalCount === 0} />
            <Label htmlFor="auto-refresh" className={cn("flex items-center gap-2 cursor-pointer text-sm font-semibold select-none", autoRefresh ? "text-primary" : "text-muted-foreground")}>
              <RefreshCw className={cn("h-4 w-4", autoRefresh && "animate-spin")} /> Auto-Refresh
            </Label>
          </div>
        </div>

        <Card className="opacity-0 animate-fade-in glass-strong border-border/40 relative overflow-hidden shadow-2xl rounded-2xl" style={{ animationDelay: '200ms' }}>
          {/* Accent top gradient line */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-accent to-success opacity-85 z-20" />
          
          <CardHeader className="border-b border-border/40 pb-3 sm:pb-4 px-3 sm:px-6 pt-4 sm:pt-6 bg-muted/20">
            <CardTitle className="text-base sm:text-lg font-bold flex flex-wrap items-center gap-x-2 gap-y-1 text-foreground">
              <Database className="h-4 w-4 sm:h-5 sm:w-5 text-primary animate-pulse shrink-0" />
              Historical Records
              {totalCount > 0 && (
                <span className="text-[10px] sm:text-xs font-semibold px-2 sm:px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 sm:ml-2">
                  {totalCount.toLocaleString()} total
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-6">
            {isLoading && logs.length === 0 ? (
              <div className="rounded-xl border border-border/40 overflow-hidden shadow-inner bg-card/30">
                <Table>
                  <TableHeader className="bg-secondary/85 backdrop-blur-md border-b border-border/60">
                    <TableRow className="border-b border-border/50">
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-4 pl-6">Timestamp</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-4">Section</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-4">Label</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-4 text-right pr-6">Value</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-4 pl-4">Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} />)}
                  </TableBody>
                </Table>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground glass rounded-xl border border-border/40 p-8 my-4">
                <div className="p-4 rounded-full bg-primary/5 w-16 h-16 flex items-center justify-center mx-auto mb-4 border border-primary/10">
                  <Database className="h-8 w-8 text-primary/60 animate-pulse" />
                </div>
                <p className="text-lg font-bold text-foreground">No records loaded</p>
                <p className="text-sm max-w-xs mx-auto text-muted-foreground mt-1">Select your desired date range and assets above, then click the "Fetch Data" button.</p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-border/40 overflow-hidden shadow-inner bg-card/30">
                  <div className="max-h-[600px] overflow-auto">
                    <Table className="min-w-[760px]">
                      <TableHeader className="sticky top-0 bg-secondary/80 backdrop-blur-md border-b border-border/50 z-10">
                        <TableRow className="hover:bg-transparent border-0">
                          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-4 pl-6 border-0">Timestamp</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-4 border-0">Section</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-4 border-0">Label</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-4 text-right pr-6 border-0">Value</TableHead>
                          <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-bold py-4 pl-4 border-0">Unit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.map((log) => {
                          const isPump = log.tag_id.includes('Pump');
                          const isWtp = log.section === 'wtp';
                          const isIntake = log.section === 'intake';
                          const isOht = log.section === 'oht';
                          
                          // Row dynamic left border and soft background gradient based on section
                          let rowBorderClass = "border-l-4 border-l-transparent";
                          let rowBgClass = "bg-card/45 hover:bg-muted/40 dark:bg-card/15 dark:hover:bg-muted/10";

                          if (isIntake) {
                            rowBorderClass = "border-l-4 border-l-blue-500/80";
                            rowBgClass = "bg-gradient-to-r from-blue-500/[0.03] via-blue-500/[0.005] to-transparent hover:from-blue-500/[0.06] hover:via-blue-500/[0.015] bg-card/10 dark:bg-card/5";
                          } else if (isWtp) {
                            rowBorderClass = "border-l-4 border-l-amber-500/80";
                            rowBgClass = "bg-gradient-to-r from-amber-500/[0.03] via-amber-500/[0.005] to-transparent hover:from-amber-500/[0.06] hover:via-amber-500/[0.015] bg-card/10 dark:bg-card/5";
                          } else if (isOht) {
                            rowBorderClass = "border-l-4 border-l-emerald-500/80";
                            rowBgClass = "bg-gradient-to-r from-emerald-500/[0.03] via-emerald-500/[0.005] to-transparent hover:from-emerald-500/[0.06] hover:via-emerald-500/[0.015] bg-card/10 dark:bg-card/5";
                          }

                          const logDate = new Date(log.timestamp);
                          const dateStr = format(logDate, 'yyyy-MM-dd');
                          const timeStr = format(logDate, 'HH:mm:ss');

                          const normalizedLabel = ((log.tag_config?.label || '') + ' ' + log.tag_id).toLowerCase();
                          
                          // Dynamic border and background casing colors based on parameter type
                          let iconBorderClass = "bg-slate-500/10 border-slate-500/20 dark:bg-slate-500/5 dark:border-slate-500/10";
                          let hoverColorClass = "group-hover:text-slate-900 dark:group-hover:text-white";

                          if (normalizedLabel.includes('pump')) {
                            iconBorderClass = "bg-emerald-500/10 border-emerald-500/20 dark:bg-emerald-950/30 dark:border-emerald-500/30 shadow-sm shadow-emerald-500/5 group-hover:shadow-emerald-500/20 group-hover:border-emerald-500/50";
                            hoverColorClass = "group-hover:text-emerald-500 dark:group-hover:text-emerald-400";
                          } else if (normalizedLabel.includes('level') || normalizedLabel.includes(' rlt') || normalizedLabel.includes('-lt')) {
                            iconBorderClass = "bg-sky-500/10 border-sky-500/20 dark:bg-sky-950/30 dark:border-sky-500/30 shadow-sm shadow-sky-500/5 group-hover:shadow-sky-500/20 group-hover:border-sky-500/50";
                            hoverColorClass = "group-hover:text-sky-500 dark:group-hover:text-sky-400";
                          } else if (normalizedLabel.includes('pressure') || normalizedLabel.includes('-pt')) {
                            iconBorderClass = "bg-purple-500/10 border-purple-500/20 dark:bg-purple-950/30 dark:border-purple-500/30 shadow-sm shadow-purple-500/5 group-hover:shadow-purple-500/20 group-hover:border-purple-500/50";
                            hoverColorClass = "group-hover:text-purple-500 dark:group-hover:text-purple-400";
                          } else if (normalizedLabel.includes('flow') || normalizedLabel.includes('-ft') || normalizedLabel.includes('totalizer')) {
                            iconBorderClass = "bg-cyan-500/10 border-cyan-500/20 dark:bg-cyan-950/30 dark:border-cyan-500/30 shadow-sm shadow-cyan-500/5 group-hover:shadow-cyan-500/20 group-hover:border-cyan-500/50";
                            hoverColorClass = "group-hover:text-cyan-500 dark:group-hover:text-cyan-400";
                          } else if (normalizedLabel.includes('ph')) {
                            iconBorderClass = "bg-teal-500/10 border-teal-500/20 dark:bg-teal-950/30 dark:border-teal-500/30 shadow-sm shadow-teal-500/5 group-hover:shadow-teal-500/20 group-hover:border-teal-500/50";
                            hoverColorClass = "group-hover:text-teal-500 dark:group-hover:text-teal-400";
                          } else if (normalizedLabel.includes('kw') || normalizedLabel.includes('energy') || normalizedLabel.includes('power')) {
                            iconBorderClass = "bg-amber-500/10 border-amber-500/20 dark:bg-amber-950/30 dark:border-amber-500/30 shadow-sm shadow-amber-500/5 group-hover:shadow-amber-500/20 group-hover:border-amber-500/50";
                            hoverColorClass = "group-hover:text-amber-500 dark:group-hover:text-amber-400";
                          }

                          return (
                            <TableRow 
                              key={log.id} 
                              className={cn(
                                "group border-b border-border/10 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md", 
                                rowBorderClass,
                                rowBgClass
                              )}
                            >
                              <TableCell className="pl-6 py-4">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                  <span className="text-muted-foreground/60 text-[11px] font-medium tracking-tight whitespace-nowrap">{dateStr}</span>
                                  <span className="text-foreground font-bold tracking-tight text-sm font-mono flex items-center gap-1.5 whitespace-nowrap">
                                    <span className={cn(
                                      "w-1.5 h-1.5 rounded-full animate-pulse shrink-0",
                                      isIntake && "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]",
                                      isWtp && "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]",
                                      isOht && "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                                    )} />
                                    {timeStr}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                {isWtp && (
                                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 backdrop-blur-sm shadow-sm uppercase tracking-wide">
                                    <WtpSvg className="h-3.5 w-3.5 mr-1.5 text-amber-500 dark:text-amber-400" />
                                    WTP
                                  </span>
                                )}
                                {isIntake && (
                                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 backdrop-blur-sm shadow-sm uppercase tracking-wide">
                                    <IntakeWellSvg className="h-3.5 w-3.5 mr-1.5 text-blue-500 dark:text-blue-400" />
                                    Intake
                                  </span>
                                )}
                                {isOht && (
                                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 backdrop-blur-sm shadow-sm uppercase tracking-wide">
                                    <OhtSvg className="h-3.5 w-3.5 mr-1.5 text-emerald-500 dark:text-emerald-400" />
                                    OHT
                                  </span>
                                )}
                                {!isWtp && !isIntake && !isOht && (
                                  <Badge variant="outline" className="text-xs uppercase tracking-wide flex items-center">
                                    {getSectionIcon(log.section)}
                                    <span className="ml-1">{log.section.toUpperCase()}</span>
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="py-4 font-semibold text-foreground/90 pl-4">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "p-2 rounded-xl border flex items-center justify-center transition-all duration-300 group-hover:scale-110",
                                    iconBorderClass
                                  )}>
                                    {getSensorIcon(log.tag_id, log.tag_config?.label || '')}
                                  </div>
                                  <span className={cn(
                                    "text-sm tracking-wide text-foreground/90 font-bold transition-colors duration-200",
                                    hoverColorClass
                                  )}>
                                    {log.tag_config?.label || log.tag_id}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right pr-6 py-4">
                                {isPump ? (
                                  Number(log.value) >= 1 ? (
                                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.25)] relative animate-pulse">
                                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                      ON
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-extrabold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shadow-inner">
                                      <span className="h-2 w-2 rounded-full bg-rose-500/50" />
                                      OFF
                                    </span>
                                  )
                                ) : (
                                  <span className={cn(
                                    "inline-flex items-center px-3 py-1 rounded-xl font-mono font-black text-sm tracking-wider shadow-sm border backdrop-blur-[2px]",
                                    normalizedLabel.includes('level') || normalizedLabel.includes(' rlt') || normalizedLabel.includes('-lt')
                                      ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20 shadow-sky-500/5"
                                      : normalizedLabel.includes('pressure') || normalizedLabel.includes('-pt')
                                      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 shadow-purple-500/5"
                                      : normalizedLabel.includes('flow') || normalizedLabel.includes('-ft') || normalizedLabel.includes('totalizer')
                                      ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20 shadow-cyan-500/5"
                                      : normalizedLabel.includes('ph')
                                      ? "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20 shadow-teal-500/5"
                                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 shadow-amber-500/5"
                                  )}>
                                    {Number(log.value).toFixed(2)}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="pl-4 py-4">
                                {log.tag_config?.unit ? (
                                  <span className="inline-flex items-center bg-secondary/50 dark:bg-secondary/20 text-muted-foreground/80 px-2 py-0.5 rounded border border-border/40 text-[10px] font-bold uppercase tracking-wider">
                                    {log.tag_config.unit}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/30">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                {paginationInfo && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-border/40">
                    <div className="text-sm text-muted-foreground font-medium">
                      Showing <span className="font-semibold text-foreground">{paginationInfo.from}</span> - <span className="font-semibold text-foreground">{paginationInfo.to}</span> of <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span> records
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg border-border/50 hover:bg-secondary transition-all"
                        onClick={() => handlePageChange(currentPage - 1)} 
                        disabled={currentPage === 1 || isLoading}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      {paginationInfo.pages.map(page => (
                        <Button 
                          key={page} 
                          variant={currentPage === page ? 'default' : 'outline'} 
                          className={cn(
                            "h-8 min-w-[32px] px-2 rounded-lg transition-all",
                            currentPage === page 
                              ? "bg-primary text-primary-foreground hover:bg-primary/95 shadow-md shadow-primary/15" 
                              : "border-border/50 hover:bg-secondary"
                          )}
                          onClick={() => handlePageChange(page)} 
                          disabled={isLoading}
                        >
                          {page}
                        </Button>
                      ))}
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg border-border/50 hover:bg-secondary transition-all"
                        onClick={() => handlePageChange(currentPage + 1)} 
                        disabled={currentPage === totalPages || isLoading}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <StatusBar />
    </div>
  );
};

export default HistoryPage;
