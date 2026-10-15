import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';

export function useRealtimeStream(enabled = true, onTickCallback = null) {
  const [simState, setSimState] = useState({ running: true, interval_ms: 3000, tick_count: 0 });
  const [connected, setConnected] = useState(false);
  const [lastTick, setLastTick] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let es;
    try {
      es = new EventSource('/api/stream', { withCredentials: true });
      es.onopen = () => setConnected(true);
      es.onerror = () => setConnected(false);
      es.addEventListener('state', (e) => {
        try { setSimState(JSON.parse(e.data)); } catch {}
      });
      es.addEventListener('tick', (e) => {
        try {
          const payload = JSON.parse(e.data);
          setLastTick(payload);
          setSimState(prev => ({ ...prev, tick_count: payload.tick, timestamp: payload.timestamp }));
          if (onTickCallback) onTickCallback(payload);
        } catch {}
      });
    } catch {
      setConnected(false);
    }
    return () => {
      if (es) es.close();
    };
  }, [enabled, onTickCallback]);

  const control = useCallback(async (action, params = {}) => {
    const res = await api.controlStream({ action, ...params });
    if (res.state) setSimState(res.state);
    if (res.tick && onTickCallback) onTickCallback(res.tick);
    return res;
  }, [onTickCallback]);

  return { simState, connected, lastTick, control };
}
