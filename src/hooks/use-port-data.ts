'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { database } from '@/lib/firebase';
import { calculateBatteryMetrics, updateRealTimeBatteryMetrics, updateBackupBatteryCapacity, saveFinalBatteryMetrics, clearUpdateThrottle } from '@/lib/utils';
import type { Port, Session, LogEntry } from '@/types';

const STALE_SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const REAL_TIME_UPDATE_INTERVAL = 5000; // 5 seconds between real-time updates

// Helper function to check if session has sufficient data for final metrics calculation
const canCalculateFinalMetrics = (session: Session): boolean => {
  return !!(
    session.type === 'discharging' &&
    session.batteryType &&
    session.ratedCapacity &&
    session.ratedCapacity > 0 &&
    session.logs &&
    Object.keys(session.logs).length >= 2
  );
};

export function usePortData(portId: string) {
  const [portData, setPortData] = useState<Port | null>(null);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [historicalSessions, setHistoricalSessions] = useState<Record<string, Session>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Use refs to prevent infinite loops and excessive updates
  const lastLogCountRef = useRef(0);
  const lastUpdateTimeRef = useRef(0);
  const isUpdatingRef = useRef(false);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isClosingSessionRef = useRef(false);
  const lastFirebaseUpdateRef = useRef(0);
  const sessionDataRef = useRef<Session | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  // Memoized real-time metrics calculation to prevent unnecessary recalculations
  const realTimeMetrics = useMemo(() => {
    if (!currentSession || currentSession.type !== 'discharging' || !currentSession.batteryType || !currentSession.logs) {
      return null;
    }
    
    const ratedCapacity = currentSession.ratedCapacity || portData?.ratedCapacity || 0;
    if (ratedCapacity <= 0) return null;
    
    return calculateBatteryMetrics(currentSession.logs, currentSession.batteryType, ratedCapacity);
  }, [currentSession?.logs, currentSession?.batteryType, currentSession?.ratedCapacity, portData?.ratedCapacity]);

  // Enhanced debounced update function with better timing control
  const debouncedUpdate = useCallback(async (
    session: Session,
    portId: string,
    sessionId: string,
    logs: Record<string, LogEntry>,
    batteryType: string,
    ratedCapacity: number
  ) => {
    if (isUpdatingRef.current) return;
    
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
    const timeSinceLastFirebaseUpdate = now - lastFirebaseUpdateRef.current;
    
    // Only update if 5 seconds have passed since last update AND 2 seconds since last Firebase update
    if (timeSinceLastUpdate < REAL_TIME_UPDATE_INTERVAL || timeSinceLastFirebaseUpdate < 2000) {
      // Clear existing timeout and set new one
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      
      const delay = Math.max(REAL_TIME_UPDATE_INTERVAL - timeSinceLastUpdate, 2000 - timeSinceLastFirebaseUpdate);
      updateTimeoutRef.current = setTimeout(() => {
        debouncedUpdate(session, portId, sessionId, logs, batteryType, ratedCapacity);
      }, delay);
      return;
    }

    try {
      isUpdatingRef.current = true;
      lastUpdateTimeRef.current = now;
      lastFirebaseUpdateRef.current = now;
      
      await updateRealTimeBatteryMetrics(
        database,
        portId,
        sessionId,
        logs,
        batteryType,
        ratedCapacity
      );
      
      console.log('🔄 Real-time metrics updated successfully');
    } catch (error) {
      console.error('Failed to update real-time metrics:', error);
    } finally {
      isUpdatingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const portRef = ref(database, `ports/${portId}`);
    
    const unsubscribe = onValue(portRef, async (snapshot) => {
      if (!snapshot.exists()) {
        setPortData(null);
        setCurrentSession(null);
        setHistoricalSessions({});
        lastLogCountRef.current = 0;
        setLoading(false);
        return;
      }

      const data = snapshot.val() as Port;
      
      // Only update port data if it actually changed
      setPortData(prevPortData => {
        if (JSON.stringify(prevPortData) !== JSON.stringify(data)) {
          return data;
        }
        return prevPortData;
      });
      
      if (data.currentSessionId && data.sessions && data.sessions[data.currentSessionId]) {
        const session = data.sessions[data.currentSessionId];
        
        // Port 4 is Lead Acid only - automatically set battery type if not set
        if (portId === 'port_4' && !session.batteryType) {
          try {
            const sessionRef = ref(database, `ports/${portId}/sessions/${data.currentSessionId}`);
            await update(sessionRef, {
              batteryType: 'Lead Acid'
            });
            console.log('✅ Port 4 automatically set to Lead Acid battery type');
          } catch (error) {
            console.error('Failed to set Port 4 to Lead Acid:', error);
          }
        }
        
        // Enhanced session with real-time metrics
        const enhancedSession: Session = {
          ...session,
          realTimeMetrics: realTimeMetrics || undefined
        };
        
        // Only update current session if it actually changed
        setCurrentSession(prevSession => {
          if (JSON.stringify(prevSession) !== JSON.stringify(enhancedSession)) {
            return enhancedSession;
          }
          return prevSession;
        });
        
        // Update backup battery capacity table for ESP32 access if capacity is set
        if (session.ratedCapacity && session.ratedCapacity !== sessionDataRef.current?.ratedCapacity) {
          try {
            await updateBackupBatteryCapacity(
              database,
              portId,
              session.ratedCapacity
            );
          } catch (error) {
            console.error('Failed to update backup battery capacity:', error);
          }
        }
        
        // Check if new log data arrived and update Firebase in real-time (with better control)
        const currentLogCount = Object.keys(session.logs || {}).length;
        if (currentLogCount > lastLogCountRef.current && currentLogCount > 1) {
          lastLogCountRef.current = currentLogCount;
          
          // Only trigger update if we have sufficient data and it's been long enough
          const ratedCapacity = session.ratedCapacity || data.ratedCapacity || 0;
          if (ratedCapacity > 0 && session.batteryType) {
            debouncedUpdate(session, portId, data.currentSessionId, session.logs, session.batteryType, ratedCapacity);
          }
        }
        
        // Store session data in ref for comparison
        sessionDataRef.current = session;
        currentSessionIdRef.current = data.currentSessionId;

        // Check for stale session - only if no recent activity
        if (session.status === 'charging' || session.status === 'discharging') {
          const logTimestamps = session.logs ? Object.keys(session.logs).map(Number) : [];
          const lastLogTime = logTimestamps.length > 0 ? Math.max(...logTimestamps) : session.startTime;
          
          // Only close if we haven't received any logs in the timeout period
          // AND the session has been running for at least 10 minutes (to avoid false positives)
          const sessionDuration = Date.now() - session.startTime;
          const timeSinceLastLog = Date.now() - lastLogTime;
          
          if (sessionDuration > 10 * 60 * 1000 && timeSinceLastLog > STALE_SESSION_TIMEOUT && !isClosingSessionRef.current) {
            console.warn(`Port ${portId} session ${data.currentSessionId} is stale. Closing it.`);
            
            isClosingSessionRef.current = true;
            
            try {
              // Calculate and save final battery metrics before closing the session
              if (canCalculateFinalMetrics(session)) {
                console.log('📊 Calculating final metrics for auto-closed session...');
                
                await saveFinalBatteryMetrics(
                  database,
                  portId,
                  data.currentSessionId,
                  session.logs,
                  session.batteryType,
                  session.ratedCapacity
                );
                
                console.log('✅ Final metrics saved for auto-closed session');
              } else {
                console.log('⚠️ Cannot calculate final metrics - missing required data:', {
                  type: session.type,
                  hasBatteryType: !!session.batteryType,
                  hasRatedCapacity: !!session.ratedCapacity,
                  ratedCapacityValue: session.ratedCapacity,
                  logCount: session.logs ? Object.keys(session.logs).length : 0
                });
              }
              
              // Update backup battery capacity table to mark session as inactive
              if (session.ratedCapacity) {
                try {
                  const { removeBackupBatteryCapacity } = await import('@/lib/utils');
                  await removeBackupBatteryCapacity(database, portId);
                  console.log('✅ Backup battery capacity cleared for auto-closed session');
                } catch (error) {
                  console.error('Failed to clear backup battery capacity:', error);
                }
              }
              
            } catch (error) {
              console.error('❌ Failed to save final metrics for auto-closed session:', error);
              // Reset the closing flag even if there was an error
              isClosingSessionRef.current = false;
            }
            
            // Close the session
            const updates: Record<string, unknown> = {};
            const sessionPath = `ports/${portId}/sessions/${data.currentSessionId}`;
            updates[`${sessionPath}/status`] = 'completed';
            updates[`${sessionPath}/endTime`] = Date.now();
            updates[`${sessionPath}/notes`] = 'Session closed due to inactivity. Final battery metrics calculated and saved.';
            updates[`ports/${portId}/currentSessionId`] = null;

            update(ref(database), updates);
            
            // Clean up throttle for this session
            clearUpdateThrottle(portId, data.currentSessionId);
            
            // Reset the closing flag
            isClosingSessionRef.current = false;
          }

        } else {
          lastLogCountRef.current = 0;
        }

      } else {
        setCurrentSession(null);
        lastLogCountRef.current = 0;
        sessionDataRef.current = null;
        currentSessionIdRef.current = null;
      }
      
      // Only update historical sessions if they actually changed
      setHistoricalSessions(prevSessions => {
        if (JSON.stringify(prevSessions) !== JSON.stringify(data.sessions || {})) {
          return data.sessions || {};
        }
        return prevSessions;
      });
      
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('Failed to fetch port data. Ensure Firebase config is correct and you have permission.');
      setLoading(false);
    });

    // Cleanup function
    return () => {
      unsubscribe();
      
      // Clear any pending timeouts
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      
      // Clear throttle for this port
      if (currentSessionIdRef.current) {
        clearUpdateThrottle(portId, currentSessionIdRef.current);
      }
      
      // Reset refs
      lastLogCountRef.current = 0;
      lastUpdateTimeRef.current = 0;
      lastFirebaseUpdateRef.current = 0;
      isUpdatingRef.current = false;
      sessionDataRef.current = null;
      currentSessionIdRef.current = null;
    };
  }, [portId, debouncedUpdate, realTimeMetrics]);

  return { portData, currentSession, historicalSessions, loading, error };
}
