import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Session, LogEntry } from "@/types"
import { ref, update, get } from "firebase/database"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Calculate measured capacity by integrating current over time during discharge
 * @param session - The session containing logs
 * @param cutoffVoltage - Voltage at which discharge should stop (default: 3.0V for LiPo)
 * @returns Measured capacity in Ah, or 0 if not a valid discharge session
 */
export function calculateMeasuredCapacity(session: Session, cutoffVoltage: number = 3.0): number {
  console.log('🔋 Capacity calculation started for session:', {
    sessionId: session.startTime,
    sessionType: session.type,
    logsCount: Object.keys(session.logs || {}).length,
    cutoffVoltage: cutoffVoltage
  });

  // Basic validation
  if (!session.logs || Object.keys(session.logs).length === 0) {
    console.log('❌ No logs found for session');
    return 0;
  }

  if (session.type !== 'discharging') {
    console.log('❌ Session is not discharging, type:', session.type);
    return 0;
  }

  try {
    // Parse and validate log entries
    const logEntries: Array<{
      timestamp: number;
      voltage: number;
      current: number;
    }> = [];

    // Process each log entry
    Object.entries(session.logs).forEach(([timestampStr, logData]) => {
      // Parse timestamp
      const timestamp = parseInt(timestampStr);
      if (isNaN(timestamp)) {
        console.warn('⚠️ Invalid timestamp:', timestampStr);
        return;
      }

      // Parse voltage and current - handle both string and number types
      let voltage: number;
      let current: number;

      // Handle voltage
      if (typeof logData.voltage === 'string') {
        voltage = parseFloat(logData.voltage);
      } else if (typeof logData.voltage === 'number') {
        voltage = logData.voltage;
      } else {
        console.warn('⚠️ Invalid voltage type:', typeof logData.voltage, 'value:', logData.voltage);
        return;
      }

      // Handle current
      if (typeof logData.current === 'string') {
        current = parseFloat(logData.current);
      } else if (typeof logData.current === 'number') {
        current = logData.current;
      } else {
        console.warn('⚠️ Invalid current type:', typeof logData.current, 'value:', logData.current);
        return;
      }

      // Validate parsed values
      if (isNaN(voltage) || isNaN(current)) {
        console.warn('⚠️ Parsed values are NaN:', { voltage, current, original: logData });
        return;
      }

      // Add valid entry
      logEntries.push({ timestamp, voltage, current });
    });

    console.log('📊 Parsed log entries:', {
      total: logEntries.length,
      sample: logEntries.slice(0, 3)
    });

    if (logEntries.length < 2) {
      console.log('❌ Not enough valid log entries for calculation');
      return 0;
    }

    // Sort by timestamp
    logEntries.sort((a, b) => a.timestamp - b.timestamp);

    // Find the cutoff point - stop when voltage reaches or goes below cutoff
    let cutoffIndex = logEntries.length - 1;
    for (let i = 0; i < logEntries.length; i++) {
      if (logEntries[i].voltage <= cutoffVoltage) {
        cutoffIndex = i;
        break;
      }
    }

    // Use only data up to cutoff voltage
    const validLogs = logEntries.slice(0, cutoffIndex + 1);
    
    if (validLogs.length < 2) {
      console.log('❌ Not enough valid logs above cutoff voltage');
      return 0;
    }

    // Verify discharge characteristics
    const firstLog = validLogs[0];
    const lastLog = validLogs[validLogs.length - 1];
    const voltageDecrease = firstLog.voltage - lastLog.voltage;
    const avgCurrent = validLogs.reduce((sum, log) => sum + Math.abs(log.current), 0) / validLogs.length;

    console.log('🔍 Discharge verification:', {
      startVoltage: firstLog.voltage,
      endVoltage: lastLog.voltage,
      cutoffVoltage: cutoffVoltage,
      voltageDecrease: voltageDecrease.toFixed(3),
      avgCurrent: avgCurrent.toFixed(3),
      duration: ((lastLog.timestamp - firstLog.timestamp) / (1000 * 60 * 60)).toFixed(3) + ' hours',
      totalLogs: logEntries.length,
      validLogs: validLogs.length
    });

    // Check if this looks like a valid discharge
    if (voltageDecrease < 0.1) {
      console.log('❌ Voltage decrease too small, may not be a valid discharge');
      return 0;
    }

    // Calculate capacity using trapezoidal rule for better accuracy
    let totalCapacity = 0;
    let validIntervals = 0;

    for (let i = 1; i < validLogs.length; i++) {
      const prev = validLogs[i - 1];
      const curr = validLogs[i];

      // Skip if timestamps are not in order
      if (curr.timestamp <= prev.timestamp) {
        console.warn('⚠️ Timestamp order issue:', { prev: prev.timestamp, curr: curr.timestamp });
        continue;
      }

      // Calculate time difference in hours
      const timeDiffHours = (curr.timestamp - prev.timestamp) / (1000 * 60 * 60);

      // Skip if time difference is too small or invalid
      if (timeDiffHours <= 0 || !isFinite(timeDiffHours)) {
        console.warn('⚠️ Invalid time difference:', timeDiffHours);
        continue;
      }

      // Use average current for this interval
      const avgCurrentInterval = (Math.abs(prev.current) + Math.abs(curr.current)) / 2;

      // Calculate capacity for this interval: Current × Time
      const intervalCapacity = avgCurrentInterval * timeDiffHours;

      // Validate interval capacity
      if (isFinite(intervalCapacity) && intervalCapacity >= 0) {
        totalCapacity += intervalCapacity;
        validIntervals++;
      } else {
        console.warn('⚠️ Invalid interval capacity:', intervalCapacity);
      }
    }

    console.log('📈 Capacity calculation results:', {
      validIntervals,
      totalIntervals: validLogs.length - 1,
      totalCapacity: totalCapacity.toFixed(4),
      avgCapacityPerInterval: (totalCapacity / validIntervals).toFixed(4),
      cutoffVoltageApplied: cutoffVoltage
    });

    // Final validation
    if (!isFinite(totalCapacity) || totalCapacity < 0) {
      console.log('❌ Final capacity is invalid:', totalCapacity);
      return 0;
    }

    if (validIntervals === 0) {
      console.log('❌ No valid intervals for calculation');
      return 0;
    }

    console.log('✅ Capacity calculation successful:', totalCapacity.toFixed(4), 'Ah');
    return totalCapacity;

  } catch (error) {
    console.error('💥 Error in capacity calculation:', error);
    return 0;
  }
}

