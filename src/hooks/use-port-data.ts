'use client';
import { useState, useEffect } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { database } from '@/lib/firebase';
import type { Port, Session } from '@/types';

const STALE_SESSION_TIMEOUT = 15 * 60 * 1000; // 30 minutes - increased for longer charging sessions

export function usePortData(portId: string) {
  const [portData, setPortData] = useState<Port | null>(null);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [historicalSessions, setHistoricalSessions] = useState<Record<string, Session>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const portRef = ref(database, `ports/${portId}`);
    
    const unsubscribe = onValue(portRef, (snapshot) => {
      setLoading(true);
      if (snapshot.exists()) {
        const data = snapshot.val() as Port;
        setPortData(data);
        
        if (data.currentSessionId && data.sessions && data.sessions[data.currentSessionId]) {
          const session = data.sessions[data.currentSessionId];
          setCurrentSession(session);

          // Check for stale session - only if no recent activity
          if (session.status === 'charging' || session.status === 'discharging') {
            const logTimestamps = session.logs ? Object.keys(session.logs).map(Number) : [];
            const lastLogTime = logTimestamps.length > 0 ? Math.max(...logTimestamps) : session.startTime;
            
            // Only close if we haven't received any logs in the timeout period
            // AND the session has been running for at least 10 minutes (to avoid false positives)
            const sessionDuration = Date.now() - session.startTime;
            const timeSinceLastLog = Date.now() - lastLogTime;
            
            if (sessionDuration > 10 * 60 * 1000 && timeSinceLastLog > STALE_SESSION_TIMEOUT) {
              console.warn(`Port ${portId} session ${data.currentSessionId} is stale. Closing it.`);
              const updates: Record<string, unknown> = {};
              const sessionPath = `ports/${portId}/sessions/${data.currentSessionId}`;
              updates[`${sessionPath}/status`] = 'completed';
              updates[`${sessionPath}/endTime`] = Date.now();
              updates[`${sessionPath}/notes`] = 'Session closed due to inactivity.';
              updates[`ports/${portId}/currentSessionId`] = null;

              update(ref(database), updates);
            }
          }

        } else {
          setCurrentSession(null);
        }
        
        setHistoricalSessions(data.sessions || {});

      } else {
        setPortData(null);
        setCurrentSession(null);
        setHistoricalSessions({});
      }
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('Failed to fetch port data. Ensure Firebase config is correct and you have permission.');
      setLoading(false);
    });

    return () => {
        unsubscribe();
    }
  }, [portId]);

  return { portData, currentSession, historicalSessions, loading, error };
}
