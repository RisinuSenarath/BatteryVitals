export interface LogEntry {
  voltage: number;
  current: number;
  cycle: 'charging' | 'discharging';
}

export interface RealTimeMetrics {
  dischargedCapacity: number; // Ah
  soc: number; // State of Charge percentage
  remainingCapacity: number; // Ah
  measuredCapacity: number; // Ah
  soh: number; // State of Health percentage
}

// Simplified interface for backup battery capacity table - one value per port
export interface BatteryCapacityBackup {
  [portId: string]: number; // portId -> ratedCapacity in Ah
}

export interface Session {
  startTime: number;
  endTime: number | null;
  status: 'charging' | 'discharging' | 'completed' | 'error';
  type: 'charging' | 'discharging' | 'resting'; // Current battery state
  batteryType: string;
  ratedCapacity: number; // Rated capacity in Ah
  logs: Record<string, LogEntry>;
  currentVoltage: number;
  currentCurrent: number;
  notes?: string;
  realTimeMetrics?: RealTimeMetrics; // Real-time calculated metrics
  
  // Real-time metrics stored in Firebase (updated during discharge)
  realTimeDischargedCapacity?: number; // Current discharged capacity in Ah
  realTimeSOC?: number; // Current State of Charge percentage
  realTimeSOH?: number; // Current State of Health percentage
  realTimeRemainingCapacity?: number; // Current remaining capacity in Ah
  lastUpdated?: number; // Timestamp of last real-time update
  
  // Final metrics (saved when session ends)
  finalVoltage?: number;
  finalCurrent?: number;
  finalDischargedCapacity?: number; // Final discharged capacity in Ah
  finalMeasuredCapacity?: number; // Final measured capacity in Ah
  finalSOH?: number; // Final State of Health percentage
  finalSOC?: number; // Final State of Charge percentage
}

export interface Port {
  name: string;
  currentSessionId: string | null;
  ratedCapacity?: number; // Rated capacity stored at port level
  sessions: Record<string, Session>;
}