/**
 * Calculate State of Health (SOH) as percentage
 * @param measuredCapacity - Measured capacity in Ah
 * @param ratedCapacity - Rated capacity in Ah
 * @returns SOH percentage (can exceed 100% for new batteries)
 */
export function calculateSOH(measuredCapacity: number, ratedCapacity: number): number {
  if (ratedCapacity <= 0) return 0;
  return (measuredCapacity / ratedCapacity) * 100;
}

/**
 * Calculate State of Charge (SOC) during discharge
 * @param currentVoltage - Current battery voltage
 * @param startVoltage - Starting voltage when discharge began
 * @param cutoffVoltage - Cutoff voltage (default: 3.0V)
 * @returns SOC percentage (100% at start, 0% at cutoff)
 */
export function calculateSOC(currentVoltage: number, startVoltage: number, cutoffVoltage: number = 3.0): number {
  if (startVoltage <= cutoffVoltage) return 0;
  if (currentVoltage <= cutoffVoltage) return 0;
  
  const voltageRange = startVoltage - cutoffVoltage;
  const currentVoltageDrop = startVoltage - currentVoltage;
  
  // SOC = remaining voltage range / total voltage range
  const soc = ((voltageRange - currentVoltageDrop) / voltageRange) * 100;
  
  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, soc));
}

/**
 * Calculate real-time discharged capacity during discharge
 * @param logs - Session logs up to current time
 * @param cutoffVoltage - Cutoff voltage to stop calculation
 * @returns Discharged capacity in Ah
 */
