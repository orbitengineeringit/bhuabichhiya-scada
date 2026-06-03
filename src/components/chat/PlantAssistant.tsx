import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useScada } from '@/contexts/ScadaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Send, Mic, MicOff, Trash2, Calendar as CalendarIcon, Loader2, Sparkles, Bot, User,
  Droplets, Activity, AlertTriangle, Wrench, TrendingUp, Gauge, Square, X,
  Brain, Zap, Search as SearchIcon, ShieldCheck, HeartPulse, Lightbulb, Cpu,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestions?: string[];
  created_at: string;
}

interface PlantAssistantProps {
  variant?: 'full' | 'compact';
  onClose?: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

// Highlight instruments, sensor tags, numeric values + units, and key alert words
// by wrapping them in inline markdown so the assistant reply is scannable.
const INSTRUMENT_TERMS = [
  // Equipment
  'Pump', 'Pumps', 'Motor', 'Valve', 'Tank', 'OHT', 'WTP', 'Intake', 'Sump', 'Header',
  'Booster', 'Clear Water Tank', 'CWT', 'Reservoir',
  // Sensors / instruments
  'PT', 'FT', 'LT', 'pH', 'Turbidity', 'Chlorine', 'Cl2', 'Flow Meter', 'Flowmeter',
  'Pressure Transmitter', 'Level Transmitter', 'Flow Transmitter', 'Analyzer',
  'Totalizer', 'Sensor', 'Instrument',
  // Tag prefixes
  'INT-', 'OHT-', 'WTP-',
];
const ALERT_TERMS = [
  'Critical', 'Warning', 'Alarm', 'Fault', 'Failure', 'Failed', 'Offline', 'Stopped',
  'High', 'Low', 'Anomaly', 'Anomalous', 'Risk', 'Urgent', 'Healthy', 'OK', 'Online', 'Running',
];
const POSITIVE_TERMS = ['Healthy', 'OK', 'Online', 'Running', 'Normal', 'Good', 'Excellent'];

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const enhanceAssistantText = (raw: string): string => {
  if (!raw) return raw;
  // Split by code/inline-code/link-protected zones to avoid touching them
  const parts = raw.split(/(```[\s\S]*?```|`[^`]*`|\[[^\]]+\]\([^)]+\))/g);
  return parts
    .map((part, i) => {
      // Odd-index segments are protected (code/links) — leave as is
      if (i % 2 === 1) return part;
      let text = part;

      // 1) Numeric values with units → bold + colored via custom <mark>-style HTML
      //    Matches: 12.3 Bar, 1500 LPH, 75%, 8.2 pH, 4.5 NTU, 0.5 mg/L, 230V, 25 °C
      text = text.replace(
        /(\d+(?:\.\d+)?)(\s?)(%|°C|°F|Bar|bar|kPa|MPa|psi|LPH|LPM|MLD|KL|m3\/h|m³\/h|L\/s|m|cm|mm|kW|kWh|kVA|V|A|Hz|Hrs?|hrs?|sec|min|NTU|FNU|pH|mg\/L|ppm|ppb|μS\/cm|uS\/cm)\b/g,
        (_m, num, sp, unit) => `\u200B__VAL__${num}${sp}${unit}__ENDVAL__\u200B`
      );

      // 2) Instruments / equipment → bold
      INSTRUMENT_TERMS.forEach((term) => {
        const re = new RegExp(`\\b(${escapeRegex(term)})\\b`, 'g');
        text = text.replace(re, '\u200B__INS__$1__ENDINS__\u200B');
      });

      // 3) Tag IDs like FT-101, PT-202, LT-301, INT-FT-01
      text = text.replace(
        /\b((?:INT|OHT|WTP)-)?([A-Z]{2,4}-\d{1,4}[A-Z]?)\b/g,
        '\u200B__TAG__$1$2__ENDTAG__\u200B'
      );

      // 4) Alert words → colored
      ALERT_TERMS.forEach((term) => {
        const isPositive = POSITIVE_TERMS.includes(term);
        const marker = isPositive ? 'POS' : 'ALR';
        const re = new RegExp(`\\b(${escapeRegex(term)})\\b`, 'gi');
        text = text.replace(re, `\u200B__${marker}__$1__END${marker}__\u200B`);
      });

      // Convert markers → HTML spans (ReactMarkdown allows raw HTML when configured,
      // but we render via custom components; instead use **bold** + emoji/symbol cues).
      text = text
        .replace(/__VAL__([\s\S]*?)__ENDVAL__/g, '`$1`')
        .replace(/__INS__([\s\S]*?)__ENDINS__/g, '**$1**')
        .replace(/__TAG__([\s\S]*?)__ENDTAG__/g, '`$1`')
        .replace(/__ALR__([\s\S]*?)__ENDALR__/g, '**$1**')
        .replace(/__POS__([\s\S]*?)__ENDPOS__/g, '**$1**');

      return text;
    })
    .join('');
};

const parseSuggestions = (content: string): { text: string; suggestions: string[] } => {
  const m = content.match(/<<SUGGESTIONS>>([\s\S]*?)<<END>>/);
  if (!m) return { text: content.trim(), suggestions: [] };
  let suggestions: string[] = [];
  try {
    const parsed = JSON.parse(m[1].trim());
    if (Array.isArray(parsed)) suggestions = parsed.filter((s) => typeof s === 'string').slice(0, 4);
  } catch { /* ignore */ }
  return { text: content.replace(m[0], '').trim(), suggestions };
};

// Detect Hindi/Devanagari OR common Hinglish words to bias mic language
const looksHindi = (s: string) => {
  if (/[\u0900-\u097F]/.test(s)) return true;
  return /\b(kitna|paani|chala|kyu|kyun|kaisa|hai|nahi|nhi|kal|aaj|ghanta|ghante|abhi|kab|kahan)\b/i.test(s);
};

const PRESET_CATEGORIES = [
  {
    icon: Droplets,
    label: 'Consumption',
    color: 'from-sky-500/20 to-blue-500/20 text-sky-600 dark:text-sky-400 border-sky-500/30',
    questions: ['How much water flowed today?', 'Last 7 days consumption summary'],
  },
  {
    icon: Activity,
    label: 'Pump Runtime',
    color: 'from-emerald-500/20 to-green-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    questions: ['Pump runtime last week', 'How many pump starts today?'],
  },
  {
    icon: Gauge,
    label: 'Live Status',
    color: 'from-violet-500/20 to-purple-500/20 text-violet-600 dark:text-violet-400 border-violet-500/30',
    questions: ['Current OHT levels', 'Live pressure & flow'],
  },
  {
    icon: AlertTriangle,
    label: 'Alarms',
    color: 'from-amber-500/20 to-orange-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
    questions: ['Active alarms summary', 'Top alarms last 30 days'],
  },
  {
    icon: Wrench,
    label: 'Maintenance',
    color: 'from-rose-500/20 to-red-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30',
    questions: ['Which pump needs servicing?', 'Recommend maintenance schedule'],
  },
  {
    icon: TrendingUp,
    label: 'Predictions',
    color: 'from-indigo-500/20 to-blue-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
    questions: ['Predict tomorrow consumption', 'Any anomalies in sensor trends?'],
  },
];

// Advanced AI analysis modes — each one prefixes the user query with a directive
// so the AI returns a structured analytical answer (Observation → Cause → Action).
interface AIMode {
  id: string;
  label: string;
  short: string;
  icon: typeof Brain;
  color: string;
  prefix: string;
  sample: string;
}

const AI_MODES: AIMode[] = [
  {
    id: 'predictive',
    label: 'Predictive Maintenance',
    short: 'Predict',
    icon: Brain,
    color: 'from-violet-500 to-fuchsia-500',
    prefix: '[MODE: PREDICTIVE MAINTENANCE] Analyze pump runtime, start counts, alarm patterns and sensor drift across the available historical window. Forecast which equipment is likely to fail or need service in the next 24h–7d, with confidence levels. Question: ',
    sample: 'Which pump will need service next?',
  },
  {
    id: 'anomaly',
    label: 'Anomaly Detection',
    short: 'Anomaly',
    icon: SearchIcon,
    color: 'from-amber-500 to-orange-500',
    prefix: '[MODE: ANOMALY DETECTION] Scan recent live + historian data for outliers (>2σ), unusual cycling, sudden state changes, missing data, correlated alarm bursts. Quantify deviations. Question: ',
    sample: 'Detect anomalies across all sections',
  },
  {
    id: 'efficiency',
    label: 'Efficiency Audit',
    short: 'Efficiency',
    icon: Zap,
    color: 'from-emerald-500 to-teal-500',
    prefix: '[MODE: EFFICIENCY AUDIT] Compute KL per pump-hour, starts/hour ratio, idle vs run, and identify wasted energy or short-cycling. Suggest setpoint or scheduling tuning. Question: ',
    sample: 'How efficient is the plant today?',
  },
  {
    id: 'rca',
    label: 'Root Cause Analysis',
    short: 'RCA',
    icon: Lightbulb,
    color: 'from-rose-500 to-pink-500',
    prefix: '[MODE: ROOT CAUSE ANALYSIS] Walk through the most recent alarms and abnormal sensor trends. Build a likely causal chain and recommend corrective + preventive actions. Question: ',
    sample: 'Why did the alarms trigger today?',
  },
  {
    id: 'health',
    label: 'Plant Health Report',
    short: 'Health',
    icon: HeartPulse,
    color: 'from-sky-500 to-blue-500',
    prefix: '[MODE: PLANT HEALTH REPORT] Provide a complete health assessment: section-wise score (0–100), top 3 risks, top 3 wins, and a 7-day outlook. Question: ',
    sample: 'Generate a full plant health report',
  },
  {
    id: 'optimize',
    label: 'Optimization',
    short: 'Optimize',
    icon: Cpu,
    color: 'from-indigo-500 to-purple-500',
    prefix: '[MODE: OPTIMIZATION] Recommend operational changes (pump scheduling, OHT setpoints, dosing rates) that would reduce energy or improve water quality, with expected impact. Question: ',
    sample: 'How can I reduce pump energy use?',
  },
];

// Compute a live composite plant health score from currently active tags + alarm state
const computePlantHealth = (
  intakeTags: any[], ohtTags: any[], wtpTags: any[]
): { score: number; status: string; color: string; details: { label: string; ok: boolean }[] } => {
  const all = [...intakeTags, ...ohtTags, ...wtpTags].filter((t: any) => t.isActive);
  if (all.length === 0) {
    return { score: 0, status: 'No Data', color: 'text-muted-foreground', details: [] };
  }
  let healthy = 0;
  let warning = 0;
  let critical = 0;
  const details: { label: string; ok: boolean }[] = [];
  all.forEach((t: any) => {
    const status = (t.status ?? '').toLowerCase();
    if (status === 'critical' || status === 'alarm' || status === 'error') {
      critical++;
      details.push({ label: t.label, ok: false });
    } else if (status === 'warning' || status === 'warn') {
      warning++;
    } else {
      healthy++;
    }
  });
  const total = all.length;
  const score = Math.round(((healthy + warning * 0.6) / total) * 100);
  let status = 'Excellent';
  let color = 'text-emerald-500';
  if (score < 50) { status = 'Critical'; color = 'text-destructive'; }
  else if (score < 75) { status = 'Degraded'; color = 'text-amber-500'; }
  else if (score < 90) { status = 'Good'; color = 'text-sky-500'; }
  return { score, status, color, details: details.slice(0, 3) };
};

const PlantAssistant: React.FC<PlantAssistantProps> = ({ variant = 'compact', onClose }) => {
  const { intakeTags, ohtTags, wtpTags } = useScada();
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [isListening, setIsListening] = useState(false);
  const [quota, setQuota] = useState<{ used: number; remaining: number; limit: number } | null>(null);
  const [activeMode, setActiveMode] = useState<AIMode | null>(null);
  const recognitionRef = useRef<any>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const health = computePlantHealth(intakeTags, ohtTags, wtpTags);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ id: data.user.id });
    });
  }, []);

  // Load today's quota usage on mount (count includes deleted to match server)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const DAILY_LIMIT = 4;
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      // Check admin first
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      const isAdmin = (roles ?? []).some((r: any) => r.role === 'admin');
      if (isAdmin) {
        setQuota({ used: 0, remaining: -1, limit: DAILY_LIMIT });
        return;
      }
      const { count } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('role', 'user')
        .gte('created_at', startOfDay.toISOString());
      const used = count ?? 0;
      setQuota({ used, remaining: Math.max(0, DAILY_LIMIT - used), limit: DAILY_LIMIT });
    })();
  }, [user]);

  useEffect(() => {
    if (!user) { setHistoryLoading(false); return; }
    (async () => {
      try {
        const { data: convs } = await supabase
          .from('chat_conversations')
          .select('id')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (convs && convs[0]) {
          setConversationId(convs[0].id);
          const { data: msgs } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('conversation_id', convs[0].id)
            .eq('deleted', false)
            .order('created_at');
          if (msgs) {
            setMessages(
              msgs.map((m: any) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                suggestions: Array.isArray(m.suggestions) ? m.suggestions : [],
                created_at: m.created_at,
              }))
            );
          }
        }
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, [user]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const ensureConversation = useCallback(async (firstMessage: string): Promise<string | null> => {
    if (conversationId) return conversationId;
    if (!user) return null;
    const title = firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '...' : '');
    const { data, error } = await supabase
      .from('chat_conversations')
      .insert({ user_id: user.id, title })
      .select('id')
      .single();
    if (error) {
      toast.error('Could not start conversation');
      return null;
    }
    setConversationId(data.id);
    return data.id;
  }, [conversationId, user]);

  const buildLiveSnapshot = useCallback(() => {
    const tagToSnap = (t: any) => ({
      id: t.id, label: t.label, value: Number((t.value ?? 0).toFixed(2)),
      unit: t.unit, section: t.section, status: t.status,
    });
    return {
      intake: intakeTags.filter((t: any) => t.isActive).map(tagToSnap),
      oht: ohtTags.filter((t: any) => t.isActive).map(tagToSnap),
      wtp: wtpTags.filter((t: any) => t.isActive).map(tagToSnap),
      timestamp: new Date().toISOString(),
    };
  }, [intakeTags, ohtTags, wtpTags]);

  const sendMessage = useCallback(async (textOverride?: string, modeOverride?: AIMode | null) => {
    const text = (textOverride ?? input).trim();
    if (!text || isStreaming || !user) return;

    const convId = await ensureConversation(text);
    if (!convId) return;

    // Apply current AI mode (if any) to the actual prompt sent to the AI,
    // but keep the displayed message as the user typed it.
    const mode = modeOverride !== undefined ? modeOverride : activeMode;
    const displayText = mode ? `**[${mode.short}]** ${text}` : text;
    const aiPrompt = mode ? `${mode.prefix}${text}` : text;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: displayText,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);
    // Auto-clear mode after sending so it acts as a one-shot directive
    if (mode) setActiveMode(null);

    await supabase.from('chat_messages').insert({
      id: userMsg.id, conversation_id: convId, user_id: user.id,
      role: 'user', content: displayText,
    });

    const historyForAI = [...messages, { ...userMsg, content: aiPrompt }]
      .filter((m) => m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }));

    const payload = {
      messages: historyForAI,
      liveSnapshot: buildLiveSnapshot(),
      dateRange: dateRange?.from
        ? {
            from: dateRange.from.toISOString(),
            to: (dateRange.to ?? dateRange.from).toISOString(),
          }
        : undefined,
    };

    const assistantId = crypto.randomUUID();
    let assistantText = '';
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', created_at: new Date().toISOString() },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plant-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        if (resp.status === 429) {
          if (errBody?.quota) {
            setQuota({
              used: errBody.quota.used ?? 0,
              remaining: 0,
              limit: errBody.quota.limit ?? 4,
            });
            toast.error(errBody.error || `Daily limit reached. Try again tomorrow.`);
          } else {
            toast.error('Too many requests. Try again in a moment.');
          }
        } else if (resp.status === 401) {
          toast.error('Please sign in to use the assistant.');
        } else if (resp.status === 402) {
          toast.error('AI credits exhausted. Add credits to continue.');
        } else {
          toast.error(errBody.error || 'Assistant error');
        }
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        setIsStreaming(false);
        return;
      }

      // Read quota headers
      const qLimit = Number(resp.headers.get('x-quota-limit') ?? '0');
      const qRemaining = Number(resp.headers.get('x-quota-remaining') ?? '-1');
      const qUsed = Number(resp.headers.get('x-quota-used') ?? '0');
      if (qLimit > 0) {
        setQuota({ used: qUsed, remaining: qRemaining, limit: qLimit });
        if (qRemaining === 1) toast.warning('1 message left today!');
        else if (qRemaining === 0) toast.warning('That was your last message for today.');
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIdx);
          textBuffer = textBuffer.slice(newlineIdx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantText += delta;
              const { text: cleanText, suggestions } = parseSuggestions(assistantText);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: cleanText, suggestions } : m
                )
              );
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      const { suggestions: finalSugg } = parseSuggestions(assistantText);
      if (assistantText.trim()) {
        await supabase.from('chat_messages').insert({
          id: assistantId, conversation_id: convId, user_id: user.id,
          role: 'assistant', content: assistantText,
          suggestions: finalSugg,
        });
        await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
      } else {
        // aborted before any content — drop the empty placeholder
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // User stopped — keep partial text if any, otherwise drop placeholder
        const partial = assistantText.trim();
        if (partial) {
          const { text: cleanText, suggestions } = parseSuggestions(assistantText);
          const stoppedText = cleanText + '\n\n_⏹ Stopped_';
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: stoppedText, suggestions } : m))
          );
          await supabase.from('chat_messages').insert({
            id: assistantId, conversation_id: convId, user_id: user.id,
            role: 'assistant', content: stoppedText, suggestions,
          });
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        }
        toast.info('Stopped');
      } else {
        console.error(e);
        toast.error('Connection error');
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, [input, isStreaming, user, messages, ensureConversation, buildLiveSnapshot, dateRange, activeMode]);

  // Voice — auto picks lang based on current input text (so Hinglish typers can dictate Hindi too)
  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast.error('Voice input not supported in this browser');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = looksHindi(input) ? 'hi-IN' : 'en-IN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (ev: any) => {
      let transcript = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        transcript += ev.results[i][0].transcript;
      }
      setInput(transcript);
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = (e: any) => {
      console.error('voice err', e);
      setIsListening(false);
      if (e.error === 'not-allowed') toast.error('Microphone permission denied');
    };
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  };

  const deleteMessage = async (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    await supabase.from('chat_messages').update({ deleted: true }).eq('id', id);
  };

  const clearConversation = async () => {
    if (conversationId) {
      await supabase.from('chat_conversations').delete().eq('id', conversationId);
    }
    setMessages([]);
    setConversationId(null);
    toast.success('Chat cleared');
  };

  const containerHeight = variant === 'full' ? 'h-full min-h-0 flex-1' : 'h-full sm:h-[600px] sm:max-h-[80vh] flex-shrink-0';

  return (
    <div className={cn(
      'flex flex-col bg-card border border-border rounded-2xl overflow-hidden shadow-2xl relative',
      'ring-1 ring-violet-500/10',
      containerHeight
    )}>
      {/* Decorative aurora — cyan / violet / pink */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-cyan-500/25 blur-3xl opacity-70 animate-pulse" />
      <div className="pointer-events-none absolute top-1/3 -left-20 h-56 w-56 rounded-full bg-violet-500/25 blur-3xl opacity-60" />
      <div className="pointer-events-none absolute -bottom-24 right-1/4 h-56 w-56 rounded-full bg-pink-500/20 blur-3xl opacity-50" />
      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035] dark:opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />

      {/* Header */}
      <div className="relative flex items-center justify-between px-4 py-3 border-b border-violet-500/20 bg-gradient-to-r from-cyan-500/10 via-violet-500/10 to-pink-500/10 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500 via-violet-500 to-pink-500 shadow-lg shadow-violet-500/40">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-1.5">
              <span className="bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">Plant Assistant</span>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-violet-600 dark:text-violet-300 border border-violet-500/30 uppercase tracking-wider">AI</span>
            </h3>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <span>Live + 30-day insights</span>
              {quota && quota.remaining >= 0 && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded-full text-[9px] font-semibold border',
                    quota.remaining === 0
                      ? 'bg-destructive/10 border-destructive/30 text-destructive'
                      : quota.remaining <= 1
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  )}
                  title={`${quota.remaining} of ${quota.limit} messages left today`}
                >
                  {quota.remaining}/{quota.limit} left today
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1 hover:bg-primary/10">
                <CalendarIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {dateRange?.from
                    ? dateRange.to
                      ? `${format(dateRange.from, 'dd MMM')} - ${format(dateRange.to, 'dd MMM')}`
                      : format(dateRange.from, 'dd MMM')
                    : 'Last 30d'}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[100]" align="end">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={1}
                disabled={(d) => d > new Date()}
                className={cn('p-3 pointer-events-auto')}
              />
              <div className="p-2 border-t border-border flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setDateRange(undefined)}>Reset</Button>
              </div>
            </PopoverContent>
          </Popover>
          {messages.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all chat?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this conversation and all its messages.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={clearConversation}>Clear</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-full hover:bg-destructive/15 hover:text-destructive border border-transparent hover:border-destructive/30 transition"
              onClick={onClose}
              aria-label="Close assistant"
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 relative h-full min-h-0">
        <div className="space-y-4 px-2 sm:px-3 pt-10 pb-6 sm:pb-8">
          {historyLoading && messages.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
          )}
          {!historyLoading && messages.length === 0 && !isStreaming && (
            <div className="py-2 space-y-4 animate-in fade-in duration-500">
              {/* Hero */}
              <div className="text-center space-y-3">
                <div className="relative inline-flex">
                  <div className="absolute inset-0 rounded-full bg-primary/30 blur-xl animate-pulse" />
                  <div className="relative p-4 rounded-full bg-gradient-to-br from-primary to-primary/50 shadow-2xl shadow-primary/30">
                    <Bot className="h-8 w-8 text-primary-foreground" />
                  </div>
                </div>
                <div className="space-y-1 px-2">
                  <h4 className="text-base font-bold text-foreground">AI-SCADA Copilot</h4>
                  <p className="text-[11px] text-muted-foreground max-w-sm mx-auto leading-relaxed">
                    Predictive maintenance, anomaly detection, efficiency audits — powered by your live + 30-day plant data.
                  </p>
                </div>
              </div>

              {/* Live Plant Health Score */}
              <div className="mx-2 rounded-2xl border border-border/60 bg-gradient-to-br from-card to-muted/30 p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className={cn('p-2 rounded-xl bg-gradient-to-br shadow-md',
                      health.score >= 90 ? 'from-emerald-500/20 to-teal-500/20' :
                      health.score >= 75 ? 'from-sky-500/20 to-blue-500/20' :
                      health.score >= 50 ? 'from-amber-500/20 to-orange-500/20' :
                      'from-rose-500/20 to-red-500/20'
                    )}>
                      <HeartPulse className={cn('h-4 w-4', health.color)} />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Plant Health</div>
                      <div className="flex items-baseline gap-1.5">
                        <span className={cn('text-2xl font-bold tabular-nums leading-none', health.color)}>{health.score}</span>
                        <span className="text-[10px] text-muted-foreground">/100</span>
                        <span className={cn('text-[10px] font-semibold ml-1', health.color)}>{health.status}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => sendMessage('Generate a full plant health report', AI_MODES.find(m => m.id === 'health'))}
                    className="text-[10px] font-semibold px-2.5 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition shrink-0"
                  >
                    Full Report →
                  </button>
                </div>
                {health.details.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/40 flex flex-wrap gap-1">
                    {health.details.map((d, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive border border-destructive/20">
                        ⚠ {d.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Modes */}
              <div className="px-2 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Brain className="h-3 w-3 text-primary" />
                  <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">AI Analysis Modes</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {AI_MODES.map((mode) => {
                    const Icon = mode.icon;
                    const isActive = activeMode?.id === mode.id;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => {
                          setActiveMode(isActive ? null : mode);
                          if (!isActive) toast.success(`${mode.label} mode armed — type your question`);
                        }}
                        className={cn(
                          'group relative overflow-hidden rounded-lg border p-2 text-left transition-all hover:scale-[1.03] hover:shadow-md',
                          isActive
                            ? 'border-primary bg-primary/15 ring-2 ring-primary/40 shadow-lg'
                            : 'border-border/60 bg-card/50 hover:border-primary/40'
                        )}
                      >
                        <div className={cn('inline-flex p-1 rounded-md bg-gradient-to-br mb-1', mode.color)}>
                          <Icon className="h-3 w-3 text-white" />
                        </div>
                        <div className="text-[10px] font-bold leading-tight text-foreground">{mode.label}</div>
                        <div className="text-[9px] opacity-70 mt-0.5 leading-snug line-clamp-1 text-muted-foreground">{mode.sample}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick presets */}
              <div className="px-2 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-primary" />
                  <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Quick Questions</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {PRESET_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.label}
                        onClick={() => sendMessage(cat.questions[0])}
                        className={cn(
                          'group relative overflow-hidden rounded-lg border bg-gradient-to-br p-2 text-left transition-all hover:scale-[1.03] hover:shadow-md',
                          cat.color
                        )}
                      >
                        <Icon className="h-3 w-3 mb-1" />
                        <div className="text-[10px] font-semibold leading-tight">{cat.label}</div>
                        <div className="text-[9px] opacity-75 mt-0.5 leading-snug line-clamp-1">{cat.questions[0]}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex gap-2 group animate-in fade-in slide-in-from-bottom-2 duration-300',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mt-1 shadow-md shadow-primary/20">
                  <Bot className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
              <div className={cn('max-w-[85%] sm:max-w-[82%] flex flex-col gap-1.5 min-w-0', msg.role === 'user' && 'items-end')}>
                <div
                  className={cn(
                    'px-3.5 py-2.5 rounded-2xl text-sm relative shadow-sm',
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-primary to-primary/85 text-primary-foreground rounded-br-md'
                      : 'bg-muted/70 backdrop-blur text-foreground rounded-bl-md border border-border/50'
                  )}
                >
                  {msg.role === 'assistant' && !msg.content && isStreaming ? (
                    <button
                      onClick={stopStreaming}
                      className="flex items-center gap-2 py-0.5 group/stop"
                      aria-label="Stop generating"
                      title="Stop generating"
                    >
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                      </span>
                      <span className="text-[10px] text-muted-foreground group-hover/stop:text-destructive transition-colors flex items-center gap-0.5">
                        <Square className="h-2.5 w-2.5 fill-current" /> Stop
                      </span>
                    </button>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-headings:my-2 prose-table:my-2 [&>*]:text-current break-words">
                      <ReactMarkdown
                        components={{
                          code: ({ inline, className, children, ...props }: any) => {
                            const text = String(children ?? '');
                            if (inline) {
                              // Highlight numeric values & tag IDs distinctly
                              const isTagId = /^(?:INT|OHT|WTP)?-?[A-Z]{2,4}-\d/.test(text);
                              return (
                                <code
                                  className={cn(
                                    'px-1.5 py-0.5 rounded-md font-mono text-[0.85em] font-semibold border',
                                    isTagId
                                      ? 'bg-accent/15 text-accent border-accent/30'
                                      : 'bg-primary/12 text-primary border-primary/25'
                                  )}
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            }
                            return (
                              <code className="block p-2 rounded-md bg-muted/60 border border-border/50 font-mono text-xs overflow-x-auto" {...props}>
                                {children}
                              </code>
                            );
                          },
                          strong: ({ children }) => {
                            const text = String(children ?? '');
                            const isCritical = /^(critical|alarm|fault|failure|failed|offline|stopped|high|low|anomaly|anomalous|risk|urgent)$/i.test(text);
                            const isPositive = /^(healthy|ok|online|running|normal|good|excellent)$/i.test(text);
                            return (
                              <strong
                                className={cn(
                                  'font-bold',
                                  isCritical && 'text-destructive bg-destructive/10 px-1 rounded',
                                  isPositive && 'text-success bg-success/10 px-1 rounded',
                                  !isCritical && !isPositive && 'text-foreground'
                                )}
                              >
                                {children}
                              </strong>
                            );
                          },
                          ul: ({ children }) => <ul className="list-disc pl-4 space-y-0.5 marker:text-primary/60">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 space-y-0.5 marker:text-primary/60 marker:font-semibold">{children}</ol>,
                          h1: ({ children }) => <h1 className="text-base font-bold text-primary border-b border-primary/20 pb-1 mt-2">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-sm font-bold text-primary mt-2">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-[13px] font-bold text-foreground/90 mt-1.5">{children}</h3>,
                          blockquote: ({ children }) => (
                            <blockquote className="border-l-2 border-primary/40 pl-2 italic text-foreground/80 bg-primary/5 py-0.5 rounded-r">
                              {children}
                            </blockquote>
                          ),
                          table: ({ children }) => (
                            <div className="overflow-x-auto my-2">
                              <table className="text-xs border-collapse w-full">{children}</table>
                            </div>
                          ),
                          th: ({ children }) => <th className="border border-border/60 bg-muted/60 px-2 py-1 text-left font-semibold">{children}</th>,
                          td: ({ children }) => <td className="border border-border/60 px-2 py-1">{children}</td>,
                        }}
                      >
                        {msg.role === 'assistant' ? enhanceAssistantText(msg.content || ' ') : (msg.content || ' ')}
                      </ReactMarkdown>
                    </div>

                  )}
                  <button
                    onClick={() => deleteMessage(msg.id)}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-1 shadow-md hover:scale-110 z-10"
                    aria-label="Delete message"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
                <div className={cn('text-[9px] text-muted-foreground/70 px-1', msg.role === 'user' ? 'text-right' : 'text-left')}>
                  {format(new Date(msg.created_at), 'h:mm a')}
                </div>
                {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {msg.suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(s)}
                        disabled={isStreaming}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 text-primary font-medium transition-all hover:shadow-sm hover:scale-[1.03] disabled:opacity-50"
                      >
                        ✨ {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-secondary to-muted flex items-center justify-center mt-1 shadow-sm border border-border">
                  <User className="h-4 w-4 text-foreground" />
                </div>
              )}
            </div>
          ))}
          <div ref={scrollEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="relative border-t border-border p-2.5 bg-gradient-to-b from-muted/20 to-muted/40 backdrop-blur">
        {activeMode && (
          <div className="mb-2 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-primary/30 bg-primary/10 animate-in slide-in-from-bottom-1 duration-200">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className={cn('p-1 rounded-md bg-gradient-to-br shrink-0', activeMode.color)}>
                <activeMode.icon className="h-3 w-3 text-white" />
              </div>
              <span className="text-[10px] font-bold text-primary truncate">{activeMode.label} mode</span>
              <span className="text-[9px] text-muted-foreground hidden sm:inline truncate">— next message will be analyzed</span>
            </div>
            <button
              onClick={() => setActiveMode(null)}
              className="shrink-0 h-5 w-5 rounded-full hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition"
              aria-label="Clear mode"
              title="Clear mode"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 bg-background rounded-full border border-border shadow-sm focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/50 transition-all pl-1 pr-1 py-1">
          <Button
            variant={isListening ? 'destructive' : 'ghost'}
            size="sm"
            className={cn(
              'h-9 w-9 p-0 flex-shrink-0 rounded-full transition-all',
              isListening && 'animate-pulse shadow-lg shadow-destructive/40'
            )}
            onClick={toggleVoice}
            disabled={isStreaming}
            aria-label="Voice input"
            title={isListening ? 'Stop listening' : 'Speak (Hindi/English auto)'}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
            placeholder={
              quota?.remaining === 0
                ? 'Daily limit reached — try again tomorrow'
                : isListening
                ? 'Listening...'
                : activeMode
                ? `Ask in ${activeMode.label} mode...`
                : 'Ask anything about your plant...'
            }
            disabled={isStreaming || quota?.remaining === 0}
            className="flex-1 h-9 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
          />
          {isStreaming ? (
            <Button
              size="sm"
              variant="destructive"
              className="h-9 w-9 p-0 flex-shrink-0 rounded-full shadow-lg shadow-destructive/40 animate-in zoom-in duration-200"
              onClick={stopStreaming}
              aria-label="Stop generating"
              title="Stop"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-9 w-9 p-0 flex-shrink-0 rounded-full bg-gradient-to-br from-primary to-primary/80 hover:shadow-lg hover:shadow-primary/40 transition-all disabled:opacity-40 disabled:shadow-none"
              onClick={() => sendMessage()}
              disabled={!input.trim() || quota?.remaining === 0}
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="hidden sm:block text-[9px] text-muted-foreground/70 text-center mt-1.5">
          Replies match your language • Plant queries only
        </p>
      </div>
    </div>
  );
};

export default PlantAssistant;
