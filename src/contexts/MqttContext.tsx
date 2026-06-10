import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logError, logDebug, logWarn, logInfo } from '@/lib/errorLogger';
import { MQTT_TOPICS, ALL_MQTT_TOPICS, TOPIC_TO_SECTION, setTopicsFromDb } from '@/config/buaBicchiyaSensors';

export interface MqttConfig {
  id?: string;
  brokerUrl: string;
  username?: string;
  password?: string;
  clientId?: string;
  autoConnect: boolean;
  topics: Record<string, string>;
}

export interface MqttMessage {
  topic: string;
  payload: Record<string, string | number>;
  timestamp: Date;
  section: 'oht' | 'intake' | 'wtp' | 'unknown';
  subsection?: string;
  rawPayload?: string;
}

interface MqttContextType {
  config: MqttConfig;
  isConnected: boolean;
  isConnecting: boolean;
  lastMessage: MqttMessage | null;
  messageCount: number;
  messagesPerSecond: number;
  lastError: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  updateConfig: (config: Partial<MqttConfig>) => Promise<void>;
  saveConfig: () => Promise<void>;
}

const getDefaultBrokerUrl = () => {
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  return isSecure ? 'wss://broker.hivemq.com:8884/mqtt' : 'ws://broker.hivemq.com:8000/mqtt';
};

const defaultConfig: MqttConfig = {
  brokerUrl: getDefaultBrokerUrl(),
  autoConnect: true,
  topics: { ...MQTT_TOPICS },
};

const MqttContext = createContext<MqttContextType | undefined>(undefined);