export function calculateDischargedCapacity(logs: Record<string, LogEntry>, cutoffVoltage: number = 3.0): number {
  if (!logs || Object.keys(logs).length < 2) return 0;

  try {
    // Parse and sort log entries
    const logEntries = Object.entries(logs)
      .map(([timestampStr, logData]) => ({
        timestamp: parseInt(timestampStr),
        voltage: Number(logData.voltage),
        current: Number(logData.current)
      }))
      .filter(log => !isNaN(log.timestamp) && !isNaN(log.voltage) && !isNaN(log.current))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (logEntries.length < 2) return 0;

    // Find cutoff point
    let cutoffIndex = logEntries.length - 1;
    for (let i = 0; i < logEntries.length; i++) {
      if (logEntries[i].voltage <= cutoffVoltage) {
        cutoffIndex = i;
        break;
      }
    }

    const validLogs = logEntries.slice(0, cutoffIndex + 1);
    if (validLogs.length < 2) return 0;

    // Calculate discharged capacity using trapezoidal rule
    let dischargedCapacity = 0;
    
    for (let i = 1; i < validLogs.length; i++) {
      const prev = validLogs[i - 1];
      const curr = validLogs[i];

      if (curr.timestamp <= prev.timestamp) continue;

      const timeDiffHours = (curr.timestamp - prev.timestamp) / (1000 * 60 * 60);
      if (timeDiffHours <= 0 || !isFinite(timeDiffHours)) continue;

      const avgCurrentInterval = (Math.abs(prev.current) + Math.abs(curr.current)) / 2;
      const intervalCapacity = avgCurrentInterval * timeDiffHours;

      if (isFinite(intervalCapacity) && intervalCapacity >= 0) {
        dischargedCapacity += intervalCapacity;
      }
    }

    return dischargedCapacity;
  } catch (error) {
    console.error('Error calculating discharged capacity:', error);
    return 0;
  }
}

/**
 * Calculate remaining capacity during discharge
 * @param totalCapacity - Total battery capacity in Ah
 * @param dischargedCapacity - Already discharged capacity in Ah
 * @returns Remaining capacity in Ah
 */
export function calculateRemainingCapacity(totalCapacity: number, dischargedCapacity: number): number {
  return Math.max(0, totalCapacity - dischargedCapacity);
}

/**
 * Calculate comprehensive battery metrics for real-time updates
 * @param logs - Current session logs
 * @param batteryType - Battery type for cutoff voltage
 * @param ratedCapacity - Rated capacity in Ah
 * @returns Object with all calculated metrics
 */
export function calculateBatteryMetrics(
  logs: Record<string, LogEntry>, 
  batteryType: string | undefined, 
  ratedCapacity: number
) {
  if (!batteryType || !logs || Object.keys(logs).length < 2) {
    return {
      dischargedCapacity: 0,
      soc: 0,
      remainingCapacity: 0,
      measuredCapacity: 0,
      soh: 0
    };
  }

  const cutoffVoltage = getCutoffVoltage(batteryType);
  const dischargedCapacity = calculateDischargedCapacity(logs, cutoffVoltage);
  
  // Calculate SOC
  const logEntries = Object.entries(logs)
    .map(([ts, data]) => ({ timestamp: parseInt(ts), voltage: Number(data.voltage) }))
    .sort((a, b) => a.timestamp - b.timestamp);
  
  const startVoltage = logEntries[0]?.voltage || 0;
  const currentVoltage = logEntries[logEntries.length - 1]?.voltage || 0;
  const soc = calculateSOC(currentVoltage, startVoltage, cutoffVoltage);
  
  // Calculate remaining capacity
  const remainingCapacity = calculateRemainingCapacity(ratedCapacity, dischargedCapacity);
  
  // Calculate measured capacity (for completed discharge)
  const measuredCapacity = dischargedCapacity;
  
  // Calculate SOH
  const soh = ratedCapacity > 0 ? (measuredCapacity / ratedCapacity) * 100 : 0;

  return {
    dischargedCapacity,
    soc,
    remainingCapacity,
    measuredCapacity,
    soh
  };
}

/**
 * Save final battery metrics to Firebase when discharge session ends
 * @param database - Firebase database reference
 * @param portId - Port ID
 * @param sessionId - Session ID
 * @param logs - Final session logs
 * @param batteryType - Battery type
 * @param ratedCapacity - Rated capacity
 * @returns Promise that resolves when save is complete
 */
export async function saveFinalBatteryMetrics(
  database: any,
  portId: string,
  sessionId: string,
  logs: Record<string, LogEntry>,
  batteryType: string,
  ratedCapacity: number
): Promise<void> {
  try {
    // Calculate final metrics
    const metrics = calculateBatteryMetrics(logs, batteryType, ratedCapacity);
    
    // Get final voltage and current
    const logEntries = Object.entries(logs)
      .map(([ts, data]) => ({ 
        timestamp: parseInt(ts), 
        voltage: Number(data.voltage),
        current: Number(data.current)
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
    
    const finalVoltage = logEntries[logEntries.length - 1]?.voltage || 0;
    const finalCurrent = logEntries[logEntries.length - 1]?.current || 0;
    
    // Prepare final session data
    const finalSessionData = {
      status: 'completed',
      endTime: Date.now(),
      finalVoltage: finalVoltage,
      finalCurrent: finalCurrent,
      finalDischargedCapacity: metrics.dischargedCapacity,
      finalMeasuredCapacity: metrics.measuredCapacity,
      finalSOH: metrics.soh,
      finalSOC: metrics.soc,
      notes: `Discharge completed. Final capacity: ${metrics.measuredCapacity.toFixed(3)} Ah, SOH: ${metrics.soh.toFixed(1)}%`
    };
    
    // Update session in Firebase
    const sessionRef = ref(database, `ports/${portId}/sessions/${sessionId}`);
    await update(sessionRef, finalSessionData);
    
    console.log('✅ Final battery metrics saved to Firebase:', {
      portId,
      sessionId,
      finalDischargedCapacity: metrics.dischargedCapacity,
      finalMeasuredCapacity: metrics.measuredCapacity,
      finalSOH: metrics.soh,
      finalSOC: metrics.soc
    });
    
  } catch (error) {
    console.error('❌ Failed to save final battery metrics:', error);
    throw error;
  }
}

// Throttling mechanism for real-time updates
const updateThrottleMap = new Map<string, number>();
const THROTTLE_INTERVAL = 3000; // 3 seconds between updates for the same session

/**
 * Update real-time battery metrics in Firebase with throttling
 * @param database - Firebase database reference
 * @param portId - Port ID
 * @param sessionId - Session ID
 * @param logs - Session logs
 * @param batteryType - Battery type
 * @param ratedCapacity - Rated capacity in Ah
 */
export async function updateRealTimeBatteryMetrics(
  database: any,
  portId: string,
  sessionId: string,
  logs: Record<string, LogEntry>,
  batteryType: string,
  ratedCapacity: number
): Promise<void> {
  try {
    // Throttle updates for the same session
    const throttleKey = `${portId}_${sessionId}`;
    const now = Date.now();
    const lastUpdate = updateThrottleMap.get(throttleKey) || 0;
    
    if (now - lastUpdate < THROTTLE_INTERVAL) {
      console.log('⏱️ Throttling real-time update for session:', sessionId);
      return;
    }
    
    // Update throttle timestamp
    updateThrottleMap.set(throttleKey, now);
    
    // Calculate current metrics
    const metrics = calculateBatteryMetrics(logs, batteryType, ratedCapacity);
    
    // Update session with real-time metrics
    const sessionRef = ref(database, `ports/${portId}/sessions/${sessionId}`);
    await update(sessionRef, {
      realTimeDischargedCapacity: metrics.dischargedCapacity,
      realTimeSOC: metrics.soc,
      realTimeSOH: metrics.soh,
      realTimeRemainingCapacity: metrics.remainingCapacity,
      lastUpdated: now
    });
    
    console.log('✅ Real-time metrics updated:', {
      portId,
      sessionId,
      dischargedCapacity: metrics.dischargedCapacity.toFixed(3),
      soc: metrics.soc.toFixed(1),
      soh: metrics.soh.toFixed(1)
    });
    
  } catch (error) {
    console.error('❌ Failed to update real-time metrics:', error);
    throw error;
  }
}

/**
 * Clean up throttle map for a specific session
 * @param portId - Port ID
 * @param sessionId - Session ID
 */
export function clearUpdateThrottle(portId: string, sessionId: string): void {
  const throttleKey = `${portId}_${sessionId}`;
  updateThrottleMap.delete(throttleKey);
  console.log('🧹 Throttle cleared for session:', sessionId);
}

/**
 * Clean up all throttle entries (useful for cleanup)
 */
export function clearAllUpdateThrottles(): void {
  updateThrottleMap.clear();
  console.log('🧹 All throttles cleared');
}

/**
 * Get battery type display name
 * @param batteryType - Battery type string
 * @returns Formatted battery type name
 */
export function getBatteryTypeDisplayName(batteryType: string | undefined | null): string {
  if (!batteryType) {
    return 'Unknown';
  }
  
  return batteryType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get recommended cutoff voltage for battery type
 * @param batteryType - Battery type string
 * @returns Recommended cutoff voltage in volts
 */
export function getCutoffVoltage(batteryType: string | undefined | null): number {
  if (!batteryType) {
    return 3.0; // Default to LiPo cutoff if battery type is not specified
  }
  
  const type = batteryType.toLowerCase();
  if (type.includes('lipo') || type.includes('li-ion')) {
    return 3.0; // LiPo/Li-ion cutoff voltage
  } else if (type.includes('lead') || type.includes('acid')) {
    return 10.5; // Lead acid cutoff voltage (per 12V cell)
  } else if (type.includes('nimh') || type.includes('nicd')) {
    return 0.9; // NiMH/NiCd cutoff voltage per cell
  }
  return 3.0; // Default to LiPo cutoff
}

/**
 * Update backup battery capacity table for ESP32 access
 * @param database - Firebase database reference
 * @param portId - Port ID
 * @param ratedCapacity - Rated capacity in Ah
 */
export async function updateBackupBatteryCapacity(
  database: any,
  portId: string,
  ratedCapacity: number
): Promise<void> {
  try {
    const backupRef = ref(database, `batteryCapacityBackup/${portId}`);
    
    await update(backupRef, {
      ratedCapacity: ratedCapacity
    });
    
    console.log('✅ Backup battery capacity updated:', {
      portId,
      ratedCapacity
    });
    
  } catch (error) {
    console.error('❌ Failed to update backup battery capacity:', error);
    throw error;
  }
}

/**
 * Remove backup battery capacity entry when port has no active session
 * @param database - Firebase database reference
 * @param portId - Port ID
 */
export async function removeBackupBatteryCapacity(
  database: any,
  portId: string
): Promise<void> {
  try {
    const backupRef = ref(database, `batteryCapacityBackup/${portId}`);
    await update(backupRef, {});
    await update(ref(database, `batteryCapacityBackup`), { [portId]: null });
    
    console.log('✅ Backup battery capacity removed:', { portId });
    
  } catch (error) {
    console.error('❌ Failed to remove backup battery capacity:', error);
    throw error;
  }
}

/**
 * Get backup battery capacity for a specific port
 * @param database - Firebase database reference
 * @param portId - Port ID
 * @returns Rated capacity in Ah or null if not found
 */
export async function getBackupBatteryCapacity(
  database: any,
  portId: string
): Promise<number | null> {
  try {
    const backupRef = ref(database, `batteryCapacityBackup/${portId}`);
    const snapshot = await get(backupRef);
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      return data.ratedCapacity || null;
    }
    
    return null;
    
  } catch (error) {
    console.error('❌ Failed to get backup battery capacity:', error);
    return null;
  }
}

/**
 * Get all backup battery capacities for all ports
 * @param database - Firebase database reference
 * @returns Object with portId -> ratedCapacity mapping
 */
export async function getAllBackupBatteryCapacities(
  database: any
): Promise<Record<string, number>> {
  try {
    const backupRef = ref(database, `batteryCapacityBackup`);
    const snapshot = await get(backupRef);
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      const capacities: Record<string, number> = {};
      
      Object.entries(data).forEach(([portId, portData]: [string, any]) => {
        if (portData && typeof portData.ratedCapacity === 'number') {
          capacities[portId] = portData.ratedCapacity;
        }
      });
      
      return capacities;
    }
    
    return {};
    
  } catch (error) {
    console.error('❌ Failed to get all backup battery capacities:', error);
    return {};
  }
}