export const MqttProvider: React.FC<{ children: ReactNode; onMessage?: (message: MqttMessage) => void }> = ({ children, onMessage }) => {
  const [config, setConfig] = useState<MqttConfig>(defaultConfig);
  const [isConnected, setIsConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<MqttMessage | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [messagesPerSecond, setMessagesPerSecond] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const clientRef = useRef<MqttClient | null>(null);
  const messageCountRef = useRef(0);
  const connectRef = useRef<() => Promise<void>>();

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const { data } = await supabase.from('mqtt_config').select('*').limit(1).maybeSingle();
        if (data) {
          let brokerUrl = data.broker_url;
          const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
          if (isSecure && brokerUrl.startsWith('ws://')) {
            brokerUrl = brokerUrl.replace('ws://', 'wss://');
            if (brokerUrl.includes('broker.hivemq.com:8000')) brokerUrl = brokerUrl.replace(':8000', ':8884');
          }
          setConfig({
            id: data.id,
            brokerUrl,
            username: undefined,
            password: undefined,
            clientId: data.client_id || undefined,
            autoConnect: data.auto_connect,
            topics: {
              OHT1: data.oht_topic,
              OHT2: (data as any).oht_topic_2 || '',
              OHT3: (data as any).oht_topic_3 || '',
              INTAKE: data.intake_topic,
              WTP: (data as any).wtp_topic || '',
            },
          });
          setTopicsFromDb({
            OHT1: data.oht_topic,
            OHT2: (data as any).oht_topic_2 || '',
            OHT3: (data as any).oht_topic_3 || '',
            INTAKE: data.intake_topic,
            WTP: (data as any).wtp_topic || '',
          });
          if (data.auto_connect) connectRef.current?.();
        } else {
          connectRef.current?.();
        }
      } catch (error) {
        logError('MqttContext.loadConfig', error);
        connectRef.current?.();
      }
    };
    loadConfig();
    return () => { if (clientRef.current) clientRef.current.end(true); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessagesPerSecond(messageCountRef.current);
      messageCountRef.current = 0;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const parsePayload = useCallback((payload: string): Record<string, string | number>[] => {
    const results: Record<string, string | number>[] = [];
    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        // Handle {TAG: "NAME", VALUE: x} shape (Bhua Bicchiya broker format)
        const keys = Object.keys(parsed);
        const hasTag = keys.some(k => k.toUpperCase() === 'TAG');
        const hasVal = keys.some(k => k.toUpperCase() === 'VALUE');
        if (hasTag && hasVal && keys.length <= 3) {
          const tagKey = keys.find(k => k.toUpperCase() === 'TAG')!;
          const valKey = keys.find(k => k.toUpperCase() === 'VALUE')!;
          const tagName = String(parsed[tagKey]);
          const val = parsed[valKey];
          results.push({ [tagName]: typeof val === 'object' && val !== null && 'value' in val ? (val as any).value : val });
          return results;
        }
        Object.entries(parsed).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null && 'value' in value) {
            results.push({ [key]: (value as { value: number | string }).value });
          } else {
            results.push({ [key]: value as string | number });
          }
        });
      } else if (Array.isArray(parsed)) {
        parsed.forEach(item => {
          if (item.name && item.value !== undefined) results.push({ [item.name]: item.value });
          else results.push(item);
        });
      }
    } catch {
      const jsonRegex = /\{[^}]+\}/g;
      const matches = payload.match(jsonRegex);
      if (matches) {
        matches.forEach(match => {
          try { results.push(JSON.parse(match)); } catch { }
        });
      }
    }
    return results;
  }, []);

  const determineSectionFromTopic = useCallback((topic: string): { section: 'oht' | 'intake' | 'wtp' | 'unknown'; subsection?: string } => {
    const mapping = TOPIC_TO_SECTION[topic];
    if (mapping) return { section: mapping.section, subsection: mapping.subsection };
    if (topic.includes('OHT')) {
      if (topic.includes('OHT01') || topic.includes('OHT-1') || topic.includes('OHT1')) {
        return { section: 'oht', subsection: 'OHT-1' };
      }
      if (topic.includes('OHT02') || topic.includes('OHT-2') || topic.includes('OHT2')) {
        return { section: 'oht', subsection: 'OHT-2' };
      }
      if (topic.includes('OHT03') || topic.includes('OHT-3') || topic.includes('OHT3')) {
        return { section: 'oht', subsection: 'OHT-3' };
      }
      // Fallback matching logic based on topic tail/identifier
      if (topic.endsWith('/0000000001') && !topic.includes('OHT02') && !topic.includes('OHT03')) {
        return { section: 'oht', subsection: 'OHT-1' };
      }
      if (topic.endsWith('/0000000002') || topic.includes('0000000002')) return { section: 'oht', subsection: 'OHT-2' };
      if (topic.endsWith('/0000000003') || topic.includes('0000000003')) return { section: 'oht', subsection: 'OHT-3' };
      return { section: 'oht' };
    }
    if (topic.includes('INTAKE') || topic.includes('INT')) return { section: 'intake' };
    if (topic.includes('WTP')) return { section: 'wtp' };
    return { section: 'unknown' };
  }, []);

  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return;
    setIsConnecting(true);
    setLastError(null);

    // Clean up any existing client before connecting to avoid duplicates/leaks
    if (clientRef.current) {
      try {
        clientRef.current.end(true);
      } catch (err) {
        logError('MqttContext.cleanupOldClient', err);
      }
      clientRef.current = null;
    }

    try {
      const options: IClientOptions = {
        clientId: config.clientId || `bhua_bicchiya_${Math.random().toString(16).substr(2, 8)}`,
        clean: true,
        connectTimeout: 10000,
        reconnectPeriod: 3000, // Native self-healing reconnect every 3s
        keepalive: 30, // Send ping every 30s to keep broker connection alive
      };
      if (config.username) { options.username = config.username; options.password = config.password; }

      const client = mqtt.connect(config.brokerUrl, options);
      clientRef.current = client;

      client.on('connect', () => {
        setIsConnected(true);
        setIsConnecting(false);
        toast.success('MQTT Connected');
        const topics = ALL_MQTT_TOPICS;
        client.subscribe(topics, (err) => {
          if (err) { logError('MqttContext.subscribe', err); }
          else logInfo('MQTT', `Subscribed to ${topics.length} topics`);
        });
        if (config.id) {
          supabase.from('mqtt_config').update({ is_connected: true, last_connected_at: new Date().toISOString() }).eq('id', config.id).then(() => {});
        }
      });

      client.on('message', (topic, payload) => {
        const payloadStr = payload.toString();
        const parsedData = parsePayload(payloadStr);
        const { section, subsection } = determineSectionFromTopic(topic);
        const combinedPayload: Record<string, string | number> = {};
        parsedData.forEach(data => Object.assign(combinedPayload, data));
        const message: MqttMessage = { topic, payload: combinedPayload, timestamp: new Date(), section, subsection, rawPayload: payloadStr };
        setLastMessage(message);
        setMessageCount(prev => prev + 1);
        messageCountRef.current++;
        if (onMessageRef.current) onMessageRef.current(message);
      });

      client.on('error', (err) => {
        logError('MqttContext.connection', err);
        setLastError(err.message);
        setIsConnecting(false);
      });

      client.on('close', () => {
        setIsConnected(false);
        setIsConnecting(false);
        if (config.id) {
          supabase.from('mqtt_config').update({ is_connected: false }).eq('id', config.id).then(() => {});
        }
      });

      client.on('offline', () => {
        setIsConnected(false);
        setIsConnecting(false);
      });
    } catch (error) {
      setIsConnecting(false);
      setLastError(error instanceof Error ? error.message : 'Connection failed');
    }
  }, [config, isConnecting, isConnected, parsePayload, determineSectionFromTopic]);

  useEffect(() => { connectRef.current = connect; }, [connect]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.end(true);
      clientRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    toast.info('MQTT Disconnected');
    if (config.id) supabase.from('mqtt_config').update({ is_connected: false }).eq('id', config.id).then(() => {});
  }, [config.id]);

  const updateConfig = useCallback(async (updates: Partial<MqttConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const saveConfig = useCallback(async () => {
    try {
      const dbConfig = {
        broker_url: config.brokerUrl,
        client_id: config.clientId || null,
        oht_topic: config.topics.OHT1 || MQTT_TOPICS.OHT1,
        oht_topic_2: config.topics.OHT2 || MQTT_TOPICS.OHT2,
        oht_topic_3: config.topics.OHT3 || MQTT_TOPICS.OHT3,
        intake_topic: config.topics.INTAKE || MQTT_TOPICS.INTAKE,
        wtp_topic: config.topics.WTP || MQTT_TOPICS.WTP,
        auto_connect: config.autoConnect,
      };
      if (config.id) {
        await supabase.from('mqtt_config').update(dbConfig).eq('id', config.id);
      } else {
        const { data } = await supabase.from('mqtt_config').insert(dbConfig).select('id').single();
        if (data) setConfig(prev => ({ ...prev, id: data.id }));
      }
      toast.success('Configuration saved');
    } catch (error) {
      logError('MqttContext.saveConfig', error);
      toast.error('Failed to save configuration');
    }
  }, [config]);

  return (
    <MqttContext.Provider value={{
      config, isConnected, isConnecting, lastMessage, messageCount, messagesPerSecond,
      lastError, connect, disconnect, updateConfig, saveConfig,
    }}>
      {children}
    </MqttContext.Provider>
  );
};

export const useMqtt = (): MqttContextType => {
  const context = useContext(MqttContext);
  if (!context) throw new Error('useMqtt must be used within a MqttProvider');
  return context;
};
